import type { PrismaClient, BillingPaymentType } from "@/generated/prisma/client"

// --- Includes (shared across find operations) ---

const PAYMENT_INCLUDE = {
  document: {
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      documentDate: true,
      totalGross: true,
      paymentTermDays: true,
      discountPercent: true,
      discountDays: true,
      discountPercent2: true,
      discountDays2: true,
      address: { select: { id: true, company: true } },
    },
  },
}

const OPEN_ITEM_INCLUDE = {
  address: { select: { id: true, company: true } },
  payments: {
    where: { status: "ACTIVE" as const },
    orderBy: { date: "desc" as const },
  },
  childDocuments: {
    where: { type: "CREDIT_NOTE" as const, status: { not: "CANCELLED" as const } },
    select: { id: true, totalGross: true },
  },
}

const OPEN_ITEM_DETAIL_INCLUDE = {
  address: true,
  contact: true,
  payments: {
    orderBy: { date: "desc" as const },
  },
  childDocuments: {
    where: { type: "CREDIT_NOTE" as const, status: { not: "CANCELLED" as const } },
    select: { id: true, totalGross: true },
  },
}

// --- Repository Functions ---

export async function findPaymentsByDocumentId(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  return prisma.billingPayment.findMany({
    where: { tenantId, documentId },
    orderBy: { date: "desc" },
    include: PAYMENT_INCLUDE,
  })
}

export async function findPaymentById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingPayment.findFirst({
    where: { id, tenantId },
    include: PAYMENT_INCLUDE,
  })
}

export async function createPayment(
  prisma: PrismaClient,
  data: {
    tenantId: string
    documentId: string
    date: Date
    amount: number
    type: BillingPaymentType
    isDiscount?: boolean
    notes?: string | null
    createdById?: string | null
  }
) {
  return prisma.billingPayment.create({
    data: {
      tenantId: data.tenantId,
      documentId: data.documentId,
      date: data.date,
      amount: data.amount,
      type: data.type,
      isDiscount: data.isDiscount ?? false,
      notes: data.notes ?? null,
      createdById: data.createdById ?? null,
    },
    include: PAYMENT_INCLUDE,
  })
}

export async function cancelPayment(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  cancelledById: string,
  notes?: string | null
) {
  // Use updateMany for tenant-scoped safety, then fetch with includes
  await prisma.billingPayment.updateMany({
    where: { id, tenantId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById,
      ...(notes !== undefined && notes !== null ? { notes } : {}),
    },
  })
  return prisma.billingPayment.findFirst({
    where: { id, tenantId },
    include: PAYMENT_INCLUDE,
  })
}

export async function findOpenItems(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    search?: string
    dateFrom?: Date
    dateTo?: Date
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = {
    tenantId,
    type: "INVOICE",
    status: { in: ["PRINTED", "PARTIALLY_FORWARDED", "FORWARDED"] },
  }

  if (params.addressId) where.addressId = params.addressId

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { number: { contains: term, mode: "insensitive" } },
        { address: { company: { contains: term, mode: "insensitive" } } },
      ]
    }
  }

  if (params.dateFrom || params.dateTo) {
    const dateFilter: Record<string, unknown> = {}
    if (params.dateFrom) dateFilter.gte = params.dateFrom
    if (params.dateTo) dateFilter.lte = params.dateTo
    where.documentDate = dateFilter
  }

  const [items, total] = await Promise.all([
    prisma.billingDocument.findMany({
      where,
      orderBy: { documentDate: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: OPEN_ITEM_INCLUDE,
    }),
    prisma.billingDocument.count({ where }),
  ])

  return { items, total }
}

export async function findOpenItemByDocumentId(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  return prisma.billingDocument.findFirst({
    where: {
      id: documentId,
      tenantId,
      type: "INVOICE",
    },
    include: OPEN_ITEM_DETAIL_INCLUDE,
  })
}

export async function getActivePaymentsForDocument(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  return prisma.billingPayment.findMany({
    where: { tenantId, documentId, status: "ACTIVE" },
    orderBy: { date: "desc" },
  })
}

export async function getCreditNoteReductions(
  prisma: PrismaClient,
  tenantId: string,
  parentDocumentId: string
) {
  const creditNotes = await prisma.billingDocument.findMany({
    where: {
      tenantId,
      parentDocumentId,
      type: "CREDIT_NOTE",
      status: { not: "CANCELLED" },
    },
    select: { totalGross: true },
  })
  return creditNotes.reduce((sum, cn) => sum + cn.totalGross, 0)
}
