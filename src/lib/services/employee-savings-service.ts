/**
 * Employee Savings Service
 *
 * Business logic for employee savings (VWL) operations.
 * Delegates data access to the repository layer.
 * recipientIban is encrypted at rest.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employee-savings-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { encryptField, decryptField } from "./field-encryption"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class SavingsNotFoundError extends Error {
  constructor() {
    super("Savings record not found")
    this.name = "SavingsNotFoundError"
  }
}

export class SavingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SavingsValidationError"
  }
}

// --- Helpers ---

function decryptSavings<T extends { recipientIban: string | null }>(record: T): T {
  if (record.recipientIban) {
    return { ...record, recipientIban: decryptField(record.recipientIban) }
  }
  return record
}

// --- Service Functions ---

/**
 * Lists savings for an employee.
 * Verifies employee belongs to tenant.
 * Decrypts recipientIban after read.
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

  const records = await repo.listByEmployee(prisma, employeeId)
  return records.map(decryptSavings)
}

/**
 * Creates a new savings record for an employee.
 * Verifies employee belongs to tenant.
 * Encrypts recipientIban before write.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    investmentType: string
    recipient: string
    recipientIban?: string | null
    contractNumber?: string | null
    monthlyAmount: number
    employerShare: number
    employeeShare: number
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
    investmentType: input.investmentType,
    recipient: input.recipient.trim(),
    recipientIban: input.recipientIban ? encryptField(input.recipientIban.trim()) : null,
    contractNumber: input.contractNumber?.trim() || null,
    monthlyAmount: new Prisma.Decimal(input.monthlyAmount),
    employerShare: new Prisma.Decimal(input.employerShare),
    employeeShare: new Prisma.Decimal(input.employeeShare),
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_savings",
      entityId: created.id,
      entityName: input.recipient?.trim() || null,
      changes: input.recipientIban ? { recipientIban: "[encrypted]" } : null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return decryptSavings(created)
}

/**
 * Updates an employee savings record.
 * Verifies the record exists and belongs to tenant.
 * Encrypts recipientIban before write, decrypts after read.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    investmentType?: string
    recipient?: string
    recipientIban?: string | null
    contractNumber?: string | null
    monthlyAmount?: number
    employerShare?: number
    employeeShare?: number
    startDate?: Date
    endDate?: Date | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new SavingsNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.investmentType !== undefined) data.investmentType = input.investmentType
  if (input.recipient !== undefined) data.recipient = input.recipient.trim()
  if (input.recipientIban !== undefined) data.recipientIban = input.recipientIban === null ? null : encryptField(input.recipientIban.trim())
  if (input.contractNumber !== undefined) data.contractNumber = input.contractNumber === null ? null : input.contractNumber.trim()
  if (input.monthlyAmount !== undefined) data.monthlyAmount = new Prisma.Decimal(input.monthlyAmount)
  if (input.employerShare !== undefined) data.employerShare = new Prisma.Decimal(input.employerShare)
  if (input.employeeShare !== undefined) data.employeeShare = new Prisma.Decimal(input.employeeShare)
  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new SavingsNotFoundError()
  }

  if (audit) {
    const changes: Record<string, unknown> = {}
    if (input.recipientIban !== undefined) changes.recipientIban = "[encrypted]"
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_savings",
      entityId: id,
      entityName: null,
      changes: Object.keys(changes).length > 0 ? changes : null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return decryptSavings(updated)
}

/**
 * Deletes an employee savings record.
 * Verifies the record exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new SavingsNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_savings",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
