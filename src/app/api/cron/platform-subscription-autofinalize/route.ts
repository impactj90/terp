/**
 * Platform subscription auto-finalize cron (Phase 10a).
 *
 * Runs daily at 04:15 UTC — 15 minutes after /api/cron/recurring-invoices.
 * Reconstructs which DRAFT invoices were generated today for platform-
 * linked subscriptions and finalizes them (DRAFT → PRINTED + PDF + XRechnung).
 *
 * This cron is entirely platform-side. It does not modify the main
 * recurring-invoices cron route or any Terp service. It only READS Terp
 * models and WRITES through the existing billing-document-service.finalize().
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import * as autofinalize from "@/lib/platform/subscription-autofinalize-service"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await autofinalize.autofinalizePending(prisma, new Date())
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error("[platform-subscription-autofinalize] fatal:", err)
    return NextResponse.json(
      {
        error: "Internal error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
