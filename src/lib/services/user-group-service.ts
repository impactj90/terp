/**
 * User Group Service
 *
 * Business logic for user group operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { lookupPermission } from "@/server/lib/permission-catalog"
import * as repo from "./user-group-repository"

// --- Error Classes ---

export class UserGroupNotFoundError extends Error {
  constructor(message = "User group not found") {
    super(message)
    this.name = "UserGroupNotFoundError"
  }
}

export class UserGroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserGroupValidationError"
  }
}

export class UserGroupConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserGroupConflictError"
  }
}

export class UserGroupForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserGroupForbiddenError"
  }
}

// --- Helpers ---

function validatePermissionIds(ids: string[]): void {
  for (const id of ids) {
    if (!lookupPermission(id)) {
      throw new UserGroupValidationError(`Invalid permission ID: ${id}`)
    }
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { active?: boolean }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const group = await repo.findByIdWithUserCount(prisma, tenantId, id)
  if (!group) {
    throw new UserGroupNotFoundError()
  }
  return group
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    code?: string
    description?: string
    permissions: string[]
    isAdmin: boolean
    isActive: boolean
  }
) {
  // Normalize name and code
  const name = input.name.trim()
  if (name.length === 0) {
    throw new UserGroupValidationError("Name is required")
  }

  const code = (input.code?.trim() || name).toUpperCase()
  if (code.length === 0) {
    throw new UserGroupValidationError("Code is required")
  }

  // Check name uniqueness within tenant (include system groups)
  const existingByName = await repo.findByName(prisma, tenantId, name)
  if (existingByName) {
    throw new UserGroupConflictError(
      "User group with this name already exists"
    )
  }

  // Check code uniqueness within tenant (include system groups)
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new UserGroupConflictError(
      "User group code already exists for this tenant"
    )
  }

  // Validate all permission IDs
  validatePermissionIds(input.permissions)

  // Create user group
  return repo.create(prisma, {
    tenantId,
    name,
    code,
    description: input.description?.trim() || null,
    permissions: input.permissions,
    isAdmin: input.isAdmin,
    isSystem: false,
    isActive: input.isActive,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    code?: string
    description?: string
    permissions?: string[]
    isAdmin?: boolean
    isActive?: boolean
  }
) {
  // Fetch existing group (scoped to current tenant or system groups)
  const existing = await repo.findById(prisma, tenantId, input.id)

  if (!existing) {
    throw new UserGroupNotFoundError()
  }

  // System groups cannot be modified
  if (existing.isSystem) {
    throw new UserGroupForbiddenError("Cannot modify system group")
  }

  const previousIsAdmin = existing.isAdmin

  // Build update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new UserGroupValidationError("Name cannot be empty")
    }
    // Check uniqueness if changed
    if (name !== existing.name) {
      const existingByName = await repo.findByName(
        prisma,
        tenantId,
        name,
        input.id
      )
      if (existingByName) {
        throw new UserGroupConflictError(
          "User group with this name already exists"
        )
      }
    }
    data.name = name
  }

  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase()
    if (code.length === 0) {
      throw new UserGroupValidationError("Code cannot be empty")
    }
    // Check uniqueness if changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new UserGroupConflictError(
          "User group code already exists for this tenant"
        )
      }
    }
    data.code = code
  }

  if (input.description !== undefined) {
    data.description = input.description.trim() || null
  }

  if (input.permissions !== undefined) {
    validatePermissionIds(input.permissions)
    data.permissions = input.permissions
  }

  if (input.isAdmin !== undefined) {
    data.isAdmin = input.isAdmin
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // Update group
  const group = await repo.update(prisma, input.id, data)

  // If isAdmin changed, cascade role update to all users in this group
  if (
    input.isAdmin !== undefined &&
    (previousIsAdmin ?? false) !== input.isAdmin
  ) {
    const newRole = input.isAdmin ? "admin" : "user"
    await repo.updateUsersRole(prisma, input.id, newRole)
  }

  return group
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)

  if (!existing) {
    throw new UserGroupNotFoundError()
  }

  // System groups cannot be deleted
  if (existing.isSystem) {
    throw new UserGroupForbiddenError("Cannot delete system group")
  }

  await repo.deleteById(prisma, id)
}
