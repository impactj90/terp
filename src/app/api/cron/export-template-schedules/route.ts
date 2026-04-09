/**
 * Vercel Cron Route: /api/cron/export-template-schedules
 *
 * SUSPENDED BY DEFAULT.
 *
 * The route is *not* registered in `vercel.json` — that file is the
 * single source of truth for which cron paths Vercel fires. Activation
 * requires TWO explicit changes by an operator:
 *
 *   1. Add this entry to the `crons` array in `vercel.json`:
 *        { "path": "/api/cron/export-template-schedules",
 *          "schedule": "*\u002F15 * * * *" }
 *
 *   2. Set `EXPORT_SCHEDULES_CRON_ENABLED=true` in the Vercel
 *      environment for the deployment that should fire schedules.
 *
 * Both steps are required: the env-flag check below also short-circuits
 * the route if anything else (manual curl, accidental config) tries to
 * trigger it. Per-schedule activation (the `is_active` column) is a
 * third independent gate handled inside `runDueSchedules`.
 *
 * For every `export_template_schedules` row where `is_active = true`
 * and `next_run_at <= now`, the route renders the configured template,
 * emails the resulting file to the recipient list, and updates
 * `next_run_at`.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` header — matches the
 * pattern established by other cron routes in this codebase.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import {
  runDueSchedules,
  defaultSendMail,
} from "@/lib/services/export-template-schedule-service"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Suspended by default — refuse to run unless an operator has flipped
  // the env flag. Returns 200 with `suspended:true` so the cron-runner
  // does not retry, but no schedules are processed.
  if (process.env.EXPORT_SCHEDULES_CRON_ENABLED !== "true") {
    return NextResponse.json({
      ok: true,
      suspended: true,
      message:
        "export-template-schedules cron is suspended. Set EXPORT_SCHEDULES_CRON_ENABLED=true to activate.",
    })
  }

  console.log("[export-template-schedules] Starting cron job")

  try {
    const sendMail = await defaultSendMail(prisma)
    const result = await runDueSchedules(prisma, new Date(), sendMail)
    console.log(
      `[export-template-schedules] Complete: total=${result.total} succeeded=${result.succeeded} failed=${result.failed}`,
    )
    return NextResponse.json({
      ok: true,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      results: result.results,
    })
  } catch (err) {
    console.error("[export-template-schedules] Fatal error:", err)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
