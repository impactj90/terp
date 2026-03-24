/**
 * Warehouse Purchase Order Service
 *
 * Business logic for purchase order (Einkauf / Bestellungen) operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-purchase-order-repository"
import * as numberSeqService from "./number-sequence-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const PO_TRACKED_FIELDS = [
  "supplierId", "contactId", "status", "orderDate",
  "requestedDelivery", "confirmedDelivery", "orderMethod",
  "orderMethodNote", "notes", "subtotalNet", "totalGross",
]

// --- Error Classes ---

export class WhPurchaseOrderNotFoundError extends Error {
  constructor(message = "Purchase order not found") {
    super(message)
    this.name = "WhPurchaseOrderNotFoundError"
  }
}

export class WhPurchaseOrderValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhPurchaseOrderValidationError"
  }
}

export class WhPurchaseOrderConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhPurchaseOrderConflictError"
  }
}

// --- Helper: Recalculate Totals ---

async function recalculateTotals(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
) {
  const positions = await prisma.whPurchaseOrderPosition.findMany({
    where: { purchaseOrderId },
    select: { totalPrice: true, vatRate: true },
  })

  let subtotalNet = 0
  const vatMap = new Map<number, number>()

  for (const pos of positions) {
    if (pos.totalPrice != null) {
      subtotalNet += pos.totalPrice
      if (pos.vatRate != null && pos.vatRate > 0) {
        const vatAmount = pos.totalPrice * (pos.vatRate / 100)
        vatMap.set(pos.vatRate, (vatMap.get(pos.vatRate) ?? 0) + vatAmount)
      }
    }
  }

  let totalVat = 0
  for (const amount of vatMap.values()) {
    totalVat += amount
  }

  const totalGross = subtotalNet + totalVat

  await prisma.whPurchaseOrder.updateMany({
    where: { id: purchaseOrderId, tenantId },
    data: {
      subtotalNet: Math.round(subtotalNet * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      totalGross: Math.round(totalGross * 100) / 100,
    },
  })
}

// --- Service Functions ---

export async function list(
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
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const order = await repo.findById(prisma, tenantId, id)
  if (!order) {
    throw new WhPurchaseOrderNotFoundError()
  }
  return order
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    supplierId: string
    contactId?: string
    requestedDelivery?: string
    notes?: string
    inquiryId?: string
  },
  createdById?: string,
  audit?: AuditContext
) {
  // 1. Validate supplier exists and type is SUPPLIER or BOTH
  const supplier = await prisma.crmAddress.findFirst({
    where: { id: input.supplierId },
    select: { id: true, type: true },
  })
  if (!supplier) {
    throw new WhPurchaseOrderValidationError("Supplier not found")
  }
  if (supplier.type !== "SUPPLIER" && supplier.type !== "BOTH") {
    throw new WhPurchaseOrderValidationError(
      "Address must be of type SUPPLIER or BOTH"
    )
  }

  // 2. Generate number via NumberSequence
  const number = await numberSeqService.getNextNumber(
    prisma,
    tenantId,
    "purchase_order"
  )

  // 3. If contactId provided, validate it belongs to the supplier
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.supplierId },
      select: { id: true },
    })
    if (!contact) {
      throw new WhPurchaseOrderValidationError(
        "Contact does not belong to the selected supplier"
      )
    }
  }

  // 4. Create the order
  const order = await repo.create(prisma, tenantId, {
    number,
    supplierId: input.supplierId,
    contactId: input.contactId,
    requestedDelivery: input.requestedDelivery,
    notes: input.notes,
    inquiryId: input.inquiryId,
    status: "DRAFT",
    createdById,
  })

  // 5. Audit log
  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "wh_purchase_order",
      entityId: order.id, entityName: number, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return order
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    supplierId?: string
    contactId?: string | null
    requestedDelivery?: string | null
    confirmedDelivery?: string | null
    notes?: string | null
    inquiryId?: string | null
  },
  audit?: AuditContext
) {
  // 1. Fetch existing
  const existing = await getById(prisma, tenantId, input.id)

  // 2. Reject if not DRAFT
  if (existing.status !== "DRAFT") {
    throw new WhPurchaseOrderValidationError(
      "Can only edit draft purchase orders"
    )
  }

  // 3. If supplierId changed, validate new supplier
  if (input.supplierId && input.supplierId !== existing.supplierId) {
    const supplier = await prisma.crmAddress.findFirst({
      where: { id: input.supplierId },
      select: { id: true, type: true },
    })
    if (!supplier) {
      throw new WhPurchaseOrderValidationError("Supplier not found")
    }
    if (supplier.type !== "SUPPLIER" && supplier.type !== "BOTH") {
      throw new WhPurchaseOrderValidationError(
        "Address must be of type SUPPLIER or BOTH"
      )
    }
  }

  // Build update data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}
  if (input.supplierId !== undefined) data.supplierId = input.supplierId
  if (input.contactId !== undefined) data.contactId = input.contactId
  if (input.requestedDelivery !== undefined) {
    data.requestedDelivery = input.requestedDelivery
      ? new Date(input.requestedDelivery)
      : null
  }
  if (input.confirmedDelivery !== undefined) {
    data.confirmedDelivery = input.confirmedDelivery
      ? new Date(input.confirmedDelivery)
      : null
  }
  if (input.notes !== undefined) data.notes = input.notes
  if (input.inquiryId !== undefined) data.inquiryId = input.inquiryId

  // 4. Update
  const updated = await repo.update(prisma, tenantId, input.id, data)

  // 5. Audit log with diff
  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      PO_TRACKED_FIELDS
    )
    if (changes) {
      await auditLog.log(prisma, {
        tenantId, userId: audit.userId, action: "update", entityType: "wh_purchase_order",
        entityId: input.id, entityName: existing.number, changes,
        ipAddress: audit.ipAddress, userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err))
    }
  }

  return updated
}

export async function deleteOrder(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // 1. Fetch existing
  const existing = await getById(prisma, tenantId, id)

  // 2. Reject if not DRAFT
  if (existing.status !== "DRAFT") {
    throw new WhPurchaseOrderValidationError(
      "Can only delete draft purchase orders"
    )
  }

  // 3. Delete
  const result = await repo.softDeleteById(prisma, tenantId, id)
  if (result.count === 0) {
    throw new WhPurchaseOrderNotFoundError()
  }

  // 4. Audit log
  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "wh_purchase_order",
      entityId: id, entityName: existing.number, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

export async function sendOrder(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: { method: string; methodNote?: string },
  audit?: AuditContext
) {
  // 1. Fetch existing
  const existing = await getById(prisma, tenantId, id)

  // 2. Reject if not DRAFT
  if (existing.status !== "DRAFT") {
    throw new WhPurchaseOrderValidationError(
      "Can only send draft purchase orders"
    )
  }

  // 3. Reject if no positions
  if (!existing.positions || existing.positions.length === 0) {
    throw new WhPurchaseOrderValidationError(
      "Purchase order has no positions"
    )
  }

  // 4. Update to ORDERED
  const updated = await repo.update(prisma, tenantId, id, {
    status: "ORDERED",
    orderDate: new Date(),
    orderMethod: input.method,
    orderMethodNote: input.methodNote ?? null,
  })

  // 5. Audit log
  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "send_order", entityType: "wh_purchase_order",
      entityId: id, entityName: existing.number,
      changes: { status: "ORDERED", orderMethod: input.method },
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // 1. Fetch existing
  const existing = await getById(prisma, tenantId, id)

  // 2. Reject if RECEIVED or CANCELLED
  if (existing.status === "RECEIVED" || existing.status === "CANCELLED") {
    throw new WhPurchaseOrderValidationError(
      "Cannot cancel a received or already cancelled order"
    )
  }

  // 3. Update to CANCELLED
  const updated = await repo.update(prisma, tenantId, id, {
    status: "CANCELLED",
  })

  // 4. Audit log
  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "cancel", entityType: "wh_purchase_order",
      entityId: id, entityName: existing.number,
      changes: { oldStatus: existing.status, status: "CANCELLED" },
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

// =============================================================================
// Position Functions
// =============================================================================

export async function listPositions(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
) {
  // Verify order belongs to tenant
  const order = await repo.findById(prisma, tenantId, purchaseOrderId)
  if (!order) {
    throw new WhPurchaseOrderNotFoundError()
  }
  return order.positions
}

export async function addPosition(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    purchaseOrderId: string
    articleId: string
    quantity: number
    unitPrice?: number
    unit?: string
    description?: string
    flatCosts?: number
    vatRate?: number
    requestedDelivery?: string
    confirmedDelivery?: string
  },
  audit?: AuditContext
) {
  // 1. Verify tenant + get order
  const order = await getById(prisma, tenantId, input.purchaseOrderId)

  // 2. Reject if not DRAFT
  if (order.status !== "DRAFT") {
    throw new WhPurchaseOrderValidationError(
      "Can only add positions to draft purchase orders"
    )
  }

  // 3. Validate article exists
  const article = await prisma.whArticle.findFirst({
    where: { id: input.articleId, tenantId },
    select: { id: true, number: true, name: true, unit: true, buyPrice: true, vatRate: true },
  })
  if (!article) {
    throw new WhPurchaseOrderValidationError("Article not found")
  }

  // 4. Auto-fill from WhArticleSupplier
  let supplierArticleNumber: string | null = null
  let unitPrice = input.unitPrice ?? null
  let unit = input.unit ?? null

  const supplierLink = await prisma.whArticleSupplier.findFirst({
    where: { articleId: input.articleId, supplierId: order.supplierId },
  })

  if (supplierLink) {
    supplierArticleNumber = supplierLink.supplierArticleNumber ?? null
    if (unitPrice === null || unitPrice === undefined) {
      unitPrice = supplierLink.buyPrice ?? article.buyPrice ?? null
    }
    if (!unit) {
      unit = supplierLink.orderUnit ?? article.unit ?? null
    }
  } else {
    if (unitPrice === null || unitPrice === undefined) {
      unitPrice = article.buyPrice ?? null
    }
    if (!unit) {
      unit = article.unit ?? null
    }
  }

  // 5. Calculate sortOrder
  const sortOrder = await repo.countPositions(prisma, input.purchaseOrderId)

  // 6. Calculate totalPrice
  const totalPrice =
    (input.quantity * (unitPrice ?? 0)) + (input.flatCosts ?? 0)

  // 7. Create position
  const vatRate = input.vatRate ?? article.vatRate
  const position = await repo.createPosition(prisma, input.purchaseOrderId, {
    sortOrder,
    articleId: input.articleId,
    supplierArticleNumber,
    description: input.description ?? null,
    quantity: input.quantity,
    unit,
    unitPrice,
    flatCosts: input.flatCosts ?? null,
    totalPrice,
    vatRate,
    requestedDelivery: input.requestedDelivery
      ? new Date(input.requestedDelivery)
      : null,
    confirmedDelivery: input.confirmedDelivery
      ? new Date(input.confirmedDelivery)
      : null,
  })

  // 8. Recalculate totals
  await recalculateTotals(prisma, tenantId, input.purchaseOrderId)

  // 9. Audit log
  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "wh_purchase_order_position",
      entityId: position.id, entityName: null,
      changes: { purchaseOrderId: input.purchaseOrderId, articleId: input.articleId, quantity: input.quantity },
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return position
}

export async function updatePosition(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    quantity?: number
    unitPrice?: number
    unit?: string
    description?: string
    flatCosts?: number
    vatRate?: number
    requestedDelivery?: string
    confirmedDelivery?: string
  },
  audit?: AuditContext
) {
  // 1. Verify position exists and order is tenant-scoped
  const position = await prisma.whPurchaseOrderPosition.findFirst({
    where: {
      id: input.id,
      purchaseOrder: { tenantId },
    },
    include: {
      purchaseOrder: { select: { id: true, tenantId: true, status: true } },
    },
  })
  if (!position) {
    throw new WhPurchaseOrderNotFoundError("Position not found")
  }

  // 2. Reject if not DRAFT
  if (position.purchaseOrder.status !== "DRAFT") {
    throw new WhPurchaseOrderValidationError(
      "Can only edit positions of draft purchase orders"
    )
  }

  // 3. Build update data and recalculate totalPrice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}
  if (input.quantity !== undefined) data.quantity = input.quantity
  if (input.unitPrice !== undefined) data.unitPrice = input.unitPrice
  if (input.unit !== undefined) data.unit = input.unit
  if (input.description !== undefined) data.description = input.description
  if (input.flatCosts !== undefined) data.flatCosts = input.flatCosts
  if (input.vatRate !== undefined) data.vatRate = input.vatRate
  if (input.requestedDelivery !== undefined) {
    data.requestedDelivery = input.requestedDelivery
      ? new Date(input.requestedDelivery)
      : null
  }
  if (input.confirmedDelivery !== undefined) {
    data.confirmedDelivery = input.confirmedDelivery
      ? new Date(input.confirmedDelivery)
      : null
  }

  // Recalculate totalPrice
  const qty = data.quantity ?? position.quantity
  const price = data.unitPrice ?? position.unitPrice ?? 0
  const flat = data.flatCosts ?? position.flatCosts ?? 0
  data.totalPrice = (qty * price) + flat

  // 4. Update position
  const updated = await repo.updatePosition(prisma, tenantId, input.id, data)
  if (!updated) {
    throw new WhPurchaseOrderNotFoundError("Position not found")
  }

  // 5. Recalculate totals
  await recalculateTotals(prisma, tenantId, position.purchaseOrder.id)

  // 6. Audit log
  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "wh_purchase_order_position",
      entityId: input.id, entityName: null, changes: data,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function deletePosition(
  prisma: PrismaClient,
  tenantId: string,
  positionId: string,
  audit?: AuditContext
) {
  // 1. Verify position + order tenant + DRAFT status
  const position = await prisma.whPurchaseOrderPosition.findFirst({
    where: {
      id: positionId,
      purchaseOrder: { tenantId },
    },
    include: {
      purchaseOrder: { select: { id: true, tenantId: true, status: true } },
    },
  })
  if (!position) {
    throw new WhPurchaseOrderNotFoundError("Position not found")
  }
  if (position.purchaseOrder.status !== "DRAFT") {
    throw new WhPurchaseOrderValidationError(
      "Can only delete positions of draft purchase orders"
    )
  }

  // 2. Delete
  const deleted = await repo.deletePosition(prisma, tenantId, positionId)
  if (!deleted) {
    throw new WhPurchaseOrderNotFoundError("Position not found")
  }

  // 3. Recalculate totals
  await recalculateTotals(prisma, tenantId, position.purchaseOrder.id)

  // 4. Audit log
  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "wh_purchase_order_position",
      entityId: positionId, entityName: null,
      changes: { articleId: position.articleId, quantity: position.quantity },
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

// =============================================================================
// Reorder Suggestions
// =============================================================================

export async function getReorderSuggestions(
  prisma: PrismaClient,
  tenantId: string,
  supplierId?: string
) {
  const articles = await repo.findArticlesBelowMinStock(
    prisma,
    tenantId,
    supplierId
  )

  return articles
    .map((article) => {
      const supplier = article.suppliers[0]
      const deficit = (article.minStock ?? 0) - article.currentStock
      const suggestedQty = Math.max(
        deficit,
        supplier?.defaultOrderQty ?? 0
      )

      return {
        articleId: article.id,
        articleNumber: article.number,
        articleName: article.name,
        currentStock: article.currentStock,
        minStock: article.minStock ?? 0,
        deficit,
        supplierId: supplier?.supplierId ?? null,
        supplierName: supplier?.supplier?.company ?? null,
        supplierArticleNumber: supplier?.supplierArticleNumber ?? null,
        suggestedQty,
        unitPrice: supplier?.buyPrice ?? article.buyPrice ?? null,
      }
    })
    .sort((a, b) => {
      // Sort by urgency: lowest stock ratio first
      const ratioA = a.minStock > 0 ? a.currentStock / a.minStock : 0
      const ratioB = b.minStock > 0 ? b.currentStock / b.minStock : 0
      return ratioA - ratioB
    })
}

export async function createFromSuggestions(
  prisma: PrismaClient,
  tenantId: string,
  input: { supplierId: string; articleIds: string[] },
  createdById?: string,
  audit?: AuditContext
) {
  // 1. Create DRAFT PO
  const order = await create(
    prisma,
    tenantId,
    { supplierId: input.supplierId },
    createdById,
    audit
  )

  // 2. For each articleId: add position with calculated suggestedQty
  for (const articleId of input.articleIds) {
    const article = await prisma.whArticle.findFirst({
      where: { id: articleId, tenantId },
      select: {
        id: true,
        currentStock: true,
        minStock: true,
        buyPrice: true,
        unit: true,
      },
    })
    if (!article) continue

    const deficit = (article.minStock ?? 0) - article.currentStock
    const supplierLink = await prisma.whArticleSupplier.findFirst({
      where: { articleId, supplierId: input.supplierId },
    })
    const suggestedQty = Math.max(
      deficit,
      supplierLink?.defaultOrderQty ?? 0
    )

    if (suggestedQty > 0) {
      await addPosition(
        prisma,
        tenantId,
        {
          purchaseOrderId: order.id,
          articleId,
          quantity: suggestedQty,
        },
        audit
      )
    }
  }

  // 3. Return the PO with positions
  return getById(prisma, tenantId, order.id)
}
