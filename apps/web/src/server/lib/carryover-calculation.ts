/**
 * Carryover Calculation with Capping
 *
 * Ported from: apps/api/internal/calculation/carryover.go
 * Computes vacation carryover applying capping rules and employee exceptions.
 */

// --- Types ---

export interface CappingRuleInput {
  ruleId: string
  ruleName: string
  ruleType: "year_end" | "mid_year"
  cutoffMonth: number
  cutoffDay: number
  capValue: number
}

export interface CappingExceptionInput {
  cappingRuleId: string
  exemptionType: "full" | "partial"
  retainDays: number | null
}

export interface CarryoverInput {
  availableDays: number
  year: number // The year ending (carryover goes TO year+1)
  referenceDate: Date // Date to evaluate mid-year rules against
  cappingRules: CappingRuleInput[]
  exceptions: CappingExceptionInput[]
}

export interface CappingRuleResult {
  ruleId: string
  ruleName: string
  ruleType: string
  capValue: number
  applied: boolean
  exceptionActive: boolean
}

export interface CarryoverOutput {
  availableDays: number
  cappedCarryover: number
  forfeitedDays: number
  rulesApplied: CappingRuleResult[]
  hasException: boolean
}

// --- Core Function ---

export function calculateCarryoverWithCapping(
  input: CarryoverInput
): CarryoverOutput {
  const output: CarryoverOutput = {
    availableDays: input.availableDays,
    cappedCarryover: input.availableDays,
    forfeitedDays: 0,
    rulesApplied: [],
    hasException: false,
  }

  if (input.availableDays <= 0) {
    output.cappedCarryover = 0
    output.forfeitedDays = 0
    return output
  }

  // Build exception lookup by rule ID
  const exceptionMap = new Map<string, CappingExceptionInput>()
  for (const exc of input.exceptions) {
    exceptionMap.set(exc.cappingRuleId, exc)
  }

  let currentCarryover = input.availableDays

  for (const rule of input.cappingRules) {
    const result: CappingRuleResult = {
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      ruleType: rule.ruleType,
      capValue: rule.capValue,
      applied: false,
      exceptionActive: false,
    }

    // Check for employee exception
    const exc = exceptionMap.get(rule.ruleId)
    if (exc) {
      result.exceptionActive = true
      output.hasException = true

      if (exc.exemptionType === "full") {
        result.applied = false
        output.rulesApplied.push(result)
        continue
      }

      // Partial exemption: use RetainDays as the effective cap
      if (exc.retainDays !== null && exc.retainDays > rule.capValue) {
        if (currentCarryover > exc.retainDays) {
          currentCarryover = exc.retainDays
          result.applied = true
        }
        output.rulesApplied.push(result)
        continue
      }
    }

    // Apply the rule based on type
    switch (rule.ruleType) {
      case "year_end":
        if (rule.capValue === 0) {
          currentCarryover = 0
          result.applied = true
        } else if (currentCarryover > rule.capValue) {
          currentCarryover = rule.capValue
          result.applied = true
        }
        break

      case "mid_year": {
        const cutoffDate = new Date(
          Date.UTC(input.year + 1, rule.cutoffMonth - 1, rule.cutoffDay)
        )
        if (input.referenceDate > cutoffDate) {
          if (rule.capValue === 0) {
            currentCarryover = 0
            result.applied = true
          } else if (currentCarryover > rule.capValue) {
            currentCarryover = rule.capValue
            result.applied = true
          }
        }
        break
      }
    }

    output.rulesApplied.push(result)
  }

  // Ensure non-negative
  currentCarryover = Math.max(0, currentCarryover)

  output.cappedCarryover = currentCarryover
  output.forfeitedDays = Math.max(0, input.availableDays - currentCarryover)

  return output
}

/**
 * Simple carryover cap without capping rules.
 * Port of Go calculation.CalculateCarryover().
 *
 * @param available - Available vacation days from previous year
 * @param maxCarryover - Maximum carryover allowed (0 or negative = unlimited)
 * @returns Capped carryover amount
 */
export function calculateCarryover(
  available: number,
  maxCarryover: number
): number {
  if (available <= 0) return 0
  if (maxCarryover > 0 && available > maxCarryover) return maxCarryover
  return available
}
