/**
 * Cost Center Service
 *
 * Business logic for cost center operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./cost-center-repository"

// --- Error Classes ---

export class CostCenterNotFoundError extends Error {
  constructor(message = "Cost center not found") {
    super(message)
    this.name = "CostCenterNotFoundError"
  }
}

export class CostCenterValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CostCenterValidationError"
  }
}

export class CostCenterConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CostCenterConflictError"
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
  const costCenter = await repo.findById(prisma, tenantId, id)
  if (!costCenter) {
    throw new CostCenterNotFoundError()
  }
  return costCenter
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    isActive?: boolean
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new CostCenterValidationError("Cost center code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new CostCenterValidationError("Cost center name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new CostCenterConflictError("Cost center code already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    isActive: input.isActive ?? true,
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
  // Verify cost center exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CostCenterNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new CostCenterValidationError("Cost center code is required")
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
        throw new CostCenterConflictError("Cost center code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new CostCenterValidationError("Cost center name is required")
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
  // Verify cost center exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CostCenterNotFoundError()
  }

  // Check for employees
  const employeeCount = await repo.countEmployees(prisma, id)
  if (employeeCount > 0) {
    throw new CostCenterValidationError(
      "Cannot delete cost center with assigned employees"
    )
  }

  await repo.deleteById(prisma, tenantId, id)
}
