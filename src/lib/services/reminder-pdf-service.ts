import type { PrismaClient } from "@/generated/prisma/client"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { ReminderPdf } from "@/lib/pdf/reminder-pdf"
import * as storage from "@/lib/supabase/storage"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"

export class ReminderPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReminderPdfError"
  }
}

const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 60

function storagePathFor(tenantId: string, reminderId: string): string {
  return `reminders/${tenantId}/${reminderId}.pdf`
}

/**
 * Renders the reminder PDF and uploads it to Supabase Storage. Returns
 * the storage path. Idempotent: re-running overwrites the existing file
 * at the same path.
 */
export async function generateAndStorePdf(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string
): Promise<string> {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, tenantId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      customerAddress: {
        select: { company: true, street: true, zip: true, city: true },
      },
    },
  })
  if (!reminder) {
    throw new ReminderPdfError(`Reminder ${reminderId} not found`)
  }

  const tenantConfig = await billingTenantConfigRepo.findByTenantId(
    prisma,
    tenantId
  )

  const element = React.createElement(ReminderPdf, {
    reminder: {
      number: reminder.number,
      level: reminder.level,
      headerText: reminder.headerText,
      footerText: reminder.footerText,
      totalOpenAmount: reminder.totalOpenAmount,
      totalInterest: reminder.totalInterest,
      totalFees: reminder.totalFees,
      totalDue: reminder.totalDue,
      createdAt: reminder.createdAt,
    },
    items: reminder.items.map((i) => ({
      invoiceNumber: i.invoiceNumber,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      openAmountAtReminder: i.openAmountAtReminder,
      daysOverdue: i.daysOverdue,
      interestAmount: i.interestAmount,
    })),
    address: reminder.customerAddress,
    tenantConfig,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any)
  const path = storagePathFor(tenantId, reminderId)

  try {
    await storage.upload(BUCKET, path, Buffer.from(buffer), {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new ReminderPdfError(
      `Reminder PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`
    )
  }

  return path
}

/**
 * Returns a temporary signed URL for the reminder PDF, or null when the
 * file has not been generated yet.
 */
export async function getSignedDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string
): Promise<{ signedUrl: string; filename: string } | null> {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, tenantId },
    select: { number: true, pdfStoragePath: true },
  })
  if (!reminder?.pdfStoragePath) return null

  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    reminder.pdfStoragePath,
    SIGNED_URL_EXPIRY_SECONDS
  )
  if (!signedUrl) return null

  const filename = `${reminder.number.replace(/[/\\]/g, "_")}.pdf`
  return { signedUrl, filename }
}
