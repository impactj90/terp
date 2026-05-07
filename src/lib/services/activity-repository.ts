/**
 * Activity Repository
 *
 * Pure Prisma data-access functions for the Activity model.
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

  return prisma.activity.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.activity.findFirst({
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
  return prisma.activity.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
    // NK-1 Pricing fields (Decision 7, Decision 33)
    pricingType?: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
    flatRate?: number | null
    hourlyRate?: number | null
    unit?: string | null
    calculatedHourEquivalent?: number | null
  }
) {
  return prisma.activity.create({
    data: {
      tenantId: data.tenantId,
      code: data.code,
      name: data.name,
      description: data.description,
      isActive: data.isActive,
      pricingType: data.pricingType ?? "HOURLY",
      flatRate: data.flatRate ?? null,
      hourlyRate: data.hourlyRate ?? null,
      unit: data.unit ?? null,
      calculatedHourEquivalent: data.calculatedHourEquivalent ?? null,
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.activity, { id, tenantId }, data, { entity: "Activity" })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.activity.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countEmployees(
  prisma: PrismaClient,
  tenantId: string,
  activityId: string
) {
  return prisma.employee.count({
    where: { tenantId, defaultActivityId: activityId },
  })
}
