/**
 * Unit tests for the pure helpers in export-template-schedule-service.
 *
 * Focuses on the deterministic next-run-at and export-period
 * computations — these have no DB dependencies and are the most
 * brittle parts of the cron-driven feature.
 */
import { describe, it, expect } from "vitest"
import {
  computeNextRunAt,
  computeExportPeriod,
} from "../export-template-schedule-service"

describe("computeNextRunAt", () => {
  describe("daily", () => {
    it("uses today at hour_of_day when the hour is in the future", () => {
      const from = new Date(Date.UTC(2026, 3, 15, 5, 30)) // 2026-04-15 05:30 UTC
      const next = computeNextRunAt(
        { frequency: "daily", dayOfWeek: null, dayOfMonth: null, hourOfDay: 10 },
        from,
      )
      expect(next.toISOString()).toBe("2026-04-15T10:00:00.000Z")
    })

    it("rolls to tomorrow when hour_of_day already passed", () => {
      const from = new Date(Date.UTC(2026, 3, 15, 12, 0)) // 2026-04-15 12:00
      const next = computeNextRunAt(
        { frequency: "daily", dayOfWeek: null, dayOfMonth: null, hourOfDay: 6 },
        from,
      )
      expect(next.toISOString()).toBe("2026-04-16T06:00:00.000Z")
    })

    it("rolls to tomorrow when hour_of_day equals current hour exactly", () => {
      // The == case is treated as "already passed" — protects against
      // double-firing in the cron loop.
      const from = new Date(Date.UTC(2026, 3, 15, 6, 0))
      const next = computeNextRunAt(
        { frequency: "daily", dayOfWeek: null, dayOfMonth: null, hourOfDay: 6 },
        from,
      )
      expect(next.toISOString()).toBe("2026-04-16T06:00:00.000Z")
    })
  })

  describe("weekly", () => {
    it("walks forward to the requested day-of-week", () => {
      // 2026-04-15 is a Wednesday (day index 3)
      // Target: Friday (5)
      const from = new Date(Date.UTC(2026, 3, 15, 12, 0))
      const next = computeNextRunAt(
        { frequency: "weekly", dayOfWeek: 5, dayOfMonth: null, hourOfDay: 6 },
        from,
      )
      expect(next.toISOString()).toBe("2026-04-17T06:00:00.000Z")
      expect(next.getUTCDay()).toBe(5)
    })

    it("rolls to next week when current day-of-week is the target but hour passed", () => {
      // Wednesday at 10:00, target Wednesday at 06:00 → next week
      const from = new Date(Date.UTC(2026, 3, 15, 10, 0))
      const next = computeNextRunAt(
        { frequency: "weekly", dayOfWeek: 3, dayOfMonth: null, hourOfDay: 6 },
        from,
      )
      expect(next.toISOString()).toBe("2026-04-22T06:00:00.000Z")
    })
  })

  describe("monthly", () => {
    it("uses the requested day this month when in the future", () => {
      const from = new Date(Date.UTC(2026, 3, 15, 12, 0))
      const next = computeNextRunAt(
        { frequency: "monthly", dayOfWeek: null, dayOfMonth: 25, hourOfDay: 6 },
        from,
      )
      expect(next.toISOString()).toBe("2026-04-25T06:00:00.000Z")
    })

    it("rolls to next month when day already passed", () => {
      const from = new Date(Date.UTC(2026, 3, 25, 12, 0))
      const next = computeNextRunAt(
        { frequency: "monthly", dayOfWeek: null, dayOfMonth: 5, hourOfDay: 6 },
        from,
      )
      expect(next.toISOString()).toBe("2026-05-05T06:00:00.000Z")
    })

    it("rolls year boundary correctly", () => {
      const from = new Date(Date.UTC(2026, 11, 28, 23, 0)) // Dec 28
      const next = computeNextRunAt(
        { frequency: "monthly", dayOfWeek: null, dayOfMonth: 5, hourOfDay: 8 },
        from,
      )
      expect(next.toISOString()).toBe("2027-01-05T08:00:00.000Z")
    })
  })
})

describe("computeExportPeriod", () => {
  it("previous_month: rolls year back in January", () => {
    const period = computeExportPeriod(
      "previous_month",
      new Date(Date.UTC(2026, 0, 5)),
    )
    expect(period).toEqual({ year: 2025, month: 12 })
  })

  it("previous_month: returns prior month for mid-year run", () => {
    const period = computeExportPeriod(
      "previous_month",
      new Date(Date.UTC(2026, 5, 1)), // June
    )
    expect(period).toEqual({ year: 2026, month: 5 })
  })

  it("current_month: returns current year/month", () => {
    const period = computeExportPeriod(
      "current_month",
      new Date(Date.UTC(2026, 7, 20)), // August
    )
    expect(period).toEqual({ year: 2026, month: 8 })
  })
})
