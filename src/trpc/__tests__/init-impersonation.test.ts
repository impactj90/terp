/**
 * Tests for the platform impersonation branch of `createTRPCContext`.
 *
 * Exercises the matrix enumerated in Phase 7.3 of the platform-admin plan:
 *
 *   - No platform cookie, no support-session header → pass-through, no
 *     impersonation.
 *   - Valid cookie + no x-support-session-id → no impersonation.
 *   - Valid cookie + valid session id + matching tenant → sentinel user
 *     synthesized, ctx.impersonation populated, userGroup.isAdmin=true.
 *   - Valid cookie + session id for a different tenant → no impersonation.
 *   - Valid cookie + session id for a different platform user → no impersonation.
 *   - Valid cookie + session in "pending"/"expired" status → no impersonation.
 *   - mfaVerified === false → no impersonation.
 *
 * The DB is mocked via `vi.mock('@/lib/db')` and the platform JWT verifier
 * via `vi.mock('@/lib/platform/jwt')` so the test stays fast and does not
 * touch Supabase.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest"

const supportSessionFindFirstMock = vi.fn()
const tenantFindUniqueMock = vi.fn()
const userFindUniqueMock = vi.fn()
const verifyMock = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    supportSession: {
      findFirst: (...args: unknown[]) => supportSessionFindFirstMock(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => tenantFindUniqueMock(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
  },
}))

vi.mock("@/lib/platform/jwt", () => ({
  verify: (...args: unknown[]) => verifyMock(...args),
}))

import {
  createTRPCContext,
  PLATFORM_SYSTEM_USER_ID,
} from "@/trpc/init"
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch"

const PLATFORM_USER_ID = "00000000-0000-4000-a000-000000000001"
const TENANT_ID = "00000000-0000-4000-a000-0000000000a0"
const OTHER_TENANT_ID = "00000000-0000-4000-a000-0000000000b0"
const SUPPORT_SESSION_ID = "00000000-0000-4000-a000-0000000000cc"

function buildFetchOpts(
  headers: Record<string, string>
): FetchCreateContextFnOptions {
  return {
    req: new Request("http://localhost/api/trpc/whatever", { headers }),
    resHeaders: new Headers(),
    info: { connectionParams: {} },
  } as unknown as FetchCreateContextFnOptions
}

function mockHappyPath() {
  verifyMock.mockResolvedValue({
    ok: true,
    claims: {
      sub: PLATFORM_USER_ID,
      email: "tolga@terp.de",
      displayName: "Tolga",
      iat: 1,
      lastActivity: 1,
      sessionStartedAt: 1,
      mfaVerified: true,
    },
  })
  supportSessionFindFirstMock.mockResolvedValue({
    id: SUPPORT_SESSION_ID,
    tenantId: TENANT_ID,
    platformUserId: PLATFORM_USER_ID,
    status: "active",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date("2026-04-09T12:00:00Z"),
  })
  tenantFindUniqueMock.mockResolvedValue({
    id: TENANT_ID,
    name: "Tenant X",
    slug: "tenant-x",
  })
  userFindUniqueMock.mockResolvedValue({
    id: PLATFORM_SYSTEM_USER_ID,
    email: "platform-system@internal.terp",
    displayName: "Platform System",
    role: "system",
    isActive: false,
    isLocked: true,
    userGroup: null,
    userTenants: [],
  })
}

beforeAll(() => {
  // Phase 1 kill-switch: the impersonation branch only runs when
  // PLATFORM_IMPERSONATION_ENABLED=true. `serverEnv.platformImpersonationEnabled`
  // is a getter that re-reads process.env, so vi.stubEnv flips it live.
  vi.stubEnv("PLATFORM_IMPERSONATION_ENABLED", "true")
})

afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  supportSessionFindFirstMock.mockReset()
  tenantFindUniqueMock.mockReset()
  userFindUniqueMock.mockReset()
  verifyMock.mockReset()
})

describe("createTRPCContext — platform impersonation", () => {
  it("no platform cookie and no support-session header → no impersonation", async () => {
    const ctx = await createTRPCContext(buildFetchOpts({}))
    expect(ctx.user).toBeNull()
    expect(ctx.impersonation).toBeNull()
    expect(verifyMock).not.toHaveBeenCalled()
    expect(supportSessionFindFirstMock).not.toHaveBeenCalled()
  })

  it("platform cookie without x-support-session-id → no impersonation", async () => {
    mockHappyPath()
    const ctx = await createTRPCContext(
      buildFetchOpts({
        cookie: "platform-session=any.jwt.here",
        "x-tenant-id": TENANT_ID,
      })
    )
    expect(ctx.user).toBeNull()
    expect(ctx.impersonation).toBeNull()
    // We never need to verify the JWT if there is no session id.
    expect(verifyMock).not.toHaveBeenCalled()
  })

  it("valid cookie + session id + matching tenant → sentinel synthesized", async () => {
    mockHappyPath()
    const ctx = await createTRPCContext(
      buildFetchOpts({
        cookie: "platform-session=any.jwt.here",
        "x-support-session-id": SUPPORT_SESSION_ID,
        "x-tenant-id": TENANT_ID,
      })
    )
    expect(ctx.user).not.toBeNull()
    expect(ctx.user?.id).toBe(PLATFORM_SYSTEM_USER_ID)
    expect(ctx.user?.userGroup?.isAdmin).toBe(true)
    expect(ctx.user?.userTenants).toHaveLength(1)
    expect(ctx.user?.userTenants[0]?.tenantId).toBe(TENANT_ID)
    expect(ctx.impersonation).toEqual({
      platformUserId: PLATFORM_USER_ID,
      supportSessionId: SUPPORT_SESSION_ID,
    })
    expect(ctx.session?.access_token).toBe("synthetic-platform-impersonation")
  })

  it("platform session row not found (different tenant) → no impersonation", async () => {
    mockHappyPath()
    // SupportSession query matches on all four keys including tenantId,
    // so a mismatched tenant simply returns null.
    supportSessionFindFirstMock.mockResolvedValue(null)

    const ctx = await createTRPCContext(
      buildFetchOpts({
        cookie: "platform-session=any.jwt.here",
        "x-support-session-id": SUPPORT_SESSION_ID,
        "x-tenant-id": OTHER_TENANT_ID,
      })
    )
    expect(ctx.user).toBeNull()
    expect(ctx.impersonation).toBeNull()
    expect(supportSessionFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: SUPPORT_SESSION_ID,
          tenantId: OTHER_TENANT_ID,
        }),
      })
    )
  })

  it("platform session row not found (different platform user) → no impersonation", async () => {
    mockHappyPath()
    supportSessionFindFirstMock.mockResolvedValue(null)
    verifyMock.mockResolvedValue({
      ok: true,
      claims: {
        sub: "00000000-0000-4000-a000-ffffffffffff",
        email: "someone-else@terp.de",
        displayName: "Other",
        iat: 1,
        lastActivity: 1,
        sessionStartedAt: 1,
        mfaVerified: true,
      },
    })
    const ctx = await createTRPCContext(
      buildFetchOpts({
        cookie: "platform-session=any.jwt.here",
        "x-support-session-id": SUPPORT_SESSION_ID,
        "x-tenant-id": TENANT_ID,
      })
    )
    expect(ctx.user).toBeNull()
    expect(ctx.impersonation).toBeNull()
  })

  it("expired/invalid platform JWT → no impersonation", async () => {
    mockHappyPath()
    verifyMock.mockResolvedValue({ ok: false, reason: "expired" })
    const ctx = await createTRPCContext(
      buildFetchOpts({
        cookie: "platform-session=any.jwt.here",
        "x-support-session-id": SUPPORT_SESSION_ID,
        "x-tenant-id": TENANT_ID,
      })
    )
    expect(ctx.user).toBeNull()
    expect(ctx.impersonation).toBeNull()
    expect(supportSessionFindFirstMock).not.toHaveBeenCalled()
  })

  it("mfaVerified=false → no impersonation", async () => {
    mockHappyPath()
    verifyMock.mockResolvedValue({
      ok: true,
      claims: {
        sub: PLATFORM_USER_ID,
        email: "tolga@terp.de",
        displayName: "Tolga",
        iat: 1,
        lastActivity: 1,
        sessionStartedAt: 1,
        mfaVerified: false,
      },
    })
    const ctx = await createTRPCContext(
      buildFetchOpts({
        cookie: "platform-session=any.jwt.here",
        "x-support-session-id": SUPPORT_SESSION_ID,
        "x-tenant-id": TENANT_ID,
      })
    )
    expect(ctx.user).toBeNull()
    expect(ctx.impersonation).toBeNull()
    expect(supportSessionFindFirstMock).not.toHaveBeenCalled()
  })

  it("sentinel user row missing in DB → no impersonation (fails safe)", async () => {
    mockHappyPath()
    userFindUniqueMock.mockResolvedValue(null)
    const ctx = await createTRPCContext(
      buildFetchOpts({
        cookie: "platform-session=any.jwt.here",
        "x-support-session-id": SUPPORT_SESSION_ID,
        "x-tenant-id": TENANT_ID,
      })
    )
    expect(ctx.user).toBeNull()
    expect(ctx.impersonation).toBeNull()
  })

  it("PLATFORM_IMPERSONATION_ENABLED unset → branch is dead code even with valid cookie + session + headers", async () => {
    mockHappyPath()
    // Temporarily flip the kill-switch off for this test.
    vi.stubEnv("PLATFORM_IMPERSONATION_ENABLED", "false")
    try {
      const ctx = await createTRPCContext(
        buildFetchOpts({
          cookie: "platform-session=any.jwt.here",
          "x-support-session-id": SUPPORT_SESSION_ID,
          "x-tenant-id": TENANT_ID,
        })
      )
      expect(ctx.user).toBeNull()
      expect(ctx.impersonation).toBeNull()
      // Critical: even the JWT verifier is never reached when the flag
      // is off — the entire branch is skipped at the `if` guard.
      expect(verifyMock).not.toHaveBeenCalled()
      expect(supportSessionFindFirstMock).not.toHaveBeenCalled()
    } finally {
      vi.stubEnv("PLATFORM_IMPERSONATION_ENABLED", "true")
    }
  })
})
