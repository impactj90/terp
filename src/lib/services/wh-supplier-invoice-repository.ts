import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// =============================================================================
// Supplier Invoice Repository
// =============================================================================

export async function findMany(
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
  const where: Record<string, unknown> = { tenantId }

  if (params.supplierId) {
    where.supplierId = params.supplierId
  }

  if (params.status) {
    where.status = params.status
  }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { number: { contains: term, mode: "insensitive" } },
        { supplier: { company: { contains: term, mode: "insensitive" } } },
      ]
    }
  }

  if (params.dateFrom || params.dateTo) {
    const dateFilter: Record<string, unknown> = {}
    if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
    if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
    where.invoiceDate = dateFilter
  }

  const [items, total] = await Promise.all([
    prisma.whSupplierInvoice.findMany({
      where,
      include: {
        supplier: { select: { id: true, number: true, company: true } },
        payments: {
          where: { status: "ACTIVE" },
          select: { amount: true, status: true },
        },
        _count: { select: { payments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whSupplierInvoice.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whSupplierInvoice.findFirst({
    where: { id, tenantId },
    include: {
      supplier: true,
      purchaseOrder: { select: { id: true, number: true, status: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    number: string
    supplierId: string
    purchaseOrderId?: string | null
    invoiceDate: Date
    receivedDate?: Date
    totalNet: number
    totalVat: number
    totalGross: number
    paymentTermDays?: number | null
    dueDate?: Date | null
    discountPercent?: number | null
    discountDays?: number | null
    discountPercent2?: number | null
    discountDays2?: number | null
    notes?: string | null
    createdById?: string | null
  }
) {
  return prisma.whSupplierInvoice.create({
    data: {
      tenantId: data.tenantId,
      number: data.number,
      supplierId: data.supplierId,
      purchaseOrderId: data.purchaseOrderId ?? null,
      invoiceDate: data.invoiceDate,
      receivedDate: data.receivedDate ?? new Date(),
      totalNet: data.totalNet,
      totalVat: data.totalVat,
      totalGross: data.totalGross,
      paymentTermDays: data.paymentTermDays ?? null,
      dueDate: data.dueDate ?? null,
      discountPercent: data.discountPercent ?? null,
      discountDays: data.discountDays ?? null,
      discountPercent2: data.discountPercent2 ?? null,
      discountDays2: data.discountDays2 ?? null,
      notes: data.notes ?? null,
      createdById: data.createdById ?? null,
    },
    include: {
      supplier: { select: { id: true, number: true, company: true } },
      payments: true,
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(
    prisma.whSupplierInvoice,
    { id, tenantId },
    data,
    {
      entity: "WhSupplierInvoice",
      include: {
        supplier: { select: { id: true, number: true, company: true } },
        payments: true,
      },
    }
  )
}

export async function updateStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: string
) {
  return prisma.whSupplierInvoice.updateMany({
    where: { id, tenantId },
    data: { status: status as "OPEN" | "PARTIAL" | "PAID" | "CANCELLED" },
  })
}

// =============================================================================
// Payment Repository
// =============================================================================

export async function findPaymentById(
  prisma: PrismaClient,
  tenantId: string,
  paymentId: string
) {
  return prisma.whSupplierPayment.findFirst({
    where: {
      id: paymentId,
      invoice: { tenantId },
    },
  })
}

export async function createPayment(
  prisma: PrismaClient,
  data: {
    tenantId: string
    invoiceId: string
    date: Date
    amount: number
    type: "CASH" | "BANK"
    isDiscount?: boolean
    notes?: string | null
    createdById?: string | null
  }
) {
  return prisma.whSupplierPayment.create({
    data: {
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      date: data.date,
      amount: data.amount,
      type: data.type,
      isDiscount: data.isDiscount ?? false,
      notes: data.notes ?? null,
      createdById: data.createdById ?? null,
    },
  })
}

export async function cancelPayment(
  prisma: PrismaClient,
  tenantId: string,
  paymentId: string,
  cancelledById?: string
) {
  // First verify tenant via parent
  const payment = await prisma.whSupplierPayment.findFirst({
    where: {
      id: paymentId,
      invoice: { tenantId },
    },
  })
  if (!payment) return null

  await prisma.whSupplierPayment.updateMany({
    where: { id: paymentId, status: "ACTIVE" },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: cancelledById ?? null,
    },
  })

  return prisma.whSupplierPayment.findFirst({
    where: { id: paymentId },
  })
}

export async function findPaymentsByInvoiceId(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string
) {
  // First verify invoice belongs to tenant
  const invoice = await prisma.whSupplierInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { id: true },
  })
  if (!invoice) return null

  return prisma.whSupplierPayment.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
  })
}

export async function findAllForSummary(
  prisma: PrismaClient,
  tenantId: string,
  supplierId?: string
) {
  const where: Record<string, unknown> = {
    tenantId,
    status: { not: "CANCELLED" },
  }
  if (supplierId) {
    where.supplierId = supplierId
  }

  return prisma.whSupplierInvoice.findMany({
    where,
    include: {
      payments: {
        where: { status: "ACTIVE" },
        select: { amount: true, status: true, createdAt: true },
      },
    },
  })
}
