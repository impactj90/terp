/**
 * Vacation Balances Service
 *
 * Business logic for vacation balance CRUD operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope } from "@/lib/auth/data-scope"
import * as repo from "./vacation-balances-repository"
import { mapBalanceToOutput } from "./vacation-balance-output"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit Constants ---

const ENTITY_TYPE = "vacation_balance"
const TRACKED_FIELDS = ["entitlement", "carryover", "adjustments", "carryoverExpiresAt"]

// --- Error Classes ---

export class VacationBalanceNotFoundError extends Error {
  constructor() {
    super("Vacation balance not found")
    this.name = "VacationBalanceNotFoundError"
  }
}

export class VacationBalanceConflictError extends Error {
  constructor(message = "Vacation balance already exists for this employee and year") {
    super(message)
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

// --- Initialize Functions ---

/**
 * Initializes vacation balances for all active employees for a given year.
 * Optionally carries over balances from the previous year.
 *
 * Port of Go VacationBalanceHandler.Initialize + VacationService.InitializeYear
 */
export async function initializeBalances(
  prisma: PrismaClient,
  tenantId: string,
  input: { year: number; carryover?: boolean }
) {
  const year = input.year
  const doCarryover = input.carryover ?? true

  // Get all active employees for tenant
  const employees = await prisma.employee.findMany({
    where: { tenantId, isActive: true, deletedAt: null },
    select: { id: true },
  })

  // Batch-fetch existing balances to avoid N+1
  const empIds = employees.map((e) => e.id)
  const existingBalances = await prisma.vacationBalance.findMany({
    where: { tenantId, employeeId: { in: empIds }, year },
    select: { employeeId: true },
  })
  const existingSet = new Set(existingBalances.map((b) => b.employeeId))

  // Batch-fetch previous-year and current-year balances to avoid N+1 in carryover
  const prevYearBalances = doCarryover
    ? await repo.findBalancesByTenantAndYear(prisma, tenantId, year - 1)
    : []
  const prevBalanceMap = new Map(prevYearBalances.map((b) => [b.employeeId, b]))

  const currentYearBalances = doCarryover
    ? await repo.findBalancesByTenantAndYear(prisma, tenantId, year)
    : []
  const currentBalanceMap = new Map(
    currentYearBalances.map((b) => [b.employeeId, b])
  )

  let createdCount = 0
  for (const emp of employees) {
    try {
      // Wrap carryover + balance creation in a transaction to ensure atomicity
      // per employee (prevents partial state if one operation fails or races)
      await prisma.$transaction(async (tx) => {
        // Optionally carryover from previous year using pre-fetched balances
        if (doCarryover) {
          await carryoverFromPreviousYearBatch(
            tx as PrismaClient,
            tenantId,
            emp.id,
            year,
            prevBalanceMap,
            currentBalanceMap
          )
        }

        // Create balance if it doesn't exist
        if (!existingSet.has(emp.id)) {
          await repo.createBalance(tx as PrismaClient, {
            tenantId,
            employeeId: emp.id,
            year,
            entitlement: 0,
            carryover: 0,
            adjustments: 0,
            taken: 0,
            carryoverExpiresAt: null,
          })
          createdCount++
        }
      })
    } catch {
      // Continue on individual errors (matches Go behavior)
    }
  }

  return {
    message: "Vacation balances initialized",
    createdCount,
  }
}

/**
 * Carries over available balance from previous year to current year.
 * Batch-optimized version: uses pre-fetched balance maps instead of individual DB queries.
 */
async function carryoverFromPreviousYearBatch(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  prevBalanceMap: Map<string, { entitlement: unknown; carryover: unknown; adjustments: unknown; taken: unknown }>,
  currentBalanceMap: Map<string, { id: string }>
) {
  const prevBalance = prevBalanceMap.get(employeeId)
  if (!prevBalance) return

  // Calculate available = entitlement + carryover + adjustments - taken using Decimal arithmetic
  const entitlement = new Prisma.Decimal(prevBalance.entitlement as string | number)
  const carryover = new Prisma.Decimal(prevBalance.carryover as string | number)
  const adjustments = new Prisma.Decimal(prevBalance.adjustments as string | number)
  const taken = new Prisma.Decimal(prevBalance.taken as string | number)
  const available = entitlement.plus(carryover).plus(adjustments).minus(taken)

  if (available.lte(0)) return

  // Atomically create or update the current year balance with carryover
  await prisma.vacationBalance.upsert({
    where: {
      employeeId_year: { employeeId, year },
    },
    create: {
      tenantId,
      employeeId,
      year,
      entitlement: 0,
      carryover: available,
      adjustments: 0,
      taken: 0,
      carryoverExpiresAt: null,
    },
    update: {
      carryover: available,
    },
  })
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
  balanceId: string,
  dataScope?: DataScope
) {
  const balance = await repo.findBalanceByIdAndTenant(prisma, tenantId, balanceId)
  if (!balance) {
    throw new VacationBalanceNotFoundError()
  }

  // Check data scope
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, balance as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Vacation balance")
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
  },
  dataScope?: DataScope,
  audit?: AuditContext
) {
  // Check data scope on target employee
  if (dataScope) {
    const emp = await prisma.employee.findFirst({
      where: { id: input.employeeId, tenantId },
      select: { id: true, departmentId: true },
    })
    if (emp) {
      checkRelatedEmployeeDataScope(
        dataScope,
        { employeeId: emp.id, employee: { departmentId: emp.departmentId } },
        "Vacation balance"
      )
    }
  }

  try {
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

    // Never throws — audit failures must not block the actual operation
    if (audit) {
      await auditLog.log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: (balance as unknown as Record<string, unknown>).id as string,
        entityName: `${input.year}`,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err));
    }

    return mapBalanceToOutput(balance)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new VacationBalanceConflictError("Vacation balance already exists for this employee and year")
    }
    throw err
  }
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
  },
  dataScope?: DataScope,
  audit?: AuditContext
) {
  const existing = await repo.findBalanceByIdAndTenant(prisma, tenantId, input.id)
  if (!existing) {
    throw new VacationBalanceNotFoundError()
  }

  // Check data scope
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, existing as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Vacation balance")
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

  const balance = await repo.updateBalance(prisma, tenantId, input.id, data)

  // Never throws — audit failures must not block the actual operation
  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      balance as unknown as Record<string, unknown>,
      TRACKED_FIELDS,
    );
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: input.id,
      entityName: `${(existing as unknown as Record<string, unknown>).year}`,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err));
  }

  return mapBalanceToOutput(balance)
}
