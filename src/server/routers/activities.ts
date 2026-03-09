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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import * as activityService from "@/lib/services/activity-service"
import type { PrismaClient } from "@/generated/prisma/client"

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
      try {
        const tenantId = ctx.tenantId!
        const activities = await activityService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return {
          data: activities.map(mapActivityToOutput),
        }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const activity = await activityService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return mapActivityToOutput(activity)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const activity = await activityService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return mapActivityToOutput(activity)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const activity = await activityService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
        )
        return mapActivityToOutput(activity)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        await activityService.remove(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
