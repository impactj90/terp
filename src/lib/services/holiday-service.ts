/**
 * Holiday Service
 *
 * Business logic for holiday operations including generate and copy.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import {
  generateHolidays as generateCalendarHolidays,
  parseState,
} from "./holiday-calendar"
import * as repo from "./holiday-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "date",
  "isHalfDay",
]

// --- Error Classes ---

export class HolidayNotFoundError extends Error {
  constructor(message = "Holiday not found") {
    super(message)
    this.name = "HolidayNotFoundError"
  }
}

export class HolidayValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HolidayValidationError"
  }
}

export class HolidayConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HolidayConflictError"
  }
}

// --- Date Helpers ---

/**
 * Normalize a date to midnight UTC (strip time).
 */
function normalizeDate(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
}

/**
 * Format a date as YYYY-MM-DD for use as a map key.
 */
function dateKey(d: Date): string {
  const nd = normalizeDate(d)
  return nd.toISOString().slice(0, 10)
}

/**
 * Create new date with a different year. Returns null for invalid dates
 * (e.g., Feb 29 in non-leap year).
 * Ported from Go: apps/api/internal/service/holiday.go lines 425-433.
 */
function dateWithYear(year: number, date: Date): Date | null {
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const target = new Date(Date.UTC(year, month, day))
  // If the month/day shifted (e.g., Feb 29 -> Mar 1), the date is invalid
  if (target.getUTCMonth() !== month || target.getUTCDate() !== day) {
    return null
  }
  return target
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    year?: number
    from?: string
    to?: string
    departmentId?: string
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const holiday = await repo.findById(prisma, tenantId, id)
  if (!holiday) {
    throw new HolidayNotFoundError()
  }
  return holiday
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    holidayDate: string
    name: string
    holidayCategory: number
    appliesToAll?: boolean
    departmentId?: string | null
  },
  audit?: AuditContext
) {
  // Parse and validate date
  const holidayDate = new Date(input.holidayDate)
  if (isNaN(holidayDate.getTime())) {
    throw new HolidayValidationError("Holiday date is required")
  }
  const normalizedDate = normalizeDate(holidayDate)

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new HolidayValidationError("Holiday name is required")
  }

  // Check date uniqueness within tenant
  const existingByDate = await repo.findByDate(
    prisma,
    tenantId,
    normalizedDate
  )
  if (existingByDate) {
    throw new HolidayConflictError("Holiday already exists on this date")
  }

  const created = await repo.create(prisma, {
    tenantId,
    holidayDate: normalizedDate,
    name,
    holidayCategory: input.holidayCategory,
    appliesToAll: input.appliesToAll ?? true,
    departmentId: input.departmentId ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "holiday",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    holidayDate?: string
    name?: string
    holidayCategory?: number
    appliesToAll?: boolean
    departmentId?: string | null
  },
  audit?: AuditContext
) {
  // Verify holiday exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new HolidayNotFoundError()
  }

  const data: Record<string, unknown> = {}

  // Handle date update
  if (input.holidayDate !== undefined) {
    const holidayDate = new Date(input.holidayDate)
    if (isNaN(holidayDate.getTime())) {
      throw new HolidayValidationError("Holiday date is required")
    }
    data.holidayDate = normalizeDate(holidayDate)
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new HolidayValidationError("Holiday name is required")
    }
    data.name = name
  }

  // Handle category update
  if (input.holidayCategory !== undefined) {
    data.holidayCategory = input.holidayCategory
  }

  // Handle appliesToAll update
  if (input.appliesToAll !== undefined) {
    data.appliesToAll = input.appliesToAll
  }

  // Handle departmentId update
  if (input.departmentId !== undefined) {
    data.departmentId = input.departmentId
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "holiday",
      entityId: input.id,
      entityName: updated.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // Verify holiday exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new HolidayNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "holiday",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

export async function generate(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    year: number
    state: string
    skipExisting?: boolean
  }
) {
  // Validate and parse state
  let state
  try {
    state = parseState(input.state)
  } catch {
    throw new HolidayValidationError("Invalid state code")
  }

  // Generate holiday definitions
  const definitions = generateCalendarHolidays(input.year, state)

  // Load existing holidays for the year
  const existing = await repo.findByYearRange(prisma, tenantId, input.year)
  const existingByDate = new Set(existing.map((h) => dateKey(h.holidayDate)))

  // Build records to create
  const records = definitions
    .filter((def) => {
      const key = dateKey(def.date)
      return !(input.skipExisting && existingByDate.has(key))
    })
    .map((def) => ({
      tenantId,
      holidayDate: normalizeDate(def.date),
      name: def.name,
      holidayCategory: 1,
      appliesToAll: true,
    }))

  if (records.length === 0) return []

  await prisma.holiday.createMany({ data: records })

  // Fetch the created records to return them
  const createdDates = records.map((r) => r.holidayDate)
  const created = await prisma.holiday.findMany({
    where: {
      tenantId,
      holidayDate: { in: createdDates },
    },
    orderBy: { holidayDate: "asc" },
  })

  return created
}

export async function copy(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    sourceYear: number
    targetYear: number
    categoryOverrides?: Array<{
      month: number
      day: number
      category: number
    }>
    skipExisting?: boolean
  }
) {
  if (input.sourceYear === input.targetYear) {
    throw new HolidayValidationError("Source and target year must differ")
  }

  // Build category override map keyed by "MM-DD"
  const overrideMap = new Map<string, number>()
  if (input.categoryOverrides) {
    for (const override of input.categoryOverrides) {
      const key = `${String(override.month).padStart(2, "0")}-${String(override.day).padStart(2, "0")}`
      overrideMap.set(key, override.category)
    }
  }

  // Load source year holidays
  const source = await repo.findByYearRange(prisma, tenantId, input.sourceYear)

  if (source.length === 0) {
    throw new HolidayValidationError("No holidays found for source year")
  }

  // Load target year existing holidays
  const existingTarget = await repo.findByYearRange(
    prisma,
    tenantId,
    input.targetYear
  )
  const existingByDate = new Set(
    existingTarget.map((h) => dateKey(h.holidayDate))
  )

  // Build records to copy
  const records: Array<{
    tenantId: string
    holidayDate: Date
    name: string
    holidayCategory: number
    appliesToAll: boolean
    departmentId: string | null
  }> = []

  for (const src of source) {
    const targetDate = dateWithYear(input.targetYear, src.holidayDate)
    if (!targetDate) {
      continue // Skip invalid dates (e.g., Feb 29 in non-leap year)
    }

    const key = dateKey(targetDate)
    if (input.skipExisting && existingByDate.has(key)) {
      continue
    }

    // Apply category override if present
    const monthDay = `${String(targetDate.getUTCMonth() + 1).padStart(2, "0")}-${String(targetDate.getUTCDate()).padStart(2, "0")}`
    const category = overrideMap.get(monthDay) ?? src.holidayCategory

    records.push({
      tenantId,
      holidayDate: normalizeDate(targetDate),
      name: src.name,
      holidayCategory: category,
      appliesToAll: src.appliesToAll,
      departmentId: src.departmentId,
    })
  }

  if (records.length === 0) return []

  await prisma.holiday.createMany({ data: records })

  // Fetch the created records to return them
  const createdDates = records.map((r) => r.holidayDate)
  const copied = await prisma.holiday.findMany({
    where: {
      tenantId,
      holidayDate: { in: createdDates },
    },
    orderBy: { holidayDate: "asc" },
  })

  return copied
}
