/**
 * Daily Value Service
 *
 * Business logic for daily value operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import * as repo from "./daily-value-repository"

// --- Error Classes ---

export class DailyValueNotFoundError extends Error {
  constructor(message = "Daily value not found") {
    super(message)
    this.name = "DailyValueNotFoundError"
  }
}

export class DailyValueValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DailyValueValidationError"
  }
}

export class DailyValueForbiddenError extends Error {
  constructor(message = "Daily value not within data scope") {
    super(message)
    this.name = "DailyValueForbiddenError"
  }
}

// --- Data Scope Helpers ---

function buildDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

function checkDataScope(
  dataScope: DataScope,
  dailyValue: {
    employeeId: string
    employee?: { departmentId: string | null } | null
  }
): void {
  if (dataScope.type === "department") {
    if (
      !dailyValue.employee?.departmentId ||
      !dataScope.departmentIds.includes(dailyValue.employee.departmentId)
    ) {
      throw new DailyValueForbiddenError()
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(dailyValue.employeeId)) {
      throw new DailyValueForbiddenError()
    }
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: { employeeId: string; year: number; month: number }
) {
  const from = new Date(params.year, params.month - 1, 1)
  const to = new Date(params.year, params.month, 0)

  return repo.findManyByEmployeeMonth(
    prisma,
    tenantId,
    params.employeeId,
    from,
    to
  )
}

export async function listAll(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  params?: {
    page?: number
    pageSize?: number
    employeeId?: string
    departmentId?: string
    fromDate?: string
    toDate?: string
    status?: string
    hasErrors?: boolean
  }
) {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 50

  const where: Record<string, unknown> = { tenantId }

  if (params?.employeeId) {
    where.employeeId = params.employeeId
  }

  if (params?.status) {
    where.status = params.status
  }

  if (params?.hasErrors !== undefined) {
    where.hasError = params.hasErrors
  }

  if (params?.departmentId) {
    where.employee = {
      ...((where.employee as Record<string, unknown>) || {}),
      departmentId: params.departmentId,
    }
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

  // Apply data scope filtering
  const scopeWhere = buildDataScopeWhere(dataScope)
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

  return repo.findManyWithFilters(prisma, where, {
    skip: (page - 1) * pageSize,
    take: pageSize,
  })
}

export async function approve(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  id: string
) {
  // 1. Fetch the daily value with employee relation (for data scope check)
  const dv = await repo.findByIdWithEmployee(prisma, tenantId, id)

  if (!dv) {
    throw new DailyValueNotFoundError()
  }

  // 2. Check data scope
  checkDataScope(dataScope, dv)

  // 3. Validate approval rules
  if (dv.hasError || dv.status === "error") {
    throw new DailyValueValidationError(
      "Daily value has errors and cannot be approved"
    )
  }

  if (dv.status === "approved") {
    throw new DailyValueValidationError("Daily value is already approved")
  }

  // 4. Update status to approved
  const updated = await repo.updateStatus(prisma, id, "approved")

  // 5. Send notification (best effort)
  try {
    const dateLabel = dv.valueDate.toISOString().split("T")[0]
    const link = `/timesheet?view=day&date=${dateLabel}`

    const userId = await repo.findUserIdForEmployee(
      prisma,
      tenantId,
      dv.employeeId
    )

    if (userId) {
      await repo.createNotification(prisma, {
        tenantId,
        userId,
        type: "approvals",
        title: "Timesheet approved",
        message: `Your timesheet for ${dateLabel} was approved.`,
        link,
      })
    }
  } catch {
    console.error(
      "Failed to send approval notification for daily value",
      id
    )
  }

  return updated
}
