/**
 * Monthly Values Service
 *
 * Business logic for monthly value operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import {
  buildRelatedEmployeeDataScopeWhere,
  checkRelatedEmployeeDataScope,
} from "@/lib/auth/data-scope"
import { mapWithConcurrency } from "@/lib/async"
import { MonthlyCalcService } from "./monthly-calc"
import * as repo from "./monthly-values-repository"

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

// --- Service Functions ---

export async function forEmployee(
  prisma: PrismaClient,
  employeeId: string,
  year: number,
  month: number
) {
  const monthlyCalcService = new MonthlyCalcService(prisma)
  return monthlyCalcService.getMonthSummary(employeeId, year, month)
}

export async function yearOverview(
  prisma: PrismaClient,
  employeeId: string,
  year: number
) {
  const monthlyCalcService = new MonthlyCalcService(prisma)
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
  return repo.findMany(prisma, tenantId, params)
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
  return mv
}

export async function close(
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

  // 2. Close via MonthlyCalcService
  const monthlyCalcService = new MonthlyCalcService(prisma)
  await monthlyCalcService.closeMonth(mv.employeeId, mv.year, mv.month, userId)

  // 3. Re-fetch and return updated record
  const updated = await repo.findById(prisma, tenantId, mv.id)
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

  // 2. Reopen via MonthlyCalcService
  const monthlyCalcService = new MonthlyCalcService(prisma)
  await monthlyCalcService.reopenMonth(
    mv.employeeId,
    mv.year,
    mv.month,
    userId
  )

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
  dataScope?: DataScope
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

  // 2. Optionally recalculate before closing
  const monthlyCalcService = new MonthlyCalcService(prisma)
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

  // Partition into closeable vs skipped
  const toClose: string[] = []
  let skippedCount = 0
  for (const empId of employeeIds) {
    const mv = mvByEmployee.get(empId)
    if (!mv || mv.isClosed) {
      skippedCount++
    } else {
      toClose.push(empId)
    }
  }

  // Close in parallel with concurrency limit
  const errors: { employeeId: string; reason: string }[] = []
  let closedCount = 0

  await mapWithConcurrency(toClose, 5, async (empId) => {
    try {
      await monthlyCalcService.closeMonth(empId, year, month, userId)
      closedCount++
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

  const monthlyCalcService = new MonthlyCalcService(prisma)
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
