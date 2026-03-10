import { describe, it, expect } from "vitest"
import type { BookingInput, BookingPair } from "../types"
import {
  pairBookings,
  calculateGrossTime,
  calculateBreakTime,
  findFirstCome,
  findLastGo,
} from "../pairing"
import { WARN_CROSS_MIDNIGHT } from "../errors"

describe("pairBookings", () => {
  it("empty input", () => {
    const result = pairBookings([])
    expect(result.pairs).toHaveLength(0)
    expect(result.unpairedInIds).toHaveLength(0)
    expect(result.unpairedOutIds).toHaveLength(0)
  })

  it("single pair (540 min duration)", () => {
    const bookings: BookingInput[] = [
      { id: "come1", time: 480, direction: "in", category: "work", pairId: null },
      { id: "go1", time: 1020, direction: "out", category: "work", pairId: null },
    ]

    const result = pairBookings(bookings)

    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]!.inBooking!.id).toBe("come1")
    expect(result.pairs[0]!.outBooking!.id).toBe("go1")
    expect(result.pairs[0]!.duration).toBe(540)
    expect(result.unpairedInIds).toHaveLength(0)
    expect(result.unpairedOutIds).toHaveLength(0)
  })

  it("pair by existing PairID", () => {
    const bookings: BookingInput[] = [
      { id: "come1", time: 480, direction: "in", category: "work", pairId: "go1" },
      { id: "go1", time: 1020, direction: "out", category: "work", pairId: "come1" },
    ]

    const result = pairBookings(bookings)

    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]!.inBooking!.id).toBe("come1")
    expect(result.pairs[0]!.outBooking!.id).toBe("go1")
  })

  it("multiple pairs (split shift)", () => {
    const bookings: BookingInput[] = [
      { id: "come1", time: 480, direction: "in", category: "work", pairId: null },  // 08:00
      { id: "go1", time: 720, direction: "out", category: "work", pairId: null },   // 12:00
      { id: "come2", time: 780, direction: "in", category: "work", pairId: null },  // 13:00
      { id: "go2", time: 1020, direction: "out", category: "work", pairId: null },  // 17:00
    ]

    const result = pairBookings(bookings)

    expect(result.pairs).toHaveLength(2)
    expect(result.pairs[0]!.duration).toBe(240) // 4 hours
    expect(result.pairs[1]!.duration).toBe(240) // 4 hours
  })

  it("with breaks (work + break pairs)", () => {
    const bookings: BookingInput[] = [
      { id: "come1", time: 480, direction: "in", category: "work", pairId: null },
      { id: "brkStart", time: 720, direction: "out", category: "break", pairId: null },
      { id: "brkEnd", time: 750, direction: "in", category: "break", pairId: null },
      { id: "go1", time: 1020, direction: "out", category: "work", pairId: null },
    ]

    const result = pairBookings(bookings)

    expect(result.pairs).toHaveLength(2) // 1 work pair + 1 break pair

    const workPair = result.pairs.find((p) => p.category === "work")
    const breakPair = result.pairs.find((p) => p.category === "break")

    expect(workPair).toBeDefined()
    expect(workPair!.duration).toBe(540) // 9 hours

    expect(breakPair).toBeDefined()
    expect(breakPair!.duration).toBe(30) // 30 min break
  })

  it("unpaired (single in)", () => {
    const bookings: BookingInput[] = [
      { id: "come1", time: 480, direction: "in", category: "work", pairId: null },
    ]

    const result = pairBookings(bookings)

    expect(result.pairs).toHaveLength(0)
    expect(result.unpairedInIds).toEqual(["come1"])
    expect(result.unpairedOutIds).toHaveLength(0)
  })

  it("cross-midnight (22:00 to 02:00 = 240 min)", () => {
    const bookings: BookingInput[] = [
      { id: "come1", time: 1320, direction: "in", category: "work", pairId: null },  // 22:00
      { id: "go1", time: 120, direction: "out", category: "work", pairId: null },     // 02:00 next day
    ]

    const result = pairBookings(bookings)

    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]!.duration).toBe(240) // 4 hours
    expect(result.warnings).toContain(WARN_CROSS_MIDNIGHT)
  })
})

describe("calculateGrossTime", () => {
  it("work pairs summed, break pairs excluded", () => {
    const pairs: BookingPair[] = [
      { inBooking: null, outBooking: null, category: "work", duration: 240 },
      { inBooking: null, outBooking: null, category: "work", duration: 240 },
      { inBooking: null, outBooking: null, category: "break", duration: 30 },
    ]

    expect(calculateGrossTime(pairs)).toBe(480)
  })
})

describe("calculateBreakTime", () => {
  it("break pairs summed, work pairs excluded", () => {
    const pairs: BookingPair[] = [
      { inBooking: null, outBooking: null, category: "work", duration: 480 },
      { inBooking: null, outBooking: null, category: "break", duration: 30 },
      { inBooking: null, outBooking: null, category: "break", duration: 15 },
    ]

    expect(calculateBreakTime(pairs)).toBe(45)
  })
})

describe("findFirstCome", () => {
  it("returns earliest work IN", () => {
    const bookings: BookingInput[] = [
      { id: "1", time: 500, direction: "in", category: "work", pairId: null },
      { id: "2", time: 480, direction: "in", category: "work", pairId: null },
      { id: "3", time: 720, direction: "in", category: "break", pairId: null }, // break, not work
      { id: "4", time: 1020, direction: "out", category: "work", pairId: null },
    ]

    expect(findFirstCome(bookings)).toBe(480)
  })

  it("returns null when no work IN", () => {
    const bookings: BookingInput[] = [
      { id: "1", time: 1020, direction: "out", category: "work", pairId: null },
    ]

    expect(findFirstCome(bookings)).toBeNull()
  })
})

describe("findLastGo", () => {
  it("returns latest work OUT", () => {
    const bookings: BookingInput[] = [
      { id: "1", time: 480, direction: "in", category: "work", pairId: null },
      { id: "2", time: 1020, direction: "out", category: "work", pairId: null },
      { id: "3", time: 1050, direction: "in", category: "break", pairId: null }, // break end, not work
      { id: "4", time: 1080, direction: "out", category: "work", pairId: null },
    ]

    expect(findLastGo(bookings)).toBe(1080)
  })

  it("returns null when no work OUT", () => {
    const bookings: BookingInput[] = [
      { id: "1", time: 480, direction: "in", category: "work", pairId: null },
    ]

    expect(findLastGo(bookings)).toBeNull()
  })
})
