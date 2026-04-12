/**
 * Vehicles Router
 *
 * Provides CRUD operations for vehicles via tRPC procedures.
 *
 * Replaces the Go backend vehicle endpoints:
 * - GET    /vehicles       -> vehicles.list
 * - GET    /vehicles/{id}  -> vehicles.getById
 * - POST   /vehicles       -> vehicles.create
 * - PATCH  /vehicles/{id}  -> vehicles.update
 * - DELETE /vehicles/{id}  -> vehicles.delete
 *
 * @see apps/api/internal/service/vehicle.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as auditLog from "@/lib/services/audit-logs-service"
import * as vehicleService from "@/lib/services/vehicle-service"

// --- Permission Constants ---

const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!

// --- Output Schemas ---

const vehicleOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  licensePlate: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createVehicleInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  licensePlate: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
})

const updateVehicleInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  licensePlate: z.string().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Router ---

export const vehiclesRouter = createTRPCRouter({
  /**
   * vehicles.list -- Returns all vehicles for the current tenant.
   *
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: vehicle_data.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(vehicleOutputSchema) }))
    .query(async ({ ctx }) => {
      try {
        const tenantId = ctx.tenantId!

        const vehicles = await ctx.prisma.vehicle.findMany({
          where: { tenantId },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        })

        return { data: vehicles }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vehicles.getById -- Returns a single vehicle by ID.
   *
   * Requires: vehicle_data.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(vehicleOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const vehicle = await ctx.prisma.vehicle.findFirst({
          where: { id: input.id, tenantId },
        })

        if (!vehicle) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found",
          })
        }

        return vehicle
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vehicles.create -- Creates a new vehicle.
   *
   * Validates code/name non-empty, code uniqueness per tenant.
   *
   * Requires: vehicle_data.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(createVehicleInputSchema)
    .output(vehicleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Trim and validate code
        const code = input.code.trim()
        if (code.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vehicle code is required",
          })
        }

        // Trim and validate name
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vehicle name is required",
          })
        }

        // Check code uniqueness within tenant
        const existingByCode = await ctx.prisma.vehicle.findFirst({
          where: { tenantId, code },
        })
        if (existingByCode) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Vehicle code already exists",
          })
        }

        let vehicle
        try {
          vehicle = await ctx.prisma.vehicle.create({
            data: {
              tenantId,
              code,
              name,
              description: input.description?.trim() || null,
              licensePlate: input.licensePlate?.trim() || null,
              isActive: true,
              sortOrder: input.sortOrder ?? 0,
            },
          })
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Vehicle code already exists",
            })
          }
          throw err
        }

        await auditLog.log(ctx.prisma, {
          tenantId,
          userId: ctx.user!.id,
          action: "create",
          entityType: "vehicle",
          entityId: vehicle.id,
          entityName: vehicle.name ?? null,
          changes: null,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err))

        return vehicle
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vehicles.update -- Updates an existing vehicle.
   *
   * Supports partial updates. Code is NOT updatable.
   *
   * Requires: vehicle_data.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(updateVehicleInputSchema)
    .output(vehicleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const vehicle = await vehicleService.update(
          ctx.prisma,
          tenantId,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )

        return vehicle
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vehicles.delete -- Deletes a vehicle.
   *
   * Checks if the vehicle has any trip records before deletion.
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

        await vehicleService.remove(
          ctx.prisma,
          tenantId,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
