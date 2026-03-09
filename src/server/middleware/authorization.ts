// Re-export from new location for backward compatibility
// This file will be removed in TICKET-326 (final cleanup)
export {
  requirePermission,
  requireSelfOrPermission,
  requireEmployeePermission,
  applyDataScope,
} from "@/lib/auth/middleware"
export type { DataScope, DataScopeType } from "@/lib/auth/middleware"
