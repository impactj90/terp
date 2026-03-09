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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as travelAllowanceRuleSetService from "@/lib/services/travel-allowance-rule-set-service"

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

// --- Helpers ---

function mapRuleSet(rs: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  validFrom: Date | null
  validTo: Date | null
  calculationBasis: string
  distanceRule: string
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}) {
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
}

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
      try {
        const ruleSets = await travelAllowanceRuleSetService.list(
          ctx.prisma,
          ctx.tenantId!
        )
        return { data: ruleSets.map(mapRuleSet) }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const rs = await travelAllowanceRuleSetService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapRuleSet(rs)
      } catch (err) {
        handleServiceError(err)
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
      try {
        const rs = await travelAllowanceRuleSetService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapRuleSet(rs)
      } catch (err) {
        handleServiceError(err)
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
      try {
        const rs = await travelAllowanceRuleSetService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapRuleSet(rs)
      } catch (err) {
        handleServiceError(err)
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
      try {
        await travelAllowanceRuleSetService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
