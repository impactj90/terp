/**
 * Calculation Rules Router
 *
 * Provides calculation rule CRUD operations via tRPC procedures.
 * Replaces the Go backend calculation rule endpoints:
 * - GET /calculation-rules -> calculationRules.list
 * - GET /calculation-rules/{id} -> calculationRules.getById
 * - POST /calculation-rules -> calculationRules.create
 * - PATCH /calculation-rules/{id} -> calculationRules.update
 * - DELETE /calculation-rules/{id} -> calculationRules.delete
 *
 * @see apps/api/internal/service/calculationrule.go
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as calculationRuleService from "@/lib/services/calculation-rule-service"

// --- Permission Constants ---

const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!

// --- Output Schemas ---

const calculationRuleOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  accountId: z.string().nullable(),
  value: z.number(),
  factor: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type CalculationRuleOutput = z.infer<typeof calculationRuleOutputSchema>

// --- Input Schemas ---

const createCalculationRuleInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  accountId: z.string().optional(),
  value: z.number().optional(),
  factor: z.number().optional(),
})

const updateCalculationRuleInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  value: z.number().optional(),
  factor: z.number().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma CalculationRule record to the output schema shape.
 * Converts Prisma Decimal to number for the factor field.
 */
function mapToOutput(r: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  accountId: string | null
  value: number
  factor: Prisma.Decimal
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): CalculationRuleOutput {
  return {
    id: r.id,
    tenantId: r.tenantId,
    code: r.code,
    name: r.name,
    description: r.description,
    accountId: r.accountId,
    value: r.value,
    factor: Number(r.factor),
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

// --- Router ---

export const calculationRulesRouter = createTRPCRouter({
  /**
   * calculationRules.list -- Returns calculation rules for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC.
   *
   * Requires: absence_types.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(calculationRuleOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const rules = await calculationRuleService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ? { isActive: input.isActive } : undefined
        )
        return { data: rules.map(mapToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * calculationRules.getById -- Returns a single calculation rule by ID.
   *
   * Tenant-scoped: only returns rules belonging to the current tenant.
   *
   * Requires: absence_types.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(calculationRuleOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const rule = await calculationRuleService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapToOutput(rule)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * calculationRules.create -- Creates a new calculation rule.
   *
   * Validates code and name are non-empty after trimming.
   * Validates value >= 0, factor > 0 (defaults to 1.0 if 0).
   * Checks code uniqueness within tenant.
   * Always sets isActive to true.
   *
   * Requires: absence_types.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(createCalculationRuleInputSchema)
    .output(calculationRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const rule = await calculationRuleService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapToOutput(rule)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * calculationRules.update -- Updates an existing calculation rule.
   *
   * Supports partial updates: name, description, accountId (nullable),
   * value (>= 0), factor (> 0), isActive.
   * No code update per Go behavior.
   *
   * Requires: absence_types.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(updateCalculationRuleInputSchema)
    .output(calculationRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const rule = await calculationRuleService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapToOutput(rule)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * calculationRules.delete -- Deletes a calculation rule.
   *
   * Checks usage in absence_types table before deletion.
   * Uses raw SQL since AbsenceType is not yet in Prisma.
   *
   * Requires: absence_types.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await calculationRuleService.remove(
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
