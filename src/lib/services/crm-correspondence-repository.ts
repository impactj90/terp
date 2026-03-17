import { Prisma } from "@/generated/prisma/client"
import type { PrismaClient, CrmCorrespondenceDirection } from "@/generated/prisma/client"

// --- Correspondence Repository ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    inquiryId?: string
    search?: string
    direction?: CrmCorrespondenceDirection
    type?: string
    dateFrom?: Date
    dateTo?: Date
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.addressId) {
    where.addressId = params.addressId
  }

  if (params.inquiryId) {
    where.inquiryId = params.inquiryId
  }

  if (params.direction) {
    where.direction = params.direction
  }

  if (params.type) {
    where.type = params.type
  }

  // Date range filter
  if (params.dateFrom || params.dateTo) {
    const dateFilter: Record<string, unknown> = {}
    if (params.dateFrom) {
      dateFilter.gte = params.dateFrom
    }
    if (params.dateTo) {
      dateFilter.lte = params.dateTo
    }
    where.date = dateFilter
  }

  // Full-text search in subject and content
  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { subject: { contains: term, mode: "insensitive" } },
        { content: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.crmCorrespondence.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        contact: true,
      },
    }),
    prisma.crmCorrespondence.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmCorrespondence.findFirst({
    where: { id, tenantId },
    include: {
      contact: true,
      address: true,
    },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    addressId: string
    direction: CrmCorrespondenceDirection
    type: string
    date: Date
    contactId?: string | null
    inquiryId?: string | null
    fromUser?: string | null
    toUser?: string | null
    subject: string
    content?: string | null
    attachments?: Prisma.InputJsonValue | null
    createdById?: string | null
  }
) {
  // Prisma requires Prisma.JsonNull instead of null for nullable JSON fields
  const createData = {
    ...data,
    attachments: data.attachments === null ? Prisma.JsonNull : data.attachments,
  }
  return prisma.crmCorrespondence.create({ data: createData })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  // Use updateMany for tenant scoping, then fetch updated record
  await prisma.crmCorrespondence.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.crmCorrespondence.findFirst({
    where: { id, tenantId },
    include: {
      contact: true,
      address: true,
    },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.crmCorrespondence.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
