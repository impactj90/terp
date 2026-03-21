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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, requireEmployeePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import { vacationBalanceOutputSchema } from "@/lib/services/vacation-balance-output"
import * as vacationService from "@/lib/services/vacation-service"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!
const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!
const ABSENCES_REQUEST = permissionIdByKey("absences.request")!

// --- Output Schemas ---

const entitlementPreviewOutputSchema = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  year: z.number(),
  basis: z.string(),
  calcGroupId: z.string().nullable(),
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
  employeeId: z.string(),
  year: z.number(),
  availableDays: z.number(),
  cappedCarryover: z.number(),
  forfeitedDays: z.number(),
  hasException: z.boolean(),
  rulesApplied: z.array(
    z.object({
      ruleId: z.string(),
      ruleName: z.string(),
      ruleType: z.string(),
      capValue: z.number(),
      applied: z.boolean(),
      exceptionActive: z.boolean(),
    })
  ),
})

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
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        year: z.number().int().min(1900).max(2200),
        calcGroupId: z.string().optional(),
      })
    )
    .output(entitlementPreviewOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "VacationEntitlement")
        }
        return await vacationService.entitlementPreview(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
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
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        year: z.number().int().min(1900).max(2200),
      })
    )
    .output(carryoverPreviewOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "VacationCarryover")
        }
        return await vacationService.carryoverPreview(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
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
    .use(requireEmployeePermission(
      (input) => (input as { employeeId: string }).employeeId,
      ABSENCES_REQUEST,
      ABSENCES_MANAGE
    ))
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        year: z.number().int().min(1900).max(2200),
      })
    )
    .output(vacationBalanceOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "VacationBalance")
        }
        return await vacationService.getBalance(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        year: z.number().int().min(1900).max(2200),
      })
    )
    .output(vacationBalanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "VacationBalance")
        }
        return await vacationService.initializeYear(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        year: z.number().int().min(1900).max(2200),
        adjustment: z.number().min(-365).max(365),
        notes: z.string().optional(),
      })
    )
    .output(vacationBalanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "VacationBalance")
        }
        return await vacationService.adjustBalance(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        year: z.number().int().min(1901).max(2200),
      })
    )
    .output(vacationBalanceOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "VacationBalance")
        }
        return await vacationService.carryoverFromPreviousYear(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
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
      try {
        return await vacationService.initializeBatch(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
