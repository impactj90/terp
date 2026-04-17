/**
 * Day Plans Repository
 *
 * Pure Prisma data-access functions for the DayPlan, DayPlanBreak,
 * and DayPlanBonus models.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

const dayPlanDetailInclude = {
  breaks: { orderBy: { sortOrder: "asc" as const } },
  bonuses: {
    orderBy: { sortOrder: "asc" as const },
    include: { account: { select: { id: true, code: true, name: true } } },
  },
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
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.dayPlan, { id, tenantId }, data, { entity: "DayPlan" })
}

export async function findByIdWithDetail(prisma: PrismaClient, tenantId: string, id: string) {
  return prisma.dayPlan.findFirst({
    where: { id, tenantId },
    include: dayPlanDetailInclude,
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.dayPlan.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countWeekPlanUsages(
  prisma: PrismaClient,
  tenantId: string,
  dayPlanId: string
) {
  const result = await prisma.$queryRaw<[{ count: number }]>`
    SELECT COUNT(*)::int as count FROM week_plans WHERE (monday_day_plan_id = ${dayPlanId} OR tuesday_day_plan_id = ${dayPlanId} OR wednesday_day_plan_id = ${dayPlanId} OR thursday_day_plan_id = ${dayPlanId} OR friday_day_plan_id = ${dayPlanId} OR saturday_day_plan_id = ${dayPlanId} OR sunday_day_plan_id = ${dayPlanId}) AND tenant_id = ${tenantId}
  `
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

export async function updateBonus(
  prisma: PrismaClient,
  bonusId: string,
  data: Record<string, unknown>,
) {
  return prisma.dayPlanBonus.update({
    where: { id: bonusId },
    data,
  })
}

export async function deleteBonus(prisma: PrismaClient, bonusId: string) {
  return prisma.dayPlanBonus.delete({
    where: { id: bonusId },
  })
}
