/**
 * Local Travel Rules Router
 *
 * Provides CRUD operations for local travel rules via tRPC procedures.
 *
 * Replaces the Go backend local travel rule endpoints:
 * - GET    /local-travel-rules       -> localTravelRules.list
 * - GET    /local-travel-rules/{id}  -> localTravelRules.getById
 * - POST   /local-travel-rules       -> localTravelRules.create
 * - PATCH  /local-travel-rules/{id}  -> localTravelRules.update
 * - DELETE /local-travel-rules/{id}  -> localTravelRules.delete
 *
 * @see apps/api/internal/service/local_travel_rule.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as localTravelRuleService from "@/lib/services/local-travel-rule-service"

// --- Permission Constants ---

const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!

// --- Output Schemas ---

const localTravelRuleOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ruleSetId: z.string(),
  minDistanceKm: z.number(),
  maxDistanceKm: z.number().nullable(),
  minDurationMinutes: z.number(),
  maxDurationMinutes: z.number().nullable(),
  taxFreeAmount: z.number(),
  taxableAmount: z.number(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createLocalTravelRuleInputSchema = z.object({
  ruleSetId: z.string(),
  minDistanceKm: z.number().optional(),
  maxDistanceKm: z.number().optional(),
  minDurationMinutes: z.number().int().optional(),
  maxDurationMinutes: z.number().int().optional(),
  taxFreeAmount: z.number().optional(),
  taxableAmount: z.number().optional(),
  sortOrder: z.number().int().optional(),
})

const updateLocalTravelRuleInputSchema = z.object({
  id: z.string(),
  // ruleSetId is NOT updatable
  minDistanceKm: z.number().optional(),
  maxDistanceKm: z.number().nullable().optional(),
  minDurationMinutes: z.number().int().optional(),
  maxDurationMinutes: z.number().int().nullable().optional(),
  taxFreeAmount: z.number().optional(),
  taxableAmount: z.number().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Helpers ---

/** Convert a Prisma Decimal | null to number | null */
function decToNum(val: unknown): number | null {
  return val != null ? Number(val) : null
}

/** Convert a Prisma Decimal to number */
function decToNumReq(val: unknown): number {
  return Number(val)
}

/** Maps a Prisma LocalTravelRule to the output shape */
function mapToOutput(r: {
  id: string
  tenantId: string
  ruleSetId: string
  minDistanceKm: unknown
  maxDistanceKm: unknown
  minDurationMinutes: number
  maxDurationMinutes: number | null
  taxFreeAmount: unknown
  taxableAmount: unknown
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    ruleSetId: r.ruleSetId,
    minDistanceKm: decToNumReq(r.minDistanceKm),
    maxDistanceKm: decToNum(r.maxDistanceKm),
    minDurationMinutes: r.minDurationMinutes,
    maxDurationMinutes: r.maxDurationMinutes,
    taxFreeAmount: decToNumReq(r.taxFreeAmount),
    taxableAmount: decToNumReq(r.taxableAmount),
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

// --- Router ---

export const localTravelRulesRouter = createTRPCRouter({
  /**
   * localTravelRules.list -- Returns local travel rules for the current tenant.
   *
   * Optionally filtered by ruleSetId.
   * Orders by sortOrder ASC, minDistanceKm ASC.
   *
   * Requires: travel_allowance.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ ruleSetId: z.string().optional() }).optional())
    .output(z.object({ data: z.array(localTravelRuleOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const rules = await localTravelRuleService.list(
          ctx.prisma,
          tenantId,
          input ?? undefined
        )
        return {
          data: rules.map(mapToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * localTravelRules.getById -- Returns a single local travel rule by ID.
   *
   * Requires: travel_allowance.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(localTravelRuleOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const rule = await localTravelRuleService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapToOutput(rule)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * localTravelRules.create -- Creates a new local travel rule.
   *
   * Validates ruleSetId FK exists within tenant scope.
   *
   * Requires: travel_allowance.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(createLocalTravelRuleInputSchema)
    .output(localTravelRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const rule = await localTravelRuleService.create(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(rule)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * localTravelRules.update -- Updates an existing local travel rule.
   *
   * Supports partial updates. RuleSetID is NOT updatable.
   *
   * Requires: travel_allowance.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(updateLocalTravelRuleInputSchema)
    .output(localTravelRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const rule = await localTravelRuleService.update(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(rule)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * localTravelRules.delete -- Deletes a local travel rule.
   *
   * Requires: travel_allowance.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await localTravelRuleService.remove(ctx.prisma, tenantId, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
