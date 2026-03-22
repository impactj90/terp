/**
 * Users Router
 *
 * Provides user CRUD operations via tRPC procedures.
 * Replaces the Go backend user endpoints:
 * - GET /users -> users.list
 * - GET /users/{id} -> users.getById
 * - POST /users -> users.create
 * - PATCH /users/{id} -> users.update
 * - DELETE /users/{id} -> users.delete
 * - POST /users/{id}/password -> users.changePassword
 *
 * @see apps/api/internal/service/user.go
 * @see apps/api/internal/handler/user.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import {
  requirePermission,
  requireSelfOrPermission,
} from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { hasPermission, isUserAdmin } from "@/lib/auth/permissions"
import { handleServiceError } from "@/trpc/errors"
import * as userService from "@/lib/services/users-service"

// --- Permission Constants ---

const USERS_MANAGE = permissionIdByKey("users.manage")!

// --- Enums ---

const dataScopeTypeEnum = z.enum([
  "all",
  "tenant",
  "department",
  "employee",
])

// --- Output Schemas ---

const userOutputSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  tenantId: z.string().nullable(),
  userGroupId: z.string().nullable(),
  employeeId: z.string().nullable(),
  username: z.string().nullable(),
  ssoId: z.string().nullable(),
  isActive: z.boolean().nullable(),
  isLocked: z.boolean(),
  dataScopeType: z.string(),
  dataScopeTenantIds: z.array(z.string()),
  dataScopeDepartmentIds: z.array(z.string()),
  dataScopeEmployeeIds: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const userWithRelationsOutputSchema = userOutputSchema.extend({
  tenant: z
    .object({ id: z.string(), name: z.string(), slug: z.string() })
    .nullable(),
  userGroup: z
    .object({ id: z.string(), name: z.string(), code: z.string() })
    .nullable(),
  employee: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
    })
    .nullable(),
})

// --- Input Schemas ---

const createUserInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  username: z.string().optional(),
  userGroupId: z.string().optional(),
  employeeId: z.string().optional(),
  password: z.string().min(8).optional(),
  ssoId: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  isLocked: z.boolean().optional().default(false),
  dataScopeType: dataScopeTypeEnum.optional().default("all"),
  dataScopeTenantIds: z
    .array(z.string())
    .optional()
    .default([]),
  dataScopeDepartmentIds: z
    .array(z.string())
    .optional()
    .default([]),
  dataScopeEmployeeIds: z
    .array(z.string())
    .optional()
    .default([]),
})

const updateUserInputSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1).optional(),
  avatarUrl: z.string().nullable().optional(),
  userGroupId: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  ssoId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  dataScopeType: dataScopeTypeEnum.optional(),
  dataScopeTenantIds: z.array(z.string()).optional(),
  dataScopeDepartmentIds: z.array(z.string()).optional(),
  dataScopeEmployeeIds: z.array(z.string()).optional(),
})

const changePasswordInputSchema = z.object({
  userId: z.string(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

// --- Helpers ---

/**
 * Maps a Prisma User to the output schema shape.
 */
function mapUserToOutput(user: {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  role: string
  tenantId: string | null
  userGroupId: string | null
  employeeId: string | null
  username: string | null
  ssoId: string | null
  isActive: boolean | null
  isLocked: boolean
  dataScopeType: string
  dataScopeTenantIds: string[]
  dataScopeDepartmentIds: string[]
  dataScopeEmployeeIds: string[]
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    tenantId: user.tenantId,
    userGroupId: user.userGroupId,
    employeeId: user.employeeId,
    username: user.username,
    ssoId: user.ssoId,
    isActive: user.isActive,
    isLocked: user.isLocked,
    dataScopeType: user.dataScopeType,
    dataScopeTenantIds: user.dataScopeTenantIds,
    dataScopeDepartmentIds: user.dataScopeDepartmentIds,
    dataScopeEmployeeIds: user.dataScopeEmployeeIds,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

// --- Router ---

export const usersRouter = createTRPCRouter({
  /**
   * users.list -- Returns paginated users for the current tenant.
   *
   * Requires: users.manage permission
   * Supports search across email, displayName, username.
   *
   * Replaces: GET /users (Go UserHandler.List)
   */
  list: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(
      z
        .object({
          search: z.string().max(255).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional()
    )
    .output(
      z.object({
        data: z.array(userOutputSchema),
        meta: z.object({ total: z.number(), limit: z.number() }),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const result = await userService.list(ctx.prisma, ctx.tenantId!, {
          search: input?.search,
          limit: input?.limit,
        })

        return {
          data: result.users.map(mapUserToOutput),
          meta: { total: result.total, limit: result.limit },
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * users.getById -- Returns a single user with relations.
   *
   * Requires: users.manage permission
   *
   * Replaces: GET /users/{id} (Go UserHandler.GetByID)
   */
  getById: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(userWithRelationsOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const user = await userService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )

        return {
          ...mapUserToOutput(user),
          tenant: user.tenant
            ? {
                id: user.tenant.id,
                name: user.tenant.name,
                slug: user.tenant.slug,
              }
            : null,
          userGroup: user.userGroup
            ? {
                id: user.userGroup.id,
                name: user.userGroup.name,
                code: user.userGroup.code,
              }
            : null,
          employee: user.employee
            ? {
                id: user.employee.id,
                firstName: user.employee.firstName,
                lastName: user.employee.lastName,
              }
            : null,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * users.create -- Creates a new user.
   *
   * Requires: users.manage permission
   * Auto-adds the user to the tenant via userTenants join table.
   * Promotes role to "admin" if assigned to an admin user group.
   *
   * Replaces: POST /users (Go UserHandler.Create + UserService.CreateUser)
   */
  create: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(createUserInputSchema)
    .output(userOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const user = await userService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapUserToOutput(user)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * users.update -- Updates an existing user.
   *
   * Self-update allowed for non-admin fields (displayName, avatarUrl).
   * Admin-only fields require users.manage permission.
   * Cascades role change when userGroupId changes.
   *
   * Replaces: PATCH /users/{id} (Go UserHandler.Update + UserService.Update)
   */
  update: tenantProcedure
    .input(updateUserInputSchema)
    .use(
      requireSelfOrPermission(
        (input) => (input as { id: string }).id,
        USERS_MANAGE
      )
    )
    .output(userOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const currentUser = ctx.user!
        const canManage =
          hasPermission(currentUser, USERS_MANAGE) ||
          isUserAdmin(currentUser)

        const user = await userService.update(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { canManageAdminFields: canManage },
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapUserToOutput(user)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * users.delete -- Deletes a user.
   *
   * Requires: users.manage permission
   * Cannot delete yourself.
   * Uses hard delete to match Go behavior.
   *
   * Replaces: DELETE /users/{id} (Go UserHandler.Delete + UserService.Delete)
   */
  delete: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await userService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * users.changePassword -- Changes a user's password.
   *
   * Self or users.manage permission required.
   * Uses Supabase Admin API for password updates.
   *
   * Replaces: POST /users/{id}/password (Go UserHandler.ChangePassword)
   */
  changePassword: tenantProcedure
    .input(changePasswordInputSchema)
    .use(
      requireSelfOrPermission(
        (input) => (input as { userId: string }).userId,
        USERS_MANAGE
      )
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await userService.changePassword(
          ctx.prisma,
          ctx.tenantId!,
          input.userId,
          input.newPassword,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
