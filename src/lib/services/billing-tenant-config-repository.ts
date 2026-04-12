import type { PrismaClient } from "@/generated/prisma/client"

export async function findByTenantId(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.billingTenantConfig.findUnique({
    where: { tenantId },
  })
}

export async function upsert(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    companyName?: string | null
    companyAddress?: string | null
    logoUrl?: string | null
    bankName?: string | null
    iban?: string | null
    bic?: string | null
    taxId?: string | null
    commercialRegister?: string | null
    managingDirector?: string | null
    footerHtml?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
    taxNumber?: string | null
    leitwegId?: string | null
    eInvoiceEnabled?: boolean
    companyStreet?: string | null
    companyZip?: string | null
    companyCity?: string | null
    companyCountry?: string | null
  }
) {
  return prisma.billingTenantConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  })
}
