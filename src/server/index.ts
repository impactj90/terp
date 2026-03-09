// Re-export from new locations for backward compatibility
// This file will be removed in TICKET-326 (final cleanup)
export { appRouter, type AppRouter, createCaller } from "@/trpc/routers/_app"
export {
  createTRPCContext,
  createTRPCRouter,
  createMiddleware,
  publicProcedure,
  protectedProcedure,
  tenantProcedure,
} from "@/trpc/init"
export {
  requirePermission,
  requireSelfOrPermission,
  requireEmployeePermission,
  applyDataScope,
} from "@/lib/auth/middleware"
export type { DataScope, DataScopeType } from "@/lib/auth/middleware"
