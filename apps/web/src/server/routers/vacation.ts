/**
 * Vacation Preview Router
 *
 * Provides entitlement and carryover preview endpoints via tRPC procedures.
 * These are compute-only (no persistence) -- they calculate vacation entitlement
 * and carryover based on current data.
 *
 * Replaces the Go backend endpoints:
 * - POST /vacation-entitlement/preview -> vacation.entitlementPreview
 * - POST /vacation-carryover/preview -> vacation.carryoverPreview
 *
 * @see apps/api/internal/service/vacation.go
 * @see apps/api/internal/service/vacationcarryover.go
 */
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  calculateVacation,
  type VacationCalcInput,
  type VacationSpecialCalc,
  type VacationBasis,
} from "../lib/vacation-calculation"
import {
  calculateCarryoverWithCapping,
  type CarryoverInput,
  type CappingRuleInput,
  type CappingExceptionInput,
} from "../lib/carryover-calculation"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// --- Output Schemas ---

const entitlementPreviewOutputSchema = z.object({
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  year: z.number(),
  basis: z.string(),
  calcGroupId: z.string().uuid().nullable(),
  calcGroupName: z.string().nullable(),
  weeklyHours: z.number(),
  standardWeeklyHours: z.number(),
  partTimeFactor: z.number(),
  baseEntitlement: z.number(),
  proRatedEntitlement: z.number(),
  partTimeAdjustment: z.number(),
  ageBonus: z.number(),
  tenureBonus: z.number(),
  disabilityBonus: z.number(),
  totalEntitlement: z.number(),
  monthsEmployed: z.number(),
  ageAtReference: z.number(),
  tenureYears: z.number(),
})

const carryoverPreviewOutputSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number(),
  availableDays: z.number(),
  cappedCarryover: z.number(),
  forfeitedDays: z.number(),
  hasException: z.boolean(),
  rulesApplied: z.array(
    z.object({
      ruleId: z.string().uuid(),
      ruleName: z.string(),
      ruleType: z.string(),
      capValue: z.number(),
      applied: z.boolean(),
      exceptionActive: z.boolean(),
    })
  ),
})

// --- Helpers ---

function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number {
  if (val === null || val === undefined) return 0
  return Number(val)
}

// --- Router ---

export const vacationRouter = createTRPCRouter({
  /**
   * vacation.entitlementPreview -- Computes vacation entitlement preview.
   *
   * Loads employee data, resolves calculation group (from override or employment type),
   * and runs the vacation calculation engine.
   *
   * Requires: vacation_config.manage permission
   */
  entitlementPreview: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        year: z.number().int().min(1900).max(2200),
        calcGroupId: z.string().uuid().optional(),
      })
    )
    .output(entitlementPreviewOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Load employee with employment type
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId },
        include: { employmentType: true },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      // Resolve calculation group
      let calcGroup: {
        id: string
        name: string
        basis: string
        specialCalcLinks: Array<{
          specialCalculation: {
            type: string
            threshold: number
            bonusDays: Prisma.Decimal
          }
        }>
      } | null = null

      if (input.calcGroupId) {
        // Use provided override
        calcGroup = await ctx.prisma.vacationCalculationGroup.findFirst({
          where: { id: input.calcGroupId, tenantId },
          include: {
            specialCalcLinks: {
              include: {
                specialCalculation: {
                  select: { type: true, threshold: true, bonusDays: true },
                },
              },
            },
          },
        })
      } else if (employee.employmentType?.vacationCalcGroupId) {
        // Resolve from employment type
        calcGroup = await ctx.prisma.vacationCalculationGroup.findFirst({
          where: {
            id: employee.employmentType.vacationCalcGroupId,
            tenantId,
          },
          include: {
            specialCalcLinks: {
              include: {
                specialCalculation: {
                  select: { type: true, threshold: true, bonusDays: true },
                },
              },
            },
          },
        })
      }

      // Resolve tariff for base vacation days and standard weekly hours
      let baseVacationDays = decimalToNumber(employee.vacationDaysPerYear)
      let standardWeeklyHours = 40 // Default
      const weeklyHours = decimalToNumber(employee.weeklyHours)

      if (employee.tariffId) {
        const tariff = await ctx.prisma.tariff.findFirst({
          where: { id: employee.tariffId, tenantId },
        })
        if (tariff) {
          if (tariff.annualVacationDays) {
            baseVacationDays = decimalToNumber(tariff.annualVacationDays)
          }
          if (tariff.weeklyTargetHours) {
            standardWeeklyHours = decimalToNumber(tariff.weeklyTargetHours)
          }
        }
      }

      // Build special calcs list
      const specialCalcs: VacationSpecialCalc[] =
        calcGroup?.specialCalcLinks.map((link) => ({
          type: link.specialCalculation.type as VacationSpecialCalc["type"],
          threshold: link.specialCalculation.threshold,
          bonusDays: decimalToNumber(link.specialCalculation.bonusDays),
        })) ?? []

      // Determine basis
      const basis: VacationBasis =
        (calcGroup?.basis as VacationBasis) ?? "calendar_year"

      // Build reference date (Jan 1 of the target year for calendar_year basis,
      // or entry date anniversary for entry_date basis)
      const referenceDate =
        basis === "calendar_year"
          ? new Date(Date.UTC(input.year, 0, 1))
          : new Date(
              Date.UTC(
                input.year,
                employee.entryDate.getMonth(),
                employee.entryDate.getDate()
              )
            )

      // Build calculation input
      const calcInput: VacationCalcInput = {
        birthDate: employee.birthDate ?? new Date(Date.UTC(1990, 0, 1)),
        entryDate: employee.entryDate,
        exitDate: employee.exitDate,
        weeklyHours,
        hasDisability: employee.disabilityFlag,
        baseVacationDays,
        standardWeeklyHours,
        basis,
        specialCalcs,
        year: input.year,
        referenceDate,
      }

      // Run calculation
      const result = calculateVacation(calcInput)

      // Compute part-time factor
      const partTimeFactor =
        standardWeeklyHours > 0 ? weeklyHours / standardWeeklyHours : 1

      return {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        year: input.year,
        basis,
        calcGroupId: calcGroup?.id ?? null,
        calcGroupName: calcGroup?.name ?? null,
        weeklyHours,
        standardWeeklyHours,
        partTimeFactor,
        baseEntitlement: result.baseEntitlement,
        proRatedEntitlement: result.proRatedEntitlement,
        partTimeAdjustment: result.partTimeAdjustment,
        ageBonus: result.ageBonus,
        tenureBonus: result.tenureBonus,
        disabilityBonus: result.disabilityBonus,
        totalEntitlement: result.totalEntitlement,
        monthsEmployed: result.monthsEmployed,
        ageAtReference: result.ageAtReference,
        tenureYears: result.tenureYears,
      }
    }),

  /**
   * vacation.carryoverPreview -- Computes vacation carryover preview.
   *
   * Loads employee tariff, capping rule group, vacation balance, and exceptions.
   * Runs the carryover calculation engine.
   *
   * Requires: vacation_config.manage permission
   */
  carryoverPreview: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        year: z.number().int(),
      })
    )
    .output(carryoverPreviewOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Load employee
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      // Get tariff
      if (!employee.tariffId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Employee has no tariff assigned",
        })
      }

      const tariff = await ctx.prisma.tariff.findFirst({
        where: { id: employee.tariffId, tenantId },
      })
      if (!tariff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tariff not found",
        })
      }

      // Get capping rule group
      if (!tariff.vacationCappingRuleGroupId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tariff has no capping rule group assigned",
        })
      }

      const cappingGroup =
        await ctx.prisma.vacationCappingRuleGroup.findFirst({
          where: { id: tariff.vacationCappingRuleGroupId, tenantId },
          include: {
            cappingRuleLinks: {
              include: {
                cappingRule: true,
              },
            },
          },
        })
      if (!cappingGroup) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Capping rule group not found",
        })
      }

      // Get vacation balance
      const balance = await ctx.prisma.vacationBalance.findFirst({
        where: { employeeId: input.employeeId, year: input.year },
      })

      // Calculate available days
      let availableDays = 0
      if (balance) {
        availableDays =
          decimalToNumber(balance.entitlement) +
          decimalToNumber(balance.carryover) +
          decimalToNumber(balance.adjustments) -
          decimalToNumber(balance.taken)
        availableDays = Math.max(0, availableDays)
      }

      // Load employee exceptions
      const exceptions =
        await ctx.prisma.employeeCappingException.findMany({
          where: {
            employeeId: input.employeeId,
            isActive: true,
            OR: [{ year: input.year }, { year: null }],
          },
        })

      // Build capping rules input
      const cappingRules: CappingRuleInput[] =
        cappingGroup.cappingRuleLinks.map((link) => ({
          ruleId: link.cappingRule.id,
          ruleName: link.cappingRule.name,
          ruleType: link.cappingRule.ruleType as "year_end" | "mid_year",
          cutoffMonth: link.cappingRule.cutoffMonth,
          cutoffDay: link.cappingRule.cutoffDay,
          capValue: decimalToNumber(link.cappingRule.capValue),
        }))

      // Build exceptions input
      const exceptionsInput: CappingExceptionInput[] = exceptions.map(
        (exc) => ({
          cappingRuleId: exc.cappingRuleId,
          exemptionType: exc.exemptionType as "full" | "partial",
          retainDays: exc.retainDays ? Number(exc.retainDays) : null,
        })
      )

      // Build carryover input
      const carryoverInput: CarryoverInput = {
        availableDays,
        year: input.year,
        referenceDate: new Date(), // Use current date for mid-year rule evaluation
        cappingRules,
        exceptions: exceptionsInput,
      }

      // Run calculation
      const result = calculateCarryoverWithCapping(carryoverInput)

      return {
        employeeId: employee.id,
        year: input.year,
        availableDays: result.availableDays,
        cappedCarryover: result.cappedCarryover,
        forfeitedDays: result.forfeitedDays,
        hasException: result.hasException,
        rulesApplied: result.rulesApplied,
      }
    }),
})
