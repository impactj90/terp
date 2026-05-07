/**
 * Order Bookings Router
 *
 * Provides order booking CRUD operations via tRPC procedures.
 * Includes paginated list with filters and relation preloads.
 *
 * Replaces the Go backend order booking endpoints:
 * - GET /order-bookings -> orderBookings.list
 * - GET /order-bookings/{id} -> orderBookings.getById
 * - POST /order-bookings -> orderBookings.create
 * - PATCH /order-bookings/{id} -> orderBookings.update
 * - DELETE /order-bookings/{id} -> orderBookings.delete
 *
 * @see apps/api/internal/service/order_booking.go
 * @see apps/api/internal/handler/order_booking.go
 * @see apps/api/internal/repository/order_booking.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import {
  buildRelatedEmployeeDataScopeWhere,
  checkRelatedEmployeeDataScope,
  mergeDataScopeWhere,
} from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as auditLog from "@/lib/services/audit-logs-service"
import * as orderBookingService from "@/lib/services/order-booking-service"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:1119-1139

const OB_VIEW = permissionIdByKey("order_bookings.view")!
const OB_MANAGE = permissionIdByKey("order_bookings.manage")!

// --- Output Schemas ---

const employeeSummarySchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    departmentId: z.string().nullable(),
  })
  .nullable()

const orderSummarySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const activitySummarySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const orderBookingOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  orderId: z.string(),
  activityId: z.string().nullable(),
  workReportId: z.string().nullable(),
  bookingDate: z.date(),
  timeMinutes: z.number().int(),
  description: z.string().nullable(),
  source: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  // Nested relations (included in list/getById)
  employee: employeeSummarySchema.optional(),
  order: orderSummarySchema.optional(),
  activity: activitySummarySchema.optional(),
})

type OrderBookingOutput = z.infer<typeof orderBookingOutputSchema>

// --- Input Schemas ---

const listInputSchema = z
  .object({
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
    employeeId: z.string().optional(),
    orderId: z.string().optional(),
    fromDate: z.string().date().optional(), // YYYY-MM-DD
    toDate: z.string().date().optional(), // YYYY-MM-DD
  })
  .optional()

const createInputSchema = z.object({
  employeeId: z.string(),
  orderId: z.string(),
  activityId: z.string().optional(),
  workReportId: z.string().nullable().optional(),
  bookingDate: z.string().date(), // YYYY-MM-DD
  timeMinutes: z.number().int().min(1).max(1440),
  description: z.string().max(2000).optional(),
  // NK-1 (Decision 26): quantity for PER_UNIT activities
  quantity: z.number().min(0).max(99999.99).optional(),
})

const updateInputSchema = z.object({
  id: z.string(),
  orderId: z.string().optional(),
  activityId: z.string().nullable().optional(),
  workReportId: z.string().nullable().optional(),
  bookingDate: z.string().date().optional(),
  timeMinutes: z.number().int().min(1).max(1440).optional(),
  description: z.string().max(2000).nullable().optional(),
  // NK-1 (Decision 26): quantity for PER_UNIT activities
  quantity: z.number().min(0).max(99999.99).nullable().optional(),
})

// --- Prisma Include Objects ---

const orderBookingInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      departmentId: true,
    },
  },
  order: {
    select: { id: true, code: true, name: true },
  },
  activity: {
    select: { id: true, code: true, name: true },
  },
} as const

// --- Helper Functions ---

/**
 * Maps a Prisma OrderBooking record (with relations) to the output schema shape.
 * Mirrors Go modelToResponse for order bookings.
 */
function mapToOutput(record: Record<string, unknown>): OrderBookingOutput {
  const employee = record.employee as {
    id: string
    firstName: string
    lastName: string
    personnelNumber: string
    departmentId: string | null
  } | null | undefined
  const order = record.order as {
    id: string
    code: string
    name: string
  } | null | undefined
  const activity = record.activity as {
    id: string
    code: string
    name: string
  } | null | undefined

  const result: OrderBookingOutput = {
    id: record.id as string,
    tenantId: record.tenantId as string,
    employeeId: record.employeeId as string,
    orderId: record.orderId as string,
    activityId: (record.activityId as string | null) ?? null,
    workReportId: (record.workReportId as string | null) ?? null,
    bookingDate: record.bookingDate as Date,
    timeMinutes: record.timeMinutes as number,
    description: (record.description as string | null) ?? null,
    source: record.source as string,
    createdAt: record.createdAt as Date,
    updatedAt: record.updatedAt as Date,
    createdBy: (record.createdBy as string | null) ?? null,
    updatedBy: (record.updatedBy as string | null) ?? null,
  }

  if (employee !== undefined) {
    result.employee = employee
      ? {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          personnelNumber: employee.personnelNumber,
          departmentId: employee.departmentId,
        }
      : null
  }

  if (order !== undefined) {
    result.order = order
      ? {
          id: order.id,
          code: order.code,
          name: order.name,
        }
      : null
  }

  if (activity !== undefined) {
    result.activity = activity
      ? {
          id: activity.id,
          code: activity.code,
          name: activity.name,
        }
      : null
  }

  return result
}

// --- Router ---

export const orderBookingsRouter = createTRPCRouter({
  /**
   * orderBookings.list -- Returns paginated order bookings for the current tenant.
   *
   * Supports filters: employeeId, orderId, fromDate, toDate.
   * Orders by bookingDate DESC, createdAt DESC (matches Go).
   * Includes employee, order, and activity relations.
   *
   * Requires: order_bookings.view permission
   */
  list: tenantProcedure
    .use(requirePermission(OB_VIEW))
    .use(applyDataScope())
    .input(listInputSchema)
    .output(
      z.object({
        items: z.array(orderBookingOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const page = input?.page ?? 1
        const pageSize = input?.pageSize ?? 50

        const where: Record<string, unknown> = { tenantId }

        // Optional filters
        if (input?.employeeId) {
          where.employeeId = input.employeeId
        }

        if (input?.orderId) {
          where.orderId = input.orderId
        }

        // Date range filters
        if (input?.fromDate || input?.toDate) {
          const bookingDate: Record<string, unknown> = {}
          if (input?.fromDate) {
            bookingDate.gte = new Date(input.fromDate)
          }
          if (input?.toDate) {
            bookingDate.lte = new Date(input.toDate)
          }
          where.bookingDate = bookingDate
        }

        // Apply data scope
        mergeDataScopeWhere(where, buildRelatedEmployeeDataScopeWhere(dataScope))

        const [items, total] = await Promise.all([
          ctx.prisma.orderBooking.findMany({
            where,
            include: orderBookingInclude,
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
          }),
          ctx.prisma.orderBooking.count({ where }),
        ])

        return {
          items: items.map((item) =>
            mapToOutput(item as unknown as Record<string, unknown>)
          ),
          total,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * orderBookings.getById -- Returns a single order booking by ID.
   *
   * Tenant-scoped. Includes employee, order, and activity relations.
   *
   * Requires: order_bookings.view permission
   */
  getById: tenantProcedure
    .use(requirePermission(OB_VIEW))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(orderBookingOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const booking = await ctx.prisma.orderBooking.findFirst({
          where: { id: input.id, tenantId },
          include: orderBookingInclude,
        })

        if (!booking) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order booking not found",
          })
        }

        // Check data scope
        checkRelatedEmployeeDataScope(dataScope, booking as unknown as {
          employeeId: string
          employee?: { departmentId: string | null } | null
        }, "Order booking")

        return mapToOutput(booking as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * orderBookings.create -- Creates a new order booking.
   *
   * Validates employee, order, and optional activity exist in tenant.
   * Source defaults to "manual". Description is trimmed.
   * Sets createdBy/updatedBy to current user.
   *
   * Requires: order_bookings.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(OB_MANAGE))
    .use(applyDataScope())
    .input(createInputSchema)
    .output(orderBookingOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        // Validate employee exists in tenant
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId },
        })
        if (!employee) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Employee not found",
          })
        }

        // Check data scope on target employee
        checkRelatedEmployeeDataScope(dataScope, {
          employeeId: employee.id,
          employee: { departmentId: employee.departmentId },
        }, "Order booking")

        // Validate order exists in tenant
        const order = await ctx.prisma.order.findFirst({
          where: { id: input.orderId, tenantId },
        })
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          })
        }

        // Validate activity exists in tenant (if provided)
        if (input.activityId) {
          const activity = await ctx.prisma.activity.findFirst({
            where: { id: input.activityId, tenantId },
          })
          if (!activity) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Activity not found",
            })
          }
        }

        // Validate workReport exists in tenant, belongs to the same order,
        // and is still in DRAFT (signed scheine cannot be re-tagged).
        if (input.workReportId) {
          const wr = await ctx.prisma.workReport.findFirst({
            where: {
              id: input.workReportId,
              tenantId,
              orderId: input.orderId,
              status: "DRAFT",
            },
          })
          if (!wr) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Arbeitsschein muss DRAFT sein und zum gleichen Auftrag gehören",
            })
          }
        }

        // NK-1: route create through the service so the snapshot
        // (Decision 14) and PER_UNIT validation (Decision 26) run.
        const booking = await orderBookingService.create(
          ctx.prisma,
          tenantId,
          ctx.user!.id,
          {
            employeeId: input.employeeId,
            orderId: input.orderId,
            activityId: input.activityId,
            bookingDate: input.bookingDate,
            timeMinutes: input.timeMinutes,
            description: input.description,
            quantity: input.quantity,
          },
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
        )

        // Patch workReportId via update if requested (the service
        // create does not currently accept workReportId)
        let finalBooking = booking
        if (input.workReportId !== undefined) {
          await ctx.prisma.orderBooking.update({
            where: { id: booking.id },
            data: { workReportId: input.workReportId ?? null },
          })
          const refetched = await ctx.prisma.orderBooking.findUnique({
            where: { id: booking.id },
            include: orderBookingInclude,
          })
          if (refetched) finalBooking = refetched
        }

        return mapToOutput(finalBooking as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * orderBookings.update -- Updates an existing order booking.
   *
   * Supports partial updates. Description is trimmed if provided.
   * Sets updatedBy to current user.
   *
   * Requires: order_bookings.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(OB_MANAGE))
    .use(applyDataScope())
    .input(updateInputSchema)
    .output(orderBookingOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const result = await orderBookingService.update(
          ctx.prisma,
          tenantId,
          ctx.user!.id,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          dataScope
        )

        return mapToOutput(result as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * orderBookings.delete -- Deletes an order booking.
   *
   * Tenant-scoped: verifies booking belongs to current tenant.
   *
   * Requires: order_bookings.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(OB_MANAGE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        await orderBookingService.remove(
          ctx.prisma,
          tenantId,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          },
          dataScope
        )

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

// --- Exported Helpers for Testing ---

export { mapToOutput }
