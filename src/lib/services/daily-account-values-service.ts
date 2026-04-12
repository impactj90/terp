/**
 * Daily Account Values Service
 *
 * Business logic for daily account value retrieval.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./daily-account-values-repository"
import type { DailyAccountValueListParams, AccountValueSummaryParams } from "./daily-account-values-repository"

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
  params?: DailyAccountValueListParams,
  scopeWhere?: Record<string, unknown> | null
) {
  const items = await repo.findMany(prisma, tenantId, params, scopeWhere)

  return {
    items: items.map(mapToOutput),
  }
}

export async function summaryByEmployee(
  prisma: PrismaClient,
  tenantId: string,
  params: AccountValueSummaryParams,
  scopeWhere?: Record<string, unknown> | null
) {
  const grouped = await repo.summarizeByEmployee(prisma, tenantId, params, scopeWhere)

  const employeeIds = grouped.map((g) => g.employeeId)

  if (employeeIds.length === 0) {
    return { items: [], totalMinutes: 0 }
  }

  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, tenantId },
    select: {
      id: true,
      personnelNumber: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  })

  const employeeMap = new Map(employees.map((e) => [e.id, e]))

  const items = grouped
    .map((g) => {
      const emp = employeeMap.get(g.employeeId)
      return {
        employeeId: g.employeeId,
        personnelNumber: emp?.personnelNumber ?? '',
        firstName: emp?.firstName ?? '',
        lastName: emp?.lastName ?? '',
        departmentName: emp?.department?.name ?? '',
        locationName: emp?.location?.name ?? '',
        totalMinutes: g._sum.valueMinutes ?? 0,
      }
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))

  const totalMinutes = items.reduce((sum, i) => sum + i.totalMinutes, 0)

  return { items, totalMinutes }
}
