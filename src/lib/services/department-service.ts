/**
 * Department Service
 *
 * Business logic for department operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./department-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "code",
  "parentId",
  "isActive",
]

// --- Error Classes ---

export class DepartmentNotFoundError extends Error {
  constructor(message = "Department not found") {
    super(message)
    this.name = "DepartmentNotFoundError"
  }
}

export class DepartmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DepartmentValidationError"
  }
}

export class DepartmentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DepartmentConflictError"
  }
}

// --- Helpers ---

async function checkCircularReference(
  prisma: PrismaClient,
  tenantId: string,
  deptId: string,
  proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([deptId])
  let current: string | null = proposedParentId

  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)

    const record = await repo.findParentId(prisma, tenantId, current)
    if (!record) break
    current = record.parentId
  }

  return false
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; parentId?: string }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getTree(
  prisma: PrismaClient,
  tenantId: string
) {
  return repo.findAllForTree(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const department = await repo.findById(prisma, tenantId, id)
  if (!department) {
    throw new DepartmentNotFoundError()
  }
  return department
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    parentId?: string
    managerEmployeeId?: string
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new DepartmentValidationError("Department code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new DepartmentValidationError("Department name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new DepartmentConflictError("Department code already exists")
  }

  // If parentId provided, verify parent exists and belongs to same tenant
  if (input.parentId) {
    const parentDept = await repo.findById(prisma, tenantId, input.parentId)
    if (!parentDept) {
      throw new DepartmentValidationError("Parent department not found")
    }
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    parentId: input.parentId ?? null,
    managerEmployeeId: input.managerEmployeeId ?? null,
    isActive: true,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "department",
      entityId: created.id,
      entityName: created.name ?? null,
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
    code?: string
    name?: string
    description?: string | null
    parentId?: string | null
    managerEmployeeId?: string | null
    isActive?: boolean
  },
  audit?: AuditContext
) {
  // Verify department exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new DepartmentNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new DepartmentValidationError("Department code is required")
    }
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new DepartmentConflictError("Department code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new DepartmentValidationError("Department name is required")
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle parentId update
  if (input.parentId !== undefined) {
    if (input.parentId === null) {
      data.parentId = null
    } else {
      // Self-reference check
      if (input.parentId === input.id) {
        throw new DepartmentValidationError("Circular reference detected")
      }

      // Parent existence + same-tenant check
      const parentDept = await repo.findById(
        prisma,
        tenantId,
        input.parentId
      )
      if (!parentDept) {
        throw new DepartmentValidationError("Parent department not found")
      }

      // Deep circular reference check
      const isCircular = await checkCircularReference(
        prisma,
        tenantId,
        input.id,
        input.parentId
      )
      if (isCircular) {
        throw new DepartmentValidationError("Circular reference detected")
      }

      data.parentId = input.parentId
    }
  }

  // Handle managerEmployeeId update
  if (input.managerEmployeeId !== undefined) {
    data.managerEmployeeId = input.managerEmployeeId
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  const updated = await repo.update(prisma, tenantId, input.id, data)

  if (audit && updated) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "department",
      entityId: input.id,
      entityName: updated.name ?? null,
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
  // Verify department exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new DepartmentNotFoundError()
  }

  // Check for children
  const childCount = await repo.countChildren(prisma, tenantId, id)
  if (childCount > 0) {
    throw new DepartmentValidationError(
      "Cannot delete department with child departments"
    )
  }

  // Check for employees
  const employeeCount = await repo.countEmployees(prisma, tenantId, id)
  if (employeeCount > 0) {
    throw new DepartmentValidationError(
      "Cannot delete department with assigned employees"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "department",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
