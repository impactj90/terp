import type { PrismaClient, OvertimePayout } from "@/generated/prisma/client"
import * as repo from "./overtime-payout-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class OvertimePayoutNotFoundError extends Error {
  constructor(message = "Overtime payout not found") {
    super(message)
    this.name = "OvertimePayoutNotFoundError"
  }
}

export class OvertimePayoutValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OvertimePayoutValidationError"
  }
}

export class OvertimePayoutConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OvertimePayoutConflictError"
  }
}

// --- Types ---

export interface PayoutRule {
  overtimePayoutEnabled: boolean
  overtimePayoutThresholdMinutes: number | null
  overtimePayoutMode: string | null
  overtimePayoutPercentage: number | null
  overtimePayoutFixedMinutes: number | null
  overtimePayoutApprovalRequired: boolean
  overrideApplied: boolean
  overrideMode: string | null
}

export interface PayoutResult {
  payoutMinutes: number
  remainingBalance: number
}

// --- Pure Functions ---

export function calculatePayout(flextimeEnd: number, rule: PayoutRule): PayoutResult {
  if (!rule.overtimePayoutEnabled || flextimeEnd <= 0) {
    return { payoutMinutes: 0, remainingBalance: flextimeEnd }
  }
  const threshold = rule.overtimePayoutThresholdMinutes ?? 0
  if (flextimeEnd <= threshold) {
    return { payoutMinutes: 0, remainingBalance: flextimeEnd }
  }
  const excess = flextimeEnd - threshold
  const effectiveMode = rule.overrideMode ?? rule.overtimePayoutMode

  let payoutMinutes: number
  switch (effectiveMode) {
    case "ALL_ABOVE_THRESHOLD":
      payoutMinutes = excess
      break
    case "PERCENTAGE":
      payoutMinutes = Math.floor(excess * (rule.overtimePayoutPercentage ?? 0) / 100)
      break
    case "FIXED_AMOUNT":
      payoutMinutes = Math.min(rule.overtimePayoutFixedMinutes ?? 0, excess)
      break
    default:
      payoutMinutes = 0
  }
  return {
    payoutMinutes: Math.max(0, payoutMinutes),
    remainingBalance: flextimeEnd - Math.max(0, payoutMinutes),
  }
}

export function resolveEffectiveRule(
  tariff: {
    overtimePayoutEnabled: boolean
    overtimePayoutThresholdMinutes: number | null
    overtimePayoutMode: string | null
    overtimePayoutPercentage: number | null
    overtimePayoutFixedMinutes: number | null
    overtimePayoutApprovalRequired: boolean
  },
  override?: { overtimePayoutEnabled: boolean; overtimePayoutMode: string | null; isActive: boolean } | null,
): PayoutRule {
  const base: PayoutRule = {
    overtimePayoutEnabled: tariff.overtimePayoutEnabled,
    overtimePayoutThresholdMinutes: tariff.overtimePayoutThresholdMinutes,
    overtimePayoutMode: tariff.overtimePayoutMode,
    overtimePayoutPercentage: tariff.overtimePayoutPercentage,
    overtimePayoutFixedMinutes: tariff.overtimePayoutFixedMinutes,
    overtimePayoutApprovalRequired: tariff.overtimePayoutApprovalRequired,
    overrideApplied: false,
    overrideMode: null,
  }
  if (override && override.isActive) {
    base.overtimePayoutEnabled = override.overtimePayoutEnabled
    base.overrideApplied = true
    if (override.overtimePayoutMode) {
      base.overrideMode = override.overtimePayoutMode
    }
  }
  return base
}

export function buildTariffRuleSnapshot(rule: PayoutRule): Record<string, unknown> {
  return {
    enabled: rule.overtimePayoutEnabled,
    thresholdMinutes: rule.overtimePayoutThresholdMinutes,
    mode: rule.overrideMode ?? rule.overtimePayoutMode,
    percentage: rule.overtimePayoutPercentage,
    fixedMinutes: rule.overtimePayoutFixedMinutes,
    approvalRequired: rule.overtimePayoutApprovalRequired,
    overrideApplied: rule.overrideApplied,
    overrideMode: rule.overrideMode,
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    employeeId?: string
    year?: number
    month?: number
    status?: string
    departmentId?: string
  },
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
): Promise<OvertimePayout> {
  const payout = await repo.findById(prisma, tenantId, id)
  if (!payout) throw new OvertimePayoutNotFoundError()
  return payout
}

export async function countPending(
  prisma: PrismaClient,
  tenantId: string,
  params?: { year?: number; month?: number },
) {
  return repo.countByStatus(prisma, tenantId, "pending", params)
}

export async function approve(
  prisma: PrismaClient,
  tenantId: string,
  payoutId: string,
  userId: string,
  audit?: AuditContext,
): Promise<OvertimePayout> {
  const payout = await repo.findById(prisma, tenantId, payoutId)
  if (!payout) throw new OvertimePayoutNotFoundError()
  if (payout.status !== "pending") {
    throw new OvertimePayoutValidationError(`Cannot approve payout with status '${payout.status}'`)
  }

  const [updated] = await prisma.$transaction([
    prisma.overtimePayout.update({
      where: { id: payoutId },
      data: {
        status: "approved",
        approvedBy: userId,
        approvedAt: new Date(),
      },
    }),
    prisma.monthlyValue.updateMany({
      where: {
        employeeId: payout.employeeId,
        year: payout.year,
        month: payout.month,
        tenantId,
      },
      data: {
        flextimeEnd: payout.sourceFlextimeEnd - payout.payoutMinutes,
        flextimeCarryover: payout.sourceFlextimeEnd - payout.payoutMinutes,
      },
    }),
  ])

  // Trigger cascading recalc for subsequent months
  try {
    const { MonthlyCalcService } = await import("./monthly-calc")
    const nextMonth = payout.month === 12 ? 1 : payout.month + 1
    const nextYear = payout.month === 12 ? payout.year + 1 : payout.year
    const monthlyCalcService = new MonthlyCalcService(prisma, tenantId)
    await monthlyCalcService.recalculateFromMonth(payout.employeeId, nextYear, nextMonth)
  } catch (err) {
    console.error(`[OvertimePayout] Recalc failed after approve for ${payoutId}:`, err)
  }

  if (audit) {
    auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "approve",
      entityType: "overtime_payout", entityId: payoutId,
      entityName: `${payout.year}-${payout.month}`,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function reject(
  prisma: PrismaClient,
  tenantId: string,
  payoutId: string,
  userId: string,
  reason: string,
  audit?: AuditContext,
): Promise<OvertimePayout> {
  const payout = await repo.findById(prisma, tenantId, payoutId)
  if (!payout) throw new OvertimePayoutNotFoundError()
  if (payout.status !== "pending") {
    throw new OvertimePayoutValidationError(`Cannot reject payout with status '${payout.status}'`)
  }

  const updated = await prisma.overtimePayout.update({
    where: { id: payoutId },
    data: {
      status: "rejected",
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectedReason: reason,
    },
  })

  if (audit) {
    auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "reject",
      entityType: "overtime_payout", entityId: payoutId,
      entityName: `${payout.year}-${payout.month}`,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
      metadata: { reason },
    }).catch(err => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function approveBatch(
  prisma: PrismaClient,
  tenantId: string,
  payoutIds: string[],
  userId: string,
  audit?: AuditContext,
): Promise<{ approvedCount: number; errors: Array<{ payoutId: string; reason: string }> }> {
  const errors: Array<{ payoutId: string; reason: string }> = []
  let approvedCount = 0

  for (const payoutId of payoutIds) {
    try {
      await approve(prisma, tenantId, payoutId, userId, audit)
      approvedCount++
    } catch (err) {
      errors.push({ payoutId, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return { approvedCount, errors }
}
