import { describe, it, expect } from "vitest"
import type { CappedTime } from "../types"
import {
  applyWindowCapping,
  applyCapping,
  calculateEarlyArrivalCapping,
  calculateLateDepartureCapping,
  calculateMaxNetTimeCapping,
  aggregateCapping,
} from "../capping"

describe("calculateEarlyArrivalCapping", () => {
  it("nil window start - no capping", () => {
    expect(calculateEarlyArrivalCapping(400, null, 0, false)).toBeNull()
  })

  it("within window - no capping", () => {
    expect(calculateEarlyArrivalCapping(420, 420, 0, false)).toBeNull()
  })

  it("after window start - no capping", () => {
    expect(calculateEarlyArrivalCapping(435, 420, 0, false)).toBeNull()
  })

  it("before window, no tolerance - capped", () => {
    const result = calculateEarlyArrivalCapping(405, 420, 0, false)
    expect(result).not.toBeNull()
    expect(result!.minutes).toBe(15)
    expect(result!.source).toBe("early_arrival")
  })

  it("before window, tolerance applies (variable work time) - no capping", () => {
    // 06:45 >= 06:30 (07:00 - 30)
    expect(calculateEarlyArrivalCapping(405, 420, 30, true)).toBeNull()
  })

  it("before tolerance window (variable work time) - capped", () => {
    // 06:15 to 06:30 = 15 min capped
    const result = calculateEarlyArrivalCapping(375, 420, 30, true)
    expect(result).not.toBeNull()
    expect(result!.minutes).toBe(15)
  })

  it("before window, tolerance NOT applied (fixed work time) - capped", () => {
    // tolerance ignored when not variable
    const result = calculateEarlyArrivalCapping(405, 420, 30, false)
    expect(result).not.toBeNull()
    expect(result!.minutes).toBe(15)
  })

  it("exactly at effective window start - no capping", () => {
    expect(calculateEarlyArrivalCapping(390, 420, 30, true)).toBeNull()
  })
})

describe("calculateLateDepartureCapping", () => {
  it("nil window end - no capping", () => {
    expect(calculateLateDepartureCapping(1080, null, 0)).toBeNull()
  })

  it("within window - no capping", () => {
    expect(calculateLateDepartureCapping(1020, 1020, 0)).toBeNull()
  })

  it("before window end - no capping", () => {
    expect(calculateLateDepartureCapping(1000, 1020, 0)).toBeNull()
  })

  it("after window end, no tolerance - capped", () => {
    const result = calculateLateDepartureCapping(1050, 1020, 0)
    expect(result).not.toBeNull()
    expect(result!.minutes).toBe(30)
    expect(result!.source).toBe("late_leave")
  })

  it("after window, within tolerance - no capping", () => {
    expect(calculateLateDepartureCapping(1035, 1020, 30)).toBeNull()
  })

  it("after tolerance window - capped", () => {
    // 17:45 - 17:30 = 15 min capped
    const result = calculateLateDepartureCapping(1065, 1020, 30)
    expect(result).not.toBeNull()
    expect(result!.minutes).toBe(15)
  })

  it("exactly at effective window end - no capping", () => {
    expect(calculateLateDepartureCapping(1050, 1020, 30)).toBeNull()
  })
})

describe("calculateMaxNetTimeCapping", () => {
  it("nil max - no capping", () => {
    expect(calculateMaxNetTimeCapping(660, null)).toBeNull()
  })

  it("under max - no capping", () => {
    expect(calculateMaxNetTimeCapping(540, 600)).toBeNull()
  })

  it("at max - no capping", () => {
    expect(calculateMaxNetTimeCapping(600, 600)).toBeNull()
  })

  it("over max - capped", () => {
    const result = calculateMaxNetTimeCapping(660, 600)
    expect(result).not.toBeNull()
    expect(result!.minutes).toBe(60)
    expect(result!.source).toBe("max_net_time")
  })

  it("significantly over max - capped", () => {
    const result = calculateMaxNetTimeCapping(720, 480)
    expect(result).not.toBeNull()
    expect(result!.minutes).toBe(240)
  })
})

describe("aggregateCapping", () => {
  it("no items", () => {
    const result = aggregateCapping()
    expect(result.totalCapped).toBe(0)
    expect(result.items).toHaveLength(0)
  })

  it("all null items", () => {
    const result = aggregateCapping(null, null, null)
    expect(result.totalCapped).toBe(0)
    expect(result.items).toHaveLength(0)
  })

  it("single item", () => {
    const item: CappedTime = { minutes: 15, source: "early_arrival", reason: "test" }
    const result = aggregateCapping(item)
    expect(result.totalCapped).toBe(15)
    expect(result.items).toHaveLength(1)
  })

  it("multiple items", () => {
    const item1: CappedTime = { minutes: 15, source: "early_arrival", reason: "test" }
    const item2: CappedTime = { minutes: 30, source: "max_net_time", reason: "test" }
    const result = aggregateCapping(item1, item2)
    expect(result.totalCapped).toBe(45)
    expect(result.items).toHaveLength(2)
  })

  it("mixed null and valid items", () => {
    const item1: CappedTime = { minutes: 20, source: "early_arrival", reason: "test" }
    const item2: CappedTime = { minutes: 10, source: "late_leave", reason: "test" }
    const result = aggregateCapping(null, item1, null, item2)
    expect(result.totalCapped).toBe(30)
    expect(result.items).toHaveLength(2)
  })

  it("zero-minutes item ignored", () => {
    const item1: CappedTime = { minutes: 0, source: "early_arrival", reason: "test" }
    const item2: CappedTime = { minutes: 15, source: "max_net_time", reason: "test" }
    const result = aggregateCapping(item1, item2)
    expect(result.totalCapped).toBe(15)
    expect(result.items).toHaveLength(1)
  })
})

describe("applyCapping", () => {
  it("nil max", () => {
    const { adjustedNet, capped } = applyCapping(600, null)
    expect(adjustedNet).toBe(600)
    expect(capped).toBe(0)
  })

  it("under max", () => {
    const { adjustedNet, capped } = applyCapping(540, 600)
    expect(adjustedNet).toBe(540)
    expect(capped).toBe(0)
  })

  it("at max", () => {
    const { adjustedNet, capped } = applyCapping(600, 600)
    expect(adjustedNet).toBe(600)
    expect(capped).toBe(0)
  })

  it("over max", () => {
    const { adjustedNet, capped } = applyCapping(660, 600)
    expect(adjustedNet).toBe(600)
    expect(capped).toBe(60)
  })
})

describe("applyWindowCapping", () => {
  it("arrival within window", () => {
    const { adjustedTime, capped } = applyWindowCapping(450, 420, null, 0, 0, true, false)
    expect(adjustedTime).toBe(450)
    expect(capped).toBe(0)
  })

  it("arrival before window, no tolerance", () => {
    const { adjustedTime, capped } = applyWindowCapping(405, 420, null, 0, 0, true, false)
    expect(adjustedTime).toBe(420)
    expect(capped).toBe(15)
  })

  it("arrival before window, with tolerance (variable)", () => {
    const { adjustedTime, capped } = applyWindowCapping(405, 420, null, 30, 0, true, true)
    expect(adjustedTime).toBe(405) // within tolerance window
    expect(capped).toBe(0)
  })

  it("arrival before tolerance window (variable)", () => {
    const { adjustedTime, capped } = applyWindowCapping(375, 420, null, 30, 0, true, true)
    expect(adjustedTime).toBe(390) // adjusted to tolerance window start
    expect(capped).toBe(15)
  })

  it("departure within window", () => {
    const { adjustedTime, capped } = applyWindowCapping(1000, null, 1020, 0, 0, false, false)
    expect(adjustedTime).toBe(1000)
    expect(capped).toBe(0)
  })

  it("departure after window, no tolerance", () => {
    const { adjustedTime, capped } = applyWindowCapping(1050, null, 1020, 0, 0, false, false)
    expect(adjustedTime).toBe(1020)
    expect(capped).toBe(30)
  })

  it("departure after window, within tolerance", () => {
    const { adjustedTime, capped } = applyWindowCapping(1035, null, 1020, 0, 30, false, false)
    expect(adjustedTime).toBe(1035)
    expect(capped).toBe(0)
  })

  it("departure after tolerance window", () => {
    const { adjustedTime, capped } = applyWindowCapping(1065, null, 1020, 0, 30, false, false)
    expect(adjustedTime).toBe(1050)
    expect(capped).toBe(15)
  })
})
