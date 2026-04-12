/**
 * Travel Allowance Rule Set Repository
 *
 * Pure Prisma data-access functions for the TravelAllowanceRuleSet model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function findMany(prisma: PrismaClient, tenantId: string) {
  return prisma.travelAllowanceRuleSet.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.travelAllowanceRuleSet.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.travelAllowanceRuleSet.findFirst({
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
    validFrom: Date | null
    validTo: Date | null
    calculationBasis: string
    distanceRule: string
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.travelAllowanceRuleSet.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.travelAllowanceRuleSet, { id, tenantId }, data, {
    entity: "TravelAllowanceRuleSet",
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.travelAllowanceRuleSet.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
