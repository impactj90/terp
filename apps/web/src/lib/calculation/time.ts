/**
 * Time Utilities for Calculation Engine
 *
 * Constants and functions for time-of-day arithmetic.
 * All times are integers in minutes from midnight (0-1439).
 *
 * Ported from Go: apps/api/internal/timeutil/timeutil.go
 *
 * Note: Functions already available in @/lib/time-utils.ts
 * (timeStringToMinutes, formatTime, isSameDay) are NOT duplicated here.
 */

/** Number of minutes in a day. */
export const MINUTES_PER_DAY = 1440

/** Maximum valid minutes from midnight (23:59). */
export const MAX_MINUTES_FROM_MIDNIGHT = 1439

/**
 * Handles times that span midnight.
 * If endMinutes < startMinutes, adds 1440 to endMinutes.
 *
 * @param startMinutes - Start time in minutes from midnight
 * @param endMinutes - End time in minutes from midnight
 * @returns The normalized end minutes
 * @example normalizeCrossMidnight(1320, 120) // 1560 (22:00 to 02:00 next day)
 * @example normalizeCrossMidnight(480, 1020) // 1020 (no change needed)
 */
export function normalizeCrossMidnight(startMinutes: number, endMinutes: number): number {
  if (endMinutes < startMinutes) {
    return endMinutes + MINUTES_PER_DAY
  }
  return endMinutes
}

/**
 * Checks if minutes represents a valid time of day (0-1439).
 *
 * @param minutes - Minutes from midnight to validate
 * @returns true if the value is a valid time of day
 * @example isValidTimeOfDay(0)    // true
 * @example isValidTimeOfDay(1439) // true
 * @example isValidTimeOfDay(1440) // false
 * @example isValidTimeOfDay(-1)   // false
 */
export function isValidTimeOfDay(minutes: number): boolean {
  return minutes >= 0 && minutes <= MAX_MINUTES_FROM_MIDNIGHT
}
