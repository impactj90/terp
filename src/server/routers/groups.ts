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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const GROUPS_MANAGE = permissionIdByKey("groups.manage")!

// --- Types ---

const groupTypeSchema = z.enum(["employee", "workflow", "activity"])
type GroupType = z.infer<typeof groupTypeSchema>

// --- Output Schemas ---

const groupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
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
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Returns the correct Prisma delegate based on the group type.
 */
function getGroupDelegate(prisma: PrismaClient, type: GroupType) {
  switch (type) {
    case "employee":
      return prisma.employeeGroup
    case "workflow":
      return prisma.workflowGroup
    case "activity":
      return prisma.activityGroup
  }
}

/**
 * Returns the Employee FK column name for the given group type.
 * Used for checking if employees are assigned to a group before deletion.
 */
function getEmployeeFkColumn(type: GroupType): string {
  switch (type) {
    case "employee":
      return "employeeGroupId"
    case "workflow":
      return "workflowGroupId"
    case "activity":
      return "activityGroupId"
  }
}

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
      const tenantId = ctx.tenantId!
      const delegate = getGroupDelegate(
        ctx.prisma as unknown as PrismaClient,
        input.type
      )

      const where: Record<string, unknown> = { tenantId }
      if (input.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const groups = await (delegate as any).findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: groups.map(mapGroupToOutput),
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
        id: z.string().uuid(),
      })
    )
    .output(groupOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const delegate = getGroupDelegate(
        ctx.prisma as unknown as PrismaClient,
        input.type
      )

      const group = await (delegate as any).findFirst({
        where: { id: input.id, tenantId },
      })

      if (!group) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Group not found",
        })
      }

      return mapGroupToOutput(group)
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
      const tenantId = ctx.tenantId!
      const delegate = getGroupDelegate(
        ctx.prisma as unknown as PrismaClient,
        input.type
      )

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Group code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Group name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await (delegate as any).findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Group code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create group
      const group = await (delegate as any).create({
        data: {
          tenantId,
          code,
          name,
          description,
          isActive: input.isActive ?? true,
        },
      })

      return mapGroupToOutput(group)
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
      const tenantId = ctx.tenantId!
      const delegate = getGroupDelegate(
        ctx.prisma as unknown as PrismaClient,
        input.type
      )

      // Verify group exists (tenant-scoped)
      const existing = await (delegate as any).findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Group not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle code update
      if (input.code !== undefined) {
        const code = input.code.trim()
        if (code.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Group code is required",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await (delegate as any).findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Group code already exists",
            })
          }
        }
        data.code = code
      }

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Group name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const group = await (delegate as any).update({
        where: { id: input.id },
        data,
      })

      return mapGroupToOutput(group)
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
        id: z.string().uuid(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const delegate = getGroupDelegate(
        ctx.prisma as unknown as PrismaClient,
        input.type
      )

      // Verify group exists (tenant-scoped)
      const existing = await (delegate as any).findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Group not found",
        })
      }

      // Check for employees assigned to this group
      const fkColumn = getEmployeeFkColumn(input.type)
      const employeeCount = await ctx.prisma.employee.count({
        where: { [fkColumn]: input.id },
      })
      if (employeeCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete group with assigned employees",
        })
      }

      // Hard delete
      await (delegate as any).delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
