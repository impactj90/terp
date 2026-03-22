/**
 * Vehicle Service
 *
 * Business logic for vehicle operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./vehicle-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "code",
  "description",
  "licensePlate",
  "isActive",
  "sortOrder",
]

// --- Error Classes ---

export class VehicleNotFoundError extends Error {
  constructor(message = "Vehicle not found") {
    super(message)
    this.name = "VehicleNotFoundError"
  }
}

export class VehicleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VehicleValidationError"
  }
}

export class VehicleConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VehicleConflictError"
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
  const vehicle = await repo.findById(prisma, tenantId, id)
  if (!vehicle) {
    throw new VehicleNotFoundError()
  }
  return vehicle
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    licensePlate?: string
    sortOrder?: number
  },
  audit?: AuditContext
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new VehicleValidationError("Vehicle code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new VehicleValidationError("Vehicle name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new VehicleConflictError("Vehicle code already exists")
  }

  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description: input.description?.trim() || null,
    licensePlate: input.licensePlate?.trim() || null,
    isActive: true,
    sortOrder: input.sortOrder ?? 0,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "vehicle",
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
    licensePlate?: string | null
    isActive?: boolean
    sortOrder?: number
  },
  audit?: AuditContext
) {
  // Verify vehicle exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new VehicleNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new VehicleValidationError("Vehicle name is required")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  if (input.licensePlate !== undefined) {
    data.licensePlate =
      input.licensePlate === null ? null : input.licensePlate.trim()
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
      entityType: "vehicle",
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
  // Verify vehicle exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new VehicleNotFoundError()
  }

  // Check if vehicle has trip records
  const tripCount = await repo.countTripRecordsByVehicle(prisma, tenantId, id)
  if (tripCount > 0) {
    throw new VehicleValidationError(
      "Cannot delete vehicle that has trip records"
    )
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "vehicle",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
