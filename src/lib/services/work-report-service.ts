/**
 * WorkReport Service
 *
 * Business logic for work reports (Arbeitsscheine): CRUD for DRAFT
 * status plus the DRAFT→SIGNED and SIGNED→VOID transitions.
 * Assignments and Attachments live in separate services.
 *
 * Status lifecycle: DRAFT → SIGNED → VOID. Only DRAFT is editable;
 * VOID is a terminal dead-end that preserves the signed archive.
 *
 * Phase 2 covers DRAFT create/read/update/delete plus the atomic
 * DRAFT-guard pattern for update/delete.
 * Phase 6 adds `sign()` — the atomic DRAFT→SIGNED transition with
 * pre-validation, signature PNG upload, IP hashing, PDF persist and
 * a full audit trail.
 * Phase 7 adds `voidReport()` — SIGNED→VOID transition with a
 * mandatory reason. The archived SIGNED PDF stays untouched; a
 * diagonal "STORNIERT" overlay is rendered on-demand at download
 * time.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phases 2 + 6 + 7)
 */
import { randomUUID } from "crypto"

import type { PrismaClient, Prisma } from "@/generated/prisma/client"

import * as repo from "./work-report-repository"
import type { WorkReportWithIncludes } from "./work-report-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import * as numberSeqService from "./number-sequence-service"
import * as workReportPdfService from "./work-report-pdf-service"
import { hashField } from "./field-encryption"
import * as storage from "@/lib/supabase/storage"

// --- Constants ---

const AUDIT_ENTITY_TYPE = "work_report"

const TRACKED_FIELDS = [
  "visitDate",
  "travelMinutes",
  "workDescription",
  "serviceObjectId",
] as const

// --- Error Classes ---
//
// Each class sets `this.name` explicitly because `handleServiceError`
// (src/trpc/errors.ts) maps to TRPCError codes via `err.name`. Production
// minification would otherwise mangle `constructor.name`.

export class WorkReportNotFoundError extends Error {
  constructor(message = "WorkReport not found") {
    super(message)
    this.name = "WorkReportNotFoundError"
  }
}

export class WorkReportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkReportValidationError"
  }
}

export class WorkReportConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkReportConflictError"
  }
}

/**
 * Signals that a write was attempted on a non-DRAFT record. Shares
 * `err.name = "WorkReportValidationError"` so `handleServiceError`
 * maps it to `BAD_REQUEST` — the distinct class keeps the call-sites
 * readable while preserving the tRPC mapping.
 */
export class WorkReportNotEditableError extends Error {
  constructor(message = "WorkReport is not editable in its current status") {
    super(message)
    this.name = "WorkReportValidationError"
  }
}

/**
 * Signals a sign() attempt on a record that was already signed (or has
 * moved past DRAFT entirely). Shares `err.name = "WorkReportConflictError"`
 * so `handleServiceError` maps it to `CONFLICT` — the call-site keeps the
 * specific class for readable error branching.
 */
export class WorkReportAlreadySignedError extends Error {
  constructor(message = "WorkReport is already signed") {
    super(message)
    this.name = "WorkReportConflictError"
  }
}

/**
 * Signals a voidReport() attempt on a record that has already been voided.
 * Shares `err.name = "WorkReportConflictError"` so `handleServiceError`
 * maps it to `CONFLICT` — a repeated void is idempotent-looking from the
 * client's perspective and should not succeed silently.
 */
export class WorkReportAlreadyVoidedError extends Error {
  constructor(message = "WorkReport is already voided") {
    super(message)
    this.name = "WorkReportConflictError"
  }
}

// --- Validation Helpers ---

function parseDate(dateStr: string): Date {
  // Visit dates are DATE columns (no time component). Normalize to UTC
  // midnight so round-trips through the API are stable.
  return new Date(dateStr + "T00:00:00Z")
}

async function assertOrderInTenant(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  orderId: string,
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: { id: true },
  })
  if (!order) {
    throw new WorkReportValidationError(
      "Order not found for this tenant",
    )
  }
}

async function assertServiceObjectInTenant(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  serviceObjectId: string,
): Promise<void> {
  const so = await prisma.serviceObject.findFirst({
    where: { id: serviceObjectId, tenantId },
    select: { id: true },
  })
  if (!so) {
    throw new WorkReportValidationError(
      "Service object not found for this tenant",
    )
  }
}

// --- Service Functions: Read ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: repo.ListParams,
): Promise<{ items: WorkReportWithIncludes[]; total: number }> {
  const [items, total] = await Promise.all([
    repo.findMany(prisma, tenantId, params),
    repo.count(prisma, tenantId, params),
  ])
  return { items, total }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
): Promise<WorkReportWithIncludes> {
  const report = await repo.findById(prisma, tenantId, id)
  if (!report) {
    throw new WorkReportNotFoundError()
  }
  return report
}

export async function listByOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
): Promise<WorkReportWithIncludes[]> {
  return repo.findManyByOrder(prisma, tenantId, orderId)
}

export async function listByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  limit?: number,
): Promise<WorkReportWithIncludes[]> {
  return repo.findManyByServiceObject(prisma, tenantId, serviceObjectId, limit)
}

// --- Service Functions: Write ---

export interface CreateInput {
  orderId: string
  serviceObjectId?: string | null
  visitDate: string // ISO-Date ("YYYY-MM-DD")
  travelMinutes?: number | null
  workDescription?: string | null
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateInput,
  audit?: AuditContext,
): Promise<WorkReportWithIncludes> {
  // Ownership / cross-tenant checks happen outside the transaction so we
  // short-circuit on validation failures before allocating a sequence
  // number.
  await assertOrderInTenant(prisma, tenantId, input.orderId)
  if (input.serviceObjectId) {
    await assertServiceObjectInTenant(prisma, tenantId, input.serviceObjectId)
  }

  const description = input.workDescription?.trim() ?? null
  const travelMinutes = input.travelMinutes ?? null

  // Sequence allocation + insert inside a transaction so the `AS-<n>`
  // counter never advances when the insert fails.
  const created = await prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as PrismaClient
    const code = await numberSeqService.getNextNumber(tx, tenantId, "work_report")
    return repo.create(tx, {
      tenantId,
      orderId: input.orderId,
      serviceObjectId: input.serviceObjectId ?? null,
      code,
      visitDate: parseDate(input.visitDate),
      travelMinutes,
      workDescription: description && description.length > 0 ? description : null,
      createdById: audit?.userId ?? null,
    })
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: created.id,
        entityName: created.code,
        changes: null,
        metadata: {
          orderId: created.orderId,
          serviceObjectId: created.serviceObjectId,
          visitDate: created.visitDate.toISOString(),
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return created
}

export interface UpdateInput {
  id: string
  visitDate?: string
  travelMinutes?: number | null
  workDescription?: string | null
  serviceObjectId?: string | null
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: UpdateInput,
  audit?: AuditContext,
): Promise<WorkReportWithIncludes> {
  // Pre-fetch full record so we have before-state for audit + can
  // distinguish "not found" from "not in DRAFT" after the atomic
  // updateMany returns zero.
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new WorkReportNotFoundError()
  }

  // Optional service-object ownership check — run before the atomic
  // update so a bad serviceObjectId never produces a half-applied state.
  if (input.serviceObjectId !== undefined && input.serviceObjectId !== null) {
    await assertServiceObjectInTenant(prisma, tenantId, input.serviceObjectId)
  }

  const data: Record<string, unknown> = {}

  if (input.visitDate !== undefined) {
    data.visitDate = parseDate(input.visitDate)
  }
  if (input.travelMinutes !== undefined) {
    data.travelMinutes = input.travelMinutes
  }
  if (input.workDescription !== undefined) {
    const trimmed =
      input.workDescription === null ? null : input.workDescription.trim()
    data.workDescription = trimmed && trimmed.length > 0 ? trimmed : null
  }
  if (input.serviceObjectId !== undefined) {
    data.serviceObjectId = input.serviceObjectId
  }

  // No-op update — we still enforce the DRAFT guard so callers get the
  // correct error when they try to edit a SIGNED/VOID record with an
  // empty payload.
  if (Object.keys(data).length === 0) {
    if (existing.status !== "DRAFT") {
      throw new WorkReportNotEditableError()
    }
    return existing
  }

  // Atomic DRAFT guard (billing-document-service pattern).
  const count = await repo.atomicUpdateDraft(prisma, tenantId, input.id, data)
  if (count === 0) {
    // Distinguish "not found anymore" from "status flipped out of DRAFT".
    const refetch = await repo.findByIdSimple(prisma, tenantId, input.id)
    if (!refetch) {
      throw new WorkReportNotFoundError()
    }
    if (refetch.status !== "DRAFT") {
      throw new WorkReportNotEditableError()
    }
    // Row existed, still DRAFT, but updateMany hit zero — a concurrent
    // writer must have modified-then-reverted. Surface as CONFLICT.
    throw new WorkReportConflictError("Status changed concurrently")
  }

  const updated = await repo.findById(prisma, tenantId, input.id)
  if (!updated) {
    throw new WorkReportNotFoundError()
  }

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS as unknown as string[],
    )
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: updated.id,
        entityName: updated.code,
        changes,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
): Promise<void> {
  const existing = await repo.findByIdSimple(prisma, tenantId, id)
  if (!existing) {
    throw new WorkReportNotFoundError()
  }
  if (existing.status !== "DRAFT") {
    throw new WorkReportNotEditableError()
  }

  // Atomic deleteMany with an explicit DRAFT filter so we cannot lose
  // a race against a concurrent sign() commit.
  const { count } = await prisma.workReport.deleteMany({
    where: { id, tenantId, status: "DRAFT" },
  })
  if (count === 0) {
    const refetch = await repo.findByIdSimple(prisma, tenantId, id)
    if (!refetch) {
      throw new WorkReportNotFoundError()
    }
    // Row still exists but is no longer DRAFT — someone signed it between
    // our pre-check and the delete.
    throw new WorkReportNotEditableError()
  }

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: id,
        entityName: existing.code,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

// --- Service Functions: Sign (DRAFT → SIGNED) ---

/**
 * Maximum signature PNG buffer size (1 MiB). Matches the storage bucket's
 * `file_size_limit` in `supabase/config.toml`.
 */
const MAX_SIGNATURE_BYTES = 1024 * 1024

const SIGNATURE_DATA_URL_PREFIX = "data:image/png;base64,"
const SIGNATURE_BUCKET = "workreport-signatures"

export interface SignInput {
  id: string
  signerName: string
  signerRole: string
  signatureDataUrl: string
}

/**
 * Atomically transitions a WorkReport from DRAFT to SIGNED.
 *
 * Side effects, in order:
 *   1. Pre-validate signer metadata and the signature data URL prefix.
 *   2. Pre-fetch the record and verify it is still in DRAFT, has a
 *      non-empty workDescription, and at least one assignment.
 *   3. Decode the base64 PNG and upload it to `workreport-signatures`
 *      at a UUID-suffixed path (`{tenantId}/{workReportId}-{uuid}.png`).
 *      `upsert: false` prevents two concurrent signs from clobbering
 *      each other's payload.
 *   4. Atomic updateMany with `status: "DRAFT"` guard: sets SIGNED status,
 *      signer metadata, IP hash, and the uploaded signature path.
 *   5. On count=0 (race loser): cleans up the orphaned signature upload
 *      and throws `WorkReportAlreadySignedError` or
 *      `WorkReportConflictError` depending on the re-fetched status.
 *   6. On success: renders the signed PDF (best-effort), persists the
 *      storage path on `work_report.pdfUrl`, writes the audit row.
 *
 * The upload-before-atomic-updateMany ordering is intentional. With
 * `upsert: false` and a UUID-suffixed path, two parallel calls each
 * produce their own signature file — but only one `updateMany` wins. The
 * loser observes `count: 0`, deletes its own PNG, and throws.
 *
 * PDF generation runs AFTER the atomic commit so a PDF-render failure
 * does not roll back the legally-binding status transition. The persisted
 * `pdfUrl` is best-effort — downloads fall back to a fresh render when
 * the sign-time write failed.
 */
export async function sign(
  prisma: PrismaClient,
  tenantId: string,
  input: SignInput,
  audit?: AuditContext,
): Promise<WorkReportWithIncludes> {
  // 1. Input validation (router-level Zod catches most, but defence-in-depth
  // keeps the service callable from scripts and tests).
  const signerName = input.signerName.trim()
  const signerRole = input.signerRole.trim()
  if (signerName.length < 2 || signerName.length > 255) {
    throw new WorkReportValidationError(
      "Signer name must be between 2 and 255 characters",
    )
  }
  if (signerRole.length < 2 || signerRole.length > 100) {
    throw new WorkReportValidationError(
      "Signer role must be between 2 and 100 characters",
    )
  }
  if (!input.signatureDataUrl.startsWith(SIGNATURE_DATA_URL_PREFIX)) {
    throw new WorkReportValidationError(
      "Signature must be a PNG data URL",
    )
  }

  // 2. Pre-fetch + business validation. We load the full record (not just
  // the simple shape) because we need assignments for the "at least one"
  // check and workDescription for the non-empty check.
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new WorkReportNotFoundError()
  }
  if (existing.status !== "DRAFT") {
    throw new WorkReportAlreadySignedError()
  }
  const description = existing.workDescription?.trim() ?? ""
  if (description.length === 0) {
    throw new WorkReportValidationError(
      "Arbeitsbeschreibung ist Pflicht beim Signieren",
    )
  }
  if (!existing.assignments || existing.assignments.length === 0) {
    throw new WorkReportValidationError(
      "Mindestens ein Mitarbeiter muss zugewiesen sein",
    )
  }

  // 3. Decode the base64 payload and upload.
  const base64 = input.signatureDataUrl.slice(SIGNATURE_DATA_URL_PREFIX.length)
  const buffer = Buffer.from(base64, "base64")
  if (buffer.length === 0) {
    throw new WorkReportValidationError("Signature payload is empty")
  }
  if (buffer.length > MAX_SIGNATURE_BYTES) {
    throw new WorkReportValidationError(
      `Signature payload exceeds ${MAX_SIGNATURE_BYTES} bytes`,
    )
  }

  // UUID-suffixed path so concurrent signs do not clobber each other's
  // upload. `upsert: false` ensures an accidental path collision surfaces
  // as an error rather than a silent overwrite.
  const signaturePath = `${tenantId}/${input.id}-${randomUUID()}.png`
  try {
    await storage.upload(SIGNATURE_BUCKET, signaturePath, buffer, {
      contentType: "image/png",
      upsert: false,
    })
  } catch (err) {
    throw new WorkReportValidationError(
      `Signature upload failed: ${err instanceof Error ? err.message : "unknown"}`,
    )
  }

  // 4. IP hash — only computed when we actually have the ip on the audit
  // context. Uses the shared HMAC helper from field-encryption so the
  // stored value is deterministic but never reversible.
  const ipHash = audit?.ipAddress ? hashField(audit.ipAddress) : null

  // 5. Atomic DRAFT→SIGNED. `updateMany` with a status filter is the only
  // primitive that gives us both "act conditionally" and "exclusive commit"
  // in a single roundtrip (pattern: billing-document-service.ts:427-442).
  const { count } = await prisma.workReport.updateMany({
    where: { id: input.id, tenantId, status: "DRAFT" },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signedById: audit?.userId ?? null,
      signerName,
      signerRole,
      signerIpHash: ipHash,
      signaturePath,
    },
  })

  if (count === 0) {
    // We lost the race. Clean up the orphaned signature upload so the
    // storage bucket stays lean — best-effort, storage.remove never throws.
    await storage.remove(SIGNATURE_BUCKET, [signaturePath])

    const refetch = await repo.findByIdSimple(prisma, tenantId, input.id)
    if (!refetch) {
      throw new WorkReportNotFoundError()
    }
    if (refetch.status !== "DRAFT") {
      throw new WorkReportAlreadySignedError()
    }
    throw new WorkReportConflictError(
      "Status changed concurrently during sign",
    )
  }

  // 6. PDF render + persist. Best-effort: a PDF failure should NOT roll
  // back the SIGNED commit (the signature is legally binding; the PDF is
  // an artifact that can always be regenerated on download). We log
  // loudly so operators notice.
  let pdfPath: string | null = null
  try {
    const { storagePath } = await workReportPdfService.generateSignedAndStore(
      prisma,
      tenantId,
      input.id,
    )
    pdfPath = storagePath
    await prisma.workReport.update({
      where: { id: input.id },
      data: { pdfUrl: storagePath },
    })
  } catch (err) {
    console.error(
      "[WorkReportService] Signed PDF generation failed — downloads will fallback to fresh render:",
      err,
    )
  }

  // 7. Audit row. Never blocks the happy path (log() swallows errors).
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "sign",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: input.id,
        entityName: existing.code,
        changes: null,
        metadata: {
          signerName,
          signerRole,
          signerIpHash: ipHash,
          assignmentCount: existing.assignments.length,
          signatureBufferSize: buffer.length,
          signaturePath,
          pdfPath,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  // 8. Return the freshly-updated record with all includes so callers can
  // map straight to API output.
  const updated = await repo.findById(prisma, tenantId, input.id)
  if (!updated) {
    throw new WorkReportNotFoundError()
  }
  return updated
}

// --- Service Functions: Void (SIGNED → VOID) ---

/**
 * Minimum free-text length for the mandatory void reason. Mirrors the
 * Zod guard on the router but re-checked here as defence-in-depth so
 * scripted callers (seed data, ad-hoc backfill) can't bypass it.
 */
const MIN_VOID_REASON_LENGTH = 10

export interface VoidInput {
  id: string
  reason: string
}

/**
 * Atomically transitions a WorkReport from SIGNED to VOID. The archived
 * signed PDF stays in place — a diagonal "STORNIERT" overlay PDF is
 * rendered on-demand at download time (see
 * `workReportPdfService.generateVoidedOverlay`). Legally we preserve
 * the signed artifact and mark it cancelled; we do not delete or
 * overwrite it.
 *
 * Preconditions:
 *   - The record exists in the caller's tenant.
 *   - Current status is SIGNED (DRAFT cannot be "voided" — use remove(),
 *     and VOID is terminal).
 *   - `input.reason` (trimmed) is at least `MIN_VOID_REASON_LENGTH`
 *     characters.
 *
 * Side effects, in order:
 *   1. Input + pre-fetch validation.
 *   2. Atomic `updateMany` with `status: "SIGNED"` guard. On count=0
 *      (race loser or wrong status) we re-fetch to produce the correct
 *      error (NotFound / AlreadyVoided / Conflict / Validation for
 *      DRAFT-still-not-signed).
 *   3. Audit-log row with `action: "void"` and the reason in metadata.
 *
 * No storage writes happen in this function — the on-demand overlay
 * render belongs to the download path, so a void never fails because
 * of PDF-rendering trouble.
 */
export async function voidReport(
  prisma: PrismaClient,
  tenantId: string,
  input: VoidInput,
  audit?: AuditContext,
): Promise<WorkReportWithIncludes> {
  // 1. Input validation.
  const reason = input.reason.trim()
  if (reason.length < MIN_VOID_REASON_LENGTH) {
    throw new WorkReportValidationError(
      `Stornogrund muss mindestens ${MIN_VOID_REASON_LENGTH} Zeichen enthalten`,
    )
  }

  // 2. Pre-fetch. We use the lightweight `findByIdSimple` here because
  // we only need the status + code for branching, not the full include.
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new WorkReportNotFoundError()
  }
  if (existing.status === "DRAFT") {
    throw new WorkReportValidationError(
      "Nur signierte Arbeitsscheine können storniert werden",
    )
  }
  if (existing.status === "VOID") {
    throw new WorkReportAlreadyVoidedError()
  }

  // 3. Atomic SIGNED→VOID. The status filter in the `where` clause is
  // the exclusive commit primitive — if another writer flipped the row
  // to VOID between our pre-fetch and this update, count will be 0.
  const { count } = await prisma.workReport.updateMany({
    where: { id: input.id, tenantId, status: "SIGNED" },
    data: {
      status: "VOID",
      voidedAt: new Date(),
      voidedById: audit?.userId ?? null,
      voidReason: reason,
    },
  })

  if (count === 0) {
    // Race loser or unexpected status flip. Re-fetch to produce the
    // correct error variant.
    const refetch = await repo.findByIdSimple(prisma, tenantId, input.id)
    if (!refetch) {
      throw new WorkReportNotFoundError()
    }
    if (refetch.status === "VOID") {
      throw new WorkReportAlreadyVoidedError()
    }
    if (refetch.status === "DRAFT") {
      // Can only happen if the sign() commit was rolled back between
      // our pre-fetch and this update — essentially impossible under
      // normal Prisma semantics, but we surface it explicitly rather
      // than silently looping.
      throw new WorkReportValidationError(
        "Nur signierte Arbeitsscheine können storniert werden",
      )
    }
    // Row is still SIGNED but updateMany hit zero — a phantom race.
    throw new WorkReportConflictError(
      "Status changed concurrently during void",
    )
  }

  // 4. Audit row. Fire-and-forget — audit failures must never block the
  // legally-binding status transition.
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "void",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: input.id,
        entityName: existing.code,
        changes: null,
        metadata: { reason },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  // 5. Return the freshly-updated record with all includes.
  const updated = await repo.findById(prisma, tenantId, input.id)
  if (!updated) {
    throw new WorkReportNotFoundError()
  }
  return updated
}
