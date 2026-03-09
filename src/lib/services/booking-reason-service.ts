/**
 * Booking Reason Service
 *
 * Business logic for booking reason operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./booking-reason-repository"

// --- Constants ---

const VALID_REFERENCE_TIMES = ["plan_start", "plan_end", "booking_time"] as const

// --- Error Classes ---

export class BookingReasonNotFoundError extends Error {
  constructor(message = "Booking reason not found") {
    super(message)
    this.name = "BookingReasonNotFoundError"
  }
}

export class BookingReasonValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookingReasonValidationError"
  }
}

export class BookingReasonConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookingReasonConflictError"
  }
}

// --- Helpers ---

/**
 * Validates that reference_time and offset_minutes are consistently set.
 * Both must be set or both must be null.
 */
function validateAdjustmentFields(
  referenceTime: string | null | undefined,
  offsetMinutes: number | null | undefined
): void {
  const hasRef = referenceTime !== null && referenceTime !== undefined
  const hasOffset = offsetMinutes !== null && offsetMinutes !== undefined
  if (hasRef !== hasOffset) {
    throw new BookingReasonValidationError(
      "reference_time and offset_minutes must both be set or both be null"
    )
  }
  if (hasRef) {
    if (
      !VALID_REFERENCE_TIMES.includes(
        referenceTime as (typeof VALID_REFERENCE_TIMES)[number]
      )
    ) {
      throw new BookingReasonValidationError(
        `reference_time must be one of: ${VALID_REFERENCE_TIMES.join(", ")}`
      )
    }
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { bookingTypeId?: string }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const reason = await repo.findById(prisma, tenantId, id)
  if (!reason) {
    throw new BookingReasonNotFoundError()
  }
  return reason
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    bookingTypeId: string
    code: string
    label: string
    sortOrder?: number
    referenceTime?: string
    offsetMinutes?: number
    adjustmentBookingTypeId?: string
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new BookingReasonValidationError("Booking reason code is required")
  }

  // Trim and validate label
  const label = input.label.trim()
  if (label.length === 0) {
    throw new BookingReasonValidationError("Booking reason label is required")
  }

  // Validate adjustment fields consistency
  validateAdjustmentFields(
    input.referenceTime ?? null,
    input.offsetMinutes ?? null
  )

  // Check code uniqueness within (tenantId, bookingTypeId)
  const existingByCode = await repo.findByCode(
    prisma,
    tenantId,
    input.bookingTypeId,
    code
  )
  if (existingByCode) {
    throw new BookingReasonConflictError(
      "Booking reason code already exists for this booking type"
    )
  }

  // Create booking reason -- always isActive: true
  return repo.create(prisma, {
    tenantId,
    bookingTypeId: input.bookingTypeId,
    code,
    label,
    isActive: true,
    sortOrder: input.sortOrder ?? 0,
    referenceTime: input.referenceTime || null,
    offsetMinutes: input.offsetMinutes ?? null,
    adjustmentBookingTypeId: input.adjustmentBookingTypeId || null,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    label?: string
    isActive?: boolean
    sortOrder?: number
    referenceTime?: string | null
    offsetMinutes?: number | null
    adjustmentBookingTypeId?: string | null
    clearAdjustment?: boolean
  }
) {
  // Verify reason exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new BookingReasonNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle label update
  if (input.label !== undefined) {
    const label = input.label.trim()
    if (label.length === 0) {
      throw new BookingReasonValidationError(
        "Booking reason label is required"
      )
    }
    data.label = label
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // Handle sortOrder update
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
  }

  // Handle clearAdjustment flag -- clears all three adjustment fields
  if (input.clearAdjustment) {
    data.referenceTime = null
    data.offsetMinutes = null
    data.adjustmentBookingTypeId = null
  } else {
    // Handle individual adjustment field updates
    if (input.referenceTime !== undefined) {
      data.referenceTime = input.referenceTime
    }
    if (input.offsetMinutes !== undefined) {
      data.offsetMinutes = input.offsetMinutes
    }
    if (input.adjustmentBookingTypeId !== undefined) {
      data.adjustmentBookingTypeId = input.adjustmentBookingTypeId
    }
  }

  // Re-validate adjustment consistency after building update data
  // Merge existing values with update values to check final state
  const finalRefTime =
    "referenceTime" in data
      ? (data.referenceTime as string | null)
      : existing.referenceTime
  const finalOffset =
    "offsetMinutes" in data
      ? (data.offsetMinutes as number | null)
      : existing.offsetMinutes
  validateAdjustmentFields(finalRefTime, finalOffset)

  return repo.update(prisma, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify reason exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new BookingReasonNotFoundError()
  }

  // Hard delete
  await repo.deleteById(prisma, id)
}
