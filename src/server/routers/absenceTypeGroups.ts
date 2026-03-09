/**
 * Absence Type Groups Router
 *
 * Provides absence type group CRUD operations via tRPC procedures.
 * Replaces the Go backend absence type group endpoints:
 * - GET /absence-type-groups -> absenceTypeGroups.list
 * - GET /absence-type-groups/{id} -> absenceTypeGroups.getById
 * - POST /absence-type-groups -> absenceTypeGroups.create
 * - PATCH /absence-type-groups/{id} -> absenceTypeGroups.update
 * - DELETE /absence-type-groups/{id} -> absenceTypeGroups.delete
 *
 * @see apps/api/internal/service/absencetypegroup.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as absenceTypeGroupService from "@/lib/services/absence-type-group-service"

// --- Permission Constants ---

const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!

// --- Output Schemas ---

const absenceTypeGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type AbsenceTypeGroupOutput = z.infer<typeof absenceTypeGroupOutputSchema>

// --- Input Schemas ---

const createAbsenceTypeGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
})

const updateAbsenceTypeGroupInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma AbsenceTypeGroup record to the output schema shape.
 */
function mapToOutput(a: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): AbsenceTypeGroupOutput {
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

export const absenceTypeGroupsRouter = createTRPCRouter({
  /**
   * absenceTypeGroups.list -- Returns absence type groups for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC.
   *
   * Requires: absence_types.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(absenceTypeGroupOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const groups = await absenceTypeGroupService.list(
          ctx.prisma,
          tenantId,
          input ?? undefined
        )
        return {
          data: groups.map(mapToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * absenceTypeGroups.getById -- Returns a single absence type group by ID.
   *
   * Tenant-scoped: only returns groups belonging to the current tenant.
   *
   * Requires: absence_types.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(absenceTypeGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const group = await absenceTypeGroupService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * absenceTypeGroups.create -- Creates a new absence type group.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * Always sets isActive to true.
   *
   * Requires: absence_types.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(createAbsenceTypeGroupInputSchema)
    .output(absenceTypeGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const group = await absenceTypeGroupService.create(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * absenceTypeGroups.update -- Updates an existing absence type group.
   *
   * Supports partial updates. Code uniqueness check only when code actually
   * changes (matching Go logic).
   *
   * Requires: absence_types.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(updateAbsenceTypeGroupInputSchema)
    .output(absenceTypeGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const group = await absenceTypeGroupService.update(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(group)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * absenceTypeGroups.delete -- Deletes an absence type group.
   *
   * Requires: absence_types.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await absenceTypeGroupService.remove(ctx.prisma, tenantId, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
