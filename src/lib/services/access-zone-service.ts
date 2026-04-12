/**
 * Access Zone Service
 *
 * Business logic for access zone operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./access-zone-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "code",
  "description",
  "isActive",
  "sortOrder",
]

// --- Error Classes ---

export class AccessZoneNotFoundError extends Error {
  constructor(message = "Access zone not found") {
    super(message)
    this.name = "AccessZoneNotFoundError"
  }
}

export class AccessZoneValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AccessZoneValidationError"
  }
}

export class AccessZoneConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AccessZoneConflictError"
  }
}

// --- Service Functions ---

export async function list(prisma: PrismaClient, tenantId: string) {
  return repo.findMany(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const zone = await repo.findById(prisma, tenantId, id)
  if (!zone) {
    throw new AccessZoneNotFoundError()
  }
  return zone
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    sortOrder?: number
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new AccessZoneValidationError("Access zone code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new AccessZoneValidationError("Access zone name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new AccessZoneConflictError("Access zone code already exists")
  }

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description: input.description?.trim() || null,
    isActive: true,
    sortOrder: input.sortOrder ?? 0,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "access_zone",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    isActive?: boolean
    sortOrder?: number
  },
  audit?: AuditContext
) {
  // Verify zone exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new AccessZoneNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new AccessZoneValidationError("Access zone name is required")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "access_zone",
      entityId: input.id,
      entityName: updated.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // Verify zone exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new AccessZoneNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "access_zone",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
