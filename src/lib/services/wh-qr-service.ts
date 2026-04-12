/**
 * Warehouse QR Code Service
 *
 * Business logic for QR code resolution, generation, and label PDF orchestration.
 * QR codes are deterministic: TERP:ART:{tenantId-short}:{articleNumber}
 * No DB storage needed -- QR content is derived from tenant + article data.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import QRCode from "qrcode"
import { renderToBuffer } from "@react-pdf/renderer"
import * as storage from "@/lib/supabase/storage"
import React from "react"
import { QrLabelPdf, type LabelFormat } from "@/lib/pdf/qr-label-pdf"

// --- Error Classes ---

export class WhQrValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhQrValidationError"
  }
}

export class WhQrNotFoundError extends Error {
  constructor(message = "Article not found") {
    super(message)
    this.name = "WhQrNotFoundError"
  }
}

export class WhQrForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhQrForbiddenError"
  }
}

// --- Constants ---

const QR_CODE_REGEX = /^TERP:ART:([a-f0-9]{6}):(.+)$/
const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 300 // 5 minutes

// --- Pure Functions ---

/**
 * Build QR code content string from tenant ID and article number.
 * Format: TERP:ART:{first 6 chars of tenantId}:{articleNumber}
 */
export function buildQrContent(tenantId: string, articleNumber: string): string {
  return `TERP:ART:${tenantId.substring(0, 6)}:${articleNumber}`
}

/**
 * Generate a QR code as a PNG data URL.
 */
export async function generateQrDataUrl(
  content: string,
  size?: number
): Promise<string> {
  return QRCode.toDataURL(content, { width: size ?? 150, margin: 1 })
}

// --- DB-backed Functions ---

/**
 * Resolve a raw QR code string to an article.
 *
 * 1. Parse format: TERP:ART:{tenantShort}:{articleNumber}
 * 2. Validate tenant prefix matches
 * 3. Look up article by number within tenant
 */
export async function resolveQrCode(
  prisma: PrismaClient,
  tenantId: string,
  rawCode: string
) {
  // 1. Parse
  const match = rawCode.match(QR_CODE_REGEX)
  if (!match) {
    throw new WhQrValidationError("Ungültiger QR-Code-Format")
  }

  const tenantShort = match[1]!
  const articleNumber = match[2]!

  // 2. Tenant validation
  if (!tenantId.startsWith(tenantShort)) {
    throw new WhQrForbiddenError("QR-Code gehört zu einem anderen Mandanten")
  }

  // 3. Article lookup
  const article = await prisma.whArticle.findFirst({
    where: { tenantId, number: articleNumber, isActive: true },
    select: {
      id: true,
      number: true,
      name: true,
      unit: true,
      currentStock: true,
      minStock: true,
      warehouseLocation: true,
      images: true,
      stockTracking: true,
    },
  })

  if (!article) {
    throw new WhQrNotFoundError("Artikel nicht gefunden")
  }

  return article
}

/**
 * Resolve an article by its number (manual input fallback).
 */
export async function resolveByNumber(
  prisma: PrismaClient,
  tenantId: string,
  articleNumber: string
) {
  const article = await prisma.whArticle.findFirst({
    where: { tenantId, number: articleNumber, isActive: true },
    select: {
      id: true,
      number: true,
      name: true,
      unit: true,
      currentStock: true,
      minStock: true,
      warehouseLocation: true,
      images: true,
      stockTracking: true,
    },
  })

  if (!article) {
    throw new WhQrNotFoundError("Artikel nicht gefunden")
  }

  return article
}

/**
 * Generate label PDF for selected articles.
 * Uploads to Supabase Storage, returns signed URL.
 */
export async function generateLabelPdf(
  prisma: PrismaClient,
  tenantId: string,
  articleIds: string[],
  format?: string
) {
  // 1. Load articles (filtered by tenantId)
  const articles = await prisma.whArticle.findMany({
    where: {
      tenantId,
      id: { in: articleIds },
      isActive: true,
    },
    select: {
      id: true,
      number: true,
      name: true,
      unit: true,
    },
    orderBy: { number: "asc" },
  })

  if (articles.length === 0) {
    throw new WhQrNotFoundError("Keine Artikel gefunden")
  }

  // 2. Generate QR data URLs for each article
  const labels = await Promise.all(
    articles.map(async (article) => {
      const content = buildQrContent(tenantId, article.number)
      const qrDataUrl = await generateQrDataUrl(content)
      return {
        qrDataUrl,
        articleNumber: article.number,
        articleName: article.name,
        unit: article.unit,
      }
    })
  )

  // 3. Render PDF
  const labelFormat: LabelFormat = (format === "AVERY_L4731" ? "AVERY_L4731" : "AVERY_L4736")
  const pdfElement = React.createElement(QrLabelPdf, { labels, format: labelFormat })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  // 4. Upload to Supabase Storage
  const timestamp = Date.now()
  const storagePath = `qr-labels/etiketten_${timestamp}.pdf`

  try {
    await storage.upload(BUCKET, storagePath, Buffer.from(buffer), {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new WhQrValidationError(`PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`)
  }

  // 5. Create signed URL
  const signedUrl = await storage.createSignedReadUrl(BUCKET, storagePath, SIGNED_URL_EXPIRY_SECONDS)
  if (!signedUrl) {
    throw new WhQrValidationError("Failed to create signed URL")
  }

  const filename = `QR-Etiketten_${articles.length}_Artikel.pdf`

  return { signedUrl, filename }
}

/**
 * Generate label PDF for all active articles (optional group filter).
 */
export async function generateAllLabelsPdf(
  prisma: PrismaClient,
  tenantId: string,
  options?: { articleGroupId?: string; format?: string }
) {
  // Build where clause
  const where: Record<string, unknown> = {
    tenantId,
    isActive: true,
  }
  if (options?.articleGroupId) {
    where.groupId = options.articleGroupId
  }

  // Load all matching article IDs
  const articles = await prisma.whArticle.findMany({
    where,
    select: { id: true },
    orderBy: { number: "asc" },
  })

  if (articles.length === 0) {
    throw new WhQrNotFoundError("Keine Artikel gefunden")
  }

  return generateLabelPdf(
    prisma,
    tenantId,
    articles.map((a) => a.id),
    options?.format
  )
}

/**
 * Generate a single QR code as data URL for inline display.
 */
export async function generateSingleQr(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  const article = await prisma.whArticle.findFirst({
    where: { id: articleId, tenantId, isActive: true },
    select: {
      id: true,
      number: true,
      name: true,
      unit: true,
      currentStock: true,
    },
  })

  if (!article) {
    throw new WhQrNotFoundError("Artikel nicht gefunden")
  }

  const content = buildQrContent(tenantId, article.number)
  const dataUrl = await generateQrDataUrl(content)

  return {
    dataUrl,
    content,
    article: {
      id: article.id,
      number: article.number,
      name: article.name,
      unit: article.unit,
      currentStock: article.currentStock,
    },
  }
}

/**
 * List recent stock movements for an article (for Storno flow).
 */
export async function listRecentMovements(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string,
  limit?: number
) {
  return prisma.whStockMovement.findMany({
    where: { tenantId, articleId },
    orderBy: { createdAt: "desc" },
    take: limit ?? 10,
    select: {
      id: true,
      type: true,
      quantity: true,
      previousStock: true,
      newStock: true,
      date: true,
      reason: true,
      notes: true,
      createdAt: true,
      purchaseOrderId: true,
      orderId: true,
      documentId: true,
      article: {
        select: {
          id: true,
          number: true,
          name: true,
          unit: true,
        },
      },
    },
  })
}

/**
 * Find purchase order positions that reference an article and are not fully received.
 * Used by the scanner Wareneingang flow.
 */
export async function findPendingPositionsForArticle(
  prisma: PrismaClient,
  tenantId: string,
  articleId: string
) {
  const positions = await prisma.whPurchaseOrderPosition.findMany({
    where: {
      purchaseOrder: {
        tenantId,
        status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] },
      },
      articleId,
    },
    include: {
      purchaseOrder: {
        select: {
          id: true,
          number: true,
          orderDate: true,
          supplier: {
            select: { id: true, company: true },
          },
        },
      },
    },
    orderBy: { purchaseOrder: { orderDate: "desc" } },
  })

  // Filter positions where receivedQuantity < quantity
  return positions.filter(
    (p) => (p.receivedQuantity ?? 0) < (p.quantity ?? 0)
  )
}
