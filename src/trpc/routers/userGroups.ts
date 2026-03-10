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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import {
  permissionIdByKey,
  lookupPermission,
} from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as userGroupService from "@/lib/services/user-group-service"

// --- Permission Constants ---

const USERS_MANAGE = permissionIdByKey("users.manage")!

// --- Output Schemas ---

const permissionOutputSchema = z.object({
  id: z.string(),
  key: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string(),
})

const userGroupOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
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
  permissions: z.array(z.string()).default([]),
  isAdmin: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

const updateUserGroupInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
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
      try {
        const groups = await userGroupService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ?? undefined
        )

        return {
          data: groups.map((g) => mapUserGroupToOutput(g)),
        }
      } catch (err) {
        handleServiceError(err)
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
    .input(z.object({ id: z.string() }))
    .output(
      userGroupOutputSchema.extend({ usersCount: z.number() })
    )
    .query(async ({ ctx, input }) => {
      try {
        const group = await userGroupService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )

        return {
          ...mapUserGroupToOutput(group),
          usersCount: group._count.users,
        }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const group = await userGroupService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return mapUserGroupToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const group = await userGroupService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return mapUserGroupToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await userGroupService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
