/**
 * Order Booking Aggregator
 *
 * Aggregates OrderBooking rows per order using Prisma groupBy.
 * Used by the service-object history view to show total minutes,
 * booking count, and last booking date per order.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export type OrderBookingSummary = {
  orderId: string
  totalMinutes: number
  bookingCount: number
  lastBookingDate: Date | null
}

export async function getBookingSummaryByOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
): Promise<OrderBookingSummary> {
  const rows = await prisma.orderBooking.groupBy({
    by: ["orderId"],
    where: { tenantId, orderId },
    _sum: { timeMinutes: true },
    _count: true,
    _max: { bookingDate: true },
  })
  const grouped = rows[0]
  return {
    orderId,
    totalMinutes: grouped?._sum.timeMinutes ?? 0,
    bookingCount: grouped?._count ?? 0,
    lastBookingDate: grouped?._max.bookingDate ?? null,
  }
}

export async function getBookingSummariesByOrders(
  prisma: PrismaClient,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, OrderBookingSummary>> {
  const map = new Map<string, OrderBookingSummary>()
  if (orderIds.length === 0) return map

  const rows = await prisma.orderBooking.groupBy({
    by: ["orderId"],
    where: { tenantId, orderId: { in: orderIds } },
    _sum: { timeMinutes: true },
    _count: true,
    _max: { bookingDate: true },
  })

  for (const row of rows) {
    map.set(row.orderId, {
      orderId: row.orderId,
      totalMinutes: row._sum.timeMinutes ?? 0,
      bookingCount: row._count,
      lastBookingDate: row._max.bookingDate ?? null,
    })
  }
  for (const id of orderIds) {
    if (!map.has(id)) {
      map.set(id, {
        orderId: id,
        totalMinutes: 0,
        bookingCount: 0,
        lastBookingDate: null,
      })
    }
  }
  return map
}
