/**
 * Extended Travel Rule Repository
 *
 * Pure Prisma data-access functions for the ExtendedTravelRule model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { ruleSetId?: string }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.ruleSetId) {
    where.ruleSetId = params.ruleSetId
  }

  return prisma.extendedTravelRule.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.extendedTravelRule.findFirst({
    where: { id, tenantId },
  })
}

export async function findRuleSetById(
  prisma: PrismaClient,
  tenantId: string,
  ruleSetId: string
) {
  return prisma.travelAllowanceRuleSet.findFirst({
    where: { id: ruleSetId, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    ruleSetId: string
    arrivalDayTaxFree: number
    arrivalDayTaxable: number
    departureDayTaxFree: number
    departureDayTaxable: number
    intermediateDayTaxFree: number
    intermediateDayTaxable: number
    threeMonthEnabled: boolean
    threeMonthTaxFree: number
    threeMonthTaxable: number
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.extendedTravelRule.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.extendedTravelRule.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.extendedTravelRule.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.extendedTravelRule.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
