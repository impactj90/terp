/**
 * Monthly Values Service
 *
 * Business logic for monthly value operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import {
  buildRelatedEmployeeDataScopeWhere,
  checkRelatedEmployeeDataScope,
} from "@/lib/auth/data-scope"
import { mapWithConcurrency } from "@/lib/async"
import { MonthlyCalcService } from "./monthly-calc"
import * as repo from "./monthly-values-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import {
  calculatePayout,
  resolveEffectiveRule,
  buildTariffRuleSnapshot,
} from "./overtime-payout-service"
import * as overtimePayoutRepo from "./overtime-payout-repository"
import * as overrideRepo from "./employee-overtime-payout-override-repository"

// --- Error Classes ---

export class MonthlyValueNotFoundError extends Error {
  constructor(message = "Monthly value not found") {
    super(message)
    this.name = "MonthlyValueNotFoundError"
  }
}

export class MonthlyValueValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MonthlyValueValidationError"
  }
}

async function attachPayoutSummaries<
  T extends { employeeId: string; year: number; month: number }
>(
  prisma: PrismaClient,
  tenantId: string,
  items: T[],
): Promise<Array<T & { overtimePayout: { id: string; payoutMinutes: number; status: string } | null }>> {
  if (items.length === 0) {
    return []
  }

  const employeeIds = Array.from(new Set(items.map((item) => item.employeeId)))
  const year = items[0]?.year
  const month = items[0]?.month

  if (!year || !month) {
    return items.map((item) => ({ ...item, overtimePayout: null }))
  }

  const payoutByEmployee = await overtimePayoutRepo.batchFindByEmployeeMonth(
    prisma,
    tenantId,
    employeeIds,
    year,
    month,
  )

  return items.map((item) => ({
    ...item,
    overtimePayout: payoutByEmployee.get(item.employeeId) ?? null,
  }))
}

// --- Service Functions ---

export async function forEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number
) {
  const monthlyCalcService = new MonthlyCalcService(prisma, tenantId)
  return monthlyCalcService.getMonthSummary(employeeId, year, month)
}

export async function yearOverview(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
) {
  const monthlyCalcService = new MonthlyCalcService(prisma, tenantId)
  return monthlyCalcService.getYearOverview(employeeId, year)
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    year: number
    month: number
    page?: number
    pageSize?: number
    status?: "open" | "calculated" | "closed"
    departmentId?: string
    employeeId?: string
    dataScopeWhere?: Record<string, unknown> | null
  }
) {
  // If filtering by "closed" status only, no need to find missing employees
  if (params.status === "closed") {
    const result = await repo.findMany(prisma, tenantId, params)
    return {
      ...result,
      items: await attachPayoutSummaries(prisma, tenantId, result.items),
    }
  }

  // Get existing monthly values (unpaginated to merge with missing employees)
  const { items: existingItems } = await repo.findMany(prisma, tenantId, {
    ...params,
    page: 1,
    pageSize: 10000,
  })

  // Find active employees that are missing monthly values for this month
  const empWhere: Record<string, unknown> = { tenantId, isActive: true }
  if (params.departmentId) empWhere.departmentId = params.departmentId
  if (params.employeeId) empWhere.id = params.employeeId
  // Apply data scope
  if (params.dataScopeWhere) {
    const dsEmployee = params.dataScopeWhere.employee as Record<string, unknown> | undefined
    if (dsEmployee) {
      empWhere.departmentId = empWhere.departmentId ?? dsEmployee.departmentId
      if (dsEmployee.id) empWhere.id = empWhere.id ?? dsEmployee.id
    }
  }

  const activeEmployees = await prisma.employee.findMany({
    where: empWhere,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
    },
  })

  const existingEmployeeIds = new Set(existingItems.map((mv) => mv.employeeId))
  const missingEmployees = activeEmployees.filter((e) => !existingEmployeeIds.has(e.id))

  // Create synthetic "open" entries for missing employees
  const now = new Date()
  const syntheticItems = missingEmployees.map((emp) => ({
    id: `missing-${emp.id}-${params.year}-${params.month}`,
    tenantId,
    employeeId: emp.id,
    year: params.year,
    month: params.month,
    isClosed: false,
    totalGrossTime: 0,
    totalNetTime: 0,
    totalTargetTime: 0,
    totalOvertime: 0,
    totalUndertime: 0,
    totalBreakTime: 0,
    flextimeStart: 0,
    flextimeChange: 0,
    flextimeEnd: 0,
    flextimeCarryover: 0,
    vacationTaken: 0,
    sickDays: 0,
    otherAbsenceDays: 0,
    workDays: 0,
    daysWithErrors: 0,
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    createdAt: now,
    updatedAt: now,
    employee: emp,
  }))

  const allItems = [...existingItems, ...syntheticItems]

  // Apply pagination
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50
  const start = (page - 1) * pageSize
  const paginatedItems = allItems.slice(start, start + pageSize)

  return {
    items: await attachPayoutSummaries(prisma, tenantId, paginatedItems),
    total: allItems.length,
  }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const mv = await repo.findById(prisma, tenantId, id)
  if (!mv) {
    throw new MonthlyValueNotFoundError()
  }

  const payout = await overtimePayoutRepo.findByEmployeeMonth(
    prisma,
    tenantId,
    mv.employeeId,
    mv.year,
    mv.month,
  )

  return {
    ...mv,
    overtimePayout: payout
      ? {
          id: payout.id,
          payoutMinutes: payout.payoutMinutes,
          status: payout.status,
        }
      : null,
  }
}

async function createPayoutForClosedMonth(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number,
  userId: string,
  tariffData?: {
    overtimePayoutEnabled: boolean
    overtimePayoutThresholdMinutes: number | null
    overtimePayoutMode: string | null
    overtimePayoutPercentage: number | null
    overtimePayoutFixedMinutes: number | null
    overtimePayoutApprovalRequired: boolean
  } | null,
  overrideData?: { overtimePayoutEnabled: boolean; overtimePayoutMode: string | null; isActive: boolean } | null,
): Promise<{ status: "approved" | "pending" | null; payoutMinutes: number }> {
  let tariff = tariffData
  if (!tariff) {
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { tariffId: true },
    })
    if (!emp?.tariffId) return { status: null, payoutMinutes: 0 }
    const t = await prisma.tariff.findFirst({
      where: { id: emp.tariffId, tenantId },
      select: {
        overtimePayoutEnabled: true,
        overtimePayoutThresholdMinutes: true,
        overtimePayoutMode: true,
        overtimePayoutPercentage: true,
        overtimePayoutFixedMinutes: true,
        overtimePayoutApprovalRequired: true,
      },
    })
    if (!t) return { status: null, payoutMinutes: 0 }
    tariff = t
  }

  let override = overrideData
  if (override === undefined) {
    override = await overrideRepo.findByEmployeeId(prisma, tenantId, employeeId) ?? null
  }

  const rule = resolveEffectiveRule(tariff, override)
  if (!rule.overtimePayoutEnabled) return { status: null, payoutMinutes: 0 }

  const mv = await prisma.monthlyValue.findFirst({
    where: { employeeId, year, month, tenantId },
    select: { id: true, flextimeEnd: true },
  })
  if (!mv) return { status: null, payoutMinutes: 0 }

  const { payoutMinutes } = calculatePayout(mv.flextimeEnd, rule)
  if (payoutMinutes === 0) return { status: null, payoutMinutes: 0 }

  const snapshot = buildTariffRuleSnapshot(rule) as unknown as Prisma.InputJsonValue

  if (!rule.overtimePayoutApprovalRequired) {
    await prisma.$transaction(async (tx) => {
      await (tx as unknown as PrismaClient).overtimePayout.create({
        data: {
          tenantId,
          employeeId,
          year,
          month,
          payoutMinutes,
          status: "approved",
          sourceFlextimeEnd: mv.flextimeEnd,
          tariffRuleSnapshot: snapshot,
          approvedBy: userId,
          approvedAt: new Date(),
        },
      })
      await (tx as unknown as PrismaClient).monthlyValue.update({
        where: { id: mv.id },
        data: {
          flextimeEnd: mv.flextimeEnd - payoutMinutes,
          flextimeCarryover: mv.flextimeEnd - payoutMinutes,
        },
      })
    })
    return { status: "approved", payoutMinutes }
  } else {
    await overtimePayoutRepo.create(prisma, {
      tenantId,
      employeeId,
      year,
      month,
      payoutMinutes,
      status: "pending",
      sourceFlextimeEnd: mv.flextimeEnd,
      tariffRuleSnapshot: snapshot,
    })
    return { status: "pending", payoutMinutes }
  }
}

export async function close(
  prisma: PrismaClient,
  tenantId: string,
  input: { id: string } | { employeeId: string; year: number; month: number },
  userId: string,
  dataScope?: DataScope,
  audit?: AuditContext
) {
  // 1. Look up the monthly value
  let mv
  if ("id" in input) {
    mv = await repo.findById(prisma, tenantId, input.id)
  } else {
    mv = await repo.findByEmployeeMonth(
      prisma,
      tenantId,
      input.employeeId,
      input.year,
      input.month
    )
  }

  if (!mv) {
    throw new MonthlyValueNotFoundError()
  }

  // Check data scope
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, mv as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Monthly value")
  }

  // Atomic isClosed guard: reject if already closed (prevents double-close race)
  if (mv.isClosed) {
    throw new MonthlyValueValidationError("Month is already closed")
  }

  // 2. Close via MonthlyCalcService (has its own atomic guard internally)
  const monthlyCalcService = new MonthlyCalcService(prisma, tenantId)
  await monthlyCalcService.closeMonth(mv.employeeId, mv.year, mv.month, userId)

  // 2b. Payout hook — errors collected, not thrown
  try {
    const payoutResult = await createPayoutForClosedMonth(
      prisma,
      tenantId,
      mv.employeeId,
      mv.year,
      mv.month,
      userId,
    )
    if (payoutResult.status === "approved") {
      const nextMonth = mv.month === 12 ? 1 : mv.month + 1
      const nextYear = mv.month === 12 ? mv.year + 1 : mv.year
      await monthlyCalcService.recalculateFromMonth(mv.employeeId, nextYear, nextMonth)
    }
  } catch (payoutErr) {
    console.error(`[OvertimePayout] Failed for employee ${mv.employeeId}:`, payoutErr)
  }

  // 3. Re-fetch and return updated record
  const updated = await repo.findById(prisma, tenantId, mv.id)

  // Never throws — audit failures must not block the actual operation
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "close",
      entityType: "monthly_values",
      entityId: mv.id,
      entityName: `${mv.year}-${mv.month}`,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated!
}

export async function reopen(
  prisma: PrismaClient,
  tenantId: string,
  input: { id: string } | { employeeId: string; year: number; month: number },
  userId: string,
  dataScope?: DataScope
) {
  // 1. Look up the monthly value
  let mv
  if ("id" in input) {
    mv = await repo.findById(prisma, tenantId, input.id)
  } else {
    mv = await repo.findByEmployeeMonth(
      prisma,
      tenantId,
      input.employeeId,
      input.year,
      input.month
    )
  }

  if (!mv) {
    throw new MonthlyValueNotFoundError()
  }

  // Check data scope
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, mv as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Monthly value")
  }

  // Atomic isClosed guard: reject if not closed (prevents double-reopen race)
  if (!mv.isClosed) {
    throw new MonthlyValueValidationError("Month is not closed")
  }

  // 2a. Restore flextimeEnd if an approved payout reduced it, then delete payout
  const existingPayout = await overtimePayoutRepo.findByEmployeeMonth(
    prisma, tenantId, mv.employeeId, mv.year, mv.month,
  )
  if (existingPayout) {
    if (existingPayout.status === "approved") {
      await prisma.monthlyValue.update({
        where: { id: mv.id },
        data: {
          flextimeEnd: existingPayout.sourceFlextimeEnd,
          flextimeCarryover: existingPayout.sourceFlextimeEnd,
        },
      })
    }
    await overtimePayoutRepo.deleteByEmployeeMonth(
      prisma, tenantId, mv.employeeId, mv.year, mv.month,
    )
  }

  // 2b. Reopen via MonthlyCalcService (has its own atomic guard internally)
  const monthlyCalcService = new MonthlyCalcService(prisma, tenantId)
  await monthlyCalcService.reopenMonth(
    mv.employeeId,
    mv.year,
    mv.month,
    userId
  )

  // Recalculate subsequent open months so their carryover reflects the restored balance.
  try {
    const nextMonth = mv.month === 12 ? 1 : mv.month + 1
    const nextYear = mv.month === 12 ? mv.year + 1 : mv.year
    await monthlyCalcService.recalculateFromMonth(mv.employeeId, nextYear, nextMonth)
  } catch (recalcErr) {
    console.error(`[OvertimePayout] Recalc failed after reopen for ${mv.employeeId}:`, recalcErr)
  }

  // 3. Re-fetch and return updated record
  const updated = await repo.findById(prisma, tenantId, mv.id)
  return updated!
}

export async function closeBatch(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    year: number
    month: number
    employeeIds?: string[]
    departmentId?: string
    recalculate?: boolean
  },
  userId: string,
  dataScope?: DataScope,
  audit?: AuditContext
) {
  const { year, month, recalculate } = input

  // 1. Determine which employees to close
  let employeeIds = input.employeeIds ?? []
  if (employeeIds.length === 0) {
    employeeIds = await repo.findActiveEmployeeIds(
      prisma,
      tenantId,
      input.departmentId
    )
  }

  // Apply data scope filter to employee IDs
  if (dataScope) {
    const scopeWhere = buildRelatedEmployeeDataScopeWhere(dataScope)
    if (scopeWhere) {
      // Re-filter employee list through data scope
      const scopedEmployees = await prisma.employee.findMany({
        where: {
          id: { in: employeeIds },
          tenantId,
          ...(dataScope.type === "department"
            ? { departmentId: { in: dataScope.departmentIds } }
            : dataScope.type === "employee"
              ? { id: { in: dataScope.employeeIds } }
              : {}),
        },
        select: { id: true },
      })
      employeeIds = scopedEmployees.map((e) => e.id)
    }
  }

  // 2. Calculate monthly values for employees that need it
  const monthlyCalcService = new MonthlyCalcService(prisma, tenantId)
  if (recalculate) {
    await monthlyCalcService.calculateMonthBatch(employeeIds, year, month)
  }

  // 3. Batch-fetch all monthly values for the target month
  const allMvs = await prisma.monthlyValue.findMany({
    where: {
      employeeId: { in: employeeIds },
      year,
      month,
    },
  })
  const mvByEmployee = new Map(allMvs.map((mv) => [mv.employeeId, mv]))

  // 3b. Calculate any employees still missing monthly values (even if recalculate was false)
  const missingIds = employeeIds.filter((id) => !mvByEmployee.has(id))
  if (missingIds.length > 0) {
    await monthlyCalcService.calculateMonthBatch(missingIds, year, month)
    // Re-fetch the newly created records
    const newMvs = await prisma.monthlyValue.findMany({
      where: { employeeId: { in: missingIds }, year, month },
    })
    for (const mv of newMvs) {
      mvByEmployee.set(mv.employeeId, mv)
    }
  }

  // Partition into closeable vs skipped
  const toClose: string[] = []
  let skippedCount = 0
  for (const empId of employeeIds) {
    const mv = mvByEmployee.get(empId)
    if (mv?.isClosed) {
      skippedCount++
    } else {
      // mv exists (just created if missing) and is not closed -> close it
      toClose.push(empId)
    }
  }

  // Pre-fetch tariff + override data for payout hook (batch, not N+1)
  const employeeTariffs = await prisma.employee.findMany({
    where: { id: { in: toClose }, tenantId },
    select: {
      id: true,
      tariff: {
        select: {
          overtimePayoutEnabled: true,
          overtimePayoutThresholdMinutes: true,
          overtimePayoutMode: true,
          overtimePayoutPercentage: true,
          overtimePayoutFixedMinutes: true,
          overtimePayoutApprovalRequired: true,
        },
      },
    },
  })
  const tariffByEmp = new Map(employeeTariffs.map(e => [e.id, e.tariff]))
  const overrideByEmp = await overrideRepo.batchFindByEmployeeIds(prisma, tenantId, toClose)

  // Close in parallel with concurrency limit
  const errors: { employeeId: string; reason: string }[] = []
  let closedCount = 0

  await mapWithConcurrency(toClose, 5, async (empId) => {
    try {
      await monthlyCalcService.closeMonth(empId, year, month, userId)
      closedCount++

      // Payout hook — errors collected, not thrown
      try {
        const payoutResult = await createPayoutForClosedMonth(
          prisma, tenantId, empId, year, month, userId,
          tariffByEmp.get(empId) ?? null,
          overrideByEmp.get(empId) ?? null,
        )
        if (payoutResult.status === "approved") {
          const nextMonth = month === 12 ? 1 : month + 1
          const nextYear = month === 12 ? year + 1 : year
          await monthlyCalcService.recalculateFromMonth(empId, nextYear, nextMonth)
        }
      } catch (payoutErr) {
        console.error(`[OvertimePayout] Failed for employee ${empId}:`, payoutErr)
        errors.push({
          employeeId: empId,
          reason: payoutErr instanceof Error ? payoutErr.message : String(payoutErr),
        })
      }

      // Never throws — audit failures must not block the actual operation
      if (audit) {
        const mv = mvByEmployee.get(empId)
        await auditLog.log(prisma, {
          tenantId,
          userId: audit.userId,
          action: "close",
          entityType: "monthly_values",
          entityId: mv?.id ?? empId,
          entityName: `${year}-${month}`,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err))
      }
    } catch (err) {
      errors.push({
        employeeId: empId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return {
    closedCount,
    skippedCount,
    errorCount: errors.length,
    errors,
  }
}

export async function recalculate(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    year: number
    month: number
    employeeId?: string
  },
  dataScope?: DataScope
) {
  const { year, month, employeeId } = input

  // Determine which employees to recalculate
  let employeeIds: string[]
  if (employeeId) {
    // Single employee — check data scope
    if (dataScope) {
      const emp = await prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
        select: { id: true, departmentId: true },
      })
      if (emp) {
        checkRelatedEmployeeDataScope(
          dataScope,
          { employeeId: emp.id, employee: { departmentId: emp.departmentId } },
          "Employee"
        )
      }
    }
    employeeIds = [employeeId]
  } else {
    employeeIds = await repo.findActiveEmployeeIds(prisma, tenantId)
    // Apply data scope filter for bulk recalculate
    if (dataScope && (dataScope.type === "department" || dataScope.type === "employee")) {
      const scopedEmployees = await prisma.employee.findMany({
        where: {
          id: { in: employeeIds },
          tenantId,
          ...(dataScope.type === "department"
            ? { departmentId: { in: dataScope.departmentIds } }
            : { id: { in: dataScope.employeeIds } }),
        },
        select: { id: true },
      })
      employeeIds = scopedEmployees.map((e) => e.id)
    }
  }

  const monthlyCalcService = new MonthlyCalcService(prisma, tenantId)
  const result = await monthlyCalcService.calculateMonthBatch(
    employeeIds,
    year,
    month
  )

  return {
    message: "Recalculation started",
    affectedEmployees: result.processedMonths,
  }
}
