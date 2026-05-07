/**
 * NK Threshold Config Repository (NK-1, Decision 9)
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client"

export async function findDefault(
  prisma: PrismaClient,
  tenantId: string,
) {
  return prisma.nkThresholdConfig.findFirst({
    where: { tenantId, orderTypeId: null },
  })
}

export async function findOverride(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string,
) {
  return prisma.nkThresholdConfig.findFirst({
    where: { tenantId, orderTypeId },
  })
}

export async function findManyOverrides(
  prisma: PrismaClient,
  tenantId: string,
) {
  return prisma.nkThresholdConfig.findMany({
    where: { tenantId, orderTypeId: { not: null } },
  })
}

export async function findAll(
  prisma: PrismaClient,
  tenantId: string,
) {
  return prisma.nkThresholdConfig.findMany({
    where: { tenantId },
    orderBy: [{ orderTypeId: "asc" }],
  })
}

export async function create(
  prisma: PrismaClient | Prisma.TransactionClient,
  data: {
    tenantId: string
    orderTypeId: string | null
    marginAmberFromPercent: number
    marginRedFromPercent: number
    productivityAmberFromPercent: number
    productivityRedFromPercent: number
  },
) {
  return (prisma as PrismaClient).nkThresholdConfig.create({ data })
}

export async function updateById(
  prisma: PrismaClient,
  id: string,
  data: {
    marginAmberFromPercent?: number
    marginRedFromPercent?: number
    productivityAmberFromPercent?: number
    productivityRedFromPercent?: number
  },
) {
  return prisma.nkThresholdConfig.update({
    where: { id },
    data,
  })
}

export async function deleteOverride(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string,
) {
  const { count } = await prisma.nkThresholdConfig.deleteMany({
    where: { tenantId, orderTypeId },
  })
  return count > 0
}
