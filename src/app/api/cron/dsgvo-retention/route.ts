/**
 * Vercel Cron Route: /api/cron/dsgvo-retention
 *
 * SUSPENDED BY DEFAULT — not registered in vercel.json.
 * To enable, add to vercel.json crons:
 *   { "path": "/api/cron/dsgvo-retention", "schedule": "0 3 1 * *" }
 *
 * Runs monthly on the 1st at 03:00 UTC.
 * Executes DSGVO data retention (delete/anonymize) for all active tenants.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as dsgvoService from "@/lib/services/dsgvo-retention-service"

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

  console.log("[dsgvo-retention] Starting cron job")

  try {
    // 2. Find all active tenants
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    })

    console.log(`[dsgvo-retention] Processing ${tenants.length} tenants`)

    const results: Array<{
      tenantId: string
      totalDeleted: number
      types: number
      error?: string
    }> = []

    // 3. Process each tenant sequentially
    for (const tenant of tenants) {
      try {
        const result = await dsgvoService.executeRetention(
          prisma,
          tenant.id,
          { dryRun: false, executedBy: null }
        )
        const totalDeleted = result.reduce(
          (sum, r) => sum + r.recordCount,
          0
        )
        results.push({
          tenantId: tenant.id,
          totalDeleted,
          types: result.length,
        })
      } catch (err) {
        console.error(
          `[dsgvo-retention] Error for tenant ${tenant.id}:`,
          err
        )
        results.push({
          tenantId: tenant.id,
          totalDeleted: 0,
          types: 0,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const grandTotal = results.reduce((sum, r) => sum + r.totalDeleted, 0)
    console.log(
      `[dsgvo-retention] Complete: ${tenants.length} tenants, ${grandTotal} total records`
    )

    return NextResponse.json({
      ok: true,
      tenantsProcessed: tenants.length,
      totalRecordsDeleted: grandTotal,
      results,
    })
  } catch (err) {
    console.error("[dsgvo-retention] Fatal error:", err)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
