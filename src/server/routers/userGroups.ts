/**
 * UserGroups Router
 *
 * Provides user group CRUD operations via tRPC procedures.
 * Replaces the Go backend user group endpoints:
 * - GET /user-groups -> userGroups.list
 * - GET /user-groups/{id} -> userGroups.getById
 * - POST /user-groups -> userGroups.create
 * - PATCH /user-groups/{id} -> userGroups.update
 * - DELETE /user-groups/{id} -> userGroups.delete
 *
 * @see apps/api/internal/service/usergroup.go
 * @see apps/api/internal/handler/usergroup.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import {
  permissionIdByKey,
  lookupPermission,
} from "../lib/permission-catalog"

// --- Permission Constants ---

const USERS_MANAGE = permissionIdByKey("users.manage")!

// --- Output Schemas ---

const permissionOutputSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string(),
})

const userGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  permissions: z.array(permissionOutputSchema),
  isAdmin: z.boolean().nullable(),
  isSystem: z.boolean().nullable(),
  isActive: z.boolean(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
})

// --- Input Schemas ---

const createUserGroupInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),
  description: z.string().optional(),
  permissions: z.array(z.string().uuid()).default([]),
  isAdmin: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

const updateUserGroupInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string().uuid()).optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Resolve permission UUIDs from JSONB to full permission objects.
 * Mirrors Go's mapUserGroupToResponse (response.go lines 108-158).
 */
function resolvePermissionIds(
  permissionsJson: unknown
): z.infer<typeof permissionOutputSchema>[] {
  const ids = (permissionsJson as string[] | null) ?? []
  return ids
    .map((id) => lookupPermission(id))
    .filter(Boolean)
    .map((p) => ({
      id: p!.id,
      key: p!.key,
      resource: p!.resource,
      action: p!.action,
      description: p!.description,
    }))
}

/**
 * Validate all permission IDs exist in the catalog.
 * Mirrors Go's validatePermissionIDs (usergroup.go lines 281-288).
 */
function validatePermissionIds(ids: string[]): void {
  for (const id of ids) {
    if (!lookupPermission(id)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid permission ID: ${id}`,
      })
    }
  }
}

/**
 * Maps a Prisma UserGroup to the output schema shape.
 */
function mapUserGroupToOutput(
  group: {
    id: string
    tenantId: string | null
    name: string
    code: string
    description: string | null
    permissions: unknown
    isAdmin: boolean | null
    isSystem: boolean | null
    isActive: boolean
    createdAt: Date | null
    updatedAt: Date | null
  },
  extraFields?: { usersCount?: number }
) {
  return {
    id: group.id,
    tenantId: group.tenantId,
    name: group.name,
    code: group.code,
    description: group.description,
    permissions: resolvePermissionIds(group.permissions),
    isAdmin: group.isAdmin,
    isSystem: group.isSystem,
    isActive: group.isActive,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    ...extraFields,
  }
}

// --- Router ---

export const userGroupsRouter = createTRPCRouter({
  /**
   * userGroups.list -- Returns user groups for the current tenant.
   *
   * Includes system groups (tenantId IS NULL) alongside tenant groups.
   * Orders by isSystem DESC, name ASC.
   *
   * Requires: users.manage permission
   *
   * Replaces: GET /user-groups (Go UserGroupHandler.List)
   */
  list: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(
      z
        .object({
          active: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(userGroupOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
      }

      if (input?.active !== undefined) {
        where.isActive = input.active
      }

      const groups = await ctx.prisma.userGroup.findMany({
        where,
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      })

      return {
        data: groups.map((g) => mapUserGroupToOutput(g)),
      }
    }),

  /**
   * userGroups.getById -- Returns a single user group with user count.
   *
   * Requires: users.manage permission
   *
   * Replaces: GET /user-groups/{id} (Go UserGroupHandler.Get)
   */
  getById: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(
      userGroupOutputSchema.extend({ usersCount: z.number() })
    )
    .query(async ({ ctx, input }) => {
      const group = await ctx.prisma.userGroup.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        },
        include: { _count: { select: { users: true } } },
      })

      if (!group) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User group not found",
        })
      }

      return {
        ...mapUserGroupToOutput(group),
        usersCount: group._count.users,
      }
    }),

  /**
   * userGroups.create -- Creates a new user group.
   *
   * Requires: users.manage permission
   * Validates all permission IDs against the catalog.
   * Defaults code to uppercased name if not provided.
   *
   * Replaces: POST /user-groups (Go UserGroupHandler.Create + UserGroupService.Create)
   */
  create: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(createUserGroupInputSchema)
    .output(userGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // Normalize name and code
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Name is required",
        })
      }

      const code = (input.code?.trim() || name).toUpperCase()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Code is required",
        })
      }

      // Check name uniqueness within tenant (include system groups)
      const existingByName = await ctx.prisma.userGroup.findFirst({
        where: {
          name,
          OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        },
      })
      if (existingByName) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User group with this name already exists",
        })
      }

      // Check code uniqueness within tenant (include system groups)
      const existingByCode = await ctx.prisma.userGroup.findFirst({
        where: {
          code,
          OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User group code already exists for this tenant",
        })
      }

      // Validate all permission IDs
      validatePermissionIds(input.permissions)

      // Create user group
      const group = await ctx.prisma.userGroup.create({
        data: {
          tenantId: ctx.tenantId,
          name,
          code,
          description: input.description?.trim() || null,
          permissions: input.permissions,
          isAdmin: input.isAdmin,
          isSystem: false,
          isActive: input.isActive,
        },
      })

      return mapUserGroupToOutput(group)
    }),

  /**
   * userGroups.update -- Updates an existing user group.
   *
   * Requires: users.manage permission
   * System groups cannot be modified.
   * If isAdmin changes, cascades role update to all users in the group.
   *
   * Replaces: PATCH /user-groups/{id} (Go UserGroupHandler.Update + UserGroupService.Update)
   */
  update: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(updateUserGroupInputSchema)
    .output(userGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch existing group (scoped to current tenant or system groups)
      const existing = await ctx.prisma.userGroup.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        },
      })

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User group not found",
        })
      }

      // System groups cannot be modified
      if (existing.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot modify system group",
        })
      }

      const previousIsAdmin = existing.isAdmin

      // Build update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Name cannot be empty",
          })
        }
        // Check uniqueness if changed
        if (name !== existing.name) {
          const existingByName =
            await ctx.prisma.userGroup.findFirst({
              where: {
                name,
                OR: [
                  { tenantId: ctx.tenantId },
                  { tenantId: null },
                ],
                NOT: { id: input.id },
              },
            })
          if (existingByName) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "User group with this name already exists",
            })
          }
        }
        data.name = name
      }

      if (input.code !== undefined) {
        const code = input.code.trim().toUpperCase()
        if (code.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Code cannot be empty",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode =
            await ctx.prisma.userGroup.findFirst({
              where: {
                code,
                OR: [
                  { tenantId: ctx.tenantId },
                  { tenantId: null },
                ],
                NOT: { id: input.id },
              },
            })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "User group code already exists for this tenant",
            })
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
      const group = await ctx.prisma.userGroup.update({
        where: { id: input.id },
        data,
      })

      // If isAdmin changed, cascade role update to all users in this group
      if (
        input.isAdmin !== undefined &&
        (previousIsAdmin ?? false) !== input.isAdmin
      ) {
        const newRole = input.isAdmin ? "admin" : "user"
        await ctx.prisma.user.updateMany({
          where: { userGroupId: input.id },
          data: { role: newRole },
        })
      }

      return mapUserGroupToOutput(group)
    }),

  /**
   * userGroups.delete -- Deletes a user group.
   *
   * Requires: users.manage permission
   * System groups cannot be deleted.
   *
   * Replaces: DELETE /user-groups/{id} (Go UserGroupHandler.Delete + UserGroupService.Delete)
   */
  delete: tenantProcedure
    .use(requirePermission(USERS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.userGroup.findFirst({
        where: {
          id: input.id,
          OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        },
      })

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User group not found",
        })
      }

      // System groups cannot be deleted
      if (existing.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete system group",
        })
      }

      await ctx.prisma.userGroup.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
