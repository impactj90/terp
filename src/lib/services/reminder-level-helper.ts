import type { PrismaClient } from "@/generated/prisma/client"

/**
 * Returns the current dunning level of an invoice, derived from the
 * highest `levelAtReminder` across all ReminderItems whose parent
 * Reminder is in status `SENT`. Cancelled or draft reminders do not
 * count. Returns 0 when the invoice has never been part of a sent
 * reminder.
 */
export async function getCurrentDunningLevel(
  prisma: PrismaClient,
  billingDocumentId: string
): Promise<number> {
  const result = await prisma.reminderItem.findFirst({
    where: {
      billingDocumentId,
      reminder: { status: "SENT" },
    },
    orderBy: { levelAtReminder: "desc" },
    select: { levelAtReminder: true },
  })
  return result?.levelAtReminder ?? 0
}

export type ReminderStatusInfo =
  | { status: "never" }
  | { status: "sent"; level: number; sentAt: Date }

/**
 * Returns a small summary of an invoice's reminder history — used by the
 * billing-document detail UI to show "last reminder: stage X on date Y".
 */
export async function getReminderStatus(
  prisma: PrismaClient,
  billingDocumentId: string
): Promise<ReminderStatusInfo> {
  const latest = await prisma.reminderItem.findFirst({
    where: {
      billingDocumentId,
      reminder: { status: "SENT" },
    },
    include: { reminder: true },
    orderBy: { levelAtReminder: "desc" },
  })
  if (!latest || !latest.reminder.sentAt) return { status: "never" }
  return {
    status: "sent",
    level: latest.levelAtReminder,
    sentAt: latest.reminder.sentAt,
  }
}
