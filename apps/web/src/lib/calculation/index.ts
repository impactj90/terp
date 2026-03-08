/**
 * Calculation Engine Public API
 *
 * Pure-function library for ZMI time tracking calculations.
 * No database dependencies -- only input/output functions.
 *
 * @example
 * import { calculate } from "@/lib/calculation"
 * const result = calculate({ employeeId, date, bookings, dayPlan })
 */

// Re-export all public types
export type {
  BookingDirection,
  BookingCategory,
  BreakType,
  RoundingType,
  PlanType,
  CappingSource,
  SurchargeCalculationType,
  BookingInput,
  BreakConfig,
  RoundingConfig,
  ToleranceConfig,
  DayPlanInput,
  CalculationInput,
  BookingPair,
  CappedTime,
  CappingResult,
  PairingResult,
  BreakDeductionResult,
  CalculationResult,
  TimePeriod,
  SurchargeConfig,
  SurchargeResult,
  SurchargeCalculationResult,
} from "./types"

// Re-export all public functions
export { calculate } from "./calculator"
export { pairBookings, calculateGrossTime, calculateBreakTime, findFirstCome, findLastGo } from "./pairing"
export { applyComeTolerance, applyGoTolerance, validateTimeWindow, validateCoreHours } from "./tolerance"
export { roundTime, roundComeTime, roundGoTime } from "./rounding"
export {
  calculateBreakDeduction,
  calculateOverlap,
  deductFixedBreak,
  calculateMinimumBreak,
  calculateNetTime,
  calculateOvertimeUndertime,
} from "./breaks"
export {
  applyWindowCapping,
  applyCapping,
  calculateEarlyArrivalCapping,
  calculateLateDepartureCapping,
  calculateMaxNetTimeCapping,
  aggregateCapping,
} from "./capping"
export {
  calculateSurcharges,
  splitOvernightSurcharge,
  validateSurchargeConfig,
  extractWorkPeriods,
  getHolidayCategoryFromFlag,
} from "./surcharges"
export { normalizeCrossMidnight, isValidTimeOfDay, MINUTES_PER_DAY, MAX_MINUTES_FROM_MIDNIGHT } from "./time"
export * from "./errors"
