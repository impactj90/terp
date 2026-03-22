/**
 * Vercel Cron Route: /api/cron/recurring-invoices
 *
 * Runs daily at 04:00 UTC (configured in vercel.json).
 * Generates invoices for all active recurring templates where
 * autoGenerate=true and nextDueDate <= today.
 *
 * Uses CronCheckpoint to skip already-processed templates on
 * timeout/retry or double-fire scenarios.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as recurringService from "@/lib/services/billing-recurring-invoice-service"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes

const CRON_NAME = "recurring_invoices"

export async function GET(request: Request) {
  // 1. Validate CRON_SECRET
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[recurring-invoices] Starting cron job")

  try {
    // 2. Build runKey from today's date
    const today = new Date()
    const runKey = today.toISOString().slice(0, 10)

    // 3. Load completed checkpoints for this run
    const completedCheckpoints = await prisma.cronCheckpoint.findMany({
      where: { cronName: CRON_NAME, runKey },
      select: { tenantId: true },
    })
    // tenantId stores "tenantId:templateId" composite key
    const completedKeys = new Set(completedCheckpoints.map((c) => c.tenantId))

    if (completedKeys.size > 0) {
      console.log(
        `[recurring-invoices] Checkpoint: ${completedKeys.size} templates already completed, will skip`
      )
    }

    // 4. Cleanup old checkpoints (> 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await prisma.cronCheckpoint.deleteMany({
      where: { cronName: CRON_NAME, createdAt: { lt: thirtyDaysAgo } },
    })

    // 5. Run generation with checkpoint support
    const result = await recurringService.generateDue(prisma, today, {
      cronName: CRON_NAME,
      runKey,
      completedKeys,
    })

    console.log(
      `[recurring-invoices] Complete: generated=${result.generated}, failed=${result.failed}, skipped=${result.skipped}`
    )

    return NextResponse.json({
      ok: true,
      generated: result.generated,
      failed: result.failed,
      skipped: result.skipped,
      results: result.results,
    })
  } catch (err) {
    console.error("[recurring-invoices] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
