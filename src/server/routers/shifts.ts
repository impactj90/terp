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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const SHIFT_PLANNING_MANAGE = permissionIdByKey("shift_planning.manage")!

// --- Output Schemas ---

const shiftOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  dayPlanId: z.string().uuid().nullable(),
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
  dayPlanId: z.string().uuid().optional(),
  color: z.string().max(7).optional(),
  qualification: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

const updateShiftInputSchema = z.object({
  id: z.string().uuid(),
  // Code is NOT updatable (immutable after creation)
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  dayPlanId: z.string().uuid().nullable().optional(),
  color: z.string().max(7).nullable().optional(),
  qualification: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

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
      const tenantId = ctx.tenantId!

      const shifts = await ctx.prisma.shift.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: shifts.map((s) => ({
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
        })),
      }
    }),

  /**
   * shifts.getById -- Returns a single shift by ID.
   *
   * Requires: shift_planning.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(SHIFT_PLANNING_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(shiftOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const shift = await ctx.prisma.shift.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!shift) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shift not found",
        })
      }

      return {
        id: shift.id,
        tenantId: shift.tenantId,
        code: shift.code,
        name: shift.name,
        description: shift.description,
        dayPlanId: shift.dayPlanId,
        color: shift.color,
        qualification: shift.qualification,
        isActive: shift.isActive,
        sortOrder: shift.sortOrder,
        createdAt: shift.createdAt,
        updatedAt: shift.updatedAt,
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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Shift code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Shift name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.shift.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Shift code already exists",
        })
      }

      // Validate dayPlanId FK if provided
      if (input.dayPlanId) {
        const dp = await ctx.prisma.dayPlan.findFirst({
          where: { id: input.dayPlanId, tenantId },
        })
        if (!dp) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid day plan reference",
          })
        }
      }

      const shift = await ctx.prisma.shift.create({
        data: {
          tenantId,
          code,
          name,
          description: input.description?.trim() || null,
          dayPlanId: input.dayPlanId || null,
          color: input.color || null,
          qualification: input.qualification || null,
          isActive: true,
          sortOrder: input.sortOrder ?? 0,
        },
      })

      return {
        id: shift.id,
        tenantId: shift.tenantId,
        code: shift.code,
        name: shift.name,
        description: shift.description,
        dayPlanId: shift.dayPlanId,
        color: shift.color,
        qualification: shift.qualification,
        isActive: shift.isActive,
        sortOrder: shift.sortOrder,
        createdAt: shift.createdAt,
        updatedAt: shift.updatedAt,
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
      const tenantId = ctx.tenantId!

      // Verify shift exists (tenant-scoped)
      const existing = await ctx.prisma.shift.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shift not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Shift name is required",
          })
        }
        data.name = name
      }

      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      if (input.dayPlanId !== undefined) {
        if (input.dayPlanId === null) {
          data.dayPlanId = null
        } else {
          const dp = await ctx.prisma.dayPlan.findFirst({
            where: { id: input.dayPlanId, tenantId },
          })
          if (!dp) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid day plan reference",
            })
          }
          data.dayPlanId = input.dayPlanId
        }
      }

      if (input.color !== undefined) {
        data.color = input.color
      }

      if (input.qualification !== undefined) {
        data.qualification = input.qualification
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      const shift = await ctx.prisma.shift.update({
        where: { id: input.id },
        data,
      })

      return {
        id: shift.id,
        tenantId: shift.tenantId,
        code: shift.code,
        name: shift.name,
        description: shift.description,
        dayPlanId: shift.dayPlanId,
        color: shift.color,
        qualification: shift.qualification,
        isActive: shift.isActive,
        sortOrder: shift.sortOrder,
        createdAt: shift.createdAt,
        updatedAt: shift.updatedAt,
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify shift exists (tenant-scoped)
      const existing = await ctx.prisma.shift.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shift not found",
        })
      }

      // Check if shift is in use via employee_day_plans
      const dayPlanCount = await ctx.prisma.employeeDayPlan.count({
        where: { shiftId: input.id },
      })
      const inUseByDayPlans = dayPlanCount > 0

      // Check shift_assignments via Prisma
      const assignmentCount = await ctx.prisma.shiftAssignment.count({
        where: { shiftId: input.id },
      })

      if (inUseByDayPlans || assignmentCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete shift that is in use",
        })
      }

      // Hard delete
      await ctx.prisma.shift.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
