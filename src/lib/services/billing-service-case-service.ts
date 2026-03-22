import type { PrismaClient, BillingServiceCaseStatus } from "@/generated/prisma/client"
import * as repo from "./billing-service-case-repository"
import * as numberSeqService from "./number-sequence-service"
import * as orderService from "./order-service"
import * as billingDocService from "./billing-document-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class BillingServiceCaseNotFoundError extends Error {
  constructor(message = "Service case not found") {
    super(message)
    this.name = "BillingServiceCaseNotFoundError"
  }
}

export class BillingServiceCaseValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingServiceCaseValidationError"
  }
}

export class BillingServiceCaseConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingServiceCaseConflictError"
  }
}

// --- Helpers ---

function assertEditable(status: BillingServiceCaseStatus) {
  if (status === "CLOSED" || status === "INVOICED") {
    throw new BillingServiceCaseValidationError(
      "Service case cannot be modified in status " + status
    )
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: BillingServiceCaseStatus
    addressId?: string
    assignedToId?: string
    search?: string
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
  const sc = await repo.findById(prisma, tenantId, id)
  if (!sc) throw new BillingServiceCaseNotFoundError()
  return sc
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    title: string
    addressId: string
    contactId?: string
    inquiryId?: string
    description?: string
    assignedToId?: string
    customerNotifiedCost?: boolean
    reportedAt?: Date
  },
  createdById: string,
  audit?: AuditContext
) {
  // Validate address belongs to tenant
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
  })
  if (!address) {
    throw new BillingServiceCaseValidationError("Address not found in this tenant")
  }

  // Validate contact belongs to address (if provided)
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.addressId, tenantId },
    })
    if (!contact) {
      throw new BillingServiceCaseValidationError("Contact not found for this address")
    }
  }

  // Validate inquiry belongs to tenant (if provided)
  if (input.inquiryId) {
    const inquiry = await prisma.crmInquiry.findFirst({
      where: { id: input.inquiryId, tenantId },
    })
    if (!inquiry) {
      throw new BillingServiceCaseValidationError("Inquiry not found in this tenant")
    }
  }

  // Generate number
  const number = await numberSeqService.getNextNumber(prisma, tenantId, "service_case")

  // Determine initial status
  const status: BillingServiceCaseStatus = input.assignedToId ? "IN_PROGRESS" : "OPEN"

  const created = await repo.create(prisma, {
    tenantId,
    number,
    title: input.title,
    addressId: input.addressId,
    contactId: input.contactId || null,
    inquiryId: input.inquiryId || null,
    status,
    reportedAt: input.reportedAt || new Date(),
    customerNotifiedCost: input.customerNotifiedCost ?? false,
    assignedToId: input.assignedToId || null,
    description: input.description || null,
    createdById,
  })

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "billing_service_case",
      entityId: created.id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

const SERVICE_CASE_TRACKED_FIELDS = [
  "title", "contactId", "description", "assignedToId", "customerNotifiedCost", "status",
]

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    title?: string
    contactId?: string | null
    description?: string | null
    assignedToId?: string | null
    customerNotifiedCost?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new BillingServiceCaseNotFoundError()

  assertEditable(existing.status)

  const data: Record<string, unknown> = {}
  const fields = [
    "title", "contactId", "description", "assignedToId", "customerNotifiedCost",
  ] as const

  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) return existing

  // Auto-transition: OPEN -> IN_PROGRESS on first meaningful update
  if (existing.status === "OPEN") {
    data.status = "IN_PROGRESS"
  }

  const updated = await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, SERVICE_CASE_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_service_case",
      entityId: input.id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function close(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  closingReason: string,
  closedById: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingServiceCaseNotFoundError()

  if (existing.status === "CLOSED" || existing.status === "INVOICED") {
    throw new BillingServiceCaseValidationError(
      "Service case is already closed or invoiced"
    )
  }

  const updated = await repo.update(prisma, tenantId, id, {
    status: "CLOSED",
    closingReason,
    closedAt: new Date(),
    closedById,
  })

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, SERVICE_CASE_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_service_case",
      entityId: id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function createInvoice(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  positions: Array<{
    description: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    vatRate?: number
  }>,
  createdById: string,
  audit: AuditContext
) {
  // Wrap read-create-link in transaction to prevent concurrent invoice creation
  // and ensure partial failures roll back (no orphaned documents)
  const updated = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    const existing = await repo.findById(txPrisma, tenantId, id)
    if (!existing) throw new BillingServiceCaseNotFoundError()

    if (existing.status !== "CLOSED") {
      throw new BillingServiceCaseValidationError(
        "Invoice can only be created from a CLOSED service case"
      )
    }

    if (existing.invoiceDocumentId) {
      throw new BillingServiceCaseConflictError(
        "Service case already has a linked invoice"
      )
    }

    // Create BillingDocument of type INVOICE
    const invoice = await billingDocService.create(
      txPrisma,
      tenantId,
      {
        type: "INVOICE",
        addressId: existing.addressId,
        contactId: existing.contactId || undefined,
      },
      createdById,
      audit
    )

    // Add positions to the invoice
    for (const pos of positions) {
      await billingDocService.addPosition(txPrisma, tenantId, {
        documentId: invoice.id,
        type: "FREE",
        description: pos.description,
        quantity: pos.quantity,
        unit: pos.unit,
        unitPrice: pos.unitPrice,
        flatCosts: pos.flatCosts,
        vatRate: pos.vatRate,
      }, audit)
    }

    // Update service case
    return repo.update(txPrisma, tenantId, id, {
      invoiceDocumentId: invoice.id,
      status: "INVOICED",
    })
  })

  return updated
}

export async function createOrder(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  params: {
    orderName?: string
    orderDescription?: string
  },
  createdById: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingServiceCaseNotFoundError()

  assertEditable(existing.status)

  if (existing.orderId) {
    throw new BillingServiceCaseConflictError(
      "Service case already has a linked order"
    )
  }

  // Get address for customer name
  const address = await prisma.crmAddress.findFirst({
    where: { id: existing.addressId, tenantId },
  })

  const newOrder = await orderService.create(prisma, tenantId, {
    code: existing.number,
    name: params.orderName || existing.title,
    description: params.orderDescription,
    customer: address?.company || undefined,
    status: "active",
  })

  const updated = await repo.update(prisma, tenantId, id, { orderId: newOrder.id })

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, SERVICE_CASE_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_service_case",
      entityId: id, entityName: null, changes,
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
  if (!existing) throw new BillingServiceCaseNotFoundError()

  assertEditable(existing.status)

  if (existing.invoiceDocumentId) {
    throw new BillingServiceCaseValidationError(
      "Cannot delete service case with linked invoice"
    )
  }

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) throw new BillingServiceCaseNotFoundError()

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "billing_service_case",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
