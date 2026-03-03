/**
 * Auth Router
 *
 * Provides authentication-related tRPC procedures:
 * - auth.me — Returns the current user with permissions and tenants
 * - auth.permissions — Returns permission IDs and admin status
 * - auth.logout — Signs out the current user
 *
 * Replaces the Go backend endpoints:
 * - GET /auth/me
 * - GET /auth/permissions
 * - POST /auth/logout
 */
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolvePermissions, isUserAdmin } from "../lib/permissions"

// --- Output Schemas ---

const userOutputSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  tenantId: z.string().uuid().nullable(),
  userGroupId: z.string().uuid().nullable(),
  employeeId: z.string().uuid().nullable(),
  isActive: z.boolean().nullable(),
})

const tenantOutputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
})

const meOutputSchema = z.object({
  user: userOutputSchema,
  permissions: z.array(z.string()),
  tenants: z.array(tenantOutputSchema),
})

const permissionsOutputSchema = z.object({
  permission_ids: z.array(z.string()),
  is_admin: z.boolean(),
})

const logoutOutputSchema = z.object({
  success: z.boolean(),
})

// --- Router ---

export const authRouter = createTRPCRouter({
  /**
   * auth.me — Returns the current authenticated user with permissions and tenants.
   *
   * Replaces: GET /auth/me + partial GET /auth/permissions
   */
  me: protectedProcedure.output(meOutputSchema).query(async ({ ctx }) => {
    const { user } = ctx

    // Build permissions list
    const permissions = resolvePermissions(user)

    // Build tenants list from userTenants relation
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
  }),

  /**
   * auth.permissions — Returns only the permission IDs for the current user.
   *
   * Replaces: GET /auth/permissions
   * Response shape matches the Go endpoint for frontend compatibility:
   * { permission_ids: string[], is_admin: boolean }
   */
  permissions: protectedProcedure
    .output(permissionsOutputSchema)
    .query(async ({ ctx }) => {
      const { user } = ctx
      const permissions = resolvePermissions(user)
      const admin = isUserAdmin(user)

      return {
        permission_ids: permissions,
        is_admin: admin,
      }
    }),

  /**
   * auth.logout — Signs out the current user from Supabase.
   *
   * Replaces: POST /auth/logout
   * Uses the admin client to revoke the session server-side.
   */
  logout: protectedProcedure
    .output(logoutOutputSchema)
    .mutation(async ({ ctx }) => {
      const adminClient = createAdminClient()

      // Sign out the user globally (invalidates all sessions)
      await adminClient.auth.admin.signOut(ctx.session.access_token)

      return { success: true }
    }),
})
