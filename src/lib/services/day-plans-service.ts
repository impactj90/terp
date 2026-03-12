/**
 * Day Plans Service
 *
 * Business logic for day plan operations, including break and bonus
 * sub-entity management and copy operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./day-plans-repository"

// --- Error Classes ---

export class DayPlanNotFoundError extends Error {
  constructor(message = "Day plan not found") {
    super(message)
    this.name = "DayPlanNotFoundError"
  }
}

export class DayPlanValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DayPlanValidationError"
  }
}

export class DayPlanConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DayPlanConflictError"
  }
}

export class BreakNotFoundError extends Error {
  constructor(message = "Break not found") {
    super(message)
    this.name = "BreakNotFoundError"
  }
}

export class BonusNotFoundError extends Error {
  constructor(message = "Bonus not found") {
    super(message)
    this.name = "BonusNotFoundError"
  }
}

// --- Constants ---

const RESERVED_CODES = ["U", "K", "S"]

// --- Helpers ---

/**
 * Checks if a day plan code is reserved (case-insensitive).
 * Reserved codes: U, K, S
 */
function isReservedCode(code: string): boolean {
  return RESERVED_CODES.includes(code.toUpperCase())
}

/**
 * Normalizes fields for flextime plans per ZMI Section 6.2.
 * When planType is "flextime", zeros out toleranceComePlus,
 * toleranceGoMinus, and variableWorkTime.
 */
function normalizeFlextimeFields(
  data: Record<string, unknown>,
  planType: string
): void {
  if (planType === "flextime") {
    data.toleranceComePlus = 0
    data.toleranceGoMinus = 0
    data.variableWorkTime = false
  }
}

/**
 * Validates break configuration based on break type.
 * - fixed: requires startTime and endTime, startTime < endTime
 * - minimum: requires afterWorkMinutes
 * - variable: no time requirements
 * - All types: duration > 0 (enforced by Zod schema)
 */
function validateBreak(
  breakType: string,
  startTime: number | undefined,
  endTime: number | undefined,
  afterWorkMinutes: number | undefined
): void {
  if (breakType === "fixed") {
    if (startTime === undefined || endTime === undefined) {
      throw new DayPlanValidationError(
        "Fixed break requires start time and end time"
      )
    }
    if (startTime >= endTime) {
      throw new DayPlanValidationError(
        "Break start time must be before end time"
      )
    }
  }

  if (breakType === "minimum") {
    if (afterWorkMinutes === undefined) {
      throw new DayPlanValidationError(
        "Minimum break requires after work minutes"
      )
    }
  }
}

/**
 * Validates bonus configuration.
 * - timeFrom < timeTo
 * - valueMinutes > 0 (enforced by Zod schema)
 */
function validateBonus(timeFrom: number, timeTo: number): void {
  if (timeFrom >= timeTo) {
    throw new DayPlanValidationError(
      "Bonus time from must be before time to"
    )
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; planType?: string }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const plan = await repo.findById(prisma, tenantId, id)
  if (!plan) {
    throw new DayPlanNotFoundError()
  }
  return plan
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    planType?: string
    comeFrom?: number
    comeTo?: number
    goFrom?: number
    goTo?: number
    coreStart?: number
    coreEnd?: number
    regularHours?: number
    regularHours2?: number
    fromEmployeeMaster?: boolean
    toleranceComePlus?: number
    toleranceComeMinus?: number
    toleranceGoPlus?: number
    toleranceGoMinus?: number
    variableWorkTime?: boolean
    roundingComeType?: string
    roundingComeInterval?: number
    roundingGoType?: string
    roundingGoInterval?: number
    minWorkTime?: number
    maxNetWorkTime?: number
    roundAllBookings?: boolean
    roundingComeAddValue?: number
    roundingGoAddValue?: number
    holidayCreditCat1?: number
    holidayCreditCat2?: number
    holidayCreditCat3?: number
    vacationDeduction?: number
    noBookingBehavior?: string
    dayChangeBehavior?: string
    shiftDetectArriveFrom?: number
    shiftDetectArriveTo?: number
    shiftDetectDepartFrom?: number
    shiftDetectDepartTo?: number
    shiftAltPlan1?: string
    shiftAltPlan2?: string
    shiftAltPlan3?: string
    shiftAltPlan4?: string
    shiftAltPlan5?: string
    shiftAltPlan6?: string
    netAccountId?: string
    capAccountId?: string
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new DayPlanValidationError("Day plan code is required")
  }

  // Check reserved codes
  if (isReservedCode(code)) {
    throw new DayPlanValidationError("Day plan code is reserved")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new DayPlanValidationError("Day plan name is required")
  }

  // Validate regularHours
  const regularHours = input.regularHours ?? 480
  if (regularHours <= 0) {
    throw new DayPlanValidationError("Regular hours must be positive")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new DayPlanConflictError("Day plan code already exists")
  }

  // Trim description
  const description = input.description?.trim() || null

  // Build create data
  const planType = input.planType || "fixed"
  const data: Record<string, unknown> = {
    tenantId,
    code,
    name,
    description,
    planType,
    regularHours,
    isActive: true,
    comeFrom: input.comeFrom,
    comeTo: input.comeTo,
    goFrom: input.goFrom,
    goTo: input.goTo,
    coreStart: input.coreStart,
    coreEnd: input.coreEnd,
    regularHours2: input.regularHours2,
    fromEmployeeMaster: input.fromEmployeeMaster ?? false,
    toleranceComePlus: input.toleranceComePlus ?? 0,
    toleranceComeMinus: input.toleranceComeMinus ?? 0,
    toleranceGoPlus: input.toleranceGoPlus ?? 0,
    toleranceGoMinus: input.toleranceGoMinus ?? 0,
    variableWorkTime: input.variableWorkTime ?? false,
    roundingComeType: input.roundingComeType,
    roundingComeInterval: input.roundingComeInterval,
    roundingGoType: input.roundingGoType,
    roundingGoInterval: input.roundingGoInterval,
    minWorkTime: input.minWorkTime,
    maxNetWorkTime: input.maxNetWorkTime,
    roundAllBookings: input.roundAllBookings ?? false,
    roundingComeAddValue: input.roundingComeAddValue,
    roundingGoAddValue: input.roundingGoAddValue,
    holidayCreditCat1: input.holidayCreditCat1,
    holidayCreditCat2: input.holidayCreditCat2,
    holidayCreditCat3: input.holidayCreditCat3,
    vacationDeduction:
      input.vacationDeduction !== undefined
        ? new Prisma.Decimal(input.vacationDeduction)
        : new Prisma.Decimal(1.0),
    noBookingBehavior: input.noBookingBehavior || "error",
    dayChangeBehavior: input.dayChangeBehavior || "none",
    shiftDetectArriveFrom: input.shiftDetectArriveFrom,
    shiftDetectArriveTo: input.shiftDetectArriveTo,
    shiftDetectDepartFrom: input.shiftDetectDepartFrom,
    shiftDetectDepartTo: input.shiftDetectDepartTo,
    shiftAltPlan1: input.shiftAltPlan1,
    shiftAltPlan2: input.shiftAltPlan2,
    shiftAltPlan3: input.shiftAltPlan3,
    shiftAltPlan4: input.shiftAltPlan4,
    shiftAltPlan5: input.shiftAltPlan5,
    shiftAltPlan6: input.shiftAltPlan6,
    netAccountId: input.netAccountId,
    capAccountId: input.capAccountId,
  }

  // Apply flextime normalization
  normalizeFlextimeFields(data, planType)

  const created = await repo.create(prisma, data)

  // Re-fetch with detail include
  return repo.findByIdWithDetail(prisma, created.id)
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    description?: string | null
    planType?: string
    comeFrom?: number | null
    comeTo?: number | null
    goFrom?: number | null
    goTo?: number | null
    coreStart?: number | null
    coreEnd?: number | null
    regularHours?: number
    regularHours2?: number | null
    fromEmployeeMaster?: boolean
    toleranceComePlus?: number
    toleranceComeMinus?: number
    toleranceGoPlus?: number
    toleranceGoMinus?: number
    variableWorkTime?: boolean
    roundingComeType?: string | null
    roundingComeInterval?: number | null
    roundingGoType?: string | null
    roundingGoInterval?: number | null
    minWorkTime?: number | null
    maxNetWorkTime?: number | null
    roundAllBookings?: boolean
    roundingComeAddValue?: number | null
    roundingGoAddValue?: number | null
    holidayCreditCat1?: number | null
    holidayCreditCat2?: number | null
    holidayCreditCat3?: number | null
    vacationDeduction?: number
    noBookingBehavior?: string
    dayChangeBehavior?: string
    shiftDetectArriveFrom?: number | null
    shiftDetectArriveTo?: number | null
    shiftDetectDepartFrom?: number | null
    shiftDetectDepartTo?: number | null
    shiftAltPlan1?: string | null
    shiftAltPlan2?: string | null
    shiftAltPlan3?: string | null
    shiftAltPlan4?: string | null
    shiftAltPlan5?: string | null
    shiftAltPlan6?: string | null
    netAccountId?: string | null
    capAccountId?: string | null
    isActive?: boolean
  }
) {
  // Verify day plan exists (tenant-scoped)
  const existing = await repo.findByIdBasic(prisma, tenantId, input.id)
  if (!existing) {
    throw new DayPlanNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new DayPlanValidationError("Day plan code is required")
    }
    if (isReservedCode(code)) {
      throw new DayPlanValidationError("Day plan code is reserved")
    }
    // Check uniqueness if changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCodeExcluding(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new DayPlanConflictError("Day plan code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new DayPlanValidationError("Day plan name is required")
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle planType update
  if (input.planType !== undefined) {
    data.planType = input.planType
  }

  // Handle nullable integer fields
  const nullableIntFields = [
    "comeFrom",
    "comeTo",
    "goFrom",
    "goTo",
    "coreStart",
    "coreEnd",
    "regularHours2",
    "roundingComeInterval",
    "roundingGoInterval",
    "minWorkTime",
    "maxNetWorkTime",
    "roundingComeAddValue",
    "roundingGoAddValue",
    "holidayCreditCat1",
    "holidayCreditCat2",
    "holidayCreditCat3",
    "shiftDetectArriveFrom",
    "shiftDetectArriveTo",
    "shiftDetectDepartFrom",
    "shiftDetectDepartTo",
  ] as const

  for (const field of nullableIntFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  // Handle non-nullable integer fields
  if (input.regularHours !== undefined) {
    if (input.regularHours <= 0) {
      throw new DayPlanValidationError("Regular hours must be positive")
    }
    data.regularHours = input.regularHours
  }

  if (input.toleranceComePlus !== undefined) {
    data.toleranceComePlus = input.toleranceComePlus
  }
  if (input.toleranceComeMinus !== undefined) {
    data.toleranceComeMinus = input.toleranceComeMinus
  }
  if (input.toleranceGoPlus !== undefined) {
    data.toleranceGoPlus = input.toleranceGoPlus
  }
  if (input.toleranceGoMinus !== undefined) {
    data.toleranceGoMinus = input.toleranceGoMinus
  }

  // Handle boolean fields
  if (input.fromEmployeeMaster !== undefined) {
    data.fromEmployeeMaster = input.fromEmployeeMaster
  }
  if (input.variableWorkTime !== undefined) {
    data.variableWorkTime = input.variableWorkTime
  }
  if (input.roundAllBookings !== undefined) {
    data.roundAllBookings = input.roundAllBookings
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  // Handle nullable string fields
  if (input.roundingComeType !== undefined) {
    data.roundingComeType = input.roundingComeType
  }
  if (input.roundingGoType !== undefined) {
    data.roundingGoType = input.roundingGoType
  }
  if (input.noBookingBehavior !== undefined) {
    data.noBookingBehavior = input.noBookingBehavior
  }
  if (input.dayChangeBehavior !== undefined) {
    data.dayChangeBehavior = input.dayChangeBehavior
  }

  // Handle nullable UUID fields
  const nullableUuidFields = [
    "shiftAltPlan1",
    "shiftAltPlan2",
    "shiftAltPlan3",
    "shiftAltPlan4",
    "shiftAltPlan5",
    "shiftAltPlan6",
    "netAccountId",
    "capAccountId",
  ] as const

  for (const field of nullableUuidFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  // Handle vacationDeduction
  if (input.vacationDeduction !== undefined) {
    data.vacationDeduction = new Prisma.Decimal(input.vacationDeduction)
  }

  // Determine effective planType for normalization
  const effectivePlanType =
    (data.planType as string) || existing.planType
  normalizeFlextimeFields(data, effectivePlanType)

  await repo.update(prisma, tenantId, input.id, data)

  // Re-fetch with detail include
  return repo.findByIdWithDetail(prisma, input.id)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify day plan exists (tenant-scoped)
  const existing = await repo.findByIdBasic(prisma, tenantId, id)
  if (!existing) {
    throw new DayPlanNotFoundError()
  }

  // Check if any week plans reference this day plan
  const count = await repo.countWeekPlanUsages(prisma, id)
  if (count > 0) {
    throw new DayPlanValidationError(
      "Cannot delete day plan that is referenced by week plans"
    )
  }

  // Hard delete (breaks and bonuses cascade via FK)
  await repo.deleteById(prisma, tenantId, id)
}

export async function copy(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    newCode: string
    newName: string
  }
) {
  // Trim and validate newCode
  const newCode = input.newCode.trim()
  if (newCode.length === 0) {
    throw new DayPlanValidationError("New code is required")
  }
  if (isReservedCode(newCode)) {
    throw new DayPlanValidationError("Day plan code is reserved")
  }

  // Trim and validate newName
  const newName = input.newName.trim()
  if (newName.length === 0) {
    throw new DayPlanValidationError("New name is required")
  }

  // Fetch original with details
  const original = await repo.findById(prisma, tenantId, input.id)
  if (!original) {
    throw new DayPlanNotFoundError()
  }

  // Check code uniqueness
  const existingByCode = await repo.findByCode(prisma, tenantId, newCode)
  if (existingByCode) {
    throw new DayPlanConflictError("Day plan code already exists")
  }

  // Create copy with all fields except id, code, name, timestamps
  const copiedPlan = await repo.create(prisma, {
    tenantId,
    code: newCode,
    name: newName,
    description: original.description,
    planType: original.planType,
    comeFrom: original.comeFrom,
    comeTo: original.comeTo,
    goFrom: original.goFrom,
    goTo: original.goTo,
    coreStart: original.coreStart,
    coreEnd: original.coreEnd,
    regularHours: original.regularHours,
    regularHours2: original.regularHours2,
    fromEmployeeMaster: original.fromEmployeeMaster,
    toleranceComePlus: original.toleranceComePlus,
    toleranceComeMinus: original.toleranceComeMinus,
    toleranceGoPlus: original.toleranceGoPlus,
    toleranceGoMinus: original.toleranceGoMinus,
    roundingComeType: original.roundingComeType,
    roundingComeInterval: original.roundingComeInterval,
    roundingGoType: original.roundingGoType,
    roundingGoInterval: original.roundingGoInterval,
    minWorkTime: original.minWorkTime,
    maxNetWorkTime: original.maxNetWorkTime,
    variableWorkTime: original.variableWorkTime,
    roundAllBookings: original.roundAllBookings,
    roundingComeAddValue: original.roundingComeAddValue,
    roundingGoAddValue: original.roundingGoAddValue,
    holidayCreditCat1: original.holidayCreditCat1,
    holidayCreditCat2: original.holidayCreditCat2,
    holidayCreditCat3: original.holidayCreditCat3,
    vacationDeduction: original.vacationDeduction,
    noBookingBehavior: original.noBookingBehavior,
    dayChangeBehavior: original.dayChangeBehavior,
    shiftDetectArriveFrom: original.shiftDetectArriveFrom,
    shiftDetectArriveTo: original.shiftDetectArriveTo,
    shiftDetectDepartFrom: original.shiftDetectDepartFrom,
    shiftDetectDepartTo: original.shiftDetectDepartTo,
    shiftAltPlan1: original.shiftAltPlan1,
    shiftAltPlan2: original.shiftAltPlan2,
    shiftAltPlan3: original.shiftAltPlan3,
    shiftAltPlan4: original.shiftAltPlan4,
    shiftAltPlan5: original.shiftAltPlan5,
    shiftAltPlan6: original.shiftAltPlan6,
    netAccountId: original.netAccountId,
    capAccountId: original.capAccountId,
    isActive: original.isActive,
  })

  // Copy breaks
  for (const brk of original.breaks) {
    await repo.createBreak(prisma, {
      dayPlanId: copiedPlan.id,
      breakType: brk.breakType,
      startTime: brk.startTime,
      endTime: brk.endTime,
      duration: brk.duration,
      afterWorkMinutes: brk.afterWorkMinutes,
      autoDeduct: brk.autoDeduct,
      isPaid: brk.isPaid,
      minutesDifference: brk.minutesDifference,
      sortOrder: brk.sortOrder,
    })
  }

  // Copy bonuses
  for (const bonus of original.bonuses) {
    await repo.createBonus(prisma, {
      dayPlanId: copiedPlan.id,
      accountId: bonus.accountId,
      timeFrom: bonus.timeFrom,
      timeTo: bonus.timeTo,
      calculationType: bonus.calculationType,
      valueMinutes: bonus.valueMinutes,
      minWorkMinutes: bonus.minWorkMinutes,
      appliesOnHoliday: bonus.appliesOnHoliday,
      sortOrder: bonus.sortOrder,
    })
  }

  // Re-fetch with detail include
  return repo.findByIdWithDetail(prisma, copiedPlan.id)
}

export async function createBreak(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    dayPlanId: string
    breakType: string
    startTime?: number
    endTime?: number
    duration: number
    afterWorkMinutes?: number
    autoDeduct?: boolean
    isPaid?: boolean
    minutesDifference?: boolean
    sortOrder?: number
  }
) {
  // Verify parent day plan exists and belongs to tenant
  const dayPlan = await repo.findByIdBasic(prisma, tenantId, input.dayPlanId)
  if (!dayPlan) {
    throw new DayPlanNotFoundError()
  }

  // Validate break config
  validateBreak(
    input.breakType,
    input.startTime,
    input.endTime,
    input.afterWorkMinutes
  )

  return repo.createBreak(prisma, {
    dayPlanId: input.dayPlanId,
    breakType: input.breakType,
    startTime: input.startTime,
    endTime: input.endTime,
    duration: input.duration,
    afterWorkMinutes: input.afterWorkMinutes,
    autoDeduct: input.autoDeduct ?? true,
    isPaid: input.isPaid ?? false,
    minutesDifference: input.minutesDifference ?? false,
    sortOrder: input.sortOrder ?? 0,
  })
}

export async function removeBreak(
  prisma: PrismaClient,
  tenantId: string,
  input: { dayPlanId: string; breakId: string }
) {
  // Verify parent day plan exists and belongs to tenant
  const dayPlan = await repo.findByIdBasic(prisma, tenantId, input.dayPlanId)
  if (!dayPlan) {
    throw new DayPlanNotFoundError()
  }

  // Verify break exists and belongs to the day plan
  const brk = await repo.findBreakById(prisma, input.breakId, input.dayPlanId)
  if (!brk) {
    throw new BreakNotFoundError()
  }

  await repo.deleteBreak(prisma, input.breakId)
}

export async function createBonusFn(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    dayPlanId: string
    accountId: string
    timeFrom: number
    timeTo: number
    calculationType: string
    valueMinutes: number
    minWorkMinutes?: number
    appliesOnHoliday?: boolean
    sortOrder?: number
  }
) {
  // Verify parent day plan exists and belongs to tenant
  const dayPlan = await repo.findByIdBasic(prisma, tenantId, input.dayPlanId)
  if (!dayPlan) {
    throw new DayPlanNotFoundError()
  }

  // Validate bonus
  validateBonus(input.timeFrom, input.timeTo)

  return repo.createBonus(prisma, {
    dayPlanId: input.dayPlanId,
    accountId: input.accountId,
    timeFrom: input.timeFrom,
    timeTo: input.timeTo,
    calculationType: input.calculationType,
    valueMinutes: input.valueMinutes,
    minWorkMinutes: input.minWorkMinutes,
    appliesOnHoliday: input.appliesOnHoliday ?? false,
    sortOrder: input.sortOrder ?? 0,
  })
}

export async function removeBonus(
  prisma: PrismaClient,
  tenantId: string,
  input: { dayPlanId: string; bonusId: string }
) {
  // Verify parent day plan exists and belongs to tenant
  const dayPlan = await repo.findByIdBasic(prisma, tenantId, input.dayPlanId)
  if (!dayPlan) {
    throw new DayPlanNotFoundError()
  }

  // Verify bonus exists and belongs to the day plan
  const bonus = await repo.findBonusById(
    prisma,
    input.bonusId,
    input.dayPlanId
  )
  if (!bonus) {
    throw new BonusNotFoundError()
  }

  await repo.deleteBonus(prisma, input.bonusId)
}
