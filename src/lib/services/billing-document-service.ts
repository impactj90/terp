import type { PrismaClient, BillingDocumentType, BillingDocumentStatus } from "@/generated/prisma/client"
import * as repo from "./billing-document-repository"
import * as numberSeqService from "./number-sequence-service"
import * as orderService from "./order-service"
import * as templateRepo from "./billing-document-template-repository"
import * as pdfService from "./billing-document-pdf-service"
import * as eInvoiceService from "./billing-document-einvoice-service"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import * as systemSettingsService from "./system-settings-service"

// --- Template Placeholder Resolution ---

/**
 * Resolve template placeholders (e.g. {{briefanrede}}, {{letterSalutation}})
 * with contact and address data. Supports both German and English placeholder names.
 */
export function resolveTemplatePlaceholders(
  html: string,
  address?: { company?: string | null } | null,
  contact?: {
    firstName?: string | null
    lastName?: string | null
    salutation?: string | null
    title?: string | null
    letterSalutation?: string | null
  } | null,
): string {
  const placeholders: Record<string, string> = {
    // German
    briefanrede: contact?.letterSalutation || 'Sehr geehrte Damen und Herren,',
    anrede: contact?.salutation ?? '',
    titel: contact?.title ?? '',
    vorname: contact?.firstName ?? '',
    nachname: contact?.lastName ?? '',
    firma: address?.company ?? '',
    // English
    lettersalutation: contact?.letterSalutation || 'Dear Sir or Madam,',
    salutation: contact?.salutation ?? '',
    title: contact?.title ?? '',
    firstname: contact?.firstName ?? '',
    lastname: contact?.lastName ?? '',
    company: address?.company ?? '',
  }

  return html.replace(/\{\{(\w+)\}\}/gi, (_match, key: string) => {
    const val = placeholders[key.toLowerCase()]
    return val !== undefined ? val : _match
  })
}

// --- Error Classes ---

export class BillingDocumentNotFoundError extends Error {
  constructor(message = "Billing document not found") {
    super(message)
    this.name = "BillingDocumentNotFoundError"
  }
}

export class BillingDocumentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentValidationError"
  }
}

export class BillingDocumentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentConflictError"
  }
}

// --- Constants ---

const NUMBER_SEQUENCE_KEYS: Record<BillingDocumentType, string> = {
  OFFER: "offer",
  ORDER_CONFIRMATION: "order_confirmation",
  DELIVERY_NOTE: "delivery_note",
  SERVICE_NOTE: "service_note",
  RETURN_DELIVERY: "return_delivery",
  INVOICE: "invoice",
  CREDIT_NOTE: "credit_note",
}

export const FORWARDING_RULES: Record<BillingDocumentType, BillingDocumentType[]> = {
  OFFER: ["ORDER_CONFIRMATION"],
  ORDER_CONFIRMATION: ["DELIVERY_NOTE", "SERVICE_NOTE"],
  DELIVERY_NOTE: ["INVOICE"],
  SERVICE_NOTE: ["INVOICE"],
  RETURN_DELIVERY: ["CREDIT_NOTE"],
  INVOICE: [],
  CREDIT_NOTE: [],
}

// --- Helper: ensure document is DRAFT ---

function assertDraft(status: BillingDocumentStatus) {
  if (status !== "DRAFT") {
    throw new BillingDocumentValidationError(
      "Document can only be modified in DRAFT status"
    )
  }
}

// --- Helper: recalculate document totals ---

export async function recalculateTotals(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  const positions = await repo.findPositions(prisma, tenantId, documentId)

  let subtotalNet = 0
  const vatMap = new Map<number, number>()

  for (const pos of positions) {
    if (pos.totalPrice != null) {
      subtotalNet += pos.totalPrice
      if (pos.vatRate != null && pos.vatRate > 0) {
        const vatAmount = pos.totalPrice * (pos.vatRate / 100)
        vatMap.set(pos.vatRate, (vatMap.get(pos.vatRate) ?? 0) + vatAmount)
      }
    }
  }

  let totalVat = 0
  for (const amount of vatMap.values()) {
    totalVat += amount
  }

  const totalGross = subtotalNet + totalVat

  // Round to 2 decimal places
  const data = {
    subtotalNet: Math.round(subtotalNet * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
  }

  await prisma.billingDocument.updateMany({
    where: { id: documentId, tenantId },
    data,
  })

  return data
}

// --- Helper: calculate position totalPrice ---

function calculatePositionTotal(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
  flatCosts: number | null | undefined
): number | null {
  const qty = quantity ?? 0
  const price = unitPrice ?? 0
  const flat = flatCosts ?? 0

  if (qty === 0 && price === 0 && flat === 0) return null

  return Math.round((qty * price + flat) * 100) / 100
}

// --- Audit tracked fields ---

const DOCUMENT_TRACKED_FIELDS = [
  "contactId", "documentDate", "deliveryDate",
  "headerText", "footerText", "subject", "status",
]

const POSITION_TRACKED_FIELDS = [
  "description", "quantity", "unitPrice", "discount", "sortOrder",
]

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    type?: BillingDocumentType
    status?: BillingDocumentStatus
    addressId?: string
    inquiryId?: string
    search?: string
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
  const doc = await repo.findById(prisma, tenantId, id)
  if (!doc) throw new BillingDocumentNotFoundError()
  return doc
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    type: BillingDocumentType
    addressId: string
    contactId?: string
    deliveryAddressId?: string
    invoiceAddressId?: string
    inquiryId?: string
    orderId?: string
    orderDate?: Date
    documentDate?: Date
    deliveryDate?: Date
    deliveryType?: string
    deliveryTerms?: string
    paymentTermDays?: number
    discountPercent?: number
    discountDays?: number
    discountPercent2?: number
    discountDays2?: number
    shippingCostNet?: number
    shippingCostVatRate?: number
    notes?: string
    internalNotes?: string
    headerText?: string
    footerText?: string
  },
  createdById: string,
  audit: AuditContext
) {
  // Validate address belongs to tenant
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
  })
  if (!address) {
    throw new BillingDocumentValidationError("Address not found in this tenant")
  }

  // Validate contact belongs to address (if provided)
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.addressId, tenantId },
    })
    if (!contact) {
      throw new BillingDocumentValidationError("Contact not found for this address")
    }
  }

  // Validate delivery address (if provided)
  if (input.deliveryAddressId) {
    const deliveryAddr = await prisma.crmAddress.findFirst({
      where: { id: input.deliveryAddressId, tenantId },
    })
    if (!deliveryAddr) {
      throw new BillingDocumentValidationError("Delivery address not found in this tenant")
    }
  }

  // Validate invoice address (if provided)
  if (input.invoiceAddressId) {
    const invoiceAddr = await prisma.crmAddress.findFirst({
      where: { id: input.invoiceAddressId, tenantId },
    })
    if (!invoiceAddr) {
      throw new BillingDocumentValidationError("Invoice address not found in this tenant")
    }
  }

  // Pre-fill payment terms from address defaults
  const paymentTermDays = input.paymentTermDays ?? address.paymentTermDays ?? null
  const discountPercent = input.discountPercent ?? address.discountPercent ?? null
  const discountDays = input.discountDays ?? address.discountDays ?? null

  // Wrap number generation + document creation in a transaction
  // so a failed create doesn't consume a sequence number
  const created = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // Generate number for document type
    const seqKey = NUMBER_SEQUENCE_KEYS[input.type]
    const number = await numberSeqService.getNextNumber(txPrisma, tenantId, seqKey)

    // Auto-apply default template if no text provided
    let headerText = input.headerText || null
    let footerText = input.footerText || null
    if (!headerText && !footerText) {
      const defaultTemplate = await templateRepo.findDefault(txPrisma, tenantId, input.type)
      if (defaultTemplate) {
        // Resolve placeholders with contact + address data
        const contact = input.contactId
          ? await txPrisma.crmContact.findFirst({ where: { id: input.contactId, tenantId } })
          : null
        headerText = defaultTemplate.headerText
          ? resolveTemplatePlaceholders(defaultTemplate.headerText, address, contact)
          : null
        footerText = defaultTemplate.footerText
          ? resolveTemplatePlaceholders(defaultTemplate.footerText, address, contact)
          : null
      }
    }

    return repo.create(txPrisma, {
      tenantId,
      number,
      type: input.type,
      addressId: input.addressId,
      contactId: input.contactId || null,
      deliveryAddressId: input.deliveryAddressId || null,
      invoiceAddressId: input.invoiceAddressId || null,
      inquiryId: input.inquiryId || null,
      orderId: input.orderId || null,
      orderDate: input.orderDate || null,
      documentDate: input.documentDate || new Date(),
      deliveryDate: input.deliveryDate || null,
      deliveryType: input.deliveryType || null,
      deliveryTerms: input.deliveryTerms || null,
      paymentTermDays,
      discountPercent,
      discountDays,
      discountPercent2: input.discountPercent2 ?? null,
      discountDays2: input.discountDays2 ?? null,
      shippingCostNet: input.shippingCostNet ?? null,
      shippingCostVatRate: input.shippingCostVatRate ?? null,
      notes: input.notes || null,
      internalNotes: input.internalNotes || null,
      headerText,
      footerText,
      createdById,
    })
  })

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "create",
    entityType: "billing_document",
    entityId: created.id,
    entityName: created.number || "DRAFT",
    changes: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    contactId?: string | null
    deliveryAddressId?: string | null
    invoiceAddressId?: string | null
    inquiryId?: string | null
    orderDate?: Date | null
    documentDate?: Date
    deliveryDate?: Date | null
    deliveryType?: string | null
    deliveryTerms?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    discountPercent2?: number | null
    discountDays2?: number | null
    shippingCostNet?: number | null
    shippingCostVatRate?: number | null
    notes?: string | null
    internalNotes?: string | null
    headerText?: string | null
    footerText?: string | null
  },
  audit: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new BillingDocumentNotFoundError()

  const data: Record<string, unknown> = {}
  const fields = [
    "contactId", "deliveryAddressId", "invoiceAddressId",
    "inquiryId",
    "orderDate", "documentDate", "deliveryDate",
    "deliveryType", "deliveryTerms",
    "paymentTermDays", "discountPercent", "discountDays",
    "discountPercent2", "discountDays2",
    "shippingCostNet", "shippingCostVatRate",
    "notes", "internalNotes",
    "headerText", "footerText",
  ] as const

  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) {
    // Still enforce DRAFT check even for no-op
    assertDraft(existing.status)
    return existing
  }

  // Atomic DRAFT guard: only update if still in DRAFT status
  const { count } = await prisma.billingDocument.updateMany({
    where: { id: input.id, tenantId, status: "DRAFT" },
    data,
  })
  if (count === 0) {
    // Distinguish not-found from wrong-status
    if (existing.status !== "DRAFT") {
      throw new BillingDocumentValidationError(
        "Document can only be modified in DRAFT status"
      )
    }
    throw new BillingDocumentConflictError(
      "Document status changed concurrently"
    )
  }

  const updated = await repo.findById(prisma, tenantId, input.id)

  // Never throws — audit failures must not block the actual operation
  if (updated) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      DOCUMENT_TRACKED_FIELDS,
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "billing_document",
      entityId: updated.id,
      entityName: (updated as unknown as { number?: string }).number || "DRAFT",
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
  audit: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  // Wrap child-count check + delete in transaction with atomic DRAFT guard
  await prisma.$transaction(async (tx) => {
    // Atomic DRAFT guard
    const { count: draftCount } = await tx.billingDocument.updateMany({
      where: { id, tenantId, status: "DRAFT" },
      data: { updatedAt: new Date() }, // no-op write to lock the row
    })
    if (draftCount === 0) {
      throw new BillingDocumentValidationError(
        "Document can only be modified in DRAFT status"
      )
    }

    // Check for child documents (inside transaction so it's atomic)
    const childCount = await tx.billingDocument.count({
      where: { tenantId, parentDocumentId: id },
    })
    if (childCount > 0) {
      throw new BillingDocumentValidationError(
        "Cannot delete document with forwarded child documents"
      )
    }

    // Delete positions first, then document
    await tx.billingDocumentPosition.deleteMany({
      where: { documentId: id },
    })
    const { count } = await tx.billingDocument.deleteMany({
      where: { id, tenantId },
    })
    if (count === 0) throw new BillingDocumentNotFoundError()
  })

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "delete",
    entityType: "billing_document",
    entityId: id,
    entityName: (existing as unknown as { number?: string }).number || "DRAFT",
    changes: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}

export async function finalize(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  finalizedById: string,
  orderParams?: {
    orderName: string
    orderDescription?: string
  },
  audit?: AuditContext
) {
  // Wrap status check + Order creation + status update in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    const existing = await repo.findById(txPrisma, tenantId, id)
    if (!existing) throw new BillingDocumentNotFoundError()

    if (existing.status !== "DRAFT") {
      throw new BillingDocumentValidationError(
        "Only DRAFT documents can be finalized"
      )
    }

    // Must have at least one position
    if (!existing.positions || existing.positions.length === 0) {
      throw new BillingDocumentValidationError(
        "Document must have at least one position before finalizing"
      )
    }

    // For ORDER_CONFIRMATION: create a linked Terp Order for time tracking
    let orderId: string | undefined
    if (existing.type === "ORDER_CONFIRMATION" && orderParams?.orderName) {
      const customerName = (existing as unknown as { address?: { company?: string } }).address?.company
      const newOrder = await orderService.create(txPrisma, tenantId, {
        code: existing.number,
        name: orderParams.orderName,
        description: orderParams.orderDescription,
        customer: customerName || undefined,
        status: "active",
      })
      orderId = newOrder.id
    }

    const updateData: Record<string, unknown> = {
      status: "PRINTED",
      printedAt: new Date(),
      printedById: finalizedById,
    }
    if (orderId) {
      updateData.orderId = orderId
    }

    return repo.update(txPrisma, tenantId, id, updateData)
  })

  // Generate PDF on finalization (best-effort, OUTSIDE transaction)
  let pdfGenerated = false
  try {
    await pdfService.generateAndStorePdf(prisma, tenantId, id)
    pdfGenerated = true
  } catch (err) {
    // PDF generation failure should not block finalization
    console.error(`PDF generation failed for document ${id}`, err)
  }

  // Generate E-Invoice XML on finalization (after PDF — requires PDF in storage)
  // Use result.type since `existing` was scoped to the transaction closure
  if (result && pdfGenerated) {
    const docType = (result as unknown as { type?: string }).type
    if (docType === "INVOICE" || docType === "CREDIT_NOTE") {
      const config = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)
      if (config?.eInvoiceEnabled) {
        try {
          await eInvoiceService.generateAndStoreEInvoice(prisma, tenantId, id)
        } catch (err) {
          console.error(`E-Invoice generation failed for document ${id}`, err)
        }
      }
    }
  }

  // AUTO stock booking for DELIVERY_NOTE (best-effort, outside transaction)
  let stockBookingResult: { bookedCount: number } | null = null
  const docType = (result as unknown as { type?: string }).type
  if (docType === "DELIVERY_NOTE") {
    try {
      const settings = await systemSettingsService.get(prisma, tenantId)
      const mode = (settings as unknown as { deliveryNoteStockMode?: string }).deliveryNoteStockMode
      if (mode === "AUTO") {
        stockBookingResult = await createDeliveryNoteStockBookings(
          prisma, tenantId, id, null, finalizedById, audit
        )
      }
    } catch (err) {
      console.error(`Auto stock booking failed for delivery note ${id}`, err)
    }
  }

  // Never throws — audit failures must not block the actual operation
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "finalize",
      entityType: "billing_document",
      entityId: id,
      entityName: (result as unknown as { number?: string })?.number || "DRAFT",
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  if (stockBookingResult) {
    ;(result as Record<string, unknown>).stockBookingResult = stockBookingResult
  }

  return result
}

export async function forward(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  targetType: BillingDocumentType,
  createdById: string,
  audit: AuditContext
) {
  const { newDoc, number } = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    const existing = await repo.findById(txPrisma, tenantId, id)
    if (!existing) throw new BillingDocumentNotFoundError()

    // Must be finalized to forward
    if (existing.status !== "PRINTED" && existing.status !== "PARTIALLY_FORWARDED") {
      throw new BillingDocumentValidationError(
        "Only finalized or partially forwarded documents can be forwarded"
      )
    }

    // Validate forwarding rule
    const allowedTargets = FORWARDING_RULES[existing.type]
    if (!allowedTargets.includes(targetType)) {
      throw new BillingDocumentValidationError(
        `Cannot forward ${existing.type} to ${targetType}. Allowed: ${allowedTargets.join(", ") || "none"}`
      )
    }

    // Generate number for target type
    const seqKey = NUMBER_SEQUENCE_KEYS[targetType]
    const number = await numberSeqService.getNextNumber(txPrisma, tenantId, seqKey)

    // Create child document inheriting header fields
    const newDoc = await repo.create(txPrisma, {
      tenantId,
      number,
      type: targetType,
      addressId: existing.addressId,
      contactId: existing.contactId,
      deliveryAddressId: existing.deliveryAddressId,
      invoiceAddressId: existing.invoiceAddressId,
      inquiryId: existing.inquiryId,
      orderId: existing.orderId,
      parentDocumentId: existing.id,
      orderDate: existing.orderDate,
      documentDate: new Date(),
      deliveryDate: existing.deliveryDate,
      deliveryType: existing.deliveryType,
      deliveryTerms: existing.deliveryTerms,
      paymentTermDays: existing.paymentTermDays,
      discountPercent: existing.discountPercent,
      discountDays: existing.discountDays,
      discountPercent2: existing.discountPercent2,
      discountDays2: existing.discountDays2,
      shippingCostNet: existing.shippingCostNet,
      shippingCostVatRate: existing.shippingCostVatRate,
      notes: existing.notes,
      internalNotes: existing.internalNotes,
      headerText: existing.headerText,
      footerText: existing.footerText,
      createdById,
    })

    // Copy positions (batch insert)
    if (existing.positions && existing.positions.length > 0) {
      await repo.createManyPositions(txPrisma, existing.positions.map(pos => ({
        documentId: newDoc.id,
        sortOrder: pos.sortOrder,
        type: pos.type,
        articleId: pos.articleId,
        articleNumber: pos.articleNumber,
        description: pos.description,
        quantity: pos.quantity,
        unit: pos.unit,
        unitPrice: pos.unitPrice,
        flatCosts: pos.flatCosts,
        totalPrice: pos.totalPrice,
        priceType: pos.priceType,
        vatRate: pos.vatRate,
        deliveryDate: pos.deliveryDate,
        confirmedDate: pos.confirmedDate,
      })))
    }

    // Recalculate totals on new document
    await recalculateTotals(txPrisma, tenantId, newDoc.id)

    // Update source document status
    await repo.update(txPrisma, tenantId, existing.id, {
      status: "FORWARDED",
    })

    return { newDoc, number }
  })

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "forward",
    entityType: "billing_document",
    entityId: newDoc.id,
    entityName: number || "DRAFT",
    changes: null,
    metadata: { forwardedFrom: id, targetType },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  // Return the new document with positions
  return repo.findById(prisma, tenantId, newDoc.id)
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason?: string,
  audit?: AuditContext
) {
  // Atomic status guard: only cancel if not already CANCELLED or FORWARDED
  const data: Record<string, unknown> = { status: "CANCELLED" }
  if (reason) data.internalNotes = reason

  const { count } = await prisma.billingDocument.updateMany({
    where: {
      id,
      tenantId,
      status: { notIn: ["CANCELLED", "FORWARDED"] },
    },
    data,
  })

  if (count === 0) {
    // Distinguish not-found from wrong-status
    const existing = await prisma.billingDocument.findFirst({
      where: { id, tenantId },
      select: { status: true },
    })
    if (!existing) throw new BillingDocumentNotFoundError()
    if (existing.status === "CANCELLED") {
      throw new BillingDocumentConflictError("Document is already cancelled")
    }
    if (existing.status === "FORWARDED") {
      throw new BillingDocumentValidationError(
        "Cannot cancel a fully forwarded document"
      )
    }
    // Defensive: unexpected status that also blocks cancel
    throw new BillingDocumentConflictError(
      `Document status changed concurrently (current: ${existing.status})`
    )
  }

  // Fetch updated document for return value and audit
  const updated = await repo.findById(prisma, tenantId, id)

  // Never throws — audit failures must not block the actual operation
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "cancel",
      entityType: "billing_document",
      entityId: id,
      entityName: (updated as unknown as { number?: string })?.number || "DRAFT",
      changes: null,
      metadata: reason ? { reason } : undefined,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function duplicate(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  createdById: string,
  audit: AuditContext
) {
  const { newDoc, number } = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    const existing = await repo.findById(txPrisma, tenantId, id)
    if (!existing) throw new BillingDocumentNotFoundError()

    // Generate new number for same type
    const seqKey = NUMBER_SEQUENCE_KEYS[existing.type]
    const number = await numberSeqService.getNextNumber(txPrisma, tenantId, seqKey)

    // Create copy as DRAFT
    const newDoc = await repo.create(txPrisma, {
      tenantId,
      number,
      type: existing.type,
      addressId: existing.addressId,
      contactId: existing.contactId,
      deliveryAddressId: existing.deliveryAddressId,
      invoiceAddressId: existing.invoiceAddressId,
      inquiryId: existing.inquiryId,
      orderId: existing.orderId,
      parentDocumentId: null,
      orderDate: existing.orderDate,
      documentDate: new Date(),
      deliveryDate: existing.deliveryDate,
      deliveryType: existing.deliveryType,
      deliveryTerms: existing.deliveryTerms,
      paymentTermDays: existing.paymentTermDays,
      discountPercent: existing.discountPercent,
      discountDays: existing.discountDays,
      discountPercent2: existing.discountPercent2,
      discountDays2: existing.discountDays2,
      shippingCostNet: existing.shippingCostNet,
      shippingCostVatRate: existing.shippingCostVatRate,
      notes: existing.notes,
      internalNotes: existing.internalNotes,
      headerText: existing.headerText,
      footerText: existing.footerText,
      createdById,
    })

    // Copy positions (batch insert)
    if (existing.positions && existing.positions.length > 0) {
      await repo.createManyPositions(txPrisma, existing.positions.map(pos => ({
        documentId: newDoc.id,
        sortOrder: pos.sortOrder,
        type: pos.type,
        articleId: pos.articleId,
        articleNumber: pos.articleNumber,
        description: pos.description,
        quantity: pos.quantity,
        unit: pos.unit,
        unitPrice: pos.unitPrice,
        flatCosts: pos.flatCosts,
        totalPrice: pos.totalPrice,
        priceType: pos.priceType,
        vatRate: pos.vatRate,
        deliveryDate: pos.deliveryDate,
        confirmedDate: pos.confirmedDate,
      })))
    }

    // Recalculate totals
    await recalculateTotals(txPrisma, tenantId, newDoc.id)

    return { newDoc, number }
  })

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "create",
    entityType: "billing_document",
    entityId: newDoc.id,
    entityName: number || "DRAFT",
    changes: null,
    metadata: { duplicatedFrom: id },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  return repo.findById(prisma, tenantId, newDoc.id)
}

// --- Position Operations ---

export async function addPosition(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    documentId: string
    type: string
    articleId?: string
    articleNumber?: string
    description?: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    priceType?: string
    vatRate?: number
    deliveryDate?: Date
    confirmedDate?: Date
  },
  audit: AuditContext
) {
  // Calculate total price (pure computation, can stay outside transaction)
  const totalPrice = calculatePositionTotal(input.quantity, input.unitPrice, input.flatCosts)

  // Wrap read-sortOrder-create-recalculate in a transaction
  const { position, docNumber } = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // Verify document exists and is DRAFT
    const doc = await repo.findById(txPrisma, tenantId, input.documentId)
    if (!doc) throw new BillingDocumentNotFoundError()
    assertDraft(doc.status)

    // Get next sort order (atomic within this transaction)
    const maxSort = await repo.getMaxSortOrder(txPrisma, tenantId, input.documentId)

    const position = await repo.createPosition(txPrisma, {
      documentId: input.documentId,
      sortOrder: maxSort + 1,
      type: input.type,
      articleId: input.articleId || null,
      articleNumber: input.articleNumber || null,
      description: input.description || null,
      quantity: input.quantity ?? null,
      unit: input.unit || null,
      unitPrice: input.unitPrice ?? null,
      flatCosts: input.flatCosts ?? null,
      totalPrice,
      priceType: input.priceType || null,
      vatRate: input.vatRate ?? null,
      deliveryDate: input.deliveryDate || null,
      confirmedDate: input.confirmedDate || null,
    })

    // Recalculate document totals
    await recalculateTotals(txPrisma, tenantId, input.documentId)

    return {
      position,
      docNumber: (doc as unknown as { number?: string }).number || "DRAFT",
    }
  })

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "create",
    entityType: "billing_document_position",
    entityId: position.id,
    entityName: docNumber,
    changes: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  return position
}

export async function updatePosition(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    articleId?: string
    articleNumber?: string
    description?: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    priceType?: string
    vatRate?: number
    deliveryDate?: Date | null
    confirmedDate?: Date | null
  },
  audit: AuditContext
) {
  // Pre-fetch position for early validation and audit comparison
  const pos = await repo.findPositionById(prisma, tenantId, input.id)
  if (!pos) throw new BillingDocumentValidationError("Position not found")
  if (!pos.document) throw new BillingDocumentNotFoundError()
  if (pos.document.tenantId !== tenantId) throw new BillingDocumentNotFoundError()

  const data: Record<string, unknown> = {}
  const fields = [
    "articleId", "articleNumber",
    "description", "quantity", "unit", "unitPrice", "flatCosts",
    "priceType", "vatRate", "deliveryDate", "confirmedDate",
  ] as const

  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  // Recalculate totalPrice if relevant fields changed
  if (input.quantity !== undefined || input.unitPrice !== undefined || input.flatCosts !== undefined) {
    const qty = input.quantity ?? pos.quantity
    const price = input.unitPrice ?? pos.unitPrice
    const flat = input.flatCosts ?? pos.flatCosts
    data.totalPrice = calculatePositionTotal(qty, price, flat)
  }

  if (Object.keys(data).length === 0) {
    assertDraft(pos.document.status)
    return pos
  }

  // Wrap DRAFT check + position update + recalculate in transaction
  const updated = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // Atomic DRAFT guard on parent document
    const { count } = await tx.billingDocument.updateMany({
      where: { id: pos.document!.id, tenantId, status: "DRAFT" },
      data: { updatedAt: new Date() },
    })
    if (count === 0) {
      throw new BillingDocumentValidationError(
        "Document can only be modified in DRAFT status"
      )
    }

    const updatedPos = await repo.updatePosition(txPrisma, tenantId, input.id, data)

    // Recalculate document totals
    await recalculateTotals(txPrisma, tenantId, pos.document!.id)

    return updatedPos
  })

  // Never throws — audit failures must not block the actual operation
  if (updated) {
    const changes = auditLog.computeChanges(
      pos as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      POSITION_TRACKED_FIELDS,
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "billing_document_position",
      entityId: updated.id,
      entityName: (pos.document as unknown as { number?: string }).number || "DRAFT",
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function deletePosition(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit: AuditContext
) {
  // Pre-fetch position for early validation and audit info
  const pos = await repo.findPositionById(prisma, tenantId, id)
  if (!pos) throw new BillingDocumentValidationError("Position not found")
  if (!pos.document) throw new BillingDocumentNotFoundError()
  if (pos.document.tenantId !== tenantId) throw new BillingDocumentNotFoundError()

  const documentId = pos.document.id

  // Wrap DRAFT check + delete + recalculate in transaction
  await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // Atomic DRAFT guard on parent document
    const { count: draftCount } = await tx.billingDocument.updateMany({
      where: { id: documentId, tenantId, status: "DRAFT" },
      data: { updatedAt: new Date() },
    })
    if (draftCount === 0) {
      throw new BillingDocumentValidationError(
        "Document can only be modified in DRAFT status"
      )
    }

    const deleted = await repo.deletePosition(txPrisma, tenantId, id)
    if (!deleted) throw new BillingDocumentValidationError("Position not found")

    // Recalculate document totals
    await recalculateTotals(txPrisma, tenantId, documentId)
  })

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "delete",
    entityType: "billing_document_position",
    entityId: id,
    entityName: (pos.document as unknown as { number?: string }).number || "DRAFT",
    changes: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}

export async function reorderPositions(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  positionIds: string[]
) {
  const doc = await repo.findById(prisma, tenantId, documentId)
  if (!doc) throw new BillingDocumentNotFoundError()

  // Wrap DRAFT guard + validation + reorder in a single transaction
  await prisma.$transaction(async (tx) => {
    // Atomic DRAFT guard
    const { count } = await tx.billingDocument.updateMany({
      where: { id: documentId, tenantId, status: "DRAFT" },
      data: { updatedAt: new Date() },
    })
    if (count === 0) {
      throw new BillingDocumentValidationError(
        "Document can only be modified in DRAFT status"
      )
    }

    // Validate all position IDs belong to this document + tenant
    const validPositions = await tx.billingDocumentPosition.findMany({
      where: {
        id: { in: positionIds },
        document: { id: documentId, tenantId },
      },
      select: { id: true },
    })

    if (validPositions.length !== positionIds.length) {
      throw new BillingDocumentValidationError(
        "One or more position IDs do not belong to this document"
      )
    }

    // Batch update sort order
    for (let i = 0; i < positionIds.length; i++) {
      await tx.billingDocumentPosition.update({
        where: { id: positionIds[i]! },
        data: { sortOrder: i + 1 },
      })
    }
  })

  return repo.findPositions(prisma, tenantId, documentId)
}

export async function listPositions(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  // Verify document belongs to tenant
  const doc = await prisma.billingDocument.findFirst({
    where: { id: documentId, tenantId },
    select: { id: true },
  })
  if (!doc) throw new BillingDocumentNotFoundError()

  return repo.findPositions(prisma, tenantId, documentId)
}

// --- Delivery Note Stock Booking ---

interface StockBookingPreviewPosition {
  positionId: string
  articleId: string
  articleNumber: string
  articleName: string
  unit: string
  quantity: number
  currentStock: number
  projectedStock: number
  negativeStockWarning: boolean
  stockTrackingEnabled: boolean
}

/**
 * Preview which stock bookings would be created for a delivery note.
 * Returns all ARTICLE positions with their current stock info.
 */
export async function previewDeliveryNoteStockBookings(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
) {
  const doc = await repo.findById(prisma, tenantId, documentId)
  if (!doc) throw new BillingDocumentNotFoundError()

  if ((doc as unknown as { type: string }).type !== "DELIVERY_NOTE") {
    throw new BillingDocumentValidationError(
      "Stock booking preview is only available for DELIVERY_NOTE documents"
    )
  }

  // Filter to ARTICLE positions with articleId and quantity > 0
  const positions = (doc.positions || []).filter((pos: Record<string, unknown>) =>
    pos.articleId != null &&
    typeof pos.quantity === "number" &&
    pos.quantity > 0
  )

  // Collect unique articleIds
  const articleIds = [...new Set(positions.map((pos: Record<string, unknown>) => pos.articleId as string))]

  // Batch-fetch articles
  const articles = articleIds.length > 0
    ? await prisma.whArticle.findMany({
        where: { id: { in: articleIds }, tenantId },
        select: { id: true, number: true, name: true, unit: true, currentStock: true, stockTracking: true },
      })
    : []

  const articleMap = new Map(articles.map(a => [a.id, a]))

  // Build preview
  const previewPositions: StockBookingPreviewPosition[] = positions.map((pos: Record<string, unknown>) => {
    const article = articleMap.get(pos.articleId as string)
    const quantity = pos.quantity as number
    const currentStock = article?.currentStock ?? 0
    const stockTrackingEnabled = article?.stockTracking === true
    const projectedStock = currentStock - quantity

    return {
      positionId: pos.id as string,
      articleId: pos.articleId as string,
      articleNumber: article?.number ?? (pos.articleNumber as string ?? ""),
      articleName: article?.name ?? (pos.description as string ?? ""),
      unit: article?.unit ?? (pos.unit as string ?? ""),
      quantity,
      currentStock,
      projectedStock: stockTrackingEnabled ? projectedStock : currentStock,
      negativeStockWarning: stockTrackingEnabled && projectedStock < 0,
      stockTrackingEnabled,
    }
  })

  return {
    documentId,
    documentNumber: (doc as unknown as { number: string }).number,
    positions: previewPositions,
  }
}

/**
 * Create stock movements for a finalized delivery note.
 * All bookings run in a single transaction. Allows negative stock (no rejection).
 */
export async function createDeliveryNoteStockBookings(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  positionIds: string[] | null, // null = all eligible positions
  userId: string,
  audit?: AuditContext,
) {
  const doc = await repo.findById(prisma, tenantId, documentId)
  if (!doc) throw new BillingDocumentNotFoundError()

  if ((doc as unknown as { type: string }).type !== "DELIVERY_NOTE") {
    throw new BillingDocumentValidationError(
      "Stock bookings can only be created for DELIVERY_NOTE documents"
    )
  }

  if ((doc as unknown as { status: string }).status !== "PRINTED") {
    throw new BillingDocumentValidationError(
      "Stock bookings can only be created for finalized (PRINTED) documents"
    )
  }

  // Filter to ARTICLE positions with articleId and quantity > 0
  let positions = (doc.positions || []).filter((pos: Record<string, unknown>) =>
    pos.articleId != null &&
    typeof pos.quantity === "number" &&
    pos.quantity > 0
  )

  // If positionIds provided, further filter
  if (positionIds !== null) {
    const posIdSet = new Set(positionIds)
    positions = positions.filter((pos: Record<string, unknown>) => posIdSet.has(pos.id as string))
  }

  const docNumber = (doc as unknown as { number: string }).number

  // Run all bookings in a single transaction
  const bookings = await prisma.$transaction(async (tx) => {
    const results: Array<{
      articleId: string
      articleNumber: string
      quantity: number
      previousStock: number
      newStock: number
    }> = []

    for (const pos of positions) {
      const articleId = pos.articleId as string
      const quantity = pos.quantity as number

      // Fetch article
      const article = await tx.whArticle.findFirst({
        where: { id: articleId, tenantId },
      })

      // Skip if article not found or stock tracking disabled
      if (!article || !article.stockTracking) continue

      const previousStock = article.currentStock
      const newStock = previousStock - quantity

      // Create stock movement (negative quantity for withdrawal)
      await (tx as unknown as PrismaClient).whStockMovement.create({
        data: {
          tenantId,
          articleId,
          type: "DELIVERY_NOTE",
          quantity: -quantity,
          previousStock,
          newStock,
          documentId,
          reason: `Lieferschein ${docNumber}`,
          createdById: userId,
        },
      })

      // Update article stock
      await tx.whArticle.update({
        where: { id: articleId },
        data: { currentStock: newStock },
      })

      results.push({
        articleId,
        articleNumber: article.number,
        quantity,
        previousStock,
        newStock,
      })
    }

    return results
  })

  // Audit log (fire-and-forget)
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delivery_note_stock_booking",
      entityType: "billing_document",
      entityId: documentId,
      entityName: docNumber,
      changes: {
        bookedCount: bookings.length,
        bookings: bookings.map(b => ({
          articleNumber: b.articleNumber,
          quantity: b.quantity,
          previousStock: b.previousStock,
          newStock: b.newStock,
        })),
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { bookedCount: bookings.length, bookings }
}
