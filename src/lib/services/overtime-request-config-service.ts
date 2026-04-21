/**
 * Overtime Request Config Service
 *
 * Singleton-per-tenant config that drives OvertimeRequest approval policy.
 * Mirrors billing-tenant-config-service: getOrCreate returns defaults on
 * first read, update upserts + writes one audit row.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

export interface OvertimeRequestConfigRow {
  id: string
  tenantId: string
  approvalRequired: boolean
  leadTimeHours: number
  monthlyWarnThresholdMinutes: number | null
  escalationThresholdMinutes: number | null
  reopenRequired: boolean
}

export async function getOrCreate(
  prisma: PrismaClient,
  tenantId: string
): Promise<OvertimeRequestConfigRow> {
  const existing = await prisma.overtimeRequestConfig.findUnique({
    where: { tenantId },
  })
  if (existing) return toRow(existing)
  const created = await prisma.overtimeRequestConfig.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
  })
  return toRow(created)
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    approvalRequired?: boolean
    leadTimeHours?: number
    monthlyWarnThresholdMinutes?: number | null
    escalationThresholdMinutes?: number | null
    reopenRequired?: boolean
  },
  audit?: AuditContext
): Promise<OvertimeRequestConfigRow> {
  const data: Record<string, unknown> = {}
  if (input.approvalRequired !== undefined) data.approvalRequired = input.approvalRequired
  if (input.leadTimeHours !== undefined) data.leadTimeHours = input.leadTimeHours
  if (input.monthlyWarnThresholdMinutes !== undefined)
    data.monthlyWarnThresholdMinutes = input.monthlyWarnThresholdMinutes
  if (input.escalationThresholdMinutes !== undefined)
    data.escalationThresholdMinutes = input.escalationThresholdMinutes
  if (input.reopenRequired !== undefined) data.reopenRequired = input.reopenRequired

  const row = await prisma.overtimeRequestConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  })

  // Cascade: disabling the reopen requirement makes pending REOPEN requests
  // obsolete, so auto-cancel them. Idempotent — if there are no pending
  // REOPENs, updateMany simply affects zero rows.
  if (input.reopenRequired === false) {
    await prisma.overtimeRequest.updateMany({
      where: { tenantId, status: "pending", requestType: "REOPEN" },
      data: { status: "cancelled" },
    })
  }

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "overtime_request_config",
        entityId: row.id,
        entityName: null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return toRow(row)
}

function toRow(r: {
  id: string
  tenantId: string
  approvalRequired: boolean
  leadTimeHours: number
  monthlyWarnThresholdMinutes: number | null
  escalationThresholdMinutes: number | null
  reopenRequired: boolean
}): OvertimeRequestConfigRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    approvalRequired: r.approvalRequired,
    leadTimeHours: r.leadTimeHours,
    monthlyWarnThresholdMinutes: r.monthlyWarnThresholdMinutes,
    escalationThresholdMinutes: r.escalationThresholdMinutes,
    reopenRequired: r.reopenRequired,
  }
}
