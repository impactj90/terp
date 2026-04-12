/**
 * Payroll Bulk Import Service (Phase 3.4)
 *
 * Parses a CSV or XLSX file containing payroll master data per employee,
 * validates each row using the centralized `payroll-validators`, and
 * applies the changes transactionally to the `employees` table.
 *
 * The import is keyed on `personnelNumber`. Every other field is optional;
 * when present it must be valid. Validation failures block the whole
 * import — the user must fix the file and re-upload.
 *
 * Encrypted fields (taxId, socialSecurityNumber, iban) are encrypted
 * before storage via `encryptField`. They never leave this file in
 * plaintext.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import {
  validateIban,
  validateTaxId,
  validateSocialSecurityNumber,
  validateTaxClass,
  validateContributionGroupCode,
  validateActivityCode,
  validatePersonnelGroupCode,
} from "./payroll-validators"
import { encryptField } from "./field-encryption"

export class PayrollBulkImportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PayrollBulkImportValidationError"
  }
}

/**
 * Canonical column keys the import understands. Left-hand side is the
 * internal field name, right-hand side is the list of alternative
 * header labels a user might type in the CSV (case-insensitive match).
 */
export const COLUMN_ALIASES: Record<string, string[]> = {
  personnelNumber: ["personnelnumber", "personalnummer", "pers.-nr.", "pers nr", "pnr"],
  firstName: ["firstname", "vorname"],
  lastName: ["lastname", "nachname", "name"],
  email: ["email", "e-mail", "mail"],
  iban: ["iban", "bankverbindung"],
  bic: ["bic", "swift"],
  accountHolder: ["accountholder", "kontoinhaber"],
  taxId: ["taxid", "steuer-id", "steuer id", "steuerid", "stid"],
  taxClass: ["taxclass", "steuerklasse", "stkl"],
  childTaxAllowance: ["childtaxallowance", "kinderfreibetrag"],
  denomination: ["denomination", "konfession"],
  socialSecurityNumber: ["socialsecuritynumber", "svnr", "sozialversicherungsnummer", "rentenversicherungsnummer"],
  personnelGroupCode: ["personnelgroupcode", "persgruppe", "pgr"],
  contributionGroupCode: ["contributiongroupcode", "beitragsgruppe", "bgs"],
  activityCode: ["activitycode", "tätigkeitsschlüssel", "taetigkeitsschluessel", "tks"],
  grossSalary: ["grosssalary", "bruttogehalt", "brutto"],
  hourlyRate: ["hourlyrate", "stundenlohn"],
  paymentType: ["paymenttype", "zahlungstyp"],
}

export interface RawRow {
  lineNumber: number
  values: Record<string, string>
}

export interface ParsedRow {
  lineNumber: number
  personnelNumber: string
  changes: Record<string, unknown>
  errors: string[]
}

export interface ParseResult {
  columns: string[]
  rows: ParsedRow[]
  rowCount: number
  validCount: number
  invalidCount: number
  matchedEmployees: number
  unmatchedPersonnelNumbers: string[]
  hasErrors: boolean
}

// ─────────────────────────────────────────────────────────────
// File parsing
// ─────────────────────────────────────────────────────────────

/**
 * Parse a CSV file. Accepts semicolon or comma separator. Uses the
 * first non-empty line as header. Returns rows with `lineNumber`
 * matching the original file so users can correlate error messages
 * with spreadsheet rows.
 */
export function parseCsv(content: string): {
  columns: string[]
  rows: RawRow[]
} {
  const text = content.replace(/^\uFEFF/, "") // strip UTF-8 BOM
  const rawLines = text.split(/\r?\n/)
  const lines: { lineNumber: number; text: string }[] = []
  rawLines.forEach((line, idx) => {
    if (line.trim().length === 0) return
    lines.push({ lineNumber: idx + 1, text: line })
  })
  if (lines.length === 0) {
    throw new PayrollBulkImportValidationError("Datei ist leer")
  }
  const headerLine = lines[0]!.text
  const separator = detectSeparator(headerLine)
  const columns = splitCsvLine(headerLine, separator).map((c) => c.trim())
  const rows: RawRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const { lineNumber, text: line } = lines[i]!
    const cells = splitCsvLine(line, separator)
    const values: Record<string, string> = {}
    columns.forEach((col, idx) => {
      values[col] = (cells[idx] ?? "").trim()
    })
    rows.push({ lineNumber, values })
  }
  return { columns, rows }
}

function detectSeparator(line: string): string {
  const semi = (line.match(/;/g) ?? []).length
  const comma = (line.match(/,/g) ?? []).length
  const tab = (line.match(/\t/g) ?? []).length
  if (tab >= semi && tab >= comma) return "\t"
  return semi >= comma ? ";" : ","
}

function splitCsvLine(line: string, separator: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === separator) {
        out.push(cur)
        cur = ""
      } else cur += ch
    }
  }
  out.push(cur)
  return out
}

export async function parseXlsx(buffer: Buffer): Promise<{
  columns: string[]
  rows: RawRow[]
}> {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.default.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) {
    throw new PayrollBulkImportValidationError("XLSX enthält kein Arbeitsblatt")
  }
  const rowsOut: RawRow[] = []
  let columns: string[] = []
  sheet.eachRow({ includeEmpty: false }, (row, rowIndex) => {
    const values: string[] = []
    for (let c = 1; c <= (row.actualCellCount || 0); c++) {
      const cell = row.getCell(c)
      const val = cell.value
      if (val == null) {
        values.push("")
      } else if (typeof val === "object" && "text" in val) {
        values.push(String((val as { text: string }).text ?? ""))
      } else if (val instanceof Date) {
        values.push(val.toISOString().slice(0, 10))
      } else {
        values.push(String(val))
      }
    }
    if (rowIndex === 1) {
      columns = values.map((c) => c.trim())
    } else {
      const rec: Record<string, string> = {}
      columns.forEach((col, idx) => {
        rec[col] = (values[idx] ?? "").trim()
      })
      rowsOut.push({ lineNumber: rowIndex, values: rec })
    }
  })
  return { columns, rows: rowsOut }
}

// ─────────────────────────────────────────────────────────────
// Column mapping
// ─────────────────────────────────────────────────────────────

/**
 * Auto-map a set of header columns to internal field names. Users can
 * override this via the UI before confirming the import.
 */
export function autoMapColumns(headerColumns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const lowerAliases: Record<string, string> = {}
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      lowerAliases[alias.toLowerCase()] = canonical
    }
    lowerAliases[canonical.toLowerCase()] = canonical
  }
  for (const col of headerColumns) {
    const key = col.trim().toLowerCase()
    const canonical = lowerAliases[key]
    if (canonical) mapping[col] = canonical
  }
  return mapping
}

// ─────────────────────────────────────────────────────────────
// Row validation
// ─────────────────────────────────────────────────────────────

function parseDecimal(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(",", ".")
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  return Number(normalized)
}

function parseInt10(value: string): number | null {
  if (!/^-?\d+$/.test(value)) return null
  return Number(value)
}

export function validateAndMapRow(
  rawRow: RawRow,
  columnMapping: Record<string, string>,
): ParsedRow {
  const out: ParsedRow = {
    lineNumber: rawRow.lineNumber,
    personnelNumber: "",
    changes: {},
    errors: [],
  }

  const byField: Record<string, string> = {}
  for (const [col, val] of Object.entries(rawRow.values)) {
    const field = columnMapping[col]
    if (!field) continue
    if (val != null && val.trim() !== "") byField[field] = val.trim()
  }

  const pnr = byField.personnelNumber?.trim()
  if (!pnr) {
    out.errors.push("personnelNumber fehlt (Pflichtspalte)")
    return out
  }
  out.personnelNumber = pnr

  // Simple string fields
  for (const field of ["firstName", "lastName", "email", "bic", "accountHolder", "denomination", "paymentType"]) {
    const v = byField[field]
    if (v !== undefined) out.changes[field] = v
  }

  // IBAN
  if (byField.iban !== undefined) {
    const res = validateIban(byField.iban)
    if (!res.valid) out.errors.push(`IBAN: ${res.error}`)
    else out.changes.iban = byField.iban.replace(/\s/g, "")
  }

  // Tax ID
  if (byField.taxId !== undefined) {
    const res = validateTaxId(byField.taxId)
    if (!res.valid) out.errors.push(`Steuer-ID: ${res.error}`)
    else out.changes.taxId = byField.taxId.replace(/\s/g, "")
  }

  // SSN
  if (byField.socialSecurityNumber !== undefined) {
    const res = validateSocialSecurityNumber(byField.socialSecurityNumber)
    if (!res.valid) out.errors.push(`SV-Nr.: ${res.error}`)
    else
      out.changes.socialSecurityNumber = byField.socialSecurityNumber
        .replace(/\s/g, "")
        .toUpperCase()
  }

  // Tax class
  if (byField.taxClass !== undefined) {
    const n = parseInt10(byField.taxClass)
    if (n == null) out.errors.push("Steuerklasse: muss eine Zahl sein")
    else {
      const res = validateTaxClass(n)
      if (!res.valid) out.errors.push(`Steuerklasse: ${res.error}`)
      else out.changes.taxClass = n
    }
  }

  // Personnel group code
  if (byField.personnelGroupCode !== undefined) {
    const res = validatePersonnelGroupCode(byField.personnelGroupCode)
    if (!res.valid) out.errors.push(`Personengruppenschlüssel: ${res.error}`)
    else out.changes.personnelGroupCode = byField.personnelGroupCode
  }

  // Contribution group code
  if (byField.contributionGroupCode !== undefined) {
    const res = validateContributionGroupCode(byField.contributionGroupCode)
    if (!res.valid) out.errors.push(`Beitragsgruppenschlüssel: ${res.error}`)
    else out.changes.contributionGroupCode = byField.contributionGroupCode
  }

  // Activity code (Tätigkeitsschlüssel)
  if (byField.activityCode !== undefined) {
    const res = validateActivityCode(byField.activityCode)
    if (!res.valid) out.errors.push(`Tätigkeitsschlüssel: ${res.error}`)
    else out.changes.activityCode = byField.activityCode
  }

  // Child tax allowance
  if (byField.childTaxAllowance !== undefined) {
    const n = parseDecimal(byField.childTaxAllowance)
    if (n == null) out.errors.push("Kinderfreibetrag: muss eine Zahl sein")
    else out.changes.childTaxAllowance = n
  }

  // Compensation
  if (byField.grossSalary !== undefined) {
    const n = parseDecimal(byField.grossSalary)
    if (n == null || n < 0)
      out.errors.push("Bruttogehalt: muss eine nicht-negative Zahl sein")
    else out.changes.grossSalary = n
  }
  if (byField.hourlyRate !== undefined) {
    const n = parseDecimal(byField.hourlyRate)
    if (n == null || n < 0)
      out.errors.push("Stundenlohn: muss eine nicht-negative Zahl sein")
    else out.changes.hourlyRate = n
  }

  return out
}

// ─────────────────────────────────────────────────────────────
// Main entry points
// ─────────────────────────────────────────────────────────────

/**
 * Parses a file and validates every row, returning a preview the
 * frontend can show before the user confirms the import.
 */
export async function parseFile(
  prisma: PrismaClient,
  tenantId: string,
  fileBase64: string,
  filename: string,
  columnMappingOverride?: Record<string, string>,
): Promise<ParseResult> {
  const buffer = Buffer.from(fileBase64, "base64")
  let columns: string[]
  let rawRows: RawRow[]
  if (filename.toLowerCase().endsWith(".xlsx")) {
    const r = await parseXlsx(buffer)
    columns = r.columns
    rawRows = r.rows
  } else {
    const r = parseCsv(buffer.toString("utf8"))
    columns = r.columns
    rawRows = r.rows
  }

  const mapping = columnMappingOverride ?? autoMapColumns(columns)
  // Ensure personnelNumber is mapped
  if (!Object.values(mapping).includes("personnelNumber")) {
    throw new PayrollBulkImportValidationError(
      "Spalte 'Personalnummer' konnte nicht erkannt werden. Bitte Datei prüfen.",
    )
  }

  const parsed = rawRows.map((row) => validateAndMapRow(row, mapping))

  // Check which personnelNumbers actually exist in the tenant
  const personnelNumbers = parsed
    .filter((r) => r.personnelNumber.length > 0)
    .map((r) => r.personnelNumber)
  const existing = await prisma.employee.findMany({
    where: { tenantId, personnelNumber: { in: personnelNumbers } },
    select: { personnelNumber: true },
  })
  const existingSet = new Set(existing.map((e) => e.personnelNumber))
  const unmatchedSet = new Set<string>()
  for (const row of parsed) {
    if (row.personnelNumber && !existingSet.has(row.personnelNumber)) {
      row.errors.push(
        `Personalnummer "${row.personnelNumber}" existiert nicht`,
      )
      unmatchedSet.add(row.personnelNumber)
    }
  }

  const validCount = parsed.filter((r) => r.errors.length === 0).length
  const invalidCount = parsed.length - validCount
  return {
    columns,
    rows: parsed,
    rowCount: parsed.length,
    validCount,
    invalidCount,
    matchedEmployees: existingSet.size,
    unmatchedPersonnelNumbers: Array.from(unmatchedSet),
    hasErrors: invalidCount > 0,
  }
}

/**
 * Confirms the import after the user has reviewed the preview.
 * All updates run inside a single `$transaction` with an extended
 * timeout to accommodate up to ~500 employees.
 */
export async function confirmImport(
  prisma: PrismaClient,
  tenantId: string,
  fileBase64: string,
  filename: string,
  columnMappingOverride: Record<string, string> | undefined,
  audit?: AuditContext,
): Promise<{
  updated: number
  skipped: number
  failedRows: ParsedRow[]
}> {
  const parseResult = await parseFile(
    prisma,
    tenantId,
    fileBase64,
    filename,
    columnMappingOverride,
  )
  if (parseResult.hasErrors) {
    throw new PayrollBulkImportValidationError(
      "Import enthält Validierungsfehler. Bitte zuerst alle Fehler korrigieren.",
    )
  }

  let updated = 0
  const failed: ParsedRow[] = []

  await prisma.$transaction(
    async (tx) => {
      for (const row of parseResult.rows) {
        const changes = { ...row.changes } as Record<string, unknown>
        // Encrypt sensitive fields
        if (typeof changes.iban === "string") {
          changes.iban = encryptField(changes.iban)
        }
        if (typeof changes.taxId === "string") {
          changes.taxId = encryptField(changes.taxId)
        }
        if (typeof changes.socialSecurityNumber === "string") {
          changes.socialSecurityNumber = encryptField(
            changes.socialSecurityNumber,
          )
        }
        try {
          const { count } = await tx.employee.updateMany({
            where: { tenantId, personnelNumber: row.personnelNumber },
            data: changes,
          })
          if (count > 0) updated += 1
          else failed.push(row)
        } catch (err) {
          row.errors.push(err instanceof Error ? err.message : String(err))
          failed.push(row)
        }
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  )

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "bulk_import",
        entityType: "employee",
        entityId: tenantId, // no single entity — key on tenant for the batch
        entityName: `Massenimport ${filename}`,
        changes: {
          updated,
          failed: failed.length,
          totalRows: parseResult.rowCount,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] bulk_import failed:", err))
  }

  return { updated, skipped: failed.length, failedRows: failed }
}

/**
 * Returns a CSV header-only template the user can download as
 * starting point.
 */
export function buildCsvTemplate(): string {
  const header = [
    "personnelNumber",
    "firstName",
    "lastName",
    "email",
    "iban",
    "bic",
    "accountHolder",
    "taxId",
    "taxClass",
    "childTaxAllowance",
    "denomination",
    "socialSecurityNumber",
    "personnelGroupCode",
    "contributionGroupCode",
    "activityCode",
    "grossSalary",
    "hourlyRate",
    "paymentType",
  ].join(";")
  return `${header}\n`
}
