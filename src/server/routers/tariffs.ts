/**
 * Tariffs Router
 *
 * Provides tariff CRUD operations via tRPC procedures, plus sub-entity
 * management for Breaks and rhythm sub-records (TariffWeekPlans, TariffDayPlans).
 *
 * Replaces the Go backend tariff endpoints:
 * - GET /tariffs -> tariffs.list
 * - GET /tariffs/{id} -> tariffs.getById
 * - POST /tariffs -> tariffs.create
 * - PUT /tariffs/{id} -> tariffs.update
 * - DELETE /tariffs/{id} -> tariffs.delete
 * - POST /tariffs/{id}/breaks -> tariffs.createBreak
 * - DELETE /tariffs/{id}/breaks/{breakId} -> tariffs.deleteBreak
 *
 * @see apps/api/internal/service/tariff.go
 */
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const TARIFFS_MANAGE = permissionIdByKey("tariffs.manage")!

// --- Enum Constants ---

const RHYTHM_TYPES = ["weekly", "rolling_weekly", "x_days"] as const
const VACATION_BASES = ["calendar_year", "entry_date"] as const
const CREDIT_TYPES = [
  "no_evaluation",
  "complete_carryover",
  "after_threshold",
  "no_carryover",
] as const
const BREAK_TYPES = ["fixed", "variable", "minimum"] as const

// --- Output Schemas ---

const tariffBreakOutputSchema = z.object({
  id: z.string().uuid(),
  tariffId: z.string().uuid(),
  breakType: z.string(),
  afterWorkMinutes: z.number().nullable(),
  duration: z.number(),
  isPaid: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const tariffWeekPlanOutputSchema = z.object({
  id: z.string().uuid(),
  tariffId: z.string().uuid(),
  weekPlanId: z.string().uuid(),
  sequenceOrder: z.number(),
  createdAt: z.date(),
  weekPlan: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  }),
})

const tariffDayPlanOutputSchema = z.object({
  id: z.string().uuid(),
  tariffId: z.string().uuid(),
  dayPosition: z.number(),
  dayPlanId: z.string().uuid().nullable(),
  createdAt: z.date(),
  dayPlan: z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      planType: z.string(),
    })
    .nullable(),
})

const tariffOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  weekPlanId: z.string().uuid().nullable(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  // Vacation fields
  annualVacationDays: z.number().nullable(),
  workDaysPerWeek: z.number().nullable(),
  vacationBasis: z.string().nullable(),
  // Target hours fields
  dailyTargetHours: z.number().nullable(),
  weeklyTargetHours: z.number().nullable(),
  monthlyTargetHours: z.number().nullable(),
  annualTargetHours: z.number().nullable(),
  // Flextime fields
  maxFlextimePerMonth: z.number().nullable(),
  upperLimitAnnual: z.number().nullable(),
  lowerLimitAnnual: z.number().nullable(),
  flextimeThreshold: z.number().nullable(),
  creditType: z.string().nullable(),
  // Rhythm fields
  rhythmType: z.string().nullable(),
  cycleDays: z.number().nullable(),
  rhythmStartDate: z.date().nullable(),
  // Vacation capping
  vacationCappingRuleGroupId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Optional relations (included in detail views)
  weekPlan: z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  breaks: z.array(tariffBreakOutputSchema).optional(),
  tariffWeekPlans: z.array(tariffWeekPlanOutputSchema).optional(),
  tariffDayPlans: z.array(tariffDayPlanOutputSchema).optional(),
})

type TariffOutput = z.infer<typeof tariffOutputSchema>

// --- Input Schemas ---

const createTariffInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(20),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  weekPlanId: z.string().uuid().optional(),
  validFrom: z.string().date().optional(),
  validTo: z.string().date().optional(),
  isActive: z.boolean().optional().default(true),
  // Vacation
  annualVacationDays: z.number().optional(),
  workDaysPerWeek: z.number().int().min(1).max(7).optional(),
  vacationBasis: z.enum(VACATION_BASES).optional(),
  vacationCappingRuleGroupId: z.string().uuid().optional(),
  // Target hours
  dailyTargetHours: z.number().optional(),
  weeklyTargetHours: z.number().optional(),
  monthlyTargetHours: z.number().optional(),
  annualTargetHours: z.number().optional(),
  // Flextime
  maxFlextimePerMonth: z.number().int().optional(),
  upperLimitAnnual: z.number().int().optional(),
  lowerLimitAnnual: z.number().int().optional(),
  flextimeThreshold: z.number().int().optional(),
  creditType: z.enum(CREDIT_TYPES).optional(),
  // Rhythm
  rhythmType: z.enum(RHYTHM_TYPES).optional(),
  cycleDays: z.number().int().min(1).max(365).optional(),
  rhythmStartDate: z.string().date().optional(),
  // Rhythm sub-records
  weekPlanIds: z.array(z.string().uuid()).optional(),
  dayPlans: z
    .array(
      z.object({
        dayPosition: z.number().int(),
        dayPlanId: z.string().uuid().nullable(),
      })
    )
    .optional(),
})

const updateTariffInputSchema = z.object({
  id: z.string().uuid(),
  // Code is NOT updatable (immutable after creation)
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  weekPlanId: z.string().uuid().nullable().optional(),
  validFrom: z.string().date().nullable().optional(),
  validTo: z.string().date().nullable().optional(),
  isActive: z.boolean().optional(),
  // Vacation
  annualVacationDays: z.number().nullable().optional(),
  workDaysPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  vacationBasis: z.enum(VACATION_BASES).nullable().optional(),
  vacationCappingRuleGroupId: z.string().uuid().nullable().optional(),
  // Target hours
  dailyTargetHours: z.number().nullable().optional(),
  weeklyTargetHours: z.number().nullable().optional(),
  monthlyTargetHours: z.number().nullable().optional(),
  annualTargetHours: z.number().nullable().optional(),
  // Flextime
  maxFlextimePerMonth: z.number().int().nullable().optional(),
  upperLimitAnnual: z.number().int().nullable().optional(),
  lowerLimitAnnual: z.number().int().nullable().optional(),
  flextimeThreshold: z.number().int().nullable().optional(),
  creditType: z.enum(CREDIT_TYPES).nullable().optional(),
  // Rhythm
  rhythmType: z.enum(RHYTHM_TYPES).optional(),
  cycleDays: z.number().int().min(1).max(365).nullable().optional(),
  rhythmStartDate: z.string().date().nullable().optional(),
  // Rhythm sub-records
  weekPlanIds: z.array(z.string().uuid()).optional(),
  dayPlans: z
    .array(
      z.object({
        dayPosition: z.number().int(),
        dayPlanId: z.string().uuid().nullable(),
      })
    )
    .optional(),
})

const createBreakInputSchema = z.object({
  tariffId: z.string().uuid(),
  breakType: z.enum(BREAK_TYPES),
  afterWorkMinutes: z.number().int().optional(),
  duration: z.number().int().min(1, "Duration must be positive"),
  isPaid: z.boolean().optional(),
})

const deleteBreakInputSchema = z.object({
  tariffId: z.string().uuid(),
  breakId: z.string().uuid(),
})

// --- Prisma Include Objects ---

const tariffListInclude = {
  weekPlan: { select: { id: true, code: true, name: true } },
} as const

const tariffDetailInclude = {
  weekPlan: { select: { id: true, code: true, name: true } },
  breaks: { orderBy: { sortOrder: "asc" as const } },
  tariffWeekPlans: {
    orderBy: { sequenceOrder: "asc" as const },
    include: {
      weekPlan: { select: { id: true, code: true, name: true } },
    },
  },
  tariffDayPlans: {
    orderBy: { dayPosition: "asc" as const },
    include: {
      dayPlan: {
        select: { id: true, code: true, name: true, planType: true },
      },
    },
  },
} as const

// --- Helpers ---

/**
 * Converts a Prisma Decimal or null to a number or null.
 */
function decimalToNumber(val: Prisma.Decimal | null | undefined): number | null {
  if (val === null || val === undefined) return null
  return Number(val)
}

/**
 * Maps a Prisma Tariff record (with optional relations) to the output schema shape.
 * Handles Decimal -> number conversion for decimal fields.
 */
function mapToOutput(
  t: Record<string, unknown>,
  opts?: { includeRelations?: boolean }
): TariffOutput {
  const includeRelations = opts?.includeRelations ?? false

  const base: TariffOutput = {
    id: t.id as string,
    tenantId: t.tenantId as string,
    code: t.code as string,
    name: t.name as string,
    description: (t.description as string | null) ?? null,
    weekPlanId: (t.weekPlanId as string | null) ?? null,
    validFrom: (t.validFrom as Date | null) ?? null,
    validTo: (t.validTo as Date | null) ?? null,
    isActive: t.isActive as boolean,
    // Vacation
    annualVacationDays: decimalToNumber(
      t.annualVacationDays as Prisma.Decimal | null | undefined
    ),
    workDaysPerWeek: (t.workDaysPerWeek as number | null) ?? null,
    vacationBasis: (t.vacationBasis as string | null) ?? null,
    // Target hours
    dailyTargetHours: decimalToNumber(
      t.dailyTargetHours as Prisma.Decimal | null | undefined
    ),
    weeklyTargetHours: decimalToNumber(
      t.weeklyTargetHours as Prisma.Decimal | null | undefined
    ),
    monthlyTargetHours: decimalToNumber(
      t.monthlyTargetHours as Prisma.Decimal | null | undefined
    ),
    annualTargetHours: decimalToNumber(
      t.annualTargetHours as Prisma.Decimal | null | undefined
    ),
    // Flextime
    maxFlextimePerMonth: (t.maxFlextimePerMonth as number | null) ?? null,
    upperLimitAnnual: (t.upperLimitAnnual as number | null) ?? null,
    lowerLimitAnnual: (t.lowerLimitAnnual as number | null) ?? null,
    flextimeThreshold: (t.flextimeThreshold as number | null) ?? null,
    creditType: (t.creditType as string | null) ?? null,
    // Rhythm
    rhythmType: (t.rhythmType as string | null) ?? null,
    cycleDays: (t.cycleDays as number | null) ?? null,
    rhythmStartDate: (t.rhythmStartDate as Date | null) ?? null,
    // Vacation capping
    vacationCappingRuleGroupId:
      (t.vacationCappingRuleGroupId as string | null) ?? null,
    createdAt: t.createdAt as Date,
    updatedAt: t.updatedAt as Date,
  }

  // Include week plan summary when available
  const weekPlan = t.weekPlan as
    | { id: string; code: string; name: string }
    | null
    | undefined
  if (weekPlan !== undefined) {
    base.weekPlan = weekPlan ?? null
  }

  // Include detail relations when requested
  if (includeRelations) {
    const breaks = t.breaks as Array<Record<string, unknown>> | undefined
    if (breaks) {
      base.breaks = breaks.map((b) => ({
        id: b.id as string,
        tariffId: b.tariffId as string,
        breakType: b.breakType as string,
        afterWorkMinutes: (b.afterWorkMinutes as number | null) ?? null,
        duration: b.duration as number,
        isPaid: b.isPaid as boolean,
        sortOrder: b.sortOrder as number,
        createdAt: b.createdAt as Date,
        updatedAt: b.updatedAt as Date,
      }))
    }

    const tariffWeekPlans = t.tariffWeekPlans as
      | Array<Record<string, unknown>>
      | undefined
    if (tariffWeekPlans) {
      base.tariffWeekPlans = tariffWeekPlans.map((twp) => ({
        id: twp.id as string,
        tariffId: twp.tariffId as string,
        weekPlanId: twp.weekPlanId as string,
        sequenceOrder: twp.sequenceOrder as number,
        createdAt: twp.createdAt as Date,
        weekPlan: twp.weekPlan as { id: string; code: string; name: string },
      }))
    }

    const tariffDayPlans = t.tariffDayPlans as
      | Array<Record<string, unknown>>
      | undefined
    if (tariffDayPlans) {
      base.tariffDayPlans = tariffDayPlans.map((tdp) => ({
        id: tdp.id as string,
        tariffId: tdp.tariffId as string,
        dayPosition: tdp.dayPosition as number,
        dayPlanId: (tdp.dayPlanId as string | null) ?? null,
        createdAt: tdp.createdAt as Date,
        dayPlan:
          (tdp.dayPlan as {
            id: string
            code: string
            name: string
            planType: string
          } | null) ?? null,
      }))
    }
  }

  return base
}

// --- Router ---

export const tariffsRouter = createTRPCRouter({
  /**
   * tariffs.list -- Returns tariffs for the current tenant.
   *
   * Supports optional isActive filter.
   * Orders by code ASC.
   *
   * Requires: tariffs.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(tariffOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const tariffs = await ctx.prisma.tariff.findMany({
        where,
        include: tariffListInclude,
        orderBy: { code: "asc" },
      })

      return {
        data: tariffs.map((t) => mapToOutput(t as Record<string, unknown>)),
      }
    }),

  /**
   * tariffs.getById -- Returns a single tariff by ID with all relations.
   *
   * Includes breaks, tariffWeekPlans (with week plan summary),
   * and tariffDayPlans (with day plan summary).
   *
   * Requires: tariffs.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(tariffOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const tariff = await ctx.prisma.tariff.findFirst({
        where: { id: input.id, tenantId },
        include: tariffDetailInclude,
      })

      if (!tariff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tariff not found",
        })
      }

      return mapToOutput(tariff as unknown as Record<string, unknown>, {
        includeRelations: true,
      })
    }),

  /**
   * tariffs.create -- Creates a new tariff.
   *
   * Validates code uniqueness, rhythm configuration, FK references.
   * Creates rhythm sub-records (TariffWeekPlans, TariffDayPlans) atomically.
   *
   * Requires: tariffs.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .input(createTariffInputSchema)
    .output(tariffOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tariff code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tariff name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.tariff.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tariff code already exists",
        })
      }

      // Default rhythm type to weekly
      const rhythmType = input.rhythmType || "weekly"

      // Validate rhythm-specific fields
      switch (rhythmType) {
        case "weekly":
          // Validate single week plan if provided
          if (input.weekPlanId) {
            const wp = await ctx.prisma.weekPlan.findFirst({
              where: { id: input.weekPlanId, tenantId },
            })
            if (!wp) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid week plan reference",
              })
            }
          }
          break

        case "rolling_weekly":
          // Require week plan IDs
          if (!input.weekPlanIds || input.weekPlanIds.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "week_plan_ids are required for rolling_weekly rhythm",
            })
          }
          // Require rhythm start date
          if (!input.rhythmStartDate) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "rhythm_start_date is required for rolling_weekly and x_days rhythms",
            })
          }
          // Validate all week plan IDs
          for (const wpId of input.weekPlanIds) {
            const wp = await ctx.prisma.weekPlan.findFirst({
              where: { id: wpId, tenantId },
            })
            if (!wp) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid week plan reference",
              })
            }
          }
          break

        case "x_days":
          // Require cycle days
          if (input.cycleDays === undefined || input.cycleDays === null) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "cycle_days is required for x_days rhythm",
            })
          }
          // Require rhythm start date
          if (!input.rhythmStartDate) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "rhythm_start_date is required for rolling_weekly and x_days rhythms",
            })
          }
          // Validate day plans
          if (input.dayPlans) {
            for (const dp of input.dayPlans) {
              if (dp.dayPosition < 1 || dp.dayPosition > input.cycleDays) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message:
                    "day position must be between 1 and cycle_days",
                })
              }
              if (dp.dayPlanId) {
                const plan = await ctx.prisma.dayPlan.findFirst({
                  where: { id: dp.dayPlanId, tenantId },
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
          break
      }

      // Trim description
      const description = input.description?.trim() || null

      // Build tariff create data
      const tariffData: Record<string, unknown> = {
        tenantId,
        code,
        name,
        description,
        isActive: input.isActive,
        rhythmType,
        // Week plan (for weekly rhythm)
        weekPlanId: input.weekPlanId || undefined,
        // Dates
        validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
        validTo: input.validTo ? new Date(input.validTo) : undefined,
        // Vacation
        annualVacationDays:
          input.annualVacationDays !== undefined
            ? new Prisma.Decimal(input.annualVacationDays)
            : undefined,
        workDaysPerWeek: input.workDaysPerWeek,
        vacationBasis: input.vacationBasis,
        vacationCappingRuleGroupId: input.vacationCappingRuleGroupId,
        // Target hours
        dailyTargetHours:
          input.dailyTargetHours !== undefined
            ? new Prisma.Decimal(input.dailyTargetHours)
            : undefined,
        weeklyTargetHours:
          input.weeklyTargetHours !== undefined
            ? new Prisma.Decimal(input.weeklyTargetHours)
            : undefined,
        monthlyTargetHours:
          input.monthlyTargetHours !== undefined
            ? new Prisma.Decimal(input.monthlyTargetHours)
            : undefined,
        annualTargetHours:
          input.annualTargetHours !== undefined
            ? new Prisma.Decimal(input.annualTargetHours)
            : undefined,
        // Flextime
        maxFlextimePerMonth: input.maxFlextimePerMonth,
        upperLimitAnnual: input.upperLimitAnnual,
        lowerLimitAnnual: input.lowerLimitAnnual,
        flextimeThreshold: input.flextimeThreshold,
        creditType: input.creditType,
        // Rhythm
        cycleDays: input.cycleDays,
        rhythmStartDate: input.rhythmStartDate
          ? new Date(input.rhythmStartDate)
          : undefined,
      }

      // Use transaction for atomicity when creating rhythm sub-records
      const tariff = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.tariff.create({
          data: tariffData as Parameters<typeof tx.tariff.create>[0]["data"],
        })

        // Create rhythm sub-records
        if (
          rhythmType === "rolling_weekly" &&
          input.weekPlanIds &&
          input.weekPlanIds.length > 0
        ) {
          await tx.tariffWeekPlan.createMany({
            data: input.weekPlanIds.map((wpId, i) => ({
              tariffId: created.id,
              weekPlanId: wpId,
              sequenceOrder: i + 1,
            })),
          })
        }

        if (
          rhythmType === "x_days" &&
          input.dayPlans &&
          input.dayPlans.length > 0
        ) {
          await tx.tariffDayPlan.createMany({
            data: input.dayPlans.map((dp) => ({
              tariffId: created.id,
              dayPosition: dp.dayPosition,
              dayPlanId: dp.dayPlanId,
            })),
          })
        }

        return created
      })

      // Re-fetch with full details
      const result = await ctx.prisma.tariff.findFirst({
        where: { id: tariff.id, tenantId },
        include: tariffDetailInclude,
      })

      return mapToOutput(result as unknown as Record<string, unknown>, {
        includeRelations: true,
      })
    }),

  /**
   * tariffs.update -- Updates an existing tariff.
   *
   * Supports partial updates. Nullable fields use null to clear, undefined to skip.
   * Code is not updatable (immutable after creation).
   *
   * Requires: tariffs.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .input(updateTariffInputSchema)
    .output(tariffOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify tariff exists (tenant-scoped)
      const existing = await ctx.prisma.tariff.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tariff not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tariff name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle week plan updates
      if (input.weekPlanId !== undefined) {
        if (input.weekPlanId === null) {
          data.weekPlanId = null
        } else {
          // Validate week plan exists in same tenant
          const wp = await ctx.prisma.weekPlan.findFirst({
            where: { id: input.weekPlanId, tenantId },
          })
          if (!wp) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid week plan reference",
            })
          }
          data.weekPlanId = input.weekPlanId
        }
      }

      // Handle date fields
      if (input.validFrom !== undefined) {
        data.validFrom =
          input.validFrom === null ? null : new Date(input.validFrom)
      }
      if (input.validTo !== undefined) {
        data.validTo =
          input.validTo === null ? null : new Date(input.validTo)
      }

      // Handle isActive
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      // Determine effective rhythm type for validation
      const rhythmType =
        input.rhythmType ?? (existing.rhythmType as string) ?? "weekly"

      // Handle rhythm type update
      if (input.rhythmType !== undefined) {
        data.rhythmType = input.rhythmType
      }

      // Handle cycle days
      if (input.cycleDays !== undefined) {
        data.cycleDays = input.cycleDays
      }

      // Handle rhythm start date
      if (input.rhythmStartDate !== undefined) {
        data.rhythmStartDate =
          input.rhythmStartDate === null
            ? null
            : new Date(input.rhythmStartDate)
      }

      // Validate rhythm-specific requirements
      switch (rhythmType) {
        case "rolling_weekly":
          if (input.weekPlanIds && input.weekPlanIds.length > 0) {
            for (const wpId of input.weekPlanIds) {
              const wp = await ctx.prisma.weekPlan.findFirst({
                where: { id: wpId, tenantId },
              })
              if (!wp) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Invalid week plan reference",
                })
              }
            }
          }
          break

        case "x_days": {
          // Get effective cycle_days
          const effectiveCycleDays =
            input.cycleDays !== undefined
              ? input.cycleDays
              : existing.cycleDays
          // Validate day plans if provided
          if (
            input.dayPlans &&
            input.dayPlans.length > 0 &&
            effectiveCycleDays
          ) {
            for (const dp of input.dayPlans) {
              if (
                dp.dayPosition < 1 ||
                dp.dayPosition > effectiveCycleDays
              ) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message:
                    "day position must be between 1 and cycle_days",
                })
              }
              if (dp.dayPlanId) {
                const plan = await ctx.prisma.dayPlan.findFirst({
                  where: { id: dp.dayPlanId, tenantId },
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
          break
        }
      }

      // Handle vacation fields
      if (input.annualVacationDays !== undefined) {
        data.annualVacationDays =
          input.annualVacationDays === null
            ? null
            : new Prisma.Decimal(input.annualVacationDays)
      }
      if (input.workDaysPerWeek !== undefined) {
        data.workDaysPerWeek = input.workDaysPerWeek
      }
      if (input.vacationBasis !== undefined) {
        data.vacationBasis = input.vacationBasis
      }
      if (input.vacationCappingRuleGroupId !== undefined) {
        data.vacationCappingRuleGroupId = input.vacationCappingRuleGroupId
      }

      // Handle target hours fields
      if (input.dailyTargetHours !== undefined) {
        data.dailyTargetHours =
          input.dailyTargetHours === null
            ? null
            : new Prisma.Decimal(input.dailyTargetHours)
      }
      if (input.weeklyTargetHours !== undefined) {
        data.weeklyTargetHours =
          input.weeklyTargetHours === null
            ? null
            : new Prisma.Decimal(input.weeklyTargetHours)
      }
      if (input.monthlyTargetHours !== undefined) {
        data.monthlyTargetHours =
          input.monthlyTargetHours === null
            ? null
            : new Prisma.Decimal(input.monthlyTargetHours)
      }
      if (input.annualTargetHours !== undefined) {
        data.annualTargetHours =
          input.annualTargetHours === null
            ? null
            : new Prisma.Decimal(input.annualTargetHours)
      }

      // Handle flextime fields
      if (input.maxFlextimePerMonth !== undefined) {
        data.maxFlextimePerMonth = input.maxFlextimePerMonth
      }
      if (input.upperLimitAnnual !== undefined) {
        data.upperLimitAnnual = input.upperLimitAnnual
      }
      if (input.lowerLimitAnnual !== undefined) {
        data.lowerLimitAnnual = input.lowerLimitAnnual
      }
      if (input.flextimeThreshold !== undefined) {
        data.flextimeThreshold = input.flextimeThreshold
      }
      if (input.creditType !== undefined) {
        data.creditType = input.creditType
      }

      // Update tariff + rhythm sub-records in transaction
      await ctx.prisma.$transaction(async (tx) => {
        await tx.tariff.update({
          where: { id: input.id },
          data,
        })

        // Handle rhythm type changes -- clean up old sub-records
        if (input.rhythmType !== undefined) {
          switch (rhythmType) {
            case "weekly":
              // Switching to weekly: clear both sub-record types
              await tx.tariffWeekPlan.deleteMany({
                where: { tariffId: input.id },
              })
              await tx.tariffDayPlan.deleteMany({
                where: { tariffId: input.id },
              })
              break
            case "rolling_weekly":
              // Clear day plans when switching to rolling_weekly
              await tx.tariffDayPlan.deleteMany({
                where: { tariffId: input.id },
              })
              break
            case "x_days":
              // Clear week plans when switching to x_days
              await tx.tariffWeekPlan.deleteMany({
                where: { tariffId: input.id },
              })
              break
          }
        }

        // Update rolling_weekly sub-records if provided
        if (
          rhythmType === "rolling_weekly" &&
          input.weekPlanIds &&
          input.weekPlanIds.length > 0
        ) {
          await tx.tariffWeekPlan.deleteMany({
            where: { tariffId: input.id },
          })
          await tx.tariffWeekPlan.createMany({
            data: input.weekPlanIds.map((wpId, i) => ({
              tariffId: input.id,
              weekPlanId: wpId,
              sequenceOrder: i + 1,
            })),
          })
        }

        // Update x_days sub-records if provided
        if (
          rhythmType === "x_days" &&
          input.dayPlans &&
          input.dayPlans.length > 0
        ) {
          await tx.tariffDayPlan.deleteMany({
            where: { tariffId: input.id },
          })
          await tx.tariffDayPlan.createMany({
            data: input.dayPlans.map((dp) => ({
              tariffId: input.id,
              dayPosition: dp.dayPosition,
              dayPlanId: dp.dayPlanId,
            })),
          })
        }
      })

      // Re-fetch with full details
      const result = await ctx.prisma.tariff.findFirst({
        where: { id: input.id, tenantId },
        include: tariffDetailInclude,
      })

      return mapToOutput(result as unknown as Record<string, unknown>, {
        includeRelations: true,
      })
    }),

  /**
   * tariffs.delete -- Deletes a tariff.
   *
   * Checks usage in EmployeeTariffAssignment and Employee tables before deletion.
   * Cascading FK constraints handle deletion of breaks, tariffWeekPlans, tariffDayPlans.
   *
   * Requires: tariffs.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify tariff exists (tenant-scoped)
      const existing = await ctx.prisma.tariff.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tariff not found",
        })
      }

      // Check usage in EmployeeTariffAssignment
      const assignmentCount =
        await ctx.prisma.employeeTariffAssignment.count({
          where: { tariffId: input.id },
        })
      if (assignmentCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete tariff that is assigned to employees",
        })
      }

      // Check direct employee tariffId references
      const employeeCount = await ctx.prisma.employee.count({
        where: { tariffId: input.id },
      })
      if (employeeCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete tariff that is assigned to employees",
        })
      }

      // Hard delete (cascades to breaks, tariffWeekPlans, tariffDayPlans)
      await ctx.prisma.tariff.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  /**
   * tariffs.createBreak -- Adds a break to a tariff.
   *
   * Auto-calculates sortOrder from existing break count.
   *
   * Requires: tariffs.manage permission
   */
  createBreak: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .input(createBreakInputSchema)
    .output(tariffBreakOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify parent tariff exists (tenant-scoped)
      const tariff = await ctx.prisma.tariff.findFirst({
        where: { id: input.tariffId, tenantId },
      })
      if (!tariff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tariff not found",
        })
      }

      // Auto-calculate sortOrder
      const breakCount = await ctx.prisma.tariffBreak.count({
        where: { tariffId: input.tariffId },
      })

      const created = await ctx.prisma.tariffBreak.create({
        data: {
          tariffId: input.tariffId,
          breakType: input.breakType,
          afterWorkMinutes: input.afterWorkMinutes,
          duration: input.duration,
          isPaid: input.isPaid ?? false,
          sortOrder: breakCount,
        },
      })

      return {
        id: created.id,
        tariffId: created.tariffId,
        breakType: created.breakType,
        afterWorkMinutes: created.afterWorkMinutes,
        duration: created.duration,
        isPaid: created.isPaid,
        sortOrder: created.sortOrder,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      }
    }),

  /**
   * tariffs.deleteBreak -- Removes a break from a tariff.
   *
   * Verifies both the tariff and break exist and are related.
   *
   * Requires: tariffs.manage permission
   */
  deleteBreak: tenantProcedure
    .use(requirePermission(TARIFFS_MANAGE))
    .input(deleteBreakInputSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify parent tariff exists (tenant-scoped)
      const tariff = await ctx.prisma.tariff.findFirst({
        where: { id: input.tariffId, tenantId },
      })
      if (!tariff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tariff not found",
        })
      }

      // Verify break exists AND belongs to the tariff
      const brk = await ctx.prisma.tariffBreak.findFirst({
        where: { id: input.breakId, tariffId: input.tariffId },
      })
      if (!brk) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tariff break not found",
        })
      }

      // Delete break
      await ctx.prisma.tariffBreak.delete({
        where: { id: input.breakId },
      })

      return { success: true }
    }),
})
