/**
 * Calculation Rule Service
 *
 * Business logic for calculation rule operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./calculation-rule-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit Logging ---

const TRACKED_FIELDS = ["name", "code"]

// --- Error Classes ---

export class CalculationRuleNotFoundError extends Error {
  constructor(message = "Calculation rule not found") {
    super(message)
    this.name = "CalculationRuleNotFoundError"
  }
}

export class CalculationRuleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CalculationRuleValidationError"
  }
}

export class CalculationRuleConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CalculationRuleConflictError"
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
  const rule = await repo.findById(prisma, tenantId, id)
  if (!rule) {
    throw new CalculationRuleNotFoundError()
  }
  return rule
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    accountId?: string
    value?: number
    factor?: number
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new CalculationRuleValidationError(
      "Calculation rule code is required"
    )
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new CalculationRuleValidationError(
      "Calculation rule name is required"
    )
  }

  // Validate value
  const value = input.value ?? 0
  if (value < 0) {
    throw new CalculationRuleValidationError("Value must be >= 0")
  }

  // Validate factor -- default to 1.0 if 0, must be > 0
  let factor = input.factor ?? 1.0
  if (factor === 0) {
    factor = 1.0
  }
  if (factor < 0) {
    throw new CalculationRuleValidationError("Factor must be > 0")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new CalculationRuleConflictError(
      "Calculation rule code already exists"
    )
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    accountId: input.accountId || undefined,
    value,
    factor: new Prisma.Decimal(factor),
    isActive: true,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "calculation_rule",
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
    accountId?: string | null
    value?: number
    factor?: number
    isActive?: boolean
  },
  audit?: AuditContext
) {
  // Verify rule exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CalculationRuleNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new CalculationRuleValidationError(
        "Calculation rule name is required"
      )
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle accountId update (nullable -- null clears it)
  if (input.accountId !== undefined) {
    data.accountId = input.accountId
  }

  // Handle value update
  if (input.value !== undefined) {
    if (input.value < 0) {
      throw new CalculationRuleValidationError("Value must be >= 0")
    }
    data.value = input.value
  }

  // Handle factor update
  if (input.factor !== undefined) {
    if (input.factor <= 0) {
      throw new CalculationRuleValidationError("Factor must be > 0")
    }
    data.factor = new Prisma.Decimal(input.factor)
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "calculation_rule",
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
  // Verify rule exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CalculationRuleNotFoundError()
  }

  // Check usage in absence_types table
  const count = await repo.countAbsenceTypeUsages(prisma, id)
  if (count > 0) {
    throw new CalculationRuleValidationError(
      "Cannot delete calculation rule that is in use by absence types"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "calculation_rule",
      entityId: id, entityName: existing.name ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
