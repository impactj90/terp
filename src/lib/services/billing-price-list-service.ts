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
    isDefault?: boolean
    validFrom?: Date
    validTo?: Date
  },
  createdById: string,
  audit?: AuditContext
) {
  // If setting as default, unset other defaults first
  if (input.isDefault) {
    await repo.unsetDefault(prisma, tenantId)
  }

  const created = await repo.create(prisma, {
    tenantId,
    name: input.name,
    description: input.description || null,
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

  // If setting as default, unset others first
  if (input.isDefault === true && !existing.isDefault) {
    await repo.unsetDefault(prisma, tenantId)
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

  await repo.unsetDefault(prisma, tenantId)
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
  addressId: string
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
  // 1. Get customer's assigned price list
  const address = await prisma.crmAddress.findFirst({
    where: { id: addressId, tenantId },
    select: { priceListId: true },
  })
  if (!address) return null

  let priceListId = address.priceListId

  // 2. Fallback to default price list
  if (!priceListId) {
    const defaultList = await repo.findDefault(prisma, tenantId)
    if (!defaultList) return null
    priceListId = defaultList.id
  }

  // 3. Get price list name + all active entries
  const priceList = await prisma.billingPriceList.findFirst({
    where: { id: priceListId, tenantId, isActive: true },
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
  input: { addressId: string; articleId?: string; itemKey?: string; quantity?: number }
): Promise<{ unitPrice: number; source: string; entryId: string } | null> {
  // 1. Get customer's assigned price list
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
    select: { priceListId: true },
  })
  if (!address) throw new BillingPriceListValidationError("Address not found")

  // 2. If customer has a price list, try to find matching entry
  if (address.priceListId) {
    const result = await findBestEntry(
      prisma, address.priceListId, input.articleId, input.itemKey, input.quantity
    )
    if (result) return { ...result, source: "customer_list" }
  }

  // 3. Fallback to default price list
  const defaultList = await repo.findDefault(prisma, tenantId)
  if (defaultList) {
    const result = await findBestEntry(
      prisma, defaultList.id, input.articleId, input.itemKey, input.quantity
    )
    if (result) return { ...result, source: "default_list" }
  }

  // 4. No match anywhere
  return null
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
