/**
 * Account Group Repository
 *
 * Pure Prisma data-access functions for the AccountGroup model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.accountGroup.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.accountGroup.findFirst({
    where: { id, tenantId },
  })
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
  return prisma.accountGroup.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.accountGroup.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.accountGroup.update({
    where: { id },
    data,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.accountGroup.delete({
    where: { id },
  })
}

export async function countAccounts(
  prisma: PrismaClient,
  accountGroupId: string
) {
  return prisma.account.count({
    where: { accountGroupId },
  })
}
