/**
 * Vacation Capping Rule Group Service
 *
 * Business logic for vacation capping rule group operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./vacation-capping-rule-group-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit Logging ---

const TRACKED_FIELDS = ["name"]

// --- Error Classes ---

export class VacationCappingRuleGroupNotFoundError extends Error {
  constructor(message = "Vacation capping rule group not found") {
    super(message)
    this.name = "VacationCappingRuleGroupNotFoundError"
  }
}

export class VacationCappingRuleGroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationCappingRuleGroupValidationError"
  }
}

export class VacationCappingRuleGroupConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationCappingRuleGroupConflictError"
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
    throw new VacationCappingRuleGroupNotFoundError()
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
    isActive: boolean
    cappingRuleIds?: string[]
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new VacationCappingRuleGroupValidationError("Code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new VacationCappingRuleGroupValidationError("Name is required")
  }

  // Check code uniqueness
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new VacationCappingRuleGroupConflictError(
      "Capping rule group code already exists"
    )
  }

  // Validate capping rule IDs
  if (input.cappingRuleIds && input.cappingRuleIds.length > 0) {
    const found = await repo.findCappingRules(prisma, tenantId, input.cappingRuleIds)
    if (found.length !== input.cappingRuleIds.length) {
      throw new VacationCappingRuleGroupValidationError(
        "One or more capping rule IDs are invalid"
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
      isActive: input.isActive,
    },
    input.cappingRuleIds
  )

  // Re-fetch with includes
  const result = await repo.findById(prisma, tenantId, group.id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "vacation_capping_rule_group",
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
    isActive?: boolean
    cappingRuleIds?: string[]
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new VacationCappingRuleGroupNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new VacationCappingRuleGroupValidationError("Name is required")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }
  if (input.isActive !== undefined) data.isActive = input.isActive

  // Validate capping rule IDs if provided
  if (
    input.cappingRuleIds !== undefined &&
    input.cappingRuleIds.length > 0
  ) {
    const found = await repo.findCappingRules(prisma, tenantId, input.cappingRuleIds)
    if (found.length !== input.cappingRuleIds.length) {
      throw new VacationCappingRuleGroupValidationError(
        "One or more capping rule IDs are invalid"
      )
    }
  }

  // Update group + replace junction entries in transaction
  await repo.updateWithLinks(prisma, tenantId, input.id, data, input.cappingRuleIds)

  // Re-fetch with includes
  const result = await repo.findById(prisma, tenantId, input.id)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>, TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "vacation_capping_rule_group",
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
    throw new VacationCappingRuleGroupNotFoundError()
  }

  // Check usage in tariffs
  const usageCount = await repo.countTariffUsage(prisma, tenantId, id)
  if (usageCount > 0) {
    throw new VacationCappingRuleGroupValidationError(
      "Cannot delete capping rule group that is assigned to tariffs"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "vacation_capping_rule_group",
      entityId: id, entityName: existing.name ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
