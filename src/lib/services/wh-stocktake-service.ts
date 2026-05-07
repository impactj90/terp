/**
 * Warehouse Stocktake Service
 *
 * Business logic for stocktake (Inventur) sessions.
 * Workflow: DRAFT -> IN_PROGRESS -> COMPLETED | CANCELLED
 * On completion, creates INVENTORY stock movements and adjusts article stock.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-stocktake-repository"
import * as numberSeqService from "./number-sequence-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class WhStocktakeNotFoundError extends Error {
  constructor(message = "Stocktake not found") {
    super(message)
    this.name = "WhStocktakeNotFoundError"
  }
}

export class WhStocktakeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhStocktakeValidationError"
  }
}

export class WhStocktakeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhStocktakeConflictError"
  }
}

// --- Query Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: string
    search?: string
    page: number
    pageSize: number
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const stocktake = await repo.findById(prisma, tenantId, id)
  if (!stocktake) {
    throw new WhStocktakeNotFoundError()
  }

  const stats = await repo.countPositionStats(prisma, id)

  return { ...stocktake, stats }
}

export async function getPositions(
  prisma: PrismaClient,
  tenantId: string,
  stocktakeId: string,
  params?: {
    search?: string
    uncountedOnly?: boolean
    differenceOnly?: boolean
    page?: number
    pageSize?: number
  }
) {
  // Verify stocktake belongs to tenant
  const stocktake = await repo.findById(prisma, tenantId, stocktakeId)
  if (!stocktake) {
    throw new WhStocktakeNotFoundError()
  }

  return repo.findPositions(prisma, stocktakeId, params)
}

export async function getPositionByArticle(
  prisma: PrismaClient,
  tenantId: string,
  stocktakeId: string,
  articleId: string
) {
  const stocktake = await repo.findById(prisma, tenantId, stocktakeId)
  if (!stocktake) {
    throw new WhStocktakeNotFoundError()
  }

  return repo.findPositionByArticle(prisma, stocktakeId, articleId)
}

export async function getStats(
  prisma: PrismaClient,
  tenantId: string,
  stocktakeId: string
) {
  const stocktake = await repo.findById(prisma, tenantId, stocktakeId)
  if (!stocktake) {
    throw new WhStocktakeNotFoundError()
  }

  return repo.countPositionStats(prisma, stocktakeId)
}

// --- Mutation Functions ---

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    description?: string | null
    scope?: string | null
    scopeFilter?: unknown
    notes?: string | null
  },
  userId: string,
  audit?: AuditContext
) {
  // 1. Generate number
  const number = await numberSeqService.getNextNumber(prisma, tenantId, "stocktake")

  // 2. Query articles matching scope filter
  const articleWhere: Record<string, unknown> = {
    tenantId,
    stockTracking: true,
    isActive: true,
  }

  const scopeFilter = input.scopeFilter as {
    groupId?: string
    location?: string
    articleIds?: string[]
  } | null

  if (input.scope === "GROUP" && scopeFilter?.groupId) {
    articleWhere.groupId = scopeFilter.groupId
  } else if (input.scope === "LOCATION" && scopeFilter?.location) {
    articleWhere.warehouseLocation = scopeFilter.location
  } else if (scopeFilter?.articleIds?.length) {
    articleWhere.id = { in: scopeFilter.articleIds }
  }

  const articles = await prisma.whArticle.findMany({
    where: articleWhere,
    select: {
      id: true,
      number: true,
      name: true,
      unit: true,
      currentStock: true,
      buyPrice: true,
      warehouseLocation: true,
    },
    orderBy: { number: "asc" },
  })

  // 3. Validate at least 1 article matches
  if (articles.length === 0) {
    throw new WhStocktakeValidationError(
      "No stock-tracked articles found matching scope filter"
    )
  }

  // 4. Transaction: create header + positions
  const result = await prisma.$transaction(async (tx) => {
    const stocktake = await repo.create(tx, {
      tenantId,
      number,
      name: input.name,
      description: input.description,
      referenceDate: new Date(),
      scope: input.scope,
      scopeFilter: input.scopeFilter,
      notes: input.notes,
      createdById: userId,
    })

    const positionCount = await repo.createPositionsBulk(
      tx,
      articles.map((a) => ({
        stocktakeId: stocktake.id,
        articleId: a.id,
        articleNumber: a.number,
        articleName: a.name,
        unit: a.unit,
        warehouseLocation: a.warehouseLocation,
        expectedQuantity: a.currentStock,
        buyPrice: a.buyPrice,
      }))
    )

    return { stocktake, positionCount }
  })

  // 5. Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "wh_stocktake",
        entityId: result.stocktake.id,
        entityName: result.stocktake.number,
        changes: { positions: result.positionCount },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { ...result.stocktake, positionCount: result.positionCount }
}

export async function startCounting(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const stocktake = await repo.findById(prisma, tenantId, id)
  if (!stocktake) {
    throw new WhStocktakeNotFoundError()
  }

  if (stocktake.status !== "DRAFT") {
    throw new WhStocktakeValidationError(
      "Stocktake must be in DRAFT status to start counting"
    )
  }

  const updated = await repo.updateStatus(prisma, id, {
    status: "IN_PROGRESS",
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "start_counting",
        entityType: "wh_stocktake",
        entityId: id,
        entityName: stocktake.number,
        changes: { status: "IN_PROGRESS" },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function recordCount(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    stocktakeId: string
    articleId: string
    countedQuantity: number
    note?: string | null
  },
  userId: string,
  audit?: AuditContext
) {
  // 1. Verify stocktake
  const stocktake = await repo.findById(prisma, tenantId, input.stocktakeId)
  if (!stocktake) {
    throw new WhStocktakeNotFoundError()
  }

  if (stocktake.status !== "IN_PROGRESS") {
    throw new WhStocktakeValidationError(
      "Stocktake must be IN_PROGRESS to record counts"
    )
  }

  // 2. Find position by article
  const position = await repo.findPositionByArticle(
    prisma,
    input.stocktakeId,
    input.articleId
  )
  if (!position) {
    throw new WhStocktakeNotFoundError("Article not found in this stocktake")
  }

  // 3. Calculate difference
  const difference = input.countedQuantity - position.expectedQuantity
  const valueDifference = position.buyPrice
    ? difference * position.buyPrice
    : null

  // 4. Update position
  const updated = await repo.updatePositionCount(prisma, position.id, {
    countedQuantity: input.countedQuantity,
    difference,
    valueDifference,
    countedById: userId,
    countedAt: new Date(),
    note: input.note,
  })

  // 5. Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "count",
        entityType: "wh_stocktake",
        entityId: input.stocktakeId,
        entityName: `${stocktake.number} / ${position.articleNumber}`,
        changes: {
          articleId: input.articleId,
          countedQuantity: input.countedQuantity,
          difference,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function reviewPosition(
  prisma: PrismaClient,
  tenantId: string,
  positionId: string,
  reviewed: boolean,
  audit?: AuditContext
) {
  const position = await repo.findPositionById(prisma, positionId)
  if (!position || position.stocktake.tenantId !== tenantId) {
    throw new WhStocktakeNotFoundError("Position not found")
  }

  const updated = await repo.updatePositionReviewed(prisma, positionId, reviewed)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "review",
        entityType: "wh_stocktake",
        entityId: position.stocktake.id,
        entityName: position.stocktake.number,
        changes: { positionId, reviewed },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function skipPositionFn(
  prisma: PrismaClient,
  tenantId: string,
  positionId: string,
  skipReason: string,
  audit?: AuditContext
) {
  const position = await repo.findPositionById(prisma, positionId)
  if (!position || position.stocktake.tenantId !== tenantId) {
    throw new WhStocktakeNotFoundError("Position not found")
  }

  if (position.stocktake.status !== "IN_PROGRESS") {
    throw new WhStocktakeValidationError(
      "Stocktake must be IN_PROGRESS to skip positions"
    )
  }

  const updated = await repo.skipPosition(prisma, positionId, skipReason)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "skip",
        entityType: "wh_stocktake",
        entityId: position.stocktake.id,
        entityName: position.stocktake.number,
        changes: { positionId, skipReason },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function complete(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  userId: string,
  audit?: AuditContext
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch stocktake with all positions
    const stocktake = await (tx as unknown as PrismaClient).whStocktake.findFirst({
      where: { id, tenantId },
      include: { positions: true },
    })

    if (!stocktake) {
      throw new WhStocktakeNotFoundError()
    }

    if (stocktake.status !== "IN_PROGRESS") {
      throw new WhStocktakeValidationError(
        "Stocktake must be IN_PROGRESS to complete"
      )
    }

    // 2. Validate: all positions must be either counted or skipped
    const uncounted = stocktake.positions.filter(
      (p) => p.countedQuantity === null && !p.skipped
    )
    if (uncounted.length > 0) {
      throw new WhStocktakeValidationError(
        `${uncounted.length} positions are neither counted nor skipped`
      )
    }

    // 3. For each counted position with difference, create INVENTORY movement
    const movements = []
    const countedPositions = stocktake.positions.filter(
      (p) => p.countedQuantity !== null && !p.skipped
    )

    for (const position of countedPositions) {
      // Fetch current article stock (live, not frozen)
      // NK-1 (Decision 4): also load buyPrice for the unit-cost snapshot.
      const article = await (tx as unknown as PrismaClient).whArticle.findFirst({
        where: { id: position.articleId, tenantId },
        select: { id: true, currentStock: true, buyPrice: true },
      })

      if (!article) continue

      const movementQuantity = position.countedQuantity! - article.currentStock
      if (movementQuantity === 0) continue

      // Create INVENTORY stock movement
      const movement = await (tx as unknown as PrismaClient).whStockMovement.create({
        data: {
          tenantId,
          articleId: position.articleId,
          type: "INVENTORY",
          quantity: movementQuantity,
          previousStock: article.currentStock,
          newStock: position.countedQuantity!,
          inventorySessionId: stocktake.id,
          createdById: userId,
          unitCostAtMovement: article.buyPrice ?? null,
        },
      })
      movements.push(movement)

      // Update article stock
      await (tx as unknown as PrismaClient).whArticle.update({
        where: { id: position.articleId },
        data: { currentStock: position.countedQuantity! },
      })
    }

    // 4. Update stocktake status
    await repo.updateStatus(tx, id, {
      status: "COMPLETED",
      completedAt: new Date(),
      completedById: userId,
    })

    return { movements: movements.length, number: stocktake.number }
  })

  // 5. Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "complete",
        entityType: "wh_stocktake",
        entityId: id,
        entityName: result.number,
        changes: { adjustments: result.movements },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const stocktake = await repo.findById(prisma, tenantId, id)
  if (!stocktake) {
    throw new WhStocktakeNotFoundError()
  }

  if (stocktake.status === "COMPLETED") {
    throw new WhStocktakeValidationError(
      "Cannot cancel a completed stocktake"
    )
  }

  if (stocktake.status === "CANCELLED") {
    throw new WhStocktakeValidationError("Stocktake is already cancelled")
  }

  const updated = await repo.updateStatus(prisma, id, {
    status: "CANCELLED",
    cancelledAt: new Date(),
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "cancel",
        entityType: "wh_stocktake",
        entityId: id,
        entityName: stocktake.number,
        changes: { status: "CANCELLED" },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const stocktake = await repo.findById(prisma, tenantId, id)
  if (!stocktake) {
    throw new WhStocktakeNotFoundError()
  }

  if (stocktake.status !== "DRAFT") {
    throw new WhStocktakeValidationError(
      "Only DRAFT stocktakes can be deleted"
    )
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "wh_stocktake",
        entityId: id,
        entityName: stocktake.number,
        changes: { status: stocktake.status },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { deleted: true }
}
