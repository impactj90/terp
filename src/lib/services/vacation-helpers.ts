/**
 * Vacation Resolution Helpers
 *
 * Shared helpers for resolving tariff, calculation group, vacation basis,
 * building calculation input, and computing available balance.
 *
 * These are used by both the vacation preview procedures and the
 * business logic mutations (initializeYear, carryoverFromPreviousYear, etc.).
 *
 * Ported from: apps/api/internal/service/vacation.go (lines 297-423)
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import type {
  VacationBasis,
  VacationSpecialCalc,
  VacationCalcInput,
} from "./vacation-calculation"

// --- Types ---

export interface ResolvedCalcGroup {
  id: string
  name: string
  basis: string
  specialCalcLinks: Array<{
    specialCalculation: {
      type: string
      threshold: number
      bonusDays: Prisma.Decimal
    }
  }>
}

export interface BuildCalcInputResult {
  calcInput: VacationCalcInput
  weeklyHours: number
  standardWeeklyHours: number
  baseVacationDays: number
}

// --- Helpers ---

function decimalToNumber(val: Prisma.Decimal | null | undefined): number {
  if (val === null || val === undefined) return 0
  return Number(val)
}

// --- Exported Functions ---

/**
 * Resolves the effective tariff for an employee in a given year.
 *
 * Resolution order:
 *   1. Active EmployeeTariffAssignment (most recent effectiveFrom)
 *   2. Fallback to employee.tariffId
 *
 * Port of Go VacationService.resolveTariff() (vacation.go lines 327-347)
 */
export async function resolveTariff(
  prisma: PrismaClient,
  employee: { id: string; tariffId: string | null },
  year: number,
  tenantId: string
) {
  // Use end-of-year for past years so mid-year assignments are found.
  // For current/future years, use today so not-yet-started assignments are excluded.
  let refDate = new Date(Date.UTC(year, 11, 31))
  const now = new Date()
  if (refDate > now) {
    refDate = now
  }

  // Priority 1: Active tariff assignment
  const assignment = await prisma.employeeTariffAssignment.findFirst({
    where: {
      employeeId: employee.id,
      tenantId,
      isActive: true,
      effectiveFrom: { lte: refDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: refDate } },
      ],
    },
    include: { tariff: true },
    orderBy: { effectiveFrom: "desc" },
  })

  if (assignment?.tariff) {
    return assignment.tariff
  }

  // Priority 2: Fallback to employee.tariffId
  if (employee.tariffId) {
    const tariff = await prisma.tariff.findFirst({
      where: { id: employee.tariffId, tenantId },
    })
    if (tariff) {
      return tariff
    }
  }

  return null
}

/**
 * Resolves the vacation calculation group for an employee.
 *
 * Resolution: employee -> employmentType -> vacationCalcGroupId -> VacationCalculationGroup
 *
 * Port of Go VacationService.resolveCalcGroup() (vacation.go lines 297-323)
 */
export async function resolveCalcGroup(
  prisma: PrismaClient,
  employee: {
    employmentType?: { vacationCalcGroupId: string | null } | null
  },
  tenantId: string
): Promise<ResolvedCalcGroup | null> {
  if (!employee.employmentType?.vacationCalcGroupId) {
    return null
  }

  const group = await prisma.vacationCalculationGroup.findFirst({
    where: {
      id: employee.employmentType.vacationCalcGroupId,
      tenantId,
    },
    include: {
      specialCalcLinks: {
        include: {
          specialCalculation: {
            select: { type: true, threshold: true, bonusDays: true },
          },
        },
      },
    },
  })

  return group as ResolvedCalcGroup | null
}

/**
 * Resolves the vacation basis from the resolution chain.
 *
 * Resolution chain (later overrides earlier):
 *   default "calendar_year" -> tenant.vacationBasis -> tariff.vacationBasis -> calcGroup.basis
 *
 * Port of Go resolveVacationBasisFromTariff() (vacation.go lines 412-423) + calc group override
 */
export async function resolveVacationBasis(
  prisma: PrismaClient,
  employee: { tenantId?: string },
  tariff: { vacationBasis?: string | null } | null,
  calcGroup: { basis?: string } | null,
  tenantId: string
): Promise<VacationBasis> {
  // Default
  let basis: VacationBasis = "calendar_year"

  // Tenant-level override
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { vacationBasis: true },
  })
  if (tenant?.vacationBasis) {
    basis = tenant.vacationBasis as VacationBasis
  }

  // Tariff-level override
  if (tariff?.vacationBasis) {
    basis = tariff.vacationBasis as VacationBasis
  }

  // Calc group override (highest priority)
  if (calcGroup?.basis) {
    basis = calcGroup.basis as VacationBasis
  }

  return basis
}

/**
 * Builds a VacationCalcInput from resolved employee, tariff, calc group, and basis data.
 * Pure function (no Prisma calls).
 *
 * Port of Go buildCalcInput() (vacation.go lines 350-410)
 */
export function buildCalcInput(
  employee: {
    birthDate: Date | null
    entryDate: Date
    exitDate: Date | null
    weeklyHours: Prisma.Decimal | number | null
    vacationDaysPerYear: Prisma.Decimal | number | null
    disabilityFlag: boolean
  },
  year: number,
  tariff: {
    weeklyTargetHours?: Prisma.Decimal | null
    annualVacationDays?: Prisma.Decimal | null
  } | null,
  calcGroup: ResolvedCalcGroup | null,
  basis: VacationBasis
): BuildCalcInputResult {
  const weeklyHours = typeof employee.weeklyHours === "number"
    ? employee.weeklyHours
    : decimalToNumber(employee.weeklyHours as Prisma.Decimal | null)

  let baseVacationDays = typeof employee.vacationDaysPerYear === "number"
    ? employee.vacationDaysPerYear
    : decimalToNumber(employee.vacationDaysPerYear as Prisma.Decimal | null)

  // Apply tariff values
  let standardWeeklyHours = 40 // Default
  if (tariff) {
    if (tariff.weeklyTargetHours && Number(tariff.weeklyTargetHours) > 0) {
      standardWeeklyHours = Number(tariff.weeklyTargetHours)
    }
    if (tariff.annualVacationDays && Number(tariff.annualVacationDays) > 0) {
      baseVacationDays = Number(tariff.annualVacationDays)
    }
  }

  // Set reference date based on basis
  const referenceDate =
    basis === "entry_date"
      ? new Date(
          Date.UTC(
            year,
            employee.entryDate.getMonth(),
            employee.entryDate.getDate()
          )
        )
      : new Date(Date.UTC(year, 0, 1))

  // Build special calcs from calc group links
  const specialCalcs: VacationSpecialCalc[] =
    calcGroup?.specialCalcLinks.map((link) => ({
      type: link.specialCalculation.type as VacationSpecialCalc["type"],
      threshold: link.specialCalculation.threshold,
      bonusDays: decimalToNumber(link.specialCalculation.bonusDays),
    })) ?? []

  const calcInput: VacationCalcInput = {
    birthDate: employee.birthDate ?? new Date(Date.UTC(1990, 0, 1)),
    entryDate: employee.entryDate,
    exitDate: employee.exitDate,
    weeklyHours,
    hasDisability: employee.disabilityFlag,
    baseVacationDays,
    standardWeeklyHours,
    basis,
    specialCalcs,
    year,
    referenceDate,
  }

  return {
    calcInput,
    weeklyHours,
    standardWeeklyHours,
    baseVacationDays,
  }
}

/**
 * Computes the available vacation days from a balance record.
 * available = entitlement + carryover + adjustments - taken
 *
 * Port of Go VacationBalance.Available() computed property.
 */
export function calculateAvailable(balance: {
  entitlement: Prisma.Decimal | number
  carryover: Prisma.Decimal | number
  adjustments: Prisma.Decimal | number
  taken: Prisma.Decimal | number
}): number {
  const entitlement = typeof balance.entitlement === "number"
    ? balance.entitlement
    : Number(balance.entitlement)
  const carryover = typeof balance.carryover === "number"
    ? balance.carryover
    : Number(balance.carryover)
  const adjustments = typeof balance.adjustments === "number"
    ? balance.adjustments
    : Number(balance.adjustments)
  const taken = typeof balance.taken === "number"
    ? balance.taken
    : Number(balance.taken)

  return entitlement + carryover + adjustments - taken
}
