/**
 * System Settings Router
 *
 * Provides singleton system settings get/update and cleanup operations via tRPC.
 *
 * Replaces the Go backend system settings endpoints:
 * - GET /system-settings -> systemSettings.get
 * - PUT /system-settings -> systemSettings.update
 * - POST /system-settings/cleanup/delete-bookings -> systemSettings.cleanupDeleteBookings
 * - POST /system-settings/cleanup/delete-booking-data -> systemSettings.cleanupDeleteBookingData
 * - POST /system-settings/cleanup/re-read-bookings -> systemSettings.cleanupReReadBookings
 * - POST /system-settings/cleanup/mark-delete-orders -> systemSettings.cleanupMarkDeleteOrders
 *
 * @see apps/api/internal/service/systemsettings.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!

// --- Output Schemas ---

const systemSettingsOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  roundingRelativeToPlan: z.boolean(),
  errorListEnabled: z.boolean(),
  trackedErrorCodes: z.array(z.string()),
  autoFillOrderEndBookings: z.boolean(),
  birthdayWindowDaysBefore: z.number(),
  birthdayWindowDaysAfter: z.number(),
  followUpEntriesEnabled: z.boolean(),
  proxyHost: z.string().nullable(),
  proxyPort: z.number().nullable(),
  proxyUsername: z.string().nullable(),
  proxyEnabled: z.boolean(),
  serverAliveEnabled: z.boolean(),
  serverAliveExpectedCompletionTime: z.number().nullable(),
  serverAliveThresholdMinutes: z.number().nullable(),
  serverAliveNotifyAdmins: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const cleanupResultSchema = z.object({
  operation: z.string(),
  affectedCount: z.number(),
  preview: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
})

// --- Input Schemas ---

const updateSettingsInputSchema = z.object({
  roundingRelativeToPlan: z.boolean().optional(),
  errorListEnabled: z.boolean().optional(),
  trackedErrorCodes: z.array(z.string()).optional(),
  autoFillOrderEndBookings: z.boolean().optional(),
  birthdayWindowDaysBefore: z.number().int().min(0).max(90).optional(),
  birthdayWindowDaysAfter: z.number().int().min(0).max(90).optional(),
  followUpEntriesEnabled: z.boolean().optional(),
  proxyHost: z.string().max(255).nullable().optional(),
  proxyPort: z.number().int().nullable().optional(),
  proxyUsername: z.string().max(255).nullable().optional(),
  proxyPassword: z.string().max(255).nullable().optional(),
  proxyEnabled: z.boolean().optional(),
  serverAliveEnabled: z.boolean().optional(),
  serverAliveExpectedCompletionTime: z
    .number()
    .int()
    .min(0)
    .max(1439)
    .nullable()
    .optional(),
  serverAliveThresholdMinutes: z
    .number()
    .int()
    .min(1)
    .nullable()
    .optional(),
  serverAliveNotifyAdmins: z.boolean().optional(),
})

const cleanupDateRangeInputSchema = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
  employeeIds: z.array(z.string().uuid()).optional(),
  confirm: z.boolean(),
})

const cleanupOrdersInputSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1, "At least one order ID required"),
  confirm: z.boolean(),
})

// --- Helpers ---

/**
 * Singleton getOrCreate pattern for system settings.
 * Returns existing settings for the tenant, or creates defaults.
 */
async function getOrCreateSettings(
  prisma: PrismaClient,
  tenantId: string
) {
  const existing = await prisma.systemSetting.findUnique({
    where: { tenantId },
  })
  if (existing) return existing

  return prisma.systemSetting.create({
    data: { tenantId },
  })
}

/**
 * Maps a SystemSetting record to the output shape, omitting proxyPassword.
 */
function mapToOutput(s: Record<string, unknown>) {
  return {
    id: s.id as string,
    tenantId: s.tenantId as string,
    roundingRelativeToPlan: s.roundingRelativeToPlan as boolean,
    errorListEnabled: s.errorListEnabled as boolean,
    trackedErrorCodes: s.trackedErrorCodes as string[],
    autoFillOrderEndBookings: s.autoFillOrderEndBookings as boolean,
    birthdayWindowDaysBefore: s.birthdayWindowDaysBefore as number,
    birthdayWindowDaysAfter: s.birthdayWindowDaysAfter as number,
    followUpEntriesEnabled: s.followUpEntriesEnabled as boolean,
    proxyHost: (s.proxyHost as string | null) ?? null,
    proxyPort: (s.proxyPort as number | null) ?? null,
    proxyUsername: (s.proxyUsername as string | null) ?? null,
    // proxyPassword intentionally omitted (matches Go json:"-" behavior)
    proxyEnabled: s.proxyEnabled as boolean,
    serverAliveEnabled: s.serverAliveEnabled as boolean,
    serverAliveExpectedCompletionTime:
      (s.serverAliveExpectedCompletionTime as number | null) ?? null,
    serverAliveThresholdMinutes:
      (s.serverAliveThresholdMinutes as number | null) ?? null,
    serverAliveNotifyAdmins: s.serverAliveNotifyAdmins as boolean,
    createdAt: s.createdAt as Date,
    updatedAt: s.updatedAt as Date,
  }
}

/**
 * Validates a cleanup date range: dateFrom <= dateTo, range <= 366 days.
 */
function validateDateRange(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom)
  const to = new Date(dateTo)

  if (from > to) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "dateFrom must be before or equal to dateTo",
    })
  }

  const diffMs = to.getTime() - from.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays > 366) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Date range must not exceed 366 days",
    })
  }
}

/**
 * Builds a raw SQL query and params for bookings table with optional employee filter.
 * Returns [sql, params] tuple.
 */
function buildBookingsQuery(
  operation: "SELECT COUNT(*)::int as count" | "DELETE",
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): [string, unknown[]] {
  let sql = `${operation} FROM bookings WHERE tenant_id = $1::uuid AND booking_date BETWEEN $2::date AND $3::date`
  const params: unknown[] = [tenantId, dateFrom, dateTo]

  if (employeeIds && employeeIds.length > 0) {
    sql += ` AND employee_id = ANY($4::uuid[])`
    params.push(employeeIds)
  }

  return [sql, params]
}

/**
 * Builds a raw SQL query for daily_values table with optional employee filter.
 */
function buildDailyValuesQuery(
  operation: "SELECT COUNT(*)::int as count" | "DELETE",
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): [string, unknown[]] {
  let sql = `${operation} FROM daily_values WHERE tenant_id = $1::uuid AND date BETWEEN $2::date AND $3::date`
  const params: unknown[] = [tenantId, dateFrom, dateTo]

  if (employeeIds && employeeIds.length > 0) {
    sql += ` AND employee_id = ANY($4::uuid[])`
    params.push(employeeIds)
  }

  return [sql, params]
}

/**
 * Builds a raw SQL query for employee_day_plans table with optional employee filter.
 */
function buildEdpQuery(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): [string, unknown[]] {
  let sql = `DELETE FROM employee_day_plans WHERE tenant_id = $1::uuid AND date BETWEEN $2::date AND $3::date`
  const params: unknown[] = [tenantId, dateFrom, dateTo]

  if (employeeIds && employeeIds.length > 0) {
    sql += ` AND employee_id = ANY($4::uuid[])`
    params.push(employeeIds)
  }

  return [sql, params]
}

// --- Router ---

export const systemSettingsRouter = createTRPCRouter({
  /**
   * systemSettings.get -- Returns the singleton system settings for the tenant.
   *
   * Creates default settings on first access (getOrCreate pattern).
   * ProxyPassword is never returned.
   *
   * Requires: settings.manage permission
   */
  get: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .output(systemSettingsOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId!
      const settings = await getOrCreateSettings(ctx.prisma, tenantId)
      return mapToOutput(settings as unknown as Record<string, unknown>)
    }),

  /**
   * systemSettings.update -- Partially updates system settings.
   *
   * Uses getOrCreate to ensure the singleton exists before updating.
   * ProxyPassword is never returned.
   *
   * Requires: settings.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(updateSettingsInputSchema)
    .output(systemSettingsOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Ensure settings exist
      const existing = await getOrCreateSettings(ctx.prisma, tenantId)

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.roundingRelativeToPlan !== undefined) {
        data.roundingRelativeToPlan = input.roundingRelativeToPlan
      }
      if (input.errorListEnabled !== undefined) {
        data.errorListEnabled = input.errorListEnabled
      }
      if (input.trackedErrorCodes !== undefined) {
        data.trackedErrorCodes = input.trackedErrorCodes
      }
      if (input.autoFillOrderEndBookings !== undefined) {
        data.autoFillOrderEndBookings = input.autoFillOrderEndBookings
      }
      if (input.birthdayWindowDaysBefore !== undefined) {
        data.birthdayWindowDaysBefore = input.birthdayWindowDaysBefore
      }
      if (input.birthdayWindowDaysAfter !== undefined) {
        data.birthdayWindowDaysAfter = input.birthdayWindowDaysAfter
      }
      if (input.followUpEntriesEnabled !== undefined) {
        data.followUpEntriesEnabled = input.followUpEntriesEnabled
      }
      if (input.proxyHost !== undefined) {
        data.proxyHost = input.proxyHost
      }
      if (input.proxyPort !== undefined) {
        data.proxyPort = input.proxyPort
      }
      if (input.proxyUsername !== undefined) {
        data.proxyUsername = input.proxyUsername
      }
      if (input.proxyPassword !== undefined) {
        data.proxyPassword = input.proxyPassword
      }
      if (input.proxyEnabled !== undefined) {
        data.proxyEnabled = input.proxyEnabled
      }
      if (input.serverAliveEnabled !== undefined) {
        data.serverAliveEnabled = input.serverAliveEnabled
      }
      if (input.serverAliveExpectedCompletionTime !== undefined) {
        data.serverAliveExpectedCompletionTime =
          input.serverAliveExpectedCompletionTime
      }
      if (input.serverAliveThresholdMinutes !== undefined) {
        data.serverAliveThresholdMinutes = input.serverAliveThresholdMinutes
      }
      if (input.serverAliveNotifyAdmins !== undefined) {
        data.serverAliveNotifyAdmins = input.serverAliveNotifyAdmins
      }

      const updated = await ctx.prisma.systemSetting.update({
        where: { id: existing.id },
        data,
      })

      return mapToOutput(updated as unknown as Record<string, unknown>)
    }),

  /**
   * systemSettings.cleanupDeleteBookings -- Delete bookings in a date range.
   *
   * Preview mode (confirm: false): returns count of affected bookings.
   * Execute mode (confirm: true): deletes bookings and returns count.
   * Uses raw SQL since bookings table has no Prisma model.
   *
   * Requires: settings.manage permission
   */
  cleanupDeleteBookings: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(cleanupDateRangeInputSchema)
    .output(cleanupResultSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      validateDateRange(input.dateFrom, input.dateTo)

      if (!input.confirm) {
        // Preview mode: count bookings
        const [sql, params] = buildBookingsQuery(
          "SELECT COUNT(*)::int as count",
          tenantId,
          input.dateFrom,
          input.dateTo,
          input.employeeIds
        )
        const result = await ctx.prisma.$queryRawUnsafe<
          [{ count: number }]
        >(sql, ...params)

        return {
          operation: "delete_bookings",
          affectedCount: result[0]?.count ?? 0,
          preview: true,
        }
      }

      // Execute mode: delete bookings
      const [sql, params] = buildBookingsQuery(
        "DELETE",
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      )
      const deleted = await ctx.prisma.$executeRawUnsafe(sql, ...params)

      return {
        operation: "delete_bookings",
        affectedCount: deleted,
        preview: false,
      }
    }),

  /**
   * systemSettings.cleanupDeleteBookingData -- Delete bookings, daily values,
   * and employee day plans in a date range.
   *
   * Preview mode: returns counts of bookings and daily values.
   * Execute mode: deletes all three entity types.
   * Uses raw SQL for tables without Prisma models.
   *
   * Requires: settings.manage permission
   */
  cleanupDeleteBookingData: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(cleanupDateRangeInputSchema)
    .output(cleanupResultSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      validateDateRange(input.dateFrom, input.dateTo)

      if (!input.confirm) {
        // Preview mode: count bookings + daily values
        const [bookingsSql, bookingsParams] = buildBookingsQuery(
          "SELECT COUNT(*)::int as count",
          tenantId,
          input.dateFrom,
          input.dateTo,
          input.employeeIds
        )
        const [dvSql, dvParams] = buildDailyValuesQuery(
          "SELECT COUNT(*)::int as count",
          tenantId,
          input.dateFrom,
          input.dateTo,
          input.employeeIds
        )

        const [bookingsResult, dvResult] = await Promise.all([
          ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
            bookingsSql,
            ...bookingsParams
          ),
          ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
            dvSql,
            ...dvParams
          ),
        ])

        const bookingsCount = bookingsResult[0]?.count ?? 0
        const dailyValuesCount = dvResult[0]?.count ?? 0

        return {
          operation: "delete_booking_data",
          affectedCount: bookingsCount + dailyValuesCount,
          preview: true,
          details: {
            bookings: bookingsCount,
            dailyValues: dailyValuesCount,
          },
        }
      }

      // Execute mode: delete bookings + daily values + employee day plans
      const [bookingsSql, bookingsParams] = buildBookingsQuery(
        "DELETE",
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      )
      const [dvSql, dvParams] = buildDailyValuesQuery(
        "DELETE",
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      )
      const [edpSql, edpParams] = buildEdpQuery(
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      )

      const [deletedBookings, deletedDailyValues, deletedEdps] =
        await Promise.all([
          ctx.prisma.$executeRawUnsafe(bookingsSql, ...bookingsParams),
          ctx.prisma.$executeRawUnsafe(dvSql, ...dvParams),
          ctx.prisma.$executeRawUnsafe(edpSql, ...edpParams),
        ])

      return {
        operation: "delete_booking_data",
        affectedCount: deletedBookings + deletedDailyValues + deletedEdps,
        preview: false,
        details: {
          bookings: deletedBookings,
          dailyValues: deletedDailyValues,
          employeeDayPlans: deletedEdps,
        },
      }
    }),

  /**
   * systemSettings.cleanupReReadBookings -- Re-read bookings in a date range.
   *
   * Preview mode: returns count of bookings.
   * Execute mode: NOT_IMPLEMENTED (recalculation service not yet ported).
   *
   * Requires: settings.manage permission
   */
  cleanupReReadBookings: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(cleanupDateRangeInputSchema)
    .output(cleanupResultSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      validateDateRange(input.dateFrom, input.dateTo)

      if (!input.confirm) {
        // Preview mode: count bookings
        const [sql, params] = buildBookingsQuery(
          "SELECT COUNT(*)::int as count",
          tenantId,
          input.dateFrom,
          input.dateTo,
          input.employeeIds
        )
        const result = await ctx.prisma.$queryRawUnsafe<
          [{ count: number }]
        >(sql, ...params)

        return {
          operation: "re_read_bookings",
          affectedCount: result[0]?.count ?? 0,
          preview: true,
        }
      }

      // Execute mode: recalculation service not yet available
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Recalculation service not yet available",
      })
    }),

  /**
   * systemSettings.cleanupMarkDeleteOrders -- Delete orders by IDs.
   *
   * Preview mode: returns count of matching orders.
   * Execute mode: deletes the orders.
   * Uses Prisma model since Order has a Prisma model.
   *
   * Requires: settings.manage permission
   */
  cleanupMarkDeleteOrders: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(cleanupOrdersInputSchema)
    .output(cleanupResultSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      if (!input.confirm) {
        // Preview mode: count orders
        const count = await ctx.prisma.order.count({
          where: {
            id: { in: input.orderIds },
            tenantId,
          },
        })

        return {
          operation: "mark_delete_orders",
          affectedCount: count,
          preview: true,
        }
      }

      // Execute mode: delete orders
      const result = await ctx.prisma.order.deleteMany({
        where: {
          id: { in: input.orderIds },
          tenantId,
        },
      })

      return {
        operation: "mark_delete_orders",
        affectedCount: result.count,
        preview: false,
      }
    }),
})
