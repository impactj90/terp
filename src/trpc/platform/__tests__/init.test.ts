/**
 * Tests for the platform tRPC context factory and middlewares.
 *
 * Exercises the four cases enumerated in the Phase 3 plan:
 *
 *   1. No cookie → ctx.platformUser === null (unauthenticated, no throw).
 *   2. Valid cookie → platformUser populated, Set-Cookie refreshed.
 *   3. Expired cookie → platformUser null, Set-Cookie clears the cookie.
 *   4. mfaVerified === false → platformAuthedProcedure throws UNAUTHORIZED.
 *
 * The DB is mocked via `vi.mock('@/lib/db')` to avoid a real connection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { TRPCError } from "@trpc/server"

const findUniqueMock = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    platformUser: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}))

import {
  createPlatformTRPCContext,
  platformAuthedProcedure,
  createCallerFactory,
  createTRPCRouter,
} from "../init"
import { sign } from "@/lib/platform/jwt"
import { createMockClaims } from "./helpers"

const USER_ID = "00000000-0000-4000-a000-000000000001"

function buildFetchOpts(headers: Record<string, string>): Parameters<
  typeof createPlatformTRPCContext
>[0] {
  return {
    req: new Request("http://localhost/api/trpc-platform/auth.me", { headers }),
    resHeaders: new Headers(),
    info: { connectionParams: {} },
  } as unknown as Parameters<typeof createPlatformTRPCContext>[0]
}

function mockDbUser(overrides: Record<string, unknown> = {}) {
  findUniqueMock.mockResolvedValue({
    id: USER_ID,
    email: "tolga@terp.de",
    displayName: "Tolga",
    passwordHash: "hash",
    isActive: true,
    mfaSecret: "enc",
    mfaEnrolledAt: new Date("2026-04-01T00:00:00Z"),
    recoveryCodes: null,
    lastLoginAt: new Date("2026-04-09T12:00:00Z"),
    lastLoginIp: "10.0.0.1",
    createdAt: new Date("2026-03-01T00:00:00Z"),
    createdBy: null,
    ...overrides,
  })
}

describe("createPlatformTRPCContext", () => {
  beforeEach(() => {
    findUniqueMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns null platformUser when no cookie is present", async () => {
    const headers = new Headers()
    const ctx = await createPlatformTRPCContext(
      buildFetchOpts({}),
      headers
    )
    expect(ctx.platformUser).toBeNull()
    expect(ctx.claims).toBeNull()
    expect(headers.get("set-cookie")).toBeNull()
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it("populates platformUser and refreshes the cookie for a valid token", async () => {
    mockDbUser()
    const claims = createMockClaims({ sub: USER_ID })
    const jwt = await sign({
      sub: claims.sub,
      email: claims.email,
      displayName: claims.displayName,
      lastActivity: claims.lastActivity,
      sessionStartedAt: claims.sessionStartedAt,
      mfaVerified: claims.mfaVerified,
    })
    const responseHeaders = new Headers()
    const ctx = await createPlatformTRPCContext(
      buildFetchOpts({ cookie: `platform-session=${jwt}` }),
      responseHeaders
    )
    expect(ctx.platformUser).not.toBeNull()
    expect(ctx.platformUser?.id).toBe(USER_ID)
    // Secrets must be stripped from the context projection.
    expect(ctx.platformUser as unknown as Record<string, unknown>).not.toHaveProperty(
      "passwordHash"
    )
    expect(ctx.platformUser as unknown as Record<string, unknown>).not.toHaveProperty(
      "mfaSecret"
    )
    expect(ctx.platformUser as unknown as Record<string, unknown>).not.toHaveProperty(
      "recoveryCodes"
    )
    const setCookie = responseHeaders.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/platform-session=/)
    expect(setCookie).not.toMatch(/Max-Age=0/)
  })

  it("clears the cookie when the token is idle-expired", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"))

    const claims = createMockClaims({ sub: USER_ID })
    const jwt = await sign({
      sub: claims.sub,
      email: claims.email,
      displayName: claims.displayName,
      lastActivity: claims.lastActivity,
      sessionStartedAt: claims.sessionStartedAt,
      mfaVerified: claims.mfaVerified,
    })

    // Advance past the 30-min idle window.
    vi.setSystemTime(new Date("2026-04-09T12:35:00Z"))

    const responseHeaders = new Headers()
    const ctx = await createPlatformTRPCContext(
      buildFetchOpts({ cookie: `platform-session=${jwt}` }),
      responseHeaders
    )
    expect(ctx.platformUser).toBeNull()
    expect(ctx.claims).toBeNull()
    const setCookie = responseHeaders.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/platform-session=;/)
    expect(setCookie).toMatch(/Max-Age=0/)
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it("passes x-support-session-id through as activeSupportSessionId", async () => {
    const ctx = await createPlatformTRPCContext(
      buildFetchOpts({
        "x-support-session-id": "a0000000-0000-4000-a000-000000000099",
      }),
      new Headers()
    )
    expect(ctx.activeSupportSessionId).toBe(
      "a0000000-0000-4000-a000-000000000099"
    )
  })
})

describe("platformAuthedProcedure", () => {
  const router = createTRPCRouter({
    ping: platformAuthedProcedure.query(() => "pong"),
  })
  const createCaller = createCallerFactory(router)

  it("throws UNAUTHORIZED when platformUser is null", async () => {
    const caller = createCaller({
      prisma: {} as never,
      platformUser: null,
      claims: null,
      activeSupportSessionId: null,
      ipAddress: null,
      userAgent: null,
      responseHeaders: new Headers(),
    })
    await expect(caller.ping()).rejects.toBeInstanceOf(TRPCError)
    await expect(caller.ping()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("throws UNAUTHORIZED when mfaVerified is false", async () => {
    const caller = createCaller({
      prisma: {} as never,
      platformUser: {
        id: USER_ID,
        email: "tolga@terp.de",
        displayName: "Tolga",
        isActive: true,
        mfaEnrolledAt: null,
        lastLoginAt: null,
        lastLoginIp: null,
        createdAt: new Date(),
        createdBy: null,
      } as never,
      claims: createMockClaims({ sub: USER_ID, mfaVerified: false }),
      activeSupportSessionId: null,
      ipAddress: null,
      userAgent: null,
      responseHeaders: new Headers(),
    })
    await expect(caller.ping()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "MFA required",
    })
  })

  it("passes through when platformUser and mfaVerified are present", async () => {
    const caller = createCaller({
      prisma: {} as never,
      platformUser: {
        id: USER_ID,
        email: "tolga@terp.de",
        displayName: "Tolga",
        isActive: true,
        mfaEnrolledAt: new Date(),
        lastLoginAt: null,
        lastLoginIp: null,
        createdAt: new Date(),
        createdBy: null,
      } as never,
      claims: createMockClaims({ sub: USER_ID, mfaVerified: true }),
      activeSupportSessionId: null,
      ipAddress: null,
      userAgent: null,
      responseHeaders: new Headers(),
    })
    await expect(caller.ping()).resolves.toBe("pong")
  })
})
