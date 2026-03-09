/**
 * DailyCalcService Pure Helper Functions
 *
 * All pure (non-DB) functions used by the DailyCalcService.
 * Ported 1:1 from Go: apps/api/internal/service/daily_calc.go
 *
 * These functions have no side effects and no database dependencies.
 */

import type {
  BookingWithType,
  CrossDayBooking,
  CrossDayPair,
  DayPlanWithDetails,
} from "./daily-calc.types"
import {
  BREAK_CODES,
  DAY_CHANGE_AT_ARRIVAL,
  DAY_CHANGE_AT_DEPARTURE,
} from "./daily-calc.types"
import type { SurchargeConfig } from "@/lib/calculation"

// --- Date helpers ---

/**
 * Compare two dates by UTC year/month/day only (ignores time component).
 * Ported from Go: sameDate() (line 902-906)
 */
export function sameDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/**
 * Add (or subtract) days from a UTC date, returning a new Date at midnight UTC.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

/**
 * Strip time component, returning midnight UTC for the given date.
 */
export function dateOnly(date: Date): Date {
  const result = new Date(date)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

// --- Booking classification helpers ---

/**
 * Check if a booking is a break booking based on its BookingType code.
 * Ported from Go: isBreakBooking() (lines 908-913)
 */
export function isBreakBooking(b: BookingWithType): boolean {
  if (!b.bookingType) return false
  return isBreakBookingType(b.bookingType.code)
}

/**
 * Check if a booking type code indicates a break.
 * Ported from Go: isBreakBookingType() (lines 915-922)
 */
export function isBreakBookingType(code: string): boolean {
  return BREAK_CODES.has(code.toUpperCase())
}

/**
 * Get the direction of a booking from its BookingType.
 * Defaults to "in" if no bookingType or direction is not "out".
 * Ported from Go: bookingDirection() (lines 924-929)
 */
export function bookingDirection(b: BookingWithType): "in" | "out" {
  if (b.bookingType && b.bookingType.direction === "out") {
    return "out"
  }
  return "in"
}

/**
 * Get the effective time for a booking: calculatedTime if set, else editedTime.
 * Ported from Go: model.Booking.EffectiveTime()
 */
export function effectiveTime(b: BookingWithType): number {
  return b.calculatedTime ?? b.editedTime
}

// --- Sorting and filtering ---

/**
 * Sort bookings by bookingDate, then editedTime, then id (stable sort).
 * Accepts a map (like Go) and returns a sorted array.
 * Ported from Go: sortedBookings() (lines 884-900)
 */
export function sortedBookingsFromMap(
  selected: Map<string, BookingWithType>
): BookingWithType[] {
  const result = Array.from(selected.values())
  result.sort((a, b) => {
    const da = a.bookingDate.getTime()
    const db2 = b.bookingDate.getTime()
    if (da === db2) {
      if (a.editedTime === b.editedTime) {
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      }
      return a.editedTime - b.editedTime
    }
    return da - db2
  })
  return result
}

/**
 * Sort an array of bookings by bookingDate, then editedTime, then id.
 */
export function sortedBookings(bookings: BookingWithType[]): BookingWithType[] {
  return [...bookings].sort((a, b) => {
    const da = a.bookingDate.getTime()
    const db2 = b.bookingDate.getTime()
    if (da === db2) {
      if (a.editedTime === b.editedTime) {
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      }
      return a.editedTime - b.editedTime
    }
    return da - db2
  })
}

/**
 * Filter bookings to only include those matching the given date.
 * Deduplicates by ID, returns sorted.
 * Ported from Go: filterBookingsByDate() (lines 874-882)
 */
export function filterBookingsByDate(
  bookings: BookingWithType[],
  date: Date
): BookingWithType[] {
  const selected = new Map<string, BookingWithType>()
  for (const b of bookings) {
    if (sameDate(b.bookingDate, date)) {
      selected.set(b.id, b)
    }
  }
  return sortedBookingsFromMap(selected)
}

/**
 * Partition bookings into prev/current/next arrays by date comparison.
 * Ported from Go: partitionBookingsByDate() (lines 857-872)
 */
export function partitionBookingsByDate(
  bookings: BookingWithType[],
  date: Date
): {
  prev: BookingWithType[]
  current: BookingWithType[]
  next: BookingWithType[]
} {
  const prevDate = addDays(date, -1)
  const nextDate = addDays(date, 1)
  const prev: BookingWithType[] = []
  const current: BookingWithType[] = []
  const next: BookingWithType[] = []

  for (const b of bookings) {
    if (sameDate(b.bookingDate, prevDate)) {
      prev.push(b)
    } else if (sameDate(b.bookingDate, date)) {
      current.push(b)
    } else if (sameDate(b.bookingDate, nextDate)) {
      next.push(b)
    }
  }

  return { prev, current, next }
}

// --- Cross-day pairing ---

/**
 * Pair work bookings across days for day-change behavior.
 * Builds CrossDayBooking[] with offsets, sorts by absTime,
 * then pairs IN/OUT bookings FIFO-style.
 * Ported from Go: pairWorkBookingsAcrossDays() (lines 805-855)
 */
export function pairWorkBookingsAcrossDays(
  prev: BookingWithType[],
  current: BookingWithType[],
  next: BookingWithType[]
): CrossDayPair[] {
  const workBookings: CrossDayBooking[] = []

  const appendWork = (bookings: BookingWithType[], offset: number) => {
    for (const b of bookings) {
      if (isBreakBooking(b)) continue
      const dir = bookingDirection(b)
      if (dir !== "in" && dir !== "out") continue
      workBookings.push({
        booking: b,
        offset,
        absTime: offset * 1440 + b.editedTime,
      })
    }
  }

  appendWork(prev, -1)
  appendWork(current, 0)
  appendWork(next, 1)

  // Sort by absTime, then by id for stability
  workBookings.sort((a, b) => {
    if (a.absTime === b.absTime) {
      return a.booking.id < b.booking.id ? -1 : a.booking.id > b.booking.id ? 1 : 0
    }
    return a.absTime - b.absTime
  })

  // FIFO pairing: first open arrival matches next departure
  const pairs: CrossDayPair[] = []
  const openArrivals: CrossDayBooking[] = []

  for (const wb of workBookings) {
    if (bookingDirection(wb.booking) === "in") {
      openArrivals.push(wb)
      continue
    }
    // It's an OUT booking
    if (openArrivals.length === 0) continue
    const arrival = openArrivals.shift()!
    pairs.push({ arrival, departure: wb })
  }

  return pairs
}

// --- Day change behavior ---

/**
 * Apply day change behavior (at_arrival or at_departure) to select
 * which bookings belong to this day.
 * Ported from Go: applyDayChangeBehavior() (lines 655-690)
 */
export function applyDayChangeBehavior(
  date: Date,
  behavior: string,
  bookings: BookingWithType[]
): BookingWithType[] {
  const { prev, current, next } = partitionBookingsByDate(bookings, date)
  const pairs = pairWorkBookingsAcrossDays(prev, current, next)

  const selected = new Map<string, BookingWithType>()
  for (const b of current) {
    selected.set(b.id, b)
  }

  switch (behavior) {
    case DAY_CHANGE_AT_ARRIVAL:
      for (const pair of pairs) {
        // Arrival on current day, departure on next day -> include departure
        if (pair.arrival.offset === 0 && pair.departure.offset === 1) {
          selected.set(pair.departure.booking.id, pair.departure.booking)
        }
        // Arrival on previous day, departure on current day -> exclude departure
        if (pair.arrival.offset === -1 && pair.departure.offset === 0) {
          selected.delete(pair.departure.booking.id)
        }
      }
      break

    case DAY_CHANGE_AT_DEPARTURE:
      for (const pair of pairs) {
        // Departure on current day, arrival on previous day -> include arrival
        if (pair.departure.offset === 0 && pair.arrival.offset === -1) {
          selected.set(pair.arrival.booking.id, pair.arrival.booking)
        }
        // Departure on next day, arrival on current day -> exclude arrival
        if (pair.departure.offset === 1 && pair.arrival.offset === 0) {
          selected.delete(pair.arrival.booking.id)
        }
      }
      break
  }

  return sortedBookingsFromMap(selected)
}

// --- First/Last work booking times ---

/**
 * Find the earliest IN and latest OUT times among non-break bookings.
 * Ported from Go: findFirstLastWorkBookings() (lines 977-996)
 */
export function findFirstLastWorkBookings(
  bookings: BookingWithType[]
): { firstCome: number | null; lastGo: number | null } {
  let firstCome: number | null = null
  let lastGo: number | null = null

  for (const b of bookings) {
    if (isBreakBooking(b)) continue
    const dir = bookingDirection(b)
    if (dir === "in") {
      if (firstCome === null || b.editedTime < firstCome) {
        firstCome = b.editedTime
      }
    } else if (dir === "out") {
      if (lastGo === null || b.editedTime > lastGo) {
        lastGo = b.editedTime
      }
    }
  }

  return { firstCome, lastGo }
}

// --- DayPlan helpers ---

/**
 * Get holiday credit from a day plan based on category.
 * Ported from Go: DayPlan.GetHolidayCredit()
 */
export function getHolidayCredit(
  dayPlan: DayPlanWithDetails,
  category: number
): number {
  switch (category) {
    case 1:
      return dayPlan.holidayCreditCat1 ?? 0
    case 2:
      return dayPlan.holidayCreditCat2 ?? 0
    case 3:
      return dayPlan.holidayCreditCat3 ?? 0
    default:
      return 0
  }
}

/**
 * Check if a day plan has shift detection configured.
 * True if any of the 4 shift detect fields are non-null.
 * Ported from Go: DayPlan.HasShiftDetection()
 */
export function hasShiftDetection(dayPlan: DayPlanWithDetails): boolean {
  return (
    dayPlan.shiftDetectArriveFrom !== null ||
    dayPlan.shiftDetectArriveTo !== null ||
    dayPlan.shiftDetectDepartFrom !== null ||
    dayPlan.shiftDetectDepartTo !== null
  )
}

/**
 * Collect non-null alternative plan IDs (up to 6).
 * Ported from Go: DayPlan.GetAlternativePlanIDs()
 */
export function getAlternativePlanIDs(dayPlan: DayPlanWithDetails): string[] {
  const ids: string[] = []
  if (dayPlan.shiftAltPlan1) ids.push(dayPlan.shiftAltPlan1)
  if (dayPlan.shiftAltPlan2) ids.push(dayPlan.shiftAltPlan2)
  if (dayPlan.shiftAltPlan3) ids.push(dayPlan.shiftAltPlan3)
  if (dayPlan.shiftAltPlan4) ids.push(dayPlan.shiftAltPlan4)
  if (dayPlan.shiftAltPlan5) ids.push(dayPlan.shiftAltPlan5)
  if (dayPlan.shiftAltPlan6) ids.push(dayPlan.shiftAltPlan6)
  return ids
}

/**
 * Get effective regular hours using the ZMI priority chain:
 * 1. Employee master (if configured and provided)
 * 2. regularHours2 (if absence day)
 * 3. regularHours (default)
 * Ported from Go: DayPlan.GetEffectiveRegularHours()
 */
export function getEffectiveRegularHours(
  dayPlan: DayPlanWithDetails,
  isAbsenceDay: boolean,
  employeeTargetMinutes: number | null
): number {
  // 1. If dayPlan.fromEmployeeMaster and employee has target minutes
  if (dayPlan.fromEmployeeMaster && employeeTargetMinutes !== null) {
    return employeeTargetMinutes
  }

  // 2. If absence day and regularHours2 is set
  if (isAbsenceDay && dayPlan.regularHours2 !== null) {
    return dayPlan.regularHours2
  }

  // 3. Default
  return dayPlan.regularHours
}

// --- Bonus to surcharge config conversion ---

/**
 * Convert DayPlanBonus[] to SurchargeConfig[] for the calculation engine.
 * This was ConvertBonusesToSurchargeConfigs() in Go.
 */
export function convertBonusesToSurchargeConfigs(
  bonuses: DayPlanWithDetails["bonuses"]
): SurchargeConfig[] {
  return bonuses.map((bonus) => ({
    accountId: bonus.accountId,
    accountCode: bonus.account?.code ?? "",
    timeFrom: bonus.timeFrom,
    timeTo: bonus.timeTo,
    appliesOnHoliday: bonus.appliesOnHoliday,
    appliesOnWorkday: !bonus.appliesOnHoliday,
    holidayCategories: [], // Not yet supported
    calculationType: bonus.calculationType || "per_minute",
    valueMinutes: bonus.valueMinutes,
    minWorkMinutes: bonus.minWorkMinutes,
  }))
}

// --- AbsenceDay credit calculation ---

/**
 * Get credit multiplier from absence type portion.
 * Ported from Go: AbsenceType.CreditMultiplier()
 * 0 -> 0.0, 1 -> 1.0, 2 -> 0.5, default -> 1.0
 */
export function getCreditMultiplier(portion: number): number {
  switch (portion) {
    case 0:
      return 0.0
    case 1:
      return 1.0
    case 2:
      return 0.5
    default:
      return 1.0
  }
}

/**
 * Calculate absence credit: regelarbeitszeit * creditMultiplier(portion) * duration.
 * Ported from Go: AbsenceDay.CalculateCredit()
 */
export function calculateAbsenceCredit(
  regelarbeitszeit: number,
  portion: number,
  duration: number
): number {
  return Math.floor(regelarbeitszeit * getCreditMultiplier(portion) * duration)
}
