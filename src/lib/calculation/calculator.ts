/**
 * Main Calculator Orchestrator
 *
 * The `calculate` function orchestrates all calculation phases for a single day:
 * tolerance, rounding, window capping, pairing, break deduction, net time,
 * max net capping, and overtime/undertime.
 *
 * Ported from Go: apps/api/internal/calculation/calculator.go
 */

import type {
  BookingInput,
  CappedTime,
  CalculationInput,
  CalculationResult,
  DayPlanInput,
  RoundingConfig,
} from "./types"
import {
  ERR_NO_BOOKINGS,
  ERR_MISSING_GO,
  ERR_MISSING_COME,
  ERR_EARLY_COME,
  ERR_LATE_COME,
  ERR_EARLY_GO,
  ERR_LATE_GO,
  ERR_BELOW_MIN_WORK_TIME,
  WARN_MAX_TIME_REACHED,
} from "./errors"
import { applyComeTolerance, applyGoTolerance, validateTimeWindow, validateCoreHours } from "./tolerance"
import { roundComeTime, roundGoTime } from "./rounding"
import { applyWindowCapping, applyCapping, calculateMaxNetTimeCapping, aggregateCapping } from "./capping"
import { pairBookings, calculateGrossTime, calculateBreakTime, findFirstCome, findLastGo } from "./pairing"
import { calculateBreakDeduction, calculateOvertimeUndertime } from "./breaks"

/**
 * Performs a full day calculation and returns the result.
 *
 * @param input - All data needed for the day's calculation
 * @returns Complete calculation result
 */
export function calculate(input: CalculationInput): CalculationResult {
  const result: CalculationResult = {
    grossTime: 0,
    netTime: 0,
    targetTime: input.dayPlan.regularHours,
    overtime: 0,
    undertime: 0,
    breakTime: 0,
    firstCome: null,
    lastGo: null,
    bookingCount: input.bookings.length,
    calculatedTimes: new Map<string, number>(),
    pairs: [],
    unpairedInIds: [],
    unpairedOutIds: [],
    cappedTime: 0,
    capping: { totalCapped: 0, items: [] },
    hasError: false,
    errorCodes: [],
    warnings: [],
  }

  // Handle empty bookings
  if (input.bookings.length === 0) {
    result.hasError = true
    result.errorCodes.push(ERR_NO_BOOKINGS)
    return result
  }

  // Step 1: Apply rounding, tolerance, and window capping to bookings
  const { processed, validation, cappingItems } = processBookings(
    input.bookings,
    input.dayPlan,
    result.calculatedTimes
  )

  // Step 2: Pair bookings
  const pairingResult = pairBookings(processed)
  result.pairs = pairingResult.pairs
  result.unpairedInIds = pairingResult.unpairedInIds
  result.unpairedOutIds = pairingResult.unpairedOutIds
  result.warnings.push(...pairingResult.warnings)

  // Add errors for unpaired bookings
  if (result.unpairedInIds.length > 0) {
    result.errorCodes.push(ERR_MISSING_GO)
  }
  if (result.unpairedOutIds.length > 0) {
    result.errorCodes.push(ERR_MISSING_COME)
  }

  // Step 3: Calculate first come / last go from uncapped times
  result.firstCome = findFirstCome(validation)
  result.lastGo = findLastGo(validation)

  // Step 4: Validate time windows
  validateTimeWindows(result, input.dayPlan)

  // Step 5: Validate core hours
  const coreErrors = validateCoreHours(
    result.firstCome,
    result.lastGo,
    input.dayPlan.coreStart,
    input.dayPlan.coreEnd
  )
  result.errorCodes.push(...coreErrors)

  // Step 6: Calculate gross time
  result.grossTime = calculateGrossTime(result.pairs)

  // Step 7: Calculate break deduction
  const recordedBreakTime = calculateBreakTime(result.pairs)
  const breakResult = calculateBreakDeduction(
    result.pairs,
    recordedBreakTime,
    result.grossTime,
    input.dayPlan.breaks
  )
  result.breakTime = breakResult.deductedMinutes
  result.warnings.push(...breakResult.warnings)

  // Step 8: Calculate net time
  // First calculate uncapped net time for capping tracking
  let uncappedNet = result.grossTime - result.breakTime
  if (uncappedNet < 0) {
    uncappedNet = 0
  }

  // Apply max net time cap
  const { adjustedNet } = applyCapping(uncappedNet, input.dayPlan.maxNetWorkTime)
  result.netTime = adjustedNet
  if (result.netTime !== uncappedNet) {
    result.warnings.push(WARN_MAX_TIME_REACHED)
  }

  // Step 8a: Calculate and aggregate capping
  const allCappingItems: (CappedTime | null)[] = [...cappingItems]

  // Max net time capping
  const maxNetCap = calculateMaxNetTimeCapping(uncappedNet, input.dayPlan.maxNetWorkTime)
  allCappingItems.push(maxNetCap)

  // Aggregate
  result.capping = aggregateCapping(...allCappingItems)
  result.cappedTime = result.capping.totalCapped

  // Step 9: Validate minimum work time
  if (input.dayPlan.minWorkTime !== null && result.netTime < input.dayPlan.minWorkTime) {
    result.errorCodes.push(ERR_BELOW_MIN_WORK_TIME)
  }

  // Step 10: Calculate overtime/undertime
  const { overtime, undertime } = calculateOvertimeUndertime(result.netTime, result.targetTime)
  result.overtime = overtime
  result.undertime = undertime

  // Set error flag if any errors
  result.hasError = result.errorCodes.length > 0

  return result
}

// --- Internal helpers ---

function processBookings(
  bookings: BookingInput[],
  dayPlan: DayPlanInput,
  calculatedTimes: Map<string, number>
): {
  processed: BookingInput[]
  validation: BookingInput[]
  cappingItems: (CappedTime | null)[]
} {
  const processed: BookingInput[] = bookings.map((b) => ({ ...b }))
  const validation: BookingInput[] = bookings.map((b) => ({ ...b }))
  const cappingItems: (CappedTime | null)[] = []

  const allowEarlyTolerance = dayPlan.variableWorkTime || dayPlan.planType === "flextime"

  // Identify first-in and last-out work booking indices for rounding scope
  let firstInIdx = -1
  let lastOutIdx = -1
  if (!dayPlan.roundAllBookings) {
    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i]!
      if (b.category !== "work") {
        continue
      }
      if (b.direction === "in" && firstInIdx === -1) {
        firstInIdx = i
      }
      if (b.direction === "out") {
        lastOutIdx = i
      }
    }
  }

  // Prepare rounding configs, injecting anchor times when relative rounding is enabled
  let effectiveRoundingCome = dayPlan.roundingCome
  let effectiveRoundingGo = dayPlan.roundingGo

  if (dayPlan.roundRelativeToPlan) {
    if (effectiveRoundingCome !== null && dayPlan.comeFrom !== null) {
      // Copy to avoid mutating original config
      effectiveRoundingCome = {
        ...effectiveRoundingCome,
        anchorTime: dayPlan.comeFrom,
      }
    }
    if (effectiveRoundingGo !== null) {
      // Use GoFrom as anchor for go rounding, fallback to GoTo
      let anchor = dayPlan.goFrom
      if (anchor === null) {
        anchor = dayPlan.goTo
      }
      if (anchor !== null) {
        effectiveRoundingGo = {
          ...effectiveRoundingGo,
          anchorTime: anchor,
        }
      }
    }
  }

  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i]!
    let calculatedTime = b.time

    if (b.category === "work") {
      if (b.direction === "in") {
        // Apply come tolerance using Kommen von
        calculatedTime = applyComeTolerance(b.time, dayPlan.comeFrom, dayPlan.tolerance)
        // Apply come rounding (only first-in unless RoundAllBookings)
        if (dayPlan.roundAllBookings || i === firstInIdx) {
          calculatedTime = roundComeTime(calculatedTime, effectiveRoundingCome)
        }
      } else {
        // Apply go tolerance using Gehen bis (fallback to Gehen von)
        let expectedGo = dayPlan.goTo
        if (expectedGo === null) {
          expectedGo = dayPlan.goFrom
        }
        calculatedTime = applyGoTolerance(b.time, expectedGo, dayPlan.tolerance)
        // Apply go rounding (only last-out unless RoundAllBookings)
        if (dayPlan.roundAllBookings || i === lastOutIdx) {
          calculatedTime = roundGoTime(calculatedTime, effectiveRoundingGo)
        }
      }
    }

    // Preserve pre-capped time for validation
    validation[i]!.time = calculatedTime

    // Apply evaluation window capping for work bookings
    let cappedTime = calculatedTime
    if (b.category === "work") {
      if (b.direction === "in") {
        const result = applyWindowCapping(
          calculatedTime,
          dayPlan.comeFrom,
          dayPlan.goTo,
          dayPlan.tolerance.comeMinus,
          dayPlan.tolerance.goPlus,
          true,
          allowEarlyTolerance
        )
        cappedTime = result.adjustedTime
        if (result.capped > 0) {
          cappingItems.push({
            minutes: result.capped,
            source: "early_arrival",
            reason: "Arrival before evaluation window",
          })
        }
      } else {
        const result = applyWindowCapping(
          calculatedTime,
          dayPlan.comeFrom,
          dayPlan.goTo,
          dayPlan.tolerance.comeMinus,
          dayPlan.tolerance.goPlus,
          false,
          allowEarlyTolerance
        )
        cappedTime = result.adjustedTime
        if (result.capped > 0) {
          cappingItems.push({
            minutes: result.capped,
            source: "late_leave",
            reason: "Departure after evaluation window",
          })
        }
      }
    }

    processed[i]!.time = cappedTime
    calculatedTimes.set(b.id, cappedTime)
  }

  return { processed, validation, cappingItems }
}

function validateTimeWindows(result: CalculationResult, dayPlan: DayPlanInput): void {
  if (result.firstCome !== null) {
    const comeErrors = validateTimeWindow(
      result.firstCome,
      dayPlan.comeFrom,
      dayPlan.comeTo,
      ERR_EARLY_COME,
      ERR_LATE_COME
    )
    result.errorCodes.push(...comeErrors)
  }

  if (result.lastGo !== null) {
    const goErrors = validateTimeWindow(
      result.lastGo,
      dayPlan.goFrom,
      dayPlan.goTo,
      ERR_EARLY_GO,
      ERR_LATE_GO
    )
    result.errorCodes.push(...goErrors)
  }
}
