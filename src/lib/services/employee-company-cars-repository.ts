/**
 * Employee Company Cars Repository
 *
 * Pure Prisma query functions for employee company car data access.
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
 * Lists all company cars for an employee, ordered by createdAt ascending.
 */
export async function listByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeCompanyCar.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a new employee company car record.
 */
export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    listPrice: Prisma.Decimal | number
    propulsionType: string
    distanceToWorkKm: Prisma.Decimal | number
    usageType: string
    licensePlate: string | null
    makeModel: string | null
    startDate: Date
    endDate: Date | null
    notes: string | null
  }
) {
  return prisma.employeeCompanyCar.create({ data })
}

/**
 * Finds a company car by ID, including the employee's tenantId for ownership check.
 */
export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeCompanyCar.findFirst({
    where: { id, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}

/**
 * Updates a company car by ID, scoped to tenant via employee relation.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.employeeCompanyCar.updateMany({
    where: { id, employee: { tenantId } },
    data,
  })
  if (count === 0) return null
  return prisma.employeeCompanyCar.findUnique({ where: { id } })
}

/**
 * Deletes a company car by ID, scoped to tenant via employee relation.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.employeeCompanyCar.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
