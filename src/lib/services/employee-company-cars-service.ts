/**
 * Employee Company Cars Service
 *
 * Business logic for employee company car operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employee-company-cars-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class CompanyCarNotFoundError extends Error {
  constructor() {
    super("Company car not found")
    this.name = "CompanyCarNotFoundError"
  }
}

export class CompanyCarValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CompanyCarValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists company cars for an employee.
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
 * Creates a new company car for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    listPrice: number
    propulsionType: string
    distanceToWorkKm: number
    usageType: string
    licensePlate?: string | null
    makeModel?: string | null
    startDate: Date
    endDate?: Date | null
    notes?: string | null
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
    listPrice: new Prisma.Decimal(input.listPrice),
    propulsionType: input.propulsionType,
    distanceToWorkKm: new Prisma.Decimal(input.distanceToWorkKm),
    usageType: input.usageType,
    licensePlate: input.licensePlate?.trim() || null,
    makeModel: input.makeModel?.trim() || null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    notes: input.notes?.trim() || null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_company_car",
      entityId: created.id,
      entityName: input.makeModel?.trim() || null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

/**
 * Updates an employee company car.
 * Verifies the company car exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    listPrice?: number
    propulsionType?: string
    distanceToWorkKm?: number
    usageType?: string
    licensePlate?: string | null
    makeModel?: string | null
    startDate?: Date
    endDate?: Date | null
    notes?: string | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new CompanyCarNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.listPrice !== undefined) data.listPrice = new Prisma.Decimal(input.listPrice)
  if (input.propulsionType !== undefined) data.propulsionType = input.propulsionType
  if (input.distanceToWorkKm !== undefined) data.distanceToWorkKm = new Prisma.Decimal(input.distanceToWorkKm)
  if (input.usageType !== undefined) data.usageType = input.usageType
  if (input.licensePlate !== undefined) data.licensePlate = input.licensePlate === null ? null : input.licensePlate.trim()
  if (input.makeModel !== undefined) data.makeModel = input.makeModel === null ? null : input.makeModel.trim()
  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate
  if (input.notes !== undefined) data.notes = input.notes === null ? null : input.notes.trim()

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new CompanyCarNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_company_car",
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
 * Deletes an employee company car.
 * Verifies the company car exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new CompanyCarNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_company_car",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
