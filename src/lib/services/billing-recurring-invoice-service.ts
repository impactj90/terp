import type { PrismaClient, BillingRecurringInterval } from "@/generated/prisma/client"
import * as repo from "./billing-recurring-invoice-repository"
import * as billingDocRepo from "./billing-document-repository"
import * as billingDocService from "./billing-document-service"
import * as numberSeqService from "./number-sequence-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class BillingRecurringInvoiceNotFoundError extends Error {
  constructor(message = "Recurring invoice not found") {
    super(message); this.name = "BillingRecurringInvoiceNotFoundError"
  }
}

export class BillingRecurringInvoiceValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingRecurringInvoiceValidationError"
  }
}

// --- Pure Helper: calculateNextDueDate (exported for unit testing) ---

export function calculateNextDueDate(
  current: Date,
  interval: BillingRecurringInterval
): Date {
  const next = new Date(current)
  switch (interval) {
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1)
      break
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3)
      break
    case "SEMI_ANNUALLY":
      next.setMonth(next.getMonth() + 6)
      break
    case "ANNUALLY":
      next.setFullYear(next.getFullYear() + 1)
      break
  }
  return next
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

const RECURRING_INVOICE_TRACKED_FIELDS = [
  "name", "contactId", "interval", "startDate", "endDate",
  "autoGenerate", "isActive", "deliveryType", "deliveryTerms",
  "paymentTermDays", "discountPercent", "discountDays",
  "notes", "internalNotes",
]

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    isActive?: boolean
    addressId?: string
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
  const rec = await repo.findById(prisma, tenantId, id)
  if (!rec) throw new BillingRecurringInvoiceNotFoundError()
  return rec
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    addressId: string
    contactId?: string
    interval: BillingRecurringInterval
    startDate: Date
    endDate?: Date
    autoGenerate?: boolean
    deliveryType?: string
    deliveryTerms?: string
    paymentTermDays?: number
    discountPercent?: number
    discountDays?: number
    notes?: string
    internalNotes?: string
    positionTemplate: Array<{
      type: string
      articleId?: string
      articleNumber?: string
      description?: string
      quantity?: number
      unit?: string
      unitPrice?: number
      flatCosts?: number
      vatRate?: number
    }>
  },
  createdById: string,
  audit?: AuditContext
) {
  // Validate address belongs to tenant
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
  })
  if (!address) {
    throw new BillingRecurringInvoiceValidationError("Address not found in this tenant")
  }

  // Validate contact belongs to address (if provided)
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.addressId, tenantId },
    })
    if (!contact) {
      throw new BillingRecurringInvoiceValidationError("Contact not found for this address")
    }
  }

  // Validate positionTemplate is non-empty
  if (!input.positionTemplate || input.positionTemplate.length === 0) {
    throw new BillingRecurringInvoiceValidationError("Position template must have at least one entry")
  }

  // Validate endDate > startDate if provided
  if (input.endDate && input.endDate <= input.startDate) {
    throw new BillingRecurringInvoiceValidationError("End date must be after start date")
  }

  const created = await repo.create(prisma, {
    tenantId,
    name: input.name,
    addressId: input.addressId,
    contactId: input.contactId || null,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate || null,
    nextDueDate: input.startDate, // First due date = start date
    autoGenerate: input.autoGenerate ?? false,
    deliveryType: input.deliveryType || null,
    deliveryTerms: input.deliveryTerms || null,
    paymentTermDays: input.paymentTermDays ?? null,
    discountPercent: input.discountPercent ?? null,
    discountDays: input.discountDays ?? null,
    notes: input.notes || null,
    internalNotes: input.internalNotes || null,
    positionTemplate: input.positionTemplate as unknown as Record<string, unknown>,
    createdById,
  })

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "billing_recurring_invoice",
      entityId: created.id, entityName: null, changes: null,
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
    name?: string
    contactId?: string | null
    interval?: BillingRecurringInterval
    startDate?: Date
    endDate?: Date | null
    autoGenerate?: boolean
    deliveryType?: string | null
    deliveryTerms?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    notes?: string | null
    internalNotes?: string | null
    positionTemplate?: Array<Record<string, unknown>>
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new BillingRecurringInvoiceNotFoundError()

  const data: Record<string, unknown> = {}
  const fields = [
    "name", "contactId", "interval", "startDate", "endDate",
    "autoGenerate", "deliveryType", "deliveryTerms",
    "paymentTermDays", "discountPercent", "discountDays",
    "notes", "internalNotes", "positionTemplate",
  ] as const

  for (const field of fields) {
    if ((input as Record<string, unknown>)[field] !== undefined) {
      data[field] = (input as Record<string, unknown>)[field]
    }
  }

  if (Object.keys(data).length === 0) return existing

  const updated = await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, RECURRING_INVOICE_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_recurring_invoice",
      entityId: input.id, entityName: null, changes,
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
  if (!existing) throw new BillingRecurringInvoiceNotFoundError()

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) throw new BillingRecurringInvoiceNotFoundError()

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "billing_recurring_invoice",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

export async function activate(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingRecurringInvoiceNotFoundError()
  const updated = await repo.update(prisma, tenantId, id, { isActive: true })

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, RECURRING_INVOICE_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_recurring_invoice",
      entityId: id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function deactivate(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingRecurringInvoiceNotFoundError()
  const updated = await repo.update(prisma, tenantId, id, { isActive: false })

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, RECURRING_INVOICE_TRACKED_FIELDS)
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "billing_recurring_invoice",
      entityId: id, entityName: null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

// --- Invoice Generation ---

export async function generate(
  prisma: PrismaClient,
  tenantId: string,
  recurringId: string,
  generatedById: string,
  audit?: AuditContext
) {
  // Transaction: load template, create invoice, create positions, update template
  const result = await prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as PrismaClient
    const template = await repo.findById(tx, tenantId, recurringId)
    if (!template) throw new BillingRecurringInvoiceNotFoundError()

    if (!template.isActive) {
      throw new BillingRecurringInvoiceValidationError("Template is inactive")
    }

    // Check if endDate is reached
    if (template.endDate && template.nextDueDate > template.endDate) {
      // Deactivate and throw
      await repo.update(tx, tenantId, recurringId, { isActive: false })
      throw new BillingRecurringInvoiceValidationError(
        "Template end date has been reached. Template has been deactivated."
      )
    }

    // 1. Generate invoice number
    const number = await numberSeqService.getNextNumber(tx, tenantId, "invoice")

    // 2. Create BillingDocument of type INVOICE
    const invoiceDoc = await billingDocRepo.create(tx, {
      tenantId,
      number,
      type: "INVOICE",
      addressId: template.addressId,
      contactId: template.contactId,
      documentDate: template.nextDueDate,
      deliveryType: template.deliveryType,
      deliveryTerms: template.deliveryTerms,
      paymentTermDays: template.paymentTermDays,
      discountPercent: template.discountPercent,
      discountDays: template.discountDays,
      notes: template.notes,
      internalNotes: template.internalNotes,
      createdById: generatedById,
    })

    // 3. Create positions from positionTemplate
    const positions = template.positionTemplate as Array<{
      type?: string
      articleId?: string
      articleNumber?: string
      description?: string
      quantity?: number
      unit?: string
      unitPrice?: number
      flatCosts?: number
      vatRate?: number
    }>

    await billingDocRepo.createManyPositions(tx, positions.map((pos, i) => {
      const totalPrice = calculatePositionTotal(pos.quantity, pos.unitPrice, pos.flatCosts)
      return {
        documentId: invoiceDoc.id,
        sortOrder: i + 1,
        type: (pos.type as "ARTICLE" | "FREE" | "TEXT") ?? "FREE",
        articleId: pos.articleId || null,
        articleNumber: pos.articleNumber || null,
        description: pos.description || null,
        quantity: pos.quantity ?? null,
        unit: pos.unit || null,
        unitPrice: pos.unitPrice ?? null,
        flatCosts: pos.flatCosts ?? null,
        totalPrice,
        vatRate: pos.vatRate ?? null,
      }
    }))

    // 4. Recalculate totals
    await billingDocService.recalculateTotals(tx, tenantId, invoiceDoc.id)

    // 5. Advance nextDueDate
    const nextDue = calculateNextDueDate(template.nextDueDate, template.interval)

    // 6. Update template
    const updateData: Record<string, unknown> = {
      lastGeneratedAt: new Date(),
      nextDueDate: nextDue,
    }

    // If next due date exceeds endDate, deactivate
    if (template.endDate && nextDue > template.endDate) {
      updateData.isActive = false
    }

    await repo.update(tx, tenantId, recurringId, updateData)

    // 7. Return the created invoice
    return billingDocRepo.findById(tx, tenantId, invoiceDoc.id)
  })

  if (audit) {
    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "billing_recurring_invoice",
      entityId: recurringId, entityName: null, changes: { action: "generate_invoice" },
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

// --- Batch Generation (for cron) ---

export async function generateDue(
  prisma: PrismaClient,
  today: Date = new Date()
): Promise<{
  generated: number
  failed: number
  results: Array<{ tenantId: string; recurringId: string; invoiceId?: string; error?: string }>
}> {
  const dueTemplates = await repo.findDue(prisma, today)

  const results: Array<{ tenantId: string; recurringId: string; invoiceId?: string; error?: string }> = []
  let generated = 0
  let failed = 0

  for (const template of dueTemplates) {
    try {
      const invoice = await generate(
        prisma,
        template.tenantId,
        template.id,
        template.createdById || "system"
      ) as { id: string } | null
      generated++
      results.push({
        tenantId: template.tenantId,
        recurringId: template.id,
        invoiceId: invoice?.id,
      })
    } catch (err) {
      failed++
      results.push({
        tenantId: template.tenantId,
        recurringId: template.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { generated, failed, results }
}

// --- Preview ---

export async function preview(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const template = await repo.findById(prisma, tenantId, id)
  if (!template) throw new BillingRecurringInvoiceNotFoundError()

  // Build a preview of what the next invoice would look like
  const positions = template.positionTemplate as Array<{
    type?: string
    articleId?: string
    articleNumber?: string
    description?: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    vatRate?: number
  }>

  let subtotalNet = 0
  const vatMap = new Map<number, number>()
  const previewPositions = positions.map((pos, i) => {
    const totalPrice = calculatePositionTotal(pos.quantity, pos.unitPrice, pos.flatCosts)
    if (totalPrice != null) {
      subtotalNet += totalPrice
      if (pos.vatRate && pos.vatRate > 0) {
        const vatAmount = totalPrice * (pos.vatRate / 100)
        vatMap.set(pos.vatRate, (vatMap.get(pos.vatRate) ?? 0) + vatAmount)
      }
    }
    return { ...pos, sortOrder: i + 1, totalPrice }
  })

  let totalVat = 0
  for (const amount of vatMap.values()) totalVat += amount
  const totalGross = subtotalNet + totalVat

  return {
    template,
    nextInvoiceDate: template.nextDueDate,
    positions: previewPositions,
    subtotalNet: Math.round(subtotalNet * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
  }
}
