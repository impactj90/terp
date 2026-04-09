/**
 * Employee Maternity Leaves Service
 *
 * Business logic for employee maternity leave operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-maternity-leaves-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class MaternityLeaveNotFoundError extends Error {
  constructor() {
    super("Maternity leave not found")
    this.name = "MaternityLeaveNotFoundError"
  }
}

export class MaternityLeaveValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MaternityLeaveValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists maternity leaves for an employee.
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
 * Creates a new maternity leave for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    startDate: Date
    expectedBirthDate: Date
    actualBirthDate?: Date | null
    actualEndDate?: Date | null
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
    expectedBirthDate: input.expectedBirthDate,
    actualBirthDate: input.actualBirthDate ?? null,
    actualEndDate: input.actualEndDate ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_maternity_leave",
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
 * Updates an employee maternity leave.
 * Verifies the maternity leave exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    startDate?: Date
    expectedBirthDate?: Date
    actualBirthDate?: Date | null
    actualEndDate?: Date | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new MaternityLeaveNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.expectedBirthDate !== undefined) data.expectedBirthDate = input.expectedBirthDate
  if (input.actualBirthDate !== undefined) data.actualBirthDate = input.actualBirthDate
  if (input.actualEndDate !== undefined) data.actualEndDate = input.actualEndDate

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new MaternityLeaveNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_maternity_leave",
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
 * Deletes an employee maternity leave.
 * Verifies the maternity leave exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new MaternityLeaveNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_maternity_leave",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
