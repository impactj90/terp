import { describe, it, expect } from "vitest"
import type { BookingPair, BreakConfig } from "../types"
import {
  calculateBreakDeduction,
  calculateOverlap,
  deductFixedBreak,
  calculateMinimumBreak,
  calculateNetTime,
  calculateOvertimeUndertime,
} from "../breaks"
import {
  WARN_AUTO_BREAK_APPLIED,
  WARN_MANUAL_BREAK,
  WARN_MAX_TIME_REACHED,
  WARN_NO_BREAK_RECORDED,
} from "../errors"

describe("calculateBreakDeduction", () => {
  it("no configs uses recorded breaks", () => {
    const result = calculateBreakDeduction([], 30, 480, [])
    expect(result.deductedMinutes).toBe(30)
    expect(result.warnings).toEqual([])
  })

  it("manual break recorded adds to total + minimum auto-deduct", () => {
    const configs: BreakConfig[] = [
      {
        type: "minimum",
        startTime: null,
        endTime: null,
        duration: 30,
        afterWorkMinutes: 300,
        autoDeduct: true,
        isPaid: false,
        minutesDifference: false,
      },
    ]

    // Manual break + minimum auto-deduct: 45 + 30 = 75
    const result = calculateBreakDeduction([], 45, 480, configs)
    expect(result.deductedMinutes).toBe(75)
    expect(result.warnings).toContain(WARN_MANUAL_BREAK)
  })

  it("manual break short also adds", () => {
    const configs: BreakConfig[] = [
      {
        type: "minimum",
        startTime: null,
        endTime: null,
        duration: 30,
        afterWorkMinutes: 300,
        autoDeduct: true,
        isPaid: false,
        minutesDifference: false,
      },
    ]

    // Manual break + minimum auto-deduct: 20 + 30 = 50
    const result = calculateBreakDeduction([], 20, 480, configs)
    expect(result.deductedMinutes).toBe(50)
    expect(result.warnings).toContain(WARN_MANUAL_BREAK)
  })

  it("auto deduct when no manual break", () => {
    const configs: BreakConfig[] = [
      {
        type: "minimum",
        startTime: null,
        endTime: null,
        duration: 30,
        afterWorkMinutes: 300,
        autoDeduct: true,
        isPaid: false,
        minutesDifference: false,
      },
    ]

    const result = calculateBreakDeduction([], 0, 480, configs)
    expect(result.deductedMinutes).toBe(30)
    expect(result.warnings).toContain(WARN_AUTO_BREAK_APPLIED)
    expect(result.warnings).toContain(WARN_NO_BREAK_RECORDED)
  })

  it("multiple break types combined", () => {
    const pairs: BookingPair[] = [
      {
        inBooking: { id: "1", time: 480, direction: "in", category: "work", pairId: null },
        outBooking: { id: "2", time: 1020, direction: "out", category: "work", pairId: null },
        category: "work",
        duration: 540,
      },
    ]
    const configs: BreakConfig[] = [
      {
        type: "fixed",
        startTime: 720,
        endTime: 750,
        duration: 30,
        afterWorkMinutes: null,
        autoDeduct: false,
        isPaid: false,
        minutesDifference: false,
      },
      {
        type: "variable",
        startTime: null,
        endTime: null,
        duration: 15,
        afterWorkMinutes: null,
        autoDeduct: true,
        isPaid: false,
        minutesDifference: false,
      },
    ]

    // Fixed: 30 min (overlap) + Variable: 15 min (no manual breaks) = 45
    const result = calculateBreakDeduction(pairs, 0, 480, configs)
    expect(result.deductedMinutes).toBe(45)
  })

  it("work threshold not met - no deduction for minimum", () => {
    const configs: BreakConfig[] = [
      {
        type: "minimum",
        startTime: null,
        endTime: null,
        duration: 30,
        afterWorkMinutes: 360,
        autoDeduct: true,
        isPaid: false,
        minutesDifference: false,
      },
    ]

    // Short work day - break not triggered
    const result = calculateBreakDeduction([], 0, 300, configs)
    expect(result.deductedMinutes).toBe(0)

    // Long work day - break triggered
    const result2 = calculateBreakDeduction([], 0, 400, configs)
    expect(result2.deductedMinutes).toBe(30)
  })
})

describe("calculateOverlap", () => {
  it.each([
    ["full overlap - work spans break", 480, 1020, 720, 750, 30],
    ["partial overlap - early end", 480, 735, 720, 750, 15],
    ["partial overlap - late start", 730, 1020, 720, 750, 20],
    ["no overlap - work before break", 480, 700, 720, 750, 0],
    ["no overlap - work after break", 800, 1020, 720, 750, 0],
    ["exact match", 720, 750, 720, 750, 30],
    ["work inside break", 725, 740, 720, 750, 15],
    ["break inside work", 480, 1020, 720, 750, 30],
    ["adjacent - no overlap", 480, 720, 720, 750, 0],
  ])("%s", (_, s1, e1, s2, e2, expected) => {
    expect(calculateOverlap(s1, e1, s2, e2)).toBe(expected)
  })
})

describe("deductFixedBreak", () => {
  const makePair = (inTime: number, outTime: number, category: "work" | "break" = "work"): BookingPair => ({
    inBooking: { id: "in", time: inTime, direction: "in", category, pairId: null },
    outBooking: { id: "out", time: outTime, direction: "out", category, pairId: null },
    category,
    duration: outTime - inTime,
  })

  const makeFixedCfg = (startTime: number | null, endTime: number | null, duration: number): BreakConfig => ({
    type: "fixed",
    startTime,
    endTime,
    duration,
    afterWorkMinutes: null,
    autoDeduct: false,
    isPaid: false,
    minutesDifference: false,
  })

  it("full overlap", () => {
    expect(deductFixedBreak([makePair(480, 1020)], makeFixedCfg(720, 750, 30))).toBe(30)
  })

  it("partial overlap", () => {
    expect(deductFixedBreak([makePair(480, 735)], makeFixedCfg(720, 750, 30))).toBe(15)
  })

  it("no overlap", () => {
    expect(deductFixedBreak([makePair(480, 690)], makeFixedCfg(720, 750, 30))).toBe(0)
  })

  it("break pairs ignored", () => {
    const pairs: BookingPair[] = [makePair(480, 1020), makePair(720, 750, "break")]
    expect(deductFixedBreak(pairs, makeFixedCfg(720, 750, 30))).toBe(30)
  })

  it("nil start time", () => {
    expect(deductFixedBreak([makePair(480, 1020)], makeFixedCfg(null, 750, 30))).toBe(0)
  })

  it("overlap exceeds duration - capped", () => {
    expect(deductFixedBreak([makePair(480, 1020)], makeFixedCfg(720, 780, 30))).toBe(30)
  })

  // Cross-midnight work pairs (e.g. Mon 22:00 → Tue 06:00) must deduct
  // fixed breaks that fall into either half of the split work window.
  describe("cross-midnight work pair", () => {
    // Work pair 22:00–06:00 (inTime=1320 > outTime=360, overnight)
    const overnight = () => makePair(1320, 360)

    it("break 22:30–23:00 during the evening half → 30 min deduction", () => {
      expect(
        deductFixedBreak([overnight()], makeFixedCfg(1350, 1380, 30)),
      ).toBe(30)
    })

    it("break 03:00–03:30 during the morning half → 30 min deduction", () => {
      expect(
        deductFixedBreak([overnight()], makeFixedCfg(180, 210, 30)),
      ).toBe(30)
    })

    it("break 12:00–13:00 (noon, outside work) → 0 deduction", () => {
      expect(
        deductFixedBreak([overnight()], makeFixedCfg(720, 780, 60)),
      ).toBe(0)
    })

    it("regression: same-day pair still deducts correctly", () => {
      expect(
        deductFixedBreak([makePair(480, 1020)], makeFixedCfg(720, 750, 30)),
      ).toBe(30)
    })
  })
})

describe("calculateMinimumBreak", () => {
  const makeCfg = (
    duration: number,
    afterWorkMinutes: number | null,
    minutesDifference = false
  ): BreakConfig => ({
    type: "minimum",
    startTime: null,
    endTime: null,
    duration,
    afterWorkMinutes,
    autoDeduct: true,
    isPaid: false,
    minutesDifference,
  })

  it("below threshold - no deduction", () => {
    expect(calculateMinimumBreak(240, makeCfg(30, 300))).toBe(0)
  })

  it("above threshold - full deduction", () => {
    expect(calculateMinimumBreak(360, makeCfg(30, 300))).toBe(30)
  })

  it("exactly at threshold - full deduction", () => {
    expect(calculateMinimumBreak(300, makeCfg(30, 300))).toBe(30)
  })

  it("MinutesDifference - proportional deduction", () => {
    expect(calculateMinimumBreak(310, makeCfg(30, 300, true))).toBe(10)
  })

  it("MinutesDifference - capped at duration", () => {
    expect(calculateMinimumBreak(360, makeCfg(30, 300, true))).toBe(30)
  })

  it("nil threshold - no deduction", () => {
    expect(calculateMinimumBreak(480, makeCfg(30, null))).toBe(0)
  })
})

describe("calculateNetTime", () => {
  it.each([
    ["basic", 480, 30, null, 450, false],
    ["no break", 480, 0, null, 480, false],
    ["negative result floors at 0", 30, 60, null, 0, false],
    ["at max", 480, 0, 480, 480, false],
    ["capped by max", 540, 0, 480, 480, true],
  ] as const)("%s", (_, gross, breakTime, maxNet, expectedNet, hasWarning) => {
    const { netTime, warnings } = calculateNetTime(gross, breakTime, maxNet)
    expect(netTime).toBe(expectedNet)
    if (hasWarning) {
      expect(warnings).toContain(WARN_MAX_TIME_REACHED)
    } else {
      expect(warnings).toEqual([])
    }
  })
})

describe("calculateOvertimeUndertime", () => {
  it.each([
    ["exact match", 480, 480, 0, 0],
    ["overtime", 540, 480, 60, 0],
    ["undertime", 420, 480, 0, 60],
    ["zero net", 0, 480, 0, 480],
  ])("%s", (_, netTime, targetTime, expOvertime, expUndertime) => {
    const { overtime, undertime } = calculateOvertimeUndertime(netTime, targetTime)
    expect(overtime).toBe(expOvertime)
    expect(undertime).toBe(expUndertime)
  })
})
