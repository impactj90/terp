/**
 * Employee Garnishments Service
 *
 * Business logic for employee garnishment operations.
 * Delegates data access to the repository layer.
 * creditorName and fileReference are encrypted at rest.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employee-garnishments-repository"
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

export class GarnishmentNotFoundError extends Error {
  constructor() {
    super("Garnishment not found")
    this.name = "GarnishmentNotFoundError"
  }
}

export class GarnishmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GarnishmentValidationError"
  }
}

// --- Helpers ---

function decryptGarnishment<T extends { creditorName: string | null; fileReference: string | null }>(record: T): T {
  const result = { ...record }
  if (result.creditorName) {
    result.creditorName = decryptField(result.creditorName)
  }
  if (result.fileReference) {
    result.fileReference = decryptField(result.fileReference)
  }
  return result
}

// --- Service Functions ---

/**
 * Lists garnishments for an employee.
 * Verifies employee belongs to tenant.
 * Decrypts creditorName and fileReference after read.
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
  return records.map(decryptGarnishment)
}

/**
 * Creates a new garnishment for an employee.
 * Verifies employee belongs to tenant.
 * Encrypts creditorName and fileReference before write.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    creditorName: string
    creditorAddress?: string | null
    fileReference?: string | null
    garnishmentAmount: number
    calculationMethod: string
    dependentsCount?: number
    rank?: number
    isPAccount?: boolean
    maintenanceObligation?: boolean
    startDate: Date
    endDate?: Date | null
    attachmentFileId?: string | null
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
    creditorName: encryptField(input.creditorName.trim()),
    creditorAddress: input.creditorAddress?.trim() || null,
    fileReference: input.fileReference ? encryptField(input.fileReference.trim()) : null,
    garnishmentAmount: new Prisma.Decimal(input.garnishmentAmount),
    calculationMethod: input.calculationMethod.trim(),
    dependentsCount: input.dependentsCount ?? 0,
    rank: input.rank ?? 1,
    isPAccount: input.isPAccount ?? false,
    maintenanceObligation: input.maintenanceObligation ?? false,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    attachmentFileId: input.attachmentFileId ?? null,
    notes: input.notes?.trim() || null,
  })

  if (audit) {
    const changes: Record<string, unknown> = {}
    if (input.creditorName) changes.creditorName = "[encrypted]"
    if (input.fileReference) changes.fileReference = "[encrypted]"
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_garnishment",
      entityId: created.id,
      entityName: null,
      changes: Object.keys(changes).length > 0 ? changes : null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return decryptGarnishment(created)
}

/**
 * Updates an employee garnishment.
 * Verifies the garnishment exists and belongs to tenant.
 * Encrypts creditorName and fileReference before write, decrypts after read.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    creditorName?: string
    creditorAddress?: string | null
    fileReference?: string | null
    garnishmentAmount?: number
    calculationMethod?: string
    dependentsCount?: number
    rank?: number
    isPAccount?: boolean
    maintenanceObligation?: boolean
    startDate?: Date
    endDate?: Date | null
    attachmentFileId?: string | null
    notes?: string | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new GarnishmentNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.creditorName !== undefined) data.creditorName = encryptField(input.creditorName.trim())
  if (input.creditorAddress !== undefined) data.creditorAddress = input.creditorAddress === null ? null : input.creditorAddress.trim()
  if (input.fileReference !== undefined) data.fileReference = input.fileReference === null ? null : encryptField(input.fileReference.trim())
  if (input.garnishmentAmount !== undefined) data.garnishmentAmount = new Prisma.Decimal(input.garnishmentAmount)
  if (input.calculationMethod !== undefined) data.calculationMethod = input.calculationMethod.trim()
  if (input.dependentsCount !== undefined) data.dependentsCount = input.dependentsCount
  if (input.rank !== undefined) data.rank = input.rank
  if (input.isPAccount !== undefined) data.isPAccount = input.isPAccount
  if (input.maintenanceObligation !== undefined) data.maintenanceObligation = input.maintenanceObligation
  if (input.startDate !== undefined) data.startDate = input.startDate
  if (input.endDate !== undefined) data.endDate = input.endDate
  if (input.attachmentFileId !== undefined) data.attachmentFileId = input.attachmentFileId
  if (input.notes !== undefined) data.notes = input.notes === null ? null : input.notes.trim()

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new GarnishmentNotFoundError()
  }

  if (audit) {
    const changes: Record<string, unknown> = {}
    if (input.creditorName !== undefined) changes.creditorName = "[encrypted]"
    if (input.fileReference !== undefined) changes.fileReference = "[encrypted]"
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_garnishment",
      entityId: id,
      entityName: null,
      changes: Object.keys(changes).length > 0 ? changes : null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return decryptGarnishment(updated)
}

/**
 * Deletes an employee garnishment.
 * Verifies the garnishment exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new GarnishmentNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_garnishment",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
