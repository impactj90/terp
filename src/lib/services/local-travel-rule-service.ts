/**
 * Local Travel Rule Service
 *
 * Business logic for local travel rule operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./local-travel-rule-repository"

// --- Error Classes ---

export class LocalTravelRuleNotFoundError extends Error {
  constructor(message = "Local travel rule not found") {
    super(message)
    this.name = "LocalTravelRuleNotFoundError"
  }
}

export class LocalTravelRuleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LocalTravelRuleValidationError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { ruleSetId?: string }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const rule = await repo.findById(prisma, tenantId, id)
  if (!rule) {
    throw new LocalTravelRuleNotFoundError()
  }
  return rule
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    ruleSetId: string
    minDistanceKm?: number
    maxDistanceKm?: number
    minDurationMinutes?: number
    maxDurationMinutes?: number
    taxFreeAmount?: number
    taxableAmount?: number
    sortOrder?: number
  }
) {
  // Validate ruleSetId FK
  const ruleSet = await repo.findRuleSetById(prisma, tenantId, input.ruleSetId)
  if (!ruleSet) {
    throw new LocalTravelRuleValidationError("Rule set not found")
  }

  return repo.create(prisma, {
    tenantId,
    ruleSetId: input.ruleSetId,
    minDistanceKm: input.minDistanceKm ?? 0,
    maxDistanceKm: input.maxDistanceKm ?? null,
    minDurationMinutes: input.minDurationMinutes ?? 0,
    maxDurationMinutes: input.maxDurationMinutes ?? null,
    taxFreeAmount: input.taxFreeAmount ?? 0,
    taxableAmount: input.taxableAmount ?? 0,
    isActive: true,
    sortOrder: input.sortOrder ?? 0,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    minDistanceKm?: number
    maxDistanceKm?: number | null
    minDurationMinutes?: number
    maxDurationMinutes?: number | null
    taxFreeAmount?: number
    taxableAmount?: number
    isActive?: boolean
    sortOrder?: number
  }
) {
  // Verify rule exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new LocalTravelRuleNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.minDistanceKm !== undefined) {
    data.minDistanceKm = input.minDistanceKm
  }

  if (input.maxDistanceKm !== undefined) {
    data.maxDistanceKm = input.maxDistanceKm
  }

  if (input.minDurationMinutes !== undefined) {
    data.minDurationMinutes = input.minDurationMinutes
  }

  if (input.maxDurationMinutes !== undefined) {
    data.maxDurationMinutes = input.maxDurationMinutes
  }

  if (input.taxFreeAmount !== undefined) {
    data.taxFreeAmount = input.taxFreeAmount
  }

  if (input.taxableAmount !== undefined) {
    data.taxableAmount = input.taxableAmount
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
  // Verify rule exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new LocalTravelRuleNotFoundError()
  }

  await repo.deleteById(prisma, id)
}
