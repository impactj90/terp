/**
 * Absence Type Groups Router
 *
 * Provides absence type group CRUD operations via tRPC procedures.
 * Replaces the Go backend absence type group endpoints:
 * - GET /absence-type-groups -> absenceTypeGroups.list
 * - GET /absence-type-groups/{id} -> absenceTypeGroups.getById
 * - POST /absence-type-groups -> absenceTypeGroups.create
 * - PATCH /absence-type-groups/{id} -> absenceTypeGroups.update
 * - DELETE /absence-type-groups/{id} -> absenceTypeGroups.delete
 *
 * @see apps/api/internal/service/absencetypegroup.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!

// --- Output Schemas ---

const absenceTypeGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type AbsenceTypeGroupOutput = z.infer<typeof absenceTypeGroupOutputSchema>

// --- Input Schemas ---

const createAbsenceTypeGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
})

const updateAbsenceTypeGroupInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma AbsenceTypeGroup record to the output schema shape.
 */
function mapToOutput(a: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): AbsenceTypeGroupOutput {
  return {
    id: a.id,
    tenantId: a.tenantId,
    code: a.code,
    name: a.name,
    description: a.description,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

// --- Router ---

export const absenceTypeGroupsRouter = createTRPCRouter({
  /**
   * absenceTypeGroups.list -- Returns absence type groups for the current tenant.
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
    .output(z.object({ data: z.array(absenceTypeGroupOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const groups = await ctx.prisma.absenceTypeGroup.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: groups.map(mapToOutput),
      }
    }),

  /**
   * absenceTypeGroups.getById -- Returns a single absence type group by ID.
   *
   * Tenant-scoped: only returns groups belonging to the current tenant.
   *
   * Requires: absence_types.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(absenceTypeGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const group = await ctx.prisma.absenceTypeGroup.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!group) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence type group not found",
        })
      }

      return mapToOutput(group)
    }),

  /**
   * absenceTypeGroups.create -- Creates a new absence type group.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * Always sets isActive to true.
   *
   * Requires: absence_types.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(createAbsenceTypeGroupInputSchema)
    .output(absenceTypeGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Absence type group code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Absence type group name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.absenceTypeGroup.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Absence type group code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create group -- always isActive: true
      const group = await ctx.prisma.absenceTypeGroup.create({
        data: {
          tenantId,
          code,
          name,
          description,
          isActive: true,
        },
      })

      return mapToOutput(group)
    }),

  /**
   * absenceTypeGroups.update -- Updates an existing absence type group.
   *
   * Supports partial updates. Code uniqueness check only when code actually
   * changes (matching Go logic).
   *
   * Requires: absence_types.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(updateAbsenceTypeGroupInputSchema)
    .output(absenceTypeGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify group exists (tenant-scoped)
      const existing = await ctx.prisma.absenceTypeGroup.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence type group not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle code update
      if (input.code !== undefined) {
        const code = input.code.trim()
        if (code.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Absence type group code is required",
          })
        }
        // Check uniqueness only if code actually changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.absenceTypeGroup.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Absence type group code already exists",
            })
          }
        }
        data.code = code
      }

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Absence type group name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const group = await ctx.prisma.absenceTypeGroup.update({
        where: { id: input.id },
        data,
      })

      return mapToOutput(group)
    }),

  /**
   * absenceTypeGroups.delete -- Deletes an absence type group.
   *
   * Requires: absence_types.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify group exists (tenant-scoped)
      const existing = await ctx.prisma.absenceTypeGroup.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Absence type group not found",
        })
      }

      // Hard delete
      await ctx.prisma.absenceTypeGroup.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
