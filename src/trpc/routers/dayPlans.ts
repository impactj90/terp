/**
 * DayPlans Router
 *
 * Provides day plan CRUD operations via tRPC procedures, plus sub-entity
 * management for Breaks and Bonuses and a Copy mutation.
 *
 * Replaces the Go backend day plan endpoints:
 * - GET /day-plans -> dayPlans.list
 * - GET /day-plans/{id} -> dayPlans.getById
 * - POST /day-plans -> dayPlans.create
 * - PATCH /day-plans/{id} -> dayPlans.update
 * - DELETE /day-plans/{id} -> dayPlans.delete
 * - POST /day-plans/{id}/copy -> dayPlans.copy
 * - POST /day-plans/{id}/breaks -> dayPlans.createBreak
 * - DELETE /day-plans/{id}/breaks/{breakId} -> dayPlans.deleteBreak
 * - POST /day-plans/{id}/bonuses -> dayPlans.createBonus
 * - DELETE /day-plans/{id}/bonuses/{bonusId} -> dayPlans.deleteBonus
 *
 * @see apps/api/internal/service/dayplan.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as dayPlansService from "@/lib/services/day-plans-service"

// --- Permission Constants ---

const DAY_PLANS_MANAGE = permissionIdByKey("day_plans.manage")!

// --- Enum Constants ---

const PLAN_TYPES = ["fixed", "flextime"] as const
const ROUNDING_TYPES = [
  "none",
  "up",
  "down",
  "nearest",
  "add",
  "subtract",
] as const
const NO_BOOKING_BEHAVIORS = [
  "error",
  "deduct_target",
  "vocational_school",
  "adopt_target",
  "target_with_order",
] as const
const DAY_CHANGE_BEHAVIORS = [
  "none",
  "at_arrival",
  "at_departure",
  "auto_complete",
] as const
const BREAK_TYPES = ["fixed", "variable", "minimum"] as const
const CALCULATION_TYPES = ["fixed", "per_minute", "percentage"] as const

// --- Output Schemas ---

const dayPlanBreakOutputSchema = z.object({
  id: z.string(),
  dayPlanId: z.string(),
  breakType: z.string(),
  startTime: z.number().nullable(),
  endTime: z.number().nullable(),
  duration: z.number(),
  afterWorkMinutes: z.number().nullable(),
  autoDeduct: z.boolean(),
  isPaid: z.boolean(),
  minutesDifference: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const dayPlanBonusOutputSchema = z.object({
  id: z.string(),
  dayPlanId: z.string(),
  accountId: z.string(),
  timeFrom: z.number(),
  timeTo: z.number(),
  calculationType: z.string(),
  valueMinutes: z.number(),
  minWorkMinutes: z.number().nullable(),
  appliesOnHoliday: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const dayPlanOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  planType: z.string(),
  comeFrom: z.number().nullable(),
  comeTo: z.number().nullable(),
  goFrom: z.number().nullable(),
  goTo: z.number().nullable(),
  coreStart: z.number().nullable(),
  coreEnd: z.number().nullable(),
  regularHours: z.number(),
  regularHours2: z.number().nullable(),
  fromEmployeeMaster: z.boolean(),
  toleranceComePlus: z.number(),
  toleranceComeMinus: z.number(),
  toleranceGoPlus: z.number(),
  toleranceGoMinus: z.number(),
  roundingComeType: z.string().nullable(),
  roundingComeInterval: z.number().nullable(),
  roundingGoType: z.string().nullable(),
  roundingGoInterval: z.number().nullable(),
  minWorkTime: z.number().nullable(),
  maxNetWorkTime: z.number().nullable(),
  variableWorkTime: z.boolean(),
  roundAllBookings: z.boolean(),
  roundingComeAddValue: z.number().nullable(),
  roundingGoAddValue: z.number().nullable(),
  holidayCreditCat1: z.number().nullable(),
  holidayCreditCat2: z.number().nullable(),
  holidayCreditCat3: z.number().nullable(),
  vacationDeduction: z.number(),
  noBookingBehavior: z.string(),
  dayChangeBehavior: z.string(),
  shiftDetectArriveFrom: z.number().nullable(),
  shiftDetectArriveTo: z.number().nullable(),
  shiftDetectDepartFrom: z.number().nullable(),
  shiftDetectDepartTo: z.number().nullable(),
  shiftAltPlan1: z.string().nullable(),
  shiftAltPlan2: z.string().nullable(),
  shiftAltPlan3: z.string().nullable(),
  shiftAltPlan4: z.string().nullable(),
  shiftAltPlan5: z.string().nullable(),
  shiftAltPlan6: z.string().nullable(),
  netAccountId: z.string().nullable(),
  capAccountId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  breaks: z.array(dayPlanBreakOutputSchema).optional(),
  bonuses: z.array(dayPlanBonusOutputSchema).optional(),
})

type DayPlanOutput = z.infer<typeof dayPlanOutputSchema>

// --- Input Schemas ---

const createDayPlanInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  planType: z.enum(PLAN_TYPES).optional(),
  comeFrom: z.number().int().optional(),
  comeTo: z.number().int().optional(),
  goFrom: z.number().int().optional(),
  goTo: z.number().int().optional(),
  coreStart: z.number().int().optional(),
  coreEnd: z.number().int().optional(),
  regularHours: z.number().int().optional(),
  regularHours2: z.number().int().optional(),
  fromEmployeeMaster: z.boolean().optional(),
  toleranceComePlus: z.number().int().optional(),
  toleranceComeMinus: z.number().int().optional(),
  toleranceGoPlus: z.number().int().optional(),
  toleranceGoMinus: z.number().int().optional(),
  variableWorkTime: z.boolean().optional(),
  roundingComeType: z.enum(ROUNDING_TYPES).optional(),
  roundingComeInterval: z.number().int().optional(),
  roundingGoType: z.enum(ROUNDING_TYPES).optional(),
  roundingGoInterval: z.number().int().optional(),
  minWorkTime: z.number().int().optional(),
  maxNetWorkTime: z.number().int().optional(),
  roundAllBookings: z.boolean().optional(),
  roundingComeAddValue: z.number().int().optional(),
  roundingGoAddValue: z.number().int().optional(),
  holidayCreditCat1: z.number().int().optional(),
  holidayCreditCat2: z.number().int().optional(),
  holidayCreditCat3: z.number().int().optional(),
  vacationDeduction: z.number().optional(),
  noBookingBehavior: z.enum(NO_BOOKING_BEHAVIORS).optional(),
  dayChangeBehavior: z.enum(DAY_CHANGE_BEHAVIORS).optional(),
  shiftDetectArriveFrom: z.number().int().optional(),
  shiftDetectArriveTo: z.number().int().optional(),
  shiftDetectDepartFrom: z.number().int().optional(),
  shiftDetectDepartTo: z.number().int().optional(),
  shiftAltPlan1: z.string().optional(),
  shiftAltPlan2: z.string().optional(),
  shiftAltPlan3: z.string().optional(),
  shiftAltPlan4: z.string().optional(),
  shiftAltPlan5: z.string().optional(),
  shiftAltPlan6: z.string().optional(),
  netAccountId: z.string().optional(),
  capAccountId: z.string().optional(),
})

const updateDayPlanInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  planType: z.enum(PLAN_TYPES).optional(),
  comeFrom: z.number().int().nullable().optional(),
  comeTo: z.number().int().nullable().optional(),
  goFrom: z.number().int().nullable().optional(),
  goTo: z.number().int().nullable().optional(),
  coreStart: z.number().int().nullable().optional(),
  coreEnd: z.number().int().nullable().optional(),
  regularHours: z.number().int().optional(),
  regularHours2: z.number().int().nullable().optional(),
  fromEmployeeMaster: z.boolean().optional(),
  toleranceComePlus: z.number().int().optional(),
  toleranceComeMinus: z.number().int().optional(),
  toleranceGoPlus: z.number().int().optional(),
  toleranceGoMinus: z.number().int().optional(),
  variableWorkTime: z.boolean().optional(),
  roundingComeType: z.enum(ROUNDING_TYPES).nullable().optional(),
  roundingComeInterval: z.number().int().nullable().optional(),
  roundingGoType: z.enum(ROUNDING_TYPES).nullable().optional(),
  roundingGoInterval: z.number().int().nullable().optional(),
  minWorkTime: z.number().int().nullable().optional(),
  maxNetWorkTime: z.number().int().nullable().optional(),
  roundAllBookings: z.boolean().optional(),
  roundingComeAddValue: z.number().int().nullable().optional(),
  roundingGoAddValue: z.number().int().nullable().optional(),
  holidayCreditCat1: z.number().int().nullable().optional(),
  holidayCreditCat2: z.number().int().nullable().optional(),
  holidayCreditCat3: z.number().int().nullable().optional(),
  vacationDeduction: z.number().optional(),
  noBookingBehavior: z.enum(NO_BOOKING_BEHAVIORS).optional(),
  dayChangeBehavior: z.enum(DAY_CHANGE_BEHAVIORS).optional(),
  shiftDetectArriveFrom: z.number().int().nullable().optional(),
  shiftDetectArriveTo: z.number().int().nullable().optional(),
  shiftDetectDepartFrom: z.number().int().nullable().optional(),
  shiftDetectDepartTo: z.number().int().nullable().optional(),
  shiftAltPlan1: z.string().nullable().optional(),
  shiftAltPlan2: z.string().nullable().optional(),
  shiftAltPlan3: z.string().nullable().optional(),
  shiftAltPlan4: z.string().nullable().optional(),
  shiftAltPlan5: z.string().nullable().optional(),
  shiftAltPlan6: z.string().nullable().optional(),
  netAccountId: z.string().nullable().optional(),
  capAccountId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

const copyDayPlanInputSchema = z.object({
  id: z.string(),
  newCode: z.string().min(1, "New code is required"),
  newName: z.string().min(1, "New name is required"),
})

const createBreakInputSchema = z.object({
  dayPlanId: z.string(),
  breakType: z.enum(BREAK_TYPES),
  startTime: z.number().int().optional(),
  endTime: z.number().int().optional(),
  duration: z.number().int().min(1, "Duration must be positive"),
  afterWorkMinutes: z.number().int().optional(),
  autoDeduct: z.boolean().optional(),
  isPaid: z.boolean().optional(),
  minutesDifference: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const deleteBreakInputSchema = z.object({
  dayPlanId: z.string(),
  breakId: z.string(),
})

const createBonusInputSchema = z.object({
  dayPlanId: z.string(),
  accountId: z.string(),
  timeFrom: z.number().int(),
  timeTo: z.number().int(),
  calculationType: z.enum(CALCULATION_TYPES),
  valueMinutes: z.number().int().min(1, "Value minutes must be positive"),
  minWorkMinutes: z.number().int().optional(),
  appliesOnHoliday: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const deleteBonusInputSchema = z.object({
  dayPlanId: z.string(),
  bonusId: z.string(),
})

// --- Mapping Functions ---

/**
 * Maps a Prisma DayPlan record to the output schema shape.
 * Handles Decimal -> number conversion for vacationDeduction.
 * Handles optional breaks/bonuses arrays.
 */
function mapDayPlanToOutput(
  p: Record<string, unknown>
): DayPlanOutput {
  return {
    id: p.id as string,
    tenantId: p.tenantId as string,
    code: p.code as string,
    name: p.name as string,
    description: (p.description as string | null) ?? null,
    planType: p.planType as string,
    comeFrom: (p.comeFrom as number | null) ?? null,
    comeTo: (p.comeTo as number | null) ?? null,
    goFrom: (p.goFrom as number | null) ?? null,
    goTo: (p.goTo as number | null) ?? null,
    coreStart: (p.coreStart as number | null) ?? null,
    coreEnd: (p.coreEnd as number | null) ?? null,
    regularHours: p.regularHours as number,
    regularHours2: (p.regularHours2 as number | null) ?? null,
    fromEmployeeMaster: p.fromEmployeeMaster as boolean,
    toleranceComePlus: p.toleranceComePlus as number,
    toleranceComeMinus: p.toleranceComeMinus as number,
    toleranceGoPlus: p.toleranceGoPlus as number,
    toleranceGoMinus: p.toleranceGoMinus as number,
    roundingComeType: (p.roundingComeType as string | null) ?? null,
    roundingComeInterval: (p.roundingComeInterval as number | null) ?? null,
    roundingGoType: (p.roundingGoType as string | null) ?? null,
    roundingGoInterval: (p.roundingGoInterval as number | null) ?? null,
    minWorkTime: (p.minWorkTime as number | null) ?? null,
    maxNetWorkTime: (p.maxNetWorkTime as number | null) ?? null,
    variableWorkTime: p.variableWorkTime as boolean,
    roundAllBookings: p.roundAllBookings as boolean,
    roundingComeAddValue: (p.roundingComeAddValue as number | null) ?? null,
    roundingGoAddValue: (p.roundingGoAddValue as number | null) ?? null,
    holidayCreditCat1: (p.holidayCreditCat1 as number | null) ?? null,
    holidayCreditCat2: (p.holidayCreditCat2 as number | null) ?? null,
    holidayCreditCat3: (p.holidayCreditCat3 as number | null) ?? null,
    vacationDeduction:
      p.vacationDeduction !== null && p.vacationDeduction !== undefined
        ? Number(p.vacationDeduction)
        : 1.0,
    noBookingBehavior: p.noBookingBehavior as string,
    dayChangeBehavior: p.dayChangeBehavior as string,
    shiftDetectArriveFrom:
      (p.shiftDetectArriveFrom as number | null) ?? null,
    shiftDetectArriveTo: (p.shiftDetectArriveTo as number | null) ?? null,
    shiftDetectDepartFrom:
      (p.shiftDetectDepartFrom as number | null) ?? null,
    shiftDetectDepartTo: (p.shiftDetectDepartTo as number | null) ?? null,
    shiftAltPlan1: (p.shiftAltPlan1 as string | null) ?? null,
    shiftAltPlan2: (p.shiftAltPlan2 as string | null) ?? null,
    shiftAltPlan3: (p.shiftAltPlan3 as string | null) ?? null,
    shiftAltPlan4: (p.shiftAltPlan4 as string | null) ?? null,
    shiftAltPlan5: (p.shiftAltPlan5 as string | null) ?? null,
    shiftAltPlan6: (p.shiftAltPlan6 as string | null) ?? null,
    netAccountId: (p.netAccountId as string | null) ?? null,
    capAccountId: (p.capAccountId as string | null) ?? null,
    isActive: p.isActive as boolean,
    createdAt: p.createdAt as Date,
    updatedAt: p.updatedAt as Date,
    breaks: p.breaks
      ? (p.breaks as Array<Record<string, unknown>>).map((b) => ({
          id: b.id as string,
          dayPlanId: b.dayPlanId as string,
          breakType: b.breakType as string,
          startTime: (b.startTime as number | null) ?? null,
          endTime: (b.endTime as number | null) ?? null,
          duration: b.duration as number,
          afterWorkMinutes: (b.afterWorkMinutes as number | null) ?? null,
          autoDeduct: b.autoDeduct as boolean,
          isPaid: b.isPaid as boolean,
          minutesDifference: b.minutesDifference as boolean,
          sortOrder: b.sortOrder as number,
          createdAt: b.createdAt as Date,
          updatedAt: b.updatedAt as Date,
        }))
      : undefined,
    bonuses: p.bonuses
      ? (p.bonuses as Array<Record<string, unknown>>).map((b) => ({
          id: b.id as string,
          dayPlanId: b.dayPlanId as string,
          accountId: b.accountId as string,
          timeFrom: b.timeFrom as number,
          timeTo: b.timeTo as number,
          calculationType: b.calculationType as string,
          valueMinutes: b.valueMinutes as number,
          minWorkMinutes: (b.minWorkMinutes as number | null) ?? null,
          appliesOnHoliday: b.appliesOnHoliday as boolean,
          sortOrder: b.sortOrder as number,
          createdAt: b.createdAt as Date,
          updatedAt: b.updatedAt as Date,
        }))
      : undefined,
  }
}

// --- Router ---

export const dayPlansRouter = createTRPCRouter({
  /**
   * dayPlans.list -- Returns day plans for the current tenant.
   *
   * Supports optional filters: isActive, planType.
   * Orders by code ASC. Does NOT include breaks/bonuses.
   *
   * Requires: day_plans.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
          planType: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(dayPlanOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const plans = await dayPlansService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ?? undefined
        )

        return {
          data: plans.map((p) =>
            mapDayPlanToOutput(p as unknown as Record<string, unknown>)
          ),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.getById -- Returns a single day plan by ID.
   *
   * Includes breaks and bonuses.
   * Tenant-scoped.
   *
   * Requires: day_plans.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(dayPlanOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const plan = await dayPlansService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )

        return mapDayPlanToOutput(plan as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.create -- Creates a new day plan.
   *
   * Validates code (non-empty, not reserved, unique within tenant),
   * name (non-empty), regularHours (> 0).
   * Applies flextime normalization.
   * Defaults: planType "fixed", regularHours 480, isActive true.
   *
   * Requires: day_plans.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(createDayPlanInputSchema)
    .output(dayPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const plan = await dayPlansService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return mapDayPlanToOutput(plan as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.update -- Updates an existing day plan.
   *
   * Supports partial updates. Code uniqueness check if code changed.
   * Applies flextime normalization if planType changes.
   *
   * Requires: day_plans.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(updateDayPlanInputSchema)
    .output(dayPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const plan = await dayPlansService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return mapDayPlanToOutput(plan as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.delete -- Deletes a day plan.
   *
   * Checks if any week plans reference this day plan before deletion.
   * Breaks and bonuses cascade-delete via FK.
   *
   * Requires: day_plans.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await dayPlansService.remove(ctx.prisma, ctx.tenantId!, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.copy -- Copies a day plan with new code and name.
   *
   * Copies all fields plus breaks and bonuses.
   * Validates newCode (required, trimmed, not reserved, unique).
   *
   * Requires: day_plans.manage permission
   */
  copy: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(copyDayPlanInputSchema)
    .output(dayPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const plan = await dayPlansService.copy(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return mapDayPlanToOutput(plan as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.createBreak -- Adds a break to a day plan.
   *
   * Validates parent day plan exists, break config per type.
   *
   * Requires: day_plans.manage permission
   */
  createBreak: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(createBreakInputSchema)
    .output(dayPlanBreakOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const brk = await dayPlansService.createBreak(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return {
          id: brk.id,
          dayPlanId: brk.dayPlanId,
          breakType: brk.breakType,
          startTime: brk.startTime,
          endTime: brk.endTime,
          duration: brk.duration,
          afterWorkMinutes: brk.afterWorkMinutes,
          autoDeduct: brk.autoDeduct,
          isPaid: brk.isPaid,
          minutesDifference: brk.minutesDifference,
          sortOrder: brk.sortOrder,
          createdAt: brk.createdAt,
          updatedAt: brk.updatedAt,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.deleteBreak -- Removes a break from a day plan.
   *
   * Requires: day_plans.manage permission
   */
  deleteBreak: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(deleteBreakInputSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await dayPlansService.removeBreak(ctx.prisma, ctx.tenantId!, input)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.createBonus -- Adds a bonus to a day plan.
   *
   * Validates parent day plan exists, timeFrom < timeTo.
   *
   * Requires: day_plans.manage permission
   */
  createBonus: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(createBonusInputSchema)
    .output(dayPlanBonusOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const bonus = await dayPlansService.createBonusFn(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return {
          id: bonus.id,
          dayPlanId: bonus.dayPlanId,
          accountId: bonus.accountId,
          timeFrom: bonus.timeFrom,
          timeTo: bonus.timeTo,
          calculationType: bonus.calculationType,
          valueMinutes: bonus.valueMinutes,
          minWorkMinutes: bonus.minWorkMinutes,
          appliesOnHoliday: bonus.appliesOnHoliday,
          sortOrder: bonus.sortOrder,
          createdAt: bonus.createdAt,
          updatedAt: bonus.updatedAt,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dayPlans.deleteBonus -- Removes a bonus from a day plan.
   *
   * Requires: day_plans.manage permission
   */
  deleteBonus: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(deleteBonusInputSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await dayPlansService.removeBonus(ctx.prisma, ctx.tenantId!, input)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
