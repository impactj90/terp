/**
 * System Settings Repository
 *
 * Pure Prisma data-access functions for system settings and cleanup operations.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- System Settings ---

export async function findByTenantId(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.systemSetting.findUnique({
    where: { tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: { tenantId: string }
) {
  return prisma.systemSetting.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.systemSetting.findFirst({ where: { id, tenantId } })
  if (!existing) return null
  return prisma.systemSetting.update({ where: { id }, data })
}

// --- Booking Cleanup ---

export async function countBookings(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
) {
  const where: Record<string, unknown> = {
    tenantId,
    bookingDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  return prisma.booking.count({ where })
}

export async function deleteBookings(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
) {
  const where: Record<string, unknown> = {
    tenantId,
    bookingDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  const result = await prisma.booking.deleteMany({ where })
  return result.count
}

// --- Daily Values Cleanup ---

export async function countDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
) {
  const where: Record<string, unknown> = {
    tenantId,
    valueDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  return prisma.dailyValue.count({ where })
}

export async function deleteDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
) {
  const where: Record<string, unknown> = {
    tenantId,
    valueDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  const result = await prisma.dailyValue.deleteMany({ where })
  return result.count
}

// --- Employee Day Plans Cleanup ---

export async function deleteEmployeeDayPlans(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
) {
  const where: Record<string, unknown> = {
    tenantId,
    planDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  const result = await prisma.employeeDayPlan.deleteMany({ where })
  return result.count
}

// --- Orders Cleanup ---

export async function countOrders(
  prisma: PrismaClient,
  tenantId: string,
  orderIds: string[]
) {
  return prisma.order.count({
    where: {
      id: { in: orderIds },
      tenantId,
    },
  })
}

export async function deleteOrders(
  prisma: PrismaClient,
  tenantId: string,
  orderIds: string[]
) {
  const result = await prisma.order.deleteMany({
    where: {
      id: { in: orderIds },
      tenantId,
    },
  })
  return result.count
}
