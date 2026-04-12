/**
 * HR Personnel File Attachment Service
 *
 * Service + repository for personnel file attachment CRUD, signed URL generation.
 * Attachments are stored in Supabase Storage, metadata in the
 * hr_personnel_file_attachments table.
 *
 * Follows the same 3-step upload pattern as crm-correspondence-attachment-service.ts.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as storage from "@/lib/supabase/storage"
import { randomUUID } from "crypto"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const BUCKET = "hr-personnel-files"
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour
const MAX_ATTACHMENTS_PER_ENTRY = 10
const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]

// --- Error Classes ---

export class HrPersonnelFileAttachmentNotFoundError extends Error {
  constructor(message = "Attachment not found") {
    super(message)
    this.name = "HrPersonnelFileAttachmentNotFoundError"
  }
}

export class HrPersonnelFileAttachmentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HrPersonnelFileAttachmentValidationError"
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

export async function findByEntry(
  prisma: PrismaClient,
  tenantId: string,
  entryId: string
) {
  return prisma.hrPersonnelFileAttachment.findMany({
    where: { tenantId, entryId },
    orderBy: { createdAt: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string
) {
  return prisma.hrPersonnelFileAttachment.findFirst({
    where: { id: attachmentId, tenantId },
  })
}

export async function createAttachment(
  prisma: PrismaClient,
  data: {
    entryId: string
    tenantId: string
    filename: string
    storagePath: string
    mimeType: string
    sizeBytes: number
    createdById: string | null
  }
) {
  return prisma.hrPersonnelFileAttachment.create({ data })
}

export async function countByEntry(
  prisma: PrismaClient,
  tenantId: string,
  entryId: string
) {
  return prisma.hrPersonnelFileAttachment.count({
    where: { tenantId, entryId },
  })
}

export async function removeAttachment(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string
) {
  return prisma.hrPersonnelFileAttachment.delete({
    where: { id: attachmentId, tenantId },
  })
}

// =============================================================================
// Service Functions
// =============================================================================

/**
 * List all attachments for an entry with signed download URLs.
 */
export async function listAttachments(
  prisma: PrismaClient,
  tenantId: string,
  entryId: string
) {
  const attachments = await findByEntry(prisma, tenantId, entryId)

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
 * Storage path: {tenantId}/{employeeId}/{entryId}/{uuid}.{ext}
 */
export async function getUploadUrl(
  prisma: PrismaClient,
  tenantId: string,
  entryId: string,
  filename: string,
  mimeType: string
) {
  // Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new HrPersonnelFileAttachmentValidationError(
      `Invalid file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`
    )
  }

  // Verify entry exists and belongs to tenant — also need employeeId for path
  const entry = await prisma.hrPersonnelFileEntry.findFirst({
    where: { id: entryId, tenantId },
    select: { id: true, employeeId: true },
  })
  if (!entry) {
    throw new HrPersonnelFileAttachmentNotFoundError("Entry not found")
  }

  // Check attachment count limit
  const count = await countByEntry(prisma, tenantId, entryId)
  if (count >= MAX_ATTACHMENTS_PER_ENTRY) {
    throw new HrPersonnelFileAttachmentValidationError(
      `Maximum ${MAX_ATTACHMENTS_PER_ENTRY} attachments per entry`
    )
  }

  // Generate storage path
  const ext = mimeToExtension(mimeType)
  const fileId = randomUUID()
  const storagePath = `${tenantId}/${entry.employeeId}/${entryId}/${fileId}.${ext}`

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
  entryId: string,
  storagePath: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  createdById: string | null,
  audit?: AuditContext
) {
  // Validate size
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new HrPersonnelFileAttachmentValidationError(
      `File too large: ${sizeBytes} bytes. Maximum: ${MAX_SIZE_BYTES} bytes (20 MB)`
    )
  }

  // Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new HrPersonnelFileAttachmentValidationError(
      `Invalid file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`
    )
  }

  // Verify entry exists and belongs to tenant
  const entry = await prisma.hrPersonnelFileEntry.findFirst({
    where: { id: entryId, tenantId },
    select: { id: true },
  })
  if (!entry) {
    throw new HrPersonnelFileAttachmentNotFoundError("Entry not found")
  }

  // Check attachment count limit (race condition protection)
  const count = await countByEntry(prisma, tenantId, entryId)
  if (count >= MAX_ATTACHMENTS_PER_ENTRY) {
    throw new HrPersonnelFileAttachmentValidationError(
      `Maximum ${MAX_ATTACHMENTS_PER_ENTRY} attachments per entry`
    )
  }

  // Create DB record
  const attachment = await createAttachment(prisma, {
    entryId,
    tenantId,
    filename,
    storagePath,
    mimeType,
    sizeBytes,
    createdById,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "upload",
      entityType: "hr_personnel_file_attachment",
      entityId: attachment.id,
      entityName: filename,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return attachment
}

/**
 * Delete an attachment (storage file + DB record).
 */
export async function deleteAttachment(
  prisma: PrismaClient,
  tenantId: string,
  attachmentId: string,
  audit?: AuditContext
) {
  const attachment = await findById(prisma, tenantId, attachmentId)
  if (!attachment) {
    throw new HrPersonnelFileAttachmentNotFoundError()
  }

  // Delete from storage
  await storage.remove(BUCKET, [attachment.storagePath])

  // Delete DB record
  await removeAttachment(prisma, tenantId, attachmentId)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "hr_personnel_file_attachment",
      entityId: attachmentId,
      entityName: attachment.filename ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

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
    throw new HrPersonnelFileAttachmentNotFoundError()
  }

  const downloadUrl = await storage.createSignedReadUrl(BUCKET, attachment.storagePath, SIGNED_URL_EXPIRY_SECONDS)

  return {
    downloadUrl,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
  }
}

/**
 * Delete all attachments for an entry (Storage cleanup).
 * Called before deleting an entry to prevent storage orphans.
 */
export async function deleteAllByEntry(
  prisma: PrismaClient,
  tenantId: string,
  entryId: string
) {
  const attachments = await findByEntry(prisma, tenantId, entryId)
  if (attachments.length === 0) return

  const paths = attachments.map((a) => a.storagePath)
  await storage.remove(BUCKET, paths)

  // DB records will be cleaned up by CASCADE when entry is deleted
}
