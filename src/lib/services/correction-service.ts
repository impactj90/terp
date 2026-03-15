/**
 * Correction Service
 *
 * Business logic for correction operations including approve/reject workflow.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import {
  buildRelatedEmployeeDataScopeWhere,
  checkRelatedEmployeeDataScope,
} from "@/lib/auth/data-scope"
import { RecalcService } from "./recalc"
import * as repo from "./correction-repository"

// --- Error Classes ---

export class CorrectionNotFoundError extends Error {
  constructor(message = "Correction not found") {
    super(message)
    this.name = "CorrectionNotFoundError"
  }
}

export class CorrectionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CorrectionValidationError"
  }
}

export class CorrectionForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CorrectionForbiddenError"
  }
}

// --- Recalculation Helper ---

/**
 * Triggers recalculation for a specific employee/day.
 * Best effort -- errors are logged but do not fail the parent operation.
 * Uses RecalcService which triggers both daily calc AND monthly recalc.
 *
 * @see ZMI-TICKET-243
 */
async function triggerRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  correctionDate: Date
): Promise<void> {
  try {
    const service = new RecalcService(prisma)
    await service.triggerRecalc(tenantId, employeeId, correctionDate)
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${correctionDate.toISOString().split("T")[0]}:`,
      error
    )
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    page?: number
    pageSize?: number
    employeeId?: string
    fromDate?: string
    toDate?: string
    correctionType?: string
    status?: string
  },
  dataScope?: DataScope
) {
  const dataScopeWhere = dataScope ? buildRelatedEmployeeDataScopeWhere(dataScope) : null
  return repo.findMany(prisma, tenantId, params, dataScopeWhere)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope?: DataScope
) {
  const correction = await repo.findById(prisma, tenantId, id)
  if (!correction) {
    throw new CorrectionNotFoundError()
  }
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, correction as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Correction")
  }
  return correction
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    correctionDate: string
    correctionType: string
    accountId?: string
    valueMinutes: number
    reason: string
  },
  userId: string,
  dataScope?: DataScope
) {
  // Validate employee exists in tenant and is within data scope
  const employee = await repo.findEmployee(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new CorrectionNotFoundError("Employee not found")
  }
  if (dataScope) {
    checkRelatedEmployeeDataScope(
      dataScope,
      { employeeId: employee.id, employee: { departmentId: employee.departmentId } },
      "Correction"
    )
  }

  // Validate account exists in tenant (if provided)
  if (input.accountId) {
    const accountFound = await repo.accountExists(
      prisma,
      tenantId,
      input.accountId
    )
    if (!accountFound) {
      throw new CorrectionNotFoundError("Account not found")
    }
  }

  // Validate correction date
  const correctionDate = new Date(input.correctionDate)
  if (isNaN(correctionDate.getTime())) {
    throw new CorrectionValidationError("Invalid date: " + input.correctionDate)
  }

  return repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    correctionDate,
    correctionType: input.correctionType,
    accountId: input.accountId || null,
    valueMinutes: input.valueMinutes,
    reason: input.reason,
    status: "pending",
    createdBy: userId,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    valueMinutes?: number
    reason?: string
  },
  dataScope?: DataScope
) {
  // Fetch existing (tenant-scoped) with employee for scope check
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CorrectionNotFoundError()
  }
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, existing as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Correction")
  }

  // Check status is pending
  if (existing.status !== "pending") {
    throw new CorrectionValidationError(
      "Can only update pending corrections"
    )
  }

  // Build partial update data
  const data: Record<string, unknown> = { updatedAt: new Date() }

  if (input.valueMinutes !== undefined) {
    data.valueMinutes = input.valueMinutes
  }

  if (input.reason !== undefined) {
    data.reason = input.reason
  }

  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope?: DataScope
) {
  // Fetch existing (tenant-scoped) with employee for scope check
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CorrectionNotFoundError()
  }
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, existing as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Correction")
  }

  // Cannot delete approved corrections
  if ((existing as unknown as { status: string }).status === "approved") {
    throw new CorrectionForbiddenError("Cannot delete approved corrections")
  }

  await repo.deleteById(prisma, tenantId, id)
}

export async function approve(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  userId: string,
  dataScope?: DataScope
) {
  // Fetch existing (tenant-scoped) with employee for scope check
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CorrectionNotFoundError()
  }
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, existing as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Correction")
  }

  // Atomically update only if status is still pending (prevents double-approve)
  const correction = await repo.updateIfStatus(prisma, tenantId, id, "pending", {
    status: "approved",
    approvedBy: userId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  })

  if (!correction) {
    throw new CorrectionValidationError(
      "Correction is not in pending status"
    )
  }

  // Trigger recalculation for the correction date (best effort)
  await triggerRecalc(
    prisma,
    tenantId,
    existing.employeeId,
    existing.correctionDate
  )

  return correction
}

export async function reject(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  userId: string,
  dataScope?: DataScope
) {
  // Fetch existing (tenant-scoped) with employee for scope check
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CorrectionNotFoundError()
  }
  if (dataScope) {
    checkRelatedEmployeeDataScope(dataScope, existing as unknown as {
      employeeId: string
      employee?: { departmentId: string | null } | null
    }, "Correction")
  }

  // Atomically update only if status is still pending (prevents double-reject)
  const correction = await repo.updateIfStatus(prisma, tenantId, id, "pending", {
    status: "rejected",
    approvedBy: userId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  })

  if (!correction) {
    throw new CorrectionValidationError(
      "Correction is not in pending status"
    )
  }

  return correction
}
