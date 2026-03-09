import type { ToleranceConfig } from "../types"
import { applyComeTolerance, applyGoTolerance, validateTimeWindow, validateCoreHours } from "../tolerance"
import { ERR_MISSED_CORE_START, ERR_MISSED_CORE_END } from "../errors"

describe("applyComeTolerance", () => {
  it("returns unchanged time when expectedTime is null", () => {
    const tolerance: ToleranceConfig = { comePlus: 5, comeMinus: 5, goPlus: 0, goMinus: 0 }
    expect(applyComeTolerance(485, null, tolerance)).toBe(485)
  })

  describe("late arrival", () => {
    const expected = 480 // 08:00
    const tolerance: ToleranceConfig = { comePlus: 5, comeMinus: 5, goPlus: 0, goMinus: 0 }

    it("within tolerance - snaps to expected", () => {
      expect(applyComeTolerance(483, expected, tolerance)).toBe(480)
    })

    it("at tolerance boundary - snaps to expected", () => {
      expect(applyComeTolerance(485, expected, tolerance)).toBe(480)
    })

    it("beyond tolerance - unchanged", () => {
      expect(applyComeTolerance(486, expected, tolerance)).toBe(486)
    })
  })

  describe("early arrival", () => {
    const expected = 480 // 08:00
    const tolerance: ToleranceConfig = { comePlus: 5, comeMinus: 10, goPlus: 0, goMinus: 0 }

    it("within tolerance - snaps to expected", () => {
      expect(applyComeTolerance(475, expected, tolerance)).toBe(480)
    })

    it("at tolerance boundary - snaps to expected", () => {
      expect(applyComeTolerance(470, expected, tolerance)).toBe(480)
    })

    it("beyond tolerance - unchanged", () => {
      expect(applyComeTolerance(469, expected, tolerance)).toBe(469)
    })
  })
})

describe("applyGoTolerance", () => {
  it("returns unchanged time when expectedTime is null", () => {
    const tolerance: ToleranceConfig = { comePlus: 0, comeMinus: 0, goPlus: 5, goMinus: 5 }
    expect(applyGoTolerance(1020, null, tolerance)).toBe(1020)
  })

  describe("early departure", () => {
    const expected = 1020 // 17:00
    const tolerance: ToleranceConfig = { comePlus: 0, comeMinus: 0, goPlus: 5, goMinus: 5 }

    it("within tolerance - snaps to expected", () => {
      expect(applyGoTolerance(1017, expected, tolerance)).toBe(1020)
    })

    it("at tolerance boundary - snaps to expected", () => {
      expect(applyGoTolerance(1015, expected, tolerance)).toBe(1020)
    })

    it("beyond tolerance - unchanged", () => {
      expect(applyGoTolerance(1014, expected, tolerance)).toBe(1014)
    })
  })

  describe("late departure", () => {
    const expected = 1020 // 17:00
    const tolerance: ToleranceConfig = { comePlus: 0, comeMinus: 0, goPlus: 10, goMinus: 5 }

    it("within tolerance - snaps to expected", () => {
      expect(applyGoTolerance(1025, expected, tolerance)).toBe(1020)
    })

    it("at tolerance boundary - snaps to expected", () => {
      expect(applyGoTolerance(1030, expected, tolerance)).toBe(1020)
    })

    it("beyond tolerance - unchanged", () => {
      expect(applyGoTolerance(1031, expected, tolerance)).toBe(1031)
    })
  })
})

describe("validateTimeWindow", () => {
  const from = 480 // 08:00
  const to = 510   // 08:30

  it("within window - no errors", () => {
    expect(validateTimeWindow(490, from, to, "EARLY", "LATE")).toEqual([])
  })

  it("at from boundary - no errors", () => {
    expect(validateTimeWindow(480, from, to, "EARLY", "LATE")).toEqual([])
  })

  it("at to boundary - no errors", () => {
    expect(validateTimeWindow(510, from, to, "EARLY", "LATE")).toEqual([])
  })

  it("too early - returns early code", () => {
    expect(validateTimeWindow(470, from, to, "EARLY", "LATE")).toEqual(["EARLY"])
  })

  it("too late - returns late code", () => {
    expect(validateTimeWindow(520, from, to, "EARLY", "LATE")).toEqual(["LATE"])
  })

  it("nil boundaries - no errors", () => {
    expect(validateTimeWindow(490, null, null, "EARLY", "LATE")).toEqual([])
  })
})

describe("validateCoreHours", () => {
  const coreStart = 540 // 09:00
  const coreEnd = 960   // 16:00

  it("covers core hours", () => {
    expect(validateCoreHours(480, 1020, coreStart, coreEnd)).toEqual([])
  })

  it("exact core hours", () => {
    expect(validateCoreHours(540, 960, coreStart, coreEnd)).toEqual([])
  })

  it("missed start", () => {
    expect(validateCoreHours(600, 1020, coreStart, coreEnd)).toEqual([ERR_MISSED_CORE_START])
  })

  it("missed end", () => {
    expect(validateCoreHours(480, 900, coreStart, coreEnd)).toEqual([ERR_MISSED_CORE_END])
  })

  it("missed both", () => {
    expect(validateCoreHours(600, 900, coreStart, coreEnd)).toEqual([
      ERR_MISSED_CORE_START,
      ERR_MISSED_CORE_END,
    ])
  })

  it("null firstCome", () => {
    expect(validateCoreHours(null, 1020, coreStart, coreEnd)).toEqual([ERR_MISSED_CORE_START])
  })

  it("null lastGo", () => {
    expect(validateCoreHours(480, null, coreStart, coreEnd)).toEqual([ERR_MISSED_CORE_END])
  })

  it("no core hours defined", () => {
    expect(validateCoreHours(480, 1020, null, null)).toEqual([])
  })
})
