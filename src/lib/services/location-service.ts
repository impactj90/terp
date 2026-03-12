/**
 * Location Service
 *
 * Business logic for location operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./location-repository"

// --- Error Classes ---

export class LocationNotFoundError extends Error {
  constructor(message = "Location not found") {
    super(message)
    this.name = "LocationNotFoundError"
  }
}

export class LocationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LocationValidationError"
  }
}

export class LocationConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LocationConflictError"
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
  const location = await repo.findById(prisma, tenantId, id)
  if (!location) {
    throw new LocationNotFoundError()
  }
  return location
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    address?: string
    city?: string
    country?: string
    timezone?: string
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new LocationValidationError("Location code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new LocationValidationError("Location name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new LocationConflictError("Location code already exists")
  }

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    description: input.description?.trim() ?? "",
    address: input.address?.trim() ?? "",
    city: input.city?.trim() ?? "",
    country: input.country?.trim() ?? "",
    timezone: input.timezone?.trim() ?? "",
    isActive: true,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    description?: string
    address?: string
    city?: string
    country?: string
    timezone?: string
    isActive?: boolean
  }
) {
  // Verify location exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new LocationNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new LocationValidationError("Location code is required")
    }
    // Check uniqueness if changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new LocationConflictError("Location code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new LocationValidationError("Location name is required")
    }
    data.name = name
  }

  // Handle address field updates
  if (input.description !== undefined) {
    data.description = input.description.trim()
  }
  if (input.address !== undefined) {
    data.address = input.address.trim()
  }
  if (input.city !== undefined) {
    data.city = input.city.trim()
  }
  if (input.country !== undefined) {
    data.country = input.country.trim()
  }
  if (input.timezone !== undefined) {
    data.timezone = input.timezone.trim()
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify location exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new LocationNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)
}
