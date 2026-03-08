/**
 * Booking Pairing Logic
 *
 * Pairs IN/OUT bookings by category and calculates durations.
 * Bookings with existing PairIDs are paired together first,
 * then remaining bookings are matched chronologically.
 *
 * Ported from Go: apps/api/internal/calculation/pairing.go
 */

import type { BookingInput, BookingCategory, BookingPair, PairingResult } from "./types"
import { normalizeCrossMidnight } from "./time"
import { WARN_CROSS_MIDNIGHT } from "./errors"

/**
 * Pairs in/out bookings by category and calculates durations.
 * Bookings with existing PairIDs are paired together first.
 * Unpaired bookings are matched chronologically within their category.
 *
 * @param bookings - Array of booking inputs to pair
 * @returns Pairing result with pairs, unpaired IDs, and warnings
 */
export function pairBookings(bookings: BookingInput[]): PairingResult {
  const result: PairingResult = {
    pairs: [],
    unpairedInIds: [],
    unpairedOutIds: [],
    warnings: [],
  }

  if (bookings.length === 0) {
    return result
  }

  // Separate by category
  const workBookings = filterByCategory(bookings, "work")
  const breakBookings = filterByCategory(bookings, "break")

  // Pair work bookings
  const workResult = pairByCategory(workBookings, "work")
  result.pairs.push(...workResult.pairs)
  result.unpairedInIds.push(...workResult.unpairedIn)
  result.unpairedOutIds.push(...workResult.unpairedOut)
  result.warnings.push(...workResult.warnings)

  // Pair break bookings
  const breakResult = pairByCategory(breakBookings, "break")
  result.pairs.push(...breakResult.pairs)
  result.unpairedInIds.push(...breakResult.unpairedIn)
  result.unpairedOutIds.push(...breakResult.unpairedOut)
  result.warnings.push(...breakResult.warnings)

  return result
}

/**
 * Sums the duration of all work pairs.
 *
 * @param pairs - Array of booking pairs
 * @returns Total gross time in minutes
 */
export function calculateGrossTime(pairs: BookingPair[]): number {
  let total = 0
  for (const p of pairs) {
    if (p.category === "work") {
      total += p.duration
    }
  }
  return total
}

/**
 * Sums the duration of all break pairs.
 *
 * @param pairs - Array of booking pairs
 * @returns Total break time in minutes
 */
export function calculateBreakTime(pairs: BookingPair[]): number {
  let total = 0
  for (const p of pairs) {
    if (p.category === "break") {
      total += p.duration
    }
  }
  return total
}

/**
 * Returns the earliest arrival time, or null if no work arrivals.
 *
 * @param bookings - Array of booking inputs
 * @returns Earliest work IN time, or null
 */
export function findFirstCome(bookings: BookingInput[]): number | null {
  let first: number | null = null
  for (const b of bookings) {
    if (b.direction === "in" && b.category === "work") {
      if (first === null || b.time < first) {
        first = b.time
      }
    }
  }
  return first
}

/**
 * Returns the latest departure time, or null if no work departures.
 *
 * @param bookings - Array of booking inputs
 * @returns Latest work OUT time, or null
 */
export function findLastGo(bookings: BookingInput[]): number | null {
  let last: number | null = null
  for (const b of bookings) {
    if (b.direction === "out" && b.category === "work") {
      if (last === null || b.time > last) {
        last = b.time
      }
    }
  }
  return last
}

// --- Internal helpers ---

function filterByCategory(bookings: BookingInput[], category: BookingCategory): BookingInput[] {
  return bookings.filter((b) => b.category === category)
}

function pairByCategory(
  bookings: BookingInput[],
  category: BookingCategory
): {
  pairs: BookingPair[]
  unpairedIn: string[]
  unpairedOut: string[]
  warnings: string[]
} {
  const pairs: BookingPair[] = []
  const warnings: string[] = []

  // Build lists by direction
  const inBookings: BookingInput[] = []
  const outBookings: BookingInput[] = []
  const inBookingsMap = new Map<string, BookingInput>()
  const outBookingsMap = new Map<string, BookingInput>()

  for (const b of bookings) {
    if (b.direction === "in") {
      inBookings.push(b)
      inBookingsMap.set(b.id, b)
    } else {
      outBookings.push(b)
      outBookingsMap.set(b.id, b)
    }
  }

  // Sort by time for chronological pairing
  inBookings.sort((a, b) => a.time - b.time)
  outBookings.sort((a, b) => a.time - b.time)

  // Track which bookings have been paired
  const pairedIn = new Set<string>()
  const pairedOut = new Set<string>()

  // First pass: pair by existing PairID
  for (const inB of inBookings) {
    if (inB.pairId !== null) {
      const outB = outBookingsMap.get(inB.pairId)
      if (outB) {
        const pair = createPairForCategory(inB, outB, category)
        if (isCrossMidnight(pair)) {
          warnings.push(WARN_CROSS_MIDNIGHT)
        }
        pairs.push(pair)
        pairedIn.add(inB.id)
        pairedOut.add(outB.id)
      }
    }
  }

  // For work bookings: pair IN (arrive) -> OUT (leave)
  // For break bookings: pair OUT (start break) -> IN (end break)
  if (category === "work") {
    // Second pass: pair unpaired IN with subsequent OUT
    let outIdx = 0
    for (const inB of inBookings) {
      if (pairedIn.has(inB.id)) {
        continue
      }
      // Find next unpaired out booking after this in
      while (outIdx < outBookings.length && (pairedOut.has(outBookings[outIdx]!.id) || outBookings[outIdx]!.time < inB.time)) {
        outIdx++
      }
      if (outIdx < outBookings.length && !pairedOut.has(outBookings[outIdx]!.id)) {
        const outB = outBookings[outIdx]!
        const pair = createPairForCategory(inB, outB, category)
        pairs.push(pair)
        pairedIn.add(inB.id)
        pairedOut.add(outB.id)
        outIdx++
      }
    }

    // Third pass: handle cross-midnight scenarios for work
    for (const inB of inBookings) {
      if (pairedIn.has(inB.id)) {
        continue
      }
      for (const outB of outBookings) {
        if (pairedOut.has(outB.id)) {
          continue
        }
        // Cross-midnight: IN time > OUT time
        if (outB.time < inB.time) {
          const pair = createPairForCategory(inB, outB, category)
          warnings.push(WARN_CROSS_MIDNIGHT)
          pairs.push(pair)
          pairedIn.add(inB.id)
          pairedOut.add(outB.id)
          break
        }
      }
    }
  } else {
    // Break bookings: pair OUT (start break) -> IN (end break)
    let inIdx = 0
    for (const outB of outBookings) {
      if (pairedOut.has(outB.id)) {
        continue
      }
      // Find next unpaired in booking after this out
      while (inIdx < inBookings.length && (pairedIn.has(inBookings[inIdx]!.id) || inBookings[inIdx]!.time < outB.time)) {
        inIdx++
      }
      if (inIdx < inBookings.length && !pairedIn.has(inBookings[inIdx]!.id)) {
        const inB = inBookings[inIdx]!
        const pair = createPairForCategory(inB, outB, category)
        pairs.push(pair)
        pairedIn.add(inB.id)
        pairedOut.add(outB.id)
        inIdx++
      }
    }
  }

  // Collect unpaired
  const unpairedIn: string[] = []
  const unpairedOut: string[] = []

  for (const inB of inBookings) {
    if (!pairedIn.has(inB.id)) {
      unpairedIn.push(inB.id)
    }
  }
  for (const outB of outBookings) {
    if (!pairedOut.has(outB.id)) {
      unpairedOut.push(outB.id)
    }
  }

  return { pairs, unpairedIn, unpairedOut, warnings }
}

/**
 * Creates a pair with duration calculated correctly for the category.
 * For work: duration = OUT time - IN time (arrive to leave)
 * For breaks: duration = IN time - OUT time (start break to end break)
 */
function createPairForCategory(
  inBooking: BookingInput,
  outBooking: BookingInput,
  category: BookingCategory
): BookingPair {
  let duration: number
  if (category === "work") {
    // Work: IN (arrive) to OUT (leave)
    const endTime = normalizeCrossMidnight(inBooking.time, outBooking.time)
    duration = endTime - inBooking.time
  } else {
    // Break: OUT (start break) to IN (end break)
    const endTime = normalizeCrossMidnight(outBooking.time, inBooking.time)
    duration = endTime - outBooking.time
  }

  return {
    inBooking,
    outBooking,
    category,
    duration,
  }
}

/**
 * Checks if a pair spans midnight.
 */
function isCrossMidnight(pair: BookingPair): boolean {
  if (pair.inBooking === null || pair.outBooking === null) {
    return false
  }
  if (pair.category === "work") {
    // For work, cross-midnight means IN time > OUT time
    return pair.inBooking.time > pair.outBooking.time
  }
  // For breaks, cross-midnight means OUT time > IN time
  return pair.outBooking.time > pair.inBooking.time
}
