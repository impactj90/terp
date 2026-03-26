/**
 * Warehouse Article Price Service
 *
 * Business logic for managing article prices across billing price lists.
 * Cross-queries existing BillingPriceList, BillingPriceListEntry, and WhArticle models.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class WhArticlePriceNotFoundError extends Error {
  constructor(message = "Price entry not found") {
    super(message)
    this.name = "WhArticlePriceNotFoundError"
  }
}

export class WhArticlePriceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhArticlePriceValidationError"
  }
}

// --- Helper: Verify price list ownership ---

async function verifyPriceList(prisma: PrismaClient, tenantId: string, priceListId: string) {
  const pl = await prisma.billingPriceList.findFirst({
    where: { id: priceListId, tenantId },
  })
  if (!pl) {
    throw new WhArticlePriceNotFoundError("Price list not found")
  }
  return pl
}

// --- Helper: Verify article ownership ---

async function verifyArticle(prisma: PrismaClient, tenantId: string, articleId: string) {
  const article = await prisma.whArticle.findFirst({
    where: { id: articleId, tenantId },
  })
  if (!article) {
    throw new WhArticlePriceNotFoundError("Article not found")
  }
  return article
}

// --- Service Functions ---

/**
 * List all tenant price lists (for warehouse price management UI).
 */
export async function listPriceLists(
  prisma: PrismaClient,
  tenantId: string,
  params: { isActive?: boolean; search?: string } = {}
) {
  const where: Record<string, unknown> = { tenantId, type: "purchase" }
  if (params.isActive !== undefined) {
    where.isActive = params.isActive
  }
  if (params.search) {
    where.name = { contains: params.search, mode: "insensitive" }
  }

  return prisma.billingPriceList.findMany({
    where,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { entries: true } } },
  })
}

/**
 * Create a new price list (from warehouse UI).
 */
export async function createPriceList(
  prisma: PrismaClient,
  tenantId: string,
  input: { name: string; isDefault?: boolean },
  audit?: AuditContext
) {
  if (!input.name.trim()) {
    throw new WhArticlePriceValidationError("Name is required")
  }

  // If setting as default, unset other purchase defaults first
  if (input.isDefault) {
    await prisma.billingPriceList.updateMany({
      where: { tenantId, type: "purchase", isDefault: true },
      data: { isDefault: false },
    })
  }

  const created = await prisma.billingPriceList.create({
    data: {
      tenantId,
      name: input.name.trim(),
      type: "purchase",
      isDefault: input.isDefault ?? false,
      isActive: true,
    },
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "billing_price_list",
      entityId: created.id,
      entityName: created.name,
      changes: { name: created.name, isDefault: created.isDefault },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return created
}

/**
 * Update a price list (name, isDefault, isActive).
 */
export async function updatePriceList(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: { name?: string; isDefault?: boolean; isActive?: boolean },
  audit?: AuditContext
) {
  const existing = await verifyPriceList(prisma, tenantId, id)

  if (input.name !== undefined && !input.name.trim()) {
    throw new WhArticlePriceValidationError("Name is required")
  }

  // If setting as default, unset other purchase defaults first
  if (input.isDefault === true) {
    await prisma.billingPriceList.updateMany({
      where: { tenantId, type: "purchase", isDefault: true, id: { not: id } },
      data: { isDefault: false },
    })
  }

  const updated = await prisma.billingPriceList.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "billing_price_list",
      entityId: updated.id,
      entityName: updated.name,
      changes: input,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

/**
 * Delete a price list and all its entries.
 */
export async function deletePriceList(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await verifyPriceList(prisma, tenantId, id)

  await prisma.billingPriceList.delete({
    where: { id },
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "billing_price_list",
      entityId: id,
      entityName: existing.name,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

/**
 * List all price list entries for a specific article, across all price lists.
 */
export async function listByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  // Verify article belongs to tenant
  await verifyArticle(prisma, tenantId, articleId)

  // Find all entries for this article in purchase price lists (tenant-scoped)
  const entries = await prisma.billingPriceListEntry.findMany({
    where: {
      articleId,
      priceList: { tenantId, type: "purchase" },
    },
    include: {
      priceList: {
        select: {
          id: true,
          name: true,
          isDefault: true,
          isActive: true,
          validFrom: true,
          validTo: true,
        },
      },
    },
    orderBy: { priceList: { name: "asc" } },
  })

  return entries
}

/**
 * List all article entries in a price list with article info.
 */
export async function listByPriceList(
  prisma: PrismaClient,
  tenantId: string,
  priceListId: string,
  params: { search?: string } = {}
) {
  // Verify price list belongs to tenant
  await verifyPriceList(prisma, tenantId, priceListId)

  // Find all entries for this price list that have an articleId (non-null)
  const entries = await prisma.billingPriceListEntry.findMany({
    where: {
      priceListId,
      articleId: { not: null },
    },
    orderBy: { createdAt: "asc" },
  })

  if (entries.length === 0) return []

  // Collect unique article IDs
  const articleIds = [...new Set(entries.map((e) => e.articleId!).filter(Boolean))]

  // Build article search filter
  const articleWhere: Record<string, unknown> = {
    tenantId,
    id: { in: articleIds },
  }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      articleWhere.OR = [
        { number: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  // Fetch article data
  const articles = await prisma.whArticle.findMany({
    where: articleWhere,
    select: {
      id: true,
      number: true,
      name: true,
      unit: true,
      sellPrice: true,
      groupId: true,
    },
  })

  const articleMap = new Map(articles.map((a) => [a.id, a]))

  // Join entries with article info, filter out entries for articles not in search results
  const result = entries
    .filter((e) => articleMap.has(e.articleId!))
    .map((e) => ({
      ...e,
      article: articleMap.get(e.articleId!)!,
    }))

  return result
}

/**
 * Add or update an article price in a price list.
 */
export async function setPrice(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    priceListId: string
    articleId: string
    unitPrice: number
    minQuantity?: number | null
    unit?: string | null
  },
  audit?: AuditContext
) {
  // Verify both price list and article ownership
  await verifyPriceList(prisma, tenantId, input.priceListId)
  await verifyArticle(prisma, tenantId, input.articleId)

  const minQty = input.minQuantity ?? null

  // Try to find existing entry with same (priceListId, articleId, minQuantity)
  const existing = await prisma.billingPriceListEntry.findFirst({
    where: {
      priceListId: input.priceListId,
      articleId: input.articleId,
      minQuantity: minQty,
    },
  })

  let entry
  if (existing) {
    // Update existing entry
    entry = await prisma.billingPriceListEntry.update({
      where: { id: existing.id },
      data: {
        unitPrice: input.unitPrice,
        unit: input.unit !== undefined ? input.unit : undefined,
      },
    })
  } else {
    // Create new entry
    entry = await prisma.billingPriceListEntry.create({
      data: {
        priceListId: input.priceListId,
        articleId: input.articleId,
        unitPrice: input.unitPrice,
        minQuantity: minQty,
        unit: input.unit ?? null,
      },
    })
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: existing ? "update" : "create",
      entityType: "wh_article_price",
      entityId: entry.id,
      entityName: null,
      changes: { priceListId: input.priceListId, articleId: input.articleId, unitPrice: input.unitPrice },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return entry
}

/**
 * Remove article from price list (all entries with matching priceListId + articleId).
 */
export async function removePrice(
  prisma: PrismaClient,
  tenantId: string,
  input: { priceListId: string; articleId: string },
  audit?: AuditContext
) {
  // Verify price list belongs to tenant
  await verifyPriceList(prisma, tenantId, input.priceListId)

  const { count } = await prisma.billingPriceListEntry.deleteMany({
    where: {
      priceListId: input.priceListId,
      articleId: input.articleId,
    },
  })

  if (count === 0) {
    throw new WhArticlePriceNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "wh_article_price",
      entityId: input.articleId,
      entityName: null,
      changes: { priceListId: input.priceListId, removedCount: count },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { removed: count }
}

/**
 * Bulk add/update article prices in a price list.
 */
export async function bulkSetPrices(
  prisma: PrismaClient,
  tenantId: string,
  priceListId: string,
  entries: Array<{ articleId: string; unitPrice: number; minQuantity?: number | null }>,
  audit?: AuditContext
) {
  // Verify price list belongs to tenant
  await verifyPriceList(prisma, tenantId, priceListId)

  // Verify all article IDs belong to tenant
  const articleIds = [...new Set(entries.map((e) => e.articleId))]
  const articles = await prisma.whArticle.findMany({
    where: { tenantId, id: { in: articleIds } },
    select: { id: true },
  })
  const validArticleIds = new Set(articles.map((a) => a.id))
  const invalidIds = articleIds.filter((id) => !validArticleIds.has(id))
  if (invalidIds.length > 0) {
    throw new WhArticlePriceValidationError(`Articles not found: ${invalidIds.join(", ")}`)
  }

  let created = 0
  let updated = 0

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const minQty = entry.minQuantity ?? null
      const existing = await tx.billingPriceListEntry.findFirst({
        where: {
          priceListId,
          articleId: entry.articleId,
          minQuantity: minQty,
        },
      })

      if (existing) {
        await tx.billingPriceListEntry.update({
          where: { id: existing.id },
          data: { unitPrice: entry.unitPrice },
        })
        updated++
      } else {
        await tx.billingPriceListEntry.create({
          data: {
            priceListId,
            articleId: entry.articleId,
            unitPrice: entry.unitPrice,
            minQuantity: minQty,
          },
        })
        created++
      }
    }
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "bulk_set",
      entityType: "wh_article_price",
      entityId: priceListId,
      entityName: null,
      changes: { created, updated, totalEntries: entries.length },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { created, updated }
}

/**
 * Copy all article-based entries from one price list to another.
 */
export async function copyPriceList(
  prisma: PrismaClient,
  tenantId: string,
  input: { sourceId: string; targetId: string; overwrite?: boolean },
  audit?: AuditContext
) {
  // Verify both price lists belong to tenant
  await verifyPriceList(prisma, tenantId, input.sourceId)
  await verifyPriceList(prisma, tenantId, input.targetId)

  // Fetch all article-based entries from source
  const sourceEntries = await prisma.billingPriceListEntry.findMany({
    where: {
      priceListId: input.sourceId,
      articleId: { not: null },
    },
  })

  let copied = 0
  let skipped = 0

  await prisma.$transaction(async (tx) => {
    if (input.overwrite) {
      // Delete all article-based entries in target first
      await tx.billingPriceListEntry.deleteMany({
        where: {
          priceListId: input.targetId,
          articleId: { not: null },
        },
      })
    }

    for (const entry of sourceEntries) {
      if (!input.overwrite) {
        // Check if entry already exists in target
        const existing = await tx.billingPriceListEntry.findFirst({
          where: {
            priceListId: input.targetId,
            articleId: entry.articleId,
            minQuantity: entry.minQuantity,
          },
        })
        if (existing) {
          skipped++
          continue
        }
      }

      await tx.billingPriceListEntry.create({
        data: {
          priceListId: input.targetId,
          articleId: entry.articleId,
          unitPrice: entry.unitPrice,
          minQuantity: entry.minQuantity,
          unit: entry.unit,
          description: entry.description,
        },
      })
      copied++
    }
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "copy",
      entityType: "wh_article_price",
      entityId: input.targetId,
      entityName: null,
      changes: { sourceId: input.sourceId, copied, skipped, overwrite: !!input.overwrite },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { copied, skipped }
}

/**
 * Bulk adjust all prices in a price list by a percentage.
 * Optionally filtered to articles in a specific group.
 */
export async function adjustPrices(
  prisma: PrismaClient,
  tenantId: string,
  input: { priceListId: string; adjustmentPercent: number; articleGroupId?: string },
  audit?: AuditContext
) {
  // Verify price list belongs to tenant
  await verifyPriceList(prisma, tenantId, input.priceListId)

  // Build entry filter
  const entryWhere: Record<string, unknown> = {
    priceListId: input.priceListId,
    articleId: { not: null },
  }

  // If filtering by article group, find article IDs in that group
  if (input.articleGroupId) {
    const groupArticles = await prisma.whArticle.findMany({
      where: { tenantId, groupId: input.articleGroupId },
      select: { id: true },
    })
    const groupArticleIds = groupArticles.map((a) => a.id)
    entryWhere.articleId = { in: groupArticleIds }
  }

  // Fetch matching entries
  const entries = await prisma.billingPriceListEntry.findMany({
    where: entryWhere,
  })

  const multiplier = 1 + input.adjustmentPercent / 100
  let adjustedCount = 0

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const newPrice = Math.round(entry.unitPrice * multiplier * 100) / 100
      await tx.billingPriceListEntry.update({
        where: { id: entry.id },
        data: { unitPrice: newPrice },
      })
      adjustedCount++
    }
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "adjust_prices",
      entityType: "wh_article_price",
      entityId: input.priceListId,
      entityName: null,
      changes: {
        adjustmentPercent: input.adjustmentPercent,
        articleGroupId: input.articleGroupId || null,
        adjustedCount,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { adjustedCount }
}
