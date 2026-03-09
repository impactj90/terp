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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import {
  requirePermission,
  requireSelfOrPermission,
} from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { hasPermission, isUserAdmin } from "../lib/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

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
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  tenantId: z.string().uuid().nullable(),
  userGroupId: z.string().uuid().nullable(),
  employeeId: z.string().uuid().nullable(),
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
  tenantId: z.string().uuid().optional(),
  username: z.string().optional(),
  userGroupId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  password: z.string().optional(),
  ssoId: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  isLocked: z.boolean().optional().default(false),
  dataScopeType: dataScopeTypeEnum.optional().default("all"),
  dataScopeTenantIds: z
    .array(z.string().uuid())
    .optional()
    .default([]),
  dataScopeDepartmentIds: z
    .array(z.string().uuid())
    .optional()
    .default([]),
  dataScopeEmployeeIds: z
    .array(z.string().uuid())
    .optional()
    .default([]),
})

const updateUserInputSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).optional(),
  avatarUrl: z.string().nullable().optional(),
  userGroupId: z.string().uuid().nullable().optional(),
  username: z.string().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  ssoId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  dataScopeType: dataScopeTypeEnum.optional(),
  dataScopeTenantIds: z.array(z.string().uuid()).optional(),
  dataScopeDepartmentIds: z.array(z.string().uuid()).optional(),
  dataScopeEmployeeIds: z.array(z.string().uuid()).optional(),
})

const changePasswordInputSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(1, "New password is required"),
})

// --- Helpers ---

/**
 * Fields that require admin/users.manage to modify.
 * Mirrors Go user.go lines 231-247.
 */
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

function hasAdminOnlyFields(input: Record<string, unknown>): boolean {
  return ADMIN_ONLY_FIELDS.some((field) => input[field] !== undefined)
}

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
          search: z.string().optional(),
          limit: z.number().optional(),
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
      const limit = Math.min(
        Math.max(input?.limit ?? 20, 1),
        100
      )

      const where: Record<string, unknown> = {
        tenantId: ctx.tenantId,
      }

      // Search filter across email, displayName, username
      if (input?.search) {
        where.OR = [
          {
            email: {
              contains: input.search,
              mode: "insensitive",
            },
          },
          {
            displayName: {
              contains: input.search,
              mode: "insensitive",
            },
          },
          {
            username: {
              contains: input.search,
              mode: "insensitive",
            },
          },
        ]
      }

      const [users, total] = await Promise.all([
        ctx.prisma.user.findMany({
          where,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        ctx.prisma.user.count({ where }),
      ])

      return {
        data: users.map(mapUserToOutput),
        meta: { total, limit },
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
    .input(z.object({ id: z.string().uuid() }))
    .output(userWithRelationsOutputSchema)
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          tenant: true,
          userGroup: true,
          employee: true,
        },
      })

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

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
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = input.tenantId ?? ctx.tenantId!

      // Set defaults
      let role = "user"
      const isActive = input.isActive ?? true
      const isLocked = input.isLocked ?? false

      // If userGroupId provided, look up the group
      if (input.userGroupId) {
        const group = await ctx.prisma.userGroup.findUnique({
          where: { id: input.userGroupId },
        })
        if (!group) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User group not found",
          })
        }
        if (group.isAdmin) {
          role = "admin"
        }
      }

      // Normalize optional strings
      const username = input.username?.trim() || null
      const ssoId = input.ssoId?.trim() || null

      // Create user
      const user = await ctx.prisma.user.create({
        data: {
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
          dataScopeType: input.dataScopeType,
          dataScopeTenantIds: input.dataScopeTenantIds,
          dataScopeDepartmentIds: input.dataScopeDepartmentIds,
          dataScopeEmployeeIds: input.dataScopeEmployeeIds,
        },
      })

      // Auto-add user to tenant
      await ctx.prisma.userTenant.upsert({
        where: {
          userId_tenantId: {
            userId: user.id,
            tenantId,
          },
        },
        create: {
          userId: user.id,
          tenantId,
          role: "member",
        },
        update: {},
      })

      return mapUserToOutput(user)
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
    .use(
      requireSelfOrPermission(
        (input) => (input as { id: string }).id,
        USERS_MANAGE
      )
    )
    .input(updateUserInputSchema)
    .output(userOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch target user (scoped to current tenant)
      const existing = await ctx.prisma.user.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
      })

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      // Check admin-only fields
      // ctx.user is guaranteed non-null by protectedProcedure/tenantProcedure
      const currentUser = ctx.user!
      const canManage =
        hasPermission(currentUser, USERS_MANAGE) ||
        isUserAdmin(currentUser)
      if (hasAdminOnlyFields(input) && !canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient permissions for admin fields",
        })
      }

      // Build update data from provided fields
      const data: Record<string, unknown> = {}

      if (input.displayName !== undefined) {
        const displayName = input.displayName.trim()
        if (displayName.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Display name cannot be empty",
          })
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
          const group = await ctx.prisma.userGroup.findUnique({
            where: { id: input.userGroupId },
          })
          if (!group) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "User group not found",
            })
          }
          data.userGroupId = input.userGroupId
          data.role = group.isAdmin ? "admin" : "user"
        }
      }

      if (input.username !== undefined) {
        data.username =
          input.username === null
            ? null
            : input.username.trim() || null
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

      const user = await ctx.prisma.user.update({
        where: { id: input.id },
        data,
      })

      return mapUserToOutput(user)
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Cannot delete self
      // ctx.user is guaranteed non-null by tenantProcedure
      if (ctx.user!.id === input.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete yourself",
        })
      }

      // Verify user exists (scoped to current tenant)
      const existing = await ctx.prisma.user.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      // Hard delete to match Go behavior
      await ctx.prisma.user.delete({
        where: { id: input.id },
      })

      return { success: true }
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
    .use(
      requireSelfOrPermission(
        (input) => (input as { userId: string }).userId,
        USERS_MANAGE
      )
    )
    .input(changePasswordInputSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Verify target user exists (scoped to current tenant)
      const existing = await ctx.prisma.user.findFirst({
        where: { id: input.userId, tenantId: ctx.tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      // Use Supabase Admin API to update password
      const adminClient = createAdminClient()
      const { error } =
        await adminClient.auth.admin.updateUserById(input.userId, {
          password: input.newPassword,
        })

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update password",
        })
      }

      return { success: true }
    }),
})
