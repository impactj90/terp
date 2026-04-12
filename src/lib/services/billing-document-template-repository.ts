import type { PrismaClient, BillingDocumentType } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.billingDocumentTemplate.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingDocumentTemplate.findFirst({
    where: { id, tenantId },
  })
}

export async function findByType(
  prisma: PrismaClient,
  tenantId: string,
  documentType: BillingDocumentType
) {
  return prisma.billingDocumentTemplate.findMany({
    where: {
      tenantId,
      OR: [
        { documentType },
        { documentType: null },
      ],
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function findDefault(
  prisma: PrismaClient,
  tenantId: string,
  documentType: BillingDocumentType
) {
  return prisma.billingDocumentTemplate.findFirst({
    where: { tenantId, documentType, isDefault: true },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    documentType?: BillingDocumentType | null
    headerText?: string | null
    footerText?: string | null
    isDefault?: boolean
    createdById?: string | null
  }
) {
  return prisma.billingDocumentTemplate.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingDocumentTemplate.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.billingDocumentTemplate.findFirst({
    where: { id, tenantId },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingDocumentTemplate.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function clearDefault(
  prisma: PrismaClient,
  tenantId: string,
  documentType: BillingDocumentType
) {
  await prisma.billingDocumentTemplate.updateMany({
    where: { tenantId, documentType, isDefault: true },
    data: { isDefault: false },
  })
}
