/**
 * Vehicle Route Repository
 *
 * Pure Prisma data-access functions for the VehicleRoute model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(prisma: PrismaClient, tenantId: string) {
  return prisma.vehicleRoute.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.vehicleRoute.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.vehicleRoute.findFirst({
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
    distanceKm: number | null
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.vehicleRoute.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.vehicleRoute.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.vehicleRoute.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.vehicleRoute.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countTripRecordsByRoute(
  prisma: PrismaClient,
  routeId: string
) {
  return prisma.tripRecord.count({
    where: { routeId },
  })
}
