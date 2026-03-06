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
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

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
const RESERVED_CODES = ["U", "K", "S"]

// --- Output Schemas ---

const dayPlanBreakOutputSchema = z.object({
  id: z.string().uuid(),
  dayPlanId: z.string().uuid(),
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
  id: z.string().uuid(),
  dayPlanId: z.string().uuid(),
  accountId: z.string().uuid(),
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
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
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
  shiftAltPlan1: z.string().uuid().nullable(),
  shiftAltPlan2: z.string().uuid().nullable(),
  shiftAltPlan3: z.string().uuid().nullable(),
  shiftAltPlan4: z.string().uuid().nullable(),
  shiftAltPlan5: z.string().uuid().nullable(),
  shiftAltPlan6: z.string().uuid().nullable(),
  netAccountId: z.string().uuid().nullable(),
  capAccountId: z.string().uuid().nullable(),
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
  shiftAltPlan1: z.string().uuid().optional(),
  shiftAltPlan2: z.string().uuid().optional(),
  shiftAltPlan3: z.string().uuid().optional(),
  shiftAltPlan4: z.string().uuid().optional(),
  shiftAltPlan5: z.string().uuid().optional(),
  shiftAltPlan6: z.string().uuid().optional(),
  netAccountId: z.string().uuid().optional(),
  capAccountId: z.string().uuid().optional(),
})

const updateDayPlanInputSchema = z.object({
  id: z.string().uuid(),
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
  shiftAltPlan1: z.string().uuid().nullable().optional(),
  shiftAltPlan2: z.string().uuid().nullable().optional(),
  shiftAltPlan3: z.string().uuid().nullable().optional(),
  shiftAltPlan4: z.string().uuid().nullable().optional(),
  shiftAltPlan5: z.string().uuid().nullable().optional(),
  shiftAltPlan6: z.string().uuid().nullable().optional(),
  netAccountId: z.string().uuid().nullable().optional(),
  capAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})

const copyDayPlanInputSchema = z.object({
  id: z.string().uuid(),
  newCode: z.string().min(1, "New code is required"),
  newName: z.string().min(1, "New name is required"),
})

const createBreakInputSchema = z.object({
  dayPlanId: z.string().uuid(),
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
  dayPlanId: z.string().uuid(),
  breakId: z.string().uuid(),
})

const createBonusInputSchema = z.object({
  dayPlanId: z.string().uuid(),
  accountId: z.string().uuid(),
  timeFrom: z.number().int(),
  timeTo: z.number().int(),
  calculationType: z.enum(CALCULATION_TYPES),
  valueMinutes: z.number().int().min(1, "Value minutes must be positive"),
  minWorkMinutes: z.number().int().optional(),
  appliesOnHoliday: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const deleteBonusInputSchema = z.object({
  dayPlanId: z.string().uuid(),
  bonusId: z.string().uuid(),
})

// --- Prisma include for detail views ---

const dayPlanDetailInclude = {
  breaks: { orderBy: { sortOrder: "asc" as const } },
  bonuses: { orderBy: { sortOrder: "asc" as const } },
} as const

// --- Helpers ---

/**
 * Checks if a day plan code is reserved (case-insensitive).
 * Reserved codes: U, K, S
 */
function isReservedCode(code: string): boolean {
  return RESERVED_CODES.includes(code.toUpperCase())
}

/**
 * Normalizes fields for flextime plans per ZMI Section 6.2.
 * When planType is "flextime", zeros out toleranceComePlus,
 * toleranceGoMinus, and variableWorkTime.
 */
function normalizeFlextimeFields(
  data: Record<string, unknown>,
  planType: string
): void {
  if (planType === "flextime") {
    data.toleranceComePlus = 0
    data.toleranceGoMinus = 0
    data.variableWorkTime = false
  }
}

/**
 * Validates break configuration based on break type.
 * - fixed: requires startTime and endTime, startTime < endTime
 * - minimum: requires afterWorkMinutes
 * - variable: no time requirements
 * - All types: duration > 0 (enforced by Zod schema)
 */
function validateBreak(
  breakType: string,
  startTime: number | undefined,
  endTime: number | undefined,
  afterWorkMinutes: number | undefined
): void {
  if (breakType === "fixed") {
    if (startTime === undefined || endTime === undefined) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Fixed break requires start time and end time",
      })
    }
    if (startTime >= endTime) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Break start time must be before end time",
      })
    }
  }

  if (breakType === "minimum") {
    if (afterWorkMinutes === undefined) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Minimum break requires after work minutes",
      })
    }
  }
}

/**
 * Validates bonus configuration.
 * - timeFrom < timeTo
 * - valueMinutes > 0 (enforced by Zod schema)
 */
function validateBonus(timeFrom: number, timeTo: number): void {
  if (timeFrom >= timeTo) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Bonus time from must be before time to",
    })
  }
}

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
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }
      if (input?.planType !== undefined) {
        where.planType = input.planType
      }

      const plans = await ctx.prisma.dayPlan.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: plans.map((p) =>
          mapDayPlanToOutput(p as unknown as Record<string, unknown>)
        ),
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
    .input(z.object({ id: z.string().uuid() }))
    .output(dayPlanOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const plan = await ctx.prisma.dayPlan.findFirst({
        where: { id: input.id, tenantId },
        include: dayPlanDetailInclude,
      })

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Day plan not found",
        })
      }

      return mapDayPlanToOutput(plan as unknown as Record<string, unknown>)
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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Day plan code is required",
        })
      }

      // Check reserved codes
      if (isReservedCode(code)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Day plan code is reserved",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Day plan name is required",
        })
      }

      // Validate regularHours
      const regularHours = input.regularHours ?? 480
      if (regularHours <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Regular hours must be positive",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.dayPlan.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Day plan code already exists",
        })
      }

      // Trim description
      const description = input.description?.trim() || null

      // Build create data
      const planType = input.planType || "fixed"
      const data: Record<string, unknown> = {
        tenantId,
        code,
        name,
        description,
        planType,
        regularHours,
        isActive: true,
        comeFrom: input.comeFrom,
        comeTo: input.comeTo,
        goFrom: input.goFrom,
        goTo: input.goTo,
        coreStart: input.coreStart,
        coreEnd: input.coreEnd,
        regularHours2: input.regularHours2,
        fromEmployeeMaster: input.fromEmployeeMaster ?? false,
        toleranceComePlus: input.toleranceComePlus ?? 0,
        toleranceComeMinus: input.toleranceComeMinus ?? 0,
        toleranceGoPlus: input.toleranceGoPlus ?? 0,
        toleranceGoMinus: input.toleranceGoMinus ?? 0,
        variableWorkTime: input.variableWorkTime ?? false,
        roundingComeType: input.roundingComeType,
        roundingComeInterval: input.roundingComeInterval,
        roundingGoType: input.roundingGoType,
        roundingGoInterval: input.roundingGoInterval,
        minWorkTime: input.minWorkTime,
        maxNetWorkTime: input.maxNetWorkTime,
        roundAllBookings: input.roundAllBookings ?? false,
        roundingComeAddValue: input.roundingComeAddValue,
        roundingGoAddValue: input.roundingGoAddValue,
        holidayCreditCat1: input.holidayCreditCat1,
        holidayCreditCat2: input.holidayCreditCat2,
        holidayCreditCat3: input.holidayCreditCat3,
        vacationDeduction:
          input.vacationDeduction !== undefined
            ? new Prisma.Decimal(input.vacationDeduction)
            : new Prisma.Decimal(1.0),
        noBookingBehavior: input.noBookingBehavior || "error",
        dayChangeBehavior: input.dayChangeBehavior || "none",
        shiftDetectArriveFrom: input.shiftDetectArriveFrom,
        shiftDetectArriveTo: input.shiftDetectArriveTo,
        shiftDetectDepartFrom: input.shiftDetectDepartFrom,
        shiftDetectDepartTo: input.shiftDetectDepartTo,
        shiftAltPlan1: input.shiftAltPlan1,
        shiftAltPlan2: input.shiftAltPlan2,
        shiftAltPlan3: input.shiftAltPlan3,
        shiftAltPlan4: input.shiftAltPlan4,
        shiftAltPlan5: input.shiftAltPlan5,
        shiftAltPlan6: input.shiftAltPlan6,
        netAccountId: input.netAccountId,
        capAccountId: input.capAccountId,
      }

      // Apply flextime normalization
      normalizeFlextimeFields(data, planType)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await ctx.prisma.dayPlan.create({ data: data as any })

      // Re-fetch with detail include
      const plan = await ctx.prisma.dayPlan.findUniqueOrThrow({
        where: { id: created.id },
        include: dayPlanDetailInclude,
      })

      return mapDayPlanToOutput(plan as unknown as Record<string, unknown>)
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
      const tenantId = ctx.tenantId!

      // Verify day plan exists (tenant-scoped)
      const existing = await ctx.prisma.dayPlan.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Day plan not found",
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
            message: "Day plan code is required",
          })
        }
        if (isReservedCode(code)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Day plan code is reserved",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.dayPlan.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Day plan code already exists",
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
            message: "Day plan name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle planType update
      if (input.planType !== undefined) {
        data.planType = input.planType
      }

      // Handle nullable integer fields
      const nullableIntFields = [
        "comeFrom",
        "comeTo",
        "goFrom",
        "goTo",
        "coreStart",
        "coreEnd",
        "regularHours2",
        "roundingComeInterval",
        "roundingGoInterval",
        "minWorkTime",
        "maxNetWorkTime",
        "roundingComeAddValue",
        "roundingGoAddValue",
        "holidayCreditCat1",
        "holidayCreditCat2",
        "holidayCreditCat3",
        "shiftDetectArriveFrom",
        "shiftDetectArriveTo",
        "shiftDetectDepartFrom",
        "shiftDetectDepartTo",
      ] as const

      for (const field of nullableIntFields) {
        if (input[field] !== undefined) {
          data[field] = input[field]
        }
      }

      // Handle non-nullable integer fields
      if (input.regularHours !== undefined) {
        if (input.regularHours <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Regular hours must be positive",
          })
        }
        data.regularHours = input.regularHours
      }

      if (input.toleranceComePlus !== undefined) {
        data.toleranceComePlus = input.toleranceComePlus
      }
      if (input.toleranceComeMinus !== undefined) {
        data.toleranceComeMinus = input.toleranceComeMinus
      }
      if (input.toleranceGoPlus !== undefined) {
        data.toleranceGoPlus = input.toleranceGoPlus
      }
      if (input.toleranceGoMinus !== undefined) {
        data.toleranceGoMinus = input.toleranceGoMinus
      }

      // Handle boolean fields
      if (input.fromEmployeeMaster !== undefined) {
        data.fromEmployeeMaster = input.fromEmployeeMaster
      }
      if (input.variableWorkTime !== undefined) {
        data.variableWorkTime = input.variableWorkTime
      }
      if (input.roundAllBookings !== undefined) {
        data.roundAllBookings = input.roundAllBookings
      }
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      // Handle nullable string fields
      if (input.roundingComeType !== undefined) {
        data.roundingComeType = input.roundingComeType
      }
      if (input.roundingGoType !== undefined) {
        data.roundingGoType = input.roundingGoType
      }
      if (input.noBookingBehavior !== undefined) {
        data.noBookingBehavior = input.noBookingBehavior
      }
      if (input.dayChangeBehavior !== undefined) {
        data.dayChangeBehavior = input.dayChangeBehavior
      }

      // Handle nullable UUID fields
      const nullableUuidFields = [
        "shiftAltPlan1",
        "shiftAltPlan2",
        "shiftAltPlan3",
        "shiftAltPlan4",
        "shiftAltPlan5",
        "shiftAltPlan6",
        "netAccountId",
        "capAccountId",
      ] as const

      for (const field of nullableUuidFields) {
        if (input[field] !== undefined) {
          data[field] = input[field]
        }
      }

      // Handle vacationDeduction
      if (input.vacationDeduction !== undefined) {
        data.vacationDeduction = new Prisma.Decimal(input.vacationDeduction)
      }

      // Determine effective planType for normalization
      const effectivePlanType =
        (data.planType as string) || existing.planType
      normalizeFlextimeFields(data, effectivePlanType)

      await ctx.prisma.dayPlan.update({
        where: { id: input.id },
        data,
      })

      // Re-fetch with detail include
      const plan = await ctx.prisma.dayPlan.findUniqueOrThrow({
        where: { id: input.id },
        include: dayPlanDetailInclude,
      })

      return mapDayPlanToOutput(plan as unknown as Record<string, unknown>)
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify day plan exists (tenant-scoped)
      const existing = await ctx.prisma.dayPlan.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Day plan not found",
        })
      }

      // Check if any week plans reference this day plan
      const result = await ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
        `SELECT COUNT(*)::int as count FROM week_plans WHERE monday_day_plan_id = $1 OR tuesday_day_plan_id = $1 OR wednesday_day_plan_id = $1 OR thursday_day_plan_id = $1 OR friday_day_plan_id = $1 OR saturday_day_plan_id = $1 OR sunday_day_plan_id = $1`,
        input.id
      )
      if (result[0] && result[0].count > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete day plan that is referenced by week plans",
        })
      }

      // Hard delete (breaks and bonuses cascade via FK)
      await ctx.prisma.dayPlan.delete({
        where: { id: input.id },
      })

      return { success: true }
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
      const tenantId = ctx.tenantId!

      // Trim and validate newCode
      const newCode = input.newCode.trim()
      if (newCode.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "New code is required",
        })
      }
      if (isReservedCode(newCode)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Day plan code is reserved",
        })
      }

      // Trim and validate newName
      const newName = input.newName.trim()
      if (newName.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "New name is required",
        })
      }

      // Fetch original with details
      const original = await ctx.prisma.dayPlan.findFirst({
        where: { id: input.id, tenantId },
        include: dayPlanDetailInclude,
      })
      if (!original) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Day plan not found",
        })
      }

      // Check code uniqueness
      const existingByCode = await ctx.prisma.dayPlan.findFirst({
        where: { tenantId, code: newCode },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Day plan code already exists",
        })
      }

      // Create copy with all fields except id, code, name, timestamps
      const copy = await ctx.prisma.dayPlan.create({
        data: {
          tenantId,
          code: newCode,
          name: newName,
          description: original.description,
          planType: original.planType,
          comeFrom: original.comeFrom,
          comeTo: original.comeTo,
          goFrom: original.goFrom,
          goTo: original.goTo,
          coreStart: original.coreStart,
          coreEnd: original.coreEnd,
          regularHours: original.regularHours,
          regularHours2: original.regularHours2,
          fromEmployeeMaster: original.fromEmployeeMaster,
          toleranceComePlus: original.toleranceComePlus,
          toleranceComeMinus: original.toleranceComeMinus,
          toleranceGoPlus: original.toleranceGoPlus,
          toleranceGoMinus: original.toleranceGoMinus,
          roundingComeType: original.roundingComeType,
          roundingComeInterval: original.roundingComeInterval,
          roundingGoType: original.roundingGoType,
          roundingGoInterval: original.roundingGoInterval,
          minWorkTime: original.minWorkTime,
          maxNetWorkTime: original.maxNetWorkTime,
          variableWorkTime: original.variableWorkTime,
          roundAllBookings: original.roundAllBookings,
          roundingComeAddValue: original.roundingComeAddValue,
          roundingGoAddValue: original.roundingGoAddValue,
          holidayCreditCat1: original.holidayCreditCat1,
          holidayCreditCat2: original.holidayCreditCat2,
          holidayCreditCat3: original.holidayCreditCat3,
          vacationDeduction: original.vacationDeduction,
          noBookingBehavior: original.noBookingBehavior,
          dayChangeBehavior: original.dayChangeBehavior,
          shiftDetectArriveFrom: original.shiftDetectArriveFrom,
          shiftDetectArriveTo: original.shiftDetectArriveTo,
          shiftDetectDepartFrom: original.shiftDetectDepartFrom,
          shiftDetectDepartTo: original.shiftDetectDepartTo,
          shiftAltPlan1: original.shiftAltPlan1,
          shiftAltPlan2: original.shiftAltPlan2,
          shiftAltPlan3: original.shiftAltPlan3,
          shiftAltPlan4: original.shiftAltPlan4,
          shiftAltPlan5: original.shiftAltPlan5,
          shiftAltPlan6: original.shiftAltPlan6,
          netAccountId: original.netAccountId,
          capAccountId: original.capAccountId,
          isActive: original.isActive,
        },
      })

      // Copy breaks
      for (const brk of original.breaks) {
        await ctx.prisma.dayPlanBreak.create({
          data: {
            dayPlanId: copy.id,
            breakType: brk.breakType,
            startTime: brk.startTime,
            endTime: brk.endTime,
            duration: brk.duration,
            afterWorkMinutes: brk.afterWorkMinutes,
            autoDeduct: brk.autoDeduct,
            isPaid: brk.isPaid,
            minutesDifference: brk.minutesDifference,
            sortOrder: brk.sortOrder,
          },
        })
      }

      // Copy bonuses
      for (const bonus of original.bonuses) {
        await ctx.prisma.dayPlanBonus.create({
          data: {
            dayPlanId: copy.id,
            accountId: bonus.accountId,
            timeFrom: bonus.timeFrom,
            timeTo: bonus.timeTo,
            calculationType: bonus.calculationType,
            valueMinutes: bonus.valueMinutes,
            minWorkMinutes: bonus.minWorkMinutes,
            appliesOnHoliday: bonus.appliesOnHoliday,
            sortOrder: bonus.sortOrder,
          },
        })
      }

      // Re-fetch with detail include
      const result = await ctx.prisma.dayPlan.findUniqueOrThrow({
        where: { id: copy.id },
        include: dayPlanDetailInclude,
      })

      return mapDayPlanToOutput(
        result as unknown as Record<string, unknown>
      )
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
      const tenantId = ctx.tenantId!

      // Verify parent day plan exists and belongs to tenant
      const dayPlan = await ctx.prisma.dayPlan.findFirst({
        where: { id: input.dayPlanId, tenantId },
      })
      if (!dayPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Day plan not found",
        })
      }

      // Validate break config
      validateBreak(
        input.breakType,
        input.startTime,
        input.endTime,
        input.afterWorkMinutes
      )

      const brk = await ctx.prisma.dayPlanBreak.create({
        data: {
          dayPlanId: input.dayPlanId,
          breakType: input.breakType,
          startTime: input.startTime,
          endTime: input.endTime,
          duration: input.duration,
          afterWorkMinutes: input.afterWorkMinutes,
          autoDeduct: input.autoDeduct ?? true,
          isPaid: input.isPaid ?? false,
          minutesDifference: input.minutesDifference ?? false,
          sortOrder: input.sortOrder ?? 0,
        },
      })

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
      const tenantId = ctx.tenantId!

      // Verify parent day plan exists and belongs to tenant
      const dayPlan = await ctx.prisma.dayPlan.findFirst({
        where: { id: input.dayPlanId, tenantId },
      })
      if (!dayPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Day plan not found",
        })
      }

      // Verify break exists and belongs to the day plan
      const brk = await ctx.prisma.dayPlanBreak.findFirst({
        where: { id: input.breakId, dayPlanId: input.dayPlanId },
      })
      if (!brk) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Break not found",
        })
      }

      await ctx.prisma.dayPlanBreak.delete({
        where: { id: input.breakId },
      })

      return { success: true }
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
      const tenantId = ctx.tenantId!

      // Verify parent day plan exists and belongs to tenant
      const dayPlan = await ctx.prisma.dayPlan.findFirst({
        where: { id: input.dayPlanId, tenantId },
      })
      if (!dayPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Day plan not found",
        })
      }

      // Validate bonus
      validateBonus(input.timeFrom, input.timeTo)

      const bonus = await ctx.prisma.dayPlanBonus.create({
        data: {
          dayPlanId: input.dayPlanId,
          accountId: input.accountId,
          timeFrom: input.timeFrom,
          timeTo: input.timeTo,
          calculationType: input.calculationType,
          valueMinutes: input.valueMinutes,
          minWorkMinutes: input.minWorkMinutes,
          appliesOnHoliday: input.appliesOnHoliday ?? false,
          sortOrder: input.sortOrder ?? 0,
        },
      })

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
      const tenantId = ctx.tenantId!

      // Verify parent day plan exists and belongs to tenant
      const dayPlan = await ctx.prisma.dayPlan.findFirst({
        where: { id: input.dayPlanId, tenantId },
      })
      if (!dayPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Day plan not found",
        })
      }

      // Verify bonus exists and belongs to the day plan
      const bonus = await ctx.prisma.dayPlanBonus.findFirst({
        where: { id: input.bonusId, dayPlanId: input.dayPlanId },
      })
      if (!bonus) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bonus not found",
        })
      }

      await ctx.prisma.dayPlanBonus.delete({
        where: { id: input.bonusId },
      })

      return { success: true }
    }),
})
