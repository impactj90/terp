/**
 * Shift Service
 *
 * Business logic for shift operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./shift-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "code",
  "startTime",
  "endTime",
]

// --- Error Classes ---

export class ShiftNotFoundError extends Error {
  constructor(message = "Shift not found") {
    super(message)
    this.name = "ShiftNotFoundError"
  }
}

export class ShiftValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ShiftValidationError"
  }
}

export class ShiftConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ShiftConflictError"
  }
}

// --- Service Functions ---

export async function list(prisma: PrismaClient, tenantId: string) {
  return repo.findMany(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const shift = await repo.findById(prisma, tenantId, id)
  if (!shift) {
    throw new ShiftNotFoundError()
  }
  return shift
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    dayPlanId?: string
    color?: string
    qualification?: string
    sortOrder?: number
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new ShiftValidationError("Shift code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new ShiftValidationError("Shift name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new ShiftConflictError("Shift code already exists")
  }

  // Validate dayPlanId FK if provided
  if (input.dayPlanId) {
    const dp = await repo.findDayPlan(prisma, tenantId, input.dayPlanId)
    if (!dp) {
      throw new ShiftValidationError("Invalid day plan reference")
    }
  }

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description: input.description?.trim() || null,
    dayPlanId: input.dayPlanId || null,
    color: input.color || null,
    qualification: input.qualification || null,
    isActive: true,
    sortOrder: input.sortOrder ?? 0,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "shift",
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
    name?: string
    description?: string | null
    dayPlanId?: string | null
    color?: string | null
    qualification?: string | null
    isActive?: boolean
    sortOrder?: number
  },
  audit?: AuditContext
) {
  // Verify shift exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new ShiftNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new ShiftValidationError("Shift name is required")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  if (input.dayPlanId !== undefined) {
    if (input.dayPlanId === null) {
      data.dayPlanId = null
    } else {
      const dp = await repo.findDayPlan(prisma, tenantId, input.dayPlanId)
      if (!dp) {
        throw new ShiftValidationError("Invalid day plan reference")
      }
      data.dayPlanId = input.dayPlanId
    }
  }

  if (input.color !== undefined) {
    data.color = input.color
  }

  if (input.qualification !== undefined) {
    data.qualification = input.qualification
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
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
      entityType: "shift",
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
  // Verify shift exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ShiftNotFoundError()
  }

  // Check if shift is in use via employee_day_plans
  const dayPlanCount = await repo.countEmployeeDayPlanUsages(prisma, id)

  // Check shift_assignments
  const assignmentCount = await repo.countShiftAssignmentUsages(prisma, id)

  if (dayPlanCount > 0 || assignmentCount > 0) {
    throw new ShiftValidationError("Cannot delete shift that is in use")
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "shift",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
