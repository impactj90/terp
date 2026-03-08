/**
 * Vercel Cron Route: /api/cron/execute-macros
 *
 * Runs every 15 minutes (configured in vercel.json).
 * Iterates all active tenants, executes due weekly and monthly macros.
 *
 * Replaces Go scheduler engine + executor + execute_macros task handler.
 *
 * NOTE: Because this runs every 15 minutes, macros will execute multiple times
 * on their due day. The current action types (log_message, placeholders) are
 * idempotent. If non-idempotent actions are added in the future, deduplication
 * logic should be implemented.
 *
 * @see ZMI-TICKET-246: Vercel Cron monthly/dayplans/macros
 * @see Go source: apps/api/internal/service/macro.go (ExecuteDueMacros)
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { MacroExecutor } from "@/server/services/macro-executor"
import { CronExecutionLogger } from "@/server/services/cron-execution-logger"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes (Vercel Pro limit)

const SCHEDULE_NAME = "execute_macros_cron"
const TASK_TYPE = "execute_macros"

/** Per-tenant result included in the response. */
interface TenantResult {
  tenantId: string
  executed: number
  failed: number
  durationMs: number
  error?: string
}

/**
 * Core logic for the execute-macros cron job.
 * Extracted as a standalone function for testability.
 */
export async function executeExecuteMacros(
  dateStr?: string,
  now: Date = new Date(),
): Promise<{
  ok: boolean
  date: string
  tenantsProcessed: number
  tenantsFailed: number
  totalExecuted: number
  totalFailed: number
  results: TenantResult[]
}> {
  let targetDate: Date
  if (dateStr) {
    targetDate = new Date(dateStr + "T00:00:00.000Z")
    if (isNaN(targetDate.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`)
    }
  } else {
    targetDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )
  }

  const targetDateStr = targetDate.toISOString().slice(0, 10)

  console.log(
    `[execute-macros] Starting cron job: date=${targetDateStr}`,
  )

  // Load all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  console.log(`[execute-macros] Found ${tenants.length} active tenants`)

  const macroExecutor = new MacroExecutor(prisma)
  const logger = new CronExecutionLogger(prisma)
  const results: TenantResult[] = []
  let tenantsProcessed = 0
  let tenantsFailed = 0
  let totalExecuted = 0
  let totalFailed = 0

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
          timingType: "minutes",
          timingConfig: { interval: 15, source: "vercel_cron" },
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

      // 3. Execute due macros for this tenant
      const result = await macroExecutor.executeDueMacros(
        tenant.id,
        targetDate,
      )

      const durationMs = Date.now() - tenantStart

      // Determine status
      let status: "completed" | "failed" | "partial"
      if (result.failed === 0) {
        status = "completed"
      } else if (result.executed === 0 && result.failed > 0) {
        status = "failed"
      } else {
        status = "partial"
      }

      // 4. Complete execution logging
      await logger.completeExecution(executionId, taskExecutionId, scheduleId, {
        status,
        taskResult: {
          date: targetDateStr,
          executed: result.executed,
          failed: result.failed,
          errors:
            result.errors.length > 0 ? result.errors : undefined,
        },
        errorMessage:
          result.failed > 0
            ? `${result.failed} macro executions failed`
            : undefined,
      })

      tenantsProcessed++
      totalExecuted += result.executed
      totalFailed += result.failed

      if (status !== "completed") {
        tenantsFailed++
      }

      results.push({
        tenantId: tenant.id,
        executed: result.executed,
        failed: result.failed,
        durationMs,
      })

      console.log(
        `[execute-macros] Tenant ${tenant.id}: ${result.executed} executed, ${result.failed} failed (${durationMs}ms)`,
      )
    } catch (err) {
      const durationMs = Date.now() - tenantStart
      const errorMessage =
        err instanceof Error ? err.message : String(err)

      console.error(
        `[execute-macros] Tenant ${tenant.id} failed: ${errorMessage}`,
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
                date: targetDateStr,
                error: errorMessage,
              },
              errorMessage,
            },
          )
        } catch (logErr) {
          console.error(
            `[execute-macros] Failed to log execution error for tenant ${tenant.id}:`,
            logErr,
          )
        }
      }

      tenantsFailed++
      tenantsProcessed++
      results.push({
        tenantId: tenant.id,
        executed: 0,
        failed: 0,
        durationMs,
        error: errorMessage,
      })
    }
  }

  const summary = {
    ok: tenantsFailed === 0,
    date: targetDateStr,
    tenantsProcessed,
    tenantsFailed,
    totalExecuted,
    totalFailed,
    results,
  }

  console.log(
    `[execute-macros] Completed: ${tenantsProcessed} tenants processed, ${tenantsFailed} failed, ${totalExecuted} executed, ${totalFailed} failed`,
  )

  return summary
}

/**
 * GET /api/cron/execute-macros
 *
 * Vercel Cron handler. Validates CRON_SECRET, parses date, and executes
 * due macros for all active tenants.
 *
 * Query params:
 *   - date: string (optional, YYYY-MM-DD format, default: today)
 */
export async function GET(request: Request) {
  // 1. CRON_SECRET validation
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Parse optional date query parameter
  const url = new URL(request.url)
  const dateParam = url.searchParams.get("date") ?? undefined

  // Validate date format if provided
  if (dateParam !== undefined) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dateParam)) {
      return NextResponse.json(
        {
          error: `Invalid date format: "${dateParam}". Must be YYYY-MM-DD`,
        },
        { status: 400 },
      )
    }
    // Also validate it's a real date
    const testDate = new Date(dateParam + "T00:00:00.000Z")
    if (isNaN(testDate.getTime())) {
      return NextResponse.json(
        {
          error: `Invalid date: "${dateParam}"`,
        },
        { status: 400 },
      )
    }
  }

  try {
    const result = await executeExecuteMacros(dateParam)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[execute-macros] Fatal error: ${errorMessage}`)
    return NextResponse.json(
      { error: "Internal server error", message: errorMessage },
      { status: 500 },
    )
  }
}
