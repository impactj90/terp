/**
 * Contact Type Service
 *
 * Business logic for contact type operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./contact-type-repository"

// --- Error Classes ---

export class ContactTypeNotFoundError extends Error {
  constructor(message = "Contact type not found") {
    super(message)
    this.name = "ContactTypeNotFoundError"
  }
}

export class ContactTypeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContactTypeValidationError"
  }
}

export class ContactTypeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContactTypeConflictError"
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
  const contactType = await repo.findById(prisma, tenantId, id)
  if (!contactType) {
    throw new ContactTypeNotFoundError()
  }
  return contactType
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    dataType?: string
    description?: string
    isActive?: boolean
    sortOrder?: number
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new ContactTypeValidationError("Contact type code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new ContactTypeValidationError("Contact type name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new ContactTypeConflictError("Contact type code already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    dataType: input.dataType ?? "text",
    description,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    dataType?: string
    description?: string | null
    isActive?: boolean
    sortOrder?: number
  }
) {
  // Verify contact type exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new ContactTypeNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new ContactTypeValidationError("Contact type code is required")
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
        throw new ContactTypeConflictError("Contact type code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new ContactTypeValidationError("Contact type name is required")
    }
    data.name = name
  }

  // Handle dataType update
  if (input.dataType !== undefined) {
    data.dataType = input.dataType
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

  // Handle sortOrder update
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
  // Verify contact type exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ContactTypeNotFoundError()
  }

  // Check for contact kinds referencing this type
  const kindCount = await repo.countContactKinds(prisma, id)
  if (kindCount > 0) {
    throw new ContactTypeValidationError(
      "Cannot delete contact type with associated contact kinds"
    )
  }

  await repo.deleteById(prisma, id)
}
