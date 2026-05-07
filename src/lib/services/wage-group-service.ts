/**
 * Wage Group Service (NK-1, Decision 2)
 *
 * Business logic for wage group operations. Wage groups bundle
 * billing/internal hourly rates per role/level so we can attribute
 * "what we charge" vs "what we pay" per group.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wage-group-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const TRACKED_FIELDS = [
  "code",
  "name",
  "internalHourlyRate",
  "billingHourlyRate",
  "sortOrder",
  "isActive",
]

// --- Error Classes ---

export class WageGroupNotFoundError extends Error {
  constructor(message = "Wage group not found") {
    super(message)
    this.name = "WageGroupNotFoundError"
  }
}

export class WageGroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WageGroupValidationError"
  }
}

export class WageGroupConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WageGroupConflictError"
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
  const wg = await repo.findById(prisma, tenantId, id)
  if (!wg) {
    throw new WageGroupNotFoundError()
  }
  return wg
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    internalHourlyRate?: number | null
    billingHourlyRate?: number | null
    sortOrder?: number
    isActive?: boolean
  },
  audit?: AuditContext
) {
  const code = input.code.trim()
  if (code.length === 0) {
    throw new WageGroupValidationError("Wage group code is required")
  }
  const name = input.name.trim()
  if (name.length === 0) {
    throw new WageGroupValidationError("Wage group name is required")
  }
  if (
    input.internalHourlyRate != null &&
    input.internalHourlyRate < 0
  ) {
    throw new WageGroupValidationError(
      "internalHourlyRate must be >= 0",
    )
  }
  if (
    input.billingHourlyRate != null &&
    input.billingHourlyRate < 0
  ) {
    throw new WageGroupValidationError(
      "billingHourlyRate must be >= 0",
    )
  }

  const dup = await repo.findByCode(prisma, tenantId, code)
  if (dup) {
    throw new WageGroupConflictError("Wage group code already exists")
  }

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    internalHourlyRate: input.internalHourlyRate ?? null,
    billingHourlyRate: input.billingHourlyRate ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "wage_group",
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
    internalHourlyRate?: number | null
    billingHourlyRate?: number | null
    sortOrder?: number
    isActive?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new WageGroupNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new WageGroupValidationError("Wage group code is required")
    }
    if (code !== existing.code) {
      const dup = await repo.findByCode(prisma, tenantId, code, input.id)
      if (dup) {
        throw new WageGroupConflictError("Wage group code already exists")
      }
    }
    data.code = code
  }

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new WageGroupValidationError("Wage group name is required")
    }
    data.name = name
  }

  if (input.internalHourlyRate !== undefined) {
    if (input.internalHourlyRate != null && input.internalHourlyRate < 0) {
      throw new WageGroupValidationError(
        "internalHourlyRate must be >= 0",
      )
    }
    data.internalHourlyRate = input.internalHourlyRate
  }

  if (input.billingHourlyRate !== undefined) {
    if (input.billingHourlyRate != null && input.billingHourlyRate < 0) {
      throw new WageGroupValidationError(
        "billingHourlyRate must be >= 0",
      )
    }
    data.billingHourlyRate = input.billingHourlyRate
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
        entityType: "wage_group",
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
    throw new WageGroupNotFoundError()
  }

  const employeeCount = await repo.countEmployeesUsing(prisma, tenantId, id)
  if (employeeCount > 0) {
    throw new WageGroupConflictError(
      `Wage group is used by ${employeeCount} employee(s). Deactivate instead.`,
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "wage_group",
        entityId: id,
        entityName: existing.name ?? null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}
