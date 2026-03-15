/**
 * Cost Centers Router
 *
 * Provides cost center CRUD operations via tRPC procedures.
 * Replaces the Go backend cost center endpoints:
 * - GET /cost-centers -> costCenters.list
 * - GET /cost-centers/{id} -> costCenters.getById
 * - POST /cost-centers -> costCenters.create
 * - PATCH /cost-centers/{id} -> costCenters.update
 * - DELETE /cost-centers/{id} -> costCenters.delete
 *
 * @see apps/api/internal/service/costcenter.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as costCenterService from "@/lib/services/cost-center-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!

// --- Output Schemas ---

const costCenterOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type CostCenterOutput = z.infer<typeof costCenterOutputSchema>

// --- Input Schemas ---

const createCostCenterInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
})

const updateCostCenterInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma CostCenter record to the output schema shape.
 */
function mapCostCenterToOutput(cc: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): CostCenterOutput {
  return {
    id: cc.id,
    tenantId: cc.tenantId,
    code: cc.code,
    name: cc.name,
    description: cc.description,
    isActive: cc.isActive,
    createdAt: cc.createdAt,
    updatedAt: cc.updatedAt,
  }
}

// --- Router ---

export const costCentersRouter = createTRPCRouter({
  /**
   * costCenters.list -- Returns cost centers for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC.
   *
   * Requires: departments.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(costCenterOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const costCenters = await costCenterService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return {
          data: costCenters.map(mapCostCenterToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * costCenters.getById -- Returns a single cost center by ID.
   *
   * Tenant-scoped: only returns cost centers belonging to the current tenant.
   *
   * Requires: departments.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(costCenterOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const costCenter = await costCenterService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return mapCostCenterToOutput(costCenter)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * costCenters.create -- Creates a new cost center.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   *
   * Requires: departments.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(createCostCenterInputSchema)
    .output(costCenterOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const costCenter = await costCenterService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return mapCostCenterToOutput(costCenter)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * costCenters.update -- Updates an existing cost center.
   *
   * Supports partial updates. Validates code/name uniqueness when changed.
   *
   * Requires: departments.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(updateCostCenterInputSchema)
    .output(costCenterOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const costCenter = await costCenterService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return mapCostCenterToOutput(costCenter)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * costCenters.delete -- Deletes a cost center.
   *
   * Prevents deletion when employees are assigned.
   *
   * Requires: departments.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await costCenterService.remove(
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
