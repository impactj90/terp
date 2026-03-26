/**
 * Warehouse Correction Repository
 *
 * Pure Prisma data-access functions for WhCorrectionMessage and WhCorrectionRun.
 */
import type { PrismaClient, WhCorrectionSeverity, WhCorrectionStatus, Prisma } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// --- Run functions ---

export async function createRun(
  prisma: PrismaClient,
  data: {
    tenantId: string
    trigger: string
    triggeredById?: string | null
  }
) {
  return prisma.whCorrectionRun.create({
    data: {
      tenantId: data.tenantId,
      trigger: data.trigger,
      triggeredById: data.triggeredById ?? null,
    },
  })
}

export async function completeRun(
  prisma: PrismaClient,
  runId: string,
  checksRun: number,
  issuesFound: number
) {
  return prisma.whCorrectionRun.update({
    where: { id: runId },
    data: {
      completedAt: new Date(),
      checksRun,
      issuesFound,
    },
  })
}

export async function findManyRuns(
  prisma: PrismaClient,
  tenantId: string,
  params: { page: number; pageSize: number }
) {
  const [items, total] = await Promise.all([
    prisma.whCorrectionRun.findMany({
      where: { tenantId },
      orderBy: { startedAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whCorrectionRun.count({ where: { tenantId } }),
  ])
  return { items, total }
}

// --- Message functions ---

export async function createManyMessages(
  prisma: PrismaClient,
  data: Array<{
    tenantId: string
    runId: string
    code: string
    severity: WhCorrectionSeverity
    message: string
    articleId?: string | null
    documentId?: string | null
    details?: Prisma.InputJsonValue | null
  }>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.whCorrectionMessage.createMany({ data: data as any })
}

export async function findManyMessages(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: WhCorrectionStatus
    severity?: WhCorrectionSeverity
    code?: string
    articleId?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.status) where.status = params.status
  if (params.severity) where.severity = params.severity
  if (params.code) where.code = params.code
  if (params.articleId) where.articleId = params.articleId

  const [items, total] = await Promise.all([
    prisma.whCorrectionMessage.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whCorrectionMessage.count({ where }),
  ])
  return { items, total }
}

export async function findMessageById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whCorrectionMessage.findFirst({
    where: { id, tenantId },
  })
}

export async function updateMessageStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    status: WhCorrectionStatus
    resolvedById?: string | null
    resolvedNote?: string | null
    resolvedAt?: Date
  }
) {
  return tenantScopedUpdate(
    prisma.whCorrectionMessage,
    { id, tenantId },
    data,
    { entity: "WhCorrectionMessage" }
  )
}

export async function updateManyMessagesStatus(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[],
  data: {
    status: WhCorrectionStatus
    resolvedById?: string | null
    resolvedNote?: string | null
    resolvedAt?: Date
  }
) {
  return prisma.whCorrectionMessage.updateMany({
    where: { id: { in: ids }, tenantId },
    data,
  })
}

export async function countOpenByTenantId(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.whCorrectionMessage.count({
    where: { tenantId, status: "OPEN" },
  })
}

export async function countOpenGroupedBySeverity(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.whCorrectionMessage.groupBy({
    by: ["severity"],
    where: { tenantId, status: "OPEN" },
    _count: { id: true },
  })
}

/**
 * Check if an OPEN message with the same code + articleId already exists.
 * Used for deduplication during check runs.
 */
export async function findOpenDuplicate(
  prisma: PrismaClient,
  tenantId: string,
  code: string,
  articleId: string | null,
  documentId: string | null
) {
  const where: Record<string, unknown> = {
    tenantId,
    code,
    status: "OPEN",
  }
  if (articleId) where.articleId = articleId
  else where.articleId = null
  if (documentId) where.documentId = documentId
  else where.documentId = null

  return prisma.whCorrectionMessage.findFirst({ where })
}

// --- Detection Queries (raw SQL for performance) ---

export async function findNegativeStockArticles(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{ id: string; number: string; name: string; current_stock: number }>
  >`
    SELECT id, number, name, current_stock
    FROM wh_articles
    WHERE tenant_id = ${tenantId}::uuid
      AND stock_tracking = true
      AND is_active = true
      AND current_stock < 0
  `
}

export async function findDuplicateReceipts(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      article_id: string
      purchase_order_id: string
      purchase_order_position_id: string
      cnt: number
      article_name: string
      article_number: string
    }>
  >`
    SELECT
      m.article_id,
      m.purchase_order_id,
      m.purchase_order_position_id,
      COUNT(*)::int AS cnt,
      a.name AS article_name,
      a.number AS article_number
    FROM wh_stock_movements m
    JOIN wh_articles a ON a.id = m.article_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND m.type = 'GOODS_RECEIPT'
      AND m.purchase_order_id IS NOT NULL
      AND m.purchase_order_position_id IS NOT NULL
    GROUP BY m.article_id, m.purchase_order_id, m.purchase_order_position_id, a.name, a.number
    HAVING COUNT(*) > 1
  `
}

export async function findOverdueOrders(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      id: string
      number: string
      supplier_id: string
      confirmed_delivery: Date | null
      requested_delivery: Date | null
    }>
  >`
    SELECT id, number, supplier_id, confirmed_delivery, requested_delivery
    FROM wh_purchase_orders
    WHERE tenant_id = ${tenantId}::uuid
      AND status IN ('ORDERED', 'PARTIALLY_RECEIVED')
      AND COALESCE(confirmed_delivery, requested_delivery) < NOW()
  `
}

export async function findUnmatchedReceipts(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      id: string
      article_id: string
      quantity: number
      date: Date
      article_name: string
      article_number: string
    }>
  >`
    SELECT m.id, m.article_id, m.quantity, m.date,
           a.name AS article_name, a.number AS article_number
    FROM wh_stock_movements m
    JOIN wh_articles a ON a.id = m.article_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND m.type = 'GOODS_RECEIPT'
      AND m.purchase_order_id IS NULL
  `
}

export async function findStockMismatches(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      id: string
      number: string
      name: string
      current_stock: number
      sum_movements: number
    }>
  >`
    SELECT a.id, a.number, a.name, a.current_stock,
           COALESCE(SUM(m.quantity), 0)::float AS sum_movements
    FROM wh_articles a
    LEFT JOIN wh_stock_movements m ON m.article_id = a.id AND m.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId}::uuid
      AND a.stock_tracking = true
      AND a.is_active = true
    GROUP BY a.id, a.number, a.name, a.current_stock
    HAVING ABS(a.current_stock - COALESCE(SUM(m.quantity), 0)) > 0.001
  `
}

export async function findLowStockNoOrder(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.$queryRaw<
    Array<{
      id: string
      number: string
      name: string
      current_stock: number
      min_stock: number
    }>
  >`
    SELECT a.id, a.number, a.name, a.current_stock, a.min_stock
    FROM wh_articles a
    WHERE a.tenant_id = ${tenantId}::uuid
      AND a.stock_tracking = true
      AND a.is_active = true
      AND a.min_stock IS NOT NULL
      AND a.current_stock < a.min_stock
      AND NOT EXISTS (
        SELECT 1 FROM wh_purchase_order_positions pop
        JOIN wh_purchase_orders po ON po.id = pop.purchase_order_id
        WHERE pop.article_id = a.id
          AND po.status IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED')
          AND po.tenant_id = a.tenant_id
      )
  `
}
