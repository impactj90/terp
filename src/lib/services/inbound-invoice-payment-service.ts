/**
 * InboundInvoicePayment Service
 *
 * Business logic for recording, cancelling and reconciling payments
 * against InboundInvoices. Mirrors billing-payment-service for the
 * supplier side, without Skonto / OVERPAID handling.
 *
 * Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md Phase 3b.
 */
import type {
  PrismaClient,
  InboundInvoicePaymentType,
  InboundInvoicePaymentStatus,
} from "@/generated/prisma/client"
import * as repo from "./inbound-invoice-payment-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { getPaymentStatus } from "./payment-run-data-resolver"

// --- Error Classes ---

export class InboundInvoicePaymentNotFoundError extends Error {
  constructor(message = "Payment not found") {
    super(message)
    this.name = "InboundInvoicePaymentNotFoundError"
  }
}

export class InboundInvoicePaymentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InboundInvoicePaymentValidationError"
  }
}

export class InboundInvoicePaymentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InboundInvoicePaymentConflictError"
  }
}

// --- Helpers ---

export function computeInboundPaymentStatus(
  totalGross: number,
  paidAmount: number
): InboundInvoicePaymentStatus {
  if (paidAmount <= 0.005) return "UNPAID"
  if (paidAmount < totalGross - 0.01) return "PARTIAL"
  return "PAID"
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Recompute paymentStatus + paidAmount + paidAt for an invoice from
 * its currently-active InboundInvoicePayment rows. Must run inside a
 * transaction so the read-then-update is consistent.
 */
async function recomputeInvoicePaymentStatus(
  tx: PrismaClient,
  tenantId: string,
  invoiceId: string
): Promise<void> {
  const invoice = await tx.inboundInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { id: true, totalGross: true, paidAt: true },
  })
  if (!invoice) {
    throw new InboundInvoicePaymentValidationError("Invoice not found")
  }

  const activePayments = await tx.inboundInvoicePayment.findMany({
    where: { tenantId, invoiceId, status: "ACTIVE" },
    select: { amount: true },
  })
  const paidAmount = roundCents(
    activePayments.reduce((sum, p) => sum + p.amount, 0)
  )
  const totalGross = invoice.totalGross ? Number(invoice.totalGross) : 0
  const status = computeInboundPaymentStatus(totalGross, paidAmount)

  let paidAt: Date | null = invoice.paidAt
  if (status === "PAID") {
    if (paidAt === null) paidAt = new Date()
    // else keep existing paidAt (last payment time stays)
  } else {
    paidAt = null
  }

  await tx.inboundInvoice.update({
    where: { id: invoiceId },
    data: {
      paymentStatus: status,
      paidAmount,
      paidAt,
    },
  })
}

// --- Service Functions ---

export async function listPayments(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string
) {
  return repo.findPaymentsByInvoiceId(prisma, tenantId, invoiceId)
}

export async function createPayment(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    invoiceId: string
    date: Date
    amount: number
    type: InboundInvoicePaymentType
    notes?: string | null
  },
  createdById: string,
  audit?: AuditContext
) {
  if (input.amount <= 0) {
    throw new InboundInvoicePaymentValidationError(
      "Payment amount must be positive"
    )
  }

  const created = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // 1. Re-read invoice inside transaction for consistent state
    const invoice = await txPrisma.inboundInvoice.findFirst({
      where: { id: input.invoiceId, tenantId },
      include: {
        inboundPayments: { where: { status: "ACTIVE" } },
      },
    })
    if (!invoice) {
      throw new InboundInvoicePaymentValidationError("Invoice not found")
    }

    // 2. Status guard: only APPROVED or EXPORTED invoices can receive payments
    if (invoice.status !== "APPROVED" && invoice.status !== "EXPORTED") {
      throw new InboundInvoicePaymentValidationError(
        "Payments can only be recorded against approved or exported invoices"
      )
    }

    // 3. Compute new paid amount and validate against open amount
    const totalGross = invoice.totalGross ? Number(invoice.totalGross) : 0
    if (totalGross <= 0) {
      throw new InboundInvoicePaymentValidationError(
        "Invoice has no positive total gross amount"
      )
    }
    const currentPaid = invoice.inboundPayments.reduce(
      (sum, p) => sum + p.amount,
      0
    )
    const newPaidAmount = currentPaid + input.amount
    if (newPaidAmount > totalGross + 0.01) {
      const open = roundCents(totalGross - currentPaid)
      throw new InboundInvoicePaymentValidationError(
        `Payment amount (${input.amount}) exceeds open amount (${open})`
      )
    }

    // 4. Persist the payment row
    const payment = await repo.createPayment(txPrisma, {
      tenantId,
      invoiceId: input.invoiceId,
      date: input.date,
      amount: input.amount,
      type: input.type,
      notes: input.notes ?? null,
      createdById,
    })

    // 5. Recompute denormalized status fields on the invoice
    await recomputeInvoicePaymentStatus(txPrisma, tenantId, input.invoiceId)

    return payment
  })

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "inbound_invoice_payment",
        entityId: created.id,
        entityName: null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
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
  const result = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    const payment = await repo.findPaymentById(txPrisma, tenantId, id)
    if (!payment) {
      throw new InboundInvoicePaymentNotFoundError()
    }

    if (payment.status === "CANCELLED") {
      throw new InboundInvoicePaymentValidationError(
        "Payment is already cancelled"
      )
    }

    const notes = reason
      ? payment.notes
        ? `${payment.notes} | Storniert: ${reason}`
        : `Storniert: ${reason}`
      : payment.notes

    const cancelled = await repo.cancelPayment(
      txPrisma,
      tenantId,
      id,
      cancelledById,
      notes
    )

    await recomputeInvoicePaymentStatus(
      txPrisma,
      tenantId,
      payment.invoiceId
    )

    return cancelled
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "inbound_invoice_payment",
        entityId: id,
        entityName: null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

/**
 * Bulk-mark all listed inbound invoices as PAID. Called from
 * `payment-run-service.markBooked` inside the same transaction so the
 * status flip and PaymentRun BOOKED transition are atomic.
 *
 * Why a loop instead of `updateMany`? `paidAmount` is per-invoice
 * (totalGross differs row-by-row), so we cannot collapse it into one
 * statement.
 */
export async function markInvoicesPaidFromPaymentRun(
  tx: PrismaClient,
  tenantId: string,
  invoiceIds: string[],
  bookedAt: Date
): Promise<void> {
  if (invoiceIds.length === 0) return
  const invoices = await tx.inboundInvoice.findMany({
    where: { tenantId, id: { in: invoiceIds } },
    select: { id: true, totalGross: true },
  })
  for (const inv of invoices) {
    const total = inv.totalGross ? Number(inv.totalGross) : 0
    await tx.inboundInvoice.update({
      where: { id: inv.id },
      data: {
        paymentStatus: "PAID",
        paidAmount: total,
        paidAt: bookedAt,
      },
    })
  }
}

/**
 * Compare the stored `paymentStatus` against the value derived from
 * `paymentRunItems`. Returns a promise that resolves once the audit
 * log write completes (or no-ops if there is no mismatch). The caller
 * is expected to fire-and-forget via `.catch(...)` so a divergence
 * warning never blocks the read path.
 *
 * The derived enum is `UNPAID | IN_PAYMENT_RUN | PAID`, which is
 * narrower than the stored enum (`UNPAID | PARTIAL | PAID`). Mapping:
 *   - derived PAID    → stored must be PAID
 *   - derived UNPAID  → stored must NOT be PAID
 *   - derived IN_PAYMENT_RUN is ambiguous (still in flight) → no warn
 *
 * Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md Phase 3c.
 */
export async function consistencyCheckPaymentStatus(
  prisma: PrismaClient,
  invoice: {
    id: string
    tenantId: string
    paymentStatus: InboundInvoicePaymentStatus
  },
  paymentRunItems: Array<{ paymentRun: { status: string } }>
): Promise<void> {
  const derived = getPaymentStatus(paymentRunItems)
  const stored = invoice.paymentStatus

  let mismatch = false
  if (derived === "PAID" && stored !== "PAID") mismatch = true
  if (derived === "UNPAID" && stored === "PAID") mismatch = true

  if (!mismatch) return

  await auditLog.log(prisma, {
    tenantId: invoice.tenantId,
    userId: null,
    action: "consistency_warning",
    entityType: "inbound_invoice",
    entityId: invoice.id,
    entityName: null,
    changes: { stored, derived } as unknown as Record<string, unknown>,
    ipAddress: null,
    userAgent: null,
  })
}
