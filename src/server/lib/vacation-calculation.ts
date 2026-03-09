/**
 * Vacation Entitlement Calculation
 *
 * Ported from: apps/api/internal/calculation/vacation.go
 * Computes vacation entitlement with pro-rating, part-time adjustment,
 * and special calculation bonuses (age, tenure, disability).
 */

// --- Types ---

export type VacationBasis = "calendar_year" | "entry_date"
export type SpecialCalcType = "age" | "tenure" | "disability"

export interface VacationSpecialCalc {
  type: SpecialCalcType
  threshold: number // Age in years (age), tenure in years (tenure), ignored for disability
  bonusDays: number // Additional vacation days to add
}

export interface VacationCalcInput {
  // Employee data
  birthDate: Date
  entryDate: Date
  exitDate: Date | null
  weeklyHours: number
  hasDisability: boolean

  // Configuration (from tariff)
  baseVacationDays: number // Jahresurlaub
  standardWeeklyHours: number // Full-time weekly hours (e.g., 40)
  basis: VacationBasis // calendar_year or entry_date
  specialCalcs: VacationSpecialCalc[]

  // Calculation context
  year: number
  referenceDate: Date // Date to evaluate age/tenure at
}

export interface VacationCalcOutput {
  baseEntitlement: number
  proRatedEntitlement: number
  partTimeAdjustment: number
  ageBonus: number
  tenureBonus: number
  disabilityBonus: number
  totalEntitlement: number
  monthsEmployed: number
  ageAtReference: number
  tenureYears: number
}

// --- Core Functions ---

export function calculateVacation(input: VacationCalcInput): VacationCalcOutput {
  const output: VacationCalcOutput = {
    baseEntitlement: 0,
    proRatedEntitlement: 0,
    partTimeAdjustment: 0,
    ageBonus: 0,
    tenureBonus: 0,
    disabilityBonus: 0,
    totalEntitlement: 0,
    monthsEmployed: 0,
    ageAtReference: 0,
    tenureYears: 0,
  }

  // Step 1 - Reference Metrics
  output.ageAtReference = calculateAge(input.birthDate, input.referenceDate)
  output.tenureYears = calculateTenure(input.entryDate, input.referenceDate)

  // Step 2 - Months Employed
  output.monthsEmployed = calculateMonthsEmployedInYear(
    input.entryDate,
    input.exitDate,
    input.year,
    input.basis
  )

  // Step 3 - Pro-Rate by Months
  output.baseEntitlement = input.baseVacationDays
  if (output.monthsEmployed < 12) {
    output.proRatedEntitlement =
      input.baseVacationDays * (output.monthsEmployed / 12)
  } else {
    output.proRatedEntitlement = input.baseVacationDays
  }

  // Step 4 - Part-Time Adjustment
  if (input.standardWeeklyHours > 0) {
    const partTimeFactor = input.weeklyHours / input.standardWeeklyHours
    output.partTimeAdjustment = output.proRatedEntitlement * partTimeFactor
  } else {
    output.partTimeAdjustment = output.proRatedEntitlement
  }

  // Step 5 - Special Calculations (Bonuses)
  for (const sc of input.specialCalcs) {
    switch (sc.type) {
      case "age":
        if (output.ageAtReference >= sc.threshold) {
          output.ageBonus += sc.bonusDays
        }
        break
      case "tenure":
        if (output.tenureYears >= sc.threshold) {
          output.tenureBonus += sc.bonusDays
        }
        break
      case "disability":
        if (input.hasDisability) {
          output.disabilityBonus += sc.bonusDays
        }
        break
    }
  }

  // Step 6 - Total
  output.totalEntitlement =
    output.partTimeAdjustment +
    output.ageBonus +
    output.tenureBonus +
    output.disabilityBonus

  // Step 7 - Rounding to half-day
  output.totalEntitlement = roundToHalfDay(output.totalEntitlement)

  return output
}

// --- Helper Functions (all exported for testing) ---

export function calculateAge(birthDate: Date, referenceDate: Date): number {
  let years = referenceDate.getFullYear() - birthDate.getFullYear()
  const refMonth = referenceDate.getMonth()
  const refDay = referenceDate.getDate()
  const birthMonth = birthDate.getMonth()
  const birthDay = birthDate.getDate()
  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    years--
  }
  return Math.max(0, years)
}

export function calculateTenure(entryDate: Date, referenceDate: Date): number {
  if (referenceDate < entryDate) return 0
  let years = referenceDate.getFullYear() - entryDate.getFullYear()
  const refMonth = referenceDate.getMonth()
  const refDay = referenceDate.getDate()
  const entryMonth = entryDate.getMonth()
  const entryDay = entryDate.getDate()
  if (
    refMonth < entryMonth ||
    (refMonth === entryMonth && refDay < entryDay)
  ) {
    years--
  }
  return Math.max(0, years)
}

export function calculateMonthsEmployedInYear(
  entryDate: Date,
  exitDate: Date | null,
  year: number,
  basis: VacationBasis
): number {
  let periodStart: Date
  let periodEnd: Date

  if (basis === "calendar_year") {
    periodStart = new Date(Date.UTC(year, 0, 1))
    periodEnd = new Date(Date.UTC(year, 11, 31))
  } else {
    periodStart = new Date(
      Date.UTC(year, entryDate.getMonth(), entryDate.getDate())
    )
    periodEnd = new Date(
      Date.UTC(year + 1, entryDate.getMonth(), entryDate.getDate())
    )
    periodEnd.setUTCDate(periodEnd.getUTCDate() - 1)
  }

  let effectiveStart = periodStart
  if (entryDate > periodStart) {
    effectiveStart = entryDate
  }

  let effectiveEnd = periodEnd
  if (exitDate && exitDate < periodEnd) {
    effectiveEnd = exitDate
  }

  if (effectiveStart > effectiveEnd) return 0

  let months = 0
  const current = new Date(effectiveStart)
  while (current <= effectiveEnd) {
    months++
    current.setUTCMonth(current.getUTCMonth() + 1)
  }

  return Math.min(months, 12)
}

export function roundToHalfDay(value: number): number {
  return Math.round(value * 2) / 2
}
