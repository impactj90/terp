import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./reminder-repository"
import * as eligibilityService from "./reminder-eligibility-service"
import * as templateService from "./reminder-template-service"
import { getSettings } from "./reminder-settings-service"
import { feeForLevel } from "./dunning-interest-service"
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
