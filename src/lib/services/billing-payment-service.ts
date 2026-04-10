import type { PrismaClient, BillingPaymentType } from "@/generated/prisma/client"
import * as repo from "./billing-payment-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { getApplicableDiscount } from "@/lib/billing/payment-discount"

export { getApplicableDiscount }

// --- Error Classes ---

export class BillingPaymentNotFoundError extends Error {
  constructor(message = "Payment not found") {
    super(message)
    this.name = "BillingPaymentNotFoundError"
  }
}

export class BillingPaymentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingPaymentValidationError"
  }
}

export class BillingPaymentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingPaymentConflictError"
  }
}

// --- Helper Functions (exported for testing) ---

export function computePaymentStatus(
  totalGross: number,
  paidAmount: number
): "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID" {
  if (paidAmount <= 0) return "UNPAID"
  // Use small tolerance for floating point comparison
  if (paidAmount < totalGross - 0.01) return "PARTIAL"
  if (paidAmount > totalGross + 0.01) return "OVERPAID"
  return "PAID"
}

export function computeDueDate(
  documentDate: Date,
  paymentTermDays: number | null
): Date | null {
  if (paymentTermDays === null || paymentTermDays === undefined) return null
  const due = new Date(documentDate)
  due.setDate(due.getDate() + paymentTermDays)
  return due
}

export function isOverdue(
  dueDate: Date | null,
  paymentStatus: string
): boolean {
  if (!dueDate) return false
  if (paymentStatus === "PAID" || paymentStatus === "OVERPAID") return false
  return dueDate < new Date()
}

// --- Enrichment helpers ---

interface OpenItemDocument {
  id: string
  totalGross: number
  documentDate: Date
  paymentTermDays: number | null
  payments: Array<{ amount: number; status: string }>
  childDocuments?: Array<{ totalGross: number }>
}

function enrichOpenItem(doc: OpenItemDocument) {
  const creditNoteReduction = (doc.childDocuments ?? []).reduce(
    (sum, cn) => sum + cn.totalGross,
    0
  )
  const effectiveTotalGross = doc.totalGross - creditNoteReduction
  const paidAmount = doc.payments
    .filter((p) => p.status === "ACTIVE")
    .reduce((sum, p) => sum + p.amount, 0)
  const openAmount = Math.max(0, effectiveTotalGross - paidAmount)
  const paymentStatus = computePaymentStatus(effectiveTotalGross, paidAmount)
  const dueDate = computeDueDate(doc.documentDate, doc.paymentTermDays)
  const overdue = isOverdue(dueDate, paymentStatus)

  return {
    paidAmount: Math.round(paidAmount * 100) / 100,
    openAmount: Math.round(openAmount * 100) / 100,
    effectiveTotalGross: Math.round(effectiveTotalGross * 100) / 100,
    creditNoteReduction: Math.round(creditNoteReduction * 100) / 100,
    paymentStatus,
    dueDate,
    isOverdue: overdue,
  }
}

// --- Service Functions ---

export async function listOpenItems(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    status?: "open" | "partial" | "paid" | "overdue"
    search?: string
    dateFrom?: Date
    dateTo?: Date
    page: number
    pageSize: number
  }
) {
  // Fetch all matching invoices (we filter by payment status post-query)
  // When filtering by status, we need to over-fetch then filter
  const needsPostFilter = !!params.status
  const fetchParams = {
    ...params,
    page: needsPostFilter ? 1 : params.page,
    pageSize: needsPostFilter ? 1000 : params.pageSize,
  }

  const result = await repo.findOpenItems(prisma, tenantId, fetchParams)

  // Enrich with computed fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let enriched = result.items.map((doc: any) => ({
    ...doc,
    ...enrichOpenItem(doc),
  }))

  // Filter by payment status if requested
  if (params.status) {
    enriched = enriched.filter((item) => {
      switch (params.status) {
        case "open":
          return item.paymentStatus === "UNPAID"
        case "partial":
          return item.paymentStatus === "PARTIAL"
        case "paid":
          return item.paymentStatus === "PAID" || item.paymentStatus === "OVERPAID"
        case "overdue":
          return item.isOverdue
        default:
          return true
      }
    })
  }

  // Re-paginate if we post-filtered
  if (needsPostFilter) {
    const total = enriched.length
    const start = (params.page - 1) * params.pageSize
    const items = enriched.slice(start, start + params.pageSize)
    return { items, total }
  }

  return { items: enriched, total: result.total }
}

export async function getOpenItemById(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  const doc = await repo.findOpenItemByDocumentId(prisma, tenantId, documentId)
  if (!doc) throw new BillingPaymentNotFoundError("Invoice not found")

  return {
    ...doc,
    ...enrichOpenItem(doc as unknown as OpenItemDocument),
  }
}

export async function getOpenItemsSummary(
  prisma: PrismaClient,
  tenantId: string,
  addressId?: string
) {
  // Fetch all invoices with payments (no pagination)
  const where: Record<string, unknown> = {
    tenantId,
    type: "INVOICE",
    status: { in: ["PRINTED", "PARTIALLY_FORWARDED", "FORWARDED"] },
  }
  if (addressId) where.addressId = addressId

  const invoices = await prisma.billingDocument.findMany({
    where,
    include: {
      payments: {
        where: { status: "ACTIVE" },
      },
      childDocuments: {
        where: { type: "CREDIT_NOTE", status: { not: "CANCELLED" } },
        select: { totalGross: true },
      },
    },
  })

  let totalOpen = 0
  let totalOverdue = 0
  let countOpen = 0
  let countPartial = 0
  let countPaid = 0
  let countOverdue = 0

  for (const doc of invoices) {
    const info = enrichOpenItem(doc as unknown as OpenItemDocument)
    if (info.paymentStatus === "UNPAID") {
      countOpen++
      totalOpen += info.openAmount
    } else if (info.paymentStatus === "PARTIAL") {
      countPartial++
      totalOpen += info.openAmount
    } else if (info.paymentStatus === "PAID" || info.paymentStatus === "OVERPAID") {
      countPaid++
    }
    if (info.isOverdue) {
      countOverdue++
      totalOverdue += info.openAmount
    }
  }

  return {
    totalOpen: Math.round(totalOpen * 100) / 100,
    totalOverdue: Math.round(totalOverdue * 100) / 100,
    countOpen,
    countPartial,
    countPaid,
    countOverdue,
  }
}

export async function listPayments(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  return repo.findPaymentsByDocumentId(prisma, tenantId, documentId)
}

export async function createPayment(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    documentId: string
    date: Date
    amount: number
    type: BillingPaymentType
    isDiscount?: boolean
    notes?: string
  },
  createdById: string,
  audit?: AuditContext
) {
  // 1. Validate document exists and belongs to tenant
  const document = await prisma.billingDocument.findFirst({
    where: { id: input.documentId, tenantId },
    include: {
      payments: { where: { status: "ACTIVE" } },
      childDocuments: {
        where: { type: "CREDIT_NOTE", status: { not: "CANCELLED" } },
        select: { totalGross: true },
      },
    },
  })

  if (!document) {
    throw new BillingPaymentValidationError("Document not found")
  }

  // 2. Validate document type
  if (document.type !== "INVOICE") {
    throw new BillingPaymentValidationError(
      "Payments can only be recorded against invoices"
    )
  }

  // 3. Validate document status (must be finalized)
  if (document.status === "DRAFT" || document.status === "CANCELLED") {
    throw new BillingPaymentValidationError(
      "Payments can only be recorded against finalized invoices"
    )
  }

  // 4. Calculate current open amount
  const creditNoteReduction = (document.childDocuments ?? []).reduce(
    (sum, cn) => sum + cn.totalGross,
    0
  )
  const effectiveTotalGross = document.totalGross - creditNoteReduction
  const paidAmount = document.payments.reduce((sum, p) => sum + p.amount, 0)
  const openAmount = effectiveTotalGross - paidAmount

  // 5. Handle discount payments
  if (input.isDiscount) {
    const discount = getApplicableDiscount(document, input.date)
    if (!discount) {
      throw new BillingPaymentValidationError("Discount period expired")
    }

    // Wrap both payment + Skonto creation in a transaction,
    // re-reading document inside to prevent concurrent overpayment
    const payment = await prisma.$transaction(async (tx) => {
      const txPrisma = tx as unknown as PrismaClient

      // Re-read document inside transaction for consistent openAmount
      const txDoc = await txPrisma.billingDocument.findFirst({
        where: { id: input.documentId, tenantId },
        include: {
          payments: { where: { status: "ACTIVE" } },
          childDocuments: {
            where: { type: "CREDIT_NOTE", status: { not: "CANCELLED" } },
            select: { totalGross: true },
          },
        },
      })
      if (!txDoc) throw new BillingPaymentValidationError("Document not found")

      const txCreditReduction = (txDoc.childDocuments ?? []).reduce(
        (sum, cn) => sum + cn.totalGross, 0
      )
      const txEffective = txDoc.totalGross - txCreditReduction
      const txPaid = txDoc.payments.reduce((sum, p) => sum + p.amount, 0)
      const txOpen = txEffective - txPaid

      if (txOpen <= 0.01) {
        throw new BillingPaymentValidationError("Document is already fully paid")
      }

      const discountAmount = Math.round(txOpen * (discount.percent / 100) * 100) / 100
      const paymentAmount = Math.round((txOpen - discountAmount) * 100) / 100

      // Create the actual payment
      const payment = await repo.createPayment(txPrisma, {
        tenantId,
        documentId: input.documentId,
        date: input.date,
        amount: paymentAmount,
        type: input.type,
        isDiscount: false,
        notes: input.notes ?? null,
        createdById,
      })

      // Create the discount entry
      await repo.createPayment(txPrisma, {
        tenantId,
        documentId: input.documentId,
        date: input.date,
        amount: discountAmount,
        type: input.type,
        isDiscount: true,
        notes: `Skonto ${discount.tier} (${discount.percent}%)`,
        createdById,
      })

      return payment
    })

    if (audit) {
      // Never throws — audit failures must not block the actual operation
      await auditLog.log(prisma, {
        tenantId, userId: audit.userId, action: "create", entityType: "billing_payment",
        entityId: payment.id, entityName: null, changes: null,
        ipAddress: audit.ipAddress, userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err))
    }

    return payment
  }

  // 6. Wrap validation + creation in transaction to prevent concurrent overpayment
  const created = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // Re-read document inside transaction for consistent openAmount
    const txDoc = await txPrisma.billingDocument.findFirst({
      where: { id: input.documentId, tenantId },
      include: {
        payments: { where: { status: "ACTIVE" } },
        childDocuments: {
          where: { type: "CREDIT_NOTE", status: { not: "CANCELLED" } },
          select: { totalGross: true },
        },
      },
    })
    if (!txDoc) throw new BillingPaymentValidationError("Document not found")

    const txCreditReduction = (txDoc.childDocuments ?? []).reduce(
      (sum, cn) => sum + cn.totalGross, 0
    )
    const txEffective = txDoc.totalGross - txCreditReduction
    const txPaid = txDoc.payments.reduce((sum, p) => sum + p.amount, 0)
    const txOpen = txEffective - txPaid

    // Validate amount does not exceed open amount (with tolerance)
    if (input.amount > txOpen + 0.01) {
      throw new BillingPaymentValidationError(
        `Payment amount (${input.amount}) exceeds open amount (${Math.round(txOpen * 100) / 100})`
      )
    }

    // Create payment record
    return repo.createPayment(txPrisma, {
      tenantId,
      documentId: input.documentId,
      date: input.date,
      amount: input.amount,
      type: input.type,
      isDiscount: false,
      notes: input.notes ?? null,
      createdById,
    })
  })

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "billing_payment",
      entityId: created.id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function cancelPayment(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  cancelledById: string,
  reason?: string,
  audit?: AuditContext
) {
  // Wrap all cancellations (main payment + Skonto) in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // 1. Find payment
    const payment = await repo.findPaymentById(txPrisma, tenantId, id)
    if (!payment) {
      throw new BillingPaymentNotFoundError()
    }

    // 2. Validate not already cancelled
    if (payment.status === "CANCELLED") {
      throw new BillingPaymentValidationError("Payment is already cancelled")
    }

    // 3. Build notes
    const notes = reason
      ? payment.notes
        ? `${payment.notes} | Storniert: ${reason}`
        : `Storniert: ${reason}`
      : payment.notes

    // 4. Cancel the payment
    const result = await repo.cancelPayment(txPrisma, tenantId, id, cancelledById, notes)

    // 5. If this is a non-discount payment, also cancel associated Skonto entries
    //    (Skonto entries share the same document and date)
    if (!payment.isDiscount) {
      const relatedSkonto = await txPrisma.billingPayment.findMany({
        where: {
          tenantId,
          documentId: payment.document.id,
          isDiscount: true,
          status: "ACTIVE",
          date: payment.date,
        },
      })
      for (const skonto of relatedSkonto) {
        await repo.cancelPayment(txPrisma, tenantId, skonto.id, cancelledById, `Storniert mit Zahlung`)
      }
    }

    return result
  })

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "billing_payment",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}
