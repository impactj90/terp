/**
 * Absence Type Group Service
 *
 * Business logic for absence type group operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./absence-type-group-repository"

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
  }
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
  return repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
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
    description?: string | null
    isActive?: boolean
  }
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

  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new AbsenceTypeGroupNotFoundError()
  }

  // Hard delete
  await repo.deleteById(prisma, tenantId, id)
}
