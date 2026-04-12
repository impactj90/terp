/**
 * Employee Vouchers Repository
 *
 * Pure Prisma query functions for employee voucher data access.
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
 * Lists all vouchers for an employee, ordered by createdAt ascending.
 */
export async function listByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeVoucher.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a new employee voucher record.
 */
export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    monthlyAmount: Prisma.Decimal | number
    provider: string | null
    startDate: Date
    endDate: Date | null
  }
) {
  return prisma.employeeVoucher.create({ data })
}

/**
 * Finds a voucher by ID, including the employee's tenantId for ownership check.
 */
export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeVoucher.findFirst({
    where: { id, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}

/**
 * Updates a voucher by ID, scoped to tenant via employee relation.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.employeeVoucher.updateMany({
    where: { id, employee: { tenantId } },
    data,
  })
  if (count === 0) return null
  return prisma.employeeVoucher.findUnique({ where: { id } })
}

/**
 * Deletes a voucher by ID, scoped to tenant via employee relation.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.employeeVoucher.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
