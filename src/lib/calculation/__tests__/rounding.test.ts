import { describe, it, expect } from "vitest"
import type { RoundingConfig } from "../types"
import { roundTime, roundComeTime, roundGoTime } from "../rounding"

describe("roundTime", () => {
  it("returns unchanged for null config", () => {
    expect(roundTime(487, null)).toBe(487)
  })

  it("returns unchanged for 'none' type", () => {
    const config: RoundingConfig = { type: "none", interval: 15, addValue: 0, anchorTime: null }
    expect(roundTime(487, config)).toBe(487)
  })

  it("returns unchanged for zero interval", () => {
    const config: RoundingConfig = { type: "up", interval: 0, addValue: 0, anchorTime: null }
    expect(roundTime(487, config)).toBe(487)
  })

  describe("round up", () => {
    const config: RoundingConfig = { type: "up", interval: 15, addValue: 0, anchorTime: null }

    it.each([
      ["already rounded", 480, 480],
      ["needs rounding", 481, 495],
      ["one minute before", 479, 480],
      ["halfway", 487, 495],
      ["just after boundary", 495, 495],
    ])("%s: %d -> %d", (_, input, expected) => {
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  describe("round down", () => {
    const config: RoundingConfig = { type: "down", interval: 15, addValue: 0, anchorTime: null }

    it.each([
      ["already rounded", 480, 480],
      ["needs rounding", 481, 480],
      ["one minute before boundary", 494, 480],
      ["halfway", 487, 480],
    ])("%s: %d -> %d", (_, input, expected) => {
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  describe("round nearest", () => {
    const config: RoundingConfig = { type: "nearest", interval: 15, addValue: 0, anchorTime: null }

    it.each([
      ["already rounded", 480, 480],
      ["round down", 481, 480],
      ["round down boundary", 487, 480],
      ["round up", 488, 495],
      ["round up near boundary", 494, 495],
    ])("%s: %d -> %d", (_, input, expected) => {
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  describe("different intervals", () => {
    it.each([
      ["5 min up", 482, 5, "up" as const, 485],
      ["5 min down", 484, 5, "down" as const, 480],
      ["10 min nearest", 486, 10, "nearest" as const, 490],
      ["30 min up", 491, 30, "up" as const, 510],
    ])("%s: %d with interval %d -> %d", (_, input, interval, typ, expected) => {
      const config: RoundingConfig = { type: typ, interval, addValue: 0, anchorTime: null }
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  describe("round add", () => {
    it.each([
      ["add 10 to 05:55", 355, 10, 365],
      ["add 10 to 07:32", 452, 10, 462],
      ["add 5 to 08:00", 480, 5, 485],
      ["add 15 to midnight", 0, 15, 15],
      ["add 30 to 23:30", 1410, 30, 1440],
      ["add 60 to 23:30 (overflow)", 1410, 60, 1470],
    ])("%s: %d + %d = %d", (_, input, addValue, expected) => {
      const config: RoundingConfig = { type: "add", interval: 0, addValue, anchorTime: null }
      expect(roundTime(input, config)).toBe(expected)
    })

    it("zero value returns original", () => {
      const config: RoundingConfig = { type: "add", interval: 0, addValue: 0, anchorTime: null }
      expect(roundTime(480, config)).toBe(480)
    })

    it("negative value returns original", () => {
      const config: RoundingConfig = { type: "add", interval: 0, addValue: -10, anchorTime: null }
      expect(roundTime(480, config)).toBe(480)
    })
  })

  describe("round subtract", () => {
    it.each([
      ["subtract 10 from 16:10", 970, 10, 960],
      ["subtract 10 from 17:05", 1025, 10, 1015],
      ["subtract 5 from 08:05", 485, 5, 480],
      ["subtract 15 from 00:30", 30, 15, 15],
      ["subtract 30 from 00:20 (clamp)", 20, 30, 0],
    ])("%s: %d - %d = %d", (_, input, addValue, expected) => {
      const config: RoundingConfig = { type: "subtract", interval: 0, addValue, anchorTime: null }
      expect(roundTime(input, config)).toBe(expected)
    })

    it("zero value returns original", () => {
      const config: RoundingConfig = { type: "subtract", interval: 0, addValue: 0, anchorTime: null }
      expect(roundTime(480, config)).toBe(480)
    })

    it("negative value returns original", () => {
      const config: RoundingConfig = { type: "subtract", interval: 0, addValue: -10, anchorTime: null }
      expect(roundTime(480, config)).toBe(480)
    })

    describe("clamp to zero", () => {
      it.each([
        ["exactly equals time", 30, 30, 0],
        ["more than time", 20, 50, 0],
        ["from zero", 0, 10, 0],
      ])("%s: %d - %d = %d", (_, input, addValue, expected) => {
        const config: RoundingConfig = { type: "subtract", interval: 0, addValue, anchorTime: null }
        expect(roundTime(input, config)).toBe(expected)
      })
    })
  })

  describe("add/subtract ignores interval", () => {
    it("add ignores interval", () => {
      const config: RoundingConfig = { type: "add", interval: 15, addValue: 10, anchorTime: null }
      expect(roundTime(480, config)).toBe(490)
    })

    it("subtract ignores interval", () => {
      const config: RoundingConfig = { type: "subtract", interval: 15, addValue: 10, anchorTime: null }
      expect(roundTime(480, config)).toBe(470)
    })
  })

  describe("interval ignores addValue", () => {
    it.each([
      ["up ignores addValue", "up" as const, 482, 5, 100, 485],
      ["down ignores addValue", "down" as const, 484, 5, 100, 480],
      ["nearest ignores addValue", "nearest" as const, 483, 5, 100, 485],
    ])("%s", (_, typ, input, interval, addValue, expected) => {
      const config: RoundingConfig = { type: typ, interval, addValue, anchorTime: null }
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  // --- Anchored Rounding Tests (ZMI-TICKET-023: Relative-to-plan rounding) ---

  describe("anchored round up", () => {
    // Anchor at 07:03 (423 min), interval=5
    // Grid: ...418, 423, 428, 433, 438...
    const config: RoundingConfig = { type: "up", interval: 5, addValue: 0, anchorTime: 423 }

    it.each([
      ["exactly on anchor", 423, 423],
      ["one above anchor", 424, 428],
      ["two below anchor", 421, 423],
      ["on grid point above", 428, 428],
      ["between grid points", 425, 428],
      ["far below anchor", 420, 423],
      ["well above anchor", 430, 433],
      ["at grid point below anchor", 418, 418],
      ["one below grid point", 417, 418],
    ])("%s: %d -> %d", (_, input, expected) => {
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  describe("anchored round down", () => {
    const config: RoundingConfig = { type: "down", interval: 5, addValue: 0, anchorTime: 423 }

    it.each([
      ["exactly on anchor", 423, 423],
      ["one above anchor", 424, 423],
      ["four above anchor", 427, 423],
      ["one below anchor", 422, 418],
      ["on grid point above", 428, 428],
      ["between grid points above", 430, 428],
    ])("%s: %d -> %d", (_, input, expected) => {
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  describe("anchored round nearest", () => {
    const config: RoundingConfig = { type: "nearest", interval: 5, addValue: 0, anchorTime: 423 }

    it.each([
      ["exactly on anchor", 423, 423],
      ["round down offset 1", 424, 423],
      ["round down offset 2", 425, 423],
      ["round up offset 3", 426, 428],
      ["round up offset 4", 427, 428],
      ["on grid point above", 428, 428],
      ["one below anchor", 422, 423],
      ["two below anchor", 421, 423],
      ["three below anchor", 420, 418],
    ])("%s: %d -> %d", (_, input, expected) => {
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  it("nil anchor falls back to standard rounding", () => {
    const config: RoundingConfig = { type: "up", interval: 5, addValue: 0, anchorTime: null }
    expect(roundTime(482, config)).toBe(485)
  })

  describe("anchored larger interval", () => {
    // Anchor at 08:00 (480), interval=15
    // Grid: ...465, 480, 495, 510...
    const config: RoundingConfig = { type: "up", interval: 15, addValue: 0, anchorTime: 480 }

    it.each([
      ["exactly on anchor", 480, 480],
      ["1 min after", 481, 495],
      ["14 min after", 494, 495],
      ["1 min before anchor", 479, 480],
      ["14 min before anchor", 466, 480],
      ["on grid below", 465, 465],
    ])("%s: %d -> %d", (_, input, expected) => {
      expect(roundTime(input, config)).toBe(expected)
    })
  })

  it("add/subtract ignores anchor", () => {
    const configAdd: RoundingConfig = { type: "add", interval: 0, addValue: 10, anchorTime: 480 }
    const configSub: RoundingConfig = { type: "subtract", interval: 0, addValue: 10, anchorTime: 480 }
    expect(roundTime(480, configAdd)).toBe(490)
    expect(roundTime(480, configSub)).toBe(470)
  })
})

describe("roundComeTime", () => {
  it("delegates to roundTime", () => {
    const config: RoundingConfig = { type: "up", interval: 15, addValue: 0, anchorTime: null }
    expect(roundComeTime(483, config)).toBe(roundTime(483, config))
  })
})

describe("roundGoTime", () => {
  it("delegates to roundTime", () => {
    const config: RoundingConfig = { type: "down", interval: 15, addValue: 0, anchorTime: null }
    expect(roundGoTime(1017, config)).toBe(roundTime(1017, config))
  })
})
