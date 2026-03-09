/**
 * Booking Type Repository
 *
 * Pure Prisma data-access functions for the BookingType model.
 * Includes system types (tenantId = null) in tenant-scoped queries.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; direction?: string }
) {
  const where: Record<string, unknown> = {
    OR: [{ tenantId }, { tenantId: null }],
  }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }
  if (params?.direction !== undefined) {
    where.direction = params.direction
  }

  return prisma.bookingType.findMany({
    where,
    orderBy: [{ isSystem: "desc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.bookingType.findFirst({
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
  return prisma.bookingType.findFirst({
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
    direction: string
    category: string
    accountId?: string
    requiresReason: boolean
    isSystem: boolean
    isActive: boolean
  }
) {
  return prisma.bookingType.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.bookingType.update({
    where: { id },
    data,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.bookingType.delete({
    where: { id },
  })
}

export async function countBookingsByType(
  prisma: PrismaClient,
  bookingTypeId: string
) {
  return prisma.booking.count({
    where: { bookingTypeId },
  })
}
