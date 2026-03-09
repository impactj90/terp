/**
 * Absence Type Service
 *
 * Business logic for absence type operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./absence-type-repository"

// --- Constants ---

/**
 * Code prefix validation per category.
 * U = vacation/unpaid, K = illness, S = special
 */
const CATEGORY_CODE_PREFIX: Record<string, string> = {
  vacation: "U",
  unpaid: "U",
  illness: "K",
  special: "S",
}

// --- Error Classes ---

export class AbsenceTypeNotFoundError extends Error {
  constructor(message = "Absence type not found") {
    super(message)
    this.name = "AbsenceTypeNotFoundError"
  }
}

export class AbsenceTypeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AbsenceTypeValidationError"
  }
}

export class AbsenceTypeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AbsenceTypeConflictError"
  }
}

// --- Helpers ---

function validateCodePrefix(code: string, category: string): boolean {
  const requiredPrefix = CATEGORY_CODE_PREFIX[category]
  if (!requiredPrefix) return true
  return code.toUpperCase().startsWith(requiredPrefix)
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; category?: string; includeSystem?: boolean }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const type = await repo.findById(prisma, tenantId, id)
  if (!type) {
    throw new AbsenceTypeNotFoundError()
  }
  return type
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    category: string
    portion: number
    holidayCode?: string
    priority: number
    deductsVacation: boolean
    requiresApproval: boolean
    requiresDocument: boolean
    color: string
    sortOrder: number
    absenceTypeGroupId?: string
    calculationRuleId?: string
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new AbsenceTypeValidationError("Absence type code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new AbsenceTypeValidationError("Absence type name is required")
  }

  // Validate code prefix matches category
  if (!validateCodePrefix(code, input.category)) {
    const expectedPrefix = CATEGORY_CODE_PREFIX[input.category] ?? ""
    throw new AbsenceTypeValidationError(
      `Code must start with '${expectedPrefix}' for category '${input.category}'`
    )
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new AbsenceTypeConflictError("Absence type code already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    category: input.category,
    portion: input.portion,
    holidayCode: input.holidayCode || null,
    priority: input.priority,
    deductsVacation: input.deductsVacation,
    requiresApproval: input.requiresApproval,
    requiresDocument: input.requiresDocument,
    color: input.color,
    sortOrder: input.sortOrder,
    isSystem: false,
    isActive: true,
    absenceTypeGroupId: input.absenceTypeGroupId || undefined,
    calculationRuleId: input.calculationRuleId || undefined,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    category?: string
    portion?: number
    holidayCode?: string | null
    priority?: number
    deductsVacation?: boolean
    requiresApproval?: boolean
    requiresDocument?: boolean
    color?: string
    sortOrder?: number
    isActive?: boolean
    absenceTypeGroupId?: string | null
    calculationRuleId?: string | null
  }
) {
  // Verify type exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new AbsenceTypeNotFoundError()
  }

  // Block modification of system types
  if (existing.isSystem) {
    throw new AbsenceTypeValidationError("Cannot modify system absence type")
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new AbsenceTypeValidationError("Absence type name is required")
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle category update
  if (input.category !== undefined) {
    // Validate code prefix matches new category
    if (!validateCodePrefix(existing.code, input.category)) {
      const expectedPrefix = CATEGORY_CODE_PREFIX[input.category] ?? ""
      throw new AbsenceTypeValidationError(
        `Code '${existing.code}' does not match prefix '${expectedPrefix}' for category '${input.category}'`
      )
    }
    data.category = input.category
  }

  // Handle simple field updates
  if (input.portion !== undefined) data.portion = input.portion
  if (input.priority !== undefined) data.priority = input.priority
  if (input.deductsVacation !== undefined)
    data.deductsVacation = input.deductsVacation
  if (input.requiresApproval !== undefined)
    data.requiresApproval = input.requiresApproval
  if (input.requiresDocument !== undefined)
    data.requiresDocument = input.requiresDocument
  if (input.color !== undefined) data.color = input.color
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  if (input.isActive !== undefined) data.isActive = input.isActive

  // Handle nullable FK updates
  if (input.holidayCode !== undefined) data.holidayCode = input.holidayCode
  if (input.absenceTypeGroupId !== undefined)
    data.absenceTypeGroupId = input.absenceTypeGroupId
  if (input.calculationRuleId !== undefined)
    data.calculationRuleId = input.calculationRuleId

  return repo.update(prisma, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify type exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new AbsenceTypeNotFoundError()
  }

  // Block deletion of system types
  if (existing.isSystem) {
    throw new AbsenceTypeValidationError(
      "Cannot delete system absence type"
    )
  }

  // Check usage in absence_days table
  const absenceDayCount = await repo.countAbsenceDaysByType(prisma, id)
  if (absenceDayCount > 0) {
    throw new AbsenceTypeValidationError(
      "Cannot delete absence type that is in use by absence days"
    )
  }

  await repo.deleteById(prisma, id)
}
