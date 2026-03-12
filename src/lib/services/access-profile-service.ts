/**
 * Access Profile Service
 *
 * Business logic for access profile operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./access-profile-repository"

// --- Error Classes ---

export class AccessProfileNotFoundError extends Error {
  constructor(message = "Access profile not found") {
    super(message)
    this.name = "AccessProfileNotFoundError"
  }
}

export class AccessProfileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AccessProfileValidationError"
  }
}

export class AccessProfileConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AccessProfileConflictError"
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
  const profile = await repo.findById(prisma, tenantId, id)
  if (!profile) {
    throw new AccessProfileNotFoundError()
  }
  return profile
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
    throw new AccessProfileValidationError("Access profile code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new AccessProfileValidationError("Access profile name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new AccessProfileConflictError("Access profile code already exists")
  }

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    description: input.description?.trim() || null,
    isActive: true,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    isActive?: boolean
  }
) {
  // Verify profile exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new AccessProfileNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new AccessProfileValidationError(
        "Access profile name is required"
      )
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

  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify profile exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new AccessProfileNotFoundError()
  }

  // Check if profile is in use by employee assignments
  const assignmentCount = await repo.countAssignments(prisma, id)
  if (assignmentCount > 0) {
    throw new AccessProfileConflictError(
      "Access profile is in use by employee assignments and cannot be deleted"
    )
  }

  await repo.deleteById(prisma, tenantId, id)
}
