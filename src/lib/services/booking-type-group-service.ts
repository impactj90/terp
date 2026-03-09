/**
 * Booking Type Group Service
 *
 * Business logic for booking type group operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./booking-type-group-repository"

// --- Error Classes ---

export class BookingTypeGroupNotFoundError extends Error {
  constructor(message = "Booking type group not found") {
    super(message)
    this.name = "BookingTypeGroupNotFoundError"
  }
}

export class BookingTypeGroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookingTypeGroupValidationError"
  }
}

export class BookingTypeGroupConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BookingTypeGroupConflictError"
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
    throw new BookingTypeGroupNotFoundError()
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
    bookingTypeIds?: string[]
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new BookingTypeGroupValidationError(
      "Booking type group code is required"
    )
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new BookingTypeGroupValidationError(
      "Booking type group name is required"
    )
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new BookingTypeGroupConflictError(
      "Booking type group code already exists"
    )
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  // Create group
  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    isActive: true,
  })

  // Create members if bookingTypeIds provided
  if (input.bookingTypeIds && input.bookingTypeIds.length > 0) {
    await repo.createMembers(prisma, created.id, input.bookingTypeIds)
  }

  // Re-fetch with includes for response
  return repo.findByIdWithMembers(prisma, created.id)
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    isActive?: boolean
    bookingTypeIds?: string[]
  }
) {
  // Verify group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new BookingTypeGroupNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new BookingTypeGroupValidationError(
        "Booking type group name is required"
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

  // Update group fields
  if (Object.keys(data).length > 0) {
    await repo.update(prisma, input.id, data)
  }

  // Replace members if bookingTypeIds is provided (not undefined)
  if (input.bookingTypeIds !== undefined) {
    await repo.replaceMembers(prisma, input.id, input.bookingTypeIds)
  }

  // Re-fetch with includes for response
  return repo.findByIdWithMembers(prisma, input.id)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new BookingTypeGroupNotFoundError()
  }

  // Hard delete (members cascade via FK)
  await repo.deleteById(prisma, id)
}
