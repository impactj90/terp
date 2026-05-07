/**
 * Labor Rate Resolver tests (NK-1, Decision 28)
 */
import { describe, it, expect } from "vitest"
import {
  resolveLaborRateExtended,
  resolveTravelRateExtended,
} from "../labor-rate-resolver"

// Helper: cast plain numbers to Decimal-shaped values for testing
const D = (n: number | null) =>
  n == null ? null : ({ toString: () => String(n) } as unknown as never)

describe("resolveLaborRateExtended", () => {
  it("FLAT_RATE → flatRate (activity_flat)", () => {
    const r = resolveLaborRateExtended({
      bookingActivity: {
        pricingType: "FLAT_RATE",
        flatRate: D(89),
        hourlyRate: null,
        unit: null,
      },
      orderRate: D(80),
      employeeWageGroupRate: D(70),
      employeeRate: D(60),
    })
    expect(r).toEqual({ rate: 89, source: "activity_flat" })
  })

  it("HOURLY → hourlyRate (activity_hourly)", () => {
    const r = resolveLaborRateExtended({
      bookingActivity: {
        pricingType: "HOURLY",
        flatRate: null,
        hourlyRate: D(95),
        unit: null,
      },
      orderRate: D(80),
      employeeWageGroupRate: D(70),
      employeeRate: D(60),
    })
    expect(r).toEqual({ rate: 95, source: "activity_hourly" })
  })

  it("PER_UNIT activity falls through to next stage", () => {
    const r = resolveLaborRateExtended({
      bookingActivity: {
        pricingType: "PER_UNIT",
        flatRate: D(18),
        hourlyRate: null,
        unit: "lfm",
      },
      orderRate: D(80),
      employeeWageGroupRate: D(70),
      employeeRate: D(60),
    })
    expect(r).toEqual({ rate: 80, source: "order" })
  })

  it("HOURLY without rate falls through to order", () => {
    const r = resolveLaborRateExtended({
      bookingActivity: {
        pricingType: "HOURLY",
        flatRate: null,
        hourlyRate: null,
        unit: null,
      },
      orderRate: D(80),
      employeeWageGroupRate: null,
      employeeRate: null,
    })
    expect(r).toEqual({ rate: 80, source: "order" })
  })

  it("falls through Order → WageGroup → Employee", () => {
    expect(
      resolveLaborRateExtended({
        bookingActivity: null,
        orderRate: null,
        employeeWageGroupRate: D(70),
        employeeRate: D(60),
      }),
    ).toEqual({ rate: 70, source: "wage_group" })

    expect(
      resolveLaborRateExtended({
        bookingActivity: null,
        orderRate: null,
        employeeWageGroupRate: null,
        employeeRate: D(60),
      }),
    ).toEqual({ rate: 60, source: "employee" })

    expect(
      resolveLaborRateExtended({
        bookingActivity: null,
        orderRate: null,
        employeeWageGroupRate: null,
        employeeRate: null,
      }),
    ).toEqual({ rate: null, source: "none" })
  })

  it("treats zero/negative rates as not-set", () => {
    expect(
      resolveLaborRateExtended({
        bookingActivity: null,
        orderRate: D(0),
        employeeWageGroupRate: D(-1),
        employeeRate: D(60),
      }),
    ).toEqual({ rate: 60, source: "employee" })
  })
})

describe("resolveTravelRateExtended", () => {
  it("Order rate wins outright", () => {
    const r = resolveTravelRateExtended({
      orderRate: D(85),
      assignmentEmployees: [
        { hourlyRate: D(60), wageGroup: { billingHourlyRate: D(70) } },
      ],
    })
    expect(r).toEqual({ rate: 85, source: "order" })
  })

  it("max wage_group across crew when no order rate", () => {
    const r = resolveTravelRateExtended({
      orderRate: null,
      assignmentEmployees: [
        { hourlyRate: D(50), wageGroup: { billingHourlyRate: D(70) } },
        { hourlyRate: D(60), wageGroup: { billingHourlyRate: D(95) } }, // win
        { hourlyRate: D(45), wageGroup: { billingHourlyRate: D(80) } },
      ],
    })
    expect(r).toEqual({ rate: 95, source: "wage_group" })
  })

  it("max employee.hourlyRate when no wage groups", () => {
    const r = resolveTravelRateExtended({
      orderRate: null,
      assignmentEmployees: [
        { hourlyRate: D(50), wageGroup: null },
        { hourlyRate: D(60), wageGroup: null }, // win
        { hourlyRate: D(45), wageGroup: null },
      ],
    })
    expect(r).toEqual({ rate: 60, source: "employee" })
  })

  it("returns none when nothing is set", () => {
    expect(
      resolveTravelRateExtended({
        orderRate: null,
        assignmentEmployees: [
          { hourlyRate: null, wageGroup: null },
        ],
      }),
    ).toEqual({ rate: null, source: "none" })
  })
})
