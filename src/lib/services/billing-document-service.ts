import type { PrismaClient, BillingDocumentType, BillingDocumentStatus } from "@/generated/prisma/client"
import * as repo from "./billing-document-repository"
import * as numberSeqService from "./number-sequence-service"
import * as orderService from "./order-service"
import * as templateRepo from "./billing-document-template-repository"
import * as pdfService from "./billing-document-pdf-service"

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
  const positions = await repo.findPositions(prisma, documentId)

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
  createdById: string
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

  // Generate number for document type
  const seqKey = NUMBER_SEQUENCE_KEYS[input.type]
  const number = await numberSeqService.getNextNumber(prisma, tenantId, seqKey)

  // Pre-fill payment terms from address defaults
  const paymentTermDays = input.paymentTermDays ?? address.paymentTermDays ?? null
  const discountPercent = input.discountPercent ?? address.discountPercent ?? null
  const discountDays = input.discountDays ?? address.discountDays ?? null

  // Auto-apply default template if no text provided
  let headerText = input.headerText || null
  let footerText = input.footerText || null
  if (!headerText && !footerText) {
    const defaultTemplate = await templateRepo.findDefault(prisma, tenantId, input.type)
    if (defaultTemplate) {
      headerText = defaultTemplate.headerText
      footerText = defaultTemplate.footerText
    }
  }

  return repo.create(prisma, {
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
  }
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new BillingDocumentNotFoundError()

  assertDraft(existing.status)

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

  if (Object.keys(data).length === 0) return existing

  return repo.update(prisma, tenantId, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  assertDraft(existing.status)

  // Check for child documents
  const childCount = await repo.countChildDocuments(prisma, tenantId, id)
  if (childCount > 0) {
    throw new BillingDocumentValidationError(
      "Cannot delete document with forwarded child documents"
    )
  }

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) throw new BillingDocumentNotFoundError()
}

export async function finalize(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  finalizedById: string,
  orderParams?: {
    orderName: string
    orderDescription?: string
  }
) {
  const existing = await repo.findById(prisma, tenantId, id)
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
    const newOrder = await orderService.create(prisma, tenantId, {
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

  const result = await repo.update(prisma, tenantId, id, updateData)

  // Generate PDF on finalization
  try {
    await pdfService.generateAndStorePdf(prisma, tenantId, id)
  } catch {
    // PDF generation failure should not block finalization
    console.error(`PDF generation failed for document ${id}`)
  }

  return result
}

export async function forward(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  targetType: BillingDocumentType,
  createdById: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
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
  const number = await numberSeqService.getNextNumber(prisma, tenantId, seqKey)

  // Create child document inheriting header fields
  const newDoc = await repo.create(prisma, {
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

  // Copy positions
  if (existing.positions && existing.positions.length > 0) {
    for (const pos of existing.positions) {
      await repo.createPosition(prisma, {
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
      })
    }
  }

  // Recalculate totals on new document
  await recalculateTotals(prisma, tenantId, newDoc.id)

  // Update source document status
  await repo.update(prisma, tenantId, existing.id, {
    status: "FORWARDED",
  })

  // Return the new document with positions
  return repo.findById(prisma, tenantId, newDoc.id)
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason?: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  if (existing.status === "CANCELLED") {
    throw new BillingDocumentConflictError("Document is already cancelled")
  }

  if (existing.status === "FORWARDED") {
    throw new BillingDocumentValidationError(
      "Cannot cancel a fully forwarded document"
    )
  }

  const data: Record<string, unknown> = { status: "CANCELLED" }
  if (reason) data.internalNotes = reason

  return repo.update(prisma, tenantId, id, data)
}

export async function duplicate(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  createdById: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  // Generate new number for same type
  const seqKey = NUMBER_SEQUENCE_KEYS[existing.type]
  const number = await numberSeqService.getNextNumber(prisma, tenantId, seqKey)

  // Create copy as DRAFT
  const newDoc = await repo.create(prisma, {
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

  // Copy positions
  if (existing.positions && existing.positions.length > 0) {
    for (const pos of existing.positions) {
      await repo.createPosition(prisma, {
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
      })
    }
  }

  // Recalculate totals
  await recalculateTotals(prisma, tenantId, newDoc.id)

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
  }
) {
  // Verify document exists and is DRAFT
  const doc = await repo.findById(prisma, tenantId, input.documentId)
  if (!doc) throw new BillingDocumentNotFoundError()
  assertDraft(doc.status)

  // Get next sort order
  const maxSort = await repo.getMaxSortOrder(prisma, input.documentId)

  // Calculate total price
  const totalPrice = calculatePositionTotal(input.quantity, input.unitPrice, input.flatCosts)

  const position = await repo.createPosition(prisma, {
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
  await recalculateTotals(prisma, tenantId, input.documentId)

  return position
}

export async function updatePosition(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    description?: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    priceType?: string
    vatRate?: number
    deliveryDate?: Date | null
    confirmedDate?: Date | null
  }
) {
  // Find position and verify parent doc is DRAFT
  const pos = await repo.findPositionById(prisma, input.id)
  if (!pos) throw new BillingDocumentValidationError("Position not found")
  if (!pos.document) throw new BillingDocumentNotFoundError()
  if (pos.document.tenantId !== tenantId) throw new BillingDocumentNotFoundError()
  assertDraft(pos.document.status)

  const data: Record<string, unknown> = {}
  const fields = [
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

  if (Object.keys(data).length === 0) return pos

  const updated = await repo.updatePosition(prisma, input.id, data)

  // Recalculate document totals
  await recalculateTotals(prisma, tenantId, pos.document.id)

  return updated
}

export async function deletePosition(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const pos = await repo.findPositionById(prisma, id)
  if (!pos) throw new BillingDocumentValidationError("Position not found")
  if (!pos.document) throw new BillingDocumentNotFoundError()
  if (pos.document.tenantId !== tenantId) throw new BillingDocumentNotFoundError()
  assertDraft(pos.document.status)

  const documentId = pos.document.id
  const deleted = await repo.deletePosition(prisma, id)
  if (!deleted) throw new BillingDocumentValidationError("Position not found")

  // Recalculate document totals
  await recalculateTotals(prisma, tenantId, documentId)
}

export async function reorderPositions(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  positionIds: string[]
) {
  const doc = await repo.findById(prisma, tenantId, documentId)
  if (!doc) throw new BillingDocumentNotFoundError()
  assertDraft(doc.status)

  // Update sort order for each position
  for (let i = 0; i < positionIds.length; i++) {
    await repo.updatePosition(prisma, positionIds[i]!, { sortOrder: i + 1 })
  }

  return repo.findPositions(prisma, documentId)
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

  return repo.findPositions(prisma, documentId)
}
