/**
 * Employee Pensions Service
 *
 * Business logic for employee pension operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employee-pensions-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class PensionNotFoundError extends Error {
  constructor() {
    super("Pension not found")
    this.name = "PensionNotFoundError"
  }
}

export class PensionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PensionValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists pensions for an employee.
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
 * Creates a new pension for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    executionType: string
    providerName: string
    contractNumber?: string | null
    employeeContribution: number
    employerContribution: number
    mandatoryEmployerSubsidy?: number
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
    executionType: input.executionType,
    providerName: input.providerName.trim(),
    contractNumber: input.contractNumber?.trim() || null,
    employeeContribution: new Prisma.Decimal(input.employeeContribution),
    employerContribution: new Prisma.Decimal(input.employerContribution),
    mandatoryEmployerSubsidy: new Prisma.Decimal(input.mandatoryEmployerSubsidy ?? 0),
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_pension",
      entityId: created.id,
      entityName: input.providerName?.trim() || null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

/**
 * Updates an employee pension.
 * Verifies the pension exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    executionType?: string
    providerName?: string
    contractNumber?: string | null
    employeeContribution?: number
    employerContribution?: number
    mandatoryEmployerSubsidy?: number
    startDate?: Date
    endDate?: Date | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new PensionNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.executionType !== undefined) data.executionType = input.executionType
  if (input.providerName !== undefined) data.providerName = input.providerName.trim()
  if (input.contractNumber !== undefined) data.contractNumber = input.contractNumber === null ? null : input.contractNumber.trim()
  if (input.employeeContribution !== undefined) data.employeeContribution = new Prisma.Decimal(input.employeeContribution)
  if (input.employerContribution !== undefined) data.employerContribution = new Prisma.Decimal(input.employerContribution)
  if (input.mandatoryEmployerSubsidy !== undefined) data.mandatoryEmployerSubsidy = new Prisma.Decimal(input.mandatoryEmployerSubsidy)
  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new PensionNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_pension",
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
 * Deletes an employee pension.
 * Verifies the pension exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new PensionNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_pension",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
