/**
 * Users Service
 *
 * Business logic for user operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { createAdminClient } from "@/lib/supabase/admin"
import * as repo from "./users-repository"

// --- Error Classes ---

export class UserNotFoundError extends Error {
  constructor(message = "User not found") {
    super(message)
    this.name = "UserNotFoundError"
  }
}

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserValidationError"
  }
}

export class UserForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserForbiddenError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { search?: string; limit?: number }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const user = await repo.findByIdWithRelations(prisma, tenantId, id)
  if (!user) {
    throw new UserNotFoundError()
  }
  return user
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    email: string
    displayName: string
    username?: string
    userGroupId?: string
    employeeId?: string
    password?: string
    ssoId?: string
    isActive?: boolean
    isLocked?: boolean
    dataScopeType?: string
    dataScopeTenantIds?: string[]
    dataScopeDepartmentIds?: string[]
    dataScopeEmployeeIds?: string[]
  }
) {
  // Set defaults
  let role = "user"
  const isActive = input.isActive ?? true
  const isLocked = input.isLocked ?? false

  // If userGroupId provided, look up the group
  if (input.userGroupId) {
    const group = await repo.findUserGroupById(prisma, input.userGroupId)
    if (!group) {
      throw new UserValidationError("User group not found")
    }
    if (group.isAdmin) {
      role = "admin"
    }
  }

  // Normalize optional strings
  const username = input.username?.trim() || null
  const ssoId = input.ssoId?.trim() || null

  // Create user
  const user = await repo.create(prisma, {
    email: input.email,
    displayName: input.displayName.trim(),
    role,
    tenantId,
    userGroupId: input.userGroupId || null,
    employeeId: input.employeeId || null,
    username,
    ssoId,
    isActive,
    isLocked,
    dataScopeType: input.dataScopeType ?? "all",
    dataScopeTenantIds: input.dataScopeTenantIds ?? [],
    dataScopeDepartmentIds: input.dataScopeDepartmentIds ?? [],
    dataScopeEmployeeIds: input.dataScopeEmployeeIds ?? [],
  })

  // Auto-add user to tenant
  await repo.upsertUserTenant(prisma, user.id, tenantId)

  return user
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    displayName?: string
    avatarUrl?: string | null
    userGroupId?: string | null
    username?: string | null
    employeeId?: string | null
    ssoId?: string | null
    isActive?: boolean
    isLocked?: boolean
    dataScopeType?: string
    dataScopeTenantIds?: string[]
    dataScopeDepartmentIds?: string[]
    dataScopeEmployeeIds?: string[]
  },
  opts: { canManageAdminFields: boolean }
) {
  // Fetch target user (scoped to current tenant)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new UserNotFoundError()
  }

  // Check admin-only fields
  const ADMIN_ONLY_FIELDS = [
    "userGroupId",
    "isActive",
    "isLocked",
    "dataScopeType",
    "dataScopeTenantIds",
    "dataScopeDepartmentIds",
    "dataScopeEmployeeIds",
    "ssoId",
    "employeeId",
    "username",
  ] as const

  const hasAdminFields = ADMIN_ONLY_FIELDS.some(
    (field) => (input as Record<string, unknown>)[field] !== undefined
  )
  if (hasAdminFields && !opts.canManageAdminFields) {
    throw new UserForbiddenError("Insufficient permissions for admin fields")
  }

  // Build update data from provided fields
  const data: Record<string, unknown> = {}

  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim()
    if (displayName.length === 0) {
      throw new UserValidationError("Display name cannot be empty")
    }
    data.displayName = displayName
  }

  if (input.avatarUrl !== undefined) {
    data.avatarUrl = input.avatarUrl
  }

  if (input.userGroupId !== undefined) {
    if (input.userGroupId === null) {
      // Unassign from group, set role to "user"
      data.userGroupId = null
      data.role = "user"
    } else {
      // Look up new group
      const group = await repo.findUserGroupById(prisma, input.userGroupId)
      if (!group) {
        throw new UserValidationError("User group not found")
      }
      data.userGroupId = input.userGroupId
      data.role = group.isAdmin ? "admin" : "user"
    }
  }

  if (input.username !== undefined) {
    data.username =
      input.username === null ? null : input.username.trim() || null
  }

  if (input.employeeId !== undefined) {
    data.employeeId = input.employeeId
  }

  if (input.ssoId !== undefined) {
    data.ssoId = input.ssoId
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  if (input.isLocked !== undefined) {
    data.isLocked = input.isLocked
  }

  if (input.dataScopeType !== undefined) {
    data.dataScopeType = input.dataScopeType
  }

  if (input.dataScopeTenantIds !== undefined) {
    data.dataScopeTenantIds = input.dataScopeTenantIds
  }

  if (input.dataScopeDepartmentIds !== undefined) {
    data.dataScopeDepartmentIds = input.dataScopeDepartmentIds
  }

  if (input.dataScopeEmployeeIds !== undefined) {
    data.dataScopeEmployeeIds = input.dataScopeEmployeeIds
  }

  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  currentUserId: string
) {
  // Cannot delete self
  if (currentUserId === id) {
    throw new UserForbiddenError("Cannot delete yourself")
  }

  // Verify user exists (scoped to current tenant)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new UserNotFoundError()
  }

  // Hard delete to match Go behavior
  await repo.deleteById(prisma, tenantId, id)
}

export async function changePassword(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  newPassword: string
) {
  // Verify target user exists (scoped to current tenant)
  const existing = await repo.findById(prisma, tenantId, userId)
  if (!existing) {
    throw new UserNotFoundError()
  }

  // Use Supabase Admin API to update password
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) {
    throw new Error("Failed to update password")
  }
}
