import type { PrismaClient, BillingServiceCaseStatus } from "@/generated/prisma/client"

// --- Includes (shared across find operations) ---

const DETAIL_INCLUDE = {
  address: true,
  contact: true,
  inquiry: { select: { id: true, number: true, title: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  order: { select: { id: true, code: true, name: true } },
  invoiceDocument: { select: { id: true, number: true, type: true, status: true } },
}

const LIST_INCLUDE = {
  address: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
}

// --- Repository Functions ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: BillingServiceCaseStatus
    addressId?: string
    assignedToId?: string
    search?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.status) where.status = params.status
  if (params.addressId) where.addressId = params.addressId
  if (params.assignedToId) where.assignedToId = params.assignedToId

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { number: { contains: term, mode: "insensitive" } },
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.billingServiceCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: LIST_INCLUDE,
    }),
    prisma.billingServiceCase.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingServiceCase.findFirst({
    where: { id, tenantId },
    include: DETAIL_INCLUDE,
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
    inquiryId?: string | null
    status?: BillingServiceCaseStatus
    reportedAt?: Date
    customerNotifiedCost?: boolean
    assignedToId?: string | null
    description?: string | null
    createdById?: string | null
  }
) {
  return prisma.billingServiceCase.create({
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
  await prisma.billingServiceCase.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.billingServiceCase.findFirst({
    where: { id, tenantId },
    include: DETAIL_INCLUDE,
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingServiceCase.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
