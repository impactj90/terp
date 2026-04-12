import type { PrismaClient } from "@/generated/prisma/client"

// --- Includes (shared across find operations) ---

const DETAIL_INCLUDE = {
  entries: true,
  salesAddresses: { select: { id: true, number: true, company: true } },
  purchaseAddresses: { select: { id: true, number: true, company: true } },
}

const LIST_INCLUDE = {
  _count: { select: { entries: true, salesAddresses: true, purchaseAddresses: true } },
}

// --- Repository Functions ---

export async function findMany(
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
  const where: Record<string, unknown> = { tenantId }

  if (params.type) where.type = params.type

  if (params.isActive !== undefined) where.isActive = params.isActive

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.billingPriceList.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: LIST_INCLUDE,
    }),
    prisma.billingPriceList.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingPriceList.findFirst({
    where: { id, tenantId },
    include: DETAIL_INCLUDE,
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    description?: string | null
    type?: string
    isDefault?: boolean
    validFrom?: Date | null
    validTo?: Date | null
    createdById?: string | null
  }
) {
  return prisma.billingPriceList.create({
    data,
    include: DETAIL_INCLUDE,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingPriceList.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.billingPriceList.findFirst({
    where: { id, tenantId },
    include: DETAIL_INCLUDE,
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingPriceList.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function findDefault(
  prisma: PrismaClient,
  tenantId: string,
  type: "sales" | "purchase" = "sales"
) {
  return prisma.billingPriceList.findFirst({
    where: { tenantId, type, isDefault: true, isActive: true },
  })
}

export async function unsetDefault(
  prisma: PrismaClient,
  tenantId: string,
  type: "sales" | "purchase" = "sales"
) {
  await prisma.billingPriceList.updateMany({
    where: { tenantId, type, isDefault: true },
    data: { isDefault: false },
  })
}

export async function countAddressesUsing(
  prisma: PrismaClient,
  tenantId: string,
  priceListId: string
) {
  const [salesCount, purchaseCount] = await Promise.all([
    prisma.crmAddress.count({
      where: { tenantId, salesPriceListId: priceListId },
    }),
    prisma.crmAddress.count({
      where: { tenantId, purchasePriceListId: priceListId },
    }),
  ])
  return salesCount + purchaseCount
}

// --- Entry Functions ---

export async function findEntries(
  prisma: PrismaClient,
  priceListId: string,
  params: { search?: string }
) {
  const where: Record<string, unknown> = { priceListId }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { description: { contains: term, mode: "insensitive" } },
        { itemKey: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  return prisma.billingPriceListEntry.findMany({
    where,
    orderBy: [{ articleId: "asc" }, { minQuantity: "asc" }],
  })
}

export async function createEntry(
  prisma: PrismaClient,
  data: {
    priceListId: string
    articleId?: string | null
    itemKey?: string | null
    description?: string | null
    unitPrice: number
    minQuantity?: number | null
    unit?: string | null
    validFrom?: Date | null
    validTo?: Date | null
  }
) {
  return prisma.billingPriceListEntry.create({ data })
}

export async function updateEntry(
  prisma: PrismaClient,
  priceListId: string,
  entryId: string,
  data: Record<string, unknown>
) {
  await prisma.billingPriceListEntry.updateMany({
    where: { id: entryId, priceListId },
    data,
  })
  return prisma.billingPriceListEntry.findFirst({
    where: { id: entryId, priceListId },
  })
}

export async function removeEntry(
  prisma: PrismaClient,
  priceListId: string,
  entryId: string
): Promise<boolean> {
  const { count } = await prisma.billingPriceListEntry.deleteMany({
    where: { id: entryId, priceListId },
  })
  return count > 0
}

export async function upsertEntries(
  prisma: PrismaClient,
  priceListId: string,
  entries: Array<{
    articleId?: string
    itemKey?: string
    description?: string
    unitPrice: number
    minQuantity?: number
    unit?: string
  }>
) {
  let created = 0
  let updated = 0

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      // Find existing entry by articleId or itemKey
      const existing = await tx.billingPriceListEntry.findFirst({
        where: {
          priceListId,
          ...(entry.articleId
            ? { articleId: entry.articleId }
            : entry.itemKey
              ? { itemKey: entry.itemKey }
              : {}),
        },
      })

      if (existing) {
        await tx.billingPriceListEntry.updateMany({
          where: { id: existing.id, priceListId },
          data: {
            unitPrice: entry.unitPrice,
            ...(entry.description !== undefined ? { description: entry.description } : {}),
            ...(entry.minQuantity !== undefined ? { minQuantity: entry.minQuantity } : {}),
            ...(entry.unit !== undefined ? { unit: entry.unit } : {}),
          },
        })
        updated++
      } else {
        await tx.billingPriceListEntry.create({
          data: {
            priceListId,
            articleId: entry.articleId || null,
            itemKey: entry.itemKey || null,
            description: entry.description || null,
            unitPrice: entry.unitPrice,
            minQuantity: entry.minQuantity || null,
            unit: entry.unit || null,
          },
        })
        created++
      }
    }
  })

  return { created, updated }
}

export async function lookupEntries(
  prisma: PrismaClient,
  priceListId: string,
  articleId?: string,
  itemKey?: string
) {
  const now = new Date()
  const where: Record<string, unknown> = { priceListId }

  if (articleId) {
    where.articleId = articleId
  } else if (itemKey) {
    where.itemKey = itemKey
  } else {
    return []
  }

  // Validity date filter: validFrom <= now OR null, validTo >= now OR null
  where.AND = [
    { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
    { OR: [{ validTo: null }, { validTo: { gte: now } }] },
  ]

  return prisma.billingPriceListEntry.findMany({
    where,
    orderBy: { minQuantity: "desc" },
  })
}

/**
 * Find all valid entries for a price list, with article data resolved via LEFT JOIN.
 * COALESCE fills in itemKey/description/unit from WhArticle when the entry fields are null.
 */
export async function findEntriesWithArticles(
  prisma: PrismaClient,
  tenantId: string,
  priceListId: string,
) {
  const now = new Date()
  return prisma.$queryRaw<Array<{
    id: string
    articleId: string | null
    itemKey: string | null
    description: string | null
    unitPrice: number
    unit: string | null
    minQuantity: number | null
  }>>`
    SELECT
      e.id,
      e.article_id AS "articleId",
      COALESCE(e.item_key, a."number") AS "itemKey",
      COALESCE(e.description, a.name) AS "description",
      e.unit_price AS "unitPrice",
      COALESCE(e.unit, a.unit) AS "unit",
      e.min_quantity AS "minQuantity"
    FROM billing_price_list_entries e
    LEFT JOIN wh_articles a ON a.id = e.article_id AND a.tenant_id = ${tenantId}
    WHERE e.price_list_id = ${priceListId}::uuid
      AND (e.valid_from IS NULL OR e.valid_from <= ${now})
      AND (e.valid_to IS NULL OR e.valid_to >= ${now})
    ORDER BY COALESCE(e.item_key, a."number") ASC NULLS LAST,
             COALESCE(e.description, a.name) ASC NULLS LAST
  `
}
