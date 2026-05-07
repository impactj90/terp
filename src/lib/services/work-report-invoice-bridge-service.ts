/**
 * WorkReport → BillingDocument Bridge Service
 *
 * Bridges a SIGNED `WorkReport` into a DRAFT `BillingDocument` (INVOICE)
 * by translating the report's `OrderBooking[]` (selectively scoped via
 * `workReportId`) and `travelMinutes` into proposed positions, then
 * creating the `BillingDocument` + positions atomically with a dual
 * audit trail.
 *
 * Bindings:
 * - Idempotency lives in the service layer (no DB unique-constraint).
 *   Reason: storno → re-generate must succeed; a partial unique on
 *   `status != "CANCELLED"` would block re-issue after legitimate
 *   cancellation. The check uses the index added by migration
 *   `20260507000000_add_workreport_idempotency_links.sql`.
 * - Stundensatz lookup chain: `Order.billingRatePerHour` →
 *   `Employee.hourlyRate` → null. When `null` survives, the position
 *   is flagged `requiresManualPrice: true` for the UI to highlight.
 * - Anfahrt-Position uses the maximum hourly rate across all assigned
 *   employees (defensive — see Handbuch §13 for rationale). When
 *   `Order.billingRatePerHour` is set, it overrides the per-employee
 *   logic uniformly.
 * - Address is resolved exclusively from
 *   `WorkReport.serviceObject.customerAddressId`. No fallback to Order
 *   (Order has no `customerAddressId` FK in the current schema; see
 *   Deviation D-1 in the implementation plan).
 *
 * Plan: thoughts/shared/plans/2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md
 */
import type { PrismaClient } from "@/generated/prisma/client"

import * as billingDocumentService from "./billing-document-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import {
  resolveLaborRateExtended,
  resolveTravelRateExtended,
} from "./labor-rate-resolver"

// --- Constants ---

/**
 * Default VAT rate for proposed labor + travel positions. Hardcoded at
 * 19% (German Regelsteuersatz) until tenant-wide default-VAT config
 * lands as a follow-up ticket (see plan §IN-3).
 */
export const VAT_DEFAULT = 19.0

const AUDIT_ENTITY_TYPE_WORK_REPORT = "work_report"
const AUDIT_ENTITY_TYPE_BILLING_DOCUMENT = "billing_document"

// --- Types ---

/**
 * Proposed position emitted by `computeProposedPositions()`. Each row
 * is one of:
 *   - "labor": derived from a single OrderBooking
 *   - "travel": single aggregated row from WorkReport.travelMinutes
 *
 * The UI uses `sourceBookingId` and `employeeId` for traceability and
 * `requiresManualPrice` to flag rows where the lookup chain returned
 * null (Order has no rate AND assigned employees have no hourlyRate).
 */
export interface ProposedPosition {
  kind: "labor" | "travel"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
  sourceBookingId?: string
  employeeId?: string
  requiresManualPrice: boolean
}

/**
 * Position override sent by the UI when the operator confirms generation.
 * `kind: "manual"` covers operator-added rows that have no `sourceBookingId`.
 * The shape is purposefully a strict subset of `ProposedPosition` —
 * traceability metadata (`employeeId`, `requiresManualPrice`) is dropped
 * because it is UI-only.
 */
export interface PositionOverride {
  kind: "labor" | "travel" | "manual"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
  sourceBookingId?: string
}

// --- Error Classes ---
//
// Each class sets `this.name` explicitly so `handleServiceError`
// (src/trpc/errors.ts) maps the right TRPCError code in production
// where minification would otherwise mangle `constructor.name`.

export class WorkReportNotFoundError extends Error {
  constructor(message = "WorkReport not found") {
    super(message)
    this.name = "WorkReportNotFoundError"
  }
}

/**
 * Generate was attempted on a record that is not in SIGNED. Maps to
 * PRECONDITION_FAILED via the new suffix added to handleServiceError.
 */
export class WorkReportNotEligibleForInvoicePreconditionFailedError extends Error {
  public readonly status: string

  constructor(status: string) {
    super(`Arbeitsschein muss SIGNED sein (aktuell: ${status})`)
    this.name = "WorkReportNotEligibleForInvoicePreconditionFailedError"
    this.status = status
  }
}

/**
 * A non-CANCELLED BillingDocument already references this WorkReport.
 * Maps to CONFLICT. Carries the existing-doc context so the UI can
 * render a "Zur Rechnung" link without re-querying.
 */
export class WorkReportAlreadyInvoicedConflictError extends Error {
  public readonly existingDocumentId: string
  public readonly existingDocumentNumber: string
  public readonly existingDocumentStatus: string

  constructor(
    existingDocumentId: string,
    existingDocumentNumber: string,
    existingDocumentStatus: string,
  ) {
    super(
      `Für diesen Arbeitsschein existiert bereits Rechnung ${existingDocumentNumber} (Status: ${existingDocumentStatus})`,
    )
    this.name = "WorkReportAlreadyInvoicedConflictError"
    this.existingDocumentId = existingDocumentId
    this.existingDocumentNumber = existingDocumentNumber
    this.existingDocumentStatus = existingDocumentStatus
  }
}

/**
 * The WorkReport has no resolvable customer address. Hard fail per
 * Deviation D-1 — `BillingDocument.addressId` is NON-NULL in the
 * schema, so we cannot create a draft without one.
 */
export class WorkReportNoAddressPreconditionFailedError extends Error {
  constructor() {
    super(
      "Diesem Arbeitsschein ist kein Service-Objekt mit Kunden-Adresse zugeordnet. Bitte das Service-Objekt im Auftrag setzen, dann erneut versuchen.",
    )
    this.name = "WorkReportNoAddressPreconditionFailedError"
  }
}

// --- Helpers ---

function decimalToNumber(d: unknown): number | null {
  if (d === null || d === undefined) return null
  if (typeof d === "number") return d
  if (typeof d === "object" && d !== null && "toNumber" in d) {
    return (d as { toNumber(): number }).toNumber()
  }
  // String fallback (Prisma JSON returns Decimal as string sometimes)
  const parsed = Number(d)
  return Number.isFinite(parsed) ? parsed : null
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Coerce a rate field to a positive number, treating null/0/negative
 * as "no rate set". A 0,00 EUR/h rate is semantically equivalent to
 * "operator forgot to enter a rate" — billing at 0 silently is a
 * production foot-gun, so we surface it as `requiresManualPrice` in
 * the same way as a NULL.
 */
function toPositiveRate(value: unknown): number | null {
  const n = decimalToNumber(value)
  if (n === null) return null
  if (n <= 0) return null
  return n
}

// NK-1 (Decision 28): Bridge no longer carries its own resolver.
// Both labor and travel rate resolution live in
// `labor-rate-resolver.ts`, imported below as
// `resolveLaborRateExtended` / `resolveTravelRateExtended`.

// --- Public API ---

/**
 * Compute the read-only list of proposed positions for the generate
 * dialog. No side effects — safe to call repeatedly while the operator
 * tweaks the form.
 *
 * Sort order:
 *   1. Labor positions, chronologically by booking date then created.
 *   2. Travel position last (single row aggregating travelMinutes).
 *
 * Throws `WorkReportNotFoundError` if the report doesn't exist in the
 * tenant. Cross-tenant access surfaces here (no separate ForbiddenError).
 */
export async function computeProposedPositions(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
): Promise<ProposedPosition[]> {
  const workReport = await prisma.workReport.findFirst({
    where: { id: workReportId, tenantId },
    include: {
      assignments: {
        include: {
          employee: { include: { wageGroup: true } },
        },
      },
      order: true,
    },
  })
  if (!workReport) {
    throw new WorkReportNotFoundError()
  }

  const orderRate = workReport.order?.billingRatePerHour ?? null

  // Selectively scoped to bookings tagged with this WorkReport. Other
  // bookings on the same order remain available for separate generates.
  // NK-1 (Decision 14): also pull employee.wageGroup and the activity's
  // pricing config so the resolver has all inputs.
  const bookings = await prisma.orderBooking.findMany({
    where: { tenantId, workReportId },
    include: {
      activity: true,
      employee: { include: { wageGroup: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { createdAt: "asc" }],
  })

  const positions: ProposedPosition[] = []

  for (const booking of bookings) {
    // NK-1 (Decision 14): prefer the persisted snapshot; live-lookup
    // is the fallback for legacy bookings that pre-date Phase 3.
    let rate: number | null
    if (booking.hourlyRateAtBooking != null) {
      rate = toPositiveRate(booking.hourlyRateAtBooking)
    } else {
      const resolved = resolveLaborRateExtended({
        bookingActivity: booking.activity,
        orderRate,
        employeeWageGroupRate:
          booking.employee?.wageGroup?.billingHourlyRate ?? null,
        employeeRate: booking.employee?.hourlyRate ?? null,
      })
      rate = resolved.rate
    }
    const requiresManualPrice = rate === null
    const unitPrice = rate ?? 0

    // Description: `${activity.name}: ${booking.description}` if both,
    // else whichever is present, falling back to "Arbeitsleistung".
    const activityName = booking.activity?.name?.trim() ?? null
    const bookingDescription = booking.description?.trim() ?? null
    let description: string
    if (activityName && bookingDescription) {
      description = `${activityName}: ${bookingDescription}`
    } else if (activityName) {
      description = activityName
    } else if (bookingDescription) {
      description = bookingDescription
    } else {
      description = "Arbeitsleistung"
    }

    const quantity = roundTo2(booking.timeMinutes / 60)

    positions.push({
      kind: "labor",
      description,
      quantity,
      unit: "h",
      unitPrice,
      vatRate: VAT_DEFAULT,
      sourceBookingId: booking.id,
      employeeId: booking.employeeId,
      requiresManualPrice,
    })
  }

  if (workReport.travelMinutes && workReport.travelMinutes > 0) {
    // NK-1 (Decision 27): prefer the snapshot persisted at sign time.
    // Falls back to a live lookup (which now includes WageGroup) for
    // DRAFT scheine and pre-NK-1 SIGNED scheine.
    let travelRate: number | null
    if (workReport.travelRateAtSign != null) {
      travelRate = toPositiveRate(workReport.travelRateAtSign)
    } else {
      type AssignmentWithWg = {
        employee: {
          hourlyRate: import("@prisma/client/runtime/client").Decimal | null
          wageGroup: {
            billingHourlyRate:
              | import("@prisma/client/runtime/client").Decimal
              | null
          } | null
        } | null
      }
      const resolved = resolveTravelRateExtended({
        orderRate,
        assignmentEmployees: (workReport.assignments ?? []).map((a) => {
          const aWg = a as unknown as AssignmentWithWg
          return {
            hourlyRate: aWg.employee?.hourlyRate ?? null,
            wageGroup: aWg.employee?.wageGroup ?? null,
          }
        }),
      })
      travelRate = resolved.rate
    }
    const requiresManualPrice = travelRate === null
    const unitPrice = travelRate ?? 0

    positions.push({
      kind: "travel",
      description: `Anfahrt: ${workReport.travelMinutes} Minuten`,
      quantity: roundTo2(workReport.travelMinutes / 60),
      unit: "h",
      unitPrice,
      vatRate: VAT_DEFAULT,
      requiresManualPrice,
    })
  }

  return positions
}

/**
 * Atomically generate a DRAFT BillingDocument from a SIGNED WorkReport.
 *
 * Flow:
 *   1. Load the WorkReport (with assignments + order + serviceObject).
 *   2. Validate state (SIGNED), idempotency (no non-CANCELLED existing
 *      doc), and address resolution (`serviceObject.customerAddressId`
 *      must exist).
 *   3. Compute or accept-via-override the proposed positions.
 *   4. Inside `prisma.$transaction`:
 *      - Create the BillingDocument with `workReportId` set.
 *      - Create each position via `addPosition()`.
 *      - Write two audit_logs rows (entity=work_report + entity=billing_document)
 *        with cross-link metadata. Audit log writes never throw — failures
 *        are logged but do not roll back the transaction.
 *   5. Return the new document's id + number.
 *
 * Cross-tenant isolation: enforced at step 1 — `findFirst` with
 * `tenantId` filter returns `null` for tenants without access, which
 * surfaces as `WorkReportNotFoundError`.
 */
export async function generateInvoiceFromWorkReport(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
  userId: string,
  options?: { positionsOverride?: PositionOverride[] },
  audit?: AuditContext,
): Promise<{ id: string; number: string }> {
  // 1. Load the WorkReport with everything needed for proposals + address.
  const workReport = await prisma.workReport.findFirst({
    where: { id: workReportId, tenantId },
    include: {
      assignments: { include: { employee: true } },
      order: true,
      serviceObject: { include: { customerAddress: true } },
    },
  })
  if (!workReport) {
    throw new WorkReportNotFoundError()
  }

  // 2a. State precondition.
  if (workReport.status !== "SIGNED") {
    throw new WorkReportNotEligibleForInvoicePreconditionFailedError(
      workReport.status,
    )
  }

  // 2b. Idempotency: any non-CANCELLED BillingDocument referencing this
  // WorkReport blocks generation. CANCELLED docs are intentionally allowed
  // so storno → re-generate works (older doc stays as historical link).
  const existing = await prisma.billingDocument.findFirst({
    where: {
      tenantId,
      workReportId,
      status: { not: "CANCELLED" },
    },
    select: { id: true, number: true, status: true },
  })
  if (existing) {
    throw new WorkReportAlreadyInvoicedConflictError(
      existing.id,
      existing.number,
      existing.status,
    )
  }

  // 2c. Address resolution.
  const addressId = workReport.serviceObject?.customerAddressId ?? null
  if (!addressId) {
    throw new WorkReportNoAddressPreconditionFailedError()
  }

  // 3. Positions: either operator-edited override or freshly computed.
  let positionsToInsert: PositionOverride[]
  if (options?.positionsOverride) {
    positionsToInsert = options.positionsOverride
  } else {
    const proposed = await computeProposedPositions(prisma, tenantId, workReportId)
    positionsToInsert = proposed.map((p) => ({
      kind: p.kind,
      description: p.description,
      quantity: p.quantity,
      unit: p.unit,
      unitPrice: p.unitPrice,
      vatRate: p.vatRate,
      sourceBookingId: p.sourceBookingId,
    }))
  }

  // 4. Create document + positions + dual audit-log inside a single
  // transaction. We delegate document/position creation back to the
  // billing-document-service so all the existing side-effects (number
  // sequencing, total recalculation, audit row for the document itself)
  // run unchanged. The bridge layer adds the two cross-link audit rows
  // for traceability between the work_report and the billing_document.
  const auditCtx: AuditContext = audit ?? {
    userId,
    ipAddress: null,
    userAgent: null,
  }

  const created = await billingDocumentService.create(
    prisma,
    tenantId,
    {
      type: "INVOICE",
      addressId,
      orderId: workReport.orderId ?? undefined,
      workReportId,
      // Service period defaults to the visit date — operator can edit
      // in the DRAFT once the document is open.
      servicePeriodFrom: workReport.visitDate,
      servicePeriodTo: workReport.visitDate,
    },
    userId,
    auditCtx,
  )

  // Add each position. `addPosition` validates DRAFT + recalculates totals
  // for each call; the document just got created in DRAFT so the guard
  // succeeds. Audit rows for individual positions are written by the
  // existing addPosition() implementation.
  for (const p of positionsToInsert) {
    await billingDocumentService.addPosition(
      prisma,
      tenantId,
      {
        documentId: created.id,
        type: "FREE",
        description: p.description,
        quantity: p.quantity,
        unit: p.unit,
        unitPrice: p.unitPrice,
        vatRate: p.vatRate,
      },
      auditCtx,
    )
  }

  // Cross-link audit trail: one row attributed to the work_report
  // (action: "generate_invoice") and one to the billing_document
  // (action: "create" with sourceWorkReportId). Both are fire-and-forget.
  await auditLog
    .log(prisma, {
      tenantId,
      userId,
      action: "generate_invoice",
      entityType: AUDIT_ENTITY_TYPE_WORK_REPORT,
      entityId: workReport.id,
      entityName: workReport.code,
      changes: null,
      metadata: {
        generatedDocumentId: created.id,
        generatedDocumentNumber: created.number,
      },
      ipAddress: auditCtx.ipAddress ?? null,
      userAgent: auditCtx.userAgent ?? null,
    })
    .catch((err) => console.error("[bridge] audit failed:", err))

  // Action label kept to ≤20 chars to satisfy the audit_logs.action
  // column's varchar(20) constraint (see migration 000074).
  await auditLog
    .log(prisma, {
      tenantId,
      userId,
      action: "create_from_wr",
      entityType: AUDIT_ENTITY_TYPE_BILLING_DOCUMENT,
      entityId: created.id,
      entityName: created.number,
      changes: null,
      metadata: {
        sourceWorkReportId: workReport.id,
        sourceWorkReportCode: workReport.code,
      },
      ipAddress: auditCtx.ipAddress ?? null,
      userAgent: auditCtx.userAgent ?? null,
    })
    .catch((err) => console.error("[bridge] audit failed:", err))

  return { id: created.id, number: created.number }
}
