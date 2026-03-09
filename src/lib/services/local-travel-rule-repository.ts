/**
 * Local Travel Rule Repository
 *
 * Pure Prisma data-access functions for the LocalTravelRule model.
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

  return prisma.localTravelRule.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { minDistanceKm: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.localTravelRule.findFirst({
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
    minDistanceKm: number
    maxDistanceKm: number | null
    minDurationMinutes: number
    maxDurationMinutes: number | null
    taxFreeAmount: number
    taxableAmount: number
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.localTravelRule.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.localTravelRule.update({
    where: { id },
    data,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.localTravelRule.delete({
    where: { id },
  })
}
