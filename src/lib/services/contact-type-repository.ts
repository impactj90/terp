/**
 * Contact Type Repository
 *
 * Pure Prisma data-access functions for the ContactType model.
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

  return prisma.contactType.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.contactType.findFirst({
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
  return prisma.contactType.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    dataType: string
    description: string | null
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.contactType.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.contactType, { id, tenantId }, data, { entity: "ContactType" })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.contactType.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countContactKinds(
  prisma: PrismaClient,
  tenantId: string,
  contactTypeId: string
) {
  return prisma.contactKind.count({
    where: { tenantId, contactTypeId },
  })
}
