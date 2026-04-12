import type { PrismaClient, CrmInquiryStatus } from "@/generated/prisma/client"

// --- Inquiry Repository ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    search?: string
    status?: CrmInquiryStatus
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.addressId) {
    where.addressId = params.addressId
  }

  if (params.status) {
    where.status = params.status
  }

  // Full-text search in title and number
  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { number: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.crmInquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        address: true,
        contact: true,
        order: true,
      },
    }),
    prisma.crmInquiry.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmInquiry.findFirst({
    where: { id, tenantId },
    include: {
      address: true,
      contact: true,
      order: true,
      correspondences: {
        include: { contact: true },
        orderBy: { date: "desc" },
        take: 10,
      },
    },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    number: string
    title: string
    addressId: string
    contactId?: string | null
    effort?: string | null
    notes?: string | null
    createdById?: string | null
  }
) {
  return prisma.crmInquiry.create({
    data,
    include: {
      address: true,
      contact: true,
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  // Use updateMany for tenant scoping, then fetch updated record
  await prisma.crmInquiry.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.crmInquiry.findFirst({
    where: { id, tenantId },
    include: {
      address: true,
      contact: true,
      order: true,
    },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.crmInquiry.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countLinkedRecords(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const correspondences = await prisma.crmCorrespondence.count({
    where: { inquiryId: id, tenantId },
  })
  return { correspondences }
}
