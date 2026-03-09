/**
 * Auth Service
 *
 * Business logic for authentication-related operations:
 * - Building the "me" response (user + permissions + tenants)
 * - Resolving user permissions
 * - Logging out via Supabase admin client
 */
import type { ContextUser } from "@/trpc/init"
import { resolvePermissions, isUserAdmin } from "@/lib/auth/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

// --- Service Functions ---

/**
 * Returns the current user profile, permissions, and accessible tenants.
 */
export function getMe(user: ContextUser) {
  const permissions = resolvePermissions(user)

  const tenants = user.userTenants.map((ut) => ({
    id: ut.tenant.id,
    name: ut.tenant.name,
    slug: ut.tenant.slug,
  }))

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      tenantId: user.tenantId,
      userGroupId: user.userGroupId,
      employeeId: user.employeeId,
      isActive: user.isActive,
    },
    permissions,
    tenants,
  }
}

/**
 * Returns the permission IDs and admin status for the current user.
 */
export function getPermissions(user: ContextUser) {
  const permissions = resolvePermissions(user)
  const admin = isUserAdmin(user)

  return {
    permission_ids: permissions,
    is_admin: admin,
  }
}

/**
 * Signs out the user globally by revoking their Supabase session.
 */
export async function logout(accessToken: string) {
  const adminClient = createAdminClient()
  await adminClient.auth.admin.signOut(accessToken)
  return { success: true as const }
}
