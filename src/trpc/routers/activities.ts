/**
 * Activities Router
 *
 * Provides activity CRUD operations via tRPC procedures.
 * Replaces the Go backend activity endpoints:
 * - GET /activities -> activities.list
 * - GET /activities/{id} -> activities.getById
 * - POST /activities -> activities.create
 * - PATCH /activities/{id} -> activities.update
 * - DELETE /activities/{id} -> activities.delete
 *
 * @see apps/api/internal/service/activity.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { hasPermission } from "@/lib/auth/permissions"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as activityService from "@/lib/services/activity-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const ACTIVITIES_MANAGE = permissionIdByKey("activities.manage")!
const ACTIVITIES_MANAGE_PRICING = permissionIdByKey("activities.manage_pricing")!

const activityPricingTypeEnum = z.enum(["HOURLY", "FLAT_RATE", "PER_UNIT"])

// --- Output Schemas ---

const activityOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // NK-1 Pricing fields (Decision 7)
  pricingType: activityPricingTypeEnum,
  flatRate: z.number().nullable(),
  hourlyRate: z.number().nullable(),
  unit: z.string().nullable(),
  calculatedHourEquivalent: z.number().nullable(),
})

type ActivityOutput = z.infer<typeof activityOutputSchema>

// --- Input Schemas ---

const createActivityInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  // NK-1 Pricing fields are accepted at create-time but the service
  // will REJECT the request unless the caller has the pricing permission.
  // For backward-compatibility when no pricing fields are sent, the
  // defaults (`HOURLY` / NULL) apply automatically.
  pricingType: activityPricingTypeEnum.optional(),
  flatRate: z.number().min(0).max(99999.99).nullable().optional(),
  hourlyRate: z.number().min(0).max(99999.99).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  calculatedHourEquivalent: z.number().min(0.01).max(9999.99).nullable().optional(),
})

const updateActivityInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  // NK-1-FIX-FORM-1 (closing-pass-followup 2026-05-06): the form-sheet
  // sends pricing fields in the same payload as base CRUD fields. Per
  // Decision 29 the actual pricing change still requires the elevated
  // `activities.manage_pricing` permission — that's enforced at the
  // procedure-level via a runtime check below, NOT by middleware,
  // because users WITH `activities.manage` (but not the pricing perm)
  // must still be able to edit name/description.
  pricingType: activityPricingTypeEnum.optional(),
  flatRate: z.number().min(0).max(99999.99).nullable().optional(),
  hourlyRate: z.number().min(0).max(99999.99).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  calculatedHourEquivalent: z
    .number()
    .min(0.01)
    .max(9999.99)
    .nullable()
    .optional(),
})

// Decision 29: dedicated pricing-update endpoint
const updatePricingInputSchema = z.object({
  id: z.string().uuid(),
  pricingType: activityPricingTypeEnum.optional(),
  flatRate: z.number().min(0).max(99999.99).nullable().optional(),
  hourlyRate: z.number().min(0).max(99999.99).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  calculatedHourEquivalent: z
    .number()
    .min(0.01)
    .max(9999.99)
    .nullable()
    .optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma Activity record to the output schema shape.
 */
function mapActivityToOutput(a: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  pricingType: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
  flatRate: { toString(): string } | null
  hourlyRate: { toString(): string } | null
  unit: string | null
  calculatedHourEquivalent: { toString(): string } | null
}): ActivityOutput {
  return {
    id: a.id,
    tenantId: a.tenantId,
    code: a.code,
    name: a.name,
    description: a.description,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    pricingType: a.pricingType,
    flatRate: a.flatRate == null ? null : Number(a.flatRate),
    hourlyRate: a.hourlyRate == null ? null : Number(a.hourlyRate),
    unit: a.unit,
    calculatedHourEquivalent:
      a.calculatedHourEquivalent == null
        ? null
        : Number(a.calculatedHourEquivalent),
  }
}

// --- Router ---

export const activitiesRouter = createTRPCRouter({
  /**
   * activities.list -- Returns activities for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC.
   *
   * Requires: activities.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(activityOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const activities = await activityService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return {
          data: activities.map(mapActivityToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * activities.getById -- Returns a single activity by ID.
   *
   * Tenant-scoped: only returns activities belonging to the current tenant.
   *
   * Requires: activities.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(activityOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const activity = await activityService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return mapActivityToOutput(activity)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * activities.create -- Creates a new activity.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * Always sets isActive to true (no isActive input, matching Go behavior).
   *
   * Requires: activities.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(createActivityInputSchema)
    .output(activityOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const activity = await activityService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapActivityToOutput(activity)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * activities.update -- Updates an existing activity.
   *
   * Supports partial updates of CRUD fields (code, name, description,
   * isActive). Pricing fields (pricingType, flatRate, hourlyRate, unit,
   * calculatedHourEquivalent) are accepted in the same payload but require
   * the elevated `activities.manage_pricing` permission per Decision 29.
   * Users with only `activities.manage` get a 403 if they try to send
   * pricing fields in the update.
   *
   * Code uniqueness check only when code actually changes (matching
   * Go logic at apps/api/internal/service/activity.go:109).
   *
   * Requires: activities.manage permission (always)
   *           activities.manage_pricing permission (when pricing fields present)
   */
  update: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(updateActivityInputSchema)
    .output(activityOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // NK-1-FIX-FORM-1: detect whether the caller wants to mutate
        // pricing — if so, escalate to the manage_pricing permission.
        const hasPricingChange =
          input.pricingType !== undefined ||
          input.flatRate !== undefined ||
          input.hourlyRate !== undefined ||
          input.unit !== undefined ||
          input.calculatedHourEquivalent !== undefined
        if (
          hasPricingChange &&
          !hasPermission(ctx.user!, ACTIVITIES_MANAGE_PRICING)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "activities.manage_pricing permission required to change pricing fields",
          })
        }

        const activity = await activityService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapActivityToOutput(activity)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * activities.delete -- Deletes an activity.
   *
   * Prevents deletion when employees have defaultActivityId referencing it.
   *
   * Requires: activities.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await activityService.remove(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * activities.updatePricing -- Updates Activity pricing fields.
   *
   * Decision 29 (NK-1): pricing has financial impact and is gated
   * separately from the regular Activity-CRUD permission. Disponenten
   * can create activities, but only Admin/GF may set the pricing.
   *
   * Requires: activities.manage_pricing permission
   */
  updatePricing: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE_PRICING))
    .input(updatePricingInputSchema)
    .output(activityOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const activity = await activityService.updatePricing(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
        )
        return mapActivityToOutput(activity)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
