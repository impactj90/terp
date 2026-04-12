/**
 * Shifts Router
 *
 * Provides shift CRUD operations via tRPC procedures.
 *
 * Replaces the Go backend shift endpoints:
 * - GET /shifts -> shifts.list
 * - GET /shifts/{id} -> shifts.getById
 * - POST /shifts -> shifts.create
 * - PATCH /shifts/{id} -> shifts.update
 * - DELETE /shifts/{id} -> shifts.delete
 *
 * @see apps/api/internal/service/shift.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as shiftService from "@/lib/services/shift-service"

// --- Permission Constants ---

const SHIFT_PLANNING_MANAGE = permissionIdByKey("shift_planning.manage")!

// --- Output Schemas ---

const shiftOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  dayPlanId: z.string().nullable(),
  color: z.string().nullable(),
  qualification: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Input Schemas ---

const createShiftInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  dayPlanId: z.string().optional(),
  color: z.string().max(7).optional(),
  qualification: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

const updateShiftInputSchema = z.object({
  id: z.string(),
  // Code is NOT updatable (immutable after creation)
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  dayPlanId: z.string().nullable().optional(),
  color: z.string().max(7).nullable().optional(),
  qualification: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Helpers ---

function mapShift(s: {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  dayPlanId: string | null
  color: string | null
  qualification: string | null
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: s.id,
    tenantId: s.tenantId,
    code: s.code,
    name: s.name,
    description: s.description,
    dayPlanId: s.dayPlanId,
    color: s.color,
    qualification: s.qualification,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }
}

// --- Router ---

export const shiftsRouter = createTRPCRouter({
  /**
   * shifts.list -- Returns all shifts for the current tenant.
   *
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: shift_planning.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(SHIFT_PLANNING_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(shiftOutputSchema) }))
    .query(async ({ ctx }) => {
      try {
        const shifts = await shiftService.list(ctx.prisma, ctx.tenantId!)
        return { data: shifts.map(mapShift) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * shifts.getById -- Returns a single shift by ID.
   *
   * Requires: shift_planning.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(SHIFT_PLANNING_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(shiftOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const shift = await shiftService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapShift(shift)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * shifts.create -- Creates a new shift.
   *
   * Validates code/name non-empty, code uniqueness per tenant,
   * and dayPlanId FK if provided.
   *
   * Requires: shift_planning.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(SHIFT_PLANNING_MANAGE))
    .input(createShiftInputSchema)
    .output(shiftOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const shift = await shiftService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapShift(shift)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * shifts.update -- Updates an existing shift.
   *
   * Supports partial updates. Code is NOT updatable.
   *
   * Requires: shift_planning.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(SHIFT_PLANNING_MANAGE))
    .input(updateShiftInputSchema)
    .output(shiftOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const shift = await shiftService.update(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapShift(shift)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * shifts.delete -- Deletes a shift.
   *
   * Checks if the shift is in use by employee_day_plans or shift_assignments
   * before deletion.
   *
   * Requires: shift_planning.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(SHIFT_PLANNING_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await shiftService.remove(ctx.prisma, ctx.tenantId!, input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
