/**
 * tRPC Server Initialization
 *
 * This file initializes tRPC, defines the context factory, and exports
 * the procedure types used by all routers.
 *
 * @see https://trpc.io/docs/server/routers
 */
import { initTRPC, TRPCError } from "@trpc/server"
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch"
import { ZodError } from "zod"
import { prisma } from "@/lib/db"
import type { PrismaClient } from "@/generated/prisma/client"
import type {
  User as PrismaUser,
  UserGroup,
  UserTenant,
  Tenant,
} from "@/generated/prisma/client"
import type { Session } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import { clientEnv, serverEnv } from "@/lib/config"
import {
  impersonationStorage,
  type ImpersonationContext,
} from "@/lib/platform/impersonation-context"
import { verify as verifyPlatformJwt } from "@/lib/platform/jwt"

/**
 * Sentinel user used for tenant-side writes originating from a platform
 * operator impersonation. Created by migration 20260421200000.
 */
export const PLATFORM_SYSTEM_USER_ID =
  "00000000-0000-0000-0000-00000000beef"

/**
 * The user object stored in context after Supabase session resolution.
 * Includes the user's group (with permissions) and tenant memberships.
 */
export type ContextUser = PrismaUser & {
  userGroup: UserGroup | null
  userTenants: (UserTenant & { tenant: Tenant })[]
}

/**
 * tRPC Context
 *
 * Available to all procedures. Extended by middleware for procedure-specific
 * guarantees (e.g., protectedProcedure guarantees `user` and `session` are non-null).
 */
export type TRPCContext = {
  prisma: PrismaClient
  /** Raw Authorization header value (Bearer token). Null if not provided. */
  authToken: string | null
  /** User object resolved from Supabase session. Null if not authenticated. */
  user: ContextUser | null
  /** Supabase session. Null if not authenticated. */
  session: Session | null
  /** Tenant ID from X-Tenant-ID header. Null if not provided. */
  tenantId: string | null
  /** Client IP address from X-Forwarded-For or X-Real-IP header. */
  ipAddress: string | null
  /** Client User-Agent header. */
  userAgent: string | null
  /**
   * Populated when the request is a platform-operator impersonation into
   * a tenant via an active SupportSession. Null for all normal requests.
   */
  impersonation: ImpersonationContext | null
}

/**
 * Creates the tRPC context for each request.
 *
 * Extracts auth token from the Authorization header, validates it with
 * Supabase, and resolves the full user from the database.
 */
export async function createTRPCContext(
  opts: FetchCreateContextFnOptions
): Promise<TRPCContext> {
  // For regular requests, auth comes from headers.
  // For SSE subscriptions (httpSubscriptionLink), auth comes from
  // connectionParams since EventSource doesn't support custom headers.
  const connParams = opts.info?.connectionParams
  const authHeader =
    opts.req.headers.get("authorization") ??
    (connParams?.["authorization"] as string | undefined) ??
    null
  const authToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null

  const tenantId =
    opts.req.headers.get("x-tenant-id") ??
    (connParams?.["x-tenant-id"] as string | undefined) ??
    null

  let user: ContextUser | null = null
  let session: Session | null = null

  if (authToken) {
    try {
      // Create a Supabase client with the service role to validate tokens
      const supabase = createClient(
        serverEnv.supabaseUrl || clientEnv.supabaseUrl,
        serverEnv.supabaseServiceRoleKey,
        {
          auth: { autoRefreshToken: false, persistSession: false },
        }
      )

      // Validate the access token with Supabase
      const {
        data: { user: supabaseUser },
        error,
      } = await supabase.auth.getUser(authToken)

      if (supabaseUser && !error) {
        // Look up the full user from public.users with relations
        const dbUser = await prisma.user.findUnique({
          where: { id: supabaseUser.id },
          include: {
            userGroup: true,
            userTenants: {
              include: { tenant: true },
            },
          },
        })

        if (dbUser && dbUser.isActive !== false && !dbUser.isLocked) {
          user = dbUser as ContextUser
          // Construct a minimal session object for downstream use
          session = {
            access_token: authToken,
            user: supabaseUser,
          } as Session
        }
      }
    } catch (err) {
      // Token validation failed — user remains null (unauthenticated)
      console.error('[tRPC] Token validation error:', err)
    }
  }

  // ----- Platform impersonation branch -----
  //
  // Runs ONLY if the tenant Supabase auth did not resolve a user. A normal
  // tenant-authenticated request takes the same code path as before and is
  // completely unaffected. An impersonation request carries:
  //   - a `platform-session` cookie with a valid, MFA-verified platform JWT
  //   - an `x-support-session-id` header naming an active SupportSession
  //   - an `x-tenant-id` header matching that session's tenant
  // When all of those line up, we synthesize a `ContextUser` based on the
  // "Platform System" sentinel row so that the existing tenantProcedure and
  // permission checks succeed without modification.
  let impersonation: ImpersonationContext | null = null

  if (!user) {
    const cookieHeader = opts.req.headers.get("cookie") ?? ""
    const platformJwt =
      cookieHeader.match(/platform-session=([^;]+)/)?.[1] ?? null
    const supportSessionId =
      opts.req.headers.get("x-support-session-id") ??
      (connParams?.["x-support-session-id"] as string | undefined) ??
      null

    if (platformJwt && supportSessionId && tenantId) {
      try {
        const verified = await verifyPlatformJwt(platformJwt)
        if (verified.ok && verified.claims.mfaVerified) {
          const supportSession = await prisma.supportSession.findFirst({
            where: {
              id: supportSessionId,
              tenantId,
              platformUserId: verified.claims.sub,
              status: "active",
              expiresAt: { gt: new Date() },
            },
          })

          if (supportSession) {
            const [tenant, platformSystemUser] = await Promise.all([
              prisma.tenant.findUnique({ where: { id: tenantId } }),
              prisma.user.findUnique({
                where: { id: PLATFORM_SYSTEM_USER_ID },
                include: {
                  userGroup: true,
                  userTenants: { include: { tenant: true } },
                },
              }),
            ])

            if (tenant && platformSystemUser) {
              // Synthesize ContextUser: sentinel row augmented with a
              // single synthetic user_tenants entry for the active tenant
              // so the existing tenantProcedure scan at lines ~220-222
              // succeeds without modification. userGroup.isAdmin=true
              // ensures every requirePermission check passes.
              user = {
                ...platformSystemUser,
                userGroup: {
                  // Minimum shape needed by permission helpers: isAdmin
                  // (triggers the bypass in isUserAdmin()). If the sentinel
                  // already has a userGroup row, we spread it too.
                  ...(platformSystemUser.userGroup ?? {
                    id: "00000000-0000-0000-0000-000000000000",
                    tenantId: null,
                    name: "Platform System",
                    code: "platform_system",
                    description: null,
                    permissions: [],
                    isSystem: true,
                    isActive: true,
                    createdAt: supportSession.createdAt,
                    updatedAt: supportSession.createdAt,
                  }),
                  isAdmin: true,
                } as ContextUser["userGroup"],
                userTenants: [
                  {
                    userId: platformSystemUser.id,
                    tenantId: tenant.id,
                    role: "support",
                    createdAt: supportSession.createdAt,
                    tenant,
                  },
                ],
              } as ContextUser

              session = {
                access_token: "synthetic-platform-impersonation",
                user: {
                  id: platformSystemUser.id,
                  email: platformSystemUser.email,
                } as Session["user"],
              } as Session

              impersonation = {
                platformUserId: verified.claims.sub,
                supportSessionId: supportSession.id,
              }
            }
          }
        }
      } catch (err) {
        console.error("[tRPC] Platform impersonation error:", err)
      }
    }
  }

  // Extract client info for audit logging
  const ipAddress =
    opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    opts.req.headers.get("x-real-ip") ??
    null
  const userAgent = opts.req.headers.get("user-agent") ?? null

  return {
    prisma,
    authToken,
    user,
    session,
    tenantId,
    ipAddress,
    userAgent,
    impersonation,
  }
}

/**
 * tRPC instance initialization.
 *
 * Error formatting includes Zod validation details when available.
 */
const t = initTRPC.context<TRPCContext>().create({
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

/**
 * Router and middleware factories.
 */
export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory

/**
 * Middleware factory -- used by authorization middleware in separate files.
 */
export const createMiddleware = t.middleware

/**
 * Impersonation boundary middleware.
 *
 * If `ctx.impersonation` is set, runs the procedure (and everything it
 * awaits synchronously) inside the impersonation AsyncLocalStorage so that
 * downstream code — notably `audit-logs-service.log()` — can detect the
 * active support session and dual-write to `platform_audit_logs` without
 * any caller changes.
 */
const impersonationBoundary = t.middleware(({ ctx, next }) => {
  const c = ctx as TRPCContext
  if (c.impersonation) {
    return impersonationStorage.run(c.impersonation, () => next())
  }
  return next()
})

/**
 * Public procedure — no authentication required.
 * Available to anyone, including unauthenticated users.
 *
 * The impersonation boundary is applied at the foundation so every
 * downstream procedure automatically inherits the store.
 */
export const publicProcedure = t.procedure.use(impersonationBoundary)

/**
 * Protected procedure — requires a valid Supabase session and resolved user.
 * Throws UNAUTHORIZED if no valid session/user is present.
 */
export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    })
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // narrowed to non-null
      session: ctx.session, // narrowed to non-null
    },
  })
})

/**
 * Tenant procedure — requires auth token AND tenant ID.
 * Extends protectedProcedure with tenant ID requirement.
 * Throws UNAUTHORIZED if no auth token, FORBIDDEN if no tenant ID.
 *
 * Validates that the user has access to the requested tenant via
 * the userTenants join table (ZMI-TICKET-203).
 */
export const tenantProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tenant ID required",
      })
    }

    // Validate that the user has access to this tenant via userTenants
    const hasAccess = ctx.user.userTenants.some(
      (ut) => ut.tenantId === ctx.tenantId
    )

    if (!hasAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Access to tenant denied",
      })
    }

    return next({
      ctx: {
        ...ctx,
        tenantId: ctx.tenantId, // narrowed to non-null
      },
    })
  }
)
