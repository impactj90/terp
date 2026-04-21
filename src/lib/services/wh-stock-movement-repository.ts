import type { PrismaClient, Prisma } from "@/generated/prisma/client"

// =============================================================================
// Stock Movement Repository
// =============================================================================

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    articleId?: string
    type?: string
    dateFrom?: string
    dateTo?: string
    purchaseOrderId?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.articleId) {
    where.articleId = params.articleId
  }

  if (params.type) {
    where.type = params.type
  }

  if (params.purchaseOrderId) {
    where.purchaseOrderId = params.purchaseOrderId
  }

  if (params.dateFrom || params.dateTo) {
    const dateFilter: Record<string, unknown> = {}
    if (params.dateFrom) dateFilter.gte = new Date(params.dateFrom)
    if (params.dateTo) dateFilter.lte = new Date(params.dateTo)
    where.date = dateFilter
  }

  const [items, total] = await Promise.all([
    prisma.whStockMovement.findMany({
      where,
      include: {
        article: {
          select: { id: true, number: true, name: true, unit: true },
        },
        purchaseOrder: {
          select: { id: true, number: true },
        },
      },
      orderBy: { date: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whStockMovement.count({ where }),
  ])

  return { items, total }
}

export async function findByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string,
  limit = 50
) {
  return prisma.whStockMovement.findMany({
    where: { tenantId, articleId },
    include: {
      purchaseOrder: {
        select: { id: true, number: true },
      },
      serviceObject: {
        select: { id: true, number: true, name: true },
      },
    },
    orderBy: { date: "desc" },
    take: limit,
  })
}

export async function create(
  prisma: PrismaClient | Prisma.TransactionClient,
  data: {
    tenantId: string
    articleId: string
    type: string
    quantity: number
    previousStock: number
    newStock: number
    date?: Date
    purchaseOrderId?: string | null
    purchaseOrderPositionId?: string | null
    documentId?: string | null
    orderId?: string | null
    inventorySessionId?: string | null
    machineId?: string | null
    reason?: string | null
    notes?: string | null
    createdById?: string | null
  }
) {
  return (prisma as PrismaClient).whStockMovement.create({
    data: {
      tenantId: data.tenantId,
      articleId: data.articleId,
      type: data.type as "GOODS_RECEIPT" | "WITHDRAWAL" | "ADJUSTMENT" | "INVENTORY" | "RETURN" | "DELIVERY_NOTE",
      quantity: data.quantity,
      previousStock: data.previousStock,
      newStock: data.newStock,
      date: data.date ?? new Date(),
      purchaseOrderId: data.purchaseOrderId ?? null,
      purchaseOrderPositionId: data.purchaseOrderPositionId ?? null,
      documentId: data.documentId ?? null,
      orderId: data.orderId ?? null,
      inventorySessionId: data.inventorySessionId ?? null,
      machineId: data.machineId ?? null,
      reason: data.reason ?? null,
      notes: data.notes ?? null,
      createdById: data.createdById ?? null,
    },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
      purchaseOrder: {
        select: { id: true, number: true },
      },
    },
  })
}

export async function findRecent(
  prisma: PrismaClient,
  tenantId: string,
  limit: number = 10
) {
  return prisma.whStockMovement.findMany({
    where: { tenantId },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
      purchaseOrder: {
        select: { id: true, number: true },
      },
    },
    orderBy: { date: "desc" },
    take: limit,
  })
}

// --- Goods Receipt Helpers ---

export async function findPendingOrders(
  prisma: PrismaClient,
  tenantId: string,
  supplierId?: string
) {
  const where: Record<string, unknown> = {
    tenantId,
    status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] },
  }

  if (supplierId) {
    where.supplierId = supplierId
  }

  return prisma.whPurchaseOrder.findMany({
    where,
    include: {
      supplier: {
        select: { id: true, number: true, company: true },
      },
      _count: {
        select: { positions: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function findOrderWithPositions(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
) {
  return prisma.whPurchaseOrder.findFirst({
    where: {
      id: purchaseOrderId,
      tenantId,
      status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] },
    },
    include: {
      supplier: {
        select: { id: true, number: true, company: true },
      },
      positions: {
        include: {
          article: {
            select: {
              id: true,
              number: true,
              name: true,
              unit: true,
              currentStock: true,
              stockTracking: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  })
}
