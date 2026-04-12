/**
 * Employee Children Service
 *
 * Business logic for employee child operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-children-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class ChildNotFoundError extends Error {
  constructor() {
    super("Employee child not found")
    this.name = "ChildNotFoundError"
  }
}

export class ChildValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ChildValidationError"
  }
}

// --- Service Functions ---

/**
 * Lists children for an employee.
 * Verifies employee belongs to tenant.
 */
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  return repo.listByEmployee(prisma, employeeId)
}

/**
 * Creates a new child for an employee.
 * Verifies employee belongs to tenant.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    firstName: string
    lastName: string
    birthDate: Date
    taxAllowanceShare?: number | null
    livesInHousehold?: boolean
  },
  audit?: AuditContext
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  const firstName = input.firstName.trim()
  if (firstName.length === 0) {
    throw new ChildValidationError("First name is required")
  }

  const lastName = input.lastName.trim()
  if (lastName.length === 0) {
    throw new ChildValidationError("Last name is required")
  }

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    firstName,
    lastName,
    birthDate: input.birthDate,
    taxAllowanceShare: input.taxAllowanceShare ?? undefined,
    livesInHousehold: input.livesInHousehold ?? false,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_child",
      entityId: created.id,
      entityName: `${firstName} ${lastName}`,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

/**
 * Updates an employee child.
 * Verifies the child exists and belongs to tenant.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    firstName?: string
    lastName?: string
    birthDate?: Date
    taxAllowanceShare?: number | null
    livesInHousehold?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new ChildNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.firstName !== undefined) {
    const firstName = input.firstName.trim()
    if (firstName.length === 0) {
      throw new ChildValidationError("First name is required")
    }
    data.firstName = firstName
  }
  if (input.lastName !== undefined) {
    const lastName = input.lastName.trim()
    if (lastName.length === 0) {
      throw new ChildValidationError("Last name is required")
    }
    data.lastName = lastName
  }
  if (input.birthDate !== undefined) data.birthDate = input.birthDate
  if (input.taxAllowanceShare !== undefined) data.taxAllowanceShare = input.taxAllowanceShare
  if (input.livesInHousehold !== undefined) data.livesInHousehold = input.livesInHousehold

  const updated = await repo.update(prisma, tenantId, id, data)
  if (!updated) {
    throw new ChildNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee_child",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

/**
 * Deletes an employee child.
 * Verifies the child exists and belongs to tenant.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findByIdWithEmployee(prisma, tenantId, id)
  if (!existing) {
    throw new ChildNotFoundError()
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_child",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}
