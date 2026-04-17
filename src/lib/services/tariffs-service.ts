/**
 * Tariffs Service
 *
 * Business logic for tariff operations including rhythm sub-records
 * (TariffWeekPlan, TariffDayPlan) and break management.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./tariffs-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "code",
  "isActive",
]

// --- Error Classes ---

export class TariffNotFoundError extends Error {
  constructor(message = "Tariff not found") {
    super(message)
    this.name = "TariffNotFoundError"
  }
}

export class TariffValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TariffValidationError"
  }
}

export class TariffConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TariffConflictError"
  }
}

export class TariffBreakNotFoundError extends Error {
  constructor(message = "Tariff break not found") {
    super(message)
    this.name = "TariffBreakNotFoundError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const tariff = await repo.findByIdWithDetails(prisma, tenantId, id)
  if (!tariff) {
    throw new TariffNotFoundError()
  }
  return tariff
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    weekPlanId?: string
    validFrom?: string
    validTo?: string
    isActive?: boolean
    annualVacationDays?: number
    workDaysPerWeek?: number
    vacationBasis?: string
    vacationCappingRuleGroupId?: string
    dailyTargetHours?: number
    weeklyTargetHours?: number
    monthlyTargetHours?: number
    annualTargetHours?: number
    maxFlextimePerMonth?: number
    upperLimitAnnual?: number
    lowerLimitAnnual?: number
    flextimeThreshold?: number
    creditType?: string
    rhythmType?: string
    cycleDays?: number
    rhythmStartDate?: string
    weekPlanIds?: string[]
    dayPlans?: Array<{ dayPosition: number; dayPlanId: string | null }>
    overtimePayoutEnabled?: boolean
    overtimePayoutThresholdMinutes?: number
    overtimePayoutMode?: string
    overtimePayoutPercentage?: number
    overtimePayoutFixedMinutes?: number
    overtimePayoutApprovalRequired?: boolean
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new TariffValidationError("Tariff code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new TariffValidationError("Tariff name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new TariffConflictError("Tariff code already exists")
  }

  // Default rhythm type to weekly
  const rhythmType = input.rhythmType || "weekly"

  // Validate rhythm-specific fields
  await validateRhythmForCreate(prisma, tenantId, rhythmType, input)

  // Trim description
  const description = input.description?.trim() || null

  // Build tariff create data
  const tariffData: Record<string, unknown> = {
    tenantId,
    code,
    name,
    description,
    isActive: input.isActive,
    rhythmType,
    // Week plan (for weekly rhythm)
    weekPlanId: input.weekPlanId || undefined,
    // Dates
    validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
    validTo: input.validTo ? new Date(input.validTo) : undefined,
    // Vacation
    annualVacationDays:
      input.annualVacationDays !== undefined
        ? new Prisma.Decimal(input.annualVacationDays)
        : undefined,
    workDaysPerWeek: input.workDaysPerWeek,
    vacationBasis: input.vacationBasis,
    vacationCappingRuleGroupId: input.vacationCappingRuleGroupId,
    // Target hours
    dailyTargetHours:
      input.dailyTargetHours !== undefined
        ? new Prisma.Decimal(input.dailyTargetHours)
        : undefined,
    weeklyTargetHours:
      input.weeklyTargetHours !== undefined
        ? new Prisma.Decimal(input.weeklyTargetHours)
        : undefined,
    monthlyTargetHours:
      input.monthlyTargetHours !== undefined
        ? new Prisma.Decimal(input.monthlyTargetHours)
        : undefined,
    annualTargetHours:
      input.annualTargetHours !== undefined
        ? new Prisma.Decimal(input.annualTargetHours)
        : undefined,
    // Flextime
    maxFlextimePerMonth: input.maxFlextimePerMonth,
    upperLimitAnnual: input.upperLimitAnnual,
    lowerLimitAnnual: input.lowerLimitAnnual,
    flextimeThreshold: input.flextimeThreshold,
    creditType: input.creditType,
    // Rhythm
    cycleDays: input.cycleDays,
    rhythmStartDate: input.rhythmStartDate
      ? new Date(input.rhythmStartDate)
      : undefined,
    // Overtime payout
    overtimePayoutEnabled: input.overtimePayoutEnabled,
    overtimePayoutThresholdMinutes: input.overtimePayoutThresholdMinutes,
    overtimePayoutMode: input.overtimePayoutMode,
    overtimePayoutPercentage: input.overtimePayoutPercentage,
    overtimePayoutFixedMinutes: input.overtimePayoutFixedMinutes,
    overtimePayoutApprovalRequired: input.overtimePayoutApprovalRequired,
  }

  // Create tariff + sub-records in transaction
  const created = await repo.createTariffWithSubRecords(prisma, {
    tariffData,
    weekPlanIds: input.weekPlanIds,
    dayPlans: input.dayPlans,
    rhythmType,
  })

  // Re-fetch with full details
  const result = await repo.findByIdWithDetails(prisma, tenantId, created.id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "tariff",
      entityId: created.id,
      entityName: name,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result!
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    weekPlanId?: string | null
    validFrom?: string | null
    validTo?: string | null
    isActive?: boolean
    annualVacationDays?: number | null
    workDaysPerWeek?: number | null
    vacationBasis?: string | null
    vacationCappingRuleGroupId?: string | null
    dailyTargetHours?: number | null
    weeklyTargetHours?: number | null
    monthlyTargetHours?: number | null
    annualTargetHours?: number | null
    maxFlextimePerMonth?: number | null
    upperLimitAnnual?: number | null
    lowerLimitAnnual?: number | null
    flextimeThreshold?: number | null
    creditType?: string | null
    rhythmType?: string
    cycleDays?: number | null
    rhythmStartDate?: string | null
    weekPlanIds?: string[]
    dayPlans?: Array<{ dayPosition: number; dayPlanId: string | null }>
    overtimePayoutEnabled?: boolean | null
    overtimePayoutThresholdMinutes?: number | null
    overtimePayoutMode?: string | null
    overtimePayoutPercentage?: number | null
    overtimePayoutFixedMinutes?: number | null
    overtimePayoutApprovalRequired?: boolean | null
  },
  audit?: AuditContext
) {
  // Verify tariff exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new TariffNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new TariffValidationError("Tariff name is required")
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle week plan updates
  if (input.weekPlanId !== undefined) {
    if (input.weekPlanId === null) {
      data.weekPlanId = null
    } else {
      // Validate week plan exists in same tenant
      const wp = await repo.findWeekPlan(prisma, tenantId, input.weekPlanId)
      if (!wp) {
        throw new TariffValidationError("Invalid week plan reference")
      }
      data.weekPlanId = input.weekPlanId
    }
  }

  // Handle date fields
  if (input.validFrom !== undefined) {
    data.validFrom =
      input.validFrom === null ? null : new Date(input.validFrom)
  }
  if (input.validTo !== undefined) {
    data.validTo =
      input.validTo === null ? null : new Date(input.validTo)
  }

  // Handle isActive
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // Determine effective rhythm type for validation
  const rhythmType =
    input.rhythmType ?? (existing.rhythmType as string) ?? "weekly"

  // Handle rhythm type update
  if (input.rhythmType !== undefined) {
    data.rhythmType = input.rhythmType
  }

  // Handle cycle days
  if (input.cycleDays !== undefined) {
    data.cycleDays = input.cycleDays
  }

  // Handle rhythm start date
  if (input.rhythmStartDate !== undefined) {
    data.rhythmStartDate =
      input.rhythmStartDate === null
        ? null
        : new Date(input.rhythmStartDate)
  }

  // Validate rhythm-specific requirements
  await validateRhythmForUpdate(prisma, tenantId, rhythmType, existing, input)

  // Handle vacation fields
  if (input.annualVacationDays !== undefined) {
    data.annualVacationDays =
      input.annualVacationDays === null
        ? null
        : new Prisma.Decimal(input.annualVacationDays)
  }
  if (input.workDaysPerWeek !== undefined) {
    data.workDaysPerWeek = input.workDaysPerWeek
  }
  if (input.vacationBasis !== undefined) {
    data.vacationBasis = input.vacationBasis
  }
  if (input.vacationCappingRuleGroupId !== undefined) {
    data.vacationCappingRuleGroupId = input.vacationCappingRuleGroupId
  }

  // Handle target hours fields
  if (input.dailyTargetHours !== undefined) {
    data.dailyTargetHours =
      input.dailyTargetHours === null
        ? null
        : new Prisma.Decimal(input.dailyTargetHours)
  }
  if (input.weeklyTargetHours !== undefined) {
    data.weeklyTargetHours =
      input.weeklyTargetHours === null
        ? null
        : new Prisma.Decimal(input.weeklyTargetHours)
  }
  if (input.monthlyTargetHours !== undefined) {
    data.monthlyTargetHours =
      input.monthlyTargetHours === null
        ? null
        : new Prisma.Decimal(input.monthlyTargetHours)
  }
  if (input.annualTargetHours !== undefined) {
    data.annualTargetHours =
      input.annualTargetHours === null
        ? null
        : new Prisma.Decimal(input.annualTargetHours)
  }

  // Handle flextime fields
  if (input.maxFlextimePerMonth !== undefined) {
    data.maxFlextimePerMonth = input.maxFlextimePerMonth
  }
  if (input.upperLimitAnnual !== undefined) {
    data.upperLimitAnnual = input.upperLimitAnnual
  }
  if (input.lowerLimitAnnual !== undefined) {
    data.lowerLimitAnnual = input.lowerLimitAnnual
  }
  if (input.flextimeThreshold !== undefined) {
    data.flextimeThreshold = input.flextimeThreshold
  }
  if (input.creditType !== undefined) {
    data.creditType = input.creditType
  }

  // Handle overtime payout fields
  if (input.overtimePayoutEnabled !== undefined) {
    data.overtimePayoutEnabled = input.overtimePayoutEnabled
  }
  if (input.overtimePayoutThresholdMinutes !== undefined) {
    data.overtimePayoutThresholdMinutes = input.overtimePayoutThresholdMinutes
  }
  if (input.overtimePayoutMode !== undefined) {
    data.overtimePayoutMode = input.overtimePayoutMode
  }
  if (input.overtimePayoutPercentage !== undefined) {
    data.overtimePayoutPercentage = input.overtimePayoutPercentage
  }
  if (input.overtimePayoutFixedMinutes !== undefined) {
    data.overtimePayoutFixedMinutes = input.overtimePayoutFixedMinutes
  }
  if (input.overtimePayoutApprovalRequired !== undefined) {
    data.overtimePayoutApprovalRequired = input.overtimePayoutApprovalRequired
  }

  // Update tariff + rhythm sub-records in transaction
  await repo.updateTariffWithSubRecords(prisma, tenantId, input.id, {
    tariffData: data,
    rhythmType,
    rhythmTypeChanged: input.rhythmType !== undefined,
    weekPlanIds: input.weekPlanIds,
    dayPlans: input.dayPlans,
  })

  // Re-fetch with full details
  const result = await repo.findByIdWithDetails(prisma, tenantId, input.id)

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      result as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "tariff",
      entityId: input.id,
      entityName: (result as unknown as Record<string, unknown>).name as string ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // Verify tariff exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new TariffNotFoundError()
  }

  // Check usage in EmployeeTariffAssignment
  const assignmentCount = await repo.countEmployeeTariffAssignments(prisma, tenantId, id)
  if (assignmentCount > 0) {
    throw new TariffValidationError(
      "Cannot delete tariff that is assigned to employees"
    )
  }

  // Check direct employee tariffId references
  const employeeCount = await repo.countEmployeesByTariff(prisma, tenantId, id)
  if (employeeCount > 0) {
    throw new TariffValidationError(
      "Cannot delete tariff that is assigned to employees"
    )
  }

  // Hard delete (cascades to breaks, tariffWeekPlans, tariffDayPlans)
  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "tariff",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

export async function createBreak(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    tariffId: string
    breakType: string
    afterWorkMinutes?: number
    duration: number
    isPaid?: boolean
  },
  audit?: AuditContext
) {
  // Verify parent tariff exists (tenant-scoped)
  const tariff = await repo.findById(prisma, tenantId, input.tariffId)
  if (!tariff) {
    throw new TariffNotFoundError()
  }

  // Auto-calculate sortOrder
  const breakCount = await repo.countBreaks(prisma, tenantId, input.tariffId)

  const created = await repo.createBreak(prisma, {
    tariffId: input.tariffId,
    breakType: input.breakType,
    afterWorkMinutes: input.afterWorkMinutes,
    duration: input.duration,
    isPaid: input.isPaid ?? false,
    sortOrder: breakCount,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId: tariff.tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "tariff_break",
      entityId: created.id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return {
    id: created.id,
    tariffId: created.tariffId,
    breakType: created.breakType,
    afterWorkMinutes: created.afterWorkMinutes,
    duration: created.duration,
    isPaid: created.isPaid,
    sortOrder: created.sortOrder,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  }
}

export async function deleteBreak(
  prisma: PrismaClient,
  tenantId: string,
  tariffId: string,
  breakId: string,
  audit?: AuditContext
) {
  // Verify parent tariff exists (tenant-scoped)
  const tariff = await repo.findById(prisma, tenantId, tariffId)
  if (!tariff) {
    throw new TariffNotFoundError()
  }

  // Verify break exists AND belongs to the tariff
  const brk = await repo.findBreak(prisma, breakId, tariffId)
  if (!brk) {
    throw new TariffBreakNotFoundError()
  }

  // Delete break
  await repo.deleteBreak(prisma, breakId)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "tariff_break",
      entityId: breakId,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

// --- Private Helpers ---

async function validateRhythmForCreate(
  prisma: PrismaClient,
  tenantId: string,
  rhythmType: string,
  input: {
    weekPlanId?: string
    weekPlanIds?: string[]
    rhythmStartDate?: string
    cycleDays?: number
    dayPlans?: Array<{ dayPosition: number; dayPlanId: string | null }>
  }
) {
  switch (rhythmType) {
    case "weekly":
      // Validate single week plan if provided
      if (input.weekPlanId) {
        const wp = await repo.findWeekPlan(prisma, tenantId, input.weekPlanId)
        if (!wp) {
          throw new TariffValidationError("Invalid week plan reference")
        }
      }
      break

    case "rolling_weekly": {
      // Require week plan IDs
      if (!input.weekPlanIds || input.weekPlanIds.length === 0) {
        throw new TariffValidationError(
          "week_plan_ids are required for rolling_weekly rhythm"
        )
      }
      // Require rhythm start date
      if (!input.rhythmStartDate) {
        throw new TariffValidationError(
          "rhythm_start_date is required for rolling_weekly and x_days rhythms"
        )
      }
      // Batch validate all week plan IDs
      const uniqueWpIds = [...new Set(input.weekPlanIds)]
      const foundWps = await prisma.weekPlan.findMany({
        where: { id: { in: uniqueWpIds }, tenantId },
        select: { id: true },
      })
      if (foundWps.length !== uniqueWpIds.length) {
        throw new TariffValidationError("Invalid week plan reference")
      }
      break
    }

    case "x_days": {
      // Require cycle days
      if (input.cycleDays === undefined || input.cycleDays === null) {
        throw new TariffValidationError(
          "cycle_days is required for x_days rhythm"
        )
      }
      // Require rhythm start date
      if (!input.rhythmStartDate) {
        throw new TariffValidationError(
          "rhythm_start_date is required for rolling_weekly and x_days rhythms"
        )
      }
      // Validate day plans
      if (input.dayPlans) {
        const dayPlanIds: string[] = []
        for (const dp of input.dayPlans) {
          if (dp.dayPosition < 1 || dp.dayPosition > input.cycleDays) {
            throw new TariffValidationError(
              "day position must be between 1 and cycle_days"
            )
          }
          if (dp.dayPlanId) {
            dayPlanIds.push(dp.dayPlanId)
          }
        }
        // Batch validate all day plan IDs
        if (dayPlanIds.length > 0) {
          const uniqueDpIds = [...new Set(dayPlanIds)]
          const foundDps = await prisma.dayPlan.findMany({
            where: { id: { in: uniqueDpIds }, tenantId },
            select: { id: true },
          })
          if (foundDps.length !== uniqueDpIds.length) {
            throw new TariffValidationError("Invalid day plan reference")
          }
        }
      }
      break
    }
  }
}

async function validateRhythmForUpdate(
  prisma: PrismaClient,
  tenantId: string,
  rhythmType: string,
  existing: { cycleDays: number | null },
  input: {
    weekPlanIds?: string[]
    cycleDays?: number | null
    dayPlans?: Array<{ dayPosition: number; dayPlanId: string | null }>
  }
) {
  switch (rhythmType) {
    case "rolling_weekly": {
      if (input.weekPlanIds && input.weekPlanIds.length > 0) {
        // Batch validate all week plan IDs
        const uniqueWpIds = [...new Set(input.weekPlanIds)]
        const foundWps = await prisma.weekPlan.findMany({
          where: { id: { in: uniqueWpIds }, tenantId },
          select: { id: true },
        })
        if (foundWps.length !== uniqueWpIds.length) {
          throw new TariffValidationError("Invalid week plan reference")
        }
      }
      break
    }

    case "x_days": {
      // Get effective cycle_days
      const effectiveCycleDays =
        input.cycleDays !== undefined
          ? input.cycleDays
          : existing.cycleDays
      // Validate day plans if provided
      if (
        input.dayPlans &&
        input.dayPlans.length > 0 &&
        effectiveCycleDays
      ) {
        const dayPlanIds: string[] = []
        for (const dp of input.dayPlans) {
          if (
            dp.dayPosition < 1 ||
            dp.dayPosition > effectiveCycleDays
          ) {
            throw new TariffValidationError(
              "day position must be between 1 and cycle_days"
            )
          }
          if (dp.dayPlanId) {
            dayPlanIds.push(dp.dayPlanId)
          }
        }
        // Batch validate all day plan IDs
        if (dayPlanIds.length > 0) {
          const uniqueDpIds = [...new Set(dayPlanIds)]
          const foundDps = await prisma.dayPlan.findMany({
            where: { id: { in: uniqueDpIds }, tenantId },
            select: { id: true },
          })
          if (foundDps.length !== uniqueDpIds.length) {
            throw new TariffValidationError("Invalid day plan reference")
          }
        }
      }
      break
    }
  }
}
