/**
 * Vacation Capping Rule Repository
 *
 * Pure Prisma data-access functions for the VacationCappingRule model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; ruleType?: string }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params?.ruleType !== undefined) {
    where.ruleType = params.ruleType
  }

  return prisma.vacationCappingRule.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.vacationCappingRule.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.vacationCappingRule.findFirst({
    where: { tenantId, code },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    ruleType: string
    cutoffMonth: number
    cutoffDay: number
    capValue: Prisma.Decimal | number
    isActive: boolean
  }
) {
  return prisma.vacationCappingRule.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.vacationCappingRule.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.vacationCappingRule.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countGroupRuleUsages(
  prisma: PrismaClient,
  cappingRuleId: string
) {
  return prisma.vacationCappingRuleGroupRule.count({
    where: { cappingRuleId },
  })
}
