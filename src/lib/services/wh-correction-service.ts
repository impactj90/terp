/**
 * Warehouse Correction Service
 *
 * Business logic for warehouse correction checks and message management.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient, WhCorrectionSeverity } from "@/generated/prisma/client"
import * as repo from "./wh-correction-repository"
import * as reservationRepo from "./wh-reservation-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes (naming convention drives handleServiceError mapping) ---

export class WhCorrectionMessageNotFoundError extends Error {
  constructor(message = "Correction message not found") {
    super(message)
    this.name = "WhCorrectionMessageNotFoundError"
  }
}

export class WhCorrectionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhCorrectionValidationError"
  }
}

// --- Check Code Constants ---

const CHECK_NEGATIVE_STOCK = "NEGATIVE_STOCK"
const CHECK_DUPLICATE_RECEIPT = "DUPLICATE_RECEIPT"
const CHECK_OVERDUE_ORDER = "OVERDUE_ORDER"
const CHECK_UNMATCHED_RECEIPT = "UNMATCHED_RECEIPT"
const CHECK_STOCK_MISMATCH = "STOCK_MISMATCH"
const CHECK_LOW_STOCK_NO_ORDER = "LOW_STOCK_NO_ORDER"
const CHECK_ORPHAN_RESERVATION = "ORPHAN_RESERVATION"

// --- Types ---

interface DetectedIssue {
  code: string
  severity: WhCorrectionSeverity
  message: string
  articleId?: string | null
  documentId?: string | null
  details?: Record<string, string | number | boolean | null>
}

// --- Individual Check Functions ---

async function checkNegativeStock(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findNegativeStockArticles(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_NEGATIVE_STOCK,
    severity: "ERROR" as WhCorrectionSeverity,
    message: `Artikel ${row.number} "${row.name}" hat negativen Bestand: ${row.current_stock}`,
    articleId: row.id,
    details: { currentStock: row.current_stock, articleNumber: row.number },
  }))
}

async function checkDuplicateReceipts(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findDuplicateReceipts(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_DUPLICATE_RECEIPT,
    severity: "WARNING" as WhCorrectionSeverity,
    message: `Artikel ${row.article_number} "${row.article_name}" hat ${row.cnt} Wareneingange fur dieselbe Bestellposition`,
    articleId: row.article_id,
    documentId: row.purchase_order_id,
    details: {
      count: row.cnt,
      purchaseOrderPositionId: row.purchase_order_position_id,
      articleNumber: row.article_number,
    },
  }))
}

async function checkOverdueOrders(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findOverdueOrders(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_OVERDUE_ORDER,
    severity: "WARNING" as WhCorrectionSeverity,
    message: `Bestellung ${row.number} ist überfällig (erwartet: ${(row.confirmed_delivery ?? row.requested_delivery)?.toISOString().slice(0, 10) ?? "unbekannt"})`,
    documentId: row.id,
    details: {
      orderNumber: row.number,
      supplierId: row.supplier_id,
      confirmedDelivery: row.confirmed_delivery?.toISOString() ?? null,
      requestedDelivery: row.requested_delivery?.toISOString() ?? null,
    },
  }))
}

async function checkUnmatchedReceipts(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findUnmatchedReceipts(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_UNMATCHED_RECEIPT,
    severity: "INFO" as WhCorrectionSeverity,
    message: `Wareneingang fur Artikel ${row.article_number} "${row.article_name}" (Menge: ${row.quantity}) ohne zugeordnete Bestellung`,
    articleId: row.article_id,
    documentId: row.id, // The stock movement ID as document reference
    details: {
      quantity: row.quantity,
      date: row.date.toISOString(),
      articleNumber: row.article_number,
    },
  }))
}

async function checkStockMismatch(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findStockMismatches(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_STOCK_MISMATCH,
    severity: "ERROR" as WhCorrectionSeverity,
    message: `Artikel ${row.number} "${row.name}": Bestand (${row.current_stock}) weicht von Bewegungssumme (${row.sum_movements}) ab`,
    articleId: row.id,
    details: {
      currentStock: row.current_stock,
      sumMovements: row.sum_movements,
      difference: Math.round((row.current_stock - row.sum_movements) * 1000) / 1000,
      articleNumber: row.number,
    },
  }))
}

async function checkLowStockNoOrder(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const rows = await repo.findLowStockNoOrder(prisma, tenantId)
  return rows.map((row) => ({
    code: CHECK_LOW_STOCK_NO_ORDER,
    severity: "WARNING" as WhCorrectionSeverity,
    message: `Artikel ${row.number} "${row.name}" unter Mindestbestand (${row.current_stock}/${row.min_stock}) ohne offene Bestellung`,
    articleId: row.id,
    details: {
      currentStock: row.current_stock,
      minStock: row.min_stock,
      articleNumber: row.number,
    },
  }))
}

async function checkOrphanReservations(
  prisma: PrismaClient,
  tenantId: string
): Promise<DetectedIssue[]> {
  const orphans = await reservationRepo.findOrphanReservations(prisma, tenantId)
  return orphans.map((row) => ({
    code: CHECK_ORPHAN_RESERVATION,
    severity: "WARNING" as WhCorrectionSeverity,
    message: `Reservierung für Artikel ${row.articleNumber} (Beleg ${row.documentNumber}) ist noch aktiv, obwohl der Beleg storniert/weitergeleitet wurde`,
    articleId: row.articleId,
    documentId: row.documentId,
    details: {
      reservationId: row.id,
      quantity: row.quantity,
      documentStatus: row.documentStatus,
    },
  }))
}

// --- Main Check Runner ---

export async function runCorrectionChecks(
  prisma: PrismaClient,
  tenantId: string,
  triggeredById?: string | null,
  trigger: string = "MANUAL",
  audit?: AuditContext
) {
  // 1. Create run record
  const run = await repo.createRun(prisma, {
    tenantId,
    trigger,
    triggeredById,
  })

  const checks = [
    checkNegativeStock,
    checkDuplicateReceipts,
    checkOverdueOrders,
    checkUnmatchedReceipts,
    checkStockMismatch,
    checkLowStockNoOrder,
    checkOrphanReservations,
  ]

  let totalIssues = 0

  try {
    for (const check of checks) {
      const issues = await check(prisma, tenantId)

      // Deduplicate: skip issues where same code+articleId+documentId is already OPEN
      const newIssues: DetectedIssue[] = []
      for (const issue of issues) {
        const existing = await repo.findOpenDuplicate(
          prisma,
          tenantId,
          issue.code,
          issue.articleId ?? null,
          issue.documentId ?? null
        )
        if (!existing) {
          newIssues.push(issue)
        }
      }

      if (newIssues.length > 0) {
        await repo.createManyMessages(
          prisma,
          newIssues.map((issue) => ({
            tenantId,
            runId: run.id,
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
            articleId: issue.articleId ?? null,
            documentId: issue.documentId ?? null,
            details: issue.details ?? null,
          }))
        )
        totalIssues += newIssues.length
      }
    }

    // 2. Complete run
    await repo.completeRun(prisma, run.id, checks.length, totalIssues)

    if (audit) {
      await auditLog.log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "run_checks",
        entityType: "wh_correction_run",
        entityId: run.id,
        entityName: trigger,
        changes: null,
        metadata: { checksRun: checks.length, issuesFound: totalIssues },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err))
    }

    return {
      runId: run.id,
      checksRun: checks.length,
      issuesFound: totalIssues,
    }
  } catch (err) {
    // Mark run as failed but still record partial results
    await repo.completeRun(prisma, run.id, checks.length, totalIssues)
    throw err
  }
}

// --- Message Management ---

export async function listMessages(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: string
    severity?: string
    code?: string
    articleId?: string
    page: number
    pageSize: number
  }
) {
  return repo.findManyMessages(prisma, tenantId, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: params.status as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    severity: params.severity as any,
    code: params.code,
    articleId: params.articleId,
    page: params.page,
    pageSize: params.pageSize,
  })
}

export async function getMessageById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const message = await repo.findMessageById(prisma, tenantId, id)
  if (!message) {
    throw new WhCorrectionMessageNotFoundError()
  }
  return message
}

export async function resolveMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  resolvedById: string,
  note?: string,
  audit?: AuditContext
) {
  // Verify exists
  const existing = await repo.findMessageById(prisma, tenantId, id)
  if (!existing) {
    throw new WhCorrectionMessageNotFoundError()
  }
  if (existing.status !== "OPEN") {
    throw new WhCorrectionValidationError("Message is not in OPEN status")
  }

  const updated = await repo.updateMessageStatus(prisma, tenantId, id, {
    status: "RESOLVED",
    resolvedById,
    resolvedNote: note ?? null,
    resolvedAt: new Date(),
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "resolve",
      entityType: "wh_correction_message",
      entityId: id,
      entityName: existing.code ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function dismissMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  resolvedById: string,
  note?: string,
  audit?: AuditContext
) {
  const existing = await repo.findMessageById(prisma, tenantId, id)
  if (!existing) {
    throw new WhCorrectionMessageNotFoundError()
  }
  if (existing.status !== "OPEN") {
    throw new WhCorrectionValidationError("Message is not in OPEN status")
  }

  const updated = await repo.updateMessageStatus(prisma, tenantId, id, {
    status: "DISMISSED",
    resolvedById,
    resolvedNote: note ?? null,
    resolvedAt: new Date(),
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "dismiss",
      entityType: "wh_correction_message",
      entityId: id,
      entityName: existing.code ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function resolveBulk(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[],
  resolvedById: string,
  note?: string,
  audit?: AuditContext
) {
  if (ids.length === 0) {
    throw new WhCorrectionValidationError("No message IDs provided")
  }

  const result = await repo.updateManyMessagesStatus(prisma, tenantId, ids, {
    status: "RESOLVED",
    resolvedById,
    resolvedNote: note ?? null,
    resolvedAt: new Date(),
  })

  if (audit) {
    await auditLog.logBulk(prisma, ids.map(id => ({
      tenantId,
      userId: audit.userId,
      action: "resolve_bulk",
      entityType: "wh_correction_message",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }))).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}

export async function getSummary(
  prisma: PrismaClient,
  tenantId: string
) {
  const groups = await repo.countOpenGroupedBySeverity(prisma, tenantId)
  const result = { errors: 0, warnings: 0, infos: 0, total: 0 }

  for (const group of groups) {
    const count = group._count.id
    switch (group.severity) {
      case "ERROR":
        result.errors = count
        break
      case "WARNING":
        result.warnings = count
        break
      case "INFO":
        result.infos = count
        break
    }
    result.total += count
  }

  return result
}

export async function listRuns(
  prisma: PrismaClient,
  tenantId: string,
  params: { page: number; pageSize: number }
) {
  return repo.findManyRuns(prisma, tenantId, params)
}
