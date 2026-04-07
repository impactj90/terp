import type { PrismaClient } from "@/generated/prisma/client"
import * as billingDocService from "./billing-document-service"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
import * as repo from "./billing-document-repository"
import { renderToBuffer } from "@react-pdf/renderer"
import * as storage from "@/lib/supabase/storage"
import { BillingDocumentPdf } from "@/lib/pdf/billing-document-pdf"
import { getStoragePath } from "@/lib/pdf/pdf-storage"
import * as auditLog from "./audit-logs-service"
import React from "react"

// --- Error Classes ---

export class BillingDocumentPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentPdfError"
  }
}

const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 60

/**
 * Generate PDF, upload to Supabase Storage, persist storagePath on document.
 * Called once on finalization. Overwrites any existing PDF for this document.
 * Returns the storage path (not a URL — use getSignedDownloadUrl for download).
 */
export async function generateAndStorePdf(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  userId?: string
): Promise<string> {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)

  // Get address for recipient block
  const address = await prisma.crmAddress.findFirst({
    where: { id: doc.addressId, tenantId },
    select: { company: true, street: true, zip: true, city: true },
  })

  // Get tenant config for letterhead
  const tenantConfig = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)

  // Build positions array from the document
  const positions = (doc as unknown as { positions: Array<{
    sortOrder: number; type: string; description?: string | null;
    quantity?: number | null; unit?: string | null;
    unitPrice?: number | null; totalPrice?: number | null;
    vatRate?: number | null;
  }> }).positions ?? []

  // 1. Render PDF to buffer
  const pdfElement = React.createElement(BillingDocumentPdf, {
    document: {
      id: doc.id,
      number: doc.number,
      type: doc.type,
      documentDate: doc.documentDate,
      deliveryDate: doc.deliveryDate,
      orderDate: doc.orderDate,
      headerText: (doc as Record<string, unknown>).headerText as string | null,
      footerText: (doc as Record<string, unknown>).footerText as string | null,
      subtotalNet: doc.subtotalNet,
      totalVat: doc.totalVat,
      totalGross: doc.totalGross,
      positions,
    },
    address,
    tenantConfig,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  // 2. Upload to Supabase Storage (private bucket)
  const storagePath = getStoragePath({
    type: doc.type,
    tenantId,
    id: doc.id,
    number: doc.number,
    company: address?.company,
  })

  try {
    await storage.upload(BUCKET, storagePath, Buffer.from(buffer), {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new BillingDocumentPdfError(`PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`)
  }

  // 3. Persist storage path on document (not a public URL — bucket is private)
  await repo.update(prisma, tenantId, documentId, { pdfUrl: storagePath })

  // 4. Audit log
  if (userId) {
    await auditLog.log(prisma, {
      tenantId,
      userId,
      action: "pdf_generated",
      entityType: "billing_document",
      entityId: documentId,
      entityName: doc.number,
      metadata: { storagePath },
    })
  }

  return storagePath
}

/**
 * Create a temporary signed download URL for an existing PDF.
 * Returns null if no PDF has been generated yet.
 */
export async function getSignedDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<{ signedUrl: string; filename: string } | null> {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  const storagePath = (doc as Record<string, unknown>).pdfUrl as string | null

  if (!storagePath) return null

  const signedUrl = await storage.createSignedReadUrl(BUCKET, storagePath, SIGNED_URL_EXPIRY_SECONDS)
  if (!signedUrl) return null

  const filename = `${doc.number.replace(/[/\\]/g, "_")}.pdf`

  return { signedUrl, filename }
}

/**
 * Generate PDF if not yet generated, then return signed download URL.
 */
export async function generateAndGetDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<{ signedUrl: string; filename: string }> {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  const storagePath = (doc as Record<string, unknown>).pdfUrl as string | null

  // Generate if not yet done
  if (!storagePath) {
    await generateAndStorePdf(prisma, tenantId, documentId)
  }

  // Try to get signed URL; if file is missing in storage, regenerate
  let result = await getSignedDownloadUrl(prisma, tenantId, documentId)
  if (!result) {
    await generateAndStorePdf(prisma, tenantId, documentId)
    result = await getSignedDownloadUrl(prisma, tenantId, documentId)
  }
  if (!result) {
    throw new BillingDocumentPdfError("PDF generation succeeded but signed URL creation failed")
  }
  return result
}

/**
 * Legacy query — kept for backwards compatibility with the existing tRPC endpoint.
 */
export async function generatePdf(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  const storagePath = (doc as Record<string, unknown>).pdfUrl as string | null

  return {
    documentId: doc.id,
    documentNumber: doc.number,
    documentType: doc.type,
    pdfUrl: storagePath,
    message: storagePath ? "PDF available" : "PDF not yet generated (will be generated on finalization)",
  }
}
