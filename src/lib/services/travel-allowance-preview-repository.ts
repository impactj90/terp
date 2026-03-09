/**
 * Travel Allowance Preview Repository
 *
 * Pure Prisma query functions for travel allowance preview data access.
 */
import type { PrismaClient } from "@/generated/prisma/client"

/**
 * Finds a travel allowance rule set by ID within a tenant.
 */
export async function findRuleSetByIdAndTenant(
  prisma: PrismaClient,
  tenantId: string,
  ruleSetId: string
) {
  return prisma.travelAllowanceRuleSet.findFirst({
    where: { id: ruleSetId, tenantId },
  })
}

/**
 * Lists active local travel rules for a rule set, sorted by sortOrder/minDistanceKm.
 */
export async function listActiveLocalRules(
  prisma: PrismaClient,
  ruleSetId: string
) {
  return prisma.localTravelRule.findMany({
    where: { ruleSetId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { minDistanceKm: "asc" }],
  })
}

/**
 * Lists active extended travel rules for a rule set, sorted by sortOrder.
 */
export async function listActiveExtendedRules(
  prisma: PrismaClient,
  ruleSetId: string
) {
  return prisma.extendedTravelRule.findMany({
    where: { ruleSetId, isActive: true },
    orderBy: [{ sortOrder: "asc" }],
  })
}
