/**
 * Employee Access Assignment Service
 *
 * Business logic for employee access assignment operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-access-assignment-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "employeeId",
  "accessProfileId",
  "validFrom",
  "validTo",
  "isActive",
]

// --- Error Classes ---

export class EmployeeAccessAssignmentNotFoundError extends Error {
  constructor(message = "Employee access assignment not found") {
    super(message)
    this.name = "EmployeeAccessAssignmentNotFoundError"
  }
}

export class EmployeeAccessAssignmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeAccessAssignmentValidationError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  scopeWhere?: Record<string, unknown> | null
) {
  return repo.findMany(prisma, tenantId, scopeWhere)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const assignment = await repo.findById(prisma, tenantId, id)
  if (!assignment) {
    throw new EmployeeAccessAssignmentNotFoundError()
  }
  return assignment
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    accessProfileId: string
    validFrom?: string
    validTo?: string
  },
  audit?: AuditContext
) {
  // Verify employee exists in same tenant
  const employee = await repo.findEmployeeForTenant(
    prisma,
    tenantId,
    input.employeeId
  )
  if (!employee) {
    throw new EmployeeAccessAssignmentValidationError("Employee not found")
  }

  // Verify access profile exists in same tenant
  const accessProfile = await repo.findAccessProfileForTenant(
    prisma,
    tenantId,
    input.accessProfileId
  )
  if (!accessProfile) {
    throw new EmployeeAccessAssignmentValidationError(
      "Access profile not found"
    )
  }

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    accessProfileId: input.accessProfileId,
    validFrom: input.validFrom ? new Date(input.validFrom) : null,
    validTo: input.validTo ? new Date(input.validTo) : null,
    isActive: true,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_access_assignment",
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
    id: string
    validFrom?: string | null
    validTo?: string | null
    isActive?: boolean
  },
  audit?: AuditContext
) {
  // Verify assignment exists (tenant-scoped) - use simple findById without include
  // since we only need to check existence
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new EmployeeAccessAssignmentNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.validFrom !== undefined) {
    data.validFrom =
      input.validFrom === null ? null : new Date(input.validFrom)
  }

  if (input.validTo !== undefined) {
    data.validTo = input.validTo === null ? null : new Date(input.validTo)
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

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
      entityType: "employee_access_assignment",
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
  id: string,
  audit?: AuditContext
) {
  // Verify assignment exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new EmployeeAccessAssignmentNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_access_assignment",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
