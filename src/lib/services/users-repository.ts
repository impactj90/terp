/**
 * Users Repository
 *
 * Pure Prisma data-access functions for the User model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export interface UserListParams {
  search?: string
  limit?: number
}

const userRelationsInclude = {
  tenant: true,
  userGroup: true,
  employee: true,
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: UserListParams
) {
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100)

  const where: Record<string, unknown> = { tenantId }

  if (params?.search) {
    where.OR = [
      { email: { contains: params.search, mode: "insensitive" } },
      { displayName: { contains: params.search, mode: "insensitive" } },
      { username: { contains: params.search, mode: "insensitive" } },
    ]
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ])

  return { users, total, limit }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.user.findFirst({
    where: { id, tenantId },
  })
}

export async function findByIdWithRelations(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.user.findFirst({
    where: { id, tenantId },
    include: userRelationsInclude,
  })
}

export async function findUserGroupById(
  prisma: PrismaClient,
  id: string
) {
  return prisma.userGroup.findUnique({
    where: { id },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    email: string
    displayName: string
    role: string
    tenantId: string
    userGroupId: string | null
    employeeId: string | null
    username: string | null
    ssoId: string | null
    isActive: boolean
    isLocked: boolean
    dataScopeType: string
    dataScopeTenantIds: string[]
    dataScopeDepartmentIds: string[]
    dataScopeEmployeeIds: string[]
  }
) {
  return prisma.user.create({ data })
}

export async function upsertUserTenant(
  prisma: PrismaClient,
  userId: string,
  tenantId: string
) {
  return prisma.userTenant.upsert({
    where: {
      userId_tenantId: { userId, tenantId },
    },
    create: { userId, tenantId, role: "member" },
    update: {},
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.user.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.user.deleteMany({
    where: { id, userTenants: { some: { tenantId } } },
  })
  return count > 0
}
