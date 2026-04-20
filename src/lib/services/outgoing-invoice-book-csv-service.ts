import type { PrismaClient } from "@/generated/prisma/client"
import { randomUUID } from "crypto"
import * as iconv from "iconv-lite"
import * as bookService from "./outgoing-invoice-book-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { buildFilename } from "./outgoing-invoice-book-pdf-service"

const COLUMNS = [
  "Rechnungsnummer",
  "Datum",
  "Typ",
  "Kunde",
  "Kundennummer",
  "USt-IdNr.",
  "Leistungszeitraum von",
  "Leistungszeitraum bis",
  "Netto",
  "USt-Satz",
  "USt-Betrag",
  "Brutto",
]

const BOM = Buffer.from([0xef, 0xbb, 0xbf])

export type CsvEncoding = "utf8" | "win1252"

function formatDateDE(d: Date | string): string {
  const x = d instanceof Date ? d : new Date(d)
  const day = String(x.getDate()).padStart(2, "0")
  const m = String(x.getMonth() + 1).padStart(2, "0")
  const y = x.getFullYear()
  return `${day}.${m}.${y}`
}

function formatDecimalDE(n: number): string {
  return n.toFixed(2).replace(".", ",")
}

function escapeField(value: string): string {
  if (
    value.includes(";") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function renderCsvString(
  entries: Awaited<ReturnType<typeof bookService.list>>["entries"]
): { csv: string; rowCount: number } {
  const lines: string[] = []
  lines.push(COLUMNS.join(";"))
  let rowCount = 0

  for (const e of entries) {
    if (e.vatBreakdown.length === 0) {
      lines.push(
        [
          escapeField(e.number),
          formatDateDE(e.documentDate),
          e.type === "INVOICE" ? "Rechnung" : "Gutschrift",
          escapeField(e.customerName),
          escapeField(e.customerNumber ?? ""),
          escapeField(e.customerVatId ?? ""),
          e.servicePeriodFrom ? formatDateDE(e.servicePeriodFrom) : "",
          e.servicePeriodTo ? formatDateDE(e.servicePeriodTo) : "",
          "",
          "",
          "",
          "",
        ].join(";")
      )
      rowCount++
      continue
    }
    for (const v of e.vatBreakdown) {
      lines.push(
        [
          escapeField(e.number),
          formatDateDE(e.documentDate),
          e.type === "INVOICE" ? "Rechnung" : "Gutschrift",
          escapeField(e.customerName),
          escapeField(e.customerNumber ?? ""),
          escapeField(e.customerVatId ?? ""),
          e.servicePeriodFrom ? formatDateDE(e.servicePeriodFrom) : "",
          e.servicePeriodTo ? formatDateDE(e.servicePeriodTo) : "",
          formatDecimalDE(v.net),
          formatDecimalDE(v.vatRate),
          formatDecimalDE(v.vat),
          formatDecimalDE(v.gross),
        ].join(";")
      )
      rowCount++
    }
  }

  return { csv: lines.join("\r\n") + "\r\n", rowCount }
}

export function encodeCsv(csvString: string, encoding: CsvEncoding): Buffer {
  if (encoding === "win1252") {
    return iconv.encode(csvString, "win1252")
  }
  return Buffer.concat([BOM, Buffer.from(csvString, "utf8")])
}

export async function exportToCsv(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: Date; dateTo: Date; encoding: CsvEncoding },
  audit?: AuditContext
): Promise<{ csv: string; filename: string; count: number; rowCount: number }> {
  const { entries } = await bookService.list(prisma, tenantId, {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  })
  const { csv: csvString, rowCount } = renderCsvString(entries)
  const buffer = encodeCsv(csvString, params.encoding)
  const filename = buildFilename(params.dateFrom, params.dateTo, "csv")

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "export",
        entityType: "outgoing_invoice_book",
        // Synthetic batch ID — the export is a virtual entity with no
        // persisted document to link to. Random per-event so each
        // export has its own trace in the audit log.
        entityId: randomUUID(),
        entityName: filename,
        metadata: {
          format: "csv",
          encoding: params.encoding,
          entryCount: entries.length,
          rowCount,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return {
    csv: buffer.toString("base64"),
    filename,
    count: entries.length,
    rowCount,
  }
}
