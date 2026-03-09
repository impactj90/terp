import { normalizeCrossMidnight, isValidTimeOfDay, MINUTES_PER_DAY, MAX_MINUTES_FROM_MIDNIGHT } from "../time"

describe("constants", () => {
  it("MINUTES_PER_DAY is 1440", () => {
    expect(MINUTES_PER_DAY).toBe(1440)
  })

  it("MAX_MINUTES_FROM_MIDNIGHT is 1439", () => {
    expect(MAX_MINUTES_FROM_MIDNIGHT).toBe(1439)
  })
})

describe("normalizeCrossMidnight", () => {
  it("returns endMinutes unchanged when end >= start", () => {
    expect(normalizeCrossMidnight(480, 1020)).toBe(1020)
  })

  it("returns endMinutes unchanged when end equals start", () => {
    expect(normalizeCrossMidnight(480, 480)).toBe(480)
  })

  it("adds 1440 when end < start (cross-midnight)", () => {
    expect(normalizeCrossMidnight(1320, 120)).toBe(1560) // 22:00 to 02:00
  })

  it("handles midnight boundary", () => {
    expect(normalizeCrossMidnight(1400, 0)).toBe(1440)
  })
})

describe("isValidTimeOfDay", () => {
  it("returns true for 0 (midnight)", () => {
    expect(isValidTimeOfDay(0)).toBe(true)
  })

  it("returns true for 1439 (23:59)", () => {
    expect(isValidTimeOfDay(1439)).toBe(true)
  })

  it("returns true for midday", () => {
    expect(isValidTimeOfDay(720)).toBe(true)
  })

  it("returns false for -1", () => {
    expect(isValidTimeOfDay(-1)).toBe(false)
  })

  it("returns false for 1440", () => {
    expect(isValidTimeOfDay(1440)).toBe(false)
  })

  it("returns false for large positive value", () => {
    expect(isValidTimeOfDay(2000)).toBe(false)
  })
})
