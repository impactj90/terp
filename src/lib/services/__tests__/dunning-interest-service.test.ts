import { describe, it, expect } from "vitest"
import {
  calculateInterest,
  feeForLevel,
} from "../dunning-interest-service"

describe("calculateInterest", () => {
  it("computes a known oracle value: 1000 EUR, 30 days, 9% p.a. = 7.40 EUR", () => {
    expect(calculateInterest(1000, 30, 9)).toBe(7.4)
  })

  it("returns 0 for zero open amount", () => {
    expect(calculateInterest(0, 30, 9)).toBe(0)
  })

  it("returns 0 for zero days overdue", () => {
    expect(calculateInterest(1000, 0, 9)).toBe(0)
  })

  it("returns 0 for zero interest rate", () => {
    expect(calculateInterest(1000, 30, 0)).toBe(0)
  })

  it("returns 0 for negative open amount", () => {
    expect(calculateInterest(-100, 30, 9)).toBe(0)
  })

  it("rounds to whole cents (1 day on 100 EUR @ 9% = 0.02)", () => {
    // 100 * 9/100 * 1/365 = 9/365 = 0.02465... -> rounds to 0.02
    expect(calculateInterest(100, 1, 9)).toBe(0.02)
  })

  it("rounds tiny amounts down to 0", () => {
    // 0.10 * 9/100 * 1/365 ≈ 0.0000246 -> rounds to 0
    expect(calculateInterest(0.1, 1, 9)).toBe(0)
  })

  it("handles very large amounts without precision loss", () => {
    // 1_000_000 * 9/100 * 365/365 = 90000 EUR after one full year
    expect(calculateInterest(1_000_000, 365, 9)).toBe(90_000)
  })
})

describe("feeForLevel", () => {
  it("returns the level-1 fee from feeAmounts[0]", () => {
    expect(feeForLevel([0, 2.5, 5], 1)).toBe(0)
  })

  it("returns the level-2 fee from feeAmounts[1]", () => {
    expect(feeForLevel([0, 2.5, 5], 2)).toBe(2.5)
  })

  it("returns 0 for out-of-range level", () => {
    expect(feeForLevel([0, 2.5, 5], 4)).toBe(0)
    expect(feeForLevel([0, 2.5, 5], 0)).toBe(0)
  })

  it("returns 0 for empty fee array", () => {
    expect(feeForLevel([], 1)).toBe(0)
  })
})
