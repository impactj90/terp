import { describe, it, expect } from "vitest"
import {
  isNightShiftDayPlan,
  resolveEffectiveWorkDay,
  type DayPlanInfo,
} from "../shift-day-resolver"

// --- Helper factories ---

function makeDayPlanInfo(overrides: Partial<DayPlanInfo> = {}): DayPlanInfo {
  return {
    dayPlanId: "plan-1",
    dayChangeBehavior: "none",
    comeFrom: 480, // 08:00
    goTo: 960, // 16:00
    ...overrides,
  }
}

function makeNightShiftPlan(behavior: string): DayPlanInfo {
  return makeDayPlanInfo({
    dayChangeBehavior: behavior,
    comeFrom: 1320, // 22:00
    goTo: 360, // 06:00
  })
}

// --- isNightShiftDayPlan ---

describe("isNightShiftDayPlan", () => {
  it("returns true for night shift (comeFrom=1320, goTo=360)", () => {
    expect(isNightShiftDayPlan({ comeFrom: 1320, goTo: 360 })).toBe(true)
  })

  it("returns false for day shift (comeFrom=480, goTo=960)", () => {
    expect(isNightShiftDayPlan({ comeFrom: 480, goTo: 960 })).toBe(false)
  })

  it("returns false when comeFrom is null", () => {
    expect(isNightShiftDayPlan({ comeFrom: null, goTo: 360 })).toBe(false)
  })

  it("returns false when goTo is null", () => {
    expect(isNightShiftDayPlan({ comeFrom: 1320, goTo: null })).toBe(false)
  })

  it("returns false when both are null", () => {
    expect(isNightShiftDayPlan({ comeFrom: null, goTo: null })).toBe(false)
  })

  it("returns false when both are zero (midnight edge)", () => {
    expect(isNightShiftDayPlan({ comeFrom: 0, goTo: 0 })).toBe(false)
  })
})

// --- resolveEffectiveWorkDay ---

describe("resolveEffectiveWorkDay", () => {
  // --- mode none ---

  describe("mode none", () => {
    it("day shift Mon 08:00-16:00 is a work day", () => {
      const monday = new Date(Date.UTC(2028, 5, 5)) // Mon
      const result = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }),
        null,
      )
      expect(result.isWorkDay).toBe(true)
      expect(result.effectiveDate).toEqual(monday)
    })

    it("no DayPlan for date -> not a work day", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const result = resolveEffectiveWorkDay(monday, null, null)
      expect(result.isWorkDay).toBe(false)
      expect(result.effectiveDate).toBeNull()
    })

    it("DayPlan with dayPlanId=null (off-day) -> not a work day", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const result = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo({ dayPlanId: null }),
        null,
      )
      expect(result.isWorkDay).toBe(false)
      expect(result.effectiveDate).toBeNull()
    })

    it("weekend Saturday -> not a work day regardless of DayPlan", () => {
      const saturday = new Date(Date.UTC(2028, 5, 3)) // Sat
      expect(saturday.getUTCDay()).toBe(6)
      const result = resolveEffectiveWorkDay(
        saturday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }),
        null,
      )
      expect(result.isWorkDay).toBe(false)
      expect(result.effectiveDate).toBeNull()
    })

    it("weekend Sunday -> not a work day regardless of DayPlan", () => {
      const sunday = new Date(Date.UTC(2028, 5, 4)) // Sun
      expect(sunday.getUTCDay()).toBe(0)
      const result = resolveEffectiveWorkDay(
        sunday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }),
        null,
      )
      expect(result.isWorkDay).toBe(false)
      expect(result.effectiveDate).toBeNull()
    })
  })

  // --- mode at_departure ---

  describe("mode at_departure", () => {
    it("happy path: prev day has at_departure NS, current day (Mon) -> work day", () => {
      // So has at_departure NS, Mo is the departure day
      const monday = new Date(Date.UTC(2028, 5, 5)) // Mon
      const result = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }), // Mon's own plan (day shift)
        makeNightShiftPlan("at_departure"), // So's NS plan
      )
      expect(result.isWorkDay).toBe(true)
      expect(result.effectiveDate).toEqual(monday)
    })

    it("Sunday excluded: So is arrival-only for at_departure -> not a work day", () => {
      const sunday = new Date(Date.UTC(2028, 5, 4)) // Sun
      expect(sunday.getUTCDay()).toBe(0)
      const result = resolveEffectiveWorkDay(
        sunday,
        makeNightShiftPlan("at_departure"), // So's own NS plan
        null, // no prev
      )
      // Priority 4: at_departure arrival exclusion -> not a work day
      expect(result.isWorkDay).toBe(false)
      expect(result.effectiveDate).toBeNull()
    })

    it("Friday departure: Do has at_departure NS, Fr has DayPlan -> work day", () => {
      const friday = new Date(Date.UTC(2028, 5, 9)) // Fri
      expect(friday.getUTCDay()).toBe(5)
      const result = resolveEffectiveWorkDay(
        friday,
        makeDayPlanInfo(), // Fr's own standard plan
        makeNightShiftPlan("at_departure"), // Do's NS plan
      )
      expect(result.isWorkDay).toBe(true)
      expect(result.effectiveDate).toEqual(friday)
    })

    it("Fr->Sa: Fr has at_departure NS -> Fr=false (arrival-only), Sa=false (weekend)", () => {
      const friday = new Date(Date.UTC(2028, 5, 9))
      const saturday = new Date(Date.UTC(2028, 5, 10))

      // Friday: own plan is at_departure NS -> arrival-only -> false
      const frResult = resolveEffectiveWorkDay(
        friday,
        makeNightShiftPlan("at_departure"),
        null, // no Do NS
      )
      expect(frResult.isWorkDay).toBe(false)

      // Saturday: prev (Fr) has at_departure NS, but weekend -> false
      const saResult = resolveEffectiveWorkDay(
        saturday,
        null,
        makeNightShiftPlan("at_departure"),
      )
      expect(saResult.isWorkDay).toBe(false)
    })

    it("holiday transition So->Mo: effectiveDate = Mo (behavior unaffected by holidays)", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const result = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo(), // Mo plan
        makeNightShiftPlan("at_departure"), // So NS
      )
      expect(result.isWorkDay).toBe(true)
      expect(result.effectiveDate).toEqual(monday)
    })

    it("mixed rotation: Mo=none day shift, Di=at_departure NS -> Mo=true, Di=false, Mi=true", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const tuesday = new Date(Date.UTC(2028, 5, 6))
      const wednesday = new Date(Date.UTC(2028, 5, 7))

      // Mo: standard day shift, no prev NS -> true
      const moResult = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }),
        null,
      )
      expect(moResult.isWorkDay).toBe(true)

      // Di: own plan is at_departure NS -> arrival-only -> false
      const diResult = resolveEffectiveWorkDay(
        tuesday,
        makeNightShiftPlan("at_departure"),
        makeDayPlanInfo({ dayChangeBehavior: "none" }), // Mo standard
      )
      expect(diResult.isWorkDay).toBe(false)

      // Mi: prev (Di) has at_departure NS -> departure day -> true
      const miResult = resolveEffectiveWorkDay(
        wednesday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }),
        makeNightShiftPlan("at_departure"),
      )
      expect(miResult.isWorkDay).toBe(true)
    })
  })

  // --- mode at_arrival ---

  describe("mode at_arrival", () => {
    it("Sunday night shift: So has at_arrival NS -> So is work day (weekend override!)", () => {
      const sunday = new Date(Date.UTC(2028, 5, 4)) // Sun
      expect(sunday.getUTCDay()).toBe(0)
      const result = resolveEffectiveWorkDay(
        sunday,
        makeNightShiftPlan("at_arrival"), // So's own at_arrival NS plan
        null,
      )
      expect(result.isWorkDay).toBe(true)
      expect(result.effectiveDate).toEqual(sunday)
    })

    it("Mon departure-only: prev (So) has at_arrival NS, Mon has no own shift -> not a work day", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const result = resolveEffectiveWorkDay(
        monday,
        null, // no own plan
        makeNightShiftPlan("at_arrival"), // So's at_arrival NS
      )
      expect(result.isWorkDay).toBe(false)
      expect(result.effectiveDate).toBeNull()
    })

    it("Mon departure + own day shift: Mon has non-night DayPlan -> work day (own shift)", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const result = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }), // Mon standard day shift
        makeNightShiftPlan("at_arrival"), // So's at_arrival NS
      )
      expect(result.isWorkDay).toBe(true)
      expect(result.effectiveDate).toEqual(monday)
    })

    it("Mon in rotation: So has at_arrival NS, Mon also has at_arrival NS -> Mon=true (own arrival)", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const result = resolveEffectiveWorkDay(
        monday,
        makeNightShiftPlan("at_arrival"), // Mon's own at_arrival NS
        makeNightShiftPlan("at_arrival"), // So's at_arrival NS
      )
      // Priority 1 fires first: Mon has its own at_arrival NS -> work day
      expect(result.isWorkDay).toBe(true)
      expect(result.effectiveDate).toEqual(monday)
    })

    it("vacation Mo-Fr: So=true, Mo=true, Di=true, Mi=true, Do=true, Fr=false", () => {
      // So-Do have at_arrival NS plans, Fr has no NS plan
      const sunday = new Date(Date.UTC(2028, 5, 4))
      const monday = new Date(Date.UTC(2028, 5, 5))
      const tuesday = new Date(Date.UTC(2028, 5, 6))
      const wednesday = new Date(Date.UTC(2028, 5, 7))
      const thursday = new Date(Date.UTC(2028, 5, 8))
      const friday = new Date(Date.UTC(2028, 5, 9))

      const nsArrival = makeNightShiftPlan("at_arrival")

      // So: own at_arrival NS -> true (weekend override)
      expect(
        resolveEffectiveWorkDay(sunday, nsArrival, null).isWorkDay,
      ).toBe(true)

      // Mo: own at_arrival NS (Priority 1 fires) -> true
      expect(
        resolveEffectiveWorkDay(monday, nsArrival, nsArrival).isWorkDay,
      ).toBe(true)

      // Di: own at_arrival NS -> true
      expect(
        resolveEffectiveWorkDay(tuesday, nsArrival, nsArrival).isWorkDay,
      ).toBe(true)

      // Mi: own at_arrival NS -> true
      expect(
        resolveEffectiveWorkDay(wednesday, nsArrival, nsArrival).isWorkDay,
      ).toBe(true)

      // Do: own at_arrival NS -> true
      expect(
        resolveEffectiveWorkDay(thursday, nsArrival, nsArrival).isWorkDay,
      ).toBe(true)

      // Fr: no own NS, prev (Do) has at_arrival NS -> departure-only -> false
      expect(
        resolveEffectiveWorkDay(friday, null, nsArrival).isWorkDay,
      ).toBe(false)
    })
  })

  // --- mode auto_complete ---

  describe("mode auto_complete", () => {
    it("night shift So 22:00->Mo 06:00: So=true (has DayPlan), Mo=true (has DayPlan)", () => {
      const sunday = new Date(Date.UTC(2028, 5, 4))
      const monday = new Date(Date.UTC(2028, 5, 5))

      // auto_complete NS plan
      const nsAutocomplete = makeNightShiftPlan("auto_complete")

      // So: weekend with auto_complete NS, but auto_complete doesn't override weekends
      // -> standard fallback: weekend -> false
      const soResult = resolveEffectiveWorkDay(sunday, nsAutocomplete, null)
      expect(soResult.isWorkDay).toBe(false)

      // Mo: standard fallback, has own plan -> true
      const moResult = resolveEffectiveWorkDay(monday, nsAutocomplete, nsAutocomplete)
      expect(moResult.isWorkDay).toBe(true)
      expect(moResult.effectiveDate).toEqual(monday)
    })

    it("behaves identically to none for absence purposes (weekday)", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const noneResult = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }),
        null,
      )
      const autoResult = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo({ dayChangeBehavior: "auto_complete" }),
        null,
      )
      expect(noneResult).toEqual(autoResult)
    })
  })

  // --- edge cases ---

  describe("edge cases", () => {
    it("month boundary: 31.01 at_departure NS -> effectiveDate = 01.02", () => {
      const jan31 = new Date(Date.UTC(2028, 0, 31)) // Mon
      const feb01 = new Date(Date.UTC(2028, 1, 1)) // Tue

      // Jan 31 has at_departure NS -> arrival-only -> false
      const jan31Result = resolveEffectiveWorkDay(
        jan31,
        makeNightShiftPlan("at_departure"),
        null,
      )
      expect(jan31Result.isWorkDay).toBe(false)

      // Feb 1: prev (Jan 31) has at_departure NS -> departure day -> true
      const feb01Result = resolveEffectiveWorkDay(
        feb01,
        makeDayPlanInfo(),
        makeNightShiftPlan("at_departure"),
      )
      expect(feb01Result.isWorkDay).toBe(true)
      expect(feb01Result.effectiveDate).toEqual(feb01)
    })

    it("leap year: 28.02 at_departure NS -> 29.02 is departure day", () => {
      // 2028 IS a leap year
      const feb28 = new Date(Date.UTC(2028, 1, 28)) // Mon
      const feb29 = new Date(Date.UTC(2028, 1, 29)) // Tue

      const feb28Result = resolveEffectiveWorkDay(
        feb28,
        makeNightShiftPlan("at_departure"),
        null,
      )
      expect(feb28Result.isWorkDay).toBe(false)

      const feb29Result = resolveEffectiveWorkDay(
        feb29,
        makeDayPlanInfo(),
        makeNightShiftPlan("at_departure"),
      )
      expect(feb29Result.isWorkDay).toBe(true)
      expect(feb29Result.effectiveDate).toEqual(feb29)
    })

    it("no previous-day DayPlan: no night shift context -> standard check", () => {
      const monday = new Date(Date.UTC(2028, 5, 5))
      const result = resolveEffectiveWorkDay(
        monday,
        makeDayPlanInfo(),
        null, // no prev DayPlan
      )
      expect(result.isWorkDay).toBe(true)
    })

    it("previous day has at_departure but is NOT a night shift -> standard check", () => {
      const tuesday = new Date(Date.UTC(2028, 5, 6))
      const result = resolveEffectiveWorkDay(
        tuesday,
        makeDayPlanInfo(),
        makeDayPlanInfo({ dayChangeBehavior: "at_departure" }), // day shift, not NS
      )
      // at_departure but not NS -> Priority 2 doesn't fire -> standard fallback
      expect(result.isWorkDay).toBe(true)
    })

    it("at_arrival departure-only with own NS -> handled by Priority 1", () => {
      // Mon has at_arrival NS, prev (So) also has at_arrival NS
      // Priority 1 fires for Mon's own at_arrival NS before Priority 3 can exclude
      const monday = new Date(Date.UTC(2028, 5, 5))
      const result = resolveEffectiveWorkDay(
        monday,
        makeNightShiftPlan("at_arrival"),
        makeNightShiftPlan("at_arrival"),
      )
      expect(result.isWorkDay).toBe(true)
    })

    it("at_arrival departure-only on weekend with own day shift -> not a work day (weekend)", () => {
      const saturday = new Date(Date.UTC(2028, 5, 10)) // Sat
      expect(saturday.getUTCDay()).toBe(6)
      const result = resolveEffectiveWorkDay(
        saturday,
        makeDayPlanInfo({ dayChangeBehavior: "none" }), // own day shift
        makeNightShiftPlan("at_arrival"), // prev has at_arrival NS
      )
      // Priority 3: own non-night plan, but weekend -> false
      expect(result.isWorkDay).toBe(false)
    })
  })
})
