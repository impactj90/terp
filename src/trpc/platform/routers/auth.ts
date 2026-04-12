/**
 * Platform auth tRPC router.
 *
 * Wraps the three-step login flow from `src/lib/platform/login-service.ts`
 * and exposes it as tRPC mutations. Successful steps set the
 * `platform-session` cookie via `ctx.responseHeaders`; the route adapter
 * copies those headers onto the outgoing HTTP response.
 *
 * This router uses `platformPublicProcedure` for the login steps because
 * the caller is not yet authenticated. `me` and `logout` use
 * `platformAuthedProcedure`.
 */
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  platformPublicProcedure,
  platformAuthedProcedure,
  createTRPCRouter,
} from "../init"
import {
  passwordStep,
  mfaEnrollStep,
  mfaVerifyStep,
  InvalidCredentialsError,
  InvalidMfaTokenError,
  RateLimitedError,
  AccountDisabledError,
  type LoginSuccessResult,
} from "@/lib/platform/login-service"
import { buildSessionCookie, buildClearCookie } from "@/lib/platform/cookie"
import * as platformAudit from "@/lib/platform/audit-service"

function mapLoginError(err: unknown): never {
  if (err instanceof InvalidCredentialsError) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" })
  }
  if (err instanceof InvalidMfaTokenError) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid MFA token" })
  }
  if (err instanceof AccountDisabledError) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled" })
  }
  if (err instanceof RateLimitedError) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limited (${err.reason})`,
      cause: err,
    })
  }
  throw err
}

function setSessionCookie(
  responseHeaders: Headers,
  result: LoginSuccessResult
): void {
  responseHeaders.append("Set-Cookie", buildSessionCookie(result.jwt))
}

export const platformAuthRouter = createTRPCRouter({
  /**
   * Step 1 — verify email/password. Returns either an enrollment token
   * (for first-time MFA setup) or a challenge token (for TOTP verification).
   * Does NOT set the session cookie yet.
   */
  passwordStep: platformPublicProcedure
    .input(
      z.object({
        email: z.string().email().max(255),
        password: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await passwordStep(
          ctx.prisma,
          input.email,
          input.password,
          ctx.ipAddress ?? "",
          ctx.userAgent
        )
      } catch (err) {
        mapLoginError(err)
      }
    }),

  /**
   * Step 2a — first-time MFA enrollment. Accepts the enrollment token from
   * step 1 and the first 6-digit TOTP from the operator's authenticator
   * app. Persists the encrypted secret, returns plaintext recovery codes
   * (shown once) and sets the session cookie.
   */
  mfaEnroll: platformPublicProcedure
    .input(
      z.object({
        enrollmentToken: z.string().min(1),
        token: z.string().length(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await mfaEnrollStep(
          ctx.prisma,
          input.enrollmentToken,
          input.token,
          ctx.ipAddress ?? "",
          ctx.userAgent
        )
        setSessionCookie(ctx.responseHeaders, result)
        return {
          ok: true as const,
          recoveryCodes: result.recoveryCodes,
        }
      } catch (err) {
        mapLoginError(err)
      }
    }),

  /**
   * Step 2b — verify a TOTP code (or one-time recovery code) against the
   * stored MFA secret. Exactly one of `token` / `recoveryCode` must be
   * provided. Sets the session cookie on success.
   */
  mfaVerify: platformPublicProcedure
    .input(
      z.object({
        challengeToken: z.string().min(1),
        token: z.string().length(6).optional(),
        recoveryCode: z.string().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await mfaVerifyStep(
          ctx.prisma,
          input.challengeToken,
          { token: input.token, recoveryCode: input.recoveryCode },
          ctx.ipAddress ?? "",
          ctx.userAgent
        )
        setSessionCookie(ctx.responseHeaders, result)
        return { ok: true as const }
      } catch (err) {
        mapLoginError(err)
      }
    }),

  /**
   * Clear the session cookie and write an audit entry.
   */
  logout: platformAuthedProcedure.mutation(async ({ ctx }) => {
    ctx.responseHeaders.append("Set-Cookie", buildClearCookie())
    await platformAudit.log(ctx.prisma, {
      platformUserId: ctx.platformUser.id,
      action: "logout",
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { ok: true as const }
  }),

  /**
   * Return the current platform operator, or throw UNAUTHORIZED.
   */
  me: platformAuthedProcedure.query(({ ctx }) => {
    return {
      id: ctx.platformUser.id,
      email: ctx.platformUser.email,
      displayName: ctx.platformUser.displayName,
      mfaEnrolledAt: ctx.platformUser.mfaEnrolledAt,
      lastLoginAt: ctx.platformUser.lastLoginAt,
      createdAt: ctx.platformUser.createdAt,
    }
  }),
})
