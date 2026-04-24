/**
 * WorkReport Attachment Service
 *
 * Three-step attachment flow for photos/documents on WorkReports:
 *   1. getUploadUrl — returns signed PUT URL to `${tenantId}/${workReportId}/${uuid}.${ext}`
 *   2. client PUT — direct upload to Supabase Storage
 *   3. confirmUpload — re-validates MIME + size + path prefix, inserts DB row
 *
 * Only DRAFT WorkReports accept new attachments or allow deletes —
 * SIGNED/VOID records are immutable.
 *
 * Pattern source: `service-object-attachment-service.ts`.
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 4)
 */
import type { PrismaClient, WorkReportAttachment } from "@/generated/prisma/client"
import * as storage from "@/lib/supabase/storage"
import { randomUUID } from "crypto"
import * as repo from "./work-report-attachment-repository"
import * as workReportRepo from "./work-report-repository"
import {
  WorkReportNotFoundError,
  WorkReportValidationError,
} from "./work-report-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Constants ---

const BUCKET = "workreport-attachments"
const SIGNED_URL_EXPIRY_SECONDS = 300
const MAX_ATTACHMENTS_PER_REPORT = 30
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]
const AUDIT_ENTITY_TYPE = "work_report"

// --- Error Classes ---

export class WorkReportAttachmentNotFoundError extends Error {
  constructor(message = "WorkReport attachment not found") {
    super(message)
    this.name = "WorkReportAttachmentNotFoundError"
  }
}

export class WorkReportAttachmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkReportAttachmentValidationError"
  }
}

// --- Helpers ---

function mimeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/heic":
      return "heic"
    case "application/pdf":
      return "pdf"
    default:
      return "bin"
  }
}

/**
 * Loads the parent WorkReport and enforces DRAFT-only-editable semantics.
 * Used by both `getUploadUrl` and `confirmUpload` so the race-condition
 * window between presign and confirm still blocks writes on a concurrently
 * signed record.
 */
async function getEditableWorkReport(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
) {
  const report = await workReportRepo.findByIdSimple(prisma, tenantId, workReportId)
  if (!report) {
    throw new WorkReportNotFoundError()
  }
  if (report.status !== "DRAFT") {
    throw new WorkReportValidationError(
      "WorkReport is not editable in its current status",
    )
  }
  return report
}

// --- Service Functions ---

/**
 * Lists all attachments on a WorkReport, enriched with a fresh
 * short-lived signed download URL for each entry. Readable in any
 * status (DRAFT / SIGNED / VOID).
 */
export async function listAttachments(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
): Promise<(WorkReportAttachment & { downloadUrl: string | null })[]> {
  // Ensure the parent exists and belongs to the tenant before exposing
  // attachments — keeps cross-tenant enumeration from returning 200/[].
  const parent = await workReportRepo.findByIdSimple(prisma, tenantId, workReportId)
  if (!parent) {
    throw new WorkReportNotFoundError()
  }

  const attachments = await repo.findMany(prisma, tenantId, workReportId)

  return Promise.all(
    attachments.map(async (att) => {
      const downloadUrl = await storage.createSignedReadUrl(
        BUCKET,
        att.storagePath,
        SIGNED_URL_EXPIRY_SECONDS,
      )
      return { ...att, downloadUrl }
    }),
  )
}

/**
 * Stage 1 of the upload flow — validates MIME, parent status and the
 * per-report count limit, then returns a signed PUT URL the client can
 * upload directly to.
 */
export async function getUploadUrl(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
  _filename: string,
  mimeType: string,
): Promise<{ signedUrl: string; storagePath: string; token: string }> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new WorkReportAttachmentValidationError(
      `Invalid file type: ${mimeType}`,
    )
  }

  await getEditableWorkReport(prisma, tenantId, workReportId)

  const existing = await repo.count(prisma, tenantId, workReportId)
  if (existing >= MAX_ATTACHMENTS_PER_REPORT) {
    throw new WorkReportAttachmentValidationError(
      `Maximum ${MAX_ATTACHMENTS_PER_REPORT} attachments per work report`,
    )
  }

  const ext = mimeToExtension(mimeType)
  const fileId = randomUUID()
  const storagePath = `${tenantId}/${workReportId}/${fileId}.${ext}`

  const result = await storage.createSignedUploadUrl(BUCKET, storagePath)

  return {
    signedUrl: result.signedUrl,
    storagePath,
    token: result.token,
  }
}

/**
 * Stage 3 of the upload flow — re-validates size + MIME + path prefix
 * (the path prefix guard defends against a client-supplied path that
 * escapes the `${tenantId}/${workReportId}/` namespace), then inserts
 * the DB row and writes an audit entry. Parent must still be DRAFT.
 */
export async function confirmUpload(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
  storagePath: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  createdById: string | null,
  audit?: AuditContext,
): Promise<WorkReportAttachment> {
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new WorkReportAttachmentValidationError(
      `File too large: ${sizeBytes} bytes. Maximum: ${MAX_SIZE_BYTES} bytes (10 MB)`,
    )
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new WorkReportAttachmentValidationError(
      `Invalid file type: ${mimeType}`,
    )
  }

  const parent = await getEditableWorkReport(prisma, tenantId, workReportId)

  const existing = await repo.count(prisma, tenantId, workReportId)
  if (existing >= MAX_ATTACHMENTS_PER_REPORT) {
    throw new WorkReportAttachmentValidationError(
      `Maximum ${MAX_ATTACHMENTS_PER_REPORT} attachments per work report`,
    )
  }

  // Path-traversal + cross-tenant guard: the presigned upload stamps its
  // own prefix via `getUploadUrl`, but the client controls the value in
  // the confirm call so we re-check that the path still points into the
  // expected `${tenantId}/${workReportId}/` namespace.
  const expectedPrefix = `${tenantId}/${workReportId}/`
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new WorkReportAttachmentValidationError(
      "Storage path does not match expected prefix",
    )
  }

  const attachment = await repo.create(prisma, {
    tenantId,
    workReportId,
    filename,
    storagePath,
    mimeType,
    sizeBytes,
    createdById,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "attachment_added",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: workReportId,
        entityName: parent.code,
        changes: null,
        metadata: {
          attachmentId: attachment.id,
          filename,
          mimeType,
          sizeBytes,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return attachment
}

/**
 * Returns a short-lived signed URL for downloading a single attachment.
 * Readable in any parent status (DRAFT / SIGNED / VOID).
 */
export async function getDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string,
): Promise<{ signedUrl: string }> {
  const attachment = await repo.findById(prisma, tenantId, attachmentId)
  if (!attachment) {
    throw new WorkReportAttachmentNotFoundError()
  }
  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    attachment.storagePath,
    SIGNED_URL_EXPIRY_SECONDS,
  )
  if (!signedUrl) {
    throw new WorkReportAttachmentNotFoundError(
      "Failed to create signed download URL",
    )
  }
  return { signedUrl }
}

/**
 * Removes an attachment's DB row and best-effort deletes the storage
 * blob. Parent must still be DRAFT — deletes on SIGNED/VOID would break
 * the immutability guarantee of the signed PDF's photo references.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string,
  audit?: AuditContext,
): Promise<{ success: true }> {
  const attachment = await repo.findById(prisma, tenantId, attachmentId)
  if (!attachment) {
    throw new WorkReportAttachmentNotFoundError()
  }

  const parent = await getEditableWorkReport(
    prisma,
    tenantId,
    attachment.workReportId,
  )

  const deleted = await repo.deleteById(prisma, tenantId, attachmentId)
  if (!deleted) {
    throw new WorkReportAttachmentNotFoundError()
  }

  // Best-effort storage cleanup — `storage.remove` swallows errors so a
  // transient storage outage never blocks a successful DB delete.
  await storage.remove(BUCKET, [attachment.storagePath])

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "attachment_removed",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: attachment.workReportId,
        entityName: parent.code,
        changes: null,
        metadata: {
          attachmentId: attachment.id,
          filename: attachment.filename,
          storagePath: attachment.storagePath,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { success: true as const }
}
