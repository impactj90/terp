/**
 * Root tRPC Router
 *
 * Merges all sub-routers into a single appRouter.
 * The AppRouter type is exported for client-side type inference.
 *
 * Add new routers here as they are implemented (ZMI-TICKET-210+).
 */
import { createTRPCRouter, createCallerFactory } from "./trpc"
import { healthRouter } from "./routers/health"
import { authRouter } from "./routers/auth"
import { permissionsRouter } from "./routers/permissions"
import { tenantsRouter } from "./routers/tenants"
import { userGroupsRouter } from "./routers/userGroups"
import { usersRouter } from "./routers/users"
import { departmentsRouter } from "./routers/departments"
import { teamsRouter } from "./routers/teams"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  permissions: permissionsRouter,
  tenants: tenantsRouter,
  users: usersRouter,
  userGroups: userGroupsRouter,
  departments: departmentsRouter,
  teams: teamsRouter,
})

/** Type-only export for client-side inference. */
export type AppRouter = typeof appRouter

/**
 * Server-side caller factory.
 * Used for server-side tRPC calls without HTTP round-trips.
 */
export const createCaller = createCallerFactory(appRouter)
