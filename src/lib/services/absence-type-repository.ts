/**
 * Absence Type Repository
 *
 * Pure Prisma data-access functions for the AbsenceType model.
 * Includes system types (tenantId = null) in tenant-scoped queries.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; category?: string; includeSystem?: boolean }
) {
  const where: Record<string, unknown> = {
    OR: [{ tenantId }, { tenantId: null }],
  }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params?.category !== undefined) {
    where.category = params.category
  }

  // If includeSystem is explicitly false, exclude system types
  if (params?.includeSystem === false) {
    where.isSystem = false
  }

  return prisma.absenceType.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.absenceType.findFirst({
    where: {
      id,
      OR: [{ tenantId }, { tenantId: null }],
    },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.absenceType.findFirst({
    where: { tenantId, code },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    category: string
    portion: number
    holidayCode: string | null
    priority: number
    deductsVacation: boolean
    requiresApproval: boolean
    requiresDocument: boolean
    color: string
    sortOrder: number
    isSystem: boolean
    isActive: boolean
    absenceTypeGroupId?: string
    calculationRuleId?: string
  }
) {
  return prisma.absenceType.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.absenceType, { id, tenantId }, data, { entity: "AbsenceType" })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.absenceType.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countAbsenceDaysByType(
  prisma: PrismaClient,
  absenceTypeId: string
) {
  return prisma.absenceDay.count({
    where: { absenceTypeId },
  })
}
