/**
 * Vacation Balances Repository
 *
 * Pure Prisma query functions for vacation balance data access.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { employeeSelect } from "./vacation-balance-output"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

/**
 * Lists vacation balances with pagination and filtering.
 * Returns [items, total].
 */
export async function listBalances(
  prisma: PrismaClient,
  where: Record<string, unknown>,
  opts: { page: number; pageSize: number }
) {
  const [items, total] = await Promise.all([
    prisma.vacationBalance.findMany({
      where,
      include: { employee: { select: employeeSelect } },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      orderBy: { year: "desc" },
    }),
    prisma.vacationBalance.count({ where }),
  ])

  return { items, total }
}

/**
 * Finds a single vacation balance by ID within a tenant, including employee.
 */
export async function findBalanceByIdAndTenant(
  prisma: PrismaClient,
  tenantId: string,
  balanceId: string
) {
  return prisma.vacationBalance.findFirst({
    where: { id: balanceId, tenantId },
    include: { employee: { select: employeeSelect } },
  })
}

/**
 * Finds a vacation balance by employee/year/tenant (for uniqueness check).
 */
export async function findBalanceByEmployeeAndYear(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
) {
  return prisma.vacationBalance.findFirst({
    where: { employeeId, year, tenantId },
  })
}

/**
 * Creates a new vacation balance.
 */
export async function createBalance(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    year: number
    entitlement: number
    carryover: number
    adjustments: number
    taken: number
    carryoverExpiresAt: Date | null
  }
) {
  return prisma.vacationBalance.create({
    data,
    include: { employee: { select: employeeSelect } },
  })
}

/**
 * Finds a vacation balance by ID within a tenant (without employee include).
 */
export async function findBalanceByIdSimple(
  prisma: PrismaClient,
  tenantId: string,
  balanceId: string
) {
  return prisma.vacationBalance.findFirst({
    where: { id: balanceId, tenantId },
  })
}

/**
 * Finds all vacation balances for a tenant and year.
 * Used for batch operations to avoid N+1 queries.
 */
export async function findBalancesByTenantAndYear(
  prisma: PrismaClient,
  tenantId: string,
  year: number
) {
  return prisma.vacationBalance.findMany({
    where: { tenantId, year },
  })
}

/**
 * Updates a vacation balance by ID with partial data.
 */
export async function updateBalance(
  prisma: PrismaClient,
  tenantId: string,
  balanceId: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.vacationBalance, { id: balanceId, tenantId }, data, {
    include: { employee: { select: employeeSelect } },
    entity: "VacationBalance",
  })
}
