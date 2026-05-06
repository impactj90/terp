/**
 * Activity Service
 *
 * Business logic for activity operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./activity-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "code",
  "name",
  "description",
  "isActive",
  // NK-1 Pricing fields (Decision 7, Decision 29)
  "pricingType",
  "flatRate",
  "hourlyRate",
  "unit",
  "calculatedHourEquivalent",
]

export type ActivityPricingTypeInput = "HOURLY" | "FLAT_RATE" | "PER_UNIT"

/**
 * Validate Activity pricing fields against `pricingType` (NK-1, Decision 7).
 *
 * Rules:
 * - FLAT_RATE → `flatRate` is required (>= 0)
 * - PER_UNIT  → `unit` is required
 * - HOURLY    → `hourlyRate` is OPTIONAL (lookup-resolver fallback path)
 * - all numeric rates must be >= 0 when set
 * - calculatedHourEquivalent must be > 0 when set
 *
 * Throws ActivityValidationError on any violation.
 */
export function validatePricing(input: {
  pricingType?: ActivityPricingTypeInput
  flatRate?: number | null
  hourlyRate?: number | null
  unit?: string | null
  calculatedHourEquivalent?: number | null
}) {
  const pt = input.pricingType ?? "HOURLY"
  if (pt === "FLAT_RATE") {
    if (input.flatRate == null) {
      throw new ActivityValidationError(
        "FLAT_RATE-Aktivität benötigt flatRate",
      )
    }
  }
  if (pt === "PER_UNIT") {
    if (input.unit == null || input.unit.trim().length === 0) {
      throw new ActivityValidationError(
        "PER_UNIT-Aktivität benötigt unit",
      )
    }
  }
  if (input.flatRate != null && input.flatRate < 0) {
    throw new ActivityValidationError("flatRate must be >= 0")
  }
  if (input.hourlyRate != null && input.hourlyRate < 0) {
    throw new ActivityValidationError("hourlyRate must be >= 0")
  }
  if (
    input.calculatedHourEquivalent != null &&
    input.calculatedHourEquivalent <= 0
  ) {
    throw new ActivityValidationError(
      "calculatedHourEquivalent must be > 0 when set",
    )
  }
}

// --- Error Classes ---

export class ActivityNotFoundError extends Error {
  constructor(message = "Activity not found") {
    super(message)
    this.name = "ActivityNotFoundError"
  }
}

export class ActivityValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ActivityValidationError"
  }
}

export class ActivityConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ActivityConflictError"
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
  const activity = await repo.findById(prisma, tenantId, id)
  if (!activity) {
    throw new ActivityNotFoundError()
  }
  return activity
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    // NK-1 Pricing fields (Decision 7, Decision 29)
    pricingType?: ActivityPricingTypeInput
    flatRate?: number | null
    hourlyRate?: number | null
    unit?: string | null
    calculatedHourEquivalent?: number | null
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new ActivityValidationError("Activity code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new ActivityValidationError("Activity name is required")
  }

  // Validate pricing block
  validatePricing(input)

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new ActivityConflictError("Activity code already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    isActive: true,
    pricingType: input.pricingType ?? "HOURLY",
    flatRate: input.flatRate ?? null,
    hourlyRate: input.hourlyRate ?? null,
    unit: input.unit?.trim() || null,
    calculatedHourEquivalent: input.calculatedHourEquivalent ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "activity",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    description?: string | null
    isActive?: boolean
    // NK-1-FIX-FORM-1 (closing-pass-followup 2026-05-06): pricing fields
    // are accepted in the same payload now. The router still gates
    // pricing changes behind `activities.manage_pricing` permission per
    // Decision 29 — at this service layer we just persist what we get.
    pricingType?: ActivityPricingTypeInput
    flatRate?: number | null
    hourlyRate?: number | null
    unit?: string | null
    calculatedHourEquivalent?: number | null
  },
  audit?: AuditContext
) {
  // Verify activity exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new ActivityNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new ActivityValidationError("Activity code is required")
    }
    // Check uniqueness only if code actually changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new ActivityConflictError("Activity code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new ActivityValidationError("Activity name is required")
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // NK-1-FIX-FORM-1: handle pricing fields in the same atomic update.
  // Cross-field validation merges the new values with the existing record
  // so users can patch a subset of fields without losing the others.
  const hasPricingChange =
    input.pricingType !== undefined ||
    input.flatRate !== undefined ||
    input.hourlyRate !== undefined ||
    input.unit !== undefined ||
    input.calculatedHourEquivalent !== undefined
  if (hasPricingChange) {
    const merged: {
      pricingType: ActivityPricingTypeInput
      flatRate: number | null
      hourlyRate: number | null
      unit: string | null
      calculatedHourEquivalent: number | null
    } = {
      pricingType:
        input.pricingType ??
        (existing.pricingType as ActivityPricingTypeInput),
      flatRate:
        input.flatRate !== undefined
          ? input.flatRate
          : existing.flatRate == null
            ? null
            : Number(existing.flatRate),
      hourlyRate:
        input.hourlyRate !== undefined
          ? input.hourlyRate
          : existing.hourlyRate == null
            ? null
            : Number(existing.hourlyRate),
      unit: input.unit !== undefined ? input.unit : existing.unit,
      calculatedHourEquivalent:
        input.calculatedHourEquivalent !== undefined
          ? input.calculatedHourEquivalent
          : existing.calculatedHourEquivalent == null
            ? null
            : Number(existing.calculatedHourEquivalent),
    }
    validatePricing(merged)
    if (input.pricingType !== undefined) data.pricingType = input.pricingType
    if (input.flatRate !== undefined) data.flatRate = input.flatRate
    if (input.hourlyRate !== undefined) data.hourlyRate = input.hourlyRate
    if (input.unit !== undefined) {
      data.unit = input.unit === null ? null : input.unit.trim() || null
    }
    if (input.calculatedHourEquivalent !== undefined) {
      data.calculatedHourEquivalent = input.calculatedHourEquivalent
    }
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "activity",
      entityId: input.id,
      entityName: updated.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

/**
 * Update Activity pricing fields only (NK-1, Decision 29).
 *
 * Gated by `activities.manage_pricing` at the router layer; the service
 * accepts the input as long as it validates against `validatePricing`.
 *
 * Existing CRUD `update` does NOT touch pricing fields.
 */
export async function updatePricing(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    pricingType?: ActivityPricingTypeInput
    flatRate?: number | null
    hourlyRate?: number | null
    unit?: string | null
    calculatedHourEquivalent?: number | null
  },
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new ActivityNotFoundError()
  }

  // Merge with existing values for cross-field validation. The user
  // may only patch a subset of pricing fields; the existing record
  // determines defaults.
  const merged: {
    pricingType: ActivityPricingTypeInput
    flatRate: number | null
    hourlyRate: number | null
    unit: string | null
    calculatedHourEquivalent: number | null
  } = {
    pricingType:
      input.pricingType ?? (existing.pricingType as ActivityPricingTypeInput),
    flatRate:
      input.flatRate !== undefined
        ? input.flatRate
        : existing.flatRate == null
          ? null
          : Number(existing.flatRate),
    hourlyRate:
      input.hourlyRate !== undefined
        ? input.hourlyRate
        : existing.hourlyRate == null
          ? null
          : Number(existing.hourlyRate),
    unit: input.unit !== undefined ? input.unit : existing.unit,
    calculatedHourEquivalent:
      input.calculatedHourEquivalent !== undefined
        ? input.calculatedHourEquivalent
        : existing.calculatedHourEquivalent == null
          ? null
          : Number(existing.calculatedHourEquivalent),
  }

  validatePricing(merged)

  const data: Record<string, unknown> = {}
  if (input.pricingType !== undefined) data.pricingType = input.pricingType
  if (input.flatRate !== undefined) data.flatRate = input.flatRate
  if (input.hourlyRate !== undefined) data.hourlyRate = input.hourlyRate
  if (input.unit !== undefined) {
    data.unit = input.unit === null ? null : input.unit.trim() || null
  }
  if (input.calculatedHourEquivalent !== undefined) {
    data.calculatedHourEquivalent = input.calculatedHourEquivalent
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS,
    )
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update_pricing",
        entityType: "activity",
        entityId: input.id,
        entityName: updated.name ?? null,
        changes,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // Verify activity exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ActivityNotFoundError()
  }

  // Check for employees with defaultActivityId
  const employeeCount = await repo.countEmployees(prisma, tenantId, id)
  if (employeeCount > 0) {
    throw new ActivityValidationError(
      "Cannot delete activity with assigned employees"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "activity",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
