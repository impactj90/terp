/**
 * Employment Type Service
 *
 * Business logic for employment type operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./employment-type-repository"

// --- Error Classes ---

export class EmploymentTypeNotFoundError extends Error {
  constructor(message = "Employment type not found") {
    super(message)
    this.name = "EmploymentTypeNotFoundError"
  }
}

export class EmploymentTypeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmploymentTypeValidationError"
  }
}

export class EmploymentTypeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmploymentTypeConflictError"
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
  const employmentType = await repo.findById(prisma, tenantId, id)
  if (!employmentType) {
    throw new EmploymentTypeNotFoundError()
  }
  return employmentType
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    weeklyHoursDefault?: number
    isActive?: boolean
    vacationCalcGroupId?: string
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new EmploymentTypeValidationError(
      "Employment type code is required"
    )
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new EmploymentTypeValidationError(
      "Employment type name is required"
    )
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new EmploymentTypeConflictError(
      "Employment type code already exists"
    )
  }

  return repo.create(prisma, {
    tenantId,
    code,
    name,
    weeklyHoursDefault:
      input.weeklyHoursDefault !== undefined
        ? new Prisma.Decimal(input.weeklyHoursDefault)
        : new Prisma.Decimal(40.0),
    isActive: input.isActive ?? true,
    vacationCalcGroupId: input.vacationCalcGroupId ?? null,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    weeklyHoursDefault?: number
    isActive?: boolean
    vacationCalcGroupId?: string
    clearVacationCalcGroupId?: boolean
  }
) {
  // Verify employment type exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new EmploymentTypeNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new EmploymentTypeValidationError(
        "Employment type code is required"
      )
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
        throw new EmploymentTypeConflictError(
          "Employment type code already exists"
        )
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new EmploymentTypeValidationError(
        "Employment type name is required"
      )
    }
    data.name = name
  }

  // Handle weeklyHoursDefault update
  if (input.weeklyHoursDefault !== undefined) {
    data.weeklyHoursDefault = new Prisma.Decimal(input.weeklyHoursDefault)
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // Handle vacationCalcGroupId (clearVacationCalcGroupId takes priority)
  if (input.clearVacationCalcGroupId) {
    data.vacationCalcGroupId = null
  } else if (input.vacationCalcGroupId !== undefined) {
    data.vacationCalcGroupId = input.vacationCalcGroupId
  }

  return (await repo.update(prisma, tenantId, input.id, data))!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify employment type exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new EmploymentTypeNotFoundError()
  }

  // Check for employees
  const employeeCount = await repo.countEmployees(prisma, id)
  if (employeeCount > 0) {
    throw new EmploymentTypeValidationError(
      "Cannot delete employment type with assigned employees"
    )
  }

  await repo.deleteById(prisma, tenantId, id)
}
