import type { PrismaClient, Prisma } from "@/generated/prisma/client"

// =============================================================================
// Stock Reservation Repository
// =============================================================================

// --- List with pagination and filters ---
export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    articleId?: string
    documentId?: string
    status?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.articleId) {
    where.articleId = params.articleId
  }

  if (params.documentId) {
    where.documentId = params.documentId
  }

  if (params.status) {
    where.status = params.status
  }

  const [items, total] = await Promise.all([
    prisma.whStockReservation.findMany({
      where,
      include: {
        article: {
          select: { id: true, number: true, name: true, unit: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whStockReservation.count({ where }),
  ])

  return { items, total }
}

// --- Get active reservations for a specific article ---
export async function findActiveByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  return prisma.whStockReservation.findMany({
    where: { tenantId, articleId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  })
}

// --- Sum active reserved quantity for an article ---
export async function sumActiveQuantity(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
): Promise<number> {
  const result = await prisma.whStockReservation.aggregate({
    where: { tenantId, articleId, status: "ACTIVE" },
    _sum: { quantity: true },
  })
  return result._sum.quantity || 0
}

// --- Find by ID (with tenant guard) ---
export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whStockReservation.findFirst({
    where: { id, tenantId },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
    },
  })
}

// --- Find active reservations by document ---
export async function findActiveByDocument(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  return prisma.whStockReservation.findMany({
    where: { tenantId, documentId, status: "ACTIVE" },
  })
}

// --- Find active reservation by position ---
export async function findActiveByPosition(
  prisma: PrismaClient,
  tenantId: string,
  positionId: string
) {
  return prisma.whStockReservation.findFirst({
    where: { tenantId, positionId, status: "ACTIVE" },
  })
}

// --- Create reservation ---
export async function create(
  prisma: PrismaClient | Prisma.TransactionClient,
  data: {
    tenantId: string
    articleId: string
    documentId: string
    positionId: string
    quantity: number
    createdById?: string | null
  }
) {
  return (prisma as PrismaClient).whStockReservation.create({
    data: {
      tenantId: data.tenantId,
      articleId: data.articleId,
      documentId: data.documentId,
      positionId: data.positionId,
      quantity: data.quantity,
      createdById: data.createdById ?? null,
    },
  })
}

// --- Update reservation (for release/fulfill) ---
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    status: string
    releasedAt?: Date
    releasedById?: string | null
    releaseReason?: string
  }
) {
  await prisma.whStockReservation.updateMany({
    where: { id, tenantId },
    data,
  })
  return findById(prisma, tenantId, id)
}

// --- Bulk update by document (release all active) ---
export async function releaseAllByDocument(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  data: {
    status: string
    releasedAt: Date
    releasedById?: string | null
    releaseReason: string
  }
): Promise<{ count: number }> {
  return prisma.whStockReservation.updateMany({
    where: { tenantId, documentId, status: "ACTIVE" },
    data,
  })
}

// --- Find orphan reservations (for correction assistant) ---
export async function findOrphanReservations(
  prisma: PrismaClient,
  tenantId: string
) {
  // ACTIVE reservations where the linked document is CANCELLED or FORWARDED
  // Uses raw query since documentId is not a Prisma relation
  const rows = await prisma.$queryRaw<
    Array<{
      id: string
      articleId: string
      articleNumber: string
      documentId: string
      documentNumber: string
      documentStatus: string
      quantity: number
    }>
  >`
    SELECT
      r.id,
      r.article_id AS "articleId",
      a.number AS "articleNumber",
      r.document_id AS "documentId",
      d.number AS "documentNumber",
      d.status AS "documentStatus",
      r.quantity
    FROM wh_stock_reservations r
    JOIN wh_articles a ON a.id = r.article_id
    JOIN billing_documents d ON d.id = r.document_id
    WHERE r.tenant_id = ${tenantId}::uuid
      AND r.status = 'ACTIVE'
      AND d.status IN ('CANCELLED', 'FORWARDED')
  `
  return rows
}
