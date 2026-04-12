/**
 * Vercel Cron Route: /api/cron/wh-corrections
 *
 * Runs daily at 06:00 UTC (configured in vercel.json).
 * Runs warehouse correction checks for all active tenants with warehouse module.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as whCorrectionService from "@/lib/services/wh-correction-service"

export const runtime = "nodejs"
export const maxDuration = 300

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

  console.log("[wh-corrections] Starting cron job")

  try {
    // 2. Find all active tenants with warehouse module enabled
    const tenantModules = await prisma.tenantModule.findMany({
      where: { module: "warehouse" },
      select: { tenantId: true, tenant: { select: { isActive: true } } },
    })

    const activeTenantIds = tenantModules
      .filter((tm) => tm.tenant.isActive)
      .map((tm) => tm.tenantId)

    console.log(`[wh-corrections] Processing ${activeTenantIds.length} tenants`)

    const results: Array<{
      tenantId: string
      runId: string
      checksRun: number
      issuesFound: number
      error?: string
    }> = []

    // 3. Run checks for each tenant sequentially
    for (const tenantId of activeTenantIds) {
      try {
        const result = await whCorrectionService.runCorrectionChecks(
          prisma,
          tenantId,
          null,
          "CRON"
        )
        results.push({ tenantId, ...result })
      } catch (err) {
        console.error(`[wh-corrections] Error for tenant ${tenantId}:`, err)
        results.push({
          tenantId,
          runId: "",
          checksRun: 0,
          issuesFound: 0,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const totalIssues = results.reduce((sum, r) => sum + r.issuesFound, 0)
    console.log(
      `[wh-corrections] Complete: ${activeTenantIds.length} tenants, ${totalIssues} total issues`
    )

    return NextResponse.json({
      ok: true,
      tenantsProcessed: activeTenantIds.length,
      totalIssues,
      results,
    })
  } catch (err) {
    console.error("[wh-corrections] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
