/**
 * Vacation Repository
 *
 * Pure Prisma data-access functions for vacation-related models
 * (Employee, VacationBalance, VacationCappingRuleGroup, EmployeeCappingException,
 *  VacationCalculationGroup, EmployeeTariffAssignment, Tariff).
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { employeeSelect } from "./vacation-balance-output"

/**
 * Finds an employee by ID with employment type included.
 */
export async function findEmployeeWithEmploymentType(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
    include: { employmentType: true },
  })
}

/**
 * Finds an employee by ID (without employment type).
 */
export async function findEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
  })
}

/**
 * Finds a vacation calculation group by ID with special calculation links.
 */
export async function findCalcGroupById(
  prisma: PrismaClient,
  tenantId: string,
  calcGroupId: string
) {
  return prisma.vacationCalculationGroup.findFirst({
    where: { id: calcGroupId, tenantId },
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
}

/**
 * Finds a capping rule group by ID with capping rule links.
 */
export async function findCappingGroupWithRules(
  prisma: PrismaClient,
  tenantId: string,
  cappingGroupId: string
) {
  return prisma.vacationCappingRuleGroup.findFirst({
    where: { id: cappingGroupId, tenantId },
    include: {
      cappingRuleLinks: {
        include: { cappingRule: true },
      },
    },
  })
}

/**
 * Finds active capping exceptions for an employee in a given year.
 */
export async function findCappingExceptions(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
) {
  return prisma.employeeCappingException.findMany({
    where: {
      employeeId,
      employee: { tenantId },
      isActive: true,
      OR: [{ year }, { year: null }],
    },
  })
}

/**
 * Finds a vacation balance for an employee and year.
 */
export async function findBalance(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
) {
  return prisma.vacationBalance.findFirst({
    where: { employeeId, year, tenantId },
  })
}

/**
 * Finds a vacation balance for an employee and year, including the employee relation.
 */
export async function findBalanceWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
) {
  return prisma.vacationBalance.findFirst({
    where: { employeeId, year, tenantId },
    include: { employee: { select: employeeSelect } },
  })
}

/**
 * Upserts a vacation balance, setting entitlement (preserves carryover/adjustments/taken).
 */
export async function upsertBalanceEntitlement(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  entitlement: number
) {
  return prisma.vacationBalance.upsert({
    where: {
      employeeId_year: { employeeId, year },
    },
    update: { entitlement },
    create: {
      tenantId,
      employeeId,
      year,
      entitlement,
      carryover: 0,
      adjustments: 0,
      taken: 0,
    },
    include: { employee: { select: employeeSelect } },
  })
}

/**
 * Upserts a vacation balance, setting entitlement only (no employee include).
 */
export async function upsertBalanceEntitlementSimple(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  entitlement: number
) {
  return prisma.vacationBalance.upsert({
    where: {
      employeeId_year: { employeeId, year },
    },
    update: { entitlement },
    create: {
      tenantId,
      employeeId,
      year,
      entitlement,
      carryover: 0,
      adjustments: 0,
      taken: 0,
    },
  })
}

/**
 * Increments the adjustments field on a vacation balance.
 */
export async function incrementAdjustments(
  prisma: PrismaClient,
  employeeId: string,
  year: number,
  adjustment: number
) {
  return prisma.vacationBalance.update({
    where: {
      employeeId_year: { employeeId, year },
    },
    data: {
      adjustments: { increment: adjustment },
    },
    include: { employee: { select: employeeSelect } },
  })
}

/**
 * Upserts a vacation balance, setting carryover.
 */
export async function upsertBalanceCarryover(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  carryover: number
) {
  return prisma.vacationBalance.upsert({
    where: {
      employeeId_year: { employeeId, year },
    },
    update: { carryover },
    create: {
      tenantId,
      employeeId,
      year,
      entitlement: 0,
      carryover,
      adjustments: 0,
      taken: 0,
    },
    include: { employee: { select: employeeSelect } },
  })
}

/**
 * Upserts a vacation balance, setting carryover only (no employee include).
 */
export async function upsertBalanceCarryoverSimple(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  carryover: number
) {
  return prisma.vacationBalance.upsert({
    where: {
      employeeId_year: { employeeId, year },
    },
    update: { carryover },
    create: {
      tenantId,
      employeeId,
      year,
      entitlement: 0,
      carryover,
      adjustments: 0,
      taken: 0,
    },
  })
}

/**
 * Finds all active employees for a tenant, with employment type included.
 */
export async function findActiveEmployees(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.employee.findMany({
    where: { tenantId, isActive: true },
    include: { employmentType: true },
  })
}
