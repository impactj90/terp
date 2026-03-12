/**
 * Employee Day Plans Service
 *
 * Business logic for employee day plan operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { EmployeeDayPlanGenerator } from "@/lib/services/employee-day-plan-generator"
import * as repo from "./employee-day-plans-repository"

// --- Error Classes ---

export class EmployeeDayPlanNotFoundError extends Error {
  constructor(message = "Employee day plan not found") {
    super(message)
    this.name = "EmployeeDayPlanNotFoundError"
  }
}

export class EmployeeDayPlanValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeDayPlanValidationError"
  }
}

export class EmployeeDayPlanConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmployeeDayPlanConflictError"
  }
}

// --- Mapper ---

export interface EmployeeDayPlanOutput {
  id: string
  tenantId: string
  employeeId: string
  planDate: Date
  dayPlanId: string | null
  shiftId: string | null
  source: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  dayPlan?: {
    id: string
    code: string
    name: string
    planType: string
  } | null
  shift?: {
    id: string
    code: string
    name: string
  } | null
}

function mapToOutput(record: Record<string, unknown>): EmployeeDayPlanOutput {
  const result: EmployeeDayPlanOutput = {
    id: record.id as string,
    tenantId: record.tenantId as string,
    employeeId: record.employeeId as string,
    planDate: record.planDate as Date,
    dayPlanId: (record.dayPlanId as string | null) ?? null,
    shiftId: (record.shiftId as string | null) ?? null,
    source: (record.source as string | null) ?? null,
    notes: (record.notes as string | null) ?? null,
    createdAt: record.createdAt as Date,
    updatedAt: record.updatedAt as Date,
  }

  if (record.dayPlan !== undefined) {
    result.dayPlan =
      (record.dayPlan as {
        id: string
        code: string
        name: string
        planType: string
      } | null) ?? null
  }

  if (record.shift !== undefined) {
    result.shift =
      (record.shift as {
        id: string
        code: string
        name: string
      } | null) ?? null
  }

  return result
}

// --- Service Functions ---

/**
 * Lists employee day plans with required date range.
 * Optional employeeId filter.
 */
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  input: { employeeId?: string; from: string; to: string }
) {
  if (input.from > input.to) {
    throw new EmployeeDayPlanValidationError(
      "from date must not be after to date"
    )
  }

  const plans = await repo.findMany(prisma, tenantId, input)

  return {
    data: plans.map((p) =>
      mapToOutput(p as unknown as Record<string, unknown>)
    ),
  }
}

/**
 * Lists day plans for a specific employee within date range.
 * Includes richer dayPlan data (breaks, bonuses) and full shift details.
 */
export async function forEmployee(
  prisma: PrismaClient,
  tenantId: string,
  input: { employeeId: string; from: string; to: string }
) {
  if (input.from > input.to) {
    throw new EmployeeDayPlanValidationError(
      "from date must not be after to date"
    )
  }

  const employee = await repo.findEmployeeForTenant(
    prisma,
    tenantId,
    input.employeeId
  )
  if (!employee) {
    throw new EmployeeDayPlanNotFoundError("Employee not found")
  }

  const plans = await repo.findManyForEmployee(prisma, tenantId, input)

  return {
    data: plans.map((p) =>
      mapToOutput(p as unknown as Record<string, unknown>)
    ),
  }
}

/**
 * Gets a single employee day plan by ID.
 */
export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const plan = await repo.findById(prisma, tenantId, id)

  if (!plan) {
    throw new EmployeeDayPlanNotFoundError()
  }

  return mapToOutput(plan as unknown as Record<string, unknown>)
}

/**
 * Creates a single employee day plan.
 * Validates employee, shift FK, dayPlan FK.
 * Auto-populates dayPlanId from shift if not provided.
 */
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    planDate: string
    dayPlanId?: string
    shiftId?: string
    source: string
    notes?: string
  }
) {
  // Validate employee exists in tenant
  const employee = await repo.findEmployeeForTenant(
    prisma,
    tenantId,
    input.employeeId
  )
  if (!employee) {
    throw new EmployeeDayPlanValidationError("Invalid employee reference")
  }

  let dayPlanId = input.dayPlanId || null
  const shiftId = input.shiftId || null

  // If shiftId provided: validate shift, auto-populate dayPlanId
  if (shiftId) {
    const shift = await repo.findShiftForTenant(prisma, tenantId, shiftId)
    if (!shift) {
      throw new EmployeeDayPlanValidationError("Invalid shift reference")
    }
    // Auto-populate dayPlanId from shift if not explicitly provided
    if (!dayPlanId && shift.dayPlanId) {
      dayPlanId = shift.dayPlanId
    }
  }

  // Validate dayPlanId if provided (or auto-populated)
  if (dayPlanId) {
    const dp = await repo.findDayPlanForTenant(prisma, tenantId, dayPlanId)
    if (!dp) {
      throw new EmployeeDayPlanValidationError("Invalid day plan reference")
    }
  }

  try {
    const plan = await repo.create(prisma, {
      tenantId,
      employeeId: input.employeeId,
      planDate: new Date(input.planDate),
      dayPlanId,
      shiftId,
      source: input.source,
      notes: input.notes?.trim() || null,
    })

    return mapToOutput(plan as unknown as Record<string, unknown>)
  } catch (err: unknown) {
    // Handle unique constraint violation on [employeeId, planDate]
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "P2002"
    ) {
      throw new EmployeeDayPlanConflictError(
        "An employee day plan already exists for this employee and date"
      )
    }
    throw err
  }
}

/**
 * Partial update of an employee day plan.
 * Supports nullable fields (null = clear). Same shift->dayPlan auto-populate logic.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    dayPlanId?: string | null
    shiftId?: string | null
    source?: string
    notes?: string | null
  }
) {
  // Verify EDP exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new EmployeeDayPlanNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle shiftId update
  if (input.shiftId !== undefined) {
    if (input.shiftId === null) {
      data.shiftId = null
    } else {
      const shift = await repo.findShiftForTenant(
        prisma,
        tenantId,
        input.shiftId
      )
      if (!shift) {
        throw new EmployeeDayPlanValidationError("Invalid shift reference")
      }
      data.shiftId = input.shiftId

      // Auto-populate dayPlanId from shift if dayPlanId not explicitly in input
      if (input.dayPlanId === undefined && shift.dayPlanId) {
        data.dayPlanId = shift.dayPlanId
      }
    }
  }

  // Handle dayPlanId update
  if (input.dayPlanId !== undefined) {
    if (input.dayPlanId === null) {
      data.dayPlanId = null
    } else {
      const dp = await repo.findDayPlanForTenant(
        prisma,
        tenantId,
        input.dayPlanId
      )
      if (!dp) {
        throw new EmployeeDayPlanValidationError("Invalid day plan reference")
      }
      data.dayPlanId = input.dayPlanId
    }
  }

  // Handle source update
  if (input.source !== undefined) {
    data.source = input.source
  }

  // Handle notes update
  if (input.notes !== undefined) {
    data.notes = input.notes === null ? null : input.notes.trim()
  }

  const plan = (await repo.update(prisma, tenantId, input.id, data))!

  return mapToOutput(plan as unknown as Record<string, unknown>)
}

/**
 * Deletes a single employee day plan. Hard delete.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify EDP exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new EmployeeDayPlanNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)
  return { success: true }
}

/**
 * Bulk upsert employee day plans.
 * Validates all entries before creating. Resolves dayPlanId from shift where needed.
 */
export async function bulkCreate(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    entries: Array<{
      employeeId: string
      planDate: string
      dayPlanId?: string
      shiftId?: string
      source: string
      notes?: string
    }>
  }
) {
  // Collect unique IDs for batch validation
  const uniqueEmployeeIds = [...new Set(input.entries.map((e) => e.employeeId))]
  const uniqueShiftIds = [...new Set(
    input.entries.map((e) => e.shiftId).filter((id): id is string => !!id)
  )]
  const uniqueDayPlanIds = [...new Set(
    input.entries.map((e) => e.dayPlanId).filter((id): id is string => !!id)
  )]

  // Batch fetch all referenced entities
  const [foundEmployees, foundShifts, foundDayPlans] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: uniqueEmployeeIds }, tenantId },
      select: { id: true },
    }),
    uniqueShiftIds.length > 0
      ? prisma.shift.findMany({
          where: { id: { in: uniqueShiftIds }, tenantId },
          select: { id: true, dayPlanId: true },
        })
      : Promise.resolve([]),
    uniqueDayPlanIds.length > 0
      ? prisma.dayPlan.findMany({
          where: { id: { in: uniqueDayPlanIds }, tenantId },
          select: { id: true },
        })
      : Promise.resolve([]),
  ])

  // Build lookup sets/maps
  const employeeIdSet = new Set(foundEmployees.map((e) => e.id))
  const shiftMap = new Map(foundShifts.map((s) => [s.id, s]))
  const dayPlanIdSet = new Set(foundDayPlans.map((d) => d.id))

  // Validate all entries against the maps
  for (const entry of input.entries) {
    if (!employeeIdSet.has(entry.employeeId)) {
      throw new EmployeeDayPlanValidationError(
        `Invalid employee reference: ${entry.employeeId}`
      )
    }
    if (entry.shiftId && !shiftMap.has(entry.shiftId)) {
      throw new EmployeeDayPlanValidationError(
        `Invalid shift reference: ${entry.shiftId}`
      )
    }
    if (entry.dayPlanId && !dayPlanIdSet.has(entry.dayPlanId)) {
      throw new EmployeeDayPlanValidationError(
        `Invalid day plan reference: ${entry.dayPlanId}`
      )
    }
  }

  // Resolve dayPlanId from shift for entries without explicit dayPlanId
  const resolvedEntries = input.entries.map((entry) => {
    let dayPlanId = entry.dayPlanId || null
    const shiftId = entry.shiftId || null

    if (shiftId && !dayPlanId) {
      const shift = shiftMap.get(shiftId)
      if (shift?.dayPlanId) {
        dayPlanId = shift.dayPlanId
      }
    }

    return {
      employeeId: entry.employeeId,
      planDate: entry.planDate,
      dayPlanId,
      shiftId,
      source: entry.source,
      notes: entry.notes,
    }
  })

  // Bulk upsert in transaction
  await repo.bulkUpsert(prisma, tenantId, resolvedEntries)

  return { created: input.entries.length }
}

/**
 * Deletes employee day plans by employee + date range.
 * Validates employee exists. Returns count of deleted records.
 */
export async function deleteRange(
  prisma: PrismaClient,
  tenantId: string,
  input: { employeeId: string; from: string; to: string }
) {
  if (input.from > input.to) {
    throw new EmployeeDayPlanValidationError(
      "from date must not be after to date"
    )
  }

  // Validate employee exists in tenant
  const employee = await repo.findEmployeeForTenant(
    prisma,
    tenantId,
    input.employeeId
  )
  if (!employee) {
    throw new EmployeeDayPlanNotFoundError("Employee not found")
  }

  const result = await repo.deleteRange(prisma, tenantId, input)

  return { deleted: result.count }
}

/**
 * Generate day plans from employee tariffs.
 * Delegates to EmployeeDayPlanGenerator.
 */
export async function generateFromTariff(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeIds?: string[]
    from?: string
    to?: string
    overwriteTariffSource?: boolean
  }
) {
  const generator = new EmployeeDayPlanGenerator(prisma)
  return generator.generateFromTariff({
    tenantId,
    employeeIds: input.employeeIds,
    from: input.from ? new Date(input.from) : undefined,
    to: input.to ? new Date(input.to) : undefined,
    overwriteTariffSource: input.overwriteTariffSource,
  })
}
