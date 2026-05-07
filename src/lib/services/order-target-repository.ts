/**
 * Order Target Repository (NK-1, Decision 1)
 */
import { Prisma } from "@/generated/prisma/client"
import type { PrismaClient } from "@/generated/prisma/client"

export async function findActive(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return prisma.orderTarget.findFirst({
    where: { tenantId, orderId, validTo: null },
    orderBy: { version: "desc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  return prisma.orderTarget.findFirst({
    where: { id, tenantId },
  })
}

export async function findManyByOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return prisma.orderTarget.findMany({
    where: { tenantId, orderId },
    orderBy: { version: "asc" },
  })
}

export async function findManyByOrders(
  prisma: PrismaClient,
  tenantId: string,
  orderIds: string[],
): Promise<Map<string, Awaited<ReturnType<typeof findActive>>>> {
  if (orderIds.length === 0) return new Map()
  const targets = await prisma.orderTarget.findMany({
    where: {
      tenantId,
      orderId: { in: orderIds },
      validTo: null,
    },
    orderBy: { version: "desc" },
  })
  // Group by orderId, keep first (highest version) per order
  const map = new Map<string, Awaited<ReturnType<typeof findActive>>>()
  for (const t of targets) {
    if (!map.has(t.orderId)) map.set(t.orderId, t)
  }
  return map
}

export async function create(
  prisma: PrismaClient | Prisma.TransactionClient,
  data: {
    tenantId: string
    orderId: string
    version: number
    validFrom: Date
    validTo: Date | null
    targetHours: number | null
    targetMaterialCost: number | null
    targetTravelMinutes: number | null
    targetExternalCost: number | null
    targetRevenue: number | null
    targetUnitItems: Prisma.InputJsonValue | null
    changeReason: string | null
    notes: string | null
    createdBy: string | null
  },
) {
  return (prisma as PrismaClient).orderTarget.create({
    data: {
      tenantId: data.tenantId,
      orderId: data.orderId,
      version: data.version,
      validFrom: data.validFrom,
      validTo: data.validTo,
      targetHours: data.targetHours,
      targetMaterialCost: data.targetMaterialCost,
      targetTravelMinutes: data.targetTravelMinutes,
      targetExternalCost: data.targetExternalCost,
      targetRevenue: data.targetRevenue,
      targetUnitItems: data.targetUnitItems ?? Prisma.JsonNull,
      changeReason: data.changeReason,
      notes: data.notes,
      createdBy: data.createdBy,
    },
  })
}

export async function closeActiveVersion(
  tx: Prisma.TransactionClient,
  id: string,
  validTo: Date,
) {
  return tx.orderTarget.update({
    where: { id },
    data: { validTo },
  })
}
