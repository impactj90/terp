/**
 * Activities Router
 *
 * Provides activity CRUD operations via tRPC procedures.
 * Replaces the Go backend activity endpoints:
 * - GET /activities -> activities.list
 * - GET /activities/{id} -> activities.getById
 * - POST /activities -> activities.create
 * - PATCH /activities/{id} -> activities.update
 * - DELETE /activities/{id} -> activities.delete
 *
 * @see apps/api/internal/service/activity.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ACTIVITIES_MANAGE = permissionIdByKey("activities.manage")!

// --- Output Schemas ---

const activityOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type ActivityOutput = z.infer<typeof activityOutputSchema>

// --- Input Schemas ---

const createActivityInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
})

const updateActivityInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma Activity record to the output schema shape.
 */
function mapActivityToOutput(a: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): ActivityOutput {
  return {
    id: a.id,
    tenantId: a.tenantId,
    code: a.code,
    name: a.name,
    description: a.description,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

// --- Router ---

export const activitiesRouter = createTRPCRouter({
  /**
   * activities.list -- Returns activities for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC.
   *
   * Requires: activities.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(activityOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const activities = await ctx.prisma.activity.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: activities.map(mapActivityToOutput),
      }
    }),

  /**
   * activities.getById -- Returns a single activity by ID.
   *
   * Tenant-scoped: only returns activities belonging to the current tenant.
   *
   * Requires: activities.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(activityOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const activity = await ctx.prisma.activity.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!activity) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity not found",
        })
      }

      return mapActivityToOutput(activity)
    }),

  /**
   * activities.create -- Creates a new activity.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * Always sets isActive to true (no isActive input, matching Go behavior).
   *
   * Requires: activities.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(createActivityInputSchema)
    .output(activityOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activity code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activity name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.activity.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Activity code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create activity -- always isActive: true (matching Go behavior)
      const activity = await ctx.prisma.activity.create({
        data: {
          tenantId,
          code,
          name,
          description,
          isActive: true,
        },
      })

      return mapActivityToOutput(activity)
    }),

  /**
   * activities.update -- Updates an existing activity.
   *
   * Supports partial updates. Code uniqueness check only when code actually
   * changes (matching Go logic at apps/api/internal/service/activity.go:109).
   *
   * Requires: activities.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(updateActivityInputSchema)
    .output(activityOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify activity exists (tenant-scoped)
      const existing = await ctx.prisma.activity.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity not found",
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
            message: "Activity code is required",
          })
        }
        // Check uniqueness only if code actually changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.activity.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Activity code already exists",
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
            message: "Activity name is required",
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

      const activity = await ctx.prisma.activity.update({
        where: { id: input.id },
        data,
      })

      return mapActivityToOutput(activity)
    }),

  /**
   * activities.delete -- Deletes an activity.
   *
   * Prevents deletion when employees have defaultActivityId referencing it.
   *
   * Requires: activities.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ACTIVITIES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify activity exists (tenant-scoped)
      const existing = await ctx.prisma.activity.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity not found",
        })
      }

      // Check for employees with defaultActivityId
      const employeeCount = await ctx.prisma.employee.count({
        where: { defaultActivityId: input.id },
      })
      if (employeeCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete activity with assigned employees",
        })
      }

      // Hard delete
      await ctx.prisma.activity.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
