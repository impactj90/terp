/**
 * Travel Allowance Preview Service
 *
 * Business logic for computing travel allowance previews.
 * Delegates data access to the repository layer and calculation to the
 * pure calculation module.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./travel-allowance-preview-repository"
import {
  calculateLocalTravelAllowance,
  calculateExtendedTravelAllowance,
} from "@/lib/calculation/travel-allowance"
import type {
  LocalTravelRuleInput,
  ExtendedTravelRuleInput,
} from "@/lib/calculation/travel-allowance"

// --- Error Classes ---

export class RuleSetNotFoundError extends Error {
  constructor() {
    super("Rule set not found")
    this.name = "RuleSetNotFoundError"
  }
}

export class PreviewValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PreviewValidationError"
  }
}

// --- Service Functions ---

/**
 * Calculates a travel allowance preview.
 * For local trips: matches distance/duration against active local rules.
 * For extended trips: computes day breakdown using active extended rule.
 */
export async function preview(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    ruleSetId: string
    tripType: "local" | "extended"
    distanceKm: number
    durationMinutes: number
    startDate?: string
    endDate?: string
    threeMonthActive: boolean
  }
) {
  const ruleSet = await repo.findRuleSetByIdAndTenant(prisma, tenantId, input.ruleSetId)
  if (!ruleSet) {
    throw new RuleSetNotFoundError()
  }

  if (input.tripType === "local") {
    return previewLocal(prisma, input, ruleSet)
  }
  return previewExtended(prisma, input, ruleSet)
}

// --- Private helpers ---

async function previewLocal(
  prisma: PrismaClient,
  input: {
    ruleSetId: string
    distanceKm: number
    durationMinutes: number
  },
  ruleSet: { id: string; name: string }
) {
  if (input.distanceKm <= 0 && input.durationMinutes <= 0) {
    throw new PreviewValidationError(
      "Distance or duration is required for local travel preview"
    )
  }

  const rules = await repo.listActiveLocalRules(prisma, input.ruleSetId)

  const calcRules: LocalTravelRuleInput[] = rules.map(
    (r: Record<string, unknown>) => ({
      minDistanceKm: Number(r.minDistanceKm),
      maxDistanceKm: r.maxDistanceKm != null ? Number(r.maxDistanceKm) : null,
      minDurationMinutes: Number(r.minDurationMinutes),
      maxDurationMinutes:
        r.maxDurationMinutes != null ? Number(r.maxDurationMinutes) : null,
      taxFreeAmount: Number(r.taxFreeAmount),
      taxableAmount: Number(r.taxableAmount),
    })
  )

  const calcOutput = calculateLocalTravelAllowance({
    distanceKm: input.distanceKm,
    durationMinutes: input.durationMinutes,
    rules: calcRules,
  })

  if (!calcOutput.matched) {
    throw new PreviewValidationError("No matching local travel rule found")
  }

  return {
    tripType: "local" as const,
    ruleSetId: ruleSet.id,
    ruleSetName: ruleSet.name,
    taxFreeTotal: calcOutput.taxFreeTotal,
    taxableTotal: calcOutput.taxableTotal,
    totalAllowance: calcOutput.totalAllowance,
    breakdown: [
      {
        description: "Local travel allowance",
        days: 1,
        taxFreeAmount: calcOutput.taxFreeTotal,
        taxableAmount: calcOutput.taxableTotal,
        taxFreeSubtotal: calcOutput.taxFreeTotal,
        taxableSubtotal: calcOutput.taxableTotal,
      },
    ],
  }
}

async function previewExtended(
  prisma: PrismaClient,
  input: {
    ruleSetId: string
    startDate?: string
    endDate?: string
    threeMonthActive: boolean
  },
  ruleSet: { id: string; name: string }
) {
  if (!input.startDate || !input.endDate) {
    throw new PreviewValidationError(
      "Start date and end date are required for extended travel preview"
    )
  }

  const startDate = new Date(input.startDate + "T00:00:00.000Z")
  const endDate = new Date(input.endDate + "T00:00:00.000Z")

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new PreviewValidationError(
      "Start date and end date are required for extended travel preview"
    )
  }

  const rules = await repo.listActiveExtendedRules(prisma, input.ruleSetId)

  if (rules.length === 0) {
    throw new PreviewValidationError(
      "No active extended travel rule found for this rule set"
    )
  }

  const activeRule = rules[0] as Record<string, unknown>

  const extRule: ExtendedTravelRuleInput = {
    arrivalDayTaxFree: Number(activeRule.arrivalDayTaxFree),
    arrivalDayTaxable: Number(activeRule.arrivalDayTaxable),
    departureDayTaxFree: Number(activeRule.departureDayTaxFree),
    departureDayTaxable: Number(activeRule.departureDayTaxable),
    intermediateDayTaxFree: Number(activeRule.intermediateDayTaxFree),
    intermediateDayTaxable: Number(activeRule.intermediateDayTaxable),
    threeMonthEnabled: activeRule.threeMonthEnabled as boolean,
    threeMonthTaxFree: Number(activeRule.threeMonthTaxFree),
    threeMonthTaxable: Number(activeRule.threeMonthTaxable),
  }

  const calcOutput = calculateExtendedTravelAllowance({
    startDate,
    endDate,
    threeMonthActive: input.threeMonthActive,
    rule: extRule,
  })

  return {
    tripType: "extended" as const,
    ruleSetId: ruleSet.id,
    ruleSetName: ruleSet.name,
    taxFreeTotal: calcOutput.taxFreeTotal,
    taxableTotal: calcOutput.taxableTotal,
    totalAllowance: calcOutput.totalAllowance,
    breakdown: calcOutput.breakdown.map((item) => ({
      description: item.description,
      days: item.days,
      taxFreeAmount: item.taxFreeAmount,
      taxableAmount: item.taxableAmount,
      taxFreeSubtotal: item.taxFreeSubtotal,
      taxableSubtotal: item.taxableSubtotal,
    })),
  }
}
