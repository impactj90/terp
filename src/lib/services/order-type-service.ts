/**
 * Order Type Service (NK-1, Decision 15)
 *
 * Business logic for order type CRUD. Order types categorize orders
 * (Wartung, Notdienst, Reparatur, ...) and unlock per-type Nachkalk
 * threshold overrides.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./order-type-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const TRACKED_FIELDS = ["code", "name", "sortOrder", "isActive"]

export class OrderTypeNotFoundError extends Error {
  constructor(message = "Order type not found") {
    super(message)
    this.name = "OrderTypeNotFoundError"
  }
}

export class OrderTypeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderTypeValidationError"
  }
}

export class OrderTypeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderTypeConflictError"
  }
}

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
  const ot = await repo.findById(prisma, tenantId, id)
  if (!ot) {
    throw new OrderTypeNotFoundError()
  }
  return ot
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    sortOrder?: number
    isActive?: boolean
  },
  audit?: AuditContext
) {
  const code = input.code.trim()
  if (code.length === 0) {
    throw new OrderTypeValidationError("Order type code is required")
  }
  const name = input.name.trim()
  if (name.length === 0) {
    throw new OrderTypeValidationError("Order type name is required")
  }

  const dup = await repo.findByCode(prisma, tenantId, code)
  if (dup) {
    throw new OrderTypeConflictError("Order type code already exists")
  }

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "order_type",
        entityId: created.id,
        entityName: created.name ?? null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    sortOrder?: number
    isActive?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new OrderTypeNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new OrderTypeValidationError("Order type code is required")
    }
    if (code !== existing.code) {
      const dup = await repo.findByCode(prisma, tenantId, code, input.id)
      if (dup) {
        throw new OrderTypeConflictError("Order type code already exists")
      }
    }
    data.code = code
  }

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new OrderTypeValidationError("Order type name is required")
    }
    data.name = name
  }

  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS,
    )
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "order_type",
        entityId: input.id,
        entityName: updated.name ?? null,
        changes,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext,
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new OrderTypeNotFoundError()
  }

  const orderCount = await repo.countOrdersUsing(prisma, tenantId, id)
  if (orderCount > 0) {
    throw new OrderTypeConflictError(
      `Order type is used by ${orderCount} order(s). Deactivate instead.`,
    )
  }

  const thresholdCount = await repo.countThresholdConfigsUsing(
    prisma,
    tenantId,
    id,
  )
  if (thresholdCount > 0) {
    throw new OrderTypeConflictError(
      `Order type has ${thresholdCount} threshold-override(s). Remove first.`,
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "order_type",
        entityId: id,
        entityName: existing.name ?? null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}
