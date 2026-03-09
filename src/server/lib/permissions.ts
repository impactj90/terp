/**
 * Permission Resolution Helper
 *
 * Mirrors the Go permission resolution logic from:
 * - apps/api/internal/handler/auth.go (Permissions handler)
 * - apps/api/internal/middleware/authorization.go (PermissionChecker)
 */
import type { ContextUser } from "../trpc"

/**
 * Resolves the effective permission IDs for a user.
 *
 * Logic (mirrors Go backend):
 * 1. If user has no UserGroup: fall back to role-based check
 *    - admin role -> return empty array (frontend uses is_admin flag)
 *    - non-admin -> return empty array
 * 2. If UserGroup is inactive: empty permissions
 * 3. If UserGroup.isAdmin is true: return empty array (frontend uses is_admin flag)
 * 4. Otherwise: return the permission IDs from UserGroup.permissions (JSONB array)
 *
 * NOTE: For admin users, we return an empty permission_ids array but set is_admin=true.
 * The frontend already handles this: if is_admin is true, all permission checks pass
 * regardless of the permission_ids array.
 */
export function resolvePermissions(user: ContextUser): string[] {
  const userGroup = user.userGroup

  // No UserGroup — return empty (admin handled via is_admin flag)
  if (!userGroup) {
    return []
  }

  // Inactive UserGroup — no permissions
  if (!userGroup.isActive) {
    return []
  }

  // Admin UserGroup — return empty (frontend uses is_admin flag)
  if (userGroup.isAdmin) {
    return []
  }

  // Regular UserGroup — parse permissions from JSONB
  const permissions = userGroup.permissions as string[] | null
  return permissions ?? []
}

/**
 * Checks whether a user has admin privileges.
 *
 * A user is admin if:
 * - Their UserGroup has isAdmin = true, OR
 * - Their role is 'admin' (fallback when no UserGroup)
 */
export function isUserAdmin(user: ContextUser): boolean {
  if (user.userGroup?.isAdmin) {
    return true
  }
  return user.role === "admin"
}

/**
 * Checks if a user has a specific permission (by UUID).
 * Mirrors Go PermissionChecker.Has()
 *
 * Order of precedence:
 * 1. UserGroup with isAdmin:true and isActive:true -> true (all permissions)
 * 2. UserGroup with isActive:false -> false (no permissions)
 * 3. No UserGroup but role === "admin" -> true (fallback)
 * 4. Otherwise -> check permission in UserGroup.permissions array
 */
export function hasPermission(user: ContextUser, permissionId: string): boolean {
  if (!permissionId) return false

  const userGroup = user.userGroup

  if (userGroup) {
    if (!userGroup.isActive) return false
    if (userGroup.isAdmin) return true
    const permissions = userGroup.permissions as string[] | null
    return permissions?.includes(permissionId) ?? false
  }

  // Fallback: role-based admin
  return user.role === "admin"
}

/**
 * Checks if a user has ANY of the specified permissions.
 * Mirrors Go PermissionChecker.HasAny()
 */
export function hasAnyPermission(
  user: ContextUser,
  permissionIds: string[]
): boolean {
  return permissionIds.some((id) => hasPermission(user, id))
}
