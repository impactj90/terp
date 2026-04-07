import type { PrismaClient } from "@/generated/prisma/client"

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    messageId?: string | null
    fromEmail?: string | null
    subject?: string | null
    receivedAt?: Date
    uid?: number | null
    attachmentCount?: number
  }
) {
  return prisma.inboundEmailLog.create({
    data: {
      tenantId,
      messageId: data.messageId ?? null,
      fromEmail: data.fromEmail ?? null,
      subject: data.subject ?? null,
      receivedAt: data.receivedAt ?? new Date(),
      uid: data.uid ?? null,
      attachmentCount: data.attachmentCount ?? 0,
    },
  })
}

export async function findByMessageId(
  prisma: PrismaClient,
  tenantId: string,
  messageId: string
) {
  return prisma.inboundEmailLog.findFirst({
    where: { tenantId, messageId },
  })
}

export async function markProcessed(
  prisma: PrismaClient,
  id: string,
  invoiceId: string
) {
  await prisma.inboundEmailLog.update({
    where: { id },
    data: { status: "processed", invoiceId, processedAt: new Date() },
  })
}

export async function markFailed(
  prisma: PrismaClient,
  id: string,
  errorMessage: string
) {
  await prisma.inboundEmailLog.update({
    where: { id },
    data: { status: "failed", errorMessage, processedAt: new Date() },
  })
}

export async function markSkipped(
  prisma: PrismaClient,
  id: string,
  status: "skipped_no_attachment" | "skipped_no_pdf" | "skipped_duplicate"
) {
  await prisma.inboundEmailLog.update({
    where: { id },
    data: { status, processedAt: new Date() },
  })
}

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  filters?: {
    status?: string
    dateFrom?: Date
    dateTo?: Date
    search?: string
  },
  pagination?: { page?: number; pageSize?: number }
) {
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? 25
  const skip = (page - 1) * pageSize

  const where: Record<string, unknown> = { tenantId }
  if (filters?.status) where.status = filters.status
  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    }
  }
  if (filters?.search) {
    where.OR = [
      { fromEmail: { contains: filters.search, mode: "insensitive" } },
      { subject: { contains: filters.search, mode: "insensitive" } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.inboundEmailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.inboundEmailLog.count({ where }),
  ])

  return { items, total }
}
