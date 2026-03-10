/**
 * Groups Router
 *
 * Provides CRUD operations for three group types (employee, workflow, activity)
 * via a single tRPC router with a `type` discriminator input.
 *
 * Each group type maps to a separate Prisma model/table with identical schemas.
 * The router uses a helper to select the correct Prisma delegate per type.
 *
 * Replaces the Go backend group endpoints:
 * - GET /employee-groups, /workflow-groups, /activity-groups -> groups.list
 * - GET /employee-groups/{id}, etc. -> groups.getById
 * - POST /employee-groups, etc. -> groups.create
 * - PATCH /employee-groups/{id}, etc. -> groups.update
 * - DELETE /employee-groups/{id}, etc. -> groups.delete
 *
 * @see apps/api/internal/service/group.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as groupService from "@/lib/services/group-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const GROUPS_MANAGE = permissionIdByKey("groups.manage")!

// --- Types ---

const groupTypeSchema = z.enum(["employee", "workflow", "activity"])

// --- Output Schemas ---

const groupOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type GroupOutput = z.infer<typeof groupOutputSchema>

// --- Input Schemas ---

const createGroupInputSchema = z.object({
  type: groupTypeSchema,
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
})

const updateGroupInputSchema = z.object({
  type: groupTypeSchema,
  id: z.string(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma group record to the output schema shape.
 */
function mapGroupToOutput(group: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): GroupOutput {
  return {
    id: group.id,
    tenantId: group.tenantId,
    code: group.code,
    name: group.name,
    description: group.description,
    isActive: group.isActive,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }
}

// --- Router ---

export const groupsRouter = createTRPCRouter({
  /**
   * groups.list -- Returns groups for the current tenant by type.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC.
   *
   * Requires: groups.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(GROUPS_MANAGE))
    .input(
      z.object({
        type: groupTypeSchema,
        isActive: z.boolean().optional(),
      })
    )
    .output(z.object({ data: z.array(groupOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const groups = await groupService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.type,
          { isActive: input.isActive }
        )
        return {
          data: groups.map(mapGroupToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * groups.getById -- Returns a single group by ID and type.
   *
   * Tenant-scoped: only returns groups belonging to the current tenant.
   *
   * Requires: groups.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(GROUPS_MANAGE))
    .input(
      z.object({
        type: groupTypeSchema,
        id: z.string(),
      })
    )
    .output(groupOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const group = await groupService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.type,
          input.id
        )
        return mapGroupToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * groups.create -- Creates a new group.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant for the specific group type.
   * Defaults isActive to true.
   *
   * Requires: groups.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(GROUPS_MANAGE))
    .input(createGroupInputSchema)
    .output(groupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const { type, ...rest } = input
        const group = await groupService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          type,
          rest
        )
        return mapGroupToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * groups.update -- Updates an existing group.
   *
   * Supports partial updates. Validates code/name uniqueness when changed.
   *
   * Requires: groups.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(GROUPS_MANAGE))
    .input(updateGroupInputSchema)
    .output(groupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const { type, ...rest } = input
        const group = await groupService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          type,
          rest
        )
        return mapGroupToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * groups.delete -- Deletes a group.
   *
   * Prevents deletion when employees are assigned to the group.
   *
   * Requires: groups.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(GROUPS_MANAGE))
    .input(
      z.object({
        type: groupTypeSchema,
        id: z.string(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await groupService.remove(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.type,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
