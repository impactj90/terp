import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { CronExecutionLogger } from "@/lib/services/cron-execution-logger"
import { processTenantProbationReminders } from "@/lib/services/probation-reminder-service"

export const runtime = "nodejs"
export const maxDuration = 300

const SCHEDULE_NAME = "probation_reminders_cron"
const TASK_TYPE = "probation_reminders"

interface TenantResult {
  tenantId: string
  skipped: boolean
  skipReason?: "disabled" | "no_due_employees" | "no_recipients"
  employeesDue: number
  remindersCreated: number
  duplicateCount: number
  notificationsCreated: number
  recipientsNotified: number
  recipientsSuppressedByPreference: number
  recipientsSuppressedByScope: number
  durationMs: number
  error?: string
}

export async function executeProbationReminders(
  now: Date = new Date()
): Promise<{
  ok: boolean
  date: string
  tenantsProcessed: number
  tenantsFailed: number
  remindersCreated: number
  duplicatesSkipped: number
  notificationsCreated: number
  recipientsNotified: number
  results: TenantResult[]
}> {
  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ))
  const date = today.toISOString().slice(0, 10)

  console.log(`[probation-reminders] Starting cron job for ${date}`)

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  const logger = new CronExecutionLogger(prisma)
  const results: TenantResult[] = []
  let tenantsProcessed = 0
  let tenantsFailed = 0
  let remindersCreated = 0
  let duplicatesSkipped = 0
  let notificationsCreated = 0
  let recipientsNotified = 0

  for (const tenant of tenants) {
    const tenantStart = Date.now()
    let scheduleId: string | undefined
    let executionId: string | undefined
    let taskExecutionId: string | undefined

    try {
      scheduleId = await logger.ensureSchedule(
        tenant.id,
        SCHEDULE_NAME,
        TASK_TYPE,
        {
          timingType: "daily",
          timingConfig: { time: "05:15", source: "vercel_cron" },
        }
      )

      const execution = await logger.startExecution(
        tenant.id,
        scheduleId,
        "scheduled",
        TASK_TYPE
      )
      executionId = execution.executionId
      taskExecutionId = execution.taskExecutionId

      const result = await processTenantProbationReminders(
        prisma,
        tenant.id,
        today
      )
      const durationMs = Date.now() - tenantStart

      await logger.completeExecution(executionId, taskExecutionId, scheduleId, {
        status: "completed",
        taskResult: {
          date,
          skipped: result.skipped,
          skip_reason: result.skipReason ?? null,
          employees_due: result.employeesDue,
          reminders_created: result.remindersCreated,
          duplicates_skipped: result.duplicateCount,
          notifications_created: result.notificationsCreated,
          recipients_notified: result.recipientsNotified,
          recipients_suppressed_by_preference:
            result.recipientsSuppressedByPreference,
          recipients_suppressed_by_scope: result.recipientsSuppressedByScope,
        },
      })

      tenantsProcessed++
      remindersCreated += result.remindersCreated
      duplicatesSkipped += result.duplicateCount
      notificationsCreated += result.notificationsCreated
      recipientsNotified += result.recipientsNotified

      results.push({
        tenantId: tenant.id,
        durationMs,
        ...result,
      })
    } catch (error) {
      const durationMs = Date.now() - tenantStart
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      if (executionId && taskExecutionId && scheduleId) {
        try {
          await logger.completeExecution(
            executionId,
            taskExecutionId,
            scheduleId,
            {
              status: "failed",
              taskResult: { date, error: errorMessage },
              errorMessage,
            }
          )
        } catch (loggingError) {
          console.error(
            `[probation-reminders] Failed to log execution error for tenant ${tenant.id}:`,
            loggingError
          )
        }
      }

      tenantsProcessed++
      tenantsFailed++
      results.push({
        tenantId: tenant.id,
        skipped: false,
        employeesDue: 0,
        remindersCreated: 0,
        duplicateCount: 0,
        notificationsCreated: 0,
        recipientsNotified: 0,
        recipientsSuppressedByPreference: 0,
        recipientsSuppressedByScope: 0,
        durationMs,
        error: errorMessage,
      })
    }
  }

  console.log(
    `[probation-reminders] Completed: ${tenantsProcessed} tenants processed, ${tenantsFailed} failed, ${remindersCreated} reminders created, ${notificationsCreated} notifications`
  )

  return {
    ok: tenantsFailed === 0,
    date,
    tenantsProcessed,
    tenantsFailed,
    remindersCreated,
    duplicatesSkipped,
    notificationsCreated,
    recipientsNotified,
    results,
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error("[probation-reminders] CRON_SECRET is not configured")
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await executeProbationReminders()
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    console.error(`[probation-reminders] Fatal error: ${errorMessage}`)
    return NextResponse.json(
      { error: "Internal server error", message: errorMessage },
      { status: 500 }
    )
  }
}
