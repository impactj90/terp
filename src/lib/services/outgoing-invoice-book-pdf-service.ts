import type { PrismaClient } from "@/generated/prisma/client"
import { randomUUID } from "crypto"
import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import * as storage from "@/lib/supabase/storage"
import * as bookService from "./outgoing-invoice-book-service"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { OutgoingInvoiceBookPdf } from "@/lib/pdf/outgoing-invoice-book-pdf"

export class OutgoingInvoiceBookPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OutgoingInvoiceBookPdfError"
  }
}

const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 60

function yyyymmdd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function isFullMonth(from: Date, to: Date): boolean {
  if (from.getFullYear() !== to.getFullYear()) return false
  if (from.getMonth() !== to.getMonth()) return false
  if (from.getDate() !== 1) return false
  const lastDay = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate()
  return to.getDate() === lastDay
}

export function buildFilename(from: Date, to: Date, ext: "pdf" | "csv"): string {
  if (isFullMonth(from, to)) {
    const y = from.getFullYear()
    const m = String(from.getMonth() + 1).padStart(2, "0")
    return `Rechnungsausgangsbuch_${y}-${m}.${ext}`
  }
  return `Rechnungsausgangsbuch_${yyyymmdd(from)}_bis_${yyyymmdd(to)}.${ext}`
}

export async function generateAndGetDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: Date; dateTo: Date },
  audit?: AuditContext
): Promise<{ signedUrl: string; filename: string; count: number }> {
  const { entries, summary } = await bookService.list(prisma, tenantId, params)
  const tenantConfig = await billingTenantConfigRepo.findByTenantId(
    prisma,
    tenantId
  )

  const pdfElement = React.createElement(OutgoingInvoiceBookPdf, {
    entries,
    summary,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    tenantConfig,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  const storagePath = `rechnungsausgangsbuch/${tenantId}/${yyyymmdd(
    params.dateFrom
  )}_bis_${yyyymmdd(params.dateTo)}.pdf`

  try {
    await storage.upload(BUCKET, storagePath, Buffer.from(buffer), {
      contentType: "application/pdf",
      upsert: true,
    })
  } catch (err) {
    throw new OutgoingInvoiceBookPdfError(
      `PDF upload failed: ${err instanceof Error ? err.message : "unknown"}`
    )
  }

  const signedUrl = await storage.createSignedReadUrl(
    BUCKET,
    storagePath,
    SIGNED_URL_EXPIRY_SECONDS
  )
  if (!signedUrl) {
    throw new OutgoingInvoiceBookPdfError(
      "Signed URL generation failed after upload"
    )
  }

  const filename = buildFilename(params.dateFrom, params.dateTo, "pdf")

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "export",
        entityType: "outgoing_invoice_book",
        // Synthetic batch ID — the export is a virtual entity, no
        // persisted document to link to. Random per-event so each export
        // has its own trace in the audit log.
        entityId: randomUUID(),
        entityName: `${yyyymmdd(params.dateFrom)}_bis_${yyyymmdd(params.dateTo)}`,
        metadata: {
          format: "pdf",
          storagePath,
          entryCount: entries.length,
          totalNet: summary.totalNet,
          totalGross: summary.totalGross,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { signedUrl, filename, count: entries.length }
}
