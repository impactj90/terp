/**
 * RecalcService
 *
 * Orchestrates recalculation of daily and monthly values for employees.
 * Acts as a coordination layer between DailyCalcService and MonthlyCalcService.
 *
 * Ported from Go: apps/api/internal/service/recalc.go (146 lines)
 *
 * Dependencies:
 * - ZMI-TICKET-234: DailyCalcService (daily time calculations)
 * - ZMI-TICKET-238: MonthlyCalcService (monthly aggregations)
 */

import type { PrismaClient } from "@/generated/prisma/client"
import { mapWithConcurrency } from "@/lib/async"
import { DailyCalcService } from "./daily-calc"
import type { TenantCalcCache } from "./daily-calc.context"
import { loadTenantCalcCache } from "./daily-calc.context"
import { MonthlyCalcService } from "./monthly-calc"
import type { RecalcResult } from "./recalc.types"

export class RecalcService {
  private dailyCalcService: DailyCalcService
  private monthlyCalcService: MonthlyCalcService

  constructor(
    private prisma: PrismaClient,
    dailyCalcService?: DailyCalcService,
    monthlyCalcService?: MonthlyCalcService,
    tenantId?: string,
  ) {
    this.dailyCalcService = dailyCalcService ?? new DailyCalcService(prisma)
    this.monthlyCalcService =
      monthlyCalcService ?? new MonthlyCalcService(prisma, tenantId!)
  }

  /**
   * Recalculates a single day for one employee.
   * After daily calculation, also recalculates the affected month so that
   * monthly evaluation values (flextime balance, totals) stay in sync.
   */
  async triggerRecalc(
    tenantId: string,
    employeeId: string,
    date: Date,
  ): Promise<RecalcResult> {
    try {
      await this.dailyCalcService.calculateDay(tenantId, employeeId, date)
    } catch (err) {
      return {
        processedDays: 0,
        failedDays: 1,
        errors: [
          {
            employeeId,
            date,
            error: err instanceof Error ? err.message : String(err),
          },
        ],
      }
    }

    // Recalculate the affected month so monthly values reflect the daily change
    try {
      await this.monthlyCalcService.calculateMonth(
        employeeId,
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
      )
    } catch {
      // Monthly recalc is best-effort (matches Go: `_, _ = s.monthlyCalc.CalculateMonth(...)`)
    }

    return { processedDays: 1, failedDays: 0, errors: [] }
  }

  /**
   * Recalculates a date range for one employee.
   * Does NOT trigger monthly recalculation (matches Go behavior).
   */
  async triggerRecalcRange(
    tenantId: string,
    employeeId: string,
    from: Date,
    to: Date,
    tenantCache?: TenantCalcCache,
  ): Promise<RecalcResult> {
    try {
      const { count } = await this.dailyCalcService.calculateDateRange(
        tenantId,
        employeeId,
        from,
        to,
        tenantCache,
      )
      return { processedDays: count, failedDays: 0, errors: [] }
    } catch (err) {
      // Calculate total expected days for failure reporting
      const totalDays =
        Math.floor(
          (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
        ) + 1

      return {
        processedDays: 0,
        failedDays: totalDays,
        errors: [
          {
            employeeId,
            date: from,
            error: err instanceof Error ? err.message : String(err),
          },
        ],
      }
    }
  }

  /**
   * Recalculates a date range for multiple employees.
   * Continues processing on individual errors.
   */
  async triggerRecalcBatch(
    tenantId: string,
    employeeIds: string[],
    from: Date,
    to: Date,
  ): Promise<RecalcResult> {
    // Pre-load tenant-level data once (holidays + settings)
    const tenantCache = await loadTenantCalcCache(this.prisma, tenantId, from, to)

    const empResults = await mapWithConcurrency(
      employeeIds,
      5,
      (empId) => this.triggerRecalcRange(tenantId, empId, from, to, tenantCache),
    )

    const result: RecalcResult = {
      processedDays: 0,
      failedDays: 0,
      errors: [],
    }
    for (const empResult of empResults) {
      result.processedDays += empResult.processedDays
      result.failedDays += empResult.failedDays
      result.errors.push(...empResult.errors)
    }

    return result
  }

  /**
   * Recalculates a date range for all active employees in a tenant.
   */
  async triggerRecalcAll(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<RecalcResult> {
    // Get all active employees
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    })

    // Extract employee IDs
    const employeeIds = employees.map((emp) => emp.id)

    return this.triggerRecalcBatch(tenantId, employeeIds, from, to)
  }
}
