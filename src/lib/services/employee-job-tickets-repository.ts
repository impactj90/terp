/**
 * Employee Job Tickets Repository
 *
 * Pure Prisma query functions for employee job ticket data access.
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
 * Lists all job tickets for an employee, ordered by createdAt ascending.
 */
export async function listByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeJobTicket.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a new employee job ticket record.
 */
export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    monthlyAmount: Prisma.Decimal | number
    provider: string | null
    isAdditional: boolean
    startDate: Date
    endDate: Date | null
  }
) {
  return prisma.employeeJobTicket.create({ data })
}

/**
 * Finds a job ticket by ID, including the employee's tenantId for ownership check.
 */
export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeJobTicket.findFirst({
    where: { id, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}

/**
 * Updates a job ticket by ID, scoped to tenant via employee relation.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.employeeJobTicket.updateMany({
    where: { id, employee: { tenantId } },
    data,
  })
  if (count === 0) return null
  return prisma.employeeJobTicket.findUnique({ where: { id } })
}

/**
 * Deletes a job ticket by ID, scoped to tenant via employee relation.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.employeeJobTicket.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
