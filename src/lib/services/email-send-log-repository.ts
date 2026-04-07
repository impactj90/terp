import type { PrismaClient } from "@/generated/prisma/client"

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    documentId?: string | null
    documentType?: string | null
    toEmail: string
    ccEmails?: string[]
    subject: string
    bodyHtml: string
    templateId?: string | null
    status?: string
    sentBy?: string | null
    nextRetryAt?: Date | null
  }
) {
  return prisma.emailSendLog.create({
    data: {
      tenant: { connect: { id: tenantId } },
      toEmail: data.toEmail,
      ccEmails: data.ccEmails,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      status: data.status ?? "pending",
      documentId: data.documentId,
      documentType: data.documentType,
      nextRetryAt: data.nextRetryAt,
      ...(data.templateId
        ? { template: { connect: { id: data.templateId } } }
        : {}),
      ...(data.sentBy
        ? { sender: { connect: { id: data.sentBy } } }
        : {}),
    },
  })
}

export async function findByDocumentId(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  pagination?: { page: number; pageSize: number }
) {
  const page = pagination?.page ?? 1
  const pageSize = pagination?.pageSize ?? 20
  const skip = (page - 1) * pageSize

  const [items, total] = await Promise.all([
    prisma.emailSendLog.findMany({
      where: { tenantId, documentId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.emailSendLog.count({
      where: { tenantId, documentId },
    }),
  ])

  return { items, total, page, pageSize }
}

export async function findRetryable(
  prisma: PrismaClient,
  limit = 50
) {
  return prisma.emailSendLog.findMany({
    where: {
      status: { in: ["pending", "retrying"] },
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  })
}

export async function markSent(prisma: PrismaClient, id: string) {
  return prisma.emailSendLog.update({
    where: { id },
    data: { status: "sent", sentAt: new Date() },
  })
}

export async function markFailed(
  prisma: PrismaClient,
  id: string,
  errorMessage: string
) {
  return prisma.emailSendLog.update({
    where: { id },
    data: { status: "failed", errorMessage },
  })
}

export async function markRetrying(
  prisma: PrismaClient,
  id: string,
  retryCount: number,
  nextRetryAt: Date
) {
  return prisma.emailSendLog.update({
    where: { id },
    data: { status: "retrying", retryCount, nextRetryAt },
  })
}
