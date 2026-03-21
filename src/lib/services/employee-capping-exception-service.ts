/**
 * Employee Capping Exception Service
 *
 * Business logic for employee capping exception operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employee-capping-exception-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit Logging ---

const TRACKED_FIELDS = ["employeeId"]

// --- Error Classes ---

export class EmployeeCappingExceptionNotFoundError extends Error {
  constructor(message = "Employee capping exception not found") {
    super(message)
    this.name = "EmployeeCappingExceptionNotFoundError"
  }
}

export class EmployeeCappingExceptionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeCappingExceptionValidationError"
  }
}

export class EmployeeCappingExceptionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeCappingExceptionConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    employeeId?: string
    cappingRuleId?: string
    year?: number
  },
  scopeWhere?: Record<string, unknown> | null
) {
  return repo.findMany(prisma, tenantId, params, scopeWhere)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const item = await repo.findById(prisma, tenantId, id)
  if (!item) {
    throw new EmployeeCappingExceptionNotFoundError()
  }
  return item
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    cappingRuleId: string
    exemptionType: string
    retainDays?: number | null
    year?: number
    notes?: string
    isActive: boolean
  },
  audit?: AuditContext
) {
  // Validate capping rule exists
  const rule = await repo.findCappingRule(prisma, tenantId, input.cappingRuleId)
  if (!rule) {
    throw new EmployeeCappingExceptionValidationError("Capping rule not found")
  }

  // Validate retainDays for partial exemption
  if (
    input.exemptionType === "partial" &&
    (input.retainDays === undefined || input.retainDays === null)
  ) {
    throw new EmployeeCappingExceptionValidationError(
      "Retain days is required for partial exemption type"
    )
  }

  // Check uniqueness: employee + rule + year
  const existing = await repo.findDuplicate(
    prisma,
    input.employeeId,
    input.cappingRuleId,
    input.year
  )
  if (existing) {
    const message =
      input.year !== undefined
        ? "An exception for this employee, rule, and year already exists"
        : "An exception for this employee and rule (all years) already exists"
    throw new EmployeeCappingExceptionConflictError(message)
  }

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    cappingRuleId: input.cappingRuleId,
    exemptionType: input.exemptionType,
    retainDays:
      input.retainDays !== undefined && input.retainDays !== null
        ? new Prisma.Decimal(input.retainDays)
        : null,
    year: input.year ?? null,
    notes: input.notes?.trim() || null,
    isActive: input.isActive,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "employee_capping_exception",
      entityId: created.id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    exemptionType?: string
    retainDays?: number | null
    year?: number | null
    notes?: string | null
    isActive?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new EmployeeCappingExceptionNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.exemptionType !== undefined)
    data.exemptionType = input.exemptionType
  if (input.retainDays !== undefined) {
    data.retainDays =
      input.retainDays === null
        ? null
        : new Prisma.Decimal(input.retainDays)
  }
  if (input.year !== undefined) data.year = input.year
  if (input.notes !== undefined) {
    data.notes = input.notes === null ? null : input.notes.trim()
  }
  if (input.isActive !== undefined) data.isActive = input.isActive

  // Determine effective exemption type after update
  const effectiveType = input.exemptionType ?? existing.exemptionType
  const effectiveRetainDays =
    input.retainDays !== undefined
      ? input.retainDays
      : existing.retainDays !== null
        ? Number(existing.retainDays)
        : null

  // Validate retainDays required for partial
  if (
    effectiveType === "partial" &&
    (effectiveRetainDays === null || effectiveRetainDays === undefined)
  ) {
    throw new EmployeeCappingExceptionValidationError(
      "Retain days is required for partial exemption type"
    )
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "employee_capping_exception",
      entityId: input.id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new EmployeeCappingExceptionNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "employee_capping_exception",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
