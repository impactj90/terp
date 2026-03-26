import type { PrismaClient, CrmAddressType } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// --- Address Repository ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    search?: string
    type?: CrmAddressType
    isActive?: boolean
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params.type) {
    if (params.type === "CUSTOMER") {
      where.type = { in: ["CUSTOMER", "BOTH"] }
    } else if (params.type === "SUPPLIER") {
      where.type = { in: ["SUPPLIER", "BOTH"] }
    } else {
      where.type = params.type
    }
  }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { company: { contains: term, mode: "insensitive" } },
        { number: { contains: term, mode: "insensitive" } },
        { matchCode: { contains: term, mode: "insensitive" } },
        { city: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.crmAddress.findMany({
      where,
      orderBy: { company: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.crmAddress.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmAddress.findFirst({
    where: { id, tenantId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      salesPriceList: { select: { id: true, name: true } },
      purchasePriceList: { select: { id: true, name: true } },
    },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    number: string
    type: CrmAddressType
    company: string
    street?: string | null
    zip?: string | null
    city?: string | null
    country?: string | null
    phone?: string | null
    fax?: string | null
    email?: string | null
    website?: string | null
    taxNumber?: string | null
    vatId?: string | null
    leitwegId?: string | null
    matchCode?: string | null
    notes?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    discountGroup?: string | null
    ourCustomerNumber?: string | null
    salesPriceListId?: string | null
    purchasePriceListId?: string | null
    createdById?: string | null
  }
) {
  return prisma.crmAddress.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, data, { entity: "CrmAddress" })
}

export async function softDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, { isActive: false } as Record<string, unknown>, { entity: "CrmAddress" })
}

export async function restore(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, { isActive: true } as Record<string, unknown>, { entity: "CrmAddress" })
}

export async function hardDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.crmAddress.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Contact Repository ---

export async function findContacts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  return prisma.crmContact.findMany({
    where: { tenantId, addressId },
    orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
  })
}

export async function findContactById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmContact.findFirst({
    where: { id, tenantId },
  })
}

export async function createContact(
  prisma: PrismaClient,
  data: {
    tenantId: string
    addressId: string
    firstName: string
    lastName: string
    salutation?: string | null
    title?: string | null
    letterSalutation?: string | null
    position?: string | null
    department?: string | null
    phone?: string | null
    email?: string | null
    notes?: string | null
    isPrimary?: boolean
  }
) {
  return prisma.crmContact.create({ data })
}

export async function updateContact(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.crmContact, { id, tenantId }, data, { entity: "CrmContact" })
}

export async function deleteContact(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.crmContact.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Bank Account Repository ---

export async function findBankAccounts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  return prisma.crmBankAccount.findMany({
    where: { tenantId, addressId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  })
}

export async function findBankAccountById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmBankAccount.findFirst({
    where: { id, tenantId },
  })
}

export async function createBankAccount(
  prisma: PrismaClient,
  data: {
    tenantId: string
    addressId: string
    iban: string
    bic?: string | null
    bankName?: string | null
    accountHolder?: string | null
    isDefault?: boolean
  }
) {
  return prisma.crmBankAccount.create({ data })
}

export async function updateBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.crmBankAccount, { id, tenantId }, data, { entity: "CrmBankAccount" })
}

export async function deleteBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.crmBankAccount.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Counting helpers (for hard-delete checks) ---

export async function countContacts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  return prisma.crmContact.count({ where: { tenantId, addressId } })
}

export async function countBankAccounts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  return prisma.crmBankAccount.count({ where: { tenantId, addressId } })
}
