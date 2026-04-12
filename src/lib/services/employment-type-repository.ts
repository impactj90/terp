/**
 * Employment Type Repository
 *
 * Pure Prisma data-access functions for the EmploymentType model.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.employmentType.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employmentType.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string,
  excludeId?: string
) {
  const where: Record<string, unknown> = { tenantId, code }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.employmentType.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    weeklyHoursDefault: Prisma.Decimal | number | string
    isActive: boolean
    vacationCalcGroupId: string | null
  }
) {
  return prisma.employmentType.create({ data: data as Prisma.EmploymentTypeCreateInput })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.employmentType, { id, tenantId }, data, { entity: "EmploymentType" })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.employmentType.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countEmployees(
  prisma: PrismaClient,
  tenantId: string,
  employmentTypeId: string
) {
  return prisma.employee.count({
    where: { tenantId, employmentTypeId },
  })
}
