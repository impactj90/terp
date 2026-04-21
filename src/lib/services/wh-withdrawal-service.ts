/**
 * Warehouse Withdrawal Service
 *
 * Business logic for stock withdrawals (Lagerentnahmen).
 * Withdrawals create stock movements of type WITHDRAWAL with negative quantity.
 * Supports single withdrawal, batch withdrawal, and cancellation (reversal).
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import * as userDisplayNameService from "./user-display-name-service"

// --- Error Classes ---

export class WhWithdrawalNotFoundError extends Error {
  constructor(message = "Withdrawal not found") {
    super(message)
    this.name = "WhWithdrawalNotFoundError"
  }
}

export class WhWithdrawalValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhWithdrawalValidationError"
  }
}

// --- Types ---

type ReferenceType =
  | "ORDER"
  | "DOCUMENT"
  | "MACHINE"
  | "SERVICE_OBJECT"
  | "NONE"

interface CreateWithdrawalInput {
  articleId: string
  quantity: number
  referenceType: ReferenceType
  referenceId?: string
  machineId?: string
  serviceObjectId?: string
  notes?: string
}

interface CreateBatchWithdrawalInput {
  referenceType: ReferenceType
  referenceId?: string
  machineId?: string
  serviceObjectId?: string
  items: Array<{ articleId: string; quantity: number }>
  notes?: string
}

// --- Helper ---

function resolveReferences(
  referenceType: ReferenceType,
  referenceId?: string,
  machineId?: string,
  serviceObjectId?: string
) {
  return {
    orderId: referenceType === "ORDER" ? (referenceId ?? null) : null,
    documentId: referenceType === "DOCUMENT" ? (referenceId ?? null) : null,
    machineId:
      referenceType === "MACHINE" ? (machineId || referenceId || null) : null,
    serviceObjectId:
      referenceType === "SERVICE_OBJECT"
        ? (serviceObjectId || referenceId || null)
        : null,
  }
}

// --- Mutation Functions ---

export async function createWithdrawal(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateWithdrawalInput,
  userId: string,
  audit?: AuditContext
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Validate article exists and belongs to tenant
    const article = await tx.whArticle.findFirst({
      where: { id: input.articleId, tenantId },
    })
    if (!article) {
      throw new WhWithdrawalNotFoundError("Article not found")
    }

    // 2. Validate stock tracking is enabled
    if (!article.stockTracking) {
      throw new WhWithdrawalValidationError("Stock tracking is not enabled for this article")
    }

    // 3. Validate sufficient stock
    if (article.currentStock < input.quantity) {
      throw new WhWithdrawalValidationError(
        `Insufficient stock: ${article.currentStock} available, ${input.quantity} requested`
      )
    }

    // 4. Calculate stock values
    const previousStock = article.currentStock
    const newStock = previousStock - input.quantity

    // 5. Resolve reference fields
    const refs = resolveReferences(
      input.referenceType,
      input.referenceId,
      input.machineId,
      input.serviceObjectId
    )

    // 6. Create stock movement (negative quantity)
    const movement = await (tx as unknown as PrismaClient).whStockMovement.create({
      data: {
        tenantId,
        articleId: input.articleId,
        type: "WITHDRAWAL",
        quantity: -input.quantity, // Negative for withdrawal
        previousStock,
        newStock,
        orderId: refs.orderId,
        documentId: refs.documentId,
        machineId: refs.machineId,
        serviceObjectId: refs.serviceObjectId,
        notes: input.notes ?? null,
        createdById: userId,
      },
      include: {
        article: {
          select: { id: true, number: true, name: true, unit: true },
        },
      },
    })

    // 7. Update article stock
    await tx.whArticle.update({
      where: { id: input.articleId },
      data: { currentStock: newStock },
    })

    return movement
  })

  // Audit log (fire-and-forget)
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "withdrawal",
        entityType: "wh_stock_movement",
        entityId: result.id,
        entityName: null,
        changes: {
          articleId: input.articleId,
          quantity: input.quantity,
          referenceType: input.referenceType,
          referenceId: input.referenceId ?? null,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function createBatchWithdrawal(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateBatchWithdrawalInput,
  userId: string,
  audit?: AuditContext
) {
  const result = await prisma.$transaction(async (tx) => {
    const movements = []

    for (const item of input.items) {
      // 1. Validate article exists and belongs to tenant
      const article = await tx.whArticle.findFirst({
        where: { id: item.articleId, tenantId },
      })
      if (!article) {
        throw new WhWithdrawalNotFoundError(`Article ${item.articleId} not found`)
      }

      // 2. Validate stock tracking is enabled
      if (!article.stockTracking) {
        throw new WhWithdrawalValidationError(
          `Stock tracking is not enabled for article ${article.number}`
        )
      }

      // 3. Validate sufficient stock
      if (article.currentStock < item.quantity) {
        throw new WhWithdrawalValidationError(
          `Insufficient stock for article ${article.number}: ${article.currentStock} available, ${item.quantity} requested`
        )
      }

      // 4. Calculate stock values
      const previousStock = article.currentStock
      const newStock = previousStock - item.quantity

      // 5. Resolve reference fields
      const refs = resolveReferences(
        input.referenceType,
        input.referenceId,
        input.machineId,
        input.serviceObjectId
      )

      // 6. Create stock movement (negative quantity)
      const movement = await (tx as unknown as PrismaClient).whStockMovement.create({
        data: {
          tenantId,
          articleId: item.articleId,
          type: "WITHDRAWAL",
          quantity: -item.quantity,
          previousStock,
          newStock,
          orderId: refs.orderId,
          documentId: refs.documentId,
          machineId: refs.machineId,
          serviceObjectId: refs.serviceObjectId,
          notes: input.notes ?? null,
          createdById: userId,
        },
        include: {
          article: {
            select: { id: true, number: true, name: true, unit: true },
          },
        },
      })
      movements.push(movement)

      // 7. Update article stock
      await tx.whArticle.update({
        where: { id: item.articleId },
        data: { currentStock: newStock },
      })
    }

    return movements
  })

  // Audit log (fire-and-forget)
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "withdrawal_batch",
        entityType: "wh_stock_movement",
        entityId: result[0]?.id ?? "batch",
        entityName: null,
        changes: {
          count: input.items.length,
          referenceType: input.referenceType,
          referenceId: input.referenceId ?? null,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

export async function cancelWithdrawal(
  prisma: PrismaClient,
  tenantId: string,
  movementId: string,
  userId: string,
  audit?: AuditContext
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Find the movement with tenant check
    const movement = await tx.whStockMovement.findFirst({
      where: { id: movementId, tenantId },
    })
    if (!movement) {
      throw new WhWithdrawalNotFoundError("Movement not found")
    }

    // 2. Validate it's a WITHDRAWAL or DELIVERY_NOTE type
    if (movement.type !== "WITHDRAWAL" && movement.type !== "DELIVERY_NOTE") {
      throw new WhWithdrawalValidationError("Can only cancel WITHDRAWAL or DELIVERY_NOTE type movements")
    }

    // 3. Validate it's an original withdrawal (negative quantity), not already a reversal
    if (movement.quantity >= 0) {
      throw new WhWithdrawalValidationError("Cannot cancel a reversal movement")
    }

    // 4. Get current article stock
    const article = await tx.whArticle.findFirst({
      where: { id: movement.articleId, tenantId },
    })
    if (!article) {
      throw new WhWithdrawalNotFoundError("Article not found")
    }

    // 5. Calculate reversal
    const reverseQty = Math.abs(movement.quantity)
    const previousStock = article.currentStock
    const newStock = previousStock + reverseQty

    // 6. Create reversal movement (positive quantity)
    const reversal = await (tx as unknown as PrismaClient).whStockMovement.create({
      data: {
        tenantId,
        articleId: movement.articleId,
        type: "WITHDRAWAL",
        quantity: reverseQty,
        previousStock,
        newStock,
        orderId: movement.orderId,
        documentId: movement.documentId,
        machineId: movement.machineId,
        serviceObjectId: movement.serviceObjectId,
        reason: `Storno of movement ${movementId}`,
        notes: movement.notes,
        createdById: userId,
      },
      include: {
        article: {
          select: { id: true, number: true, name: true, unit: true },
        },
      },
    })

    // 7. Update article stock
    await tx.whArticle.update({
      where: { id: movement.articleId },
      data: { currentStock: newStock },
    })

    return reversal
  })

  // Audit log (fire-and-forget)
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "withdrawal_cancel",
        entityType: "wh_stock_movement",
        entityId: movementId,
        entityName: null,
        changes: { cancelledMovementId: movementId },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return result
}

// --- Query Functions ---

export async function listWithdrawals(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    orderId?: string
    documentId?: string
    machineId?: string
    serviceObjectId?: string
    dateFrom?: string
    dateTo?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = {
    tenantId,
    type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] },
  }

  if (params.orderId) {
    where.orderId = params.orderId
  }

  if (params.documentId) {
    where.documentId = params.documentId
  }

  if (params.machineId) {
    where.machineId = params.machineId
  }

  if (params.serviceObjectId) {
    where.serviceObjectId = params.serviceObjectId
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
        serviceObject: {
          select: { id: true, number: true, name: true },
        },
      },
      orderBy: { date: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.whStockMovement.count({ where }),
  ])

  const createdByIds = items
    .map((m) => m.createdById)
    .filter((id): id is string => id !== null)
  const userMap = await userDisplayNameService.resolveMany(
    prisma,
    tenantId,
    createdByIds
  )
  const enriched = items.map((m) => ({
    ...m,
    createdBy: m.createdById
      ? {
          userId: m.createdById,
          displayName:
            userMap.get(m.createdById)?.displayName ?? "Unbekannt",
        }
      : null,
  }))

  return { items: enriched, total }
}

export async function listByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  params?: { limit?: number }
) {
  return prisma.whStockMovement.findMany({
    where: {
      tenantId,
      type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] },
      serviceObjectId,
    },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
    },
    orderBy: { date: "desc" },
    take: params?.limit ?? 50,
  })
}

export async function listByOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
) {
  return prisma.whStockMovement.findMany({
    where: { tenantId, type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] }, orderId },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
    },
    orderBy: { date: "desc" },
  })
}

export async function listByDocument(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  return prisma.whStockMovement.findMany({
    where: { tenantId, type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] }, documentId },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
    },
    orderBy: { date: "desc" },
  })
}
