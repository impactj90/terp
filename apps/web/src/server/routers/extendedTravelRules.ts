/**
 * Extended Travel Rules Router
 *
 * Provides CRUD operations for extended travel rules via tRPC procedures.
 *
 * Replaces the Go backend extended travel rule endpoints:
 * - GET    /extended-travel-rules       -> extendedTravelRules.list
 * - GET    /extended-travel-rules/{id}  -> extendedTravelRules.getById
 * - POST   /extended-travel-rules       -> extendedTravelRules.create
 * - PATCH  /extended-travel-rules/{id}  -> extendedTravelRules.update
 * - DELETE /extended-travel-rules/{id}  -> extendedTravelRules.delete
 *
 * @see apps/api/internal/service/extended_travel_rule.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!

// --- Output Schemas ---

const extendedTravelRuleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  ruleSetId: z.string().uuid(),
  arrivalDayTaxFree: z.number(),
  arrivalDayTaxable: z.number(),
  departureDayTaxFree: z.number(),
  departureDayTaxable: z.number(),
  intermediateDayTaxFree: z.number(),
  intermediateDayTaxable: z.number(),
  threeMonthEnabled: z.boolean(),
  threeMonthTaxFree: z.number(),
  threeMonthTaxable: z.number(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createExtendedTravelRuleInputSchema = z.object({
  ruleSetId: z.string().uuid(),
  arrivalDayTaxFree: z.number().optional(),
  arrivalDayTaxable: z.number().optional(),
  departureDayTaxFree: z.number().optional(),
  departureDayTaxable: z.number().optional(),
  intermediateDayTaxFree: z.number().optional(),
  intermediateDayTaxable: z.number().optional(),
  threeMonthEnabled: z.boolean().optional(),
  threeMonthTaxFree: z.number().optional(),
  threeMonthTaxable: z.number().optional(),
  sortOrder: z.number().int().optional(),
})

const updateExtendedTravelRuleInputSchema = z.object({
  id: z.string().uuid(),
  // ruleSetId is NOT updatable
  arrivalDayTaxFree: z.number().optional(),
  arrivalDayTaxable: z.number().optional(),
  departureDayTaxFree: z.number().optional(),
  departureDayTaxable: z.number().optional(),
  intermediateDayTaxFree: z.number().optional(),
  intermediateDayTaxable: z.number().optional(),
  threeMonthEnabled: z.boolean().optional(),
  threeMonthTaxFree: z.number().optional(),
  threeMonthTaxable: z.number().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Helpers ---

/** Convert a Prisma Decimal to number */
function decToNumReq(val: unknown): number {
  return Number(val)
}

// --- Router ---

export const extendedTravelRulesRouter = createTRPCRouter({
  /**
   * extendedTravelRules.list -- Returns extended travel rules for the current tenant.
   *
   * Optionally filtered by ruleSetId.
   * Orders by sortOrder ASC.
   *
   * Requires: travel_allowance.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ ruleSetId: z.string().uuid().optional() }).optional())
    .output(z.object({ data: z.array(extendedTravelRuleOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }
      if (input?.ruleSetId) {
        where.ruleSetId = input.ruleSetId
      }

      const rules = await ctx.prisma.extendedTravelRule.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }],
      })

      return {
        data: rules.map((r) => ({
          id: r.id,
          tenantId: r.tenantId,
          ruleSetId: r.ruleSetId,
          arrivalDayTaxFree: decToNumReq(r.arrivalDayTaxFree),
          arrivalDayTaxable: decToNumReq(r.arrivalDayTaxable),
          departureDayTaxFree: decToNumReq(r.departureDayTaxFree),
          departureDayTaxable: decToNumReq(r.departureDayTaxable),
          intermediateDayTaxFree: decToNumReq(r.intermediateDayTaxFree),
          intermediateDayTaxable: decToNumReq(r.intermediateDayTaxable),
          threeMonthEnabled: r.threeMonthEnabled,
          threeMonthTaxFree: decToNumReq(r.threeMonthTaxFree),
          threeMonthTaxable: decToNumReq(r.threeMonthTaxable),
          isActive: r.isActive,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      }
    }),

  /**
   * extendedTravelRules.getById -- Returns a single extended travel rule by ID.
   *
   * Requires: travel_allowance.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(extendedTravelRuleOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const rule = await ctx.prisma.extendedTravelRule.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!rule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Extended travel rule not found",
        })
      }

      return {
        id: rule.id,
        tenantId: rule.tenantId,
        ruleSetId: rule.ruleSetId,
        arrivalDayTaxFree: decToNumReq(rule.arrivalDayTaxFree),
        arrivalDayTaxable: decToNumReq(rule.arrivalDayTaxable),
        departureDayTaxFree: decToNumReq(rule.departureDayTaxFree),
        departureDayTaxable: decToNumReq(rule.departureDayTaxable),
        intermediateDayTaxFree: decToNumReq(rule.intermediateDayTaxFree),
        intermediateDayTaxable: decToNumReq(rule.intermediateDayTaxable),
        threeMonthEnabled: rule.threeMonthEnabled,
        threeMonthTaxFree: decToNumReq(rule.threeMonthTaxFree),
        threeMonthTaxable: decToNumReq(rule.threeMonthTaxable),
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      }
    }),

  /**
   * extendedTravelRules.create -- Creates a new extended travel rule.
   *
   * Validates ruleSetId FK exists within tenant scope.
   *
   * Requires: travel_allowance.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(createExtendedTravelRuleInputSchema)
    .output(extendedTravelRuleOutputSchema)
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

      const rule = await ctx.prisma.extendedTravelRule.create({
        data: {
          tenantId,
          ruleSetId: input.ruleSetId,
          arrivalDayTaxFree: input.arrivalDayTaxFree ?? 0,
          arrivalDayTaxable: input.arrivalDayTaxable ?? 0,
          departureDayTaxFree: input.departureDayTaxFree ?? 0,
          departureDayTaxable: input.departureDayTaxable ?? 0,
          intermediateDayTaxFree: input.intermediateDayTaxFree ?? 0,
          intermediateDayTaxable: input.intermediateDayTaxable ?? 0,
          threeMonthEnabled: input.threeMonthEnabled ?? false,
          threeMonthTaxFree: input.threeMonthTaxFree ?? 0,
          threeMonthTaxable: input.threeMonthTaxable ?? 0,
          isActive: true,
          sortOrder: input.sortOrder ?? 0,
        },
      })

      return {
        id: rule.id,
        tenantId: rule.tenantId,
        ruleSetId: rule.ruleSetId,
        arrivalDayTaxFree: decToNumReq(rule.arrivalDayTaxFree),
        arrivalDayTaxable: decToNumReq(rule.arrivalDayTaxable),
        departureDayTaxFree: decToNumReq(rule.departureDayTaxFree),
        departureDayTaxable: decToNumReq(rule.departureDayTaxable),
        intermediateDayTaxFree: decToNumReq(rule.intermediateDayTaxFree),
        intermediateDayTaxable: decToNumReq(rule.intermediateDayTaxable),
        threeMonthEnabled: rule.threeMonthEnabled,
        threeMonthTaxFree: decToNumReq(rule.threeMonthTaxFree),
        threeMonthTaxable: decToNumReq(rule.threeMonthTaxable),
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      }
    }),

  /**
   * extendedTravelRules.update -- Updates an existing extended travel rule.
   *
   * Supports partial updates. RuleSetID is NOT updatable.
   *
   * Requires: travel_allowance.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(updateExtendedTravelRuleInputSchema)
    .output(extendedTravelRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify rule exists (tenant-scoped)
      const existing = await ctx.prisma.extendedTravelRule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Extended travel rule not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.arrivalDayTaxFree !== undefined) {
        data.arrivalDayTaxFree = input.arrivalDayTaxFree
      }

      if (input.arrivalDayTaxable !== undefined) {
        data.arrivalDayTaxable = input.arrivalDayTaxable
      }

      if (input.departureDayTaxFree !== undefined) {
        data.departureDayTaxFree = input.departureDayTaxFree
      }

      if (input.departureDayTaxable !== undefined) {
        data.departureDayTaxable = input.departureDayTaxable
      }

      if (input.intermediateDayTaxFree !== undefined) {
        data.intermediateDayTaxFree = input.intermediateDayTaxFree
      }

      if (input.intermediateDayTaxable !== undefined) {
        data.intermediateDayTaxable = input.intermediateDayTaxable
      }

      if (input.threeMonthEnabled !== undefined) {
        data.threeMonthEnabled = input.threeMonthEnabled
      }

      if (input.threeMonthTaxFree !== undefined) {
        data.threeMonthTaxFree = input.threeMonthTaxFree
      }

      if (input.threeMonthTaxable !== undefined) {
        data.threeMonthTaxable = input.threeMonthTaxable
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      const rule = await ctx.prisma.extendedTravelRule.update({
        where: { id: input.id },
        data,
      })

      return {
        id: rule.id,
        tenantId: rule.tenantId,
        ruleSetId: rule.ruleSetId,
        arrivalDayTaxFree: decToNumReq(rule.arrivalDayTaxFree),
        arrivalDayTaxable: decToNumReq(rule.arrivalDayTaxable),
        departureDayTaxFree: decToNumReq(rule.departureDayTaxFree),
        departureDayTaxable: decToNumReq(rule.departureDayTaxable),
        intermediateDayTaxFree: decToNumReq(rule.intermediateDayTaxFree),
        intermediateDayTaxable: decToNumReq(rule.intermediateDayTaxable),
        threeMonthEnabled: rule.threeMonthEnabled,
        threeMonthTaxFree: decToNumReq(rule.threeMonthTaxFree),
        threeMonthTaxable: decToNumReq(rule.threeMonthTaxable),
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      }
    }),

  /**
   * extendedTravelRules.delete -- Deletes an extended travel rule.
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
      const existing = await ctx.prisma.extendedTravelRule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Extended travel rule not found",
        })
      }

      await ctx.prisma.extendedTravelRule.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
