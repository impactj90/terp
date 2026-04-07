import type { PrismaClient } from "@/generated/prisma/client"
import { renderToBuffer } from "@react-pdf/renderer"
import * as storage from "@/lib/supabase/storage"
import * as stocktakeRepo from "./wh-stocktake-repository"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
import React from "react"
import { StocktakeProtocolPdf } from "@/lib/pdf/stocktake-protocol-pdf"

// --- Error Classes ---

export class WhStocktakePdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhStocktakePdfError"
  }
}

const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 300

/**
 * Generate stocktake protocol PDF, upload to storage, return signed URL.
 */
export async function generateAndGetDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  stocktakeId: string
): Promise<{ signedUrl: string; filename: string }> {
  // 1. Load stocktake
  const stocktake = await stocktakeRepo.findById(prisma, tenantId, stocktakeId)
  if (!stocktake) {
    throw new WhStocktakePdfError("Stocktake not found")
  }

  if (stocktake.status !== "COMPLETED") {
    throw new WhStocktakePdfError(
      "Only completed stocktakes can generate a protocol"
    )
  }

  // 2. Load all positions
  const positions = await stocktakeRepo.findAllPositions(prisma, stocktakeId)

  // 3. Load tenant config for letterhead
  const tenantConfig = await billingTenantConfigRepo.findByTenantId(
    prisma,
    tenantId
  )

  // 4. Compute summary
  const countedPositions = positions.filter(
    (p) => p.countedQuantity !== null && !p.skipped
  )
  const skippedPositions = positions.filter((p) => p.skipped)
  const positionsWithDifference = countedPositions.filter(
    (p) => p.difference !== null && p.difference !== 0
  )
  const totalDifference = countedPositions.reduce(
    (sum, p) => sum + (p.difference ?? 0),
    0
  )
  const totalValueDifference = countedPositions.reduce(
    (sum, p) => sum + (p.valueDifference ?? 0),
    0
  )

  // 5. Render PDF
  const pdfElement = React.createElement(StocktakeProtocolPdf, {
    stocktake: {
      number: stocktake.number,
      name: stocktake.name,
      referenceDate: stocktake.referenceDate,
      completedAt: stocktake.completedAt,
      notes: stocktake.notes,
    },
    positions: positions.map((p) => ({
      articleNumber: p.articleNumber,
      articleName: p.articleName,
      unit: p.unit,
      warehouseLocation: p.warehouseLocation,
      expectedQuantity: p.expectedQuantity,
      countedQuantity: p.countedQuantity,
      difference: p.difference,
      valueDifference: p.valueDifference,
      skipped: p.skipped,
      skipReason: p.skipReason,
      note: p.note,
    })),
    summary: {
      totalPositions: positions.length,
      countedPositions: countedPositions.length,
      skippedPositions: skippedPositions.length,
      positionsWithDifference: positionsWithDifference.length,
      totalDifference,
      totalValueDifference,
    },
    tenantConfig,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  // 6. Upload to Supabase Storage
  const sanitized = stocktake.number
    .replace(/[äöüßÄÖÜ]/g, (ch) =>
      ({
        ä: "ae",
        ö: "oe",
        ü: "ue",
        ß: "ss",
        Ä: "Ae",
        Ö: "Oe",
        Ü: "Ue",
      }[ch] ?? ch)
    )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")

  const storagePath = `inventur/${sanitized}.pdf`

  try {
    await storage.upload(BUCKET, storagePath, Buffer.from(buffer), {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new WhStocktakePdfError(
      `PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`
    )
  }

  // 7. Set printedAt
  await stocktakeRepo.updateStatus(prisma, stocktakeId, {
    status: "COMPLETED",
    printedAt: new Date(),
  })

  // 8. Create signed URL
  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    storagePath,
    SIGNED_URL_EXPIRY_SECONDS
  )
  if (!signedUrl) {
    throw new WhStocktakePdfError("Failed to create signed URL")
  }

  // 9. Return result
  const filename = `${stocktake.number.replace(/[/\\]/g, "_")}.pdf`

  return { signedUrl, filename }
}
