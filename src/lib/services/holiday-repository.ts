/**
 * Holiday Repository
 *
 * Pure Prisma data-access functions for the Holiday model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    year?: number
    from?: string
    to?: string
    departmentId?: string
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.year !== undefined) {
    where.holidayDate = {
      gte: new Date(Date.UTC(params.year, 0, 1)),
      lt: new Date(Date.UTC(params.year + 1, 0, 1)),
    }
  } else if (params?.from || params?.to) {
    const dateFilter: Record<string, unknown> = {}
    if (params.from) {
      dateFilter.gte = new Date(params.from)
    }
    if (params.to) {
      dateFilter.lte = new Date(params.to)
    }
    where.holidayDate = dateFilter
  }

  if (params?.departmentId !== undefined) {
    where.departmentId = params.departmentId
  }

  return prisma.holiday.findMany({
    where,
    orderBy: { holidayDate: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.holiday.findFirst({
    where: { id, tenantId },
  })
}

export async function findByDate(
  prisma: PrismaClient,
  tenantId: string,
  holidayDate: Date
) {
  return prisma.holiday.findFirst({
    where: { tenantId, holidayDate },
  })
}

export async function findByYearRange(
  prisma: PrismaClient,
  tenantId: string,
  year: number
) {
  return prisma.holiday.findMany({
    where: {
      tenantId,
      holidayDate: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
    orderBy: { holidayDate: "asc" },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    holidayDate: Date
    name: string
    holidayCategory: number
    appliesToAll: boolean
    departmentId?: string | null
  }
) {
  return prisma.holiday.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.holiday.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.holiday.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
