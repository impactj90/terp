/**
 * Correction Assistant Service
 *
 * Business logic for correction message management and correction assistant items.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./correction-assistant-repository"

// --- Error Classes ---

export class CorrectionMessageNotFoundError extends Error {
  constructor(message = "Correction message not found") {
    super(message)
    this.name = "CorrectionMessageNotFoundError"
  }
}

// --- Error Codes (from calculation/errors.go) ---

const ERR_MISSING_COME = "MISSING_COME"
const ERR_MISSING_GO = "MISSING_GO"
const ERR_UNPAIRED_BOOKING = "UNPAIRED_BOOKING"
const ERR_EARLY_COME = "EARLY_COME"
const ERR_LATE_COME = "LATE_COME"
const ERR_EARLY_GO = "EARLY_GO"
const ERR_LATE_GO = "LATE_GO"
const ERR_MISSED_CORE_START = "MISSED_CORE_START"
const ERR_MISSED_CORE_END = "MISSED_CORE_END"
const ERR_BELOW_MIN_WORK_TIME = "BELOW_MIN_WORK_TIME"
const ERR_NO_BOOKINGS = "NO_BOOKINGS"
const ERR_INVALID_TIME = "INVALID_TIME"
const ERR_DUPLICATE_IN_TIME = "DUPLICATE_IN_TIME"
const ERR_NO_MATCHING_SHIFT = "NO_MATCHING_SHIFT"

const WARN_CROSS_MIDNIGHT = "CROSS_MIDNIGHT"
const WARN_MAX_TIME_REACHED = "MAX_TIME_REACHED"
const WARN_MANUAL_BREAK = "MANUAL_BREAK"
const WARN_NO_BREAK_RECORDED = "NO_BREAK_RECORDED"
const WARN_SHORT_BREAK = "SHORT_BREAK"
const WARN_AUTO_BREAK_APPLIED = "AUTO_BREAK_APPLIED"
const WARN_MONTHLY_CAP = "MONTHLY_CAP_REACHED"
const WARN_FLEXTIME_CAPPED = "FLEXTIME_CAPPED"
const WARN_BELOW_THRESHOLD = "BELOW_THRESHOLD"
const WARN_NO_CARRYOVER = "NO_CARRYOVER"

function mapCorrectionErrorType(code: string): string {
  switch (code) {
    case ERR_MISSING_COME:
    case ERR_MISSING_GO:
    case ERR_NO_BOOKINGS:
      return "missing_booking"
    case ERR_UNPAIRED_BOOKING:
      return "unpaired_booking"
    case ERR_DUPLICATE_IN_TIME:
      return "overlapping_bookings"
    case ERR_EARLY_COME:
    case ERR_LATE_COME:
    case ERR_EARLY_GO:
    case ERR_LATE_GO:
    case ERR_MISSED_CORE_START:
    case ERR_MISSED_CORE_END:
      return "core_time_violation"
    case ERR_BELOW_MIN_WORK_TIME:
      return "below_min_hours"
    case WARN_NO_BREAK_RECORDED:
    case WARN_SHORT_BREAK:
    case WARN_MANUAL_BREAK:
    case WARN_AUTO_BREAK_APPLIED:
      return "break_violation"
    case WARN_MAX_TIME_REACHED:
      return "exceeds_max_hours"
    default:
      return "invalid_sequence"
  }
}

function defaultCorrectionMessages(tenantId: string) {
  return [
    { tenantId, code: ERR_MISSING_COME, defaultText: "Missing arrival booking", severity: "error", description: "No arrival booking found for this work day" },
    { tenantId, code: ERR_MISSING_GO, defaultText: "Missing departure booking", severity: "error", description: "No departure booking found for this work day" },
    { tenantId, code: ERR_UNPAIRED_BOOKING, defaultText: "Unpaired booking", severity: "error", description: "A booking exists without a matching pair" },
    { tenantId, code: ERR_EARLY_COME, defaultText: "Arrival before allowed window", severity: "error", description: "Employee arrived before the allowed time window" },
    { tenantId, code: ERR_LATE_COME, defaultText: "Arrival after allowed window", severity: "error", description: "Employee arrived after the allowed time window" },
    { tenantId, code: ERR_EARLY_GO, defaultText: "Departure before allowed window", severity: "error", description: "Employee departed before the allowed time window" },
    { tenantId, code: ERR_LATE_GO, defaultText: "Departure after allowed window", severity: "error", description: "Employee departed after the allowed time window" },
    { tenantId, code: ERR_MISSED_CORE_START, defaultText: "Missed core hours start", severity: "error", description: "Employee arrived after mandatory core hours started" },
    { tenantId, code: ERR_MISSED_CORE_END, defaultText: "Missed core hours end", severity: "error", description: "Employee departed before mandatory core hours ended" },
    { tenantId, code: ERR_BELOW_MIN_WORK_TIME, defaultText: "Below minimum work time", severity: "error", description: "Actual work time is below the required minimum" },
    { tenantId, code: ERR_NO_BOOKINGS, defaultText: "No bookings for the day", severity: "error", description: "No bookings exist for an active work day" },
    { tenantId, code: ERR_INVALID_TIME, defaultText: "Invalid time value", severity: "error", description: "A booking has a time value outside the valid range" },
    { tenantId, code: ERR_DUPLICATE_IN_TIME, defaultText: "Duplicate arrival time", severity: "error", description: "Multiple arrival bookings at the same time" },
    { tenantId, code: ERR_NO_MATCHING_SHIFT, defaultText: "No matching time plan found", severity: "error", description: "No day plan matches the booking times for shift detection" },
    { tenantId, code: WARN_CROSS_MIDNIGHT, defaultText: "Shift spans midnight", severity: "hint", description: "The work shift crosses midnight into the next day" },
    { tenantId, code: WARN_MAX_TIME_REACHED, defaultText: "Maximum work time reached", severity: "hint", description: "Net time was capped at the maximum allowed" },
    { tenantId, code: WARN_MANUAL_BREAK, defaultText: "Manual break booking exists", severity: "hint", description: "Break bookings exist; automatic break deduction was skipped" },
    { tenantId, code: WARN_NO_BREAK_RECORDED, defaultText: "No break booking recorded", severity: "hint", description: "No break was booked although a break is required" },
    { tenantId, code: WARN_SHORT_BREAK, defaultText: "Break duration too short", severity: "hint", description: "Recorded break is shorter than the required minimum" },
    { tenantId, code: WARN_AUTO_BREAK_APPLIED, defaultText: "Automatic break applied", severity: "hint", description: "Break was automatically deducted per day plan rules" },
    { tenantId, code: WARN_MONTHLY_CAP, defaultText: "Monthly cap reached", severity: "hint", description: "Flextime credit was capped at the monthly maximum" },
    { tenantId, code: WARN_FLEXTIME_CAPPED, defaultText: "Flextime balance capped", severity: "hint", description: "Flextime balance was limited by positive or negative cap" },
    { tenantId, code: WARN_BELOW_THRESHOLD, defaultText: "Below threshold", severity: "hint", description: "Overtime is below the configured threshold and was forfeited" },
    { tenantId, code: WARN_NO_CARRYOVER, defaultText: "No carryover", severity: "hint", description: "Account credit type resets to zero with no carryover" },
  ]
}

async function ensureDefaults(
  prisma: PrismaClient,
  tenantId: string
): Promise<void> {
  const count = await repo.countMessages(prisma, tenantId)
  if (count > 0) return

  await repo.createManyMessages(prisma, defaultCorrectionMessages(tenantId))
}

// --- Service Functions ---

export async function listMessages(
  prisma: PrismaClient,
  tenantId: string,
  params?: { severity?: string; isActive?: boolean; code?: string }
) {
  await ensureDefaults(prisma, tenantId)

  return repo.findManyMessages(prisma, tenantId, params)
}

export async function getMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const message = await repo.findMessageById(prisma, tenantId, id)
  if (!message) {
    throw new CorrectionMessageNotFoundError()
  }
  return message
}

export async function updateMessage(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    customText?: string | null
    severity?: string
    isActive?: boolean
  }
) {
  // Verify exists with tenant scope
  const existing = await repo.findMessageById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CorrectionMessageNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.customText !== undefined) {
    if (input.customText === null || input.customText === "") {
      data.customText = null
    } else {
      const trimmed = input.customText.trim()
      data.customText = trimmed === "" ? null : trimmed
    }
  }

  if (input.severity !== undefined) {
    data.severity = input.severity
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  return repo.updateMessage(prisma, input.id, data)
}

interface CorrectionAssistantError {
  code: string
  severity: string
  message: string
  errorType: string
}

interface CorrectionAssistantItem {
  dailyValueId: string
  employeeId: string
  employeeName: string
  departmentId: string | null
  departmentName: string | null
  valueDate: string
  errors: CorrectionAssistantError[]
}

export async function listItems(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    from?: string
    to?: string
    employeeId?: string
    departmentId?: string
    severity?: string
    errorCode?: string
    limit?: number
    offset?: number
  }
) {
  await ensureDefaults(prisma, tenantId)

  // Calculate date range
  const now = new Date()
  let fromDate: Date
  let toDate: Date

  if (params?.from) {
    fromDate = new Date(params.from)
  } else {
    fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  }

  if (params?.to) {
    toDate = new Date(params.to)
  } else {
    toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  }

  // Load message catalog for resolution
  const activeMessages = await repo.findActiveMessages(prisma, tenantId)
  const messageMap = new Map(activeMessages.map((m) => [m.code, m]))

  // Fetch daily values with errors
  const rows = await repo.findDailyValuesWithErrors(prisma, tenantId, {
    fromDate,
    toDate,
    employeeId: params?.employeeId,
    departmentId: params?.departmentId,
  })

  // Build correction assistant items
  const severityFilter = params?.severity
  const codeFilter = params?.errorCode

  const items: CorrectionAssistantItem[] = []

  for (const row of rows) {
    const errors: CorrectionAssistantError[] = []

    // Process error codes
    if (row.errorCodes) {
      for (const code of row.errorCodes) {
        if (severityFilter && severityFilter !== "error") continue
        if (codeFilter && codeFilter !== code) continue

        let message = code
        let severity = "error"
        const catalogEntry = messageMap.get(code)
        if (catalogEntry) {
          message = catalogEntry.customText || catalogEntry.defaultText
          severity = catalogEntry.severity
        }

        errors.push({
          code,
          severity,
          message,
          errorType: mapCorrectionErrorType(code),
        })
      }
    }

    // Process warnings as "hint" severity
    if (row.warnings) {
      for (const code of row.warnings) {
        if (severityFilter && severityFilter !== "hint") continue
        if (codeFilter && codeFilter !== code) continue

        let message = code
        let severity = "hint"
        const catalogEntry = messageMap.get(code)
        if (catalogEntry) {
          message = catalogEntry.customText || catalogEntry.defaultText
          severity = catalogEntry.severity
        }

        errors.push({
          code,
          severity,
          message,
          errorType: mapCorrectionErrorType(code),
        })
      }
    }

    if (errors.length === 0) continue

    const valueDate =
      row.valueDate instanceof Date
        ? row.valueDate.toISOString().split("T")[0]!
        : String(row.valueDate).split("T")[0]!

    items.push({
      dailyValueId: row.id,
      employeeId: row.employeeId,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      departmentId: row.employee.departmentId,
      departmentName: row.employee.department?.name ?? null,
      valueDate,
      errors,
    })
  }

  const total = items.length
  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0

  // Apply pagination
  const paginatedItems = items.slice(offset, offset + limit)
  const hasMore = offset + limit < total

  return {
    data: paginatedItems,
    meta: {
      total,
      limit,
      offset,
      hasMore,
    },
  }
}
