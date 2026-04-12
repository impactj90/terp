/**
 * Vacation Calculation Group Repository
 *
 * Pure Prisma data-access functions for the VacationCalculationGroup model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const calcGroupDetailInclude = {
  specialCalcLinks: {
    include: {
      specialCalculation: {
        select: { id: true, type: true, threshold: true, bonusDays: true },
      },
    },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.vacationCalculationGroup.findMany({
    where,
    include: calcGroupDetailInclude,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.vacationCalculationGroup.findFirst({
    where: { id, tenantId },
    include: calcGroupDetailInclude,
  })
}

export async function findByIdSimple(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.vacationCalculationGroup.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.vacationCalculationGroup.findFirst({
    where: { tenantId, code },
  })
}

export async function createWithLinks(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    basis: string
    isActive: boolean
  },
  specialCalculationIds?: string[]
) {
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.vacationCalculationGroup.create({ data })

    if (specialCalculationIds && specialCalculationIds.length > 0) {
      await tx.vacationCalcGroupSpecialCalc.createMany({
        data: specialCalculationIds.map((scId) => ({
          groupId: created.id,
          specialCalculationId: scId,
        })),
      })
    }

    return created
  })

  return group
}

export async function updateWithLinks(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
  specialCalculationIds?: string[]
) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.vacationCalculationGroup.updateMany({
      where: { id, tenantId },
      data,
    })
    if (count === 0) {
      throw new Error("Vacation calculation group not found")
    }

    // Replace junction entries if IDs provided
    if (specialCalculationIds !== undefined) {
      await tx.vacationCalcGroupSpecialCalc.deleteMany({
        where: { groupId: id },
      })
      if (specialCalculationIds.length > 0) {
        await tx.vacationCalcGroupSpecialCalc.createMany({
          data: specialCalculationIds.map((scId) => ({
            groupId: id,
            specialCalculationId: scId,
          })),
        })
      }
    }
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.vacationCalculationGroup.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countEmploymentTypeUsage(
  prisma: PrismaClient,
  tenantId: string,
  groupId: string
) {
  return prisma.employmentType.count({
    where: { tenantId, vacationCalcGroupId: groupId },
  })
}

export async function findSpecialCalculations(
  prisma: PrismaClient,
  tenantId: string,
  ids: string[]
) {
  return prisma.vacationSpecialCalculation.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true },
  })
}
