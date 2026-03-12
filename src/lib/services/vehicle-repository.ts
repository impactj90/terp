/**
 * Vehicle Repository
 *
 * Pure Prisma data-access functions for the Vehicle model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(prisma: PrismaClient, tenantId: string) {
  return prisma.vehicle.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.vehicle.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.vehicle.findFirst({
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
    licensePlate: string | null
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.vehicle.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.vehicle.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.vehicle.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.vehicle.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countTripRecordsByVehicle(
  prisma: PrismaClient,
  vehicleId: string
) {
  return prisma.tripRecord.count({
    where: { vehicleId },
  })
}
