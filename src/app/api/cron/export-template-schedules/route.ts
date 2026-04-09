/**
 * Vercel Cron Route: /api/cron/export-template-schedules
 *
 * Runs every 15 minutes (configured in vercel.json).
 * For every `export_template_schedules` row where `is_active = true`
 * and `next_run_at <= now`, renders the configured template, emails
 * the resulting file to the recipient list, and updates `next_run_at`.
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
