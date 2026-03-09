/**
 * Travel Allowance Preview Router
 *
 * Provides travel allowance calculation preview via tRPC.
 *
 * Replaces the Go backend travel allowance preview endpoint:
 * - POST /travel-allowance-preview -> travelAllowancePreview.preview (query)
 *
 * @see apps/api/internal/service/travel_allowance_preview.go
 * @see apps/api/internal/calculation/travel_allowance.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  calculateLocalTravelAllowance,
  calculateExtendedTravelAllowance,
} from "@/lib/calculation/travel-allowance"
import type {
  LocalTravelRuleInput,
  ExtendedTravelRuleInput,
} from "@/lib/calculation/travel-allowance"

// --- Permission Constants ---

const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!

// --- Output Schemas ---

const breakdownItemSchema = z.object({
  description: z.string(),
  days: z.number(),
  taxFreeAmount: z.number(),
  taxableAmount: z.number(),
  taxFreeSubtotal: z.number(),
  taxableSubtotal: z.number(),
})

const previewOutputSchema = z.object({
  tripType: z.string(),
  ruleSetId: z.string().uuid(),
  ruleSetName: z.string(),
  taxFreeTotal: z.number(),
  taxableTotal: z.number(),
  totalAllowance: z.number(),
  breakdown: z.array(breakdownItemSchema),
})

// --- Input Schemas ---

const previewInputSchema = z.object({
  ruleSetId: z.string().uuid(),
  tripType: z.enum(["local", "extended"]),
  distanceKm: z.number().optional().default(0),
  durationMinutes: z.number().int().optional().default(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  threeMonthActive: z.boolean().optional().default(false),
})

// --- Router ---

export const travelAllowancePreviewRouter = createTRPCRouter({
  /**
   * travelAllowancePreview.preview -- Calculates a travel allowance preview.
   *
   * For local trips: matches distance/duration against active local rules.
   * For extended trips: computes day breakdown using active extended rule.
   *
   * Requires: travel_allowance.manage permission
   */
  preview: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(previewInputSchema)
    .output(previewOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch rule set
      const ruleSet = await ctx.prisma.travelAllowanceRuleSet.findFirst({
        where: { id: input.ruleSetId, tenantId },
      })
      if (!ruleSet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rule set not found",
        })
      }

      if (input.tripType === "local") {
        return previewLocal(ctx, input, ruleSet)
      }
      return previewExtended(ctx, input, ruleSet)
    }),
})

// --- Private helpers ---

async function previewLocal(
  ctx: { prisma: { localTravelRule: { findMany: Function } } },
  input: {
    ruleSetId: string
    distanceKm: number
    durationMinutes: number
  },
  ruleSet: { id: string; name: string }
) {
  if (input.distanceKm <= 0 && input.durationMinutes <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Distance or duration is required for local travel preview",
    })
  }

  // Fetch local rules for this rule set (active only)
  const rules = await ctx.prisma.localTravelRule.findMany({
    where: { ruleSetId: input.ruleSetId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { minDistanceKm: "asc" }],
  })

  // Build calculation input (convert Prisma Decimals to numbers)
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
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No matching local travel rule found",
    })
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
  ctx: { prisma: { extendedTravelRule: { findMany: Function } } },
  input: {
    ruleSetId: string
    startDate?: string
    endDate?: string
    threeMonthActive: boolean
  },
  ruleSet: { id: string; name: string }
) {
  if (!input.startDate || !input.endDate) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Start date and end date are required for extended travel preview",
    })
  }

  const startDate = new Date(input.startDate + "T00:00:00.000Z")
  const endDate = new Date(input.endDate + "T00:00:00.000Z")

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Start date and end date are required for extended travel preview",
    })
  }

  // Fetch extended rules for this rule set (active only)
  const rules = await ctx.prisma.extendedTravelRule.findMany({
    where: { ruleSetId: input.ruleSetId, isActive: true },
    orderBy: [{ sortOrder: "asc" }],
  })

  // Find first active rule
  if (rules.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No active extended travel rule found for this rule set",
    })
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
