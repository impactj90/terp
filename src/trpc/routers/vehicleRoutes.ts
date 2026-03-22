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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as vehicleRouteService from "@/lib/services/vehicle-route-service"

// --- Permission Constants ---

const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!

// --- Output Schemas ---

const vehicleRouteOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
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
  description: z.string().max(2000).optional(),
  distanceKm: z.number().min(0).max(100000).optional(),
  sortOrder: z.number().int().optional(),
})

const updateVehicleRouteInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  distanceKm: z.number().min(0).max(100000).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Helpers ---

/** Convert a Prisma Decimal | null to number | null */
function decToNum(val: unknown): number | null {
  return val != null ? Number(val) : null
}

/** Map a Prisma VehicleRoute to the output shape */
function mapToOutput(r: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  distanceKm: unknown
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}) {
  return {
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
  }
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
      try {
        const tenantId = ctx.tenantId!
        const routes = await vehicleRouteService.list(ctx.prisma, tenantId)
        return { data: routes.map(mapToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vehicleRoutes.getById -- Returns a single vehicle route by ID.
   *
   * Requires: vehicle_data.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(vehicleRouteOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const route = await vehicleRouteService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapToOutput(route)
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const route = await vehicleRouteService.create(
          ctx.prisma,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(route)
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const route = await vehicleRouteService.update(
          ctx.prisma,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(route)
      } catch (err) {
        handleServiceError(err)
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await vehicleRouteService.remove(ctx.prisma, tenantId, input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
