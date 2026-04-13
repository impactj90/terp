/**
 * Vercel Cron Route: /api/cron/dunning-candidates
 *
 * Daily cron (05:00 UTC). For every tenant with dunning enabled, runs
 * the eligibility query and — if at least one customer group is
 * eligible — creates a single summary notification per recipient who
 * holds the `dunning.view` permission.
 *
 * The cron is dedupe-guarded against same-day duplicates: if a
 * notification with the dunning link already exists today for that
 * (tenant, user) pair, no new row is created.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as reminderEligibilityService from "@/lib/services/reminder-eligibility-service"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { hasAnyPermission } from "@/lib/auth/permissions"
import type { ContextUser } from "@/trpc/init"

export const runtime = "nodejs"
export const maxDuration = 300

const NOTIFICATION_TYPE = "reminders"
const NOTIFICATION_LINK = "/orders/dunning"
const NOTIFICATION_TITLE = "Mahnfähige Rechnungen"

async function publishUnreadCountUpdate(tenantId: string, userId: string) {
  try {
    const { getHub } = await import("@/lib/pubsub/singleton")
    const { userTopic } = await import("@/lib/pubsub/topics")
    const hub = await getHub()
    const unreadCount = await prisma.notification.count({
      where: { tenantId, userId, readAt: null },
    })
    await hub.publish(
      userTopic(userId),
      { event: "notification", type: NOTIFICATION_TYPE, unread_count: unreadCount },
      true
    )
  } catch {
    // best effort
  }
}

async function findDunningRecipients(tenantId: string): Promise<string[]> {
  const dunningViewId = permissionIdByKey("dunning.view")
  if (!dunningViewId) return []

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      isLocked: false,
      userTenants: { some: { tenantId } },
    },
    include: {
      userGroup: true,
      userTenants: { include: { tenant: true } },
    },
  })

  return users
    .filter((u) => hasAnyPermission(u as unknown as ContextUser, [dunningViewId]))
    .map((u) => u.id)
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

  console.log("[dunning-candidates] Starting cron job")

  try {
    const enabledTenants = await prisma.reminderSettings.findMany({
      where: { enabled: true },
      select: { tenantId: true },
    })

    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)

    let tenantsNotified = 0
    let totalCustomersAffected = 0
    let notificationsCreated = 0

    for (const { tenantId } of enabledTenants) {
      let groups
      try {
        groups = await reminderEligibilityService.listEligibleInvoices(
          prisma,
          tenantId
        )
      } catch (err) {
        console.error(
          `[dunning-candidates] eligibility failed for tenant ${tenantId}:`,
          err
        )
        continue
      }
      if (groups.length === 0) continue

      const recipients = await findDunningRecipients(tenantId)
      if (recipients.length === 0) continue

      const message = `${groups.length} ${
        groups.length === 1 ? "Kunde hat" : "Kunden haben"
      } überfällige Rechnungen, die für eine Mahnung bereit sind.`

      let createdForTenant = 0
      for (const userId of recipients) {
        const existing = await prisma.notification.findFirst({
          where: {
            tenantId,
            userId,
            type: NOTIFICATION_TYPE,
            link: NOTIFICATION_LINK,
            createdAt: { gte: startOfDay },
          },
          select: { id: true },
        })
        if (existing) continue

        try {
          await prisma.notification.create({
            data: {
              tenantId,
              userId,
              type: NOTIFICATION_TYPE,
              title: NOTIFICATION_TITLE,
              message,
              link: NOTIFICATION_LINK,
            },
          })
          createdForTenant++
          notificationsCreated++
          await publishUnreadCountUpdate(tenantId, userId)
        } catch (err) {
          console.error(
            `[dunning-candidates] notification create failed for user ${userId}:`,
            err
          )
        }
      }

      if (createdForTenant > 0) {
        tenantsNotified++
        totalCustomersAffected += groups.length
      }
    }

    console.log(
      `[dunning-candidates] Complete: ${enabledTenants.length} enabled tenants, ${tenantsNotified} notified, ${notificationsCreated} notifications, ${totalCustomersAffected} customer groups`
    )

    return NextResponse.json({
      ok: true,
      tenantsEnabled: enabledTenants.length,
      tenantsNotified,
      notificationsCreated,
      totalCustomersAffected,
    })
  } catch (err) {
    console.error("[dunning-candidates] Fatal error:", err)
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
