/**
 * Employee Day Plans Router
 *
 * Provides employee day plan CRUD, bulk create (upsert), delete range,
 * per-employee listing, and tariff-based generation via tRPC procedures.
 *
 * Replaces the Go backend employee day plan endpoints:
 * - GET /employee-day-plans -> employeeDayPlans.list
 * - GET /employees/{employee_id}/day-plans -> employeeDayPlans.forEmployee
 * - GET /employee-day-plans/{id} -> employeeDayPlans.getById
 * - POST /employee-day-plans -> employeeDayPlans.create
 * - PUT /employee-day-plans/{id} -> employeeDayPlans.update
 * - DELETE /employee-day-plans/{id} -> employeeDayPlans.delete
 * - POST /employee-day-plans/bulk -> employeeDayPlans.bulkCreate
 * - POST /employee-day-plans/delete-range -> employeeDayPlans.deleteRange
 * - POST /employee-day-plans/generate-from-tariff -> employeeDayPlans.generateFromTariff
 *
 * @see apps/api/internal/service/employeedayplan.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  EmployeeDayPlanGenerator,
  getDayPlanIdForDate,
  getTariffSyncWindow,
  getWeekdayDayPlanId,
  tariffGenerateInclude,
  type TariffForGenerate,
  type EmployeeForGenerate,
  type WeekPlanData,
} from "@/server/services/employee-day-plan-generator"

// --- Permission Constants ---

const TIME_PLANS_MANAGE = permissionIdByKey("time_plans.manage")!

// --- Source Enum ---

const EDP_SOURCES = ["tariff", "manual", "holiday"] as const

// --- Output Schemas ---

const dayPlanSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    planType: z.string(),
  })
  .nullable()

const shiftSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const employeeDayPlanOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  planDate: z.date(),
  dayPlanId: z.string().uuid().nullable(),
  shiftId: z.string().uuid().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  dayPlan: dayPlanSummarySchema.optional(),
  shift: shiftSummarySchema.optional(),
})

type EmployeeDayPlanOutput = z.infer<typeof employeeDayPlanOutputSchema>

// --- Input Schemas ---

const listInputSchema = z.object({
  employeeId: z.string().uuid().optional(),
  from: z.string().date(),
  to: z.string().date(),
})

const forEmployeeInputSchema = z.object({
  employeeId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
})

const createInputSchema = z.object({
  employeeId: z.string().uuid(),
  planDate: z.string().date(),
  dayPlanId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  source: z.enum(EDP_SOURCES),
  notes: z.string().optional(),
})

const updateInputSchema = z.object({
  id: z.string().uuid(),
  dayPlanId: z.string().uuid().nullable().optional(),
  shiftId: z.string().uuid().nullable().optional(),
  source: z.enum(EDP_SOURCES).optional(),
  notes: z.string().nullable().optional(),
})

const bulkCreateEntrySchema = z.object({
  employeeId: z.string().uuid(),
  planDate: z.string().date(),
  dayPlanId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  source: z.enum(EDP_SOURCES),
  notes: z.string().optional(),
})

const bulkCreateInputSchema = z.object({
  entries: z.array(bulkCreateEntrySchema).min(1),
})

const deleteRangeInputSchema = z.object({
  employeeId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
})

const generateFromTariffInputSchema = z.object({
  employeeIds: z.array(z.string().uuid()).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  overwriteTariffSource: z.boolean().optional(),
})

// --- Prisma Include Objects ---

const edpListInclude = {
  dayPlan: { select: { id: true, code: true, name: true, planType: true } },
  shift: { select: { id: true, code: true, name: true } },
} as const

const edpDetailInclude = {
  dayPlan: {
    include: {
      breaks: { orderBy: { sortOrder: "asc" as const } },
      bonuses: {
        orderBy: { sortOrder: "asc" as const },
        include: { account: true },
      },
    },
  },
  shift: true,
} as const

// tariffGenerateInclude, WeekPlanData, TariffForGenerate, EmployeeForGenerate,
// getWeekdayDayPlanId, getDayPlanIdForDate, getTariffSyncWindow
// are imported from @/server/services/employee-day-plan-generator

/**
 * Maps a Prisma EmployeeDayPlan record (with optional relations) to output schema shape.
 */
function mapToOutput(record: Record<string, unknown>): EmployeeDayPlanOutput {
  const result: EmployeeDayPlanOutput = {
    id: record.id as string,
    tenantId: record.tenantId as string,
    employeeId: record.employeeId as string,
    planDate: record.planDate as Date,
    dayPlanId: (record.dayPlanId as string | null) ?? null,
    shiftId: (record.shiftId as string | null) ?? null,
    source: (record.source as string | null) ?? null,
    notes: (record.notes as string | null) ?? null,
    createdAt: record.createdAt as Date,
    updatedAt: record.updatedAt as Date,
  }

  if (record.dayPlan !== undefined) {
    result.dayPlan =
      (record.dayPlan as {
        id: string
        code: string
        name: string
        planType: string
      } | null) ?? null
  }

  if (record.shift !== undefined) {
    result.shift =
      (record.shift as {
        id: string
        code: string
        name: string
      } | null) ?? null
  }

  return result
}

// --- Router ---

export const employeeDayPlansRouter = createTRPCRouter({
  /**
   * employeeDayPlans.list -- List employee day plans with required date range.
   *
   * Optional employeeId filter. Includes dayPlan and shift summaries.
   * Orders by employeeId ASC, planDate ASC.
   *
   * Requires: time_plans.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(listInputSchema)
    .output(z.object({ data: z.array(employeeDayPlanOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Validate date range
      if (input.from > input.to) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "from date must not be after to date",
        })
      }

      const where: Record<string, unknown> = {
        tenantId,
        planDate: {
          gte: new Date(input.from),
          lte: new Date(input.to),
        },
      }

      if (input.employeeId) {
        where.employeeId = input.employeeId
      }

      const plans = await ctx.prisma.employeeDayPlan.findMany({
        where,
        include: edpListInclude,
        orderBy: [{ employeeId: "asc" }, { planDate: "asc" }],
      })

      return {
        data: plans.map((p) =>
          mapToOutput(p as unknown as Record<string, unknown>)
        ),
      }
    }),

  /**
   * employeeDayPlans.forEmployee -- List day plans for a specific employee within date range.
   *
   * Includes richer dayPlan data (breaks, bonuses) and full shift details.
   * Orders by planDate ASC.
   *
   * Requires: time_plans.manage permission
   */
  forEmployee: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(forEmployeeInputSchema)
    .output(z.object({ data: z.array(employeeDayPlanOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Validate date range
      if (input.from > input.to) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "from date must not be after to date",
        })
      }

      // Validate employee exists in tenant
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      const plans = await ctx.prisma.employeeDayPlan.findMany({
        where: {
          tenantId,
          employeeId: input.employeeId,
          planDate: {
            gte: new Date(input.from),
            lte: new Date(input.to),
          },
        },
        include: edpDetailInclude,
        orderBy: { planDate: "asc" },
      })

      return {
        data: plans.map((p) =>
          mapToOutput(p as unknown as Record<string, unknown>)
        ),
      }
    }),

  /**
   * employeeDayPlans.getById -- Get a single employee day plan by ID.
   *
   * Tenant-scoped. Includes dayPlan and shift summaries.
   *
   * Requires: time_plans.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(employeeDayPlanOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const plan = await ctx.prisma.employeeDayPlan.findFirst({
        where: { id: input.id, tenantId },
        include: edpListInclude,
      })

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee day plan not found",
        })
      }

      return mapToOutput(plan as unknown as Record<string, unknown>)
    }),

  /**
   * employeeDayPlans.create -- Create a single employee day plan.
   *
   * Validates employee exists in tenant, shift FK, dayPlan FK.
   * Auto-populates dayPlanId from shift if not provided.
   * Handles unique constraint on [employeeId, planDate].
   *
   * Requires: time_plans.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(createInputSchema)
    .output(employeeDayPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Validate employee exists in tenant
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId },
      })
      if (!employee) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid employee reference",
        })
      }

      let dayPlanId = input.dayPlanId || null
      const shiftId = input.shiftId || null

      // If shiftId provided: validate shift, auto-populate dayPlanId
      if (shiftId) {
        const shift = await ctx.prisma.shift.findFirst({
          where: { id: shiftId, tenantId },
        })
        if (!shift) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid shift reference",
          })
        }
        // Auto-populate dayPlanId from shift if not explicitly provided
        if (!dayPlanId && shift.dayPlanId) {
          dayPlanId = shift.dayPlanId
        }
      }

      // Validate dayPlanId if provided (or auto-populated)
      if (dayPlanId) {
        const dp = await ctx.prisma.dayPlan.findFirst({
          where: { id: dayPlanId, tenantId },
        })
        if (!dp) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid day plan reference",
          })
        }
      }

      try {
        const plan = await ctx.prisma.employeeDayPlan.create({
          data: {
            tenantId,
            employeeId: input.employeeId,
            planDate: new Date(input.planDate),
            dayPlanId,
            shiftId,
            source: input.source,
            notes: input.notes?.trim() || null,
          },
          include: edpListInclude,
        })

        return mapToOutput(plan as unknown as Record<string, unknown>)
      } catch (err: unknown) {
        // Handle unique constraint violation on [employeeId, planDate]
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          err.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An employee day plan already exists for this employee and date",
          })
        }
        throw err
      }
    }),

  /**
   * employeeDayPlans.update -- Partial update of an employee day plan.
   *
   * Supports nullable fields (null = clear). Same shift->dayPlan auto-populate logic.
   *
   * Requires: time_plans.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(updateInputSchema)
    .output(employeeDayPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify EDP exists (tenant-scoped)
      const existing = await ctx.prisma.employeeDayPlan.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee day plan not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle shiftId update
      if (input.shiftId !== undefined) {
        if (input.shiftId === null) {
          data.shiftId = null
        } else {
          const shift = await ctx.prisma.shift.findFirst({
            where: { id: input.shiftId, tenantId },
          })
          if (!shift) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid shift reference",
            })
          }
          data.shiftId = input.shiftId

          // Auto-populate dayPlanId from shift if dayPlanId not explicitly in input
          if (input.dayPlanId === undefined && shift.dayPlanId) {
            data.dayPlanId = shift.dayPlanId
          }
        }
      }

      // Handle dayPlanId update
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

      // Handle source update
      if (input.source !== undefined) {
        data.source = input.source
      }

      // Handle notes update
      if (input.notes !== undefined) {
        data.notes = input.notes === null ? null : input.notes.trim()
      }

      const plan = await ctx.prisma.employeeDayPlan.update({
        where: { id: input.id },
        data,
        include: edpListInclude,
      })

      return mapToOutput(plan as unknown as Record<string, unknown>)
    }),

  /**
   * employeeDayPlans.delete -- Delete a single employee day plan.
   *
   * Tenant-scoped. Hard delete.
   *
   * Requires: time_plans.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify EDP exists (tenant-scoped)
      const existing = await ctx.prisma.employeeDayPlan.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee day plan not found",
        })
      }

      await ctx.prisma.employeeDayPlan.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  /**
   * employeeDayPlans.bulkCreate -- Bulk upsert employee day plans.
   *
   * Uses $transaction with individual upsert() calls (ON CONFLICT employee_id + plan_date).
   * Validates all entries before creating.
   *
   * Requires: time_plans.manage permission
   */
  bulkCreate: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(bulkCreateInputSchema)
    .output(z.object({ created: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Validate all entries first
      for (const entry of input.entries) {
        // Validate employee
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: entry.employeeId, tenantId },
        })
        if (!employee) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid employee reference: ${entry.employeeId}`,
          })
        }

        // Validate shift if provided
        if (entry.shiftId) {
          const shift = await ctx.prisma.shift.findFirst({
            where: { id: entry.shiftId, tenantId },
          })
          if (!shift) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid shift reference: ${entry.shiftId}`,
            })
          }
        }

        // Validate dayPlan if provided
        if (entry.dayPlanId) {
          const dp = await ctx.prisma.dayPlan.findFirst({
            where: { id: entry.dayPlanId, tenantId },
          })
          if (!dp) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid day plan reference: ${entry.dayPlanId}`,
            })
          }
        }
      }

      // Resolve dayPlanId from shift for entries without explicit dayPlanId
      const resolvedEntries = await Promise.all(
        input.entries.map(async (entry) => {
          let dayPlanId = entry.dayPlanId || null
          const shiftId = entry.shiftId || null

          if (shiftId && !dayPlanId) {
            const shift = await ctx.prisma.shift.findFirst({
              where: { id: shiftId, tenantId },
            })
            if (shift?.dayPlanId) {
              dayPlanId = shift.dayPlanId
            }
          }

          return { ...entry, dayPlanId, shiftId }
        })
      )

      // Bulk upsert in transaction
      await ctx.prisma.$transaction(async (tx) => {
        for (const entry of resolvedEntries) {
          const planDate = new Date(entry.planDate)
          await tx.employeeDayPlan.upsert({
            where: {
              employeeId_planDate: {
                employeeId: entry.employeeId,
                planDate,
              },
            },
            create: {
              tenantId,
              employeeId: entry.employeeId,
              planDate,
              dayPlanId: entry.dayPlanId,
              shiftId: entry.shiftId,
              source: entry.source,
              notes: entry.notes?.trim() || null,
            },
            update: {
              dayPlanId: entry.dayPlanId,
              shiftId: entry.shiftId,
              source: entry.source,
              notes: entry.notes?.trim() || null,
            },
          })
        }
      })

      return { created: input.entries.length }
    }),

  /**
   * employeeDayPlans.deleteRange -- Delete employee day plans by employee + date range.
   *
   * Validates employee exists. Returns count of deleted records.
   *
   * Requires: time_plans.manage permission
   */
  deleteRange: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(deleteRangeInputSchema)
    .output(z.object({ deleted: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Validate date range
      if (input.from > input.to) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "from date must not be after to date",
        })
      }

      // Validate employee exists in tenant
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      const result = await ctx.prisma.employeeDayPlan.deleteMany({
        where: {
          tenantId,
          employeeId: input.employeeId,
          planDate: {
            gte: new Date(input.from),
            lte: new Date(input.to),
          },
        },
      })

      return { deleted: result.count }
    }),

  /**
   * employeeDayPlans.generateFromTariff -- Generate day plans from employee tariffs.
   *
   * Port of Go GenerateFromTariff. Resolves day plans per date based on tariff
   * rhythm type (weekly, rolling_weekly, x_days).
   *
   * Default date range: today to today + 3 months.
   * Default overwriteTariffSource: true.
   *
   * Preserves manual/holiday plans (source != 'tariff').
   * Returns processing statistics.
   *
   * Requires: time_plans.manage permission
   */
  generateFromTariff: tenantProcedure
    .use(requirePermission(TIME_PLANS_MANAGE))
    .input(generateFromTariffInputSchema)
    .output(
      z.object({
        employeesProcessed: z.number(),
        plansCreated: z.number(),
        plansUpdated: z.number(),
        employeesSkipped: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const generator = new EmployeeDayPlanGenerator(ctx.prisma)
      return generator.generateFromTariff({
        tenantId: ctx.tenantId!,
        employeeIds: input.employeeIds,
        from: input.from ? new Date(input.from) : undefined,
        to: input.to ? new Date(input.to) : undefined,
        overwriteTariffSource: input.overwriteTariffSource,
      })
    }),
})
