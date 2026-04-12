/**
 * Warehouse Article Image Service
 *
 * Service + repository for article image CRUD, signed URL generation, and
 * server-side thumbnail creation. Images are stored in Supabase Storage,
 * metadata in the wh_article_images table.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as storage from "@/lib/supabase/storage"
import { randomUUID } from "crypto"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const BUCKET = "wh-article-images"
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour
const THUMBNAIL_SIZE = 200
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

// --- Error Classes ---

export class WhArticleImageNotFoundError extends Error {
  constructor(message = "Image not found") {
    super(message)
    this.name = "WhArticleImageNotFoundError"
  }
}

export class WhArticleImageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhArticleImageValidationError"
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
    default:
      return "bin"
  }
}

// =============================================================================
// Repository Functions (tenant-scoped)
// =============================================================================

export async function findByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  return prisma.whArticleImage.findMany({
    where: { tenantId, articleId },
    orderBy: { sortOrder: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  imageId: string
) {
  return prisma.whArticleImage.findFirst({
    where: { id: imageId, tenantId },
  })
}

export async function createImage(
  prisma: PrismaClient,
  data: {
    articleId: string
    tenantId: string
    filename: string
    storagePath: string
    thumbnailPath: string | null
    mimeType: string
    sizeBytes: number
    sortOrder: number
    isPrimary: boolean
    createdById: string | null
  }
) {
  return prisma.whArticleImage.create({ data })
}

export async function countByArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  return prisma.whArticleImage.count({
    where: { tenantId, articleId },
  })
}

export async function getMaxSortOrder(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  const result = await prisma.whArticleImage.findFirst({
    where: { tenantId, articleId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  return result?.sortOrder ?? -1
}

export async function removeImage(
  prisma: PrismaClient,
  tenantId: string,
  imageId: string
) {
  return prisma.whArticleImage.delete({
    where: { id: imageId, tenantId },
  })
}

// =============================================================================
// Service Functions
// =============================================================================

/**
 * List all images for an article with signed URLs.
 */
export async function listImages(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  const images = await findByArticle(prisma, tenantId, articleId)

  const result = await Promise.all(
    images.map(async (image) => {
      const url = await storage.createSignedReadUrl(BUCKET, image.storagePath, SIGNED_URL_EXPIRY_SECONDS)
      const thumbnailUrl = image.thumbnailPath
        ? await storage.createSignedReadUrl(BUCKET, image.thumbnailPath, SIGNED_URL_EXPIRY_SECONDS)
        : null

      return { ...image, url, thumbnailUrl }
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
  articleId: string,
  filename: string,
  mimeType: string
) {
  // Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new WhArticleImageValidationError(
      `Invalid file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`
    )
  }

  // Verify article exists and belongs to tenant
  const article = await prisma.whArticle.findFirst({
    where: { id: articleId, tenantId },
    select: { id: true },
  })
  if (!article) {
    throw new WhArticleImageNotFoundError("Article not found")
  }

  // Generate storage path
  const ext = mimeToExtension(mimeType)
  const imageId = randomUUID()
  const storagePath = `${tenantId}/${articleId}/${imageId}.${ext}`

  const result = await storage.createSignedUploadUrl(BUCKET, storagePath)

  return {
    signedUrl: result.signedUrl,
    storagePath,
    token: result.token,
  }
}

/**
 * Confirm an upload: create DB record and generate thumbnail.
 */
export async function confirmUpload(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string,
  storagePath: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  createdById: string | null,
  audit?: AuditContext
) {
  // Validate size
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new WhArticleImageValidationError(
      `File too large: ${sizeBytes} bytes. Maximum: ${MAX_SIZE_BYTES} bytes (5 MB)`
    )
  }

  // Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new WhArticleImageValidationError(
      `Invalid file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`
    )
  }

  // Verify article exists and belongs to tenant
  const article = await prisma.whArticle.findFirst({
    where: { id: articleId, tenantId },
    select: { id: true },
  })
  if (!article) {
    throw new WhArticleImageNotFoundError("Article not found")
  }

  // Generate thumbnail
  let thumbnailPath: string | null = null
  try {
    const fileData = await storage.download(BUCKET, storagePath)

    if (fileData) {
      const sharp = (await import("sharp")).default
      const buffer = Buffer.from(await fileData.arrayBuffer())
      const thumbBuffer = await sharp(buffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer()

      thumbnailPath = storagePath.replace(/\.[^.]+$/, "_thumb.webp")
      try {
        await storage.upload(BUCKET, thumbnailPath, thumbBuffer, {
          contentType: "image/webp",
          upsert: true,
        })
      } catch {
        console.error("Thumbnail upload failed")
        thumbnailPath = null
      }
    }
  } catch (err) {
    console.error("Thumbnail generation failed:", err)
    thumbnailPath = null
  }

  // Determine isPrimary and sortOrder
  const count = await countByArticle(prisma, tenantId, articleId)
  const isPrimary = count === 0
  const maxSort = await getMaxSortOrder(prisma, tenantId, articleId)
  const sortOrder = maxSort + 1

  // Create DB record
  const image = await createImage(prisma, {
    articleId,
    tenantId,
    filename,
    storagePath,
    thumbnailPath,
    mimeType,
    sizeBytes,
    sortOrder,
    isPrimary,
    createdById,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "upload",
      entityType: "wh_article_image",
      entityId: image.id,
      entityName: filename,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return image
}

/**
 * Set an image as the primary image for its article.
 */
export async function setPrimary(
  prisma: PrismaClient,
  tenantId: string,
  imageId: string,
  audit?: AuditContext
) {
  const image = await findById(prisma, tenantId, imageId)
  if (!image) {
    throw new WhArticleImageNotFoundError()
  }

  // Transaction: reset all, then set one
  await prisma.$transaction([
    prisma.whArticleImage.updateMany({
      where: { articleId: image.articleId, tenantId },
      data: { isPrimary: false },
    }),
    prisma.whArticleImage.updateMany({
      where: { id: imageId, tenantId },
      data: { isPrimary: true },
    }),
  ])

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "wh_article_image",
      entityId: imageId,
      entityName: image.filename ?? null,
      changes: { isPrimary: { old: false, new: true } },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}

/**
 * Reorder images by the given array of image IDs.
 */
export async function reorderImages(
  prisma: PrismaClient,
  tenantId: string,
  imageIds: string[]
) {
  // Validate all images belong to the same article and tenant
  const images = await prisma.whArticleImage.findMany({
    where: { id: { in: imageIds }, tenantId },
    select: { id: true, articleId: true },
  })

  if (images.length !== imageIds.length) {
    throw new WhArticleImageValidationError(
      "Some image IDs are invalid or do not belong to this tenant"
    )
  }

  const articleIds = new Set(images.map((img) => img.articleId))
  if (articleIds.size !== 1) {
    throw new WhArticleImageValidationError(
      "All images must belong to the same article"
    )
  }

  // Update sortOrder in a transaction
  await prisma.$transaction(
    imageIds.map((id, index) =>
      prisma.whArticleImage.updateMany({
        where: { id, tenantId },
        data: { sortOrder: index },
      })
    )
  )

  return { success: true }
}

/**
 * Delete an image (storage files + DB record).
 * If the deleted image was primary, the next image becomes primary.
 */
export async function deleteImage(
  prisma: PrismaClient,
  tenantId: string,
  imageId: string,
  audit?: AuditContext
) {
  const image = await findById(prisma, tenantId, imageId)
  if (!image) {
    throw new WhArticleImageNotFoundError()
  }

  // Delete from storage
  const pathsToRemove = [image.storagePath]
  if (image.thumbnailPath) {
    pathsToRemove.push(image.thumbnailPath)
  }
  await storage.remove(BUCKET, pathsToRemove)

  // Delete DB record
  await removeImage(prisma, tenantId, imageId)

  // If deleted image was primary, set next image as primary
  if (image.isPrimary) {
    const remaining = await findByArticle(prisma, tenantId, image.articleId)
    const nextImage = remaining[0]
    if (nextImage) {
      await prisma.whArticleImage.updateMany({
        where: { id: nextImage.id, tenantId },
        data: { isPrimary: true },
      })
    }
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "wh_article_image",
      entityId: imageId,
      entityName: image.filename ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}

/**
 * Get a signed thumbnail URL for a single storage path.
 * Used by the article list to show primary image thumbnails.
 */
export async function getSignedThumbnailUrl(
  thumbnailPath: string
): Promise<string | null> {
  return storage.createSignedReadUrl(BUCKET, thumbnailPath, SIGNED_URL_EXPIRY_SECONDS)
}
