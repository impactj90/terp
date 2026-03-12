/**
 * Trip Record Repository
 *
 * Pure Prisma data-access functions for the TripRecord model.
 * Includes vehicle and vehicleRoute relation preloads.
 */
import type { PrismaClient } from "@/generated/prisma/client"

/** Prisma include for vehicle and vehicleRoute relation preloads */
const tripRecordInclude = {
  vehicle: {
    select: { id: true, code: true, name: true },
  },
  vehicleRoute: {
    select: { id: true, code: true, name: true },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    vehicleId?: string
    fromDate?: string
    toDate?: string
    limit: number
    page: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.vehicleId) {
    where.vehicleId = params.vehicleId
  }
  if (params.fromDate || params.toDate) {
    const tripDate: Record<string, unknown> = {}
    if (params.fromDate) {
      tripDate.gte = new Date(params.fromDate)
    }
    if (params.toDate) {
      tripDate.lte = new Date(params.toDate)
    }
    where.tripDate = tripDate
  }

  const [data, total] = await Promise.all([
    prisma.tripRecord.findMany({
      where,
      take: params.limit,
      skip: (params.page - 1) * params.limit,
      orderBy: [{ tripDate: "desc" }, { createdAt: "desc" }],
      include: tripRecordInclude,
    }),
    prisma.tripRecord.count({ where }),
  ])

  return { data, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.tripRecord.findFirst({
    where: { id, tenantId },
    include: tripRecordInclude,
  })
}

export async function findByIdSimple(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.tripRecord.findFirst({
    where: { id, tenantId },
  })
}

export async function findVehicleForTenant(
  prisma: PrismaClient,
  tenantId: string,
  vehicleId: string
) {
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, tenantId },
  })
}

export async function findRouteForTenant(
  prisma: PrismaClient,
  tenantId: string,
  routeId: string
) {
  return prisma.vehicleRoute.findFirst({
    where: { id: routeId, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    vehicleId: string
    routeId: string | null
    tripDate: Date
    startMileage: number | null
    endMileage: number | null
    distanceKm: number | null
    notes: string | null
  }
) {
  return prisma.tripRecord.create({
    data,
    include: tripRecordInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.tripRecord.update({
    where: { id },
    data,
    include: tripRecordInclude,
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.tripRecord.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
