/**
 * NK Aggregator Repository (NK-1, Phase 6)
 *
 * Read-only Prisma queries for the aggregator.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function loadOrderBookingsForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return prisma.orderBooking.findMany({
    where: { tenantId, orderId },
    include: {
      activity: {
        select: {
          id: true,
          code: true,
          name: true,
          pricingType: true,
          flatRate: true,
          hourlyRate: true,
          unit: true,
          calculatedHourEquivalent: true,
        },
      },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          hourlyRate: true,
          deletedAt: true,
          isActive: true,
          wageGroupId: true,
          wageGroup: {
            select: { billingHourlyRate: true },
          },
        },
      },
      workReport: {
        select: { id: true, status: true },
      },
    },
  })
}

export async function loadStockMovementsForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return prisma.whStockMovement.findMany({
    where: {
      tenantId,
      orderId,
      type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] },
    },
    include: {
      article: {
        select: { id: true, name: true, buyPrice: true, unit: true },
      },
    },
  })
}

export async function loadInboundInvoiceLineItemsForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return prisma.inboundInvoiceLineItem.findMany({
    where: { tenantId, orderId },
    include: {
      stockMovements: {
        select: { id: true },
      },
    },
  })
}

export async function loadWorkReportsForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return prisma.workReport.findMany({
    where: {
      tenantId,
      orderId,
      status: { not: "VOID" },
    },
    include: {
      assignments: {
        include: {
          employee: {
            select: {
              hourlyRate: true,
              wageGroup: { select: { billingHourlyRate: true } },
            },
          },
        },
      },
    },
  })
}

export async function loadOrderForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      tenantId: true,
      code: true,
      name: true,
      customer: true,
      orderTypeId: true,
      serviceObjectId: true,
      billingRatePerHour: true,
    },
  })
}
