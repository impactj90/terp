import { describe, it, expect } from "vitest"
import {
  buildPeriod,
  isRecordActiveInPeriod,
} from "../export-context-builder"

describe("buildPeriod", () => {
  it("computes April 2026 metadata", () => {
    const p = buildPeriod(2026, 4)
    expect(p.year).toBe(2026)
    expect(p.month).toBe(4)
    expect(p.monthPadded).toBe("04")
    expect(p.monthName).toBe("April")
    expect(p.monthNameEn).toBe("April")
    expect(p.isoDate).toBe("2026-04")
    expect(p.ddmmyyyy).toBe("01042026")
    expect(p.firstDay).toBe("01.04.2026")
    expect(p.lastDay).toBe("30.04.2026")
  })

  it("handles month with 31 days (May)", () => {
    const p = buildPeriod(2026, 5)
    expect(p.lastDay).toBe("31.05.2026")
  })

  it("handles February in a leap year", () => {
    const p = buildPeriod(2024, 2)
    expect(p.lastDay).toBe("29.02.2024")
  })

  it("handles February in a non-leap year", () => {
    const p = buildPeriod(2026, 2)
    expect(p.lastDay).toBe("28.02.2026")
  })
})

describe("isRecordActiveInPeriod", () => {
  it("rejects records that start after period end", () => {
    expect(
      isRecordActiveInPeriod(new Date("2026-05-01"), null, 2026, 4),
    ).toBe(false)
  })

  it("rejects records that ended before period start", () => {
    expect(
      isRecordActiveInPeriod(
        new Date("2025-01-01"),
        new Date("2025-12-31"),
        2026,
        4,
      ),
    ).toBe(false)
  })

  it("accepts open-ended records that started before period", () => {
    expect(
      isRecordActiveInPeriod(new Date("2024-01-01"), null, 2026, 4),
    ).toBe(true)
  })

  it("accepts records that start within the period", () => {
    expect(
      isRecordActiveInPeriod(new Date("2026-04-15"), null, 2026, 4),
    ).toBe(true)
  })

  it("accepts records ending within the period", () => {
    expect(
      isRecordActiveInPeriod(
        new Date("2026-01-01"),
        new Date("2026-04-15"),
        2026,
        4,
      ),
    ).toBe(true)
  })

  it("accepts records spanning the entire period", () => {
    expect(
      isRecordActiveInPeriod(
        new Date("2026-01-01"),
        new Date("2026-12-31"),
        2026,
        4,
      ),
    ).toBe(true)
  })

  it("accepts records that exactly cover the start day", () => {
    expect(
      isRecordActiveInPeriod(
        new Date("2026-04-01"),
        new Date("2026-04-01"),
        2026,
        4,
      ),
    ).toBe(true)
  })

  it("accepts records that exactly cover the last day", () => {
    expect(
      isRecordActiveInPeriod(
        new Date("2026-04-30"),
        new Date("2026-04-30"),
        2026,
        4,
      ),
    ).toBe(true)
  })

  it("rejects records with no start date", () => {
    expect(isRecordActiveInPeriod(null, null, 2026, 4)).toBe(false)
  })
})
