/**
 * Week Plan Repository
 *
 * Pure Prisma data-access functions for the WeekPlan model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const dayPlanSelect = {
  select: { id: true, code: true, name: true, planType: true },
} as const

const weekPlanInclude = {
  mondayDayPlan: dayPlanSelect,
  tuesdayDayPlan: dayPlanSelect,
  wednesdayDayPlan: dayPlanSelect,
  thursdayDayPlan: dayPlanSelect,
  fridayDayPlan: dayPlanSelect,
  saturdayDayPlan: dayPlanSelect,
  sundayDayPlan: dayPlanSelect,
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.weekPlan.findMany({
    where,
    orderBy: { code: "asc" },
    include: weekPlanInclude,
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.weekPlan.findFirst({
    where: { id, tenantId },
    include: weekPlanInclude,
  })
}

export async function findByIdSimple(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.weekPlan.findFirst({
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
  return prisma.weekPlan.findFirst({ where })
}

export async function findDayPlan(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.dayPlan.findFirst({
    where: { id, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    mondayDayPlanId: string
    tuesdayDayPlanId: string
    wednesdayDayPlanId: string
    thursdayDayPlanId: string
    fridayDayPlanId: string
    saturdayDayPlanId: string
    sundayDayPlanId: string
    isActive: boolean
  }
) {
  return prisma.weekPlan.create({ data })
}

export async function findByIdWithInclude(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.weekPlan.findFirst({
    where: { id, tenantId },
    include: weekPlanInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.weekPlan.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.weekPlan.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
