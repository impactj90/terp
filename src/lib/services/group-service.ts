/**
 * Group Service
 *
 * Business logic for group operations (employee, workflow, activity groups).
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./group-repository"
import type { GroupType } from "./group-repository"

// --- Error Classes ---

export class GroupNotFoundError extends Error {
  constructor(message = "Group not found") {
    super(message)
    this.name = "GroupNotFoundError"
  }
}

export class GroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GroupValidationError"
  }
}

export class GroupConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GroupConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  params?: { isActive?: boolean }
) {
  return repo.findMany(prisma, tenantId, type, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  id: string
) {
  const group = await repo.findById(prisma, tenantId, type, id)
  if (!group) {
    throw new GroupNotFoundError()
  }
  return group
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  input: {
    code: string
    name: string
    description?: string
    isActive?: boolean
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new GroupValidationError("Group code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new GroupValidationError("Group name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, type, code)
  if (existingByCode) {
    throw new GroupConflictError("Group code already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  return repo.create(prisma, type, {
    tenantId,
    code,
    name,
    description,
    isActive: input.isActive ?? true,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  input: {
    id: string
    code?: string
    name?: string
    description?: string | null
    isActive?: boolean
  }
) {
  // Verify group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, type, input.id)
  if (!existing) {
    throw new GroupNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new GroupValidationError("Group code is required")
    }
    // Check uniqueness if changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        type,
        code,
        input.id
      )
      if (existingByCode) {
        throw new GroupConflictError("Group code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new GroupValidationError("Group name is required")
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  return repo.update(prisma, type, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  id: string
) {
  // Verify group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, type, id)
  if (!existing) {
    throw new GroupNotFoundError()
  }

  // Check for employees assigned to this group
  const employeeCount = await repo.countEmployees(prisma, type, id)
  if (employeeCount > 0) {
    throw new GroupValidationError(
      "Cannot delete group with assigned employees"
    )
  }

  await repo.deleteById(prisma, type, id)
}
