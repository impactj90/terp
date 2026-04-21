/**
 * Bookings Service
 *
 * Business logic for booking operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 *
 * Orchestrates: validation, data scope enforcement, derived booking creation,
 * and recalculation triggers after mutations.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./bookings-repository"
import type { DataScopeFilter } from "./bookings-repository"
import * as monthlyValuesRepo from "./monthly-values-repository"
import * as overtimeRequestRepo from "./overtime-request-repository"
import * as overtimeRequestConfigService from "./overtime-request-config-service"
import { RecalcService } from "./recalc"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Constants ---

const MAX_TIME_MINUTES = 1439 // 23:59

// --- Error Classes ---

export class BookingNotFoundError extends Error {
  constructor(message = "Booking not found") {
    super(message)
    this.name = "BookingNotFoundError"
  }
}

export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookingValidationError"
  }
}

export class BookingForbiddenError extends Error {
  constructor(message = "Booking not within data scope") {
    super(message)
    this.name = "BookingForbiddenError"
  }
}

export class BookingConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookingConflictError"
  }
}

// --- Helper Functions ---

/**
 * Converts HH:MM time string to minutes from midnight.
 */
function parseTimeString(time: string): number {
  const [hoursStr, minutesStr] = time.split(":")
  const hours = parseInt(hoursStr!, 10)
  const minutes = parseInt(minutesStr!, 10)
  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new BookingValidationError(
      "Invalid time format, expected HH:MM (00:00 - 23:59)"
    )
  }
  return hours * 60 + minutes
}

/**
 * Validates that minutes from midnight is within valid range.
 */
function validateTime(minutes: number): void {
  if (minutes < 0 || minutes > MAX_TIME_MINUTES) {
    throw new BookingValidationError(
      `Time must be between 0 and ${MAX_TIME_MINUTES} minutes (00:00 - 23:59)`
    )
  }
}

/**
 * Checks that a booking falls within the user's data scope.
 * Throws BookingForbiddenError if not.
 */
function checkBookingDataScope(
  dataScope: DataScopeFilter,
  booking: {
    employeeId: string
    employee?: { departmentId: string | null } | null
  }
): void {
  if (dataScope.type === "department") {
    if (
      !booking.employee?.departmentId ||
      !dataScope.departmentIds.includes(booking.employee.departmentId)
    ) {
      throw new BookingForbiddenError()
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(booking.employeeId)) {
      throw new BookingForbiddenError()
    }
  }
}

/**
 * Asserts that the month for the given booking date is not closed.
 * Throws BookingConflictError if the month has been closed in MonthlyValues.
 */
async function assertMonthNotClosed(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  bookingDate: Date
): Promise<void> {
  const year = bookingDate.getUTCFullYear()
  const month = bookingDate.getUTCMonth() + 1
  const mv = await monthlyValuesRepo.findByEmployeeYearMonth(
    prisma,
    tenantId,
    employeeId,
    year,
    month
  )
  if (mv?.isClosed) {
    throw new BookingConflictError(
      `Der Monat ${month.toString().padStart(2, "0")}/${year} ist abgeschlossen. Buchungen können nicht mehr verändert werden.`
    )
  }
}

// --- Derived Booking Logic ---

/**
 * Resolves the reference time for derived booking creation.
 * Port of Go resolveReferenceTime (service/booking.go:372-412).
 */
async function resolveReferenceTime(
  prisma: PrismaClient,
  tenantId: string,
  reason: {
    referenceTime: string | null
    offsetMinutes: number | null
  },
  original: {
    employeeId: string
    bookingDate: Date
    editedTime: number
  }
): Promise<number | null> {
  if (!reason.referenceTime) return null

  switch (reason.referenceTime) {
    case "booking_time":
      return original.editedTime

    case "plan_start": {
      const edp = await repo.findEmployeeDayPlan(
        prisma,
        tenantId,
        original.employeeId,
        original.bookingDate
      )
      if (!edp?.dayPlan?.comeFrom) return original.editedTime // Fallback
      return edp.dayPlan.comeFrom
    }

    case "plan_end": {
      const edp = await repo.findEmployeeDayPlan(
        prisma,
        tenantId,
        original.employeeId,
        original.bookingDate
      )
      if (!edp?.dayPlan?.goFrom) return original.editedTime // Fallback
      return edp.dayPlan.goFrom
    }

    default:
      return null
  }
}

/**
 * Creates a derived booking if the original booking's reason has adjustment config.
 * Port of Go createDerivedBookingIfNeeded (service/booking.go:304-368).
 *
 * Best-effort: errors are logged but do not fail the original booking.
 */
async function createDerivedBookingIfNeeded(
  prisma: PrismaClient,
  original: {
    id: string
    tenantId: string
    employeeId: string
    bookingDate: Date
    bookingTypeId: string
    editedTime: number
    bookingReasonId: string | null
  },
  createdBy: string | null
): Promise<void> {
  if (!original.bookingReasonId) return

  // Load reason with adjustment fields
  const reason = await repo.findBookingReason(
    prisma,
    original.tenantId,
    original.bookingReasonId
  )
  if (!reason) return
  if (!reason.referenceTime || reason.offsetMinutes === null) return // No adjustment configured

  // Resolve reference time
  const refMinutes = await resolveReferenceTime(prisma, original.tenantId, reason, original)
  if (refMinutes === null) return

  // Calculate derived time = reference + offset, clamped to 0-1439
  let derivedTime = refMinutes + reason.offsetMinutes
  if (derivedTime < 0) derivedTime = 0
  if (derivedTime > MAX_TIME_MINUTES) derivedTime = MAX_TIME_MINUTES

  // Determine derived booking type
  const derivedBookingTypeId =
    reason.adjustmentBookingTypeId || original.bookingTypeId

  // Idempotent check-then-create inside a transaction to prevent duplicate derived bookings
  await prisma.$transaction(async (tx) => {
    const existingDerived = await repo.findDerivedByOriginalId(
      tx as PrismaClient,
      original.tenantId,
      original.id
    )

    if (existingDerived) {
      // Update existing derived booking
      await repo.updateDerived(tx as PrismaClient, original.tenantId, existingDerived.id, {
        editedTime: derivedTime,
        originalTime: derivedTime,
        bookingTypeId: derivedBookingTypeId,
        calculatedTime: null,
      })
      return
    }

    // Create new derived booking
    await repo.createDerived(tx as PrismaClient, {
      tenantId: original.tenantId,
      employeeId: original.employeeId,
      bookingDate: original.bookingDate,
      bookingTypeId: derivedBookingTypeId,
      originalTime: derivedTime,
      editedTime: derivedTime,
      source: "derived",
      isAutoGenerated: true,
      originalBookingId: original.id,
      bookingReasonId: original.bookingReasonId,
      notes: `Auto-generated from reason: ${reason.code}`,
      createdBy: createdBy,
      updatedBy: createdBy,
    })
  })
}

// --- Recalculation Helper ---

/**
 * Triggers recalculation for a specific employee/day.
 * Best effort -- errors are logged but do not fail the parent operation.
 */
async function triggerRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  bookingDate: Date
): Promise<void> {
  try {
    const service = new RecalcService(prisma, undefined, undefined, tenantId)
    await service.triggerRecalc(tenantId, employeeId, bookingDate)
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${bookingDate.toISOString().split("T")[0]}:`,
      error
    )
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    page: number
    pageSize: number
    employeeId?: string
    fromDate?: string
    toDate?: string
    bookingTypeId?: string
    source?: string
    dataScope: DataScopeFilter
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope: DataScopeFilter
) {
  const booking = await repo.findById(prisma, tenantId, id)
  if (!booking) {
    throw new BookingNotFoundError()
  }

  // Check data scope after fetch
  checkBookingDataScope(dataScope, booking)

  return booking
}

export async function createBooking(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    bookingTypeId: string
    bookingDate: string
    time: string
    notes?: string
    bookingReasonId?: string
  },
  dataScope: DataScopeFilter,
  userId: string,
  audit: AuditContext
) {
  // Parse and validate time
  const minutes = parseTimeString(input.time)
  validateTime(minutes)

  // Validate employee exists in tenant and is within data scope
  const employee = await repo.findEmployeeById(
    prisma,
    tenantId,
    input.employeeId
  )
  if (!employee) {
    throw new BookingNotFoundError("Employee not found")
  }
  checkBookingDataScope(dataScope, {
    employeeId: employee.id,
    employee,
  })

  // Validate booking type exists and is accessible by tenant
  const bookingType = await repo.findBookingType(
    prisma,
    tenantId,
    input.bookingTypeId
  )
  if (!bookingType) {
    throw new BookingValidationError("Invalid booking type")
  }

  // Validate booking reason if provided
  if (input.bookingReasonId) {
    const reason = await repo.findBookingReason(
      prisma,
      tenantId,
      input.bookingReasonId
    )
    if (!reason) {
      throw new BookingValidationError("Invalid booking reason")
    }
  }

  // Validate booking date
  const bookingDate = new Date(input.bookingDate)
  if (isNaN(bookingDate.getTime())) {
    throw new BookingValidationError("Invalid date: " + input.bookingDate)
  }

  // Block mutations in closed months
  await assertMonthNotClosed(prisma, tenantId, input.employeeId, bookingDate)

  // Reopen gate: an IN work-booking on a day that already has an OUT work-
  // booking requires an active approved REOPEN OvertimeRequest, unless the
  // tenant has disabled the reopen policy (OvertimeRequestConfig.reopenRequired).
  if (bookingType.direction === "in" && bookingType.category === "work") {
    const dayOuts = await prisma.booking.count({
      where: {
        tenantId,
        employeeId: input.employeeId,
        bookingDate,
        bookingType: { direction: "out", category: "work" },
      },
    })
    if (dayOuts > 0) {
      const config = await overtimeRequestConfigService.getOrCreate(prisma, tenantId)
      if (config.reopenRequired) {
        const allowed = await overtimeRequestRepo.hasActiveReopen(
          prisma,
          tenantId,
          input.employeeId,
          bookingDate
        )
        if (!allowed) {
          throw new BookingValidationError("reopen_not_approved")
        }
      }
    }
  }

  // Create booking
  const booking = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    bookingDate,
    bookingTypeId: input.bookingTypeId,
    originalTime: minutes,
    editedTime: minutes,
    source: "web",
    notes: input.notes || null,
    bookingReasonId: input.bookingReasonId || null,
    createdBy: userId,
    updatedBy: userId,
  })

  // Create derived booking if needed (best effort)
  try {
    await createDerivedBookingIfNeeded(prisma, booking, userId)
  } catch {
    // Best effort -- derived booking creation failure should not fail the main booking
    console.error(
      "Failed to create derived booking for booking",
      booking.id
    )
  }

  // Trigger recalculation for the affected day (best effort)
  await triggerRecalc(
    prisma,
    tenantId,
    input.employeeId,
    bookingDate
  )

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "create",
    entityType: "booking",
    entityId: booking.id,
    entityName: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  return booking
}

export async function updateBooking(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    time?: string
    notes?: string | null
  },
  dataScope: DataScopeFilter,
  userId: string,
  audit: AuditContext
) {
  // Fetch existing booking (tenant-scoped) with employee
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, input.id)
  if (!existing) {
    throw new BookingNotFoundError()
  }

  // Check data scope
  checkBookingDataScope(dataScope, existing)

  // Block mutations in closed months
  await assertMonthNotClosed(prisma, tenantId, existing.employeeId, existing.bookingDate)

  // Build partial update data
  const data: Record<string, unknown> = { updatedBy: userId }

  if (input.time !== undefined) {
    const minutes = parseTimeString(input.time)
    validateTime(minutes)
    data.editedTime = minutes
    data.calculatedTime = null // Clear calculated time when edited
  }

  if (input.notes !== undefined) {
    data.notes = input.notes
  }

  // Update and return with includes
  const updated = await repo.update(prisma, tenantId, input.id, data)

  // Trigger recalculation for the affected day (best effort)
  await triggerRecalc(prisma, tenantId, existing.employeeId, existing.bookingDate)

  // Never throws — audit failures must not block the actual operation
  const changes = auditLog.computeChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    ["editedTime", "notes", "bookingReasonId"]
  )
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "update",
    entityType: "booking",
    entityId: input.id,
    entityName: null,
    changes,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  return updated
}

export async function deleteBooking(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope: DataScopeFilter,
  audit: AuditContext
) {
  // Fetch existing booking (tenant-scoped) with employee
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new BookingNotFoundError()
  }

  // Check data scope
  checkBookingDataScope(dataScope, existing)

  // Block mutations in closed months
  await assertMonthNotClosed(prisma, tenantId, existing.employeeId, existing.bookingDate)

  // Delete derived bookings first, then delete the booking in a transaction
  await repo.deleteWithDerived(prisma, tenantId, id)

  // Trigger recalculation for the affected day (best effort)
  // Note: must capture employee/date before deletion (already done via `existing`)
  await triggerRecalc(prisma, tenantId, existing.employeeId, existing.bookingDate)

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "delete",
    entityType: "booking",
    entityId: id,
    entityName: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}
