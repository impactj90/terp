/**
 * Monthly Evaluation Templates Router
 *
 * Provides CRUD operations + default management for monthly evaluation templates
 * via tRPC procedures.
 *
 * Replaces the Go backend monthly evaluation endpoints:
 * - GET    /monthly-evaluations           -> monthlyEvalTemplates.list
 * - GET    /monthly-evaluations/{id}      -> monthlyEvalTemplates.getById
 * - GET    /monthly-evaluations/default   -> monthlyEvalTemplates.getDefault
 * - POST   /monthly-evaluations           -> monthlyEvalTemplates.create
 * - PUT    /monthly-evaluations/{id}      -> monthlyEvalTemplates.update
 * - DELETE /monthly-evaluations/{id}      -> monthlyEvalTemplates.delete
 * - POST   /monthly-evaluations/{id}/set-default -> monthlyEvalTemplates.setDefault
 *
 * @see apps/api/internal/service/monthly_evaluation_template.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const MONTHLY_EVAL_MANAGE = permissionIdByKey("monthly_evaluations.manage")!

// --- Output Schema ---

const templateOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  flextimeCapPositive: z.number(),
  flextimeCapNegative: z.number(),
  overtimeThreshold: z.number(),
  maxCarryoverVacation: z.number(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(1000).optional(),
  flextimeCapPositive: z.number().int().min(0).optional(),
  flextimeCapNegative: z.number().int().min(0).optional(),
  overtimeThreshold: z.number().int().min(0).optional(),
  maxCarryoverVacation: z.number().min(0).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const updateInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  flextimeCapPositive: z.number().int().min(0).optional(),
  flextimeCapNegative: z.number().int().min(0).optional(),
  overtimeThreshold: z.number().int().min(0).optional(),
  maxCarryoverVacation: z.number().min(0).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// --- Helper: Convert Prisma Decimal to number ---

function mapTemplate(template: {
  id: string
  tenantId: string
  name: string
  description: string
  flextimeCapPositive: number
  flextimeCapNegative: number
  overtimeThreshold: number
  maxCarryoverVacation: unknown
  isDefault: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    ...template,
    maxCarryoverVacation: Number(template.maxCarryoverVacation),
  }
}

// --- Router ---

export const monthlyEvalTemplatesRouter = createTRPCRouter({
  /**
   * monthlyEvalTemplates.list -- Returns monthly evaluation templates for the current tenant.
   *
   * Supports optional isActive filter.
   * Orders by name ASC.
   *
   * Requires: monthly_evaluations.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(MONTHLY_EVAL_MANAGE))
    .input(z.object({ isActive: z.boolean().optional() }).optional())
    .output(z.object({ data: z.array(templateOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }
      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const templates = await ctx.prisma.monthlyEvaluationTemplate.findMany({
        where,
        orderBy: { name: "asc" },
      })

      return { data: templates.map(mapTemplate) }
    }),

  /**
   * monthlyEvalTemplates.getById -- Returns a single template by ID.
   *
   * Requires: monthly_evaluations.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(MONTHLY_EVAL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(templateOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const template = await ctx.prisma.monthlyEvaluationTemplate.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Monthly evaluation template not found",
        })
      }

      return mapTemplate(template)
    }),

  /**
   * monthlyEvalTemplates.getDefault -- Returns the default template for the tenant.
   *
   * Requires: monthly_evaluations.manage permission
   */
  getDefault: tenantProcedure
    .use(requirePermission(MONTHLY_EVAL_MANAGE))
    .input(z.void())
    .output(templateOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId!

      const template = await ctx.prisma.monthlyEvaluationTemplate.findFirst({
        where: { tenantId, isDefault: true },
      })

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No default monthly evaluation template found",
        })
      }

      return mapTemplate(template)
    }),

  /**
   * monthlyEvalTemplates.create -- Creates a new monthly evaluation template.
   *
   * If isDefault is true, clears existing defaults atomically.
   *
   * Requires: monthly_evaluations.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(MONTHLY_EVAL_MANAGE))
    .input(createInputSchema)
    .output(templateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Template name is required",
        })
      }

      const data = {
        tenantId,
        name,
        description: input.description?.trim() ?? "",
        flextimeCapPositive: input.flextimeCapPositive ?? 0,
        flextimeCapNegative: input.flextimeCapNegative ?? 0,
        overtimeThreshold: input.overtimeThreshold ?? 0,
        maxCarryoverVacation: input.maxCarryoverVacation ?? 0,
        isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true,
      }

      if (data.isDefault) {
        // Use transaction to clear existing defaults and create new
        const template = await ctx.prisma.$transaction(async (tx) => {
          await tx.monthlyEvaluationTemplate.updateMany({
            where: { tenantId, isDefault: true },
            data: { isDefault: false },
          })
          return tx.monthlyEvaluationTemplate.create({ data })
        })
        return mapTemplate(template)
      }

      const template = await ctx.prisma.monthlyEvaluationTemplate.create({
        data,
      })
      return mapTemplate(template)
    }),

  /**
   * monthlyEvalTemplates.update -- Updates an existing monthly evaluation template.
   *
   * Supports partial updates. If isDefault is set to true, clears existing defaults.
   *
   * Requires: monthly_evaluations.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(MONTHLY_EVAL_MANAGE))
    .input(updateInputSchema)
    .output(templateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify exists with tenant scope
      const existing = await ctx.prisma.monthlyEvaluationTemplate.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Monthly evaluation template not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Template name is required",
          })
        }
        data.name = name
      }

      if (input.description !== undefined) {
        data.description = input.description.trim()
      }
      if (input.flextimeCapPositive !== undefined) {
        data.flextimeCapPositive = input.flextimeCapPositive
      }
      if (input.flextimeCapNegative !== undefined) {
        data.flextimeCapNegative = input.flextimeCapNegative
      }
      if (input.overtimeThreshold !== undefined) {
        data.overtimeThreshold = input.overtimeThreshold
      }
      if (input.maxCarryoverVacation !== undefined) {
        data.maxCarryoverVacation = input.maxCarryoverVacation
      }
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }
      if (input.isDefault !== undefined) {
        data.isDefault = input.isDefault
      }

      if (input.isDefault === true) {
        // Use transaction to clear existing defaults and update
        const template = await ctx.prisma.$transaction(async (tx) => {
          await tx.monthlyEvaluationTemplate.updateMany({
            where: { tenantId, isDefault: true },
            data: { isDefault: false },
          })
          return tx.monthlyEvaluationTemplate.update({
            where: { id: input.id },
            data,
          })
        })
        return mapTemplate(template)
      }

      const template = await ctx.prisma.monthlyEvaluationTemplate.update({
        where: { id: input.id },
        data,
      })
      return mapTemplate(template)
    }),

  /**
   * monthlyEvalTemplates.delete -- Deletes a monthly evaluation template.
   *
   * Cannot delete the default template.
   *
   * Requires: monthly_evaluations.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(MONTHLY_EVAL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const existing = await ctx.prisma.monthlyEvaluationTemplate.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Monthly evaluation template not found",
        })
      }

      if (existing.isDefault) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete default evaluation template",
        })
      }

      await ctx.prisma.monthlyEvaluationTemplate.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  /**
   * monthlyEvalTemplates.setDefault -- Sets a template as the default.
   *
   * Atomically clears existing defaults and sets the new one.
   *
   * Requires: monthly_evaluations.manage permission
   */
  setDefault: tenantProcedure
    .use(requirePermission(MONTHLY_EVAL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(templateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify exists with tenant scope
      const existing = await ctx.prisma.monthlyEvaluationTemplate.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Monthly evaluation template not found",
        })
      }

      const template = await ctx.prisma.$transaction(async (tx) => {
        await tx.monthlyEvaluationTemplate.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        })
        return tx.monthlyEvaluationTemplate.update({
          where: { id: input.id },
          data: { isDefault: true },
        })
      })

      return mapTemplate(template)
    }),
})
