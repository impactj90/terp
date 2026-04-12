/**
 * Tenant Module Service
 *
 * Business logic for managing per-tenant feature modules.
 * Follows the service pattern used throughout src/lib/services/.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { AVAILABLE_MODULES, type ModuleId } from "@/lib/modules"
import * as repo from "./tenant-module-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Custom Errors ---

export class ModuleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModuleValidationError"
  }
}

// --- Service Functions ---

/**
 * Returns all available modules with their enabled status for the tenant.
 */
export async function list(prisma: PrismaClient, tenantId: string) {
  const rows = await repo.findByTenant(prisma, tenantId)
  const modules = rows.map((r) => ({
    module: r.module,
    enabledAt: r.enabledAt,
  }))

  // Ensure "core" is always present
  if (!modules.some((m) => m.module === "core")) {
    modules.unshift({ module: "core", enabledAt: new Date() })
  }

  return modules
}

/**
 * Returns only the enabled module keys for the tenant.
 */
export async function listEnabled(
  prisma: PrismaClient,
  tenantId: string
): Promise<string[]> {
  const rows = await repo.findByTenant(prisma, tenantId)
  const modules = rows.map((r) => r.module)

  if (!modules.includes("core")) {
    modules.push("core")
  }

  return modules
}

/**
 * Enables a module for the tenant.
 */
export async function enable(
  prisma: PrismaClient,
  tenantId: string,
  module: string,
  enabledById?: string,
  audit?: AuditContext
) {
  if (!AVAILABLE_MODULES.includes(module as ModuleId)) {
    throw new ModuleValidationError(
      `Unknown module: "${module}". Available: ${AVAILABLE_MODULES.join(", ")}`
    )
  }

  const row = await repo.create(prisma, tenantId, module, enabledById)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "tenant_module",
      entityId: row.id ?? module,
      entityName: module,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { module: row.module, enabledAt: row.enabledAt }
}

/**
 * Disables a module for the tenant. Cannot disable "core".
 */
export async function disable(
  prisma: PrismaClient,
  tenantId: string,
  module: string,
  audit?: AuditContext
) {
  if (module === "core") {
    throw new ModuleValidationError('The "core" module cannot be disabled')
  }

  if (!AVAILABLE_MODULES.includes(module as ModuleId)) {
    throw new ModuleValidationError(
      `Unknown module: "${module}". Available: ${AVAILABLE_MODULES.join(", ")}`
    )
  }

  await repo.remove(prisma, tenantId, module)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "tenant_module",
      entityId: module,
      entityName: module,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
