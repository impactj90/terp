import { describe, it, expect } from "vitest"
import {
  calculatePayout,
  resolveEffectiveRule,
  buildTariffRuleSnapshot,
  type PayoutRule,
} from "../overtime-payout-service"

function makeRule(overrides: Partial<PayoutRule> = {}): PayoutRule {
  return {
    overtimePayoutEnabled: true,
    overtimePayoutThresholdMinutes: 600,
    overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
    overtimePayoutPercentage: null,
    overtimePayoutFixedMinutes: null,
    overtimePayoutApprovalRequired: false,
    overrideApplied: false,
    overrideMode: null,
    ...overrides,
  }
}

describe("calculatePayout", () => {
  it("ALL_ABOVE_THRESHOLD: 20h balance, 10h threshold → 10h payout", () => {
    const result = calculatePayout(1200, makeRule({ overtimePayoutThresholdMinutes: 600 }))
    expect(result.payoutMinutes).toBe(600)
    expect(result.remainingBalance).toBe(600)
  })

  it("PERCENTAGE 50%: 20h balance, 10h threshold → 5h payout", () => {
    const result = calculatePayout(1200, makeRule({
      overtimePayoutMode: "PERCENTAGE",
      overtimePayoutThresholdMinutes: 600,
      overtimePayoutPercentage: 50,
    }))
    expect(result.payoutMinutes).toBe(300)
    expect(result.remainingBalance).toBe(900)
  })

  it("FIXED_AMOUNT 10h: 20h balance, 5h threshold → 10h payout", () => {
    const result = calculatePayout(1200, makeRule({
      overtimePayoutMode: "FIXED_AMOUNT",
      overtimePayoutThresholdMinutes: 300,
      overtimePayoutFixedMinutes: 600,
    }))
    expect(result.payoutMinutes).toBe(600)
    expect(result.remainingBalance).toBe(600)
  })

  it("FIXED_AMOUNT caps at excess: 12h balance, 5h threshold, fix 10h → 7h payout", () => {
    const result = calculatePayout(720, makeRule({
      overtimePayoutMode: "FIXED_AMOUNT",
      overtimePayoutThresholdMinutes: 300,
      overtimePayoutFixedMinutes: 600,
    }))
    expect(result.payoutMinutes).toBe(420)
    expect(result.remainingBalance).toBe(300)
  })

  it("below threshold: 8h balance, 10h threshold → 0h payout", () => {
    const result = calculatePayout(480, makeRule({ overtimePayoutThresholdMinutes: 600 }))
    expect(result.payoutMinutes).toBe(0)
    expect(result.remainingBalance).toBe(480)
  })

  it("exactly at threshold (exclusive): 10h = 10h → 0h payout", () => {
    const result = calculatePayout(600, makeRule({ overtimePayoutThresholdMinutes: 600 }))
    expect(result.payoutMinutes).toBe(0)
    expect(result.remainingBalance).toBe(600)
  })

  it("zero balance → 0h payout", () => {
    const result = calculatePayout(0, makeRule())
    expect(result.payoutMinutes).toBe(0)
    expect(result.remainingBalance).toBe(0)
  })

  it("negative balance → 0h payout", () => {
    const result = calculatePayout(-300, makeRule())
    expect(result.payoutMinutes).toBe(0)
    expect(result.remainingBalance).toBe(-300)
  })

  it("decimal minutes: 630min, 600min threshold → 30min", () => {
    const result = calculatePayout(630, makeRule({ overtimePayoutThresholdMinutes: 600 }))
    expect(result.payoutMinutes).toBe(30)
    expect(result.remainingBalance).toBe(600)
  })

  it("PERCENTAGE with floor rounding: 603min, 600min threshold, 50% → 1min", () => {
    const result = calculatePayout(603, makeRule({
      overtimePayoutMode: "PERCENTAGE",
      overtimePayoutThresholdMinutes: 600,
      overtimePayoutPercentage: 50,
    }))
    expect(result.payoutMinutes).toBe(1)
    expect(result.remainingBalance).toBe(602)
  })

  it("disabled rule → 0h payout", () => {
    const result = calculatePayout(1200, makeRule({ overtimePayoutEnabled: false }))
    expect(result.payoutMinutes).toBe(0)
    expect(result.remainingBalance).toBe(1200)
  })

  it("null threshold treated as 0", () => {
    const result = calculatePayout(100, makeRule({ overtimePayoutThresholdMinutes: null }))
    expect(result.payoutMinutes).toBe(100)
    expect(result.remainingBalance).toBe(0)
  })
})

describe("resolveEffectiveRule", () => {
  const baseTariff = {
    overtimePayoutEnabled: true,
    overtimePayoutThresholdMinutes: 600,
    overtimePayoutMode: "ALL_ABOVE_THRESHOLD" as const,
    overtimePayoutPercentage: null,
    overtimePayoutFixedMinutes: null,
    overtimePayoutApprovalRequired: false,
  }

  it("no override → tariff rule unchanged", () => {
    const rule = resolveEffectiveRule(baseTariff)
    expect(rule.overtimePayoutEnabled).toBe(true)
    expect(rule.overrideApplied).toBe(false)
    expect(rule.overrideMode).toBeNull()
  })

  it("override disabled → rule disabled", () => {
    const rule = resolveEffectiveRule(baseTariff, {
      overtimePayoutEnabled: false,
      overtimePayoutMode: null,
      isActive: true,
    })
    expect(rule.overtimePayoutEnabled).toBe(false)
    expect(rule.overrideApplied).toBe(true)
  })

  it("override with mode → overrideMode set", () => {
    const rule = resolveEffectiveRule(baseTariff, {
      overtimePayoutEnabled: true,
      overtimePayoutMode: "PERCENTAGE",
      isActive: true,
    })
    expect(rule.overrideMode).toBe("PERCENTAGE")
    expect(rule.overrideApplied).toBe(true)
    expect(rule.overtimePayoutMode).toBe("ALL_ABOVE_THRESHOLD")
  })

  it("inactive override → ignored", () => {
    const rule = resolveEffectiveRule(baseTariff, {
      overtimePayoutEnabled: false,
      overtimePayoutMode: null,
      isActive: false,
    })
    expect(rule.overtimePayoutEnabled).toBe(true)
    expect(rule.overrideApplied).toBe(false)
  })

  it("override mode used in calculatePayout", () => {
    const rule = resolveEffectiveRule(
      { ...baseTariff, overtimePayoutPercentage: 50 },
      { overtimePayoutEnabled: true, overtimePayoutMode: "PERCENTAGE", isActive: true },
    )
    const result = calculatePayout(1200, rule)
    expect(result.payoutMinutes).toBe(300)
  })
})

describe("buildTariffRuleSnapshot", () => {
  it("serializes all fields to JSON-safe object", () => {
    const rule = makeRule({ overtimePayoutPercentage: 50, overrideApplied: true, overrideMode: "PERCENTAGE" })
    const snapshot = buildTariffRuleSnapshot(rule)
    expect(snapshot.enabled).toBe(true)
    expect(snapshot.thresholdMinutes).toBe(600)
    expect(snapshot.mode).toBe("PERCENTAGE")
    expect(snapshot.percentage).toBe(50)
    expect(snapshot.fixedMinutes).toBeNull()
    expect(snapshot.approvalRequired).toBe(false)
    expect(snapshot.overrideApplied).toBe(true)
    expect(snapshot.overrideMode).toBe("PERCENTAGE")
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it("uses base mode when no override", () => {
    const rule = makeRule({
      overtimePayoutFixedMinutes: 120,
      overtimePayoutApprovalRequired: true,
    })
    const snapshot = buildTariffRuleSnapshot(rule)
    expect(snapshot.mode).toBe("ALL_ABOVE_THRESHOLD")
    expect(snapshot.fixedMinutes).toBe(120)
    expect(snapshot.approvalRequired).toBe(true)
    expect(snapshot.overrideMode).toBeNull()
  })
})
