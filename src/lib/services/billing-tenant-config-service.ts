import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./billing-tenant-config-repository"

// --- Error Classes ---

export class BillingTenantConfigNotFoundError extends Error {
  constructor(message = "Billing tenant config not found") {
    super(message)
    this.name = "BillingTenantConfigNotFoundError"
  }
}

// --- Service Functions ---

export async function get(
  prisma: PrismaClient,
  tenantId: string
) {
  return repo.findByTenantId(prisma, tenantId)
}

export async function upsert(
  prisma: PrismaClient,
  tenantId: string,
  input: {
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
  return repo.upsert(prisma, tenantId, input)
}
