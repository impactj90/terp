/**
 * Order Assignment Repository
 *
 * Pure Prisma data-access functions for the OrderAssignment model.
 * Includes relation preloads for order and employee.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

/** Prisma include for order and employee relation preloads */
const assignmentInclude = {
  order: { select: { id: true, code: true, name: true } },
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
    },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { orderId?: string; employeeId?: string }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.orderId !== undefined) {
    where.orderId = params.orderId
  }
  if (params?.employeeId !== undefined) {
    where.employeeId = params.employeeId
  }

  return prisma.orderAssignment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: assignmentInclude,
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.orderAssignment.findFirst({
    where: { id, tenantId },
    include: assignmentInclude,
  })
}

export async function findByIdSimple(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.orderAssignment.findFirst({
    where: { id, tenantId },
  })
}

export async function findByOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
) {
  return prisma.orderAssignment.findMany({
    where: { tenantId, orderId },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    include: assignmentInclude,
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    orderId: string
    employeeId: string
    role: string
    isActive: boolean
    validFrom?: Date
    validTo?: Date
  }
) {
  return prisma.orderAssignment.create({ data })
}

export async function findByIdWithIncludes(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.orderAssignment.findFirst({
    where: { id, tenantId },
    include: assignmentInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.orderAssignment, { id, tenantId }, data, {
    entity: "OrderAssignment",
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.orderAssignment.deleteMany({
    where: { id, order: { tenantId } },
  })
  return count > 0
}
