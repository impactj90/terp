import { describe, it, expect } from "vitest"
import {
  calculateLocalTravelAllowance,
  calculateExtendedTravelAllowance,
} from "../calculation/travel-allowance"
import type {
  LocalTravelRuleInput,
  ExtendedTravelRuleInput,
} from "../calculation/travel-allowance"

// --- calculateLocalTravelAllowance tests ---

describe("calculateLocalTravelAllowance", () => {
  const rule1: LocalTravelRuleInput = {
    minDistanceKm: 0,
    maxDistanceKm: 20,
    minDurationMinutes: 0,
    maxDurationMinutes: 480,
    taxFreeAmount: 5.0,
    taxableAmount: 2.0,
  }

  const rule2: LocalTravelRuleInput = {
    minDistanceKm: 20,
    maxDistanceKm: 50,
    minDurationMinutes: 0,
    maxDurationMinutes: 480,
    taxFreeAmount: 10.0,
    taxableAmount: 4.0,
  }

  const rule3: LocalTravelRuleInput = {
    minDistanceKm: 50,
    maxDistanceKm: null,
    minDurationMinutes: 0,
    maxDurationMinutes: null,
    taxFreeAmount: 15.0,
    taxableAmount: 6.0,
  }

  it("matches first matching rule by distance", () => {
    const result = calculateLocalTravelAllowance({
      distanceKm: 10,
      durationMinutes: 60,
      rules: [rule1, rule2, rule3],
    })

    expect(result.matched).toBe(true)
    expect(result.matchedRuleIdx).toBe(0)
    expect(result.taxFreeTotal).toBe(5.0)
    expect(result.taxableTotal).toBe(2.0)
    expect(result.totalAllowance).toBe(7.0)
  })

  it("matches second rule when distance exceeds first rule range", () => {
    const result = calculateLocalTravelAllowance({
      distanceKm: 25,
      durationMinutes: 60,
      rules: [rule1, rule2, rule3],
    })

    expect(result.matched).toBe(true)
    expect(result.matchedRuleIdx).toBe(1)
    expect(result.taxFreeTotal).toBe(10.0)
    expect(result.taxableTotal).toBe(4.0)
    expect(result.totalAllowance).toBe(14.0)
  })

  it("matches unbounded max distance rule", () => {
    const result = calculateLocalTravelAllowance({
      distanceKm: 100,
      durationMinutes: 60,
      rules: [rule1, rule2, rule3],
    })

    expect(result.matched).toBe(true)
    expect(result.matchedRuleIdx).toBe(2)
    expect(result.taxFreeTotal).toBe(15.0)
    expect(result.taxableTotal).toBe(6.0)
    expect(result.totalAllowance).toBe(21.0)
  })

  it("returns no match when distance below minimum", () => {
    const rulesWithHighMin: LocalTravelRuleInput[] = [
      {
        minDistanceKm: 50,
        maxDistanceKm: 100,
        minDurationMinutes: 0,
        maxDurationMinutes: null,
        taxFreeAmount: 10.0,
        taxableAmount: 5.0,
      },
    ]

    const result = calculateLocalTravelAllowance({
      distanceKm: 10,
      durationMinutes: 60,
      rules: rulesWithHighMin,
    })

    expect(result.matched).toBe(false)
    expect(result.matchedRuleIdx).toBe(-1)
    expect(result.totalAllowance).toBe(0)
  })

  it("returns no match when duration below minimum", () => {
    const rulesWithDuration: LocalTravelRuleInput[] = [
      {
        minDistanceKm: 0,
        maxDistanceKm: null,
        minDurationMinutes: 120,
        maxDurationMinutes: null,
        taxFreeAmount: 10.0,
        taxableAmount: 5.0,
      },
    ]

    const result = calculateLocalTravelAllowance({
      distanceKm: 50,
      durationMinutes: 60,
      rules: rulesWithDuration,
    })

    expect(result.matched).toBe(false)
    expect(result.matchedRuleIdx).toBe(-1)
  })

  it("returns no match when duration exceeds max", () => {
    const result = calculateLocalTravelAllowance({
      distanceKm: 10,
      durationMinutes: 500,
      rules: [rule1],
    })

    expect(result.matched).toBe(false)
    expect(result.matchedRuleIdx).toBe(-1)
  })

  it("handles unbounded max duration", () => {
    const result = calculateLocalTravelAllowance({
      distanceKm: 60,
      durationMinutes: 9999,
      rules: [rule3],
    })

    expect(result.matched).toBe(true)
    expect(result.matchedRuleIdx).toBe(0)
  })

  it("first match wins even if later rule also matches", () => {
    const overlapping: LocalTravelRuleInput[] = [
      {
        minDistanceKm: 0,
        maxDistanceKm: null,
        minDurationMinutes: 0,
        maxDurationMinutes: null,
        taxFreeAmount: 1.0,
        taxableAmount: 1.0,
      },
      {
        minDistanceKm: 0,
        maxDistanceKm: null,
        minDurationMinutes: 0,
        maxDurationMinutes: null,
        taxFreeAmount: 99.0,
        taxableAmount: 99.0,
      },
    ]

    const result = calculateLocalTravelAllowance({
      distanceKm: 10,
      durationMinutes: 60,
      rules: overlapping,
    })

    expect(result.matched).toBe(true)
    expect(result.matchedRuleIdx).toBe(0)
    expect(result.taxFreeTotal).toBe(1.0)
  })

  it("returns no match for empty rules list", () => {
    const result = calculateLocalTravelAllowance({
      distanceKm: 10,
      durationMinutes: 60,
      rules: [],
    })

    expect(result.matched).toBe(false)
    expect(result.matchedRuleIdx).toBe(-1)
    expect(result.totalAllowance).toBe(0)
  })
})

// --- calculateExtendedTravelAllowance tests ---

describe("calculateExtendedTravelAllowance", () => {
  const baseRule: ExtendedTravelRuleInput = {
    arrivalDayTaxFree: 14.0,
    arrivalDayTaxable: 8.0,
    departureDayTaxFree: 14.0,
    departureDayTaxable: 8.0,
    intermediateDayTaxFree: 28.0,
    intermediateDayTaxable: 16.0,
    threeMonthEnabled: true,
    threeMonthTaxFree: 20.0,
    threeMonthTaxable: 12.0,
  }

  it("1 day trip: 1 arrival day only", () => {
    const result = calculateExtendedTravelAllowance({
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-06-01T00:00:00.000Z"),
      threeMonthActive: false,
      rule: baseRule,
    })

    expect(result.totalDays).toBe(1)
    expect(result.arrivalDays).toBe(1)
    expect(result.departureDays).toBe(0)
    expect(result.intermediateDays).toBe(0)
    expect(result.taxFreeTotal).toBe(14.0)
    expect(result.taxableTotal).toBe(8.0)
    expect(result.totalAllowance).toBe(22.0)
    expect(result.breakdown).toHaveLength(1)
    expect(result.breakdown[0]!.description).toBe("Arrival day")
    expect(result.breakdown[0]!.days).toBe(1)
  })

  it("2 day trip: 1 arrival + 1 departure", () => {
    const result = calculateExtendedTravelAllowance({
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-06-02T00:00:00.000Z"),
      threeMonthActive: false,
      rule: baseRule,
    })

    expect(result.totalDays).toBe(2)
    expect(result.arrivalDays).toBe(1)
    expect(result.departureDays).toBe(1)
    expect(result.intermediateDays).toBe(0)
    expect(result.taxFreeTotal).toBe(28.0)
    expect(result.taxableTotal).toBe(16.0)
    expect(result.totalAllowance).toBe(44.0)
    expect(result.breakdown).toHaveLength(2)
    expect(result.breakdown[0]!.description).toBe("Arrival day")
    expect(result.breakdown[1]!.description).toBe("Departure day")
  })

  it("5 day trip: 1 arrival + 3 intermediate + 1 departure", () => {
    const result = calculateExtendedTravelAllowance({
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-06-05T00:00:00.000Z"),
      threeMonthActive: false,
      rule: baseRule,
    })

    expect(result.totalDays).toBe(5)
    expect(result.arrivalDays).toBe(1)
    expect(result.departureDays).toBe(1)
    expect(result.intermediateDays).toBe(3)
    expect(result.breakdown).toHaveLength(3)
    expect(result.breakdown[0]!.description).toBe("Arrival day")
    expect(result.breakdown[1]!.description).toBe("Intermediate days x3")
    expect(result.breakdown[1]!.days).toBe(3)
    expect(result.breakdown[1]!.taxFreeSubtotal).toBe(84.0) // 28 * 3
    expect(result.breakdown[1]!.taxableSubtotal).toBe(48.0) // 16 * 3
    expect(result.breakdown[2]!.description).toBe("Departure day")

    // Total: arrival (14+8) + 3*intermediate (3*28 + 3*16) + departure (14+8) = 22 + 132 + 22 = 176
    expect(result.taxFreeTotal).toBe(14 + 84 + 14)
    expect(result.taxableTotal).toBe(8 + 48 + 8)
    expect(result.totalAllowance).toBe(176.0)
  })

  it("three-month rule active: intermediate days use reduced rates", () => {
    const result = calculateExtendedTravelAllowance({
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-06-05T00:00:00.000Z"),
      threeMonthActive: true,
      rule: baseRule,
    })

    expect(result.totalDays).toBe(5)
    expect(result.intermediateDays).toBe(3)
    expect(result.breakdown).toHaveLength(3)
    expect(result.breakdown[1]!.description).toBe(
      "Intermediate days (three-month rule) x3"
    )
    expect(result.breakdown[1]!.taxFreeAmount).toBe(20.0)
    expect(result.breakdown[1]!.taxableAmount).toBe(12.0)
    expect(result.breakdown[1]!.taxFreeSubtotal).toBe(60.0) // 20 * 3
    expect(result.breakdown[1]!.taxableSubtotal).toBe(36.0) // 12 * 3

    expect(result.taxFreeTotal).toBe(14 + 60 + 14)
    expect(result.taxableTotal).toBe(8 + 36 + 8)
  })

  it("three-month rule inactive: intermediate days use regular rates", () => {
    const result = calculateExtendedTravelAllowance({
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-06-05T00:00:00.000Z"),
      threeMonthActive: false,
      rule: baseRule,
    })

    expect(result.breakdown[1]!.description).toBe("Intermediate days x3")
    expect(result.breakdown[1]!.taxFreeAmount).toBe(28.0)
    expect(result.breakdown[1]!.taxableAmount).toBe(16.0)
  })

  it("three-month active but not enabled on rule: uses regular rates", () => {
    const ruleNoThreeMonth: ExtendedTravelRuleInput = {
      ...baseRule,
      threeMonthEnabled: false,
    }

    const result = calculateExtendedTravelAllowance({
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-06-05T00:00:00.000Z"),
      threeMonthActive: true,
      rule: ruleNoThreeMonth,
    })

    expect(result.breakdown[1]!.description).toBe("Intermediate days x3")
    expect(result.breakdown[1]!.taxFreeAmount).toBe(28.0)
  })

  it("totals equal sum of breakdown subtotals", () => {
    const result = calculateExtendedTravelAllowance({
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2025-06-10T00:00:00.000Z"),
      threeMonthActive: false,
      rule: baseRule,
    })

    const taxFreeSum = result.breakdown.reduce(
      (sum, item) => sum + item.taxFreeSubtotal,
      0
    )
    const taxableSum = result.breakdown.reduce(
      (sum, item) => sum + item.taxableSubtotal,
      0
    )

    expect(result.taxFreeTotal).toBe(taxFreeSum)
    expect(result.taxableTotal).toBe(taxableSum)
    expect(result.totalAllowance).toBe(taxFreeSum + taxableSum)
  })

  it("same day (startDate === endDate) yields 1 day", () => {
    const result = calculateExtendedTravelAllowance({
      startDate: new Date("2025-12-25T00:00:00.000Z"),
      endDate: new Date("2025-12-25T00:00:00.000Z"),
      threeMonthActive: false,
      rule: baseRule,
    })

    expect(result.totalDays).toBe(1)
    expect(result.arrivalDays).toBe(1)
    expect(result.departureDays).toBe(0)
    expect(result.intermediateDays).toBe(0)
  })
})
