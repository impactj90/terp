/**
 * Booking Type Group Repository
 *
 * Pure Prisma data-access functions for the BookingTypeGroup model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const groupInclude = {
  members: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      bookingType: {
        select: {
          id: true,
          code: true,
          name: true,
          direction: true,
          category: true,
        },
      },
    },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.bookingTypeGroup.findMany({
    where,
    orderBy: { code: "asc" },
    include: groupInclude,
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.bookingTypeGroup.findFirst({
    where: { id, tenantId },
    include: groupInclude,
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.bookingTypeGroup.findFirst({
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
    isActive: boolean
  }
) {
  return prisma.bookingTypeGroup.create({ data })
}

export async function createMembers(
  prisma: PrismaClient,
  groupId: string,
  bookingTypeIds: string[]
) {
  return prisma.bookingTypeGroupMember.createMany({
    data: bookingTypeIds.map((btId, idx) => ({
      groupId,
      bookingTypeId: btId,
      sortOrder: idx,
    })),
  })
}

export async function replaceMembers(
  prisma: PrismaClient,
  groupId: string,
  bookingTypeIds: string[]
) {
  // Delete all existing members
  await prisma.bookingTypeGroupMember.deleteMany({
    where: { groupId },
  })
  // Create new members
  if (bookingTypeIds.length > 0) {
    await prisma.bookingTypeGroupMember.createMany({
      data: bookingTypeIds.map((btId, idx) => ({
        groupId,
        bookingTypeId: btId,
        sortOrder: idx,
      })),
    })
  }
}

export async function findByIdWithMembers(
  prisma: PrismaClient,
  id: string
) {
  return prisma.bookingTypeGroup.findUnique({
    where: { id },
    include: groupInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.bookingTypeGroup.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.bookingTypeGroup.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.bookingTypeGroup.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
