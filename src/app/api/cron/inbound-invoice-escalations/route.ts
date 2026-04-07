/**
 * Vercel Cron Route: /api/cron/inbound-invoice-escalations
 *
 * Runs every hour (configured in vercel.json).
 * Finds overdue PENDING approval steps and sends reminder notifications.
 * Respects 24h cooldown between reminders for the same step.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as approvalRepo from "@/lib/services/inbound-invoice-approval-repository"

export const runtime = "nodejs"
export const maxDuration = 60

// 24h cooldown between reminders
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000

async function publishUnreadCountUpdate(
  tenantId: string,
  userId: string
) {
  try {
    const { getHub } = await import("@/lib/pubsub/singleton")
    const { userTopic } = await import("@/lib/pubsub/topics")
    const hub = await getHub()
    const unreadCount = await prisma.notification.count({
      where: { tenantId, userId, readAt: null },
    })
    await hub.publish(
      userTopic(userId),
      { event: "notification", type: "reminders", unread_count: unreadCount },
      true
    )
  } catch {
    // best effort
  }
}

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

  console.log("[inbound-invoice-escalations] Starting cron job")

  try {
    // 2. Find overdue PENDING approvals
    const overdueSteps = await approvalRepo.findOverdueSteps(prisma, 200)

    let reminded = 0
    let skipped = 0

    for (const step of overdueSteps) {
      // 3. Check 24h cooldown
      if (step.lastReminderAt) {
        const elapsed = Date.now() - step.lastReminderAt.getTime()
        if (elapsed < REMINDER_COOLDOWN_MS) {
          skipped++
          continue
        }
      }

      // 4. Resolve approver user IDs
      const userIds: string[] = []
      if (step.approverUserId) {
        userIds.push(step.approverUserId)
      } else if (step.approverGroupId) {
        const members = await prisma.user.findMany({
          where: { userGroupId: step.approverGroupId, isActive: true },
          select: { id: true },
        })
        userIds.push(...members.map((m) => m.id))
      }

      const tenantId = step.invoice.tenantId

      // 5. Send reminder notifications
      for (const userId of userIds) {
        try {
          await prisma.notification.create({
            data: {
              tenantId,
              userId,
              type: "reminders",
              title: "Erinnerung: Rechnung wartet auf Freigabe",
              message: `Rechnung ${step.invoice.number} wartet seit über 24h auf Ihre Freigabe`,
              link: `/invoices/inbound/${step.invoiceId}`,
            },
          })
          await publishUnreadCountUpdate(tenantId, userId)
        } catch (err) {
          console.error(`[inbound-invoice-escalations] Notification failed for user ${userId}:`, err)
        }
      }

      // 6. Update lastReminderAt
      await approvalRepo.updateLastReminderAt(prisma, step.id)
      reminded++
    }

    console.log(
      `[inbound-invoice-escalations] Complete: ${overdueSteps.length} overdue, ${reminded} reminded, ${skipped} skipped (cooldown)`
    )

    return NextResponse.json({
      ok: true,
      overdue: overdueSteps.length,
      reminded,
      skipped,
    })
  } catch (err) {
    console.error("[inbound-invoice-escalations] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
