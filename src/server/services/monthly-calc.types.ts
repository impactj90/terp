/**
 * MonthlyCalcService Types
 *
 * TypeScript interfaces and constants for the MonthlyCalcService.
 * Ported from Go: apps/api/internal/service/monthlyeval.go, monthlycalc.go
 */
import type { Decimal } from "@prisma/client/runtime/client"
import type { Prisma } from "@/generated/prisma/client"

// --- Absence category constants ---
// Values stored in absence_types.category column

export const ABSENCE_CATEGORY_VACATION = "vacation"
export const ABSENCE_CATEGORY_ILLNESS = "illness"
export const ABSENCE_CATEGORY_SPECIAL = "special"

// --- Absence status constants ---

export const ABSENCE_STATUS_APPROVED = "approved"

// --- Error messages ---

export const ERR_FUTURE_MONTH = "cannot calculate future month"
export const ERR_MONTH_CLOSED = "cannot modify closed month"
export const ERR_MONTH_NOT_CLOSED = "month is not closed"
export const ERR_INVALID_MONTH = "invalid month"
export const ERR_INVALID_YEAR_MONTH = "invalid year or month"
export const ERR_MONTHLY_VALUE_NOT_FOUND = "monthly value not found"
export const ERR_EMPLOYEE_NOT_FOUND = "employee not found"

// --- Result types ---

/** A single monthly calculation failure. */
export interface MonthlyCalcError {
  employeeId: string
  year: number
  month: number
  error: string
}

/** Outcome of a monthly calculation operation. */
export interface MonthlyCalcResult {
  processedMonths: number
  skippedMonths: number // Months skipped due to being closed
  failedMonths: number
  errors: MonthlyCalcError[]
}

/** Monthly aggregation summary for an employee. */
export interface MonthSummary {
  employeeId: string
  year: number
  month: number

  // Time totals (minutes)
  totalGrossTime: number
  totalNetTime: number
  totalTargetTime: number
  totalOvertime: number
  totalUndertime: number
  totalBreakTime: number

  // Flextime tracking (minutes)
  flextimeStart: number
  flextimeChange: number
  flextimeEnd: number
  flextimeCarryover: number

  // Absence summary
  vacationTaken: Decimal
  sickDays: number
  otherAbsenceDays: number

  // Work summary
  workDays: number
  daysWithErrors: number

  // Status
  isClosed: boolean
  closedAt: Date | null
  closedBy: string | null
  reopenedAt: Date | null
  reopenedBy: string | null

  // Warnings from calculation
  warnings: string[]
}

// --- Prisma include types ---

/** AbsenceDay with absenceType relation loaded */
export type AbsenceDayWithType = Prisma.AbsenceDayGetPayload<{
  include: { absenceType: true }
}>
