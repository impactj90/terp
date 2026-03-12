/**
 * Account Service
 *
 * Business logic for account operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./account-repository"

// --- Error Classes ---

export class AccountNotFoundError extends Error {
  constructor(message = "Account not found") {
    super(message)
    this.name = "AccountNotFoundError"
  }
}

export class AccountValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AccountValidationError"
  }
}

export class AccountConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AccountConflictError"
  }
}

// --- Constants ---

const VALID_ACCOUNT_TYPES = ["bonus", "day", "month"]
const VALID_UNITS = ["minutes", "hours", "days"]
const VALID_DISPLAY_FORMATS = ["decimal", "hh_mm"]

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    includeSystem?: boolean
    active?: boolean
    accountType?: string
    payrollRelevant?: boolean
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const account = await repo.findById(prisma, tenantId, id)
  if (!account) {
    throw new AccountNotFoundError()
  }
  return account
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    accountType: string
    unit?: string
    displayFormat?: string
    bonusFactor?: number
    accountGroupId?: string
    description?: string
    isPayrollRelevant?: boolean
    payrollCode?: string
    sortOrder?: number
    yearCarryover?: boolean
    isActive?: boolean
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new AccountValidationError("Account code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new AccountValidationError("Account name is required")
  }

  // Validate accountType
  if (!VALID_ACCOUNT_TYPES.includes(input.accountType)) {
    throw new AccountValidationError(
      `Invalid account type. Must be one of: ${VALID_ACCOUNT_TYPES.join(", ")}`
    )
  }

  // Validate unit if provided
  const unit = input.unit ?? "minutes"
  if (!VALID_UNITS.includes(unit)) {
    throw new AccountValidationError(
      `Invalid unit. Must be one of: ${VALID_UNITS.join(", ")}`
    )
  }

  // Validate displayFormat if provided
  const displayFormat = input.displayFormat ?? "decimal"
  if (!VALID_DISPLAY_FORMATS.includes(displayFormat)) {
    throw new AccountValidationError(
      `Invalid display format. Must be one of: ${VALID_DISPLAY_FORMATS.join(", ")}`
    )
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new AccountConflictError("Account code already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    accountType: input.accountType,
    unit,
    displayFormat,
    bonusFactor: input.bonusFactor ?? null,
    accountGroupId: input.accountGroupId ?? null,
    description,
    isPayrollRelevant: input.isPayrollRelevant ?? false,
    payrollCode: input.payrollCode?.trim() || null,
    sortOrder: input.sortOrder ?? 0,
    yearCarryover: input.yearCarryover ?? true,
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
    accountType?: string
    unit?: string
    displayFormat?: string
    bonusFactor?: number | null
    accountGroupId?: string | null
    description?: string | null
    isPayrollRelevant?: boolean
    payrollCode?: string | null
    sortOrder?: number
    yearCarryover?: boolean
    isActive?: boolean
  }
) {
  // Verify account exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new AccountNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    // Cannot modify system account code
    if (existing.isSystem) {
      throw new AccountValidationError("Cannot modify system account code")
    }
    const code = input.code.trim()
    if (code.length === 0) {
      throw new AccountValidationError("Account code is required")
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
        throw new AccountConflictError("Account code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new AccountValidationError("Account name is required")
    }
    data.name = name
  }

  // Handle accountType update
  if (input.accountType !== undefined) {
    if (!VALID_ACCOUNT_TYPES.includes(input.accountType)) {
      throw new AccountValidationError(
        `Invalid account type. Must be one of: ${VALID_ACCOUNT_TYPES.join(", ")}`
      )
    }
    data.accountType = input.accountType
  }

  // Handle unit update
  if (input.unit !== undefined) {
    if (!VALID_UNITS.includes(input.unit)) {
      throw new AccountValidationError(
        `Invalid unit. Must be one of: ${VALID_UNITS.join(", ")}`
      )
    }
    data.unit = input.unit
  }

  // Handle displayFormat update
  if (input.displayFormat !== undefined) {
    if (!VALID_DISPLAY_FORMATS.includes(input.displayFormat)) {
      throw new AccountValidationError(
        `Invalid display format. Must be one of: ${VALID_DISPLAY_FORMATS.join(", ")}`
      )
    }
    data.displayFormat = input.displayFormat
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle boolean/numeric fields
  if (input.isPayrollRelevant !== undefined) {
    data.isPayrollRelevant = input.isPayrollRelevant
  }
  if (input.payrollCode !== undefined) {
    data.payrollCode =
      input.payrollCode === null ? null : input.payrollCode.trim()
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
  }
  if (input.yearCarryover !== undefined) {
    data.yearCarryover = input.yearCarryover
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }
  if (input.bonusFactor !== undefined) {
    data.bonusFactor = input.bonusFactor
  }
  if (input.accountGroupId !== undefined) {
    data.accountGroupId = input.accountGroupId
  }

  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify account exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new AccountNotFoundError()
  }

  // Cannot delete system accounts
  if (existing.isSystem) {
    throw new AccountValidationError("Cannot delete system accounts")
  }

  await repo.deleteById(prisma, tenantId, id)
}

export async function getUsage(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify account exists
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new AccountNotFoundError()
  }

  const dayPlans = await repo.findDayPlanUsage(prisma, tenantId, id)

  return {
    accountId: id,
    usageCount: dayPlans.length,
    dayPlans,
  }
}
