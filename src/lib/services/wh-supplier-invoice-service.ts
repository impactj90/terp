/**
 * Warehouse Supplier Invoice Service
 *
 * Business logic for supplier invoice (Lieferantenrechnungen) operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-supplier-invoice-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import {
  computePaymentStatus,
  computeDueDate,
  isOverdue,
  getApplicableDiscount,
} from "./billing-payment-service"

// --- Error Classes ---

export class WhSupplierInvoiceNotFoundError extends Error {
  constructor(message = "Supplier invoice not found") {
    super(message)
    this.name = "WhSupplierInvoiceNotFoundError"
  }
}

export class WhSupplierInvoiceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhSupplierInvoiceValidationError"
  }
}

export class WhSupplierInvoiceConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhSupplierInvoiceConflictError"
  }
}

// --- Enrichment Helper ---

interface InvoiceWithPayments {
  totalGross: number
  dueDate: Date | null
  payments: Array<{ amount: number; status?: string }>
}

function enrichInvoice(invoice: InvoiceWithPayments) {
  // If payments have status field, filter to ACTIVE only. Otherwise assume already filtered.
  const activePayments = invoice.payments.filter(
    (p) => !p.status || p.status === "ACTIVE"
  )
  const paidAmount = activePayments.reduce((sum, p) => sum + p.amount, 0)
  const openAmount = Math.max(0, invoice.totalGross - paidAmount)
  const paymentStatus = computePaymentStatus(invoice.totalGross, paidAmount)
  const overdue = isOverdue(invoice.dueDate, paymentStatus)
  return {
    paidAmount: Math.round(paidAmount * 100) / 100,
    openAmount: Math.round(openAmount * 100) / 100,
    paymentStatus,
    isOverdue: overdue,
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    supplierId?: string
    status?: string
    search?: string
    dateFrom?: string
    dateTo?: string
    page: number
    pageSize: number
  }
) {
  const result = await repo.findMany(prisma, tenantId, params)

  const enrichedItems = result.items.map((item) => ({
    ...item,
    ...enrichInvoice(item),
  }))

  return { items: enrichedItems, total: result.total }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const invoice = await repo.findById(prisma, tenantId, id)
  if (!invoice) {
    throw new WhSupplierInvoiceNotFoundError()
  }
  return {
    ...invoice,
    ...enrichInvoice(invoice),
  }
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    number: string
    supplierId: string
    purchaseOrderId?: string
    invoiceDate: string
    receivedDate?: string
    totalNet: number
    totalVat: number
    totalGross: number
    paymentTermDays?: number
    dueDate?: string
    discountPercent?: number
    discountDays?: number
    discountPercent2?: number
    discountDays2?: number
    notes?: string
  },
  createdById?: string,
  audit?: AuditContext
) {
  // 1. Validate supplier exists and has tax info
  const supplier = await prisma.crmAddress.findFirst({
    where: { id: input.supplierId, tenantId },
    select: {
      id: true,
      taxNumber: true,
      vatId: true,
      paymentTermDays: true,
      discountPercent: true,
      discountDays: true,
    },
  })
  if (!supplier) {
    throw new WhSupplierInvoiceValidationError("Lieferant nicht gefunden")
  }
  if (!supplier.taxNumber && !supplier.vatId) {
    throw new WhSupplierInvoiceValidationError(
      "Lieferant hat weder Steuernummer noch USt-IdNr."
    )
  }

  // 2. Default payment terms from supplier if not provided
  const paymentTermDays = input.paymentTermDays ?? supplier.paymentTermDays ?? null
  const discountPercent = input.discountPercent ?? supplier.discountPercent ?? null
  const discountDays = input.discountDays ?? supplier.discountDays ?? null
  const discountPercent2 = input.discountPercent2 ?? null
  const discountDays2 = input.discountDays2 ?? null

  // 3. Calculate due date
  const invoiceDate = new Date(input.invoiceDate)
  let dueDate: Date | null = null
  if (input.dueDate) {
    dueDate = new Date(input.dueDate)
  } else if (paymentTermDays != null) {
    dueDate = computeDueDate(invoiceDate, paymentTermDays)
  }

  // 4. Create invoice
  const invoice = await repo.create(prisma, {
    tenantId,
    number: input.number,
    supplierId: input.supplierId,
    purchaseOrderId: input.purchaseOrderId,
    invoiceDate,
    receivedDate: input.receivedDate ? new Date(input.receivedDate) : undefined,
    totalNet: input.totalNet,
    totalVat: input.totalVat,
    totalGross: input.totalGross,
    paymentTermDays,
    dueDate,
    discountPercent,
    discountDays,
    discountPercent2,
    discountDays2,
    notes: input.notes,
    createdById,
  })

  // 5. Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "wh_supplier_invoice",
        entityId: invoice.id,
        entityName: input.number,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return invoice
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    number?: string
    invoiceDate?: string
    totalNet?: number
    totalVat?: number
    totalGross?: number
    paymentTermDays?: number | null
    dueDate?: string | null
    discountPercent?: number | null
    discountDays?: number | null
    discountPercent2?: number | null
    discountDays2?: number | null
    notes?: string | null
  },
  audit?: AuditContext
) {
  // 1. Fetch existing
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new WhSupplierInvoiceNotFoundError()
  }

  // 2. Only OPEN invoices can be edited
  if (existing.status !== "OPEN") {
    throw new WhSupplierInvoiceConflictError(
      "Nur offene Rechnungen können bearbeitet werden"
    )
  }

  // 3. Build update data
  const data: Record<string, unknown> = {}
  if (input.number !== undefined) data.number = input.number
  if (input.invoiceDate !== undefined) data.invoiceDate = new Date(input.invoiceDate)
  if (input.totalNet !== undefined) data.totalNet = input.totalNet
  if (input.totalVat !== undefined) data.totalVat = input.totalVat
  if (input.totalGross !== undefined) data.totalGross = input.totalGross
  if (input.paymentTermDays !== undefined) data.paymentTermDays = input.paymentTermDays
  if (input.discountPercent !== undefined) data.discountPercent = input.discountPercent
  if (input.discountDays !== undefined) data.discountDays = input.discountDays
  if (input.discountPercent2 !== undefined) data.discountPercent2 = input.discountPercent2
  if (input.discountDays2 !== undefined) data.discountDays2 = input.discountDays2
  if (input.notes !== undefined) data.notes = input.notes

  // Recalculate due date if paymentTermDays changed
  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate ? new Date(input.dueDate) : null
  } else if (input.paymentTermDays !== undefined) {
    const invDate = input.invoiceDate
      ? new Date(input.invoiceDate)
      : existing.invoiceDate
    data.dueDate = computeDueDate(invDate, input.paymentTermDays)
  }

  // 4. Update
  const updated = await repo.update(prisma, tenantId, input.id, data)

  // 5. Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "wh_supplier_invoice",
        entityId: input.id,
        entityName: existing.number,
        changes: data,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new WhSupplierInvoiceNotFoundError()
  }

  if (existing.status === "CANCELLED") {
    throw new WhSupplierInvoiceConflictError("Rechnung ist bereits storniert")
  }

  await repo.updateStatus(prisma, tenantId, id, "CANCELLED")

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "cancel",
        entityType: "wh_supplier_invoice",
        entityId: id,
        entityName: existing.number,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

export async function createPayment(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    invoiceId: string
    date: string
    amount: number
    type: "CASH" | "BANK"
    isDiscount?: boolean
    notes?: string
  },
  createdById?: string,
  audit?: AuditContext
) {
  // 1. Fetch invoice (verifying tenant)
  const invoice = await repo.findById(prisma, tenantId, input.invoiceId)
  if (!invoice) {
    throw new WhSupplierInvoiceNotFoundError()
  }

  // 2. Validate invoice status
  if (invoice.status === "CANCELLED") {
    throw new WhSupplierInvoiceConflictError(
      "Stornierte Rechnungen können nicht bezahlt werden"
    )
  }
  if (invoice.status === "PAID") {
    throw new WhSupplierInvoiceConflictError(
      "Rechnung ist bereits vollständig bezahlt"
    )
  }

  // 3. Use transaction for atomicity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (prisma as any).$transaction(async (tx: PrismaClient) => {
    // Re-read payments inside transaction
    const existingPayments = await tx.whSupplierPayment.findMany({
      where: { invoiceId: input.invoiceId, status: "ACTIVE" },
      select: { amount: true },
    })

    const currentPaid = existingPayments.reduce(
      (sum: number, p: { amount: number }) => sum + p.amount,
      0
    )

    // Check for discount
    const paymentDate = new Date(input.date)
    const discount = getApplicableDiscount(
      {
        documentDate: invoice.invoiceDate,
        discountDays: invoice.discountDays,
        discountPercent: invoice.discountPercent,
        discountDays2: invoice.discountDays2,
        discountPercent2: invoice.discountPercent2,
      },
      paymentDate
    )

    let totalNewAmount = input.amount

    // If discount applies and isDiscount not explicitly set to false, create discount entry
    if (discount && input.isDiscount !== false) {
      const discountAmount =
        Math.round(invoice.totalGross * (discount.percent / 100) * 100) / 100
      totalNewAmount = input.amount + discountAmount

      // Validate overpayment
      if (currentPaid + totalNewAmount > invoice.totalGross + 0.01) {
        throw new WhSupplierInvoiceConflictError(
          "Zahlung übersteigt den Rechnungsbetrag"
        )
      }

      // Create discount payment entry
      await tx.whSupplierPayment.create({
        data: {
          tenantId,
          invoiceId: input.invoiceId,
          date: paymentDate,
          amount: discountAmount,
          type: input.type,
          isDiscount: true,
          notes: `Skonto ${discount.tier} (${discount.percent}%)`,
          createdById: createdById ?? null,
        },
      })
    } else {
      // Validate overpayment
      if (currentPaid + input.amount > invoice.totalGross + 0.01) {
        throw new WhSupplierInvoiceConflictError(
          "Zahlung übersteigt den Rechnungsbetrag"
        )
      }
    }

    // Create main payment
    const payment = await tx.whSupplierPayment.create({
      data: {
        tenantId,
        invoiceId: input.invoiceId,
        date: paymentDate,
        amount: input.amount,
        type: input.type,
        isDiscount: false,
        notes: input.notes ?? null,
        createdById: createdById ?? null,
      },
    })

    // Compute new status
    const newPaidAmount = currentPaid + totalNewAmount
    const paymentStatus = computePaymentStatus(invoice.totalGross, newPaidAmount)

    // Map to invoice status
    let invoiceStatus: "OPEN" | "PARTIAL" | "PAID"
    if (paymentStatus === "UNPAID") {
      invoiceStatus = "OPEN"
    } else if (paymentStatus === "PARTIAL") {
      invoiceStatus = "PARTIAL"
    } else {
      invoiceStatus = "PAID"
    }

    // Update invoice status
    await tx.whSupplierInvoice.updateMany({
      where: { id: input.invoiceId, tenantId },
      data: { status: invoiceStatus },
    })

    return payment
  })

  // Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "payment_create",
        entityType: "wh_supplier_invoice",
        entityId: input.invoiceId,
        entityName: invoice.number,
        changes: { amount: input.amount, type: input.type },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function cancelPayment(
  prisma: PrismaClient,
  tenantId: string,
  paymentId: string,
  cancelledById?: string,
  audit?: AuditContext
) {
  // 1. Fetch payment (verifying tenant via parent)
  const payment = await repo.findPaymentById(prisma, tenantId, paymentId)
  if (!payment) {
    throw new WhSupplierInvoiceNotFoundError("Payment not found")
  }

  if (payment.status === "CANCELLED") {
    throw new WhSupplierInvoiceConflictError("Zahlung ist bereits storniert")
  }

  // 2. Use transaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).$transaction(async (tx: PrismaClient) => {
    // Cancel the payment
    await tx.whSupplierPayment.updateMany({
      where: { id: paymentId, status: "ACTIVE" },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: cancelledById ?? null,
      },
    })

    // If non-discount payment, also cancel associated discount entries
    if (!payment.isDiscount) {
      await tx.whSupplierPayment.updateMany({
        where: {
          invoiceId: payment.invoiceId,
          date: payment.date,
          isDiscount: true,
          status: "ACTIVE",
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: cancelledById ?? null,
        },
      })
    }

    // Recalculate invoice status
    const remainingPayments = await tx.whSupplierPayment.findMany({
      where: { invoiceId: payment.invoiceId, status: "ACTIVE" },
      select: { amount: true },
    })

    const invoice = await tx.whSupplierInvoice.findFirst({
      where: { id: payment.invoiceId, tenantId },
      select: { totalGross: true },
    })

    if (invoice) {
      const newPaid = remainingPayments.reduce(
        (sum: number, p: { amount: number }) => sum + p.amount,
        0
      )
      const paymentStatus = computePaymentStatus(invoice.totalGross, newPaid)

      let invoiceStatus: "OPEN" | "PARTIAL" | "PAID"
      if (paymentStatus === "UNPAID") {
        invoiceStatus = "OPEN"
      } else if (paymentStatus === "PARTIAL") {
        invoiceStatus = "PARTIAL"
      } else {
        invoiceStatus = "PAID"
      }

      await tx.whSupplierInvoice.updateMany({
        where: { id: payment.invoiceId, tenantId },
        data: { status: invoiceStatus },
      })
    }
  })

  // Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "payment_cancel",
        entityType: "wh_supplier_invoice",
        entityId: payment.invoiceId,
        entityName: paymentId,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

export async function listPayments(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string
) {
  const payments = await repo.findPaymentsByInvoiceId(prisma, tenantId, invoiceId)
  if (payments === null) {
    throw new WhSupplierInvoiceNotFoundError()
  }
  return payments
}

export async function summary(
  prisma: PrismaClient,
  tenantId: string,
  supplierId?: string
) {
  const invoices = await repo.findAllForSummary(prisma, tenantId, supplierId)

  let totalOpen = 0
  let totalOverdue = 0
  let totalPaidThisMonth = 0
  let overdueCount = 0

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  for (const inv of invoices) {
    const enriched = enrichInvoice(inv)
    totalOpen += enriched.openAmount

    if (enriched.isOverdue) {
      totalOverdue += enriched.openAmount
      overdueCount++
    }

    // Sum payments made this month
    for (const p of inv.payments) {
      if (new Date((p as { createdAt: Date }).createdAt) >= startOfMonth) {
        totalPaidThisMonth += p.amount
      }
    }
  }

  return {
    totalOpen: Math.round(totalOpen * 100) / 100,
    totalOverdue: Math.round(totalOverdue * 100) / 100,
    totalPaidThisMonth: Math.round(totalPaidThisMonth * 100) / 100,
    invoiceCount: invoices.length,
    overdueCount,
  }
}
