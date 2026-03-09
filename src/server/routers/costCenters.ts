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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const COST_CENTERS_MANAGE = permissionIdByKey("cost_centers.manage")!

// --- Output Schemas ---

const costCenterOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
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
  id: z.string().uuid(),
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
   * Requires: cost_centers.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(COST_CENTERS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(costCenterOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const costCenters = await ctx.prisma.costCenter.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: costCenters.map(mapCostCenterToOutput),
      }
    }),

  /**
   * costCenters.getById -- Returns a single cost center by ID.
   *
   * Tenant-scoped: only returns cost centers belonging to the current tenant.
   *
   * Requires: cost_centers.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(COST_CENTERS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(costCenterOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const costCenter = await ctx.prisma.costCenter.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!costCenter) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cost center not found",
        })
      }

      return mapCostCenterToOutput(costCenter)
    }),

  /**
   * costCenters.create -- Creates a new cost center.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   *
   * Requires: cost_centers.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(COST_CENTERS_MANAGE))
    .input(createCostCenterInputSchema)
    .output(costCenterOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cost center code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cost center name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.costCenter.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cost center code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create cost center
      const costCenter = await ctx.prisma.costCenter.create({
        data: {
          tenantId,
          code,
          name,
          description,
          isActive: input.isActive ?? true,
        },
      })

      return mapCostCenterToOutput(costCenter)
    }),

  /**
   * costCenters.update -- Updates an existing cost center.
   *
   * Supports partial updates. Validates code/name uniqueness when changed.
   *
   * Requires: cost_centers.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(COST_CENTERS_MANAGE))
    .input(updateCostCenterInputSchema)
    .output(costCenterOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify cost center exists (tenant-scoped)
      const existing = await ctx.prisma.costCenter.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cost center not found",
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
            message: "Cost center code is required",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.costCenter.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Cost center code already exists",
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
            message: "Cost center name is required",
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

      const costCenter = await ctx.prisma.costCenter.update({
        where: { id: input.id },
        data,
      })

      return mapCostCenterToOutput(costCenter)
    }),

  /**
   * costCenters.delete -- Deletes a cost center.
   *
   * Prevents deletion when employees are assigned.
   *
   * Requires: cost_centers.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(COST_CENTERS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify cost center exists (tenant-scoped)
      const existing = await ctx.prisma.costCenter.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cost center not found",
        })
      }

      // Check for employees
      const employeeCount = await ctx.prisma.employee.count({
        where: { costCenterId: input.id },
      })
      if (employeeCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete cost center with assigned employees",
        })
      }

      // Hard delete
      await ctx.prisma.costCenter.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
