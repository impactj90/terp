/**
 * Monthly Calculation Engine
 *
 * Pure-function module for monthly aggregation and flextime credit type rules.
 * No database access, no side effects.
 *
 * Ported from Go: apps/api/internal/calculation/monthly.go (250 lines)
 */

import type { Decimal } from "@prisma/client/runtime/client"
import {
  WARN_MONTHLY_CAP_REACHED,
  WARN_FLEXTIME_CAPPED,
  WARN_BELOW_THRESHOLD,
  WARN_NO_CARRYOVER,
} from "./errors"

// --- Credit Type ---

/** CreditType defines how overtime is credited to the flextime account (Art der Gutschrift). */
export type CreditType =
  | "no_evaluation"
  | "complete_carryover"
  | "after_threshold"
  | "no_carryover"

/** Transfers overtime/undertime directly 1:1 with no limits. */
export const CREDIT_TYPE_NO_EVALUATION: CreditType = "no_evaluation"
/** Transfers overtime with monthly and balance caps. */
export const CREDIT_TYPE_COMPLETE_CARRYOVER: CreditType = "complete_carryover"
/** Only credits overtime exceeding the threshold. */
export const CREDIT_TYPE_AFTER_THRESHOLD: CreditType = "after_threshold"
/** Resets the flextime balance to zero each month. */
export const CREDIT_TYPE_NO_CARRYOVER: CreditType = "no_carryover"

// --- Input / Output Types ---

/** Simplified daily value for monthly aggregation. */
export interface DailyValueInput {
  date: string // YYYY-MM-DD
  grossTime: number // Minutes
  netTime: number // Minutes
  targetTime: number // Minutes
  overtime: number // Minutes (positive)
  undertime: number // Minutes (positive, to subtract)
  breakTime: number // Minutes
  hasError: boolean
}

/** ZMI monthly evaluation rules. */
export interface MonthlyEvaluationInput {
  creditType: CreditType
  flextimeThreshold: number | null // Threshold for after_threshold mode
  maxFlextimePerMonth: number | null // Monthly credit cap
  flextimeCapPositive: number | null // Upper balance limit
  flextimeCapNegative: number | null // Lower balance limit (stored as positive value)
  annualFloorBalance: number | null // Year-end annual floor
}

/** Pre-computed absence data. */
export interface AbsenceSummaryInput {
  vacationDays: Decimal
  sickDays: number
  otherAbsenceDays: number
}

/** All data needed for monthly aggregation calculation. */
export interface MonthlyCalcInput {
  dailyValues: DailyValueInput[]
  previousCarryover: number // Flextime balance from previous month (minutes)
  evaluationRules: MonthlyEvaluationInput | null // null = no evaluation
  absenceSummary: AbsenceSummaryInput
}

/** Results of monthly aggregation calculation. */
export interface MonthlyCalcOutput {
  // Aggregated totals (all in minutes)
  totalGrossTime: number
  totalNetTime: number
  totalTargetTime: number
  totalOvertime: number
  totalUndertime: number
  totalBreakTime: number

  // Flextime tracking (all in minutes)
  flextimeStart: number // PreviousCarryover
  flextimeChange: number // TotalOvertime - TotalUndertime
  flextimeRaw: number // FlextimeStart + FlextimeChange
  flextimeCredited: number // Amount actually credited after rules
  flextimeForfeited: number // Amount forfeited due to rules
  flextimeEnd: number // Final balance after all rules

  // Work summary
  workDays: number
  daysWithErrors: number

  // Absence copy
  vacationTaken: Decimal
  sickDays: number
  otherAbsenceDays: number

  // Warnings
  warnings: string[]
}

// --- Public Functions ---

/**
 * Aggregates daily values into monthly totals and applies
 * ZMI-compliant credit type rules for flextime carryover.
 */
export function calculateMonth(input: MonthlyCalcInput): MonthlyCalcOutput {
  const output: MonthlyCalcOutput = {
    totalGrossTime: 0,
    totalNetTime: 0,
    totalTargetTime: 0,
    totalOvertime: 0,
    totalUndertime: 0,
    totalBreakTime: 0,
    flextimeStart: input.previousCarryover,
    flextimeChange: 0,
    flextimeRaw: 0,
    flextimeCredited: 0,
    flextimeForfeited: 0,
    flextimeEnd: 0,
    workDays: 0,
    daysWithErrors: 0,
    vacationTaken: input.absenceSummary.vacationDays,
    sickDays: input.absenceSummary.sickDays,
    otherAbsenceDays: input.absenceSummary.otherAbsenceDays,
    warnings: [],
  }

  // Step 2: Aggregate daily values
  for (const dv of input.dailyValues) {
    output.totalGrossTime += dv.grossTime
    output.totalNetTime += dv.netTime
    output.totalTargetTime += dv.targetTime
    output.totalOvertime += dv.overtime
    output.totalUndertime += dv.undertime
    output.totalBreakTime += dv.breakTime

    if (dv.grossTime > 0 || dv.netTime > 0) {
      output.workDays++
    }
    if (dv.hasError) {
      output.daysWithErrors++
    }
  }

  // Step 3: Calculate flextime change
  output.flextimeChange = output.totalOvertime - output.totalUndertime

  // Step 4: Calculate raw flextime
  output.flextimeRaw = output.flextimeStart + output.flextimeChange

  // Step 5: Apply credit type rules
  if (input.evaluationRules !== null) {
    return applyCreditType(output, input.evaluationRules)
  } else {
    // No evaluation: direct transfer
    output.flextimeCredited = output.flextimeChange
    output.flextimeEnd = output.flextimeRaw
    output.flextimeForfeited = 0
  }

  return output
}

/**
 * Implements the 4 ZMI credit types for flextime calculation.
 */
function applyCreditType(
  output: MonthlyCalcOutput,
  rules: MonthlyEvaluationInput,
): MonthlyCalcOutput {
  switch (rules.creditType) {
    case "no_evaluation": {
      output.flextimeCredited = output.flextimeChange
      output.flextimeEnd = output.flextimeRaw
      output.flextimeForfeited = 0
      break
    }

    case "complete_carryover": {
      let credited = output.flextimeChange

      // Apply monthly cap
      if (
        rules.maxFlextimePerMonth !== null &&
        credited > rules.maxFlextimePerMonth
      ) {
        output.flextimeForfeited = credited - rules.maxFlextimePerMonth
        credited = rules.maxFlextimePerMonth
        output.warnings.push(WARN_MONTHLY_CAP_REACHED)
      }

      output.flextimeCredited = credited
      output.flextimeEnd = output.flextimeStart + credited

      // Apply positive/negative caps
      const prevEnd = output.flextimeEnd
      const capResult = applyFlextimeCaps(
        output.flextimeEnd,
        rules.flextimeCapPositive,
        rules.flextimeCapNegative,
      )
      output.flextimeEnd = capResult.value
      output.flextimeForfeited += capResult.forfeited
      if (output.flextimeEnd !== prevEnd) {
        output.warnings.push(WARN_FLEXTIME_CAPPED)
      }
      break
    }

    case "after_threshold": {
      const threshold =
        rules.flextimeThreshold !== null ? rules.flextimeThreshold : 0

      if (output.flextimeChange > threshold) {
        // Above threshold: credit the excess
        output.flextimeCredited = output.flextimeChange - threshold
        output.flextimeForfeited = threshold
      } else if (output.flextimeChange > 0) {
        // Positive but at or below threshold: forfeit all
        output.flextimeCredited = 0
        output.flextimeForfeited = output.flextimeChange
        output.warnings.push(WARN_BELOW_THRESHOLD)
      } else {
        // Undertime: fully deduct (no threshold applies to undertime)
        output.flextimeCredited = output.flextimeChange
        output.flextimeForfeited = 0
      }

      // Apply monthly cap
      if (
        rules.maxFlextimePerMonth !== null &&
        output.flextimeCredited > rules.maxFlextimePerMonth
      ) {
        const excess = output.flextimeCredited - rules.maxFlextimePerMonth
        output.flextimeForfeited += excess
        output.flextimeCredited = rules.maxFlextimePerMonth
        output.warnings.push(WARN_MONTHLY_CAP_REACHED)
      }

      output.flextimeEnd = output.flextimeStart + output.flextimeCredited

      // Apply positive/negative caps
      const prevEnd = output.flextimeEnd
      const capResult = applyFlextimeCaps(
        output.flextimeEnd,
        rules.flextimeCapPositive,
        rules.flextimeCapNegative,
      )
      output.flextimeEnd = capResult.value
      output.flextimeForfeited += capResult.forfeited
      if (output.flextimeEnd !== prevEnd) {
        output.warnings.push(WARN_FLEXTIME_CAPPED)
      }
      break
    }

    case "no_carryover": {
      output.flextimeCredited = 0
      output.flextimeEnd = 0
      output.flextimeForfeited = output.flextimeChange
      output.warnings.push(WARN_NO_CARRYOVER)
      break
    }

    default: {
      // Unknown credit type: default to no evaluation (direct transfer)
      output.flextimeCredited = output.flextimeChange
      output.flextimeEnd = output.flextimeRaw
      output.flextimeForfeited = 0
      break
    }
  }

  return output
}

/**
 * Applies positive and negative balance caps.
 * Returns the capped value and additional forfeited amount.
 */
export function applyFlextimeCaps(
  flextime: number,
  capPositive: number | null,
  capNegative: number | null,
): { value: number; forfeited: number } {
  let value = flextime
  let forfeited = 0

  if (capPositive !== null && value > capPositive) {
    forfeited = value - capPositive
    value = capPositive
  }

  if (capNegative !== null && value < -capNegative) {
    value = -capNegative
  }

  return { value, forfeited }
}

/**
 * Determines the year-end carryover with annual floor.
 * If currentBalance is null, returns 0. If annualFloor is set and the balance
 * is below the negative floor, the floor is applied.
 */
export function calculateAnnualCarryover(
  currentBalance: number | null,
  annualFloor: number | null,
): number {
  if (currentBalance === null) {
    return 0
  }
  const balance = currentBalance
  if (annualFloor !== null && balance < -annualFloor) {
    return -annualFloor
  }
  return balance
}
