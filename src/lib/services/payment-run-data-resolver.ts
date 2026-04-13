/**
 * Payment Run Data Resolver
 *
 * Pure-reader helper that resolves IBAN + address for an inbound invoice
 * by looking at CRM supplier bank accounts and invoice ZUGFeRD fields.
 *
 * Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 1.7
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { isValidIban, normalizeIban } from "@/lib/sepa/iban-validator"

export type DataSource = "CRM" | "INVOICE" | "MANUAL"
export type RowStatus = "GREEN" | "YELLOW" | "RED"

export type BlockerReason =
  | { type: "NO_IBAN" }
  | { type: "NO_ADDRESS" }
  | { type: "NO_SUPPLIER" }
  | { type: "IBAN_INVALID"; value: string }
  | { type: "IBAN_CONFLICT" }
  | { type: "ADDRESS_CONFLICT" }
  | { type: "NOT_APPROVED" }
  | { type: "ALREADY_IN_ACTIVE_RUN" }

export interface ResolvedIban {
  iban: string | null
  bic: string | null
  source: DataSource
  conflict: {
    crm?: { iban: string; bic: string | null }
    invoice?: { iban: string; bic: string | null }
  } | null
}

export interface ResolvedAddress {
  creditorName: string | null
  street: string | null
  zip: string | null
  city: string | null
  country: string | null // ISO alpha-2
  source: DataSource
  conflict: {
    crm?: { city: string; country: string }
    invoice?: { city: string; country: string }
  } | null
}

export interface ResolvedRow {
  invoiceId: string
  invoiceNumber: string | null
  supplierId: string | null
  supplierName: string | null
  dueDate: Date | null
  amountCents: bigint
  iban: ResolvedIban
  address: ResolvedAddress
  status: RowStatus
  blockers: BlockerReason[]
}

export interface ResolveChoice {
  ibanSource?: DataSource
  addressSource?: DataSource
}

export type PaymentStatus = "UNPAID" | "IN_PAYMENT_RUN" | "PAID"

/**
 * Derive the payment status of an inbound invoice from its
 * PaymentRunItem rows (no mutation, no DB write on InboundInvoice).
 */
export function getPaymentStatus(
  paymentRunItems: Array<{ paymentRun: { status: string } }>
): PaymentStatus {
  const active = paymentRunItems.filter(
    (i) => i.paymentRun.status !== "CANCELLED"
  )
  if (active.length === 0) return "UNPAID"
  if (active.some((i) => i.paymentRun.status === "BOOKED")) return "PAID"
  return "IN_PAYMENT_RUN"
}

// Internal helper: €12.34 → 1234 cents, handles Prisma.Decimal too.
function decimalToCents(
  value: unknown
): bigint {
  if (value === null || value === undefined) return 0n
  if (typeof value === "number") return BigInt(Math.round(value * 100))
  if (typeof value === "bigint") return value
  if (typeof value === "string") {
    const n = Number.parseFloat(value)
    if (!Number.isFinite(n)) return 0n
    return BigInt(Math.round(n * 100))
  }
  // Prisma.Decimal
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const n = (value as { toNumber(): number }).toNumber()
    return BigInt(Math.round(n * 100))
  }
  return 0n
}

function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toUpperCase()
  if (trimmed.length === 0) return null
  // Keep only the first 2 chars (DB column is VARCHAR(2)); invoices may
  // carry 5-char ZUGFeRD country codes but alpha-2 is the SEPA standard.
  return trimmed.slice(0, 2)
}

/**
 * Resolve a single invoice row. Caller passes the loaded invoice
 * (with `supplier.bankAccounts` pre-ordered by [isDefault desc, createdAt asc]).
 */
export function resolveFromLoaded(
  invoice: {
    id: string
    status: string
    invoiceNumber: string | null
    supplierId: string | null
    dueDate: Date | null
    totalGross: unknown
    sellerName: string | null
    sellerIban: string | null
    sellerBic: string | null
    sellerStreet: string | null
    sellerZip: string | null
    sellerCity: string | null
    sellerCountry: string | null
    supplier: {
      id: string
      company: string
      street: string | null
      zip: string | null
      city: string | null
      country: string | null
      bankAccounts: Array<{
        iban: string
        bic: string | null
      }>
    } | null
  },
  choices: ResolveChoice = {},
  options: { inActivePaymentRun?: boolean } = {}
): ResolvedRow {
  const blockers: BlockerReason[] = []

  // ---- Supplier + basic metadata ----
  const supplierName = invoice.supplier?.company ?? invoice.sellerName ?? null
  if (!supplierName) blockers.push({ type: "NO_SUPPLIER" })

  // ---- IBAN resolution ----
  const crmBank = invoice.supplier?.bankAccounts[0] ?? null
  const crmIban = crmBank ? normalizeIban(crmBank.iban) : ""
  const crmBic = crmBank?.bic ?? null

  const invIbanRaw = invoice.sellerIban
  const invIban = invIbanRaw ? normalizeIban(invIbanRaw) : ""
  const invBic = invoice.sellerBic ?? null

  const hasCrm = crmIban.length > 0
  const hasInv = invIban.length > 0

  let ibanSource: DataSource = "INVOICE"
  let chosenIban: string | null = null
  let chosenBic: string | null = null
  let ibanConflict: ResolvedIban["conflict"] = null

  if (hasCrm && hasInv) {
    if (crmIban === invIban) {
      ibanSource = "CRM"
      chosenIban = crmIban
      chosenBic = crmBic ?? invBic ?? null
    } else {
      ibanConflict = {
        crm: { iban: crmIban, bic: crmBic },
        invoice: { iban: invIban, bic: invBic },
      }
      if (choices.ibanSource === "CRM") {
        ibanSource = "CRM"
        chosenIban = crmIban
        chosenBic = crmBic
      } else if (choices.ibanSource === "INVOICE") {
        ibanSource = "INVOICE"
        chosenIban = invIban
        chosenBic = invBic
      } else {
        // Unresolved conflict
        chosenIban = null
        chosenBic = null
        blockers.push({ type: "IBAN_CONFLICT" })
      }
    }
  } else if (hasCrm) {
    ibanSource = "CRM"
    chosenIban = crmIban
    chosenBic = crmBic
  } else if (hasInv) {
    ibanSource = "INVOICE"
    chosenIban = invIban
    chosenBic = invBic
  } else {
    chosenIban = null
    chosenBic = null
    blockers.push({ type: "NO_IBAN" })
  }

  // ---- IBAN MOD-97 check on the chosen value ----
  if (chosenIban && !isValidIban(chosenIban)) {
    blockers.push({ type: "IBAN_INVALID", value: chosenIban })
  }

  // ---- Address resolution ----
  const crmCity = invoice.supplier?.city?.trim() ?? null
  const crmCountry = normalizeCountry(invoice.supplier?.country)
  const invCity = invoice.sellerCity?.trim() ?? null
  const invCountry = normalizeCountry(invoice.sellerCountry)

  const crmAddrComplete = Boolean(crmCity && crmCountry)
  const invAddrComplete = Boolean(invCity && invCountry)

  let addressSource: DataSource = "INVOICE"
  let chosenAddress: {
    street: string | null
    zip: string | null
    city: string | null
    country: string | null
  } = { street: null, zip: null, city: null, country: null }
  let addressConflict: ResolvedAddress["conflict"] = null

  if (crmAddrComplete && invAddrComplete) {
    const same = crmCity === invCity && crmCountry === invCountry
    if (same) {
      addressSource = "CRM"
      chosenAddress = {
        street: invoice.supplier?.street ?? null,
        zip: invoice.supplier?.zip ?? null,
        city: crmCity,
        country: crmCountry,
      }
    } else {
      addressConflict = {
        crm: { city: crmCity!, country: crmCountry! },
        invoice: { city: invCity!, country: invCountry! },
      }
      if (choices.addressSource === "CRM") {
        addressSource = "CRM"
        chosenAddress = {
          street: invoice.supplier?.street ?? null,
          zip: invoice.supplier?.zip ?? null,
          city: crmCity,
          country: crmCountry,
        }
      } else if (choices.addressSource === "INVOICE") {
        addressSource = "INVOICE"
        chosenAddress = {
          street: invoice.sellerStreet ?? null,
          zip: invoice.sellerZip ?? null,
          city: invCity,
          country: invCountry,
        }
      } else {
        blockers.push({ type: "ADDRESS_CONFLICT" })
      }
    }
  } else if (crmAddrComplete) {
    addressSource = "CRM"
    chosenAddress = {
      street: invoice.supplier?.street ?? null,
      zip: invoice.supplier?.zip ?? null,
      city: crmCity,
      country: crmCountry,
    }
  } else if (invAddrComplete) {
    addressSource = "INVOICE"
    chosenAddress = {
      street: invoice.sellerStreet ?? null,
      zip: invoice.sellerZip ?? null,
      city: invCity,
      country: invCountry,
    }
  } else {
    blockers.push({ type: "NO_ADDRESS" })
  }

  // ---- Invoice approval + active-run gating ----
  if (invoice.status !== "APPROVED") {
    blockers.push({ type: "NOT_APPROVED" })
  }
  if (options.inActivePaymentRun) {
    blockers.push({ type: "ALREADY_IN_ACTIVE_RUN" })
  }

  // ---- Status derivation ----
  const hardBlockerTypes: Array<BlockerReason["type"]> = [
    "NO_IBAN",
    "NO_ADDRESS",
    "NO_SUPPLIER",
    "IBAN_INVALID",
    "NOT_APPROVED",
    "ALREADY_IN_ACTIVE_RUN",
  ]
  const hasHardBlocker = blockers.some((b) => hardBlockerTypes.includes(b.type))
  const hasConflict = blockers.some(
    (b) => b.type === "IBAN_CONFLICT" || b.type === "ADDRESS_CONFLICT"
  )

  let status: RowStatus
  if (hasHardBlocker) status = "RED"
  else if (hasConflict) status = "YELLOW"
  else status = "GREEN"

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    supplierId: invoice.supplierId,
    supplierName,
    dueDate: invoice.dueDate,
    amountCents: decimalToCents(invoice.totalGross),
    iban: {
      iban: chosenIban,
      bic: chosenBic,
      source: ibanSource,
      conflict: ibanConflict,
    },
    address: {
      creditorName: supplierName,
      street: chosenAddress.street,
      zip: chosenAddress.zip,
      city: chosenAddress.city,
      country: chosenAddress.country,
      source: addressSource,
      conflict: addressConflict,
    },
    status,
    blockers,
  }
}

/**
 * Shared invoice-include so resolver callers don't drift from the
 * supplier + bankAccount shape expected above.
 */
export const RESOLVER_INVOICE_INCLUDE = {
  supplier: {
    select: {
      id: true,
      company: true,
      street: true,
      zip: true,
      city: true,
      country: true,
      bankAccounts: {
        orderBy: [
          { isDefault: "desc" as const },
          { createdAt: "asc" as const },
        ],
        select: { iban: true, bic: true },
      },
    },
  },
}

/**
 * Resolve a single invoice by id — for the create-path safety check.
 */
export async function resolveRow(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  choices: ResolveChoice = {},
  options: { inActivePaymentRun?: boolean } = {}
): Promise<ResolvedRow | null> {
  const invoice = await prisma.inboundInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: RESOLVER_INVOICE_INCLUDE,
  })
  if (!invoice) return null
  return resolveFromLoaded(
    invoice as unknown as Parameters<typeof resolveFromLoaded>[0],
    choices,
    options
  )
}
