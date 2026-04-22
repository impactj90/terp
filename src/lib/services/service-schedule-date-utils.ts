/**
 * ServiceSchedule Date Utilities
 *
 * Pure functions for calculating the next due date of a maintenance
 * schedule. Kept free of Prisma imports so the logic is unit-testable
 * in isolation and reusable both at write-time (create/update/record-
 * completion) and in any future cron.
 *
 * Uses native JS date arithmetic (`setDate`/`setMonth`/`setFullYear`)
 * consistent with the `BillingRecurringInvoice.calculateNextDueDate`
 * precedent. NO `date-fns` dependency.
 *
 * Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md (Phase B)
 */

export type ServiceScheduleIntervalType = "TIME_BASED" | "CALENDAR_FIXED"
export type ServiceScheduleIntervalUnit = "DAYS" | "MONTHS" | "YEARS"

/**
 * Advance `base` by `value` units of `unit`. Returns a new Date;
 * does not mutate input.
 *
 * Native JS semantics apply: `setMonth(m+1)` on Jan 31 yields Mar 3
 * (because Feb has no 31st), not Feb 28. This is intentional and
 * consistent with `billing-recurring-invoice-service.ts`.
 */
export function addInterval(
  base: Date,
  value: number,
  unit: ServiceScheduleIntervalUnit,
): Date {
  const next = new Date(base)
  if (unit === "DAYS") next.setDate(next.getDate() + value)
  if (unit === "MONTHS") next.setMonth(next.getMonth() + value)
  if (unit === "YEARS") next.setFullYear(next.getFullYear() + value)
  return next
}

/**
 * Calculate the next due date for a service schedule.
 *
 * Semantics:
 * - TIME_BASED: next due = lastCompletedAt + interval. When the
 *   schedule has never been completed (lastCompletedAt === null),
 *   return null — the caller must render "Noch nie ausgeführt".
 * - CALENDAR_FIXED: next due = anchorDate advanced past `now` (and
 *   past `lastCompletedAt` if that is newer). Returns null only
 *   when `anchorDate` is missing (should be prevented by DB CHECK
 *   and Zod validation).
 *
 * Called exclusively on write paths (create, update, recordCompletion).
 * Reads use the persisted `next_due_at` column — do NOT call this
 * inside list/getById/countByStatus queries.
 */
export function calculateNextDueAt(
  intervalType: ServiceScheduleIntervalType,
  intervalValue: number,
  intervalUnit: ServiceScheduleIntervalUnit,
  lastCompletedAt: Date | null,
  anchorDate: Date | null,
  now: Date,
): Date | null {
  if (intervalType === "TIME_BASED") {
    if (!lastCompletedAt) return null
    return addInterval(lastCompletedAt, intervalValue, intervalUnit)
  }

  // CALENDAR_FIXED
  if (!anchorDate) return null

  let candidate = new Date(anchorDate)
  // Advance past now: the next due date must be in the future relative
  // to `now`. Use strict <= so a candidate equal to now is advanced.
  while (candidate.getTime() <= now.getTime()) {
    candidate = addInterval(candidate, intervalValue, intervalUnit)
  }
  // If lastCompletedAt is already newer than the candidate (e.g. the
  // operator completed the work early), advance further so next due
  // lies strictly after the last completion.
  if (lastCompletedAt && candidate.getTime() <= lastCompletedAt.getTime()) {
    while (candidate.getTime() <= lastCompletedAt.getTime()) {
      candidate = addInterval(candidate, intervalValue, intervalUnit)
    }
  }
  return candidate
}

/**
 * Whole-day difference between `nextDueAt` and `now`. Positive when
 * the due date is in the future, negative when overdue, null when
 * `nextDueAt` is not set.
 */
export function calculateDaysUntilDue(
  nextDueAt: Date | null,
  now: Date,
): number | null {
  if (!nextDueAt) return null
  const diffMs = nextDueAt.getTime() - now.getTime()
  return Math.floor(diffMs / 86_400_000)
}
