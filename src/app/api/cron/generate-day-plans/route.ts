/**
 * Vercel Cron Route: /api/cron/generate-day-plans
 *
 * Runs every Sunday at 01:00 UTC (configured in vercel.json).
 * Iterates all active tenants, generates employee day plans from tariff
 * week plans for the upcoming period (default: 14 days ahead).
 *
 * Replaces Go scheduler engine + executor + generate_day_plans task handler.
 *
 * @see ZMI-TICKET-246: Vercel Cron monthly/dayplans/macros
 * @see Go source: apps/api/internal/service/scheduler_tasks.go (generate_day_plans)
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { EmployeeDayPlanGenerator } from "@/lib/services/employee-day-plan-generator"
import { CronExecutionLogger } from "@/lib/services/cron-execution-logger"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes (Vercel Pro limit)

const SCHEDULE_NAME = "generate_day_plans_cron"
const TASK_TYPE = "generate_day_plans"
const DEFAULT_DAYS_AHEAD = 14

/** Per-tenant result included in the response. */
interface TenantResult {
  tenantId: string
  employeesProcessed: number
  plansCreated: number
  plansUpdated: number
  employeesSkipped: number
  durationMs: number
  error?: string
}

/**
 * Core logic for the generate-day-plans cron job.
 * Extracted as a standalone function for testability.
 */
export async function executeGenerateDayPlans(
  daysAhead?: number,
  now: Date = new Date(),
): Promise<{
  ok: boolean
  daysAhead: number
  from: string
  to: string
  tenantsProcessed: number
  tenantsFailed: number
  totalEmployeesProcessed: number
  totalPlansCreated: number
  totalPlansUpdated: number
  totalEmployeesSkipped: number
  results: TenantResult[]
}> {
  const effectiveDaysAhead = daysAhead ?? DEFAULT_DAYS_AHEAD
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const toDate = new Date(todayUTC)
  toDate.setUTCDate(toDate.getUTCDate() + effectiveDaysAhead)

  const fromStr = todayUTC.toISOString().slice(0, 10)
  const toStr = toDate.toISOString().slice(0, 10)

  console.log(
    `[generate-day-plans] Starting cron job: daysAhead=${effectiveDaysAhead} from=${fromStr} to=${toStr}`,
  )

  // Load all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  console.log(`[generate-day-plans] Found ${tenants.length} active tenants`)

  // --- Checkpoint: load already-completed tenants for this run ---
  const runKey = `${fromStr}:${toStr}`
  const completedCheckpoints = await prisma.cronCheckpoint.findMany({
    where: { cronName: TASK_TYPE, runKey },
    select: { tenantId: true },
  })
  const completedTenantIds = new Set(completedCheckpoints.map((c) => c.tenantId))

  if (completedTenantIds.size > 0) {
    console.log(
      `[generate-day-plans] Checkpoint: ${completedTenantIds.size} tenants already completed, will skip`,
    )
  }

  // Cleanup old checkpoints (> 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  await prisma.cronCheckpoint.deleteMany({
    where: { cronName: TASK_TYPE, createdAt: { lt: thirtyDaysAgo } },
  })

  const generator = new EmployeeDayPlanGenerator(prisma)
  const logger = new CronExecutionLogger(prisma)
  const results: TenantResult[] = []
  let tenantsProcessed = 0
  let tenantsFailed = 0
  let totalEmployeesProcessed = 0
  let totalPlansCreated = 0
  let totalPlansUpdated = 0
  let totalEmployeesSkipped = 0
  const jobStartTime = Date.now()

  // Process tenants sequentially to avoid connection pool exhaustion
  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i]!
    const tenantStart = Date.now()

    // Timeout warning: alert when approaching 5-min Vercel limit
    if (Date.now() - jobStartTime > 240_000) {
      console.warn(
        `[generate-day-plans] WARNING: approaching 5-min timeout. ` +
          `${tenants.length - i} tenants remaining. Processed tenants are checkpointed for resume.`,
      )
    }

    // Skip already-completed tenants (checkpoint hit)
    if (completedTenantIds.has(tenant.id)) {
      console.log(`[generate-day-plans] Tenant ${tenant.id}: checkpoint hit, skipping`)
      results.push({
        tenantId: tenant.id,
        employeesProcessed: 0,
        plansCreated: 0,
        plansUpdated: 0,
        employeesSkipped: 0,
        durationMs: 0,
      })
      tenantsProcessed++
      continue
    }
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
          timingType: "weekly",
          timingConfig: { dayOfWeek: 0, time: "01:00", source: "vercel_cron" },
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

      // 3. Generate day plans for all active employees
      const result = await generator.generateFromTariff({
        tenantId: tenant.id,
        // employeeIds: undefined = all active employees
        from: todayUTC,
        to: toDate,
        overwriteTariffSource: true,
      })

      const durationMs = Date.now() - tenantStart

      // 4. Complete execution logging
      await logger.completeExecution(executionId, taskExecutionId, scheduleId, {
        status: "completed",
        taskResult: {
          days_ahead: effectiveDaysAhead,
          from: fromStr,
          to: toStr,
          employees_processed: result.employeesProcessed,
          plans_created: result.plansCreated,
          plans_updated: result.plansUpdated,
          employees_skipped: result.employeesSkipped,
        },
      })

      tenantsProcessed++
      totalEmployeesProcessed += result.employeesProcessed
      totalPlansCreated += result.plansCreated
      totalPlansUpdated += result.plansUpdated
      totalEmployeesSkipped += result.employeesSkipped

      results.push({
        tenantId: tenant.id,
        employeesProcessed: result.employeesProcessed,
        plansCreated: result.plansCreated,
        plansUpdated: result.plansUpdated,
        employeesSkipped: result.employeesSkipped,
        durationMs,
      })

      // Save checkpoint so re-runs skip this tenant
      try {
        await prisma.cronCheckpoint.upsert({
          where: {
            cronName_runKey_tenantId: {
              cronName: TASK_TYPE,
              runKey,
              tenantId: tenant.id,
            },
          },
          create: {
            cronName: TASK_TYPE,
            runKey,
            tenantId: tenant.id,
            status: "completed",
            durationMs,
          },
          update: { status: "completed", durationMs },
        })
      } catch (cpErr) {
        console.error(
          `[generate-day-plans] Failed to save checkpoint for tenant ${tenant.id}:`,
          cpErr,
        )
      }

      console.log(
        `[generate-day-plans] Tenant ${tenant.id}: ${result.employeesProcessed} processed, ${result.plansCreated} created, ${result.plansUpdated} updated, ${result.employeesSkipped} skipped (${durationMs}ms)`,
      )
    } catch (err) {
      const durationMs = Date.now() - tenantStart
      const errorMessage =
        err instanceof Error ? err.message : String(err)

      console.error(
        `[generate-day-plans] Tenant ${tenant.id} failed: ${errorMessage}`,
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
                days_ahead: effectiveDaysAhead,
                from: fromStr,
                to: toStr,
                error: errorMessage,
              },
              errorMessage,
            },
          )
        } catch (logErr) {
          console.error(
            `[generate-day-plans] Failed to log execution error for tenant ${tenant.id}:`,
            logErr,
          )
        }
      }

      tenantsFailed++
      tenantsProcessed++
      results.push({
        tenantId: tenant.id,
        employeesProcessed: 0,
        plansCreated: 0,
        plansUpdated: 0,
        employeesSkipped: 0,
        durationMs,
        error: errorMessage,
      })
    }
  }

  const summary = {
    ok: tenantsFailed === 0,
    daysAhead: effectiveDaysAhead,
    from: fromStr,
    to: toStr,
    tenantsProcessed,
    tenantsFailed,
    totalEmployeesProcessed,
    totalPlansCreated,
    totalPlansUpdated,
    totalEmployeesSkipped,
    results,
  }

  console.log(
    `[generate-day-plans] Completed: ${tenantsProcessed} tenants processed, ${tenantsFailed} failed, ${totalPlansCreated} plans created, ${totalPlansUpdated} updated`,
  )

  return summary
}

/**
 * GET /api/cron/generate-day-plans
 *
 * Vercel Cron handler. Validates CRON_SECRET, parses days_ahead, and generates
 * day plans from tariffs for all active tenants.
 *
 * Query params:
 *   - days_ahead: number (optional, default: 14, valid: 1-365)
 */
export async function GET(request: Request) {
  // 1. CRON_SECRET validation
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[generate-day-plans] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Parse optional days_ahead query parameter
  const url = new URL(request.url)
  const daysAheadParam = url.searchParams.get("days_ahead")

  let daysAhead: number | undefined

  if (daysAheadParam !== null) {
    daysAhead = parseInt(daysAheadParam, 10)
    if (isNaN(daysAhead) || daysAhead < 1 || daysAhead > 365) {
      return NextResponse.json(
        {
          error: `Invalid days_ahead: "${daysAheadParam}". Must be 1-365`,
        },
        { status: 400 },
      )
    }
  }

  try {
    const result = await executeGenerateDayPlans(daysAhead)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[generate-day-plans] Fatal error: ${errorMessage}`)
    return NextResponse.json(
      { error: "Internal server error", message: errorMessage },
      { status: 500 },
    )
  }
}
