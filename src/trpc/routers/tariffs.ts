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
import type { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as tariffsService from "@/lib/services/tariffs-service"

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
  id: z.string(),
  tariffId: z.string(),
  breakType: z.string(),
  afterWorkMinutes: z.number().nullable(),
  duration: z.number(),
  isPaid: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const tariffWeekPlanOutputSchema = z.object({
  id: z.string(),
  tariffId: z.string(),
  weekPlanId: z.string(),
  sequenceOrder: z.number(),
  createdAt: z.date(),
  weekPlan: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  }),
})

const tariffDayPlanOutputSchema = z.object({
  id: z.string(),
  tariffId: z.string(),
  dayPosition: z.number(),
  dayPlanId: z.string().nullable(),
  createdAt: z.date(),
  dayPlan: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      planType: z.string(),
    })
    .nullable(),
})

const tariffOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  weekPlanId: z.string().nullable(),
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
  vacationCappingRuleGroupId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Optional relations (included in detail views)
  weekPlan: z
    .object({
      id: z.string(),
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
  weekPlanId: z.string().optional(),
  validFrom: z.string().date().optional(),
  validTo: z.string().date().optional(),
  isActive: z.boolean().optional().default(true),
  // Vacation
  annualVacationDays: z.number().optional(),
  workDaysPerWeek: z.number().int().min(1).max(7).optional(),
  vacationBasis: z.enum(VACATION_BASES).optional(),
  vacationCappingRuleGroupId: z.string().optional(),
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
  weekPlanIds: z.array(z.string()).optional(),
  dayPlans: z
    .array(
      z.object({
        dayPosition: z.number().int(),
        dayPlanId: z.string().nullable(),
      })
    )
    .optional(),
})

const updateTariffInputSchema = z.object({
  id: z.string(),
  // Code is NOT updatable (immutable after creation)
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  weekPlanId: z.string().nullable().optional(),
  validFrom: z.string().date().nullable().optional(),
  validTo: z.string().date().nullable().optional(),
  isActive: z.boolean().optional(),
  // Vacation
  annualVacationDays: z.number().nullable().optional(),
  workDaysPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  vacationBasis: z.enum(VACATION_BASES).nullable().optional(),
  vacationCappingRuleGroupId: z.string().nullable().optional(),
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
  weekPlanIds: z.array(z.string()).optional(),
  dayPlans: z
    .array(
      z.object({
        dayPosition: z.number().int(),
        dayPlanId: z.string().nullable(),
      })
    )
    .optional(),
})

const createBreakInputSchema = z.object({
  tariffId: z.string(),
  breakType: z.enum(BREAK_TYPES),
  afterWorkMinutes: z.number().int().optional(),
  duration: z.number().int().min(1, "Duration must be positive"),
  isPaid: z.boolean().optional(),
})

const deleteBreakInputSchema = z.object({
  tariffId: z.string(),
  breakId: z.string(),
})

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
      try {
        const tariffs = await tariffsService.list(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return {
          data: tariffs.map((t) =>
            mapToOutput(t as Record<string, unknown>)
          ),
        }
      } catch (err) {
        handleServiceError(err)
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
    .input(z.object({ id: z.string() }))
    .output(tariffOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tariff = await tariffsService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )

        return mapToOutput(tariff as unknown as Record<string, unknown>, {
          includeRelations: true,
        })
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const result = await tariffsService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return mapToOutput(result as unknown as Record<string, unknown>, {
          includeRelations: true,
        })
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const result = await tariffsService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return mapToOutput(result as unknown as Record<string, unknown>, {
          includeRelations: true,
        })
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await tariffsService.remove(ctx.prisma, ctx.tenantId!, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        return await tariffsService.createBreak(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
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
      try {
        await tariffsService.deleteBreak(
          ctx.prisma,
          ctx.tenantId!,
          input.tariffId,
          input.breakId
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
