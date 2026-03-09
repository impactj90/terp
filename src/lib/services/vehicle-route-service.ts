/**
 * Vehicle Route Service
 *
 * Business logic for vehicle route operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./vehicle-route-repository"

// --- Error Classes ---

export class VehicleRouteNotFoundError extends Error {
  constructor(message = "Vehicle route not found") {
    super(message)
    this.name = "VehicleRouteNotFoundError"
  }
}

export class VehicleRouteValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VehicleRouteValidationError"
  }
}

export class VehicleRouteConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VehicleRouteConflictError"
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
  const route = await repo.findById(prisma, tenantId, id)
  if (!route) {
    throw new VehicleRouteNotFoundError()
  }
  return route
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    distanceKm?: number
    sortOrder?: number
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new VehicleRouteValidationError("Vehicle route code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new VehicleRouteValidationError("Vehicle route name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new VehicleRouteConflictError("Vehicle route code already exists")
  }

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    description: input.description?.trim() || null,
    distanceKm: input.distanceKm !== undefined ? input.distanceKm : null,
    isActive: true,
    sortOrder: input.sortOrder ?? 0,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    distanceKm?: number | null
    isActive?: boolean
    sortOrder?: number
  }
) {
  // Verify route exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new VehicleRouteNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new VehicleRouteValidationError("Vehicle route name is required")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  if (input.distanceKm !== undefined) {
    data.distanceKm = input.distanceKm
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
  }

  return repo.update(prisma, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify route exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new VehicleRouteNotFoundError()
  }

  // Check if route has trip records
  const tripCount = await repo.countTripRecordsByRoute(prisma, id)
  if (tripCount > 0) {
    throw new VehicleRouteValidationError(
      "Cannot delete vehicle route that has trip records"
    )
  }

  await repo.deleteById(prisma, id)
}
