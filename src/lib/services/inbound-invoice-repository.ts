import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

const DEFAULT_INCLUDE = {
  supplier: { select: { id: true, number: true, company: true, vatId: true } },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  approvals: { orderBy: { stepOrder: "asc" as const } },
  createdByUser: { select: { id: true, displayName: true, email: true } },
  submitter: { select: { id: true, displayName: true, email: true } },
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  data: Record<string, unknown>
) {
  return prisma.inboundInvoice.create({
    data: { tenantId, ...data } as Parameters<typeof prisma.inboundInvoice.create>[0]["data"],
    include: DEFAULT_INCLUDE,
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.inboundInvoice.findFirst({
    where: { id, tenantId },
    include: DEFAULT_INCLUDE,
  })
}

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  filters?: {
    status?: string
    supplierId?: string
    supplierStatus?: string
    search?: string
    dateFrom?: string
    dateTo?: string
  },
  pagination?: { page?: number; pageSize?: number }
) {
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? 25
  const skip = (page - 1) * pageSize

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { tenantId }

  if (filters?.status) where.status = filters.status
  if (filters?.supplierId) where.supplierId = filters.supplierId
  if (filters?.supplierStatus) where.supplierStatus = filters.supplierStatus

  if (filters?.search) {
    where.OR = [
      { invoiceNumber: { contains: filters.search, mode: "insensitive" } },
      { sellerName: { contains: filters.search, mode: "insensitive" } },
      { number: { contains: filters.search, mode: "insensitive" } },
    ]
  }

  if (filters?.dateFrom || filters?.dateTo) {
    where.invoiceDate = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    }
  }

  const [items, total] = await Promise.all([
    prisma.inboundInvoice.findMany({
      where,
      include: {
        supplier: { select: { id: true, number: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.inboundInvoice.count({ where }),
  ])

  return { items, total }
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(
    prisma.inboundInvoice,
    { id, tenantId },
    data,
    { entity: "InboundInvoice", include: DEFAULT_INCLUDE }
  )
}

export async function updateStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: string
) {
  const { count } = await prisma.inboundInvoice.updateMany({
    where: { id, tenantId },
    data: { status },
  })
  if (count === 0) throw new Error("InboundInvoice not found")
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.inboundInvoice.deleteMany({
    where: { id, tenantId },
  })
  if (count === 0) throw new Error("InboundInvoice not found")
}

export async function checkDuplicateSupplier(
  prisma: PrismaClient,
  tenantId: string,
  supplierId: string,
  invoiceNumber: string
) {
  const existing = await prisma.inboundInvoice.findFirst({
    where: { tenantId, supplierId, invoiceNumber },
    select: { id: true },
  })
  return !!existing
}

export async function checkDuplicateMessageId(
  prisma: PrismaClient,
  tenantId: string,
  messageId: string
) {
  const existing = await prisma.inboundInvoice.findFirst({
    where: { tenantId, sourceMessageId: messageId },
    select: { id: true },
  })
  return !!existing
}
