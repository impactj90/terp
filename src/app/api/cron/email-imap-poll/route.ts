/**
 * Vercel Cron Route: /api/cron/email-imap-poll
 *
 * Runs every 3 minutes (configured in vercel.json).
 * Polls all active tenant IMAP configs for new inbound invoice emails.
 */

import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import * as imapConfigRepo from "@/lib/services/email-imap-config-repository"
import { pollInbox } from "@/lib/services/email-imap-poll-service"

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

  console.log("[email-imap-poll] Starting cron job")

  try {
    // 2. Get all active IMAP configs
    const configs = await imapConfigRepo.findAllActive(prisma)
    console.log(`[email-imap-poll] Found ${configs.length} active IMAP configs`)

    let totalProcessed = 0
    let totalSkipped = 0
    let totalFailed = 0
    const tenantErrors: Array<{ tenantId: string; error: string }> = []

    // 3. Process each tenant sequentially (avoid connection overload)
    for (const config of configs) {
      try {
        const result = await pollInbox(prisma, config)
        totalProcessed += result.processed
        totalSkipped += result.skipped
        totalFailed += result.failed

        if (result.errors.length > 0) {
          console.warn(
            `[email-imap-poll] Tenant ${config.tenantId} had ${result.errors.length} errors:`,
            result.errors.slice(0, 3)
          )
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(
          `[email-imap-poll] Failed for tenant ${config.tenantId}:`,
          errMsg
        )
        tenantErrors.push({ tenantId: config.tenantId, error: errMsg })

        // Notify admins on 3+ consecutive failures
        if (config.consecutiveFailures + 1 >= 3) {
          console.error(
            `[email-imap-poll] Tenant ${config.tenantId} has ${config.consecutiveFailures + 1} consecutive failures — sending notifications`
          )
          try {
            const adminIds = await prisma.$queryRaw<{ user_id: string }[]>`
              SELECT DISTINCT u.id AS user_id
              FROM users u
              JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = ${config.tenantId}::uuid
              JOIN user_groups ug ON ug.id = u.user_group_id
              WHERE ug.is_admin = true
                OR ug.permissions @> ${Prisma.sql`'["email_imap.manage"]'::jsonb`}
            `
            for (const { user_id } of adminIds) {
              await prisma.notification.create({
                data: {
                  tenantId: config.tenantId,
                  userId: user_id,
                  type: "errors",
                  title: "IMAP-Verbindungsfehler",
                  message: `IMAP-Abruf fehlgeschlagen (${config.consecutiveFailures + 1}x): ${errMsg}`,
                  link: "/settings/email/imap",
                },
              }).catch(() => {})
            }
          } catch (notifyErr) {
            console.error("[email-imap-poll] Failed to send failure notifications:", notifyErr)
          }
        }
      }
    }

    console.log(
      `[email-imap-poll] Complete: ${configs.length} tenants, ${totalProcessed} processed, ${totalSkipped} skipped, ${totalFailed} failed`
    )

    return NextResponse.json({
      ok: true,
      tenants: configs.length,
      processed: totalProcessed,
      skipped: totalSkipped,
      failed: totalFailed,
      errors: tenantErrors,
    })
  } catch (err) {
    console.error("[email-imap-poll] Fatal error:", err)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
