import { describe, it, expect } from "vitest"
import {
  addInterval,
  calculateDaysUntilDue,
  calculateNextDueAt,
} from "../service-schedule-date-utils"

// Tests use local-time accessors (.getMonth(), .getDate(), .getFullYear())
// consistent with the `billing-recurring-invoice-service.test.ts`
// pattern: `calculateNextDueAt` mutates using `setMonth`/`setFullYear`
// (local-time ops), so assertions must read in the same timezone frame.

// ---------------------------------------------------------------------------
// addInterval
// ---------------------------------------------------------------------------

describe("addInterval", () => {
  it("advances DAYS correctly", () => {
    const base = new Date("2026-01-15")
    const result = addInterval(base, 10, "DAYS")
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(25)
  })

  it("advances MONTHS correctly", () => {
    const base = new Date("2026-01-15")
    const result = addInterval(base, 3, "MONTHS")
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(3) // April
    expect(result.getDate()).toBe(15)
  })

  it("advances YEARS correctly", () => {
    const base = new Date("2026-03-15")
    const result = addInterval(base, 2, "YEARS")
    expect(result.getFullYear()).toBe(2028)
    expect(result.getMonth()).toBe(2) // March
    expect(result.getDate()).toBe(15)
  })

  it("does not mutate the input", () => {
    const base = new Date("2026-01-15")
    const snapshot = base.getTime()
    addInterval(base, 5, "DAYS")
    expect(base.getTime()).toBe(snapshot)
  })
})

// ---------------------------------------------------------------------------
// calculateNextDueAt
// ---------------------------------------------------------------------------

describe("calculateNextDueAt", () => {
  it("TIME_BASED returns null when lastCompletedAt is null", () => {
    const now = new Date("2026-05-01")
    const result = calculateNextDueAt("TIME_BASED", 3, "MONTHS", null, null, now)
    expect(result).toBeNull()
  })

  it("TIME_BASED advances from lastCompletedAt by interval", () => {
    const now = new Date("2026-05-01")
    const lastCompleted = new Date("2026-03-01")
    const result = calculateNextDueAt(
      "TIME_BASED",
      3,
      "MONTHS",
      lastCompleted,
      null,
      now,
    )
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(2026)
    expect(result!.getMonth()).toBe(5) // June (March + 3 months)
    expect(result!.getDate()).toBe(1)
  })

  it("TIME_BASED with DAYS unit advances day count", () => {
    const now = new Date("2026-05-01")
    const lastCompleted = new Date("2026-03-01")
    const result = calculateNextDueAt(
      "TIME_BASED",
      30,
      "DAYS",
      lastCompleted,
      null,
      now,
    )
    expect(result).not.toBeNull()
    // March 1 + 30 days = March 31
    expect(result!.getMonth()).toBe(2)
    expect(result!.getDate()).toBe(31)
  })

  it("CALENDAR_FIXED advances past now (anchor before now, yearly)", () => {
    const anchor = new Date("2026-03-01")
    const now = new Date("2026-05-01")
    const result = calculateNextDueAt(
      "CALENDAR_FIXED",
      1,
      "YEARS",
      null,
      anchor,
      now,
    )
    expect(result).not.toBeNull()
    // anchor 2026-03-01 <= now 2026-05-01 → advance → 2027-03-01
    expect(result!.getFullYear()).toBe(2027)
    expect(result!.getMonth()).toBe(2)
    expect(result!.getDate()).toBe(1)
  })

  it("CALENDAR_FIXED multi-advance when anchor is years in the past", () => {
    const anchor = new Date("2020-03-01")
    const now = new Date("2026-05-01")
    const result = calculateNextDueAt(
      "CALENDAR_FIXED",
      1,
      "YEARS",
      null,
      anchor,
      now,
    )
    expect(result).not.toBeNull()
    // 2020 → 2021 → 2022 → 2023 → 2024 → 2025 → 2026(<=now) → 2027 ✓
    expect(result!.getFullYear()).toBe(2027)
    expect(result!.getMonth()).toBe(2)
    expect(result!.getDate()).toBe(1)
  })

  it("CALENDAR_FIXED does not advance when anchor is already in the future", () => {
    const anchor = new Date("2026-03-01")
    const now = new Date("2026-02-01")
    const result = calculateNextDueAt(
      "CALENDAR_FIXED",
      1,
      "YEARS",
      null,
      anchor,
      now,
    )
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(2026)
    expect(result!.getMonth()).toBe(2)
    expect(result!.getDate()).toBe(1)
  })

  it("CALENDAR_FIXED advances past lastCompletedAt when completed after anchor", () => {
    const anchor = new Date("2026-03-01")
    const lastCompleted = new Date("2026-04-15")
    const now = new Date("2026-05-01")
    const result = calculateNextDueAt(
      "CALENDAR_FIXED",
      1,
      "YEARS",
      lastCompleted,
      anchor,
      now,
    )
    expect(result).not.toBeNull()
    // After now-advance: candidate = 2027-03-01.
    // lastCompleted = 2026-04-15; 2027-03-01 > 2026-04-15 → no further advance.
    expect(result!.getFullYear()).toBe(2027)
    expect(result!.getMonth()).toBe(2)
    expect(result!.getDate()).toBe(1)
  })

  it("CALENDAR_FIXED documents native JS month-end semantics (Jan 31 + 1 month → Mar 3)", () => {
    // Native JS: `setMonth(1)` on Jan 31 overflows (Feb has no 31st) → Mar 3.
    // We DO NOT correct for this: it mirrors
    // `billing-recurring-invoice-service.calculateNextDueDate`.
    const anchor = new Date("2026-01-31")
    const now = new Date("2026-02-01")
    const result = calculateNextDueAt(
      "CALENDAR_FIXED",
      1,
      "MONTHS",
      null,
      anchor,
      now,
    )
    expect(result).not.toBeNull()
    // 2026-01-31 <= now 2026-02-01 → +1 MONTH → Feb 31 overflows → Mar 3.
    expect(result!.getFullYear()).toBe(2026)
    expect(result!.getMonth()).toBe(2) // March
    expect(result!.getDate()).toBe(3)
  })

  it("CALENDAR_FIXED documents native JS leap-year semantics (Feb 29 + 1 year → Mar 1)", () => {
    // Feb 29 2024 + 1 year in native JS → Mar 1 2025 (2025 is not a leap year).
    const anchor = new Date("2024-02-29")
    const now = new Date("2026-05-01")
    const result = calculateNextDueAt(
      "CALENDAR_FIXED",
      1,
      "YEARS",
      null,
      anchor,
      now,
    )
    expect(result).not.toBeNull()
    // Iterations:
    //   2024-02-29 → +1y → 2025-03-01 (Feb 29 → overflow)
    //   2025-03-01 <= now → +1y → 2026-03-01
    //   2026-03-01 <= now → +1y → 2027-03-01 (final)
    expect(result!.getFullYear()).toBe(2027)
    expect(result!.getMonth()).toBe(2)
    expect(result!.getDate()).toBe(1)
  })

  it("CALENDAR_FIXED returns null when anchorDate is null", () => {
    const now = new Date("2026-05-01")
    const result = calculateNextDueAt("CALENDAR_FIXED", 1, "YEARS", null, null, now)
    expect(result).toBeNull()
  })

  it("TIME_BASED with YEARS unit advances full year", () => {
    const now = new Date("2026-05-01")
    const lastCompleted = new Date("2026-03-01")
    const result = calculateNextDueAt(
      "TIME_BASED",
      1,
      "YEARS",
      lastCompleted,
      null,
      now,
    )
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(2027)
    expect(result!.getMonth()).toBe(2)
    expect(result!.getDate()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// calculateDaysUntilDue
// ---------------------------------------------------------------------------

describe("calculateDaysUntilDue", () => {
  it("returns null when nextDueAt is null", () => {
    const now = new Date("2026-05-01")
    expect(calculateDaysUntilDue(null, now)).toBeNull()
  })

  it("returns positive integer when nextDueAt is in the future", () => {
    const now = new Date("2026-05-01T00:00:00Z")
    const nextDue = new Date("2026-05-11T00:00:00Z") // +10 days
    expect(calculateDaysUntilDue(nextDue, now)).toBe(10)
  })

  it("returns negative integer when nextDueAt is in the past", () => {
    const now = new Date("2026-05-01T00:00:00Z")
    const nextDue = new Date("2026-04-22T00:00:00Z") // 9 days ago
    expect(calculateDaysUntilDue(nextDue, now)).toBe(-9)
  })

  it("returns 0 when nextDueAt is within the current day", () => {
    const now = new Date("2026-05-01T09:00:00Z")
    const nextDue = new Date("2026-05-01T18:00:00Z") // later today
    expect(calculateDaysUntilDue(nextDue, now)).toBe(0)
  })

  it("rounds toward -Infinity with floor", () => {
    // 25-hour diff (1 day + 1 hour) should round down to 1, not up to 2.
    const now = new Date("2026-05-01T00:00:00Z")
    const nextDue = new Date("2026-05-02T01:00:00Z")
    expect(calculateDaysUntilDue(nextDue, now)).toBe(1)
  })
})
