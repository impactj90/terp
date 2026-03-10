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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as settingsService from "@/lib/services/system-settings-service"

// --- Permission Constants ---

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!

// --- Output Schemas ---

const systemSettingsOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
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
  employeeIds: z.array(z.string()).optional(),
  confirm: z.boolean(),
})

const cleanupOrdersInputSchema = z.object({
  orderIds: z.array(z.string()).min(1, "At least one order ID required"),
  confirm: z.boolean(),
})

// --- Helpers ---

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
      try {
        const settings = await settingsService.get(ctx.prisma, ctx.tenantId!)
        return mapToOutput(settings as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const updated = await settingsService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapToOutput(updated as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * systemSettings.cleanupDeleteBookings -- Delete bookings in a date range.
   *
   * Preview mode (confirm: false): returns count of affected bookings.
   * Execute mode (confirm: true): deletes bookings and returns count.
   *
   * Requires: settings.manage permission
   */
  cleanupDeleteBookings: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(cleanupDateRangeInputSchema)
    .output(cleanupResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await settingsService.cleanupDeleteBookings(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * systemSettings.cleanupDeleteBookingData -- Delete bookings, daily values,
   * and employee day plans in a date range.
   *
   * Preview mode: returns counts of bookings and daily values.
   * Execute mode: deletes all three entity types.
   *
   * Requires: settings.manage permission
   */
  cleanupDeleteBookingData: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(cleanupDateRangeInputSchema)
    .output(cleanupResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await settingsService.cleanupDeleteBookingData(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * systemSettings.cleanupReReadBookings -- Re-read bookings in a date range.
   *
   * Preview mode: returns count of bookings.
   * Execute mode: recalculates bookings via RecalcService.
   *
   * Requires: settings.manage permission
   */
  cleanupReReadBookings: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(cleanupDateRangeInputSchema)
    .output(cleanupResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await settingsService.cleanupReReadBookings(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        return await settingsService.cleanupMarkDeleteOrders(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
