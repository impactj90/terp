/**
 * Shift Repository
 *
 * Pure Prisma data-access functions for the Shift model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(prisma: PrismaClient, tenantId: string) {
  return prisma.shift.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.shift.findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.shift.findFirst({
    where: { tenantId, code },
  })
}

export async function findDayPlan(
  prisma: PrismaClient,
  tenantId: string,
  dayPlanId: string
) {
  return prisma.dayPlan.findFirst({
    where: { id: dayPlanId, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    dayPlanId: string | null
    color: string | null
    qualification: string | null
    isActive: boolean
    sortOrder: number
  }
) {
  return prisma.shift.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.shift.update({ where: { id }, data })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.shift.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countEmployeeDayPlanUsages(
  prisma: PrismaClient,
  shiftId: string
) {
  return prisma.employeeDayPlan.count({
    where: { shiftId },
  })
}

export async function countShiftAssignmentUsages(
  prisma: PrismaClient,
  shiftId: string
) {
  return prisma.shiftAssignment.count({
    where: { shiftId },
  })
}
