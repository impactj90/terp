import type { PrismaClient } from "@/generated/prisma/client"
import { randomUUID } from "crypto"
import * as iconv from "iconv-lite"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Types ---

export interface DatevExportOptions {
  invoiceIds?: string[]
  dateFrom?: Date
  dateTo?: Date
}

// --- Constants ---

/** DATEV USt-Schlüssel for Vorsteuer (inbound invoices) */
export const VAT_KEY_MAP: Record<number, number> = {
  19: 9,  // Vorsteuer 19%
  7: 8,   // Vorsteuer 7%
  0: 0,   // steuerfrei
}

// --- Error Classes ---

export class DatevExportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DatevExportValidationError"
  }
}

// --- Helper Functions ---

/**
 * Format a date as DDMM (4 digits, no year) — DATEV Belegdatum standard.
 */
export function formatDatevDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0")
  const m = (date.getMonth() + 1).toString().padStart(2, "0")
  return `${d}${m}`
}

/**
 * Format a number with comma as decimal separator (DATEV standard).
 */
function formatDecimal(value: number): string {
  return value.toFixed(2).replace(".", ",")
}

/**
 * Truncate a string to maxLen chars.
 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) : str
}

/**
 * Escape a DATEV field value: wrap in quotes if it contains semicolons or quotes.
 */
function escapeField(value: string): string {
  if (value.includes(";") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Determine the primary VAT rate from line items or use a default.
 */
function detectVatRate(lineItems: Array<{ vatRate: unknown }>): number {
  if (lineItems.length === 0) return 19
  // Most common rate among line items
  const rates = lineItems
    .map((li) => Number(li.vatRate ?? 19))
    .filter((r) => !isNaN(r))
  if (rates.length === 0) return 19
  // Return the rate with the highest frequency
  const freq = new Map<number, number>()
  for (const r of rates) freq.set(r, (freq.get(r) ?? 0) + 1)
  let best = 19
  let bestCount = 0
  for (const [rate, count] of freq) {
    if (count > bestCount) { best = rate; bestCount = count }
  }
  return best
}

// --- DATEV Header ---

/**
 * Build DATEV Buchungsstapel header line (row 1).
 * Format: "EXTF";700;21;"Buchungsstapel";12;...
 */
export function buildDatevHeader(): string {
  const now = new Date()
  const created = now.toISOString().replace(/[-:T]/g, "").slice(0, 14) // YYYYMMDDHHmmss
  const fiscalYearStart = `${now.getFullYear()}0101`

  // DATEV header fields (simplified, standard Buchungsstapel format)
  const fields = [
    '"EXTF"',       // 1: Format identifier
    "700",          // 2: Version number
    "21",           // 3: Data category (21 = Buchungsstapel)
    '"Buchungsstapel"', // 4: Format name
    "12",           // 5: Format version
    created,        // 6: Created timestamp
    '""',           // 7: Reserved
    '""',           // 8: Reserved
    '""',           // 9: Exported from (Herkunft)
    '""',           // 10: Exported by
    '""',           // 11: Imported by
    '""',           // 12: Consultant number (Berater)
    '""',           // 13: Client number (Mandant)
    fiscalYearStart, // 14: Fiscal year start
    "4",            // 15: Account length (Sachkontenlänge)
    '""',           // 16: Date from
    '""',           // 17: Date to
    '""',           // 18: Description
    '""',           // 19: Dictation sign
    "0",            // 20: Booking type (0 = Eingangsrechnungen)
    "0",            // 21: Rechnungslegungszweck
    "0",            // 22: Reserved
    '""',           // 23: Currency
    '""',           // 24: Reserved
    '""',           // 25: Reserved
    '""',           // 26: Reserved
  ]

  return fields.join(";")
}

/**
 * Build DATEV column header line (row 2).
 */
export function buildColumnHeader(): string {
  return [
    // Pos 1-14 (bestehend)
    "Umsatz (ohne Soll/Haben-Kz)",          // 1
    "Soll/Haben-Kennzeichen",               // 2
    "WKZ Umsatz",                           // 3
    "Kurs",                                 // 4
    "Basis-Umsatz",                         // 5
    "WKZ Basis-Umsatz",                     // 6
    "Konto",                                // 7
    "Gegenkonto (ohne BU-Schl\u00FCssel)",  // 8
    "BU-Schl\u00FCssel",                    // 9
    "Belegdatum",                           // 10
    "Belegfeld 1",                          // 11
    "Belegfeld 2",                          // 12
    "Skonto",                               // 13
    "Buchungstext",                         // 14
    // Pos 15-36 (benannt aber nicht befüllt — Header-Namen sind Pflicht)
    "Postensperre",                         // 15
    "Diverse Adressnummer",                 // 16
    "Gesch\u00E4ftspartnerbank",            // 17
    "Sachverhalt",                          // 18
    "Zinssperre",                           // 19
    "Beleglink",                            // 20
    "Beleginfo \u2013 Art 1",              // 21
    "Beleginfo \u2013 Inhalt 1",           // 22
    "Beleginfo \u2013 Art 2",              // 23
    "Beleginfo \u2013 Inhalt 2",           // 24
    "Beleginfo \u2013 Art 3",              // 25
    "Beleginfo \u2013 Inhalt 3",           // 26
    "Beleginfo \u2013 Art 4",              // 27
    "Beleginfo \u2013 Inhalt 4",           // 28
    "Beleginfo \u2013 Art 5",              // 29
    "Beleginfo \u2013 Inhalt 5",           // 30
    "Beleginfo \u2013 Art 6",              // 31
    "Beleginfo \u2013 Inhalt 6",           // 32
    "Beleginfo \u2013 Art 7",              // 33
    "Beleginfo \u2013 Inhalt 7",           // 34
    "Beleginfo \u2013 Art 8",              // 35
    "Beleginfo \u2013 Inhalt 8",           // 36
    // Pos 37-39 (KOST-Felder)
    "KOST1 \u2013 Kostenstelle",           // 37
    "KOST2 \u2013 Kostenstelle",           // 38
    "Kost-Menge",                           // 39
  ].join(";")
}

// --- Main Export Function ---

/**
 * Export approved inbound invoices as DATEV Buchungsstapel CSV.
 * Returns a Windows-1252 encoded Buffer.
 */
export async function exportToCsv(
  prisma: PrismaClient,
  tenantId: string,
  options: DatevExportOptions,
  userId: string,
  audit?: AuditContext
): Promise<{ csv: Buffer; filename: string; count: number }> {
  // 1. Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    tenantId,
    status: "APPROVED",
  }

  if (options.invoiceIds && options.invoiceIds.length > 0) {
    where.id = { in: options.invoiceIds }
  }

  if (options.dateFrom || options.dateTo) {
    where.invoiceDate = {
      ...(options.dateFrom ? { gte: options.dateFrom } : {}),
      ...(options.dateTo ? { lte: options.dateTo } : {}),
    }
  }

  // 2. Load invoices
  const invoices = await prisma.inboundInvoice.findMany({
    where,
    include: {
      supplier: { select: { company: true, vatId: true } },
      lineItems: { select: { vatRate: true } },
      order: { select: { code: true } },
      costCenter: { select: { code: true } },
    },
    orderBy: { invoiceDate: "asc" },
  })

  if (invoices.length === 0) {
    throw new DatevExportValidationError("Keine exportierbaren Rechnungen gefunden")
  }

  // 3. Build CSV content
  const lines: string[] = []

  // Row 1: DATEV header
  lines.push(buildDatevHeader())

  // Row 2: Column headers
  lines.push(buildColumnHeader())

  // Row 3+: Data rows
  for (const inv of invoices) {
    const vatRate = detectVatRate(inv.lineItems)
    const vatKey = VAT_KEY_MAP[vatRate] ?? ""
    const supplierName = inv.supplier?.company ?? inv.sellerName ?? ""
    const buchungstext = truncate(
      `${supplierName} ${inv.invoiceNumber ?? ""}`.trim(),
      60
    )

    const row = [
      // Pos 1-14
      formatDecimal(Number(inv.totalGross ?? 0)),           // 1: Umsatz
      "S",                                                   // 2: Soll
      "EUR",                                                 // 3: WKZ
      "",                                                    // 4: Kurs
      "",                                                    // 5: Basis-Umsatz
      "",                                                    // 6: WKZ Basis-Umsatz
      "",                                                    // 7: Konto (Phase 3)
      "",                                                    // 8: Gegenkonto (Phase 3)
      String(vatKey),                                        // 9: BU-Schlüssel
      inv.invoiceDate ? formatDatevDate(inv.invoiceDate) : "", // 10: Belegdatum
      escapeField(truncate(inv.invoiceNumber ?? "", 12)),    // 11: Belegfeld 1
      "",                                                    // 12: Belegfeld 2
      "",                                                    // 13: Skonto
      escapeField(buchungstext),                             // 14: Buchungstext
      // Pos 15-36 (22 leere Strings)
      "", "", "", "", "", "",                                 // 15-20
      "", "", "", "", "", "",                                 // 21-26
      "", "", "", "", "", "",                                 // 27-32
      "", "", "", "",                                         // 33-36
      // Pos 37-39 (KOST-Felder)
      escapeField(inv.order?.code ?? ""),                    // 37: KOST1
      escapeField(inv.costCenter?.code ?? ""),               // 38: KOST2
      "",                                                    // 39: KOST-Menge
    ]

    lines.push(row.join(";"))
  }

  // 4. Join lines with CRLF (DATEV standard) and encode to Windows-1252
  const csvString = lines.join("\r\n") + "\r\n"
  const csvBuffer = iconv.encode(csvString, "win1252")

  // 5. Mark invoices as exported
  const now = new Date()
  await prisma.inboundInvoice.updateMany({
    where: { id: { in: invoices.map((i) => i.id) } },
    data: { status: "EXPORTED", datevExportedAt: now, datevExportedBy: userId },
  })

  // 6. Audit log
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "export",
        entityType: "inbound_invoice",
        // Synthetic batch ID — DATEV export is a virtual entity, no
        // single invoice to link to. `entity_id` is @db.Uuid NOT NULL,
        // so any string literal fails silently via the .catch() below.
        entityId: randomUUID(),
        entityName: `DATEV Export (${invoices.length} Rechnungen)`,
        changes: {
          exportedInvoices: {
            old: null,
            new: invoices.map((i) => i.number).join(", "),
          },
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  // 7. Build filename
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "")
  const filename = `DATEV_Buchungsstapel_${dateStr}.csv`

  return { csv: csvBuffer, filename, count: invoices.length }
}
