/**
 * Vacation Calculation Group Service
 *
 * Business logic for vacation calculation group operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./vacation-calc-group-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit Logging ---

const TRACKED_FIELDS = ["name"]

// --- Error Classes ---

export class VacationCalcGroupNotFoundError extends Error {
  constructor(message = "Vacation calculation group not found") {
    super(message)
    this.name = "VacationCalcGroupNotFoundError"
  }
}

export class VacationCalcGroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationCalcGroupValidationError"
  }
}

export class VacationCalcGroupConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationCalcGroupConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const item = await repo.findById(prisma, tenantId, id)
  if (!item) {
    throw new VacationCalcGroupNotFoundError()
  }
  return item
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    basis: string
    isActive: boolean
    specialCalculationIds?: string[]
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new VacationCalcGroupValidationError("Code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new VacationCalcGroupValidationError("Name is required")
  }

  // Check code uniqueness
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new VacationCalcGroupConflictError(
      "Calculation group code already exists"
    )
  }

  // Validate special calculation IDs
  if (input.specialCalculationIds && input.specialCalculationIds.length > 0) {
    const found = await repo.findSpecialCalculations(
      prisma,
      tenantId,
      input.specialCalculationIds
    )
    if (found.length !== input.specialCalculationIds.length) {
      throw new VacationCalcGroupValidationError(
        "One or more special calculation IDs are invalid"
      )
    }
  }

  const description = input.description?.trim() || null

  // Create group + junction entries in transaction
  const group = await repo.createWithLinks(
    prisma,
    {
      tenantId,
      code,
      name,
      description,
      basis: input.basis,
      isActive: input.isActive,
    },
    input.specialCalculationIds
  )

  // Re-fetch with includes
  const result = await repo.findById(prisma, tenantId, group.id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "vacation_calc_group",
      entityId: group.id, entityName: group.name ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result!
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    basis?: string
    isActive?: boolean
    specialCalculationIds?: string[]
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new VacationCalcGroupNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new VacationCalcGroupValidationError("Name is required")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }
  if (input.basis !== undefined) data.basis = input.basis
  if (input.isActive !== undefined) data.isActive = input.isActive

  // Validate special calculation IDs if provided
  if (
    input.specialCalculationIds !== undefined &&
    input.specialCalculationIds.length > 0
  ) {
    const found = await repo.findSpecialCalculations(
      prisma,
      tenantId,
      input.specialCalculationIds
    )
    if (found.length !== input.specialCalculationIds.length) {
      throw new VacationCalcGroupValidationError(
        "One or more special calculation IDs are invalid"
      )
    }
  }

  // Update group + replace junction entries in transaction
  await repo.updateWithLinks(
    prisma,
    tenantId,
    input.id,
    data,
    input.specialCalculationIds
  )

  // Re-fetch with includes
  const result = await repo.findById(prisma, tenantId, input.id)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>, TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "vacation_calc_group",
      entityId: input.id, entityName: result?.name ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdSimple(prisma, tenantId, id)
  if (!existing) {
    throw new VacationCalcGroupNotFoundError()
  }

  // Check usage in employment types
  const usageCount = await repo.countEmploymentTypeUsage(prisma, id)
  if (usageCount > 0) {
    throw new VacationCalcGroupValidationError(
      "Cannot delete calculation group that is assigned to employment types"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "vacation_calc_group",
      entityId: id, entityName: existing.name ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
