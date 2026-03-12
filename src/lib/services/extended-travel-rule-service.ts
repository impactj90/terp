/**
 * Extended Travel Rule Service
 *
 * Business logic for extended travel rule operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./extended-travel-rule-repository"

// --- Error Classes ---

export class ExtendedTravelRuleNotFoundError extends Error {
  constructor(message = "Extended travel rule not found") {
    super(message)
    this.name = "ExtendedTravelRuleNotFoundError"
  }
}

export class ExtendedTravelRuleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExtendedTravelRuleValidationError"
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
    throw new ExtendedTravelRuleNotFoundError()
  }
  return rule
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    ruleSetId: string
    arrivalDayTaxFree?: number
    arrivalDayTaxable?: number
    departureDayTaxFree?: number
    departureDayTaxable?: number
    intermediateDayTaxFree?: number
    intermediateDayTaxable?: number
    threeMonthEnabled?: boolean
    threeMonthTaxFree?: number
    threeMonthTaxable?: number
    sortOrder?: number
  }
) {
  // Validate ruleSetId FK
  const ruleSet = await repo.findRuleSetById(
    prisma,
    tenantId,
    input.ruleSetId
  )
  if (!ruleSet) {
    throw new ExtendedTravelRuleValidationError("Rule set not found")
  }

  return repo.create(prisma, {
    tenantId,
    ruleSetId: input.ruleSetId,
    arrivalDayTaxFree: input.arrivalDayTaxFree ?? 0,
    arrivalDayTaxable: input.arrivalDayTaxable ?? 0,
    departureDayTaxFree: input.departureDayTaxFree ?? 0,
    departureDayTaxable: input.departureDayTaxable ?? 0,
    intermediateDayTaxFree: input.intermediateDayTaxFree ?? 0,
    intermediateDayTaxable: input.intermediateDayTaxable ?? 0,
    threeMonthEnabled: input.threeMonthEnabled ?? false,
    threeMonthTaxFree: input.threeMonthTaxFree ?? 0,
    threeMonthTaxable: input.threeMonthTaxable ?? 0,
    isActive: true,
    sortOrder: input.sortOrder ?? 0,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    arrivalDayTaxFree?: number
    arrivalDayTaxable?: number
    departureDayTaxFree?: number
    departureDayTaxable?: number
    intermediateDayTaxFree?: number
    intermediateDayTaxable?: number
    threeMonthEnabled?: boolean
    threeMonthTaxFree?: number
    threeMonthTaxable?: number
    isActive?: boolean
    sortOrder?: number
  }
) {
  // Verify rule exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new ExtendedTravelRuleNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.arrivalDayTaxFree !== undefined) {
    data.arrivalDayTaxFree = input.arrivalDayTaxFree
  }

  if (input.arrivalDayTaxable !== undefined) {
    data.arrivalDayTaxable = input.arrivalDayTaxable
  }

  if (input.departureDayTaxFree !== undefined) {
    data.departureDayTaxFree = input.departureDayTaxFree
  }

  if (input.departureDayTaxable !== undefined) {
    data.departureDayTaxable = input.departureDayTaxable
  }

  if (input.intermediateDayTaxFree !== undefined) {
    data.intermediateDayTaxFree = input.intermediateDayTaxFree
  }

  if (input.intermediateDayTaxable !== undefined) {
    data.intermediateDayTaxable = input.intermediateDayTaxable
  }

  if (input.threeMonthEnabled !== undefined) {
    data.threeMonthEnabled = input.threeMonthEnabled
  }

  if (input.threeMonthTaxFree !== undefined) {
    data.threeMonthTaxFree = input.threeMonthTaxFree
  }

  if (input.threeMonthTaxable !== undefined) {
    data.threeMonthTaxable = input.threeMonthTaxable
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
  // Verify rule exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ExtendedTravelRuleNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)
}
