/**
 * Vercel Cron Route: /api/cron/recurring-invoices
 *
 * Runs daily at 04:00 UTC (configured in vercel.json).
 * Generates invoices for all active recurring templates where
 * autoGenerate=true and nextDueDate <= today.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as recurringService from "@/lib/services/billing-recurring-invoice-service"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes

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
    const result = await recurringService.generateDue(prisma)

    console.log(
      `[recurring-invoices] Complete: generated=${result.generated}, failed=${result.failed}`
    )

    return NextResponse.json({
      ok: true,
      generated: result.generated,
      failed: result.failed,
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
