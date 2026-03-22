/**
 * MonthlyCalcService
 *
 * Orchestrates monthly time calculations for employees.
 * Aggregates DailyValues into MonthlyValues, applies flextime credit rules,
 * and manages month closing/reopening.
 *
 * Ported from Go:
 * - apps/api/internal/service/monthlycalc.go (203 lines) -- batch orchestration
 * - apps/api/internal/service/monthlyeval.go (502 lines) -- evaluation logic
 * - apps/api/internal/repository/monthlyvalue.go (242 lines) -- data access (inlined)
 *
 * Dependencies:
 * - ZMI-TICKET-237: Prisma models (AbsenceDay)
 * - ZMI-TICKET-233: Calculation Engine (monthly.ts)
 */

import type {
  PrismaClient,
  Employee,
  MonthlyValue,
  DailyValue,
  Tariff,
} from "@/generated/prisma/client"
import { mapWithConcurrency } from "@/lib/async"
import { Decimal } from "@prisma/client/runtime/client"
import { calculateMonth } from "@/lib/calculation/monthly"
import type {
  MonthlyCalcInput,
  MonthlyEvaluationInput,
  AbsenceSummaryInput,
  DailyValueInput,
  CreditType,
} from "@/lib/calculation/monthly"
import type {
  MonthlyCalcResult,
  MonthSummary,
  AbsenceDayWithType,
} from "./monthly-calc.types"
import {
  ABSENCE_CATEGORY_VACATION,
  ABSENCE_CATEGORY_ILLNESS,
  ABSENCE_STATUS_APPROVED,
  ERR_FUTURE_MONTH,
  ERR_MONTH_CLOSED,
  ERR_MONTH_NOT_CLOSED,
  ERR_INVALID_MONTH,
  ERR_INVALID_YEAR_MONTH,
  ERR_MONTHLY_VALUE_NOT_FOUND,
  ERR_EMPLOYEE_NOT_FOUND,
} from "./monthly-calc.types"

export class MonthlyCalcService {
  constructor(private prisma: PrismaClient, private tenantId?: string) {}

  // =========================================================================
  // Public Methods -- Orchestration (from monthlycalc.go)
  // =========================================================================

  /**
   * Calculates monthly values for a single employee and month.
   * Returns the persisted MonthlyValue.
   * Throws ERR_FUTURE_MONTH, ERR_MONTH_CLOSED, or propagated errors.
   */
  async calculateMonth(
    employeeId: string,
    year: number,
    month: number,
  ): Promise<MonthlyValue> {
    // Validate not future month
    const now = new Date()
    if (
      year > now.getFullYear() ||
      (year === now.getFullYear() && month > now.getMonth() + 1)
    ) {
      throw new Error(ERR_FUTURE_MONTH)
    }

    // Delegate to recalculateMonth for actual calculation
    await this.recalculateMonth(employeeId, year, month)

    // Retrieve the persisted value
    const mv = await this.getByEmployeeMonth(employeeId, year, month)
    if (mv === null) {
      throw new Error(ERR_MONTHLY_VALUE_NOT_FOUND)
    }

    return mv
  }

  /**
   * Calculates monthly values for multiple employees for the same month.
   * Continues processing on individual errors and aggregates results.
   */
  async calculateMonthBatch(
    employeeIds: string[],
    year: number,
    month: number,
  ): Promise<MonthlyCalcResult> {
    const result: MonthlyCalcResult = {
      processedMonths: 0,
      skippedMonths: 0,
      failedMonths: 0,
      errors: [],
    }

    // Validate not future month
    const now = new Date()
    if (
      year > now.getFullYear() ||
      (year === now.getFullYear() && month > now.getMonth() + 1)
    ) {
      // All employees fail with same error
      for (const empId of employeeIds) {
        result.failedMonths++
        result.errors.push({
          employeeId: empId,
          year,
          month,
          error: ERR_FUTURE_MONTH,
        })
      }
      return result
    }

    // Pre-fetch all employees to avoid N individual findFirst calls
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        ...(this.tenantId ? { tenantId: this.tenantId } : {}),
      },
    })
    const employeeMap = new Map(employees.map((e) => [e.id, e]))

    await mapWithConcurrency(employeeIds, 5, async (empId) => {
      try {
        const employee = employeeMap.get(empId) ?? null
        await this.recalculateMonth(empId, year, month, employee)
        result.processedMonths++
      } catch (err) {
        if (err instanceof Error && err.message === ERR_MONTH_CLOSED) {
          result.skippedMonths++
        } else {
          result.failedMonths++
          result.errors.push({
            employeeId: empId,
            year,
            month,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })

    return result
  }

  /**
   * Cascading recalculation from start month through current month.
   * Skips closed months, continues on errors.
   */
  async recalculateFromMonth(
    employeeId: string,
    startYear: number,
    startMonth: number,
  ): Promise<MonthlyCalcResult> {
    const result: MonthlyCalcResult = {
      processedMonths: 0,
      skippedMonths: 0,
      failedMonths: 0,
      errors: [],
    }

    let currentYear = startYear
    let currentMonth = startMonth
    const now = new Date()

    for (;;) {
      // Stop if we've passed the current month
      if (
        currentYear > now.getFullYear() ||
        (currentYear === now.getFullYear() &&
          currentMonth > now.getMonth() + 1)
      ) {
        break
      }

      try {
        await this.recalculateMonth(employeeId, currentYear, currentMonth)
        result.processedMonths++
      } catch (err) {
        if (err instanceof Error && err.message === ERR_MONTH_CLOSED) {
          // Skip closed months and continue cascade
          result.skippedMonths++
        } else {
          result.failedMonths++
          result.errors.push({
            employeeId,
            year: currentYear,
            month: currentMonth,
            error: err instanceof Error ? err.message : String(err),
          })
          // Continue cascade even on failure
        }
      }

      // Move to next month
      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }

    return result
  }

  /**
   * Cascading recalculation from start month for multiple employees.
   * Aggregates results.
   */
  async recalculateFromMonthBatch(
    employeeIds: string[],
    startYear: number,
    startMonth: number,
  ): Promise<MonthlyCalcResult> {
    const result: MonthlyCalcResult = {
      processedMonths: 0,
      skippedMonths: 0,
      failedMonths: 0,
      errors: [],
    }

    await mapWithConcurrency(employeeIds, 5, async (empId) => {
      const empResult = await this.recalculateFromMonth(
        empId,
        startYear,
        startMonth,
      )
      result.processedMonths += empResult.processedMonths
      result.skippedMonths += empResult.skippedMonths
      result.failedMonths += empResult.failedMonths
      result.errors.push(...empResult.errors)
    })

    return result
  }

  // =========================================================================
  // Public Methods -- Evaluation (from monthlyeval.go)
  // =========================================================================

  /**
   * Retrieves the monthly summary for an employee.
   * If no persisted monthly value exists, calculates one on-the-fly.
   */
  async getMonthSummary(
    employeeId: string,
    year: number,
    month: number,
  ): Promise<MonthSummary> {
    this.validateYearMonth(year, month)

    const mv = await this.getByEmployeeMonth(employeeId, year, month)
    if (mv !== null) {
      return this.monthlyValueToSummary(mv)
    }

    // No persisted record -- calculate on-the-fly from daily values
    return this.calculateMonthSummary(employeeId, year, month)
  }

  /**
   * Recalculates monthly aggregation from daily values and persists the result.
   * Throws ERR_MONTH_CLOSED if the month is already closed.
   */
  async recalculateMonth(
    employeeId: string,
    year: number,
    month: number,
    prefetchedEmployee?: Employee | null,
  ): Promise<void> {
    this.validateYearMonth(year, month)

    // Use pre-fetched employee if provided (batch path), otherwise fetch individually
    const employee = prefetchedEmployee !== undefined
      ? prefetchedEmployee
      : await this.prisma.employee.findFirst({
          where: { id: employeeId, ...(this.tenantId ? { tenantId: this.tenantId } : {}) },
        })
    if (employee === null) {
      throw new Error(ERR_EMPLOYEE_NOT_FOUND)
    }

    // Get date range for the month
    const { from, to } = this.monthDateRange(year, month)

    // Get previous month for flextime carryover
    const prevMonth = await this.getPreviousMonth(employeeId, year, month)
    const previousCarryover = prevMonth !== null ? prevMonth.flextimeEnd : 0

    // Fetch daily values, absences, and tariff in parallel
    const tariffPromise = employee.tariffId !== null
      ? this.prisma.tariff.findUnique({ where: { id: employee.tariffId } }).catch(() => null)
      : Promise.resolve(null)

    const [dailyValues, absences, tariff] = await Promise.all([
      this.prisma.dailyValue.findMany({
        where: {
          employeeId,
          valueDate: { gte: from, lte: to },
        },
      }),
      this.prisma.absenceDay.findMany({
        where: {
          employeeId,
          absenceDate: { gte: from, lte: to },
        },
        include: { absenceType: true },
      }),
      tariffPromise,
    ])

    // Build calculation input
    const calcInput = this.buildMonthlyCalcInput(
      dailyValues,
      absences,
      previousCarryover,
      tariff,
    )

    // Run calculation
    const calcOutput = calculateMonth(calcInput)

    // Build monthly value data
    const monthlyData = this.buildMonthlyValue(calcOutput)

    // Atomic upsert: try to update only if not closed, then fall back to create
    const updateResult = await this.prisma.monthlyValue.updateMany({
      where: {
        employeeId,
        year,
        month,
        isClosed: false,
      },
      data: {
        ...monthlyData,
        // Does NOT update: isClosed, closedAt, closedBy, reopenedAt, reopenedBy
      },
    })

    if (updateResult.count === 0) {
      // Either record doesn't exist or it's closed -- check which
      const existing = await this.getByEmployeeMonth(employeeId, year, month)
      if (existing !== null && existing.isClosed) {
        throw new Error(ERR_MONTH_CLOSED)
      }
      // Record doesn't exist -- create it
      await this.prisma.monthlyValue.create({
        data: {
          tenantId: employee.tenantId,
          employeeId,
          year,
          month,
          ...monthlyData,
        },
      })
    }
  }

  /**
   * Closes a month, preventing further modifications.
   * Uses atomic updateMany with isClosed condition to avoid race conditions.
   */
  async closeMonth(
    employeeId: string,
    year: number,
    month: number,
    closedBy: string,
  ): Promise<void> {
    this.validateYearMonth(year, month)

    const result = await this.prisma.monthlyValue.updateMany({
      where: { employeeId, year, month, isClosed: false },
      data: {
        isClosed: true,
        closedAt: new Date(),
        closedBy,
      },
    })

    if (result.count === 0) {
      // Either doesn't exist or already closed -- check which
      const existing = await this.getByEmployeeMonth(employeeId, year, month)
      if (existing === null) {
        throw new Error(ERR_MONTHLY_VALUE_NOT_FOUND)
      }
      if (existing.isClosed) {
        throw new Error(ERR_MONTH_CLOSED)
      }
    }
  }

  /**
   * Reopens a closed month, allowing modifications.
   * Uses atomic updateMany with isClosed condition to avoid race conditions.
   */
  async reopenMonth(
    employeeId: string,
    year: number,
    month: number,
    reopenedBy: string,
  ): Promise<void> {
    this.validateYearMonth(year, month)

    const result = await this.prisma.monthlyValue.updateMany({
      where: { employeeId, year, month, isClosed: true },
      data: {
        isClosed: false,
        reopenedAt: new Date(),
        reopenedBy,
      },
    })

    if (result.count === 0) {
      // Either doesn't exist or not closed -- check which
      const existing = await this.getByEmployeeMonth(employeeId, year, month)
      if (existing === null) {
        throw new Error(ERR_MONTHLY_VALUE_NOT_FOUND)
      }
      if (!existing.isClosed) {
        throw new Error(ERR_MONTH_NOT_CLOSED)
      }
    }
  }

  /**
   * Retrieves all monthly summaries for an employee in a year.
   */
  async getYearOverview(
    employeeId: string,
    year: number,
  ): Promise<MonthSummary[]> {
    if (year < 1900 || year > 2200) {
      throw new Error(ERR_INVALID_YEAR_MONTH)
    }

    const values = await this.prisma.monthlyValue.findMany({
      where: { employeeId, year },
      orderBy: { month: "asc" },
    })

    return values.map((mv) => this.monthlyValueToSummary(mv))
  }

  /**
   * Retrieves daily values for a specific month.
   */
  async getDailyBreakdown(
    employeeId: string,
    year: number,
    month: number,
  ): Promise<DailyValue[]> {
    this.validateYearMonth(year, month)

    const { from, to } = this.monthDateRange(year, month)
    return this.prisma.dailyValue.findMany({
      where: {
        employeeId,
        valueDate: { gte: from, lte: to },
      },
    })
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Validates year and month parameters.
   */
  private validateYearMonth(year: number, month: number): void {
    if (year < 1900 || year > 2200) {
      throw new Error(ERR_INVALID_YEAR_MONTH)
    }
    if (month < 1 || month > 12) {
      throw new Error(ERR_INVALID_MONTH)
    }
  }

  /**
   * Returns the first and last day of a month as UTC Dates.
   */
  private monthDateRange(
    year: number,
    month: number,
  ): { from: Date; to: Date } {
    const from = new Date(Date.UTC(year, month - 1, 1))
    const to = new Date(Date.UTC(year, month, 0)) // Day 0 of next month = last day of current
    return { from, to }
  }

  /**
   * Looks up a MonthlyValue by employee, year, month.
   * Returns null if not found (NOT an error).
   */
  private async getByEmployeeMonth(
    employeeId: string,
    year: number,
    month: number,
  ): Promise<MonthlyValue | null> {
    return this.prisma.monthlyValue.findUnique({
      where: {
        employeeId_year_month: { employeeId, year, month },
      },
    })
  }

  /**
   * Gets the previous month's MonthlyValue (handles Jan -> Dec boundary).
   */
  private async getPreviousMonth(
    employeeId: string,
    year: number,
    month: number,
  ): Promise<MonthlyValue | null> {
    let prevYear = year
    let prevMonth = month - 1
    if (prevMonth < 1) {
      prevMonth = 12
      prevYear--
    }
    return this.getByEmployeeMonth(employeeId, prevYear, prevMonth)
  }

  /**
   * Calculates a MonthSummary on-the-fly without persisting.
   */
  private async calculateMonthSummary(
    employeeId: string,
    year: number,
    month: number,
  ): Promise<MonthSummary> {
    const { from, to } = this.monthDateRange(year, month)

    // Load employee first (needed for tariffId), then parallelize the rest
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, ...(this.tenantId ? { tenantId: this.tenantId } : {}) },
    })
    if (employee === null) {
      throw new Error(ERR_EMPLOYEE_NOT_FOUND)
    }

    // All remaining queries are independent — run in parallel
    const [prevMonth, dailyValues, absences, tariff] = await Promise.all([
      this.getPreviousMonth(employeeId, year, month),
      this.prisma.dailyValue.findMany({
        where: {
          employeeId,
          valueDate: { gte: from, lte: to },
        },
      }),
      this.prisma.absenceDay.findMany({
        where: {
          employeeId,
          absenceDate: { gte: from, lte: to },
        },
        include: { absenceType: true },
      }),
      employee.tariffId !== null
        ? this.prisma.tariff.findUnique({ where: { id: employee.tariffId } }).catch(() => null)
        : Promise.resolve(null),
    ])
    const previousCarryover = prevMonth !== null ? prevMonth.flextimeEnd : 0

    // Build and run calculation
    const calcInput = this.buildMonthlyCalcInput(
      dailyValues,
      absences,
      previousCarryover,
      tariff,
    )
    const calcOutput = calculateMonth(calcInput)

    // Build MonthSummary from output
    return {
      employeeId,
      year,
      month,
      totalGrossTime: calcOutput.totalGrossTime,
      totalNetTime: calcOutput.totalNetTime,
      totalTargetTime: calcOutput.totalTargetTime,
      totalOvertime: calcOutput.totalOvertime,
      totalUndertime: calcOutput.totalUndertime,
      totalBreakTime: calcOutput.totalBreakTime,
      flextimeStart: calcOutput.flextimeStart,
      flextimeChange: calcOutput.flextimeChange,
      flextimeEnd: calcOutput.flextimeEnd,
      flextimeCarryover: calcOutput.flextimeEnd,
      vacationTaken: calcOutput.vacationTaken,
      sickDays: calcOutput.sickDays,
      otherAbsenceDays: calcOutput.otherAbsenceDays,
      workDays: calcOutput.workDays,
      daysWithErrors: calcOutput.daysWithErrors,
      isClosed: false,
      closedAt: null,
      closedBy: null,
      reopenedAt: null,
      reopenedBy: null,
      warnings: calcOutput.warnings,
    }
  }

  /**
   * Converts daily values and absences to calculation input.
   */
  private buildMonthlyCalcInput(
    dailyValues: DailyValue[],
    absences: AbsenceDayWithType[],
    previousCarryover: number,
    tariff: Tariff | null,
  ): MonthlyCalcInput {
    // Convert daily values
    const dvInputs: DailyValueInput[] = dailyValues.map((dv) => ({
      date: dv.valueDate.toISOString().split("T")[0]!,
      grossTime: dv.grossTime,
      netTime: dv.netTime,
      targetTime: dv.targetTime,
      overtime: dv.overtime,
      undertime: dv.undertime,
      breakTime: dv.breakTime,
      hasError: dv.hasError,
    }))

    // Build absence summary
    const absenceSummary = this.buildAbsenceSummary(absences)

    // Build evaluation rules from tariff
    const evaluationRules =
      tariff !== null ? this.buildEvaluationRules(tariff) : null

    return {
      dailyValues: dvInputs,
      previousCarryover,
      evaluationRules,
      absenceSummary,
    }
  }

  /**
   * Aggregates absences by category.
   */
  private buildAbsenceSummary(
    absences: AbsenceDayWithType[],
  ): AbsenceSummaryInput {
    let vacationDays = new Decimal(0)
    let sickDays = 0
    let otherAbsenceDays = 0

    for (const ad of absences) {
      // Only count approved absences
      if (ad.status !== ABSENCE_STATUS_APPROVED) {
        continue
      }

      // Get category from preloaded AbsenceType
      if (ad.absenceType === null || ad.absenceType === undefined) {
        continue
      }

      switch (ad.absenceType.category) {
        case ABSENCE_CATEGORY_VACATION:
          vacationDays = vacationDays.add(ad.duration)
          break
        case ABSENCE_CATEGORY_ILLNESS:
          // Count illness days (duration can be 1 or 0.5)
          sickDays += new Decimal(ad.duration).ceil().toNumber()
          break
        default:
          otherAbsenceDays++
          break
      }
    }

    return { vacationDays, sickDays, otherAbsenceDays }
  }

  /**
   * Converts tariff fields to calculation evaluation input.
   * Returns null if the tariff uses no_evaluation (direct 1:1 transfer).
   */
  private buildEvaluationRules(
    tariff: Tariff,
  ): MonthlyEvaluationInput | null {
    const creditType = (tariff.creditType || "no_evaluation") as CreditType

    // no_evaluation = direct transfer, same as null rules
    if (creditType === "no_evaluation") {
      return null
    }

    return {
      creditType,
      flextimeThreshold: tariff.flextimeThreshold ?? null,
      maxFlextimePerMonth: tariff.maxFlextimePerMonth ?? null,
      flextimeCapPositive: tariff.upperLimitAnnual ?? null,
      flextimeCapNegative: tariff.lowerLimitAnnual ?? null,
      annualFloorBalance: null, // Not used in monthly calc, only in annual carryover
    }
  }

  /**
   * Maps calculation output to Prisma create/update data.
   */
  private buildMonthlyValue(output: {
    totalGrossTime: number
    totalNetTime: number
    totalTargetTime: number
    totalOvertime: number
    totalUndertime: number
    totalBreakTime: number
    flextimeStart: number
    flextimeChange: number
    flextimeEnd: number
    vacationTaken: Decimal
    sickDays: number
    otherAbsenceDays: number
    workDays: number
    daysWithErrors: number
  }) {
    return {
      totalGrossTime: output.totalGrossTime,
      totalNetTime: output.totalNetTime,
      totalTargetTime: output.totalTargetTime,
      totalOvertime: output.totalOvertime,
      totalUndertime: output.totalUndertime,
      totalBreakTime: output.totalBreakTime,
      flextimeStart: output.flextimeStart,
      flextimeChange: output.flextimeChange,
      flextimeEnd: output.flextimeEnd,
      flextimeCarryover: output.flextimeEnd, // Carryover for next month = this month's end balance
      vacationTaken: output.vacationTaken,
      sickDays: output.sickDays,
      otherAbsenceDays: output.otherAbsenceDays,
      workDays: output.workDays,
      daysWithErrors: output.daysWithErrors,
    }
  }

  /**
   * Converts a Prisma MonthlyValue to MonthSummary.
   */
  private monthlyValueToSummary(mv: MonthlyValue): MonthSummary {
    return {
      employeeId: mv.employeeId,
      year: mv.year,
      month: mv.month,
      totalGrossTime: mv.totalGrossTime,
      totalNetTime: mv.totalNetTime,
      totalTargetTime: mv.totalTargetTime,
      totalOvertime: mv.totalOvertime,
      totalUndertime: mv.totalUndertime,
      totalBreakTime: mv.totalBreakTime,
      flextimeStart: mv.flextimeStart,
      flextimeChange: mv.flextimeChange,
      flextimeEnd: mv.flextimeEnd,
      flextimeCarryover: mv.flextimeCarryover,
      vacationTaken: mv.vacationTaken,
      sickDays: mv.sickDays,
      otherAbsenceDays: mv.otherAbsenceDays,
      workDays: mv.workDays,
      daysWithErrors: mv.daysWithErrors,
      isClosed: mv.isClosed,
      closedAt: mv.closedAt,
      closedBy: mv.closedBy,
      reopenedAt: mv.reopenedAt,
      reopenedBy: mv.reopenedBy,
      warnings: [],
    }
  }
}
