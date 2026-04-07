/**
 * DSGVO Retention Service
 *
 * Business logic for DSGVO data retention: rule management, preview, execution.
 * Throws plain Error subclasses mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./dsgvo-retention-repository"
import { subMonths } from "date-fns"
import * as storage from "@/lib/supabase/storage"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = ["retentionMonths", "action", "isActive", "description"]

// --- Constants ---

const MINIMUM_RETENTION_MONTHS = 6

const VALID_DATA_TYPES = [
  "BOOKINGS",
  "DAILY_VALUES",
  "ABSENCES",
  "MONTHLY_VALUES",
  "AUDIT_LOGS",
  "TERMINAL_BOOKINGS",
  "PERSONNEL_FILE",
  "CORRECTION_MESSAGES",
  "STOCK_MOVEMENTS",
] as const

type DataType = (typeof VALID_DATA_TYPES)[number]

const LEGAL_MINIMUM_MONTHS: Partial<Record<DataType, number>> = {
  PERSONNEL_FILE: 120, // 10 years (German employment law)
  STOCK_MOVEMENTS: 120, // 10 years (HGB/AO)
  MONTHLY_VALUES: 60, // 5 years (tax)
}

const ANONYMIZABLE_TYPES: ReadonlySet<string> = new Set([
  "ABSENCES",
  "STOCK_MOVEMENTS",
])

// --- Default Rules Config ---

const DEFAULT_RULES: Array<{
  dataType: DataType
  retentionMonths: number
  action: string
  description: string
}> = [
  {
    dataType: "BOOKINGS",
    retentionMonths: 36,
    action: "DELETE",
    description: "Stempelbuchungen (Kommen/Gehen)",
  },
  {
    dataType: "DAILY_VALUES",
    retentionMonths: 36,
    action: "DELETE",
    description: "Tageswerte (berechnete Zeiten)",
  },
  {
    dataType: "ABSENCES",
    retentionMonths: 36,
    action: "ANONYMIZE",
    description: "Abwesenheiten (Urlaub, Krank etc.)",
  },
  {
    dataType: "MONTHLY_VALUES",
    retentionMonths: 60,
    action: "DELETE",
    description: "Monatswerte (Konten, Flexzeit)",
  },
  {
    dataType: "AUDIT_LOGS",
    retentionMonths: 24,
    action: "DELETE",
    description: "Audit-Protokoll",
  },
  {
    dataType: "TERMINAL_BOOKINGS",
    retentionMonths: 12,
    action: "DELETE",
    description: "Terminal-Rohdaten",
  },
  {
    dataType: "PERSONNEL_FILE",
    retentionMonths: 120,
    action: "DELETE",
    description: "Personalakten-Eintraege",
  },
  {
    dataType: "CORRECTION_MESSAGES",
    retentionMonths: 12,
    action: "DELETE",
    description: "Korrekturassistent-Meldungen",
  },
  {
    dataType: "STOCK_MOVEMENTS",
    retentionMonths: 120,
    action: "ANONYMIZE",
    description: "Lagerbewegungen",
  },
]

// --- Error Classes ---

export class DsgvoValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DsgvoValidationError"
  }
}

export class DsgvoNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DsgvoNotFoundError"
  }
}

// --- Public API ---

/**
 * List all rules for a tenant. If none exist, create defaults first.
 */
export async function listRules(prisma: PrismaClient, tenantId: string) {
  const existing = await repo.findRules(prisma, tenantId)
  if (existing.length > 0) return existing

  // Create defaults for new tenant
  await ensureDefaultRules(prisma, tenantId)
  return repo.findRules(prisma, tenantId)
}

/**
 * Update a retention rule. Validates minimum retention months.
 * Returns the updated rule and an optional legal warning.
 */
export async function updateRule(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    dataType: string
    retentionMonths: number
    action: string
    isActive: boolean
    description?: string | null
  },
  audit?: AuditContext
) {
  // Validate dataType
  if (!VALID_DATA_TYPES.includes(input.dataType as DataType)) {
    throw new DsgvoValidationError(
      `Invalid data type: ${input.dataType}. Valid types: ${VALID_DATA_TYPES.join(", ")}`
    )
  }

  // Validate minimum retention
  if (input.retentionMonths < MINIMUM_RETENTION_MONTHS) {
    throw new DsgvoValidationError(
      `Retention period must be at least ${MINIMUM_RETENTION_MONTHS} months`
    )
  }

  // Validate action
  if (input.action !== "DELETE" && input.action !== "ANONYMIZE") {
    throw new DsgvoValidationError(
      `Invalid action: ${input.action}. Must be DELETE or ANONYMIZE`
    )
  }

  // Validate ANONYMIZE only for supported types
  if (input.action === "ANONYMIZE" && !ANONYMIZABLE_TYPES.has(input.dataType)) {
    throw new DsgvoValidationError(
      `Anonymization is not supported for ${input.dataType}. Only ABSENCES and STOCK_MOVEMENTS support anonymization.`
    )
  }

  const existing = await repo.findRuleByDataType(prisma, tenantId, input.dataType)
  const rule = await repo.upsertRule(prisma, tenantId, input)

  if (audit && rule) {
    const changes = existing
      ? auditLog.computeChanges(
          existing as unknown as Record<string, unknown>,
          rule as unknown as Record<string, unknown>,
          TRACKED_FIELDS
        )
      : null
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "dsgvo_retention_rule",
      entityId: rule.id,
      entityName: input.dataType,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  // Check legal minimum warning
  const legalMin =
    LEGAL_MINIMUM_MONTHS[input.dataType as DataType]
  let legalWarning: string | undefined
  if (legalMin && input.retentionMonths < legalMin) {
    legalWarning = `Legal retention period for ${input.dataType} is ${legalMin} months (${legalMin / 12} years)`
  }

  return { rule, legalWarning }
}

/**
 * Preview: count records that would be affected by retention execution.
 */
export async function previewRetention(
  prisma: PrismaClient,
  tenantId: string,
  dataType?: string
) {
  const rules = await repo.findActiveRules(prisma, tenantId, dataType)

  const results: Array<{
    dataType: string
    count: number
    cutoffDate: Date
    action: string
    retentionMonths: number
    legalWarning?: string
  }> = []

  for (const rule of rules) {
    const cutoffDate = subMonths(new Date(), rule.retentionMonths)
    const count = await countAffectedRecords(
      prisma,
      tenantId,
      rule.dataType as DataType,
      cutoffDate
    )

    const legalMin =
      LEGAL_MINIMUM_MONTHS[rule.dataType as DataType]
    let legalWarning: string | undefined
    if (legalMin && rule.retentionMonths < legalMin) {
      legalWarning = `Legal retention period is ${legalMin} months (${legalMin / 12} years)`
    }

    results.push({
      dataType: rule.dataType,
      count,
      cutoffDate,
      action: rule.action,
      retentionMonths: rule.retentionMonths,
      legalWarning,
    })
  }

  return results
}

/**
 * Execute retention: delete/anonymize records past cutoff.
 */
export async function executeRetention(
  prisma: PrismaClient,
  tenantId: string,
  options: {
    dataType?: string
    dryRun?: boolean
    executedBy?: string | null
  } = {},
  audit?: AuditContext
) {
  const { dryRun = false, executedBy = null } = options
  const rules = await repo.findActiveRules(
    prisma,
    tenantId,
    options.dataType
  )

  const results: Array<{
    dataType: string
    action: string
    recordCount: number
    cutoffDate: Date
    durationMs: number
    dryRun: boolean
    error?: string
  }> = []

  for (const rule of rules) {
    const cutoffDate = subMonths(new Date(), rule.retentionMonths)
    const startTime = Date.now()

    try {
      const count = await countAffectedRecords(
        prisma,
        tenantId,
        rule.dataType as DataType,
        cutoffDate
      )

      if (dryRun || count === 0) {
        results.push({
          dataType: rule.dataType,
          action: rule.action,
          recordCount: count,
          cutoffDate,
          durationMs: Date.now() - startTime,
          dryRun: true,
        })
        continue
      }

      // Execute deletion or anonymization
      if (rule.action === "ANONYMIZE") {
        await anonymizeRecords(
          prisma,
          tenantId,
          rule.dataType as DataType,
          cutoffDate
        )
      } else {
        await deleteRecords(
          prisma,
          tenantId,
          rule.dataType as DataType,
          cutoffDate
        )
      }

      const durationMs = Date.now() - startTime

      // Log the execution
      await repo.createDeleteLog(prisma, {
        tenantId,
        dataType: rule.dataType,
        action: rule.action,
        recordCount: count,
        cutoffDate,
        executedBy,
        durationMs,
      })

      results.push({
        dataType: rule.dataType,
        action: rule.action,
        recordCount: count,
        cutoffDate,
        durationMs,
        dryRun: false,
      })
    } catch (err) {
      const durationMs = Date.now() - startTime
      const errorMessage =
        err instanceof Error ? err.message : String(err)

      // Log the error
      await repo.createDeleteLog(prisma, {
        tenantId,
        dataType: rule.dataType,
        action: rule.action,
        recordCount: 0,
        cutoffDate,
        executedBy,
        durationMs,
        error: errorMessage,
      })

      results.push({
        dataType: rule.dataType,
        action: rule.action,
        recordCount: 0,
        cutoffDate,
        durationMs,
        dryRun: false,
        error: errorMessage,
      })
    }
  }

  if (audit && !options.dryRun) {
    const totalRecords = results.reduce((sum, r) => sum + r.recordCount, 0)
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "dsgvo_execute",
      entityType: "dsgvo_retention",
      entityId: tenantId,
      entityName: options.dataType ?? "all",
      changes: null,
      metadata: {
        totalRecords,
        dataTypes: results.map(r => r.dataType),
        resultSummary: Object.fromEntries(
          results.map(r => [r.dataType, { action: r.action, recordCount: r.recordCount }])
        ),
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return results
}

/**
 * List delete logs with pagination.
 */
export async function listDeleteLogs(
  prisma: PrismaClient,
  tenantId: string,
  params: { page?: number; pageSize?: number } = {}
) {
  return repo.findDeleteLogs(prisma, tenantId, params)
}

/**
 * Ensure default rules exist for a tenant (idempotent).
 * Creates rules for all VALID_DATA_TYPES if they don't exist, all inactive by default.
 */
export async function ensureDefaultRules(
  prisma: PrismaClient,
  tenantId: string
) {
  for (const def of DEFAULT_RULES) {
    const existing = await repo.findRuleByDataType(
      prisma,
      tenantId,
      def.dataType
    )
    if (!existing) {
      await repo.upsertRule(prisma, tenantId, {
        dataType: def.dataType,
        retentionMonths: def.retentionMonths,
        action: def.action,
        isActive: false,
        description: def.description,
      })
    }
  }
}

// --- Internal Helpers ---

async function countAffectedRecords(
  prisma: PrismaClient,
  tenantId: string,
  dataType: DataType,
  cutoffDate: Date
): Promise<number> {
  switch (dataType) {
    case "BOOKINGS":
      return repo.countBookings(prisma, tenantId, cutoffDate)
    case "DAILY_VALUES":
      return repo.countDailyValues(prisma, tenantId, cutoffDate)
    case "ABSENCES":
      return repo.countAbsences(prisma, tenantId, cutoffDate)
    case "MONTHLY_VALUES": {
      const cutoffYear = cutoffDate.getFullYear()
      const cutoffMonth = cutoffDate.getMonth() + 1 // 1-based
      return repo.countMonthlyValues(
        prisma,
        tenantId,
        cutoffYear,
        cutoffMonth
      )
    }
    case "AUDIT_LOGS":
      return repo.countAuditLogs(prisma, tenantId, cutoffDate)
    case "TERMINAL_BOOKINGS":
      return repo.countTerminalBookings(prisma, tenantId, cutoffDate)
    case "PERSONNEL_FILE":
      return repo.countPersonnelFileEntries(prisma, tenantId, cutoffDate)
    case "CORRECTION_MESSAGES":
      return repo.countCorrectionMessages(prisma, tenantId, cutoffDate)
    case "STOCK_MOVEMENTS":
      return repo.countStockMovements(prisma, tenantId, cutoffDate)
    default:
      return 0
  }
}

async function deleteRecords(
  prisma: PrismaClient,
  tenantId: string,
  dataType: DataType,
  cutoffDate: Date
): Promise<void> {
  switch (dataType) {
    case "BOOKINGS":
      await repo.deleteBookings(prisma, tenantId, cutoffDate)
      break
    case "DAILY_VALUES":
      await repo.deleteDailyValues(prisma, tenantId, cutoffDate)
      break
    case "MONTHLY_VALUES": {
      const cutoffYear = cutoffDate.getFullYear()
      const cutoffMonth = cutoffDate.getMonth() + 1
      await repo.deleteMonthlyValues(
        prisma,
        tenantId,
        cutoffYear,
        cutoffMonth
      )
      break
    }
    case "AUDIT_LOGS":
      await repo.deleteAuditLogs(prisma, tenantId, cutoffDate)
      break
    case "TERMINAL_BOOKINGS":
      await repo.deleteTerminalBookings(prisma, tenantId, cutoffDate)
      break
    case "PERSONNEL_FILE":
      await deletePersonnelFileWithStorage(prisma, tenantId, cutoffDate)
      break
    case "CORRECTION_MESSAGES":
      await repo.deleteCorrectionMessages(prisma, tenantId, cutoffDate)
      break
    default:
      break
  }
}

async function anonymizeRecords(
  prisma: PrismaClient,
  tenantId: string,
  dataType: DataType,
  cutoffDate: Date
): Promise<void> {
  switch (dataType) {
    case "ABSENCES":
      await repo.anonymizeAbsences(prisma, tenantId, cutoffDate)
      break
    case "STOCK_MOVEMENTS":
      await repo.anonymizeStockMovements(prisma, tenantId, cutoffDate)
      break
    default:
      break
  }
}

/**
 * Delete personnel file entries and clean up Supabase Storage.
 * Best-effort: storage cleanup errors are logged but don't block DB deletion.
 */
async function deletePersonnelFileWithStorage(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
): Promise<void> {
  // 1. Find attachment storage paths before deletion
  const attachments = await repo.findPersonnelFileAttachmentPaths(
    prisma,
    tenantId,
    cutoffDate
  )
  const storagePaths = attachments.map((a) => a.storagePath)

  // 2. Delete from Supabase Storage (best-effort)
  if (storagePaths.length > 0) {
    await deleteStorageFiles(storagePaths)
  }

  // 3. Delete DB records (attachments cascade-delete via FK)
  await repo.deletePersonnelFileEntries(prisma, tenantId, cutoffDate)
}

/**
 * Delete files from Supabase Storage bucket "hr-personnel-files".
 * Best-effort cleanup: logs errors but does not throw.
 */
async function deleteStorageFiles(storagePaths: string[]): Promise<void> {
  try {
    await storage.removeBatched("hr-personnel-files", storagePaths)
  } catch (err) {
    console.error(
      "[dsgvo-retention] Storage cleanup failed:",
      err instanceof Error ? err.message : String(err)
    )
  }
}
