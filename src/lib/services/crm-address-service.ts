import type { PrismaClient, CrmAddressType } from "@/generated/prisma/client"
import * as repo from "./crm-address-repository"
import * as numberSeqService from "./number-sequence-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Tracked Fields for Audit Diffs ---

const ADDRESS_TRACKED_FIELDS = [
  "type", "company", "street", "zip", "city", "country", "phone", "fax",
  "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
  "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
  "ourCustomerNumber", "salesPriceListId", "purchasePriceListId", "isActive",
  "parentAddressId",
]

const CONTACT_TRACKED_FIELDS = [
  "firstName", "lastName", "salutation", "title", "letterSalutation",
  "position", "department", "phone", "email",
  "notes", "isPrimary",
]

const BANK_ACCOUNT_TRACKED_FIELDS = [
  "iban", "bic", "bankName", "accountHolder", "isDefault",
]

// --- Letter Salutation Helper ---

export function generateLetterSalutation(
  salutation?: string | null,
  title?: string | null,
  lastName?: string | null
): string {
  if (!salutation || !lastName) return ""
  if (salutation === "Herr") {
    const titlePart = title ? ` ${title}` : ""
    return `Sehr geehrter Herr${titlePart} ${lastName}`
  }
  if (salutation === "Frau") {
    const titlePart = title ? ` ${title}` : ""
    return `Sehr geehrte Frau${titlePart} ${lastName}`
  }
  // "Divers" or unknown — no auto-generation
  return ""
}

// --- Hierarchy Helpers ---

async function checkCircularReference(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string,
  proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([addressId])
  let current: string | null = proposedParentId

  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)

    const record = await repo.findParentId(prisma, tenantId, current)
    if (!record) break
    current = record.parentAddressId
  }

  return false
}

// --- Error Classes ---

export class CrmAddressNotFoundError extends Error {
  constructor(message = "CRM address not found") {
    super(message)
    this.name = "CrmAddressNotFoundError"
  }
}

export class CrmAddressValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmAddressValidationError"
  }
}

export class CrmAddressConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmAddressConflictError"
  }
}

export class CrmContactNotFoundError extends Error {
  constructor(message = "CRM contact not found") {
    super(message)
    this.name = "CrmContactNotFoundError"
  }
}

export class CrmBankAccountNotFoundError extends Error {
  constructor(message = "CRM bank account not found") {
    super(message)
    this.name = "CrmBankAccountNotFoundError"
  }
}

// --- Address Service Functions ---

export async function list(
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
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const address = await repo.findById(prisma, tenantId, id)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }
  return address
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    type?: CrmAddressType
    company: string
    street?: string
    zip?: string
    city?: string
    country?: string
    phone?: string
    fax?: string
    email?: string
    website?: string
    taxNumber?: string
    vatId?: string
    leitwegId?: string
    matchCode?: string
    notes?: string
    paymentTermDays?: number
    discountPercent?: number
    discountDays?: number
    discountGroup?: string
    ourCustomerNumber?: string
    salesPriceListId?: string | null
    purchasePriceListId?: string | null
  },
  createdById: string,
  audit?: AuditContext
) {
  const company = input.company.trim()
  if (company.length === 0) {
    throw new CrmAddressValidationError("Company name is required")
  }

  const type = input.type ?? "CUSTOMER"

  // Determine sequence key from type
  const numberKey = type === "SUPPLIER" ? "supplier" : "customer"
  const number = await numberSeqService.getNextNumber(prisma, tenantId, numberKey)

  // Auto-generate matchCode from company if not provided
  const matchCode = input.matchCode?.trim() || company.toUpperCase().slice(0, 20)

  const created = await repo.create(prisma, {
    tenantId,
    number,
    type,
    company,
    street: input.street || null,
    zip: input.zip || null,
    city: input.city || null,
    country: input.country || "DE",
    phone: input.phone || null,
    fax: input.fax || null,
    email: input.email || null,
    website: input.website || null,
    taxNumber: input.taxNumber || null,
    vatId: input.vatId || null,
    leitwegId: input.leitwegId || null,
    matchCode,
    notes: input.notes || null,
    paymentTermDays: input.paymentTermDays ?? null,
    discountPercent: input.discountPercent ?? null,
    discountDays: input.discountDays ?? null,
    discountGroup: input.discountGroup || null,
    ourCustomerNumber: input.ourCustomerNumber || null,
    salesPriceListId: input.salesPriceListId ?? null,
    purchasePriceListId: input.purchasePriceListId ?? null,
    createdById,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "crm_address",
      entityId: created.id, entityName: created.company ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    type?: CrmAddressType
    company?: string
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
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmAddressNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.company !== undefined) {
    const company = input.company.trim()
    if (company.length === 0) {
      throw new CrmAddressValidationError("Company name is required")
    }
    data.company = company
  }

  // Pass through all optional fields
  const directFields = [
    "type", "street", "zip", "city", "country", "phone", "fax",
    "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
    "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
    "ourCustomerNumber", "salesPriceListId", "purchasePriceListId",
  ] as const

  for (const field of directFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) {
    return existing
  }

  const updated = await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, ADDRESS_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "crm_address",
      entityId: input.id, entityName: updated.company ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmAddressNotFoundError()
  }

  // Soft-delete: set isActive=false
  const result = await repo.softDelete(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "crm_address",
      entityId: id, entityName: existing.company ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function restoreAddress(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmAddressNotFoundError()
  }
  const restored = await repo.restore(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "restore", entityType: "crm_address",
      entityId: id, entityName: existing.company ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return restored
}

// --- Hierarchy Service Functions ---

export async function setParentAddress(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string,
  parentAddressId: string | null,
  audit?: AuditContext
) {
  // 1. Load the address
  const address = await repo.findById(prisma, tenantId, addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }

  // If clearing the parent, just update and return
  if (parentAddressId === null) {
    const updated = await repo.update(prisma, tenantId, addressId, { parentAddressId: null })

    if (audit) {
      const changes = auditLog.computeChanges(
        address as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
        ADDRESS_TRACKED_FIELDS
      )
      await auditLog.log(prisma, {
        tenantId, userId: audit.userId, action: "update", entityType: "crm_address",
        entityId: addressId, entityName: address.company ?? null, changes,
        ipAddress: audit.ipAddress, userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err))
    }

    return updated
  }

  // 2. Self-reference check
  if (parentAddressId === addressId) {
    throw new CrmAddressValidationError("An address cannot be its own parent")
  }

  // 3. Load the proposed parent
  const parent = await repo.findById(prisma, tenantId, parentAddressId)
  if (!parent) {
    throw new CrmAddressValidationError("Parent address not found in this tenant")
  }

  // 4. Same-type check (BOTH is compatible with both CUSTOMER and SUPPLIER)
  const typesCompatible =
    address.type === parent.type ||
    address.type === "BOTH" ||
    parent.type === "BOTH"
  if (!typesCompatible) {
    throw new CrmAddressValidationError(
      "Parent and child address must be of the same type"
    )
  }

  // 5. Max depth check: parent must not itself have a parent (max 2 levels)
  if (parent.parentAddressId !== null) {
    throw new CrmAddressValidationError(
      "Maximum hierarchy depth of 2 levels exceeded. The selected parent is already a subsidiary."
    )
  }

  // 6. Max depth check: this address must not have children (if it becomes a child, it can't have children)
  const childCount = await repo.countChildren(prisma, tenantId, addressId)
  if (childCount > 0) {
    throw new CrmAddressValidationError(
      "This address has subsidiaries and cannot be assigned as a subsidiary itself. Remove its subsidiaries first."
    )
  }

  // 7. Circular reference check (defense in depth, covered by depth checks above for max 2 levels)
  const isCircular = await checkCircularReference(prisma, tenantId, addressId, parentAddressId)
  if (isCircular) {
    throw new CrmAddressValidationError("Circular reference detected")
  }

  // 8. Update parentAddressId
  const updated = await repo.update(prisma, tenantId, addressId, { parentAddressId })

  if (audit) {
    const changes = auditLog.computeChanges(
      address as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ADDRESS_TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "crm_address",
      entityId: addressId, entityName: address.company ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function getHierarchy(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  const address = await repo.findByIdWithHierarchy(prisma, tenantId, addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }
  return address
}

export async function listGroups(
  prisma: PrismaClient,
  tenantId: string
) {
  return repo.findParentAddresses(prisma, tenantId)
}

export async function getGroupStats(
  prisma: PrismaClient,
  tenantId: string,
  parentAddressId: string,
  dateFrom?: string,
  dateTo?: string
) {
  // Verify parent exists and is in this tenant
  const parent = await repo.findById(prisma, tenantId, parentAddressId)
  if (!parent) {
    throw new CrmAddressNotFoundError()
  }

  // Get all child address IDs
  const children = await prisma.crmAddress.findMany({
    where: { tenantId, parentAddressId, isActive: true },
    select: { id: true, company: true, number: true },
  })

  const allAddressIds = [parentAddressId, ...children.map(c => c.id)]

  // Build date filter
  const dateFilter: Record<string, unknown> = {}
  if (dateFrom) {
    dateFilter.gte = new Date(dateFrom)
  }
  if (dateTo) {
    dateFilter.lte = new Date(dateTo)
  }

  // Aggregate revenue: INVOICE adds, CREDIT_NOTE subtracts
  const invoiceWhere: Record<string, unknown> = {
    tenantId,
    addressId: { in: allAddressIds },
    type: "INVOICE",
    status: { not: "CANCELLED" },
  }
  if (dateFrom || dateTo) {
    invoiceWhere.documentDate = dateFilter
  }

  const creditWhere: Record<string, unknown> = {
    tenantId,
    addressId: { in: allAddressIds },
    type: "CREDIT_NOTE",
    status: { not: "CANCELLED" },
  }
  if (dateFrom || dateTo) {
    creditWhere.documentDate = dateFilter
  }

  const [invoiceAgg, creditAgg, documentCount] = await Promise.all([
    prisma.billingDocument.aggregate({
      where: invoiceWhere,
      _sum: { subtotalNet: true, totalGross: true },
    }),
    prisma.billingDocument.aggregate({
      where: creditWhere,
      _sum: { subtotalNet: true, totalGross: true },
    }),
    prisma.billingDocument.count({
      where: {
        tenantId,
        addressId: { in: allAddressIds },
        type: { in: ["INVOICE", "CREDIT_NOTE"] },
        status: { not: "CANCELLED" },
        ...(dateFrom || dateTo ? { documentDate: dateFilter } : {}),
      },
    }),
  ])

  const totalNet = (invoiceAgg._sum.subtotalNet ?? 0) - (creditAgg._sum.subtotalNet ?? 0)
  const totalGross = (invoiceAgg._sum.totalGross ?? 0) - (creditAgg._sum.totalGross ?? 0)

  return {
    parentAddress: { id: parent.id, company: parent.company, number: parent.number },
    childCount: children.length,
    children: children.map(c => ({ id: c.id, company: c.company, number: c.number })),
    revenue: {
      totalNet: Math.round(totalNet * 100) / 100,
      totalGross: Math.round(totalGross * 100) / 100,
      documentCount,
    },
  }
}

// --- Contact Service Functions ---

export async function listContacts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  const address = await repo.findById(prisma, tenantId, addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }
  return repo.findContacts(prisma, tenantId, addressId)
}

export async function createContact(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    addressId: string
    firstName: string
    lastName: string
    salutation?: string
    title?: string
    letterSalutation?: string
    position?: string
    department?: string
    phone?: string
    email?: string
    notes?: string
    isPrimary?: boolean
  },
  audit?: AuditContext
) {
  const address = await repo.findById(prisma, tenantId, input.addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }

  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (firstName.length === 0) {
    throw new CrmAddressValidationError("First name is required")
  }
  if (lastName.length === 0) {
    throw new CrmAddressValidationError("Last name is required")
  }

  // Auto-generate letterSalutation if not provided
  const letterSalutation = input.letterSalutation?.trim() ||
    generateLetterSalutation(input.salutation, input.title, lastName) || null

  const created = await repo.createContact(prisma, {
    tenantId,
    addressId: input.addressId,
    firstName,
    lastName,
    salutation: input.salutation || null,
    title: input.title || null,
    letterSalutation,
    position: input.position || null,
    department: input.department || null,
    phone: input.phone || null,
    email: input.email || null,
    notes: input.notes || null,
    isPrimary: input.isPrimary ?? false,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "crm_contact",
      entityId: created.id, entityName: `${created.firstName} ${created.lastName}`, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function updateContact(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    firstName?: string
    lastName?: string
    salutation?: string | null
    title?: string | null
    letterSalutation?: string | null
    position?: string | null
    department?: string | null
    phone?: string | null
    email?: string | null
    notes?: string | null
    isPrimary?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findContactById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmContactNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.firstName !== undefined) {
    const firstName = input.firstName.trim()
    if (firstName.length === 0) {
      throw new CrmAddressValidationError("First name is required")
    }
    data.firstName = firstName
  }
  if (input.lastName !== undefined) {
    const lastName = input.lastName.trim()
    if (lastName.length === 0) {
      throw new CrmAddressValidationError("Last name is required")
    }
    data.lastName = lastName
  }

  const optionalFields = ["salutation", "title", "letterSalutation", "position", "department", "phone", "email", "notes", "isPrimary"] as const
  for (const field of optionalFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  // Auto-generate letterSalutation if salutation/name changed and letterSalutation not explicitly set
  if (input.letterSalutation === undefined) {
    if (input.salutation !== undefined || input.lastName !== undefined) {
      const effectiveSalutation = (data.salutation as string | null | undefined) ?? existing.salutation
      const effectiveTitle = (data.title as string | null | undefined) ?? existing.title
      const effectiveLastName = (data.lastName as string | undefined) ?? existing.lastName
      const autoGenerated = generateLetterSalutation(effectiveSalutation, effectiveTitle, effectiveLastName)
      if (autoGenerated) {
        const previousAutoGenerated = generateLetterSalutation(existing.salutation, existing.title, existing.lastName)
        if (!existing.letterSalutation || existing.letterSalutation === previousAutoGenerated) {
          data.letterSalutation = autoGenerated
        }
      }
    }
  }

  const updated = await repo.updateContact(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, CONTACT_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "crm_contact",
      entityId: input.id, entityName: `${updated.firstName} ${updated.lastName}`, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function deleteContact(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findContactById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmContactNotFoundError()
  }
  await repo.deleteContact(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "crm_contact",
      entityId: id, entityName: `${existing.firstName} ${existing.lastName}`, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

// --- Bank Account Service Functions ---

export async function listBankAccounts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  const address = await repo.findById(prisma, tenantId, addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }
  return repo.findBankAccounts(prisma, tenantId, addressId)
}

export async function createBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    addressId: string
    iban: string
    bic?: string
    bankName?: string
    accountHolder?: string
    isDefault?: boolean
  },
  audit?: AuditContext
) {
  const address = await repo.findById(prisma, tenantId, input.addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }

  const iban = input.iban.trim().replace(/\s/g, "").toUpperCase()
  if (iban.length === 0) {
    throw new CrmAddressValidationError("IBAN is required")
  }

  const created = await repo.createBankAccount(prisma, {
    tenantId,
    addressId: input.addressId,
    iban,
    bic: input.bic || null,
    bankName: input.bankName || null,
    accountHolder: input.accountHolder || null,
    isDefault: input.isDefault ?? false,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "bank_account",
      entityId: created.id, entityName: created.iban ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function updateBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    iban?: string
    bic?: string | null
    bankName?: string | null
    accountHolder?: string | null
    isDefault?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findBankAccountById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmBankAccountNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.iban !== undefined) {
    const iban = input.iban.trim().replace(/\s/g, "").toUpperCase()
    if (iban.length === 0) {
      throw new CrmAddressValidationError("IBAN is required")
    }
    data.iban = iban
  }

  const optionalFields = ["bic", "bankName", "accountHolder", "isDefault"] as const
  for (const field of optionalFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  const updated = await repo.updateBankAccount(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, BANK_ACCOUNT_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "bank_account",
      entityId: input.id, entityName: updated.iban ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function deleteBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findBankAccountById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmBankAccountNotFoundError()
  }
  await repo.deleteBankAccount(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "bank_account",
      entityId: id, entityName: existing.iban ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
