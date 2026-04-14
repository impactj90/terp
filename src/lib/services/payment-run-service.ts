/**
 * Payment Run Service
 *
 * Business logic for SEPA payment runs. Thin service-layer that
 * coordinates the repository, data-resolver, and number-sequence
 * service. XML generation + storage upload happen in
 * `payment-run-xml-flow.ts` to keep this module Prisma-only for
 * straightforward unit tests.
 *
 * Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 1.9
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import * as repo from "./payment-run-repository"
import type {
  CreatePaymentRunItemData,
  ListFilters,
  ListPagination,
  PaymentRunWithItems,
} from "./payment-run-repository"
import * as resolverModule from "./payment-run-data-resolver"
import {
  RESOLVER_INVOICE_INCLUDE,
  resolveFromLoaded,
} from "./payment-run-data-resolver"
import type { ResolvedRow } from "./payment-run-data-resolver"
import * as numberSequenceService from "./number-sequence-service"
import * as billingTenantConfigService from "./billing-tenant-config-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import * as inboundPaymentService from "./inbound-invoice-payment-service"

export { getPaymentStatus } from "./payment-run-data-resolver"
export type { PaymentStatus } from "./payment-run-data-resolver"

// --- Constants ---

const TRACKED_FIELDS = [
  "status",
  "executionDate",
  "debtorName",
  "debtorIban",
  "debtorBic",
  "xmlStoragePath",
  "xmlGeneratedAt",
  "bookedAt",
  "cancelledAt",
  "cancelledReason",
] as const

// --- Error Classes ---

export class PaymentRunNotFoundError extends Error {
  constructor(id?: string) {
    super(id ? `Payment run not found: ${id}` : "Payment run not found")
    this.name = "PaymentRunNotFoundError"
  }
}

export class PaymentRunInvalidStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PaymentRunInvalidStateError"
  }
}

// Intentionally named with the `ValidationError` suffix so the central
// `handleServiceError` helper (src/trpc/errors.ts) maps this to BAD_REQUEST
// out of the box.
export class PaymentRunPreflightValidationError extends Error {
  public readonly reasons: string[]
  constructor(reasons: string[]) {
    super(`Preflight failed: ${reasons.join(", ")}`)
    this.name = "PaymentRunPreflightValidationError"
    this.reasons = reasons
  }
}

/** Alias — shorter name used throughout the codebase. */
export const PaymentRunPreflightError = PaymentRunPreflightValidationError
export type PaymentRunPreflightError = PaymentRunPreflightValidationError

export class PaymentRunItemInvalidError extends Error {
  public readonly invoiceId: string
  public readonly reason: string
  constructor(invoiceId: string, reason: string) {
    super(`Invoice ${invoiceId}: ${reason}`)
    this.name = "PaymentRunItemInvalidError"
    this.invoiceId = invoiceId
    this.reason = reason
  }
}

// --- Types ---

export type PreflightBlocker = "NO_IBAN" | "NO_NAME" | "NO_CITY" | "NO_COUNTRY"

export interface PreflightResult {
  ready: boolean
  blockers: PreflightBlocker[]
}

export interface ProposalFilters {
  fromDueDate?: Date
  toDueDate?: Date
  supplierId?: string
  minAmountCents?: number
  maxAmountCents?: number
}

export interface CreatePaymentRunInput {
  executionDate: Date
  items: Array<{
    invoiceId: string
    ibanSource: "CRM" | "INVOICE"
    addressSource: "CRM" | "INVOICE"
  }>
  notes?: string | null
}

// --- Helpers ---

function formatRunNumber(raw: string, executionDate: Date): string {
  // numberSequenceService returns e.g. "PR-1". We want "PR-YYYY-NNN".
  const match = raw.match(/^([^0-9]*)(\d+)$/)
  if (!match || !match[2]) return raw
  const prefix = match[1] ?? ""
  const seq = match[2]
  const year = executionDate.getUTCFullYear()
  const padded = seq.padStart(3, "0")
  return `${prefix}${year}-${padded}`
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max)
}

async function loadInvoicesForResolution(
  prisma: PrismaClient,
  tenantId: string,
  invoiceIds: string[]
) {
  if (invoiceIds.length === 0) return []
  return prisma.inboundInvoice.findMany({
    where: { id: { in: invoiceIds }, tenantId },
    include: RESOLVER_INVOICE_INCLUDE,
  })
}

// --- Service functions ---

export async function getPreflight(
  prisma: PrismaClient,
  tenantId: string
): Promise<PreflightResult> {
  const config = await billingTenantConfigService.get(prisma, tenantId)
  const blockers: PreflightBlocker[] = []
  if (!config?.iban || config.iban.trim().length === 0) blockers.push("NO_IBAN")
  if (!config?.companyName || config.companyName.trim().length === 0)
    blockers.push("NO_NAME")
  if (!config?.companyCity || config.companyCity.trim().length === 0)
    blockers.push("NO_CITY")
  if (!config?.companyCountry || config.companyCountry.trim().length === 0)
    blockers.push("NO_COUNTRY")
  return { ready: blockers.length === 0, blockers }
}

export async function getProposal(
  prisma: PrismaClient,
  tenantId: string,
  filters: ProposalFilters = {}
): Promise<ResolvedRow[]> {
  const today = new Date()
  const fromDueDate = filters.fromDueDate ?? today
  const toDueDate =
    filters.toDueDate ?? new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  const where: Prisma.InboundInvoiceWhereInput = {
    tenantId,
    status: "APPROVED",
    dueDate: { gte: fromDueDate, lte: toDueDate },
  }
  if (filters.supplierId) where.supplierId = filters.supplierId
  if (filters.minAmountCents !== undefined) {
    where.totalGross = {
      ...((where.totalGross as Prisma.DecimalFilter) ?? {}),
      gte: filters.minAmountCents / 100,
    }
  }
  if (filters.maxAmountCents !== undefined) {
    where.totalGross = {
      ...((where.totalGross as Prisma.DecimalFilter) ?? {}),
      lte: filters.maxAmountCents / 100,
    }
  }

  const invoices = await prisma.inboundInvoice.findMany({
    where,
    include: RESOLVER_INVOICE_INCLUDE,
    orderBy: [{ dueDate: "asc" }],
  })

  if (invoices.length === 0) return []

  // Filter out invoices already in an active payment run
  const boundIds = await repo.findInvoiceIdsWithActivePaymentRun(
    prisma,
    tenantId,
    invoices.map((i) => i.id)
  )

  const free = invoices.filter((i) => !boundIds.has(i.id))

  return free.map((inv) =>
    resolveFromLoaded(
      inv as unknown as Parameters<typeof resolveFromLoaded>[0]
    )
  )
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  filters: ListFilters = {},
  pagination: ListPagination = {}
) {
  return repo.findMany(prisma, tenantId, filters, pagination)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<PaymentRunWithItems> {
  const run = await repo.findById(prisma, tenantId, id)
  if (!run) throw new PaymentRunNotFoundError(id)
  return run
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: CreatePaymentRunInput,
  userId: string,
  audit?: AuditContext
): Promise<PaymentRunWithItems> {
  // --- Preflight ---
  const preflight = await getPreflight(prisma, tenantId)
  if (!preflight.ready) {
    throw new PaymentRunPreflightError(preflight.blockers)
  }

  if (input.items.length === 0) {
    throw new PaymentRunItemInvalidError("", "no_items")
  }

  const config = await billingTenantConfigService.get(prisma, tenantId)
  if (!config) throw new PaymentRunPreflightError(["NO_CONFIG"])

  // --- Load invoices + resolve with explicit choices ---
  const invoiceIds = input.items.map((it) => it.invoiceId)
  const uniqueInvoiceIds = Array.from(new Set(invoiceIds))
  if (uniqueInvoiceIds.length !== invoiceIds.length) {
    throw new PaymentRunItemInvalidError("", "duplicate_invoice")
  }

  const loadedInvoices = await loadInvoicesForResolution(
    prisma,
    tenantId,
    invoiceIds
  )
  const loadedMap = new Map(loadedInvoices.map((i) => [i.id, i]))

  // Active-run safety check (authoritative pre-transaction; the DB
  // trigger in Phase 4 catches the true race-condition window).
  const boundIds = await repo.findInvoiceIdsWithActivePaymentRun(
    prisma,
    tenantId,
    invoiceIds
  )

  const resolvedItems: CreatePaymentRunItemData[] = []
  let totalCents = 0n

  for (const chosen of input.items) {
    const invoice = loadedMap.get(chosen.invoiceId)
    if (!invoice) {
      throw new PaymentRunItemInvalidError(chosen.invoiceId, "not_found")
    }

    const row = resolveFromLoaded(
      invoice as unknown as Parameters<typeof resolveFromLoaded>[0],
      { ibanSource: chosen.ibanSource, addressSource: chosen.addressSource },
      { inActivePaymentRun: boundIds.has(invoice.id) }
    )

    if (row.status !== "GREEN") {
      const reason =
        row.blockers.map((b) => b.type).join(",") || row.status.toLowerCase()
      throw new PaymentRunItemInvalidError(invoice.id, reason)
    }

    if (!row.iban.iban || !row.address.city || !row.address.country) {
      throw new PaymentRunItemInvalidError(invoice.id, "resolver_incomplete")
    }
    if (!row.supplierName) {
      throw new PaymentRunItemInvalidError(invoice.id, "no_creditor_name")
    }
    if (row.amountCents <= 0n) {
      throw new PaymentRunItemInvalidError(invoice.id, "invalid_amount")
    }

    const remittance =
      invoice.invoiceNumber?.trim().length
        ? invoice.invoiceNumber!.trim()
        : invoice.number
    const endToEnd = truncate(invoice.invoiceNumber?.trim() || invoice.id, 35)

    resolvedItems.push({
      effectiveCreditorName: truncate(row.supplierName, 70),
      effectiveIban: row.iban.iban,
      effectiveBic: row.iban.bic,
      effectiveStreet: row.address.street
        ? truncate(row.address.street, 70)
        : null,
      effectiveZip: row.address.zip ? truncate(row.address.zip, 16) : null,
      effectiveCity: truncate(row.address.city, 35),
      effectiveCountry: row.address.country.slice(0, 2),
      effectiveAmountCents: row.amountCents,
      effectiveCurrency: "EUR",
      effectiveRemittanceInfo: truncate(remittance, 140),
      ibanSource: chosen.ibanSource,
      addressSource: chosen.addressSource,
      endToEndId: endToEnd,
      inboundInvoiceId: invoice.id,
    })

    totalCents += row.amountCents
  }

  // --- Number sequence + insert inside a transaction ---
  const rawNumber = await numberSequenceService.getNextNumber(
    prisma,
    tenantId,
    "payment_run"
  )
  const number = formatRunNumber(rawNumber, input.executionDate)

  const debtorName = truncate(config.companyName ?? "", 70)
  const debtorIban = (config.iban ?? "").replace(/\s+/g, "").toUpperCase()
  const debtorBic = config.bic?.trim() ? config.bic.trim().toUpperCase() : null

  const created = await prisma.$transaction(async (tx) => {
    return repo.createWithItems(
      tx,
      tenantId,
      {
        number,
        executionDate: input.executionDate,
        debtorName,
        debtorIban,
        debtorBic,
        totalAmountCents: totalCents,
        itemCount: resolvedItems.length,
        notes: input.notes ?? null,
        createdBy: userId,
      },
      resolvedItems
    )
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "payment_run",
        entityId: created.id,
        entityName: created.number,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) =>
        console.error("[AuditLog] payment_run.create failed:", err)
      )
  }

  return created
}

/**
 * Transition DRAFT → EXPORTED. Stores the XML storage path.
 * Idempotent: already EXPORTED → no-op (but keeps existing path).
 */
export async function setExported(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  storagePath: string,
  audit?: AuditContext
): Promise<PaymentRunWithItems> {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new PaymentRunNotFoundError(id)

  if (existing.status === "EXPORTED") return existing
  if (existing.status !== "DRAFT") {
    throw new PaymentRunInvalidStateError(
      `Cannot export run in status ${existing.status}`
    )
  }

  const updated = await repo.updateStatus(prisma, tenantId, id, {
    status: "EXPORTED",
    xmlStoragePath: storagePath,
    xmlGeneratedAt: new Date(),
  })
  if (!updated) throw new PaymentRunNotFoundError(id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "export",
        entityType: "payment_run",
        entityId: updated.id,
        entityName: updated.number,
        changes: auditLog.computeChanges(
          existing as unknown as Record<string, unknown>,
          updated as unknown as Record<string, unknown>,
          [...TRACKED_FIELDS]
        ),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) =>
        console.error("[AuditLog] payment_run.export failed:", err)
      )
  }

  return updated
}

/**
 * Transition EXPORTED → BOOKED. Idempotent on BOOKED.
 *
 * Wraps the status update + InboundInvoice payment-status flip in a
 * single $transaction so a partial failure does not leave a BOOKED run
 * pointing at UNPAID invoices (or vice versa).
 * Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md Phase 3c.
 */
export async function markBooked(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  userId: string,
  audit?: AuditContext
): Promise<PaymentRunWithItems> {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new PaymentRunNotFoundError(id)

  if (existing.status === "BOOKED") return existing
  if (existing.status !== "EXPORTED") {
    throw new PaymentRunInvalidStateError(
      `Only EXPORTED runs can be marked as booked (current: ${existing.status})`
    )
  }

  const bookedAt = new Date()
  const invoiceIds = existing.items.map((i) => i.inboundInvoiceId)

  const updated = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient
    const u = await repo.updateStatus(txPrisma, tenantId, id, {
      status: "BOOKED",
      bookedAt,
      bookedBy: userId,
    })
    if (!u) throw new PaymentRunNotFoundError(id)

    await inboundPaymentService.markInvoicesPaidFromPaymentRun(
      txPrisma,
      tenantId,
      invoiceIds,
      bookedAt
    )

    return u
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "book",
        entityType: "payment_run",
        entityId: updated.id,
        entityName: updated.number,
        changes: auditLog.computeChanges(
          existing as unknown as Record<string, unknown>,
          updated as unknown as Record<string, unknown>,
          [...TRACKED_FIELDS]
        ),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] payment_run.book failed:", err))
  }

  return updated
}

/**
 * Transition DRAFT/EXPORTED → CANCELLED. Idempotent on CANCELLED.
 * BOOKED runs cannot be cancelled.
 */
export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  userId: string,
  reason: string,
  audit?: AuditContext
): Promise<PaymentRunWithItems> {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new PaymentRunNotFoundError(id)

  if (existing.status === "CANCELLED") return existing
  if (existing.status === "BOOKED") {
    throw new PaymentRunInvalidStateError(
      "Booked payment runs cannot be cancelled"
    )
  }

  const updated = await repo.updateStatus(prisma, tenantId, id, {
    status: "CANCELLED",
    cancelledAt: new Date(),
    cancelledBy: userId,
    cancelledReason: reason?.trim().length ? reason.trim() : null,
  })
  if (!updated) throw new PaymentRunNotFoundError(id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "cancel",
        entityType: "payment_run",
        entityId: updated.id,
        entityName: updated.number,
        changes: auditLog.computeChanges(
          existing as unknown as Record<string, unknown>,
          updated as unknown as Record<string, unknown>,
          [...TRACKED_FIELDS]
        ),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) =>
        console.error("[AuditLog] payment_run.cancel failed:", err)
      )
  }

  return updated
}

// Re-export resolver for tests that want a single import point.
export const resolver = resolverModule
