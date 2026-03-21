/**
 * Contact Kind Service
 *
 * Business logic for contact kind operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./contact-kind-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "contactTypeId",
  "code",
  "label",
  "isActive",
  "sortOrder",
]

// --- Error Classes ---

export class ContactKindNotFoundError extends Error {
  constructor(message = "Contact kind not found") {
    super(message)
    this.name = "ContactKindNotFoundError"
  }
}

export class ContactKindValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContactKindValidationError"
  }
}

export class ContactKindConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContactKindConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { contactTypeId?: string; isActive?: boolean }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const contactKind = await repo.findById(prisma, tenantId, id)
  if (!contactKind) {
    throw new ContactKindNotFoundError()
  }
  return contactKind
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    contactTypeId: string
    code: string
    label: string
    isActive?: boolean
    sortOrder?: number
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new ContactKindValidationError("Contact kind code is required")
  }

  // Trim and validate label
  const label = input.label.trim()
  if (label.length === 0) {
    throw new ContactKindValidationError("Contact kind label is required")
  }

  // Verify that the referenced contactType exists in this tenant
  const contactType = await prisma.contactType.findFirst({
    where: { id: input.contactTypeId, tenantId },
  })
  if (!contactType) {
    throw new ContactKindValidationError("Referenced contact type not found")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new ContactKindConflictError("Contact kind code already exists")
  }

  const created = await repo.create(prisma, {
    tenantId,
    contactTypeId: input.contactTypeId,
    code,
    label,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "contact_kind",
      entityId: created.id,
      entityName: created.label ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    contactTypeId?: string
    code?: string
    label?: string
    isActive?: boolean
    sortOrder?: number
  },
  audit?: AuditContext
) {
  // Verify contact kind exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new ContactKindNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle contactTypeId update
  if (input.contactTypeId !== undefined) {
    // Verify that the referenced contactType exists in this tenant
    const contactType = await prisma.contactType.findFirst({
      where: { id: input.contactTypeId, tenantId },
    })
    if (!contactType) {
      throw new ContactKindValidationError("Referenced contact type not found")
    }
    data.contactTypeId = input.contactTypeId
  }

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new ContactKindValidationError("Contact kind code is required")
    }
    // Check uniqueness if changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new ContactKindConflictError("Contact kind code already exists")
      }
    }
    data.code = code
  }

  // Handle label update
  if (input.label !== undefined) {
    const label = input.label.trim()
    if (label.length === 0) {
      throw new ContactKindValidationError("Contact kind label is required")
    }
    data.label = label
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // Handle sortOrder update
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "contact_kind",
      entityId: input.id,
      entityName: updated.label ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
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
  // Verify contact kind exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ContactKindNotFoundError()
  }

  // Check for employee contacts referencing this kind
  const contactCount = await repo.countEmployeeContacts(prisma, id)
  if (contactCount > 0) {
    throw new ContactKindValidationError(
      "Cannot delete contact kind with associated employee contacts"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "contact_kind",
      entityId: id,
      entityName: existing.label ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
