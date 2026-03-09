/**
 * Vacation Special Calculation Repository
 *
 * Pure Prisma data-access functions for the VacationSpecialCalculation model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; type?: string }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params?.type !== undefined) {
    where.type = params.type
  }

  return prisma.vacationSpecialCalculation.findMany({
    where,
    orderBy: [{ type: "asc" }, { threshold: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.vacationSpecialCalculation.findFirst({
    where: { id, tenantId },
  })
}

export async function findByTypeAndThreshold(
  prisma: PrismaClient,
  tenantId: string,
  type: string,
  threshold: number
) {
  return prisma.vacationSpecialCalculation.findFirst({
    where: { tenantId, type, threshold },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    type: string
    threshold: number
    bonusDays: Prisma.Decimal | number
    description: string | null
    isActive: boolean
  }
) {
  return prisma.vacationSpecialCalculation.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.vacationSpecialCalculation.update({
    where: { id },
    data,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.vacationSpecialCalculation.delete({
    where: { id },
  })
}

export async function countCalcGroupUsages(
  prisma: PrismaClient,
  specialCalculationId: string
) {
  return prisma.vacationCalcGroupSpecialCalc.count({
    where: { specialCalculationId },
  })
}
