/**
 * Employee Capping Exception Repository
 *
 * Pure Prisma data-access functions for the EmployeeCappingException model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    employeeId?: string
    cappingRuleId?: string
    year?: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.employeeId !== undefined) {
    where.employeeId = params.employeeId
  }

  if (params?.cappingRuleId !== undefined) {
    where.cappingRuleId = params.cappingRuleId
  }

  if (params?.year !== undefined) {
    // Match Go behavior: return entries for specific year OR null year
    where.OR = [{ year: params.year }, { year: null }]
  }

  return prisma.employeeCappingException.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeCappingException.findFirst({
    where: { id, tenantId },
  })
}

export async function findCappingRule(
  prisma: PrismaClient,
  tenantId: string,
  cappingRuleId: string
) {
  return prisma.vacationCappingRule.findFirst({
    where: { id: cappingRuleId, tenantId },
  })
}

export async function findDuplicate(
  prisma: PrismaClient,
  employeeId: string,
  cappingRuleId: string,
  year: number | null | undefined
) {
  if (year !== undefined && year !== null) {
    return prisma.employeeCappingException.findFirst({
      where: {
        employeeId,
        cappingRuleId,
        year,
      },
    })
  }
  // Check for null-year duplicate
  return prisma.employeeCappingException.findFirst({
    where: {
      employeeId,
      cappingRuleId,
      year: null,
    },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    cappingRuleId: string
    exemptionType: string
    retainDays: Prisma.Decimal | number | null
    year: number | null
    notes: string | null
    isActive: boolean
  }
) {
  return prisma.employeeCappingException.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.employeeCappingException.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.employeeCappingException.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
