const MS_PER_DAY = 24 * 60 * 60 * 1000

export const DEFAULT_PROBATION_MONTHS = 6
export const DEFAULT_PROBATION_REMINDER_DAYS = [28, 14, 7] as const
export const PROBATION_ENDING_SOON_WINDOW_DAYS = 30

export const PROBATION_FILTERS = [
  "ALL",
  "IN_PROBATION",
  "ENDS_IN_30_DAYS",
  "ENDED",
] as const

export type ProbationFilter = (typeof PROBATION_FILTERS)[number]

export const PROBATION_STATUSES = [
  "none",
  "in_probation",
  "ends_in_30_days",
  "ended",
] as const

export type ProbationStatus = (typeof PROBATION_STATUSES)[number]

export type ProbationSnapshot = {
  effectiveMonths: number | null
  endDate: Date | null
  daysRemaining: number | null
  status: ProbationStatus
  showBadge: boolean
}

export class ProbationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProbationValidationError"
  }
}

function isValidDate(date: Date | null | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime())
}

function toUtcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ))
}

function requireValidDate(date: Date | null | undefined, fieldName: string): Date {
  if (!isValidDate(date)) {
    throw new ProbationValidationError(`${fieldName} must be a valid date`)
  }

  return date
}

export function normalizeProbationReminderDays(days: readonly number[]): number[] {
  const normalized = Array.from(
    new Set(
      days.map(day => {
        if (!Number.isInteger(day) || day <= 0) {
          throw new ProbationValidationError(
            "probationReminderDays must contain only positive integers"
          )
        }

        return day
      })
    )
  ).sort((left, right) => right - left)

  if (normalized.length === 0) {
    throw new ProbationValidationError(
      "probationReminderDays must contain at least one reminder stage"
    )
  }

  return normalized
}

export function resolveEffectiveProbationMonths(
  employeeProbationMonths: number | null | undefined,
  tenantDefaultMonths: number | null | undefined
): number | null {
  const candidate = employeeProbationMonths ?? tenantDefaultMonths
  return candidate !== null
    && candidate !== undefined
    && Number.isInteger(candidate)
    ? candidate
    : null
}

export function computeProbationEndDate(entryDate: Date, months: number): Date {
  const normalizedEntryDate = requireValidDate(entryDate, "entryDate")

  if (!Number.isInteger(months) || months < 0) {
    throw new ProbationValidationError(
      "months must be a non-negative integer"
    )
  }

  const year = normalizedEntryDate.getUTCFullYear()
  const month = normalizedEntryDate.getUTCMonth()
  const day = normalizedEntryDate.getUTCDate()

  const targetMonth = month + months
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, targetMonth + 1, 0)
  ).getUTCDate()

  return new Date(Date.UTC(year, targetMonth, Math.min(day, lastDayOfTargetMonth)))
}

export function computeDaysRemaining(
  probationEndDate: Date,
  today: Date = new Date()
): number {
  const normalizedEndDate = toUtcStartOfDay(
    requireValidDate(probationEndDate, "probationEndDate")
  )
  const normalizedToday = toUtcStartOfDay(requireValidDate(today, "today"))

  return Math.round(
    (normalizedEndDate.getTime() - normalizedToday.getTime()) / MS_PER_DAY
  )
}

export function isRelevantProbationCase(input: {
  entryDate: Date | null | undefined
  exitDate?: Date | null | undefined
  effectiveMonths: number | null | undefined
  today?: Date
}): boolean {
  const entryDate = input.entryDate
  const effectiveMonths = input.effectiveMonths

  if (!isValidDate(entryDate)) {
    return false
  }

  if (
    effectiveMonths === null
    || effectiveMonths === undefined
    || !Number.isInteger(effectiveMonths)
    || effectiveMonths <= 0
  ) {
    return false
  }

  if (!isValidDate(input.exitDate)) {
    return true
  }

  const normalizedToday = toUtcStartOfDay(requireValidDate(input.today ?? new Date(), "today"))
  const normalizedExitDate = toUtcStartOfDay(input.exitDate)

  return normalizedExitDate.getTime() > normalizedToday.getTime()
}

export function getProbationStatus(input: {
  entryDate: Date | null | undefined
  exitDate?: Date | null | undefined
  effectiveMonths: number | null | undefined
  today?: Date
}): ProbationStatus {
  if (!isRelevantProbationCase(input)) {
    return "none"
  }

  const entryDate = requireValidDate(input.entryDate, "entryDate")
  const effectiveMonths = input.effectiveMonths as number
  const endDate = computeProbationEndDate(entryDate, effectiveMonths)
  const daysRemaining = computeDaysRemaining(endDate, input.today)

  if (daysRemaining < 0) {
    return "ended"
  }

  if (daysRemaining <= PROBATION_ENDING_SOON_WINDOW_DAYS) {
    return "ends_in_30_days"
  }

  return "in_probation"
}

export function getProbationSnapshot(input: {
  entryDate: Date | null | undefined
  exitDate?: Date | null | undefined
  employeeProbationMonths?: number | null | undefined
  tenantDefaultMonths: number | null | undefined
  today?: Date
}): ProbationSnapshot {
  const effectiveMonths = resolveEffectiveProbationMonths(
    input.employeeProbationMonths,
    input.tenantDefaultMonths
  )
  const today = input.today ?? new Date()
  const hasEndDate = isValidDate(input.entryDate)
    && effectiveMonths !== null
    && Number.isInteger(effectiveMonths)
    && effectiveMonths > 0
  const endDate = hasEndDate
    ? computeProbationEndDate(
      requireValidDate(input.entryDate, "entryDate"),
      effectiveMonths
    )
    : null
  const daysRemaining = endDate ? computeDaysRemaining(endDate, today) : null
  const status = getProbationStatus({
    entryDate: input.entryDate,
    exitDate: input.exitDate,
    effectiveMonths,
    today,
  })

  return {
    effectiveMonths,
    endDate,
    daysRemaining,
    status,
    showBadge: status === "in_probation" || status === "ends_in_30_days",
  }
}
