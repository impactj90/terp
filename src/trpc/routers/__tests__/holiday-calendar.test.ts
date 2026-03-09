import { describe, it, expect } from "vitest"
import {
  easterSunday,
  generateHolidays,
  parseState,
  GERMAN_STATES,
} from "@/lib/services/holiday-calendar"

// --- easterSunday tests ---

describe("easterSunday", () => {
  it("returns correct date for 2024", () => {
    const easter = easterSunday(2024)
    expect(easter.getUTCFullYear()).toBe(2024)
    expect(easter.getUTCMonth()).toBe(2) // March
    expect(easter.getUTCDate()).toBe(31)
  })

  it("returns correct date for 2025", () => {
    const easter = easterSunday(2025)
    expect(easter.getUTCFullYear()).toBe(2025)
    expect(easter.getUTCMonth()).toBe(3) // April
    expect(easter.getUTCDate()).toBe(20)
  })

  it("returns correct date for 2026", () => {
    const easter = easterSunday(2026)
    expect(easter.getUTCFullYear()).toBe(2026)
    expect(easter.getUTCMonth()).toBe(3) // April
    expect(easter.getUTCDate()).toBe(5)
  })

  it("returns correct date for 2027", () => {
    const easter = easterSunday(2027)
    expect(easter.getUTCFullYear()).toBe(2027)
    expect(easter.getUTCMonth()).toBe(2) // March
    expect(easter.getUTCDate()).toBe(28)
  })
})

// --- parseState tests ---

describe("parseState", () => {
  it("parses valid state codes", () => {
    expect(parseState("BY")).toBe("BY")
    expect(parseState("NW")).toBe("NW")
    expect(parseState("BE")).toBe("BE")
  })

  it("parses case-insensitively", () => {
    expect(parseState("by")).toBe("BY")
    expect(parseState("nw")).toBe("NW")
    expect(parseState("  be  ")).toBe("BE")
  })

  it("rejects invalid state codes", () => {
    expect(() => parseState("XX")).toThrow("Unknown state: XX")
    expect(() => parseState("")).toThrow()
    expect(() => parseState("Bavaria")).toThrow()
  })
})

// --- generateHolidays tests ---

describe("generateHolidays", () => {
  it("generates 13 holidays for Bayern (BY)", () => {
    const holidays = generateHolidays(2026, "BY")
    expect(holidays).toHaveLength(13)
    // 9 nationwide + Heilige Drei Koenige + Fronleichnam + Mariae Himmelfahrt + Allerheiligen
    const names = holidays.map((h) => h.name)
    expect(names).toContain("Neujahr")
    expect(names).toContain("Heilige Drei Koenige")
    expect(names).toContain("Fronleichnam")
    expect(names).toContain("Mariae Himmelfahrt")
    expect(names).toContain("Allerheiligen")
  })

  it("generates 10 holidays for Berlin (BE)", () => {
    const holidays = generateHolidays(2026, "BE")
    expect(holidays).toHaveLength(10)
    // 9 nationwide + Internationaler Frauentag
    const names = holidays.map((h) => h.name)
    expect(names).toContain("Internationaler Frauentag")
    expect(names).not.toContain("Reformationstag")
    expect(names).not.toContain("Heilige Drei Koenige")
  })

  it("generates 11 holidays for Sachsen (SN)", () => {
    const holidays = generateHolidays(2026, "SN")
    expect(holidays).toHaveLength(11)
    // 9 nationwide + Reformationstag + Buss- und Bettag
    const names = holidays.map((h) => h.name)
    expect(names).toContain("Reformationstag")
    expect(names).toContain("Buss- und Bettag")
  })

  it("generates 12 holidays for Brandenburg (BB)", () => {
    const holidays = generateHolidays(2026, "BB")
    expect(holidays).toHaveLength(12)
    // 9 nationwide + Ostersonntag + Pfingstsonntag + Reformationstag
    const names = holidays.map((h) => h.name)
    expect(names).toContain("Ostersonntag")
    expect(names).toContain("Pfingstsonntag")
    expect(names).toContain("Reformationstag")
  })

  it("sorts results by date ascending", () => {
    const holidays = generateHolidays(2026, "BY")
    for (let i = 1; i < holidays.length; i++) {
      expect(holidays[i]!.date.getTime()).toBeGreaterThanOrEqual(
        holidays[i - 1]!.date.getTime()
      )
    }
  })

  it("rejects year < 1900", () => {
    expect(() => generateHolidays(1899, "BY")).toThrow("Invalid year")
  })

  it("rejects year > 2200", () => {
    expect(() => generateHolidays(2201, "BY")).toThrow("Invalid year")
  })

  it("Neujahr is Jan 1 for all states", () => {
    for (const state of GERMAN_STATES) {
      const holidays = generateHolidays(2026, state)
      const neujahr = holidays.find((h) => h.name === "Neujahr")
      expect(neujahr).toBeDefined()
      expect(neujahr!.date.getUTCMonth()).toBe(0) // January
      expect(neujahr!.date.getUTCDate()).toBe(1)
    }
  })
})

// --- Repentance Day (Buss- und Bettag) ---

describe("repentanceDay", () => {
  it("is a Wednesday before Nov 23 for 2026", () => {
    const holidays = generateHolidays(2026, "SN")
    const bbt = holidays.find((h) => h.name === "Buss- und Bettag")
    expect(bbt).toBeDefined()
    expect(bbt!.date.getUTCDay()).toBe(3) // Wednesday
    expect(bbt!.date.getUTCMonth()).toBe(10) // November
    expect(bbt!.date.getUTCDate()).toBeLessThan(23)
    // 2026: Nov 18 is the Wednesday before Nov 23
    expect(bbt!.date.getUTCDate()).toBe(18)
  })

  it("is a Wednesday before Nov 23 for 2025", () => {
    const holidays = generateHolidays(2025, "SN")
    const bbt = holidays.find((h) => h.name === "Buss- und Bettag")
    expect(bbt).toBeDefined()
    expect(bbt!.date.getUTCDay()).toBe(3) // Wednesday
    expect(bbt!.date.getUTCDate()).toBe(19) // Nov 19, 2025
  })

  it("is a Wednesday before Nov 23 for 2024", () => {
    const holidays = generateHolidays(2024, "SN")
    const bbt = holidays.find((h) => h.name === "Buss- und Bettag")
    expect(bbt).toBeDefined()
    expect(bbt!.date.getUTCDay()).toBe(3) // Wednesday
    expect(bbt!.date.getUTCDate()).toBe(20) // Nov 20, 2024
  })
})
