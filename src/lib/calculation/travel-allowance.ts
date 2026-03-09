/**
 * Travel Allowance Calculation Utility
 *
 * Pure functions for computing local and extended travel allowances.
 * No Prisma or tRPC dependencies -- suitable for server and client use.
 *
 * Ported from Go: apps/api/internal/calculation/travel_allowance.go
 */

// --- Types ---

export interface LocalTravelRuleInput {
  minDistanceKm: number
  maxDistanceKm: number | null
  minDurationMinutes: number
  maxDurationMinutes: number | null
  taxFreeAmount: number
  taxableAmount: number
}

export interface LocalTravelInput {
  distanceKm: number
  durationMinutes: number
  rules: LocalTravelRuleInput[]
}

export interface LocalTravelOutput {
  matched: boolean
  taxFreeTotal: number
  taxableTotal: number
  totalAllowance: number
  matchedRuleIdx: number
}

export interface ExtendedTravelRuleInput {
  arrivalDayTaxFree: number
  arrivalDayTaxable: number
  departureDayTaxFree: number
  departureDayTaxable: number
  intermediateDayTaxFree: number
  intermediateDayTaxable: number
  threeMonthEnabled: boolean
  threeMonthTaxFree: number
  threeMonthTaxable: number
}

export interface ExtendedTravelInput {
  startDate: Date
  endDate: Date
  threeMonthActive: boolean
  rule: ExtendedTravelRuleInput
}

export interface ExtendedTravelBreakdownItem {
  description: string
  days: number
  taxFreeAmount: number
  taxableAmount: number
  taxFreeSubtotal: number
  taxableSubtotal: number
}

export interface ExtendedTravelOutput {
  totalDays: number
  arrivalDays: number
  departureDays: number
  intermediateDays: number
  taxFreeTotal: number
  taxableTotal: number
  totalAllowance: number
  breakdown: ExtendedTravelBreakdownItem[]
}

// --- Functions ---

/**
 * Finds the first matching local travel rule by distance/duration
 * and returns the amounts.
 *
 * Rules are expected to be pre-sorted by the caller
 * (sort_order ASC, min_distance_km ASC).
 * The first rule where the distance and duration fall within
 * the rule's range wins.
 */
export function calculateLocalTravelAllowance(
  input: LocalTravelInput
): LocalTravelOutput {
  const output: LocalTravelOutput = {
    matched: false,
    taxFreeTotal: 0,
    taxableTotal: 0,
    totalAllowance: 0,
    matchedRuleIdx: -1,
  }

  for (let i = 0; i < input.rules.length; i++) {
    const rule = input.rules[i]!

    // Check distance range
    if (input.distanceKm < rule.minDistanceKm) {
      continue
    }
    if (rule.maxDistanceKm !== null && input.distanceKm > rule.maxDistanceKm) {
      continue
    }

    // Check duration range
    if (input.durationMinutes < rule.minDurationMinutes) {
      continue
    }
    if (
      rule.maxDurationMinutes !== null &&
      input.durationMinutes > rule.maxDurationMinutes
    ) {
      continue
    }

    // First matching rule wins
    output.matched = true
    output.matchedRuleIdx = i
    output.taxFreeTotal = rule.taxFreeAmount
    output.taxableTotal = rule.taxableAmount
    output.totalAllowance = rule.taxFreeAmount + rule.taxableAmount
    return output
  }

  return output
}

/**
 * Computes the allowance for a multi-day trip.
 *
 * Day calculation (inclusive):
 *   - Same day (1 day): 1 arrival day only
 *   - 2 days: 1 arrival day + 1 departure day
 *   - 3+ days: 1 arrival day + (N-2) intermediate days + 1 departure day
 *
 * Three-month rule: if threeMonthActive && rule.threeMonthEnabled,
 * intermediate days use the reduced three-month rates instead of
 * regular intermediate rates.
 */
export function calculateExtendedTravelAllowance(
  input: ExtendedTravelInput
): ExtendedTravelOutput {
  const output: ExtendedTravelOutput = {
    totalDays: 0,
    arrivalDays: 0,
    departureDays: 0,
    intermediateDays: 0,
    taxFreeTotal: 0,
    taxableTotal: 0,
    totalAllowance: 0,
    breakdown: [],
  }

  // Calculate total days (inclusive)
  const msPerDay = 24 * 60 * 60 * 1000
  let totalDays =
    Math.floor(
      (input.endDate.getTime() - input.startDate.getTime()) / msPerDay
    ) + 1
  if (totalDays < 1) {
    totalDays = 1
  }
  output.totalDays = totalDays

  const rule = input.rule

  if (totalDays === 1) {
    // Same day: treat as 1 arrival day
    output.arrivalDays = 1
    output.departureDays = 0
    output.intermediateDays = 0

    output.breakdown.push({
      description: "Arrival day",
      days: 1,
      taxFreeAmount: rule.arrivalDayTaxFree,
      taxableAmount: rule.arrivalDayTaxable,
      taxFreeSubtotal: rule.arrivalDayTaxFree,
      taxableSubtotal: rule.arrivalDayTaxable,
    })

    output.taxFreeTotal = rule.arrivalDayTaxFree
    output.taxableTotal = rule.arrivalDayTaxable
  } else if (totalDays === 2) {
    // 2 days: arrival + departure
    output.arrivalDays = 1
    output.departureDays = 1
    output.intermediateDays = 0

    output.breakdown.push({
      description: "Arrival day",
      days: 1,
      taxFreeAmount: rule.arrivalDayTaxFree,
      taxableAmount: rule.arrivalDayTaxable,
      taxFreeSubtotal: rule.arrivalDayTaxFree,
      taxableSubtotal: rule.arrivalDayTaxable,
    })
    output.breakdown.push({
      description: "Departure day",
      days: 1,
      taxFreeAmount: rule.departureDayTaxFree,
      taxableAmount: rule.departureDayTaxable,
      taxFreeSubtotal: rule.departureDayTaxFree,
      taxableSubtotal: rule.departureDayTaxable,
    })

    output.taxFreeTotal = rule.arrivalDayTaxFree + rule.departureDayTaxFree
    output.taxableTotal = rule.arrivalDayTaxable + rule.departureDayTaxable
  } else {
    // 3+ days: arrival + intermediate + departure
    const intermediateDays = totalDays - 2
    output.arrivalDays = 1
    output.departureDays = 1
    output.intermediateDays = intermediateDays

    // Arrival day
    output.breakdown.push({
      description: "Arrival day",
      days: 1,
      taxFreeAmount: rule.arrivalDayTaxFree,
      taxableAmount: rule.arrivalDayTaxable,
      taxFreeSubtotal: rule.arrivalDayTaxFree,
      taxableSubtotal: rule.arrivalDayTaxable,
    })

    // Intermediate days
    let intTaxFree: number
    let intTaxable: number

    if (input.threeMonthActive && rule.threeMonthEnabled) {
      // Use reduced three-month rates
      intTaxFree = rule.threeMonthTaxFree
      intTaxable = rule.threeMonthTaxable
      output.breakdown.push({
        description: `Intermediate days (three-month rule) x${intermediateDays}`,
        days: intermediateDays,
        taxFreeAmount: intTaxFree,
        taxableAmount: intTaxable,
        taxFreeSubtotal: intTaxFree * intermediateDays,
        taxableSubtotal: intTaxable * intermediateDays,
      })
    } else {
      intTaxFree = rule.intermediateDayTaxFree
      intTaxable = rule.intermediateDayTaxable
      output.breakdown.push({
        description: `Intermediate days x${intermediateDays}`,
        days: intermediateDays,
        taxFreeAmount: intTaxFree,
        taxableAmount: intTaxable,
        taxFreeSubtotal: intTaxFree * intermediateDays,
        taxableSubtotal: intTaxable * intermediateDays,
      })
    }

    // Departure day
    output.breakdown.push({
      description: "Departure day",
      days: 1,
      taxFreeAmount: rule.departureDayTaxFree,
      taxableAmount: rule.departureDayTaxable,
      taxFreeSubtotal: rule.departureDayTaxFree,
      taxableSubtotal: rule.departureDayTaxable,
    })

    output.taxFreeTotal =
      rule.arrivalDayTaxFree +
      intTaxFree * intermediateDays +
      rule.departureDayTaxFree
    output.taxableTotal =
      rule.arrivalDayTaxable +
      intTaxable * intermediateDays +
      rule.departureDayTaxable
  }

  output.totalAllowance = output.taxFreeTotal + output.taxableTotal

  return output
}
