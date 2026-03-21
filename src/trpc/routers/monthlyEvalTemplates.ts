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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as monthlyEvalTemplateService from "@/lib/services/monthly-eval-template-service"

// --- Permission Constants ---

const MONTHLY_EVAL_MANAGE = permissionIdByKey("monthly_evaluations.manage")!

// --- Output Schema ---

const templateOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
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
  id: z.string(),
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
      try {
        const templates = await monthlyEvalTemplateService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ? { isActive: input.isActive } : undefined
        )
        return { data: templates.map(mapTemplate) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * monthlyEvalTemplates.getById -- Returns a single template by ID.
   *
   * Requires: monthly_evaluations.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(MONTHLY_EVAL_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(templateOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const template = await monthlyEvalTemplateService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapTemplate(template)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const template = await monthlyEvalTemplateService.getDefault(
          ctx.prisma,
          ctx.tenantId!
        )
        return mapTemplate(template)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const template = await monthlyEvalTemplateService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapTemplate(template)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const template = await monthlyEvalTemplateService.update(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapTemplate(template)
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await monthlyEvalTemplateService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ id: z.string() }))
    .output(templateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const template = await monthlyEvalTemplateService.setDefault(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapTemplate(template)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
