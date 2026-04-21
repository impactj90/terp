/**
 * ServiceObject Import Service
 *
 * CSV bulk import with two-phase flow (parse → preview → commit).
 * Required columns: number, name, customerAddressNumber.
 * Optional columns: kind, parentNumber, internalNumber, manufacturer,
 *   model, serialNumber, yearBuilt, inServiceSince, description.
 *
 * Plan: 2026-04-21-serviceobjekte-stammdaten.md — Phase E.
 */
import type {
  PrismaClient,
  ServiceObjectKind,
} from "@/generated/prisma/client"
import * as repo from "./service-object-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class ServiceObjectImportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServiceObjectImportValidationError"
  }
}

// --- Types ---

const REQUIRED_COLUMNS = ["number", "name", "customerAddressNumber"] as const

const VALID_KINDS: ServiceObjectKind[] = [
  "SITE",
  "BUILDING",
  "SYSTEM",
  "EQUIPMENT",
  "COMPONENT",
]

export interface ServiceObjectImportRow {
  number: string
  name: string
  customerAddressNumber: string
  kind?: string
  parentNumber?: string
  internalNumber?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  yearBuilt?: string
  inServiceSince?: string
  description?: string
}

export interface ParsedRow {
  rowIndex: number
  data: ServiceObjectImportRow
  errors: string[]
}

export interface ParseResult {
  rows: ParsedRow[]
  rowCount: number
  validCount: number
  invalidCount: number
  resolvedCustomerAddresses: Record<string, string>
  unresolvedCustomerAddresses: string[]
  duplicateNumbers: string[]
  hasErrors: boolean
}

export interface FailedRow {
  rowIndex: number
  number: string
  error: string
}

// --- CSV Parsing ---

function decodeBase64Csv(fileBase64: string): string {
  const buffer = Buffer.from(fileBase64, "base64")
  const raw = buffer.toString("utf-8")
  return raw.replace(/^﻿/, "") // strip BOM
}

function detectSeparator(headerLine: string): string {
  if (headerLine.includes(";")) return ";"
  if (headerLine.includes("\t")) return "\t"
  return ","
}

function splitCsvLine(line: string, separator: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === separator) {
        out.push(cur)
        cur = ""
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseCsv(content: string): {
  columns: string[]
  rows: ServiceObjectImportRow[]
} {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    throw new ServiceObjectImportValidationError("CSV is empty")
  }
  const sep = detectSeparator(lines[0]!)
  const headers = splitCsvLine(lines[0]!, sep).map((h) => h.trim())

  const rows: ServiceObjectImportRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]!, sep)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (vals[idx] ?? "").trim()
    })
    rows.push(row as unknown as ServiceObjectImportRow)
  }

  return { columns: headers, rows }
}

// --- Validation Helpers ---

function validateRow(
  row: ServiceObjectImportRow,
  ctx: {
    csvNumbers: Set<string>
    dbNumbers: Set<string>
    resolvedCustomers: Record<string, string>
    unresolvedCustomers: Set<string>
  }
): string[] {
  const errors: string[] = []

  const number = (row.number ?? "").trim()
  if (!number) {
    errors.push("number is required")
  } else if (number.length > 50) {
    errors.push("number exceeds 50 characters")
  }

  const name = (row.name ?? "").trim()
  if (!name) {
    errors.push("name is required")
  }

  const customerNumber = (row.customerAddressNumber ?? "").trim()
  if (!customerNumber) {
    errors.push("customerAddressNumber is required")
  } else if (
    !(customerNumber in ctx.resolvedCustomers) &&
    ctx.unresolvedCustomers.has(customerNumber)
  ) {
    errors.push(
      `customer not found or not CUSTOMER/BOTH: ${customerNumber}`
    )
  }

  if (row.kind) {
    const kindUpper = row.kind.trim().toUpperCase()
    if (!VALID_KINDS.includes(kindUpper as ServiceObjectKind)) {
      errors.push(`invalid kind: ${row.kind}`)
    }
  }

  if (row.yearBuilt) {
    const yr = Number.parseInt(row.yearBuilt, 10)
    const current = new Date().getFullYear()
    if (!Number.isFinite(yr) || yr < 1900 || yr > current + 1) {
      errors.push(`yearBuilt out of range (1900..${current + 1}): ${row.yearBuilt}`)
    }
  }

  if (row.inServiceSince) {
    const iso = row.inServiceSince.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      errors.push(`inServiceSince must be YYYY-MM-DD: ${row.inServiceSince}`)
    } else {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) {
        errors.push(`inServiceSince invalid: ${row.inServiceSince}`)
      }
    }
  }

  return errors
}

function detectCycles(rows: ServiceObjectImportRow[]): Set<string> {
  const byNumber = new Map<string, string | null>()
  for (const r of rows) {
    byNumber.set(r.number.trim(), (r.parentNumber?.trim() || null))
  }
  const badNumbers = new Set<string>()
  for (const [num] of byNumber) {
    const visited = new Set<string>([num])
    let current: string | null = byNumber.get(num) ?? null
    while (current) {
      if (current === num || visited.has(current)) {
        badNumbers.add(num)
        break
      }
      if (!byNumber.has(current)) break // parent resolves against DB later
      visited.add(current)
      current = byNumber.get(current) ?? null
    }
  }
  return badNumbers
}

// --- Parse Phase ---

export async function parseServiceObjectImport(
  prisma: PrismaClient,
  tenantId: string,
  fileBase64: string,
  _filename: string
): Promise<ParseResult> {
  const content = decodeBase64Csv(fileBase64)
  const { columns, rows } = parseCsv(content)

  for (const req of REQUIRED_COLUMNS) {
    if (!columns.includes(req)) {
      throw new ServiceObjectImportValidationError(
        `Required column missing: ${req}`
      )
    }
  }

  // Resolve customer addresses by number (tenant-scoped)
  const customerNumbers = Array.from(
    new Set(
      rows
        .map((r) => r.customerAddressNumber?.trim())
        .filter((s): s is string => !!s)
    )
  )

  const addresses =
    customerNumbers.length === 0
      ? []
      : await prisma.crmAddress.findMany({
          where: {
            tenantId,
            number: { in: customerNumbers },
            type: { in: ["CUSTOMER", "BOTH"] },
          },
          select: { id: true, number: true },
        })

  const resolvedCustomers: Record<string, string> = {}
  addresses.forEach((a) => {
    resolvedCustomers[a.number] = a.id
  })
  const unresolvedCustomers = new Set(
    customerNumbers.filter((n) => !(n in resolvedCustomers))
  )

  // Check duplicates in CSV
  const csvNumbers = new Set<string>()
  const duplicateNumbersInCsv: string[] = []
  for (const r of rows) {
    const n = r.number?.trim()
    if (!n) continue
    if (csvNumbers.has(n)) duplicateNumbersInCsv.push(n)
    else csvNumbers.add(n)
  }

  // Check duplicates vs DB
  const existing = await prisma.serviceObject.findMany({
    where: { tenantId, number: { in: Array.from(csvNumbers) } },
    select: { number: true },
  })
  const dbNumbers = new Set(existing.map((e) => e.number))

  // Cycle detection
  const cyclicNumbers = detectCycles(rows)

  const parsed: ParsedRow[] = rows.map((data, idx) => {
    const errors = validateRow(data, {
      csvNumbers,
      dbNumbers,
      resolvedCustomers,
      unresolvedCustomers,
    })
    const num = data.number?.trim()
    if (num && dbNumbers.has(num)) {
      errors.push(`number already exists in database: ${num}`)
    }
    if (num && duplicateNumbersInCsv.includes(num)) {
      errors.push(`duplicate number in CSV: ${num}`)
    }
    if (num && cyclicNumbers.has(num)) {
      errors.push(`parentNumber creates a cycle`)
    }
    return { rowIndex: idx, data, errors }
  })

  const invalidCount = parsed.filter((r) => r.errors.length > 0).length
  return {
    rows: parsed,
    rowCount: parsed.length,
    validCount: parsed.length - invalidCount,
    invalidCount,
    resolvedCustomerAddresses: resolvedCustomers,
    unresolvedCustomerAddresses: Array.from(unresolvedCustomers),
    duplicateNumbers: duplicateNumbersInCsv,
    hasErrors: invalidCount > 0,
  }
}

// --- Commit Phase ---

export async function confirmServiceObjectImport(
  prisma: PrismaClient,
  tenantId: string,
  fileBase64: string,
  filename: string,
  audit: AuditContext
): Promise<{ created: number; failedRows: FailedRow[] }> {
  const preview = await parseServiceObjectImport(
    prisma,
    tenantId,
    fileBase64,
    filename
  )

  if (preview.hasErrors) {
    throw new ServiceObjectImportValidationError(
      `Import has ${preview.invalidCount} invalid rows; resolve them and retry`
    )
  }

  // Topological sort: root rows first, then children.
  const rowsByNumber = new Map<string, ServiceObjectImportRow>()
  preview.rows.forEach((r) => rowsByNumber.set(r.data.number.trim(), r.data))

  const sorted: ServiceObjectImportRow[] = []
  const inserted = new Set<string>()
  const remaining = new Map(rowsByNumber)

  let progress = true
  while (remaining.size > 0 && progress) {
    progress = false
    for (const [num, data] of Array.from(remaining)) {
      const parentNum = data.parentNumber?.trim() || ""
      const parentIsInCsv = parentNum && rowsByNumber.has(parentNum)
      if (!parentNum || !parentIsInCsv || inserted.has(parentNum)) {
        sorted.push(data)
        inserted.add(num)
        remaining.delete(num)
        progress = true
      }
    }
  }
  // Any still-remaining rows would indicate an undetected cycle — defensive.
  for (const [, data] of remaining) sorted.push(data)

  const failedRows: FailedRow[] = []
  let created = 0

  await prisma.$transaction(
    async (tx) => {
      const numberToId = new Map<string, string>()

      for (let i = 0; i < sorted.length; i++) {
        const data = sorted[i]!
        try {
          const number = data.number.trim()
          const customerAddressId =
            preview.resolvedCustomerAddresses[data.customerAddressNumber.trim()]
          if (!customerAddressId) {
            throw new Error(
              `customer address not resolved: ${data.customerAddressNumber}`
            )
          }

          // Resolve parentId: prefer CSV-batch insert, fall back to DB.
          let parentId: string | null = null
          const parentNum = data.parentNumber?.trim()
          if (parentNum) {
            const fromBatch = numberToId.get(parentNum)
            if (fromBatch) {
              parentId = fromBatch
            } else {
              const dbParent = await tx.serviceObject.findFirst({
                where: { tenantId, number: parentNum },
                select: { id: true },
              })
              if (!dbParent) {
                throw new Error(`parent not found: ${parentNum}`)
              }
              parentId = dbParent.id
            }
          }

          const kind = (data.kind?.trim().toUpperCase() ||
            "EQUIPMENT") as ServiceObjectKind

          const yearBuilt = data.yearBuilt
            ? Number.parseInt(data.yearBuilt, 10)
            : null

          const inServiceSince = data.inServiceSince?.trim()
            ? new Date(data.inServiceSince.trim())
            : null

          const qrCodePayload = `TERP:SO:${tenantId.substring(0, 6)}:${number}`

          const obj = await repo.create(tx as unknown as PrismaClient, {
            tenantId,
            number,
            name: data.name.trim(),
            description: data.description?.trim() || null,
            kind,
            parentId,
            customerAddressId,
            internalNumber: data.internalNumber?.trim() || null,
            manufacturer: data.manufacturer?.trim() || null,
            model: data.model?.trim() || null,
            serialNumber: data.serialNumber?.trim() || null,
            yearBuilt,
            inServiceSince,
            status: "OPERATIONAL",
            isActive: true,
            qrCodePayload,
            customFields: null,
            createdById: audit.userId,
          })

          numberToId.set(number, obj.id)
          created++

          await auditLog
            .log(tx as unknown as PrismaClient, {
              tenantId,
              userId: audit.userId,
              action: "bulk_import",
              entityType: "service_object",
              entityId: obj.id,
              entityName: obj.name ?? null,
              changes: null,
              ipAddress: audit.ipAddress,
              userAgent: audit.userAgent,
            })
            .catch((err) => console.error("[AuditLog] Failed:", err))
        } catch (err) {
          failedRows.push({
            rowIndex: i,
            number: data.number,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    },
    { timeout: 60_000, maxWait: 10_000 }
  )

  return { created, failedRows }
}
