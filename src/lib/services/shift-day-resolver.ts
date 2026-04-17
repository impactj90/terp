import {
  DAY_CHANGE_NONE,
  DAY_CHANGE_AT_ARRIVAL,
  DAY_CHANGE_AT_DEPARTURE,
} from "./daily-calc.types"

/**
 * Minimal DayPlan information needed for shift-day resolution.
 * Intentionally decoupled from the full Prisma DayPlan type.
 */
export interface DayPlanInfo {
  dayPlanId: string | null
  dayChangeBehavior: string | null
  comeFrom: number | null
  goTo: number | null
}

export interface EffectiveWorkDayResult {
  /** Should an absence day be booked for this calendar date? */
  isWorkDay: boolean
  /** The calendar date this work day is attributed to (same as input calendarDate when isWorkDay=true) */
  effectiveDate: Date | null
}

/**
 * Detect if a DayPlan represents a night shift (crosses midnight).
 * Heuristic: goTo (departure window end) < comeFrom (arrival window start)
 * e.g. comeFrom=1320 (22:00), goTo=360 (06:00) -> 360 < 1320 -> night shift
 */
export function isNightShiftDayPlan(dayPlan: {
  comeFrom: number | null
  goTo: number | null
}): boolean {
  if (dayPlan.comeFrom === null || dayPlan.goTo === null) return false
  return dayPlan.goTo < dayPlan.comeFrom
}

function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay()
  return dow === 0 || dow === 6
}

/**
 * Determine if a calendar date is an effective work day for absence purposes,
 * given the dayChangeBehavior configuration on adjacent DayPlans.
 *
 * This is the single source of truth for day attribution in night shift contexts.
 * Both DailyCalcService (booking assignment) and AbsenceService (absence day creation)
 * should agree on which calendar day "owns" a shift.
 *
 * Priority-based evaluation:
 * 1. at_arrival arrival check (weekend override)
 * 2. at_departure departure check
 * 3. at_arrival departure exclusion
 * 4. at_departure arrival exclusion
 * 5. Standard fallback (none / auto_complete)
 */
export function resolveEffectiveWorkDay(
  calendarDate: Date,
  dayPlanForDate: DayPlanInfo | null,
  dayPlanForPreviousDate: DayPlanInfo | null,
): EffectiveWorkDayResult {
  const NOT_A_WORK_DAY: EffectiveWorkDayResult = {
    isWorkDay: false,
    effectiveDate: null,
  }
  const IS_WORK_DAY: EffectiveWorkDayResult = {
    isWorkDay: true,
    effectiveDate: calendarDate,
  }

  const isWeekendDay = isWeekend(calendarDate)
  const hasOwnPlan = dayPlanForDate?.dayPlanId != null
  const ownBehavior = dayPlanForDate?.dayChangeBehavior ?? DAY_CHANGE_NONE
  const prevBehavior =
    dayPlanForPreviousDate?.dayChangeBehavior ?? DAY_CHANGE_NONE

  // --- Priority 1: at_arrival — calendarDate IS the arrival day ---
  // The shift starts on calendarDate and ends the next day.
  // Weekend override: arrival on any day is a work day.
  if (
    ownBehavior === DAY_CHANGE_AT_ARRIVAL &&
    hasOwnPlan &&
    isNightShiftDayPlan(dayPlanForDate!)
  ) {
    return IS_WORK_DAY
  }

  // --- Priority 2: at_departure — calendarDate IS the departure day ---
  // The previous day's shift ends on calendarDate.
  // Weekends are NOT overridden in at_departure mode.
  if (
    prevBehavior === DAY_CHANGE_AT_DEPARTURE &&
    dayPlanForPreviousDate?.dayPlanId != null &&
    isNightShiftDayPlan(dayPlanForPreviousDate)
  ) {
    if (isWeekendDay) return NOT_A_WORK_DAY
    return IS_WORK_DAY
  }

  // --- Priority 3: at_arrival exclusion — calendarDate is departure-only ---
  // Previous day's at_arrival night shift ends on calendarDate.
  // CalendarDate is only a work day if it has its own independent (non-night) shift.
  if (
    prevBehavior === DAY_CHANGE_AT_ARRIVAL &&
    dayPlanForPreviousDate?.dayPlanId != null &&
    isNightShiftDayPlan(dayPlanForPreviousDate)
  ) {
    // Own non-night-shift DayPlan -> standard work day
    if (hasOwnPlan && !isNightShiftDayPlan(dayPlanForDate!)) {
      if (isWeekendDay) return NOT_A_WORK_DAY
      return IS_WORK_DAY
    }
    // Departure-only (no own shift, or own shift already handled by Priority 1)
    return NOT_A_WORK_DAY
  }

  // --- Priority 4: at_departure exclusion — calendarDate is arrival-only ---
  // CalendarDate's own at_departure night shift belongs to the next day.
  if (
    ownBehavior === DAY_CHANGE_AT_DEPARTURE &&
    hasOwnPlan &&
    isNightShiftDayPlan(dayPlanForDate!)
  ) {
    return NOT_A_WORK_DAY
  }

  // --- Standard fallback (none, auto_complete, or no night shift context) ---
  if (isWeekendDay) return NOT_A_WORK_DAY
  if (!hasOwnPlan) return NOT_A_WORK_DAY
  return IS_WORK_DAY
}
