/**
 * Absence Type Group Service
 *
 * Business logic for absence type group operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./absence-type-group-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit Logging ---

const TRACKED_FIELDS = ["name", "code"]

// --- Error Classes ---

export class AbsenceTypeGroupNotFoundError extends Error {
  constructor(message = "Absence type group not found") {
    super(message)
    this.name = "AbsenceTypeGroupNotFoundError"
  }
}

export class AbsenceTypeGroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AbsenceTypeGroupValidationError"
  }
}

export class AbsenceTypeGroupConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AbsenceTypeGroupConflictError"
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
  const group = await repo.findById(prisma, tenantId, id)
  if (!group) {
    throw new AbsenceTypeGroupNotFoundError()
  }
  return group
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new AbsenceTypeGroupValidationError(
      "Absence type group code is required"
    )
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new AbsenceTypeGroupValidationError(
      "Absence type group name is required"
    )
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new AbsenceTypeGroupConflictError(
      "Absence type group code already exists"
    )
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  // Create group -- always isActive: true
  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    isActive: true,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "create", entityType: "absence_type_group",
      entityId: created.id, entityName: created.name ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
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
    description?: string | null
    isActive?: boolean
  },
  audit?: AuditContext
) {
  // Verify group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new AbsenceTypeGroupNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new AbsenceTypeGroupValidationError(
        "Absence type group code is required"
      )
    }
    // Check uniqueness only if code actually changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new AbsenceTypeGroupConflictError(
          "Absence type group code already exists"
        )
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new AbsenceTypeGroupValidationError(
        "Absence type group name is required"
      )
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, TRACKED_FIELDS)
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "update", entityType: "absence_type_group",
      entityId: input.id, entityName: updated.name ?? null, changes,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
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
  // Verify group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new AbsenceTypeGroupNotFoundError()
  }

  // Hard delete
  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "absence_type_group",
      entityId: id, entityName: existing.name ?? null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
