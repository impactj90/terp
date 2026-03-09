/**
 * Shift Detection
 *
 * Determines which day plan should be used based on booking times.
 * Checks if the employee's booking times match their assigned plan's
 * shift detection windows, and falls back to alternative plans if not.
 *
 * Ported from Go: apps/api/internal/calculation/shift.go (270 lines)
 */

// --- Types ---

export type ShiftMatchType = "none" | "arrival" | "departure" | "both"

export interface ShiftDetectionInput {
  planId: string
  planCode: string
  arriveFrom: number | null
  arriveTo: number | null
  departFrom: number | null
  departTo: number | null
  alternativePlanIds: string[]
}

export interface ShiftDetectionResult {
  matchedPlanId: string
  matchedPlanCode: string
  isOriginalPlan: boolean
  matchedBy: ShiftMatchType
  hasError: boolean
  errorCode: string
}

export interface DayPlanLoader {
  loadShiftDetectionInput(id: string): ShiftDetectionInput | null
}

// --- Functions ---

/**
 * Check if a time falls within the given window.
 * Returns false if either boundary is null.
 * Ported from Go: isInTimeWindow() (line 72-79)
 */
export function isInTimeWindow(
  time: number,
  from: number | null,
  to: number | null
): boolean {
  if (from === null || to === null) return false
  return time >= from && time <= to
}

/**
 * Returns true if arrival shift detection is configured.
 * Ported from Go: hasArrivalWindow() (line 82-84)
 */
export function hasArrivalWindow(input: ShiftDetectionInput): boolean {
  return input.arriveFrom !== null && input.arriveTo !== null
}

/**
 * Returns true if departure shift detection is configured.
 * Ported from Go: hasDepartureWindow() (line 87-89)
 */
export function hasDepartureWindow(input: ShiftDetectionInput): boolean {
  return input.departFrom !== null && input.departTo !== null
}

/**
 * Check if booking times match the given plan's shift detection windows.
 * Returns the match type if successful, "none" otherwise.
 * Ported from Go: matchesPlan() (line 93-139)
 */
export function matchesPlan(
  input: ShiftDetectionInput,
  firstArrival: number | null,
  lastDeparture: number | null
): ShiftMatchType {
  const hasArrival = hasArrivalWindow(input)
  const hasDeparture = hasDepartureWindow(input)

  // No shift detection configured
  if (!hasArrival && !hasDeparture) {
    return "none"
  }

  let arrivalMatches = false
  let departureMatches = false

  // Check arrival window if configured
  if (hasArrival && firstArrival !== null) {
    arrivalMatches = isInTimeWindow(firstArrival, input.arriveFrom, input.arriveTo)
  }

  // Check departure window if configured
  if (hasDeparture && lastDeparture !== null) {
    departureMatches = isInTimeWindow(lastDeparture, input.departFrom, input.departTo)
  }

  // Determine match type based on what was configured and what matched
  if (hasArrival && hasDeparture) {
    // Both windows configured - both must match
    if (arrivalMatches && departureMatches) {
      return "both"
    }
    return "none"
  }

  if (hasArrival) {
    return arrivalMatches ? "arrival" : "none"
  }

  if (hasDeparture) {
    return departureMatches ? "departure" : "none"
  }

  return "none"
}

// --- ShiftDetector class ---

/**
 * Performs automatic shift detection based on booking times.
 * Ported from Go: ShiftDetector (line 62-227)
 */
export class ShiftDetector {
  constructor(private loader: DayPlanLoader) {}

  /**
   * Determine which day plan should be used based on booking times.
   * Checks the assigned plan first, then iterates through alternatives.
   *
   * @param assignedPlan - Shift detection input from the assigned day plan
   * @param firstArrival - First arrival time in minutes from midnight (from FindFirstCome)
   * @param lastDeparture - Last departure time in minutes from midnight (from FindLastGo)
   * @returns ShiftDetectionResult with the matched plan or error
   */
  detectShift(
    assignedPlan: ShiftDetectionInput | null,
    firstArrival: number | null,
    lastDeparture: number | null
  ): ShiftDetectionResult {
    // No assigned plan - return empty result
    if (assignedPlan === null) {
      return {
        matchedPlanId: "",
        matchedPlanCode: "",
        isOriginalPlan: true,
        matchedBy: "none",
        hasError: false,
        errorCode: "",
      }
    }

    // No shift detection configured - use original plan
    if (!hasArrivalWindow(assignedPlan) && !hasDepartureWindow(assignedPlan)) {
      return {
        matchedPlanId: assignedPlan.planId,
        matchedPlanCode: assignedPlan.planCode,
        isOriginalPlan: true,
        matchedBy: "none",
        hasError: false,
        errorCode: "",
      }
    }

    // No booking times to check - use original plan with no match
    if (firstArrival === null && lastDeparture === null) {
      return {
        matchedPlanId: assignedPlan.planId,
        matchedPlanCode: assignedPlan.planCode,
        isOriginalPlan: true,
        matchedBy: "none",
        hasError: false,
        errorCode: "",
      }
    }

    // Check if assigned plan matches
    const matchType = matchesPlan(assignedPlan, firstArrival, lastDeparture)
    if (matchType !== "none") {
      return {
        matchedPlanId: assignedPlan.planId,
        matchedPlanCode: assignedPlan.planCode,
        isOriginalPlan: true,
        matchedBy: matchType,
        hasError: false,
        errorCode: "",
      }
    }

    // Search alternative plans
    for (const altPlanId of assignedPlan.alternativePlanIds) {
      if (!this.loader) continue

      const altPlan = this.loader.loadShiftDetectionInput(altPlanId)
      if (!altPlan) continue

      const altMatchType = matchesPlan(altPlan, firstArrival, lastDeparture)
      if (altMatchType !== "none") {
        return {
          matchedPlanId: altPlan.planId,
          matchedPlanCode: altPlan.planCode,
          isOriginalPlan: false,
          matchedBy: altMatchType,
          hasError: false,
          errorCode: "",
        }
      }
    }

    // No match found - return original plan with error
    return {
      matchedPlanId: assignedPlan.planId,
      matchedPlanCode: assignedPlan.planCode,
      isOriginalPlan: true,
      matchedBy: "none",
      hasError: true,
      errorCode: "NO_MATCHING_SHIFT",
    }
  }
}
