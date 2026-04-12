import type { PrismaClient, CrmCorrespondenceDirection } from "@/generated/prisma/client"
import * as repo from "./crm-correspondence-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import * as attachmentService from "./crm-correspondence-attachment-service"

// --- Tracked Fields for Audit Diffs ---

const CORRESPONDENCE_TRACKED_FIELDS = [
  "direction", "type", "date", "contactId", "inquiryId",
  "fromUser", "toUser", "subject", "content",
]

// --- Error Classes ---

export class CrmCorrespondenceNotFoundError extends Error {
  constructor(message = "CRM correspondence not found") {
    super(message)
    this.name = "CrmCorrespondenceNotFoundError"
  }
}

export class CrmCorrespondenceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmCorrespondenceValidationError"
  }
}

// --- Correspondence Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    inquiryId?: string
    search?: string
    direction?: CrmCorrespondenceDirection
    type?: string
    dateFrom?: Date
    dateTo?: Date
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
  const entry = await repo.findById(prisma, tenantId, id)
  if (!entry) {
    throw new CrmCorrespondenceNotFoundError()
  }
  return entry
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    addressId: string
    direction: CrmCorrespondenceDirection
    type: string
    date: Date
    contactId?: string
    inquiryId?: string
    fromUser?: string
    toUser?: string
    subject: string
    content?: string
  },
  createdById: string,
  audit?: AuditContext
) {
  // Validate address belongs to tenant
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
  })
  if (!address) {
    throw new CrmCorrespondenceValidationError("Address not found in this tenant")
  }

  // Validate contact belongs to the address (if provided)
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.addressId, tenantId },
    })
    if (!contact) {
      throw new CrmCorrespondenceValidationError("Contact not found for this address")
    }
  }

  const created = await repo.create(prisma, {
    tenantId,
    addressId: input.addressId,
    direction: input.direction,
    type: input.type,
    date: input.date,
    contactId: input.contactId || null,
    inquiryId: input.inquiryId || null,
    fromUser: input.fromUser || null,
    toUser: input.toUser || null,
    subject: input.subject,
    content: input.content || null,
    createdById,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "crm_correspondence",
      entityId: created.id, entityName: created.subject ?? null, changes: null,
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
    direction?: CrmCorrespondenceDirection
    type?: string
    date?: Date
    contactId?: string | null
    inquiryId?: string | null
    fromUser?: string | null
    toUser?: string | null
    subject?: string
    content?: string | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmCorrespondenceNotFoundError()
  }

  // If contactId is being changed and is provided, validate it
  if (input.contactId !== undefined && input.contactId !== null) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: existing.addressId, tenantId },
    })
    if (!contact) {
      throw new CrmCorrespondenceValidationError("Contact not found for this address")
    }
  }

  const data: Record<string, unknown> = {}

  const fields = [
    "direction", "type", "date", "contactId", "inquiryId",
    "fromUser", "toUser", "subject", "content",
  ] as const

  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) {
    return existing
  }

  const updated = await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, CORRESPONDENCE_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "crm_correspondence",
      entityId: input.id, entityName: updated?.subject ?? null, changes,
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
  // Fetch name before deleting
  const existing = audit ? await repo.findById(prisma, tenantId, id) : null

  // Clean up Storage files before CASCADE deletes DB records
  await attachmentService.deleteAllByCorrespondence(prisma, tenantId, id)

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) {
    throw new CrmCorrespondenceNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "crm_correspondence",
      entityId: id, entityName: existing?.subject ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
