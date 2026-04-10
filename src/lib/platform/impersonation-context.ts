/**
 * Platform impersonation AsyncLocalStorage.
 *
 * When a platform operator reaches a tenant tRPC procedure via an active
 * SupportSession, `createTRPCContext` populates `ctx.impersonation` and
 * wraps the procedure execution in this storage. Downstream code — most
 * importantly `audit-logs-service.log()` — reads the store implicitly via
 * `getImpersonation()` and dual-writes to `platform_audit_logs`.
 *
 * This keeps the 131 existing `auditLog.log(...)` call sites unchanged;
 * only the service's inner function needs to know about impersonation.
 *
 * Plan: thoughts/shared/plans/2026-04-09-platform-admin-system.md (Phase 7.2)
 */
import { AsyncLocalStorage } from "node:async_hooks"

export interface ImpersonationContext {
  /** The real platform operator's `platform_users.id`. */
  platformUserId: string
  /** The active `support_sessions.id` that authorized this request. */
  supportSessionId: string
}

export const impersonationStorage =
  new AsyncLocalStorage<ImpersonationContext>()

/**
 * Read the current impersonation context, if any.
 *
 * Returns `null` for normal tenant requests. Returns the populated context
 * when invoked from inside a procedure running under an active support
 * session.
 */
export function getImpersonation(): ImpersonationContext | null {
  return impersonationStorage.getStore() ?? null
}
