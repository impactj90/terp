/**
 * Vacation Special Calculation Service
 *
 * Business logic for vacation special calculation operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./vacation-special-calc-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit Logging ---

const TRACKED_FIELDS = ["name"]

// --- Error Classes ---

export class VacationSpecialCalcNotFoundError extends Error {
  constructor(message = "Vacation special calculation not found") {
    super(message)
    this.name = "VacationSpecialCalcNotFoundError"
  }
}

export class VacationSpecialCalcValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationSpecialCalcValidationError"
  }
}

export class VacationSpecialCalcConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationSpecialCalcConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; type?: string }
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
    throw new VacationSpecialCalcNotFoundError()
  }
  return item
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    type: string
    threshold: number
    bonusDays: number
    description?: string
    isActive: boolean
  },
  audit?: AuditContext
) {
  // Validate threshold vs type
  if (input.type === "disability" && input.threshold !== 0) {
    throw new VacationSpecialCalcValidationError(
      "Threshold must be 0 for disability type"
    )
  }

  if (
    (input.type === "age" || input.type === "tenure") &&
    input.threshold <= 0
  ) {
    throw new VacationSpecialCalcValidationError(
      `Threshold must be positive for ${input.type} type`
    )
  }

  // Check uniqueness by type + threshold
  const existing = await repo.findByTypeAndThreshold(
    prisma,
    tenantId,
    input.type,
    input.threshold
  )
  if (existing) {
    throw new VacationSpecialCalcConflictError(
      "A special calculation with this type and threshold already exists"
    )
  }

  const description = input.description?.trim() || null

  const created = await repo.create(prisma, {
    tenantId,
    type: input.type,
    threshold: input.threshold,
    bonusDays: new Prisma.Decimal(input.bonusDays),
    description,
    isActive: input.isActive,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "vacation_special_calc",
      entityId: created.id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    threshold?: number
    bonusDays?: number
    description?: string | null
    isActive?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new VacationSpecialCalcNotFoundError()
  }

  // Validate threshold against type
  if (input.threshold !== undefined) {
    if (existing.type === "disability" && input.threshold !== 0) {
      throw new VacationSpecialCalcValidationError(
        "Threshold must be 0 for disability type"
      )
    }
    if (
      (existing.type === "age" || existing.type === "tenure") &&
      input.threshold <= 0
    ) {
      throw new VacationSpecialCalcValidationError(
        `Threshold must be positive for ${existing.type} type`
      )
    }
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.threshold !== undefined) data.threshold = input.threshold
  if (input.bonusDays !== undefined)
    data.bonusDays = new Prisma.Decimal(input.bonusDays)
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }
  if (input.isActive !== undefined) data.isActive = input.isActive

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "vacation_special_calc",
      entityId: input.id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new VacationSpecialCalcNotFoundError()
  }

  // Check usage in calc groups
  const usageCount = await repo.countCalcGroupUsages(prisma, id)
  if (usageCount > 0) {
    throw new VacationSpecialCalcValidationError(
      "Cannot delete special calculation that is assigned to calculation groups"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "vacation_special_calc",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
