/**
 * WeekPlans Router
 *
 * Provides week plan CRUD operations via tRPC procedures.
 * WeekPlans reference DayPlans via 7 nullable FK columns (Monday through Sunday).
 * Cross-entity validation ensures referenced DayPlans exist and belong to the same tenant.
 *
 * Replaces the Go backend week plan endpoints:
 * - GET /week-plans -> weekPlans.list
 * - GET /week-plans/{id} -> weekPlans.getById
 * - POST /week-plans -> weekPlans.create
 * - PATCH /week-plans/{id} -> weekPlans.update
 * - DELETE /week-plans/{id} -> weekPlans.delete
 *
 * @see apps/api/internal/service/weekplan.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import type { TRPCContext } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

// --- Permission Constants ---

const WEEK_PLANS_MANAGE = permissionIdByKey("week_plans.manage")!

// --- Output Schemas ---

const dayPlanSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    planType: z.string(),
  })
  .nullable()

const weekPlanOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  mondayDayPlanId: z.string().uuid().nullable(),
  tuesdayDayPlanId: z.string().uuid().nullable(),
  wednesdayDayPlanId: z.string().uuid().nullable(),
  thursdayDayPlanId: z.string().uuid().nullable(),
  fridayDayPlanId: z.string().uuid().nullable(),
  saturdayDayPlanId: z.string().uuid().nullable(),
  sundayDayPlanId: z.string().uuid().nullable(),
  mondayDayPlan: dayPlanSummarySchema,
  tuesdayDayPlan: dayPlanSummarySchema,
  wednesdayDayPlan: dayPlanSummarySchema,
  thursdayDayPlan: dayPlanSummarySchema,
  fridayDayPlan: dayPlanSummarySchema,
  saturdayDayPlan: dayPlanSummarySchema,
  sundayDayPlan: dayPlanSummarySchema,
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type WeekPlanOutput = z.infer<typeof weekPlanOutputSchema>

// --- Input Schemas ---

const createWeekPlanInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  mondayDayPlanId: z.string().uuid(),
  tuesdayDayPlanId: z.string().uuid(),
  wednesdayDayPlanId: z.string().uuid(),
  thursdayDayPlanId: z.string().uuid(),
  fridayDayPlanId: z.string().uuid(),
  saturdayDayPlanId: z.string().uuid(),
  sundayDayPlanId: z.string().uuid(),
})

const updateWeekPlanInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  mondayDayPlanId: z.string().uuid().nullable().optional(),
  tuesdayDayPlanId: z.string().uuid().nullable().optional(),
  wednesdayDayPlanId: z.string().uuid().nullable().optional(),
  thursdayDayPlanId: z.string().uuid().nullable().optional(),
  fridayDayPlanId: z.string().uuid().nullable().optional(),
  saturdayDayPlanId: z.string().uuid().nullable().optional(),
  sundayDayPlanId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Prisma include for day plan preloads ---

const dayPlanSelect = {
  select: { id: true, code: true, name: true, planType: true },
} as const

const weekPlanInclude = {
  mondayDayPlan: dayPlanSelect,
  tuesdayDayPlan: dayPlanSelect,
  wednesdayDayPlan: dayPlanSelect,
  thursdayDayPlan: dayPlanSelect,
  fridayDayPlan: dayPlanSelect,
  saturdayDayPlan: dayPlanSelect,
  sundayDayPlan: dayPlanSelect,
} as const

// --- Helpers ---

/**
 * Validates that all provided day plan IDs reference existing DayPlans
 * in the same tenant.
 */
async function validateDayPlanIds(
  prisma: TRPCContext["prisma"],
  tenantId: string,
  ids: (string | null | undefined)[]
): Promise<void> {
  for (const id of ids) {
    if (id) {
      const plan = await prisma.dayPlan.findFirst({
        where: { id, tenantId },
      })
      if (!plan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid day plan reference",
        })
      }
    }
  }
}

/**
 * Maps a Prisma WeekPlan record (with day plan includes) to the output shape.
 */
function mapWeekPlanToOutput(
  w: Record<string, unknown>
): WeekPlanOutput {
  return {
    id: w.id as string,
    tenantId: w.tenantId as string,
    code: w.code as string,
    name: w.name as string,
    description: (w.description as string | null) ?? null,
    mondayDayPlanId: (w.mondayDayPlanId as string | null) ?? null,
    tuesdayDayPlanId: (w.tuesdayDayPlanId as string | null) ?? null,
    wednesdayDayPlanId: (w.wednesdayDayPlanId as string | null) ?? null,
    thursdayDayPlanId: (w.thursdayDayPlanId as string | null) ?? null,
    fridayDayPlanId: (w.fridayDayPlanId as string | null) ?? null,
    saturdayDayPlanId: (w.saturdayDayPlanId as string | null) ?? null,
    sundayDayPlanId: (w.sundayDayPlanId as string | null) ?? null,
    mondayDayPlan:
      (w.mondayDayPlan as WeekPlanOutput["mondayDayPlan"]) ?? null,
    tuesdayDayPlan:
      (w.tuesdayDayPlan as WeekPlanOutput["tuesdayDayPlan"]) ?? null,
    wednesdayDayPlan:
      (w.wednesdayDayPlan as WeekPlanOutput["wednesdayDayPlan"]) ?? null,
    thursdayDayPlan:
      (w.thursdayDayPlan as WeekPlanOutput["thursdayDayPlan"]) ?? null,
    fridayDayPlan:
      (w.fridayDayPlan as WeekPlanOutput["fridayDayPlan"]) ?? null,
    saturdayDayPlan:
      (w.saturdayDayPlan as WeekPlanOutput["saturdayDayPlan"]) ?? null,
    sundayDayPlan:
      (w.sundayDayPlan as WeekPlanOutput["sundayDayPlan"]) ?? null,
    isActive: w.isActive as boolean,
    createdAt: w.createdAt as Date,
    updatedAt: w.updatedAt as Date,
  }
}

// --- Router ---

export const weekPlansRouter = createTRPCRouter({
  /**
   * weekPlans.list -- Returns week plans for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by code ASC. Includes day plan summaries.
   *
   * Requires: week_plans.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(WEEK_PLANS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(weekPlanOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const plans = await ctx.prisma.weekPlan.findMany({
        where,
        orderBy: { code: "asc" },
        include: weekPlanInclude,
      })

      return {
        data: plans.map((p) =>
          mapWeekPlanToOutput(p as unknown as Record<string, unknown>)
        ),
      }
    }),

  /**
   * weekPlans.getById -- Returns a single week plan by ID.
   *
   * Includes day plan summaries.
   * Tenant-scoped.
   *
   * Requires: week_plans.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(WEEK_PLANS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(weekPlanOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const plan = await ctx.prisma.weekPlan.findFirst({
        where: { id: input.id, tenantId },
        include: weekPlanInclude,
      })

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Week plan not found",
        })
      }

      return mapWeekPlanToOutput(
        plan as unknown as Record<string, unknown>
      )
    }),

  /**
   * weekPlans.create -- Creates a new week plan.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * All 7 day plan IDs must be provided (non-null) -- ZMI Section 11.2.
   * Each day plan ID must reference an existing DayPlan in the same tenant.
   *
   * Requires: week_plans.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(WEEK_PLANS_MANAGE))
    .input(createWeekPlanInputSchema)
    .output(weekPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Week plan code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Week plan name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.weekPlan.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Week plan code already exists",
        })
      }

      // Validate all 7 day plan IDs reference existing day plans in same tenant
      await validateDayPlanIds(ctx.prisma, tenantId, [
        input.mondayDayPlanId,
        input.tuesdayDayPlanId,
        input.wednesdayDayPlanId,
        input.thursdayDayPlanId,
        input.fridayDayPlanId,
        input.saturdayDayPlanId,
        input.sundayDayPlanId,
      ])

      // Trim description
      const description = input.description?.trim() || null

      const created = await ctx.prisma.weekPlan.create({
        data: {
          tenantId,
          code,
          name,
          description,
          mondayDayPlanId: input.mondayDayPlanId,
          tuesdayDayPlanId: input.tuesdayDayPlanId,
          wednesdayDayPlanId: input.wednesdayDayPlanId,
          thursdayDayPlanId: input.thursdayDayPlanId,
          fridayDayPlanId: input.fridayDayPlanId,
          saturdayDayPlanId: input.saturdayDayPlanId,
          sundayDayPlanId: input.sundayDayPlanId,
          isActive: true,
        },
      })

      // Re-fetch with include
      const plan = await ctx.prisma.weekPlan.findUniqueOrThrow({
        where: { id: created.id },
        include: weekPlanInclude,
      })

      return mapWeekPlanToOutput(
        plan as unknown as Record<string, unknown>
      )
    }),

  /**
   * weekPlans.update -- Updates an existing week plan.
   *
   * Supports partial updates. If code changes, checks uniqueness.
   * If any day plan IDs are provided, validates them.
   * After update, verifies completeness (all 7 days must still have plans).
   *
   * Requires: week_plans.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(WEEK_PLANS_MANAGE))
    .input(updateWeekPlanInputSchema)
    .output(weekPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify week plan exists (tenant-scoped)
      const existing = await ctx.prisma.weekPlan.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Week plan not found",
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
            message: "Week plan code is required",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.weekPlan.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Week plan code already exists",
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
            message: "Week plan name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle day plan ID updates and validate
      const dayPlanFields = [
        "mondayDayPlanId",
        "tuesdayDayPlanId",
        "wednesdayDayPlanId",
        "thursdayDayPlanId",
        "fridayDayPlanId",
        "saturdayDayPlanId",
        "sundayDayPlanId",
      ] as const

      const dayPlanIdsToValidate: (string | null | undefined)[] = []
      for (const field of dayPlanFields) {
        if (input[field] !== undefined) {
          data[field] = input[field]
          dayPlanIdsToValidate.push(input[field])
        }
      }

      // Validate any provided day plan IDs
      if (dayPlanIdsToValidate.length > 0) {
        await validateDayPlanIds(ctx.prisma, tenantId, dayPlanIdsToValidate)
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      await ctx.prisma.weekPlan.update({
        where: { id: input.id },
        data,
      })

      // Re-fetch with include to check completeness and return
      const updated = await ctx.prisma.weekPlan.findUniqueOrThrow({
        where: { id: input.id },
        include: weekPlanInclude,
      })

      // Verify completeness: all 7 days must have plans
      if (
        !updated.mondayDayPlanId ||
        !updated.tuesdayDayPlanId ||
        !updated.wednesdayDayPlanId ||
        !updated.thursdayDayPlanId ||
        !updated.fridayDayPlanId ||
        !updated.saturdayDayPlanId ||
        !updated.sundayDayPlanId
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Week plan must have a day plan assigned for all 7 days",
        })
      }

      return mapWeekPlanToOutput(
        updated as unknown as Record<string, unknown>
      )
    }),

  /**
   * weekPlans.delete -- Deletes a week plan.
   *
   * Requires: week_plans.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(WEEK_PLANS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify week plan exists (tenant-scoped)
      const existing = await ctx.prisma.weekPlan.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Week plan not found",
        })
      }

      // Hard delete
      await ctx.prisma.weekPlan.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
