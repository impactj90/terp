/**
 * Warehouse Article Service
 *
 * Business logic for article (Artikelstamm) operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"
import * as repo from "./wh-article-repository"
import * as numberSeqService from "./number-sequence-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const ARTICLE_TRACKED_FIELDS = [
  "name", "description", "descriptionAlt", "groupId", "matchCode",
  "unit", "vatRate", "sellPrice", "buyPrice", "discountGroup", "orderType",
  "stockTracking", "currentStock", "minStock", "warehouseLocation", "isActive",
]

// --- Error Classes ---

export class WhArticleNotFoundError extends Error {
  constructor(message = "Article not found") {
    super(message)
    this.name = "WhArticleNotFoundError"
  }
}

export class WhArticleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhArticleValidationError"
  }
}

export class WhArticleConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhArticleConflictError"
  }
}

// --- BOM Circular Reference Check ---

async function checkBomCircular(
  prisma: PrismaClient,
  parentArticleId: string,
  childArticleId: string
): Promise<boolean> {
  // DFS: from childArticleId, find all its BOM children.
  // If parentArticleId appears, it's circular.
  const visited = new Set<string>([parentArticleId])
  const stack = [childArticleId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current)) return true
    visited.add(current)
    const children = await repo.findBomChildren(prisma, current)
    for (const c of children) {
      stack.push(c.childArticleId)
    }
  }
  return false
}

// --- Article Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    search?: string
    groupId?: string
    isActive?: boolean
    stockTracking?: boolean
    belowMinStock?: boolean
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
  const article = await repo.findById(prisma, tenantId, id)
  if (!article) {
    throw new WhArticleNotFoundError()
  }
  return article
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    description?: string
    descriptionAlt?: string
    groupId?: string
    matchCode?: string
    unit?: string
    vatRate?: number
    sellPrice?: number
    buyPrice?: number
    discountGroup?: string
    orderType?: string
    stockTracking?: boolean
    minStock?: number
    warehouseLocation?: string
    images?: unknown
  },
  createdById: string,
  audit?: AuditContext
) {
  const name = input.name.trim()
  if (name.length === 0) {
    throw new WhArticleValidationError("Article name is required")
  }

  // Auto-generate article number
  const number = await numberSeqService.getNextNumber(prisma, tenantId, "article")

  // Auto-generate matchCode from name if not provided
  const matchCode = input.matchCode?.trim() || name.toUpperCase().slice(0, 20)

  const created = await repo.create(prisma, {
    tenantId,
    number,
    name,
    description: input.description || null,
    descriptionAlt: input.descriptionAlt || null,
    groupId: input.groupId || null,
    matchCode,
    unit: input.unit || "Stk",
    vatRate: input.vatRate ?? 19.0,
    sellPrice: input.sellPrice ?? null,
    buyPrice: input.buyPrice ?? null,
    discountGroup: input.discountGroup || null,
    orderType: input.orderType || null,
    stockTracking: input.stockTracking ?? false,
    minStock: input.minStock ?? null,
    warehouseLocation: input.warehouseLocation || null,
    images: (input.images as Prisma.InputJsonValue) ?? null,
    createdById,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "wh_article",
      entityId: created.id, entityName: created.name, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    descriptionAlt?: string | null
    groupId?: string | null
    matchCode?: string | null
    unit?: string
    vatRate?: number
    sellPrice?: number | null
    buyPrice?: number | null
    discountGroup?: string | null
    orderType?: string | null
    stockTracking?: boolean
    minStock?: number | null
    warehouseLocation?: string | null
    images?: unknown
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new WhArticleNotFoundError()
  }

  // Build update data
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.description !== undefined) data.description = input.description
  if (input.descriptionAlt !== undefined) data.descriptionAlt = input.descriptionAlt
  if (input.groupId !== undefined) data.groupId = input.groupId
  if (input.matchCode !== undefined) data.matchCode = input.matchCode
  if (input.unit !== undefined) data.unit = input.unit
  if (input.vatRate !== undefined) data.vatRate = input.vatRate
  if (input.sellPrice !== undefined) data.sellPrice = input.sellPrice
  if (input.buyPrice !== undefined) data.buyPrice = input.buyPrice
  if (input.discountGroup !== undefined) data.discountGroup = input.discountGroup
  if (input.orderType !== undefined) data.orderType = input.orderType
  if (input.stockTracking !== undefined) data.stockTracking = input.stockTracking
  if (input.minStock !== undefined) data.minStock = input.minStock
  if (input.warehouseLocation !== undefined) data.warehouseLocation = input.warehouseLocation
  if (input.images !== undefined) data.images = input.images

  const updated = await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ARTICLE_TRACKED_FIELDS
    )
    if (changes) {
      await auditLog.log(prisma, {
        tenantId, userId: audit.userId, action: "update", entityType: "wh_article",
        entityId: input.id, entityName: updated.name ?? null, changes,
        ipAddress: audit.ipAddress, userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err))
    }
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new WhArticleNotFoundError()
  }

  const result = await repo.softDelete(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "soft_delete", entityType: "wh_article",
      entityId: id, entityName: existing.name, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function restoreArticle(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new WhArticleNotFoundError()
  }

  const result = await repo.restore(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "restore", entityType: "wh_article",
      entityId: id, entityName: existing.name, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function hardDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new WhArticleNotFoundError()
  }

  // Check no BOM references this article as parent
  const bomRefs = await repo.findBomChildren(prisma, id)
  if (bomRefs.length > 0) {
    throw new WhArticleConflictError("Cannot delete article that is used as assembly in bill of materials")
  }

  // TODO: When BillingDocumentPosition gets articleId FK (ORD_01),
  // check that table too before allowing hard delete.

  const deleted = await repo.hardDelete(prisma, tenantId, id)

  if (audit && deleted) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "hard_delete", entityType: "wh_article",
      entityId: id, entityName: existing.name, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return deleted
}

export async function adjustStock(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  quantity: number,
  reason?: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new WhArticleNotFoundError()
  }

  if (!existing.stockTracking) {
    throw new WhArticleValidationError("Stock tracking is not enabled for this article")
  }

  // TODO: When WH_04 (Stock Movements) is implemented, also create a
  // WhStockMovement record of type ADJUSTMENT here.
  const result = await repo.updateStock(prisma, tenantId, id, quantity)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "stock_adjustment", entityType: "wh_article",
      entityId: id, entityName: existing.name,
      changes: { quantity, reason: reason || null, previousStock: existing.currentStock },
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function searchArticles(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  limit: number = 10
) {
  return repo.search(prisma, tenantId, query, limit)
}

// --- Supplier Functions ---

export async function listSuppliers(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  // Verify article belongs to tenant
  const article = await repo.findById(prisma, tenantId, articleId)
  if (!article) {
    throw new WhArticleNotFoundError()
  }
  return repo.findSuppliersByArticle(prisma, tenantId, articleId)
}

export async function addSupplier(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    articleId: string
    supplierId: string
    supplierArticleNumber?: string
    supplierDescription?: string
    isPrimary?: boolean
    orderUnit?: string
    leadTimeDays?: number
    defaultOrderQty?: number
    buyPrice?: number
    notes?: string
  }
) {
  // Verify article exists (tenant-scoped)
  const article = await repo.findById(prisma, tenantId, input.articleId)
  if (!article) {
    throw new WhArticleNotFoundError()
  }

  // Verify supplier CrmAddress exists and has type SUPPLIER or BOTH
  const supplier = await prisma.crmAddress.findFirst({
    where: { id: input.supplierId },
    select: { id: true, type: true },
  })
  if (!supplier) {
    throw new WhArticleValidationError("Supplier address not found")
  }
  if (supplier.type !== "SUPPLIER" && supplier.type !== "BOTH") {
    throw new WhArticleValidationError("Address must be of type SUPPLIER or BOTH")
  }

  return repo.createSupplier(prisma, {
    articleId: input.articleId,
    supplierId: input.supplierId,
    supplierArticleNumber: input.supplierArticleNumber || null,
    supplierDescription: input.supplierDescription || null,
    isPrimary: input.isPrimary ?? false,
    orderUnit: input.orderUnit || null,
    leadTimeDays: input.leadTimeDays ?? null,
    defaultOrderQty: input.defaultOrderQty ?? null,
    buyPrice: input.buyPrice ?? null,
    notes: input.notes || null,
  })
}

export async function updateSupplier(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    supplierArticleNumber?: string | null
    supplierDescription?: string | null
    isPrimary?: boolean
    orderUnit?: string | null
    leadTimeDays?: number | null
    defaultOrderQty?: number | null
    buyPrice?: number | null
    notes?: string | null
  }
) {
  const data: Record<string, unknown> = {}
  if (input.supplierArticleNumber !== undefined) data.supplierArticleNumber = input.supplierArticleNumber
  if (input.supplierDescription !== undefined) data.supplierDescription = input.supplierDescription
  if (input.isPrimary !== undefined) data.isPrimary = input.isPrimary
  if (input.orderUnit !== undefined) data.orderUnit = input.orderUnit
  if (input.leadTimeDays !== undefined) data.leadTimeDays = input.leadTimeDays
  if (input.defaultOrderQty !== undefined) data.defaultOrderQty = input.defaultOrderQty
  if (input.buyPrice !== undefined) data.buyPrice = input.buyPrice
  if (input.notes !== undefined) data.notes = input.notes

  const result = await repo.updateSupplier(prisma, tenantId, id, data)
  if (!result) {
    throw new WhArticleNotFoundError("Supplier link not found")
  }
  return result
}

export async function removeSupplier(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const deleted = await repo.deleteSupplier(prisma, tenantId, id)
  if (!deleted) {
    throw new WhArticleNotFoundError("Supplier link not found")
  }
  return deleted
}

// --- BOM Functions ---

export async function listBom(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  // Verify article belongs to tenant
  const article = await repo.findById(prisma, tenantId, articleId)
  if (!article) {
    throw new WhArticleNotFoundError()
  }
  return repo.findBomByParent(prisma, tenantId, articleId)
}

export async function addBom(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    parentArticleId: string
    childArticleId: string
    quantity?: number
    sortOrder?: number
    notes?: string
  }
) {
  // Verify both articles exist (tenant-scoped)
  const parent = await repo.findById(prisma, tenantId, input.parentArticleId)
  if (!parent) {
    throw new WhArticleNotFoundError("Parent article not found")
  }

  const child = await repo.findById(prisma, tenantId, input.childArticleId)
  if (!child) {
    throw new WhArticleNotFoundError("Child article not found")
  }

  // Self-reference check
  if (input.parentArticleId === input.childArticleId) {
    throw new WhArticleValidationError("An article cannot be a component of itself")
  }

  // Transitive circular reference check
  const isCircular = await checkBomCircular(prisma, input.parentArticleId, input.childArticleId)
  if (isCircular) {
    throw new WhArticleValidationError("Circular reference detected in bill of materials")
  }

  return repo.createBom(prisma, {
    parentArticleId: input.parentArticleId,
    childArticleId: input.childArticleId,
    quantity: input.quantity ?? 1,
    sortOrder: input.sortOrder ?? 0,
    notes: input.notes || null,
  })
}

export async function updateBom(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    quantity?: number
    sortOrder?: number
    notes?: string | null
  }
) {
  const data: Record<string, unknown> = {}
  if (input.quantity !== undefined) data.quantity = input.quantity
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  if (input.notes !== undefined) data.notes = input.notes

  const result = await repo.updateBom(prisma, tenantId, id, data)
  if (!result) {
    throw new WhArticleNotFoundError("BOM entry not found")
  }
  return result
}

export async function removeBom(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const deleted = await repo.deleteBom(prisma, tenantId, id)
  if (!deleted) {
    throw new WhArticleNotFoundError("BOM entry not found")
  }
  return deleted
}
