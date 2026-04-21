/**
 * Overtime Request Service
 *
 * Business logic for dual-flow overtime request (PLANNED + REOPEN) with
 * ArbZG validation, permission-based approver resolution, and best-effort
 * notifications. Mirrors absences-service lifecycle (create/approve/reject/
 * cancel) 1:1.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import { RecalcService } from "@/lib/services/recalc"
import * as repo from "./overtime-request-repository"
import * as configService from "./overtime-request-config-service"
import * as arbzg from "./arbzg-validator"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- PubSub Helper ---

async function publishUnreadCountUpdate(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  type?: string
) {
  try {
    const { getHub } = await import("@/lib/pubsub/singleton")
    const { userTopic } = await import("@/lib/pubsub/topics")
    const hub = await getHub()
    const unreadCount = await prisma.notification.count({
      where: { tenantId, userId, readAt: null },
    })
    await hub.publish(
      userTopic(userId),
      { event: "notification", type: type ?? "general", unread_count: unreadCount },
      true
    )
  } catch {
    // best effort
  }
}

// --- Error Classes ---

export class OvertimeRequestNotFoundError extends Error {
  constructor(message = "Overtime request not found") {
    super(message)
    this.name = "OvertimeRequestNotFoundError"
  }
}

export class OvertimeRequestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OvertimeRequestValidationError"
  }
}

export class OvertimeRequestForbiddenError extends Error {
  constructor(message = "Overtime request not within data scope") {
    super(message)
    this.name = "OvertimeRequestForbiddenError"
  }
}

// --- Data Scope Helpers ---

function checkDataScope(
  dataScope: DataScope,
  item: {
    employeeId: string
    employee?: { departmentId: string | null } | null
  }
): void {
  if (dataScope.type === "department") {
    if (
      !item.employee?.departmentId ||
      !dataScope.departmentIds.includes(item.employee.departmentId)
    ) {
      throw new OvertimeRequestForbiddenError()
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(item.employeeId)) {
      throw new OvertimeRequestForbiddenError()
    }
  }
}

function dataScopeFilter(dataScope: DataScope): {
  departmentIds?: string[]
  employeeIds?: string[]
} {
  if (dataScope.type === "department") {
    return { departmentIds: dataScope.departmentIds }
  }
  if (dataScope.type === "employee") {
    return { employeeIds: dataScope.employeeIds }
  }
  return {}
}

// --- Recalc Helper ---

async function triggerRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date
): Promise<void> {
  try {
    const service = new RecalcService(prisma, undefined, undefined, tenantId)
    await service.triggerRecalc(tenantId, employeeId, date)
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${date.toISOString().split("T")[0]}:`,
      error
    )
  }
}

// --- ArbZG Input Builder ---

async function buildArbZGInput(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date,
  plannedMinutes: number
): Promise<arbzg.ArbZGValidateInput> {
  const iso = date.toISOString().split("T")[0]!
  const dayStart = new Date(`${iso}T00:00:00.000Z`)

  // 1. Resolve day plan for the date to get maxNetWorkTime + target minutes.
  const dayPlan = await prisma.employeeDayPlan.findFirst({
    where: {
      employeeId,
      planDate: dayStart,
      employee: { tenantId },
    },
    select: {
      dayPlan: {
        select: {
          maxNetWorkTime: true,
          regularHours: true,
          fromEmployeeMaster: true,
        },
      },
    },
  })

  let maxNetWorkTimeMinutes = dayPlan?.dayPlan?.maxNetWorkTime ?? 600
  if (!maxNetWorkTimeMinutes) maxNetWorkTimeMinutes = 600

  let currentTargetMinutes = 0
  if (dayPlan?.dayPlan?.fromEmployeeMaster) {
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { dailyTargetHours: true },
    })
    if (emp?.dailyTargetHours !== null && emp?.dailyTargetHours !== undefined) {
      currentTargetMinutes = Math.round(Number(emp.dailyTargetHours) * 60)
    }
  } else if (dayPlan?.dayPlan?.regularHours !== undefined) {
    currentTargetMinutes = dayPlan.dayPlan.regularHours ?? 0
  }

  // 2. Previous-day last-out work booking.
  const prevDate = new Date(dayStart)
  prevDate.setUTCDate(prevDate.getUTCDate() - 1)
  const prevOut = await prisma.booking.findFirst({
    where: {
      tenantId,
      employeeId,
      bookingDate: prevDate,
      bookingType: { direction: "out", category: "work" },
    },
    orderBy: { editedTime: "desc" },
    select: { editedTime: true, bookingDate: true },
  })

  let previousDayLastOutAt: Date | null = null
  if (prevOut) {
    // editedTime is minutes from midnight of the bookingDate.
    const base = new Date(prevOut.bookingDate)
    base.setUTCMinutes(base.getUTCMinutes() + prevOut.editedTime)
    previousDayLastOutAt = base
  }

  // 3. Sunday / holiday check.
  const holiday = await prisma.holiday.findFirst({
    where: { tenantId, holidayDate: dayStart },
    select: { id: true },
  })
  const isSunday = dayStart.getUTCDay() === 0
  const isSundayOrHoliday = isSunday || Boolean(holiday)

  return {
    date: dayStart,
    plannedAdditionalMinutes: plannedMinutes,
    currentTargetMinutes,
    maxNetWorkTimeMinutes,
    previousDayLastOutAt,
    nextDayFirstInAt: null,
    isSundayOrHoliday,
  }
}

// --- Service Functions ---

export interface CreateInput {
  employeeId: string
  requestType: "PLANNED" | "REOPEN"
  requestDate: string // YYYY-MM-DD
  plannedMinutes: number
  reason: string
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateInput,
  audit: AuditContext | null
) {
  if (input.plannedMinutes <= 0) {
    throw new OvertimeRequestValidationError("plannedMinutes must be > 0")
  }
  if (input.reason.trim().length < 2) {
    throw new OvertimeRequestValidationError("reason is required")
  }

  const requestDate = new Date(`${input.requestDate}T00:00:00.000Z`)
  if (Number.isNaN(requestDate.getTime())) {
    throw new OvertimeRequestValidationError("Invalid requestDate")
  }

  // Lead-time check: if leadTimeHours > 0, requestDate must be that far in the future.
  const config = await configService.getOrCreate(prisma, tenantId)

  // REOPEN requires the reopen policy to be enabled for this tenant.
  if (input.requestType === "REOPEN" && !config.reopenRequired) {
    throw new OvertimeRequestValidationError("reopen_disabled")
  }

  if (input.requestType === "PLANNED" && config.leadTimeHours > 0) {
    const now = new Date()
    const minStart = new Date(now.getTime() + config.leadTimeHours * 60 * 60 * 1000)
    if (requestDate.getTime() < minStart.getTime()) {
      throw new OvertimeRequestValidationError(
        `requestDate must respect lead time of ${config.leadTimeHours}h`
      )
    }
  }

  // ArbZG validation — snapshot on the draft row.
  const arbzgInput = await buildArbZGInput(
    prisma,
    tenantId,
    input.employeeId,
    requestDate,
    input.plannedMinutes
  )
  const warnings = arbzg.validate(arbzgInput)

  const autoApprove = !config.approvalRequired
  const status = autoApprove ? "approved" : "pending"

  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    requestType: input.requestType,
    requestDate,
    plannedMinutes: input.plannedMinutes,
    reason: input.reason.trim(),
    status,
    approvedBy: autoApprove ? audit?.userId ?? null : null,
    approvedAt: autoApprove ? new Date() : null,
    arbzgWarnings: warnings,
    createdBy: audit?.userId ?? null,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create_overtime_request",
        entityType: "overtime_request",
        entityId: created.id,
        entityName: null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  // Auto-approved path: re-trigger daily-calc so UNAPPROVED_OVERTIME flips off.
  if (autoApprove && input.requestType === "PLANNED") {
    await triggerRecalc(prisma, tenantId, input.employeeId, requestDate)
    return created
  }

  // Approval path: notify every tenant-wide approver.
  if (!autoApprove) {
    try {
      const approverIds = new Set<string>()
      const base = await repo.findApproverUserIds(
        prisma,
        tenantId,
        "overtime.approve",
        audit?.userId
      )
      for (const id of base) approverIds.add(id)

      if (
        config.escalationThresholdMinutes !== null &&
        input.plannedMinutes >= config.escalationThresholdMinutes
      ) {
        const escalated = await repo.findApproverUserIds(
          prisma,
          tenantId,
          "overtime.approve_escalated",
          audit?.userId
        )
        for (const id of escalated) approverIds.add(id)
      }

      const employee = await prisma.employee.findUnique({
        where: { id: input.employeeId },
        select: { firstName: true, lastName: true },
      })
      const empName = employee
        ? `${employee.firstName} ${employee.lastName}`
        : "Mitarbeiter"
      const dateLabel = input.requestDate
      const hours = (input.plannedMinutes / 60).toFixed(2).replace(".", ",")

      for (const approverId of approverIds) {
        try {
          await repo.createNotification(prisma, {
            tenantId,
            userId: approverId,
            type: "approvals",
            title: "Neuer Überstundenantrag",
            message: `${empName}: ${hours}h am ${dateLabel}`,
            link: `/approvals/overtime-requests/${created.id}`,
          })
          await publishUnreadCountUpdate(
            prisma,
            tenantId,
            approverId,
            "overtime_request"
          )
        } catch {
          console.error(
            "Failed to send overtime request notification to",
            approverId
          )
        }
      }
    } catch (err) {
      console.error("Failed to notify overtime approvers:", err)
    }
  }

  return created
}

// --- Read Path ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    page?: number
    pageSize?: number
    employeeId?: string
    status?: string
    requestType?: string
    from?: string
    to?: string
  },
  dataScope: DataScope
) {
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? 50

  const filter: repo.FindManyFilter = {
    employeeId: input.employeeId,
    status: input.status,
    requestType: input.requestType,
    from: input.from ? new Date(input.from) : undefined,
    to: input.to ? new Date(input.to) : undefined,
    ...dataScopeFilter(dataScope),
  }

  const [items, total] = await Promise.all([
    repo.findMany(prisma, tenantId, filter, {
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    repo.count(prisma, tenantId, filter),
  ])

  return { items, total }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope: DataScope
) {
  const row = await repo.findById(prisma, tenantId, id)
  if (!row) throw new OvertimeRequestNotFoundError()
  checkDataScope(dataScope, row)
  return row
}

export async function pendingCount(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope
): Promise<number> {
  return repo.count(prisma, tenantId, {
    status: "pending",
    ...dataScopeFilter(dataScope),
  })
}

// --- Lifecycle Mutations ---

export interface ApprovalContext {
  /** Permissions the approver currently holds — used for escalation gating. */
  userPermissionKeys: string[]
  /** Whether the user is an admin (bypasses escalation gating). */
  isAdmin: boolean
}

export async function approve(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: { arbzgOverrideReason?: string },
  approval: ApprovalContext,
  dataScope: DataScope,
  audit: AuditContext
) {
  const request = await repo.findById(prisma, tenantId, id)
  if (!request) throw new OvertimeRequestNotFoundError()
  checkDataScope(dataScope, request)

  if (request.status !== "pending") {
    throw new OvertimeRequestValidationError(
      "Only pending overtime requests can be approved"
    )
  }

  // Escalation gate: escalationThresholdMinutes config + per-request minutes.
  const config = await configService.getOrCreate(prisma, tenantId)
  if (
    config.escalationThresholdMinutes !== null &&
    request.plannedMinutes >= config.escalationThresholdMinutes
  ) {
    if (
      !approval.isAdmin &&
      !approval.userPermissionKeys.includes("overtime.approve_escalated")
    ) {
      throw new OvertimeRequestForbiddenError(
        "overtime.approve_escalated required for this request"
      )
    }
  }

  // Re-run ArbZG validator — state may have changed since create.
  const arbzgInput = await buildArbZGInput(
    prisma,
    tenantId,
    request.employeeId,
    request.requestDate,
    request.plannedMinutes
  )
  const freshWarnings = arbzg.validate(arbzgInput)

  if (freshWarnings.length > 0 && !input.arbzgOverrideReason?.trim()) {
    throw new OvertimeRequestValidationError(
      "arbzg_override_reason_required"
    )
  }

  const updated = await repo.updateIfStatus(prisma, tenantId, id, "pending", {
    status: "approved",
    approvedBy: audit.userId,
    approvedAt: new Date(),
    arbzgOverrideReason: input.arbzgOverrideReason?.trim() || null,
    arbzgWarnings: freshWarnings,
  })
  if (!updated) {
    throw new OvertimeRequestValidationError("invalid_status_transition")
  }

  if (request.requestType === "PLANNED") {
    await triggerRecalc(
      prisma,
      tenantId,
      request.employeeId,
      request.requestDate
    )
  }

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "approve_overtime_request",
      entityType: "overtime_request",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  // Notify requester (best-effort).
  try {
    const userId = await repo.findUserIdForEmployee(
      prisma,
      tenantId,
      request.employeeId
    )
    if (userId) {
      const dateLabel = request.requestDate.toISOString().split("T")[0]
      await repo.createNotification(prisma, {
        tenantId,
        userId,
        type: "approvals",
        title: "Überstundenantrag genehmigt",
        message: `Dein Überstundenantrag für ${dateLabel} wurde genehmigt.`,
        link: `/me/overtime-requests/${id}`,
      })
      await publishUnreadCountUpdate(
        prisma,
        tenantId,
        userId,
        "overtime_approved"
      )
    }
  } catch {
    console.error("Failed to notify requester for overtime approve", id)
  }

  return updated
}

export async function reject(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason: string,
  dataScope: DataScope,
  audit: AuditContext
) {
  const request = await repo.findById(prisma, tenantId, id)
  if (!request) throw new OvertimeRequestNotFoundError()
  checkDataScope(dataScope, request)

  if (!reason || reason.trim().length < 2) {
    throw new OvertimeRequestValidationError("reason is required")
  }

  if (request.status !== "pending") {
    throw new OvertimeRequestValidationError(
      "Only pending overtime requests can be rejected"
    )
  }

  const updated = await repo.updateIfStatus(prisma, tenantId, id, "pending", {
    status: "rejected",
    rejectionReason: reason.trim(),
  })
  if (!updated) {
    throw new OvertimeRequestValidationError("invalid_status_transition")
  }

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "reject_overtime_request",
      entityType: "overtime_request",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  try {
    const userId = await repo.findUserIdForEmployee(
      prisma,
      tenantId,
      request.employeeId
    )
    if (userId) {
      const dateLabel = request.requestDate.toISOString().split("T")[0]
      await repo.createNotification(prisma, {
        tenantId,
        userId,
        type: "approvals",
        title: "Überstundenantrag abgelehnt",
        message: `Dein Überstundenantrag für ${dateLabel} wurde abgelehnt: ${reason.trim()}`,
        link: `/me/overtime-requests/${id}`,
      })
      await publishUnreadCountUpdate(
        prisma,
        tenantId,
        userId,
        "overtime_rejected"
      )
    }
  } catch {
    console.error("Failed to notify requester for overtime reject", id)
  }

  return updated
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  dataScope: DataScope,
  audit: AuditContext
) {
  const request = await repo.findById(prisma, tenantId, id)
  if (!request) throw new OvertimeRequestNotFoundError()
  checkDataScope(dataScope, request)

  // Asymmetric vs AbsenceDay: once approved, an OvertimeRequest represents
  // an employer commitment and cannot be self-rescinded. Removing approved
  // overtime must go through an administrative correction flow.
  if (request.status !== "pending") {
    throw new OvertimeRequestValidationError(
      "Only pending overtime requests can be cancelled"
    )
  }

  const updated = await repo.updateIfStatus(prisma, tenantId, id, "pending", {
    status: "cancelled",
  })
  if (!updated) {
    throw new OvertimeRequestValidationError("invalid_status_transition")
  }

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "cancel_overtime_request",
      entityType: "overtime_request",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  // Notify approvers so pending-count badge stays correct.
  try {
    const approverIds = await repo.findApproverUserIds(
      prisma,
      tenantId,
      "overtime.approve",
      audit.userId
    )
    for (const userId of approverIds) {
      try {
        await repo.createNotification(prisma, {
          tenantId,
          userId,
          type: "approvals",
          title: "Überstundenantrag zurückgezogen",
          message: `Ein Überstundenantrag wurde zurückgezogen.`,
          link: `/approvals/overtime-requests`,
        })
        await publishUnreadCountUpdate(
          prisma,
          tenantId,
          userId,
          "overtime_cancelled"
        )
      } catch {
        // swallow
      }
    }
  } catch {
    console.error("Failed to notify approvers for overtime cancel", id)
  }

  return updated
}
