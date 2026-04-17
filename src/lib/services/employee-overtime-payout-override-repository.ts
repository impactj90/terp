import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { employeeId?: string },
  scopeWhere?: Record<string, unknown> | null,
) {
  const where: Record<string, unknown> = { tenantId }
  if (params?.employeeId) where.employeeId = params.employeeId
  if (scopeWhere) Object.assign(where, scopeWhere)

  return prisma.employeeOvertimePayoutOverride.findMany({
    where,
    include: {
      employee: {
        select: { firstName: true, lastName: true, personnelNumber: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  return prisma.employeeOvertimePayoutOverride.findFirst({
    where: { id, tenantId },
  })
}

export async function findByEmployeeId(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
) {
  return prisma.employeeOvertimePayoutOverride.findFirst({
    where: { tenantId, employeeId, isActive: true },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    overtimePayoutEnabled: boolean
    overtimePayoutMode: string | null
    notes: string | null
  },
) {
  return prisma.employeeOvertimePayoutOverride.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
) {
  return prisma.employeeOvertimePayoutOverride.updateMany({
    where: { id, tenantId },
    data,
  })
}

export async function deleteById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const { count } = await prisma.employeeOvertimePayoutOverride.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function batchFindByEmployeeIds(
  prisma: PrismaClient,
  tenantId: string,
  employeeIds: string[],
): Promise<Map<string, { overtimePayoutEnabled: boolean; overtimePayoutMode: string | null; isActive: boolean }>> {
  const overrides = await prisma.employeeOvertimePayoutOverride.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, isActive: true },
    select: { employeeId: true, overtimePayoutEnabled: true, overtimePayoutMode: true, isActive: true },
  })
  return new Map(overrides.map(o => [o.employeeId, o]))
}
