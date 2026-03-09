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
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!

// --- Output Schemas ---

const calculationRuleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  accountId: z.string().uuid().nullable(),
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
  accountId: z.string().uuid().optional(),
  value: z.number().optional(),
  factor: z.number().optional(),
})

const updateCalculationRuleInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
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
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const rules = await ctx.prisma.calculationRule.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: rules.map(mapToOutput),
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
    .input(z.object({ id: z.string().uuid() }))
    .output(calculationRuleOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const rule = await ctx.prisma.calculationRule.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!rule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calculation rule not found",
        })
      }

      return mapToOutput(rule)
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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Calculation rule code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Calculation rule name is required",
        })
      }

      // Validate value
      const value = input.value ?? 0
      if (value < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Value must be >= 0",
        })
      }

      // Validate factor -- default to 1.0 if 0, must be > 0
      let factor = input.factor ?? 1.0
      if (factor === 0) {
        factor = 1.0
      }
      if (factor < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Factor must be > 0",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.calculationRule.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Calculation rule code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create rule -- always isActive: true
      const rule = await ctx.prisma.calculationRule.create({
        data: {
          tenantId,
          code,
          name,
          description,
          accountId: input.accountId || undefined,
          value,
          factor: new Prisma.Decimal(factor),
          isActive: true,
        },
      })

      return mapToOutput(rule)
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
      const tenantId = ctx.tenantId!

      // Verify rule exists (tenant-scoped)
      const existing = await ctx.prisma.calculationRule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calculation rule not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Calculation rule name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle accountId update (nullable -- null clears it)
      if (input.accountId !== undefined) {
        data.accountId = input.accountId
      }

      // Handle value update
      if (input.value !== undefined) {
        if (input.value < 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Value must be >= 0",
          })
        }
        data.value = input.value
      }

      // Handle factor update
      if (input.factor !== undefined) {
        if (input.factor <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Factor must be > 0",
          })
        }
        data.factor = new Prisma.Decimal(input.factor)
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const rule = await ctx.prisma.calculationRule.update({
        where: { id: input.id },
        data,
      })

      return mapToOutput(rule)
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify rule exists (tenant-scoped)
      const existing = await ctx.prisma.calculationRule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calculation rule not found",
        })
      }

      // Check usage in absence_types table via raw SQL
      const result = await ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
        `SELECT COUNT(*)::int as count FROM absence_types WHERE calculation_rule_id = $1`,
        input.id
      )
      if (result[0] && result[0].count > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete calculation rule that is in use by absence types",
        })
      }

      // Hard delete
      await ctx.prisma.calculationRule.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
