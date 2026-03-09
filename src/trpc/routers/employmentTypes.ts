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
import { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as employmentTypeService from "@/lib/services/employment-type-service"
import type { PrismaClient } from "@/generated/prisma/client"

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
      try {
        const tenantId = ctx.tenantId!
        const employmentTypes = await employmentTypeService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return {
          data: employmentTypes.map(mapEmploymentTypeToOutput),
        }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const employmentType = await employmentTypeService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return mapEmploymentTypeToOutput(employmentType)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const employmentType = await employmentTypeService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return mapEmploymentTypeToOutput(employmentType)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const employmentType = await employmentTypeService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return mapEmploymentTypeToOutput(employmentType)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        await employmentTypeService.remove(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
