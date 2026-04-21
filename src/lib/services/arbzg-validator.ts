/**
 * ArbZG Validator — phase 1 (3 rules)
 *
 * Pure logic, no DB access. Consumers (overtime-request-service) build the
 * input via buildArbZGInput and pass it here. Returns a list of warning
 * codes. Does NOT throw — warnings are advisory; approvers override via
 * arbzgOverrideReason.
 *
 * Scope:
 * - §3 ArbZG  Tages-10h            → DAILY_MAX_EXCEEDED
 * - §5 ArbZG  11h-Ruhezeit          → REST_TIME_VIOLATED
 * - §9 ArbZG  Sonn-/Feiertagsarbeit → SUNDAY_WORK
 *
 * Out of scope (follow-up tickets):
 * - §3 Abs. 2 ArbZG (48h/6-Monats-Schnitt)
 * - JArbSchG, MuSchG
 */

export const ARBZG_DAILY_MAX_EXCEEDED = "DAILY_MAX_EXCEEDED"
export const ARBZG_REST_TIME_VIOLATED = "REST_TIME_VIOLATED"
export const ARBZG_SUNDAY_WORK = "SUNDAY_WORK"

export interface ArbZGValidateInput {
  /** The date the overtime is requested for. Time component ignored. */
  date: Date
  /** Extra minutes beyond target to be validated against the daily cap. */
  plannedAdditionalMinutes: number
  /** Target minutes for the day (from DayPlan.regularHours or employee master). */
  currentTargetMinutes: number
  /** Daily cap in minutes (from DayPlan.maxNetWorkTime, fallback 600). */
  maxNetWorkTimeMinutes: number
  /** Last work-out timestamp on the previous calendar day (or null). */
  previousDayLastOutAt: Date | null
  /** Optional first-in of next day (symmetry check). Currently unused. */
  nextDayFirstInAt: Date | null
  /** True if the date is a Sunday or registered Holiday row. */
  isSundayOrHoliday: boolean
}

export function validate(input: ArbZGValidateInput): string[] {
  const warnings: string[] = []

  // §3 ArbZG — daily max net work time.
  const projected = input.currentTargetMinutes + input.plannedAdditionalMinutes
  if (projected > input.maxNetWorkTimeMinutes) {
    warnings.push(ARBZG_DAILY_MAX_EXCEEDED)
  }

  // §5 ArbZG — 11h rest period vs previous day's last out-booking.
  if (input.previousDayLastOutAt) {
    const minimumRestMs = 11 * 60 * 60 * 1000
    const startOfDay = new Date(input.date)
    startOfDay.setUTCHours(0, 0, 0, 0)
    const restMs = startOfDay.getTime() - input.previousDayLastOutAt.getTime()
    if (restMs < minimumRestMs) {
      warnings.push(ARBZG_REST_TIME_VIOLATED)
    }
  }

  // §9 ArbZG — Sunday / public holiday work.
  if (input.isSundayOrHoliday) {
    warnings.push(ARBZG_SUNDAY_WORK)
  }

  return warnings
}
