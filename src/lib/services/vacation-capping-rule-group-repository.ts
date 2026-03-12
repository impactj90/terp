/**
 * Vacation Capping Rule Group Repository
 *
 * Pure Prisma data-access functions for the VacationCappingRuleGroup model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const ruleGroupDetailInclude = {
  cappingRuleLinks: {
    include: {
      cappingRule: {
        select: {
          id: true,
          code: true,
          name: true,
          ruleType: true,
          capValue: true,
        },
      },
    },
  },
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

  return prisma.vacationCappingRuleGroup.findMany({
    where,
    include: ruleGroupDetailInclude,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.vacationCappingRuleGroup.findFirst({
    where: { id, tenantId },
    include: ruleGroupDetailInclude,
  })
}

export async function findByIdSimple(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.vacationCappingRuleGroup.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.vacationCappingRuleGroup.findFirst({
    where: { tenantId, code },
  })
}

export async function createWithLinks(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
  },
  cappingRuleIds?: string[]
) {
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.vacationCappingRuleGroup.create({ data })

    if (cappingRuleIds && cappingRuleIds.length > 0) {
      await tx.vacationCappingRuleGroupRule.createMany({
        data: cappingRuleIds.map((ruleId) => ({
          groupId: created.id,
          cappingRuleId: ruleId,
        })),
      })
    }

    return created
  })

  return group
}

export async function updateWithLinks(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
  cappingRuleIds?: string[]
) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.vacationCappingRuleGroup.updateMany({
      where: { id, tenantId },
      data,
    })
    if (count === 0) {
      throw new Error("Vacation capping rule group not found")
    }

    // Replace junction entries if IDs provided
    if (cappingRuleIds !== undefined) {
      await tx.vacationCappingRuleGroupRule.deleteMany({
        where: { groupId: id },
      })
      if (cappingRuleIds.length > 0) {
        await tx.vacationCappingRuleGroupRule.createMany({
          data: cappingRuleIds.map((ruleId) => ({
            groupId: id,
            cappingRuleId: ruleId,
          })),
        })
      }
    }
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.vacationCappingRuleGroup.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countTariffUsage(
  prisma: PrismaClient,
  groupId: string
) {
  return prisma.tariff.count({
    where: { vacationCappingRuleGroupId: groupId },
  })
}

export async function findCappingRules(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[]
) {
  return prisma.vacationCappingRule.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true },
  })
}
