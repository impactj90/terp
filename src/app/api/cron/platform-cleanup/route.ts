/**
 * Vercel Cron Route: /api/cron/platform-cleanup
 *
 * Runs every 5 minutes (configured in vercel.json).
 *
 * Responsibilities:
 *   1. Flip pending support sessions older than 30 minutes to `expired`
 *      (tenant waited, operator never picked up).
 *   2. Flip active support sessions whose `expires_at <= now()` to
 *      `expired`. Writes one `support_session.expired` platform audit
 *      entry per auto-expired session.
 *   3. Delete `platform_login_attempts` rows older than 30 days.
 *
 * @see thoughts/shared/plans/2026-04-09-platform-admin-system.md (Phase 8)
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as platformAudit from "@/lib/platform/audit-service"

export const runtime = "nodejs"
export const maxDuration = 60

const PENDING_TTL_MS = 30 * 60 * 1000 // 30 minutes
const LOGIN_ATTEMPT_RETENTION_DAYS = 30

export async function executePlatformCleanup(now: Date = new Date()) {
  console.log("[platform-cleanup] Starting cron job")

  // 1. Expire stale pending sessions (created_at < now - 30min)
  const pendingCutoff = new Date(now.getTime() - PENDING_TTL_MS)
  const stalePending = await prisma.supportSession.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: pendingCutoff },
    },
    data: { status: "expired" },
  })

  // 2. Expire active sessions whose window has passed
  const expiringActive = await prisma.supportSession.findMany({
    where: {
      status: "active",
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      tenantId: true,
      platformUserId: true,
    },
  })

  let activeExpired = 0
  for (const session of expiringActive) {
    try {
      await prisma.supportSession.update({
        where: { id: session.id },
        data: { status: "expired" },
      })

      await platformAudit.log(prisma, {
        platformUserId: session.platformUserId,
        action: "support_session.expired",
        entityType: "support_session",
        entityId: session.id,
        targetTenantId: session.tenantId,
        supportSessionId: session.id,
        metadata: { trigger: "cron", cron: "platform-cleanup" },
        ipAddress: null,
        userAgent: "cron/platform-cleanup",
      })

      activeExpired++
    } catch (err) {
      console.error(
        `[platform-cleanup] Failed to expire session ${session.id}:`,
        err,
      )
    }
  }

  // 3. Delete old login attempts
  const loginAttemptCutoff = new Date(
    now.getTime() - LOGIN_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )
  const deletedAttempts = await prisma.platformLoginAttempt.deleteMany({
    where: { attemptedAt: { lt: loginAttemptCutoff } },
  })

  const summary = {
    ok: true,
    expired: stalePending.count + activeExpired,
    pendingExpired: stalePending.count,
    activeExpired,
    deleted: deletedAttempts.count,
  }

  console.log(
    `[platform-cleanup] Complete: pendingExpired=${stalePending.count}, activeExpired=${activeExpired}, loginAttemptsDeleted=${deletedAttempts.count}`,
  )

  return summary
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("[platform-cleanup] CRON_SECRET is not configured")
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 },
    )
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await executePlatformCleanup()
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[platform-cleanup] Fatal: ${errorMessage}`)
    return NextResponse.json(
      { error: "Internal server error", message: errorMessage },
      { status: 500 },
    )
  }
}
