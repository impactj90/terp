/**
 * Employee Foreign Assignments Service
 *
 * Business logic for employee foreign assignment operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-foreign-assignments-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class ForeignAssignmentNotFoundError extends Error {
  constructor() {
    super("Foreign assignment not found")
    this.name = "ForeignAssignmentNotFoundError"
  }
}

export class ForeignAssignmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ForeignAssignmentValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists foreign assignments for an employee.
 * Verifies employee belongs to tenant.
 */
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  return repo.listByEmployee(prisma, employeeId)
}

/**
 * Creates a new foreign assignment for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    countryCode: string
    countryName: string
    startDate: Date
    endDate?: Date | null
    a1CertificateNumber?: string | null
    a1ValidFrom?: Date | null
    a1ValidUntil?: Date | null
    foreignActivityExemption?: boolean
    notes?: string | null
  },
  audit?: AuditContext
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  const countryCode = input.countryCode.trim()
  if (countryCode.length === 0) {
    throw new ForeignAssignmentValidationError("Country code is required")
  }

  const countryName = input.countryName.trim()
  if (countryName.length === 0) {
    throw new ForeignAssignmentValidationError("Country name is required")
  }

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    countryCode,
    countryName,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    a1CertificateNumber: input.a1CertificateNumber?.trim() || null,
    a1ValidFrom: input.a1ValidFrom ?? null,
    a1ValidUntil: input.a1ValidUntil ?? null,
    foreignActivityExemption: input.foreignActivityExemption ?? false,
    notes: input.notes?.trim() || null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_foreign_assignment",
      entityId: created.id,
      entityName: countryName,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

/**
 * Updates an employee foreign assignment.
 * Verifies the foreign assignment exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    countryCode?: string
    countryName?: string
    startDate?: Date
    endDate?: Date | null
    a1CertificateNumber?: string | null
    a1ValidFrom?: Date | null
    a1ValidUntil?: Date | null
    foreignActivityExemption?: boolean
    notes?: string | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new ForeignAssignmentNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.countryCode !== undefined) {
    const countryCode = input.countryCode.trim()
    if (countryCode.length === 0) {
      throw new ForeignAssignmentValidationError("Country code is required")
    }
    data.countryCode = countryCode
  }
  if (input.countryName !== undefined) {
    const countryName = input.countryName.trim()
    if (countryName.length === 0) {
      throw new ForeignAssignmentValidationError("Country name is required")
    }
    data.countryName = countryName
  }
  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate
  if (input.a1CertificateNumber !== undefined) data.a1CertificateNumber = input.a1CertificateNumber === null ? null : input.a1CertificateNumber.trim()
  if (input.a1ValidFrom !== undefined) data.a1ValidFrom = input.a1ValidFrom
  if (input.a1ValidUntil !== undefined) data.a1ValidUntil = input.a1ValidUntil
  if (input.foreignActivityExemption !== undefined) data.foreignActivityExemption = input.foreignActivityExemption
  if (input.notes !== undefined) data.notes = input.notes === null ? null : input.notes.trim()

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new ForeignAssignmentNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_foreign_assignment",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

/**
 * Deletes an employee foreign assignment.
 * Verifies the foreign assignment exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new ForeignAssignmentNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_foreign_assignment",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
