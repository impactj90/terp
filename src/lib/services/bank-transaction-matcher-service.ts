import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import type { BankTransaction } from "@/generated/prisma/client"
import { normalizeIban } from "@/lib/sepa/iban-validator"
import { getApplicableDiscount } from "@/lib/billing/payment-discount"
import { hasPlatformSubscriptionMarker } from "@/lib/platform/subscription-service"
import * as crmAddressRepo from "./crm-address-repository"
import * as billingPaymentRepo from "./billing-payment-repository"
import { enrichOpenItem } from "./billing-payment-service"
import * as billingPaymentService from "./billing-payment-service"
import * as inboundInvoicePaymentService from "./inbound-invoice-payment-service"
import type { TenantPrefixSnapshot } from "./number-sequence-service"
import {
  buildInvoiceNumberRegex,
  buildInboundNumberRegex,
  extractInvoiceNumbers,
  extractFreeformInvoiceNumbers,
  compareAmountWithSkonto,
} from "./bank-transaction-matcher-helpers"
import * as inboundPaymentRepo from "./inbound-invoice-payment-repository"
import { computeInboundPaymentStatus } from "./inbound-invoice-payment-service"
import * as auditLog from "./audit-logs-service"

type Tx = Prisma.TransactionClient

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export class BankTransactionMatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BankTransactionMatchError"
  }
}

export class BankTransactionMatchConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BankTransactionMatchConflictError"
  }
}

export interface MatchDecision {
  result: "matched" | "unmatched"
  reason?: string
  suggestedAddressId?: string | null
  allocation?: {
    billingDocumentId: string
    amount: number
    openAmount: number
    discount?: { percent: number; tier: 1 | 2 }
  }
}

export async function computeCreditMatchDecision(
  tx: Tx,
  tenantId: string,
  bankTx: BankTransaction,
  snapshot: TenantPrefixSnapshot,
): Promise<MatchDecision> {
  if (bankTx.currency !== "EUR") {
    return { result: "unmatched", reason: "foreign_currency" }
  }

  const iban = normalizeIban(bankTx.counterpartyIban ?? "")
  if (!iban) {
    return { result: "unmatched", reason: "no_iban" }
  }
  const addressHit = await crmAddressRepo.findAddressByIban(tx as unknown as PrismaClient, tenantId, iban)
  if (!addressHit) {
    return { result: "unmatched", reason: "iban_unknown" }
  }

  const openItems = await billingPaymentRepo.findOpenItems(tx as unknown as PrismaClient, tenantId, {
    addressId: addressHit.addressId,
    page: 1,
    pageSize: 1000,
  })

  const eligible = openItems.items.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc: any) => !hasPlatformSubscriptionMarker(doc.internalNotes ?? ""),
  )

  if (eligible.length === 0) {
    return { result: "unmatched", reason: "no_open_items", suggestedAddressId: addressHit.addressId }
  }

  const regex = buildInvoiceNumberRegex(snapshot)
  const refs = extractInvoiceNumbers(bankTx.remittanceInfo, regex)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = eligible.map((doc: any) => ({
    ...doc,
    ...enrichOpenItem(doc),
  }))

  const candidates = enriched.map((doc) => ({
    doc,
    comparison: compareAmountWithSkonto(
      bankTx.amount,
      {
        openAmount: doc.openAmount,
        effectiveTotalGross: doc.effectiveTotalGross,
        documentDate: doc.documentDate,
        discountPercent: doc.discountPercent ?? null,
        discountDays: doc.discountDays ?? null,
        discountPercent2: doc.discountPercent2 ?? null,
        discountDays2: doc.discountDays2 ?? null,
      },
      bankTx.valueDate,
      getApplicableDiscount,
    ),
  }))
  const amountMatches = candidates.filter((c) => c.comparison.match !== "none")

  if (amountMatches.length === 0) {
    return { result: "unmatched", reason: "no_amount_match", suggestedAddressId: addressHit.addressId }
  }

  let unique = amountMatches[0]!
  if (amountMatches.length > 1) {
    const withRefHit = refs.length > 0
      ? amountMatches.filter((c) => refs.some((r) => r.toUpperCase() === c.doc.number.toUpperCase()))
      : []
    if (withRefHit.length === 1) {
      unique = withRefHit[0]!
    } else {
      return { result: "unmatched", reason: "ambiguous", suggestedAddressId: addressHit.addressId }
    }
  }

  if (refs.length > 0 && !refs.some((r) => r.toUpperCase() === unique.doc.number.toUpperCase())) {
    return { result: "unmatched", reason: "remittance_conflict", suggestedAddressId: addressHit.addressId }
  }

  return {
    result: "matched",
    suggestedAddressId: addressHit.addressId,
    allocation: {
      billingDocumentId: unique.doc.id,
      amount: bankTx.amount,
      openAmount: unique.doc.openAmount,
      discount: unique.comparison.discount,
    },
  }
}

export async function runCreditMatchForTransaction(
  tx: Tx,
  tenantId: string,
  bankTxId: string,
  snapshot: TenantPrefixSnapshot,
  userId: string | null,
): Promise<MatchDecision> {
  const bankTx = await tx.bankTransaction.findUniqueOrThrow({ where: { id: bankTxId } })
  if (bankTx.direction !== "CREDIT") {
    throw new BankTransactionMatchError("runCreditMatch called on non-credit transaction")
  }

  const decision = await computeCreditMatchDecision(tx, tenantId, bankTx, snapshot)

  if (decision.suggestedAddressId !== undefined) {
    await tx.bankTransaction.update({
      where: { id: bankTxId },
      data: { suggestedAddressId: decision.suggestedAddressId },
    })
  }

  if (decision.result !== "matched" || !decision.allocation) return decision

  const txAsPrisma = tx as unknown as PrismaClient
  const payment = await billingPaymentRepo.createPayment(txAsPrisma, {
    tenantId,
    documentId: decision.allocation.billingDocumentId,
    date: bankTx.valueDate,
    amount: decision.allocation.amount,
    type: "BANK",
    notes: `CAMT ${bankTx.bankReference ?? bankTx.id}`,
    isDiscount: false,
    createdById: userId,
  })

  if (decision.allocation.discount) {
    const discountAmount = round2(
      decision.allocation.openAmount - bankTx.amount,
    )
    await billingPaymentRepo.createPayment(txAsPrisma, {
      tenantId,
      documentId: decision.allocation.billingDocumentId,
      date: bankTx.valueDate,
      amount: discountAmount,
      type: "BANK",
      notes: `CAMT Skonto ${decision.allocation.discount.percent}%`,
      isDiscount: true,
      createdById: userId,
    })
  }

  const allocation = await tx.billingDocumentBankAllocation.create({
    data: {
      tenantId,
      bankTransactionId: bankTxId,
      billingDocumentId: decision.allocation.billingDocumentId,
      billingPaymentId: payment.id,
      amount: decision.allocation.amount,
      autoMatched: true,
      matchedById: userId,
    },
  })

  await tx.billingPayment.update({
    where: { id: payment.id },
    data: { bankAllocationId: allocation.id },
  })

  await tx.bankTransaction.update({
    where: { id: bankTxId },
    data: { status: "matched" },
  })

  await auditLog.log(tx, {
    tenantId,
    userId,
    action: "match",
    entityType: "bank_transaction",
    entityId: bankTxId,
    metadata: {
      allocationId: allocation.id,
      billingDocumentId: decision.allocation.billingDocumentId,
      amount: decision.allocation.amount,
      auto: true,
    },
  }).catch(() => {})

  return decision
}

// --- Debit Match Path ---

export interface DebitMatchDecision {
  result: "matched" | "unmatched" | "consistency_confirmed"
  reason?: string
  suggestedAddressId?: string | null
  allocation?: {
    inboundInvoiceId: string
    amount: number
  }
  consistencyMatch?: {
    inboundInvoiceId: string
    paymentRunItemId?: string
  }
}

const DATE_TOLERANCE_DAYS = 3

function daysDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

export async function computeDebitMatchDecision(
  tx: Tx,
  tenantId: string,
  bankTx: BankTransaction,
  snapshot: TenantPrefixSnapshot,
): Promise<DebitMatchDecision> {
  if (bankTx.currency !== "EUR") {
    return { result: "unmatched", reason: "foreign_currency" }
  }

  // 1. endToEndId boost — look up PaymentRunItem
  let endToEndInvoice: {
    id: string
    invoiceNumber: string | null
    number: string
    totalGross: unknown
    paymentStatus: string
    supplierId: string | null
    dueDate: Date | null
    paymentRunItemId: string
  } | null = null

  if (bankTx.endToEndId) {
    const item = await tx.paymentRunItem.findFirst({
      where: { tenantId, endToEndId: bankTx.endToEndId },
      include: {
        inboundInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            number: true,
            totalGross: true,
            paymentStatus: true,
            supplierId: true,
            dueDate: true,
          },
        },
      },
    })
    if (item?.inboundInvoice) {
      const inv = item.inboundInvoice
      if (inv.paymentStatus === "PAID") {
        return {
          result: "consistency_confirmed",
          suggestedAddressId: inv.supplierId,
          consistencyMatch: {
            inboundInvoiceId: inv.id,
            paymentRunItemId: item.id,
          },
        }
      }
      endToEndInvoice = {
        ...inv,
        totalGross: inv.totalGross,
        paymentRunItemId: item.id,
      }
    }
  }

  // 2. Load open inbound invoices (UNPAID or PARTIAL, status APPROVED/EXPORTED)
  const openInvoices = await tx.inboundInvoice.findMany({
    where: {
      tenantId,
      paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      status: { in: ["APPROVED", "EXPORTED"] },
    },
    select: {
      id: true,
      invoiceNumber: true,
      number: true,
      totalGross: true,
      sellerIban: true,
      supplierId: true,
      dueDate: true,
      paidAmount: true,
    },
  })

  // 3. Verwendungszweck regex
  const inboundRegex = buildInboundNumberRegex(snapshot)
  const terpRefs = extractInvoiceNumbers(bankTx.remittanceInfo, inboundRegex)
  const freeformRefs = extractFreeformInvoiceNumbers(bankTx.remittanceInfo)

  type Candidate = (typeof openInvoices)[number] & { matchSource: "invoiceNumber" | "terpNumber" | "iban" | "endToEndId" }

  const candidates: Candidate[] = []

  // endToEndId candidate is highest priority
  if (endToEndInvoice) {
    const fromOpen = openInvoices.find((inv) => inv.id === endToEndInvoice!.id)
    if (fromOpen) {
      candidates.push({ ...fromOpen, matchSource: "endToEndId" })
    }
  }

  // invoiceNumber matches (supplier number — highest text-match priority)
  if (freeformRefs.length > 0) {
    for (const inv of openInvoices) {
      if (!inv.invoiceNumber) continue
      if (candidates.some((c) => c.id === inv.id)) continue
      if (freeformRefs.some((r) => r.toUpperCase() === inv.invoiceNumber!.toUpperCase())) {
        candidates.push({ ...inv, matchSource: "invoiceNumber" })
      }
    }
  }

  const hasInvoiceNumberHit = candidates.some((c) => c.matchSource === "invoiceNumber")

  // Terp number matches (lower priority — skip if invoiceNumber already matched)
  if (terpRefs.length > 0 && !hasInvoiceNumberHit) {
    for (const inv of openInvoices) {
      if (candidates.some((c) => c.id === inv.id)) continue
      if (terpRefs.some((r) => r.toUpperCase() === inv.number.toUpperCase())) {
        candidates.push({ ...inv, matchSource: "terpNumber" })
      }
    }
  }

  // 4. IBAN fallback
  if (candidates.length === 0 && bankTx.counterpartyIban) {
    const normalizedIban = normalizeIban(bankTx.counterpartyIban)
    if (normalizedIban) {
      for (const inv of openInvoices) {
        if (!inv.sellerIban) continue
        if (normalizeIban(inv.sellerIban) === normalizedIban) {
          candidates.push({ ...inv, matchSource: "iban" })
        }
      }
    }
  }

  if (candidates.length === 0) {
    return { result: "unmatched", reason: "no_candidates" }
  }

  // 5. Amount match + date tolerance ±3 days
  const amountDateFiltered = candidates.filter((c) => {
    const totalGross = c.totalGross ? Number(c.totalGross) : 0
    const openAmount = round2(totalGross - (c.paidAmount ?? 0))
    if (Math.abs(bankTx.amount - openAmount) > 0.01) return false
    if (c.dueDate && daysDiff(bankTx.valueDate, c.dueDate) > DATE_TOLERANCE_DAYS) return false
    return true
  })

  if (amountDateFiltered.length === 0) {
    const firstSupplier = candidates[0]?.supplierId ?? null
    return { result: "unmatched", reason: "no_amount_date_match", suggestedAddressId: firstSupplier }
  }

  // 6. Tiebreaker — endToEndId hit wins
  if (amountDateFiltered.length > 1) {
    const e2eHit = amountDateFiltered.find((c) => c.matchSource === "endToEndId")
    if (e2eHit) {
      return {
        result: "matched",
        suggestedAddressId: e2eHit.supplierId,
        allocation: { inboundInvoiceId: e2eHit.id, amount: bankTx.amount },
      }
    }
    const firstSupplier = amountDateFiltered[0]?.supplierId ?? null
    return { result: "unmatched", reason: "ambiguous", suggestedAddressId: firstSupplier }
  }

  const winner = amountDateFiltered[0]!
  return {
    result: "matched",
    suggestedAddressId: winner.supplierId,
    allocation: { inboundInvoiceId: winner.id, amount: bankTx.amount },
  }
}

export async function runDebitMatchForTransaction(
  tx: Tx,
  tenantId: string,
  bankTxId: string,
  snapshot: TenantPrefixSnapshot,
  userId: string | null,
): Promise<DebitMatchDecision> {
  const bankTx = await tx.bankTransaction.findUniqueOrThrow({ where: { id: bankTxId } })
  if (bankTx.direction !== "DEBIT") {
    throw new BankTransactionMatchError("runDebitMatch called on non-debit transaction")
  }

  const decision = await computeDebitMatchDecision(tx, tenantId, bankTx, snapshot)

  if (decision.suggestedAddressId !== undefined) {
    await tx.bankTransaction.update({
      where: { id: bankTxId },
      data: { suggestedAddressId: decision.suggestedAddressId },
    })
  }

  if (decision.result === "consistency_confirmed" && decision.consistencyMatch) {
    await tx.bankTransaction.update({
      where: { id: bankTxId },
      data: { status: "matched" },
    })

    await auditLog.log(tx, {
      tenantId,
      userId,
      action: "confirm_match",
      entityType: "bank_transaction",
      entityId: bankTxId,
      metadata: {
        invoiceId: decision.consistencyMatch.inboundInvoiceId,
        paymentRunItemId: decision.consistencyMatch.paymentRunItemId,
        auto: true,
      },
    }).catch(() => {})

    return decision
  }

  if (decision.result !== "matched" || !decision.allocation) return decision

  const txAsPrisma = tx as unknown as PrismaClient

  const payment = await inboundPaymentRepo.createPayment(txAsPrisma, {
    tenantId,
    invoiceId: decision.allocation.inboundInvoiceId,
    date: bankTx.valueDate,
    amount: decision.allocation.amount,
    type: "BANK",
    notes: `CAMT ${bankTx.bankReference ?? bankTx.id}`,
    createdById: userId,
  })

  // Recompute denormalized payment status on the invoice
  const activePayments = await tx.inboundInvoicePayment.findMany({
    where: { tenantId, invoiceId: decision.allocation.inboundInvoiceId, status: "ACTIVE" },
    select: { amount: true },
  })
  const paidAmount = round2(activePayments.reduce((sum, p) => sum + p.amount, 0))
  const invoice = await tx.inboundInvoice.findUniqueOrThrow({
    where: { id: decision.allocation.inboundInvoiceId },
    select: { totalGross: true, paidAt: true },
  })
  const totalGross = invoice.totalGross ? Number(invoice.totalGross) : 0
  const newStatus = computeInboundPaymentStatus(totalGross, paidAmount)
  await tx.inboundInvoice.update({
    where: { id: decision.allocation.inboundInvoiceId },
    data: {
      paymentStatus: newStatus,
      paidAmount,
      paidAt: newStatus === "PAID" ? (invoice.paidAt ?? new Date()) : null,
    },
  })

  const allocation = await tx.inboundInvoiceBankAllocation.create({
    data: {
      tenantId,
      bankTransactionId: bankTxId,
      inboundInvoiceId: decision.allocation.inboundInvoiceId,
      inboundInvoicePaymentId: payment.id,
      amount: decision.allocation.amount,
      autoMatched: true,
      matchedById: userId,
    },
  })

  await tx.inboundInvoicePayment.update({
    where: { id: payment.id },
    data: { bankAllocationId: allocation.id },
  })

  await tx.bankTransaction.update({
    where: { id: bankTxId },
    data: { status: "matched" },
  })

  await auditLog.log(tx, {
    tenantId,
    userId,
    action: "match",
    entityType: "bank_transaction",
    entityId: bankTxId,
    metadata: {
      allocationId: allocation.id,
      inboundInvoiceId: decision.allocation.inboundInvoiceId,
      amount: decision.allocation.amount,
      auto: true,
    },
  }).catch(() => {})

  return decision
}

// --- Manual Match ---

export class BankTransactionMatchValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BankTransactionMatchValidationError"
  }
}

export interface ManualMatchAllocation {
  billingDocumentId?: string
  inboundInvoiceId?: string
  amount: number
}

export async function manualMatchTransaction(
  prisma: PrismaClient,
  tenantId: string,
  bankTransactionId: string,
  allocations: ManualMatchAllocation[],
  userId: string,
): Promise<void> {
  if (allocations.length === 0) {
    throw new BankTransactionMatchValidationError("at least one allocation required")
  }

  for (const a of allocations) {
    const hasCredit = !!a.billingDocumentId
    const hasDebit = !!a.inboundInvoiceId
    if (hasCredit === hasDebit) {
      throw new BankTransactionMatchValidationError(
        "allocation must reference exactly one of billingDocumentId or inboundInvoiceId",
      )
    }
    if (a.amount <= 0) {
      throw new BankTransactionMatchValidationError("allocation amount must be positive")
    }
  }

  await prisma.$transaction(async (tx) => {
    const bankTx = await tx.bankTransaction.findUniqueOrThrow({
      where: { id: bankTransactionId },
    })
    if (bankTx.tenantId !== tenantId) {
      throw new BankTransactionMatchValidationError("cross-tenant access")
    }
    if (bankTx.status !== "unmatched") {
      throw new BankTransactionMatchValidationError(
        `transaction ${bankTransactionId} is not unmatched (status=${bankTx.status})`,
      )
    }

    const sum = round2(allocations.reduce((s, a) => s + a.amount, 0))
    if (Math.abs(sum - bankTx.amount) > 0.01) {
      throw new BankTransactionMatchValidationError(
        `allocation sum ${sum} does not match transaction amount ${bankTx.amount}`,
      )
    }

    const creditDocIds = allocations
      .map((a) => a.billingDocumentId)
      .filter((id): id is string => !!id)
    if (creditDocIds.length > 0) {
      const docs = await tx.billingDocument.findMany({
        where: { tenantId, id: { in: creditDocIds } },
        select: { id: true, internalNotes: true },
      })
      for (const doc of docs) {
        if (hasPlatformSubscriptionMarker(doc.internalNotes ?? "")) {
          throw new BankTransactionMatchValidationError(
            `document ${doc.id} is a platform subscription invoice`,
          )
        }
      }
    }

    const txAsPrisma = tx as unknown as PrismaClient

    for (const alloc of allocations) {
      if (alloc.billingDocumentId) {
        const payment = await billingPaymentService.createPayment(
          txAsPrisma, tenantId,
          {
            documentId: alloc.billingDocumentId,
            date: bankTx.valueDate,
            amount: alloc.amount,
            type: "BANK",
            notes: `CAMT manual ${bankTx.bankReference ?? bankTx.id}`,
            isDiscount: false,
          },
          userId,
        )

        const bdAlloc = await tx.billingDocumentBankAllocation.create({
          data: {
            tenantId,
            bankTransactionId,
            billingDocumentId: alloc.billingDocumentId,
            billingPaymentId: payment.id,
            amount: alloc.amount,
            autoMatched: false,
            matchedById: userId,
          },
        })
        await tx.billingPayment.update({
          where: { id: payment.id },
          data: { bankAllocationId: bdAlloc.id },
        })
      } else if (alloc.inboundInvoiceId) {
        const payment = await inboundInvoicePaymentService.createPayment(
          txAsPrisma, tenantId,
          {
            invoiceId: alloc.inboundInvoiceId,
            date: bankTx.valueDate,
            amount: alloc.amount,
            type: "BANK",
            notes: `CAMT manual ${bankTx.bankReference ?? bankTx.id}`,
          },
          userId,
        )

        const ibAlloc = await tx.inboundInvoiceBankAllocation.create({
          data: {
            tenantId,
            bankTransactionId,
            inboundInvoiceId: alloc.inboundInvoiceId,
            inboundInvoicePaymentId: payment.id,
            amount: alloc.amount,
            autoMatched: false,
            matchedById: userId,
          },
        })
        await tx.inboundInvoicePayment.update({
          where: { id: payment.id },
          data: { bankAllocationId: ibAlloc.id },
        })
      }
    }

    await tx.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { status: "matched" },
    })

    await auditLog.log(tx, {
      tenantId,
      userId,
      action: "match",
      entityType: "bank_transaction",
      entityId: bankTransactionId,
      metadata: {
        auto: false,
        allocationCount: allocations.length,
        amountSum: sum,
      },
    }).catch(() => {})
  })
}

// --- Unmatch ---

export async function unmatchBankTransaction(
  prisma: PrismaClient,
  tenantId: string,
  bankTransactionId: string,
  userId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const bankTx = await tx.bankTransaction.findUniqueOrThrow({
      where: { id: bankTransactionId },
    })
    if (bankTx.tenantId !== tenantId) {
      throw new BankTransactionMatchValidationError("cross-tenant access")
    }
    if (bankTx.status !== "matched") {
      throw new BankTransactionMatchConflictError(
        `Transaction ${bankTransactionId} is not matched (status=${bankTx.status})`,
      )
    }

    const txAsPrisma = tx as unknown as PrismaClient
    const cancelledBy = userId ?? "system"

    const creditAllocs = await tx.billingDocumentBankAllocation.findMany({
      where: { tenantId, bankTransactionId },
    })
    for (const alloc of creditAllocs) {
      if (alloc.billingPaymentId) {
        const payment = await tx.billingPayment.findFirst({
          where: { id: alloc.billingPaymentId, tenantId },
        })
        if (payment && payment.status !== "CANCELLED") {
          await billingPaymentRepo.cancelPayment(txAsPrisma, tenantId, payment.id, cancelledBy)
          if (!payment.isDiscount) {
            const relatedSkonto = await tx.billingPayment.findMany({
              where: {
                tenantId,
                documentId: payment.documentId,
                isDiscount: true,
                status: "ACTIVE",
                date: payment.date,
              },
            })
            for (const skonto of relatedSkonto) {
              await billingPaymentRepo.cancelPayment(txAsPrisma, tenantId, skonto.id, cancelledBy)
            }
          }
        }
      }
      await tx.billingDocumentBankAllocation.delete({ where: { id: alloc.id } })
    }

    const debitAllocs = await tx.inboundInvoiceBankAllocation.findMany({
      where: { tenantId, bankTransactionId },
    })
    const affectedInvoiceIds = new Set<string>()
    for (const alloc of debitAllocs) {
      if (alloc.inboundInvoicePaymentId) {
        await inboundPaymentRepo.cancelPayment(txAsPrisma, tenantId, alloc.inboundInvoicePaymentId, cancelledBy)
        affectedInvoiceIds.add(alloc.inboundInvoiceId)
      }
      await tx.inboundInvoiceBankAllocation.delete({ where: { id: alloc.id } })
    }

    for (const invoiceId of affectedInvoiceIds) {
      const activePayments = await tx.inboundInvoicePayment.findMany({
        where: { tenantId, invoiceId, status: "ACTIVE" },
        select: { amount: true },
      })
      const paidAmount = round2(activePayments.reduce((sum, p) => sum + p.amount, 0))
      const invoice = await tx.inboundInvoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: { totalGross: true, paidAt: true },
      })
      const totalGross = invoice.totalGross ? Number(invoice.totalGross) : 0
      const newStatus = computeInboundPaymentStatus(totalGross, paidAmount)
      await tx.inboundInvoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus: newStatus,
          paidAmount,
          paidAt: newStatus === "PAID" ? (invoice.paidAt ?? new Date()) : null,
        },
      })
    }

    await tx.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { status: "unmatched" },
    })

    await auditLog.log(tx, {
      tenantId,
      userId,
      action: "unmatch",
      entityType: "bank_transaction",
      entityId: bankTransactionId,
      metadata: {
        creditAllocationsRemoved: creditAllocs.length,
        debitAllocationsRemoved: debitAllocs.length,
      },
    }).catch(() => {})
  })
}
