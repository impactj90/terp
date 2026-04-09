/**
 * Payroll Wage Service
 *
 * Manages default + tenant-specific Lohnart code mapping.
 * Default codes are global seed (DefaultPayrollWage).
 * Per tenant, a copy is held in TenantPayrollWage and edited
 * by the customer's accountant. Templates reference these codes via
 * the export-engine context.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./payroll-wage-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

export class PayrollWageNotFoundError extends Error {
  constructor() {
    super("Payroll wage not found")
    this.name = "PayrollWageNotFoundError"
  }
}

export class PayrollWageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PayrollWageValidationError"
  }
}

export async function listDefaults(prisma: PrismaClient) {
  return repo.listDefaults(prisma)
}

export async function listForTenant(prisma: PrismaClient, tenantId: string) {
  // Lazy-initialize on first read so newly created tenants get the catalog
  // without an explicit setup call.
  const existing = await repo.listForTenant(prisma, tenantId)
  if (existing.length === 0) {
    await repo.copyDefaultsToTenant(prisma, tenantId)
    return repo.listForTenant(prisma, tenantId)
  }
  return existing
}

export async function initializeForTenant(
  prisma: PrismaClient,
  tenantId: string,
  audit?: AuditContext,
): Promise<{ inserted: number }> {
  const inserted = await repo.copyDefaultsToTenant(prisma, tenantId)
  if (audit && inserted > 0) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "tenant_payroll_wage",
        entityId: tenantId,
        entityName: `initialize ${inserted} wages`,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
  return { inserted }
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    code?: string
    name?: string
    terpSource?: string
    category?: string
    description?: string | null
    sortOrder?: number
    isActive?: boolean
  },
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new PayrollWageNotFoundError()

  if (input.code !== undefined) {
    const trimmed = input.code.trim()
    if (trimmed.length === 0) {
      throw new PayrollWageValidationError("Code is required")
    }
    if (!/^[A-Za-z0-9]{1,10}$/.test(trimmed)) {
      throw new PayrollWageValidationError(
        "Code must be alphanumeric, max 10 characters",
      )
    }
  }
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new PayrollWageValidationError("Name is required")
  }

  const data: Record<string, unknown> = {}
  if (input.code !== undefined) data.code = input.code.trim()
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.terpSource !== undefined) data.terpSource = input.terpSource
  if (input.category !== undefined) data.category = input.category
  if (input.description !== undefined) data.description = input.description
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  if (input.isActive !== undefined) data.isActive = input.isActive

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) throw new PayrollWageNotFoundError()

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "tenant_payroll_wage",
        entityId: id,
        entityName: updated.code,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function reset(
  prisma: PrismaClient,
  tenantId: string,
  audit?: AuditContext,
): Promise<{ deleted: number; inserted: number }> {
  const deleted = await repo.deleteAllForTenant(prisma, tenantId)
  const inserted = await repo.copyDefaultsToTenant(prisma, tenantId)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "tenant_payroll_wage",
        entityId: tenantId,
        entityName: `reset (deleted ${deleted}, inserted ${inserted})`,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { deleted, inserted }
}
