/**
 * Order Target Service (NK-1, Decision 1)
 *
 * Versioned planned values per order ("Soll-Werte"). Pattern follows
 * `EmployeeSalaryHistory`: each new version closes the previous
 * active record by setting `validTo = newValidFrom - 1 day`. The
 * partial unique index `(order_id) WHERE valid_to IS NULL` enforces
 * a single open version per order at the DB level.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import * as repo from "./order-target-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const TRACKED_FIELDS = [
  "validFrom",
  "validTo",
  "version",
  "targetHours",
  "targetMaterialCost",
  "targetTravelMinutes",
  "targetExternalCost",
  "targetRevenue",
  "targetUnitItems",
  "changeReason",
  "notes",
]

export class OrderTargetNotFoundError extends Error {
  constructor(message = "Order target not found") {
    super(message)
    this.name = "OrderTargetNotFoundError"
  }
}

export class OrderTargetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderTargetValidationError"
  }
}

export class OrderTargetConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderTargetConflictError"
  }
}

export interface OrderTargetInput {
  orderId: string
  validFrom: string // ISO date YYYY-MM-DD
  targetHours?: number | null
  targetMaterialCost?: number | null
  targetTravelMinutes?: number | null
  targetExternalCost?: number | null
  targetRevenue?: number | null
  targetUnitItems?: Array<{ activityId: string; quantity: number }> | null
  changeReason?: string
  notes?: string
}

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00.000Z")
}

async function validateInput(
  prisma: PrismaClient,
  tenantId: string,
  input: OrderTargetInput,
) {
  const numericChecks: Array<[string, number | null | undefined]> = [
    ["targetHours", input.targetHours],
    ["targetMaterialCost", input.targetMaterialCost],
    ["targetTravelMinutes", input.targetTravelMinutes],
    ["targetExternalCost", input.targetExternalCost],
    ["targetRevenue", input.targetRevenue],
  ]
  for (const [name, val] of numericChecks) {
    if (val != null && val < 0) {
      throw new OrderTargetValidationError(`${name} must be >= 0`)
    }
  }

  if (input.targetUnitItems && input.targetUnitItems.length > 0) {
    const ids = input.targetUnitItems.map((i) => i.activityId)
    const found = await prisma.activity.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, pricingType: true },
    })
    const map = new Map(found.map((a) => [a.id, a]))
    for (const item of input.targetUnitItems) {
      if (item.quantity <= 0) {
        throw new OrderTargetValidationError(
          "targetUnitItems[].quantity must be > 0",
        )
      }
      const a = map.get(item.activityId)
      if (!a) {
        throw new OrderTargetValidationError(
          `Activity ${item.activityId} not found in tenant`,
        )
      }
      if (a.pricingType !== "PER_UNIT") {
        throw new OrderTargetValidationError(
          `Activity ${item.activityId} is not PER_UNIT`,
        )
      }
    }
  }
}

export async function getActiveTarget(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return repo.findActive(prisma, tenantId, orderId)
}

export async function listVersions(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
) {
  return repo.findManyByOrder(prisma, tenantId, orderId)
}

/**
 * Create the *initial* version for an order. Throws if an active
 * version already exists — caller must use `updateTarget` for
 * re-planning.
 */
export async function createInitialTarget(
  prisma: PrismaClient,
  tenantId: string,
  input: OrderTargetInput,
  audit?: AuditContext,
) {
  await validateInput(prisma, tenantId, input)

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, tenantId },
    select: { id: true },
  })
  if (!order) {
    throw new OrderTargetValidationError("Order not found in tenant")
  }

  const existing = await repo.findActive(prisma, tenantId, input.orderId)
  if (existing) {
    throw new OrderTargetConflictError(
      "Active version exists; use updateTarget to re-plan",
    )
  }

  const validFrom = parseDate(input.validFrom)
  const created = await repo.create(prisma, {
    tenantId,
    orderId: input.orderId,
    version: 1,
    validFrom,
    validTo: null,
    targetHours: input.targetHours ?? null,
    targetMaterialCost: input.targetMaterialCost ?? null,
    targetTravelMinutes: input.targetTravelMinutes ?? null,
    targetExternalCost: input.targetExternalCost ?? null,
    targetRevenue: input.targetRevenue ?? null,
    targetUnitItems: (input.targetUnitItems ?? null) as
      | Prisma.InputJsonValue
      | null,
    changeReason: input.changeReason ?? "INITIAL",
    notes: input.notes ?? null,
    createdBy: audit?.userId ?? null,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "order_target",
        entityId: created.id,
        entityName: `Order ${input.orderId} v1`,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return created
}

/**
 * Re-plan: closes the active version and creates a new one.
 * Atomic via $transaction. The DB-level partial unique index
 * `idx_order_targets_active_per_order` guarantees no concurrent
 * caller can leave two open versions.
 */
export async function updateTarget(
  prisma: PrismaClient,
  tenantId: string,
  input: OrderTargetInput,
  audit?: AuditContext,
) {
  await validateInput(prisma, tenantId, input)

  const newValidFrom = parseDate(input.validFrom)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const active = await tx.orderTarget.findFirst({
        where: { tenantId, orderId: input.orderId, validTo: null },
        orderBy: { version: "desc" },
      })
      if (!active) {
        throw new OrderTargetNotFoundError()
      }
      if (newValidFrom <= active.validFrom) {
        throw new OrderTargetValidationError(
          "Re-planung muss nach dem aktiven Soll liegen",
        )
      }

      const closeAt = new Date(newValidFrom)
      closeAt.setUTCDate(closeAt.getUTCDate() - 1)

      await repo.closeActiveVersion(tx, active.id, closeAt)

      return repo.create(tx, {
        tenantId,
        orderId: input.orderId,
        version: active.version + 1,
        validFrom: newValidFrom,
        validTo: null,
        targetHours: input.targetHours ?? null,
        targetMaterialCost: input.targetMaterialCost ?? null,
        targetTravelMinutes: input.targetTravelMinutes ?? null,
        targetExternalCost: input.targetExternalCost ?? null,
        targetRevenue: input.targetRevenue ?? null,
        targetUnitItems: (input.targetUnitItems ?? null) as
          | Prisma.InputJsonValue
          | null,
        changeReason: input.changeReason ?? "REPLAN",
        notes: input.notes ?? null,
        createdBy: audit?.userId ?? null,
      })
    })

    if (audit) {
      await auditLog
        .log(prisma, {
          tenantId,
          userId: audit.userId,
          action: "replan",
          entityType: "order_target",
          entityId: result.id,
          entityName: `Order ${input.orderId} v${result.version}`,
          changes: null,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        })
        .catch((err) => console.error("[AuditLog] Failed:", err))
    }

    return result
  } catch (err) {
    // Race-Condition: a parallel caller created another active version
    // → P2002 on the partial unique index.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new OrderTargetConflictError(
        "Concurrent re-plan detected — please retry",
      )
    }
    throw err
  }
}

/**
 * Convenience: dispatch to createInitialTarget or updateTarget based
 * on whether an active version already exists. Returns the created
 * OrderTarget plus the mode used.
 */
export async function upsertTarget(
  prisma: PrismaClient,
  tenantId: string,
  input: OrderTargetInput,
  audit?: AuditContext,
): Promise<{
  target: Awaited<ReturnType<typeof createInitialTarget>>
  mode: "created" | "replanned"
}> {
  const active = await repo.findActive(prisma, tenantId, input.orderId)
  if (!active) {
    const target = await createInitialTarget(prisma, tenantId, input, audit)
    return { target, mode: "created" }
  }
  const target = await updateTarget(prisma, tenantId, input, audit)
  return { target, mode: "replanned" }
}

export const __tracked = TRACKED_FIELDS
