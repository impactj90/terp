/**
 * Absences Repository
 *
 * Pure Prisma data-access functions for the AbsenceDay model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Include Objects ---

export const absenceDayListInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
    },
  },
  absenceType: {
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      color: true,
      deductsVacation: true,
    },
  },
} as const

// --- Query Functions ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    where: Record<string, unknown>
    skip: number
    take: number
  }
) {
  const where = { tenantId, ...params.where }
  return prisma.absenceDay.findMany({
    where,
    include: absenceDayListInclude,
    skip: params.skip,
    take: params.take,
    orderBy: { absenceDate: "desc" },
  })
}

export async function count(
  prisma: PrismaClient,
  tenantId: string,
  where: Record<string, unknown>
) {
  return prisma.absenceDay.count({
    where: { tenantId, ...where },
  })
}

export async function findForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  where: Record<string, unknown>
) {
  return prisma.absenceDay.findMany({
    where: { tenantId, ...where },
    include: absenceDayListInclude,
    orderBy: { absenceDate: "desc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.absenceDay.findFirst({
    where: { id, tenantId },
    include: absenceDayListInclude,
  })
}

export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.absenceDay.findFirst({
    where: { id, tenantId },
    include: {
      employee: {
        select: { id: true, departmentId: true },
      },
    },
  })
}

export async function findByIdWithEmployeeAndType(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.absenceDay.findFirst({
    where: { id, tenantId },
    include: {
      employee: {
        select: { id: true, departmentId: true },
      },
      absenceType: {
        select: { deductsVacation: true },
      },
    },
  })
}

export async function findByIdForApproval(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.absenceDay.findFirst({
    where: { id, tenantId },
    include: {
      employee: {
        select: { id: true, departmentId: true },
      },
      absenceType: {
        select: {
          id: true,
          name: true,
          deductsVacation: true,
        },
      },
    },
  })
}

export async function findByIdForRejection(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.absenceDay.findFirst({
    where: { id, tenantId },
    include: {
      employee: {
        select: { id: true, departmentId: true },
      },
      absenceType: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })
}

export async function findByIdForCancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.absenceDay.findFirst({
    where: { id, tenantId },
    include: {
      employee: {
        select: { id: true, departmentId: true },
      },
      absenceType: {
        select: {
          id: true,
          deductsVacation: true,
        },
      },
    },
  })
}

export async function findActiveAbsenceType(
  prisma: PrismaClient,
  tenantId: string,
  absenceTypeId: string
) {
  return prisma.absenceType.findFirst({
    where: {
      id: absenceTypeId,
      OR: [{ tenantId }, { tenantId: null }],
      isActive: true,
    },
  })
}

export async function findEmployeeDayPlans(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  fromDate: Date,
  toDate: Date
) {
  return prisma.employeeDayPlan.findMany({
    where: {
      employeeId,
      planDate: { gte: fromDate, lte: toDate },
      employee: { tenantId },
    },
    select: {
      planDate: true,
      dayPlanId: true,
    },
  })
}

export async function findExistingAbsences(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  fromDate: Date,
  toDate: Date
) {
  return prisma.absenceDay.findMany({
    where: {
      employeeId,
      absenceDate: { gte: fromDate, lte: toDate },
      status: { not: "cancelled" },
      employee: { tenantId },
    },
    select: { absenceDate: true },
  })
}

export async function createMany(
  prisma: PrismaClient,
  data: Array<{
    tenantId: string
    employeeId: string
    absenceDate: Date
    absenceTypeId: string
    duration: number
    halfDayPeriod: string | null
    status: string
    notes: string | null
    createdBy: string | null
  }>
) {
  return prisma.absenceDay.createMany({ data })
}

export async function findCreatedAbsences(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    employeeId: string
    absenceTypeId: string
    fromDate: Date
    toDate: Date
    createdBy: string | undefined
  }
) {
  return prisma.absenceDay.findMany({
    where: {
      tenantId,
      employeeId: params.employeeId,
      absenceTypeId: params.absenceTypeId,
      absenceDate: {
        gte: params.fromDate,
        lte: params.toDate,
      },
      status: "pending",
      createdBy: params.createdBy,
    },
    include: absenceDayListInclude,
    orderBy: { absenceDate: "asc" },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.absenceDay.update({
    where: { id },
    data,
    include: absenceDayListInclude,
  })
}

/**
 * Atomically updates an absence only if it has the expected status.
 * Returns the updated record, or null if the status didn't match (already changed).
 */
export async function updateIfStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.absenceDay.findFirst({ where: { id, tenantId, status: expectedStatus } })
  if (!existing) {
    return null
  }
  return prisma.absenceDay.update({
    where: { id },
    data,
    include: absenceDayListInclude,
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.absenceDay.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Vacation Balance Queries ---

export async function findVacationDeductingTypes(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.absenceType.findMany({
    where: {
      OR: [{ tenantId }, { tenantId: null }],
      deductsVacation: true,
    },
    select: { id: true },
  })
}

export async function findApprovedAbsenceDaysForYear(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  typeIds: string[],
  yearStart: Date,
  yearEnd: Date
) {
  return prisma.absenceDay.findMany({
    where: {
      employeeId,
      absenceTypeId: { in: typeIds },
      status: "approved",
      absenceDate: { gte: yearStart, lte: yearEnd },
      employee: { tenantId },
    },
    select: {
      absenceDate: true,
      duration: true,
    },
  })
}

export async function findEmployeeDayPlansWithVacationDeduction(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  yearStart: Date,
  yearEnd: Date
) {
  return prisma.employeeDayPlan.findMany({
    where: {
      employeeId,
      planDate: { gte: yearStart, lte: yearEnd },
      employee: { tenantId },
    },
    include: {
      dayPlan: {
        select: { vacationDeduction: true },
      },
    },
  })
}

export async function upsertVacationBalance(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  totalTaken: number
) {
  return prisma.vacationBalance.upsert({
    where: {
      employeeId_year: { employeeId, year },
    },
    update: {
      taken: totalTaken,
    },
    create: {
      tenantId,
      employeeId,
      year,
      taken: totalTaken,
      entitlement: 0,
      carryover: 0,
      adjustments: 0,
    },
  })
}

// --- Notification Queries ---

export async function findUserIdForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  const result = await prisma.$queryRaw<
    { user_id: string }[]
  >`
    SELECT ut.user_id
    FROM user_tenants ut
    JOIN users u ON u.id = ut.user_id
    WHERE ut.tenant_id = ${tenantId}::uuid
      AND u.employee_id = ${employeeId}::uuid
    LIMIT 1
  `
  return result && result.length > 0 ? result[0]!.user_id : null
}

export async function createNotification(
  prisma: PrismaClient,
  data: {
    tenantId: string
    userId: string
    type: string
    title: string
    message: string
    link: string
  }
) {
  return prisma.notification.create({ data })
}
