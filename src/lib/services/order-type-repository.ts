/**
 * Order Type Repository (NK-1, Decision 15)
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }
  return prisma.orderType.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.orderType.findFirst({ where: { id, tenantId } })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string,
  excludeId?: string
) {
  const where: Record<string, unknown> = { tenantId, code }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.orderType.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    sortOrder?: number
    isActive?: boolean
  }
) {
  return prisma.orderType.create({
    data: {
      tenantId: data.tenantId,
      code: data.code,
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(
    prisma.orderType,
    { id, tenantId },
    data,
    { entity: "OrderType" }
  )
}

export async function deleteById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.orderType.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countOrdersUsing(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string
) {
  return prisma.order.count({
    where: { tenantId, orderTypeId },
  })
}

export async function countThresholdConfigsUsing(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string
) {
  return prisma.nkThresholdConfig.count({
    where: { tenantId, orderTypeId },
  })
}
