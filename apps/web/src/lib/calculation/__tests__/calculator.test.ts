import type { BookingInput, CalculationInput, DayPlanInput, ToleranceConfig, RoundingConfig, BreakConfig } from "../types"
import { calculate } from "../calculator"
import {
  ERR_NO_BOOKINGS,
  ERR_MISSING_GO,
  ERR_MISSING_COME,
  ERR_LATE_COME,
  ERR_EARLY_COME,
  ERR_MISSED_CORE_START,
  ERR_BELOW_MIN_WORK_TIME,
  WARN_CROSS_MIDNIGHT,
  WARN_MAX_TIME_REACHED,
  WARN_AUTO_BREAK_APPLIED,
  WARN_MANUAL_BREAK,
} from "../errors"

// Helper: create a minimal DayPlanInput
function makeDayPlan(overrides: Partial<DayPlanInput> = {}): DayPlanInput {
  return {
    planType: "fixed",
    comeFrom: null,
    comeTo: null,
    goFrom: null,
    goTo: null,
    coreStart: null,
    coreEnd: null,
    regularHours: 480,
    tolerance: { comePlus: 0, comeMinus: 0, goPlus: 0, goMinus: 0 },
    roundingCome: null,
    roundingGo: null,
    breaks: [],
    minWorkTime: null,
    maxNetWorkTime: null,
    variableWorkTime: false,
    roundAllBookings: false,
    roundRelativeToPlan: false,
    ...overrides,
  }
}

// Helper: create a booking input
function makeBooking(overrides: Partial<BookingInput> & { id: string; time: number; direction: "in" | "out" }): BookingInput {
  return {
    category: "work",
    pairId: null,
    ...overrides,
  }
}

// Helper: create a CalculationInput
function makeInput(bookings: BookingInput[], dayPlan?: Partial<DayPlanInput>): CalculationInput {
  return {
    employeeId: "emp-1",
    date: new Date(2026, 0, 15),
    bookings,
    dayPlan: makeDayPlan(dayPlan),
  }
}

describe("calculator", () => {
  // Test 1: Empty bookings
  it("returns NO_BOOKINGS error for empty bookings", () => {
    const result = calculate(makeInput([]))

    expect(result.hasError).toBe(true)
    expect(result.errorCodes).toContain(ERR_NO_BOOKINGS)
  })

  // Test 2: Simple work day
  it("calculates simple work day (08:00-17:00)", () => {
    const result = calculate(makeInput([
      makeBooking({ id: "c1", time: 480, direction: "in" }),
      makeBooking({ id: "g1", time: 1020, direction: "out" }),
    ]))

    expect(result.hasError).toBe(false)
    expect(result.grossTime).toBe(540) // 9 hours
    expect(result.netTime).toBe(540)
    expect(result.targetTime).toBe(480)
    expect(result.overtime).toBe(60)
    expect(result.undertime).toBe(0)
    expect(result.bookingCount).toBe(2)
    expect(result.firstCome).toBe(480)
    expect(result.lastGo).toBe(1020)
  })

  // Test 3: With manual breaks
  it("calculates with manual breaks", () => {
    const result = calculate(makeInput([
      makeBooking({ id: "c1", time: 480, direction: "in" }),
      makeBooking({ id: "bs", time: 720, direction: "out", category: "break" }),
      makeBooking({ id: "be", time: 750, direction: "in", category: "break" }),
      makeBooking({ id: "g1", time: 1020, direction: "out" }),
    ]))

    expect(result.hasError).toBe(false)
    expect(result.grossTime).toBe(540) // 9 hours
    expect(result.breakTime).toBe(30)  // 30 min break
    expect(result.netTime).toBe(510)   // 8.5 hours
    expect(result.overtime).toBe(30)
  })

  // Test 4: With auto-deduct break
  it("auto-deducts minimum break", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        breaks: [{
          type: "minimum",
          startTime: null,
          endTime: null,
          duration: 30,
          afterWorkMinutes: 300,
          autoDeduct: true,
          isPaid: false,
          minutesDifference: false,
        }],
      }
    ))

    expect(result.hasError).toBe(false)
    expect(result.grossTime).toBe(540)
    expect(result.breakTime).toBe(30)
    expect(result.netTime).toBe(510)
    expect(result.warnings).toContain(WARN_AUTO_BREAK_APPLIED)
  })

  // Test 5: With rounding
  it("applies rounding to come and go times", () => {
    const comeId = "come-r"
    const goId = "go-r"

    const result = calculate(makeInput(
      [
        makeBooking({ id: comeId, time: 483, direction: "in" }),   // 08:03
        makeBooking({ id: goId, time: 1017, direction: "out" }),   // 16:57
      ],
      {
        roundingCome: { type: "up", interval: 15, addValue: 0, anchorTime: null },
        roundingGo: { type: "down", interval: 15, addValue: 0, anchorTime: null },
      }
    ))

    // Come 08:03 rounds up to 08:15 (495)
    // Go 16:57 rounds down to 16:45 (1005)
    // Duration: 1005 - 495 = 510 minutes
    expect(result.grossTime).toBe(510)
    expect(result.calculatedTimes.get(comeId)).toBe(495)
    expect(result.calculatedTimes.get(goId)).toBe(1005)
  })

  // Test 6: With tolerance
  it("applies come and go tolerance", () => {
    const comeId = "come-t"
    const goId = "go-t"

    const result = calculate(makeInput(
      [
        makeBooking({ id: comeId, time: 483, direction: "in" }),   // 08:03
        makeBooking({ id: goId, time: 1017, direction: "out" }),   // 16:57
      ],
      {
        comeFrom: 480,
        goTo: 1020,
        tolerance: { comePlus: 5, comeMinus: 0, goPlus: 0, goMinus: 5 },
      }
    ))

    // Come 08:03 within tolerance -> treated as 08:00
    // Go 16:57 within tolerance -> treated as 17:00
    expect(result.grossTime).toBe(540)
    expect(result.calculatedTimes.get(comeId)).toBe(480)
    expect(result.calculatedTimes.get(goId)).toBe(1020)
  })

  // Test 7: Tolerance uses ComeFrom and GoTo (not GoFrom)
  it("tolerance uses ComeFrom and GoTo", () => {
    const comeId = "come-cg"
    const goId = "go-cg"

    const result = calculate(makeInput(
      [
        makeBooking({ id: comeId, time: 453, direction: "in" }),   // 07:33
        makeBooking({ id: goId, time: 1047, direction: "out" }),   // 17:27
      ],
      {
        comeFrom: 450,   // 07:30
        goFrom: 960,     // 16:00 (should be ignored for go tolerance)
        goTo: 1050,      // 17:30
        tolerance: { comePlus: 5, comeMinus: 0, goPlus: 0, goMinus: 5 },
      }
    ))

    // Arrival within tolerance of ComeFrom (07:30) -> 07:30
    expect(result.calculatedTimes.get(comeId)).toBe(450)
    // Departure within tolerance of GoTo (17:30) -> 17:30
    expect(result.calculatedTimes.get(goId)).toBe(1050)
  })

  // Test 8: Window capping adjusts gross time
  it("window capping adjusts gross time", () => {
    const comeId = "come-wc"
    const goId = "go-wc"

    const result = calculate(makeInput(
      [
        makeBooking({ id: comeId, time: 405, direction: "in" }),   // 06:45
        makeBooking({ id: goId, time: 1050, direction: "out" }),   // 17:30
      ],
      {
        comeFrom: 420,  // 07:00
        goTo: 1020,     // 17:00
      }
    ))

    // Bookings capped to 07:00-17:00 = 600 min
    expect(result.grossTime).toBe(600)
    expect(result.calculatedTimes.get(comeId)).toBe(420)
    expect(result.calculatedTimes.get(goId)).toBe(1020)
    expect(result.cappedTime).toBe(45) // 15 + 30
  })

  // Test 9: Unpaired booking
  it("reports MISSING_GO for unpaired IN booking", () => {
    const comeId = "come-up"

    const result = calculate(makeInput([
      makeBooking({ id: comeId, time: 480, direction: "in" }),
    ]))

    expect(result.hasError).toBe(true)
    expect(result.errorCodes).toContain(ERR_MISSING_GO)
    expect(result.unpairedInIds).toEqual([comeId])
  })

  // Test 10: Time window violation
  it("reports LATE_COME for late arrival", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 540, direction: "in" }),   // 09:00 (late!)
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        comeFrom: 480,  // 08:00
        comeTo: 510,    // 08:30
      }
    ))

    expect(result.hasError).toBe(true)
    expect(result.errorCodes).toContain(ERR_LATE_COME)
  })

  // Test 11: Core hours violation
  it("reports MISSED_CORE_START for late core arrival", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 600, direction: "in" }),   // 10:00
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        coreStart: 540,  // 09:00
        coreEnd: 960,    // 16:00
      }
    ))

    expect(result.hasError).toBe(true)
    expect(result.errorCodes).toContain(ERR_MISSED_CORE_START)
  })

  // Test 12: Max net work time
  it("caps net time at maxNetWorkTime", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 420, direction: "in" }),    // 07:00
        makeBooking({ id: "g1", time: 1080, direction: "out" }),  // 18:00 (11h!)
      ],
      { maxNetWorkTime: 480 }
    ))

    expect(result.grossTime).toBe(660) // 11 hours
    expect(result.netTime).toBe(480)   // Capped at 8 hours
    expect(result.warnings).toContain(WARN_MAX_TIME_REACHED)
  })

  // Test 13: Min work time
  it("reports BELOW_MIN_WORK_TIME for short day", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "g1", time: 600, direction: "out" }),  // Only 2h
      ],
      { minWorkTime: 240 }
    ))

    expect(result.hasError).toBe(true)
    expect(result.errorCodes).toContain(ERR_BELOW_MIN_WORK_TIME)
  })

  // Test 14: Cross midnight
  it("handles cross-midnight shifts", () => {
    const result = calculate(makeInput([
      makeBooking({ id: "c1", time: 1320, direction: "in" }),   // 22:00
      makeBooking({ id: "g1", time: 120, direction: "out" }),   // 02:00
    ]))

    expect(result.grossTime).toBe(240)
    expect(result.warnings).toContain(WARN_CROSS_MIDNIGHT)
  })

  // Test 15: Fixed break deduction
  it("deducts fixed break from work time", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        breaks: [{
          type: "fixed",
          startTime: 720,
          endTime: 750,
          duration: 30,
          afterWorkMinutes: null,
          autoDeduct: false,
          isPaid: false,
          minutesDifference: false,
        }],
      }
    ))

    expect(result.grossTime).toBe(540)
    expect(result.breakTime).toBe(30)
    expect(result.netTime).toBe(510)
  })

  // Test 16: Fixed break WITH manual break
  it("fixed break + manual break both count", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "bs", time: 720, direction: "out", category: "break" }),
        makeBooking({ id: "be", time: 765, direction: "in", category: "break" }),
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        breaks: [{
          type: "fixed",
          startTime: 720,
          endTime: 750,
          duration: 30,
          afterWorkMinutes: null,
          autoDeduct: false,
          isPaid: false,
          minutesDifference: false,
        }],
      }
    ))

    expect(result.grossTime).toBe(540)
    expect(result.breakTime).toBe(75) // fixed 30 + manual 45
    expect(result.netTime).toBe(465)
    expect(result.warnings).toContain(WARN_MANUAL_BREAK)
  })

  // Test 17: Variable break, no manual break
  it("variable break auto-deducts when no manual break", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        breaks: [{
          type: "variable",
          startTime: null,
          endTime: null,
          duration: 30,
          afterWorkMinutes: 300,
          autoDeduct: true,
          isPaid: false,
          minutesDifference: false,
        }],
      }
    ))

    expect(result.grossTime).toBe(540)
    expect(result.breakTime).toBe(30)
    expect(result.netTime).toBe(510)
    expect(result.warnings).toContain(WARN_AUTO_BREAK_APPLIED)
  })

  // Test 18: Variable break with manual break
  it("variable break skipped when manual break exists", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "bs", time: 720, direction: "out", category: "break" }),
        makeBooking({ id: "be", time: 750, direction: "in", category: "break" }),
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        breaks: [{
          type: "variable",
          startTime: null,
          endTime: null,
          duration: 30,
          afterWorkMinutes: 300,
          autoDeduct: true,
          isPaid: false,
          minutesDifference: false,
        }],
      }
    ))

    expect(result.grossTime).toBe(540)
    expect(result.breakTime).toBe(30) // Only manual break
    expect(result.netTime).toBe(510)
    expect(result.warnings).toContain(WARN_MANUAL_BREAK)
    expect(result.warnings).not.toContain(WARN_AUTO_BREAK_APPLIED)
  })

  // Test 19: Minimum break proportional
  it("minimum break with proportional deduction", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "g1", time: 790, direction: "out" }), // 13:10 (5h10m = 310min)
      ],
      {
        regularHours: 300,
        breaks: [{
          type: "minimum",
          startTime: null,
          endTime: null,
          duration: 30,
          afterWorkMinutes: 300,
          autoDeduct: true,
          isPaid: false,
          minutesDifference: true,
        }],
      }
    ))

    expect(result.grossTime).toBe(310)
    expect(result.breakTime).toBe(10) // Proportional: only 10 min over
    expect(result.netTime).toBe(300)
  })

  // Test 20: Minimum break full (capped at duration)
  it("minimum break full deduction capped at duration", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "g1", time: 1020, direction: "out" }), // 9h
      ],
      {
        breaks: [{
          type: "minimum",
          startTime: null,
          endTime: null,
          duration: 30,
          afterWorkMinutes: 300,
          autoDeduct: true,
          isPaid: false,
          minutesDifference: true,
        }],
      }
    ))

    expect(result.grossTime).toBe(540)
    expect(result.breakTime).toBe(30) // Capped at duration
    expect(result.netTime).toBe(510)
  })

  // Test 21: RoundAllBookings=false (only first-in and last-out rounded)
  it("RoundAllBookings=false: only first-in and last-out rounded", () => {
    const in1 = "in1-rab"
    const out1 = "out1-rab"
    const in2 = "in2-rab"
    const out2 = "out2-rab"

    const result = calculate(makeInput(
      [
        makeBooking({ id: in1, time: 483, direction: "in" }),                          // 08:03
        makeBooking({ id: out1, time: 723, direction: "out", category: "break" }),     // 12:03
        makeBooking({ id: in2, time: 753, direction: "in", category: "break" }),       // 12:33
        makeBooking({ id: out2, time: 1017, direction: "out" }),                        // 16:57
      ],
      {
        roundAllBookings: false,
        roundingCome: { type: "up", interval: 15, addValue: 0, anchorTime: null },
        roundingGo: { type: "down", interval: 15, addValue: 0, anchorTime: null },
      }
    ))

    // First-in rounded up to 08:15 = 495
    expect(result.calculatedTimes.get(in1)).toBe(495)
    // Break out NOT rounded
    expect(result.calculatedTimes.get(out1)).toBe(723)
    // Break in NOT rounded
    expect(result.calculatedTimes.get(in2)).toBe(753)
    // Last-out rounded down to 16:45 = 1005
    expect(result.calculatedTimes.get(out2)).toBe(1005)
  })

  // Test 22: RoundAllBookings=true
  it("RoundAllBookings=true: all work bookings rounded", () => {
    const in1 = "in1-rabt"
    const out1 = "out1-rabt"
    const in2 = "in2-rabt"
    const out2 = "out2-rabt"

    const result = calculate(makeInput(
      [
        makeBooking({ id: in1, time: 483, direction: "in" }),                     // 08:03
        makeBooking({ id: out1, time: 723, direction: "out" }),                    // 12:03 (work out)
        makeBooking({ id: in2, time: 753, direction: "in" }),                      // 12:33 (work in)
        makeBooking({ id: out2, time: 1017, direction: "out" }),                   // 16:57
      ],
      {
        roundAllBookings: true,
        roundingCome: { type: "up", interval: 15, addValue: 0, anchorTime: null },
        roundingGo: { type: "down", interval: 15, addValue: 0, anchorTime: null },
      }
    ))

    // All in-bookings rounded up
    expect(result.calculatedTimes.get(in1)).toBe(495)   // 08:03 -> 08:15
    // All out-bookings rounded down
    expect(result.calculatedTimes.get(out1)).toBe(720)  // 12:03 -> 12:00
    // All in-bookings rounded up
    expect(result.calculatedTimes.get(in2)).toBe(765)   // 12:33 -> 12:45
    // All out-bookings rounded down
    expect(result.calculatedTimes.get(out2)).toBe(1005)  // 16:57 -> 16:45
  })

  // Test 23: Default (RoundAllBookings not set) = false behavior
  it("default RoundAllBookings behaves as false", () => {
    const in1 = "in1-d"
    const out1 = "out1-d"
    const in2 = "in2-d"
    const out2 = "out2-d"

    const result = calculate(makeInput(
      [
        makeBooking({ id: in1, time: 487, direction: "in" }),                          // 08:07
        makeBooking({ id: out1, time: 727, direction: "out", category: "break" }),     // 12:07
        makeBooking({ id: in2, time: 757, direction: "in", category: "break" }),       // 12:37
        makeBooking({ id: out2, time: 1013, direction: "out" }),                        // 16:53
      ],
      {
        roundingCome: { type: "up", interval: 15, addValue: 0, anchorTime: null },
        roundingGo: { type: "down", interval: 15, addValue: 0, anchorTime: null },
      }
    ))

    expect(result.calculatedTimes.get(in1)).toBe(495)    // First-in rounded
    expect(result.calculatedTimes.get(out1)).toBe(727)   // Break out NOT rounded
    expect(result.calculatedTimes.get(in2)).toBe(757)    // Break in NOT rounded
    expect(result.calculatedTimes.get(out2)).toBe(1005)  // Last-out rounded
  })

  // Test 24: Flextime with zeroed tolerance -> no snapping
  it("flextime with zeroed tolerance: no snapping occurs", () => {
    const comeId = "come-flex"
    const goId = "go-flex"

    const result = calculate(makeInput(
      [
        makeBooking({ id: comeId, time: 483, direction: "in" }),
        makeBooking({ id: goId, time: 1017, direction: "out" }),
      ],
      {
        planType: "flextime",
        comeFrom: 480,
        goTo: 1020,
        tolerance: { comePlus: 0, comeMinus: 0, goPlus: 0, goMinus: 0 },
      }
    ))

    expect(result.calculatedTimes.get(comeId)).toBe(483)
    expect(result.calculatedTimes.get(goId)).toBe(1017)
    expect(result.grossTime).toBe(534)
  })

  // Test 25: Flextime variableWorkTime has no additional effect
  it("flextime variableWorkTime produces identical results", () => {
    const makeFlextimeInput = (vwt: boolean, comeId: string, goId: string) =>
      makeInput(
        [
          makeBooking({ id: comeId, time: 460, direction: "in" }),
          makeBooking({ id: goId, time: 1000, direction: "out" }),
        ],
        {
          planType: "flextime",
          comeFrom: 480,
          goTo: 1020,
          variableWorkTime: vwt,
        }
      )

    const resultWith = calculate(makeFlextimeInput(true, "c1", "g1"))
    const resultWithout = calculate(makeFlextimeInput(false, "c2", "g2"))

    expect(resultWithout.grossTime).toBe(resultWith.grossTime)
    expect(resultWithout.netTime).toBe(resultWith.netTime)
    expect(resultWithout.cappedTime).toBe(resultWith.cappedTime)
  })

  // Test 26: Fixed plan ComeMinus=0 -> early arrival capped
  it("fixed plan without ComeMinus: early arrival capped to ComeFrom", () => {
    const comeId = "come-fc"
    const goId = "go-fc"

    const result = calculate(makeInput(
      [
        makeBooking({ id: comeId, time: 477, direction: "in" }),   // 07:57
        makeBooking({ id: goId, time: 1020, direction: "out" }),
      ],
      {
        planType: "fixed",
        comeFrom: 480,
        tolerance: { comePlus: 0, comeMinus: 0, goPlus: 0, goMinus: 0 },
      }
    ))

    // 07:57 capped to 08:00
    expect(result.calculatedTimes.get(comeId)).toBe(480)
    // Validator flags early arrival since pre-capped time (477) < ComeFrom (480)
    expect(result.errorCodes).toContain(ERR_EARLY_COME)
  })

  // --- Capping integration tests ---

  // Test 27: No capping normal day
  it("no capping for normal day within windows", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        comeFrom: 420,
        comeTo: 540,
        goFrom: 960,
        goTo: 1080,
      }
    ))

    expect(result.cappedTime).toBe(0)
    expect(result.capping.items).toHaveLength(0)
  })

  // Test 28: Early arrival capping
  it("caps early arrival", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 405, direction: "in" }),    // 06:45
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        comeFrom: 420,  // 07:00
        comeTo: 540,
      }
    ))

    expect(result.cappedTime).toBe(15)
    expect(result.capping.items).toHaveLength(1)
  })

  // Test 29: Late departure capping
  it("caps late departure", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 480, direction: "in" }),
        makeBooking({ id: "g1", time: 1080, direction: "out" }),  // 18:00
      ],
      {
        comeFrom: 420,
        goTo: 1050,  // 17:30
      }
    ))

    expect(result.cappedTime).toBe(30)
    expect(result.capping.items).toHaveLength(1)
  })

  // Test 30: Max net time capping
  it("caps at maxNetWorkTime", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 420, direction: "in" }),    // 07:00
        makeBooking({ id: "g1", time: 1140, direction: "out" }),  // 19:00 (12h gross)
      ],
      {
        comeFrom: 420,
        goTo: 1200,
        maxNetWorkTime: 600,  // 10h max
      }
    ))

    expect(result.cappedTime).toBe(120)  // 12h - 10h = 2h capped
    expect(result.capping.items).toHaveLength(1)
  })

  // Test 31: Variable work time within tolerance -> no capping
  it("variable work time within tolerance: no capping", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 405, direction: "in" }),   // 06:45
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        comeFrom: 420,
        comeTo: 540,
        variableWorkTime: true,
        tolerance: { comePlus: 0, comeMinus: 30, goPlus: 0, goMinus: 0 },
      }
    ))

    expect(result.cappedTime).toBe(0)
    expect(result.capping.items).toHaveLength(0)
  })

  // Test 32: Variable work time beyond tolerance -> capping
  it("variable work time beyond tolerance: capping applied", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 375, direction: "in" }),   // 06:15
        makeBooking({ id: "g1", time: 1020, direction: "out" }),
      ],
      {
        comeFrom: 420,
        comeTo: 540,
        variableWorkTime: true,
        tolerance: { comePlus: 0, comeMinus: 30, goPlus: 0, goMinus: 0 },
      }
    ))

    expect(result.cappedTime).toBe(15) // 06:15 is 15 min before 06:30
    expect(result.capping.items).toHaveLength(1)
  })

  // Test 33: Multiple capping sources simultaneously
  it("aggregates multiple capping sources", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 405, direction: "in" }),    // 06:45 (early)
        makeBooking({ id: "g1", time: 1200, direction: "out" }),  // 20:00 (late)
      ],
      {
        comeFrom: 420,     // 07:00
        goTo: 1140,        // 19:00
        maxNetWorkTime: 600,  // 10h max
      }
    ))

    // Early arrival: 15 min (06:45 to 07:00)
    // Late departure: 60 min (19:00 to 20:00)
    // Gross = 1140-420 = 720 min. Net capped at 600, so 120 capped
    expect(result.cappedTime).toBe(15 + 60 + 120)
    expect(result.capping.items).toHaveLength(3)

    // Check sources
    const sources = new Map<string, number>()
    for (const item of result.capping.items) {
      sources.set(item.source, item.minutes)
    }
    expect(sources.get("early_arrival")).toBe(15)
    expect(sources.get("late_leave")).toBe(60)
    expect(sources.get("max_net_time")).toBe(120)
  })

  // Full work day integration test
  it("full work day with all features", () => {
    const result = calculate(makeInput(
      [
        makeBooking({ id: "c1", time: 478, direction: "in" }),                         // 07:58
        makeBooking({ id: "bs", time: 720, direction: "out", category: "break" }),     // 12:00
        makeBooking({ id: "be", time: 765, direction: "in", category: "break" }),      // 12:45
        makeBooking({ id: "g1", time: 1022, direction: "out" }),                        // 17:02
      ],
      {
        comeFrom: 450,
        comeTo: 540,
        goFrom: 960,
        goTo: 1080,
        coreStart: 540,
        coreEnd: 960,
        tolerance: { comePlus: 5, comeMinus: 5, goPlus: 5, goMinus: 5 },
        roundingCome: { type: "nearest", interval: 5, addValue: 0, anchorTime: null },
        roundingGo: { type: "nearest", interval: 5, addValue: 0, anchorTime: null },
        breaks: [{
          type: "minimum",
          startTime: null,
          endTime: null,
          duration: 30,
          afterWorkMinutes: 360,
          autoDeduct: true,
          isPaid: false,
          minutesDifference: false,
        }],
      }
    ))

    expect(result.hasError).toBe(false)
    expect(result.grossTime).toBeGreaterThan(0)
    expect(result.netTime).toBeGreaterThan(0)
    // With new ZMI spec: manual break (45) + minimum break (30) = 75
    expect(result.breakTime).toBe(75)
  })
})
