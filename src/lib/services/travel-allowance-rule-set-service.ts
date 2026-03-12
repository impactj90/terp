/**
 * Travel Allowance Rule Set Service
 *
 * Business logic for travel allowance rule set operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./travel-allowance-rule-set-repository"

// --- Error Classes ---

export class TravelAllowanceRuleSetNotFoundError extends Error {
  constructor(message = "Travel allowance rule set not found") {
    super(message)
    this.name = "TravelAllowanceRuleSetNotFoundError"
  }
}

export class TravelAllowanceRuleSetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TravelAllowanceRuleSetValidationError"
  }
}

export class TravelAllowanceRuleSetConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TravelAllowanceRuleSetConflictError"
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
  const rs = await repo.findById(prisma, tenantId, id)
  if (!rs) {
    throw new TravelAllowanceRuleSetNotFoundError()
  }
  return rs
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    validFrom?: string
    validTo?: string
    calculationBasis?: string
    distanceRule?: string
    sortOrder?: number
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new TravelAllowanceRuleSetValidationError(
      "Rule set code is required"
    )
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new TravelAllowanceRuleSetValidationError(
      "Rule set name is required"
    )
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new TravelAllowanceRuleSetConflictError(
      "Rule set code already exists"
    )
  }

  // Parse dates if provided
  const validFrom = input.validFrom
    ? new Date(input.validFrom + "T00:00:00.000Z")
    : null
  const validTo = input.validTo
    ? new Date(input.validTo + "T00:00:00.000Z")
    : null

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    description: input.description?.trim() || null,
    validFrom,
    validTo,
    calculationBasis: input.calculationBasis ?? "per_day",
    distanceRule: input.distanceRule ?? "longest",
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
    validFrom?: string | null
    validTo?: string | null
    calculationBasis?: string
    distanceRule?: string
    isActive?: boolean
    sortOrder?: number
  }
) {
  // Verify rule set exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new TravelAllowanceRuleSetNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new TravelAllowanceRuleSetValidationError(
        "Rule set name is required"
      )
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  if (input.validFrom !== undefined) {
    data.validFrom = input.validFrom
      ? new Date(input.validFrom + "T00:00:00.000Z")
      : null
  }

  if (input.validTo !== undefined) {
    data.validTo = input.validTo
      ? new Date(input.validTo + "T00:00:00.000Z")
      : null
  }

  if (input.calculationBasis !== undefined) {
    data.calculationBasis = input.calculationBasis
  }

  if (input.distanceRule !== undefined) {
    data.distanceRule = input.distanceRule
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

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
  // Verify rule set exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new TravelAllowanceRuleSetNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)
}
