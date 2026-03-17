import type { PrismaClient } from "@/generated/prisma/client"
import * as billingDocService from "./billing-document-service"

// --- Error Classes ---

export class BillingDocumentPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentPdfError"
  }
}

/**
 * Generate a PDF preview for a billing document.
 * Returns a URL or base64 data. Stub implementation for now.
 */
export async function generatePdf(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)

  // TODO: Implement actual PDF generation using @react-pdf/renderer or similar
  return {
    documentId: doc.id,
    documentNumber: doc.number,
    documentType: doc.type,
    pdfUrl: null as string | null,
    message: "PDF generation not yet implemented",
  }
}
