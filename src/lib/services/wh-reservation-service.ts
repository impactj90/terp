/**
 * Warehouse Reservation Service
 *
 * Business logic for stock reservations (Artikelreservierungen).
 * Reservations are created automatically when an ORDER_CONFIRMATION is finalized,
 * and released when a DELIVERY_NOTE is created, the document is cancelled,
 * or manually released by a user.
 *
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-reservation-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class WhReservationNotFoundError extends Error {
  constructor(message = "Stock reservation not found") {
    super(message)
    this.name = "WhReservationNotFoundError"
  }
}

export class WhReservationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhReservationValidationError"
  }
}

// --- Query Functions ---

export async function list(
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
  return repo.findMany(prisma, tenantId, params)
}

export async function getByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  // 1. Verify article exists and belongs to tenant
  const article = await prisma.whArticle.findFirst({
    where: { id: articleId, tenantId },
    select: {
      id: true,
      number: true,
      name: true,
      unit: true,
      currentStock: true,
      stockTracking: true,
    },
  })

  if (!article) {
    throw new WhReservationNotFoundError("Article not found")
  }

  // 2. Get active reservations
  const reservations = await repo.findActiveByArticle(prisma, tenantId, articleId)

  // 3. Get reserved total
  const reservedStock = await repo.sumActiveQuantity(prisma, tenantId, articleId)

  // 4. Enrich reservations with document info (not a Prisma relation)
  const documentIds = [...new Set(reservations.map((r) => r.documentId))]
  let documentMap: Map<string, { number: string; company?: string | null }> = new Map()

  if (documentIds.length > 0) {
    const docs = await prisma.billingDocument.findMany({
      where: { id: { in: documentIds }, tenantId },
      select: {
        id: true,
        number: true,
        address: {
          select: { company: true },
        },
      },
    })
    documentMap = new Map(
      docs.map((d) => [d.id, { number: d.number, company: d.address?.company }])
    )
  }

  const enrichedReservations = reservations.map((r) => ({
    ...r,
    document: documentMap.get(r.documentId) ?? null,
  }))

  return {
    reservations: enrichedReservations,
    currentStock: article.currentStock,
    reservedStock,
    availableStock: article.currentStock - reservedStock,
  }
}

export async function getAvailableStock(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  const article = await prisma.whArticle.findFirst({
    where: { id: articleId, tenantId },
    select: { id: true, currentStock: true, stockTracking: true },
  })

  if (!article) {
    throw new WhReservationNotFoundError("Article not found")
  }

  const reservedStock = await repo.sumActiveQuantity(prisma, tenantId, articleId)

  return {
    currentStock: article.currentStock,
    reservedStock,
    availableStock: article.currentStock - reservedStock,
  }
}

// --- Mutation Functions ---

/**
 * Create reservations for all stock-tracked article positions in an ORDER_CONFIRMATION.
 * Called from billing-document-service.ts finalize() as best-effort.
 */
export async function createReservationsForDocument(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // 1. Fetch document with positions
    const doc = await txPrisma.billingDocument.findFirst({
      where: { id: documentId, tenantId, type: "ORDER_CONFIRMATION" },
      include: { positions: true },
    })

    // 2. If not ORDER_CONFIRMATION, no-op
    if (!doc) return { reservedCount: 0 }

    // 3. Filter positions: any position with articleId and quantity > 0
    const articlePositions = doc.positions.filter(
      (p) => p.articleId != null && (p.quantity ?? 0) > 0
    )

    let reservedCount = 0

    // 4. For each filtered position, create reservation
    for (const pos of articlePositions) {
      // Check if article exists and has stock tracking
      const article = await txPrisma.whArticle.findFirst({
        where: { id: pos.articleId!, tenantId },
        select: { id: true, stockTracking: true },
      })

      // Skip if article not found or no stock tracking
      if (!article || !article.stockTracking) continue

      await repo.create(txPrisma, {
        tenantId,
        articleId: pos.articleId!,
        documentId,
        positionId: pos.id,
        quantity: pos.quantity!,
        createdById: userId,
      })

      reservedCount++
    }

    return { reservedCount }
  })
}

/**
 * Release reservations when an ORDER_CONFIRMATION is forwarded to a DELIVERY_NOTE.
 * Sets status=FULFILLED with releaseReason="DELIVERY_NOTE".
 */
export async function releaseReservationsForDeliveryNote(
  prisma: PrismaClient,
  tenantId: string,
  deliveryNoteId: string,
  userId: string
) {
  // 1. Fetch delivery note to find parent document
  const deliveryNote = await prisma.billingDocument.findFirst({
    where: { id: deliveryNoteId, tenantId },
    select: { parentDocumentId: true, type: true },
  })

  // 2. No-op if no parent or not a delivery note
  if (!deliveryNote?.parentDocumentId || deliveryNote.type !== "DELIVERY_NOTE") {
    return { releasedCount: 0 }
  }

  // 3. Release all active reservations for the parent ORDER_CONFIRMATION
  const result = await repo.releaseAllByDocument(prisma, tenantId, deliveryNote.parentDocumentId, {
    status: "FULFILLED",
    releasedAt: new Date(),
    releasedById: userId,
    releaseReason: "DELIVERY_NOTE",
  })

  return { releasedCount: result.count }
}

/**
 * Release reservations when a document is cancelled.
 * Sets status=RELEASED with releaseReason="CANCELLED".
 */
export async function releaseReservationsForCancel(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  userId?: string | null
) {
  const result = await repo.releaseAllByDocument(prisma, tenantId, documentId, {
    status: "RELEASED",
    releasedAt: new Date(),
    releasedById: userId ?? null,
    releaseReason: "CANCELLED",
  })

  return { releasedCount: result.count }
}

/**
 * Manually release a single reservation.
 */
export async function release(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  userId: string,
  reason?: string,
  audit?: AuditContext
) {
  // 1. Fetch reservation with tenant guard
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new WhReservationNotFoundError()
  }

  // 2. Must be ACTIVE
  if (existing.status !== "ACTIVE") {
    throw new WhReservationValidationError("Only active reservations can be released")
  }

  // 3. Update
  const updated = await repo.update(prisma, tenantId, id, {
    status: "RELEASED",
    releasedAt: new Date(),
    releasedById: userId,
    releaseReason: reason || "MANUAL",
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "release",
      entityType: "wh_reservation",
      entityId: id,
      entityName: existing.articleId ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

/**
 * Manually release all active reservations for a document (bulk release).
 */
export async function releaseBulk(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  userId: string,
  reason?: string,
  audit?: AuditContext
) {
  // Verify document belongs to tenant
  const doc = await prisma.billingDocument.findFirst({
    where: { id: documentId, tenantId },
    select: { id: true },
  })
  if (!doc) {
    throw new WhReservationNotFoundError("Document not found")
  }

  const result = await repo.releaseAllByDocument(prisma, tenantId, documentId, {
    status: "RELEASED",
    releasedAt: new Date(),
    releasedById: userId,
    releaseReason: reason || "MANUAL",
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "release_bulk",
      entityType: "wh_reservation",
      entityId: documentId,
      entityName: null,
      changes: null,
      metadata: { releasedCount: result.count, documentId },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { releasedCount: result.count }
}
