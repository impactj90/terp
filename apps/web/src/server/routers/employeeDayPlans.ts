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

const tariffGenerateInclude = {
  weekPlan: true,
  tariffWeekPlans: {
    orderBy: { sequenceOrder: "asc" as const },
    include: { weekPlan: true },
  },
  tariffDayPlans: {
    orderBy: { dayPosition: "asc" as const },
  },
} as const

// --- Helper Types ---

interface WeekPlanData {
  mondayDayPlanId: string | null
  tuesdayDayPlanId: string | null
  wednesdayDayPlanId: string | null
  thursdayDayPlanId: string | null
  fridayDayPlanId: string | null
  saturdayDayPlanId: string | null
  sundayDayPlanId: string | null
}

interface TariffForGenerate {
  rhythmType: string | null
  weekPlanId: string | null
  weekPlan: WeekPlanData | null
  rhythmStartDate: Date | null
  cycleDays: number | null
  validFrom: Date | null
  validTo: Date | null
  tariffWeekPlans: Array<{
    sequenceOrder: number
    weekPlan: WeekPlanData
  }>
  tariffDayPlans: Array<{
    dayPosition: number
    dayPlanId: string | null
  }>
}

interface EmployeeForGenerate {
  id: string
  tariffId: string | null
  entryDate: Date
  exitDate: Date | null
}

// --- Helper Functions ---

/**
 * Maps a JS Date.getDay() (0=Sunday) to the correct weekPlan day plan ID column.
 */
function getWeekdayDayPlanId(
  weekPlan: WeekPlanData,
  weekday: number
): string | null {
  switch (weekday) {
    case 0:
      return weekPlan.sundayDayPlanId
    case 1:
      return weekPlan.mondayDayPlanId
    case 2:
      return weekPlan.tuesdayDayPlanId
    case 3:
      return weekPlan.wednesdayDayPlanId
    case 4:
      return weekPlan.thursdayDayPlanId
    case 5:
      return weekPlan.fridayDayPlanId
    case 6:
      return weekPlan.saturdayDayPlanId
    default:
      return null
  }
}

/**
 * Resolves the day plan ID for a given date based on the tariff's rhythm type.
 *
 * Port of Go model.Tariff.GetDayPlanIDForDate(date).
 *
 * Rhythm types:
 * - weekly: Uses the tariff's single weekPlan, maps weekday to day plan ID
 * - rolling_weekly: Cycles through tariffWeekPlans by weeks since rhythmStartDate
 * - x_days: Cycles through tariffDayPlans by days since rhythmStartDate
 */
function getDayPlanIdForDate(
  tariff: TariffForGenerate,
  date: Date
): string | null {
  const rhythmType = tariff.rhythmType ?? "weekly"

  switch (rhythmType) {
    case "weekly": {
      if (!tariff.weekPlan) return null
      const weekday = date.getUTCDay()
      return getWeekdayDayPlanId(tariff.weekPlan, weekday)
    }

    case "rolling_weekly": {
      if (!tariff.rhythmStartDate || tariff.tariffWeekPlans.length === 0) {
        return null
      }
      const msPerWeek = 7 * 24 * 60 * 60 * 1000
      const diffMs = date.getTime() - tariff.rhythmStartDate.getTime()
      let weeksSinceStart = Math.floor(diffMs / msPerWeek)
      if (weeksSinceStart < 0) weeksSinceStart = 0

      const cyclePosition =
        (weeksSinceStart % tariff.tariffWeekPlans.length) + 1

      const twp = tariff.tariffWeekPlans.find(
        (t) => t.sequenceOrder === cyclePosition
      )
      if (!twp || !twp.weekPlan) return null

      const weekday = date.getUTCDay()
      return getWeekdayDayPlanId(twp.weekPlan, weekday)
    }

    case "x_days": {
      if (
        !tariff.rhythmStartDate ||
        !tariff.cycleDays ||
        tariff.cycleDays === 0
      ) {
        return null
      }
      const msPerDay = 24 * 60 * 60 * 1000
      const diffMs = date.getTime() - tariff.rhythmStartDate.getTime()
      let daysSinceStart = Math.floor(diffMs / msPerDay)
      if (daysSinceStart < 0) daysSinceStart = 0

      const cyclePosition = (daysSinceStart % tariff.cycleDays) + 1

      const tdp = tariff.tariffDayPlans.find(
        (t) => t.dayPosition === cyclePosition
      )
      return tdp?.dayPlanId ?? null
    }

    default:
      return null
  }
}

/**
 * Calculates the effective sync window for generating day plans, constrained by
 * employee entry/exit dates and tariff validity dates.
 *
 * Port of Go getTariffSyncWindow.
 */
function getTariffSyncWindow(
  employee: EmployeeForGenerate,
  tariff: TariffForGenerate,
  from: Date,
  to: Date
): { start: Date; end: Date } | null {
  let start = new Date(from.getTime())
  let end = new Date(to.getTime())

  // Constrain by employee entry date
  if (employee.entryDate.getTime() > start.getTime()) {
    start = new Date(employee.entryDate.getTime())
  }

  // Constrain by employee exit date
  if (employee.exitDate && employee.exitDate.getTime() < end.getTime()) {
    end = new Date(employee.exitDate.getTime())
  }

  // Constrain by tariff validity
  if (tariff.validFrom && tariff.validFrom.getTime() > start.getTime()) {
    start = new Date(tariff.validFrom.getTime())
  }
  if (tariff.validTo && tariff.validTo.getTime() < end.getTime()) {
    end = new Date(tariff.validTo.getTime())
  }

  // Check window validity
  if (start.getTime() > end.getTime()) {
    return null
  }

  return { start, end }
}

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
      const tenantId = ctx.tenantId!

      // Apply defaults for date range
      const today = new Date()
      const defaultTo = new Date()
      defaultTo.setUTCMonth(defaultTo.getUTCMonth() + 3)

      const fromDate = input.from
        ? new Date(input.from)
        : new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
          )
      const toDate = input.to
        ? new Date(input.to)
        : new Date(
            Date.UTC(
              defaultTo.getUTCFullYear(),
              defaultTo.getUTCMonth(),
              defaultTo.getUTCDate()
            )
          )

      const overwriteTariffSource = input.overwriteTariffSource ?? true

      // Get employees to process
      let employees: EmployeeForGenerate[]

      if (input.employeeIds && input.employeeIds.length > 0) {
        // Fetch specific employees
        const fetched = await ctx.prisma.employee.findMany({
          where: {
            id: { in: input.employeeIds },
            tenantId,
          },
          select: {
            id: true,
            tariffId: true,
            entryDate: true,
            exitDate: true,
          },
        })
        employees = fetched
      } else {
        // Fetch all active employees for tenant
        const fetched = await ctx.prisma.employee.findMany({
          where: {
            tenantId,
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            tariffId: true,
            entryDate: true,
            exitDate: true,
          },
        })
        employees = fetched
      }

      // Initialize result counters
      let employeesProcessed = 0
      let plansCreated = 0
      let plansUpdated = 0
      let employeesSkipped = 0

      // Process each employee
      for (const employee of employees) {
        // Skip if no tariffId
        if (!employee.tariffId) {
          employeesSkipped++
          continue
        }

        // Fetch tariff with full details
        const tariff = await ctx.prisma.tariff.findFirst({
          where: { id: employee.tariffId, tenantId },
          include: tariffGenerateInclude,
        })

        if (!tariff) {
          employeesSkipped++
          continue
        }

        // Calculate sync window
        const window = getTariffSyncWindow(
          employee,
          tariff as unknown as TariffForGenerate,
          fromDate,
          toDate
        )
        if (!window) {
          employeesSkipped++
          continue
        }

        // Get existing EDPs in date range for this employee
        const existingPlans = await ctx.prisma.employeeDayPlan.findMany({
          where: {
            tenantId,
            employeeId: employee.id,
            planDate: {
              gte: window.start,
              lte: window.end,
            },
          },
        })

        // Build skip map: dates to skip based on source
        const skipDates = new Set<string>()
        for (const plan of existingPlans) {
          const dateKey = plan.planDate.toISOString().split("T")[0]!
          if (plan.source !== "tariff") {
            // Always skip manual/holiday plans
            skipDates.add(dateKey)
          } else if (!overwriteTariffSource) {
            // Skip existing tariff plans if overwrite is false
            skipDates.add(dateKey)
          }
        }

        // Generate plans for each day in window
        const plansToUpsert: Array<{
          employeeId: string
          planDate: Date
          dayPlanId: string | null
        }> = []

        const current = new Date(window.start.getTime())
        while (current.getTime() <= window.end.getTime()) {
          const dateKey = current.toISOString().split("T")[0]!

          if (!skipDates.has(dateKey)) {
            const dayPlanId = getDayPlanIdForDate(
              tariff as unknown as TariffForGenerate,
              current
            )

            if (dayPlanId !== null) {
              plansToUpsert.push({
                employeeId: employee.id,
                planDate: new Date(current.getTime()),
                dayPlanId,
              })
            }
          }

          current.setUTCDate(current.getUTCDate() + 1)
        }

        // Bulk upsert plans
        if (plansToUpsert.length > 0) {
          // Track which are new vs updates
          const existingDateKeys = new Set(
            existingPlans.map(
              (p) => p.planDate.toISOString().split("T")[0]!
            )
          )

          await ctx.prisma.$transaction(async (tx) => {
            for (const plan of plansToUpsert) {
              await tx.employeeDayPlan.upsert({
                where: {
                  employeeId_planDate: {
                    employeeId: plan.employeeId,
                    planDate: plan.planDate,
                  },
                },
                create: {
                  tenantId,
                  employeeId: plan.employeeId,
                  planDate: plan.planDate,
                  dayPlanId: plan.dayPlanId,
                  source: "tariff",
                },
                update: {
                  dayPlanId: plan.dayPlanId,
                  source: "tariff",
                },
              })
            }
          })

          for (const plan of plansToUpsert) {
            const dateKey = plan.planDate.toISOString().split("T")[0]!
            if (existingDateKeys.has(dateKey)) {
              plansUpdated++
            } else {
              plansCreated++
            }
          }
        }

        employeesProcessed++
      }

      return {
        employeesProcessed,
        plansCreated,
        plansUpdated,
        employeesSkipped,
      }
    }),
})
