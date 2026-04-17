/**
 * Surcharge / Bonus Calculations
 *
 * Calculates surcharges (night, weekend, holiday bonuses) based on
 * overlap between work periods and surcharge time windows.
 *
 * ZMI: Surcharges must not span midnight. They must be entered as
 * two separate windows (e.g., 22:00-00:00 and 00:00-06:00).
 *
 * Ported from Go: apps/api/internal/calculation/surcharge.go
 */

import type {
  BookingPair,
  SurchargeConfig,
  SurchargeCalculationResult,
  TimePeriod,
} from "./types"
import { calculateOverlap } from "./breaks"

/**
 * Calculates all surcharges for a day's work periods.
 *
 * @param workPeriods - Work periods in minutes from midnight
 * @param configs - Surcharge configurations from day plan bonuses
 * @param isHoliday - Whether this day is a holiday
 * @param holidayCategory - Holiday category (1, 2, 3) if applicable, 0 if not
 * @param netWorkTime - Daily net work time in minutes (for MinWorkMinutes gate)
 * @returns Surcharge results for each applicable config with total minutes
 */
export function calculateSurcharges(
  workPeriods: TimePeriod[],
  configs: SurchargeConfig[],
  isHoliday: boolean,
  holidayCategory: number,
  netWorkTime: number
): SurchargeCalculationResult {
  const result: SurchargeCalculationResult = {
    surcharges: [],
    totalMinutes: 0,
  }

  for (const config of configs) {
    // Check if this surcharge applies today
    if (!surchargeApplies(config, isHoliday, holidayCategory)) {
      continue
    }

    // Check minimum work time gate
    if (config.minWorkMinutes !== null && netWorkTime < config.minWorkMinutes) {
      continue
    }

    // Calculate overlap between work periods and surcharge window
    let overlapMinutes = 0
    for (const period of workPeriods) {
      const overlap = calculateOverlap(
        period.start,
        period.end,
        config.timeFrom,
        config.timeTo
      )
      overlapMinutes += overlap
    }

    if (overlapMinutes === 0) {
      continue
    }

    // Apply calculation type
    let bonusMinutes: number
    switch (config.calculationType) {
      case "fixed":
        bonusMinutes = config.valueMinutes
        break
      case "percentage":
        bonusMinutes = Math.floor(overlapMinutes * config.valueMinutes / 100)
        break
      default: // "per_minute" or empty
        bonusMinutes = overlapMinutes
        break
    }

    if (bonusMinutes > 0) {
      result.surcharges.push({
        accountId: config.accountId,
        accountCode: config.accountCode,
        minutes: bonusMinutes,
      })
      result.totalMinutes += bonusMinutes
    }
  }

  return result
}

/**
 * Splits an overnight surcharge config into two valid configs.
 * ZMI: Surcharges must not span midnight. 22:00-06:00 becomes
 * [22:00-00:00, 00:00-06:00].
 * If config is already valid (no overnight), returns as-is.
 *
 * @param config - Surcharge configuration to split
 * @returns Array of 1 or 2 valid configs
 */
export function splitOvernightSurcharge(config: SurchargeConfig): SurchargeConfig[] {
  // If already valid (no overnight), return as-is
  if (config.timeFrom < config.timeTo) {
    return [config]
  }

  // Split at midnight
  const eveningConfig: SurchargeConfig = {
    ...config,
    timeFrom: config.timeFrom,
    timeTo: 1440, // Midnight
  }

  const morningConfig: SurchargeConfig = {
    ...config,
    timeFrom: 0, // Midnight
    timeTo: config.timeTo,
  }

  return [eveningConfig, morningConfig]
}

/**
 * Validates a surcharge configuration.
 * ZMI: "Die Zuschläge müssen bis 00:00 Uhr bzw. ab 00:00 Uhr eingetragen werden"
 *
 * @param config - Surcharge configuration to validate
 * @returns Array of validation error strings (empty if valid)
 */
export function validateSurchargeConfig(config: SurchargeConfig): string[] {
  const errors: string[] = []

  // Time bounds check
  if (config.timeFrom < 0 || config.timeFrom >= 1440) {
    errors.push("time_from must be between 0 and 1439")
  }
  if (config.timeTo <= 0 || config.timeTo > 1440) {
    errors.push("time_to must be between 1 and 1440")
  }

  // Order check - no overnight spans allowed
  if (config.timeFrom >= config.timeTo) {
    errors.push("time_from must be less than time_to (no overnight spans - split at midnight)")
  }

  return errors
}

/**
 * Extracts TimePeriod slices from BookingPairs.
 * Only includes complete work pairs (both in and out bookings present).
 *
 * Cross-midnight pairs (inBooking.time > outBooking.time, e.g. 22:00 →
 * 06:00) are split at midnight into two same-day windows — symmetric with
 * splitOvernightSurcharge. Downstream `calculateOverlap` expects end > start.
 *
 * @param pairs - Array of booking pairs
 * @returns Array of work periods (may exceed `pairs.length` when cross-midnight pairs are split)
 */
export function extractWorkPeriods(pairs: BookingPair[]): TimePeriod[] {
  const periods: TimePeriod[] = []

  for (const pair of pairs) {
    // Only consider work pairs
    if (pair.category !== "work") {
      continue
    }
    // Skip incomplete pairs
    if (pair.inBooking === null || pair.outBooking === null) {
      continue
    }

    const startTime = pair.inBooking.time
    const endTime = pair.outBooking.time

    if (startTime < endTime) {
      // Same-day pair — emit one period
      periods.push({ start: startTime, end: endTime })
    } else if (startTime > endTime) {
      // Cross-midnight pair — emit two periods at the midnight boundary
      // so the downstream overlap calculation sees end > start.
      periods.push({ start: startTime, end: 1440 })
      periods.push({ start: 0, end: endTime })
    }
    // startTime === endTime: zero-duration pair, skip defensively.
  }

  return periods
}

/**
 * Converts a legacy half-day flag to a ZMI-style holiday category.
 *
 * @param isHalfDay - Whether this is a half-day holiday
 * @returns 1 for full holiday, 2 for half holiday
 */
export function getHolidayCategoryFromFlag(isHalfDay: boolean): number {
  if (isHalfDay) {
    return 2 // Half holiday
  }
  return 1 // Full holiday
}

// --- Internal helpers ---

/**
 * Checks if a surcharge config applies to this day.
 * ZMI: Holiday surcharges only on holidays, night surcharges only on workdays.
 */
function surchargeApplies(
  config: SurchargeConfig,
  isHoliday: boolean,
  holidayCategory: number
): boolean {
  if (isHoliday) {
    // Check if surcharge applies on holidays
    if (!config.appliesOnHoliday) {
      return false
    }
    // Check holiday category filter
    if (config.holidayCategories.length > 0) {
      if (!config.holidayCategories.includes(holidayCategory)) {
        return false
      }
    }
    return true
  }
  // Regular workday
  return config.appliesOnWorkday
}
