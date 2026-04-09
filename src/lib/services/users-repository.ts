/**
 * Users Repository
 *
 * Pure Prisma data-access functions for the User model.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import { TenantScopedNotFoundError } from "@/lib/services/prisma-helpers"

/**
 * Tx: either the top-level PrismaClient or a Prisma.TransactionClient handle
 * obtained from prisma.$transaction(async (tx) => ...). The Prisma API is
 * identical for single-model writes, so most repository helpers accept both.
 */
type Tx = PrismaClient | Prisma.TransactionClient

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
  prisma: Tx,
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

export async function create(
  prisma: Tx,
  data: {
    // Pre-allocated id: Phase 0 creates the Supabase Auth user first and
    // uses the returned id to keep auth.users.id === public.users.id.
    id?: string
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
  prisma: Tx,
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
  const { count } = await prisma.user.updateMany({
    where: { id, userTenants: { some: { tenantId } } },
    data,
  })
  if (count === 0) {
    throw new TenantScopedNotFoundError("User")
  }
  return prisma.user.findFirst({
    where: { id, userTenants: { some: { tenantId } } },
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.user.deleteMany({
    where: { id, userTenants: { some: { tenantId } } },
  })
  return count > 0
}
