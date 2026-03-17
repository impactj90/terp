import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./crm-inquiry-repository"
import * as numberSeqService from "./number-sequence-service"
import * as orderService from "./order-service"

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
  createdById: string
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

  return repo.create(prisma, {
    tenantId,
    number,
    title: input.title,
    addressId: input.addressId,
    contactId: input.contactId || null,
    effort: input.effort || null,
    notes: input.notes || null,
    createdById,
  })
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
  }
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

  return repo.update(prisma, tenantId, input.id, data)
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
  closedById: string
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

  return result
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason?: string
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

  return repo.update(prisma, tenantId, id, {
    status: "CANCELLED",
    closingReason: reason || null,
  })
}

export async function reopen(
  prisma: PrismaClient,
  tenantId: string,
  id: string
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

  return repo.update(prisma, tenantId, id, {
    status: "IN_PROGRESS",
    closedAt: null,
    closedById: null,
    closingReason: null,
    closingRemarks: null,
  })
}

export async function linkOrder(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  orderId: string
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

  return repo.update(prisma, tenantId, id, { orderId })
}

export async function createOrder(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input?: { orderName?: string },
  userId?: string
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

  return repo.update(prisma, tenantId, id, updateData)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Check for linked records
  const linked = await repo.countLinkedRecords(prisma, tenantId, id)
  if (linked.correspondences > 0) {
    throw new CrmInquiryValidationError(
      "Cannot delete inquiry with linked correspondence entries. Remove the links first."
    )
  }

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) {
    throw new CrmInquiryNotFoundError()
  }
}
