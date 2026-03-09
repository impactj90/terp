/**
 * Vacation Router
 *
 * Provides vacation entitlement/carryover preview endpoints and business logic
 * mutations (initializeYear, getBalance, adjustBalance, carryoverFromPreviousYear,
 * initializeBatch) via tRPC procedures.
 *
 * Replaces the Go backend endpoints:
 * - POST /vacation-entitlement/preview -> vacation.entitlementPreview
 * - POST /vacation-carryover/preview -> vacation.carryoverPreview
 * - GET  /vacation-balances/employee/:id -> vacation.getBalance
 * - POST /vacation-balances/initialize-year -> vacation.initializeYear
 * - POST /vacation-balances/adjust -> vacation.adjustBalance
 * - POST /vacation-balances/carryover -> vacation.carryoverFromPreviousYear
 * - POST /vacation-balances/initialize -> vacation.initializeBatch
 *
 * @see apps/api/internal/service/vacation.go
 * @see apps/api/internal/service/vacationcarryover.go
 */
import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { calculateVacation } from "../lib/vacation-calculation"
import {
  calculateCarryoverWithCapping,
  calculateCarryover,
  type CarryoverInput,
  type CappingRuleInput,
  type CappingExceptionInput,
} from "../lib/carryover-calculation"
import {
  resolveTariff,
  resolveCalcGroup,
  resolveVacationBasis,
  buildCalcInput,
  calculateAvailable,
  type ResolvedCalcGroup,
} from "../lib/vacation-helpers"
import {
  vacationBalanceOutputSchema,
  decimalToNumber,
  mapBalanceToOutput,
  employeeSelect,
} from "../lib/vacation-balance-output"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!
const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!

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

/**
 * Calculates capped carryover using tariff capping rules (advanced) or simple cap (fallback).
 * Port of Go VacationService.calculateCappedCarryover() (vacation.go lines 521-576)
 */
async function calculateCappedCarryover(
  prisma: PrismaClient,
  tenantId: string,
  employee: { id: string; tariffId: string | null },
  prevYear: number,
  available: number,
  defaultMaxCarryover: number = 0
): Promise<number> {
  // Resolve tariff for previous year
  const tariff = await resolveTariff(prisma, employee, prevYear, tenantId)

  // If tariff has capping rule group, use advanced capping
  if (tariff?.vacationCappingRuleGroupId) {
    const cappingGroup = await prisma.vacationCappingRuleGroup.findFirst({
      where: { id: tariff.vacationCappingRuleGroupId, tenantId },
      include: {
        cappingRuleLinks: {
          include: { cappingRule: true },
        },
      },
    })

    if (cappingGroup) {
      // Build capping rules
      const cappingRules: CappingRuleInput[] =
        cappingGroup.cappingRuleLinks.map((link) => ({
          ruleId: link.cappingRule.id,
          ruleName: link.cappingRule.name,
          ruleType: link.cappingRule.ruleType as "year_end" | "mid_year",
          cutoffMonth: link.cappingRule.cutoffMonth,
          cutoffDay: link.cappingRule.cutoffDay,
          capValue: decimalToNumber(link.cappingRule.capValue),
        }))

      // Load employee exceptions
      const exceptions = await prisma.employeeCappingException.findMany({
        where: {
          employeeId: employee.id,
          isActive: true,
          OR: [{ year: prevYear }, { year: null }],
        },
      })

      const exceptionsInput: CappingExceptionInput[] = exceptions.map(
        (exc) => ({
          cappingRuleId: exc.cappingRuleId,
          exemptionType: exc.exemptionType as "full" | "partial",
          retainDays: exc.retainDays ? Number(exc.retainDays) : null,
        })
      )

      // Build carryover input
      const carryoverInput: CarryoverInput = {
        availableDays: available,
        year: prevYear,
        referenceDate: new Date(),
        cappingRules,
        exceptions: exceptionsInput,
      }

      const output = calculateCarryoverWithCapping(carryoverInput)
      return output.cappedCarryover
    }
  }

  // Fallback: simple carryover with defaultMaxCarryover
  return calculateCarryover(available, defaultMaxCarryover)
}

// --- Router ---

export const vacationRouter = createTRPCRouter({
  /**
   * vacation.entitlementPreview -- Computes vacation entitlement preview.
   *
   * Loads employee data, resolves calculation group (from override or employment type),
   * resolves tariff via tariff assignments, and runs the vacation calculation engine.
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
      let calcGroup: ResolvedCalcGroup | null = null

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
        }) as ResolvedCalcGroup | null
      } else {
        // Resolve from employment type
        calcGroup = await resolveCalcGroup(ctx.prisma, employee, tenantId)
      }

      // Resolve tariff via tariff assignments (enhanced resolution)
      const tariff = await resolveTariff(
        ctx.prisma,
        employee,
        input.year,
        tenantId
      )

      // Resolve vacation basis via resolution chain
      const basis = await resolveVacationBasis(
        ctx.prisma,
        employee,
        tariff,
        calcGroup,
        tenantId
      )

      // Build calculation input using shared helper
      const { calcInput, weeklyHours, standardWeeklyHours } = buildCalcInput(
        employee,
        input.year,
        tariff,
        calcGroup,
        basis
      )

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

      // Get tariff (use tariff assignment resolution)
      const tariff = await resolveTariff(
        ctx.prisma,
        employee,
        input.year,
        tenantId
      )
      if (!tariff) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Employee has no tariff assigned",
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

  // =====================================================================
  // Business Logic Mutations
  // =====================================================================

  /**
   * vacation.getBalance -- Retrieves vacation balance for an employee/year.
   *
   * Port of Go VacationService.GetBalance() (vacation.go lines 168-183)
   * Requires: absences.manage permission
   */
  getBalance: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        year: z.number().int().min(1900).max(2200),
      })
    )
    .output(vacationBalanceOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const balance = await ctx.prisma.vacationBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          tenantId,
        },
        include: { employee: { select: employeeSelect } },
      })

      if (!balance) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation balance not found",
        })
      }

      return mapBalanceToOutput(balance)
    }),

  /**
   * vacation.initializeYear -- Calculates and stores vacation entitlement for a year.
   *
   * Uses employee's employment type, tariff, and calc group to compute entitlement.
   * Idempotent: calling multiple times recalculates entitlement but preserves
   * carryover, adjustments, and taken.
   *
   * Port of Go VacationService.InitializeYear() (vacation.go lines 189-234)
   * Requires: absences.manage permission
   */
  initializeYear: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        year: z.number().int().min(1900).max(2200),
      })
    )
    .output(vacationBalanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // 1. Get employee with employment type
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

      // 2. Resolve calculation group
      const calcGroup = await resolveCalcGroup(ctx.prisma, employee, tenantId)

      // 3. Resolve tariff
      const tariff = await resolveTariff(
        ctx.prisma,
        employee,
        input.year,
        tenantId
      )

      // 4. Resolve vacation basis
      const basis = await resolveVacationBasis(
        ctx.prisma,
        employee,
        tariff,
        calcGroup,
        tenantId
      )

      // 5. Build calculation input
      const { calcInput } = buildCalcInput(
        employee,
        input.year,
        tariff,
        calcGroup,
        basis
      )

      // 6. Calculate entitlement
      const result = calculateVacation(calcInput)

      // 7-8. Upsert balance with new entitlement (preserves carryover/adjustments/taken)
      const balance = await ctx.prisma.vacationBalance.upsert({
        where: {
          employeeId_year: {
            employeeId: input.employeeId,
            year: input.year,
          },
        },
        update: {
          entitlement: result.totalEntitlement,
        },
        create: {
          tenantId,
          employeeId: input.employeeId,
          year: input.year,
          entitlement: result.totalEntitlement,
          carryover: 0,
          adjustments: 0,
          taken: 0,
        },
        include: { employee: { select: employeeSelect } },
      })

      return mapBalanceToOutput(balance)
    }),

  /**
   * vacation.adjustBalance -- Adds a manual adjustment to the vacation balance.
   *
   * The adjustment is accumulated (added to existing adjustments), not replaced.
   * A positive value adds days; a negative value deducts days.
   *
   * Port of Go VacationService.AdjustBalance() (vacation.go lines 498-517)
   * Requires: absences.manage permission
   */
  adjustBalance: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        year: z.number().int().min(1900).max(2200),
        adjustment: z.number(),
        notes: z.string().optional(),
      })
    )
    .output(vacationBalanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // 1. Get existing balance (must exist)
      const existing = await ctx.prisma.vacationBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          tenantId,
        },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation balance not found",
        })
      }

      // 2-3. Accumulate adjustment
      const balance = await ctx.prisma.vacationBalance.update({
        where: {
          employeeId_year: {
            employeeId: input.employeeId,
            year: input.year,
          },
        },
        data: {
          adjustments: {
            increment: input.adjustment,
          },
        },
        include: { employee: { select: employeeSelect } },
      })

      return mapBalanceToOutput(balance)
    }),

  /**
   * vacation.carryoverFromPreviousYear -- Carries over remaining vacation
   * from the previous year.
   *
   * The year parameter is the TARGET year (receiving the carryover).
   * Respects tariff capping rules when available, falling back to simple cap.
   *
   * Port of Go VacationService.CarryoverFromPreviousYear() (vacation.go lines 581-627)
   * Requires: absences.manage permission
   */
  carryoverFromPreviousYear: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        year: z.number().int().min(1901).max(2200),
      })
    )
    .output(vacationBalanceOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const prevYear = input.year - 1

      // 1. Get employee
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      // 2. Get previous year's balance
      const prevBalance = await ctx.prisma.vacationBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          year: prevYear,
          tenantId,
        },
      })
      if (!prevBalance) {
        // No previous year balance - nothing to carry over
        return null
      }

      // 3. Calculate available
      const available = calculateAvailable(prevBalance)

      // 4. Calculate capped carryover
      const carryover = await calculateCappedCarryover(
        ctx.prisma as PrismaClient,
        tenantId,
        employee,
        prevYear,
        available
      )

      // 5. If carryover is 0, return null
      if (carryover <= 0) {
        return null
      }

      // 6. Upsert current year balance with carryover (replaces, not accumulates)
      const balance = await ctx.prisma.vacationBalance.upsert({
        where: {
          employeeId_year: {
            employeeId: input.employeeId,
            year: input.year,
          },
        },
        update: {
          carryover,
        },
        create: {
          tenantId,
          employeeId: input.employeeId,
          year: input.year,
          entitlement: 0,
          carryover,
          adjustments: 0,
          taken: 0,
        },
        include: { employee: { select: employeeSelect } },
      })

      return mapBalanceToOutput(balance)
    }),

  /**
   * vacation.initializeBatch -- Initializes vacation balances for all active
   * employees for a given year.
   *
   * Optionally carries over from the previous year before initializing.
   *
   * Port of Go VacationBalanceHandler.Initialize() (handler lines 217-268)
   * Requires: absences.manage permission
   */
  initializeBatch: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        year: z.number().int().min(1900).max(2200),
        carryover: z.boolean().default(true),
      })
    )
    .output(
      z.object({
        message: z.string(),
        createdCount: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // 1. Get all active employees for tenant
      const employees = await ctx.prisma.employee.findMany({
        where: { tenantId, isActive: true },
        include: { employmentType: true },
      })

      let createdCount = 0

      // 2. For each employee
      for (const employee of employees) {
        try {
          // a. If carryover requested, carry over from previous year (best effort)
          if (input.carryover && input.year >= 1901) {
            try {
              const prevBalance =
                await ctx.prisma.vacationBalance.findFirst({
                  where: {
                    employeeId: employee.id,
                    year: input.year - 1,
                    tenantId,
                  },
                })
              if (prevBalance) {
                const available = calculateAvailable(prevBalance)
                const carryoverAmount = await calculateCappedCarryover(
                  ctx.prisma as PrismaClient,
                  tenantId,
                  employee,
                  input.year - 1,
                  available
                )
                if (carryoverAmount > 0) {
                  await ctx.prisma.vacationBalance.upsert({
                    where: {
                      employeeId_year: {
                        employeeId: employee.id,
                        year: input.year,
                      },
                    },
                    update: { carryover: carryoverAmount },
                    create: {
                      tenantId,
                      employeeId: employee.id,
                      year: input.year,
                      entitlement: 0,
                      carryover: carryoverAmount,
                      adjustments: 0,
                      taken: 0,
                    },
                  })
                }
              }
            } catch {
              // Best effort: skip carryover errors for individual employees
            }
          }

          // b. Initialize year (calculate entitlement)
          const calcGroup = await resolveCalcGroup(
            ctx.prisma,
            employee,
            tenantId
          )
          const tariff = await resolveTariff(
            ctx.prisma,
            employee,
            input.year,
            tenantId
          )
          const basis = await resolveVacationBasis(
            ctx.prisma,
            employee,
            tariff,
            calcGroup,
            tenantId
          )
          const { calcInput } = buildCalcInput(
            employee,
            input.year,
            tariff,
            calcGroup,
            basis
          )
          const result = calculateVacation(calcInput)

          await ctx.prisma.vacationBalance.upsert({
            where: {
              employeeId_year: {
                employeeId: employee.id,
                year: input.year,
              },
            },
            update: { entitlement: result.totalEntitlement },
            create: {
              tenantId,
              employeeId: employee.id,
              year: input.year,
              entitlement: result.totalEntitlement,
              carryover: 0,
              adjustments: 0,
              taken: 0,
            },
          })

          createdCount++
        } catch {
          // Skip employees with errors, continue with next
        }
      }

      return {
        message: `Initialized vacation balances for ${createdCount} of ${employees.length} employees`,
        createdCount,
      }
    }),
})
