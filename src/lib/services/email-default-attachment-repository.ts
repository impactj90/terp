import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  documentType?: string
) {
  return prisma.emailDefaultAttachment.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(documentType
        ? {
            OR: [
              { documentType },
              { documentType: null }, // applies to all types
            ],
          }
        : {}),
    },
    orderBy: { sortOrder: "asc" },
  })
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    documentType?: string | null
    fileName: string
    filePath: string
    storageBucket?: string
    sortOrder?: number
  }
) {
  return prisma.emailDefaultAttachment.create({
    data: {
      tenant: { connect: { id: tenantId } },
      ...data,
    },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const attachment = await prisma.emailDefaultAttachment.findFirst({
    where: { id, tenantId },
  })
  if (!attachment) return null

  return prisma.emailDefaultAttachment.delete({
    where: { id },
  })
}
