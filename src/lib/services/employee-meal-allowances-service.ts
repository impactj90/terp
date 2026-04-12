/**
 * Employee Meal Allowances Service
 *
 * Business logic for employee meal allowance operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employee-meal-allowances-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class MealAllowanceNotFoundError extends Error {
  constructor() {
    super("Meal allowance not found")
    this.name = "MealAllowanceNotFoundError"
  }
}

export class MealAllowanceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MealAllowanceValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists meal allowances for an employee.
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
 * Creates a new meal allowance for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    dailyAmount: number
    workDaysPerMonth: number
    startDate: Date
    endDate?: Date | null
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
    dailyAmount: new Prisma.Decimal(input.dailyAmount),
    workDaysPerMonth: input.workDaysPerMonth,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_meal_allowance",
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
 * Updates an employee meal allowance.
 * Verifies the meal allowance exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    dailyAmount?: number
    workDaysPerMonth?: number
    startDate?: Date
    endDate?: Date | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new MealAllowanceNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.dailyAmount !== undefined) data.dailyAmount = new Prisma.Decimal(input.dailyAmount)
  if (input.workDaysPerMonth !== undefined) data.workDaysPerMonth = input.workDaysPerMonth
  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new MealAllowanceNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_meal_allowance",
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
 * Deletes an employee meal allowance.
 * Verifies the meal allowance exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new MealAllowanceNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_meal_allowance",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
