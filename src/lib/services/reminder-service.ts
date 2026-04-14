import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./reminder-repository"
import * as eligibilityService from "./reminder-eligibility-service"
import * as templateService from "./reminder-template-service"
import { getSettings } from "./reminder-settings-service"
import { feeForLevel } from "./dunning-interest-service"
import * as reminderPdfService from "./reminder-pdf-service"
import * as emailSendService from "./email-send-service"
import * as crmCorrespondenceService from "./crm-correspondence-service"
import * as auditLog from "./audit-logs-service"
import { download } from "@/lib/supabase/storage"
import {
  resolvePlaceholders,
  buildContactPlaceholders,
} from "@/lib/templates/placeholder-resolver"

// --- Error Classes ---

export class ReminderNotFoundError extends Error {
  constructor(id: string) {
    super(`Reminder "${id}" not found`)
    this.name = "ReminderNotFoundError"
  }
}

export class ReminderValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReminderValidationError"
  }
}

// --- Types ---

export type CreateRunInput = {
  groups: Array<{
    customerAddressId: string
    billingDocumentIds: string[]
  }>
}

export type CreateRunResult = {
  reminderIds: string[]
  skippedInvoices: Array<{ billingDocumentId: string; reason: string }>
}

// --- Number Generation (MA-YYYY-NNN, yearly reset) ---

/**
 * Generates the next reminder number in the format `MA-YYYY-NNN` where
 * the counter resets each calendar year. Uses a per-year NumberSequence
 * key (`dunning_2026`, `dunning_2027`, ...) so years are isolated.
 *
 * Atomic via Prisma upsert with `increment` — safe under concurrent
 * calls within a transaction.
 */
export async function getNextReminderNumber(
  prisma: PrismaClient,
  tenantId: string,
  now: Date = new Date()
): Promise<string> {
  const year = now.getFullYear()
  const key = `dunning_${year}`
  const prefix = `MA-${year}-`
  const seq = await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, key, prefix, nextValue: 2 },
  })
  const value = seq.nextValue - 1
  return `${prefix}${String(value).padStart(3, "0")}`
}

// --- createRun ---

/**
 * Creates draft reminders from a customer-grouped selection. The
 * selection is re-validated against the live eligibility result —
 * client-supplied amounts are ignored. One reminder is created per
 * customer (Sammelmahnung).
 *
 * Idempotency note: if a billing document already has a DRAFT reminder
 * row, it is skipped and reported in `skippedInvoices`. The full
 * parallel-race window is documented as a known limitation in the
 * handbook (Phase 5); the sequential guard here covers the common case
 * of an operator clicking twice in quick succession.
 */
export async function createRun(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateRunInput,
  createdById: string | null
): Promise<CreateRunResult> {
  if (input.groups.length === 0) {
    return { reminderIds: [], skippedInvoices: [] }
  }

  const settings = await getSettings(prisma, tenantId)
  if (!settings.enabled) {
    throw new ReminderValidationError("Mahnwesen ist nicht aktiviert")
  }

  // Pull live eligibility — never trust client-supplied amounts.
  const liveGroups = await eligibilityService.listEligibleInvoices(
    prisma,
    tenantId
  )
  const liveByCustomer = new Map<
    string,
    eligibilityService.EligibleCustomerGroup
  >()
  for (const g of liveGroups) liveByCustomer.set(g.customerAddressId, g)

  const reminderIds: string[] = []
  const skippedInvoices: Array<{ billingDocumentId: string; reason: string }> =
    []

  return await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    for (const requested of input.groups) {
      const liveGroup = liveByCustomer.get(requested.customerAddressId)
      if (!liveGroup) {
        for (const id of requested.billingDocumentIds) {
          skippedInvoices.push({
            billingDocumentId: id,
            reason: "customer_not_eligible",
          })
        }
        continue
      }

      const liveItemsById = new Map(
        liveGroup.invoices.map((i) => [i.billingDocumentId, i])
      )

      const itemsToInclude: Array<eligibilityService.EligibleInvoice> = []
      for (const id of requested.billingDocumentIds) {
        const liveItem = liveItemsById.get(id)
        if (!liveItem) {
          skippedInvoices.push({
            billingDocumentId: id,
            reason: "not_eligible",
          })
          continue
        }
        const hasDraft = await repo.hasDraftItemForInvoice(txPrisma, tenantId, id)
        if (hasDraft) {
          skippedInvoices.push({
            billingDocumentId: id,
            reason: "draft_already_exists",
          })
          continue
        }
        itemsToInclude.push(liveItem)
      }

      if (itemsToInclude.length === 0) continue

      const groupTargetLevel = itemsToInclude.reduce(
        (max, item) => Math.max(max, item.targetLevel),
        1
      )

      // Pick the default template for the group's stage.
      const template = await templateService.getDefaultForLevel(
        txPrisma,
        tenantId,
        groupTargetLevel
      )

      // Resolve placeholders against the customer address only —
      // contact-level lookup happens in Phase 2 when the email send
      // flow joins the primary contact.
      const customerAddress = await txPrisma.crmAddress.findUnique({
        where: { id: requested.customerAddressId },
      })
      const placeholderCtx = buildContactPlaceholders(
        customerAddress
          ? { company: customerAddress.company }
          : null,
        null
      )
      const headerText = template?.headerText
        ? resolvePlaceholders(template.headerText, placeholderCtx)
        : ""
      const footerText = template?.footerText
        ? resolvePlaceholders(template.footerText, placeholderCtx)
        : ""

      const totalOpenAmount = itemsToInclude.reduce(
        (sum, item) => sum + item.openAmount,
        0
      )
      const totalInterest = itemsToInclude.reduce(
        (sum, item) => sum + item.interestAmount,
        0
      )
      const totalFees = feeForLevel(settings.feeAmounts, groupTargetLevel)
      const totalDue =
        round2(totalOpenAmount) + round2(totalInterest) + round2(totalFees)

      const number = await getNextReminderNumber(txPrisma, tenantId)

      const reminder = await repo.create(txPrisma, {
        tenantId,
        number,
        customerAddressId: requested.customerAddressId,
        level: groupTargetLevel,
        headerText,
        footerText,
        totalOpenAmount: round2(totalOpenAmount),
        totalInterest: round2(totalInterest),
        totalFees: round2(totalFees),
        totalDue: round2(totalDue),
        createdById,
        items: itemsToInclude.map((item) => ({
          billingDocumentId: item.billingDocumentId,
          invoiceNumber: item.invoiceNumber,
          invoiceDate: item.invoiceDate,
          dueDate: item.dueDate,
          originalAmount: round2(item.openAmount),
          openAmountAtReminder: round2(item.openAmount),
          daysOverdue: item.daysOverdue,
          interestAmount: round2(item.interestAmount),
          feeAmount: 0,
          levelAtReminder: item.targetLevel,
        })),
      })

      reminderIds.push(reminder.id)
    }

    return { reminderIds, skippedInvoices }
  })
}

// --- cancelReminder ---

/**
 * Cancels a reminder. Allowed in DRAFT and SENT — DRAFT is essentially
 * a discard, SENT is the operator-facing storno that creates a follow-up
 * audit row in the router layer. This service intentionally does not
 * touch CrmCorrespondence; the router orchestrates that side effect.
 */
export async function cancelReminder(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const reminder = await prisma.reminder.findFirst({
    where: { id, tenantId },
  })
  if (!reminder) throw new ReminderNotFoundError(id)
  if (reminder.status === "CANCELLED") {
    throw new ReminderValidationError(
      "Reminder is already cancelled"
    )
  }
  return await repo.updateStatus(prisma, id, "CANCELLED")
}

// --- markSent ---

/**
 * Marks a reminder as SENT once the email/letter side effect has
 * completed successfully. Phase 2 wires this up after PDF + email send.
 */
export async function markSent(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  sendMethod: "email" | "letter" | "manual",
  pdfStoragePath: string | null,
  sentById: string | null
) {
  const reminder = await prisma.reminder.findFirst({
    where: { id, tenantId },
  })
  if (!reminder) throw new ReminderNotFoundError(id)
  if (reminder.status !== "DRAFT") {
    throw new ReminderValidationError(
      "Only DRAFT reminders can be marked as sent"
    )
  }
  return await prisma.reminder.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      sentById,
      sendMethod,
      pdfStoragePath,
    },
  })
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// --- Send Flow ---

export class ReminderSendError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReminderSendError"
  }
}

const REMINDER_BUCKET = "documents"

/**
 * Finalizes a draft reminder via email send. Orchestrates: PDF generation
 * (idempotent on storage path), generic email send via email-send-service,
 * status update, and CrmCorrespondence row creation. PDF + email are
 * outside the DB transaction because both are external I/O — only the
 * status update + correspondence row are atomic at the end.
 *
 * Throws ReminderSendError when the reminder is not in DRAFT, the customer
 * has no email, every contained invoice has been paid since the proposal,
 * or the underlying email send fails. PDF stays uploaded on email failure
 * so retry doesn't re-render.
 */
export async function sendReminder(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string,
  sentById: string
) {
  await refreshDraftReminder(prisma, tenantId, reminderId)

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, tenantId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      customerAddress: true,
    },
  })
  if (!reminder) throw new ReminderNotFoundError(reminderId)
  if (reminder.status !== "DRAFT") {
    throw new ReminderValidationError(
      "Nur DRAFT-Mahnungen können versendet werden"
    )
  }

  const recipientEmail = reminder.customerAddress.email
  if (!recipientEmail) {
    throw new ReminderSendError(
      "Kunde hat keine E-Mail-Adresse hinterlegt"
    )
  }

  // Safety net: refuse the send if every included invoice has been
  // paid in full since the DRAFT was created. Operators can cancel
  // the draft and start over with the live proposal.
  const stillOpen = await areAnyItemsStillOpen(prisma, tenantId, reminder.items)
  if (!stillOpen) {
    throw new ReminderSendError(
      "Alle enthaltenen Rechnungen sind mittlerweile bezahlt"
    )
  }

  // 1. Render + upload PDF (idempotent).
  const pdfPath = await reminderPdfService.generateAndStorePdf(
    prisma,
    tenantId,
    reminderId
  )

  // 2. Pull the rendered PDF back out of storage so we can attach it.
  const pdfBlob = await download(REMINDER_BUCKET, pdfPath)
  if (!pdfBlob) {
    throw new ReminderSendError("Reminder PDF nicht im Storage gefunden")
  }
  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())
  const pdfFilename = `${reminder.number.replace(/[/\\]/g, "_")}.pdf`

  // 3. Resolve email subject/body from the level template, falling back
  //    to a default when no template exists for that level.
  const template = await templateService.getDefaultForLevel(
    prisma,
    tenantId,
    reminder.level
  )
  const placeholderCtx = buildContactPlaceholders(
    { company: reminder.customerAddress.company },
    null
  )
  const subjectRaw =
    template?.emailSubject && template.emailSubject.length > 0
      ? template.emailSubject
      : `Mahnung ${reminder.number}`
  const bodyHtmlRaw =
    template?.emailBody && template.emailBody.length > 0
      ? template.emailBody
      : "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unsere Mahnung.\n\nMit freundlichen Grüßen"
  const subject = resolvePlaceholders(subjectRaw, {
    ...placeholderCtx,
    rechnungsnummer: reminder.number,
    mahnnummer: reminder.number,
  })
  const bodyHtml = resolvePlaceholders(bodyHtmlRaw, placeholderCtx).replace(
    /\n/g,
    "<br>"
  )

  // 4. Send the email. Throws ReminderEmailSendError on failure; we let
  //    that propagate so the reminder stays DRAFT and the operator can
  //    retry after fixing SMTP. The PDF stays uploaded.
  await emailSendService.sendReminderEmail(
    prisma,
    tenantId,
    {
      reminderId,
      toEmail: recipientEmail,
      subject,
      bodyHtml,
      pdfBuffer,
      pdfFilename,
    },
    sentById
  )

  // 5. Atomic: mark sent + create CrmCorrespondence row.
  const sentReminder = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient
    const updated = await txPrisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        sentById,
        sendMethod: "email",
        pdfStoragePath: pdfPath,
      },
    })
    await crmCorrespondenceService.create(
      txPrisma,
      tenantId,
      {
        addressId: reminder.customerAddressId,
        direction: "OUTGOING",
        type: "email",
        date: new Date(),
        toUser: recipientEmail,
        subject: `Mahnung ${reminder.number} — Stufe ${reminder.level}`,
        content: bodyHtml,
      },
      sentById
    )
    return updated
  })

  // 6. Audit log fire-and-forget.
  await auditLog.log(prisma, {
    tenantId,
    userId: sentById,
    action: "reminder_sent",
    entityType: "reminder",
    entityId: reminderId,
    entityName: reminder.number,
    metadata: { method: "email", level: reminder.level },
  }).catch((err) => console.error("[AuditLog] reminder_sent failed:", err))

  return sentReminder
}

/**
 * Marks a draft reminder as sent without dispatching an email. Used for
 * the "letter" / "manual" send methods where the operator hand-prints
 * the PDF or otherwise delivers it offline. Still generates the PDF,
 * still creates a CrmCorrespondence row (type=letter or note).
 */
export async function markSentManually(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string,
  method: "letter" | "manual",
  sentById: string
) {
  await refreshDraftReminder(prisma, tenantId, reminderId)

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, tenantId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      customerAddress: true,
    },
  })
  if (!reminder) throw new ReminderNotFoundError(reminderId)
  if (reminder.status !== "DRAFT") {
    throw new ReminderValidationError(
      "Nur DRAFT-Mahnungen können als versendet markiert werden"
    )
  }

  const stillOpen = await areAnyItemsStillOpen(prisma, tenantId, reminder.items)
  if (!stillOpen) {
    throw new ReminderSendError(
      "Alle enthaltenen Rechnungen sind mittlerweile bezahlt"
    )
  }

  const pdfPath = await reminderPdfService.generateAndStorePdf(
    prisma,
    tenantId,
    reminderId
  )

  const correspondenceType = method === "letter" ? "letter" : "note"

  const updated = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient
    const result = await txPrisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        sentById,
        sendMethod: method,
        pdfStoragePath: pdfPath,
      },
    })
    await crmCorrespondenceService.create(
      txPrisma,
      tenantId,
      {
        addressId: reminder.customerAddressId,
        direction: "OUTGOING",
        type: correspondenceType,
        date: new Date(),
        subject: `Mahnung ${reminder.number} — Stufe ${reminder.level}`,
        content:
          method === "letter"
            ? "Mahnung als Brief versendet."
            : "Mahnung manuell als versendet markiert.",
      },
      sentById
    )
    return result
  })

  await auditLog.log(prisma, {
    tenantId,
    userId: sentById,
    action: "reminder_sent",
    entityType: "reminder",
    entityId: reminderId,
    entityName: reminder.number,
    metadata: { method, level: reminder.level },
  }).catch((err) => console.error("[AuditLog] reminder_sent failed:", err))

  return updated
}

/**
 * Checks whether at least one item in the reminder still has a positive
 * open amount. Used as a safety net before sending so a reminder that
 * was paid between DRAFT and SEND doesn't go out.
 */
async function areAnyItemsStillOpen(
  prisma: PrismaClient,
  tenantId: string,
  items: Array<{ billingDocumentId: string }>
): Promise<boolean> {
  if (items.length === 0) return false
  const docs = await prisma.billingDocument.findMany({
    where: {
      tenantId,
      id: { in: items.map((i) => i.billingDocumentId) },
    },
    include: { payments: true, childDocuments: true },
  })
  for (const doc of docs) {
    const creditNoteReduction = (doc.childDocuments ?? []).reduce(
      (sum, cn) => sum + cn.totalGross,
      0
    )
    const effectiveTotalGross = doc.totalGross - creditNoteReduction
    const paid = (doc.payments ?? [])
      .filter((p) => p.status === "ACTIVE")
      .reduce((sum, p) => sum + p.amount, 0)
    if (effectiveTotalGross - paid > 0.005) return true
  }
  return false
}

/**
 * For DRAFT reminders: re-computes openAmountAtReminder per item live
 * from BillingDocument.payments/childDocuments, removes fully-paid items
 * and updates the header sums. No-op on SENT/CANCELLED reminders.
 *
 * Why: reminder items are snapshot at proposal time; customers may pay
 * in the window between proposal and send. Running the refresh both on
 * detail-load and on send guarantees the operator never mahns a paid
 * invoice. levelAtReminder/daysOverdue/interestAmount stay historical.
 */
export async function refreshDraftReminder(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string
): Promise<void> {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, tenantId },
    include: { items: true },
  })
  if (!reminder) throw new ReminderNotFoundError(reminderId)
  if (reminder.status !== "DRAFT") return

  if (reminder.items.length === 0) return

  const docIds = reminder.items.map((i) => i.billingDocumentId)
  const docs = await prisma.billingDocument.findMany({
    where: { tenantId, id: { in: docIds } },
    include: { payments: true, childDocuments: true },
  })
  const docById = new Map(docs.map((d) => [d.id, d]))

  const toDelete: string[] = []
  const toUpdate: Array<{ id: string; openAmount: number }> = []

  for (const item of reminder.items) {
    const doc = docById.get(item.billingDocumentId)
    if (!doc) {
      toDelete.push(item.id)
      continue
    }
    const creditNoteReduction = (doc.childDocuments ?? [])
      .filter((cn) => cn.type === "CREDIT_NOTE" && cn.status !== "CANCELLED")
      .reduce((sum, cn) => sum + cn.totalGross, 0)
    const effectiveTotalGross = doc.totalGross - creditNoteReduction
    const paidAmount = (doc.payments ?? [])
      .filter((p) => p.status === "ACTIVE")
      .reduce((sum, p) => sum + p.amount, 0)
    const liveOpen = Math.max(0, effectiveTotalGross - paidAmount)
    const rounded = round2(liveOpen)

    if (rounded <= 0.005) {
      toDelete.push(item.id)
    } else if (Math.abs(rounded - item.openAmountAtReminder) > 0.005) {
      toUpdate.push({ id: item.id, openAmount: rounded })
    }
  }

  if (toDelete.length === 0 && toUpdate.length === 0) return

  await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient
    if (toDelete.length > 0) {
      await txPrisma.reminderItem.deleteMany({
        where: { id: { in: toDelete }, tenantId },
      })
    }
    for (const u of toUpdate) {
      await txPrisma.reminderItem.update({
        where: { id: u.id },
        data: { openAmountAtReminder: u.openAmount },
      })
    }

    const remaining = await txPrisma.reminderItem.findMany({
      where: { reminderId, tenantId },
    })
    const totalOpenAmount = round2(
      remaining.reduce((s, i) => s + i.openAmountAtReminder, 0)
    )
    const totalInterest = round2(
      remaining.reduce((s, i) => s + i.interestAmount, 0)
    )
    await txPrisma.reminder.update({
      where: { id: reminderId },
      data: {
        totalOpenAmount,
        totalInterest,
        totalDue: round2(totalOpenAmount + totalInterest + reminder.totalFees),
      },
    })
  })
}

/**
 * Detail-view load path for reminders. For DRAFT reminders the open
 * amounts are refreshed before returning so the operator always sees
 * the live numbers. For SENT/CANCELLED reminders it's just a read.
 */
export async function getReminderForView(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string
) {
  await refreshDraftReminder(prisma, tenantId, reminderId)
  const result = await repo.findById(prisma, tenantId, reminderId)
  if (!result) throw new ReminderNotFoundError(reminderId)
  return result
}

// --- Dunning Blocks ---

/**
 * Sets or removes the dunning block on a billing document. Block flag
 * lives directly on `billing_documents`; the eligibility filter chain
 * picks it up automatically next time the proposal is queried.
 */
export async function setInvoiceBlock(
  prisma: PrismaClient,
  tenantId: string,
  billingDocumentId: string,
  blocked: boolean,
  reason: string | null,
  userId: string
) {
  const doc = await prisma.billingDocument.findFirst({
    where: { id: billingDocumentId, tenantId },
    select: { id: true },
  })
  if (!doc) {
    throw new ReminderNotFoundError(billingDocumentId)
  }

  const updated = await prisma.billingDocument.update({
    where: { id: billingDocumentId },
    data: {
      dunningBlocked: blocked,
      dunningBlockReason: blocked ? reason : null,
    },
    select: {
      id: true,
      number: true,
      dunningBlocked: true,
      dunningBlockReason: true,
    },
  })

  await auditLog.log(prisma, {
    tenantId,
    userId,
    action: blocked ? "dunning_block_set" : "dunning_block_removed",
    entityType: "billing_document",
    entityId: billingDocumentId,
    entityName: updated.number,
    metadata: { reason },
  }).catch((err) => console.error("[AuditLog] dunning_block failed:", err))

  return updated
}

/**
 * Sets or removes the dunning block on a customer address. Affects every
 * invoice belonging to that customer.
 */
export async function setCustomerBlock(
  prisma: PrismaClient,
  tenantId: string,
  customerAddressId: string,
  blocked: boolean,
  reason: string | null,
  userId: string
) {
  const address = await prisma.crmAddress.findFirst({
    where: { id: customerAddressId, tenantId },
    select: { id: true },
  })
  if (!address) {
    throw new ReminderNotFoundError(customerAddressId)
  }

  const updated = await prisma.crmAddress.update({
    where: { id: customerAddressId },
    data: {
      dunningBlocked: blocked,
      dunningBlockReason: blocked ? reason : null,
    },
    select: {
      id: true,
      company: true,
      dunningBlocked: true,
      dunningBlockReason: true,
    },
  })

  await auditLog.log(prisma, {
    tenantId,
    userId,
    action: blocked ? "dunning_block_set" : "dunning_block_removed",
    entityType: "crm_address",
    entityId: customerAddressId,
    entityName: updated.company,
    metadata: { reason },
  }).catch((err) => console.error("[AuditLog] dunning_block failed:", err))

  return updated
}

/**
 * Cancels a SENT reminder and writes a follow-up CrmCorrespondence note
 * documenting the storno. The plain `cancelReminder` (above) is the
 * service-level primitive; this wrapper layers the side-effects the
 * router needs in one place so both DRAFT-discard and SENT-storno paths
 * can share an audit footprint.
 */
export async function cancelReminderWithSideEffects(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string,
  reason: string | null,
  cancelledById: string
) {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, tenantId },
  })
  if (!reminder) throw new ReminderNotFoundError(reminderId)
  if (reminder.status === "CANCELLED") {
    throw new ReminderValidationError("Reminder is already cancelled")
  }

  const wasSent = reminder.status === "SENT"

  const cancelled = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient
    const result = await txPrisma.reminder.update({
      where: { id: reminderId },
      data: { status: "CANCELLED" },
    })
    if (wasSent) {
      await crmCorrespondenceService.create(
        txPrisma,
        tenantId,
        {
          addressId: reminder.customerAddressId,
          direction: "OUTGOING",
          type: "note",
          date: new Date(),
          subject: `Mahnung ${reminder.number} storniert`,
          content: reason ?? "Mahnung wurde storniert.",
        },
        cancelledById
      )
    }
    return result
  })

  await auditLog.log(prisma, {
    tenantId,
    userId: cancelledById,
    action: "reminder_cancelled",
    entityType: "reminder",
    entityId: reminderId,
    entityName: reminder.number,
    metadata: { previousStatus: reminder.status, reason },
  }).catch((err) => console.error("[AuditLog] reminder_cancelled failed:", err))

  return cancelled
}
