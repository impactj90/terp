/**
 * Account Group Service
 *
 * Business logic for account group operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./account-group-repository"

// --- Error Classes ---

export class AccountGroupNotFoundError extends Error {
  constructor(message = "Account group not found") {
    super(message)
    this.name = "AccountGroupNotFoundError"
  }
}

export class AccountGroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AccountGroupValidationError"
  }
}

export class AccountGroupConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AccountGroupConflictError"
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
    throw new AccountGroupNotFoundError()
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
    isActive?: boolean
    sortOrder?: number
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new AccountGroupValidationError("Account group code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new AccountGroupValidationError("Account group name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new AccountGroupConflictError("Account group code already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  return repo.create(prisma, {
    tenantId,
    code,
    name,
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
    description?: string | null
    isActive?: boolean
    sortOrder?: number
  }
) {
  // Verify account group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new AccountGroupNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new AccountGroupValidationError("Account group code is required")
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
        throw new AccountGroupConflictError("Account group code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new AccountGroupValidationError("Account group name is required")
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

  // Handle sortOrder update
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
  }

  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify account group exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new AccountGroupNotFoundError()
  }

  // Check for accounts referencing this group
  const accountCount = await repo.countAccounts(prisma, id)
  if (accountCount > 0) {
    throw new AccountGroupValidationError(
      "Cannot delete account group with assigned accounts"
    )
  }

  await repo.deleteById(prisma, tenantId, id)
}
