/**
 * Booking Reason Repository
 *
 * Pure Prisma data-access functions for the BookingReason model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { bookingTypeId?: string }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.bookingTypeId !== undefined) {
    where.bookingTypeId = params.bookingTypeId
  }

  return prisma.bookingReason.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.bookingReason.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  bookingTypeId: string,
  code: string
) {
  return prisma.bookingReason.findFirst({
    where: { tenantId, bookingTypeId, code },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    bookingTypeId: string
    code: string
    label: string
    isActive: boolean
    sortOrder: number
    referenceTime: string | null
    offsetMinutes: number | null
    adjustmentBookingTypeId: string | null
  }
) {
  return prisma.bookingReason.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.bookingReason.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.bookingReason.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
