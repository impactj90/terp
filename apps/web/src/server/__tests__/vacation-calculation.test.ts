import { describe, it, expect } from "vitest"
import {
  calculateVacation,
  calculateAge,
  calculateTenure,
  calculateMonthsEmployedInYear,
  roundToHalfDay,
  type VacationCalcInput,
} from "../lib/vacation-calculation"
import {
  calculateCarryoverWithCapping,
  type CarryoverInput,
} from "../lib/carryover-calculation"

// --- calculateVacation tests ---

describe("calculateVacation", () => {
  function makeInput(overrides: Partial<VacationCalcInput> = {}): VacationCalcInput {
    return {
      birthDate: new Date(Date.UTC(1985, 5, 15)), // June 15, 1985
      entryDate: new Date(Date.UTC(2020, 0, 1)), // Jan 1, 2020
      exitDate: null,
      weeklyHours: 40,
      hasDisability: false,
      baseVacationDays: 30,
      standardWeeklyHours: 40,
      basis: "calendar_year",
      specialCalcs: [],
      year: 2025,
      referenceDate: new Date(Date.UTC(2025, 0, 1)), // Jan 1, 2025
      ...overrides,
    }
  }

  it("calculates full-year, full-time entitlement (30 days)", () => {
    const result = calculateVacation(makeInput())
    expect(result.baseEntitlement).toBe(30)
    expect(result.proRatedEntitlement).toBe(30)
    expect(result.partTimeAdjustment).toBe(30)
    expect(result.totalEntitlement).toBe(30)
    expect(result.monthsEmployed).toBe(12)
  })

  it("pro-rates for partial year (6 months -> 15 days)", () => {
    const result = calculateVacation(
      makeInput({
        entryDate: new Date(Date.UTC(2025, 6, 1)), // July 1, 2025
      })
    )
    expect(result.baseEntitlement).toBe(30)
    expect(result.monthsEmployed).toBe(6)
    expect(result.proRatedEntitlement).toBe(15)
    expect(result.totalEntitlement).toBe(15)
  })

  it("applies part-time factor (20h/40h -> half entitlement)", () => {
    const result = calculateVacation(
      makeInput({
        weeklyHours: 20,
      })
    )
    expect(result.partTimeAdjustment).toBe(15) // 30 * (20/40)
    expect(result.totalEntitlement).toBe(15)
  })

  it("adds age bonus when threshold met", () => {
    const result = calculateVacation(
      makeInput({
        specialCalcs: [{ type: "age", threshold: 30, bonusDays: 2 }],
      })
    )
    // Age at Jan 1, 2025 for birth June 15, 1985 = 39
    expect(result.ageAtReference).toBe(39)
    expect(result.ageBonus).toBe(2)
    expect(result.totalEntitlement).toBe(32)
  })

  it("adds tenure bonus when threshold met", () => {
    const result = calculateVacation(
      makeInput({
        specialCalcs: [{ type: "tenure", threshold: 5, bonusDays: 3 }],
      })
    )
    // Tenure at Jan 1, 2025 for entry Jan 1, 2020 = 5
    expect(result.tenureYears).toBe(5)
    expect(result.tenureBonus).toBe(3)
    expect(result.totalEntitlement).toBe(33)
  })

  it("adds disability bonus when flag set", () => {
    const result = calculateVacation(
      makeInput({
        hasDisability: true,
        specialCalcs: [{ type: "disability", threshold: 0, bonusDays: 5 }],
      })
    )
    expect(result.disabilityBonus).toBe(5)
    expect(result.totalEntitlement).toBe(35)
  })

  it("skips age bonus when under threshold", () => {
    const result = calculateVacation(
      makeInput({
        specialCalcs: [{ type: "age", threshold: 50, bonusDays: 2 }],
      })
    )
    expect(result.ageBonus).toBe(0)
    expect(result.totalEntitlement).toBe(30)
  })

  it("rounds to half-day (e.g., 22.3 -> 22.5)", () => {
    // 28 days * (20/40) = 14; 14 + 8.3 (age bonus) = 22.3 -> rounds to 22.5
    const result = calculateVacation(
      makeInput({
        baseVacationDays: 28,
        weeklyHours: 20,
        specialCalcs: [{ type: "age", threshold: 30, bonusDays: 8.3 }],
      })
    )
    expect(result.totalEntitlement).toBe(22.5) // 14 + 8.3 = 22.3 -> 22.5
  })

  it("handles entry_date basis", () => {
    const result = calculateVacation(
      makeInput({
        basis: "entry_date",
        entryDate: new Date(Date.UTC(2020, 3, 15)), // April 15, 2020
      })
    )
    expect(result.monthsEmployed).toBe(12)
    expect(result.totalEntitlement).toBe(30)
  })

  it("handles employee with exit date mid-year", () => {
    const result = calculateVacation(
      makeInput({
        exitDate: new Date(Date.UTC(2025, 5, 30)), // June 30, 2025
      })
    )
    // Employed Jan 1 - Jun 30 = 6 months
    // Pro-rated: 30 * 6/12 = 15
    expect(result.monthsEmployed).toBe(6)
    expect(result.proRatedEntitlement).toBe(15)
    expect(result.totalEntitlement).toBe(15)
  })
})

// --- calculateAge tests ---

describe("calculateAge", () => {
  it("returns correct age before birthday in reference year", () => {
    const birth = new Date(Date.UTC(1985, 5, 15)) // June 15
    const ref = new Date(Date.UTC(2025, 0, 1)) // Jan 1
    expect(calculateAge(birth, ref)).toBe(39) // Not yet turned 40
  })

  it("returns correct age on birthday", () => {
    const birth = new Date(Date.UTC(1985, 5, 15))
    const ref = new Date(Date.UTC(2025, 5, 15)) // June 15
    expect(calculateAge(birth, ref)).toBe(40)
  })

  it("returns 0 for future birth date", () => {
    const birth = new Date(Date.UTC(2030, 0, 1))
    const ref = new Date(Date.UTC(2025, 0, 1))
    expect(calculateAge(birth, ref)).toBe(0)
  })
})

// --- calculateTenure tests ---

describe("calculateTenure", () => {
  it("returns correct tenure years", () => {
    const entry = new Date(Date.UTC(2020, 0, 1))
    const ref = new Date(Date.UTC(2025, 0, 1))
    expect(calculateTenure(entry, ref)).toBe(5)
  })

  it("returns 0 when reference before entry", () => {
    const entry = new Date(Date.UTC(2025, 0, 1))
    const ref = new Date(Date.UTC(2020, 0, 1))
    expect(calculateTenure(entry, ref)).toBe(0)
  })
})

// --- calculateMonthsEmployedInYear tests ---

describe("calculateMonthsEmployedInYear", () => {
  it("returns 12 for full year employment", () => {
    const entry = new Date(Date.UTC(2020, 0, 1))
    expect(calculateMonthsEmployedInYear(entry, null, 2025, "calendar_year")).toBe(12)
  })

  it("returns correct months for mid-year start", () => {
    const entry = new Date(Date.UTC(2025, 6, 1)) // July 1
    expect(calculateMonthsEmployedInYear(entry, null, 2025, "calendar_year")).toBe(6)
  })

  it("returns correct months for mid-year exit", () => {
    const entry = new Date(Date.UTC(2020, 0, 1))
    const exit = new Date(Date.UTC(2025, 5, 30)) // June 30
    expect(calculateMonthsEmployedInYear(entry, exit, 2025, "calendar_year")).toBe(6)
  })

  it("handles entry_date basis", () => {
    const entry = new Date(Date.UTC(2020, 3, 15)) // April 15
    expect(calculateMonthsEmployedInYear(entry, null, 2025, "entry_date")).toBe(12)
  })
})

// --- roundToHalfDay tests ---

describe("roundToHalfDay", () => {
  it("rounds 22.3 to 22.5", () => {
    expect(roundToHalfDay(22.3)).toBe(22.5)
  })

  it("rounds 22.7 to 22.5", () => {
    expect(roundToHalfDay(22.7)).toBe(22.5)
  })

  it("rounds 22.75 to 23.0", () => {
    expect(roundToHalfDay(22.75)).toBe(23.0)
  })

  it("keeps 22.0 as 22.0", () => {
    expect(roundToHalfDay(22.0)).toBe(22.0)
  })

  it("keeps 22.5 as 22.5", () => {
    expect(roundToHalfDay(22.5)).toBe(22.5)
  })
})

// --- calculateCarryoverWithCapping tests ---

describe("calculateCarryoverWithCapping", () => {
  function makeCarryoverInput(overrides: Partial<CarryoverInput> = {}): CarryoverInput {
    return {
      availableDays: 20,
      year: 2025,
      referenceDate: new Date(Date.UTC(2026, 5, 1)), // June 1, 2026
      cappingRules: [],
      exceptions: [],
      ...overrides,
    }
  }

  it("returns full carryover when no rules", () => {
    const result = calculateCarryoverWithCapping(makeCarryoverInput())
    expect(result.cappedCarryover).toBe(20)
    expect(result.forfeitedDays).toBe(0)
    expect(result.rulesApplied).toHaveLength(0)
  })

  it("caps year_end rule when available > capValue", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        cappingRules: [
          {
            ruleId: "rule-1",
            ruleName: "Year End Cap",
            ruleType: "year_end",
            cutoffMonth: 12,
            cutoffDay: 31,
            capValue: 10,
          },
        ],
      })
    )
    expect(result.cappedCarryover).toBe(10)
    expect(result.forfeitedDays).toBe(10)
    expect(result.rulesApplied[0]!.applied).toBe(true)
  })

  it("does not cap when available <= capValue", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        availableDays: 5,
        cappingRules: [
          {
            ruleId: "rule-1",
            ruleName: "Year End Cap",
            ruleType: "year_end",
            cutoffMonth: 12,
            cutoffDay: 31,
            capValue: 10,
          },
        ],
      })
    )
    expect(result.cappedCarryover).toBe(5)
    expect(result.forfeitedDays).toBe(0)
    expect(result.rulesApplied[0]!.applied).toBe(false)
  })

  it("applies mid_year rule when reference date past cutoff", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        referenceDate: new Date(Date.UTC(2026, 5, 1)), // June 1, 2026
        cappingRules: [
          {
            ruleId: "rule-1",
            ruleName: "Mid Year Cap",
            ruleType: "mid_year",
            cutoffMonth: 3,  // March
            cutoffDay: 31,
            capValue: 5,
          },
        ],
      })
    )
    // Cutoff is March 31, 2026 (year+1=2026). Reference June 1, 2026 > March 31, 2026
    expect(result.cappedCarryover).toBe(5)
    expect(result.forfeitedDays).toBe(15)
    expect(result.rulesApplied[0]!.applied).toBe(true)
  })

  it("does not apply mid_year rule when reference date before cutoff", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        referenceDate: new Date(Date.UTC(2026, 1, 1)), // Feb 1, 2026
        cappingRules: [
          {
            ruleId: "rule-1",
            ruleName: "Mid Year Cap",
            ruleType: "mid_year",
            cutoffMonth: 3,
            cutoffDay: 31,
            capValue: 5,
          },
        ],
      })
    )
    // Cutoff is March 31, 2026. Reference Feb 1, 2026 < March 31, 2026
    expect(result.cappedCarryover).toBe(20)
    expect(result.forfeitedDays).toBe(0)
    expect(result.rulesApplied[0]!.applied).toBe(false)
  })

  it("handles full exemption (skips rule)", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        cappingRules: [
          {
            ruleId: "rule-1",
            ruleName: "Year End Cap",
            ruleType: "year_end",
            cutoffMonth: 12,
            cutoffDay: 31,
            capValue: 10,
          },
        ],
        exceptions: [
          {
            cappingRuleId: "rule-1",
            exemptionType: "full",
            retainDays: null,
          },
        ],
      })
    )
    expect(result.cappedCarryover).toBe(20)
    expect(result.forfeitedDays).toBe(0)
    expect(result.hasException).toBe(true)
    expect(result.rulesApplied[0]!.exceptionActive).toBe(true)
    expect(result.rulesApplied[0]!.applied).toBe(false)
  })

  it("handles partial exemption (uses retainDays as effective cap)", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        cappingRules: [
          {
            ruleId: "rule-1",
            ruleName: "Year End Cap",
            ruleType: "year_end",
            cutoffMonth: 12,
            cutoffDay: 31,
            capValue: 10,
          },
        ],
        exceptions: [
          {
            cappingRuleId: "rule-1",
            exemptionType: "partial",
            retainDays: 15, // Greater than cap of 10
          },
        ],
      })
    )
    expect(result.cappedCarryover).toBe(15)
    expect(result.forfeitedDays).toBe(5)
    expect(result.hasException).toBe(true)
    expect(result.rulesApplied[0]!.exceptionActive).toBe(true)
    expect(result.rulesApplied[0]!.applied).toBe(true)
  })

  it("handles zero available days", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        availableDays: 0,
      })
    )
    expect(result.cappedCarryover).toBe(0)
    expect(result.forfeitedDays).toBe(0)
  })

  it("handles capValue of 0 (forfeit all)", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        cappingRules: [
          {
            ruleId: "rule-1",
            ruleName: "No Carryover",
            ruleType: "year_end",
            cutoffMonth: 12,
            cutoffDay: 31,
            capValue: 0,
          },
        ],
      })
    )
    expect(result.cappedCarryover).toBe(0)
    expect(result.forfeitedDays).toBe(20)
  })

  it("applies multiple rules in sequence", () => {
    const result = calculateCarryoverWithCapping(
      makeCarryoverInput({
        availableDays: 30,
        cappingRules: [
          {
            ruleId: "rule-1",
            ruleName: "Year End Cap",
            ruleType: "year_end",
            cutoffMonth: 12,
            cutoffDay: 31,
            capValue: 20,
          },
          {
            ruleId: "rule-2",
            ruleName: "Mid Year Cap",
            ruleType: "mid_year",
            cutoffMonth: 3,
            cutoffDay: 31,
            capValue: 10,
          },
        ],
      })
    )
    // First rule caps to 20, second caps to 10
    expect(result.cappedCarryover).toBe(10)
    expect(result.forfeitedDays).toBe(20)
    expect(result.rulesApplied).toHaveLength(2)
    expect(result.rulesApplied[0]!.applied).toBe(true)
    expect(result.rulesApplied[1]!.applied).toBe(true)
  })
})
