/**
 * Users Service
 *
 * Business logic for user operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { createAdminClient } from "@/lib/supabase/admin"
import * as storage from "@/lib/supabase/storage"
import { randomUUID } from "crypto"
import * as repo from "./users-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

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
  },
  audit: AuditContext
) {
  // Set defaults
  let role = "user"
  const isActive = input.isActive ?? true
  const isLocked = input.isLocked ?? false

  // If userGroupId provided, look up the group
  if (input.userGroupId) {
    const group = await repo.findUserGroupById(prisma, tenantId, input.userGroupId)
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

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "create",
    entityType: "user",
    entityId: user.id,
    entityName: user.displayName || user.email,
    changes: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

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
  opts: { canManageAdminFields: boolean },
  audit: AuditContext
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
      const group = await repo.findUserGroupById(prisma, tenantId, input.userGroupId)
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

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  // Never throws — audit failures must not block the actual operation
  const TRACKED_FIELDS = [
    "displayName", "email", "username", "userGroupId",
    "employeeId", "isActive", "isLocked", "dataScopeType",
  ]
  const changes = auditLog.computeChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    TRACKED_FIELDS,
  )
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "update",
    entityType: "user",
    entityId: updated.id,
    entityName: updated.displayName || updated.email,
    changes,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit: AuditContext
) {
  // Cannot delete self
  if (audit.userId === id) {
    throw new UserForbiddenError("Cannot delete yourself")
  }

  // Verify user exists (scoped to current tenant)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new UserNotFoundError()
  }

  // Hard delete to match Go behavior
  await repo.deleteById(prisma, tenantId, id)

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "delete",
    entityType: "user",
    entityId: id,
    entityName: existing.displayName || existing.email,
    changes: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}

export async function changePassword(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  newPassword: string,
  audit: AuditContext
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

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "update",
    entityType: "user",
    entityId: userId,
    entityName: existing.displayName || existing.email,
    changes: null,
    metadata: { passwordChanged: true },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}

// =============================================================================
// Avatar Upload
// =============================================================================

const AVATAR_BUCKET = "avatars"
const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2 MB

function avatarExt(mimeType: string) {
  return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"
}

export async function avatarGetUploadUrl(userId: string, mimeType: string) {
  if (!AVATAR_MIME_TYPES.includes(mimeType)) {
    throw new UserValidationError(
      `Invalid file type: ${mimeType}. Allowed: ${AVATAR_MIME_TYPES.join(", ")}`
    )
  }
  const path = `${userId}/${randomUUID()}.${avatarExt(mimeType)}`
  return storage.createSignedUploadUrl(AVATAR_BUCKET, path)
}

export async function avatarConfirmUpload(
  prisma: PrismaClient,
  userId: string,
  storagePath: string,
  mimeType: string,
  sizeBytes: number
) {
  if (sizeBytes > AVATAR_MAX_BYTES) {
    throw new UserValidationError("File too large. Maximum: 2 MB")
  }
  if (!AVATAR_MIME_TYPES.includes(mimeType)) {
    throw new UserValidationError(`Invalid file type: ${mimeType}`)
  }

  // Verify the file was actually uploaded
  const blob = await storage.download(AVATAR_BUCKET, storagePath)
  if (!blob) {
    throw new UserValidationError("Upload not found. Please upload the file first.")
  }

  // Clean up old avatar
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })
  if (existing?.avatarUrl?.includes(`/storage/v1/object/public/${AVATAR_BUCKET}/`)) {
    const oldPath = existing.avatarUrl.split(`/storage/v1/object/public/${AVATAR_BUCKET}/`)[1]
    if (oldPath) await storage.remove(AVATAR_BUCKET, [oldPath])
  }

  // Save public URL
  const publicUrl = storage.getPublicUrl(AVATAR_BUCKET, storagePath)
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: publicUrl } })

  return { avatarUrl: publicUrl }
}

export async function avatarDelete(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })
  if (user?.avatarUrl?.includes(`/storage/v1/object/public/${AVATAR_BUCKET}/`)) {
    const path = user.avatarUrl.split(`/storage/v1/object/public/${AVATAR_BUCKET}/`)[1]
    if (path) await storage.remove(AVATAR_BUCKET, [path])
  }
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } })
  return { success: true }
}
