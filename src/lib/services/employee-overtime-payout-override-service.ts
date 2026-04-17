import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-overtime-payout-override-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class OverrideNotFoundError extends Error {
  constructor(message = "Overtime payout override not found") {
    super(message)
    this.name = "OverrideNotFoundError"
  }
}

export class OverrideValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OverrideValidationError"
  }
}

export class OverrideConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OverrideConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { employeeId?: string },
  scopeWhere?: Record<string, unknown> | null,
) {
  return repo.findMany(prisma, tenantId, params, scopeWhere)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const item = await repo.findById(prisma, tenantId, id)
  if (!item) throw new OverrideNotFoundError()
  return item
}

export async function getByEmployeeId(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
) {
  return repo.findByEmployeeId(prisma, tenantId, employeeId)
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    overtimePayoutEnabled: boolean
    overtimePayoutMode?: string | null
    notes?: string | null
  },
  audit?: AuditContext,
) {
  const existing = await repo.findByEmployeeId(prisma, tenantId, input.employeeId)
  if (existing) {
    throw new OverrideConflictError("An overtime payout override already exists for this employee")
  }

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    overtimePayoutEnabled: input.overtimePayoutEnabled,
    overtimePayoutMode: input.overtimePayoutMode ?? null,
    notes: input.notes?.trim() || null,
  })

  if (audit) {
    auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create",
      entityType: "employee_overtime_payout_override",
      entityId: created.id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error("[AuditLog] Failed:", err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    overtimePayoutEnabled?: boolean
    overtimePayoutMode?: string | null
    notes?: string | null
    isActive?: boolean
  },
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new OverrideNotFoundError()

  const data: Record<string, unknown> = {}
  if (input.overtimePayoutEnabled !== undefined) data.overtimePayoutEnabled = input.overtimePayoutEnabled
  if (input.overtimePayoutMode !== undefined) data.overtimePayoutMode = input.overtimePayoutMode
  if (input.notes !== undefined) data.notes = input.notes === null ? null : input.notes.trim()
  if (input.isActive !== undefined) data.isActive = input.isActive

  const updated = await repo.update(prisma, tenantId, id, data)

  if (audit) {
    auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update",
      entityType: "employee_overtime_payout_override",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new OverrideNotFoundError()

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete",
      entityType: "employee_overtime_payout_override",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error("[AuditLog] Failed:", err))
  }
}
