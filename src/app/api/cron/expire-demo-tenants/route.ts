/**
 * Vercel Cron Route: /api/cron/expire-demo-tenants
 *
 * Runs daily at 01:00 UTC (configured in vercel.json).
 * Finds active demo tenants with demo_expires_at < now() and flips
 * isActive=false. Writes a demo_expired audit-log entry per tenant.
 *
 * @see thoughts/shared/plans/2026-04-09-demo-tenant-system.md (Phase 4)
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as repo from "@/lib/services/demo-tenant-repository"
import * as auditLog from "@/lib/services/audit-logs-service"

export const runtime = "nodejs"
export const maxDuration = 300

const TASK_TYPE = "expire_demo_tenants"

interface DemoExpireResult {
  tenantId: string
  name: string
  expiredAt: string
  success: boolean
  error?: string
}

export async function executeExpireDemoTenants(now: Date = new Date()) {
  const runKey = now.toISOString().slice(0, 10) // YYYY-MM-DD
  console.log(`[expire-demo-tenants] Starting: runKey=${runKey}`)

  // Find expired active demos
  const expired = await repo.findExpiredActiveDemos(prisma, now)
  console.log(`[expire-demo-tenants] Found ${expired.length} expired demos`)

  // Load already-completed checkpoints for this runKey (idempotency for re-runs)
  const completed = await prisma.cronCheckpoint.findMany({
    where: { cronName: TASK_TYPE, runKey },
    select: { tenantId: true },
  })
  const completedIds = new Set(completed.map((c) => c.tenantId))

  const results: DemoExpireResult[] = []
  let processed = 0
  let failed = 0

  for (const demo of expired) {
    if (completedIds.has(demo.id)) {
      console.log(
        `[expire-demo-tenants] Tenant ${demo.id}: checkpoint hit, skip`,
      )
      continue
    }

    const start = Date.now()
    const expiredAtIso = demo.demoExpiresAt!.toISOString()

    try {
      await repo.markDemoExpired(prisma, demo.id)

      // System-level audit entry (no authenticated user — userId is nullable).
      await auditLog
        .log(prisma, {
          tenantId: demo.id,
          userId: null,
          action: "demo_expired",
          entityType: "tenant",
          entityId: demo.id,
          entityName: demo.name,
          changes: { isActive: { old: true, new: false } },
          metadata: { trigger: "cron", demoExpiresAt: expiredAtIso },
          ipAddress: null,
          userAgent: "cron/expire-demo-tenants",
        })
        .catch((err) =>
          console.error("[AuditLog] demo_expired failed:", err),
        )

      await prisma.cronCheckpoint.upsert({
        where: {
          cronName_runKey_tenantId: {
            cronName: TASK_TYPE,
            runKey,
            tenantId: demo.id,
          },
        },
        create: {
          cronName: TASK_TYPE,
          runKey,
          tenantId: demo.id,
          status: "completed",
          durationMs: Date.now() - start,
        },
        update: { status: "completed", durationMs: Date.now() - start },
      })

      results.push({
        tenantId: demo.id,
        name: demo.name,
        expiredAt: expiredAtIso,
        success: true,
      })
      processed++
      console.log(
        `[expire-demo-tenants] Tenant ${demo.id} (${demo.name}) expired`,
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(
        `[expire-demo-tenants] Tenant ${demo.id} failed: ${errorMessage}`,
      )
      failed++
      results.push({
        tenantId: demo.id,
        name: demo.name,
        expiredAt: expiredAtIso,
        success: false,
        error: errorMessage,
      })
    }
  }

  const summary = {
    ok: failed === 0,
    runKey,
    processed,
    failed,
    results,
  }

  console.log(
    `[expire-demo-tenants] Completed: processed=${processed}, failed=${failed}`,
  )

  return summary
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("[expire-demo-tenants] CRON_SECRET is not configured")
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 },
    )
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await executeExpireDemoTenants()
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[expire-demo-tenants] Fatal: ${errorMessage}`)
    return NextResponse.json(
      { error: "Internal server error", message: errorMessage },
      { status: 500 },
    )
  }
}
