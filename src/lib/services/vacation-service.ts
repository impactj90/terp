/**
 * Vacation Service
 *
 * Business logic for vacation entitlement/carryover previews, balance
 * initialization, adjustment, and batch operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
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
  defaultMaxCarryover: number = 0
): Promise<number> {
  // Resolve tariff for previous year
  const tariff = await resolveTariff(prisma, employee, prevYear, tenantId)

  // If tariff has capping rule group, use advanced capping
  if (tariff?.vacationCappingRuleGroupId) {
    const cappingGroup = await repo.findCappingGroupWithRules(
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

      // Load employee exceptions
      const exceptions = await repo.findCappingExceptions(
        prisma,
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
  }
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
  }
) {
  // 1. Get existing balance (must exist)
  const existing = await repo.findBalance(
    prisma,
    tenantId,
    input.employeeId,
    input.year
  )
  if (!existing) {
    throw new VacationBalanceNotFoundError()
  }

  // 2-3. Accumulate adjustment
  const balance = await repo.incrementAdjustments(
    prisma,
    input.employeeId,
    input.year,
    input.adjustment
  )

  return mapBalanceToOutput(balance)
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
  }
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
  }
) {
  // 1. Get all active employees for tenant
  const employees = await repo.findActiveEmployees(prisma, tenantId)

  let createdCount = 0

  // 2. For each employee
  for (const employee of employees) {
    try {
      // a. If carryover requested, carry over from previous year (best effort)
      if (input.carryover && input.year >= 1901) {
        try {
          const prevBalance = await repo.findBalance(
            prisma,
            tenantId,
            employee.id,
            input.year - 1
          )
          if (prevBalance) {
            const available = calculateAvailable(prevBalance)
            const carryoverAmount = await calculateCappedCarryover(
              prisma,
              tenantId,
              employee,
              input.year - 1,
              available
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

      // b. Initialize year (calculate entitlement)
      const calcGroup = await resolveCalcGroup(prisma, employee, tenantId)
      const tariff = await resolveTariff(
        prisma,
        employee,
        input.year,
        tenantId
      )
      const basis = await resolveVacationBasis(
        prisma,
        employee,
        tariff,
        calcGroup,
        tenantId
      )
      const { calcInput } = buildCalcInput(
        employee,
        input.year,
        tariff,
        calcGroup,
        basis
      )
      const result = calculateVacation(calcInput)

      await repo.upsertBalanceEntitlementSimple(
        prisma,
        tenantId,
        employee.id,
        input.year,
        result.totalEntitlement
      )

      createdCount++
    } catch {
      // Skip employees with errors, continue with next
    }
  }

  return {
    message: `Initialized vacation balances for ${createdCount} of ${employees.length} employees`,
    createdCount,
  }
}
