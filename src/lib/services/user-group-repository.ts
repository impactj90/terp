/**
 * User Group Repository
 *
 * Pure Prisma data-access functions for the UserGroup model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { active?: boolean }
) {
  const where: Record<string, unknown> = {
    OR: [{ tenantId }, { tenantId: null }],
  }

  if (params?.active !== undefined) {
    where.isActive = params.active
  }

  return prisma.userGroup.findMany({
    where,
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.userGroup.findFirst({
    where: {
      id,
      OR: [{ tenantId }, { tenantId: null }],
    },
  })
}

export async function findByIdWithUserCount(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.userGroup.findFirst({
    where: {
      id,
      OR: [{ tenantId }, { tenantId: null }],
    },
    include: { _count: { select: { users: true } } },
  })
}

export async function findByName(
  prisma: PrismaClient,
  tenantId: string,
  name: string,
  excludeId?: string
) {
  const where: Record<string, unknown> = {
    name,
    OR: [{ tenantId }, { tenantId: null }],
  }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.userGroup.findFirst({ where })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string,
  excludeId?: string
) {
  const where: Record<string, unknown> = {
    code,
    OR: [{ tenantId }, { tenantId: null }],
  }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.userGroup.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    code: string
    description: string | null
    permissions: string[]
    isAdmin: boolean
    isSystem: boolean
    isActive: boolean
  }
) {
  return prisma.userGroup.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.userGroup.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.userGroup.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.userGroup.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function updateUsersRole(
  prisma: PrismaClient,
  userGroupId: string,
  role: string
) {
  return prisma.user.updateMany({
    where: { userGroupId },
    data: { role },
  })
}
