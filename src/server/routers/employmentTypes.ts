/**
 * Employment Types Router
 *
 * Provides employment type CRUD operations via tRPC procedures.
 * Replaces the Go backend employment type endpoints:
 * - GET /employment-types -> employmentTypes.list
 * - GET /employment-types/{id} -> employmentTypes.getById
 * - POST /employment-types -> employmentTypes.create
 * - PATCH /employment-types/{id} -> employmentTypes.update
 * - DELETE /employment-types/{id} -> employmentTypes.delete
 *
 * @see apps/api/internal/service/employmenttype.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const EMPLOYMENT_TYPES_MANAGE = permissionIdByKey("employment_types.manage")!

// --- Output Schemas ---

const employmentTypeOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  weeklyHoursDefault: z.number(),
  isActive: z.boolean(),
  vacationCalcGroupId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type EmploymentTypeOutput = z.infer<typeof employmentTypeOutputSchema>

// --- Input Schemas ---

const createEmploymentTypeInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  weeklyHoursDefault: z.number().optional(),
  isActive: z.boolean().optional(),
  vacationCalcGroupId: z.string().uuid().optional(),
})

const updateEmploymentTypeInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  weeklyHoursDefault: z.number().optional(),
  isActive: z.boolean().optional(),
  vacationCalcGroupId: z.string().uuid().optional(),
  clearVacationCalcGroupId: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma EmploymentType record to the output schema shape.
 * Converts Prisma Decimal to number for weeklyHoursDefault.
 */
function mapEmploymentTypeToOutput(et: {
  id: string
  tenantId: string | null
  code: string
  name: string
  weeklyHoursDefault: Prisma.Decimal | number
  isActive: boolean
  vacationCalcGroupId: string | null
  createdAt: Date
  updatedAt: Date
}): EmploymentTypeOutput {
  return {
    id: et.id,
    tenantId: et.tenantId,
    code: et.code,
    name: et.name,
    weeklyHoursDefault: Number(et.weeklyHoursDefault),
    isActive: et.isActive,
    vacationCalcGroupId: et.vacationCalcGroupId,
    createdAt: et.createdAt,
    updatedAt: et.updatedAt,
  }
}

// --- Router ---

export const employmentTypesRouter = createTRPCRouter({
  /**
   * employmentTypes.list -- Returns employment types for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC.
   *
   * Requires: employment_types.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(EMPLOYMENT_TYPES_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(employmentTypeOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const employmentTypes = await ctx.prisma.employmentType.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: employmentTypes.map(mapEmploymentTypeToOutput),
      }
    }),

  /**
   * employmentTypes.getById -- Returns a single employment type by ID.
   *
   * Tenant-scoped: only returns employment types belonging to the current tenant.
   *
   * Requires: employment_types.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(EMPLOYMENT_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(employmentTypeOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const employmentType = await ctx.prisma.employmentType.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!employmentType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employment type not found",
        })
      }

      return mapEmploymentTypeToOutput(employmentType)
    }),

  /**
   * employmentTypes.create -- Creates a new employment type.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   *
   * Requires: employment_types.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(EMPLOYMENT_TYPES_MANAGE))
    .input(createEmploymentTypeInputSchema)
    .output(employmentTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Employment type code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Employment type name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.employmentType.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Employment type code already exists",
        })
      }

      // Create employment type
      const employmentType = await ctx.prisma.employmentType.create({
        data: {
          tenantId,
          code,
          name,
          weeklyHoursDefault:
            input.weeklyHoursDefault !== undefined
              ? new Prisma.Decimal(input.weeklyHoursDefault)
              : new Prisma.Decimal(40.0),
          isActive: input.isActive ?? true,
          vacationCalcGroupId: input.vacationCalcGroupId ?? null,
        },
      })

      return mapEmploymentTypeToOutput(employmentType)
    }),

  /**
   * employmentTypes.update -- Updates an existing employment type.
   *
   * Supports partial updates. Validates code/name uniqueness when changed.
   * Use clearVacationCalcGroupId: true to explicitly null the vacationCalcGroupId.
   *
   * Requires: employment_types.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(EMPLOYMENT_TYPES_MANAGE))
    .input(updateEmploymentTypeInputSchema)
    .output(employmentTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify employment type exists (tenant-scoped)
      const existing = await ctx.prisma.employmentType.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employment type not found",
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
            message: "Employment type code is required",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.employmentType.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Employment type code already exists",
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
            message: "Employment type name is required",
          })
        }
        data.name = name
      }

      // Handle weeklyHoursDefault update
      if (input.weeklyHoursDefault !== undefined) {
        data.weeklyHoursDefault = new Prisma.Decimal(input.weeklyHoursDefault)
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      // Handle vacationCalcGroupId (clearVacationCalcGroupId takes priority)
      if (input.clearVacationCalcGroupId) {
        data.vacationCalcGroupId = null
      } else if (input.vacationCalcGroupId !== undefined) {
        data.vacationCalcGroupId = input.vacationCalcGroupId
      }

      const employmentType = await ctx.prisma.employmentType.update({
        where: { id: input.id },
        data,
      })

      return mapEmploymentTypeToOutput(employmentType)
    }),

  /**
   * employmentTypes.delete -- Deletes an employment type.
   *
   * Prevents deletion when employees are assigned.
   *
   * Requires: employment_types.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(EMPLOYMENT_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify employment type exists (tenant-scoped)
      const existing = await ctx.prisma.employmentType.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employment type not found",
        })
      }

      // Check for employees
      const employeeCount = await ctx.prisma.employee.count({
        where: { employmentTypeId: input.id },
      })
      if (employeeCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete employment type with assigned employees",
        })
      }

      // Hard delete
      await ctx.prisma.employmentType.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
