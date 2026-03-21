import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./crm-inquiry-repository"
import * as numberSeqService from "./number-sequence-service"
import * as orderService from "./order-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Tracked Fields for Audit Diffs ---

const INQUIRY_TRACKED_FIELDS = [
  "title", "status", "contactId", "effort", "creditRating", "notes",
  "closingReason", "closingRemarks", "orderId",
]

// --- Error Classes ---

export class CrmInquiryNotFoundError extends Error {
  constructor(message = "CRM inquiry not found") {
    super(message)
    this.name = "CrmInquiryNotFoundError"
  }
}

export class CrmInquiryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmInquiryValidationError"
  }
}

export class CrmInquiryConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmInquiryConflictError"
  }
}

// --- Inquiry Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    search?: string
    status?: "OPEN" | "IN_PROGRESS" | "CLOSED" | "CANCELLED"
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
  const inquiry = await repo.findById(prisma, tenantId, id)
  if (!inquiry) {
    throw new CrmInquiryNotFoundError()
  }
  return inquiry
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    title: string
    addressId: string
    contactId?: string
    effort?: string
    notes?: string
  },
  createdById: string,
  audit?: AuditContext
) {
  // Validate address belongs to tenant
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
  })
  if (!address) {
    throw new CrmInquiryValidationError("Address not found in this tenant")
  }

  // Validate contact belongs to the address (if provided)
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.addressId, tenantId },
    })
    if (!contact) {
      throw new CrmInquiryValidationError("Contact not found for this address")
    }
  }

  // Generate inquiry number via NumberSequence
  const number = await numberSeqService.getNextNumber(prisma, tenantId, "inquiry")

  const created = await repo.create(prisma, {
    tenantId,
    number,
    title: input.title,
    addressId: input.addressId,
    contactId: input.contactId || null,
    effort: input.effort || null,
    notes: input.notes || null,
    createdById,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "crm_inquiry",
      entityId: created.id, entityName: created.title ?? null, changes: null,
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
    title?: string
    contactId?: string | null
    effort?: string | null
    creditRating?: string | null
    notes?: string | null
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmInquiryNotFoundError()
  }

  if (existing.status === "CLOSED") {
    throw new CrmInquiryValidationError("Cannot update a closed inquiry")
  }

  // If contactId is being changed and is provided, validate it
  if (input.contactId !== undefined && input.contactId !== null) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: existing.addressId, tenantId },
    })
    if (!contact) {
      throw new CrmInquiryValidationError("Contact not found for this address")
    }
  }

  const data: Record<string, unknown> = {}

  const fields = ["title", "contactId", "effort", "creditRating", "notes"] as const
  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) {
    return existing
  }

  // Auto-transition from OPEN to IN_PROGRESS on first update
  if (existing.status === "OPEN") {
    data.status = "IN_PROGRESS"
  }

  const updated = await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, INQUIRY_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "crm_inquiry",
      entityId: input.id, entityName: updated?.title ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function close(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    closingReason?: string
    closingRemarks?: string
    closeLinkedOrder?: boolean
  },
  closedById: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmInquiryNotFoundError()
  }

  if (existing.status === "CLOSED") {
    throw new CrmInquiryConflictError("Inquiry is already closed")
  }

  const data: Record<string, unknown> = {
    status: "CLOSED",
    closedAt: new Date(),
    closedById,
    closingReason: input.closingReason || null,
    closingRemarks: input.closingRemarks || null,
  }

  const result = await repo.update(prisma, tenantId, input.id, data)

  // Optionally close linked Terp order
  if (input.closeLinkedOrder && existing.orderId) {
    try {
      await orderService.update(prisma, tenantId, {
        id: existing.orderId,
        status: "completed",
      })
    } catch (err) {
      console.warn("Failed to close linked order:", err)
    }
  }

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>, INQUIRY_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "close", entityType: "crm_inquiry",
      entityId: input.id, entityName: result?.title ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason?: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmInquiryNotFoundError()
  }

  if (existing.status === "CLOSED" || existing.status === "CANCELLED") {
    throw new CrmInquiryValidationError(
      "Cannot cancel an inquiry that is already closed or cancelled"
    )
  }

  const result = await repo.update(prisma, tenantId, id, {
    status: "CANCELLED",
    closingReason: reason || null,
  })

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>, INQUIRY_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "cancel", entityType: "crm_inquiry",
      entityId: id, entityName: existing.title ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function reopen(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmInquiryNotFoundError()
  }

  if (existing.status !== "CLOSED" && existing.status !== "CANCELLED") {
    throw new CrmInquiryValidationError(
      "Can only reopen closed or cancelled inquiries"
    )
  }

  const result = await repo.update(prisma, tenantId, id, {
    status: "IN_PROGRESS",
    closedAt: null,
    closedById: null,
    closingReason: null,
    closingRemarks: null,
  })

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>, INQUIRY_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "reopen", entityType: "crm_inquiry",
      entityId: id, entityName: existing.title ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function linkOrder(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  orderId: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmInquiryNotFoundError()
  }

  // Verify order belongs to tenant
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
  })
  if (!order) {
    throw new CrmInquiryValidationError("Order not found in this tenant")
  }

  const result = await repo.update(prisma, tenantId, id, { orderId })

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>, INQUIRY_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "link_order", entityType: "crm_inquiry",
      entityId: id, entityName: existing.title ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function createOrder(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input?: { orderName?: string },
  userId?: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmInquiryNotFoundError()
  }

  if (existing.orderId) {
    throw new CrmInquiryConflictError("Inquiry already has a linked order")
  }

  // Generate order code from inquiry number
  const code = "CRM-" + existing.number

  const createdOrder = await orderService.create(prisma, tenantId, {
    code,
    name: input?.orderName || existing.title,
    customer: existing.address.company,
  })

  // Link the order and auto-transition status
  const updateData: Record<string, unknown> = { orderId: createdOrder.id }
  if (existing.status === "OPEN") {
    updateData.status = "IN_PROGRESS"
  }

  const result = await repo.update(prisma, tenantId, id, updateData)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>, INQUIRY_TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create_order", entityType: "crm_inquiry",
      entityId: id, entityName: existing.title ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // Check for linked records
  const linked = await repo.countLinkedRecords(prisma, tenantId, id)
  if (linked.correspondences > 0) {
    throw new CrmInquiryValidationError(
      "Cannot delete inquiry with linked correspondence entries. Remove the links first."
    )
  }

  // Fetch name before deleting
  const existing = audit ? await repo.findById(prisma, tenantId, id) : null

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) {
    throw new CrmInquiryNotFoundError()
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "crm_inquiry",
      entityId: id, entityName: existing?.title ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
