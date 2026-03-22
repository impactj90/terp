/**
 * Vacation Service
 *
 * Business logic for vacation entitlement/carryover previews, balance
 * initialization, adjustment, and batch operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import { calculateVacation } from "./vacation-calculation"
import {
  calculateCarryoverWithCapping,
  calculateCarryover,
  type CarryoverInput,
  type CappingRuleInput,
  type CappingExceptionInput,
} from "./carryover-calculation"
import {
  resolveTariff,
  resolveCalcGroup,
  resolveVacationBasis,
  buildCalcInput,
  calculateAvailable,
  type ResolvedCalcGroup,
} from "./vacation-helpers"
import { decimalToNumber, mapBalanceToOutput } from "./vacation-balance-output"
import * as repo from "./vacation-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext, AuditLogCreateInput } from "./audit-logs-service"

// --- Audit Constants ---

const ENTITY_TYPE = "vacation_balance"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor(message = "Employee not found") {
    super(message)
    this.name = "EmployeeNotFoundError"
  }
}

export class VacationBalanceNotFoundError extends Error {
  constructor(message = "Vacation balance not found") {
    super(message)
    this.name = "VacationBalanceNotFoundError"
  }
}

export class VacationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VacationValidationError"
  }
}

// --- Internal Helpers ---

/**
 * Calculates capped carryover using tariff capping rules (advanced) or simple cap (fallback).
 * Port of Go VacationService.calculateCappedCarryover() (vacation.go lines 521-576)
 */
async function calculateCappedCarryover(
  prisma: PrismaClient,
  tenantId: string,
  employee: { id: string; tariffId: string | null },
  prevYear: number,
  available: number,
  defaultMaxCarryover: number = 0,
  prefetched?: {
    tariff?: { vacationCappingRuleGroupId: string | null; [key: string]: unknown } | null
    cappingGroup?: Awaited<ReturnType<typeof repo.findCappingGroupWithRules>> | null
    exceptions?: Awaited<ReturnType<typeof repo.findCappingExceptions>>
  }
): Promise<number> {
  // Resolve tariff for previous year (use pre-fetched if available)
  const tariff = prefetched?.tariff !== undefined
    ? prefetched.tariff
    : await resolveTariff(prisma, employee, prevYear, tenantId)

  // If tariff has capping rule group, use advanced capping
  if (tariff?.vacationCappingRuleGroupId) {
    const cappingGroup = prefetched?.cappingGroup !== undefined
      ? prefetched.cappingGroup
      : await repo.findCappingGroupWithRules(
          prisma,
          tenantId,
          tariff.vacationCappingRuleGroupId
        )

    if (cappingGroup) {
      // Build capping rules
      const cappingRules: CappingRuleInput[] =
        cappingGroup.cappingRuleLinks.map((link) => ({
          ruleId: link.cappingRule.id,
          ruleName: link.cappingRule.name,
          ruleType: link.cappingRule.ruleType as "year_end" | "mid_year",
          cutoffMonth: link.cappingRule.cutoffMonth,
          cutoffDay: link.cappingRule.cutoffDay,
          capValue: decimalToNumber(link.cappingRule.capValue),
        }))

      // Load employee exceptions (use pre-fetched if available)
      const exceptions = prefetched?.exceptions !== undefined
        ? prefetched.exceptions
        : await repo.findCappingExceptions(
            prisma,
            tenantId,
            employee.id,
            prevYear
          )

      const exceptionsInput: CappingExceptionInput[] = exceptions.map(
        (exc) => ({
          cappingRuleId: exc.cappingRuleId,
          exemptionType: exc.exemptionType as "full" | "partial",
          retainDays: exc.retainDays ? Number(exc.retainDays) : null,
        })
      )

      // Build carryover input
      const carryoverInput: CarryoverInput = {
        availableDays: available,
        year: prevYear,
        referenceDate: new Date(),
        cappingRules,
        exceptions: exceptionsInput,
      }

      const output = calculateCarryoverWithCapping(carryoverInput)
      return output.cappedCarryover
    }
  }

  // Fallback: simple carryover with defaultMaxCarryover
  return calculateCarryover(available, defaultMaxCarryover)
}

// --- Service Functions ---

/**
 * Computes vacation entitlement preview for an employee/year.
 *
 * Loads employee data, resolves calculation group (from override or employment type),
 * resolves tariff via tariff assignments, and runs the vacation calculation engine.
 */
export async function entitlementPreview(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    year: number
    calcGroupId?: string
  }
) {
  // Load employee with employment type
  const employee = await repo.findEmployeeWithEmploymentType(
    prisma,
    tenantId,
    input.employeeId
  )
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // Resolve calculation group
  let calcGroup: ResolvedCalcGroup | null = null

  if (input.calcGroupId) {
    // Use provided override
    calcGroup = (await repo.findCalcGroupById(
      prisma,
      tenantId,
      input.calcGroupId
    )) as ResolvedCalcGroup | null
  } else {
    // Resolve from employment type
    calcGroup = await resolveCalcGroup(prisma, employee, tenantId)
  }

  // Resolve tariff via tariff assignments (enhanced resolution)
  const tariff = await resolveTariff(prisma, employee, input.year, tenantId)

  // Resolve vacation basis via resolution chain
  const basis = await resolveVacationBasis(
    prisma,
    employee,
    tariff,
    calcGroup,
    tenantId
  )

  // Build calculation input using shared helper
  const { calcInput, weeklyHours, standardWeeklyHours } = buildCalcInput(
    employee,
    input.year,
    tariff,
    calcGroup,
    basis
  )

  // Run calculation
  const result = calculateVacation(calcInput)

  // Compute part-time factor
  const partTimeFactor =
    standardWeeklyHours > 0 ? weeklyHours / standardWeeklyHours : 1

  return {
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    year: input.year,
    basis,
    calcGroupId: calcGroup?.id ?? null,
    calcGroupName: calcGroup?.name ?? null,
    weeklyHours,
    standardWeeklyHours,
    partTimeFactor,
    baseEntitlement: result.baseEntitlement,
    proRatedEntitlement: result.proRatedEntitlement,
    partTimeAdjustment: result.partTimeAdjustment,
    ageBonus: result.ageBonus,
    tenureBonus: result.tenureBonus,
    disabilityBonus: result.disabilityBonus,
    totalEntitlement: result.totalEntitlement,
    monthsEmployed: result.monthsEmployed,
    ageAtReference: result.ageAtReference,
    tenureYears: result.tenureYears,
  }
}

/**
 * Computes vacation carryover preview for an employee/year.
 *
 * Loads employee tariff, capping rule group, vacation balance, and exceptions.
 * Runs the carryover calculation engine.
 */
export async function carryoverPreview(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    year: number
  }
) {
  // Load employee
  const employee = await repo.findEmployee(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // Get tariff (use tariff assignment resolution)
  const tariff = await resolveTariff(prisma, employee, input.year, tenantId)
  if (!tariff) {
    throw new VacationValidationError("Employee has no tariff assigned")
  }

  // Get capping rule group
  if (!tariff.vacationCappingRuleGroupId) {
    throw new VacationValidationError(
      "Tariff has no capping rule group assigned"
    )
  }

  const cappingGroup = await repo.findCappingGroupWithRules(
    prisma,
    tenantId,
    tariff.vacationCappingRuleGroupId
  )
  if (!cappingGroup) {
    throw new VacationValidationError("Capping rule group not found")
  }

  // Get vacation balance
  const balance = await repo.findBalance(
    prisma,
    tenantId,
    input.employeeId,
    input.year
  )

  // Calculate available days
  let availableDays = 0
  if (balance) {
    availableDays =
      decimalToNumber(balance.entitlement) +
      decimalToNumber(balance.carryover) +
      decimalToNumber(balance.adjustments) -
      decimalToNumber(balance.taken)
    availableDays = Math.max(0, availableDays)
  }

  // Load employee exceptions
  const exceptions = await repo.findCappingExceptions(
    prisma,
    tenantId,
    input.employeeId,
    input.year
  )

  // Build capping rules input
  const cappingRules: CappingRuleInput[] =
    cappingGroup.cappingRuleLinks.map((link) => ({
      ruleId: link.cappingRule.id,
      ruleName: link.cappingRule.name,
      ruleType: link.cappingRule.ruleType as "year_end" | "mid_year",
      cutoffMonth: link.cappingRule.cutoffMonth,
      cutoffDay: link.cappingRule.cutoffDay,
      capValue: decimalToNumber(link.cappingRule.capValue),
    }))

  // Build exceptions input
  const exceptionsInput: CappingExceptionInput[] = exceptions.map((exc) => ({
    cappingRuleId: exc.cappingRuleId,
    exemptionType: exc.exemptionType as "full" | "partial",
    retainDays: exc.retainDays ? Number(exc.retainDays) : null,
  }))

  // Build carryover input
  const carryoverInput: CarryoverInput = {
    availableDays,
    year: input.year,
    referenceDate: new Date(), // Use current date for mid-year rule evaluation
    cappingRules,
    exceptions: exceptionsInput,
  }

  // Run calculation
  const result = calculateCarryoverWithCapping(carryoverInput)

  return {
    employeeId: employee.id,
    year: input.year,
    availableDays: result.availableDays,
    cappedCarryover: result.cappedCarryover,
    forfeitedDays: result.forfeitedDays,
    hasException: result.hasException,
    rulesApplied: result.rulesApplied,
  }
}

/**
 * Retrieves vacation balance for an employee/year.
 *
 * Port of Go VacationService.GetBalance() (vacation.go lines 168-183)
 */
export async function getBalance(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    year: number
  }
) {
  const balance = await repo.findBalanceWithEmployee(
    prisma,
    tenantId,
    input.employeeId,
    input.year
  )

  if (!balance) {
    throw new VacationBalanceNotFoundError()
  }

  return mapBalanceToOutput(balance)
}

/**
 * Calculates and stores vacation entitlement for a year.
 *
 * Uses employee's employment type, tariff, and calc group to compute entitlement.
 * Idempotent: calling multiple times recalculates entitlement but preserves
 * carryover, adjustments, and taken.
 *
 * Port of Go VacationService.InitializeYear() (vacation.go lines 189-234)
 */
export async function initializeYear(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    year: number
  },
  audit?: AuditContext
) {
  // 1. Get employee with employment type
  const employee = await repo.findEmployeeWithEmploymentType(
    prisma,
    tenantId,
    input.employeeId
  )
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // 2. Resolve calculation group
  const calcGroup = await resolveCalcGroup(prisma, employee, tenantId)

  // 3. Resolve tariff
  const tariff = await resolveTariff(prisma, employee, input.year, tenantId)

  // 4. Resolve vacation basis
  const basis = await resolveVacationBasis(
    prisma,
    employee,
    tariff,
    calcGroup,
    tenantId
  )

  // 5. Build calculation input
  const { calcInput } = buildCalcInput(
    employee,
    input.year,
    tariff,
    calcGroup,
    basis
  )

  // 6. Calculate entitlement
  const result = calculateVacation(calcInput)

  // 7-8. Upsert balance with new entitlement (preserves carryover/adjustments/taken)
  const balance = await repo.upsertBalanceEntitlement(
    prisma,
    tenantId,
    input.employeeId,
    input.year,
    result.totalEntitlement
  )

  // Never throws — audit failures must not block the actual operation
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: ENTITY_TYPE,
      entityId: (balance as unknown as Record<string, unknown>).id as string,
      entityName: `${input.year}`,
      changes: null,
      metadata: { initialized: true },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err));
  }

  return mapBalanceToOutput(balance)
}

/**
 * Adds a manual adjustment to the vacation balance.
 *
 * The adjustment is accumulated (added to existing adjustments), not replaced.
 * A positive value adds days; a negative value deducts days.
 *
 * Port of Go VacationService.AdjustBalance() (vacation.go lines 498-517)
 */
export async function adjustBalance(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    year: number
    adjustment: number
    notes?: string
  },
  audit?: AuditContext
) {
  // Atomically increment adjustment; catch P2025 (record not found) to avoid
  // the check-then-update race where the balance could be deleted between the
  // existence check and the increment.
  try {
    const balance = await repo.incrementAdjustments(
      prisma,
      input.employeeId,
      input.year,
      input.adjustment
    )

    // Never throws — audit failures must not block the actual operation
    if (audit) {
      await auditLog.log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: ENTITY_TYPE,
        entityId: (balance as unknown as Record<string, unknown>).id as string,
        entityName: `${input.year}`,
        changes: null,
        metadata: { adjustment: input.adjustment, notes: input.notes },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err));
    }

    return mapBalanceToOutput(balance)
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new VacationBalanceNotFoundError()
    }
    throw err
  }
}

/**
 * Carries over remaining vacation from the previous year.
 *
 * The year parameter is the TARGET year (receiving the carryover).
 * Respects tariff capping rules when available, falling back to simple cap.
 *
 * Port of Go VacationService.CarryoverFromPreviousYear() (vacation.go lines 581-627)
 */
export async function carryoverFromPreviousYear(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    year: number
  },
  audit?: AuditContext
) {
  const prevYear = input.year - 1

  // 1. Get employee
  const employee = await repo.findEmployee(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // 2. Get previous year's balance
  const prevBalance = await repo.findBalance(
    prisma,
    tenantId,
    input.employeeId,
    prevYear
  )
  if (!prevBalance) {
    // No previous year balance - nothing to carry over
    return null
  }

  // 3. Calculate available
  const available = calculateAvailable(prevBalance)

  // 4. Calculate capped carryover
  const carryover = await calculateCappedCarryover(
    prisma,
    tenantId,
    employee,
    prevYear,
    available
  )

  // 5. If carryover is 0, return null
  if (carryover <= 0) {
    return null
  }

  // 6. Upsert current year balance with carryover (replaces, not accumulates)
  const balance = await repo.upsertBalanceCarryover(
    prisma,
    tenantId,
    input.employeeId,
    input.year,
    carryover
  )

  // Never throws — audit failures must not block the actual operation
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: (balance as unknown as Record<string, unknown>).id as string,
      entityName: `${input.year}`,
      changes: null,
      metadata: { carryover: true },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err));
  }

  return mapBalanceToOutput(balance)
}

/**
 * Initializes vacation balances for all active employees for a given year.
 *
 * Optionally carries over from the previous year before initializing.
 *
 * Port of Go VacationBalanceHandler.Initialize() (handler lines 217-268)
 */
export async function initializeBatch(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    year: number
    carryover: boolean
  },
  audit?: AuditContext
) {
  // 1. Get all active employees for tenant
  const employees = await repo.findActiveEmployees(prisma, tenantId)

  // Pre-fetch shared data to avoid N+1
  const empIds = employees.map((e) => e.id)
  const prevBalances = input.carryover && input.year >= 1901
    ? await prisma.vacationBalance.findMany({
        where: { tenantId, employeeId: { in: empIds }, year: input.year - 1 },
      })
    : []
  const prevBalanceMap = new Map(prevBalances.map((b) => [b.employeeId, b]))

  // Batch-fetch tenant vacationBasis once (same for all employees)
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { vacationBasis: true },
  })
  const tenantVacationBasis = tenant?.vacationBasis ?? null

  // Batch-fetch all unique calc groups referenced by employees
  const uniqueCalcGroupIds = [
    ...new Set(
      employees
        .map((e) => e.employmentType?.vacationCalcGroupId)
        .filter((id): id is string => !!id)
    ),
  ]
  const calcGroups =
    uniqueCalcGroupIds.length > 0
      ? await prisma.vacationCalculationGroup.findMany({
          where: { id: { in: uniqueCalcGroupIds }, tenantId },
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
      : []
  const calcGroupMap = new Map(calcGroups.map((g) => [g.id, g as ResolvedCalcGroup]))

  // Batch-fetch tariff assignments for all employees
  // Use end-of-year for past years, today for current/future years
  let tariffRefDate = new Date(Date.UTC(input.year, 11, 31))
  const now = new Date()
  if (tariffRefDate > now) {
    tariffRefDate = now
  }

  const tariffAssignments = await prisma.employeeTariffAssignment.findMany({
    where: {
      employeeId: { in: empIds },
      isActive: true,
      effectiveFrom: { lte: tariffRefDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: tariffRefDate } },
      ],
    },
    include: { tariff: true },
    orderBy: { effectiveFrom: "desc" },
  })
  // Group by employeeId, take the first (most recent) per employee
  const tariffAssignmentMap = new Map<string, (typeof tariffAssignments)[number]>()
  for (const ta of tariffAssignments) {
    if (!tariffAssignmentMap.has(ta.employeeId)) {
      tariffAssignmentMap.set(ta.employeeId, ta)
    }
  }

  // Batch-fetch fallback tariffs for employees without assignments
  const fallbackTariffIds = [
    ...new Set(
      employees
        .filter((e) => !tariffAssignmentMap.has(e.id) && e.tariffId)
        .map((e) => e.tariffId!)
    ),
  ]
  const fallbackTariffs =
    fallbackTariffIds.length > 0
      ? await prisma.tariff.findMany({
          where: { id: { in: fallbackTariffIds }, tenantId },
        })
      : []
  const fallbackTariffMap = new Map(fallbackTariffs.map((t) => [t.id, t]))

  // Pre-fetch tariff assignments for PREVIOUS year (for carryover calculation)
  // The current year tariff pre-fetch above uses tariffRefDate = end of input.year.
  // Carryover needs tariffs as of end of (input.year - 1), which may differ.
  const prevYearTariffMap = new Map<string, typeof fallbackTariffs[number]>()
  const cappingGroupMap = new Map<string, NonNullable<Awaited<ReturnType<typeof repo.findCappingGroupWithRules>>>>()
  const exceptionsByEmployee = new Map<string, Awaited<ReturnType<typeof repo.findCappingExceptions>>>()

  if (input.carryover && input.year >= 1901) {
    let prevRefDate = new Date(Date.UTC(input.year - 1, 11, 31))
    if (prevRefDate > now) prevRefDate = now

    const prevAssignments = await prisma.employeeTariffAssignment.findMany({
      where: {
        employeeId: { in: empIds },
        isActive: true,
        effectiveFrom: { lte: prevRefDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: prevRefDate } }],
      },
      include: { tariff: true },
      orderBy: { effectiveFrom: "desc" },
    })
    for (const ta of prevAssignments) {
      if (!prevYearTariffMap.has(ta.employeeId) && ta.tariff) {
        prevYearTariffMap.set(ta.employeeId, ta.tariff)
      }
    }
    // Add fallback tariffs for employees without prevYear assignments
    for (const emp of employees) {
      if (!prevYearTariffMap.has(emp.id) && emp.tariffId) {
        const fb = fallbackTariffMap.get(emp.tariffId)
        if (fb) prevYearTariffMap.set(emp.id, fb)
      }
    }

    // Pre-fetch capping groups (usually 1-3 per tenant)
    const uniqueCappingGroupIds = [
      ...new Set(
        [...prevYearTariffMap.values()]
          .map((t) => t.vacationCappingRuleGroupId)
          .filter((id): id is string => !!id)
      ),
    ]
    if (uniqueCappingGroupIds.length > 0) {
      const cappingGroups = await prisma.vacationCappingRuleGroup.findMany({
        where: { id: { in: uniqueCappingGroupIds }, tenantId },
        include: {
          cappingRuleLinks: {
            include: { cappingRule: true },
          },
        },
      })
      for (const g of cappingGroups) {
        cappingGroupMap.set(g.id, g)
      }
    }

    // Pre-fetch all capping exceptions for all employees in prevYear
    const allExceptions = await prisma.employeeCappingException.findMany({
      where: {
        employeeId: { in: empIds },
        employee: { tenantId },
        isActive: true,
        OR: [{ year: input.year - 1 }, { year: null }],
      },
    })
    for (const exc of allExceptions) {
      const list = exceptionsByEmployee.get(exc.employeeId) ?? []
      list.push(exc)
      exceptionsByEmployee.set(exc.employeeId, list)
    }
  }

  let createdCount = 0
  const auditEntries: AuditLogCreateInput[] = []

  // 2. For each employee
  for (const employee of employees) {
    try {
      // a. If carryover requested, carry over from previous year (best effort)
      if (input.carryover && input.year >= 1901) {
        try {
          const prevBalance = prevBalanceMap.get(employee.id)
          if (prevBalance) {
            const available = calculateAvailable(prevBalance)
            const prevTariff = prevYearTariffMap.get(employee.id) ?? null
            const prevCappingGroup = prevTariff?.vacationCappingRuleGroupId
              ? cappingGroupMap.get(prevTariff.vacationCappingRuleGroupId) ?? null
              : null
            const prevExceptions = exceptionsByEmployee.get(employee.id) ?? []

            const carryoverAmount = await calculateCappedCarryover(
              prisma,
              tenantId,
              employee,
              input.year - 1,
              available,
              0,
              {
                tariff: prevTariff,
                cappingGroup: prevCappingGroup,
                exceptions: prevExceptions,
              }
            )
            if (carryoverAmount > 0) {
              await repo.upsertBalanceCarryoverSimple(
                prisma,
                tenantId,
                employee.id,
                input.year,
                carryoverAmount
              )
            }
          }
        } catch {
          // Best effort: skip carryover errors for individual employees
        }
      }

      // b. Initialize year (calculate entitlement) using pre-fetched data
      const calcGroupId = employee.employmentType?.vacationCalcGroupId
      const calcGroup = calcGroupId
        ? calcGroupMap.get(calcGroupId) ?? null
        : null

      // Resolve tariff from pre-fetched maps
      const assignment = tariffAssignmentMap.get(employee.id)
      let tariff = assignment?.tariff ?? null
      if (!tariff && employee.tariffId) {
        tariff = fallbackTariffMap.get(employee.tariffId) ?? null
      }

      // Resolve vacation basis from pre-fetched tenant + tariff + calcGroup
      let basis: import("./vacation-calculation").VacationBasis = "calendar_year"
      if (tenantVacationBasis) {
        basis = tenantVacationBasis as typeof basis
      }
      if (tariff?.vacationBasis) {
        basis = tariff.vacationBasis as typeof basis
      }
      if (calcGroup?.basis) {
        basis = calcGroup.basis as typeof basis
      }

      const { calcInput } = buildCalcInput(
        employee,
        input.year,
        tariff,
        calcGroup,
        basis
      )
      const result = calculateVacation(calcInput)

      const batchBalance = await repo.upsertBalanceEntitlementSimple(
        prisma,
        tenantId,
        employee.id,
        input.year,
        result.totalEntitlement
      )

      if (audit) {
        auditEntries.push({
          tenantId,
          userId: audit.userId,
          action: "create",
          entityType: ENTITY_TYPE,
          entityId: (batchBalance as unknown as Record<string, unknown>).id as string,
          entityName: `${input.year}`,
          metadata: { batch: true },
          ipAddress: audit.ipAddress ?? null,
          userAgent: audit.userAgent ?? null,
        })
      }

      createdCount++
    } catch {
      // Skip employees with errors, continue with next
    }
  }

  // Batch write all collected audit entries
  if (audit && auditEntries.length > 0) {
    await auditLog.logBulk(prisma, auditEntries)
  }

  return {
    message: `Initialized vacation balances for ${createdCount} of ${employees.length} employees`,
    createdCount,
  }
}
