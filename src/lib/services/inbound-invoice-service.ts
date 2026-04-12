import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./inbound-invoice-repository"
import * as lineItemRepo from "./inbound-invoice-line-item-repository"
import type { LineItemInput } from "./inbound-invoice-line-item-repository"
import * as numberSequenceService from "./number-sequence-service"
import { parsePdfForZugferd } from "./zugferd-parser-service"
import { matchSupplier } from "./inbound-invoice-supplier-matcher"
import * as storage from "@/lib/supabase/storage"
import * as approvalService from "./inbound-invoice-approval-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Constants ---

const BUCKET = "inbound-invoices"
const SIGNED_URL_EXPIRY = 3600 // 1 hour

const MATERIAL_FIELDS = ["totalNet", "totalVat", "totalGross", "supplierId", "dueDate"] as const

const TRACKED_FIELDS = [
  "invoiceNumber", "invoiceDate", "dueDate", "totalNet", "totalVat", "totalGross",
  "supplierId", "orderId", "costCenterId", "paymentTermDays", "notes", "status",
] as const

// --- Error Classes ---

export class InboundInvoiceNotFoundError extends Error {
  constructor(message = "Inbound invoice not found") {
    super(message)
    this.name = "InboundInvoiceNotFoundError"
  }
}

export class InboundInvoiceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InboundInvoiceValidationError"
  }
}

export class InboundInvoiceConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InboundInvoiceConflictError"
  }
}

export class InboundInvoiceDuplicateError extends Error {
  constructor(message = "Duplicate invoice") {
    super(message)
    this.name = "InboundInvoiceDuplicateError"
  }
}

// --- Service Functions ---

export async function createFromUpload(
  prisma: PrismaClient,
  tenantId: string,
  file: Buffer,
  filename: string,
  userId: string,
  audit?: AuditContext
) {
  // 1. Parse for ZUGFeRD
  const zugferdResult = await parsePdfForZugferd(file)
  const parsed = zugferdResult.parsedInvoice

  // 2. Match supplier
  const supplierMatch = await matchSupplier(
    prisma,
    tenantId,
    parsed ?? ({} as Parameters<typeof matchSupplier>[2]),
    null
  )

  // 3. Check duplicate before creating
  if (supplierMatch.supplierId && parsed?.invoiceNumber) {
    const isDup = await repo.checkDuplicateSupplier(
      prisma, tenantId, supplierMatch.supplierId, parsed.invoiceNumber
    )
    if (isDup) {
      throw new InboundInvoiceDuplicateError(
        `Duplicate invoice: supplier already has invoice ${parsed.invoiceNumber}`
      )
    }
  }

  // 4. Generate number
  const number = await numberSequenceService.getNextNumber(prisma, tenantId, "inbound_invoice")

  // 5. Upload PDF to storage
  const invoiceId = crypto.randomUUID()
  const storagePath = `${tenantId}/${invoiceId}/${filename}`
  await storage.upload(BUCKET, storagePath, file, {
    contentType: "application/pdf",
    upsert: true,
  })

  // 6. Create invoice
  const invoice = await repo.create(prisma, tenantId, {
    id: invoiceId,
    number,
    source: zugferdResult.hasZugferd ? "zugferd" : "manual",
    supplierId: supplierMatch.supplierId,
    supplierStatus: supplierMatch.supplierId ? "matched" : "unknown",
    invoiceNumber: parsed?.invoiceNumber ?? null,
    invoiceDate: parsed?.invoiceDate ? new Date(parsed.invoiceDate) : null,
    dueDate: parsed?.dueDate ? new Date(parsed.dueDate) : null,
    totalNet: parsed?.totalNet ?? null,
    totalVat: parsed?.totalVat ?? null,
    totalGross: parsed?.totalGross ?? null,
    currency: parsed?.currency ?? "EUR",
    paymentTermDays: parsed?.paymentTermDays ?? null,
    sellerName: parsed?.sellerName ?? null,
    sellerVatId: parsed?.sellerVatId ?? null,
    sellerTaxNumber: parsed?.sellerTaxNumber ?? null,
    sellerStreet: parsed?.sellerStreet ?? null,
    sellerZip: parsed?.sellerZip ?? null,
    sellerCity: parsed?.sellerCity ?? null,
    sellerCountry: parsed?.sellerCountry ?? null,
    sellerIban: parsed?.sellerIban ?? null,
    sellerBic: parsed?.sellerBic ?? null,
    buyerName: parsed?.buyerName ?? null,
    buyerVatId: parsed?.buyerVatId ?? null,
    buyerReference: parsed?.buyerReference ?? null,
    zugferdProfile: zugferdResult.profile ?? null,
    zugferdRawXml: zugferdResult.rawXml ?? null,
    pdfStoragePath: storagePath,
    pdfOriginalFilename: filename,
    status: "DRAFT",
    createdBy: userId,
  })

  // 7. Create line items if ZUGFeRD
  if (parsed?.lineItems && parsed.lineItems.length > 0) {
    await lineItemRepo.createMany(
      prisma,
      invoice.id,
      parsed.lineItems.map((li, idx) => ({
        position: idx + 1,
        articleNumber: li.articleNumber ?? null,
        description: li.description ?? null,
        quantity: li.quantity ?? null,
        unit: li.unit ?? null,
        unitPriceNet: li.unitPriceNet ?? null,
        totalNet: li.totalNet ?? null,
        vatRate: li.vatRate ?? null,
        vatAmount: li.vatAmount ?? null,
        sortOrder: idx + 1,
      }))
    )
  }

  // 8. Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "inbound_invoice",
        entityId: invoice.id,
        entityName: invoice.number,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return invoice
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const invoice = await repo.findById(prisma, tenantId, id)
  if (!invoice) throw new InboundInvoiceNotFoundError()
  return invoice
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  filters?: Parameters<typeof repo.findMany>[2],
  pagination?: Parameters<typeof repo.findMany>[3]
) {
  return repo.findMany(prisma, tenantId, filters, pagination)
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
  audit?: AuditContext
) {
  const existing = await getById(prisma, tenantId, id)

  // Guard: only DRAFT or REJECTED
  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    throw new InboundInvoiceValidationError(
      `Cannot edit invoice in status ${existing.status}`
    )
  }

  // Validate orderId belongs to same tenant
  if (data.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: data.orderId as string, tenantId },
      select: { id: true },
    })
    if (!order) {
      throw new InboundInvoiceValidationError("Order not found or belongs to another tenant")
    }
  }

  // Validate costCenterId belongs to same tenant
  if (data.costCenterId) {
    const costCenter = await prisma.costCenter.findFirst({
      where: { id: data.costCenterId as string, tenantId },
      select: { id: true },
    })
    if (!costCenter) {
      throw new InboundInvoiceValidationError("Cost center not found or belongs to another tenant")
    }
  }

  // Check material field changes → increment approvalVersion
  const materialChanged = MATERIAL_FIELDS.some((field) => {
    if (!(field in data)) return false
    const oldVal = String((existing as Record<string, unknown>)[field] ?? "")
    const newVal = String(data[field] ?? "")
    return oldVal !== newVal
  })

  const updateData: Record<string, unknown> = { ...data }
  if (materialChanged) {
    updateData.approvalVersion = existing.approvalVersion + 1
  }

  const updated = await repo.update(prisma, tenantId, id, updateData)

  // Handle approval invalidation on material change
  if (materialChanged) {
    await approvalService.handleMaterialChange(
      prisma, tenantId, id, updated.approvalVersion
    )
  }

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as Record<string, unknown>,
      TRACKED_FIELDS as unknown as string[]
    )
    if (changes) {
      await auditLog
        .log(prisma, {
          tenantId,
          userId: audit.userId,
          action: "update",
          entityType: "inbound_invoice",
          entityId: id,
          entityName: existing.number,
          changes,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        })
        .catch((err) => console.error("[AuditLog] Failed:", err))
    }
  }

  return updated
}

export async function updateLineItems(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  items: LineItemInput[],
  audit?: AuditContext
) {
  const existing = await getById(prisma, tenantId, invoiceId)

  // Guard: only DRAFT or REJECTED
  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    throw new InboundInvoiceValidationError(
      `Cannot edit line items in status ${existing.status}`
    )
  }

  // Validate line item sum vs header totals (±0.01 tolerance)
  if (items.length > 0 && existing.totalNet !== null) {
    const lineSum = items.reduce((sum, li) => sum + (li.totalNet ?? 0), 0)
    const headerNet = Number(existing.totalNet)
    if (Math.abs(lineSum - headerNet) > 0.01) {
      throw new InboundInvoiceValidationError(
        `Line item net total (${lineSum.toFixed(2)}) does not match header total (${headerNet.toFixed(2)})`
      )
    }
  }

  await lineItemRepo.replaceAll(prisma, invoiceId, items)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "inbound_invoice",
        entityId: invoiceId,
        entityName: existing.number,
        changes: { lineItems: { old: "replaced", new: `${items.length} items` } },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

export async function submitForApproval(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  userId: string,
  audit?: AuditContext
) {
  const existing = await getById(prisma, tenantId, id)

  // Guard: status
  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    throw new InboundInvoiceValidationError(
      `Cannot submit invoice in status ${existing.status}`
    )
  }

  // Guard: required fields
  if (!existing.invoiceNumber) {
    throw new InboundInvoiceValidationError("Invoice number is required")
  }
  if (!existing.invoiceDate) {
    throw new InboundInvoiceValidationError("Invoice date is required")
  }
  if (!existing.totalGross) {
    throw new InboundInvoiceValidationError("Total gross is required")
  }
  if (!existing.supplierId) {
    throw new InboundInvoiceValidationError("Supplier must be assigned before submission")
  }

  // Set submitted fields
  await repo.update(prisma, tenantId, id, {
    submittedBy: userId,
    submittedAt: new Date(),
  })

  // Create approval steps from policy — may auto-approve if no policies exist
  await approvalService.createApprovalSteps(
    prisma,
    tenantId,
    id,
    Number(existing.totalGross),
    existing.approvalVersion
  )

  // Re-fetch to get current status (may be APPROVED if auto-approved)
  const updated = await repo.findById(prisma, tenantId, id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "submit",
        entityType: "inbound_invoice",
        entityId: id,
        entityName: existing.number,
        changes: { status: { old: existing.status, new: "PENDING_APPROVAL" } },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function assignSupplier(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  supplierId: string,
  audit?: AuditContext
) {
  const existing = await getById(prisma, tenantId, id)

  const updated = await repo.update(prisma, tenantId, id, {
    supplierId,
    supplierStatus: "matched",
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "inbound_invoice",
        entityId: id,
        entityName: existing.number,
        changes: { supplierId: { old: existing.supplierId, new: supplierId } },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function reopenExported(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await getById(prisma, tenantId, id)

  if (existing.status !== "EXPORTED") {
    throw new InboundInvoiceValidationError(
      `Cannot reopen invoice in status ${existing.status} — only EXPORTED invoices can be reopened`
    )
  }

  const updated = await repo.update(prisma, tenantId, id, {
    status: "DRAFT",
    datevExportedAt: null,
    datevExportedBy: null,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "reopen",
        entityType: "inbound_invoice",
        entityId: id,
        entityName: existing.number,
        changes: { status: { old: "EXPORTED", new: "DRAFT" } },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await getById(prisma, tenantId, id)

  await repo.updateStatus(prisma, tenantId, id, "CANCELLED")

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "cancel",
        entityType: "inbound_invoice",
        entityId: id,
        entityName: existing.number,
        changes: { status: { old: existing.status, new: "CANCELLED" } },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await getById(prisma, tenantId, id)

  if (existing.status !== "DRAFT") {
    throw new InboundInvoiceValidationError(
      `Cannot delete invoice in status ${existing.status} — only DRAFT invoices can be deleted`
    )
  }

  // Remove PDF from storage
  if (existing.pdfStoragePath) {
    await storage.remove(BUCKET, [existing.pdfStoragePath])
  }

  await repo.remove(prisma, tenantId, id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "inbound_invoice",
        entityId: id,
        entityName: existing.number,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

export async function getUploadUrl(
  _prisma: PrismaClient,
  tenantId: string
) {
  const invoiceId = crypto.randomUUID()
  const storagePath = `${tenantId}/${invoiceId}/upload.pdf`
  const result = await storage.createSignedUploadUrl(BUCKET, storagePath)
  return { signedUrl: result.signedUrl, storagePath, token: result.token }
}

export async function getPdfSignedUrl(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const invoice = await getById(prisma, tenantId, id)
  if (!invoice.pdfStoragePath) return null

  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    invoice.pdfStoragePath,
    SIGNED_URL_EXPIRY
  )
  if (!signedUrl) return null

  return {
    signedUrl,
    filename: invoice.pdfOriginalFilename ?? "invoice.pdf",
  }
}
