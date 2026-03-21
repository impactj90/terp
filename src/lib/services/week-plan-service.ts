/**
 * Week Plan Service
 *
 * Business logic for week plan operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./week-plan-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "code",
  "description",
  "mondayDayPlanId",
  "tuesdayDayPlanId",
  "wednesdayDayPlanId",
  "thursdayDayPlanId",
  "fridayDayPlanId",
  "saturdayDayPlanId",
  "sundayDayPlanId",
  "isActive",
]

// --- Error Classes ---

export class WeekPlanNotFoundError extends Error {
  constructor(message = "Week plan not found") {
    super(message)
    this.name = "WeekPlanNotFoundError"
  }
}

export class WeekPlanValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WeekPlanValidationError"
  }
}

export class WeekPlanConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WeekPlanConflictError"
  }
}

// --- Helpers ---

async function validateDayPlanIds(
  prisma: PrismaClient,
  tenantId: string,
  ids: (string | null | undefined)[]
): Promise<void> {
  const nonNullIds = ids.filter((id): id is string => !!id)
  if (nonNullIds.length === 0) return

  const uniqueIds = [...new Set(nonNullIds)]
  const found = await prisma.dayPlan.findMany({
    where: { id: { in: uniqueIds }, tenantId },
    select: { id: true },
  })
  if (found.length !== uniqueIds.length) {
    throw new WeekPlanValidationError("Invalid day plan reference")
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
  const plan = await repo.findById(prisma, tenantId, id)
  if (!plan) {
    throw new WeekPlanNotFoundError()
  }
  return plan
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    mondayDayPlanId: string
    tuesdayDayPlanId: string
    wednesdayDayPlanId: string
    thursdayDayPlanId: string
    fridayDayPlanId: string
    saturdayDayPlanId: string
    sundayDayPlanId: string
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new WeekPlanValidationError("Week plan code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new WeekPlanValidationError("Week plan name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new WeekPlanConflictError("Week plan code already exists")
  }

  // Validate all 7 day plan IDs reference existing day plans in same tenant
  await validateDayPlanIds(prisma, tenantId, [
    input.mondayDayPlanId,
    input.tuesdayDayPlanId,
    input.wednesdayDayPlanId,
    input.thursdayDayPlanId,
    input.fridayDayPlanId,
    input.saturdayDayPlanId,
    input.sundayDayPlanId,
  ])

  // Trim description
  const description = input.description?.trim() || null

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    mondayDayPlanId: input.mondayDayPlanId,
    tuesdayDayPlanId: input.tuesdayDayPlanId,
    wednesdayDayPlanId: input.wednesdayDayPlanId,
    thursdayDayPlanId: input.thursdayDayPlanId,
    fridayDayPlanId: input.fridayDayPlanId,
    saturdayDayPlanId: input.saturdayDayPlanId,
    sundayDayPlanId: input.sundayDayPlanId,
    isActive: true,
  })

  // Re-fetch with include
  const result = await repo.findByIdWithInclude(prisma, tenantId, created.id)
  if (!result) {
    throw new WeekPlanNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "week_plan",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    description?: string | null
    mondayDayPlanId?: string | null
    tuesdayDayPlanId?: string | null
    wednesdayDayPlanId?: string | null
    thursdayDayPlanId?: string | null
    fridayDayPlanId?: string | null
    saturdayDayPlanId?: string | null
    sundayDayPlanId?: string | null
    isActive?: boolean
  },
  audit?: AuditContext
) {
  // Verify week plan exists (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new WeekPlanNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new WeekPlanValidationError("Week plan code is required")
    }
    // Check uniqueness if changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new WeekPlanConflictError("Week plan code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new WeekPlanValidationError("Week plan name is required")
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle day plan ID updates and validate
  const dayPlanFields = [
    "mondayDayPlanId",
    "tuesdayDayPlanId",
    "wednesdayDayPlanId",
    "thursdayDayPlanId",
    "fridayDayPlanId",
    "saturdayDayPlanId",
    "sundayDayPlanId",
  ] as const

  const dayPlanIdsToValidate: (string | null | undefined)[] = []
  for (const field of dayPlanFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
      dayPlanIdsToValidate.push(input[field])
    }
  }

  // Validate any provided day plan IDs
  if (dayPlanIdsToValidate.length > 0) {
    await validateDayPlanIds(prisma, tenantId, dayPlanIdsToValidate)
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  await repo.update(prisma, tenantId, input.id, data)

  // Re-fetch with include to check completeness and return
  const updated = await repo.findByIdWithInclude(prisma, tenantId, input.id)
  if (!updated) {
    throw new WeekPlanNotFoundError()
  }

  // Verify completeness: all 7 days must have plans
  if (
    !updated.mondayDayPlanId ||
    !updated.tuesdayDayPlanId ||
    !updated.wednesdayDayPlanId ||
    !updated.thursdayDayPlanId ||
    !updated.fridayDayPlanId ||
    !updated.saturdayDayPlanId ||
    !updated.sundayDayPlanId
  ) {
    throw new WeekPlanValidationError(
      "Week plan must have a day plan assigned for all 7 days"
    )
  }

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
      entityType: "week_plan",
      entityId: input.id,
      entityName: updated.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
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
  // Verify week plan exists (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, id)
  if (!existing) {
    throw new WeekPlanNotFoundError()
  }

  // Hard delete
  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "week_plan",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
