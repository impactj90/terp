/**
 * Window Capping + Max Net Time Capping
 *
 * Adjusts booking times to fit within the evaluation window and caps
 * net work time at the configured maximum. Tracks capped amounts for
 * separate account posting.
 *
 * Ported from Go: apps/api/internal/calculation/capping.go
 */

import type { CappedTime, CappingResult } from "./types"

/**
 * Adjusts a booking time to fit within the evaluation window.
 * Returns the adjusted time and the amount of time that was capped.
 *
 * @param bookingTime - Actual booking time in minutes from midnight
 * @param windowStart - Window start (null = no start constraint)
 * @param windowEnd - Window end (null = no end constraint)
 * @param toleranceMinus - Tolerance before window start (only applied if variableWorkTime for arrivals)
 * @param tolerancePlus - Tolerance after window end
 * @param isArrival - True if this is an arrival booking, false for departure
 * @param variableWorkTime - Whether VariableWorkTime flag is set
 * @returns Object with adjustedTime and capped minutes
 */
export function applyWindowCapping(
  bookingTime: number,
  windowStart: number | null,
  windowEnd: number | null,
  toleranceMinus: number,
  tolerancePlus: number,
  isArrival: boolean,
  variableWorkTime: boolean
): { adjustedTime: number; capped: number } {
  let adjustedTime = bookingTime
  let capped = 0

  if (isArrival && windowStart !== null) {
    // Calculate effective window start
    let effectiveStart = windowStart
    if (variableWorkTime && toleranceMinus > 0) {
      effectiveStart = windowStart - toleranceMinus
    }

    // Cap early arrivals
    if (bookingTime < effectiveStart) {
      capped = effectiveStart - bookingTime
      adjustedTime = effectiveStart
    }
  }

  if (!isArrival && windowEnd !== null) {
    // Calculate effective window end
    const effectiveEnd = windowEnd + tolerancePlus

    // Cap late departures
    if (bookingTime > effectiveEnd) {
      capped = bookingTime - effectiveEnd
      adjustedTime = effectiveEnd
    }
  }

  return { adjustedTime, capped }
}

/**
 * Applies max net work time capping and returns the adjusted net time.
 *
 * @param netWorkTime - Calculated net work time in minutes
 * @param maxNetWorkTime - Maximum allowed net work time (null if not set)
 * @returns Object with adjustedNet and capped minutes
 */
export function applyCapping(
  netWorkTime: number,
  maxNetWorkTime: number | null
): { adjustedNet: number; capped: number } {
  if (maxNetWorkTime === null) {
    return { adjustedNet: netWorkTime, capped: 0 }
  }

  if (netWorkTime > maxNetWorkTime) {
    return { adjustedNet: maxNetWorkTime, capped: netWorkTime - maxNetWorkTime }
  }

  return { adjustedNet: netWorkTime, capped: 0 }
}

/**
 * Determines if arrival is before the evaluation window.
 * Returns null if no capping occurred.
 *
 * @param arrivalTime - Actual arrival time in minutes from midnight
 * @param windowStart - Evaluation window start (ComeFrom), null if not set
 * @param toleranceMinus - ToleranceComeMinus value in minutes
 * @param variableWorkTime - Whether VariableWorkTime flag is set
 * @returns CappedTime if capped, null otherwise
 */
export function calculateEarlyArrivalCapping(
  arrivalTime: number,
  windowStart: number | null,
  toleranceMinus: number,
  variableWorkTime: boolean
): CappedTime | null {
  if (windowStart === null) {
    return null
  }

  // Calculate effective window start
  let effectiveStart = windowStart
  if (variableWorkTime && toleranceMinus > 0) {
    effectiveStart = windowStart - toleranceMinus
  }

  // Check if arrival is before effective window start
  if (arrivalTime < effectiveStart) {
    const cappedMinutes = effectiveStart - arrivalTime
    return {
      minutes: cappedMinutes,
      source: "early_arrival",
      reason: "Arrival before evaluation window",
    }
  }

  return null
}

/**
 * Determines if departure is after the evaluation window.
 * Returns null if no capping occurred.
 *
 * @param departureTime - Actual departure time in minutes from midnight
 * @param windowEnd - Evaluation window end (GoTo), null if not set
 * @param tolerancePlus - ToleranceGoPlus value in minutes
 * @returns CappedTime if capped, null otherwise
 */
export function calculateLateDepartureCapping(
  departureTime: number,
  windowEnd: number | null,
  tolerancePlus: number
): CappedTime | null {
  if (windowEnd === null) {
    return null
  }

  // Calculate effective window end
  const effectiveEnd = windowEnd + tolerancePlus

  // Check if departure is after effective window end
  if (departureTime > effectiveEnd) {
    const cappedMinutes = departureTime - effectiveEnd
    return {
      minutes: cappedMinutes,
      source: "late_leave",
      reason: "Departure after evaluation window",
    }
  }

  return null
}

/**
 * Determines if net time exceeds the maximum.
 * Returns null if no capping occurred or maxNetWorkTime is null.
 *
 * @param netWorkTime - Calculated net work time in minutes
 * @param maxNetWorkTime - Maximum allowed net work time, null if not set
 * @returns CappedTime if capped, null otherwise
 */
export function calculateMaxNetTimeCapping(
  netWorkTime: number,
  maxNetWorkTime: number | null
): CappedTime | null {
  if (maxNetWorkTime === null) {
    return null
  }

  if (netWorkTime > maxNetWorkTime) {
    const cappedMinutes = netWorkTime - maxNetWorkTime
    return {
      minutes: cappedMinutes,
      source: "max_net_time",
      reason: "Exceeded maximum net work time",
    }
  }

  return null
}

/**
 * Combines multiple capped time items into a single result.
 * Null items and items with zero minutes are ignored.
 *
 * @param items - CappedTime items to aggregate (null items are ignored)
 * @returns Aggregated CappingResult
 */
export function aggregateCapping(
  ...items: (CappedTime | null)[]
): CappingResult {
  const result: CappingResult = {
    totalCapped: 0,
    items: [],
  }

  for (const item of items) {
    if (item !== null && item.minutes > 0) {
      result.items.push(item)
      result.totalCapped += item.minutes
    }
  }

  return result
}
