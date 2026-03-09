/**
 * Tests for Monthly Calculation Engine
 *
 * Ported from Go: apps/api/internal/calculation/monthly_test.go (851 lines)
 */

import { describe, it, expect } from "vitest"
import { Decimal } from "@prisma/client/runtime/client"
import {
  calculateMonth,
  calculateAnnualCarryover,
  type MonthlyCalcInput,
  type MonthlyEvaluationInput,
  type AbsenceSummaryInput,
} from "../monthly"
import {
  WARN_MONTHLY_CAP_REACHED,
  WARN_FLEXTIME_CAPPED,
  WARN_BELOW_THRESHOLD,
  WARN_NO_CARRYOVER,
} from "../errors"

// --- Helpers ---

function emptyAbsences(): AbsenceSummaryInput {
  return { vacationDays: new Decimal(0), sickDays: 0, otherAbsenceDays: 0 }
}

// --- Group 1: Daily Value Aggregation ---

describe("Daily Value Aggregation", () => {
  it("BasicSums - aggregates 3 days correctly", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 500, netTime: 470, targetTime: 480, overtime: 0, undertime: 10, breakTime: 30, hasError: false },
        { date: "2025-01-02", grossTime: 540, netTime: 510, targetTime: 480, overtime: 30, undertime: 0, breakTime: 30, hasError: false },
        { date: "2025-01-03", grossTime: 480, netTime: 450, targetTime: 480, overtime: 0, undertime: 30, breakTime: 30, hasError: false },
      ],
      previousCarryover: 60,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.totalGrossTime).toBe(1520)
    expect(output.totalNetTime).toBe(1430)
    expect(output.totalTargetTime).toBe(1440)
    expect(output.totalOvertime).toBe(30)
    expect(output.totalUndertime).toBe(40)
    expect(output.totalBreakTime).toBe(90)
    expect(output.workDays).toBe(3)
    expect(output.daysWithErrors).toBe(0)
  })

  it("EmptyDays - empty array yields zeroes except carryover", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [],
      previousCarryover: 100,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.totalGrossTime).toBe(0)
    expect(output.totalNetTime).toBe(0)
    expect(output.totalTargetTime).toBe(0)
    expect(output.totalOvertime).toBe(0)
    expect(output.totalUndertime).toBe(0)
    expect(output.totalBreakTime).toBe(0)
    expect(output.workDays).toBe(0)
    expect(output.daysWithErrors).toBe(0)
    expect(output.flextimeStart).toBe(100)
    expect(output.flextimeChange).toBe(0)
    expect(output.flextimeRaw).toBe(100)
    expect(output.flextimeCredited).toBe(0)
    expect(output.flextimeEnd).toBe(100)
  })

  it("SingleDay - single day aggregation", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 510, netTime: 480, targetTime: 480, overtime: 0, undertime: 0, breakTime: 30, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.totalGrossTime).toBe(510)
    expect(output.totalNetTime).toBe(480)
    expect(output.totalTargetTime).toBe(480)
    expect(output.totalOvertime).toBe(0)
    expect(output.totalUndertime).toBe(0)
    expect(output.totalBreakTime).toBe(30)
    expect(output.workDays).toBe(1)
  })

  it("WorkDays_OnlyGrossTime - grossTime > 0, netTime = 0 counts as work day", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 480, netTime: 0, targetTime: 0, overtime: 0, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    expect(calculateMonth(input).workDays).toBe(1)
  })

  it("WorkDays_OnlyNetTime - grossTime = 0, netTime > 0 counts as work day", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 0, netTime: 480, targetTime: 0, overtime: 0, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    expect(calculateMonth(input).workDays).toBe(1)
  })

  it("WorkDays_ZeroTimeNotCounted - grossTime = 0 and netTime = 0 not counted", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 0, netTime: 0, targetTime: 480, overtime: 0, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    expect(calculateMonth(input).workDays).toBe(0)
  })

  it("DaysWithErrors - counts days with hasError true", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 480, netTime: 450, targetTime: 0, overtime: 0, undertime: 0, breakTime: 0, hasError: true },
        { date: "2025-01-02", grossTime: 480, netTime: 450, targetTime: 0, overtime: 0, undertime: 0, breakTime: 0, hasError: false },
        { date: "2025-01-03", grossTime: 480, netTime: 450, targetTime: 0, overtime: 0, undertime: 0, breakTime: 0, hasError: true },
      ],
      previousCarryover: 0,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)
    expect(output.daysWithErrors).toBe(2)
    expect(output.workDays).toBe(3)
  })
})

// --- Group 2: CreditType NoEvaluation ---

describe("CreditType NoEvaluation", () => {
  it("Overtime - credits overtime 1:1", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 510, netTime: 510, targetTime: 480, overtime: 30, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "no_evaluation", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeStart).toBe(100)
    expect(output.flextimeChange).toBe(30)
    expect(output.flextimeRaw).toBe(130)
    expect(output.flextimeCredited).toBe(30)
    expect(output.flextimeEnd).toBe(130)
    expect(output.flextimeForfeited).toBe(0)
  })

  it("Undertime - deducts undertime 1:1", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 450, netTime: 450, targetTime: 480, overtime: 0, undertime: 30, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "no_evaluation", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeChange).toBe(-30)
    expect(output.flextimeRaw).toBe(70)
    expect(output.flextimeCredited).toBe(-30)
    expect(output.flextimeEnd).toBe(70)
    expect(output.flextimeForfeited).toBe(0)
  })

  it("Mixed - overtime and undertime combined", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 510, netTime: 510, targetTime: 480, overtime: 30, undertime: 0, breakTime: 0, hasError: false },
        { date: "2025-01-02", grossTime: 440, netTime: 440, targetTime: 480, overtime: 0, undertime: 40, breakTime: 0, hasError: false },
      ],
      previousCarryover: 50,
      evaluationRules: { creditType: "no_evaluation", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeChange).toBe(-10) // 30 - 40
    expect(output.flextimeRaw).toBe(40) // 50 + (-10)
    expect(output.flextimeCredited).toBe(-10)
    expect(output.flextimeEnd).toBe(40)
    expect(output.flextimeForfeited).toBe(0)
  })
})

// --- Group 3: CreditType CompleteCarryover ---

describe("CreditType CompleteCarryover", () => {
  it("NoCaps - full transfer without limits", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(60)
    expect(output.flextimeEnd).toBe(160)
    expect(output.flextimeForfeited).toBe(0)
    expect(output.warnings).toHaveLength(0)
  })

  it("MonthlyCap - caps credited at monthly max", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 600, netTime: 600, targetTime: 480, overtime: 120, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: 60, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(60)
    expect(output.flextimeEnd).toBe(60)
    expect(output.flextimeForfeited).toBe(60)
    expect(output.warnings).toContain(WARN_MONTHLY_CAP_REACHED)
  })

  it("PositiveCap - caps balance at positive limit", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 150,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: 200, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // Without cap: 150 + 60 = 210, but capped at 200
    expect(output.flextimeCredited).toBe(60)
    expect(output.flextimeEnd).toBe(200)
    expect(output.flextimeForfeited).toBe(10)
    expect(output.warnings).toContain(WARN_FLEXTIME_CAPPED)
  })

  it("NegativeCap - caps balance at negative limit", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 400, netTime: 400, targetTime: 480, overtime: 0, undertime: 80, breakTime: 0, hasError: false },
      ],
      previousCarryover: -50,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: 100, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // Without cap: -50 + (-80) = -130, but capped at -100
    expect(output.flextimeCredited).toBe(-80)
    expect(output.flextimeEnd).toBe(-100)
    expect(output.warnings).toContain(WARN_FLEXTIME_CAPPED)
  })

  it("BothCaps - both positive and negative caps", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 600, netTime: 600, targetTime: 480, overtime: 120, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 150,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: 200, flextimeCapNegative: 100, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // 150 + 120 = 270, capped at 200
    expect(output.flextimeCredited).toBe(120)
    expect(output.flextimeEnd).toBe(200)
    expect(output.flextimeForfeited).toBe(70) // 270 - 200
    expect(output.warnings).toContain(WARN_FLEXTIME_CAPPED)
  })

  it("Undertime - undertime with positive cap, no forfeiture", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 420, netTime: 420, targetTime: 480, overtime: 0, undertime: 60, breakTime: 0, hasError: false },
      ],
      previousCarryover: 200,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: 300, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(-60)
    expect(output.flextimeEnd).toBe(140) // 200 + (-60)
    expect(output.flextimeForfeited).toBe(0)
    expect(output.warnings).toHaveLength(0)
  })
})

// --- Group 4: CreditType AfterThreshold ---

describe("CreditType AfterThreshold", () => {
  it("AboveThreshold - credits excess above threshold", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "after_threshold", flextimeThreshold: 20, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(40) // 60 - 20
    expect(output.flextimeForfeited).toBe(20) // threshold amount
    expect(output.flextimeEnd).toBe(140) // 100 + 40
  })

  it("AtThreshold - at threshold, forfeit all", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 500, netTime: 500, targetTime: 480, overtime: 20, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "after_threshold", flextimeThreshold: 20, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // At threshold: 20 == 20, so FlextimeChange (20) > 0 but <= threshold
    expect(output.flextimeCredited).toBe(0)
    expect(output.flextimeForfeited).toBe(20)
    expect(output.flextimeEnd).toBe(100) // unchanged
    expect(output.warnings).toContain(WARN_BELOW_THRESHOLD)
  })

  it("BelowThreshold - below threshold, forfeit all", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 490, netTime: 490, targetTime: 480, overtime: 10, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "after_threshold", flextimeThreshold: 30, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(0)
    expect(output.flextimeForfeited).toBe(10)
    expect(output.flextimeEnd).toBe(100)
    expect(output.warnings).toContain(WARN_BELOW_THRESHOLD)
  })

  it("Undertime - fully deducted regardless of threshold", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 440, netTime: 440, targetTime: 480, overtime: 0, undertime: 40, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "after_threshold", flextimeThreshold: 20, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(-40)
    expect(output.flextimeForfeited).toBe(0)
    expect(output.flextimeEnd).toBe(60) // 100 + (-40)
  })

  it("NilThreshold - null threshold defaults to 0", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 50,
      evaluationRules: { creditType: "after_threshold", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // Nil threshold defaults to 0, so all overtime is above threshold
    expect(output.flextimeCredited).toBe(60)
    expect(output.flextimeForfeited).toBe(0)
    expect(output.flextimeEnd).toBe(110)
  })

  it("WithCaps - threshold + positive cap applied", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 600, netTime: 600, targetTime: 480, overtime: 120, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 180,
      evaluationRules: { creditType: "after_threshold", flextimeThreshold: 20, maxFlextimePerMonth: null, flextimeCapPositive: 200, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // FlextimeChange = 120, threshold = 20, credited = 100, forfeited from threshold = 20
    // FlextimeEnd = 180 + 100 = 280, capped at 200, additional forfeited = 80
    expect(output.flextimeCredited).toBe(100)
    expect(output.flextimeEnd).toBe(200)
    expect(output.flextimeForfeited).toBe(100) // 20 (threshold) + 80 (cap)
    expect(output.warnings).toContain(WARN_FLEXTIME_CAPPED)
  })
})

// --- Group 5: CreditType NoCarryover ---

describe("CreditType NoCarryover", () => {
  it("Overtime - resets to 0, forfeits overtime", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "no_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(0)
    expect(output.flextimeEnd).toBe(0)
    expect(output.flextimeForfeited).toBe(60)
    expect(output.warnings).toContain(WARN_NO_CARRYOVER)
  })

  it("Undertime - resets to 0, forfeits undertime (negative)", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 440, netTime: 440, targetTime: 480, overtime: 0, undertime: 40, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "no_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(0)
    expect(output.flextimeEnd).toBe(0)
    expect(output.flextimeForfeited).toBe(-40) // Undertime change
    expect(output.warnings).toContain(WARN_NO_CARRYOVER)
  })

  it("WithPreviousBalance - previous balance irrelevant", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 480, netTime: 480, targetTime: 480, overtime: 0, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 500,
      evaluationRules: { creditType: "no_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeStart).toBe(500)
    expect(output.flextimeCredited).toBe(0)
    expect(output.flextimeEnd).toBe(0) // Previous balance irrelevant
    expect(output.flextimeForfeited).toBe(0)
  })
})

// --- Group 6: Edge Cases ---

describe("Edge Cases", () => {
  it("NilEvaluationRules - null rules = no evaluation (direct transfer)", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 50,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(60)
    expect(output.flextimeEnd).toBe(110)
    expect(output.flextimeForfeited).toBe(0)
  })

  it("UnknownCreditType - defaults to no evaluation", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 50,
      evaluationRules: { creditType: "unknown_type" as never, flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(60)
    expect(output.flextimeEnd).toBe(110)
    expect(output.flextimeForfeited).toBe(0)
  })

  it("ZeroPreviousCarryover - starts from 0", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeStart).toBe(0)
    expect(output.flextimeEnd).toBe(60)
  })

  it("NegativePreviousCarryover - negative start balance", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: -30,
      evaluationRules: null,
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeStart).toBe(-30)
    expect(output.flextimeChange).toBe(60)
    expect(output.flextimeRaw).toBe(30) // -30 + 60
    expect(output.flextimeEnd).toBe(30)
  })

  it("LargePreviousCarryover - large carryover capped by positive cap", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 1000,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: 500, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // 1000 + 60 = 1060, capped at 500
    expect(output.flextimeCredited).toBe(60)
    expect(output.flextimeEnd).toBe(500)
    expect(output.flextimeForfeited).toBe(560) // 1060 - 500
    expect(output.warnings).toContain(WARN_FLEXTIME_CAPPED)
  })
})

// --- Group 7: Absence Summary ---

describe("Absence Summary", () => {
  it("PassThrough - vacation, sick, other preserved", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [],
      previousCarryover: 0,
      evaluationRules: null,
      absenceSummary: {
        vacationDays: new Decimal(5),
        sickDays: 3,
        otherAbsenceDays: 2,
      },
    }

    const output = calculateMonth(input)

    expect(output.vacationTaken.equals(new Decimal(5))).toBe(true)
    expect(output.sickDays).toBe(3)
    expect(output.otherAbsenceDays).toBe(2)
  })

  it("HalfDayVacation - Decimal(2.5) preserved", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [],
      previousCarryover: 0,
      evaluationRules: null,
      absenceSummary: {
        vacationDays: new Decimal("2.5"),
        sickDays: 0,
        otherAbsenceDays: 0,
      },
    }

    const output = calculateMonth(input)

    expect(output.vacationTaken.equals(new Decimal("2.5"))).toBe(true)
  })
})

// --- Group 8: Warnings ---

describe("Warnings", () => {
  it("MonthlyCap - MONTHLY_CAP_REACHED warning", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 600, netTime: 600, targetTime: 480, overtime: 120, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: 60, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)
    expect(output.warnings).toContain(WARN_MONTHLY_CAP_REACHED)
  })

  it("FlextimeCapped - FLEXTIME_CAPPED warning", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 600, netTime: 600, targetTime: 480, overtime: 120, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 100,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: 150, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)
    expect(output.warnings).toContain(WARN_FLEXTIME_CAPPED)
  })

  it("BelowThreshold - BELOW_THRESHOLD warning", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 490, netTime: 490, targetTime: 480, overtime: 10, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: { creditType: "after_threshold", flextimeThreshold: 30, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)
    expect(output.warnings).toContain(WARN_BELOW_THRESHOLD)
  })

  it("NoCarryover - NO_CARRYOVER warning", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: { creditType: "no_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)
    expect(output.warnings).toContain(WARN_NO_CARRYOVER)
  })

  it("EmptyByDefault - no warnings when no limits triggered", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 480, netTime: 480, targetTime: 480, overtime: 0, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)
    expect(output.warnings).toHaveLength(0)
  })
})

// --- Group 9: CalculateAnnualCarryover ---

describe("CalculateAnnualCarryover", () => {
  it("NullBalance - returns 0", () => {
    expect(calculateAnnualCarryover(null, null)).toBe(0)
  })

  it("PositiveNoFloor - returns balance", () => {
    expect(calculateAnnualCarryover(200, null)).toBe(200)
  })

  it("NegativeAboveFloor - no floor applied", () => {
    // -50 > -100, so no floor applied
    expect(calculateAnnualCarryover(-50, 100)).toBe(-50)
  })

  it("NegativeBelowFloor - floor applied", () => {
    // -150 < -100, so floor applied
    expect(calculateAnnualCarryover(-150, 100)).toBe(-100)
  })

  it("NullFloor - no floor, returns balance", () => {
    expect(calculateAnnualCarryover(-500, null)).toBe(-500)
  })
})

// --- Group 10: Caps via CalculateMonth (integration) ---

describe("Caps via CalculateMonth", () => {
  it("NoCapsApplied - within both caps", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 540, netTime: 540, targetTime: 480, overtime: 60, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 50,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: 200, flextimeCapNegative: 100, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // 50 + 60 = 110, within both caps
    expect(output.flextimeEnd).toBe(110)
    expect(output.flextimeForfeited).toBe(0)
    expect(output.warnings).toHaveLength(0)
  })

  it("PositiveCapExceeded - positive cap applied", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 600, netTime: 600, targetTime: 480, overtime: 120, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 150,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: 200, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // 150 + 120 = 270, capped at 200
    expect(output.flextimeEnd).toBe(200)
    expect(output.flextimeForfeited).toBe(70)
    expect(output.warnings).toContain(WARN_FLEXTIME_CAPPED)
  })

  it("NegativeCapExceeded - negative cap applied", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 300, netTime: 300, targetTime: 480, overtime: 0, undertime: 180, breakTime: 0, hasError: false },
      ],
      previousCarryover: -50,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: 100, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // -50 + (-180) = -230, capped at -100
    expect(output.flextimeEnd).toBe(-100)
    expect(output.warnings).toContain(WARN_FLEXTIME_CAPPED)
  })

  it("BothCapsNull - no caps, unlimited", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 1000, netTime: 1000, targetTime: 480, overtime: 520, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 5000,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    // No caps at all: 5000 + 520 = 5520
    expect(output.flextimeEnd).toBe(5520)
    expect(output.flextimeForfeited).toBe(0)
    expect(output.warnings).toHaveLength(0)
  })
})

// --- Ticket Test Case Pack ---

describe("Ticket Test Cases", () => {
  it("Case1_CompleteCarryover - 600min overtime, 480 cap -> credited 480", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 1080, netTime: 1080, targetTime: 480, overtime: 600, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: { creditType: "complete_carryover", flextimeThreshold: null, maxFlextimePerMonth: 480, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(480)
    expect(output.flextimeForfeited).toBe(120)
    expect(output.flextimeEnd).toBe(480)
    expect(output.warnings).toContain(WARN_MONTHLY_CAP_REACHED)
  })

  it("Case2_AfterThreshold - 300min overtime, 120 threshold -> credited 180", () => {
    const input: MonthlyCalcInput = {
      dailyValues: [
        { date: "2025-01-01", grossTime: 780, netTime: 780, targetTime: 480, overtime: 300, undertime: 0, breakTime: 0, hasError: false },
      ],
      previousCarryover: 0,
      evaluationRules: { creditType: "after_threshold", flextimeThreshold: 120, maxFlextimePerMonth: null, flextimeCapPositive: null, flextimeCapNegative: null, annualFloorBalance: null },
      absenceSummary: emptyAbsences(),
    }

    const output = calculateMonth(input)

    expect(output.flextimeCredited).toBe(180)
    expect(output.flextimeForfeited).toBe(120) // threshold amount
    expect(output.flextimeEnd).toBe(180)
  })
})
