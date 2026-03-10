/**
 * Account Repository
 *
 * Pure Prisma data-access functions for the Account model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    includeSystem?: boolean
    active?: boolean
    accountType?: string
    payrollRelevant?: boolean
  }
) {
  const where: Record<string, unknown> = {}

  if (params?.includeSystem) {
    // Include both tenant-specific and system accounts (tenantId IS NULL)
    where.OR = [{ tenantId }, { tenantId: null }]
  } else {
    where.tenantId = tenantId
  }

  if (params?.active !== undefined) {
    where.isActive = params.active
  }

  if (params?.accountType) {
    where.accountType = params.accountType
  }

  if (params?.payrollRelevant !== undefined) {
    where.isPayrollRelevant = params.payrollRelevant
  }

  return prisma.account.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.account.findFirst({
    where: {
      id,
      OR: [{ tenantId }, { tenantId: null }],
    },
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
  return prisma.account.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    accountType: string
    unit: string
    displayFormat: string
    description: string | null
    isPayrollRelevant: boolean
    payrollCode: string | null
    sortOrder: number
    yearCarryover: boolean
    accountGroupId: string | null
    isActive: boolean
    bonusFactor: number | null
  }
) {
  return prisma.account.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.account.update({
    where: { id },
    data,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.account.delete({
    where: { id },
  })
}

export async function findDayPlanUsage(
  prisma: PrismaClient,
  tenantId: string,
  accountId: string
) {
  return prisma.$queryRaw<{ id: string; code: string; name: string }[]>`
    SELECT DISTINCT dp.id, dp.code, dp.name
    FROM day_plans dp
    WHERE dp.tenant_id = ${tenantId}::uuid
    AND (
      dp.id IN (SELECT day_plan_id FROM day_plan_bonuses WHERE account_id = ${accountId}::uuid)
      OR dp.net_account_id = ${accountId}::uuid
      OR dp.cap_account_id = ${accountId}::uuid
    )
    ORDER BY dp.code ASC
  `
}
