/**
 * Platform-admin login service.
 *
 * Three-step flow:
 *
 *   1. passwordStep    — verify email + password, decide whether the user
 *                         needs to enroll MFA or just complete an MFA challenge.
 *                         Returns a short-lived enrollment-token or
 *                         challenge-token (NOT a session JWT).
 *   2. mfaEnrollStep   — validate the first TOTP code against the proposed
 *                         secret, persist the (encrypted) secret + argon2-
 *                         hashed recovery codes, return the final session
 *                         JWT + the plaintext recovery codes (shown once).
 *   3. mfaVerifyStep   — validate a TOTP code (or single-use recovery code)
 *                         against the stored secret, return the final
 *                         session JWT.
 *
 * Every failure branch — bad_password, bad_totp, bad_recovery_code — writes
 * a `platform_login_attempts` row with a distinct `failReason` so the
 * shared rate limiter catches brute-force regardless of which factor is
 * being tried. A successful login records a `success` row AND a
 * `platform_audit_logs` row so operators can audit their own history.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import * as platformAudit from "./audit-service"
import {
  MFA_ENROLLMENT_AUDIENCE,
  MFA_CHALLENGE_AUDIENCE,
  sign as signSessionJwt,
  signMfaChallengeToken,
  signMfaEnrollmentToken,
  verifyMfaChallengeToken,
  verifyMfaEnrollmentToken,
  type PlatformJwtClaims,
} from "./jwt"
import { verifyPassword } from "./password"
import {
  checkLoginRateLimit,
  recordAttempt,
  type RateLimitReason,
} from "./rate-limit"
import {
  buildUri,
  consumeRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCodes,
  verifyToken as verifyTotpToken,
} from "./totp"

// Re-export audiences for tests that want to assert on token shape.
export { MFA_ENROLLMENT_AUDIENCE, MFA_CHALLENGE_AUDIENCE }

// --- Error classes ---

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid credentials")
    this.name = "InvalidCredentialsError"
  }
}

export class InvalidMfaTokenError extends Error {
  constructor() {
    super("Invalid MFA token")
    this.name = "InvalidMfaTokenError"
  }
}

export class RateLimitedError extends Error {
  constructor(
    public retryAfterMs: number,
    public reason: RateLimitReason
  ) {
    super("Rate limited")
    this.name = "RateLimitedError"
  }
}

export class AccountDisabledError extends Error {
  constructor() {
    super("Account disabled")
    this.name = "AccountDisabledError"
  }
}

// --- Return types ---

export type PasswordStepResult =
  | {
      status: "mfa_enrollment_required"
      enrollmentToken: string
      secretBase32: string
      otpauthUri: string
    }
  | {
      status: "mfa_required"
      challengeToken: string
    }

export interface LoginSuccessResult {
  jwt: string
  claims: PlatformJwtClaims
}

export interface MfaEnrollSuccessResult extends LoginSuccessResult {
  recoveryCodes: string[]
}

// --- Helpers ---

async function recordFailureAndThrow(
  prisma: PrismaClient,
  email: string,
  ipAddress: string,
  failReason: "bad_password" | "bad_totp" | "bad_recovery_code"
): Promise<never> {
  await recordAttempt(prisma, {
    email,
    ipAddress,
    success: false,
    failReason,
  })
  if (failReason === "bad_password") {
    throw new InvalidCredentialsError()
  }
  throw new InvalidMfaTokenError()
}

async function enforceRateLimit(
  prisma: PrismaClient,
  email: string,
  ipAddress: string
): Promise<void> {
  const rl = await checkLoginRateLimit(prisma, email, ipAddress)
  if (!rl.allowed) {
    throw new RateLimitedError(rl.retryAfterMs ?? 0, rl.reason!)
  }
}

function buildSessionClaims(
  user: { id: string; email: string; displayName: string }
): Omit<PlatformJwtClaims, "iat"> {
  const nowSec = Math.floor(Date.now() / 1000)
  return {
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
    lastActivity: nowSec,
    sessionStartedAt: nowSec,
    mfaVerified: true,
  }
}

async function finishSuccessfulLogin(
  prisma: PrismaClient,
  user: { id: string; email: string; displayName: string },
  ipAddress: string,
  userAgent: string | null,
  updateData: Prisma.PlatformUserUpdateInput = {}
): Promise<LoginSuccessResult> {
  await prisma.platformUser.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
      ...updateData,
    },
  })
  await recordAttempt(prisma, {
    email: user.email,
    ipAddress,
    success: true,
  })
  await platformAudit.log(prisma, {
    platformUserId: user.id,
    action: "login.success",
    ipAddress,
    userAgent,
  })

  const sessionClaims = buildSessionClaims(user)
  const jwt = await signSessionJwt(sessionClaims)
  const iat = Math.floor(Date.now() / 1000)
  return {
    jwt,
    claims: { ...sessionClaims, iat },
  }
}

// --- Step 1: password ---

export async function passwordStep(
  prisma: PrismaClient,
  email: string,
  password: string,
  ipAddress: string,
  _userAgent: string | null
): Promise<PasswordStepResult> {
  await enforceRateLimit(prisma, email, ipAddress)

  const user = await prisma.platformUser.findUnique({ where: { email } })
  // Uniform error — never leak whether the email exists.
  if (!user || !user.isActive) {
    await recordAttempt(prisma, {
      email,
      ipAddress,
      success: false,
      failReason: "bad_password",
    })
    throw new InvalidCredentialsError()
  }

  const passwordOk = await verifyPassword(user.passwordHash, password)
  if (!passwordOk) {
    await recordFailureAndThrow(prisma, email, ipAddress, "bad_password")
  }

  if (!user.mfaEnrolledAt) {
    // First-time login: generate a secret to show in the QR code but DO NOT
    // persist it yet. The secret travels inside the signed enrollment token
    // so step 2 can recover it. Persisting only happens after the operator
    // proves they can compute a valid TOTP code from it.
    const secretBase32 = generateSecret()
    const enrollmentToken = await signMfaEnrollmentToken({
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      secretBase32,
    })
    return {
      status: "mfa_enrollment_required",
      enrollmentToken,
      secretBase32,
      otpauthUri: buildUri(user.email, secretBase32),
    }
  }

  const challengeToken = await signMfaChallengeToken({
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
  })
  return { status: "mfa_required", challengeToken }
}

// --- Step 2a: first-time MFA enrollment ---

export async function mfaEnrollStep(
  prisma: PrismaClient,
  enrollmentToken: string,
  firstToken: string,
  ipAddress: string,
  userAgent: string | null
): Promise<MfaEnrollSuccessResult> {
  const claims = await verifyMfaEnrollmentToken(enrollmentToken)
  if (!claims) {
    // Don't record a failure: a bad token is not a credential probe, it
    // usually means the page sat idle past the 5 min enrollment window.
    throw new InvalidCredentialsError()
  }

  await enforceRateLimit(prisma, claims.email, ipAddress)

  const user = await prisma.platformUser.findUnique({
    where: { id: claims.sub },
  })
  if (!user || !user.isActive) {
    throw new AccountDisabledError()
  }

  // Race: another tab already enrolled MFA. Reject.
  if (user.mfaEnrolledAt) {
    throw new InvalidCredentialsError()
  }

  if (!verifyTotpToken(claims.secretBase32, firstToken)) {
    await recordFailureAndThrow(prisma, claims.email, ipAddress, "bad_totp")
  }

  // Persist the encrypted secret + hashed recovery codes.
  const recoveryCodes = generateRecoveryCodes()
  const hashedRecoveryCodes = await hashRecoveryCodes(recoveryCodes)
  const encryptedSecret = encryptSecret(claims.secretBase32)

  const result = await finishSuccessfulLogin(
    prisma,
    { id: user.id, email: user.email, displayName: user.displayName },
    ipAddress,
    userAgent,
    {
      mfaSecret: encryptedSecret,
      mfaEnrolledAt: new Date(),
      recoveryCodes: hashedRecoveryCodes as unknown as Prisma.InputJsonValue,
    }
  )

  await platformAudit.log(prisma, {
    platformUserId: user.id,
    action: "mfa.enrolled",
    ipAddress,
    userAgent,
  })

  return { ...result, recoveryCodes }
}

// --- Step 2b: MFA challenge (TOTP or recovery code) ---

export async function mfaVerifyStep(
  prisma: PrismaClient,
  challengeToken: string,
  input: { token?: string; recoveryCode?: string },
  ipAddress: string,
  userAgent: string | null
): Promise<LoginSuccessResult> {
  const claims = await verifyMfaChallengeToken(challengeToken)
  if (!claims) {
    throw new InvalidCredentialsError()
  }

  await enforceRateLimit(prisma, claims.email, ipAddress)

  const user = await prisma.platformUser.findUnique({
    where: { id: claims.sub },
  })
  if (!user || !user.isActive) {
    throw new AccountDisabledError()
  }
  if (!user.mfaEnrolledAt || !user.mfaSecret) {
    // The challenge token was issued for a user without MFA — treat as a
    // tampered challenge.
    throw new InvalidCredentialsError()
  }

  // Exactly one of token / recoveryCode must be provided.
  const hasToken = typeof input.token === "string" && input.token.length > 0
  const hasRecovery =
    typeof input.recoveryCode === "string" && input.recoveryCode.length > 0
  if (hasToken === hasRecovery) {
    throw new InvalidMfaTokenError()
  }

  if (hasToken) {
    const secretBase32 = decryptSecret(user.mfaSecret)
    if (!verifyTotpToken(secretBase32, input.token!)) {
      await recordFailureAndThrow(prisma, claims.email, ipAddress, "bad_totp")
    }
    return finishSuccessfulLogin(
      prisma,
      { id: user.id, email: user.email, displayName: user.displayName },
      ipAddress,
      userAgent
    )
  }

  // Recovery-code path.
  const storedHashes = (user.recoveryCodes as unknown as string[] | null) ?? []
  const consume = await consumeRecoveryCode(storedHashes, input.recoveryCode!)
  if (!consume.matched) {
    await recordFailureAndThrow(
      prisma,
      claims.email,
      ipAddress,
      "bad_recovery_code"
    )
  }

  return finishSuccessfulLogin(
    prisma,
    { id: user.id, email: user.email, displayName: user.displayName },
    ipAddress,
    userAgent,
    {
      recoveryCodes: consume.remaining as unknown as Prisma.InputJsonValue,
    }
  )
}
