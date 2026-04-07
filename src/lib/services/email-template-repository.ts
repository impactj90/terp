import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  documentType?: string
) {
  return prisma.emailTemplate.findMany({
    where: {
      tenantId,
      ...(documentType ? { documentType } : {}),
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.emailTemplate.findFirst({
    where: { id, tenantId },
  })
}

export async function findDefault(
  prisma: PrismaClient,
  tenantId: string,
  documentType: string
) {
  return prisma.emailTemplate.findFirst({
    where: { tenantId, documentType, isDefault: true },
  })
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    documentType: string
    name: string
    subject: string
    bodyHtml: string
    isDefault?: boolean
  }
) {
  // If setting as default, unset previous default in a transaction
  if (data.isDefault) {
    return prisma.$transaction(async (tx) => {
      await tx.emailTemplate.updateMany({
        where: { tenantId, documentType: data.documentType, isDefault: true },
        data: { isDefault: false },
      })
      return tx.emailTemplate.create({
        data: {
          tenant: { connect: { id: tenantId } },
          ...data,
        },
      })
    })
  }

  return prisma.emailTemplate.create({
    data: {
      tenant: { connect: { id: tenantId } },
      ...data,
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    name?: string
    subject?: string
    bodyHtml?: string
    isDefault?: boolean
    documentType?: string
  }
) {
  // If setting as default, unset previous default in a transaction
  if (data.isDefault) {
    return prisma.$transaction(async (tx) => {
      // Need the template to know its document type
      const template = await tx.emailTemplate.findFirst({
        where: { id, tenantId },
      })
      if (!template) return null

      const docType = data.documentType ?? template.documentType
      await tx.emailTemplate.updateMany({
        where: { tenantId, documentType: docType, isDefault: true },
        data: { isDefault: false },
      })
      return tx.emailTemplate.update({
        where: { id },
        data,
      })
    })
  }

  // Verify tenant ownership
  const template = await prisma.emailTemplate.findFirst({
    where: { id, tenantId },
  })
  if (!template) return null

  return prisma.emailTemplate.update({
    where: { id },
    data,
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const template = await prisma.emailTemplate.findFirst({
    where: { id, tenantId },
  })
  if (!template) return null

  return prisma.emailTemplate.delete({
    where: { id },
  })
}
