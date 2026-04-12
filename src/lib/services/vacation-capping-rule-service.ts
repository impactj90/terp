/**
 * Vacation Capping Rule Service
 *
 * Business logic for vacation capping rule operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./vacation-capping-rule-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit Logging ---

const TRACKED_FIELDS = ["name"]

// --- Error Classes ---

export class VacationCappingRuleNotFoundError extends Error {
  constructor(message = "Vacation capping rule not found") {
    super(message)
    this.name = "VacationCappingRuleNotFoundError"
  }
}

export class VacationCappingRuleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationCappingRuleValidationError"
  }
}

export class VacationCappingRuleConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationCappingRuleConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; ruleType?: string }
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
    throw new VacationCappingRuleNotFoundError()
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
    ruleType: string
    cutoffMonth: number
    cutoffDay: number
    capValue: number
    isActive: boolean
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new VacationCappingRuleValidationError("Code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new VacationCappingRuleValidationError("Name is required")
  }

  // Check code uniqueness
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new VacationCappingRuleConflictError(
      "Capping rule code already exists"
    )
  }

  const description = input.description?.trim() || null

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    ruleType: input.ruleType,
    cutoffMonth: input.cutoffMonth,
    cutoffDay: input.cutoffDay,
    capValue: new Prisma.Decimal(input.capValue),
    isActive: input.isActive,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "vacation_capping_rule",
      entityId: created.id, entityName: created.name ?? null, changes: null,
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
    name?: string
    description?: string | null
    ruleType?: string
    cutoffMonth?: number
    cutoffDay?: number
    capValue?: number
    isActive?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new VacationCappingRuleNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new VacationCappingRuleValidationError("Name is required")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }
  if (input.ruleType !== undefined) data.ruleType = input.ruleType
  if (input.cutoffMonth !== undefined) data.cutoffMonth = input.cutoffMonth
  if (input.cutoffDay !== undefined) data.cutoffDay = input.cutoffDay
  if (input.capValue !== undefined)
    data.capValue = new Prisma.Decimal(input.capValue)
  if (input.isActive !== undefined) data.isActive = input.isActive

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "vacation_capping_rule",
      entityId: input.id, entityName: updated.name ?? null, changes,
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
    throw new VacationCappingRuleNotFoundError()
  }

  // Check usage in capping rule groups
  const usageCount = await repo.countGroupRuleUsages(prisma, tenantId, id)
  if (usageCount > 0) {
    throw new VacationCappingRuleValidationError(
      "Cannot delete capping rule that is assigned to capping rule groups"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "vacation_capping_rule",
      entityId: id, entityName: existing.name ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
