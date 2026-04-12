/**
 * Platform tRPC Server Initialization
 *
 * Parallel to `src/trpc/init.ts` but wired to the platform-admin identity
 * domain (`PlatformUser`, `SupportSession`) rather than the tenant Supabase
 * users. A separate tRPC root lets us keep the tenant router untouched
 * while giving platform operators their own authenticated surface with
 * distinct cookies, JWT, rate-limit bookkeeping, and audit logs.
 *
 * Context building:
 *   1. Read the `platform-session` cookie from `Cookie:` (or `Authorization:
 *      Bearer` for programmatic callers).
 *   2. Verify it with `@/lib/platform/jwt`.
 *   3. Load the corresponding `PlatformUser` from the DB. A missing,
 *      inactive, or JWT-stale user produces a null platformUser (callers
 *      that require auth throw via `platformAuthedProcedure`).
 *   4. On success, refresh the token (slide the `lastActivity` cursor) and
 *      append a fresh `Set-Cookie` to `responseHeaders` — the route adapter
 *      copies these headers onto the outgoing response.
 *   5. On invalid/expired tokens, append a `Set-Cookie` that clears the
 *      cookie so the browser does not keep retrying with a dead token.
 *
 * The `activeSupportSessionId` field is a passthrough of the
 * `x-support-session-id` request header. `platformImpersonationProcedure`
 * re-reads the corresponding `SupportSession` row on every call and
 * throws FORBIDDEN unless it is `active` and not yet expired.
 */
import { initTRPC, TRPCError } from "@trpc/server"
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch"
import { ZodError } from "zod"
import { prisma } from "@/lib/db"
import type { PrismaClient, PlatformUser } from "@/generated/prisma/client"
import {
  verify as verifyPlatformJwt,
  refresh as refreshPlatformJwt,
  type PlatformJwtClaims,
} from "@/lib/platform/jwt"
import {
  buildSessionCookie,
  buildClearCookie,
  readSessionCookie,
} from "@/lib/platform/cookie"

/**
 * Trimmed projection of `PlatformUser` stored in context. Secrets
 * (`passwordHash`, `mfaSecret`, `recoveryCodes`) are deliberately dropped
 * so they never reach procedure handlers by accident.
 */
export type PlatformContextUser = Omit<
  PlatformUser,
  "passwordHash" | "mfaSecret" | "recoveryCodes"
>

export type PlatformTRPCContext = {
  prisma: PrismaClient
  /** Resolved platform operator for this request, or null if unauthenticated. */
  platformUser: PlatformContextUser | null
  /** Verified JWT claims, or null if no valid session cookie was presented. */
  claims: PlatformJwtClaims | null
  /** Optional support-session id passed by the client via `x-support-session-id`. */
  activeSupportSessionId: string | null
  /** Client IP address from X-Forwarded-For / X-Real-IP, or null. */
  ipAddress: string | null
  /** Client User-Agent header, or null. */
  userAgent: string | null
  /**
   * Mutable header bag that the route adapter merges onto the outgoing
   * response. Used here to append `Set-Cookie` on refresh / clear.
   */
  responseHeaders: Headers
}

function stripSecrets(user: PlatformUser): PlatformContextUser {
  const {
    passwordHash: _passwordHash,
    mfaSecret: _mfaSecret,
    recoveryCodes: _recoveryCodes,
    ...rest
  } = user
  return rest
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7)
  }
  return readSessionCookie(req.headers.get("cookie"))
}

/**
 * Creates the platform tRPC context for each request.
 *
 * The route adapter at `src/app/api/trpc-platform/[trpc]/route.ts` is
 * responsible for passing in a `responseHeaders` Headers instance and for
 * merging it onto the outgoing response.
 */
export async function createPlatformTRPCContext(
  opts: FetchCreateContextFnOptions,
  responseHeaders: Headers
): Promise<PlatformTRPCContext> {
  const ipAddress =
    opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    opts.req.headers.get("x-real-ip") ??
    null
  const userAgent = opts.req.headers.get("user-agent") ?? null
  const activeSupportSessionId =
    opts.req.headers.get("x-support-session-id") ?? null

  const token = extractToken(opts.req)

  let platformUser: PlatformContextUser | null = null
  let claims: PlatformJwtClaims | null = null

  if (token) {
    const verified = await verifyPlatformJwt(token)
    if (verified.ok) {
      const dbUser = await prisma.platformUser.findUnique({
        where: { id: verified.claims.sub },
      })
      if (dbUser && dbUser.isActive) {
        platformUser = stripSecrets(dbUser)
        claims = verified.claims
        // Slide the idle window forward by re-signing with an updated
        // lastActivity stamp. The browser swaps the cookie on the next
        // response.
        try {
          const refreshed = await refreshPlatformJwt(verified.claims)
          responseHeaders.append("Set-Cookie", buildSessionCookie(refreshed))
        } catch (err) {
          console.error("[platform-trpc] token refresh failed", err)
        }
      } else {
        // Token points at a deleted / deactivated operator — clear cookie.
        responseHeaders.append("Set-Cookie", buildClearCookie())
      }
    } else {
      // invalid / expired / idle_timeout — clear the stale cookie so the
      // client stops re-presenting it.
      responseHeaders.append("Set-Cookie", buildClearCookie())
    }
  }

  return {
    prisma,
    platformUser,
    claims,
    activeSupportSessionId,
    ipAddress,
    userAgent,
    responseHeaders,
  }
}

/**
 * tRPC instance initialization for the platform domain.
 */
const t = initTRPC.context<PlatformTRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const createMiddleware = t.middleware

/**
 * Public procedure — no authentication required.
 * Used for `auth.passwordStep`, `auth.mfaVerify`, `auth.mfaEnroll`.
 */
export const platformPublicProcedure = t.procedure

/**
 * Authed procedure — requires a verified platform session with MFA
 * completed. Throws UNAUTHORIZED otherwise.
 */
export const platformAuthedProcedure = t.procedure.use(
  async ({ ctx, next }) => {
    if (!ctx.platformUser || !ctx.claims) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Platform authentication required",
      })
    }
    if (!ctx.claims.mfaVerified) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "MFA required",
      })
    }

    return next({
      ctx: {
        ...ctx,
        platformUser: ctx.platformUser, // narrowed to non-null
        claims: ctx.claims, // narrowed to non-null
      },
    })
  }
)

/**
 * Impersonation procedure — requires an authed platform operator AND an
 * active `SupportSession` (identified by the `x-support-session-id` header)
 * that belongs to this operator and has not yet expired.
 *
 * Re-reads the session row on every call so a revocation takes effect
 * immediately without waiting for a JWT refresh.
 */
export const platformImpersonationProcedure = platformAuthedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.activeSupportSessionId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No active support session",
      })
    }

    const session = await ctx.prisma.supportSession.findFirst({
      where: {
        id: ctx.activeSupportSessionId,
        platformUserId: ctx.platformUser.id,
        status: "active",
        expiresAt: { gt: new Date() },
      },
    })
    if (!session) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Support session is not active or has expired",
      })
    }

    return next({
      ctx: {
        ...ctx,
        supportSession: session,
      },
    })
  }
)
