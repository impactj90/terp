/**
 * Platform tRPC root router.
 *
 * Mirrors `src/trpc/routers/_app.ts` but scoped to the platform-admin
 * domain. Kept in its own file tree so that the tenant router and the
 * platform router can evolve independently and a deploy misconfiguration
 * cannot accidentally expose platform mutations on the tenant endpoint.
 */
import { createTRPCRouter } from "./init"
import { platformAuthRouter } from "./routers/auth"
import { platformUsersRouter } from "./routers/platformUsers"
import { platformTenantsRouter } from "./routers/tenants"
import { platformTenantManagementRouter } from "./routers/tenantManagement"
import { platformDemoTenantManagementRouter } from "./routers/demoTenantManagement"
import { platformDemoConvertRequestsRouter } from "./routers/demoConvertRequests"
import { platformSupportSessionsRouter } from "./routers/supportSessions"
import { platformAuditLogsRouter } from "./routers/auditLogs"

export const platformAppRouter = createTRPCRouter({
  auth: platformAuthRouter,
  platformUsers: platformUsersRouter,
  tenants: platformTenantsRouter,
  tenantManagement: platformTenantManagementRouter,
  demoTenantManagement: platformDemoTenantManagementRouter,
  demoConvertRequests: platformDemoConvertRequestsRouter,
  supportSessions: platformSupportSessionsRouter,
  auditLogs: platformAuditLogsRouter,
})

export type PlatformAppRouter = typeof platformAppRouter
