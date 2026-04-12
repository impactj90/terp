/**
 * Contact Kind Repository
 *
 * Pure Prisma data-access functions for the ContactKind model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { contactTypeId?: string; isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.contactTypeId) {
    where.contactTypeId = params.contactTypeId
  }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.contactKind.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.contactKind.findFirst({
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
  return prisma.contactKind.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    contactTypeId: string
    code: string
    label: string
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.contactKind.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.contactKind, { id, tenantId }, data, { entity: "ContactKind" })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.contactKind.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countEmployeeContacts(
  prisma: PrismaClient,
  tenantId: string,
  contactKindId: string
) {
  return prisma.employeeContact.count({
    where: { contactKindId, employee: { tenantId } },
  })
}
