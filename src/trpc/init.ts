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

  return {
    prisma,
    authToken,
    user,
    session,
    tenantId,
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
 * Public procedure — no authentication required.
 * Available to anyone, including unauthenticated users.
 */
export const publicProcedure = t.procedure

/**
 * Protected procedure — requires a valid Supabase session and resolved user.
 * Throws UNAUTHORIZED if no valid session/user is present.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
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
