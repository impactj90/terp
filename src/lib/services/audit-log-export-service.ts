/**
 * Audit Log Export Service
 *
 * Provides CSV and PDF export functionality for audit log entries.
 * Both formats use server-side generation and return data for direct download.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { randomUUID } from "crypto"
import * as repo from "./audit-logs-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Constants ---

const EXPORT_LIMIT = 10_000

// --- Error Classes ---

export class AuditLogExportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuditLogExportValidationError"
  }
}

// --- Types ---

export interface AuditLogExportInput {
  userId?: string
  entityType?: string
  entityId?: string
  action?: string
  fromDate?: string
  toDate?: string
}

// --- Helpers ---

function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d)
}

function formatChanges(changes: unknown): string {
  if (!changes || typeof changes !== "object") return ""
  const entries = Object.entries(
    changes as Record<string, { old?: unknown; new?: unknown }>
  )
  if (entries.length === 0) return ""
  return entries
    .map(
      ([field, diff]) =>
        `${field}: ${JSON.stringify(diff?.old)} -> ${JSON.stringify(diff?.new)}`
    )
    .join("; ")
}

function quoteCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

// --- Core Data Fetching ---

async function fetchExportData(
  prisma: PrismaClient,
  tenantId: string,
  input: AuditLogExportInput
) {
  // 1. Count first to check limit
  const total = await repo.countForExport(prisma, tenantId, input)

  if (total === 0) {
    throw new AuditLogExportValidationError(
      "Keine Audit-Protokolleintraege entsprechen den aktuellen Filtern."
    )
  }

  if (total > EXPORT_LIMIT) {
    throw new AuditLogExportValidationError(
      `Export-Limit ueberschritten: ${total} Eintraege gefunden, maximal ${EXPORT_LIMIT} erlaubt. Bitte Filter einschraenken.`
    )
  }

  // 2. Fetch all matching records
  const records = await repo.findAllForExport(
    prisma,
    tenantId,
    input,
    EXPORT_LIMIT
  )

  return { records, total }
}

// --- CSV Export ---

export async function exportCsv(
  prisma: PrismaClient,
  tenantId: string,
  input: AuditLogExportInput,
  audit?: AuditContext
): Promise<{ csv: string; filename: string; count: number }> {
  const { records, total } = await fetchExportData(prisma, tenantId, input)

  // Header row
  const headers = [
    "Zeitstempel",
    "Benutzer",
    "Aktion",
    "Entitaetstyp",
    "Entitaets-ID",
    "Entitaetsname",
    "Aenderungen",
    "IP-Adresse",
  ]

  const headerRow = headers.map(quoteCell).join(";")

  // Data rows
  const dataRows = records.map((record) => {
    const user = record.user as
      | { id: string; email: string; displayName: string }
      | null
      | undefined

    const cells = [
      formatDateTime(record.performedAt),
      user?.displayName ?? "System",
      record.action,
      record.entityType,
      record.entityId,
      record.entityName ?? "",
      formatChanges(record.changes),
      record.ipAddress ?? "",
    ]

    return cells.map(quoteCell).join(";")
  })

  const csvContent = [headerRow, ...dataRows].join("\n")
  const bom = "\uFEFF"

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const filename = `Audit-Log_${dateStr}.csv`

  // Log the export action
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "export",
        entityType: "audit_log",
        // Synthetic batch ID — export is a virtual entity, not a single
        // audit log row. `entity_id` is @db.Uuid NOT NULL, so any string
        // literal (e.g. "batch") fails silently via the .catch() below.
        entityId: randomUUID(),
        entityName: `Audit-Log CSV Export (${total} Eintraege)`,
        metadata: { format: "csv", filters: input, count: total },
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { csv: bom + csvContent, filename, count: total }
}

// --- PDF Export ---

export async function exportPdf(
  prisma: PrismaClient,
  tenantId: string,
  input: AuditLogExportInput,
  audit?: AuditContext
): Promise<{ pdf: Buffer; filename: string; count: number }> {
  const { records, total } = await fetchExportData(prisma, tenantId, input)

  // Load tenant config for footer
  const { findByTenantId } = await import(
    "./billing-tenant-config-repository"
  )
  const tenantConfig = await findByTenantId(prisma, tenantId)

  // Prepare entries for PDF
  const entries = records.map((record) => {
    const user = record.user as
      | { id: string; email: string; displayName: string }
      | null
      | undefined

    return {
      performedAt: record.performedAt,
      userName: user?.displayName ?? "System",
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      entityName: record.entityName,
      changes: formatChanges(record.changes),
      ipAddress: record.ipAddress,
    }
  })

  // Dynamic import to avoid bundling @react-pdf/renderer everywhere
  const React = (await import("react")).default
  const { renderToBuffer } = await import("@react-pdf/renderer")
  const { AuditLogExportPdf } = await import(
    "@/lib/pdf/audit-log-export-pdf"
  )

  const exportedBy = audit?.userId ?? "System"

  const pdfElement = React.createElement(AuditLogExportPdf, {
    entries,
    filters: {
      fromDate: input.fromDate,
      toDate: input.toDate,
      userId: input.userId,
      entityType: input.entityType,
      action: input.action,
    },
    exportedAt: new Date(),
    exportedBy,
    totalCount: total,
    tenantConfig,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(pdfElement as any)

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const filename = `Audit-Log_${dateStr}.pdf`

  // Log the export action
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "export",
        entityType: "audit_log",
        // Synthetic batch ID (see CSV export above for rationale).
        entityId: randomUUID(),
        entityName: `Audit-Log PDF Export (${total} Eintraege)`,
        metadata: { format: "pdf", filters: input, count: total },
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return { pdf: Buffer.from(buffer), filename, count: total }
}
