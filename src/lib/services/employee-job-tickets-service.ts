/**
 * Employee Job Tickets Service
 *
 * Business logic for employee job ticket operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employee-job-tickets-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class JobTicketNotFoundError extends Error {
  constructor() {
    super("Job ticket not found")
    this.name = "JobTicketNotFoundError"
  }
}

export class JobTicketValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "JobTicketValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists job tickets for an employee.
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
 * Creates a new job ticket for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    monthlyAmount: number
    provider?: string | null
    isAdditional?: boolean
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
    monthlyAmount: new Prisma.Decimal(input.monthlyAmount),
    provider: input.provider?.trim() || null,
    isAdditional: input.isAdditional ?? false,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_job_ticket",
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
 * Updates an employee job ticket.
 * Verifies the job ticket exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    monthlyAmount?: number
    provider?: string | null
    isAdditional?: boolean
    startDate?: Date
    endDate?: Date | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new JobTicketNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.monthlyAmount !== undefined) data.monthlyAmount = new Prisma.Decimal(input.monthlyAmount)
  if (input.provider !== undefined) data.provider = input.provider === null ? null : input.provider.trim()
  if (input.isAdditional !== undefined) data.isAdditional = input.isAdditional
  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new JobTicketNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_job_ticket",
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
 * Deletes an employee job ticket.
 * Verifies the job ticket exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new JobTicketNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_job_ticket",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
