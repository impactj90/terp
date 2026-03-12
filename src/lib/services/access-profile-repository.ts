/**
 * Access Profile Repository
 *
 * Pure Prisma data-access functions for the AccessProfile model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(prisma: PrismaClient, tenantId: string) {
  return prisma.accessProfile.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.accessProfile.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.accessProfile.findFirst({
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
  return prisma.accessProfile.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.accessProfile.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.accessProfile.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.accessProfile.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countAssignments(
  prisma: PrismaClient,
  accessProfileId: string
) {
  return prisma.employeeAccessAssignment.count({
    where: { accessProfileId },
  })
}
