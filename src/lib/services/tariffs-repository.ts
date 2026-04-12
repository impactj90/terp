/**
 * Tariffs Repository
 *
 * Pure Prisma data-access functions for the Tariff model and its
 * sub-entities (TariffBreak, TariffWeekPlan, TariffDayPlan).
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Prisma Include Objects ---

const tariffListInclude = {
  weekPlan: { select: { id: true, code: true, name: true } },
} as const

const tariffDetailInclude = {
  weekPlan: { select: { id: true, code: true, name: true } },
  breaks: { orderBy: { sortOrder: "asc" as const } },
  tariffWeekPlans: {
    orderBy: { sequenceOrder: "asc" as const },
    include: {
      weekPlan: { select: { id: true, code: true, name: true } },
    },
  },
  tariffDayPlans: {
    orderBy: { dayPosition: "asc" as const },
    include: {
      dayPlan: {
        select: { id: true, code: true, name: true, planType: true },
      },
    },
  },
} as const

// --- Tariff queries ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.tariff.findMany({
    where,
    include: tariffListInclude,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.tariff.findFirst({
    where: { id, tenantId },
  })
}

export async function findByIdWithDetails(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.tariff.findFirst({
    where: { id, tenantId },
    include: tariffDetailInclude,
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.tariff.findFirst({
    where: { tenantId, code },
  })
}

export async function createTariffWithSubRecords(
  prisma: PrismaClient,
  data: {
    tariffData: Record<string, unknown>
    weekPlanIds?: string[]
    dayPlans?: Array<{ dayPosition: number; dayPlanId: string | null }>
    rhythmType: string
  }
) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.tariff.create({
      data: data.tariffData as Parameters<typeof tx.tariff.create>[0]["data"],
    })

    // Create rolling_weekly sub-records
    if (
      data.rhythmType === "rolling_weekly" &&
      data.weekPlanIds &&
      data.weekPlanIds.length > 0
    ) {
      await tx.tariffWeekPlan.createMany({
        data: data.weekPlanIds.map((wpId, i) => ({
          tariffId: created.id,
          weekPlanId: wpId,
          sequenceOrder: i + 1,
        })),
      })
    }

    // Create x_days sub-records
    if (
      data.rhythmType === "x_days" &&
      data.dayPlans &&
      data.dayPlans.length > 0
    ) {
      await tx.tariffDayPlan.createMany({
        data: data.dayPlans.map((dp) => ({
          tariffId: created.id,
          dayPosition: dp.dayPosition,
          dayPlanId: dp.dayPlanId,
        })),
      })
    }

    return created
  })
}

export async function updateTariffWithSubRecords(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    tariffData: Record<string, unknown>
    rhythmType: string
    rhythmTypeChanged: boolean
    weekPlanIds?: string[]
    dayPlans?: Array<{ dayPosition: number; dayPlanId: string | null }>
  }
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.tariff.updateMany({
      where: { id, tenantId },
      data: data.tariffData,
    })
    if (count === 0) {
      throw new Error("Tariff not found")
    }

    // Handle rhythm type changes -- clean up old sub-records
    if (data.rhythmTypeChanged) {
      switch (data.rhythmType) {
        case "weekly":
          // Switching to weekly: clear both sub-record types
          await tx.tariffWeekPlan.deleteMany({
            where: { tariffId: id },
          })
          await tx.tariffDayPlan.deleteMany({
            where: { tariffId: id },
          })
          break
        case "rolling_weekly":
          // Clear day plans when switching to rolling_weekly
          await tx.tariffDayPlan.deleteMany({
            where: { tariffId: id },
          })
          break
        case "x_days":
          // Clear week plans when switching to x_days
          await tx.tariffWeekPlan.deleteMany({
            where: { tariffId: id },
          })
          break
      }
    }

    // Update rolling_weekly sub-records if provided
    if (
      data.rhythmType === "rolling_weekly" &&
      data.weekPlanIds &&
      data.weekPlanIds.length > 0
    ) {
      await tx.tariffWeekPlan.deleteMany({
        where: { tariffId: id },
      })
      await tx.tariffWeekPlan.createMany({
        data: data.weekPlanIds.map((wpId, i) => ({
          tariffId: id,
          weekPlanId: wpId,
          sequenceOrder: i + 1,
        })),
      })
    }

    // Update x_days sub-records if provided
    if (
      data.rhythmType === "x_days" &&
      data.dayPlans &&
      data.dayPlans.length > 0
    ) {
      await tx.tariffDayPlan.deleteMany({
        where: { tariffId: id },
      })
      await tx.tariffDayPlan.createMany({
        data: data.dayPlans.map((dp) => ({
          tariffId: id,
          dayPosition: dp.dayPosition,
          dayPlanId: dp.dayPlanId,
        })),
      })
    }
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.tariff.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Usage checks ---

export async function countEmployeeTariffAssignments(
  prisma: PrismaClient,
  tenantId: string,
  tariffId: string
) {
  return prisma.employeeTariffAssignment.count({
    where: { tenantId, tariffId },
  })
}

export async function countEmployeesByTariff(
  prisma: PrismaClient,
  tenantId: string,
  tariffId: string
) {
  return prisma.employee.count({
    where: { tenantId, tariffId },
  })
}

// --- FK validation queries ---

export async function findWeekPlan(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.weekPlan.findFirst({
    where: { id, tenantId },
  })
}

export async function findDayPlan(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.dayPlan.findFirst({
    where: { id, tenantId },
  })
}

// --- Break queries ---

export async function countBreaks(
  prisma: PrismaClient,
  tenantId: string,
  tariffId: string
) {
  return prisma.tariffBreak.count({
    where: { tariffId, tariff: { tenantId } },
  })
}

export async function createBreak(
  prisma: PrismaClient,
  data: {
    tariffId: string
    breakType: string
    afterWorkMinutes?: number
    duration: number
    isPaid: boolean
    sortOrder: number
  }
) {
  return prisma.tariffBreak.create({ data })
}

export async function findBreak(
  prisma: PrismaClient,
  breakId: string,
  tariffId: string
) {
  return prisma.tariffBreak.findFirst({
    where: { id: breakId, tariffId },
  })
}

export async function deleteBreak(prisma: PrismaClient, breakId: string) {
  return prisma.tariffBreak.delete({
    where: { id: breakId },
  })
}
