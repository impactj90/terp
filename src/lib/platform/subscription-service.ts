/**
 * Platform Subscription Service (Phase 10a).
 *
 * Bridges platform module bookings to BillingRecurringInvoice rows in the
 * designated operator tenant. The operator tenant is identified by the
 * PLATFORM_OPERATOR_TENANT_ID env var.
 *
 * All functions accept prisma as a plain parameter. Audit entries land in
 * platform_audit_logs (via the caller) and tenant-side audit_logs
 * (transitively via the underlying service calls with PLATFORM_SYSTEM_USER_ID
 * as the audit userId).
 *
 * THIS SERVICE DOES NOT WRITE platform_audit_logs ITSELF. The caller
 * (tenantManagement.enableModule / disableModule) writes one platform audit
 * entry per booking via platformAudit.log(). Keeping the audit write at the
 * caller level matches the pattern of every other mutation in tenantManagement.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { serverEnv } from "@/lib/config"
import { PLATFORM_SYSTEM_USER_ID } from "@/trpc/init"
import type { ModuleId } from "@/lib/modules/constants"
import { getModulePrice, type BillingCycle } from "./module-pricing"
import * as crmAddressService from "@/lib/services/crm-address-service"
import * as billingRecurringService from "@/lib/services/billing-recurring-invoice-service"

type Tx = PrismaClient | Prisma.TransactionClient

export class PlatformSubscriptionConfigError extends Error {
  constructor() {
    super("PLATFORM_OPERATOR_TENANT_ID is not configured")
    this.name = "PlatformSubscriptionConfigError"
  }
}

export class PlatformSubscriptionNotFoundError extends Error {
  constructor(id: string) {
    super(`Platform subscription not found: ${id}`)
    this.name = "PlatformSubscriptionNotFoundError"
  }
}

/**
 * Refusal error: the operator tenant cannot bill itself. Thrown by
 * createSubscription as defense-in-depth — callers should check
 * isOperatorTenant() first and skip the subscription block entirely.
 */
export class PlatformSubscriptionSelfBillError extends Error {
  constructor(tenantId: string) {
    super(
      `Refusing to create a subscription for the operator tenant itself (${tenantId}). ` +
        `The operator tenant is the "house" — modules used internally are not billed. ` +
        `Callers must check isOperatorTenant() before invoking createSubscription.`,
    )
    this.name = "PlatformSubscriptionSelfBillError"
  }
}

/**
 * Returns the operator tenant id, or throws if unconfigured.
 */
export function requireOperatorTenantId(): string {
  if (!serverEnv.platformOperatorTenantId) {
    throw new PlatformSubscriptionConfigError()
  }
  return serverEnv.platformOperatorTenantId
}

export function isSubscriptionBillingEnabled(): boolean {
  return serverEnv.platformOperatorTenantId !== ""
}

/**
 * True if the given tenant id IS the operator tenant — the "house".
 * Modules used by the house tenant on itself must NOT be billed
 * (no self-issued invoices, no CrmAddress duplication, no
 * BillingRecurringInvoice). The operator-tenant identity is fixed at
 * deploy time via PLATFORM_OPERATOR_TENANT_ID, so this is a constant-
 * time string comparison — not a DB lookup.
 *
 * Callers (enableModule / disableModule / any future subscription
 * mutation entry point) must check this BEFORE calling createSubscription
 * or cancelSubscription. createSubscription itself also enforces this as
 * defense-in-depth via PlatformSubscriptionSelfBillError.
 *
 * Returns false when subscription billing is unconfigured — there is no
 * "operator tenant" to be in that case, so nothing is the house.
 */
export function isOperatorTenant(tenantId: string): boolean {
  const operator = serverEnv.platformOperatorTenantId
  return operator !== "" && operator === tenantId
}

/**
 * Map common country names (German + English) to ISO-3166 alpha-2 codes.
 *
 * `tenants.address_country` is `varchar(100)` (free-form user input) while
 * `crm_addresses.country` is `varchar(10)` (expected to hold an ISO code).
 * A tenant entered as "Deutschland" (11 chars) cannot be copied 1:1 into
 * the CrmAddress or the insert fails with "value too long for column".
 *
 * Lookup is lowercase + trimmed. Unknown input longer than 10 chars is
 * truncated as a last resort so the insert succeeds; known short input
 * passes through upper-cased.
 */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  deutschland: "DE",
  germany: "DE",
  österreich: "AT",
  oesterreich: "AT",
  austria: "AT",
  schweiz: "CH",
  switzerland: "CH",
  liechtenstein: "LI",
  frankreich: "FR",
  france: "FR",
  italien: "IT",
  italy: "IT",
  niederlande: "NL",
  netherlands: "NL",
  belgien: "BE",
  belgium: "BE",
  luxemburg: "LU",
  luxembourg: "LU",
  spanien: "ES",
  spain: "ES",
  portugal: "PT",
  polen: "PL",
  poland: "PL",
  tschechien: "CZ",
  czechia: "CZ",
  "czech republic": "CZ",
  ungarn: "HU",
  hungary: "HU",
  vereinigtes_königreich: "GB",
  "vereinigtes königreich": "GB",
  grossbritannien: "GB",
  großbritannien: "GB",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  irland: "IE",
  ireland: "IE",
  dänemark: "DK",
  daenemark: "DK",
  denmark: "DK",
  schweden: "SE",
  sweden: "SE",
  norwegen: "NO",
  norway: "NO",
  finnland: "FI",
  finland: "FI",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  kanada: "CA",
  canada: "CA",
  türkei: "TR",
  tuerkei: "TR",
  turkey: "TR",
}

export function normalizeCountryToIso(
  input: string | null | undefined,
): string {
  if (!input) return "DE"
  const trimmed = input.trim()
  if (!trimmed) return "DE"
  const mapped = COUNTRY_NAME_TO_ISO[trimmed.toLowerCase()]
  if (mapped) return mapped
  // Already a short form (ISO code, e.g. "DE", "AT") — just normalize case.
  if (trimmed.length <= 10) return trimmed.toUpperCase()
  // Unknown long-form name — hard-truncate so the insert succeeds. The
  // operator can fix it manually in the CrmAddress row if needed.
  return trimmed.slice(0, 10).toUpperCase()
}

/**
 * Find-or-create the CrmAddress inside the operator tenant representing
 * a customer tenant. If any existing platform_subscription for this customer
 * already points at a CrmAddress, reuse it. Otherwise create a new one from
 * the customer tenant's address fields.
 *
 * NOTE: At 0-5 customers with sequential operator clicks, concurrent
 * bookings for the same new customer are extremely unlikely. No transaction-
 * level lock is added. If a duplicate CrmAddress slips through, the operator
 * can manually delete one — it's a rare cosmetic issue, not a data bug.
 */
export async function findOrCreateOperatorCrmAddress(
  prisma: Tx,
  customerTenantId: string,
): Promise<string> {
  const operatorTenantId = requireOperatorTenantId()

  const existing = await prisma.platformSubscription.findFirst({
    where: {
      tenantId: customerTenantId,
      operatorCrmAddressId: { not: null },
    },
    select: { operatorCrmAddressId: true },
  })
  if (existing?.operatorCrmAddressId) {
    return existing.operatorCrmAddressId
  }

  const customerTenant = await prisma.tenant.findUnique({
    where: { id: customerTenantId },
    select: {
      name: true,
      email: true,
      addressStreet: true,
      addressZip: true,
      addressCity: true,
      addressCountry: true,
    },
  })
  if (!customerTenant) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Customer tenant ${customerTenantId} not found`,
    })
  }

  const newAddress = await crmAddressService.create(
    prisma as PrismaClient,
    operatorTenantId,
    {
      type: "CUSTOMER",
      company: customerTenant.name,
      street: customerTenant.addressStreet ?? undefined,
      zip: customerTenant.addressZip ?? undefined,
      city: customerTenant.addressCity ?? undefined,
      country: normalizeCountryToIso(customerTenant.addressCountry),
      email: customerTenant.email ?? undefined,
    },
    PLATFORM_SYSTEM_USER_ID,
  )

  return newAddress.id
}

export interface CreateSubscriptionInput {
  customerTenantId: string
  module: ModuleId
  billingCycle: BillingCycle
  startDate?: Date
}

export interface CreateSubscriptionResult {
  subscriptionId: string
  operatorCrmAddressId: string
  billingRecurringInvoiceId: string
  /** True if this subscription joined an existing shared recurring invoice; false if it created a new one. */
  joinedExistingRecurring: boolean
}

/**
 * Marker format: stored in the recurring invoice's `internalNotes` so the
 * autofinalize cron can precisely identify which DRAFT BillingDocument to
 * finalize, even when a customer has multiple subscriptions. The marker
 * is copied verbatim onto each generated BillingDocument by the existing
 * `billing-recurring-invoice-service.generate()` at line 357.
 *
 * Under the shared-invoice model, a recurring invoice's internalNotes
 * field contains a space-separated list of markers (one per subscription
 * currently sharing it). The autofinalize cron uses `contains` matching
 * on a single subscription's marker, which works correctly regardless
 * of how many other markers are present.
 */
export function platformSubscriptionMarker(subscriptionId: string): string {
  return `[platform_subscription:${subscriptionId}]`
}

type PlatformPositionTemplateEntry = {
  type: "FREE"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
}

function buildPositionForModule(
  module: ModuleId,
  cycle: BillingCycle,
): PlatformPositionTemplateEntry {
  const { unitPrice, vatRate, description } = getModulePrice(module, cycle)
  return {
    type: "FREE",
    description,
    quantity: 1,
    unit: cycle === "MONTHLY" ? "Monat" : "Jahr",
    unitPrice,
    vatRate,
  }
}

/**
 * Appends a new subscription marker to an existing internalNotes string.
 * Handles the null/empty case and the space-separator convention.
 */
export function appendMarker(
  existingInternalNotes: string | null,
  subscriptionId: string,
): string {
  const marker = platformSubscriptionMarker(subscriptionId)
  const existing = (existingInternalNotes ?? "").trim()
  return existing.length > 0 ? `${existing} ${marker}` : marker
}

/**
 * Removes a single subscription marker from an internalNotes string.
 * Used by cancelSubscription Path B when other subs still share the
 * recurring invoice.
 */
export function removeMarker(
  existingInternalNotes: string | null,
  subscriptionId: string,
): string {
  const marker = platformSubscriptionMarker(subscriptionId)
  const existing = existingInternalNotes ?? ""
  return existing
    .split(/\s+/)
    .filter((token) => token.length > 0 && token !== marker)
    .join(" ")
}

/**
 * Create a new subscription for a customer tenant + module.
 *
 * Under the shared-invoice model, this EITHER creates a new
 * BillingRecurringInvoice for this (customer, cycle) combination OR joins
 * an existing one by appending a position + marker.
 *
 * Steps (all inside a single $transaction):
 *   1. Find-or-create the CrmAddress in the operator tenant.
 *   2. Insert the platform_subscriptions row FIRST (with
 *      billing_recurring_invoice_id=null) so we have an id for the marker.
 *   3. Look for an existing active BillingRecurringInvoice for this
 *      (operatorTenantId, crmAddressId, matching interval).
 *   4a. If none: create a new one with positionTemplate=[thisModulePosition]
 *       and internalNotes=thisSubMarker.
 *   4b. If exists: update it with appended position + appended marker.
 *   5. Update platform_subscriptions.billingRecurringInvoiceId.
 */
export async function createSubscription(
  prisma: PrismaClient,
  input: CreateSubscriptionInput,
  platformUserId: string,
): Promise<CreateSubscriptionResult> {
  const operatorTenantId = requireOperatorTenantId()

  // Defense-in-depth: refuse to create a subscription where the customer
  // is the operator tenant itself. Callers should check isOperatorTenant()
  // first; this throw is the safety net.
  if (input.customerTenantId === operatorTenantId) {
    throw new PlatformSubscriptionSelfBillError(input.customerTenantId)
  }

  const startDate = input.startDate ?? new Date()
  const { unitPrice } = getModulePrice(input.module, input.billingCycle)
  const interval: "MONTHLY" | "ANNUALLY" =
    input.billingCycle === "MONTHLY" ? "MONTHLY" : "ANNUALLY"

  return await prisma.$transaction(async (tx) => {
    const operatorCrmAddressId = await findOrCreateOperatorCrmAddress(
      tx,
      input.customerTenantId,
    )

    const sub = await tx.platformSubscription.create({
      data: {
        tenantId: input.customerTenantId,
        module: input.module,
        status: "active",
        billingCycle: input.billingCycle,
        unitPrice,
        currency: "EUR",
        startDate,
        operatorCrmAddressId,
        billingRecurringInvoiceId: null,
        createdByPlatformUserId: platformUserId,
      },
    })

    const existingRecurring = await tx.billingRecurringInvoice.findFirst({
      where: {
        tenantId: operatorTenantId,
        addressId: operatorCrmAddressId,
        interval,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, positionTemplate: true, internalNotes: true },
    })

    const newPosition = buildPositionForModule(input.module, input.billingCycle)

    let billingRecurringInvoiceId: string
    let joinedExistingRecurring: boolean

    if (!existingRecurring) {
      const recurring = await billingRecurringService.create(
        tx as PrismaClient,
        operatorTenantId,
        {
          name: `Abo ${interval.toLowerCase()} — Tenant ${input.customerTenantId.slice(0, 8)}`,
          addressId: operatorCrmAddressId,
          interval,
          startDate,
          autoGenerate: true,
          positionTemplate: [newPosition],
          paymentTermDays: 14,
          internalNotes: platformSubscriptionMarker(sub.id),
        },
        PLATFORM_SYSTEM_USER_ID,
      )
      billingRecurringInvoiceId = recurring.id
      joinedExistingRecurring = false
    } else {
      const existingPositions =
        (existingRecurring.positionTemplate as unknown as PlatformPositionTemplateEntry[]) ?? []
      const updatedPositions = [...existingPositions, newPosition]
      const updatedNotes = appendMarker(existingRecurring.internalNotes, sub.id)

      await billingRecurringService.update(
        tx as PrismaClient,
        operatorTenantId,
        {
          id: existingRecurring.id,
          positionTemplate: updatedPositions as unknown as Array<Record<string, unknown>>,
          internalNotes: updatedNotes,
        },
      )
      billingRecurringInvoiceId = existingRecurring.id
      joinedExistingRecurring = true
    }

    await tx.platformSubscription.update({
      where: { id: sub.id },
      data: { billingRecurringInvoiceId },
    })

    return {
      subscriptionId: sub.id,
      operatorCrmAddressId,
      billingRecurringInvoiceId,
      joinedExistingRecurring,
    }
  })
}

export interface CancelSubscriptionInput {
  subscriptionId: string
  reason: string
  cancelledAt?: Date
}

/**
 * Cancel a subscription.
 *
 * ## Two cancellation paths under the shared-invoice model
 *
 * Because multiple subscriptions can share ONE recurring invoice, cancel
 * has to branch on "am I the last active subscription on this recurring?":
 *
 * **Path A — LAST active subscription on the recurring invoice**:
 * Set endDate on the recurring invoice so the cron stops generating. Uses
 * the `nextDueDate - 1ms` formula (see code comments). Zero further
 * invoices generated.
 *
 * **Path B — OTHER active subscriptions still share the recurring invoice**:
 * Remove THIS module's position from `positionTemplate` and THIS
 * subscription's marker from `internalNotes`. The recurring invoice
 * continues to generate invoices with the remaining positions for the
 * remaining subscriptions. NO endDate change on the recurring invoice.
 *
 * In BOTH paths, the `platform_subscriptions` row is marked `cancelled`
 * with the reason + metadata.
 *
 * ## endDate semantics — VERIFIED against existing Terp code (Path A only)
 *
 * The existing `billing-recurring-invoice-service.generate()` has two
 * endDate checks, both using strict `>` comparison. Setting
 * `endDate = nextDueDate - 1 ms` is strictly less than nextDueDate and
 * reliably trips the upfront gate. 1ms resolution is fine on a single
 * Vercel/Postgres deployment.
 */
export async function cancelSubscription(
  prisma: PrismaClient,
  input: CancelSubscriptionInput,
  platformUserId: string,
): Promise<void> {
  const operatorTenantId = requireOperatorTenantId()
  const cancelledAt = input.cancelledAt ?? new Date()

  await prisma.$transaction(async (tx) => {
    const sub = await tx.platformSubscription.findUnique({
      where: { id: input.subscriptionId },
    })
    if (!sub) {
      throw new PlatformSubscriptionNotFoundError(input.subscriptionId)
    }
    if (sub.status !== "active") {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Subscription is already ${sub.status}`,
      })
    }

    // Default: the subscription's own endDate = cancelledAt. Path A may
    // override this to "nextDueDate - 1ms" so the subscription row matches
    // the actual billing end.
    let subEndDate: Date = cancelledAt

    if (sub.billingRecurringInvoiceId) {
      const siblingCount = await tx.platformSubscription.count({
        where: {
          billingRecurringInvoiceId: sub.billingRecurringInvoiceId,
          status: "active",
          id: { not: sub.id },
        },
      })

      const ri = await tx.billingRecurringInvoice.findFirst({
        where: {
          id: sub.billingRecurringInvoiceId,
          tenantId: operatorTenantId,
        },
        select: {
          nextDueDate: true,
          positionTemplate: true,
          internalNotes: true,
        },
      })

      if (!ri) {
        console.warn(
          `[subscription-service] cancelSubscription: recurring invoice ${sub.billingRecurringInvoiceId} ` +
            `for subscription ${sub.id} not found in operator tenant ${operatorTenantId}. ` +
            `Marking subscription cancelled without touching the recurring template.`,
        )
      } else if (siblingCount === 0) {
        // Path A: last active sub → set endDate on the recurring invoice
        // so the next cron run skips generation and deactivates the template.
        subEndDate = new Date(ri.nextDueDate.getTime() - 1)
        await billingRecurringService.update(
          tx as PrismaClient,
          operatorTenantId,
          {
            id: sub.billingRecurringInvoiceId,
            endDate: subEndDate,
          },
        )
      } else {
        // Path B: other subs still share this recurring → remove position +
        // marker but keep the recurring invoice active.
        const targetDescription = getModulePrice(
          sub.module as ModuleId,
          sub.billingCycle as BillingCycle,
        ).description

        const currentPositions =
          (ri.positionTemplate as unknown as PlatformPositionTemplateEntry[]) ?? []

        const removedIndex = currentPositions.findIndex(
          (p) => p.description === targetDescription,
        )
        if (removedIndex === -1) {
          console.warn(
            `[subscription-service] cancelSubscription Path B: no position found ` +
              `in recurring invoice ${sub.billingRecurringInvoiceId} matching description ` +
              `"${targetDescription}" for subscription ${sub.id} module ${sub.module}. ` +
              `The description may have been manually edited in the tenant-side UI (FLAG 9). ` +
              `Marker will still be removed and subscription will still be marked cancelled.`,
          )
        }
        const filteredPositions =
          removedIndex === -1
            ? currentPositions
            : [
                ...currentPositions.slice(0, removedIndex),
                ...currentPositions.slice(removedIndex + 1),
              ]
        const filteredNotes = removeMarker(ri.internalNotes, sub.id)

        await billingRecurringService.update(
          tx as PrismaClient,
          operatorTenantId,
          {
            id: sub.billingRecurringInvoiceId,
            positionTemplate: filteredPositions as unknown as Array<Record<string, unknown>>,
            internalNotes: filteredNotes,
          },
        )
      }
    }

    await tx.platformSubscription.update({
      where: { id: sub.id },
      data: {
        status: "cancelled",
        endDate: subEndDate,
        cancelledAt,
        cancelledByPlatformUserId: platformUserId,
        cancellationReason: input.reason,
      },
    })
  })
}

/**
 * List all subscriptions for a customer tenant, including historical.
 *
 * Because `PlatformSubscription` has no Prisma `@relation` fields
 * (constraint: Terp models untouched), we cannot use `include`. Instead,
 * we fetch subscriptions first, then batch-load the related recurring
 * invoice and last-generated-invoice rows in two follow-up queries.
 *
 * Defense-in-depth: the batch queries additionally filter by
 * `tenantId = operatorTenantId`.
 *
 * When `PLATFORM_OPERATOR_TENANT_ID` is unset, follow-up queries are
 * skipped — subscriptions are returned with null relations.
 */
export async function listForCustomer(
  prisma: PrismaClient,
  customerTenantId: string,
) {
  const subs = await prisma.platformSubscription.findMany({
    where: { tenantId: customerTenantId },
    orderBy: [
      { status: "asc" },
      { startDate: "desc" },
    ],
  })
  if (subs.length === 0) return []

  const operatorTenantId = serverEnv.platformOperatorTenantId
  if (!operatorTenantId) {
    return subs.map((sub) => ({
      ...sub,
      billingRecurringInvoice: null as null | {
        id: string
        nextDueDate: Date
        lastGeneratedAt: Date | null
        isActive: boolean
      },
      lastGeneratedInvoice: null as null | {
        id: string
        number: string
        documentDate: Date
        paymentTermDays: number | null
        totalGross: number
        status: string
      },
    }))
  }

  const recurringIds = Array.from(
    new Set(subs.map((s) => s.billingRecurringInvoiceId).filter((x): x is string => x !== null)),
  )
  const lastInvoiceIds = Array.from(
    new Set(subs.map((s) => s.lastGeneratedInvoiceId).filter((x): x is string => x !== null)),
  )

  const [recurring, lastInvoices] = await Promise.all([
    recurringIds.length > 0
      ? prisma.billingRecurringInvoice.findMany({
          where: {
            id: { in: recurringIds },
            tenantId: operatorTenantId,
          },
          select: {
            id: true,
            nextDueDate: true,
            lastGeneratedAt: true,
            isActive: true,
          },
        })
      : [],
    lastInvoiceIds.length > 0
      ? prisma.billingDocument.findMany({
          where: {
            id: { in: lastInvoiceIds },
            tenantId: operatorTenantId,
          },
          select: {
            id: true,
            number: true,
            documentDate: true,
            paymentTermDays: true,
            totalGross: true,
            status: true,
          },
        })
      : [],
  ])

  const recurringById = new Map(recurring.map((r) => [r.id, r]))
  const lastInvoiceById = new Map(lastInvoices.map((i) => [i.id, i]))

  return subs.map((sub) => ({
    ...sub,
    billingRecurringInvoice: sub.billingRecurringInvoiceId
      ? recurringById.get(sub.billingRecurringInvoiceId) ?? null
      : null,
    lastGeneratedInvoice: sub.lastGeneratedInvoiceId
      ? lastInvoiceById.get(sub.lastGeneratedInvoiceId) ?? null
      : null,
  }))
}

/**
 * Mark subscriptions as "ended" when their recurring template has gone
 * inactive. Called from the cron post-step.
 */
export async function sweepEndedSubscriptions(prisma: PrismaClient): Promise<number> {
  const operatorTenantId = serverEnv.platformOperatorTenantId
  if (!operatorTenantId) return 0

  const cancelled = await prisma.platformSubscription.findMany({
    where: {
      status: "cancelled",
      billingRecurringInvoiceId: { not: null },
    },
    select: { id: true, billingRecurringInvoiceId: true },
  })
  if (cancelled.length === 0) return 0

  const recurringIds = cancelled
    .map((s) => s.billingRecurringInvoiceId)
    .filter((x): x is string => x !== null)
  const recurring = await prisma.billingRecurringInvoice.findMany({
    where: {
      id: { in: recurringIds },
      tenantId: operatorTenantId,
    },
    select: { id: true, isActive: true },
  })
  const isActiveById = new Map(recurring.map((r) => [r.id, r.isActive]))

  let ended = 0
  for (const sub of cancelled) {
    if (!sub.billingRecurringInvoiceId) continue
    const stillActive = isActiveById.get(sub.billingRecurringInvoiceId)
    if (stillActive === false) {
      await prisma.platformSubscription.update({
        where: { id: sub.id },
        data: {
          status: "ended",
          actualEndDate: new Date(),
        },
      })
      ended++
    }
  }
  return ended
}
