/**
 * Daily Account Values Repository
 *
 * Pure Prisma data-access functions for the DailyAccountValue model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export interface DailyAccountValueListParams {
  employeeId?: string
  accountId?: string
  fromDate?: string
  toDate?: string
  source?: "net_time" | "capped_time" | "surcharge"
}

const dailyAccountValueInclude = {
  account: {
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      unit: true,
      isSystem: true,
      isActive: true,
    },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: DailyAccountValueListParams,
  scopeWhere?: Record<string, unknown> | null
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.employeeId) {
    where.employeeId = params.employeeId
  }

  if (params?.accountId) {
    where.accountId = params.accountId
  }

  if (params?.source) {
    where.source = params.source
  }

  if (params?.fromDate || params?.toDate) {
    const valueDate: Record<string, unknown> = {}
    if (params?.fromDate) {
      valueDate.gte = new Date(params.fromDate)
    }
    if (params?.toDate) {
      valueDate.lte = new Date(params.toDate)
    }
    where.valueDate = valueDate
  }

  if (scopeWhere) {
    if (scopeWhere.employee && where.employee) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        ...((scopeWhere.employee as Record<string, unknown>) || {}),
      }
    } else {
      Object.assign(where, scopeWhere)
    }
  }

  return prisma.dailyAccountValue.findMany({
    where,
    include: dailyAccountValueInclude,
    orderBy: [{ valueDate: "asc" }, { source: "asc" }],
  })
}
