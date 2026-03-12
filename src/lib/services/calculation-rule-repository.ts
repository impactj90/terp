/**
 * Calculation Rule Repository
 *
 * Pure Prisma data-access functions for the CalculationRule model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.calculationRule.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.calculationRule.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.calculationRule.findFirst({
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
    accountId?: string
    value: number
    factor: Prisma.Decimal | number
    isActive: boolean
  }
) {
  return prisma.calculationRule.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.calculationRule.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.calculationRule.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.calculationRule.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countAbsenceTypeUsages(
  prisma: PrismaClient,
  calculationRuleId: string
) {
  const result = await prisma.$queryRawUnsafe<[{ count: number }]>(
    `SELECT COUNT(*)::int as count FROM absence_types WHERE calculation_rule_id = $1`,
    calculationRuleId
  )
  return result[0]?.count ?? 0
}
