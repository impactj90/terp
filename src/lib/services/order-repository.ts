/**
 * Order Repository
 *
 * Pure Prisma data-access functions for the Order model.
 */
import type { Prisma } from "@/generated/prisma/client"
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

const orderInclude = {
  costCenter: {
    select: { id: true, code: true, name: true },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; status?: string; serviceObjectId?: string }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }
  if (params?.status !== undefined) {
    where.status = params.status
  }
  if (params?.serviceObjectId !== undefined) {
    where.serviceObjectId = params.serviceObjectId
  }

  return prisma.order.findMany({
    where,
    orderBy: { code: "asc" },
    include: orderInclude,
  })
}

export async function findManyByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  limit: number
) {
  return prisma.order.findMany({
    where: { tenantId, serviceObjectId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      costCenter: { select: { id: true, code: true, name: true } },
      assignments: {
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              personnelNumber: true,
            },
          },
        },
      },
    },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.order.findFirst({
    where: { id, tenantId },
    include: orderInclude,
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
  return prisma.order.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    status: string
    customer: string | null
    isActive: boolean
    costCenterId?: string
    billingRatePerHour?: Prisma.Decimal
    validFrom?: Date
    validTo?: Date
    serviceObjectId?: string | null
    // Back-link to a maintenance schedule; populated by
    // `serviceScheduleService.generateOrder`. Null for non-plan orders.
    // Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md
    serviceScheduleId?: string | null
    // NK-1 (Decision 15)
    orderTypeId?: string | null
  }
) {
  return prisma.order.create({ data })
}

export async function findByIdWithInclude(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.order.findFirst({
    where: { id, tenantId },
    include: orderInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.order, { id, tenantId }, data, { entity: "Order" })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.order.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
