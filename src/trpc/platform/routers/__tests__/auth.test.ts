/**
 * Tests for the platform auth router.
 *
 * We mock `@/lib/platform/login-service` so the router's only job is to
 * pass inputs through, set cookies on success, and translate domain
 * errors into the right TRPCError codes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { TRPCError } from "@trpc/server"
import type * as LoginService from "@/lib/platform/login-service"

const passwordStepMock = vi.fn()
const mfaEnrollStepMock = vi.fn()
const mfaVerifyStepMock = vi.fn()

vi.mock("@/lib/platform/login-service", async () => {
  const actual = await vi.importActual<typeof LoginService>(
    "@/lib/platform/login-service"
  )
  return {
    ...actual,
    passwordStep: (...args: unknown[]) => passwordStepMock(...args),
    mfaEnrollStep: (...args: unknown[]) => mfaEnrollStepMock(...args),
    mfaVerifyStep: (...args: unknown[]) => mfaVerifyStepMock(...args),
  }
})

import {
  InvalidCredentialsError,
  InvalidMfaTokenError,
  RateLimitedError,
  AccountDisabledError,
} from "@/lib/platform/login-service"
import { createCallerFactory } from "../../init"
import { platformAuthRouter } from "../auth"
import { createMockPlatformContext } from "../../__tests__/helpers"

const createCaller = createCallerFactory(platformAuthRouter)

describe("platform auth router", () => {
  beforeEach(() => {
    passwordStepMock.mockReset()
    mfaEnrollStepMock.mockReset()
    mfaVerifyStepMock.mockReset()
  })

  it("passwordStep: returns mfa_required on second login", async () => {
    passwordStepMock.mockResolvedValue({
      status: "mfa_required",
      challengeToken: "challenge-token",
    })
    const ctx = createMockPlatformContext({
      platformUser: null,
      claims: null,
      prisma: {},
    })
    const caller = createCaller(ctx)
    const result = await caller.passwordStep({
      email: "tolga@terp.de",
      password: "super-secret-password",
    })
    expect(result).toEqual({
      status: "mfa_required",
      challengeToken: "challenge-token",
    })
    // passwordStep should NOT set the session cookie yet.
    expect(ctx.responseHeaders.get("set-cookie")).toBeNull()
  })

  it("passwordStep: maps InvalidCredentialsError to UNAUTHORIZED", async () => {
    passwordStepMock.mockRejectedValue(new InvalidCredentialsError())
    const caller = createCaller(
      createMockPlatformContext({ platformUser: null, claims: null, prisma: {} })
    )
    await expect(
      caller.passwordStep({ email: "tolga@terp.de", password: "bad" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("passwordStep: maps RateLimitedError to TOO_MANY_REQUESTS", async () => {
    passwordStepMock.mockRejectedValue(
      new RateLimitedError(15 * 60 * 1000, "email_locked")
    )
    const caller = createCaller(
      createMockPlatformContext({ platformUser: null, claims: null, prisma: {} })
    )
    await expect(
      caller.passwordStep({ email: "tolga@terp.de", password: "bad" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
  })

  it("passwordStep: maps AccountDisabledError to FORBIDDEN (via mfaVerify path)", async () => {
    mfaVerifyStepMock.mockRejectedValue(new AccountDisabledError())
    const caller = createCaller(
      createMockPlatformContext({ platformUser: null, claims: null, prisma: {} })
    )
    await expect(
      caller.mfaVerify({
        challengeToken: "ct",
        token: "123456",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("mfaVerify: maps InvalidMfaTokenError to UNAUTHORIZED", async () => {
    mfaVerifyStepMock.mockRejectedValue(new InvalidMfaTokenError())
    const caller = createCaller(
      createMockPlatformContext({ platformUser: null, claims: null, prisma: {} })
    )
    await expect(
      caller.mfaVerify({ challengeToken: "ct", token: "123456" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("mfaVerify: sets the session cookie on success", async () => {
    mfaVerifyStepMock.mockResolvedValue({
      jwt: "signed-jwt",
      claims: {
        sub: "00000000-0000-4000-a000-000000000001",
        email: "tolga@terp.de",
        displayName: "Tolga",
        iat: 0,
        lastActivity: 0,
        sessionStartedAt: 0,
        mfaVerified: true,
      },
    })
    const ctx = createMockPlatformContext({
      platformUser: null,
      claims: null,
      prisma: {},
    })
    const caller = createCaller(ctx)
    const result = await caller.mfaVerify({
      challengeToken: "ct",
      token: "123456",
    })
    expect(result).toEqual({ ok: true })
    const setCookie = ctx.responseHeaders.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/platform-session=signed-jwt/)
    expect(setCookie).toMatch(/HttpOnly/)
  })

  it("mfaEnroll: returns plaintext recovery codes and sets cookie", async () => {
    mfaEnrollStepMock.mockResolvedValue({
      jwt: "signed-jwt",
      claims: {
        sub: "00000000-0000-4000-a000-000000000001",
        email: "tolga@terp.de",
        displayName: "Tolga",
        iat: 0,
        lastActivity: 0,
        sessionStartedAt: 0,
        mfaVerified: true,
      },
      recoveryCodes: ["abc", "def", "ghi"],
    })
    const ctx = createMockPlatformContext({
      platformUser: null,
      claims: null,
      prisma: {},
    })
    const caller = createCaller(ctx)
    const result = await caller.mfaEnroll({
      enrollmentToken: "et",
      token: "123456",
    })
    expect(result).toEqual({ ok: true, recoveryCodes: ["abc", "def", "ghi"] })
    expect(ctx.responseHeaders.get("set-cookie")).toMatch(/platform-session=/)
  })

  it("me: requires an authed platform user", async () => {
    const caller = createCaller(
      createMockPlatformContext({ platformUser: null, claims: null, prisma: {} })
    )
    await expect(caller.me()).rejects.toBeInstanceOf(TRPCError)
    await expect(caller.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("me: returns the current operator when authed", async () => {
    const caller = createCaller(createMockPlatformContext({ prisma: {} }))
    const result = await caller.me()
    expect(result.email).toBe("tolga@terp.de")
    expect(result.id).toBe("00000000-0000-4000-a000-000000000001")
  })

  it("logout: clears the cookie and writes an audit entry", async () => {
    const ctx = createMockPlatformContext({ prisma: {} })
    const caller = createCaller(ctx)
    const result = await caller.logout()
    expect(result).toEqual({ ok: true })
    const setCookie = ctx.responseHeaders.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/platform-session=;/)
    expect(setCookie).toMatch(/Max-Age=0/)
    expect(ctx.prisma.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "logout" }),
      })
    )
  })
})
