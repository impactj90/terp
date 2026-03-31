/**
 * CRM Correspondence Attachment Service
 *
 * Service + repository for correspondence attachment CRUD, signed URL generation.
 * Attachments are stored in Supabase Storage, metadata in the
 * crm_correspondence_attachments table.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as storage from "@/lib/supabase/storage"
import { randomUUID } from "crypto"

const BUCKET = "crm-attachments"
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour
const MAX_ATTACHMENTS_PER_CORRESPONDENCE = 5
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

export class CrmCorrespondenceAttachmentNotFoundError extends Error {
  constructor(message = "Attachment not found") {
    super(message)
    this.name = "CrmCorrespondenceAttachmentNotFoundError"
  }
}

export class CrmCorrespondenceAttachmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmCorrespondenceAttachmentValidationError"
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

// =============================================================================
// Repository Functions (tenant-scoped)
// =============================================================================

export async function findByCorrespondence(
  prisma: PrismaClient,
  tenantId: string,
  correspondenceId: string
) {
  return prisma.crmCorrespondenceAttachment.findMany({
    where: { tenantId, correspondenceId },
    orderBy: { createdAt: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string
) {
  return prisma.crmCorrespondenceAttachment.findFirst({
    where: { id: attachmentId, tenantId },
  })
}

export async function createAttachment(
  prisma: PrismaClient,
  data: {
    correspondenceId: string
    tenantId: string
    filename: string
    storagePath: string
    mimeType: string
    sizeBytes: number
    createdById: string | null
  }
) {
  return prisma.crmCorrespondenceAttachment.create({ data })
}

export async function countByCorrespondence(
  prisma: PrismaClient,
  tenantId: string,
  correspondenceId: string
) {
  return prisma.crmCorrespondenceAttachment.count({
    where: { tenantId, correspondenceId },
  })
}

export async function removeAttachment(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string
) {
  return prisma.crmCorrespondenceAttachment.delete({
    where: { id: attachmentId, tenantId },
  })
}

// =============================================================================
// Service Functions
// =============================================================================

/**
 * List all attachments for a correspondence with signed download URLs.
 */
export async function listAttachments(
  prisma: PrismaClient,
  tenantId: string,
  correspondenceId: string
) {
  const attachments = await findByCorrespondence(prisma, tenantId, correspondenceId)

  const result = await Promise.all(
    attachments.map(async (attachment) => {
      const downloadUrl = await storage.createSignedReadUrl(BUCKET, attachment.storagePath, SIGNED_URL_EXPIRY_SECONDS)
      return { ...attachment, downloadUrl }
    })
  )

  return result
}

/**
 * Generate a signed upload URL for direct client-to-Storage upload.
 */
export async function getUploadUrl(
  prisma: PrismaClient,
  tenantId: string,
  correspondenceId: string,
  filename: string,
  mimeType: string
) {
  // Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new CrmCorrespondenceAttachmentValidationError(
      `Invalid file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`
    )
  }

  // Verify correspondence exists and belongs to tenant
  const correspondence = await prisma.crmCorrespondence.findFirst({
    where: { id: correspondenceId, tenantId },
    select: { id: true },
  })
  if (!correspondence) {
    throw new CrmCorrespondenceAttachmentNotFoundError("Correspondence not found")
  }

  // Check attachment count limit
  const count = await countByCorrespondence(prisma, tenantId, correspondenceId)
  if (count >= MAX_ATTACHMENTS_PER_CORRESPONDENCE) {
    throw new CrmCorrespondenceAttachmentValidationError(
      `Maximum ${MAX_ATTACHMENTS_PER_CORRESPONDENCE} attachments per correspondence`
    )
  }

  // Generate storage path
  const ext = mimeToExtension(mimeType)
  const fileId = randomUUID()
  const storagePath = `${tenantId}/${correspondenceId}/${fileId}.${ext}`

  const result = await storage.createSignedUploadUrl(BUCKET, storagePath)

  return {
    signedUrl: result.signedUrl,
    storagePath,
    token: result.token,
  }
}

/**
 * Confirm an upload: validate and create DB record.
 */
export async function confirmUpload(
  prisma: PrismaClient,
  tenantId: string,
  correspondenceId: string,
  storagePath: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  createdById: string | null
) {
  // Validate size
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new CrmCorrespondenceAttachmentValidationError(
      `File too large: ${sizeBytes} bytes. Maximum: ${MAX_SIZE_BYTES} bytes (10 MB)`
    )
  }

  // Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new CrmCorrespondenceAttachmentValidationError(
      `Invalid file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`
    )
  }

  // Verify correspondence exists and belongs to tenant
  const correspondence = await prisma.crmCorrespondence.findFirst({
    where: { id: correspondenceId, tenantId },
    select: { id: true },
  })
  if (!correspondence) {
    throw new CrmCorrespondenceAttachmentNotFoundError("Correspondence not found")
  }

  // Check attachment count limit (race condition protection)
  const count = await countByCorrespondence(prisma, tenantId, correspondenceId)
  if (count >= MAX_ATTACHMENTS_PER_CORRESPONDENCE) {
    throw new CrmCorrespondenceAttachmentValidationError(
      `Maximum ${MAX_ATTACHMENTS_PER_CORRESPONDENCE} attachments per correspondence`
    )
  }

  // Create DB record
  const attachment = await createAttachment(prisma, {
    correspondenceId,
    tenantId,
    filename,
    storagePath,
    mimeType,
    sizeBytes,
    createdById,
  })

  return attachment
}

/**
 * Delete an attachment (storage file + DB record).
 */
export async function deleteAttachment(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string
) {
  const attachment = await findById(prisma, tenantId, attachmentId)
  if (!attachment) {
    throw new CrmCorrespondenceAttachmentNotFoundError()
  }

  // Delete from storage
  await storage.remove(BUCKET, [attachment.storagePath])

  // Delete DB record
  await removeAttachment(prisma, tenantId, attachmentId)

  return { success: true }
}

/**
 * Get a signed download URL for a single attachment.
 */
export async function getDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string
) {
  const attachment = await findById(prisma, tenantId, attachmentId)
  if (!attachment) {
    throw new CrmCorrespondenceAttachmentNotFoundError()
  }

  const downloadUrl = await storage.createSignedReadUrl(BUCKET, attachment.storagePath, SIGNED_URL_EXPIRY_SECONDS)

  return {
    downloadUrl,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
  }
}

/**
 * Delete all attachments for a correspondence (Storage cleanup).
 * Called before deleting a correspondence to prevent storage orphans.
 */
export async function deleteAllByCorrespondence(
  prisma: PrismaClient,
  tenantId: string,
  correspondenceId: string
) {
  const attachments = await findByCorrespondence(prisma, tenantId, correspondenceId)
  if (attachments.length === 0) return

  const paths = attachments.map((a) => a.storagePath)
  await storage.remove(BUCKET, paths)

  // DB records will be cleaned up by CASCADE when correspondence is deleted
}
