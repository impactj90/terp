import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// =============================================================================
// Purchase Order Repository
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
    where.orderDate = dateFilter
  }

  const [items, total] = await Promise.all([
    prisma.whPurchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, number: true, company: true } },
        _count: { select: { positions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whPurchaseOrder.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whPurchaseOrder.findFirst({
    where: { id, tenantId },
    include: {
      supplier: true,
      contact: true,
      inquiry: { select: { id: true, number: true, title: true } },
      positions: {
        include: {
          article: {
            select: { id: true, number: true, name: true, unit: true, buyPrice: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  })
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    number: string
    supplierId: string
    contactId?: string | null
    inquiryId?: string | null
    requestedDelivery?: string | null
    notes?: string | null
    status?: string
    createdById?: string | null
  }
) {
  return prisma.whPurchaseOrder.create({
    data: {
      tenantId,
      number: data.number,
      supplierId: data.supplierId,
      contactId: data.contactId ?? null,
      inquiryId: data.inquiryId ?? null,
      requestedDelivery: data.requestedDelivery ? new Date(data.requestedDelivery) : null,
      notes: data.notes ?? null,
      status: (data.status as "DRAFT") ?? "DRAFT",
      createdById: data.createdById ?? null,
    },
    include: {
      supplier: { select: { id: true, number: true, company: true } },
      positions: true,
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
    prisma.whPurchaseOrder,
    { id, tenantId },
    data,
    {
      entity: "WhPurchaseOrder",
      include: {
        supplier: { select: { id: true, number: true, company: true } },
        positions: {
          include: {
            article: {
              select: { id: true, number: true, name: true, unit: true, buyPrice: true },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    }
  )
}

export async function softDeleteById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whPurchaseOrder.deleteMany({
    where: { id, tenantId, status: "DRAFT" },
  })
}

// =============================================================================
// Position Repository
// =============================================================================

export async function findPositionsByOrder(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
) {
  // Verify order belongs to tenant
  const order = await prisma.whPurchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
    select: { id: true },
  })
  if (!order) return null

  return prisma.whPurchaseOrderPosition.findMany({
    where: { purchaseOrderId },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true, buyPrice: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  })
}

export async function createPosition(
  prisma: PrismaClient,
  purchaseOrderId: string,
  data: {
    sortOrder: number
    articleId: string
    supplierArticleNumber?: string | null
    description?: string | null
    quantity: number
    unit?: string | null
    unitPrice?: number | null
    flatCosts?: number | null
    totalPrice?: number | null
    vatRate?: number
    requestedDelivery?: Date | null
    confirmedDelivery?: Date | null
  }
) {
  return prisma.whPurchaseOrderPosition.create({
    data: {
      purchaseOrderId,
      sortOrder: data.sortOrder,
      articleId: data.articleId,
      supplierArticleNumber: data.supplierArticleNumber ?? null,
      description: data.description ?? null,
      quantity: data.quantity,
      unit: data.unit ?? null,
      unitPrice: data.unitPrice ?? null,
      flatCosts: data.flatCosts ?? null,
      totalPrice: data.totalPrice ?? null,
      vatRate: data.vatRate ?? 19.0,
      requestedDelivery: data.requestedDelivery ?? null,
      confirmedDelivery: data.confirmedDelivery ?? null,
    },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true, buyPrice: true },
      },
    },
  })
}

export async function updatePosition(
  prisma: PrismaClient,
  tenantId: string,
  positionId: string,
  data: Record<string, unknown>
) {
  // Verify tenant via parent relation
  const position = await prisma.whPurchaseOrderPosition.findFirst({
    where: {
      id: positionId,
      purchaseOrder: { tenantId },
    },
    select: { id: true, purchaseOrderId: true },
  })
  if (!position) return null

  return prisma.whPurchaseOrderPosition.update({
    where: { id: positionId },
    data,
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true, buyPrice: true },
      },
    },
  })
}

export async function deletePosition(
  prisma: PrismaClient,
  tenantId: string,
  positionId: string
) {
  // Verify tenant via parent relation
  const position = await prisma.whPurchaseOrderPosition.findFirst({
    where: {
      id: positionId,
      purchaseOrder: { tenantId },
    },
    select: { id: true, purchaseOrderId: true },
  })
  if (!position) return null

  await prisma.whPurchaseOrderPosition.delete({
    where: { id: positionId },
  })
  return position
}

export async function countPositions(
  prisma: PrismaClient,
  purchaseOrderId: string
) {
  return prisma.whPurchaseOrderPosition.count({
    where: { purchaseOrderId },
  })
}

export async function findArticlesBelowMinStock(
  prisma: PrismaClient,
  tenantId: string,
  supplierId?: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    tenantId,
    stockTracking: true,
    minStock: { not: null },
  }

  // If supplierId provided, filter to articles that have a supplier link
  if (supplierId) {
    where.suppliers = { some: { supplierId } }
  }

  const articles = await prisma.whArticle.findMany({
    where,
    include: {
      suppliers: supplierId
        ? {
            where: { supplierId },
            include: { supplier: { select: { id: true, number: true, company: true } } },
          }
        : {
            where: { isPrimary: true },
            include: { supplier: { select: { id: true, number: true, company: true } } },
          },
    },
  })

  // In-memory filter: currentStock < minStock (Prisma can't do field-to-field comparison)
  return articles.filter(
    (a) => a.minStock !== null && a.currentStock < a.minStock
  )
}
