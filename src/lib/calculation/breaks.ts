/**
 * Break Deduction Logic
 *
 * Handles three break types per ZMI specification:
 * - Fixed: ALWAYS deducted based on overlap with time window
 * - Variable: Only deducted if no manual breaks recorded
 * - Minimum: Deducted after work threshold, with optional proportional deduction
 *
 * Ported from Go: apps/api/internal/calculation/breaks.go
 */

import type { BookingPair, BreakConfig, BreakDeductionResult } from "./types"
import {
  WARN_AUTO_BREAK_APPLIED,
  WARN_MANUAL_BREAK,
  WARN_MAX_TIME_REACHED,
  WARN_NO_BREAK_RECORDED,
} from "./errors"

/**
 * Determines how much break time to deduct based on break configs and recorded breaks.
 *
 * @param pairs - Booking pairs (used for fixed break overlap calculation)
 * @param recordedBreakTime - Minutes of manually recorded breaks
 * @param grossWorkTime - Total gross work time in minutes
 * @param breakConfigs - Break configurations from day plan
 * @returns Break deduction result with total minutes and warnings
 */
export function calculateBreakDeduction(
  pairs: BookingPair[],
  recordedBreakTime: number,
  grossWorkTime: number,
  breakConfigs: BreakConfig[]
): BreakDeductionResult {
  const result: BreakDeductionResult = {
    deductedMinutes: 0,
    warnings: [],
  }

  if (breakConfigs.length === 0) {
    // No break rules, use recorded breaks
    result.deductedMinutes = recordedBreakTime
    return result
  }

  let totalDeduction = 0

  for (const cfg of breakConfigs) {
    switch (cfg.type) {
      case "fixed":
        // Fixed breaks: Overlap with time window, ALWAYS deducted
        // Ignores manual bookings per ZMI spec
        totalDeduction += deductFixedBreak(pairs, cfg)
        break

      case "variable":
        // Variable breaks: Only if no manual break was recorded
        if (recordedBreakTime === 0 && cfg.autoDeduct) {
          if (cfg.afterWorkMinutes === null || grossWorkTime >= cfg.afterWorkMinutes) {
            totalDeduction += cfg.duration
            result.warnings.push(WARN_AUTO_BREAK_APPLIED)
          }
        }
        break

      case "minimum":
        // Minimum breaks: After threshold, with optional proportional deduction
        if (cfg.autoDeduct) {
          const deduction = calculateMinimumBreak(grossWorkTime, cfg)
          if (deduction > 0) {
            totalDeduction += deduction
            if (recordedBreakTime === 0) {
              result.warnings.push(WARN_AUTO_BREAK_APPLIED)
            }
          }
        }
        break
    }
  }

  // Add warning if manual breaks were recorded
  if (recordedBreakTime > 0) {
    result.warnings.push(WARN_MANUAL_BREAK)
    // Include recorded break time in total (in addition to fixed breaks)
    totalDeduction += recordedBreakTime
  }

  // Add warning if no breaks recorded but breaks are configured
  if (recordedBreakTime === 0 && totalDeduction > 0) {
    result.warnings.push(WARN_NO_BREAK_RECORDED)
  }

  result.deductedMinutes = totalDeduction
  return result
}

/**
 * Returns the overlap in minutes between two time ranges.
 * Returns 0 if there is no overlap.
 *
 * @param start1 - First range start (minutes from midnight)
 * @param end1 - First range end (minutes from midnight)
 * @param start2 - Second range start (minutes from midnight)
 * @param end2 - Second range end (minutes from midnight)
 * @returns Overlap in minutes (0 if no overlap)
 *
 * @example calculateOverlap(480, 1020, 720, 750) // 30
 */
export function calculateOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): number {
  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)
  if (overlapEnd > overlapStart) {
    return overlapEnd - overlapStart
  }
  return 0
}

/**
 * Calculates the break deduction for a fixed break based on overlap with work periods.
 * Fixed breaks are ALWAYS deducted if work overlaps the break window.
 * Returns the minutes to deduct (capped at configured duration).
 *
 * @param pairs - Booking pairs to check for overlap
 * @param cfg - Fixed break configuration
 * @returns Minutes to deduct
 */
export function deductFixedBreak(pairs: BookingPair[], cfg: BreakConfig): number {
  // Fixed breaks require startTime and endTime
  if (cfg.startTime === null || cfg.endTime === null) {
    return 0
  }

  const breakStart = cfg.startTime
  const breakEnd = cfg.endTime
  let totalOverlap = 0

  for (const pair of pairs) {
    // Only consider work pairs
    if (pair.category !== "work") {
      continue
    }
    // Skip incomplete pairs
    if (pair.inBooking === null || pair.outBooking === null) {
      continue
    }

    const workStart = pair.inBooking.time
    const workEnd = pair.outBooking.time

    if (workStart < workEnd) {
      // Same-day pair
      totalOverlap += calculateOverlap(workStart, workEnd, breakStart, breakEnd)
    } else if (workStart > workEnd) {
      // Cross-midnight pair — calculate overlap against both halves at
      // the midnight boundary. (Symmetric with extractWorkPeriods.)
      totalOverlap += calculateOverlap(workStart, 1440, breakStart, breakEnd)
      totalOverlap += calculateOverlap(0, workEnd, breakStart, breakEnd)
    }
    // workStart === workEnd: zero-duration pair, skip defensively.
  }

  // Deduct the lesser of configured duration or actual overlap
  if (totalOverlap > cfg.duration) {
    return cfg.duration
  }
  return totalOverlap
}

/**
 * Calculates the deduction for a minimum break.
 * If MinutesDifference is true, applies proportional deduction based on
 * how much work time exceeds the threshold.
 *
 * @param grossWorkTime - Total gross work time in minutes
 * @param cfg - Minimum break configuration
 * @returns Minutes to deduct
 *
 * @example
 * // 30min break after 5h threshold, employee works 5:10 -> only 10min deducted
 * calculateMinimumBreak(310, { ..., duration: 30, afterWorkMinutes: 300, minutesDifference: true })
 * // => 10
 */
export function calculateMinimumBreak(grossWorkTime: number, cfg: BreakConfig): number {
  if (cfg.afterWorkMinutes === null) {
    return 0
  }

  const threshold = cfg.afterWorkMinutes
  if (grossWorkTime < threshold) {
    return 0
  }

  if (cfg.minutesDifference) {
    // Proportional deduction: only deduct the overtime beyond threshold
    const overtime = grossWorkTime - threshold
    if (overtime >= cfg.duration) {
      return cfg.duration
    }
    return overtime
  }

  // Full deduction when threshold is met
  return cfg.duration
}

/**
 * Computes net work time from gross time minus breaks.
 * Applies MaxNetWorkTime cap if configured.
 *
 * @param grossTime - Gross work time in minutes
 * @param breakTime - Break time to deduct in minutes
 * @param maxNetWorkTime - Maximum allowed net work time (null if not set)
 * @returns Object with netTime and any warnings
 */
export function calculateNetTime(
  grossTime: number,
  breakTime: number,
  maxNetWorkTime: number | null
): { netTime: number; warnings: string[] } {
  const warnings: string[] = []
  let netTime = grossTime - breakTime

  if (netTime < 0) {
    netTime = 0
  }

  if (maxNetWorkTime !== null && netTime > maxNetWorkTime) {
    netTime = maxNetWorkTime
    warnings.push(WARN_MAX_TIME_REACHED)
  }

  return { netTime, warnings }
}

/**
 * Computes overtime and undertime from net time and target.
 *
 * @param netTime - Net work time in minutes
 * @param targetTime - Target work time in minutes
 * @returns Object with overtime and undertime
 */
export function calculateOvertimeUndertime(
  netTime: number,
  targetTime: number
): { overtime: number; undertime: number } {
  const diff = netTime - targetTime

  if (diff > 0) {
    return { overtime: diff, undertime: 0 }
  }
  if (diff < 0) {
    return { overtime: 0, undertime: -diff }
  }
  return { overtime: 0, undertime: 0 }
}
