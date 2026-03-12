/**
 * Employee Day Plans Repository
 *
 * Pure Prisma data-access functions for the EmployeeDayPlan model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Include Objects ---

export const edpListInclude = {
  dayPlan: { select: { id: true, code: true, name: true, planType: true } },
  shift: { select: { id: true, code: true, name: true } },
} as const

export const edpDetailInclude = {
  dayPlan: {
    include: {
      breaks: { orderBy: { sortOrder: "asc" as const } },
      bonuses: {
        orderBy: { sortOrder: "asc" as const },
        include: { account: true },
      },
    },
  },
  shift: true,
} as const

// --- Query Functions ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: { employeeId?: string; from: string; to: string }
) {
  const where: Record<string, unknown> = {
    tenantId,
    planDate: {
      gte: new Date(params.from),
      lte: new Date(params.to),
    },
  }

  if (params.employeeId) {
    where.employeeId = params.employeeId
  }

  return prisma.employeeDayPlan.findMany({
    where,
    include: edpListInclude,
    orderBy: [{ employeeId: "asc" }, { planDate: "asc" }],
  })
}

export async function findManyForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  params: { employeeId: string; from: string; to: string }
) {
  return prisma.employeeDayPlan.findMany({
    where: {
      tenantId,
      employeeId: params.employeeId,
      planDate: {
        gte: new Date(params.from),
        lte: new Date(params.to),
      },
    },
    include: edpDetailInclude,
    orderBy: { planDate: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeDayPlan.findFirst({
    where: { id, tenantId },
    include: edpListInclude,
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    planDate: Date
    dayPlanId: string | null
    shiftId: string | null
    source: string
    notes: string | null
  }
) {
  return prisma.employeeDayPlan.create({
    data,
    include: edpListInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.employeeDayPlan.findFirst({ where: { id, tenantId } })
  if (!existing) return null
  return prisma.employeeDayPlan.update({
    where: { id },
    data,
    include: edpListInclude,
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.employeeDayPlan.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function deleteRange(
  prisma: PrismaClient,
  tenantId: string,
  params: { employeeId: string; from: string; to: string }
) {
  return prisma.employeeDayPlan.deleteMany({
    where: {
      tenantId,
      employeeId: params.employeeId,
      planDate: {
        gte: new Date(params.from),
        lte: new Date(params.to),
      },
    },
  })
}

export async function findEmployeeForTenant(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
  })
}

export async function findShiftForTenant(
  prisma: PrismaClient,
  tenantId: string,
  shiftId: string
) {
  return prisma.shift.findFirst({
    where: { id: shiftId, tenantId },
  })
}

export async function findDayPlanForTenant(
  prisma: PrismaClient,
  tenantId: string,
  dayPlanId: string
) {
  return prisma.dayPlan.findFirst({
    where: { id: dayPlanId, tenantId },
  })
}

export async function bulkUpsert(
  prisma: PrismaClient,
  tenantId: string,
  entries: Array<{
    employeeId: string
    planDate: string
    dayPlanId: string | null
    shiftId: string | null
    source: string
    notes?: string
  }>
) {
  await prisma.$transaction(
    entries.map((entry) => {
      const planDate = new Date(entry.planDate)
      return prisma.employeeDayPlan.upsert({
        where: {
          employeeId_planDate: {
            employeeId: entry.employeeId,
            planDate,
          },
        },
        create: {
          tenantId,
          employeeId: entry.employeeId,
          planDate,
          dayPlanId: entry.dayPlanId,
          shiftId: entry.shiftId,
          source: entry.source,
          notes: entry.notes?.trim() || null,
        },
        update: {
          dayPlanId: entry.dayPlanId,
          shiftId: entry.shiftId,
          source: entry.source,
          notes: entry.notes?.trim() || null,
        },
      })
    })
  )
}
