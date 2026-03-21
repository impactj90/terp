import type { PrismaClient, BillingDocumentType, BillingDocumentStatus, BillingPositionType, BillingPriceType } from "@/generated/prisma/client"

// --- Document Repository ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    type?: BillingDocumentType
    status?: BillingDocumentStatus
    addressId?: string
    inquiryId?: string
    search?: string
    dateFrom?: Date
    dateTo?: Date
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.type) where.type = params.type
  if (params.status) where.status = params.status
  if (params.addressId) where.addressId = params.addressId
  if (params.inquiryId) where.inquiryId = params.inquiryId

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { number: { contains: term, mode: "insensitive" } },
        { notes: { contains: term, mode: "insensitive" } },
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
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        address: true,
        contact: true,
        parentDocument: { select: { id: true, number: true, type: true } },
      },
    }),
    prisma.billingDocument.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingDocument.findFirst({
    where: { id, tenantId },
    include: {
      address: true,
      contact: true,
      deliveryAddress: true,
      invoiceAddress: true,
      inquiry: { select: { id: true, number: true, title: true } },
      order: { select: { id: true, code: true, name: true } },
      parentDocument: { select: { id: true, number: true, type: true } },
      childDocuments: { select: { id: true, number: true, type: true, status: true } },
      positions: { orderBy: { sortOrder: "asc" } },
    },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    number: string
    type: BillingDocumentType
    addressId: string
    contactId?: string | null
    deliveryAddressId?: string | null
    invoiceAddressId?: string | null
    inquiryId?: string | null
    orderId?: string | null
    parentDocumentId?: string | null
    orderDate?: Date | null
    documentDate?: Date
    deliveryDate?: Date | null
    deliveryType?: string | null
    deliveryTerms?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    discountPercent2?: number | null
    discountDays2?: number | null
    shippingCostNet?: number | null
    shippingCostVatRate?: number | null
    notes?: string | null
    internalNotes?: string | null
    headerText?: string | null
    footerText?: string | null
    createdById?: string | null
  }
) {
  return prisma.billingDocument.create({
    data,
    include: {
      address: true,
      contact: true,
      positions: { orderBy: { sortOrder: "asc" } },
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingDocument.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.billingDocument.findFirst({
    where: { id, tenantId },
    include: {
      address: true,
      contact: true,
      deliveryAddress: true,
      invoiceAddress: true,
      inquiry: { select: { id: true, number: true, title: true } },
      order: { select: { id: true, code: true, name: true } },
      parentDocument: { select: { id: true, number: true, type: true } },
      childDocuments: { select: { id: true, number: true, type: true, status: true } },
      positions: { orderBy: { sortOrder: "asc" } },
    },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingDocument.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Position Repository ---

export async function findPositions(
  prisma: PrismaClient,
  documentId: string
) {
  return prisma.billingDocumentPosition.findMany({
    where: { documentId },
    orderBy: { sortOrder: "asc" },
  })
}

export async function findPositionById(
  prisma: PrismaClient,
  id: string
) {
  return prisma.billingDocumentPosition.findFirst({
    where: { id },
    include: { document: { select: { id: true, tenantId: true, status: true } } },
  })
}

export async function createPosition(
  prisma: PrismaClient,
  data: {
    documentId: string
    sortOrder: number
    type: BillingPositionType | string
    articleId?: string | null
    articleNumber?: string | null
    description?: string | null
    quantity?: number | null
    unit?: string | null
    unitPrice?: number | null
    flatCosts?: number | null
    totalPrice?: number | null
    priceType?: BillingPriceType | string | null
    vatRate?: number | null
    deliveryDate?: Date | null
    confirmedDate?: Date | null
  }
) {
  return prisma.billingDocumentPosition.create({
    data: {
      ...data,
      type: data.type as BillingPositionType,
      priceType: data.priceType as BillingPriceType | null ?? undefined,
    },
  })
}

export async function createManyPositions(
  prisma: PrismaClient,
  positions: Array<{
    documentId: string
    sortOrder: number
    type: BillingPositionType | string
    articleId?: string | null
    articleNumber?: string | null
    description?: string | null
    quantity?: number | null
    unit?: string | null
    unitPrice?: number | null
    flatCosts?: number | null
    totalPrice?: number | null
    priceType?: BillingPriceType | string | null
    vatRate?: number | null
    deliveryDate?: Date | null
    confirmedDate?: Date | null
  }>
) {
  return prisma.billingDocumentPosition.createMany({
    data: positions.map(pos => ({
      ...pos,
      type: pos.type as BillingPositionType,
      priceType: pos.priceType as BillingPriceType | null ?? undefined,
    })),
  })
}

export async function updatePosition(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingDocumentPosition.updateMany({
    where: { id },
    data,
  })
  return prisma.billingDocumentPosition.findFirst({ where: { id } })
}

export async function deletePosition(
  prisma: PrismaClient,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingDocumentPosition.deleteMany({
    where: { id },
  })
  return count > 0
}

export async function getMaxSortOrder(
  prisma: PrismaClient,
  documentId: string
): Promise<number> {
  const result = await prisma.billingDocumentPosition.findFirst({
    where: { documentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  return result?.sortOrder ?? 0
}

export async function countChildDocuments(
  prisma: PrismaClient,
  tenantId: string,
  parentDocumentId: string
): Promise<number> {
  return prisma.billingDocument.count({
    where: { tenantId, parentDocumentId },
  })
}
