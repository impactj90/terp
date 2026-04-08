import type { PrismaClient, Prisma } from "@/generated/prisma/client"

// =============================================================================
// Stocktake Repository
// =============================================================================

// --- Stocktake Queries ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: string
    search?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.status) {
    where.status = params.status
  }

  if (params.search) {
    where.OR = [
      { number: { contains: params.search, mode: "insensitive" } },
      { name: { contains: params.search, mode: "insensitive" } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.whStocktake.findMany({
      where,
      include: {
        _count: {
          select: { positions: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whStocktake.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whStocktake.findFirst({
    where: { id, tenantId },
    include: {
      _count: {
        select: { positions: true },
      },
    },
  })
}

export async function create(
  prisma: PrismaClient | Prisma.TransactionClient,
  data: {
    tenantId: string
    number: string
    name: string
    description?: string | null
    referenceDate?: Date
    scope?: string | null
    scopeFilter?: unknown
    notes?: string | null
    createdById?: string | null
  }
) {
  return (prisma as PrismaClient).whStocktake.create({
    data: {
      tenantId: data.tenantId,
      number: data.number,
      name: data.name,
      description: data.description ?? null,
      referenceDate: data.referenceDate ?? new Date(),
      scope: data.scope ?? null,
      scopeFilter: (data.scopeFilter as Prisma.InputJsonValue) ?? undefined,
      notes: data.notes ?? null,
      createdById: data.createdById ?? null,
    },
  })
}

export async function updateStatus(
  prisma: PrismaClient | Prisma.TransactionClient,
  id: string,
  data: {
    status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
    completedAt?: Date | null
    completedById?: string | null
    cancelledAt?: Date | null
    printedAt?: Date | null
  }
) {
  return (prisma as PrismaClient).whStocktake.update({
    where: { id },
    data: {
      status: data.status,
      completedAt: data.completedAt,
      completedById: data.completedById,
      cancelledAt: data.cancelledAt,
      printedAt: data.printedAt,
    },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  await prisma.whStocktake.deleteMany({
    where: { id, tenantId },
  })
}

// --- Position Queries ---

export async function findPositions(
  prisma: PrismaClient,
  stocktakeId: string,
  params?: {
    search?: string
    uncountedOnly?: boolean
    differenceOnly?: boolean
    page?: number
    pageSize?: number
  }
) {
  const where: Record<string, unknown> = { stocktakeId }

  if (params?.search) {
    where.OR = [
      { articleNumber: { contains: params.search, mode: "insensitive" } },
      { articleName: { contains: params.search, mode: "insensitive" } },
    ]
  }

  if (params?.uncountedOnly) {
    where.countedQuantity = null
    where.skipped = false
  }

  if (params?.differenceOnly) {
    where.difference = { not: 0 }
    where.countedQuantity = { not: null }
  }

  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 100

  const [items, total] = await Promise.all([
    prisma.whStocktakePosition.findMany({
      where,
      orderBy: { articleNumber: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.whStocktakePosition.count({ where }),
  ])

  return { items, total }
}

export async function findPositionByArticle(
  prisma: PrismaClient,
  stocktakeId: string,
  articleId: string
) {
  return prisma.whStocktakePosition.findFirst({
    where: { stocktakeId, articleId },
  })
}

export async function findPositionById(
  prisma: PrismaClient,
  positionId: string
) {
  return prisma.whStocktakePosition.findUnique({
    where: { id: positionId },
    include: {
      stocktake: {
        select: { id: true, tenantId: true, status: true, number: true },
      },
    },
  })
}

export async function createPositionsBulk(
  prisma: PrismaClient | Prisma.TransactionClient,
  positions: Array<{
    stocktakeId: string
    articleId: string
    articleNumber: string
    articleName: string
    unit: string
    warehouseLocation?: string | null
    expectedQuantity: number
    buyPrice?: number | null
  }>
) {
  const result = await (prisma as PrismaClient).whStocktakePosition.createMany({
    data: positions.map((p) => ({
      stocktakeId: p.stocktakeId,
      articleId: p.articleId,
      articleNumber: p.articleNumber,
      articleName: p.articleName,
      unit: p.unit,
      warehouseLocation: p.warehouseLocation ?? null,
      expectedQuantity: p.expectedQuantity,
      buyPrice: p.buyPrice ?? null,
    })),
  })
  return result.count
}

export async function updatePositionCount(
  prisma: PrismaClient | Prisma.TransactionClient,
  positionId: string,
  data: {
    countedQuantity: number
    difference: number
    valueDifference?: number | null
    countedById: string
    countedAt: Date
    note?: string | null
  }
) {
  return (prisma as PrismaClient).whStocktakePosition.update({
    where: { id: positionId },
    data: {
      countedQuantity: data.countedQuantity,
      difference: data.difference,
      valueDifference: data.valueDifference ?? null,
      countedById: data.countedById,
      countedAt: data.countedAt,
      note: data.note,
      skipped: false,
      skipReason: null,
    },
  })
}

export async function updatePositionReviewed(
  prisma: PrismaClient,
  positionId: string,
  reviewed: boolean
) {
  return prisma.whStocktakePosition.update({
    where: { id: positionId },
    data: { reviewed },
  })
}

export async function skipPosition(
  prisma: PrismaClient,
  positionId: string,
  skipReason: string
) {
  return prisma.whStocktakePosition.update({
    where: { id: positionId },
    data: {
      skipped: true,
      skipReason,
      countedQuantity: null,
      difference: null,
      valueDifference: null,
    },
  })
}

export async function countPositionStats(
  prisma: PrismaClient,
  stocktakeId: string
) {
  const [total, counted, skipped, reviewed] = await Promise.all([
    prisma.whStocktakePosition.count({ where: { stocktakeId } }),
    prisma.whStocktakePosition.count({
      where: { stocktakeId, countedQuantity: { not: null } },
    }),
    prisma.whStocktakePosition.count({
      where: { stocktakeId, skipped: true },
    }),
    prisma.whStocktakePosition.count({
      where: { stocktakeId, reviewed: true },
    }),
  ])

  return { total, counted, skipped, reviewed }
}

export async function findAllPositions(
  prisma: PrismaClient,
  stocktakeId: string
) {
  return prisma.whStocktakePosition.findMany({
    where: { stocktakeId },
    orderBy: { articleNumber: "asc" },
  })
}
