/**
 * Day Plans Repository
 *
 * Pure Prisma data-access functions for the DayPlan, DayPlanBreak,
 * and DayPlanBonus models.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const dayPlanDetailInclude = {
  breaks: { orderBy: { sortOrder: "asc" as const } },
  bonuses: { orderBy: { sortOrder: "asc" as const } },
} as const

// --- DayPlan ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; planType?: string }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }
  if (params?.planType !== undefined) {
    where.planType = params.planType
  }

  return prisma.dayPlan.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.dayPlan.findFirst({
    where: { id, tenantId },
    include: dayPlanDetailInclude,
  })
}

export async function findByIdBasic(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.dayPlan.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.dayPlan.findFirst({
    where: { tenantId, code },
  })
}

export async function findByCodeExcluding(
  prisma: PrismaClient,
  tenantId: string,
  code: string,
  excludeId: string
) {
  return prisma.dayPlan.findFirst({
    where: {
      tenantId,
      code,
      NOT: { id: excludeId },
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function create(prisma: PrismaClient, data: any) {
  return prisma.dayPlan.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.dayPlan.update({
    where: { id },
    data,
  })
}

export async function findByIdWithDetail(prisma: PrismaClient, id: string) {
  return prisma.dayPlan.findUniqueOrThrow({
    where: { id },
    include: dayPlanDetailInclude,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.dayPlan.delete({
    where: { id },
  })
}

export async function countWeekPlanUsages(
  prisma: PrismaClient,
  dayPlanId: string
) {
  const result = await prisma.$queryRawUnsafe<[{ count: number }]>(
    `SELECT COUNT(*)::int as count FROM week_plans WHERE monday_day_plan_id = $1 OR tuesday_day_plan_id = $1 OR wednesday_day_plan_id = $1 OR thursday_day_plan_id = $1 OR friday_day_plan_id = $1 OR saturday_day_plan_id = $1 OR sunday_day_plan_id = $1`,
    dayPlanId
  )
  return result[0]?.count ?? 0
}

// --- DayPlanBreak ---

export async function findBreakById(
  prisma: PrismaClient,
  breakId: string,
  dayPlanId: string
) {
  return prisma.dayPlanBreak.findFirst({
    where: { id: breakId, dayPlanId },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createBreak(prisma: PrismaClient, data: any) {
  return prisma.dayPlanBreak.create({ data })
}

export async function deleteBreak(prisma: PrismaClient, breakId: string) {
  return prisma.dayPlanBreak.delete({
    where: { id: breakId },
  })
}

// --- DayPlanBonus ---

export async function findBonusById(
  prisma: PrismaClient,
  bonusId: string,
  dayPlanId: string
) {
  return prisma.dayPlanBonus.findFirst({
    where: { id: bonusId, dayPlanId },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createBonus(prisma: PrismaClient, data: any) {
  return prisma.dayPlanBonus.create({ data })
}

export async function deleteBonus(prisma: PrismaClient, bonusId: string) {
  return prisma.dayPlanBonus.delete({
    where: { id: bonusId },
  })
}
