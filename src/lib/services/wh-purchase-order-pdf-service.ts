import type { PrismaClient } from "@/generated/prisma/client"
import { renderToBuffer } from "@react-pdf/renderer"
import * as storage from "@/lib/supabase/storage"
import * as poService from "./wh-purchase-order-service"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
import React from "react"
import { PurchaseOrderPdf } from "@/lib/pdf/purchase-order-pdf"
import type { PurchaseOrderPosition } from "@/lib/pdf/purchase-order-position-table-pdf"

// --- Error Classes ---

export class WhPurchaseOrderPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhPurchaseOrderPdfError"
  }
}

const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 300 // 5 minutes

/**
 * Generate PO PDF, upload to Supabase Storage, set printedAt, return signed URL.
 * Generates fresh PDF on every call (PO data may change).
 */
export async function generateAndGetDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
): Promise<{ signedUrl: string; filename: string }> {
  // 1. Load PO with all relations (supplier, contact, positions)
  const order = await poService.getById(prisma, tenantId, purchaseOrderId)

  // 2. Load tenant config for letterhead
  const tenantConfig = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)

  // 3. Map supplier data
  const supplier = order.supplier as {
    company: string | null
    street: string | null
    zip: string | null
    city: string | null
    ourCustomerNumber: string | null
  } | null

  // 4. Map contact data
  const contact = order.contact as {
    firstName: string | null
    lastName: string | null
  } | null

  // 5. Map positions
  const positions: PurchaseOrderPosition[] = (
    (order as unknown as { positions: Array<{
      sortOrder: number
      positionType: string
      supplierArticleNumber: string | null
      description: string | null
      freeText: string | null
      quantity: number | null
      unit: string | null
      unitPrice: number | null
      flatCosts: number | null
      totalPrice: number | null
    }> }).positions ?? []
  ).map((p) => ({
    sortOrder: p.sortOrder,
    positionType: p.positionType,
    supplierArticleNumber: p.supplierArticleNumber,
    description: p.description,
    freeText: p.freeText,
    quantity: p.quantity,
    unit: p.unit,
    unitPrice: p.unitPrice,
    flatCosts: p.flatCosts,
    totalPrice: p.totalPrice,
  }))

  // 6. Render PDF to buffer
  const pdfElement = React.createElement(PurchaseOrderPdf, {
    order: {
      number: order.number,
      orderDate: order.orderDate,
      requestedDelivery: order.requestedDelivery,
      confirmedDelivery: order.confirmedDelivery,
      notes: order.notes,
      subtotalNet: order.subtotalNet,
      totalVat: order.totalVat,
      totalGross: order.totalGross,
    },
    supplier,
    contact,
    positions,
    tenantConfig,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  // 7. Upload to Supabase Storage (private bucket)
  const companyPart = supplier?.company ? `_${supplier.company}` : ""
  const raw = `${order.number}${companyPart}`
  const sanitized = raw
    .replace(/[äöüßÄÖÜ]/g, (ch) => ({ "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue" }[ch] ?? ch))
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  const storagePath = `bestellung/${sanitized}.pdf`

  try {
    await storage.upload(BUCKET, storagePath, Buffer.from(buffer), {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new WhPurchaseOrderPdfError(`PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`)
  }

  // 8. Set printedAt on the purchase order
  await prisma.whPurchaseOrder.updateMany({
    where: { id: purchaseOrderId, tenantId },
    data: { printedAt: new Date() },
  })

  // 9. Create signed URL for download
  const signedUrl = await storage.createSignedReadUrl(BUCKET, storagePath, SIGNED_URL_EXPIRY_SECONDS)
  if (!signedUrl) {
    throw new WhPurchaseOrderPdfError("Failed to create signed URL")
  }

  // 10. Build filename
  const filename = `${order.number.replace(/[/\\]/g, "_")}.pdf`

  return { signedUrl, filename }
}
