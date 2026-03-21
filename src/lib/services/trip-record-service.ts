/**
 * Trip Record Service
 *
 * Business logic for trip record (vehicle mileage log) operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./trip-record-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "vehicleId",
  "routeId",
  "tripDate",
  "startMileage",
  "endMileage",
  "distanceKm",
  "notes",
]

// --- Error Classes ---

export class TripRecordNotFoundError extends Error {
  constructor(message = "Trip record not found") {
    super(message)
    this.name = "TripRecordNotFoundError"
  }
}

export class TripRecordValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TripRecordValidationError"
  }
}

// --- Helpers ---

/** Convert a Prisma Decimal | null to number | null */
function decToNum(val: unknown): number | null {
  return val != null ? Number(val) : null
}

/** Maps a raw trip record (with includes) to a clean output shape */
function mapRecord(r: {
  id: string
  tenantId: string
  vehicleId: string
  routeId: string | null
  tripDate: Date
  startMileage: unknown
  endMileage: unknown
  distanceKm: unknown
  notes: string | null
  createdAt: Date
  updatedAt: Date
  vehicle?: { id: string; code: string; name: string }
  vehicleRoute?: { id: string; code: string; name: string } | null
}) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    vehicleId: r.vehicleId,
    routeId: r.routeId,
    tripDate: r.tripDate,
    startMileage: decToNum(r.startMileage),
    endMileage: decToNum(r.endMileage),
    distanceKm: decToNum(r.distanceKm),
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    vehicle: r.vehicle,
    vehicleRoute: r.vehicleRoute,
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    vehicleId?: string
    fromDate?: string
    toDate?: string
    limit: number
    page: number
  }
) {
  const { data, total } = await repo.findMany(prisma, tenantId, params)

  return {
    data: data.map(mapRecord),
    meta: {
      total,
      limit: params.limit,
      hasMore: params.page * params.limit < total,
    },
  }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const record = await repo.findById(prisma, tenantId, id)
  if (!record) {
    throw new TripRecordNotFoundError()
  }
  return mapRecord(record)
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    vehicleId: string
    routeId?: string
    tripDate: string
    startMileage?: number
    endMileage?: number
    distanceKm?: number
    notes?: string
  },
  audit?: AuditContext
) {
  // Validate tripDate
  const tripDate = new Date(input.tripDate)
  if (isNaN(tripDate.getTime())) {
    throw new TripRecordValidationError("Invalid trip date")
  }

  // Validate vehicleId FK
  const vehicle = await repo.findVehicleForTenant(
    prisma,
    tenantId,
    input.vehicleId
  )
  if (!vehicle) {
    throw new TripRecordValidationError("Vehicle not found")
  }

  // Validate routeId FK if provided
  if (input.routeId) {
    const route = await repo.findRouteForTenant(
      prisma,
      tenantId,
      input.routeId
    )
    if (!route) {
      throw new TripRecordValidationError("Vehicle route not found")
    }
  }

  const record = await repo.create(prisma, {
    tenantId,
    vehicleId: input.vehicleId,
    routeId: input.routeId || null,
    tripDate,
    startMileage: input.startMileage !== undefined ? input.startMileage : null,
    endMileage: input.endMileage !== undefined ? input.endMileage : null,
    distanceKm: input.distanceKm !== undefined ? input.distanceKm : null,
    notes: input.notes?.trim() || null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "trip_record",
      entityId: record.id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return mapRecord(record)
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    routeId?: string | null
    tripDate?: string
    startMileage?: number | null
    endMileage?: number | null
    distanceKm?: number | null
    notes?: string | null
  },
  audit?: AuditContext
) {
  // Verify record exists (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new TripRecordNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.routeId !== undefined) {
    if (input.routeId === null) {
      data.routeId = null
    } else {
      const route = await repo.findRouteForTenant(
        prisma,
        tenantId,
        input.routeId
      )
      if (!route) {
        throw new TripRecordValidationError("Vehicle route not found")
      }
      data.routeId = input.routeId
    }
  }

  if (input.tripDate !== undefined) {
    const tripDate = new Date(input.tripDate)
    if (isNaN(tripDate.getTime())) {
      throw new TripRecordValidationError("Invalid trip date")
    }
    data.tripDate = tripDate
  }

  if (input.startMileage !== undefined) {
    data.startMileage = input.startMileage
  }

  if (input.endMileage !== undefined) {
    data.endMileage = input.endMileage
  }

  if (input.distanceKm !== undefined) {
    data.distanceKm = input.distanceKm
  }

  if (input.notes !== undefined) {
    data.notes = input.notes === null ? null : input.notes.trim()
  }

  const record = await repo.update(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      record as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "trip_record",
      entityId: input.id,
      entityName: null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return mapRecord(record!)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // Verify record exists (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, id)
  if (!existing) {
    throw new TripRecordNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "trip_record",
      entityId: id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}
