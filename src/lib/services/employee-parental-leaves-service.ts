/**
 * Employee Parental Leaves Service
 *
 * Business logic for employee parental leave operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-parental-leaves-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class ParentalLeaveNotFoundError extends Error {
  constructor() {
    super("Parental leave not found")
    this.name = "ParentalLeaveNotFoundError"
  }
}

export class ParentalLeaveValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ParentalLeaveValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists parental leaves for an employee.
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
 * Creates a new parental leave for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    startDate: Date
    endDate: Date
    childId?: string | null
    isPartnerMonths?: boolean
  },
  audit?: AuditContext
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    startDate: input.startDate,
    endDate: input.endDate,
    childId: input.childId ?? null,
    isPartnerMonths: input.isPartnerMonths ?? false,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_parental_leave",
      entityId: created.id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

/**
 * Updates an employee parental leave.
 * Verifies the parental leave exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    startDate?: Date
    endDate?: Date | null
    childId?: string | null
    isPartnerMonths?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new ParentalLeaveNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate
  if (input.childId !== undefined) data.childId = input.childId
  if (input.isPartnerMonths !== undefined) data.isPartnerMonths = input.isPartnerMonths

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new ParentalLeaveNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_parental_leave",
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
 * Deletes an employee parental leave.
 * Verifies the parental leave exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new ParentalLeaveNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_parental_leave",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
