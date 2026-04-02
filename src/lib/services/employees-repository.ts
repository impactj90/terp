/**
 * Employees Repository
 *
 * Pure Prisma data-access functions for the Employee model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// --- List / Search ---

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
  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        department: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        tariff: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.employee.count({ where }),
  ])
  return { employees, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employee.findFirst({
    where: { id, tenantId, deletedAt: null },
  })
}

export async function findByIdWithRelations(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employee.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      department: {
        select: { id: true, name: true, code: true },
      },
      costCenter: {
        select: { id: true, code: true, name: true },
      },
      employmentType: {
        select: { id: true, code: true, name: true },
      },
      location: {
        select: { id: true, code: true, name: true },
      },
      tariff: {
        select: { id: true, code: true, name: true },
      },
      contacts: {
        orderBy: { createdAt: "asc" },
      },
      cards: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      },
    },
  })
}

export async function search(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  scopeWhere?: Record<string, unknown> | null
) {
  const where: Record<string, unknown> = {
    tenantId,
    isActive: true,
    deletedAt: null,
    OR: [
      { firstName: { contains: query, mode: "insensitive" } },
      { lastName: { contains: query, mode: "insensitive" } },
      { personnelNumber: { contains: query, mode: "insensitive" } },
    ],
  }

  // Apply data scope filter
  if (scopeWhere) {
    Object.assign(where, scopeWhere)
  }

  return prisma.employee.findMany({
    where,
    select: {
      id: true,
      personnelNumber: true,
      firstName: true,
      lastName: true,
    },
    take: 20,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
}

// --- Uniqueness Checks ---

export async function findByPersonnelNumber(
  prisma: PrismaClient,
  tenantId: string,
  personnelNumber: string,
  excludeId?: string
) {
  const where: Record<string, unknown> = {
    tenantId,
    personnelNumber,
    deletedAt: null,
  }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.employee.findFirst({ where })
}

export async function findByPin(
  prisma: PrismaClient,
  tenantId: string,
  pin: string,
  excludeId?: string
) {
  const where: Record<string, unknown> = {
    tenantId,
    pin,
    deletedAt: null,
  }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.employee.findFirst({ where })
}

// --- Auto-Personnel-Number ---

export async function getNextPersonnelNumber(
  prisma: PrismaClient,
  tenantId: string
): Promise<string> {
  const result = await prisma.$queryRaw<[{ max_nr: string }]>(
    Prisma.sql`SELECT COALESCE(MAX(personnel_number::integer), 0) + 1 as max_nr FROM employees WHERE tenant_id = ${tenantId}::uuid AND personnel_number ~ '^[0-9]+$' AND deleted_at IS NULL`
  )
  return String(result[0]?.max_nr ?? "1")
}

// --- Auto-PIN ---

export async function getNextPin(
  prisma: PrismaClient,
  tenantId: string
): Promise<string> {
  const result = await prisma.$queryRaw<[{ max_pin: string }]>(
    Prisma.sql`SELECT COALESCE(MAX(pin::integer), 0) + 1 as max_pin FROM employees WHERE tenant_id = ${tenantId}::uuid AND pin ~ '^[0-9]+$'`
  )
  return String(result[0]?.max_pin ?? "1")
}

// --- Create / Update / Deactivate ---

export async function create(
  prisma: PrismaClient,
  data: Prisma.EmployeeCreateInput | Prisma.EmployeeUncheckedCreateInput
) {
  return prisma.employee.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.employee, { id, tenantId }, data, { entity: "Employee" })
}

// --- Day View Queries ---

export async function findBookingsForDay(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date
) {
  return prisma.booking.findMany({
    where: { tenantId, employeeId, bookingDate: date },
    include: {
      bookingType: {
        select: { id: true, code: true, name: true, direction: true },
      },
      bookingReason: {
        select: { id: true, code: true, label: true },
      },
    },
    orderBy: { editedTime: "asc" },
  })
}

export async function findDailyValue(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date
) {
  return prisma.dailyValue.findFirst({
    where: { employeeId, valueDate: date, employee: { tenantId } },
  })
}

export async function findEmployeeDayPlan(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date
) {
  return prisma.employeeDayPlan.findFirst({
    where: { employeeId, planDate: date, employee: { tenantId } },
    include: {
      dayPlan: {
        select: { id: true, code: true, name: true, planType: true },
      },
    },
  })
}

export async function findHoliday(
  prisma: PrismaClient,
  tenantId: string,
  date: Date
) {
  return prisma.holiday.findUnique({
    where: { tenantId_holidayDate: { tenantId, holidayDate: date } },
  })
}
