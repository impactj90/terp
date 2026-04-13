import type { PrismaClient } from "@/generated/prisma/client"
import { computeDueDate } from "./billing-payment-service"
import { calculateInterest, feeForLevel } from "./dunning-interest-service"
import { getCurrentDunningLevel } from "./reminder-level-helper"
import { getSettings } from "./reminder-settings-service"

// --- Types ---

/**
 * Why an invoice is or isn't eligible for the proposal. `ok` means
 * eligible. The other variants name the filter that excluded the
 * invoice. `max_level_reached` is distinct from `fully_paid`: the
 * invoice still has an open amount, but every dunning stage has
 * already been sent.
 */
export type EligibilityReason =
  | "ok"
  | "no_payment_term"
  | "wrong_status"
  | "wrong_type"
  | "not_overdue_yet"
  | "in_grace_period"
  | "fully_paid"
  | "invoice_blocked"
  | "customer_blocked"
  | "in_discount_period"
  | "max_level_reached"
  | "dunning_disabled"

export type EligibleInvoice = {
  billingDocumentId: string
  invoiceNumber: string
  invoiceDate: Date
  dueDate: Date
  daysOverdue: number
  openAmount: number
  currentLevel: number
  targetLevel: number
  interestAmount: number
  feeAmount: number
  reason: EligibilityReason
}

export type EligibleCustomerGroup = {
  customerAddressId: string
  customerName: string
  customerEmail: string | null
  groupTargetLevel: number
  invoices: EligibleInvoice[]
  totalOpenAmount: number
  totalInterest: number
  totalFees: number
  totalDue: number
}

// Loose shape from the Prisma include used in listEligibleInvoices.
// We accept any so this service can be unit-tested without dragging in
// Prisma types — the integration tests pin real-DB behavior.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CandidateDoc = any

// --- Public API ---

/**
 * Lists customers + invoices that are currently eligible for a dunning
 * run, applying the D5 filter chain. Returns groups sorted by customer
 * name. Returns an empty array when dunning is disabled for the tenant.
 */
export async function listEligibleInvoices(
  prisma: PrismaClient,
  tenantId: string
): Promise<EligibleCustomerGroup[]> {
  const settings = await getSettings(prisma, tenantId)
  if (!settings.enabled) return []

  const candidates: CandidateDoc[] = await prisma.billingDocument.findMany({
    where: {
      tenantId,
      type: "INVOICE",
      status: { in: ["PRINTED", "FORWARDED", "PARTIALLY_FORWARDED"] },
    },
    include: {
      payments: true,
      childDocuments: true,
      address: true,
    },
  })

  const now = new Date()
  const gracePeriodFirstLevel = settings.gracePeriodDays[0] ?? 7
  const groups = new Map<string, EligibleCustomerGroup>()

  for (const doc of candidates) {
    const evaluated = await evaluateInvoice(
      prisma,
      doc,
      settings,
      now,
      gracePeriodFirstLevel
    )
    if (evaluated.reason !== "ok") continue
    const addressId: string | undefined = doc.addressId
    if (!addressId) continue

    let group = groups.get(addressId)
    if (!group) {
      group = {
        customerAddressId: addressId,
        customerName: doc.address?.company ?? "(unbenannt)",
        customerEmail: doc.address?.email ?? null,
        groupTargetLevel: evaluated.targetLevel,
        invoices: [],
        totalOpenAmount: 0,
        totalInterest: 0,
        totalFees: 0,
        totalDue: 0,
      }
      groups.set(addressId, group)
    }

    group.invoices.push(evaluated)
    group.totalOpenAmount += evaluated.openAmount
    group.totalInterest += evaluated.interestAmount
    if (evaluated.targetLevel > group.groupTargetLevel) {
      group.groupTargetLevel = evaluated.targetLevel
    }
  }

  // Fee is per reminder, not per invoice — apply once per group.
  for (const group of groups.values()) {
    group.totalFees = feeForLevel(settings.feeAmounts, group.groupTargetLevel)
    group.totalDue =
      round2(group.totalOpenAmount) +
      round2(group.totalInterest) +
      round2(group.totalFees)
    group.totalOpenAmount = round2(group.totalOpenAmount)
    group.totalInterest = round2(group.totalInterest)
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.customerName.localeCompare(b.customerName)
  )
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// --- Filter chain (D5) ---

type SettingsLike = {
  maxLevel: number
  interestEnabled: boolean
  interestRatePercent: number
  feeAmounts: number[]
}

/**
 * Evaluates a single invoice against the D5 filter chain. Exposed for
 * the per-case test matrix in Phase 4. Order of the checks matters: the
 * first failing filter wins, so the reported reason names the most
 * fundamental disqualifier.
 */
export async function evaluateInvoice(
  prisma: PrismaClient,
  doc: CandidateDoc,
  settings: SettingsLike,
  now: Date,
  gracePeriodFirstLevel: number
): Promise<EligibleInvoice> {
  if (doc.type !== "INVOICE") return makeIneligible(doc, "wrong_type")
  if (doc.paymentTermDays === null || doc.paymentTermDays === undefined) {
    return makeIneligible(doc, "no_payment_term")
  }
  if (doc.dunningBlocked) return makeIneligible(doc, "invoice_blocked")
  if (doc.address?.dunningBlocked) {
    return makeIneligible(doc, "customer_blocked")
  }

  const dueDate = computeDueDate(doc.documentDate, doc.paymentTermDays)
  if (!dueDate) return makeIneligible(doc, "no_payment_term")

  const daysOverdue = Math.floor(
    (now.getTime() - dueDate.getTime()) / 86400000
  )
  if (daysOverdue < 0) return makeIneligible(doc, "not_overdue_yet")
  if (daysOverdue < gracePeriodFirstLevel) {
    return makeIneligible(doc, "in_grace_period")
  }

  // Open amount calculation — live, mirrors billing-payment-service.enrichOpenItem
  const creditNoteReduction = ((doc.childDocuments ?? []) as Array<{
    totalGross: number
  }>).reduce((sum, cn) => sum + cn.totalGross, 0)
  const effectiveTotalGross = doc.totalGross - creditNoteReduction
  const paidAmount = ((doc.payments ?? []) as Array<{
    amount: number
    status: string
  }>)
    .filter((p) => p.status === "ACTIVE")
    .reduce((sum, p) => sum + p.amount, 0)
  const openAmount = Math.max(0, effectiveTotalGross - paidAmount)
  if (openAmount <= 0) return makeIneligible(doc, "fully_paid")

  // Skonto-Tier-2 exclusion
  if (
    doc.discountDays2 !== null &&
    doc.discountDays2 !== undefined &&
    doc.discountDays2 > 0
  ) {
    const skontoDeadline = new Date(doc.documentDate)
    skontoDeadline.setDate(skontoDeadline.getDate() + doc.discountDays2)
    if (skontoDeadline > now) {
      return makeIneligible(doc, "in_discount_period")
    }
  }

  // Cap at maxLevel — once an invoice has been dunned at the highest
  // configured stage, it drops out of the proposal under its own
  // dedicated reason `max_level_reached` (distinct from `fully_paid`).
  const currentLevel = await getCurrentDunningLevel(prisma, doc.id)
  if (currentLevel >= settings.maxLevel) {
    return makeIneligible(doc, "max_level_reached")
  }
  const targetLevel = currentLevel + 1

  const interestAmount = settings.interestEnabled
    ? calculateInterest(openAmount, daysOverdue, settings.interestRatePercent)
    : 0

  return {
    billingDocumentId: doc.id,
    invoiceNumber: doc.number,
    invoiceDate: doc.documentDate,
    dueDate,
    daysOverdue,
    openAmount: round2(openAmount),
    currentLevel,
    targetLevel,
    interestAmount,
    feeAmount: 0, // fee is applied per reminder, not per invoice
    reason: "ok",
  }
}

function makeIneligible(
  doc: CandidateDoc,
  reason: EligibilityReason
): EligibleInvoice {
  return {
    billingDocumentId: doc.id,
    invoiceNumber: doc.number,
    invoiceDate: doc.documentDate,
    dueDate: doc.documentDate,
    daysOverdue: 0,
    openAmount: 0,
    currentLevel: 0,
    targetLevel: 0,
    interestAmount: 0,
    feeAmount: 0,
    reason,
  }
}
