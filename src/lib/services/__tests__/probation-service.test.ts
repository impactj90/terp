import { describe, expect, it } from "vitest"
import {
  computeDaysRemaining,
  computeProbationEndDate,
  getProbationSnapshot,
  getProbationStatus,
  normalizeProbationReminderDays,
  resolveEffectiveProbationMonths,
} from "../probation-service"

describe("probation-service", () => {
  it("computes month-end safe probation end dates", () => {
    expect(
      computeProbationEndDate(new Date(Date.UTC(2026, 0, 31)), 1)
    ).toEqual(new Date(Date.UTC(2026, 1, 28)))
  })

  it("computes leap-year safe probation end dates", () => {
    expect(
      computeProbationEndDate(new Date(Date.UTC(2024, 1, 29)), 12)
    ).toEqual(new Date(Date.UTC(2025, 1, 28)))
  })

  it("prefers employee probation months over the tenant default", () => {
    expect(resolveEffectiveProbationMonths(3, 6)).toBe(3)
    expect(resolveEffectiveProbationMonths(null, 6)).toBe(6)
  })

  it("normalizes reminder stages to unique descending values", () => {
    expect(normalizeProbationReminderDays([7, 28, 14, 14])).toEqual([28, 14, 7])
  })

  it("rejects empty reminder stages", () => {
    expect(() => normalizeProbationReminderDays([])).toThrow(
      "probationReminderDays must contain at least one reminder stage"
    )
  })

  it("returns none for exited employees even when the computed end date exists", () => {
    const snapshot = getProbationSnapshot({
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      exitDate: new Date(Date.UTC(2026, 3, 17)),
      employeeProbationMonths: 6,
      tenantDefaultMonths: 6,
      today: new Date(Date.UTC(2026, 3, 17)),
    })

    expect(snapshot.endDate).toEqual(new Date(Date.UTC(2026, 6, 1)))
    expect(snapshot.status).toBe("none")
    expect(snapshot.showBadge).toBe(false)
  })

  it("returns none when the effective probation months are zero or less", () => {
    expect(
      getProbationStatus({
        entryDate: new Date(Date.UTC(2026, 0, 1)),
        effectiveMonths: 0,
        today: new Date(Date.UTC(2026, 3, 17)),
      })
    ).toBe("none")

    expect(
      getProbationStatus({
        entryDate: new Date(Date.UTC(2026, 0, 1)),
        effectiveMonths: -1,
        today: new Date(Date.UTC(2026, 3, 17)),
      })
    ).toBe("none")
  })

  it("classifies active probation cases with more than 30 days remaining", () => {
    const snapshot = getProbationSnapshot({
      entryDate: new Date(Date.UTC(2026, 3, 1)),
      employeeProbationMonths: 3,
      tenantDefaultMonths: 6,
      today: new Date(Date.UTC(2026, 3, 15)),
    })

    expect(snapshot.endDate).toEqual(new Date(Date.UTC(2026, 6, 1)))
    expect(snapshot.daysRemaining).toBe(77)
    expect(snapshot.status).toBe("in_probation")
    expect(snapshot.showBadge).toBe(true)
  })

  it("classifies probation cases ending within 30 days", () => {
    const snapshot = getProbationSnapshot({
      entryDate: new Date(Date.UTC(2026, 0, 15)),
      employeeProbationMonths: 6,
      tenantDefaultMonths: 6,
      today: new Date(Date.UTC(2026, 5, 1)),
    })

    expect(snapshot.endDate).toEqual(new Date(Date.UTC(2026, 6, 15)))
    expect(snapshot.daysRemaining).toBe(44)
    expect(
      getProbationSnapshot({
        entryDate: new Date(Date.UTC(2026, 0, 1)),
        employeeProbationMonths: 6,
        tenantDefaultMonths: 6,
        today: new Date(Date.UTC(2026, 5, 15)),
      }).status
    ).toBe("ends_in_30_days")
  })

  it("classifies ended probation cases for active employees", () => {
    const snapshot = getProbationSnapshot({
      entryDate: new Date(Date.UTC(2025, 0, 1)),
      employeeProbationMonths: 6,
      tenantDefaultMonths: 6,
      today: new Date(Date.UTC(2026, 0, 10)),
    })

    expect(snapshot.endDate).toEqual(new Date(Date.UTC(2025, 6, 1)))
    expect(snapshot.daysRemaining).toBeLessThan(0)
    expect(snapshot.status).toBe("ended")
    expect(snapshot.showBadge).toBe(false)
  })

  it("computes days remaining using UTC calendar days", () => {
    expect(
      computeDaysRemaining(
        new Date(Date.UTC(2026, 6, 1)),
        new Date(Date.UTC(2026, 5, 15, 13, 45))
      )
    ).toBe(16)
  })
})
