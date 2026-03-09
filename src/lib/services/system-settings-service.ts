/**
 * System Settings Service
 *
 * Business logic for system settings and cleanup operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { RecalcService } from "@/server/services/recalc"
import * as repo from "./system-settings-repository"

// --- Error Classes ---

export class SystemSettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SystemSettingsValidationError"
  }
}

// --- Helpers ---

/**
 * Singleton getOrCreate pattern for system settings.
 * Returns existing settings for the tenant, or creates defaults.
 */
async function getOrCreateSettings(
  prisma: PrismaClient,
  tenantId: string
) {
  const existing = await repo.findByTenantId(prisma, tenantId)
  if (existing) return existing
  return repo.create(prisma, { tenantId })
}

/**
 * Validates a cleanup date range: dateFrom <= dateTo, range <= 366 days.
 */
function validateDateRange(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom)
  const to = new Date(dateTo)

  if (from > to) {
    throw new SystemSettingsValidationError(
      "dateFrom must be before or equal to dateTo"
    )
  }

  const diffMs = to.getTime() - from.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays > 366) {
    throw new SystemSettingsValidationError(
      "Date range must not exceed 366 days"
    )
  }
}

// --- Service Functions ---

export async function get(prisma: PrismaClient, tenantId: string) {
  return getOrCreateSettings(prisma, tenantId)
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    roundingRelativeToPlan?: boolean
    errorListEnabled?: boolean
    trackedErrorCodes?: string[]
    autoFillOrderEndBookings?: boolean
    birthdayWindowDaysBefore?: number
    birthdayWindowDaysAfter?: number
    followUpEntriesEnabled?: boolean
    proxyHost?: string | null
    proxyPort?: number | null
    proxyUsername?: string | null
    proxyPassword?: string | null
    proxyEnabled?: boolean
    serverAliveEnabled?: boolean
    serverAliveExpectedCompletionTime?: number | null
    serverAliveThresholdMinutes?: number | null
    serverAliveNotifyAdmins?: boolean
  }
) {
  // Ensure settings exist
  const existing = await getOrCreateSettings(prisma, tenantId)

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

  return repo.update(prisma, existing.id, data)
}

export async function cleanupDeleteBookings(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    dateFrom: string
    dateTo: string
    employeeIds?: string[]
    confirm: boolean
  }
) {
  validateDateRange(input.dateFrom, input.dateTo)

  if (!input.confirm) {
    const count = await repo.countBookings(
      prisma,
      tenantId,
      input.dateFrom,
      input.dateTo,
      input.employeeIds
    )
    return {
      operation: "delete_bookings" as const,
      affectedCount: count,
      preview: true as const,
    }
  }

  const deleted = await repo.deleteBookings(
    prisma,
    tenantId,
    input.dateFrom,
    input.dateTo,
    input.employeeIds
  )

  return {
    operation: "delete_bookings" as const,
    affectedCount: deleted,
    preview: false as const,
  }
}

export async function cleanupDeleteBookingData(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    dateFrom: string
    dateTo: string
    employeeIds?: string[]
    confirm: boolean
  }
) {
  validateDateRange(input.dateFrom, input.dateTo)

  if (!input.confirm) {
    const [bookingsCount, dailyValuesCount] = await Promise.all([
      repo.countBookings(
        prisma,
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      ),
      repo.countDailyValues(
        prisma,
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      ),
    ])

    return {
      operation: "delete_booking_data" as const,
      affectedCount: bookingsCount + dailyValuesCount,
      preview: true as const,
      details: {
        bookings: bookingsCount,
        dailyValues: dailyValuesCount,
      },
    }
  }

  const [deletedBookings, deletedDailyValues, deletedEdps] =
    await Promise.all([
      repo.deleteBookings(
        prisma,
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      ),
      repo.deleteDailyValues(
        prisma,
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      ),
      repo.deleteEmployeeDayPlans(
        prisma,
        tenantId,
        input.dateFrom,
        input.dateTo,
        input.employeeIds
      ),
    ])

  return {
    operation: "delete_booking_data" as const,
    affectedCount: deletedBookings + deletedDailyValues + deletedEdps,
    preview: false as const,
    details: {
      bookings: deletedBookings,
      dailyValues: deletedDailyValues,
      employeeDayPlans: deletedEdps,
    },
  }
}

export async function cleanupReReadBookings(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    dateFrom: string
    dateTo: string
    employeeIds?: string[]
    confirm: boolean
  }
) {
  validateDateRange(input.dateFrom, input.dateTo)

  if (!input.confirm) {
    const count = await repo.countBookings(
      prisma,
      tenantId,
      input.dateFrom,
      input.dateTo,
      input.employeeIds
    )
    return {
      operation: "re_read_bookings" as const,
      affectedCount: count,
      preview: true as const,
    }
  }

  // Execute mode: recalculate bookings
  const recalcService = new RecalcService(prisma)

  const fromDate = new Date(input.dateFrom)
  const toDate = new Date(input.dateTo)

  let result
  if (input.employeeIds && input.employeeIds.length > 0) {
    result = await recalcService.triggerRecalcBatch(
      tenantId,
      input.employeeIds,
      fromDate,
      toDate
    )
  } else {
    result = await recalcService.triggerRecalcAll(tenantId, fromDate, toDate)
  }

  return {
    operation: "re_read_bookings" as const,
    affectedCount: result.processedDays,
    preview: false as const,
  }
}

export async function cleanupMarkDeleteOrders(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    orderIds: string[]
    confirm: boolean
  }
) {
  if (!input.confirm) {
    const count = await repo.countOrders(prisma, tenantId, input.orderIds)
    return {
      operation: "mark_delete_orders" as const,
      affectedCount: count,
      preview: true as const,
    }
  }

  const deleted = await repo.deleteOrders(prisma, tenantId, input.orderIds)
  return {
    operation: "mark_delete_orders" as const,
    affectedCount: deleted,
    preview: false as const,
  }
}
