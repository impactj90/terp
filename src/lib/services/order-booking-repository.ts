/**
 * Order Booking Repository
 *
 * Pure Prisma data-access functions for the OrderBooking model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

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

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    page: number
    pageSize: number
    employeeId?: string
    orderId?: string
    fromDate?: string
    toDate?: string
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.employeeId) {
    where.employeeId = params.employeeId
  }

  if (params.orderId) {
    where.orderId = params.orderId
  }

  // Date range filters
  if (params.fromDate || params.toDate) {
    const bookingDate: Record<string, unknown> = {}
    if (params.fromDate) {
      bookingDate.gte = new Date(params.fromDate)
    }
    if (params.toDate) {
      bookingDate.lte = new Date(params.toDate)
    }
    where.bookingDate = bookingDate
  }

  const [items, total] = await Promise.all([
    prisma.orderBooking.findMany({
      where,
      include: orderBookingInclude,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.orderBooking.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.orderBooking.findFirst({
    where: { id, tenantId },
    include: orderBookingInclude,
  })
}

export async function findByIdSimple(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.orderBooking.findFirst({
    where: { id, tenantId },
  })
}

export async function findEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
  })
}

export async function findOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
) {
  return prisma.order.findFirst({
    where: { id: orderId, tenantId },
  })
}

export async function findActivity(
  prisma: PrismaClient,
  tenantId: string,
  activityId: string
) {
  return prisma.activity.findFirst({
    where: { id: activityId, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    orderId: string
    activityId: string | null
    bookingDate: Date
    timeMinutes: number
    description: string | null
    source: string
    createdBy: string
    updatedBy: string
  }
) {
  return prisma.orderBooking.create({ data })
}

export async function findByIdWithInclude(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.orderBooking.findFirst({
    where: { id, tenantId },
    include: orderBookingInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.orderBooking, { id, tenantId }, data, {
    entity: "OrderBooking",
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.orderBooking.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
