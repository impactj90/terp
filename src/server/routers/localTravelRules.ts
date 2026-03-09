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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!

// --- Output Schemas ---

const localTravelRuleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  ruleSetId: z.string().uuid(),
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
  ruleSetId: z.string().uuid(),
  minDistanceKm: z.number().optional(),
  maxDistanceKm: z.number().optional(),
  minDurationMinutes: z.number().int().optional(),
  maxDurationMinutes: z.number().int().optional(),
  taxFreeAmount: z.number().optional(),
  taxableAmount: z.number().optional(),
  sortOrder: z.number().int().optional(),
})

const updateLocalTravelRuleInputSchema = z.object({
  id: z.string().uuid(),
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
    .input(z.object({ ruleSetId: z.string().uuid().optional() }).optional())
    .output(z.object({ data: z.array(localTravelRuleOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }
      if (input?.ruleSetId) {
        where.ruleSetId = input.ruleSetId
      }

      const rules = await ctx.prisma.localTravelRule.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { minDistanceKm: "asc" }],
      })

      return {
        data: rules.map((r) => ({
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
        })),
      }
    }),

  /**
   * localTravelRules.getById -- Returns a single local travel rule by ID.
   *
   * Requires: travel_allowance.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(localTravelRuleOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const rule = await ctx.prisma.localTravelRule.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!rule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Local travel rule not found",
        })
      }

      return {
        id: rule.id,
        tenantId: rule.tenantId,
        ruleSetId: rule.ruleSetId,
        minDistanceKm: decToNumReq(rule.minDistanceKm),
        maxDistanceKm: decToNum(rule.maxDistanceKm),
        minDurationMinutes: rule.minDurationMinutes,
        maxDurationMinutes: rule.maxDurationMinutes,
        taxFreeAmount: decToNumReq(rule.taxFreeAmount),
        taxableAmount: decToNumReq(rule.taxableAmount),
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
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
      const tenantId = ctx.tenantId!

      // Validate ruleSetId FK
      const ruleSet = await ctx.prisma.travelAllowanceRuleSet.findFirst({
        where: { id: input.ruleSetId, tenantId },
      })
      if (!ruleSet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Rule set not found",
        })
      }

      const rule = await ctx.prisma.localTravelRule.create({
        data: {
          tenantId,
          ruleSetId: input.ruleSetId,
          minDistanceKm: input.minDistanceKm ?? 0,
          maxDistanceKm: input.maxDistanceKm ?? null,
          minDurationMinutes: input.minDurationMinutes ?? 0,
          maxDurationMinutes: input.maxDurationMinutes ?? null,
          taxFreeAmount: input.taxFreeAmount ?? 0,
          taxableAmount: input.taxableAmount ?? 0,
          isActive: true,
          sortOrder: input.sortOrder ?? 0,
        },
      })

      return {
        id: rule.id,
        tenantId: rule.tenantId,
        ruleSetId: rule.ruleSetId,
        minDistanceKm: decToNumReq(rule.minDistanceKm),
        maxDistanceKm: decToNum(rule.maxDistanceKm),
        minDurationMinutes: rule.minDurationMinutes,
        maxDurationMinutes: rule.maxDurationMinutes,
        taxFreeAmount: decToNumReq(rule.taxFreeAmount),
        taxableAmount: decToNumReq(rule.taxableAmount),
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
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
      const tenantId = ctx.tenantId!

      // Verify rule exists (tenant-scoped)
      const existing = await ctx.prisma.localTravelRule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Local travel rule not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.minDistanceKm !== undefined) {
        data.minDistanceKm = input.minDistanceKm
      }

      if (input.maxDistanceKm !== undefined) {
        data.maxDistanceKm = input.maxDistanceKm
      }

      if (input.minDurationMinutes !== undefined) {
        data.minDurationMinutes = input.minDurationMinutes
      }

      if (input.maxDurationMinutes !== undefined) {
        data.maxDurationMinutes = input.maxDurationMinutes
      }

      if (input.taxFreeAmount !== undefined) {
        data.taxFreeAmount = input.taxFreeAmount
      }

      if (input.taxableAmount !== undefined) {
        data.taxableAmount = input.taxableAmount
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      const rule = await ctx.prisma.localTravelRule.update({
        where: { id: input.id },
        data,
      })

      return {
        id: rule.id,
        tenantId: rule.tenantId,
        ruleSetId: rule.ruleSetId,
        minDistanceKm: decToNumReq(rule.minDistanceKm),
        maxDistanceKm: decToNum(rule.maxDistanceKm),
        minDurationMinutes: rule.minDurationMinutes,
        maxDurationMinutes: rule.maxDurationMinutes,
        taxFreeAmount: decToNumReq(rule.taxFreeAmount),
        taxableAmount: decToNumReq(rule.taxableAmount),
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      }
    }),

  /**
   * localTravelRules.delete -- Deletes a local travel rule.
   *
   * Requires: travel_allowance.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify rule exists (tenant-scoped)
      const existing = await ctx.prisma.localTravelRule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Local travel rule not found",
        })
      }

      await ctx.prisma.localTravelRule.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
