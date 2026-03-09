/**
 * Vercel Cron Route: /api/cron/calculate-months
 *
 * Runs on the 2nd of each month at 03:00 UTC (configured in vercel.json).
 * Iterates all active tenants, calculates monthly values for all active employees
 * for the previous month.
 *
 * Replaces Go scheduler engine + executor + calculate_months task handler.
 *
 * @see ZMI-TICKET-246: Vercel Cron monthly/dayplans/macros
 * @see Go source: apps/api/internal/service/scheduler_tasks.go (calculate_months)
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { MonthlyCalcService } from "@/lib/services/monthly-calc"
import { CronExecutionLogger } from "@/lib/services/cron-execution-logger"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes (Vercel Pro limit)

const SCHEDULE_NAME = "calculate_months_cron"
const TASK_TYPE = "calculate_months"

/**
 * Computes the default target month (previous month) from a reference date.
 * Pure function for testability.
 */
export function computeDefaultMonth(now: Date): { year: number; month: number } {
  const defaultDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  )
  return {
    year: defaultDate.getUTCFullYear(),
    month: defaultDate.getUTCMonth() + 1, // 1-indexed
  }
}

/** Per-tenant result included in the response. */
interface TenantResult {
  tenantId: string
  processedMonths: number
  skippedMonths: number
  failedMonths: number
  durationMs: number
  error?: string
}

/**
 * Core logic for the calculate-months cron job.
 * Extracted as a standalone function for testability.
 */
export async function executeCalculateMonths(
  year?: number,
  month?: number,
  now: Date = new Date(),
): Promise<{
  ok: boolean
  year: number
  month: number
  tenantsProcessed: number
  tenantsFailed: number
  totalProcessedMonths: number
  totalSkippedMonths: number
  totalFailedMonths: number
  results: TenantResult[]
}> {
  const defaults = computeDefaultMonth(now)
  const targetYear = year ?? defaults.year
  const targetMonth = month ?? defaults.month

  console.log(
    `[calculate-months] Starting cron job: year=${targetYear} month=${targetMonth}`,
  )

  // Load all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  console.log(`[calculate-months] Found ${tenants.length} active tenants`)

  const monthlyCalcService = new MonthlyCalcService(prisma)
  const logger = new CronExecutionLogger(prisma)
  const results: TenantResult[] = []
  let tenantsProcessed = 0
  let tenantsFailed = 0
  let totalProcessedMonths = 0
  let totalSkippedMonths = 0
  let totalFailedMonths = 0

  // Process tenants sequentially to avoid connection pool exhaustion
  for (const tenant of tenants) {
    const tenantStart = Date.now()
    let scheduleId: string | undefined
    let executionId: string | undefined
    let taskExecutionId: string | undefined

    try {
      // 1. Ensure schedule record exists for this tenant
      scheduleId = await logger.ensureSchedule(
        tenant.id,
        SCHEDULE_NAME,
        TASK_TYPE,
        {
          timingType: "monthly",
          timingConfig: { dayOfMonth: 2, time: "03:00", source: "vercel_cron" },
        },
      )

      // 2. Start execution logging
      const execution = await logger.startExecution(
        tenant.id,
        scheduleId,
        "scheduled",
        TASK_TYPE,
      )
      executionId = execution.executionId
      taskExecutionId = execution.taskExecutionId

      // 3. Query active employees for this tenant
      const employees = await prisma.employee.findMany({
        where: { tenantId: tenant.id, isActive: true, deletedAt: null },
        select: { id: true },
      })
      const employeeIds = employees.map((e) => e.id)

      // 4. Calculate monthly values for all employees
      const result = await monthlyCalcService.calculateMonthBatch(
        employeeIds,
        targetYear,
        targetMonth,
      )

      const durationMs = Date.now() - tenantStart
      const status =
        result.failedMonths === 0
          ? "completed"
          : result.processedMonths === 0
            ? "failed"
            : "partial"

      // 5. Complete execution logging
      await logger.completeExecution(executionId, taskExecutionId, scheduleId, {
        status: status as "completed" | "failed" | "partial",
        taskResult: {
          year: targetYear,
          month: targetMonth,
          processed_months: result.processedMonths,
          skipped_months: result.skippedMonths,
          failed_months: result.failedMonths,
          errors:
            result.errors.length > 0
              ? result.errors.map((e) => ({
                  employee_id: e.employeeId,
                  year: e.year,
                  month: e.month,
                  error: e.error,
                }))
              : undefined,
        },
        errorMessage:
          status === "failed"
            ? `All ${result.failedMonths} months failed`
            : undefined,
      })

      tenantsProcessed++
      totalProcessedMonths += result.processedMonths
      totalSkippedMonths += result.skippedMonths
      totalFailedMonths += result.failedMonths

      if (status !== "completed") {
        tenantsFailed++
      }

      results.push({
        tenantId: tenant.id,
        processedMonths: result.processedMonths,
        skippedMonths: result.skippedMonths,
        failedMonths: result.failedMonths,
        durationMs,
      })

      console.log(
        `[calculate-months] Tenant ${tenant.id}: ${result.processedMonths} processed, ${result.skippedMonths} skipped, ${result.failedMonths} failed (${durationMs}ms)`,
      )
    } catch (err) {
      const durationMs = Date.now() - tenantStart
      const errorMessage =
        err instanceof Error ? err.message : String(err)

      console.error(
        `[calculate-months] Tenant ${tenant.id} failed: ${errorMessage}`,
      )

      // Try to log the failure if we have execution records
      if (executionId && taskExecutionId && scheduleId) {
        try {
          await logger.completeExecution(
            executionId,
            taskExecutionId,
            scheduleId,
            {
              status: "failed",
              taskResult: {
                year: targetYear,
                month: targetMonth,
                error: errorMessage,
              },
              errorMessage,
            },
          )
        } catch (logErr) {
          console.error(
            `[calculate-months] Failed to log execution error for tenant ${tenant.id}:`,
            logErr,
          )
        }
      }

      tenantsFailed++
      tenantsProcessed++
      results.push({
        tenantId: tenant.id,
        processedMonths: 0,
        skippedMonths: 0,
        failedMonths: 0,
        durationMs,
        error: errorMessage,
      })
    }
  }

  const summary = {
    ok: tenantsFailed === 0,
    year: targetYear,
    month: targetMonth,
    tenantsProcessed,
    tenantsFailed,
    totalProcessedMonths,
    totalSkippedMonths,
    totalFailedMonths,
    results,
  }

  console.log(
    `[calculate-months] Completed: ${tenantsProcessed} tenants processed, ${tenantsFailed} failed, ${totalProcessedMonths} months processed, ${totalSkippedMonths} skipped, ${totalFailedMonths} failed`,
  )

  return summary
}

/**
 * GET /api/cron/calculate-months
 *
 * Vercel Cron handler. Validates CRON_SECRET, parses year/month, and runs
 * monthly calculation for all active tenants.
 *
 * Query params:
 *   - year: number (optional, default: previous month's year)
 *   - month: number (optional, default: previous month)
 */
export async function GET(request: Request) {
  // 1. CRON_SECRET validation
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Parse optional year/month query parameters
  const url = new URL(request.url)
  const yearParam = url.searchParams.get("year")
  const monthParam = url.searchParams.get("month")

  let year: number | undefined
  let month: number | undefined

  if (yearParam !== null) {
    year = parseInt(yearParam, 10)
    if (isNaN(year) || year < 1900 || year > 2200) {
      return NextResponse.json(
        { error: `Invalid year: "${yearParam}". Must be 1900-2200` },
        { status: 400 },
      )
    }
  }

  if (monthParam !== null) {
    month = parseInt(monthParam, 10)
    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: `Invalid month: "${monthParam}". Must be 1-12` },
        { status: 400 },
      )
    }
  }

  try {
    const result = await executeCalculateMonths(year, month)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[calculate-months] Fatal error: ${errorMessage}`)
    return NextResponse.json(
      { error: "Internal server error", message: errorMessage },
      { status: 500 },
    )
  }
}
