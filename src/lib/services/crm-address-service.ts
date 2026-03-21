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
  "priceListId", "isActive",
]

const CONTACT_TRACKED_FIELDS = [
  "firstName", "lastName", "position", "department", "phone", "email",
  "notes", "isPrimary",
]

const BANK_ACCOUNT_TRACKED_FIELDS = [
  "iban", "bic", "bankName", "accountHolder", "isDefault",
]

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
    priceListId?: string | null
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
    priceListId: input.priceListId ?? null,
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
    priceListId?: string | null
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
    "priceListId",
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

  const created = await repo.createContact(prisma, {
    tenantId,
    addressId: input.addressId,
    firstName,
    lastName,
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

  const optionalFields = ["position", "department", "phone", "email", "notes", "isPrimary"] as const
  for (const field of optionalFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
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
