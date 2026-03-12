/**
 * Vercel Cron Route: /api/cron/calculate-days
 *
 * Runs daily at 02:00 UTC (configured in vercel.json).
 * Iterates all active tenants, calculates daily values for all active employees.
 *
 * Replaces Go scheduler engine + executor + calculate_days task handler.
 *
 * @see ZMI-TICKET-245: Vercel Cron calculate_days task
 * @see Go source: apps/api/internal/service/scheduler_tasks.go (calculate_days)
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { RecalcService } from "@/lib/services/recalc"
import { CronExecutionLogger } from "@/lib/services/cron-execution-logger"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes (Vercel Pro limit)

/** Supported date range values (ported from Go scheduler_tasks.go lines 69-85). */
type DateRange = "today" | "yesterday" | "last_7_days" | "current_month"

const VALID_DATE_RANGES = new Set<string>([
  "today",
  "yesterday",
  "last_7_days",
  "current_month",
])

const SCHEDULE_NAME = "calculate_days_cron"
const TASK_TYPE = "calculate_days"

/**
 * Computes from/to UTC dates based on date_range parameter.
 * All dates are midnight UTC (matching Go implementation).
 */
export function computeDateRange(
  dateRange: DateRange,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )

  switch (dateRange) {
    case "today":
      return { from: todayUTC, to: todayUTC }

    case "yesterday": {
      const yesterday = new Date(todayUTC)
      yesterday.setUTCDate(yesterday.getUTCDate() - 1)
      return { from: yesterday, to: yesterday }
    }

    case "last_7_days": {
      const from = new Date(todayUTC)
      from.setUTCDate(from.getUTCDate() - 6)
      return { from, to: todayUTC }
    }

    case "current_month": {
      const from = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      )
      return { from, to: todayUTC }
    }
  }
}

/** Per-tenant result included in the response. */
interface TenantResult {
  tenantId: string
  processedDays: number
  failedDays: number
  durationMs: number
  error?: string
}

/**
 * Core logic for the calculate-days cron job.
 * Extracted as a standalone function for testability.
 */
export async function executeCalculateDays(
  dateRange: DateRange,
  now: Date = new Date(),
): Promise<{
  ok: boolean
  dateRange: string
  from: string
  to: string
  tenantsProcessed: number
  tenantsFailed: number
  totalProcessedDays: number
  totalFailedDays: number
  results: TenantResult[]
}> {
  const { from, to } = computeDateRange(dateRange, now)
  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  console.log(
    `[calculate-days] Starting cron job: dateRange=${dateRange} from=${fromStr} to=${toStr}`,
  )

  // Load all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  console.log(`[calculate-days] Found ${tenants.length} active tenants`)

  const recalcService = new RecalcService(prisma)
  const logger = new CronExecutionLogger(prisma)
  const results: TenantResult[] = []
  let tenantsProcessed = 0
  let tenantsFailed = 0
  let totalProcessedDays = 0
  let totalFailedDays = 0

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

      // 3. Run recalculation for all active employees
      const result = await recalcService.triggerRecalcAll(tenant.id, from, to)

      const durationMs = Date.now() - tenantStart
      const status =
        result.failedDays === 0
          ? "completed"
          : result.processedDays === 0
            ? "failed"
            : "partial"

      // 4. Complete execution logging
      await logger.completeExecution(executionId, taskExecutionId, scheduleId, {
        status: status as "completed" | "failed" | "partial",
        taskResult: {
          date_range: dateRange,
          from: fromStr,
          to: toStr,
          processed_days: result.processedDays,
          failed_days: result.failedDays,
          errors:
            result.errors.length > 0
              ? result.errors.map((e) => ({
                  employee_id: e.employeeId,
                  date: e.date.toISOString().slice(0, 10),
                  error: e.error,
                }))
              : undefined,
        },
        errorMessage:
          status === "failed"
            ? `All ${result.failedDays} days failed`
            : undefined,
      })

      tenantsProcessed++
      totalProcessedDays += result.processedDays
      totalFailedDays += result.failedDays

      if (status !== "completed") {
        tenantsFailed++
      }

      results.push({
        tenantId: tenant.id,
        processedDays: result.processedDays,
        failedDays: result.failedDays,
        durationMs,
      })

      console.log(
        `[calculate-days] Tenant ${tenant.id}: ${result.processedDays} processed, ${result.failedDays} failed (${durationMs}ms)`,
      )
    } catch (err) {
      const durationMs = Date.now() - tenantStart
      const errorMessage =
        err instanceof Error ? err.message : String(err)

      console.error(
        `[calculate-days] Tenant ${tenant.id} failed: ${errorMessage}`,
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
                date_range: dateRange,
                from: fromStr,
                to: toStr,
                error: errorMessage,
              },
              errorMessage,
            },
          )
        } catch (logErr) {
          console.error(
            `[calculate-days] Failed to log execution error for tenant ${tenant.id}:`,
            logErr,
          )
        }
      }

      tenantsFailed++
      tenantsProcessed++
      results.push({
        tenantId: tenant.id,
        processedDays: 0,
        failedDays: 0,
        durationMs,
        error: errorMessage,
      })
    }
  }

  const summary = {
    ok: tenantsFailed === 0,
    dateRange,
    from: fromStr,
    to: toStr,
    tenantsProcessed,
    tenantsFailed,
    totalProcessedDays,
    totalFailedDays,
    results,
  }

  console.log(
    `[calculate-days] Completed: ${tenantsProcessed} tenants processed, ${tenantsFailed} failed, ${totalProcessedDays} days processed, ${totalFailedDays} days failed`,
  )

  return summary
}

/**
 * GET /api/cron/calculate-days
 *
 * Vercel Cron handler. Validates CRON_SECRET, parses date_range, and runs
 * daily recalculation for all active tenants.
 *
 * Query params:
 *   - date_range: "today" (default) | "yesterday" | "last_7_days" | "current_month"
 */
export async function GET(request: Request) {
  // 1. CRON_SECRET validation
  //    Vercel sends Authorization: Bearer <CRON_SECRET> header for cron invocations
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[calculate-days] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Parse optional date_range query parameter
  const url = new URL(request.url)
  const dateRangeParam = url.searchParams.get("date_range") ?? "today"

  if (!VALID_DATE_RANGES.has(dateRangeParam)) {
    return NextResponse.json(
      {
        error: `Invalid date_range: "${dateRangeParam}". Must be one of: today, yesterday, last_7_days, current_month`,
      },
      { status: 400 },
    )
  }

  const dateRange = dateRangeParam as DateRange

  try {
    const result = await executeCalculateDays(dateRange)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[calculate-days] Fatal error: ${errorMessage}`)
    return NextResponse.json(
      { error: "Internal server error", message: errorMessage },
      { status: 500 },
    )
  }
}
