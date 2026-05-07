/**
 * Wage Group Repository (NK-1, Decision 2)
 *
 * Pure Prisma data-access functions for the WageGroup model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
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
  return prisma.wageGroup.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.wageGroup.findFirst({ where: { id, tenantId } })
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
  return prisma.wageGroup.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    internalHourlyRate?: number | null
    billingHourlyRate?: number | null
    sortOrder?: number
    isActive?: boolean
  }
) {
  return prisma.wageGroup.create({
    data: {
      tenantId: data.tenantId,
      code: data.code,
      name: data.name,
      internalHourlyRate: data.internalHourlyRate ?? null,
      billingHourlyRate: data.billingHourlyRate ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(
    prisma.wageGroup,
    { id, tenantId },
    data,
    { entity: "WageGroup" }
  )
}

export async function deleteById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.wageGroup.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countEmployeesUsing(
  prisma: PrismaClient,
  tenantId: string,
  wageGroupId: string
) {
  return prisma.employee.count({
    where: { tenantId, wageGroupId },
  })
}
