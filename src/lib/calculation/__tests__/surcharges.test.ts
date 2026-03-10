import { describe, it, expect } from "vitest"
import type { SurchargeConfig, TimePeriod, BookingPair } from "../types"
import {
  calculateSurcharges,
  splitOvernightSurcharge,
  validateSurchargeConfig,
  extractWorkPeriods,
  getHolidayCategoryFromFlag,
} from "../surcharges"

const makeSurchargeConfig = (overrides: Partial<SurchargeConfig> = {}): SurchargeConfig => ({
  accountId: "acc-1",
  accountCode: "TEST",
  timeFrom: 0,
  timeTo: 1440,
  appliesOnHoliday: false,
  appliesOnWorkday: true,
  holidayCategories: [],
  calculationType: "per_minute",
  valueMinutes: 0,
  minWorkMinutes: null,
  ...overrides,
})

describe("calculateSurcharges", () => {
  it("night shift (22:00-00:00 on workday = 60 min)", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        accountId: "night-1",
        accountCode: "NIGHT",
        timeFrom: 1320,
        timeTo: 1440,
        appliesOnWorkday: true,
        appliesOnHoliday: false,
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 1200, end: 1380 }] // 20:00-23:00

    const result = calculateSurcharges(workPeriods, configs, false, 0, 480)

    expect(result.surcharges).toHaveLength(1)
    expect(result.surcharges[0]!.accountId).toBe("night-1")
    expect(result.surcharges[0]!.accountCode).toBe("NIGHT")
    expect(result.surcharges[0]!.minutes).toBe(60) // 22:00-23:00
    expect(result.totalMinutes).toBe(60)
  })

  it("holiday surcharge (all day, category filter)", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        accountCode: "HOLIDAY",
        timeFrom: 0,
        timeTo: 1440,
        appliesOnWorkday: false,
        appliesOnHoliday: true,
        holidayCategories: [1, 2],
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 480, end: 960 }] // 08:00-16:00

    // Category 1 holiday - should apply
    const result1 = calculateSurcharges(workPeriods, configs, true, 1, 480)
    expect(result1.surcharges).toHaveLength(1)
    expect(result1.surcharges[0]!.minutes).toBe(480)

    // Category 3 holiday - should NOT apply
    const result2 = calculateSurcharges(workPeriods, configs, true, 3, 480)
    expect(result2.surcharges).toHaveLength(0)

    // Normal workday - should NOT apply
    const result3 = calculateSurcharges(workPeriods, configs, false, 0, 480)
    expect(result3.surcharges).toHaveLength(0)
  })

  it("night NOT on holiday", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        accountCode: "NIGHT",
        timeFrom: 1320,
        timeTo: 1440,
        appliesOnWorkday: true,
        appliesOnHoliday: false,
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 1200, end: 1380 }]

    // Workday - should apply
    expect(calculateSurcharges(workPeriods, configs, false, 0, 480).surcharges).toHaveLength(1)

    // Holiday - should NOT apply
    expect(calculateSurcharges(workPeriods, configs, true, 1, 480).surcharges).toHaveLength(0)
  })

  it("multiple work periods (split shift)", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        accountCode: "BONUS",
        timeFrom: 360, // 06:00
        timeTo: 480,   // 08:00
        appliesOnWorkday: true,
      }),
    ]
    const workPeriods: TimePeriod[] = [
      { start: 300, end: 420 }, // 05:00-07:00 (overlap: 06:00-07:00 = 60)
      { start: 450, end: 540 }, // 07:30-09:00 (overlap: 07:30-08:00 = 30)
    ]

    const result = calculateSurcharges(workPeriods, configs, false, 0, 480)
    expect(result.surcharges).toHaveLength(1)
    expect(result.surcharges[0]!.minutes).toBe(90)
  })

  it("no work periods", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({ timeFrom: 1320, timeTo: 1440 }),
    ]

    const result = calculateSurcharges([], configs, false, 0, 480)
    expect(result.surcharges).toHaveLength(0)
    expect(result.totalMinutes).toBe(0)
  })

  it("no overlap", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({ timeFrom: 1320, timeTo: 1440 }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 480, end: 960 }] // daytime

    const result = calculateSurcharges(workPeriods, configs, false, 0, 480)
    expect(result.surcharges).toHaveLength(0)
  })

  it("per_minute (default)", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        timeFrom: 1320,
        timeTo: 1440,
        calculationType: "per_minute",
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 1200, end: 1380 }]

    const result = calculateSurcharges(workPeriods, configs, false, 0, 480)
    expect(result.surcharges[0]!.minutes).toBe(60) // 22:00-23:00 overlap
  })

  it("fixed (flat 30 regardless of overlap)", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        timeFrom: 1320,
        timeTo: 1440,
        calculationType: "fixed",
        valueMinutes: 30,
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 1200, end: 1380 }]

    const result = calculateSurcharges(workPeriods, configs, false, 0, 480)
    expect(result.surcharges).toHaveLength(1)
    expect(result.surcharges[0]!.minutes).toBe(30)
  })

  it("fixed no overlap (skipped)", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        timeFrom: 1320,
        timeTo: 1440,
        calculationType: "fixed",
        valueMinutes: 30,
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 480, end: 960 }]

    const result = calculateSurcharges(workPeriods, configs, false, 0, 480)
    expect(result.surcharges).toHaveLength(0) // No overlap = no bonus
  })

  it("percentage (60*50/100=30)", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        timeFrom: 1320,
        timeTo: 1440,
        calculationType: "percentage",
        valueMinutes: 50, // 50%
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 1200, end: 1380 }]

    const result = calculateSurcharges(workPeriods, configs, false, 0, 480)
    expect(result.surcharges).toHaveLength(1)
    expect(result.surcharges[0]!.minutes).toBe(30) // 60 * 50 / 100
  })

  it("minWorkMinutes below threshold (skipped)", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        timeFrom: 1320,
        timeTo: 1440,
        minWorkMinutes: 480,
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 1200, end: 1380 }]

    // Net work time 240 < 480 threshold
    const result = calculateSurcharges(workPeriods, configs, false, 0, 240)
    expect(result.surcharges).toHaveLength(0)
  })

  it("minWorkMinutes above threshold", () => {
    const configs: SurchargeConfig[] = [
      makeSurchargeConfig({
        timeFrom: 1320,
        timeTo: 1440,
        minWorkMinutes: 240,
      }),
    ]
    const workPeriods: TimePeriod[] = [{ start: 1200, end: 1380 }]

    const result = calculateSurcharges(workPeriods, configs, false, 0, 480)
    expect(result.surcharges).toHaveLength(1)
    expect(result.surcharges[0]!.minutes).toBe(60)
  })
})

describe("validateSurchargeConfig", () => {
  it("valid config", () => {
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: 360, timeTo: 480 }))).toHaveLength(0)
  })

  it("valid full day", () => {
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: 0, timeTo: 1440 }))).toHaveLength(0)
  })

  it("overnight span invalid", () => {
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: 1320, timeTo: 360 }))).toHaveLength(1)
  })

  it("negative timeFrom", () => {
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: -10, timeTo: 360 }))).toHaveLength(1)
  })

  it("timeFrom at 1440", () => {
    // Both time_from invalid AND from >= to
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: 1440, timeTo: 1440 }))).toHaveLength(2)
  })

  it("timeTo out of range", () => {
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: 360, timeTo: 1500 }))).toHaveLength(1)
  })

  it("timeTo zero", () => {
    // time_to invalid AND from >= to
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: 0, timeTo: 0 }))).toHaveLength(2)
  })

  it("from equals to", () => {
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: 480, timeTo: 480 }))).toHaveLength(1)
  })

  it("from greater than to", () => {
    expect(validateSurchargeConfig(makeSurchargeConfig({ timeFrom: 600, timeTo: 480 }))).toHaveLength(1)
  })
})

describe("splitOvernightSurcharge", () => {
  it("overnight split (22:00-06:00 -> [22:00-00:00, 00:00-06:00])", () => {
    const config = makeSurchargeConfig({
      accountCode: "NIGHT",
      timeFrom: 1320,
      timeTo: 360,
      appliesOnWorkday: true,
      appliesOnHoliday: false,
    })

    const result = splitOvernightSurcharge(config)

    expect(result).toHaveLength(2)

    // Evening: 22:00-00:00
    expect(result[0]!.timeFrom).toBe(1320)
    expect(result[0]!.timeTo).toBe(1440)
    expect(result[0]!.accountId).toBe(config.accountId)
    expect(result[0]!.accountCode).toBe("NIGHT")
    expect(result[0]!.appliesOnWorkday).toBe(true)
    expect(result[0]!.appliesOnHoliday).toBe(false)

    // Morning: 00:00-06:00
    expect(result[1]!.timeFrom).toBe(0)
    expect(result[1]!.timeTo).toBe(360)
    expect(result[1]!.accountId).toBe(config.accountId)
  })

  it("already valid returns as-is", () => {
    const config = makeSurchargeConfig({ timeFrom: 480, timeTo: 600 })

    const result = splitOvernightSurcharge(config)

    expect(result).toHaveLength(1)
    expect(result[0]!.timeFrom).toBe(480)
    expect(result[0]!.timeTo).toBe(600)
  })

  it("preserves new fields (calculationType, valueMinutes, minWorkMinutes)", () => {
    const config = makeSurchargeConfig({
      timeFrom: 1320,
      timeTo: 360,
      calculationType: "fixed",
      valueMinutes: 30,
      minWorkMinutes: 240,
    })

    const result = splitOvernightSurcharge(config)

    expect(result).toHaveLength(2)
    for (const r of result) {
      expect(r.calculationType).toBe("fixed")
      expect(r.valueMinutes).toBe(30)
      expect(r.minWorkMinutes).toBe(240)
    }
  })
})

describe("extractWorkPeriods", () => {
  it("filters work pairs", () => {
    const pairs: BookingPair[] = [
      {
        inBooking: { id: "1", time: 480, direction: "in", category: "work", pairId: null },
        outBooking: { id: "2", time: 720, direction: "out", category: "work", pairId: null },
        category: "work",
        duration: 240,
      },
      {
        inBooking: { id: "3", time: 720, direction: "in", category: "break", pairId: null },
        outBooking: { id: "4", time: 750, direction: "out", category: "break", pairId: null },
        category: "break",
        duration: 30,
      },
      {
        inBooking: { id: "5", time: 750, direction: "in", category: "work", pairId: null },
        outBooking: { id: "6", time: 1020, direction: "out", category: "work", pairId: null },
        category: "work",
        duration: 270,
      },
    ]

    const periods = extractWorkPeriods(pairs)

    expect(periods).toHaveLength(2)
    expect(periods[0]!.start).toBe(480)
    expect(periods[0]!.end).toBe(720)
    expect(periods[1]!.start).toBe(750)
    expect(periods[1]!.end).toBe(1020)
  })

  it("skips incomplete pairs", () => {
    const pairs: BookingPair[] = [
      {
        inBooking: { id: "1", time: 480, direction: "in", category: "work", pairId: null },
        outBooking: null,
        category: "work",
        duration: 0,
      },
      {
        inBooking: null,
        outBooking: { id: "2", time: 720, direction: "out", category: "work", pairId: null },
        category: "work",
        duration: 0,
      },
    ]

    const periods = extractWorkPeriods(pairs)
    expect(periods).toHaveLength(0)
  })
})

describe("getHolidayCategoryFromFlag", () => {
  it("full day = 1", () => {
    expect(getHolidayCategoryFromFlag(false)).toBe(1)
  })

  it("half day = 2", () => {
    expect(getHolidayCategoryFromFlag(true)).toBe(2)
  })
})
