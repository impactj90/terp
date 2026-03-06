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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!

// --- Output Schemas ---

const absenceTypeOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
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
  absenceTypeGroupId: z.string().uuid().nullable(),
  calculationRuleId: z.string().uuid().nullable(),
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
  absenceTypeGroupId: z.string().uuid().optional(),
  calculationRuleId: z.string().uuid().optional(),
})

const updateAbsenceTypeInputSchema = z.object({
  id: z.string().uuid(),
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
  absenceTypeGroupId: z.string().uuid().nullable().optional(),
  calculationRuleId: z.string().uuid().nullable().optional(),
})

// --- Helpers ---

/**
 * Code prefix validation per category.
 * U = vacation/unpaid, K = illness, S = special
 */
const CATEGORY_CODE_PREFIX: Record<string, string> = {
  vacation: "U",
  unpaid: "U",
  illness: "K",
  special: "S",
}

function validateCodePrefix(code: string, category: string): boolean {
  const requiredPrefix = CATEGORY_CODE_PREFIX[category]
  if (!requiredPrefix) return true
  return code.toUpperCase().startsWith(requiredPrefix)
}

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
   * Requires: absence_types.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
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
      const tenantId = ctx.tenantId!

      // Build the where clause -- include tenant types and system types (tenantId = null)
      const where: Record<string, unknown> = {
        OR: [{ tenantId }, { tenantId: null }],
      }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      if (input?.category !== undefined) {
        where.category = input.category
      }

      // If includeSystem is explicitly false, exclude system types
      if (input?.includeSystem === false) {
        where.isSystem = false
      }

      const types = await ctx.prisma.absenceType.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: types.map(mapToOutput),
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
    .input(z.object({ id: z.string().uuid() }))
    .output(absenceTypeOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const type = await ctx.prisma.absenceType.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId }, { tenantId: null }],
        },
      })

      if (!type) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence type not found",
        })
      }

      return mapToOutput(type)
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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Absence type code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Absence type name is required",
        })
      }

      // Validate code prefix matches category
      if (!validateCodePrefix(code, input.category)) {
        const expectedPrefix = CATEGORY_CODE_PREFIX[input.category] ?? ""
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Code must start with '${expectedPrefix}' for category '${input.category}'`,
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.absenceType.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Absence type code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create type -- always isSystem: false, isActive: true
      const type = await ctx.prisma.absenceType.create({
        data: {
          tenantId,
          code,
          name,
          description,
          category: input.category,
          portion: input.portion,
          holidayCode: input.holidayCode || null,
          priority: input.priority,
          deductsVacation: input.deductsVacation,
          requiresApproval: input.requiresApproval,
          requiresDocument: input.requiresDocument,
          color: input.color,
          sortOrder: input.sortOrder,
          isSystem: false,
          isActive: true,
          absenceTypeGroupId: input.absenceTypeGroupId || undefined,
          calculationRuleId: input.calculationRuleId || undefined,
        },
      })

      return mapToOutput(type)
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
      const tenantId = ctx.tenantId!

      // Verify type exists (tenant-scoped)
      const existing = await ctx.prisma.absenceType.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId }, { tenantId: null }],
        },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence type not found",
        })
      }

      // Block modification of system types
      if (existing.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot modify system absence type",
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
            message: "Absence type name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle category update
      if (input.category !== undefined) {
        // Validate code prefix matches new category
        if (!validateCodePrefix(existing.code, input.category)) {
          const expectedPrefix = CATEGORY_CODE_PREFIX[input.category] ?? ""
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Code '${existing.code}' does not match prefix '${expectedPrefix}' for category '${input.category}'`,
          })
        }
        data.category = input.category
      }

      // Handle simple field updates
      if (input.portion !== undefined) data.portion = input.portion
      if (input.priority !== undefined) data.priority = input.priority
      if (input.deductsVacation !== undefined)
        data.deductsVacation = input.deductsVacation
      if (input.requiresApproval !== undefined)
        data.requiresApproval = input.requiresApproval
      if (input.requiresDocument !== undefined)
        data.requiresDocument = input.requiresDocument
      if (input.color !== undefined) data.color = input.color
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
      if (input.isActive !== undefined) data.isActive = input.isActive

      // Handle nullable FK updates
      if (input.holidayCode !== undefined) data.holidayCode = input.holidayCode
      if (input.absenceTypeGroupId !== undefined)
        data.absenceTypeGroupId = input.absenceTypeGroupId
      if (input.calculationRuleId !== undefined)
        data.calculationRuleId = input.calculationRuleId

      const type = await ctx.prisma.absenceType.update({
        where: { id: input.id },
        data,
      })

      return mapToOutput(type)
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify type exists (tenant-scoped)
      const existing = await ctx.prisma.absenceType.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId }, { tenantId: null }],
        },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence type not found",
        })
      }

      // Block deletion of system types
      if (existing.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete system absence type",
        })
      }

      // Check usage in absence_days table via raw SQL
      const result = await ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
        `SELECT COUNT(*)::int as count FROM absence_days WHERE absence_type_id = $1`,
        input.id
      )
      if (result[0] && result[0].count > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete absence type that is in use by absence days",
        })
      }

      // Hard delete
      await ctx.prisma.absenceType.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
