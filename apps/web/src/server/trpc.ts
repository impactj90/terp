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

/**
 * tRPC Context
 *
 * Available to all procedures. Extended by middleware for procedure-specific
 * guarantees (e.g., protectedProcedure guarantees `authToken` is non-null).
 *
 * NOTE: `user` and `session` are null until ZMI-TICKET-202 (Supabase Auth)
 * implements actual user resolution from the auth token.
 */
export type TRPCContext = {
  prisma: PrismaClient
  /** Raw Authorization header value (Bearer token). Null if not provided. */
  authToken: string | null
  /** User object resolved from session. Null until ZMI-TICKET-202. */
  user: null
  /** Session object. Null until ZMI-TICKET-202. */
  session: null
  /** Tenant ID from X-Tenant-ID header. Null if not provided. */
  tenantId: string | null
}

/**
 * Creates the tRPC context for each request.
 *
 * Extracts auth token and tenant ID from request headers.
 * User/session resolution will be added in ZMI-TICKET-202.
 */
export function createTRPCContext(
  opts: FetchCreateContextFnOptions
): TRPCContext {
  const authHeader = opts.req.headers.get("authorization")
  const authToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null

  const tenantId = opts.req.headers.get("x-tenant-id")

  return {
    prisma,
    authToken,
    user: null,
    session: null,
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
 * Public procedure — no authentication required.
 * Available to anyone, including unauthenticated users.
 */
export const publicProcedure = t.procedure

/**
 * Protected procedure — requires a valid auth token.
 * Throws UNAUTHORIZED if no Bearer token is present in the Authorization header.
 *
 * NOTE: This currently only checks for token presence, not validity.
 * ZMI-TICKET-202 will add Supabase session validation and user resolution.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.authToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    })
  }

  return next({
    ctx: {
      ...ctx,
      authToken: ctx.authToken, // narrowed to non-null
    },
  })
})

/**
 * Tenant procedure — requires auth token AND tenant ID.
 * Extends protectedProcedure with tenant ID requirement.
 * Throws UNAUTHORIZED if no auth token, FORBIDDEN if no tenant ID.
 *
 * NOTE: Does not validate that the user has access to the tenant.
 * ZMI-TICKET-203 will add tenant access validation.
 */
export const tenantProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tenant ID required",
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
