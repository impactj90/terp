/**
 * Booking Type Service
 *
 * Business logic for booking type operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./booking-type-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "code",
  "direction",
  "isActive",
  "isSystem",
]

// --- Constants ---

const VALID_DIRECTIONS = ["in", "out"] as const
const VALID_CATEGORIES = ["work", "break", "business_trip", "other"] as const

// --- Error Classes ---

export class BookingTypeNotFoundError extends Error {
  constructor(message = "Booking type not found") {
    super(message)
    this.name = "BookingTypeNotFoundError"
  }
}

export class BookingTypeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookingTypeValidationError"
  }
}

export class BookingTypeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookingTypeConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; direction?: string }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const bt = await repo.findById(prisma, tenantId, id)
  if (!bt) {
    throw new BookingTypeNotFoundError()
  }
  return bt
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    direction: string
    category?: string
    accountId?: string
    requiresReason?: boolean
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new BookingTypeValidationError("Booking type code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new BookingTypeValidationError("Booking type name is required")
  }

  // Validate direction
  const direction = input.direction.trim()
  if (
    !VALID_DIRECTIONS.includes(direction as (typeof VALID_DIRECTIONS)[number])
  ) {
    throw new BookingTypeValidationError(
      `Direction must be one of: ${VALID_DIRECTIONS.join(", ")}`
    )
  }

  // Validate category
  const category = input.category?.trim() || "work"
  if (
    !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])
  ) {
    throw new BookingTypeValidationError(
      `Category must be one of: ${VALID_CATEGORIES.join(", ")}`
    )
  }

  // Check code uniqueness within tenant (not system types)
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new BookingTypeConflictError("Booking type code already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    direction,
    category,
    accountId: input.accountId || undefined,
    requiresReason: input.requiresReason ?? false,
    isSystem: false,
    isActive: true,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "booking_type",
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
    isActive?: boolean
    category?: string
    accountId?: string | null
    requiresReason?: boolean
  },
  audit?: AuditContext
) {
  // Verify booking type exists
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new BookingTypeNotFoundError()
  }

  // Block modification of system types
  if (existing.isSystem) {
    throw new BookingTypeValidationError(
      "Cannot modify system booking types"
    )
  }

  // Verify tenant ownership
  if (existing.tenantId !== tenantId) {
    throw new BookingTypeNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new BookingTypeValidationError("Booking type name is required")
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

  // Handle category update
  if (input.category !== undefined) {
    if (
      !VALID_CATEGORIES.includes(
        input.category as (typeof VALID_CATEGORIES)[number]
      )
    ) {
      throw new BookingTypeValidationError(
        `Category must be one of: ${VALID_CATEGORIES.join(", ")}`
      )
    }
    data.category = input.category
  }

  // Handle accountId update (nullable -- null clears it)
  if (input.accountId !== undefined) {
    data.accountId = input.accountId
  }

  // Handle requiresReason update
  if (input.requiresReason !== undefined) {
    data.requiresReason = input.requiresReason
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
      entityType: "booking_type",
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
  // Verify booking type exists
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new BookingTypeNotFoundError()
  }

  // Block deletion of system types
  if (existing.isSystem) {
    throw new BookingTypeValidationError(
      "Cannot delete system booking types"
    )
  }

  // Verify tenant ownership
  if (existing.tenantId !== tenantId) {
    throw new BookingTypeNotFoundError()
  }

  // Check usage in bookings table
  const bookingCount = await repo.countBookingsByType(prisma, tenantId, id)
  if (bookingCount > 0) {
    throw new BookingTypeValidationError(
      "Cannot delete booking type that is in use"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "booking_type",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
