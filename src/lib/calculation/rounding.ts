/**
 * Rounding Logic
 *
 * Applies rounding to booking times based on configuration.
 * Supports interval-based rounding (up/down/nearest) and fixed
 * add/subtract offsets. Optionally anchors rounding grid to a
 * specific time instead of midnight.
 *
 * Ported from Go: apps/api/internal/calculation/rounding.go
 */

import type { RoundingConfig } from "./types"

/**
 * Applies rounding to a time value based on configuration.
 * Returns the original time if config is null or has "none" type.
 *
 * When config.anchorTime is set, interval-based rounding (up/down/nearest)
 * uses a grid anchored at the anchor time instead of midnight (00:00).
 * This implements the "Abgleich relativ zur Kommt-/Gehtzeit" feature (ZMI Section 7.8).
 *
 * @param minutes - Time in minutes from midnight
 * @param config - Rounding configuration (null = no rounding)
 * @returns Rounded time in minutes
 *
 * @example
 * // Round up to nearest 15 minutes
 * roundTime(483, { type: "up", interval: 15, addValue: 0, anchorTime: null })
 * // => 495
 */
export function roundTime(minutes: number, config: RoundingConfig | null): number {
  if (config === null || config.type === "none") {
    return minutes
  }

  switch (config.type) {
    case "up":
      if (config.interval <= 0) {
        return minutes
      }
      return roundUpAnchored(minutes, config.interval, config.anchorTime)

    case "down":
      if (config.interval <= 0) {
        return minutes
      }
      return roundDownAnchored(minutes, config.interval, config.anchorTime)

    case "nearest":
      if (config.interval <= 0) {
        return minutes
      }
      return roundNearestAnchored(minutes, config.interval, config.anchorTime)

    case "add":
      if (config.addValue <= 0) {
        return minutes
      }
      return roundAdd(minutes, config.addValue)

    case "subtract":
      if (config.addValue <= 0) {
        return minutes
      }
      return roundSubtract(minutes, config.addValue)

    default:
      return minutes
  }
}

/**
 * Applies rounding to an arrival time. Delegates to roundTime.
 *
 * @param minutes - Arrival time in minutes from midnight
 * @param config - Rounding configuration
 * @returns Rounded time
 */
export function roundComeTime(minutes: number, config: RoundingConfig | null): number {
  return roundTime(minutes, config)
}

/**
 * Applies rounding to a departure time. Delegates to roundTime.
 *
 * @param minutes - Departure time in minutes from midnight
 * @param config - Rounding configuration
 * @returns Rounded time
 */
export function roundGoTime(minutes: number, config: RoundingConfig | null): number {
  return roundTime(minutes, config)
}

// --- Internal helpers ---

function roundUp(minutes: number, interval: number): number {
  const remainder = minutes % interval
  if (remainder === 0) {
    return minutes
  }
  return minutes + (interval - remainder)
}

function roundDown(minutes: number, interval: number): number {
  return minutes - (minutes % interval)
}

function roundNearest(minutes: number, interval: number): number {
  const remainder = minutes % interval
  if (remainder <= Math.floor(interval / 2)) {
    return roundDown(minutes, interval)
  }
  return roundUp(minutes, interval)
}

// Anchored rounding: shifts time relative to anchor, rounds, shifts back.
// Creates a rounding grid centered on the anchor time.
// Example: anchor=423 (07:03), interval=5
//   Grid: ...418, 423, 428, 433...
//   Time 420 -> offset=-3 -> roundUp(-3,5)=0 -> result=423
//   Time 425 -> offset=2  -> roundUp(2,5)=5  -> result=428

function roundUpAnchored(minutes: number, interval: number, anchor: number | null): number {
  if (anchor === null) {
    return roundUp(minutes, interval)
  }
  const offset = minutes - anchor
  const rounded = roundUpOffset(offset, interval)
  return anchor + rounded
}

function roundDownAnchored(minutes: number, interval: number, anchor: number | null): number {
  if (anchor === null) {
    return roundDown(minutes, interval)
  }
  const offset = minutes - anchor
  const rounded = roundDownOffset(offset, interval)
  return anchor + rounded
}

function roundNearestAnchored(minutes: number, interval: number, anchor: number | null): number {
  if (anchor === null) {
    return roundNearest(minutes, interval)
  }
  const offset = minutes - anchor
  const rounded = roundNearestOffset(offset, interval)
  return anchor + rounded
}

// roundUpOffset rounds up supporting negative offsets.
// JS % operator returns negative remainders for negative dividends (same as Go).
function roundUpOffset(offset: number, interval: number): number {
  if (offset === 0) {
    return 0
  }
  const remainder = offset % interval
  if (remainder === 0) {
    return offset
  }
  if (remainder > 0) {
    return offset + (interval - remainder)
  }
  // remainder < 0: e.g., offset=-3, interval=5, remainder=-3 -> result=0
  return offset - remainder
}

// roundDownOffset rounds down supporting negative offsets.
function roundDownOffset(offset: number, interval: number): number {
  if (offset === 0) {
    return 0
  }
  const remainder = offset % interval
  if (remainder === 0) {
    return offset
  }
  if (remainder > 0) {
    return offset - remainder
  }
  // remainder < 0: e.g., offset=-3, interval=5, remainder=-3 -> result=-5
  return offset - (interval + remainder)
}

// roundNearestOffset rounds to the nearest interval point, supporting negative offsets.
// For "nearest" semantics we always round toward the closest grid point:
//   - Small remainder (abs <= half interval): round toward zero
//   - Large remainder (abs > half interval): round away from zero
function roundNearestOffset(offset: number, interval: number): number {
  const remainder = offset % interval
  const absRemainder = Math.abs(remainder)

  if (absRemainder <= Math.floor(interval / 2)) {
    // Round toward zero (closest grid point for small remainders)
    if (offset >= 0) {
      return roundDownOffset(offset, interval)
    }
    return roundUpOffset(offset, interval)
  }
  // Round away from zero (closest grid point for large remainders)
  if (offset >= 0) {
    return roundUpOffset(offset, interval)
  }
  return roundDownOffset(offset, interval)
}

// roundAdd adds a fixed value to the time.
function roundAdd(minutes: number, value: number): number {
  return minutes + value
}

// roundSubtract subtracts a fixed value from the time, clamped at 0.
function roundSubtract(minutes: number, value: number): number {
  const result = minutes - value
  if (result < 0) {
    return 0
  }
  return result
}
