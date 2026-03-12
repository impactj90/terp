/**
 * Export Interface Repository
 *
 * Pure Prisma data-access functions for the ExportInterface model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const accountInclude = {
  accounts: {
    include: {
      account: {
        select: { id: true, code: true, name: true, payrollCode: true },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { activeOnly?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params?.activeOnly) {
    where.isActive = true
  }

  return prisma.exportInterface.findMany({
    where,
    include: accountInclude,
    orderBy: { interfaceNumber: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.exportInterface.findFirst({
    where: { id, tenantId },
    include: accountInclude,
  })
}

export async function findByInterfaceNumber(
  prisma: PrismaClient,
  tenantId: string,
  interfaceNumber: number,
  excludeId?: string
) {
  const where: Record<string, unknown> = { tenantId, interfaceNumber }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.exportInterface.findFirst({ where })
}

export async function findByIdSimple(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.exportInterface.findFirst({
    where: { id, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    interfaceNumber: number
    name: string
    mandantNumber: string | null
    exportScript: string | null
    exportPath: string | null
    outputFilename: string | null
    isActive: boolean
  }
) {
  return prisma.exportInterface.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.exportInterface.updateMany({
    where: { id, tenantId },
    data,
  })
  if (count === 0) {
    return null
  }
  return prisma.exportInterface.findFirst({
    where: { id, tenantId },
    include: accountInclude,
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.exportInterface.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countPayrollExports(
  prisma: PrismaClient,
  exportInterfaceId: string
) {
  return prisma.payrollExport.count({
    where: { exportInterfaceId },
  })
}

export async function findAccounts(
  prisma: PrismaClient,
  exportInterfaceId: string
) {
  return prisma.exportInterfaceAccount.findMany({
    where: { exportInterfaceId },
    include: {
      account: {
        select: { id: true, code: true, name: true, payrollCode: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  })
}

export async function replaceAccounts(
  prisma: PrismaClient,
  exportInterfaceId: string,
  accountIds: string[]
) {
  await prisma.$transaction(async (tx) => {
    await tx.exportInterfaceAccount.deleteMany({
      where: { exportInterfaceId },
    })

    if (accountIds.length > 0) {
      await tx.exportInterfaceAccount.createMany({
        data: accountIds.map((accountId, index) => ({
          exportInterfaceId,
          accountId,
          sortOrder: index,
        })),
      })
    }
  })

  return findAccounts(prisma, exportInterfaceId)
}
