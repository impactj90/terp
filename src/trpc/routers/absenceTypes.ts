/**
 * Absence Types Router
 *
 * Provides absence type CRUD operations via tRPC procedures.
 * Replaces the Go backend absence type endpoints:
 * - GET /absence-types -> absenceTypes.list
 * - GET /absence-types/{id} -> absenceTypes.getById
 * - POST /absence-types -> absenceTypes.create
 * - PATCH /absence-types/{id} -> absenceTypes.update
 * - DELETE /absence-types/{id} -> absenceTypes.delete
 *
 * @see apps/api/internal/service/absencetype.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as absenceTypeService from "@/lib/services/absence-type-service"

// --- Permission Constants ---

const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!

// --- Output Schemas ---

const absenceTypeOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  portion: z.number(),
  holidayCode: z.string().nullable(),
  priority: z.number(),
  deductsVacation: z.boolean(),
  requiresApproval: z.boolean(),
  requiresDocument: z.boolean(),
  color: z.string(),
  sortOrder: z.number(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  absenceTypeGroupId: z.string().nullable(),
  calculationRuleId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type AbsenceTypeOutput = z.infer<typeof absenceTypeOutputSchema>

// --- Input Schemas ---

const createAbsenceTypeInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(10),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  category: z.enum(["vacation", "illness", "special", "unpaid"]),
  portion: z.number().int().min(0).max(2).optional().default(1),
  holidayCode: z.string().max(10).optional(),
  priority: z.number().int().optional().default(0),
  deductsVacation: z.boolean().optional().default(false),
  requiresApproval: z.boolean().optional().default(true),
  requiresDocument: z.boolean().optional().default(false),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .default("#808080"),
  sortOrder: z.number().int().optional().default(0),
  absenceTypeGroupId: z.string().optional(),
  calculationRuleId: z.string().optional(),
})

const updateAbsenceTypeInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  category: z.enum(["vacation", "illness", "special", "unpaid"]).optional(),
  portion: z.number().int().min(0).max(2).optional(),
  holidayCode: z.string().max(10).nullable().optional(),
  priority: z.number().int().optional(),
  deductsVacation: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  requiresDocument: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  absenceTypeGroupId: z.string().nullable().optional(),
  calculationRuleId: z.string().nullable().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma AbsenceType record to the output schema shape.
 */
function mapToOutput(a: {
  id: string
  tenantId: string | null
  code: string
  name: string
  description: string | null
  category: string
  portion: number
  holidayCode: string | null
  priority: number
  deductsVacation: boolean
  requiresApproval: boolean
  requiresDocument: boolean
  color: string
  sortOrder: number
  isSystem: boolean
  isActive: boolean
  absenceTypeGroupId: string | null
  calculationRuleId: string | null
  createdAt: Date
  updatedAt: Date
}): AbsenceTypeOutput {
  return {
    id: a.id,
    tenantId: a.tenantId,
    code: a.code,
    name: a.name,
    description: a.description,
    category: a.category,
    portion: a.portion,
    holidayCode: a.holidayCode,
    priority: a.priority,
    deductsVacation: a.deductsVacation,
    requiresApproval: a.requiresApproval,
    requiresDocument: a.requiresDocument,
    color: a.color,
    sortOrder: a.sortOrder,
    isSystem: a.isSystem,
    isActive: a.isActive,
    absenceTypeGroupId: a.absenceTypeGroupId,
    calculationRuleId: a.calculationRuleId,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

// --- Router ---

export const absenceTypesRouter = createTRPCRouter({
  /**
   * absenceTypes.list -- Returns absence types for the current tenant.
   *
   * Includes system types (tenantId = null) by default, matching Go behavior.
   * Supports optional filters: isActive, category, includeSystem.
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: authenticated tenant user (read-only)
   */
  list: tenantProcedure
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
          category: z.string().optional(),
          includeSystem: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(absenceTypeOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const types = await absenceTypeService.list(ctx.prisma, tenantId, {
          isActive: input?.isActive,
          category: input?.category,
          includeSystem: input?.includeSystem,
        })
        return { data: types.map(mapToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * absenceTypes.getById -- Returns a single absence type by ID.
   *
   * Tenant-scoped: returns types belonging to the current tenant or system types.
   *
   * Requires: absence_types.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(absenceTypeOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const type = await absenceTypeService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapToOutput(type)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * absenceTypes.create -- Creates a new absence type.
   *
   * Validates code and name are non-empty after trimming.
   * Validates code prefix matches category (U=vacation/unpaid, K=illness, S=special).
   * Checks code uniqueness within tenant.
   * Always forces isSystem to false for tenant-created types.
   *
   * Requires: absence_types.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(createAbsenceTypeInputSchema)
    .output(absenceTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const type = await absenceTypeService.create(
          ctx.prisma,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(type)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * absenceTypes.update -- Updates an existing absence type.
   *
   * Supports partial updates. Blocks modifications to system types.
   * Code is not updatable (immutable after creation).
   *
   * Requires: absence_types.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(updateAbsenceTypeInputSchema)
    .output(absenceTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const type = await absenceTypeService.update(
          ctx.prisma,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(type)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * absenceTypes.delete -- Deletes an absence type.
   *
   * Blocks deletion of system types.
   * Checks usage in absence_days table before deletion.
   *
   * Requires: absence_types.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await absenceTypeService.remove(ctx.prisma, tenantId, input.id, { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
