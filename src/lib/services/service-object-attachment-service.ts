/**
 * ServiceObject Attachment Service
 *
 * Three-stage attachment flow:
 *   1. getUploadUrl — returns signed PUT URL to `${tenantId}/${serviceObjectId}/${uuid}.${ext}`
 *   2. client PUT — direct upload to Supabase Storage
 *   3. confirmUpload — re-validates MIME+size, inserts DB row
 *
 * Plan: 2026-04-21-serviceobjekte-stammdaten.md — Phase C.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as storage from "@/lib/supabase/storage"
import { randomUUID } from "crypto"
import * as repo from "./service-object-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const BUCKET = "serviceobject-attachments"
const SIGNED_URL_EXPIRY_SECONDS = 3600
const MAX_ATTACHMENTS_PER_SERVICE_OBJECT = 20
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]

// --- Error Classes ---

export class ServiceObjectAttachmentNotFoundError extends Error {
  constructor(message = "Attachment not found") {
    super(message)
    this.name = "ServiceObjectAttachmentNotFoundError"
  }
}

export class ServiceObjectAttachmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServiceObjectAttachmentValidationError"
  }
}

// --- Helpers ---

function mimeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "pdf"
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx"
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx"
    default:
      return "bin"
  }
}

async function requireServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string
) {
  const obj = await prisma.serviceObject.findFirst({
    where: { id: serviceObjectId, tenantId },
    select: { id: true },
  })
  if (!obj) {
    throw new ServiceObjectAttachmentNotFoundError(
      "Service object not found"
    )
  }
}

// --- Service Functions ---

export async function listAttachments(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string
) {
  const attachments = await repo.findAttachments(prisma, tenantId, serviceObjectId)

  return Promise.all(
    attachments.map(async (att) => {
      const downloadUrl = await storage.createSignedReadUrl(
        BUCKET,
        att.storagePath,
        SIGNED_URL_EXPIRY_SECONDS
      )
      return { ...att, downloadUrl }
    })
  )
}

export async function getUploadUrl(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  _filename: string,
  mimeType: string
) {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ServiceObjectAttachmentValidationError(
      `Invalid file type: ${mimeType}`
    )
  }

  await requireServiceObject(prisma, tenantId, serviceObjectId)

  const count = await repo.countAttachments(prisma, tenantId, serviceObjectId)
  if (count >= MAX_ATTACHMENTS_PER_SERVICE_OBJECT) {
    throw new ServiceObjectAttachmentValidationError(
      `Maximum ${MAX_ATTACHMENTS_PER_SERVICE_OBJECT} attachments per service object`
    )
  }

  const ext = mimeToExtension(mimeType)
  const fileId = randomUUID()
  const storagePath = `${tenantId}/${serviceObjectId}/${fileId}.${ext}`

  const result = await storage.createSignedUploadUrl(BUCKET, storagePath)

  return {
    signedUrl: result.signedUrl,
    storagePath,
    token: result.token,
  }
}

export async function confirmUpload(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  storagePath: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  uploadedById: string | null,
  audit?: AuditContext
) {
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new ServiceObjectAttachmentValidationError(
      `File too large: ${sizeBytes} bytes. Maximum: ${MAX_SIZE_BYTES} bytes (10 MB)`
    )
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ServiceObjectAttachmentValidationError(
      `Invalid file type: ${mimeType}`
    )
  }

  await requireServiceObject(prisma, tenantId, serviceObjectId)

  const count = await repo.countAttachments(prisma, tenantId, serviceObjectId)
  if (count >= MAX_ATTACHMENTS_PER_SERVICE_OBJECT) {
    throw new ServiceObjectAttachmentValidationError(
      `Maximum ${MAX_ATTACHMENTS_PER_SERVICE_OBJECT} attachments per service object`
    )
  }

  // Expected path prefix guards against client-supplied path shenanigans.
  const expectedPrefix = `${tenantId}/${serviceObjectId}/`
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new ServiceObjectAttachmentValidationError(
      "Storage path does not match expected prefix"
    )
  }

  const attachment = await repo.createAttachment(prisma, {
    tenantId,
    serviceObjectId,
    filename,
    storagePath,
    mimeType,
    sizeBytes,
    uploadedById,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "upload",
        entityType: "service_object_attachment",
        entityId: attachment.id,
        entityName: filename,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return attachment
}

export async function getDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string
) {
  const attachment = await repo.findAttachmentById(prisma, tenantId, attachmentId)
  if (!attachment) {
    throw new ServiceObjectAttachmentNotFoundError()
  }
  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    attachment.storagePath,
    SIGNED_URL_EXPIRY_SECONDS
  )
  if (!signedUrl) {
    throw new ServiceObjectAttachmentNotFoundError(
      "Failed to create signed download URL"
    )
  }
  return { signedUrl }
}

export async function deleteAttachment(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string,
  audit?: AuditContext
) {
  const attachment = await repo.findAttachmentById(prisma, tenantId, attachmentId)
  if (!attachment) {
    throw new ServiceObjectAttachmentNotFoundError()
  }

  await storage.remove(BUCKET, [attachment.storagePath])

  await repo.deleteAttachment(prisma, tenantId, attachmentId)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "service_object_attachment",
        entityId: attachmentId,
        entityName: attachment.filename ?? null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { success: true as const }
}

export async function deleteAllByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string
) {
  const attachments = await repo.findAttachments(prisma, tenantId, serviceObjectId)
  if (attachments.length === 0) return
  await storage
    .removeBatched(
      BUCKET,
      attachments.map((a) => a.storagePath)
    )
    .catch(() => {})
  // DB rows are removed via onDelete: Cascade on the service_object FK.
}
