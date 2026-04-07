/**
 * Correction Assistant Service
 *
 * Business logic for correction message management and correction assistant items.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./correction-assistant-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = ["customText", "severity", "isActive"]

// --- Error Classes ---

export class CorrectionMessageNotFoundError extends Error {
  constructor(message = "Correction message not found") {
    super(message)
    this.name = "CorrectionMessageNotFoundError"
  }
}

// --- Error Codes (from calculation/errors.ts) ---

const ERR_MISSING_COME = "MISSING_COME"
const ERR_MISSING_GO = "MISSING_GO"
const ERR_UNPAIRED_BOOKING = "UNPAIRED_BOOKING"
const ERR_EARLY_COME = "EARLY_COME"
const ERR_LATE_COME = "LATE_COME"
const ERR_EARLY_GO = "EARLY_GO"
const ERR_LATE_GO = "LATE_GO"
const ERR_MISSED_CORE_START = "MISSED_CORE_START"
const ERR_MISSED_CORE_END = "MISSED_CORE_END"
const ERR_BELOW_MIN_WORK_TIME = "BELOW_MIN_WORK_TIME"
const ERR_NO_BOOKINGS = "NO_BOOKINGS"
const ERR_INVALID_TIME = "INVALID_TIME"
const ERR_DUPLICATE_IN_TIME = "DUPLICATE_IN_TIME"
const ERR_NO_MATCHING_SHIFT = "NO_MATCHING_SHIFT"

const WARN_CROSS_MIDNIGHT = "CROSS_MIDNIGHT"
const WARN_MAX_TIME_REACHED = "MAX_TIME_REACHED"
const WARN_MANUAL_BREAK = "MANUAL_BREAK"
const WARN_NO_BREAK_RECORDED = "NO_BREAK_RECORDED"
const WARN_SHORT_BREAK = "SHORT_BREAK"
const WARN_AUTO_BREAK_APPLIED = "AUTO_BREAK_APPLIED"
const WARN_MONTHLY_CAP = "MONTHLY_CAP_REACHED"
const WARN_FLEXTIME_CAPPED = "FLEXTIME_CAPPED"
const WARN_BELOW_THRESHOLD = "BELOW_THRESHOLD"
const WARN_NO_CARRYOVER = "NO_CARRYOVER"

// --- Service-level codes (from daily-calc.ts) ---

const WARN_BOOKINGS_ON_OFF_DAY = "BOOKINGS_ON_OFF_DAY"
const WARN_WORKED_ON_HOLIDAY = "WORKED_ON_HOLIDAY"
const WARN_ABSENCE_CREATED = "ABSENCE_CREATED"
const WARN_ABSENCE_CREATION_FAILED = "ABSENCE_CREATION_FAILED"
const WARN_ORDER_BOOKING_CREATED = "ORDER_BOOKING_CREATED"
const WARN_ORDER_BOOKING_FAILED = "ORDER_BOOKING_FAILED"
const WARN_NO_DEFAULT_ORDER = "NO_DEFAULT_ORDER"

// --- Legacy codes (from old Go backend, may exist in seed data) ---

const LEGACY_MISSING_CLOCK_OUT = "MISSING_CLOCK_OUT"
const LEGACY_MISSING_CLOCK_IN = "MISSING_CLOCK_IN"
const LEGACY_MISSING_BREAK = "MISSING_BREAK"

function mapCorrectionErrorType(code: string): string {
  switch (code) {
    case ERR_MISSING_COME:
    case ERR_MISSING_GO:
    case ERR_NO_BOOKINGS:
    case LEGACY_MISSING_CLOCK_OUT:
    case LEGACY_MISSING_CLOCK_IN:
      return "missing_booking"
    case ERR_UNPAIRED_BOOKING:
      return "unpaired_booking"
    case ERR_DUPLICATE_IN_TIME:
      return "overlapping_bookings"
    case ERR_EARLY_COME:
    case ERR_LATE_COME:
    case ERR_EARLY_GO:
    case ERR_LATE_GO:
    case ERR_MISSED_CORE_START:
    case ERR_MISSED_CORE_END:
      return "core_time_violation"
    case ERR_BELOW_MIN_WORK_TIME:
      return "below_min_hours"
    case WARN_NO_BREAK_RECORDED:
    case WARN_SHORT_BREAK:
    case WARN_MANUAL_BREAK:
    case WARN_AUTO_BREAK_APPLIED:
    case LEGACY_MISSING_BREAK:
      return "break_violation"
    case WARN_MAX_TIME_REACHED:
      return "exceeds_max_hours"
    case WARN_BOOKINGS_ON_OFF_DAY:
    case WARN_WORKED_ON_HOLIDAY:
      return "off_day_work"
    default:
      return "other"
  }
}

function defaultCorrectionMessages(tenantId: string) {
  return [
    // --- Fehler (errors) ---
    { tenantId, code: ERR_MISSING_COME, defaultText: "Kommen-Buchung fehlt", severity: "error", description: "Keine Kommen-Buchung für diesen Arbeitstag gefunden" },
    { tenantId, code: ERR_MISSING_GO, defaultText: "Gehen-Buchung fehlt", severity: "error", description: "Keine Gehen-Buchung für diesen Arbeitstag gefunden" },
    { tenantId, code: ERR_UNPAIRED_BOOKING, defaultText: "Unpaarige Buchung", severity: "error", description: "Eine Buchung ohne passendes Gegenstück vorhanden" },
    { tenantId, code: ERR_EARLY_COME, defaultText: "Kommen vor erlaubtem Zeitfenster", severity: "error", description: "Mitarbeiter kam vor dem erlaubten Zeitfenster" },
    { tenantId, code: ERR_LATE_COME, defaultText: "Kommen nach erlaubtem Zeitfenster", severity: "error", description: "Mitarbeiter kam nach dem erlaubten Zeitfenster" },
    { tenantId, code: ERR_EARLY_GO, defaultText: "Gehen vor erlaubtem Zeitfenster", severity: "error", description: "Mitarbeiter ging vor dem erlaubten Zeitfenster" },
    { tenantId, code: ERR_LATE_GO, defaultText: "Gehen nach erlaubtem Zeitfenster", severity: "error", description: "Mitarbeiter ging nach dem erlaubten Zeitfenster" },
    { tenantId, code: ERR_MISSED_CORE_START, defaultText: "Kernzeitbeginn nicht eingehalten", severity: "error", description: "Mitarbeiter kam nach Beginn der Kernarbeitszeit" },
    { tenantId, code: ERR_MISSED_CORE_END, defaultText: "Kernzeitende nicht eingehalten", severity: "error", description: "Mitarbeiter ging vor Ende der Kernarbeitszeit" },
    { tenantId, code: ERR_BELOW_MIN_WORK_TIME, defaultText: "Mindestarbeitszeit unterschritten", severity: "error", description: "Tatsächliche Arbeitszeit liegt unter dem Minimum" },
    { tenantId, code: ERR_NO_BOOKINGS, defaultText: "Keine Buchungen vorhanden", severity: "error", description: "Keine Buchungen für einen aktiven Arbeitstag" },
    { tenantId, code: ERR_INVALID_TIME, defaultText: "Ungültige Zeitangabe", severity: "error", description: "Eine Buchung hat einen ungültigen Zeitwert" },
    { tenantId, code: ERR_DUPLICATE_IN_TIME, defaultText: "Doppelte Kommen-Buchung", severity: "error", description: "Mehrere Kommen-Buchungen zur gleichen Zeit" },
    { tenantId, code: ERR_NO_MATCHING_SHIFT, defaultText: "Kein passender Tagesplan gefunden", severity: "error", description: "Kein Tagesplan passt zu den Buchungszeiten" },
    // --- Hinweise (warnings) ---
    { tenantId, code: WARN_CROSS_MIDNIGHT, defaultText: "Schicht über Mitternacht", severity: "hint", description: "Die Arbeitsschicht geht über Mitternacht hinaus" },
    { tenantId, code: WARN_MAX_TIME_REACHED, defaultText: "Maximale Arbeitszeit erreicht", severity: "hint", description: "Nettozeit wurde auf das erlaubte Maximum begrenzt" },
    { tenantId, code: WARN_MANUAL_BREAK, defaultText: "Manuelle Pausenbuchung vorhanden", severity: "hint", description: "Pausenbuchungen vorhanden; automatischer Pausenabzug übersprungen" },
    { tenantId, code: WARN_NO_BREAK_RECORDED, defaultText: "Keine Pausenbuchung erfasst", severity: "hint", description: "Keine Pause gebucht, obwohl eine Pause erforderlich ist" },
    { tenantId, code: WARN_SHORT_BREAK, defaultText: "Pausendauer zu kurz", severity: "hint", description: "Erfasste Pause ist kürzer als das erforderliche Minimum" },
    { tenantId, code: WARN_AUTO_BREAK_APPLIED, defaultText: "Automatischer Pausenabzug", severity: "hint", description: "Pause wurde gemäß Tagesplanregeln automatisch abgezogen" },
    { tenantId, code: WARN_MONTHLY_CAP, defaultText: "Monatsobergrenze erreicht", severity: "hint", description: "Gleitzeitgutschrift wurde auf das Monatsmaximum begrenzt" },
    { tenantId, code: WARN_FLEXTIME_CAPPED, defaultText: "Gleitzeitguthaben gekappt", severity: "hint", description: "Gleitzeitguthaben wurde durch positive oder negative Obergrenze begrenzt" },
    { tenantId, code: WARN_BELOW_THRESHOLD, defaultText: "Unterhalb der Schwelle", severity: "hint", description: "Überstunden liegen unter der konfigurierten Schwelle und verfallen" },
    { tenantId, code: WARN_NO_CARRYOVER, defaultText: "Kein Übertrag", severity: "hint", description: "Kontogutschrift wird auf Null zurückgesetzt, kein Übertrag" },
    // --- Service-level Hinweise (from daily-calc.ts) ---
    { tenantId, code: WARN_BOOKINGS_ON_OFF_DAY, defaultText: "Buchungen an einem freien Tag", severity: "hint", description: "Es wurden Buchungen an einem freien Tag erfasst" },
    { tenantId, code: WARN_WORKED_ON_HOLIDAY, defaultText: "Arbeit an einem Feiertag", severity: "hint", description: "Mitarbeiter hat an einem Feiertag gearbeitet" },
    { tenantId, code: WARN_ABSENCE_CREATED, defaultText: "Abwesenheit automatisch erstellt", severity: "hint", description: "Eine automatische Abwesenheit wurde erfolgreich angelegt" },
    { tenantId, code: WARN_ABSENCE_CREATION_FAILED, defaultText: "Automatische Abwesenheit fehlgeschlagen", severity: "hint", description: "Die automatische Erstellung einer Abwesenheit ist fehlgeschlagen" },
    { tenantId, code: WARN_ORDER_BOOKING_CREATED, defaultText: "Auftragsbuchung automatisch erstellt", severity: "hint", description: "Eine automatische Auftragsbuchung wurde erfolgreich angelegt" },
    { tenantId, code: WARN_ORDER_BOOKING_FAILED, defaultText: "Automatische Auftragsbuchung fehlgeschlagen", severity: "hint", description: "Die automatische Erstellung einer Auftragsbuchung ist fehlgeschlagen" },
    { tenantId, code: WARN_NO_DEFAULT_ORDER, defaultText: "Kein Standardauftrag vorhanden", severity: "hint", description: "Kein Standardauftrag für die automatische Buchung konfiguriert" },
    // --- Legacy codes (old Go backend, may still exist in DB) ---
    { tenantId, code: LEGACY_MISSING_CLOCK_OUT, defaultText: "Gehen-Buchung fehlt", severity: "error", description: "Keine Gehen-Buchung gefunden (Legacy-Code)" },
    { tenantId, code: LEGACY_MISSING_CLOCK_IN, defaultText: "Kommen-Buchung fehlt", severity: "error", description: "Keine Kommen-Buchung gefunden (Legacy-Code)" },
    { tenantId, code: LEGACY_MISSING_BREAK, defaultText: "Pausenbuchung fehlt", severity: "error", description: "Keine Pausenbuchung gefunden (Legacy-Code)" },
  ]
}

async function ensureDefaults(
  prisma: PrismaClient,
  tenantId: string
): Promise<void> {
  const existing = await repo.findManyMessages(prisma, tenantId)
  const existingCodes = new Set(existing.map((m) => m.code))

  if (existingCodes.size === 0) {
    await repo.createManyMessages(prisma, defaultCorrectionMessages(tenantId))
    return
  }

  // Add any missing codes (e.g. new codes added after initial seed)
  const defaults = defaultCorrectionMessages(tenantId)
  const missing = defaults.filter((d) => !existingCodes.has(d.code))
  if (missing.length > 0) {
    await repo.createManyMessages(prisma, missing)
  }
}

// --- Service Functions ---

export async function listMessages(
  prisma: PrismaClient,
  tenantId: string,
  params?: { severity?: string; isActive?: boolean; code?: string }
) {
  await ensureDefaults(prisma, tenantId)

  return repo.findManyMessages(prisma, tenantId, params)
}

export async function getMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const message = await repo.findMessageById(prisma, tenantId, id)
  if (!message) {
    throw new CorrectionMessageNotFoundError()
  }
  return message
}

export async function updateMessage(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    customText?: string | null
    severity?: string
    isActive?: boolean
  },
  audit?: AuditContext
) {
  // Verify exists with tenant scope
  const existing = await repo.findMessageById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CorrectionMessageNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.customText !== undefined) {
    if (input.customText === null || input.customText === "") {
      data.customText = null
    } else {
      const trimmed = input.customText.trim()
      data.customText = trimmed === "" ? null : trimmed
    }
  }

  if (input.severity !== undefined) {
    data.severity = input.severity
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  const updated = (await repo.updateMessage(prisma, tenantId, input.id, data))!

  if (audit && updated) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "correction_message",
      entityId: input.id,
      entityName: existing.code ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

interface CorrectionAssistantError {
  code: string
  severity: string
  customText: string | null
  errorType: string
}

interface CorrectionAssistantItem {
  dailyValueId: string
  employeeId: string
  employeeName: string
  departmentId: string | null
  departmentName: string | null
  valueDate: string
  errors: CorrectionAssistantError[]
}

export async function listItems(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    from?: string
    to?: string
    employeeId?: string
    departmentId?: string
    severity?: string
    errorCode?: string
    limit?: number
    offset?: number
  }
) {
  await ensureDefaults(prisma, tenantId)

  // Calculate date range
  const now = new Date()
  let fromDate: Date
  let toDate: Date

  if (params?.from) {
    fromDate = new Date(params.from)
  } else {
    fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  }

  if (params?.to) {
    toDate = new Date(params.to)
  } else {
    toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  }

  // Load message catalog for resolution
  const activeMessages = await repo.findActiveMessages(prisma, tenantId)
  const messageMap = new Map(activeMessages.map((m) => [m.code, m]))

  // Fetch daily values with errors
  const rows = await repo.findDailyValuesWithErrors(prisma, tenantId, {
    fromDate,
    toDate,
    employeeId: params?.employeeId,
    departmentId: params?.departmentId,
  })

  // Build correction assistant items
  const severityFilter = params?.severity
  const codeFilter = params?.errorCode

  const items: CorrectionAssistantItem[] = []

  for (const row of rows) {
    const errors: CorrectionAssistantError[] = []

    // Process error codes
    if (row.errorCodes) {
      for (const code of row.errorCodes) {
        if (severityFilter && severityFilter !== "error") continue
        if (codeFilter && codeFilter !== code) continue

        let severity = "error"
        let customText: string | null = null
        const catalogEntry = messageMap.get(code)
        if (catalogEntry) {
          severity = catalogEntry.severity
          customText = catalogEntry.customText ?? null
        }

        errors.push({
          code,
          severity,
          customText,
          errorType: mapCorrectionErrorType(code),
        })
      }
    }

    // Process warnings as "hint" severity
    if (row.warnings) {
      for (const code of row.warnings) {
        if (severityFilter && severityFilter !== "hint") continue
        if (codeFilter && codeFilter !== code) continue

        let severity = "hint"
        let customText: string | null = null
        const catalogEntry = messageMap.get(code)
        if (catalogEntry) {
          severity = catalogEntry.severity
          customText = catalogEntry.customText ?? null
        }

        errors.push({
          code,
          severity,
          customText,
          errorType: mapCorrectionErrorType(code),
        })
      }
    }

    if (errors.length === 0) continue

    const valueDate =
      row.valueDate instanceof Date
        ? row.valueDate.toISOString().split("T")[0]!
        : String(row.valueDate).split("T")[0]!

    items.push({
      dailyValueId: row.id,
      employeeId: row.employeeId,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      departmentId: row.employee.departmentId,
      departmentName: row.employee.department?.name ?? null,
      valueDate,
      errors,
    })
  }

  const total = items.length
  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0

  // Apply pagination
  const paginatedItems = items.slice(offset, offset + limit)
  const hasMore = offset + limit < total

  return {
    data: paginatedItems,
    meta: {
      total,
      limit,
      offset,
      hasMore,
    },
  }
}
