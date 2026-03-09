/**
 * Vacation Balances Service
 *
 * Business logic for vacation balance CRUD operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import * as repo from "./vacation-balances-repository"
import { mapBalanceToOutput } from "./vacation-balance-output"

// --- Error Classes ---

export class VacationBalanceNotFoundError extends Error {
  constructor() {
    super("Vacation balance not found")
    this.name = "VacationBalanceNotFoundError"
  }
}

export class VacationBalanceConflictError extends Error {
  constructor() {
    super("Vacation balance already exists for this employee and year")
    this.name = "VacationBalanceConflictError"
  }
}

// --- Helpers ---

/**
 * Builds a Prisma WHERE clause for vacation balance data scope filtering.
 * Vacation balances are scoped via the employee relation.
 */
function buildVacationBalanceDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

// --- Service Functions ---

/**
 * Lists vacation balances with optional filters and data scope.
 * Returns paginated results with { items, total }.
 */
export async function listBalances(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  input: {
    page: number
    pageSize: number
    employeeId?: string
    year?: number
    departmentId?: string
  }
) {
  const where: Record<string, unknown> = { tenantId }
  if (input.employeeId) {
    where.employeeId = input.employeeId
  }
  if (input.year) {
    where.year = input.year
  }
  if (input.departmentId) {
    where.employee = { departmentId: input.departmentId }
  }

  // Apply data scope filtering
  const scopeWhere = buildVacationBalanceDataScopeWhere(dataScope)
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

  const { items, total } = await repo.listBalances(prisma, where, {
    page: input.page,
    pageSize: input.pageSize,
  })

  return {
    items: items.map(mapBalanceToOutput),
    total,
  }
}

/**
 * Returns a single vacation balance by ID.
 */
export async function getBalanceById(
  prisma: PrismaClient,
  tenantId: string,
  balanceId: string
) {
  const balance = await repo.findBalanceByIdAndTenant(prisma, tenantId, balanceId)
  if (!balance) {
    throw new VacationBalanceNotFoundError()
  }

  return mapBalanceToOutput(balance)
}

/**
 * Creates a new vacation balance.
 * Returns CONFLICT if a balance already exists for the employee/year.
 */
export async function createBalance(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    year: number
    entitlement: number
    carryover: number
    adjustments: number
    carryoverExpiresAt?: Date | null
  }
) {
  const existing = await repo.findBalanceByEmployeeAndYear(
    prisma,
    tenantId,
    input.employeeId,
    input.year
  )
  if (existing) {
    throw new VacationBalanceConflictError()
  }

  const balance = await repo.createBalance(prisma, {
    tenantId,
    employeeId: input.employeeId,
    year: input.year,
    entitlement: input.entitlement,
    carryover: input.carryover,
    adjustments: input.adjustments,
    taken: 0,
    carryoverExpiresAt: input.carryoverExpiresAt ?? null,
  })

  return mapBalanceToOutput(balance)
}

/**
 * Partially updates an existing vacation balance.
 */
export async function updateBalance(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    entitlement?: number
    carryover?: number
    adjustments?: number
    carryoverExpiresAt?: Date | null
  }
) {
  const existing = await repo.findBalanceByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new VacationBalanceNotFoundError()
  }

  const data: Prisma.VacationBalanceUpdateInput = {}
  if (input.entitlement !== undefined) {
    data.entitlement = input.entitlement
  }
  if (input.carryover !== undefined) {
    data.carryover = input.carryover
  }
  if (input.adjustments !== undefined) {
    data.adjustments = input.adjustments
  }
  if (input.carryoverExpiresAt !== undefined) {
    data.carryoverExpiresAt = input.carryoverExpiresAt
  }

  const balance = await repo.updateBalance(prisma, input.id, data)

  return mapBalanceToOutput(balance)
}
