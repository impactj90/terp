/**
 * Warehouse Stock Movement Service
 *
 * Business logic for stock movements (Lagerbewegungen) and goods receipt (Wareneingang).
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-stock-movement-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class WhStockMovementNotFoundError extends Error {
  constructor(message = "Stock movement not found") {
    super(message)
    this.name = "WhStockMovementNotFoundError"
  }
}

export class WhStockMovementValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhStockMovementValidationError"
  }
}

// --- Query Functions ---

export async function listMovements(
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
  return repo.findMany(prisma, tenantId, params)
}

export async function listByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  // Verify article belongs to tenant
  const article = await prisma.whArticle.findFirst({
    where: { id: articleId, tenantId },
    select: { id: true },
  })
  if (!article) {
    throw new WhStockMovementNotFoundError("Article not found")
  }

  return repo.findByArticle(prisma, tenantId, articleId)
}

// --- Goods Receipt Functions ---

export async function listPendingOrders(
  prisma: PrismaClient,
  tenantId: string,
  supplierId?: string
) {
  return repo.findPendingOrders(prisma, tenantId, supplierId)
}

export async function getOrderPositions(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
) {
  const order = await repo.findOrderWithPositions(prisma, tenantId, purchaseOrderId)
  if (!order) {
    throw new WhStockMovementNotFoundError("Purchase order not found")
  }
  return order
}

export async function bookGoodsReceipt(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    purchaseOrderId: string
    positions: Array<{ positionId: string; quantity: number }>
  },
  userId: string,
  audit?: AuditContext
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch PO with tenant check
    const po = await tx.whPurchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, tenantId },
    })
    if (!po) {
      throw new WhStockMovementNotFoundError("Purchase order not found")
    }

    // 2. Validate PO status
    if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") {
      throw new WhStockMovementValidationError(
        "Purchase order is not in a receivable status"
      )
    }

    // 3. Process each position
    const movements = []
    for (const posInput of input.positions) {
      // 3a. Fetch position
      const position = await tx.whPurchaseOrderPosition.findFirst({
        where: { id: posInput.positionId, purchaseOrderId: input.purchaseOrderId },
      })
      if (!position) {
        throw new WhStockMovementValidationError(
          "Position not found on this purchase order"
        )
      }

      // 3b. Validate quantity
      if (posInput.quantity <= 0) {
        throw new WhStockMovementValidationError("Quantity must be positive")
      }
      const remaining = position.quantity - position.receivedQuantity
      if (posInput.quantity > remaining) {
        throw new WhStockMovementValidationError(
          `Quantity ${posInput.quantity} exceeds remaining quantity ${remaining}`
        )
      }

      // 3c. Fetch article
      const article = await tx.whArticle.findFirst({
        where: { id: position.articleId, tenantId },
      })
      if (!article) {
        throw new WhStockMovementValidationError("Article not found")
      }

      // 3d. Calculate stock
      const previousStock = article.currentStock
      const newStock = previousStock + posInput.quantity

      // 3e. Create stock movement
      const movement = await tx.whStockMovement.create({
        data: {
          tenantId,
          articleId: position.articleId,
          type: "GOODS_RECEIPT",
          quantity: posInput.quantity,
          previousStock,
          newStock,
          purchaseOrderId: input.purchaseOrderId,
          purchaseOrderPositionId: posInput.positionId,
          createdById: userId,
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
      movements.push(movement)

      // 3f. Update article stock
      await tx.whArticle.update({
        where: { id: position.articleId },
        data: { currentStock: newStock },
      })

      // 3g. Update position received quantity
      await tx.whPurchaseOrderPosition.update({
        where: { id: posInput.positionId },
        data: { receivedQuantity: { increment: posInput.quantity } },
      })
    }

    // 4. Update PO status
    const allPositions = await tx.whPurchaseOrderPosition.findMany({
      where: { purchaseOrderId: input.purchaseOrderId },
    })

    const allFullyReceived = allPositions.every(
      (p) => p.receivedQuantity >= p.quantity
    )
    const anyReceived = allPositions.some((p) => p.receivedQuantity > 0)

    let newStatus: "PARTIALLY_RECEIVED" | "RECEIVED" = "PARTIALLY_RECEIVED"
    if (allFullyReceived) {
      newStatus = "RECEIVED"
    } else if (anyReceived) {
      newStatus = "PARTIALLY_RECEIVED"
    }

    const updatedPO = await tx.whPurchaseOrder.update({
      where: { id: input.purchaseOrderId },
      data: { status: newStatus },
    })

    return { movements, purchaseOrder: updatedPO }
  })

  // 6. Audit log (fire-and-forget)
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "goods_receipt",
        entityType: "wh_stock_movement",
        entityId: input.purchaseOrderId,
        entityName: null,
        changes: {
          positions: input.positions.length,
          purchaseOrderId: input.purchaseOrderId,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function bookSinglePosition(
  prisma: PrismaClient,
  tenantId: string,
  input: { purchaseOrderPositionId: string; quantity: number },
  userId: string,
  audit?: AuditContext
) {
  // Fetch position with PO include to get purchaseOrderId and validate tenant
  const position = await prisma.whPurchaseOrderPosition.findFirst({
    where: { id: input.purchaseOrderPositionId },
    include: {
      purchaseOrder: {
        select: { id: true, tenantId: true },
      },
    },
  })

  if (!position || position.purchaseOrder.tenantId !== tenantId) {
    throw new WhStockMovementNotFoundError("Position not found")
  }

  return bookGoodsReceipt(
    prisma,
    tenantId,
    {
      purchaseOrderId: position.purchaseOrder.id,
      positions: [{ positionId: input.purchaseOrderPositionId, quantity: input.quantity }],
    },
    userId,
    audit
  )
}
