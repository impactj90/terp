/**
 * Employee Savings Repository
 *
 * Pure Prisma query functions for employee savings data access.
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
 * Lists all savings for an employee, ordered by createdAt ascending.
 */
export async function listByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeSavings.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a new employee savings record.
 */
export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    investmentType: string
    recipient: string
    recipientIban: string | null
    contractNumber: string | null
    monthlyAmount: Prisma.Decimal | number
    employerShare: Prisma.Decimal | number
    employeeShare: Prisma.Decimal | number
    startDate: Date
    endDate: Date | null
  }
) {
  return prisma.employeeSavings.create({ data })
}

/**
 * Finds a savings record by ID, including the employee's tenantId for ownership check.
 */
export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeSavings.findFirst({
    where: { id, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}

/**
 * Updates a savings record by ID, scoped to tenant via employee relation.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.employeeSavings.updateMany({
    where: { id, employee: { tenantId } },
    data,
  })
  if (count === 0) return null
  return prisma.employeeSavings.findUnique({ where: { id } })
}

/**
 * Deletes a savings record by ID, scoped to tenant via employee relation.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.employeeSavings.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
