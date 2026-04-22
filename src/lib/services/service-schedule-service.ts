/**
 * ServiceSchedule Service
 *
 * Business logic for maintenance schedules: CRUD, derived status,
 * `generateOrder` (1-click maintenance order creation in a
 * transaction), `recordCompletion` (called from the Order-service
 * completion hook in Phase C), and `getDashboardSummary`.
 *
 * Follows the `billing-recurring-invoice-service` pattern for the
 * transactional generate path and the `service-object-service`
 * pattern for CRUD + audit.
 *
 * Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md (Phase B)
 */
import type {
  PrismaClient,
  Prisma,
  ServiceScheduleIntervalType,
  ServiceScheduleIntervalUnit,
} from "@/generated/prisma/client"
import * as repo from "./service-schedule-repository"
import type { ServiceScheduleWithIncludes } from "./service-schedule-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import * as numberSeqService from "./number-sequence-service"
import * as orderRepo from "./order-repository"
import * as orderAssignmentRepo from "./order-assignment-repository"
import {
  calculateDaysUntilDue,
  calculateNextDueAt,
} from "./service-schedule-date-utils"

// --- Constants ---

/**
 * Dashboard widget "due soon" window. The list uses each row's own
 * `leadTimeDays`, but the widget summary uses this fixed default so
 * the bucket counts are easy to reason about at a glance.
 */
export const LEAD_TIME_DAYS_DEFAULT = 14

const AUDIT_ENTITY_TYPE = "service_schedule"

const TRACKED_FIELDS = [
  "name",
  "description",
  "intervalType",
  "intervalValue",
  "intervalUnit",
  "anchorDate",
  "defaultActivityId",
  "responsibleEmployeeId",
  "estimatedHours",
  "leadTimeDays",
  "isActive",
] as const

// --- Error Classes ---

export class ServiceScheduleNotFoundError extends Error {
  constructor(message = "Service schedule not found") {
    super(message)
    this.name = "ServiceScheduleNotFoundError"
  }
}

export class ServiceScheduleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServiceScheduleValidationError"
  }
}

// --- Types ---

export type ServiceScheduleStatus = "overdue" | "due_soon" | "ok" | "inactive"

export type ServiceScheduleDto = ServiceScheduleWithIncludes & {
  status: ServiceScheduleStatus
  daysUntilDue: number | null
}

export interface CreateScheduleInput {
  serviceObjectId: string
  name: string
  description?: string | null
  intervalType: ServiceScheduleIntervalType
  intervalValue: number
  intervalUnit: ServiceScheduleIntervalUnit
  anchorDate?: Date | string | null
  defaultActivityId?: string | null
  responsibleEmployeeId?: string | null
  estimatedHours?: number | null
  leadTimeDays?: number
  isActive?: boolean
}

export interface UpdateScheduleInput {
  name?: string
  description?: string | null
  intervalType?: ServiceScheduleIntervalType
  intervalValue?: number
  intervalUnit?: ServiceScheduleIntervalUnit
  anchorDate?: Date | string | null
  defaultActivityId?: string | null
  responsibleEmployeeId?: string | null
  estimatedHours?: number | null
  leadTimeDays?: number
  isActive?: boolean
}

export interface ListParams {
  serviceObjectId?: string
  status?: ServiceScheduleStatus
  customerAddressId?: string
  page?: number
  pageSize?: number
}

export interface GenerateOrderResult {
  order: Awaited<ReturnType<typeof orderRepo.findById>>
  assignment: Awaited<ReturnType<typeof orderAssignmentRepo.findByIdSimple>> | null
  schedule: ServiceScheduleWithIncludes
}

// --- Status Derivation ---

/**
 * Derive the at-a-glance status for a schedule. Pure function —
 * safe to call inside map() or in a React render.
 */
export function deriveStatus(
  schedule: { isActive: boolean; nextDueAt: Date | null; leadTimeDays: number },
  now: Date,
): ServiceScheduleStatus {
  if (!schedule.isActive) return "inactive"
  if (!schedule.nextDueAt) return "ok"
  const diffDays = calculateDaysUntilDue(schedule.nextDueAt, now)
  if (diffDays === null) return "ok"
  if (diffDays < 0) return "overdue"
  if (diffDays <= schedule.leadTimeDays) return "due_soon"
  return "ok"
}

function toDto(
  schedule: ServiceScheduleWithIncludes,
  now: Date,
): ServiceScheduleDto {
  return {
    ...schedule,
    status: deriveStatus(schedule, now),
    daysUntilDue: calculateDaysUntilDue(schedule.nextDueAt, now),
  }
}

// --- Validation Helpers ---

function normalizeAnchorDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new ServiceScheduleValidationError("anchorDate is not a valid date")
  }
  return parsed
}

function validateIntervalCongruence(
  intervalType: ServiceScheduleIntervalType,
  anchorDate: Date | null,
): void {
  if (intervalType === "CALENDAR_FIXED" && !anchorDate) {
    throw new ServiceScheduleValidationError(
      "anchorDate is required for CALENDAR_FIXED schedules",
    )
  }
  if (intervalType === "TIME_BASED" && anchorDate) {
    throw new ServiceScheduleValidationError(
      "anchorDate is not allowed for TIME_BASED schedules",
    )
  }
}

function validateIntervalValue(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new ServiceScheduleValidationError(
      "intervalValue must be a positive integer",
    )
  }
}

function validateLeadTimeDays(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ServiceScheduleValidationError(
      "leadTimeDays must be a non-negative integer",
    )
  }
}

async function assertServiceObjectBelongsToTenant(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  serviceObjectId: string,
): Promise<void> {
  const so = await prisma.serviceObject.findFirst({
    where: { id: serviceObjectId, tenantId },
    select: { id: true },
  })
  if (!so) {
    throw new ServiceScheduleValidationError(
      "Service object not found for this tenant",
    )
  }
}

async function assertActivityBelongsToTenant(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  activityId: string,
): Promise<void> {
  const a = await prisma.activity.findFirst({
    where: { id: activityId, tenantId },
    select: { id: true },
  })
  if (!a) {
    throw new ServiceScheduleValidationError(
      "Default activity not found for this tenant",
    )
  }
}

async function assertEmployeeBelongsToTenant(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
): Promise<void> {
  const e = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: { id: true },
  })
  if (!e) {
    throw new ServiceScheduleValidationError(
      "Responsible employee not found for this tenant",
    )
  }
}

// --- Service Functions: Read ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: ListParams,
  now: Date = new Date(),
): Promise<{ items: ServiceScheduleDto[]; total: number }> {
  const { items: raw, total } = await repo.findMany(prisma, tenantId, {
    serviceObjectId: params?.serviceObjectId,
    customerAddressId: params?.customerAddressId,
    page: params?.page,
    pageSize: params?.pageSize,
  })

  const enriched = raw.map((s) => toDto(s, now))

  // Status-filter is derived, so it cannot be pushed down to the DB;
  // we post-filter in memory. For T-3 tenant sizes (<1000 schedules)
  // this is fine — see Plan §Deviation 2 for the trade-off.
  if (params?.status) {
    const filtered = enriched.filter((s) => s.status === params.status)
    return { items: filtered, total: filtered.length }
  }

  return { items: enriched, total }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  now: Date = new Date(),
): Promise<ServiceScheduleDto> {
  const record = await repo.findById(prisma, tenantId, id)
  if (!record) {
    throw new ServiceScheduleNotFoundError()
  }
  return toDto(record, now)
}

export async function listByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  now: Date = new Date(),
): Promise<ServiceScheduleDto[]> {
  const items = await repo.findManyByServiceObject(
    prisma,
    tenantId,
    serviceObjectId,
  )
  return items.map((s) => toDto(s, now))
}

// --- Service Functions: Write ---

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateScheduleInput,
  audit?: AuditContext,
): Promise<ServiceScheduleDto> {
  const name = input.name?.trim() ?? ""
  if (name.length === 0) {
    throw new ServiceScheduleValidationError("name is required")
  }
  if (name.length > 255) {
    throw new ServiceScheduleValidationError("name must be at most 255 characters")
  }

  validateIntervalValue(input.intervalValue)
  const leadTimeDays = input.leadTimeDays ?? 14
  validateLeadTimeDays(leadTimeDays)

  const anchorDate = normalizeAnchorDate(input.anchorDate)
  validateIntervalCongruence(input.intervalType, anchorDate)

  await assertServiceObjectBelongsToTenant(prisma, tenantId, input.serviceObjectId)

  if (input.defaultActivityId) {
    await assertActivityBelongsToTenant(prisma, tenantId, input.defaultActivityId)
  }
  if (input.responsibleEmployeeId) {
    await assertEmployeeBelongsToTenant(
      prisma,
      tenantId,
      input.responsibleEmployeeId,
    )
  }

  const now = new Date()
  const nextDueAt = calculateNextDueAt(
    input.intervalType,
    input.intervalValue,
    input.intervalUnit,
    null, // no completion yet
    anchorDate,
    now,
  )

  const created = await repo.create(prisma, {
    tenantId,
    serviceObjectId: input.serviceObjectId,
    name,
    description: input.description?.trim() || null,
    intervalType: input.intervalType,
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    anchorDate,
    defaultActivityId: input.defaultActivityId ?? null,
    responsibleEmployeeId: input.responsibleEmployeeId ?? null,
    estimatedHours: input.estimatedHours ?? null,
    lastCompletedAt: null,
    nextDueAt,
    leadTimeDays,
    isActive: input.isActive ?? true,
    createdById: audit?.userId ?? null,
    updatedById: audit?.userId ?? null,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: created.id,
        entityName: created.name,
        changes: null,
        metadata: {
          serviceObjectId: created.serviceObjectId,
          intervalType: created.intervalType,
          intervalValue: created.intervalValue,
          intervalUnit: created.intervalUnit,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return toDto(created, now)
}

/**
 * Fields whose change requires recomputing `nextDueAt`.
 */
const INTERVAL_FIELDS: Array<keyof UpdateScheduleInput> = [
  "intervalType",
  "intervalValue",
  "intervalUnit",
  "anchorDate",
]

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: UpdateScheduleInput,
  audit?: AuditContext,
): Promise<ServiceScheduleDto> {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ServiceScheduleNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new ServiceScheduleValidationError("name is required")
    }
    if (name.length > 255) {
      throw new ServiceScheduleValidationError(
        "name must be at most 255 characters",
      )
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim() || null
  }

  if (input.intervalType !== undefined) {
    data.intervalType = input.intervalType
  }
  if (input.intervalValue !== undefined) {
    validateIntervalValue(input.intervalValue)
    data.intervalValue = input.intervalValue
  }
  if (input.intervalUnit !== undefined) {
    data.intervalUnit = input.intervalUnit
  }
  if (input.anchorDate !== undefined) {
    data.anchorDate = normalizeAnchorDate(input.anchorDate)
  }

  if (input.defaultActivityId !== undefined) {
    if (input.defaultActivityId) {
      await assertActivityBelongsToTenant(
        prisma,
        tenantId,
        input.defaultActivityId,
      )
    }
    data.defaultActivityId = input.defaultActivityId
  }

  if (input.responsibleEmployeeId !== undefined) {
    if (input.responsibleEmployeeId) {
      await assertEmployeeBelongsToTenant(
        prisma,
        tenantId,
        input.responsibleEmployeeId,
      )
    }
    data.responsibleEmployeeId = input.responsibleEmployeeId
  }

  if (input.estimatedHours !== undefined) {
    data.estimatedHours = input.estimatedHours
  }

  if (input.leadTimeDays !== undefined) {
    validateLeadTimeDays(input.leadTimeDays)
    data.leadTimeDays = input.leadTimeDays
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // Validate final (merged) interval-type / anchor-date congruence
  const finalIntervalType = (data.intervalType as ServiceScheduleIntervalType | undefined)
    ?? existing.intervalType
  const finalAnchorDate =
    "anchorDate" in data
      ? (data.anchorDate as Date | null)
      : existing.anchorDate
  validateIntervalCongruence(finalIntervalType, finalAnchorDate)

  // Recompute nextDueAt if any interval-defining field changed.
  const intervalChanged = INTERVAL_FIELDS.some((f) => f in input)
  if (intervalChanged) {
    const now = new Date()
    const finalIntervalValue =
      (data.intervalValue as number | undefined) ?? existing.intervalValue
    const finalIntervalUnit =
      (data.intervalUnit as ServiceScheduleIntervalUnit | undefined)
      ?? existing.intervalUnit
    data.nextDueAt = calculateNextDueAt(
      finalIntervalType,
      finalIntervalValue,
      finalIntervalUnit,
      existing.lastCompletedAt,
      finalAnchorDate,
      now,
    )
  }

  if (audit?.userId !== undefined) {
    data.updatedById = audit.userId
  }

  const updated = await repo.update(prisma, tenantId, id, data)

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS as unknown as string[],
    )
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: id,
        entityName: updated.name,
        changes,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return toDto(updated, new Date())
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
): Promise<void> {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ServiceScheduleNotFoundError()
  }

  const deleted = await repo.deleteById(prisma, tenantId, id)
  if (!deleted) {
    throw new ServiceScheduleNotFoundError()
  }

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: id,
        entityName: existing.name,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

// --- Generate Order ---

/**
 * Create a new Order from a ServiceSchedule in a single transaction:
 *   1. Fetch schedule + tenant double-check
 *   2. Allocate next "maintenance_order" number (WA-<n>)
 *   3. Insert Order with `serviceScheduleId` back-link
 *   4. Optionally insert an initial OrderAssignment (worker role)
 *   5. Write 2 audit rows (service_schedule + order)
 *
 * `lastCompletedAt` and `nextDueAt` are NOT touched here — that
 * happens later via `recordCompletion` when the order is marked
 * completed.
 */
export async function generateOrder(
  prisma: PrismaClient,
  tenantId: string,
  scheduleId: string,
  params: { createInitialAssignment: boolean },
  createdById: string | null,
  audit?: AuditContext,
): Promise<GenerateOrderResult> {
  return prisma.$transaction(async (rawTx) => {
    // Cast pattern borrowed from `billing-recurring-invoice-service.generate`.
    // `numberSeqService.getNextNumber` requires a PrismaClient-typed arg,
    // and our repo helpers also accept the union type.
    const tx = rawTx as unknown as PrismaClient

    const schedule = await repo.findById(tx, tenantId, scheduleId)
    if (!schedule) throw new ServiceScheduleNotFoundError()

    // Defense-in-depth: should be impossible after the tenant-scoped
    // findFirst above, but a router bug could pass the wrong tenantId.
    if (schedule.tenantId !== tenantId) {
      throw new ServiceScheduleNotFoundError()
    }

    const code = await numberSeqService.getNextNumber(tx, tenantId, "maintenance_order")

    const order = await orderRepo.create(tx, {
      tenantId,
      code,
      name: schedule.name,
      description: schedule.description ?? null,
      status: "active",
      customer: schedule.serviceObject.customerAddress?.company ?? null,
      isActive: true,
      serviceObjectId: schedule.serviceObjectId,
      serviceScheduleId: scheduleId,
    } as Parameters<typeof orderRepo.create>[1])

    let assignment: Awaited<
      ReturnType<typeof orderAssignmentRepo.findByIdSimple>
    > | null = null
    if (params.createInitialAssignment && schedule.responsibleEmployeeId) {
      assignment = await orderAssignmentRepo.create(tx, {
        tenantId,
        orderId: order.id,
        employeeId: schedule.responsibleEmployeeId,
        role: "worker",
        isActive: true,
      })
    }

    // Audit rows inside the tx so they commit atomically with the order.
    // We use the same catch-and-log pattern as elsewhere — audit must
    // never break the business operation.
    await auditLog
      .log(tx, {
        tenantId,
        userId: createdById ?? audit?.userId ?? null,
        action: "generate_order",
        entityType: AUDIT_ENTITY_TYPE,
        entityId: scheduleId,
        entityName: schedule.name,
        changes: null,
        metadata: {
          generatedOrderId: order.id,
          generatedOrderCode: order.code,
          assignmentCreated: !!assignment,
        },
        ipAddress: audit?.ipAddress,
        userAgent: audit?.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))

    await auditLog
      .log(tx, {
        tenantId,
        userId: createdById ?? audit?.userId ?? null,
        action: "create",
        entityType: "order",
        entityId: order.id,
        entityName: order.name,
        changes: null,
        metadata: {
          generatedFromScheduleId: scheduleId,
          generatedFromScheduleName: schedule.name,
        },
        ipAddress: audit?.ipAddress,
        userAgent: audit?.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))

    // Re-fetch the order with the standard include so the caller sees
    // the same shape as orderService.getById would return.
    const finalOrder = await orderRepo.findByIdWithInclude(tx, tenantId, order.id)

    return {
      order: finalOrder,
      assignment,
      schedule,
    }
  })
}

// --- Record Completion (called from Order completion hook) ---

/**
 * Advance a schedule's `lastCompletedAt` + `nextDueAt`. Silently
 * no-ops when the schedule has been deleted or deactivated between
 * generate and completion — the Order completion hook wraps this in
 * a try/catch, but we also fail gracefully so the order update
 * never rolls back because of a stale schedule.
 */
export async function recordCompletion(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  scheduleId: string,
  completedAt: Date,
  audit?: AuditContext,
): Promise<void> {
  const schedule = await repo.findById(prisma, tenantId, scheduleId)
  if (!schedule) {
    console.warn(
      "[service-schedule] recordCompletion skipped: schedule not found",
      { tenantId, scheduleId },
    )
    return
  }
  if (!schedule.isActive) {
    console.warn(
      "[service-schedule] recordCompletion skipped: schedule inactive",
      { tenantId, scheduleId },
    )
    return
  }

  const nextDueAt = calculateNextDueAt(
    schedule.intervalType,
    schedule.intervalValue,
    schedule.intervalUnit,
    completedAt,
    schedule.anchorDate,
    new Date(),
  )

  await repo.update(prisma, tenantId, scheduleId, {
    lastCompletedAt: completedAt,
    nextDueAt,
  })

  await auditLog
    .log(prisma, {
      tenantId,
      userId: audit?.userId ?? null,
      action: "record_completion",
      entityType: AUDIT_ENTITY_TYPE,
      entityId: scheduleId,
      entityName: schedule.name,
      changes: null,
      metadata: {
        completedAt: completedAt.toISOString(),
        nextDueAt: nextDueAt?.toISOString() ?? null,
      },
      ipAddress: audit?.ipAddress,
      userAgent: audit?.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))
}

// --- Dashboard Summary ---

export async function getDashboardSummary(
  prisma: PrismaClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<{ overdueCount: number; dueSoonCount: number; okCount: number }> {
  return repo.countByStatus(prisma, tenantId, now, LEAD_TIME_DAYS_DEFAULT)
}
