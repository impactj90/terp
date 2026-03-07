/**
 * Vehicle Routes Router
 *
 * Provides CRUD operations for vehicle routes via tRPC procedures.
 *
 * Replaces the Go backend vehicle route endpoints:
 * - GET    /vehicle-routes       -> vehicleRoutes.list
 * - GET    /vehicle-routes/{id}  -> vehicleRoutes.getById
 * - POST   /vehicle-routes       -> vehicleRoutes.create
 * - PATCH  /vehicle-routes/{id}  -> vehicleRoutes.update
 * - DELETE /vehicle-routes/{id}  -> vehicleRoutes.delete
 *
 * @see apps/api/internal/service/vehicle_route.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!

// --- Output Schemas ---

const vehicleRouteOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  distanceKm: z.number().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createVehicleRouteInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  distanceKm: z.number().optional(),
  sortOrder: z.number().int().optional(),
})

const updateVehicleRouteInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  distanceKm: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Helpers ---

/** Convert a Prisma Decimal | null to number | null */
function decToNum(val: unknown): number | null {
  return val != null ? Number(val) : null
}

// --- Router ---

export const vehicleRoutesRouter = createTRPCRouter({
  /**
   * vehicleRoutes.list -- Returns all vehicle routes for the current tenant.
   *
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: vehicle_data.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(vehicleRouteOutputSchema) }))
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId!

      const routes = await ctx.prisma.vehicleRoute.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: routes.map((r) => ({
          id: r.id,
          tenantId: r.tenantId,
          code: r.code,
          name: r.name,
          description: r.description,
          distanceKm: decToNum(r.distanceKm),
          isActive: r.isActive,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      }
    }),

  /**
   * vehicleRoutes.getById -- Returns a single vehicle route by ID.
   *
   * Requires: vehicle_data.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(vehicleRouteOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const route = await ctx.prisma.vehicleRoute.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!route) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vehicle route not found",
        })
      }

      return {
        id: route.id,
        tenantId: route.tenantId,
        code: route.code,
        name: route.name,
        description: route.description,
        distanceKm: decToNum(route.distanceKm),
        isActive: route.isActive,
        sortOrder: route.sortOrder,
        createdAt: route.createdAt,
        updatedAt: route.updatedAt,
      }
    }),

  /**
   * vehicleRoutes.create -- Creates a new vehicle route.
   *
   * Validates code/name non-empty, code uniqueness per tenant.
   *
   * Requires: vehicle_data.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(createVehicleRouteInputSchema)
    .output(vehicleRouteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vehicle route code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vehicle route name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.vehicleRoute.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Vehicle route code already exists",
        })
      }

      const route = await ctx.prisma.vehicleRoute.create({
        data: {
          tenantId,
          code,
          name,
          description: input.description?.trim() || null,
          distanceKm:
            input.distanceKm !== undefined ? input.distanceKm : null,
          isActive: true,
          sortOrder: input.sortOrder ?? 0,
        },
      })

      return {
        id: route.id,
        tenantId: route.tenantId,
        code: route.code,
        name: route.name,
        description: route.description,
        distanceKm: decToNum(route.distanceKm),
        isActive: route.isActive,
        sortOrder: route.sortOrder,
        createdAt: route.createdAt,
        updatedAt: route.updatedAt,
      }
    }),

  /**
   * vehicleRoutes.update -- Updates an existing vehicle route.
   *
   * Supports partial updates. Code is NOT updatable.
   *
   * Requires: vehicle_data.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(updateVehicleRouteInputSchema)
    .output(vehicleRouteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify route exists (tenant-scoped)
      const existing = await ctx.prisma.vehicleRoute.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vehicle route not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vehicle route name is required",
          })
        }
        data.name = name
      }

      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      if (input.distanceKm !== undefined) {
        data.distanceKm = input.distanceKm
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      const route = await ctx.prisma.vehicleRoute.update({
        where: { id: input.id },
        data,
      })

      return {
        id: route.id,
        tenantId: route.tenantId,
        code: route.code,
        name: route.name,
        description: route.description,
        distanceKm: decToNum(route.distanceKm),
        isActive: route.isActive,
        sortOrder: route.sortOrder,
        createdAt: route.createdAt,
        updatedAt: route.updatedAt,
      }
    }),

  /**
   * vehicleRoutes.delete -- Deletes a vehicle route.
   *
   * Checks if the route has any trip records before deletion.
   *
   * Requires: vehicle_data.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify route exists (tenant-scoped)
      const existing = await ctx.prisma.vehicleRoute.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vehicle route not found",
        })
      }

      // Check if route has trip records
      const tripCount = await ctx.prisma.tripRecord.count({
        where: { routeId: input.id },
      })
      if (tripCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete vehicle route that has trip records",
        })
      }

      await ctx.prisma.vehicleRoute.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
