/**
 * Employee Other Employments Service
 *
 * Business logic for employee other employment operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employee-other-employments-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class OtherEmploymentNotFoundError extends Error {
  constructor() {
    super("Other employment not found")
    this.name = "OtherEmploymentNotFoundError"
  }
}

export class OtherEmploymentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OtherEmploymentValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists other employments for an employee.
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
 * Creates a new other employment for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    employerName: string
    monthlyIncome?: number | null
    weeklyHours?: number | null
    isMinijob?: boolean
    startDate: Date
    endDate?: Date | null
  },
  audit?: AuditContext
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  const employerName = input.employerName.trim()
  if (employerName.length === 0) {
    throw new OtherEmploymentValidationError("Employer name is required")
  }

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    employerName,
    monthlyIncome: input.monthlyIncome != null ? new Prisma.Decimal(input.monthlyIncome) : null,
    weeklyHours: input.weeklyHours != null ? new Prisma.Decimal(input.weeklyHours) : null,
    isMinijob: input.isMinijob ?? false,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_other_employment",
      entityId: created.id,
      entityName: employerName,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

/**
 * Updates an employee other employment.
 * Verifies the other employment exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    employerName?: string
    monthlyIncome?: number | null
    weeklyHours?: number | null
    isMinijob?: boolean
    startDate?: Date
    endDate?: Date | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new OtherEmploymentNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.employerName !== undefined) {
    const employerName = input.employerName.trim()
    if (employerName.length === 0) {
      throw new OtherEmploymentValidationError("Employer name is required")
    }
    data.employerName = employerName
  }
  if (input.monthlyIncome !== undefined) data.monthlyIncome = input.monthlyIncome === null ? null : new Prisma.Decimal(input.monthlyIncome)
  if (input.weeklyHours !== undefined) data.weeklyHours = input.weeklyHours === null ? null : new Prisma.Decimal(input.weeklyHours)
  if (input.isMinijob !== undefined) data.isMinijob = input.isMinijob
  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new OtherEmploymentNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_other_employment",
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
 * Deletes an employee other employment.
 * Verifies the other employment exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new OtherEmploymentNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_other_employment",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
