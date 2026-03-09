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
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:1119-1139

const OB_VIEW = permissionIdByKey("order_bookings.view")!
const OB_MANAGE = permissionIdByKey("order_bookings.manage")!

// --- Output Schemas ---

const employeeSummarySchema = z
  .object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    departmentId: z.string().uuid().nullable(),
  })
  .nullable()

const orderSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const activitySummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const orderBookingOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  orderId: z.string().uuid(),
  activityId: z.string().uuid().nullable(),
  bookingDate: z.date(),
  timeMinutes: z.number().int(),
  description: z.string().nullable(),
  source: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().uuid().nullable(),
  updatedBy: z.string().uuid().nullable(),
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
    employeeId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    fromDate: z.string().date().optional(), // YYYY-MM-DD
    toDate: z.string().date().optional(), // YYYY-MM-DD
  })
  .optional()

const createInputSchema = z.object({
  employeeId: z.string().uuid(),
  orderId: z.string().uuid(),
  activityId: z.string().uuid().optional(),
  bookingDate: z.string().date(), // YYYY-MM-DD
  timeMinutes: z.number().int().positive("Time in minutes must be positive"),
  description: z.string().optional(),
})

const updateInputSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  activityId: z.string().uuid().nullable().optional(),
  bookingDate: z.string().date().optional(),
  timeMinutes: z.number().int().positive().optional(),
  description: z.string().nullable().optional(),
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
    .input(listInputSchema)
    .output(
      z.object({
        items: z.array(orderBookingOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
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
    .input(z.object({ id: z.string().uuid() }))
    .output(orderBookingOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

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

      return mapToOutput(booking as unknown as Record<string, unknown>)
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
    .input(createInputSchema)
    .output(orderBookingOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

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

      // Create order booking
      const created = await ctx.prisma.orderBooking.create({
        data: {
          tenantId,
          employeeId: input.employeeId,
          orderId: input.orderId,
          activityId: input.activityId || null,
          bookingDate: new Date(input.bookingDate),
          timeMinutes: input.timeMinutes,
          description: input.description?.trim() || null,
          source: "manual",
          createdBy: ctx.user!.id,
          updatedBy: ctx.user!.id,
        },
      })

      // Re-fetch with includes (matching Go pattern)
      const booking = await ctx.prisma.orderBooking.findUniqueOrThrow({
        where: { id: created.id },
        include: orderBookingInclude,
      })

      return mapToOutput(booking as unknown as Record<string, unknown>)
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
    .input(updateInputSchema)
    .output(orderBookingOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch existing (tenant-scoped)
      const existing = await ctx.prisma.orderBooking.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order booking not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = { updatedBy: ctx.user!.id }

      if (input.orderId !== undefined) {
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
        data.orderId = input.orderId
      }

      if (input.activityId !== undefined) {
        if (input.activityId !== null) {
          // Validate activity exists in tenant
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
        data.activityId = input.activityId
      }

      if (input.bookingDate !== undefined) {
        data.bookingDate = new Date(input.bookingDate)
      }

      if (input.timeMinutes !== undefined) {
        data.timeMinutes = input.timeMinutes
      }

      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Update
      await ctx.prisma.orderBooking.update({
        where: { id: input.id },
        data,
      })

      // Re-fetch with includes
      const booking = await ctx.prisma.orderBooking.findUniqueOrThrow({
        where: { id: input.id },
        include: orderBookingInclude,
      })

      return mapToOutput(booking as unknown as Record<string, unknown>)
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch existing (tenant-scoped)
      const existing = await ctx.prisma.orderBooking.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order booking not found",
        })
      }

      await ctx.prisma.orderBooking.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})

// --- Exported Helpers for Testing ---

export { mapToOutput }
