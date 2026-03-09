/**
 * Daily Account Values Service
 *
 * Business logic for daily account value retrieval.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./daily-account-values-repository"
import type { DailyAccountValueListParams } from "./daily-account-values-repository"

// --- Mapper ---

function mapToOutput(item: {
  id: string
  tenantId: string
  employeeId: string
  accountId: string
  valueDate: Date
  valueMinutes: number
  source: string
  dayPlanId: string | null
  createdAt: Date
  updatedAt: Date
  account: {
    id: string
    code: string
    name: string
    accountType: string
    unit: string
    isSystem: boolean
    isActive: boolean
  } | null
}) {
  return {
    id: item.id,
    tenantId: item.tenantId,
    employeeId: item.employeeId,
    accountId: item.accountId,
    valueDate: item.valueDate,
    valueMinutes: item.valueMinutes,
    source: item.source,
    dayPlanId: item.dayPlanId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    account: item.account
      ? {
          id: item.account.id,
          code: item.account.code,
          name: item.account.name,
          accountType: item.account.accountType,
          unit: item.account.unit,
          isSystem: item.account.isSystem,
          isActive: item.account.isActive,
        }
      : null,
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: DailyAccountValueListParams
) {
  const items = await repo.findMany(prisma, tenantId, params)

  return {
    items: items.map(mapToOutput),
  }
}
