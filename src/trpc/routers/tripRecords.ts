/**
 * Trip Records Router
 *
 * Provides CRUD operations for trip records (vehicle mileage logs) via tRPC procedures.
 *
 * Replaces the Go backend trip record endpoints:
 * - GET    /trip-records       -> tripRecords.list
 * - GET    /trip-records/{id}  -> tripRecords.getById
 * - POST   /trip-records       -> tripRecords.create
 * - PATCH  /trip-records/{id}  -> tripRecords.update
 * - DELETE /trip-records/{id}  -> tripRecords.delete
 *
 * @see apps/api/internal/service/trip_record.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as auditLog from "@/lib/services/audit-logs-service"

// --- Permission Constants ---

const VEHICLE_DATA_MANAGE = permissionIdByKey("vehicle_data.manage")!

// --- Output Schemas ---

const tripRecordOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  vehicleId: z.string(),
  routeId: z.string().nullable(),
  tripDate: z.date(),
  startMileage: z.number().nullable(),
  endMileage: z.number().nullable(),
  distanceKm: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  vehicle: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
    .optional(),
  vehicleRoute: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
})

// --- Input Schemas ---

const createTripRecordInputSchema = z.object({
  vehicleId: z.string(),
  routeId: z.string().optional(),
  tripDate: z.string().date(),
  startMileage: z.number().min(0).max(9999999).optional(),
  endMileage: z.number().min(0).max(9999999).optional(),
  distanceKm: z.number().min(0).max(100000).optional(),
  notes: z.string().max(2000).optional(),
})

const updateTripRecordInputSchema = z.object({
  id: z.string(),
  routeId: z.string().nullable().optional(),
  tripDate: z.string().date().optional(),
  startMileage: z.number().min(0).max(9999999).nullable().optional(),
  endMileage: z.number().min(0).max(9999999).nullable().optional(),
  distanceKm: z.number().min(0).max(100000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

// --- Helpers ---

/** Convert a Prisma Decimal | null to number | null */
function decToNum(val: unknown): number | null {
  return val != null ? Number(val) : null
}

// --- Router ---

export const tripRecordsRouter = createTRPCRouter({
  /**
   * tripRecords.list -- Returns trip records for the current tenant.
   *
   * Supports filters: vehicleId, fromDate, toDate.
   * Paginated with limit/page.
   *
   * Requires: vehicle_data.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(
      z.object({
        vehicleId: z.string().optional(),
        fromDate: z.string().date().optional(),
        toDate: z.string().date().optional(),
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
      })
    )
    .output(
      z.object({
        data: z.array(tripRecordOutputSchema),
        meta: z.object({
          total: z.number(),
          limit: z.number(),
          hasMore: z.boolean(),
        }),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const where: Record<string, unknown> = { tenantId }
        if (input.vehicleId) {
          where.vehicleId = input.vehicleId
        }
        if (input.fromDate || input.toDate) {
          const tripDate: Record<string, unknown> = {}
          if (input.fromDate) {
            tripDate.gte = new Date(input.fromDate)
          }
          if (input.toDate) {
            tripDate.lte = new Date(input.toDate)
          }
          where.tripDate = tripDate
        }

        const [data, total] = await Promise.all([
          ctx.prisma.tripRecord.findMany({
            where,
            take: input.limit,
            skip: (input.page - 1) * input.limit,
            orderBy: [{ tripDate: "desc" }, { createdAt: "desc" }],
            include: {
              vehicle: {
                select: { id: true, code: true, name: true },
              },
              vehicleRoute: {
                select: { id: true, code: true, name: true },
              },
            },
          }),
          ctx.prisma.tripRecord.count({ where }),
        ])

        return {
          data: data.map((r) => ({
            id: r.id,
            tenantId: r.tenantId,
            vehicleId: r.vehicleId,
            routeId: r.routeId,
            tripDate: r.tripDate,
            startMileage: decToNum(r.startMileage),
            endMileage: decToNum(r.endMileage),
            distanceKm: decToNum(r.distanceKm),
            notes: r.notes,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            vehicle: r.vehicle,
            vehicleRoute: r.vehicleRoute,
          })),
          meta: {
            total,
            limit: input.limit,
            hasMore: input.page * input.limit < total,
          },
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tripRecords.getById -- Returns a single trip record by ID.
   *
   * Includes vehicle and vehicleRoute relations.
   *
   * Requires: vehicle_data.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(tripRecordOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const record = await ctx.prisma.tripRecord.findFirst({
          where: { id: input.id, tenantId },
          include: {
            vehicle: {
              select: { id: true, code: true, name: true },
            },
            vehicleRoute: {
              select: { id: true, code: true, name: true },
            },
          },
        })

        if (!record) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trip record not found",
          })
        }

        return {
          id: record.id,
          tenantId: record.tenantId,
          vehicleId: record.vehicleId,
          routeId: record.routeId,
          tripDate: record.tripDate,
          startMileage: decToNum(record.startMileage),
          endMileage: decToNum(record.endMileage),
          distanceKm: decToNum(record.distanceKm),
          notes: record.notes,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          vehicle: record.vehicle,
          vehicleRoute: record.vehicleRoute,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tripRecords.create -- Creates a new trip record.
   *
   * Validates vehicleId FK, optional routeId FK, and tripDate.
   *
   * Requires: vehicle_data.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(createTripRecordInputSchema)
    .output(tripRecordOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Validate tripDate
        const tripDate = new Date(input.tripDate)
        if (isNaN(tripDate.getTime())) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid trip date",
          })
        }

        // Validate vehicleId FK
        const vehicle = await ctx.prisma.vehicle.findFirst({
          where: { id: input.vehicleId, tenantId },
        })
        if (!vehicle) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vehicle not found",
          })
        }

        // Validate routeId FK if provided
        if (input.routeId) {
          const route = await ctx.prisma.vehicleRoute.findFirst({
            where: { id: input.routeId, tenantId },
          })
          if (!route) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Vehicle route not found",
            })
          }
        }

        const record = await ctx.prisma.tripRecord.create({
          data: {
            tenantId,
            vehicleId: input.vehicleId,
            routeId: input.routeId || null,
            tripDate,
            startMileage:
              input.startMileage !== undefined ? input.startMileage : null,
            endMileage:
              input.endMileage !== undefined ? input.endMileage : null,
            distanceKm:
              input.distanceKm !== undefined ? input.distanceKm : null,
            notes: input.notes?.trim() || null,
          },
          include: {
            vehicle: {
              select: { id: true, code: true, name: true },
            },
            vehicleRoute: {
              select: { id: true, code: true, name: true },
            },
          },
        })

        await auditLog.log(ctx.prisma, {
          tenantId,
          userId: ctx.user!.id,
          action: "create",
          entityType: "trip_record",
          entityId: record.id,
          entityName: null,
          changes: null,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err))

        return {
          id: record.id,
          tenantId: record.tenantId,
          vehicleId: record.vehicleId,
          routeId: record.routeId,
          tripDate: record.tripDate,
          startMileage: decToNum(record.startMileage),
          endMileage: decToNum(record.endMileage),
          distanceKm: decToNum(record.distanceKm),
          notes: record.notes,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          vehicle: record.vehicle,
          vehicleRoute: record.vehicleRoute,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tripRecords.update -- Updates an existing trip record.
   *
   * Supports partial updates. VehicleID is NOT updatable.
   *
   * Requires: vehicle_data.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VEHICLE_DATA_MANAGE))
    .input(updateTripRecordInputSchema)
    .output(tripRecordOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Verify record exists (tenant-scoped)
        const existing = await ctx.prisma.tripRecord.findFirst({
          where: { id: input.id, tenantId },
        })
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trip record not found",
          })
        }

        // Build partial update data
        const data: Record<string, unknown> = {}

        if (input.routeId !== undefined) {
          if (input.routeId === null) {
            data.routeId = null
          } else {
            const route = await ctx.prisma.vehicleRoute.findFirst({
              where: { id: input.routeId, tenantId },
            })
            if (!route) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Vehicle route not found",
              })
            }
            data.routeId = input.routeId
          }
        }

        if (input.tripDate !== undefined) {
          const tripDate = new Date(input.tripDate)
          if (isNaN(tripDate.getTime())) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid trip date",
            })
          }
          data.tripDate = tripDate
        }

        if (input.startMileage !== undefined) {
          data.startMileage = input.startMileage
        }

        if (input.endMileage !== undefined) {
          data.endMileage = input.endMileage
        }

        if (input.distanceKm !== undefined) {
          data.distanceKm = input.distanceKm
        }

        if (input.notes !== undefined) {
          data.notes = input.notes === null ? null : input.notes.trim()
        }

        const record = await ctx.prisma.tripRecord.update({
          where: { id: input.id },
          data,
          include: {
            vehicle: {
              select: { id: true, code: true, name: true },
            },
            vehicleRoute: {
              select: { id: true, code: true, name: true },
            },
          },
        })

        const changes = auditLog.computeChanges(
          existing as unknown as Record<string, unknown>,
          record as unknown as Record<string, unknown>,
          ["vehicleId", "routeId", "tripDate", "startMileage", "endMileage", "distanceKm", "notes"]
        )
        await auditLog.log(ctx.prisma, {
          tenantId,
          userId: ctx.user!.id,
          action: "update",
          entityType: "trip_record",
          entityId: input.id,
          entityName: null,
          changes,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err))

        return {
          id: record.id,
          tenantId: record.tenantId,
          vehicleId: record.vehicleId,
          routeId: record.routeId,
          tripDate: record.tripDate,
          startMileage: decToNum(record.startMileage),
          endMileage: decToNum(record.endMileage),
          distanceKm: decToNum(record.distanceKm),
          notes: record.notes,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          vehicle: record.vehicle,
          vehicleRoute: record.vehicleRoute,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * tripRecords.delete -- Deletes a trip record.
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

        // Verify record exists (tenant-scoped)
        const existing = await ctx.prisma.tripRecord.findFirst({
          where: { id: input.id, tenantId },
        })
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trip record not found",
          })
        }

        await ctx.prisma.tripRecord.delete({
          where: { id: input.id },
        })

        await auditLog.log(ctx.prisma, {
          tenantId,
          userId: ctx.user!.id,
          action: "delete",
          entityType: "trip_record",
          entityId: input.id,
          entityName: null,
          changes: null,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err))

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
