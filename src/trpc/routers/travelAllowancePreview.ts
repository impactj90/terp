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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/travel-allowance-preview-service"

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
  ruleSetId: z.string(),
  ruleSetName: z.string(),
  taxFreeTotal: z.number(),
  taxableTotal: z.number(),
  totalAllowance: z.number(),
  breakdown: z.array(breakdownItemSchema),
})

// --- Input Schemas ---

const previewInputSchema = z.object({
  ruleSetId: z.string(),
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
      try {
        return await service.preview(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
