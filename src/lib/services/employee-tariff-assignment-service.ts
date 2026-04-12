/**
 * Employee Tariff Assignment Service
 *
 * Business logic for employee tariff assignment operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-tariff-assignment-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { checkRelatedEmployeeDataScope } from "@/lib/auth/data-scope"
import type { DataScope } from "@/lib/auth/middleware"

// --- Audit ---

const TRACKED_FIELDS = [
  "employeeId",
  "tariffId",
  "validFrom",
  "validTo",
]

// --- Error Classes ---

export class EmployeeTariffAssignmentNotFoundError extends Error {
  constructor(message = "Tariff assignment not found") {
    super(message)
    this.name = "EmployeeTariffAssignmentNotFoundError"
  }
}

export class EmployeeTariffAssignmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeTariffAssignmentValidationError"
  }
}

export class EmployeeTariffAssignmentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeTariffAssignmentConflictError"
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(message = "Employee not found") {
    super(message)
    this.name = "EmployeeNotFoundError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: { employeeId: string; isActive?: boolean }
) {
  // Verify employee exists and belongs to tenant
  const employee = await repo.findEmployeeById(
    prisma,
    tenantId,
    params.employeeId
  )
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  return repo.findMany(prisma, tenantId, params.employeeId, {
    isActive: params.isActive,
  })
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  id: string
) {
  const assignment = await repo.findById(prisma, tenantId, employeeId, id)
  if (!assignment) {
    throw new EmployeeTariffAssignmentNotFoundError()
  }
  return assignment
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    tariffId: string
    effectiveFrom: Date
    effectiveTo?: Date
    overwriteBehavior?: string
    notes?: string
  },
  audit?: AuditContext
) {
  // Verify employee exists and belongs to tenant
  const employee = await repo.findEmployeeById(
    prisma,
    tenantId,
    input.employeeId
  )
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // Validate date range
  const effectiveTo = input.effectiveTo ?? null
  if (effectiveTo && effectiveTo < input.effectiveFrom) {
    throw new EmployeeTariffAssignmentValidationError(
      "Effective to date cannot be before effective from date"
    )
  }

  // Check for overlapping assignments
  const overlap = await repo.hasOverlap(
    prisma,
    input.employeeId,
    input.effectiveFrom,
    effectiveTo
  )
  if (overlap) {
    throw new EmployeeTariffAssignmentConflictError(
      "Overlapping tariff assignment exists"
    )
  }

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    tariffId: input.tariffId,
    effectiveFrom: input.effectiveFrom,
    effectiveTo,
    overwriteBehavior:
      input.overwriteBehavior?.trim() || "preserve_manual",
    notes: input.notes?.trim() || null,
    isActive: true,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_tariff_assignment",
      entityId: created.id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    id: string
    effectiveFrom?: Date
    effectiveTo?: Date | null
    overwriteBehavior?: string
    notes?: string | null
    isActive?: boolean
  },
  audit?: AuditContext,
  dataScope?: DataScope
) {
  // Fetch existing assignment, verify tenant/employee match
  const existing = await repo.findById(
    prisma,
    tenantId,
    input.employeeId,
    input.id
  )
  if (!existing) {
    throw new EmployeeTariffAssignmentNotFoundError()
  }

  // Check data scope if provided
  if (dataScope) {
    const employee = await repo.findEmployeeById(prisma, tenantId, input.employeeId, { id: true, departmentId: true })
    if (employee) {
      checkRelatedEmployeeDataScope(dataScope, {
        employeeId: input.employeeId,
        employee: { departmentId: (employee as unknown as { departmentId: string | null }).departmentId },
      }, "EmployeeTariffAssignment")
    }
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.effectiveFrom !== undefined) {
    data.effectiveFrom = input.effectiveFrom
  }
  if (input.effectiveTo !== undefined) {
    data.effectiveTo = input.effectiveTo
  }
  if (input.overwriteBehavior !== undefined) {
    data.overwriteBehavior = input.overwriteBehavior.trim()
  }
  if (input.notes !== undefined) {
    data.notes =
      input.notes === null ? null : input.notes.trim() || null
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // If dates changed, validate and re-check overlap
  const effectiveFrom =
    (data.effectiveFrom as Date | undefined) ?? existing.effectiveFrom
  const effectiveTo =
    data.effectiveTo !== undefined
      ? (data.effectiveTo as Date | null)
      : existing.effectiveTo

  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new EmployeeTariffAssignmentValidationError(
      "Effective to date cannot be before effective from date"
    )
  }

  // Wrap overlap check + update in transaction for atomicity (Tier 3)
  const updated = await prisma.$transaction(async (tx) => {
    // Re-check overlap if dates changed (exclude self)
    if (
      input.effectiveFrom !== undefined ||
      input.effectiveTo !== undefined
    ) {
      const overlap = await repo.hasOverlap(
        tx as unknown as PrismaClient,
        input.employeeId,
        effectiveFrom,
        effectiveTo,
        input.id
      )
      if (overlap) {
        throw new EmployeeTariffAssignmentConflictError(
          "Overlapping tariff assignment exists"
        )
      }
    }

    return (await repo.update(tx as unknown as PrismaClient, tenantId, input.id, data))!
  })

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_tariff_assignment",
      entityId: input.id,
      entityName: null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  id: string,
  audit?: AuditContext,
  dataScope?: DataScope
) {
  // Fetch assignment, verify tenant/employee match
  const existing = await repo.findById(prisma, tenantId, employeeId, id)
  if (!existing) {
    throw new EmployeeTariffAssignmentNotFoundError()
  }

  // Check data scope if provided
  if (dataScope) {
    const employee = await repo.findEmployeeById(prisma, tenantId, employeeId, { id: true, departmentId: true })
    if (employee) {
      checkRelatedEmployeeDataScope(dataScope, {
        employeeId,
        employee: { departmentId: (employee as unknown as { departmentId: string | null }).departmentId },
      }, "EmployeeTariffAssignment")
    }
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_tariff_assignment",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

export async function getEffective(
  prisma: PrismaClient,
  tenantId: string,
  params: { employeeId: string; date: string }
) {
  // Parse date
  const date = new Date(params.date)
  if (isNaN(date.getTime())) {
    throw new EmployeeTariffAssignmentValidationError("Invalid date")
  }

  // Verify employee exists and belongs to tenant
  const employee = await repo.findEmployeeById(
    prisma,
    tenantId,
    params.employeeId,
    { id: true, tariffId: true }
  )
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // Find active assignment covering the date
  const assignment = await repo.findEffective(
    prisma,
    tenantId,
    params.employeeId,
    date
  )

  if (assignment) {
    return {
      tariffId: assignment.tariffId,
      source: "assignment" as const,
      assignmentId: assignment.id,
    }
  }

  // Fall back to employee's default tariffId
  const employeeWithTariff = employee as unknown as { id: string; tariffId: string | null }
  if (employeeWithTariff.tariffId) {
    return {
      tariffId: employeeWithTariff.tariffId,
      source: "default" as const,
      assignmentId: null,
    }
  }

  // No tariff
  return {
    tariffId: null,
    source: "none" as const,
    assignmentId: null,
  }
}
