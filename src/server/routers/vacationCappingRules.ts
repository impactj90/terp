/**
 * Vacation Capping Rules Router
 *
 * Provides CRUD operations for vacation capping rules (Kappungsregeln)
 * via tRPC procedures.
 *
 * Replaces the Go backend endpoints:
 * - GET /vacation-capping-rules -> vacationCappingRules.list
 * - GET /vacation-capping-rules/{id} -> vacationCappingRules.getById
 * - POST /vacation-capping-rules -> vacationCappingRules.create
 * - PATCH /vacation-capping-rules/{id} -> vacationCappingRules.update
 * - DELETE /vacation-capping-rules/{id} -> vacationCappingRules.delete
 *
 * @see apps/api/internal/service/vacationcappingrule.go
 */
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// --- Enum Constants ---

const CAPPING_RULE_TYPES = ["year_end", "mid_year"] as const

// --- Output Schemas ---

const vacationCappingRuleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  ruleType: z.string(),
  cutoffMonth: z.number(),
  cutoffDay: z.number(),
  capValue: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type VacationCappingRuleOutput = z.infer<typeof vacationCappingRuleOutputSchema>

// --- Input Schemas ---

const createVacationCappingRuleInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  ruleType: z.enum(CAPPING_RULE_TYPES),
  cutoffMonth: z.number().int().min(1).max(12).optional().default(12),
  cutoffDay: z.number().int().min(1).max(31).optional().default(31),
  capValue: z
    .number()
    .min(0, "Cap value must not be negative")
    .optional()
    .default(0),
  isActive: z.boolean().optional().default(true),
})

const updateVacationCappingRuleInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  ruleType: z.enum(CAPPING_RULE_TYPES).optional(),
  cutoffMonth: z.number().int().min(1).max(12).optional(),
  cutoffDay: z.number().int().min(1).max(31).optional(),
  capValue: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number | null {
  if (val === null || val === undefined) return null
  return Number(val)
}

function mapToOutput(r: Record<string, unknown>): VacationCappingRuleOutput {
  return {
    id: r.id as string,
    tenantId: r.tenantId as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    ruleType: r.ruleType as string,
    cutoffMonth: r.cutoffMonth as number,
    cutoffDay: r.cutoffDay as number,
    capValue: decimalToNumber(r.capValue as Prisma.Decimal) ?? 0,
    isActive: r.isActive as boolean,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  }
}

// --- Router ---

export const vacationCappingRulesRouter = createTRPCRouter({
  /**
   * vacationCappingRules.list -- Returns capping rules for the current tenant.
   *
   * Supports optional filters: isActive, ruleType.
   * Orders by code ASC.
   *
   * Requires: vacation_config.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
          ruleType: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(vacationCappingRuleOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      if (input?.ruleType !== undefined) {
        where.ruleType = input.ruleType
      }

      const items = await ctx.prisma.vacationCappingRule.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: items.map((item) =>
          mapToOutput(item as unknown as Record<string, unknown>)
        ),
      }
    }),

  /**
   * vacationCappingRules.getById -- Returns a single capping rule by ID.
   *
   * Requires: vacation_config.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(vacationCappingRuleOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const item = await ctx.prisma.vacationCappingRule.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation capping rule not found",
        })
      }

      return mapToOutput(item as unknown as Record<string, unknown>)
    }),

  /**
   * vacationCappingRules.create -- Creates a new capping rule.
   *
   * Validates code uniqueness.
   *
   * Requires: vacation_config.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(createVacationCappingRuleInputSchema)
    .output(vacationCappingRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Name is required",
        })
      }

      // Check code uniqueness
      const existingByCode = await ctx.prisma.vacationCappingRule.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Capping rule code already exists",
        })
      }

      const description = input.description?.trim() || null

      const created = await ctx.prisma.vacationCappingRule.create({
        data: {
          tenantId,
          code,
          name,
          description,
          ruleType: input.ruleType,
          cutoffMonth: input.cutoffMonth,
          cutoffDay: input.cutoffDay,
          capValue: new Prisma.Decimal(input.capValue),
          isActive: input.isActive,
        },
      })

      return mapToOutput(created as unknown as Record<string, unknown>)
    }),

  /**
   * vacationCappingRules.update -- Updates an existing capping rule.
   *
   * Supports partial updates.
   *
   * Requires: vacation_config.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(updateVacationCappingRuleInputSchema)
    .output(vacationCappingRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const existing = await ctx.prisma.vacationCappingRule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation capping rule not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Name is required",
          })
        }
        data.name = name
      }

      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }
      if (input.ruleType !== undefined) data.ruleType = input.ruleType
      if (input.cutoffMonth !== undefined) data.cutoffMonth = input.cutoffMonth
      if (input.cutoffDay !== undefined) data.cutoffDay = input.cutoffDay
      if (input.capValue !== undefined)
        data.capValue = new Prisma.Decimal(input.capValue)
      if (input.isActive !== undefined) data.isActive = input.isActive

      const updated = await ctx.prisma.vacationCappingRule.update({
        where: { id: input.id },
        data,
      })

      return mapToOutput(updated as unknown as Record<string, unknown>)
    }),

  /**
   * vacationCappingRules.delete -- Deletes a capping rule.
   *
   * Checks usage in capping rule group junction table before deletion.
   *
   * Requires: vacation_config.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const existing = await ctx.prisma.vacationCappingRule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation capping rule not found",
        })
      }

      // Check usage in capping rule groups
      const usageCount =
        await ctx.prisma.vacationCappingRuleGroupRule.count({
          where: { cappingRuleId: input.id },
        })
      if (usageCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete capping rule that is assigned to capping rule groups",
        })
      }

      await ctx.prisma.vacationCappingRule.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
