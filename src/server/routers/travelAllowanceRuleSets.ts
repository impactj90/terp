/**
 * Travel Allowance Rule Sets Router
 *
 * Provides CRUD operations for travel allowance rule sets via tRPC procedures.
 *
 * Replaces the Go backend travel allowance rule set endpoints:
 * - GET    /travel-allowance-rule-sets       -> travelAllowanceRuleSets.list
 * - GET    /travel-allowance-rule-sets/{id}  -> travelAllowanceRuleSets.getById
 * - POST   /travel-allowance-rule-sets       -> travelAllowanceRuleSets.create
 * - PATCH  /travel-allowance-rule-sets/{id}  -> travelAllowanceRuleSets.update
 * - DELETE /travel-allowance-rule-sets/{id}  -> travelAllowanceRuleSets.delete
 *
 * @see apps/api/internal/service/travel_allowance_rule_set.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!

// --- Output Schemas ---

const travelAllowanceRuleSetOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  calculationBasis: z.string(),
  distanceRule: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createRuleSetInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  calculationBasis: z.enum(["per_day", "per_booking"]).optional(),
  distanceRule: z.enum(["longest", "shortest", "first", "last"]).optional(),
  sortOrder: z.number().int().optional(),
})

const updateRuleSetInputSchema = z.object({
  id: z.string().uuid(),
  // Code is NOT updatable (immutable after creation)
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  calculationBasis: z.enum(["per_day", "per_booking"]).optional(),
  distanceRule: z.enum(["longest", "shortest", "first", "last"]).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Router ---

export const travelAllowanceRuleSetsRouter = createTRPCRouter({
  /**
   * travelAllowanceRuleSets.list -- Returns all rule sets for the current tenant.
   *
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: travel_allowance.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(travelAllowanceRuleSetOutputSchema) }))
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId!

      const ruleSets = await ctx.prisma.travelAllowanceRuleSet.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: ruleSets.map((rs) => ({
          id: rs.id,
          tenantId: rs.tenantId,
          code: rs.code,
          name: rs.name,
          description: rs.description,
          validFrom: rs.validFrom,
          validTo: rs.validTo,
          calculationBasis: rs.calculationBasis,
          distanceRule: rs.distanceRule,
          isActive: rs.isActive,
          sortOrder: rs.sortOrder,
          createdAt: rs.createdAt,
          updatedAt: rs.updatedAt,
        })),
      }
    }),

  /**
   * travelAllowanceRuleSets.getById -- Returns a single rule set by ID.
   *
   * Requires: travel_allowance.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(travelAllowanceRuleSetOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const rs = await ctx.prisma.travelAllowanceRuleSet.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!rs) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel allowance rule set not found",
        })
      }

      return {
        id: rs.id,
        tenantId: rs.tenantId,
        code: rs.code,
        name: rs.name,
        description: rs.description,
        validFrom: rs.validFrom,
        validTo: rs.validTo,
        calculationBasis: rs.calculationBasis,
        distanceRule: rs.distanceRule,
        isActive: rs.isActive,
        sortOrder: rs.sortOrder,
        createdAt: rs.createdAt,
        updatedAt: rs.updatedAt,
      }
    }),

  /**
   * travelAllowanceRuleSets.create -- Creates a new rule set.
   *
   * Validates code/name non-empty, code uniqueness per tenant.
   * Defaults: calculationBasis = "per_day", distanceRule = "longest",
   * isActive = true, sortOrder = 0.
   *
   * Requires: travel_allowance.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(createRuleSetInputSchema)
    .output(travelAllowanceRuleSetOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Rule set code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Rule set name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.travelAllowanceRuleSet.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Rule set code already exists",
        })
      }

      // Parse dates if provided
      const validFrom = input.validFrom
        ? new Date(input.validFrom + "T00:00:00.000Z")
        : null
      const validTo = input.validTo
        ? new Date(input.validTo + "T00:00:00.000Z")
        : null

      const rs = await ctx.prisma.travelAllowanceRuleSet.create({
        data: {
          tenantId,
          code,
          name,
          description: input.description?.trim() || null,
          validFrom,
          validTo,
          calculationBasis: input.calculationBasis ?? "per_day",
          distanceRule: input.distanceRule ?? "longest",
          isActive: true,
          sortOrder: input.sortOrder ?? 0,
        },
      })

      return {
        id: rs.id,
        tenantId: rs.tenantId,
        code: rs.code,
        name: rs.name,
        description: rs.description,
        validFrom: rs.validFrom,
        validTo: rs.validTo,
        calculationBasis: rs.calculationBasis,
        distanceRule: rs.distanceRule,
        isActive: rs.isActive,
        sortOrder: rs.sortOrder,
        createdAt: rs.createdAt,
        updatedAt: rs.updatedAt,
      }
    }),

  /**
   * travelAllowanceRuleSets.update -- Updates an existing rule set.
   *
   * Supports partial updates. Code is NOT updatable.
   *
   * Requires: travel_allowance.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(updateRuleSetInputSchema)
    .output(travelAllowanceRuleSetOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify rule set exists (tenant-scoped)
      const existing = await ctx.prisma.travelAllowanceRuleSet.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel allowance rule set not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Rule set name is required",
          })
        }
        data.name = name
      }

      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      if (input.validFrom !== undefined) {
        data.validFrom = input.validFrom
          ? new Date(input.validFrom + "T00:00:00.000Z")
          : null
      }

      if (input.validTo !== undefined) {
        data.validTo = input.validTo
          ? new Date(input.validTo + "T00:00:00.000Z")
          : null
      }

      if (input.calculationBasis !== undefined) {
        data.calculationBasis = input.calculationBasis
      }

      if (input.distanceRule !== undefined) {
        data.distanceRule = input.distanceRule
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      const rs = await ctx.prisma.travelAllowanceRuleSet.update({
        where: { id: input.id },
        data,
      })

      return {
        id: rs.id,
        tenantId: rs.tenantId,
        code: rs.code,
        name: rs.name,
        description: rs.description,
        validFrom: rs.validFrom,
        validTo: rs.validTo,
        calculationBasis: rs.calculationBasis,
        distanceRule: rs.distanceRule,
        isActive: rs.isActive,
        sortOrder: rs.sortOrder,
        createdAt: rs.createdAt,
        updatedAt: rs.updatedAt,
      }
    }),

  /**
   * travelAllowanceRuleSets.delete -- Deletes a rule set.
   *
   * Cascade will remove associated local and extended rules.
   *
   * Requires: travel_allowance.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(TRAVEL_ALLOWANCE_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify rule set exists (tenant-scoped)
      const existing = await ctx.prisma.travelAllowanceRuleSet.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel allowance rule set not found",
        })
      }

      await ctx.prisma.travelAllowanceRuleSet.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
