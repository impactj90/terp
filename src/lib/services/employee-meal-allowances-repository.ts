/**
 * Employee Meal Allowances Repository
 *
 * Pure Prisma query functions for employee meal allowance data access.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"

/**
 * Verifies an employee exists and belongs to the given tenant (not soft-deleted).
 */
export async function findEmployeeForTenant(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId, deletedAt: null },
    select: { id: true },
  })
}

/**
 * Lists all meal allowances for an employee, ordered by createdAt ascending.
 */
export async function listByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeMealAllowance.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a new employee meal allowance record.
 */
export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    dailyAmount: Prisma.Decimal | number
    workDaysPerMonth: Prisma.Decimal | number
    startDate: Date
    endDate: Date | null
  }
) {
  return prisma.employeeMealAllowance.create({ data })
}

/**
 * Finds a meal allowance by ID, including the employee's tenantId for ownership check.
 */
export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeMealAllowance.findFirst({
    where: { id, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}

/**
 * Updates a meal allowance by ID, scoped to tenant via employee relation.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.employeeMealAllowance.updateMany({
    where: { id, employee: { tenantId } },
    data,
  })
  if (count === 0) return null
  return prisma.employeeMealAllowance.findUnique({ where: { id } })
}

/**
 * Deletes a meal allowance by ID, scoped to tenant via employee relation.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.employeeMealAllowance.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
