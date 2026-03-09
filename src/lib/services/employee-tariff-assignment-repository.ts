/**
 * Employee Tariff Assignment Repository
 *
 * Pure Prisma data-access functions for the EmployeeTariffAssignment model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findEmployeeById(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  select?: Record<string, boolean>
) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId, deletedAt: null },
    select: select ?? { id: true },
  })
}

export async function findMany(
  prisma: PrismaClient,
  employeeId: string,
  params?: { isActive?: boolean }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { employeeId }
  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.employeeTariffAssignment.findMany({
    where,
    orderBy: { effectiveFrom: "desc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  id: string
) {
  return prisma.employeeTariffAssignment.findFirst({
    where: { id, employeeId, tenantId },
  })
}

export async function hasOverlap(
  prisma: PrismaClient,
  employeeId: string,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  excludeId?: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    employeeId,
    isActive: true,
  }

  if (effectiveTo) {
    where.effectiveFrom = { lte: effectiveTo }
  }

  where.OR = [
    { effectiveTo: null },
    { effectiveTo: { gte: effectiveFrom } },
  ]

  if (excludeId) {
    where.NOT = { id: excludeId }
  }

  const count = await prisma.employeeTariffAssignment.count({ where })
  return count > 0
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    tariffId: string
    effectiveFrom: Date
    effectiveTo: Date | null
    overwriteBehavior: string
    notes: string | null
    isActive: boolean
  }
) {
  return prisma.employeeTariffAssignment.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.employeeTariffAssignment.update({
    where: { id },
    data,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.employeeTariffAssignment.delete({
    where: { id },
  })
}

export async function findEffective(
  prisma: PrismaClient,
  employeeId: string,
  date: Date
) {
  return prisma.employeeTariffAssignment.findFirst({
    where: {
      employeeId,
      isActive: true,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    orderBy: { effectiveFrom: "desc" },
  })
}
