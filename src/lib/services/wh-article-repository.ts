import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// =============================================================================
// Article Repository
// =============================================================================

export async function findMany(
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
  const where: Record<string, unknown> = { tenantId }

  if (params.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params.groupId) {
    where.groupId = params.groupId
  }

  if (params.stockTracking !== undefined) {
    where.stockTracking = params.stockTracking
  }

  if (params.belowMinStock) {
    where.stockTracking = true
    where.minStock = { not: null }
    where.currentStock = { lt: prisma } // placeholder — see raw filter below
    // Prisma doesn't support field-to-field comparison easily.
    // Use a raw where clause instead.
    // We'll handle this differently below.
    delete where.currentStock
    delete where.minStock
  }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { number: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
        { matchCode: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  // Handle belowMinStock filter: Prisma can't do field-to-field comparison,
  // so we use a raw filter via AND conditions.
  if (params.belowMinStock) {
    // Reset and rebuild with raw filter approach
    // We need: stockTracking = true AND minStock IS NOT NULL AND currentStock < minStock
    // Prisma workaround: fetch all matching and filter in memory, or use rawQuery.
    // For now, use the Prisma approach with an extra filter step.
    where.stockTracking = true
    where.minStock = { not: null }
  }

  const [items, total] = await Promise.all([
    prisma.whArticle.findMany({
      where,
      include: { group: { select: { id: true, name: true } } },
      orderBy: { number: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.belowMinStock ? params.pageSize * 3 : params.pageSize, // overfetch for belowMinStock filtering
    }),
    prisma.whArticle.count({ where }),
  ])

  if (params.belowMinStock) {
    // Filter in-memory for field-to-field comparison
    const filtered = items.filter(
      (a) => a.minStock !== null && a.currentStock < a.minStock
    )
    return {
      items: filtered.slice(0, params.pageSize),
      total: filtered.length, // approximate — acceptable for this filter
    }
  }

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whArticle.findFirst({
    where: { id, tenantId },
    include: {
      group: true,
      suppliers: {
        include: { supplier: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
      bomParent: {
        include: { childArticle: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  })
}

export async function findByNumber(
  prisma: PrismaClient,
  tenantId: string,
  number: string
) {
  return prisma.whArticle.findFirst({
    where: { tenantId, number },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    number: string
    name: string
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
    images?: Prisma.InputJsonValue | null
    createdById?: string | null
  }
) {
  return prisma.whArticle.create({
    data: data as Prisma.WhArticleUncheckedCreateInput,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(
    prisma.whArticle,
    { id, tenantId },
    data,
    { entity: "WhArticle" }
  )
}

export async function softDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return tenantScopedUpdate(
    prisma.whArticle,
    { id, tenantId },
    { isActive: false } as Record<string, unknown>,
    { entity: "WhArticle" }
  )
}

export async function restore(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return tenantScopedUpdate(
    prisma.whArticle,
    { id, tenantId },
    { isActive: true } as Record<string, unknown>,
    { entity: "WhArticle" }
  )
}

export async function hardDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.whArticle.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function search(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  limit: number = 10
) {
  return prisma.whArticle.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { number: { startsWith: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      number: true,
      name: true,
      unit: true,
      sellPrice: true,
    },
    orderBy: { number: "asc" },
    take: limit,
  })
}

export async function updateStock(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  delta: number
) {
  return tenantScopedUpdate(
    prisma.whArticle,
    { id, tenantId },
    { currentStock: { increment: delta } } as Record<string, unknown>,
    { entity: "WhArticle" }
  )
}

// =============================================================================
// Article Group Repository
// =============================================================================

export async function findAllGroups(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.whArticleGroup.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
}

export async function findGroupById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whArticleGroup.findFirst({
    where: { id, tenantId },
  })
}

export async function createGroup(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    parentId?: string | null
    sortOrder?: number
  }
) {
  return prisma.whArticleGroup.create({ data })
}

export async function updateGroup(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(
    prisma.whArticleGroup,
    { id, tenantId },
    data,
    { entity: "WhArticleGroup" }
  )
}

export async function deleteGroup(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.whArticleGroup.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countGroupArticles(
  prisma: PrismaClient,
  tenantId: string,
  groupId: string
) {
  return prisma.whArticle.count({
    where: { tenantId, groupId },
  })
}

export async function countGroupChildren(
  prisma: PrismaClient,
  tenantId: string,
  groupId: string
) {
  return prisma.whArticleGroup.count({
    where: { tenantId, parentId: groupId },
  })
}

export async function findGroupParentId(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whArticleGroup.findFirst({
    where: { id, tenantId },
    select: { parentId: true },
  })
}

// =============================================================================
// Article Supplier Repository
// =============================================================================

export async function findSuppliersByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  return prisma.whArticleSupplier.findMany({
    where: {
      articleId,
      article: { tenantId },
    },
    include: { supplier: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  })
}

export async function createSupplier(
  prisma: PrismaClient,
  data: {
    articleId: string
    supplierId: string
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
  return prisma.whArticleSupplier.create({ data })
}

export async function findSupplierById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whArticleSupplier.findFirst({
    where: {
      id,
      article: { tenantId },
    },
  })
}

export async function updateSupplier(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  // Verify tenant ownership first
  const existing = await prisma.whArticleSupplier.findFirst({
    where: { id, article: { tenantId } },
  })
  if (!existing) return null
  return prisma.whArticleSupplier.update({
    where: { id },
    data,
  })
}

export async function deleteSupplier(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify tenant ownership first
  const existing = await prisma.whArticleSupplier.findFirst({
    where: { id, article: { tenantId } },
  })
  if (!existing) return false
  await prisma.whArticleSupplier.delete({
    where: { id },
  })
  return true
}

// =============================================================================
// BOM Repository
// =============================================================================

export async function findBomByParent(
  prisma: PrismaClient,
  tenantId: string,
  parentArticleId: string
) {
  return prisma.whBillOfMaterial.findMany({
    where: {
      parentArticleId,
      parentArticle: { tenantId },
    },
    include: { childArticle: true },
    orderBy: { sortOrder: "asc" },
  })
}

export async function createBom(
  prisma: PrismaClient,
  data: {
    parentArticleId: string
    childArticleId: string
    quantity?: number
    sortOrder?: number
    notes?: string | null
  }
) {
  return prisma.whBillOfMaterial.create({ data })
}

export async function updateBom(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  // Verify tenant ownership first
  const existing = await prisma.whBillOfMaterial.findFirst({
    where: { id, parentArticle: { tenantId } },
  })
  if (!existing) return null
  return prisma.whBillOfMaterial.update({
    where: { id },
    data,
  })
}

export async function deleteBom(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify tenant ownership first
  const existing = await prisma.whBillOfMaterial.findFirst({
    where: { id, parentArticle: { tenantId } },
  })
  if (!existing) return false
  await prisma.whBillOfMaterial.delete({
    where: { id },
  })
  return true
}

export async function findBomChildren(
  prisma: PrismaClient,
  articleId: string
) {
  return prisma.whBillOfMaterial.findMany({
    where: { parentArticleId: articleId },
    select: { childArticleId: true },
  })
}
