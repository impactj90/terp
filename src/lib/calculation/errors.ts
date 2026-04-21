/**
 * Error and Warning Code Constants
 *
 * Constants used throughout the calculation engine to identify error
 * and warning conditions. Error codes indicate problems that require
 * attention; warning codes are informational.
 *
 * Ported from Go: apps/api/internal/calculation/errors.go
 */

// --- Error codes ---

/** No arrival booking found */
export const ERR_MISSING_COME = "MISSING_COME"
/** No departure booking found */
export const ERR_MISSING_GO = "MISSING_GO"
/** Booking without matching pair */
export const ERR_UNPAIRED_BOOKING = "UNPAIRED_BOOKING"

/** Arrival before allowed window */
export const ERR_EARLY_COME = "EARLY_COME"
/** Arrival after allowed window */
export const ERR_LATE_COME = "LATE_COME"
/** Departure before allowed window */
export const ERR_EARLY_GO = "EARLY_GO"
/** Departure after allowed window */
export const ERR_LATE_GO = "LATE_GO"

/** Arrived after core hours start */
export const ERR_MISSED_CORE_START = "MISSED_CORE_START"
/** Left before core hours end */
export const ERR_MISSED_CORE_END = "MISSED_CORE_END"

/** Worked less than minimum */
export const ERR_BELOW_MIN_WORK_TIME = "BELOW_MIN_WORK_TIME"
/** No bookings for the day */
export const ERR_NO_BOOKINGS = "NO_BOOKINGS"

/** Time value out of range */
export const ERR_INVALID_TIME = "INVALID_TIME"
/** Multiple arrivals at same time */
export const ERR_DUPLICATE_IN_TIME = "DUPLICATE_IN_TIME"

/** No day plan matched the booking times */
export const ERR_NO_MATCHING_SHIFT = "NO_MATCHING_SHIFT"

/** Overtime recorded without an approved OvertimeRequest */
export const ERR_UNAPPROVED_OVERTIME = "UNAPPROVED_OVERTIME"

// --- Warning codes ---

/** Shift spans midnight */
export const WARN_CROSS_MIDNIGHT = "CROSS_MIDNIGHT"
/** NetTime capped at max */
export const WARN_MAX_TIME_REACHED = "MAX_TIME_REACHED"
/** Break bookings exist, auto-deduct skipped */
export const WARN_MANUAL_BREAK = "MANUAL_BREAK"
/** No break bookings but break required */
export const WARN_NO_BREAK_RECORDED = "NO_BREAK_RECORDED"
/** Recorded break shorter than required */
export const WARN_SHORT_BREAK = "SHORT_BREAK"
/** Break auto-deducted */
export const WARN_AUTO_BREAK_APPLIED = "AUTO_BREAK_APPLIED"

// --- Monthly calculation warning codes ---

/** FlextimeCredited capped at monthly max */
export const WARN_MONTHLY_CAP_REACHED = "MONTHLY_CAP_REACHED"
/** FlextimeEnd hit positive/negative balance cap */
export const WARN_FLEXTIME_CAPPED = "FLEXTIME_CAPPED"
/** Overtime below threshold, forfeited */
export const WARN_BELOW_THRESHOLD = "BELOW_THRESHOLD"
/** Credit type resets balance to zero */
export const WARN_NO_CARRYOVER = "NO_CARRYOVER"

// All error code values for lookup
const ERROR_CODES = new Set([
  ERR_MISSING_COME,
  ERR_MISSING_GO,
  ERR_UNPAIRED_BOOKING,
  ERR_EARLY_COME,
  ERR_LATE_COME,
  ERR_EARLY_GO,
  ERR_LATE_GO,
  ERR_MISSED_CORE_START,
  ERR_MISSED_CORE_END,
  ERR_BELOW_MIN_WORK_TIME,
  ERR_NO_BOOKINGS,
  ERR_INVALID_TIME,
  ERR_DUPLICATE_IN_TIME,
  ERR_NO_MATCHING_SHIFT,
  ERR_UNAPPROVED_OVERTIME,
])

/**
 * Returns true if the code represents an error (vs warning).
 * @param code - The error or warning code string
 * @example isError("MISSING_COME") // true
 * @example isError("CROSS_MIDNIGHT") // false
 */
export function isError(code: string): boolean {
  return ERROR_CODES.has(code)
}
