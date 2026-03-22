/**
 * Department Repository
 *
 * Pure Prisma data-access functions for the Department model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; parentId?: string }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params?.parentId !== undefined) {
    where.parentId = params.parentId
  }

  return prisma.department.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findAllForTree(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.department.findMany({
    where: { tenantId },
    orderBy: [{ name: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.department.findFirst({
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
  return prisma.department.findFirst({ where })
}

export async function findParentId(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.department.findFirst({
    where: { id, tenantId },
    select: { parentId: true },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    parentId: string | null
    managerEmployeeId: string | null
    isActive: boolean
  }
) {
  return prisma.department.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.department, { id, tenantId }, data, { entity: "Department" })
}

export async function deleteById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.department.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countChildren(
  prisma: PrismaClient,
  tenantId: string,
  parentId: string
) {
  return prisma.department.count({
    where: { parentId, tenantId },
  })
}

export async function countEmployees(
  prisma: PrismaClient,
  tenantId: string,
  departmentId: string
) {
  return prisma.employee.count({
    where: { departmentId, tenantId },
  })
}
