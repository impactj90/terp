/**
 * DSGVO Retention Repository
 *
 * Pure Prisma data access for DSGVO retention rules, delete logs,
 * and data type-specific count/delete/anonymize operations.
 * Every query MUST include tenantId for tenant isolation.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// =============================================================================
// Rules CRUD
// =============================================================================

export async function findRules(prisma: PrismaClient, tenantId: string) {
  return prisma.dsgvoRetentionRule.findMany({
    where: { tenantId },
    orderBy: { dataType: "asc" },
  })
}

export async function findRuleByDataType(
  prisma: PrismaClient,
  tenantId: string,
  dataType: string
) {
  return prisma.dsgvoRetentionRule.findFirst({
    where: { tenantId, dataType },
  })
}

export async function upsertRule(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    dataType: string
    retentionMonths: number
    action: string
    isActive: boolean
    description?: string | null
  }
) {
  return prisma.dsgvoRetentionRule.upsert({
    where: {
      tenantId_dataType: { tenantId, dataType: data.dataType },
    },
    create: {
      tenantId,
      dataType: data.dataType,
      retentionMonths: data.retentionMonths,
      action: data.action,
      isActive: data.isActive,
      description: data.description ?? null,
    },
    update: {
      retentionMonths: data.retentionMonths,
      action: data.action,
      isActive: data.isActive,
      description: data.description ?? null,
    },
  })
}

export async function findActiveRules(
  prisma: PrismaClient,
  tenantId: string,
  dataType?: string
) {
  return prisma.dsgvoRetentionRule.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(dataType ? { dataType } : {}),
    },
  })
}

// =============================================================================
// Count Functions (for preview)
// =============================================================================

export async function countBookings(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.booking.count({
    where: { tenantId, bookingDate: { lt: cutoffDate } },
  })
}

export async function countDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.dailyValue.count({
    where: { tenantId, valueDate: { lt: cutoffDate } },
  })
}

export async function countAbsences(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.absenceDay.count({
    where: { tenantId, absenceDate: { lt: cutoffDate } },
  })
}

export async function countMonthlyValues(
  prisma: PrismaClient,
  tenantId: string,
  cutoffYear: number,
  cutoffMonth: number
) {
  return prisma.monthlyValue.count({
    where: {
      tenantId,
      OR: [
        { year: { lt: cutoffYear } },
        { year: cutoffYear, month: { lt: cutoffMonth } },
      ],
    },
  })
}

export async function countAuditLogs(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.auditLog.count({
    where: { tenantId, performedAt: { lt: cutoffDate } },
  })
}

export async function countTerminalBookings(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.rawTerminalBooking.count({
    where: { tenantId, bookingDate: { lt: cutoffDate } },
  })
}

export async function countPersonnelFileEntries(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.hrPersonnelFileEntry.count({
    where: { tenantId, entryDate: { lt: cutoffDate } },
  })
}

export async function countCorrectionMessages(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.correctionMessage.count({
    where: { tenantId, createdAt: { lt: cutoffDate } },
  })
}

export async function countStockMovements(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.whStockMovement.count({
    where: { tenantId, date: { lt: cutoffDate } },
  })
}

// =============================================================================
// Delete Functions
// =============================================================================

export async function deleteBookings(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.booking.deleteMany({
    where: { tenantId, bookingDate: { lt: cutoffDate } },
  })
}

export async function deleteDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.dailyValue.deleteMany({
    where: { tenantId, valueDate: { lt: cutoffDate } },
  })
}

export async function deleteMonthlyValues(
  prisma: PrismaClient,
  tenantId: string,
  cutoffYear: number,
  cutoffMonth: number
) {
  return prisma.monthlyValue.deleteMany({
    where: {
      tenantId,
      OR: [
        { year: { lt: cutoffYear } },
        { year: cutoffYear, month: { lt: cutoffMonth } },
      ],
    },
  })
}

export async function deleteAuditLogs(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.auditLog.deleteMany({
    where: { tenantId, performedAt: { lt: cutoffDate } },
  })
}

export async function deleteTerminalBookings(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.rawTerminalBooking.deleteMany({
    where: { tenantId, bookingDate: { lt: cutoffDate } },
  })
}

export async function deleteCorrectionMessages(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.correctionMessage.deleteMany({
    where: { tenantId, createdAt: { lt: cutoffDate } },
  })
}

// =============================================================================
// Delete with Storage Cleanup (PERSONNEL_FILE)
// =============================================================================

export async function findPersonnelFileAttachmentPaths(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.hrPersonnelFileAttachment.findMany({
    where: {
      tenantId,
      entry: { entryDate: { lt: cutoffDate } },
    },
    select: { storagePath: true },
  })
}

export async function deletePersonnelFileEntries(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  // Attachments cascade-delete via FK
  return prisma.hrPersonnelFileEntry.deleteMany({
    where: { tenantId, entryDate: { lt: cutoffDate } },
  })
}

// =============================================================================
// Anonymize Functions
// =============================================================================

export async function anonymizeAbsences(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.absenceDay.updateMany({
    where: { tenantId, absenceDate: { lt: cutoffDate } },
    data: {
      notes: null,
      approvedBy: null,
      createdBy: null,
      rejectionReason: null,
    },
  })
}

export async function anonymizeStockMovements(
  prisma: PrismaClient,
  tenantId: string,
  cutoffDate: Date
) {
  return prisma.whStockMovement.updateMany({
    where: { tenantId, date: { lt: cutoffDate } },
    data: {
      createdById: null,
      notes: null,
      reason: null,
    },
  })
}

// =============================================================================
// Log Functions
// =============================================================================

export async function createDeleteLog(
  prisma: PrismaClient,
  data: {
    tenantId: string
    dataType: string
    action: string
    recordCount: number
    cutoffDate: Date
    executedBy?: string | null
    durationMs?: number | null
    error?: string | null
    details?: unknown
  }
) {
  return prisma.dsgvoDeleteLog.create({
    data: {
      tenantId: data.tenantId,
      dataType: data.dataType,
      action: data.action,
      recordCount: data.recordCount,
      cutoffDate: data.cutoffDate,
      executedBy: data.executedBy ?? null,
      durationMs: data.durationMs ?? null,
      error: data.error ?? null,
      details: data.details as object | undefined,
    },
  })
}

export async function findDeleteLogs(
  prisma: PrismaClient,
  tenantId: string,
  params: { page?: number; pageSize?: number } = {}
) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const skip = (page - 1) * pageSize

  const [items, total] = await Promise.all([
    prisma.dsgvoDeleteLog.findMany({
      where: { tenantId },
      orderBy: { executedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.dsgvoDeleteLog.count({ where: { tenantId } }),
  ])

  return { items, total }
}
