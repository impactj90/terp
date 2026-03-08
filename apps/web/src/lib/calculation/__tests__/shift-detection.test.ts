/**
 * Tests for Shift Detection
 *
 * Ported from Go: apps/api/internal/calculation/shift_test.go
 */

import { describe, it, expect } from "vitest"
import {
  isInTimeWindow,
  matchesPlan,
  ShiftDetector,
} from "../shift-detection"
import type {
  ShiftDetectionInput,
  DayPlanLoader,
} from "../shift-detection"

function makeInput(overrides: Partial<ShiftDetectionInput> = {}): ShiftDetectionInput {
  return {
    planId: "plan-1",
    planCode: "STD",
    arriveFrom: null,
    arriveTo: null,
    departFrom: null,
    departTo: null,
    alternativePlanIds: [],
    ...overrides,
  }
}

function makeLoader(plans: Record<string, ShiftDetectionInput>): DayPlanLoader {
  return {
    loadShiftDetectionInput(id: string): ShiftDetectionInput | null {
      return plans[id] ?? null
    },
  }
}

describe("shift detection", () => {
  describe("isInTimeWindow", () => {
    it("returns true when time is within window", () => {
      expect(isInTimeWindow(480, 400, 600)).toBe(true)
    })

    it("returns true at window boundaries", () => {
      expect(isInTimeWindow(400, 400, 600)).toBe(true)
      expect(isInTimeWindow(600, 400, 600)).toBe(true)
    })

    it("returns false when time is outside window", () => {
      expect(isInTimeWindow(300, 400, 600)).toBe(false)
      expect(isInTimeWindow(700, 400, 600)).toBe(false)
    })

    it("returns false when from is null", () => {
      expect(isInTimeWindow(480, null, 600)).toBe(false)
    })

    it("returns false when to is null", () => {
      expect(isInTimeWindow(480, 400, null)).toBe(false)
    })

    it("returns false when both are null", () => {
      expect(isInTimeWindow(480, null, null)).toBe(false)
    })
  })

  describe("matchesPlan", () => {
    it("returns none when no windows configured", () => {
      const input = makeInput()
      expect(matchesPlan(input, 480, 1020)).toBe("none")
    })

    it("matches arrival only", () => {
      const input = makeInput({ arriveFrom: 400, arriveTo: 600 })
      expect(matchesPlan(input, 480, 1020)).toBe("arrival")
    })

    it("matches departure only", () => {
      const input = makeInput({ departFrom: 900, departTo: 1100 })
      expect(matchesPlan(input, 480, 1020)).toBe("departure")
    })

    it("matches both when both configured and both match", () => {
      const input = makeInput({
        arriveFrom: 400,
        arriveTo: 600,
        departFrom: 900,
        departTo: 1100,
      })
      expect(matchesPlan(input, 480, 1020)).toBe("both")
    })

    it("returns none when both configured but only arrival matches", () => {
      const input = makeInput({
        arriveFrom: 400,
        arriveTo: 600,
        departFrom: 900,
        departTo: 950,
      })
      expect(matchesPlan(input, 480, 1020)).toBe("none")
    })

    it("returns none when both configured but only departure matches", () => {
      const input = makeInput({
        arriveFrom: 400,
        arriveTo: 450,
        departFrom: 900,
        departTo: 1100,
      })
      expect(matchesPlan(input, 480, 1020)).toBe("none")
    })

    it("returns none when arrival configured but does not match", () => {
      const input = makeInput({ arriveFrom: 400, arriveTo: 450 })
      expect(matchesPlan(input, 480, 1020)).toBe("none")
    })

    it("handles null first arrival", () => {
      const input = makeInput({ arriveFrom: 400, arriveTo: 600 })
      expect(matchesPlan(input, null, 1020)).toBe("none")
    })

    it("handles null last departure", () => {
      const input = makeInput({ departFrom: 900, departTo: 1100 })
      expect(matchesPlan(input, 480, null)).toBe("none")
    })
  })

  describe("ShiftDetector.detectShift", () => {
    it("returns original plan when no detection configured", () => {
      const input = makeInput()
      const detector = new ShiftDetector(makeLoader({}))

      const result = detector.detectShift(input, 480, 1020)
      expect(result.isOriginalPlan).toBe(true)
      expect(result.matchedPlanId).toBe("plan-1")
      expect(result.matchedBy).toBe("none")
      expect(result.hasError).toBe(false)
    })

    it("returns empty result when no assigned plan", () => {
      const detector = new ShiftDetector(makeLoader({}))

      const result = detector.detectShift(null, 480, 1020)
      expect(result.isOriginalPlan).toBe(true)
      expect(result.matchedPlanId).toBe("")
      expect(result.matchedBy).toBe("none")
      expect(result.hasError).toBe(false)
    })

    it("returns original plan when no bookings", () => {
      const input = makeInput({ arriveFrom: 400, arriveTo: 600 })
      const detector = new ShiftDetector(makeLoader({}))

      const result = detector.detectShift(input, null, null)
      expect(result.isOriginalPlan).toBe(true)
      expect(result.matchedPlanId).toBe("plan-1")
      expect(result.hasError).toBe(false)
    })

    it("matches original plan arrival window", () => {
      const input = makeInput({ arriveFrom: 400, arriveTo: 600 })
      const detector = new ShiftDetector(makeLoader({}))

      const result = detector.detectShift(input, 480, 1020)
      expect(result.isOriginalPlan).toBe(true)
      expect(result.matchedBy).toBe("arrival")
      expect(result.hasError).toBe(false)
    })

    it("falls through to alternative on mismatch", () => {
      const assigned = makeInput({
        arriveFrom: 400,
        arriveTo: 500,
        alternativePlanIds: ["alt-1"],
      })
      const altPlan = makeInput({
        planId: "alt-1",
        planCode: "LATE",
        arriveFrom: 700,
        arriveTo: 900,
      })
      const detector = new ShiftDetector(
        makeLoader({ "alt-1": altPlan })
      )

      const result = detector.detectShift(assigned, 800, 1020)
      expect(result.isOriginalPlan).toBe(false)
      expect(result.matchedPlanId).toBe("alt-1")
      expect(result.matchedPlanCode).toBe("LATE")
      expect(result.matchedBy).toBe("arrival")
      expect(result.hasError).toBe(false)
    })

    it("returns error when no plan matches", () => {
      const assigned = makeInput({
        arriveFrom: 400,
        arriveTo: 500,
        alternativePlanIds: ["alt-1"],
      })
      const altPlan = makeInput({
        planId: "alt-1",
        planCode: "ALT",
        arriveFrom: 700,
        arriveTo: 800,
      })
      const detector = new ShiftDetector(
        makeLoader({ "alt-1": altPlan })
      )

      const result = detector.detectShift(assigned, 600, 1020)
      expect(result.isOriginalPlan).toBe(true)
      expect(result.hasError).toBe(true)
      expect(result.errorCode).toBe("NO_MATCHING_SHIFT")
    })

    it("iterates up to 6 alternatives", () => {
      const altIds = ["a1", "a2", "a3", "a4", "a5", "a6"]
      const assigned = makeInput({
        arriveFrom: 100,
        arriveTo: 200,
        alternativePlanIds: altIds,
      })

      const plans: Record<string, ShiftDetectionInput> = {}
      for (const id of altIds.slice(0, 5)) {
        plans[id] = makeInput({
          planId: id,
          planCode: id,
          arriveFrom: 100,
          arriveTo: 200,
        })
      }
      // Only the 6th plan matches
      plans["a6"] = makeInput({
        planId: "a6",
        planCode: "MATCH",
        arriveFrom: 450,
        arriveTo: 550,
      })

      const detector = new ShiftDetector(makeLoader(plans))
      const result = detector.detectShift(assigned, 500, 1020)
      expect(result.matchedPlanId).toBe("a6")
      expect(result.matchedPlanCode).toBe("MATCH")
      expect(result.isOriginalPlan).toBe(false)
      expect(result.hasError).toBe(false)
    })

    it("partial window config (only arrival) only checks arrival", () => {
      const input = makeInput({ arriveFrom: 400, arriveTo: 600 })
      const detector = new ShiftDetector(makeLoader({}))

      // Departure time doesn't matter when only arrival window configured
      const result = detector.detectShift(input, 480, null)
      expect(result.matchedBy).toBe("arrival")
      expect(result.hasError).toBe(false)
    })
  })
})
