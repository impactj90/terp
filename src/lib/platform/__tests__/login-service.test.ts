import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  passwordStep,
  mfaVerifyStep,
  mfaEnrollStep,
  InvalidCredentialsError,
  InvalidMfaTokenError,
  RateLimitedError,
  AccountDisabledError,
} from "../login-service"
import { hashPassword } from "../password"
import {
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCodes,
} from "../totp"
import { TOTP, Secret } from "otpauth"

const USER_ID = "00000000-0000-4000-a000-000000000001"
const EMAIL = "tolga@terp.de"
const IP = "10.0.0.1"
const UA = "vitest"

// --- In-memory fake Prisma ---
//
// We model the two tables we need (platform_users + platform_login_attempts),
// implement the exact subset of Prisma-client methods the login service
// calls, and leave a `_db` handle so tests can inspect state.

interface FakeUser {
  id: string
  email: string
  displayName: string
  passwordHash: string
  isActive: boolean
  mfaSecret: string | null
  mfaEnrolledAt: Date | null
  recoveryCodes: unknown
  lastLoginAt: Date | null
  lastLoginIp: string | null
}

interface FakeAttempt {
  email: string
  ipAddress: string
  success: boolean
  failReason: string | null
  attemptedAt: Date
}

function makeFakePrisma(initialUser?: FakeUser) {
  const users: FakeUser[] = initialUser ? [initialUser] : []
  const attempts: FakeAttempt[] = []
  const platformAuditLogs: unknown[] = []

  const platformUser = {
    findUnique: vi.fn(
      async ({ where }: { where: { email?: string; id?: string } }) => {
        const found = users.find(
          (u) => (where.email && u.email === where.email) || (where.id && u.id === where.id)
        )
        return found ?? null
      }
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string }
        data: Partial<FakeUser>
      }) => {
        const u = users.find((x) => x.id === where.id)
        if (!u) throw new Error("not found")
        Object.assign(u, data)
        return u
      }
    ),
  }

  const platformLoginAttempt = {
    count: vi.fn(
      async ({
        where,
      }: {
        where: {
          email?: string
          ipAddress?: string
          success: boolean
          attemptedAt: { gte: Date }
        }
      }) => {
        const since = where.attemptedAt.gte.getTime()
        return attempts.filter((a) => {
          if (a.attemptedAt.getTime() < since) return false
          if (a.success !== where.success) return false
          if (where.email && a.email !== where.email) return false
          if (where.ipAddress && a.ipAddress !== where.ipAddress) return false
          return true
        }).length
      }
    ),
    create: vi.fn(async ({ data }: { data: Omit<FakeAttempt, "attemptedAt"> }) => {
      const row: FakeAttempt = {
        email: data.email,
        ipAddress: data.ipAddress,
        success: data.success,
        failReason: data.failReason ?? null,
        attemptedAt: new Date(),
      }
      attempts.push(row)
      return row
    }),
  }

  const platformAuditLog = {
    create: vi.fn(async ({ data }: { data: unknown }) => {
      platformAuditLogs.push(data)
      return data
    }),
  }

  const prisma = {
    platformUser,
    platformLoginAttempt,
    platformAuditLog,
  } as unknown as PrismaClient

  return { prisma, _db: { users, attempts, platformAuditLogs } }
}

async function makeEnrolledUser(
  plainPassword: string,
  secretBase32: string,
  recoveryCodes?: string[]
): Promise<FakeUser> {
  const plain = recoveryCodes ?? generateRecoveryCodes()
  const hashed = await hashRecoveryCodes(plain)
  return {
    id: USER_ID,
    email: EMAIL,
    displayName: "Tolga",
    passwordHash: await hashPassword(plainPassword),
    isActive: true,
    mfaSecret: encryptSecret(secretBase32),
    mfaEnrolledAt: new Date("2026-01-01T00:00:00Z"),
    recoveryCodes: hashed,
    lastLoginAt: null,
    lastLoginIp: null,
  }
}

async function makeFirstTimeUser(plainPassword: string): Promise<FakeUser> {
  return {
    id: USER_ID,
    email: EMAIL,
    displayName: "Tolga",
    passwordHash: await hashPassword(plainPassword),
    isActive: true,
    mfaSecret: null,
    mfaEnrolledAt: null,
    recoveryCodes: null,
    lastLoginAt: null,
    lastLoginIp: null,
  }
}

function currentTotp(secretBase32: string): string {
  const t = new TOTP({
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  })
  return t.generate()
}

// --- passwordStep ---

describe("passwordStep", () => {
  it("returns mfa_enrollment_required for a first-time user", async () => {
    const user = await makeFirstTimeUser("correct-password-123")
    const { prisma, _db } = makeFakePrisma(user)

    const result = await passwordStep(
      prisma,
      EMAIL,
      "correct-password-123",
      IP,
      UA
    )

    expect(result.status).toBe("mfa_enrollment_required")
    if (result.status === "mfa_enrollment_required") {
      expect(result.enrollmentToken).toBeTruthy()
      expect(result.secretBase32).toMatch(/^[A-Z2-7]+$/)
      expect(result.otpauthUri).toContain("otpauth://totp/")
    }
    // No attempt row yet — passwordStep alone does not write success rows.
    expect(_db.attempts.filter((a) => a.success)).toHaveLength(0)
  })

  it("returns mfa_required for an already-enrolled user", async () => {
    const secret = generateSecret()
    const user = await makeEnrolledUser("correct-password-123", secret)
    const { prisma } = makeFakePrisma(user)

    const result = await passwordStep(
      prisma,
      EMAIL,
      "correct-password-123",
      IP,
      UA
    )

    expect(result.status).toBe("mfa_required")
  })

  it("throws InvalidCredentialsError on wrong password and records bad_password", async () => {
    const user = await makeFirstTimeUser("correct-password-123")
    const { prisma, _db } = makeFakePrisma(user)

    await expect(
      passwordStep(prisma, EMAIL, "wrong-password-123", IP, UA)
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(_db.attempts).toHaveLength(1)
    expect(_db.attempts[0]!.failReason).toBe("bad_password")
  })

  it("throws InvalidCredentialsError when user does not exist and records bad_password", async () => {
    const { prisma, _db } = makeFakePrisma()

    await expect(
      passwordStep(prisma, "ghost@terp.de", "whatever-long-pw", IP, UA)
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(_db.attempts[0]!.failReason).toBe("bad_password")
  })

  it("is blocked by the rate limiter before touching the user table", async () => {
    const user = await makeFirstTimeUser("correct-password-123")
    const { prisma, _db } = makeFakePrisma(user)
    // Pre-populate 5 recent failures for this email.
    for (let i = 0; i < 5; i++) {
      _db.attempts.push({
        email: EMAIL,
        ipAddress: IP,
        success: false,
        failReason: "bad_password",
        attemptedAt: new Date(),
      })
    }

    await expect(
      passwordStep(prisma, EMAIL, "correct-password-123", IP, UA)
    ).rejects.toBeInstanceOf(RateLimitedError)

    // No findUnique was called because the rate limiter short-circuited.
    expect(
      (prisma.platformUser.findUnique as ReturnType<typeof vi.fn>).mock.calls
    ).toHaveLength(0)
  })

  it("rejects a disabled user with InvalidCredentialsError (uniform response)", async () => {
    const user = await makeFirstTimeUser("correct-password-123")
    user.isActive = false
    const { prisma, _db } = makeFakePrisma(user)

    await expect(
      passwordStep(prisma, EMAIL, "correct-password-123", IP, UA)
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(_db.attempts[0]!.failReason).toBe("bad_password")
  })
})

// --- mfaVerifyStep ---

describe("mfaVerifyStep", () => {
  let challengeToken: string
  let secret: string
  let plainCodes: string[]
  let prisma: PrismaClient
  let _db: ReturnType<typeof makeFakePrisma>["_db"]

  beforeEach(async () => {
    secret = generateSecret()
    plainCodes = generateRecoveryCodes()
    const user = await makeEnrolledUser("correct-password-123", secret, plainCodes)
    const env = makeFakePrisma(user)
    prisma = env.prisma
    _db = env._db

    const pwResult = await passwordStep(
      prisma,
      EMAIL,
      "correct-password-123",
      IP,
      UA
    )
    if (pwResult.status !== "mfa_required") throw new Error("expected mfa_required")
    challengeToken = pwResult.challengeToken
  })

  it("accepts a valid TOTP code and returns a session JWT", async () => {
    const token = currentTotp(secret)
    const result = await mfaVerifyStep(
      prisma,
      challengeToken,
      { token },
      IP,
      UA
    )

    expect(result.jwt).toBeTruthy()
    expect(result.claims.mfaVerified).toBe(true)
    expect(_db.attempts.some((a) => a.success)).toBe(true)
    // Audit log: login.success written.
    expect(
      (_db.platformAuditLogs as Array<{ action: string }>).some(
        (a) => a.action === "login.success"
      )
    ).toBe(true)
  })

  it("throws InvalidMfaTokenError on a bad TOTP and records bad_totp", async () => {
    await expect(
      mfaVerifyStep(prisma, challengeToken, { token: "000000" }, IP, UA)
    ).rejects.toBeInstanceOf(InvalidMfaTokenError)

    expect(
      _db.attempts.some(
        (a) => !a.success && a.failReason === "bad_totp"
      )
    ).toBe(true)
  })

  it("accepts a valid recovery code and consumes it", async () => {
    const used = plainCodes[0]!
    const result = await mfaVerifyStep(
      prisma,
      challengeToken,
      { recoveryCode: used },
      IP,
      UA
    )

    expect(result.jwt).toBeTruthy()
    expect(_db.users[0]!.recoveryCodes as string[]).toHaveLength(
      plainCodes.length - 1
    )
  })

  it("rejects an invalid recovery code with bad_recovery_code and keeps list intact", async () => {
    await expect(
      mfaVerifyStep(
        prisma,
        challengeToken,
        { recoveryCode: "AAAAA-BBBBB" },
        IP,
        UA
      )
    ).rejects.toBeInstanceOf(InvalidMfaTokenError)

    expect(
      _db.attempts.some(
        (a) => !a.success && a.failReason === "bad_recovery_code"
      )
    ).toBe(true)
    expect(_db.users[0]!.recoveryCodes as string[]).toHaveLength(plainCodes.length)
  })

  it("5 × bad recovery code → 6th attempt is rate-limited even with a correct password", async () => {
    const singleStoredCode = generateRecoveryCodes(1)
    _db.users[0]!.recoveryCodes = await hashRecoveryCodes(singleStoredCode)
    const wrongRecoveryCode = singleStoredCode[0]!.endsWith("A")
      ? `${singleStoredCode[0]!.slice(0, -1)}B`
      : `${singleStoredCode[0]!.slice(0, -1)}A`

    // Replay the same challenge token five times with bad codes.
    for (let i = 0; i < 5; i++) {
      await expect(
        mfaVerifyStep(
          prisma,
          challengeToken,
          { recoveryCode: wrongRecoveryCode },
          IP,
          UA
        )
      ).rejects.toBeInstanceOf(InvalidMfaTokenError)
    }
    // Sixth attempt, even with a valid password round, must now be rate-limited.
    await expect(
      passwordStep(prisma, EMAIL, "correct-password-123", IP, UA)
    ).rejects.toBeInstanceOf(RateLimitedError)
  })

  it("rejects if BOTH token and recoveryCode are supplied", async () => {
    await expect(
      mfaVerifyStep(
        prisma,
        challengeToken,
        { token: "000000", recoveryCode: "AAAAA-BBBBB" },
        IP,
        UA
      )
    ).rejects.toBeInstanceOf(InvalidMfaTokenError)
  })

  it("rejects if NEITHER token nor recoveryCode is supplied", async () => {
    await expect(
      mfaVerifyStep(prisma, challengeToken, {}, IP, UA)
    ).rejects.toBeInstanceOf(InvalidMfaTokenError)
  })

  it("rejects a tampered challenge token", async () => {
    await expect(
      mfaVerifyStep(prisma, "not-a-jwt", { token: "000000" }, IP, UA)
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
  })
})

// --- mfaEnrollStep ---

describe("mfaEnrollStep", () => {
  let prisma: PrismaClient
  let _db: ReturnType<typeof makeFakePrisma>["_db"]
  let enrollmentToken: string
  let secretBase32: string

  beforeEach(async () => {
    const user = await makeFirstTimeUser("correct-password-123")
    const env = makeFakePrisma(user)
    prisma = env.prisma
    _db = env._db

    const pw = await passwordStep(
      prisma,
      EMAIL,
      "correct-password-123",
      IP,
      UA
    )
    if (pw.status !== "mfa_enrollment_required") throw new Error("expected enrollment")
    enrollmentToken = pw.enrollmentToken
    secretBase32 = pw.secretBase32
  })

  it("persists the encrypted secret, issues a session JWT, and returns 10 recovery codes", async () => {
    const token = currentTotp(secretBase32)
    const result = await mfaEnrollStep(prisma, enrollmentToken, token, IP, UA)

    expect(result.jwt).toBeTruthy()
    expect(result.recoveryCodes).toHaveLength(10)

    const persisted = _db.users[0]!
    expect(persisted.mfaSecret).toMatch(/^v\d+:/) // field-encryption envelope
    expect(persisted.mfaEnrolledAt).not.toBeNull()
    expect((persisted.recoveryCodes as string[]).length).toBe(10)
  })

  it("rejects a wrong first TOTP and records bad_totp", async () => {
    await expect(
      mfaEnrollStep(prisma, enrollmentToken, "000000", IP, UA)
    ).rejects.toBeInstanceOf(InvalidMfaTokenError)

    expect(
      _db.attempts.some(
        (a) => !a.success && a.failReason === "bad_totp"
      )
    ).toBe(true)
    // Nothing persisted yet.
    expect(_db.users[0]!.mfaSecret).toBeNull()
  })

  it("rejects a tampered enrollment token", async () => {
    const token = currentTotp(secretBase32)
    await expect(
      mfaEnrollStep(prisma, "not-a-jwt", token, IP, UA)
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
  })

  it("rejects when the account has since been disabled", async () => {
    _db.users[0]!.isActive = false
    const token = currentTotp(secretBase32)
    await expect(
      mfaEnrollStep(prisma, enrollmentToken, token, IP, UA)
    ).rejects.toBeInstanceOf(AccountDisabledError)
  })
})
