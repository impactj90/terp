/**
 * Tolerance / Grace Period Application
 *
 * Adjusts booking times based on tolerance settings. If a booking is
 * within the tolerance window of the expected time, it is "snapped"
 * to the expected time (the employee is treated as on time).
 *
 * Also provides validation for time windows and core hours.
 *
 * Ported from Go: apps/api/internal/calculation/tolerance.go
 */

import type { ToleranceConfig } from "./types"
import { ERR_MISSED_CORE_START, ERR_MISSED_CORE_END } from "./errors"

/**
 * Adjusts an arrival time based on tolerance settings.
 * If arrival is within tolerance window of the expected time, it is snapped.
 *
 * @param actualTime - Actual arrival time in minutes from midnight
 * @param expectedTime - Expected arrival time (ComeFrom), null if not set
 * @param tolerance - Tolerance configuration
 * @returns Adjusted arrival time in minutes
 *
 * @example
 * // Late arrival within tolerance: snaps to expected
 * applyComeTolerance(483, 480, { comePlus: 5, comeMinus: 5, goPlus: 0, goMinus: 0 })
 * // => 480
 */
export function applyComeTolerance(
  actualTime: number,
  expectedTime: number | null,
  tolerance: ToleranceConfig
): number {
  if (expectedTime === null) {
    return actualTime
  }

  // Late arrival: check tolerance plus
  if (actualTime > expectedTime) {
    if (actualTime <= expectedTime + tolerance.comePlus) {
      return expectedTime
    }
  }

  // Early arrival: check tolerance minus
  if (actualTime < expectedTime) {
    if (actualTime >= expectedTime - tolerance.comeMinus) {
      return expectedTime
    }
  }

  return actualTime
}

/**
 * Adjusts a departure time based on tolerance settings.
 * If departure is within tolerance window of the expected time, it is snapped.
 *
 * @param actualTime - Actual departure time in minutes from midnight
 * @param expectedTime - Expected departure time (GoTo), null if not set
 * @param tolerance - Tolerance configuration
 * @returns Adjusted departure time in minutes
 *
 * @example
 * // Early departure within tolerance: snaps to expected
 * applyGoTolerance(1017, 1020, { comePlus: 0, comeMinus: 0, goPlus: 5, goMinus: 5 })
 * // => 1020
 */
export function applyGoTolerance(
  actualTime: number,
  expectedTime: number | null,
  tolerance: ToleranceConfig
): number {
  if (expectedTime === null) {
    return actualTime
  }

  // Early departure: check tolerance minus
  if (actualTime < expectedTime) {
    if (actualTime >= expectedTime - tolerance.goMinus) {
      return expectedTime
    }
  }

  // Late departure: check tolerance plus
  if (actualTime > expectedTime) {
    if (actualTime <= expectedTime + tolerance.goPlus) {
      return expectedTime
    }
  }

  return actualTime
}

/**
 * Checks if a time is within an allowed window.
 * Returns error codes if the time is outside the window.
 *
 * @param actualTime - Time to validate in minutes from midnight
 * @param from - Window start (null = no start constraint)
 * @param to - Window end (null = no end constraint)
 * @param earlyCode - Error code to return if too early
 * @param lateCode - Error code to return if too late
 * @returns Array of error code strings (empty if within window)
 */
export function validateTimeWindow(
  actualTime: number,
  from: number | null,
  to: number | null,
  earlyCode: string,
  lateCode: string
): string[] {
  const errors: string[] = []

  if (from !== null && actualTime < from) {
    errors.push(earlyCode)
  }

  if (to !== null && actualTime > to) {
    errors.push(lateCode)
  }

  return errors
}

/**
 * Checks if presence covers required core hours.
 * Returns error codes if core hours are not covered.
 *
 * @param firstCome - First arrival time (null if no arrivals)
 * @param lastGo - Last departure time (null if no departures)
 * @param coreStart - Core hours start (null if not defined)
 * @param coreEnd - Core hours end (null if not defined)
 * @returns Array of error code strings (empty if core hours covered)
 */
export function validateCoreHours(
  firstCome: number | null,
  lastGo: number | null,
  coreStart: number | null,
  coreEnd: number | null
): string[] {
  const errors: string[] = []

  if (coreStart === null || coreEnd === null) {
    return errors // No core hours defined
  }

  if (firstCome === null || firstCome > coreStart) {
    errors.push(ERR_MISSED_CORE_START)
  }

  if (lastGo === null || lastGo < coreEnd) {
    errors.push(ERR_MISSED_CORE_END)
  }

  return errors
}
