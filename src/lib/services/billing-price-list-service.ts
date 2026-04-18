import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./billing-price-list-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class BillingPriceListNotFoundError extends Error {
  constructor(message = "Price list not found") {
    super(message)
    this.name = "BillingPriceListNotFoundError"
  }
}

export class BillingPriceListValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingPriceListValidationError"
  }
}

export class BillingPriceListConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingPriceListConflictError"
  }
}

const PRICE_LIST_TRACKED_FIELDS = [
  "name", "description", "isDefault", "isActive", "validFrom", "validTo",
]

const PRICE_LIST_ENTRY_TRACKED_FIELDS = [
  "description", "unitPrice", "minQuantity", "unit", "validFrom", "validTo",
]

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    type?: "sales" | "purchase"
    isActive?: boolean
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
  const pl = await repo.findById(prisma, tenantId, id)
  if (!pl) throw new BillingPriceListNotFoundError()
  return pl
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    description?: string
    type?: "sales" | "purchase"
    isDefault?: boolean
    validFrom?: Date
    validTo?: Date
  },
  createdById: string,
  audit?: AuditContext
) {
  const type = input.type ?? "sales"

  // If setting as default, unset other defaults of the same type first
  if (input.isDefault) {
    await repo.unsetDefault(prisma, tenantId, type)
  }

  const created = await repo.create(prisma, {
    tenantId,
    name: input.name,
    description: input.description || null,
    type,
    isDefault: input.isDefault ?? false,
    validFrom: input.validFrom || null,
    validTo: input.validTo || null,
    createdById,
  })

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "billing_price_list",
      entityId: created.id, entityName: null, changes: null,
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
    isDefault?: boolean
    validFrom?: Date | null
    validTo?: Date | null
    isActive?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new BillingPriceListNotFoundError()

  const data: Record<string, unknown> = {}
  const fields = [
    "name", "description", "isDefault", "validFrom", "validTo", "isActive",
  ] as const

  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) return existing

  // If setting as default, unset others of same type first
  if (input.isDefault === true && !existing.isDefault) {
    await repo.unsetDefault(prisma, tenantId, existing.type as "sales" | "purchase")
  }

  const updated = await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, PRICE_LIST_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_price_list",
      entityId: input.id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
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
  if (!existing) throw new BillingPriceListNotFoundError()

  // Check if assigned to customers
  const addressCount = await repo.countAddressesUsing(prisma, tenantId, id)
  if (addressCount > 0) {
    throw new BillingPriceListConflictError(
      `Cannot delete price list assigned to ${addressCount} customer(s)`
    )
  }

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) throw new BillingPriceListNotFoundError()

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "billing_price_list",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

export async function setDefault(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingPriceListNotFoundError()

  await repo.unsetDefault(prisma, tenantId, existing.type as "sales" | "purchase")
  const updated = await repo.update(prisma, tenantId, id, { isDefault: true })

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, PRICE_LIST_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_price_list",
      entityId: id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function listEntries(
  prisma: PrismaClient,
  tenantId: string,
  priceListId: string,
  params: { search?: string }
) {
  // Verify price list exists and belongs to tenant
  const pl = await repo.findById(prisma, tenantId, priceListId)
  if (!pl) throw new BillingPriceListNotFoundError()

  const entries = await repo.findEntries(prisma, priceListId, params)

  // Enrich entries that reference a warehouse article with name/number
  const articleIds = [...new Set(
    entries.map((e) => e.articleId).filter((id): id is string => !!id)
  )]

  const articleMap = new Map<string, { id: string; number: string; name: string }>()
  if (articleIds.length > 0) {
    const articles = await prisma.whArticle.findMany({
      where: { id: { in: articleIds } },
      select: { id: true, number: true, name: true },
    })
    for (const a of articles) articleMap.set(a.id, a)
  }

  return entries.map((e) => ({
    ...e,
    article: e.articleId ? articleMap.get(e.articleId) ?? null : null,
  }))
}

export async function createEntry(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    priceListId: string
    articleId?: string
    itemKey?: string
    description?: string
    unitPrice: number
    minQuantity?: number
    unit?: string
    validFrom?: Date
    validTo?: Date
  },
  audit?: AuditContext
) {
  // Verify price list exists and belongs to tenant
  const pl = await repo.findById(prisma, tenantId, input.priceListId)
  if (!pl) throw new BillingPriceListNotFoundError()

  const created = await repo.createEntry(prisma, {
    priceListId: input.priceListId,
    articleId: input.articleId || null,
    itemKey: input.itemKey || null,
    description: input.description || null,
    unitPrice: input.unitPrice,
    minQuantity: input.minQuantity || null,
    unit: input.unit || null,
    validFrom: input.validFrom || null,
    validTo: input.validTo || null,
  })

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "billing_price_list_entry",
      entityId: created.id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function updateEntry(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    priceListId: string
    description?: string | null
    unitPrice?: number
    minQuantity?: number | null
    unit?: string | null
    validFrom?: Date | null
    validTo?: Date | null
  },
  audit?: AuditContext
) {
  // Verify price list exists and belongs to tenant
  const pl = await repo.findById(prisma, tenantId, input.priceListId)
  if (!pl) throw new BillingPriceListNotFoundError()

  const data: Record<string, unknown> = {}
  const fields = [
    "description", "unitPrice", "minQuantity", "unit", "validFrom", "validTo",
  ] as const

  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) {
    return repo.updateEntry(prisma, input.priceListId, input.id, {})
  }

  // Fetch existing entry for change tracking
  const existing = await prisma.billingPriceListEntry.findFirst({
    where: { id: input.id, priceListId: input.priceListId },
  })

  const updated = await repo.updateEntry(prisma, input.priceListId, input.id, data)

  if (audit && existing) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, PRICE_LIST_ENTRY_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_price_list_entry",
      entityId: input.id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function removeEntry(
  prisma: PrismaClient,
  tenantId: string,
  priceListId: string,
  entryId: string,
  audit?: AuditContext
) {
  // Verify price list exists and belongs to tenant
  const pl = await repo.findById(prisma, tenantId, priceListId)
  if (!pl) throw new BillingPriceListNotFoundError()

  const deleted = await repo.removeEntry(prisma, priceListId, entryId)
  if (!deleted) throw new BillingPriceListNotFoundError("Price list entry not found")

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "billing_price_list_entry",
      entityId: entryId, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

export async function bulkImport(
  prisma: PrismaClient,
  tenantId: string,
  priceListId: string,
  entries: Array<{
    articleId?: string
    itemKey?: string
    description?: string
    unitPrice: number
    minQuantity?: number
    unit?: string
  }>,
  audit?: AuditContext
) {
  // Verify price list exists and belongs to tenant
  const pl = await repo.findById(prisma, tenantId, priceListId)
  if (!pl) throw new BillingPriceListNotFoundError()

  const result = await repo.upsertEntries(prisma, priceListId, entries)

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_price_list",
      entityId: priceListId, entityName: null, changes: { action: "bulk_import", entryCount: entries.length },
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

// --- Entries for Address (autocomplete) ---

export async function entriesForAddress(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string,
  type: "sales" | "purchase" = "sales"
): Promise<{
  priceListId: string
  priceListName: string
  entries: Array<{
    id: string
    articleId: string | null
    itemKey: string | null
    description: string | null
    unitPrice: number
    unit: string | null
    minQuantity: number | null
  }>
} | null> {
  // 1. Get address's assigned price list for the given type
  const address = await prisma.crmAddress.findFirst({
    where: { id: addressId, tenantId },
    select: { salesPriceListId: true, purchasePriceListId: true },
  })
  if (!address) return null

  let priceListId = type === "purchase"
    ? address.purchasePriceListId
    : address.salesPriceListId

  // 2. Fallback to default price list of same type
  if (!priceListId) {
    const defaultList = await repo.findDefault(prisma, tenantId, type)
    if (!defaultList) return null
    priceListId = defaultList.id
  }

  // 3. Get price list name + all active entries
  const priceList = await prisma.billingPriceList.findFirst({
    where: { id: priceListId, tenantId, type, isActive: true },
    select: { id: true, name: true },
  })
  if (!priceList) return null

  const entries = await repo.findEntriesWithArticles(prisma, tenantId, priceListId)

  return {
    priceListId: priceList.id,
    priceListName: priceList.name,
    entries,
  }
}

// --- Price Lookup ---

export async function lookupPrice(
  prisma: PrismaClient,
  tenantId: string,
  input: { addressId: string; articleId?: string; itemKey?: string; quantity?: number; type?: "sales" | "purchase" }
): Promise<{ unitPrice: number; source: string; entryId: string } | null> {
  const type = input.type ?? "sales"

  // 1. Get address's assigned price list
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
    select: { salesPriceListId: true, purchasePriceListId: true },
  })
  if (!address) throw new BillingPriceListValidationError("Address not found")

  const assignedListId = type === "purchase"
    ? address.purchasePriceListId
    : address.salesPriceListId

  // 2. If address has a price list of matching type, try to find matching entry
  if (assignedListId) {
    const result = await findBestEntry(
      prisma, assignedListId, input.articleId, input.itemKey, input.quantity
    )
    if (result) return { ...result, source: type === "purchase" ? "supplier_list" : "customer_list" }
  }

  // 3. Fallback to default price list of same type
  const defaultList = await repo.findDefault(prisma, tenantId, type)
  if (defaultList) {
    const result = await findBestEntry(
      prisma, defaultList.id, input.articleId, input.itemKey, input.quantity
    )
    if (result) return { ...result, source: "default_list" }
  }

  // 4. For purchase lookups, fallback to WhArticleSupplier.buyPrice
  if (type === "purchase" && input.articleId) {
    const supplierPrice = await prisma.whArticleSupplier.findFirst({
      where: { articleId: input.articleId, supplierId: input.addressId },
      select: { buyPrice: true },
    })
    if (supplierPrice?.buyPrice != null) {
      return { unitPrice: supplierPrice.buyPrice, source: "supplier_article", entryId: "" }
    }
  }

  // 5. No match anywhere
  return null
}

// --- Copy Price List ---

/**
 * Copy all entries (article-bound and itemKey-only) from one price list to another.
 * Match-key for duplicate detection: articleId + itemKey + minQuantity.
 * When overwrite=true, all existing entries in the target list are deleted first.
 */
export async function copyPriceList(
  prisma: PrismaClient,
  tenantId: string,
  input: { sourceId: string; targetId: string; overwrite?: boolean },
  audit?: AuditContext
) {
  const source = await repo.findById(prisma, tenantId, input.sourceId)
  if (!source) throw new BillingPriceListNotFoundError("Source price list not found")
  const target = await repo.findById(prisma, tenantId, input.targetId)
  if (!target) throw new BillingPriceListNotFoundError("Target price list not found")
  if (source.id === target.id) {
    throw new BillingPriceListValidationError("Source and target must differ")
  }

  const sourceEntries = await prisma.billingPriceListEntry.findMany({
    where: { priceListId: input.sourceId },
  })

  let copied = 0
  let skipped = 0

  await prisma.$transaction(async (tx) => {
    if (input.overwrite) {
      await tx.billingPriceListEntry.deleteMany({
        where: { priceListId: input.targetId },
      })
    }

    for (const entry of sourceEntries) {
      if (!input.overwrite) {
        const existing = await tx.billingPriceListEntry.findFirst({
          where: {
            priceListId: input.targetId,
            articleId: entry.articleId,
            itemKey: entry.itemKey,
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
          itemKey: entry.itemKey,
          description: entry.description,
          unitPrice: entry.unitPrice,
          minQuantity: entry.minQuantity,
          unit: entry.unit,
          validFrom: entry.validFrom,
          validTo: entry.validTo,
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
      entityType: "billing_price_list",
      entityId: input.targetId,
      entityName: target.name,
      changes: {
        sourceId: input.sourceId,
        sourceName: source.name,
        copied,
        skipped,
        overwrite: !!input.overwrite,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { copied, skipped }
}

// --- Bulk Price Adjustment ---

/**
 * Bulk adjust all prices in a price list by a percentage.
 * Adjusts both article-bound and itemKey-only entries — the scope is the
 * entire price list. Users who need partial scope should split the list.
 */
export async function adjustPrices(
  prisma: PrismaClient,
  tenantId: string,
  input: { priceListId: string; adjustmentPercent: number },
  audit?: AuditContext
) {
  const pl = await repo.findById(prisma, tenantId, input.priceListId)
  if (!pl) throw new BillingPriceListNotFoundError()

  const entries = await prisma.billingPriceListEntry.findMany({
    where: { priceListId: input.priceListId },
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
      entityType: "billing_price_list",
      entityId: input.priceListId,
      entityName: pl.name,
      changes: {
        adjustmentPercent: input.adjustmentPercent,
        adjustedCount,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { adjustedCount }
}

// Helper: Find best matching entry in a price list
async function findBestEntry(
  prisma: PrismaClient,
  priceListId: string,
  articleId?: string,
  itemKey?: string,
  quantity?: number
): Promise<{ unitPrice: number; entryId: string } | null> {
  const entries = await repo.lookupEntries(prisma, priceListId, articleId, itemKey)
  if (entries.length === 0) return null

  // If quantity provided, find best volume price (highest minQuantity that is <= quantity)
  if (quantity != null) {
    const volumeEntries = entries
      .filter(e => e.minQuantity == null || e.minQuantity <= quantity)
      .sort((a, b) => (b.minQuantity ?? 0) - (a.minQuantity ?? 0))
    const best = volumeEntries[0]
    if (best) {
      return { unitPrice: best.unitPrice, entryId: best.id }
    }
  }

  // No volume pricing or no quantity, return entry with no minQuantity (or first)
  const baseEntry = entries.find(e => e.minQuantity == null) ?? entries[0]
  if (!baseEntry) return null
  return { unitPrice: baseEntry.unitPrice, entryId: baseEntry.id }
}
