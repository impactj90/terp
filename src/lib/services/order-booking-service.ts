/**
 * Order Booking Service
 *
 * Business logic for order booking operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./order-booking-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { checkRelatedEmployeeDataScope } from "@/lib/auth/data-scope"
import type { DataScope } from "@/lib/auth/middleware"
import {
  resolveLaborRateExtended,
  type HourlyRateSource,
} from "./labor-rate-resolver"

// --- Audit ---

const TRACKED_FIELDS = [
  "orderId",
  "employeeId",
  "bookingDate",
  // NK-1 (Decision 14, Decision 26)
  "hourlyRateAtBooking",
  "hourlyRateSourceAtBooking",
  "quantity",
]

/**
 * NK-1 (Decision 14): resolve the labor rate for a booking and
 * return both the rate and the source-of-record. Used by `create`/
 * `update` to populate the snapshot fields.
 */
async function resolveBookingHourlyRate(
  prisma: PrismaClient,
  tenantId: string,
  args: {
    activityId: string | null
    orderId: string
    employeeId: string
  },
): Promise<{ rate: number | null; source: HourlyRateSource }> {
  const [activity, order, employee] = await Promise.all([
    args.activityId
      ? prisma.activity.findFirst({
          where: { id: args.activityId, tenantId },
          select: {
            pricingType: true,
            flatRate: true,
            hourlyRate: true,
            unit: true,
          },
        })
      : Promise.resolve(null),
    prisma.order.findFirst({
      where: { id: args.orderId, tenantId },
      select: { billingRatePerHour: true },
    }),
    prisma.employee.findFirst({
      where: { id: args.employeeId, tenantId },
      select: {
        hourlyRate: true,
        wageGroup: { select: { billingHourlyRate: true } },
      },
    }),
  ])

  return resolveLaborRateExtended({
    bookingActivity: activity,
    orderRate: order?.billingRatePerHour ?? null,
    employeeWageGroupRate: employee?.wageGroup?.billingHourlyRate ?? null,
    employeeRate: employee?.hourlyRate ?? null,
  })
}

// --- Error Classes ---

export class OrderBookingNotFoundError extends Error {
  constructor(message = "Order booking not found") {
    super(message)
    this.name = "OrderBookingNotFoundError"
  }
}

export class OrderBookingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderBookingValidationError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    page: number
    pageSize: number
    employeeId?: string
    orderId?: string
    fromDate?: string
    toDate?: string
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const booking = await repo.findById(prisma, tenantId, id)
  if (!booking) {
    throw new OrderBookingNotFoundError()
  }
  return booking
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  input: {
    employeeId: string
    orderId: string
    activityId?: string
    bookingDate: string
    timeMinutes: number
    description?: string
    // NK-1 (Decision 26): PER_UNIT quantity
    quantity?: number | null
  },
  audit?: AuditContext
) {
  // Validate employee exists in tenant
  const employee = await repo.findEmployee(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new OrderBookingValidationError("Employee not found")
  }

  // Validate order exists in tenant
  const order = await repo.findOrder(prisma, tenantId, input.orderId)
  if (!order) {
    throw new OrderBookingValidationError("Order not found")
  }

  // Validate activity exists in tenant (if provided), enforce PER_UNIT
  // quantity (NK-1, Decision 26).
  let activityRecord: {
    id: string
    pricingType: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
  } | null = null
  if (input.activityId) {
    const activity = await prisma.activity.findFirst({
      where: { id: input.activityId, tenantId },
      select: { id: true, pricingType: true },
    })
    if (!activity) {
      throw new OrderBookingValidationError("Activity not found")
    }
    activityRecord = activity
    if (activity.pricingType === "PER_UNIT") {
      if (input.quantity == null || Number(input.quantity) <= 0) {
        throw new OrderBookingValidationError(
          "PER_UNIT-Aktivität benötigt quantity",
        )
      }
    }
  }

  // NK-1 Snapshot (Decision 14): resolve and persist the rate at
  // booking time so subsequent rate changes don't retroactively
  // alter historical aggregates.
  const resolved = await resolveBookingHourlyRate(prisma, tenantId, {
    activityId: input.activityId ?? null,
    orderId: input.orderId,
    employeeId: input.employeeId,
  })

  // Create order booking
  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    orderId: input.orderId,
    activityId: input.activityId || null,
    bookingDate: new Date(input.bookingDate),
    timeMinutes: input.timeMinutes,
    description: input.description?.trim() || null,
    source: "manual",
    createdBy: userId,
    updatedBy: userId,
    // NK-1 fields
    hourlyRateAtBooking: resolved.rate,
    hourlyRateSourceAtBooking: resolved.source,
    quantity:
      activityRecord?.pricingType === "PER_UNIT"
        ? (input.quantity ?? null)
        : null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "order_booking",
      entityId: created.id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  // Re-fetch with includes
  const result = await repo.findByIdWithInclude(prisma, tenantId, created.id)
  if (!result) {
    throw new OrderBookingNotFoundError()
  }
  return result
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  input: {
    id: string
    orderId?: string
    activityId?: string | null
    workReportId?: string | null
    bookingDate?: string
    timeMinutes?: number
    description?: string | null
    // NK-1 (Decision 26)
    quantity?: number | null
  },
  audit?: AuditContext,
  dataScope?: DataScope
) {
  // Fetch existing (tenant-scoped) with employee for scope check
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new OrderBookingNotFoundError()
  }

  // Check data scope if provided
  if (dataScope) {
    const withEmployee = await repo.findById(prisma, tenantId, input.id)
    if (withEmployee) {
      checkRelatedEmployeeDataScope(dataScope, withEmployee as unknown as {
        employeeId: string
        employee?: { departmentId: string | null } | null
      }, "Order booking")
    }
  }

  // Build partial update data
  const data: Record<string, unknown> = { updatedBy: userId }

  if (input.orderId !== undefined) {
    // Validate order exists in tenant
    const order = await repo.findOrder(prisma, tenantId, input.orderId)
    if (!order) {
      throw new OrderBookingValidationError("Order not found")
    }
    data.orderId = input.orderId
  }

  // Determine the activity used for PER_UNIT-validation and snapshot
  // resolution. Defaults to the existing booking's activityId, then
  // is overridden if the caller is patching activityId.
  const existingTyped = existing as unknown as {
    employeeId: string
    orderId: string
    activityId: string | null
  }
  let effectiveActivityId: string | null = existingTyped.activityId
  let effectiveActivity: {
    id: string
    pricingType: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
  } | null = null

  if (input.activityId !== undefined) {
    if (input.activityId !== null) {
      // Validate activity exists in tenant
      const activity = await prisma.activity.findFirst({
        where: { id: input.activityId, tenantId },
        select: { id: true, pricingType: true },
      })
      if (!activity) {
        throw new OrderBookingValidationError("Activity not found")
      }
      effectiveActivity = activity
      effectiveActivityId = activity.id
    } else {
      effectiveActivityId = null
    }
    data.activityId = input.activityId
  } else if (existingTyped.activityId) {
    const activity = await prisma.activity.findFirst({
      where: { id: existingTyped.activityId, tenantId },
      select: { id: true, pricingType: true },
    })
    effectiveActivity = activity
  }

  if (input.workReportId !== undefined) {
    if (input.workReportId !== null) {
      // The work report must exist in the tenant, belong to the same
      // order this booking targets, and still be DRAFT — signed scheine
      // are immutable so we cannot stamp new bookings on them.
      const targetOrderId = (input.orderId ?? (existing as { orderId: string }).orderId) as string
      const wr = await prisma.workReport.findFirst({
        where: {
          id: input.workReportId,
          tenantId,
          orderId: targetOrderId,
          status: "DRAFT",
        },
      })
      if (!wr) {
        throw new OrderBookingValidationError(
          "Arbeitsschein muss DRAFT sein und zum gleichen Auftrag gehören",
        )
      }
    }
    data.workReportId = input.workReportId
  }

  if (input.bookingDate !== undefined) {
    data.bookingDate = new Date(input.bookingDate)
  }

  if (input.timeMinutes !== undefined) {
    data.timeMinutes = input.timeMinutes
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // NK-1 (Decision 26): PER_UNIT activities require quantity > 0.
  // We validate against the *effective* activity (post-update if
  // activityId is being patched, else the existing one).
  if (effectiveActivity?.pricingType === "PER_UNIT") {
    const effectiveQuantity =
      input.quantity !== undefined
        ? input.quantity
        : (existing as unknown as { quantity: { toString(): string } | null })
            .quantity
    const qNum = effectiveQuantity == null ? null : Number(effectiveQuantity)
    if (qNum == null || qNum <= 0) {
      throw new OrderBookingValidationError(
        "PER_UNIT-Aktivität benötigt quantity",
      )
    }
  }

  if (input.quantity !== undefined) {
    // Only persist quantity for PER_UNIT activities; otherwise null
    data.quantity =
      effectiveActivity?.pricingType === "PER_UNIT"
        ? input.quantity
        : null
  } else if (
    input.activityId !== undefined &&
    effectiveActivity?.pricingType !== "PER_UNIT"
  ) {
    // If the activity is being changed away from PER_UNIT, clear quantity
    data.quantity = null
  }

  // NK-1 Snapshot (Decision 14): re-resolve the labor rate on every
  // update because activityId / orderId / employee data may have
  // changed since the previous snapshot.
  const targetOrderId = (input.orderId ?? existingTyped.orderId) as string
  const targetEmployeeId = existingTyped.employeeId
  const resolved = await resolveBookingHourlyRate(prisma, tenantId, {
    activityId: effectiveActivityId,
    orderId: targetOrderId,
    employeeId: targetEmployeeId,
  })
  data.hourlyRateAtBooking = resolved.rate
  data.hourlyRateSourceAtBooking = resolved.source

  // Update
  await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      data as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "order_booking",
      entityId: input.id,
      entityName: null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  // Re-fetch with includes
  const result = await repo.findByIdWithInclude(prisma, tenantId, input.id)
  if (!result) {
    throw new OrderBookingNotFoundError()
  }
  return result
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
  dataScope?: DataScope
) {
  // Fetch existing (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, id)
  if (!existing) {
    throw new OrderBookingNotFoundError()
  }

  // Check data scope if provided
  if (dataScope) {
    const withEmployee = await repo.findById(prisma, tenantId, id)
    if (withEmployee) {
      checkRelatedEmployeeDataScope(dataScope, withEmployee as unknown as {
        employeeId: string
        employee?: { departmentId: string | null } | null
      }, "Order booking")
    }
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "order_booking",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
