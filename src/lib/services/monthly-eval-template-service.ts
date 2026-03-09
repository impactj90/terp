/**
 * Monthly Evaluation Template Service
 *
 * Business logic for monthly evaluation template operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./monthly-eval-template-repository"

// --- Error Classes ---

export class MonthlyEvalTemplateNotFoundError extends Error {
  constructor(message = "Monthly evaluation template not found") {
    super(message)
    this.name = "MonthlyEvalTemplateNotFoundError"
  }
}

export class MonthlyEvalTemplateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MonthlyEvalTemplateValidationError"
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
  const template = await repo.findById(prisma, tenantId, id)
  if (!template) {
    throw new MonthlyEvalTemplateNotFoundError()
  }
  return template
}

export async function getDefault(
  prisma: PrismaClient,
  tenantId: string
) {
  const template = await repo.findDefault(prisma, tenantId)
  if (!template) {
    throw new MonthlyEvalTemplateNotFoundError(
      "No default monthly evaluation template found"
    )
  }
  return template
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    description?: string
    flextimeCapPositive?: number
    flextimeCapNegative?: number
    overtimeThreshold?: number
    maxCarryoverVacation?: number
    isDefault?: boolean
    isActive?: boolean
  }
) {
  const name = input.name.trim()
  if (name.length === 0) {
    throw new MonthlyEvalTemplateValidationError("Template name is required")
  }

  return repo.create(prisma, {
    tenantId,
    name,
    description: input.description?.trim() ?? "",
    flextimeCapPositive: input.flextimeCapPositive ?? 0,
    flextimeCapNegative: input.flextimeCapNegative ?? 0,
    overtimeThreshold: input.overtimeThreshold ?? 0,
    maxCarryoverVacation: input.maxCarryoverVacation ?? 0,
    isDefault: input.isDefault ?? false,
    isActive: input.isActive ?? true,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string
    flextimeCapPositive?: number
    flextimeCapNegative?: number
    overtimeThreshold?: number
    maxCarryoverVacation?: number
    isDefault?: boolean
    isActive?: boolean
  }
) {
  // Verify exists with tenant scope
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new MonthlyEvalTemplateNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new MonthlyEvalTemplateValidationError("Template name is required")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description = input.description.trim()
  }
  if (input.flextimeCapPositive !== undefined) {
    data.flextimeCapPositive = input.flextimeCapPositive
  }
  if (input.flextimeCapNegative !== undefined) {
    data.flextimeCapNegative = input.flextimeCapNegative
  }
  if (input.overtimeThreshold !== undefined) {
    data.overtimeThreshold = input.overtimeThreshold
  }
  if (input.maxCarryoverVacation !== undefined) {
    data.maxCarryoverVacation = input.maxCarryoverVacation
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }
  if (input.isDefault !== undefined) {
    data.isDefault = input.isDefault
  }

  return repo.update(
    prisma,
    tenantId,
    input.id,
    data,
    input.isDefault === true
  )
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new MonthlyEvalTemplateNotFoundError()
  }

  if (existing.isDefault) {
    throw new MonthlyEvalTemplateValidationError(
      "Cannot delete default evaluation template"
    )
  }

  await repo.deleteById(prisma, id)
}

export async function setDefault(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify exists with tenant scope
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new MonthlyEvalTemplateNotFoundError()
  }

  return repo.setDefault(prisma, tenantId, id)
}
