/**
 * Daily Value Repository
 *
 * Pure Prisma data-access functions for the DailyValue model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const dailyValueListAllInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
      tariffId: true,
    },
  },
} as const

export async function findManyByEmployeeMonth(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  from: Date,
  to: Date
) {
  return prisma.dailyValue.findMany({
    where: {
      tenantId,
      employeeId,
      valueDate: { gte: from, lte: to },
    },
    orderBy: { valueDate: "asc" },
  })
}

export async function findManyWithFilters(
  prisma: PrismaClient,
  where: Record<string, unknown>,
  params: { skip: number; take: number }
) {
  const [items, total] = await Promise.all([
    prisma.dailyValue.findMany({
      where,
      include: dailyValueListAllInclude,
      skip: params.skip,
      take: params.take,
      orderBy: { valueDate: "asc" },
    }),
    prisma.dailyValue.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.dailyValue.findFirst({
    where: { id, tenantId },
    include: dailyValueListAllInclude,
  })
}

export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.dailyValue.findFirst({
    where: { id, tenantId },
    include: {
      employee: {
        select: { id: true, departmentId: true },
      },
    },
  })
}

export async function updateStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: string
) {
  const existing = await prisma.dailyValue.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.dailyValue.update({
    where: { id },
    data: { status },
    include: dailyValueListAllInclude,
  })
}

export async function findUserIdForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  const result = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT ut.user_id
    FROM user_tenants ut
    JOIN users u ON u.id = ut.user_id
    WHERE ut.tenant_id = ${tenantId}::uuid
      AND u.employee_id = ${employeeId}::uuid
    LIMIT 1
  `
  return result?.[0]?.user_id ?? null
}

export async function createNotification(
  prisma: PrismaClient,
  data: {
    tenantId: string
    userId: string
    type: string
    title: string
    message: string
    link: string
  }
) {
  return prisma.notification.create({ data })
}
