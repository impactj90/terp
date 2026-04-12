/**
 * Employee Foreign Assignments Repository
 *
 * Pure Prisma query functions for employee foreign assignment data access.
 */
import type { PrismaClient } from "@/generated/prisma/client"

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
 * Lists all foreign assignments for an employee, ordered by createdAt ascending.
 */
export async function listByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeForeignAssignment.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a new employee foreign assignment record.
 */
export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    countryCode: string
    countryName: string
    startDate: Date
    endDate: Date | null
    a1CertificateNumber: string | null
    a1ValidFrom: Date | null
    a1ValidUntil: Date | null
    foreignActivityExemption: boolean
    notes: string | null
  }
) {
  return prisma.employeeForeignAssignment.create({ data })
}

/**
 * Finds a foreign assignment by ID, including the employee's tenantId for ownership check.
 */
export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeForeignAssignment.findFirst({
    where: { id, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}

/**
 * Updates a foreign assignment by ID, scoped to tenant via employee relation.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.employeeForeignAssignment.updateMany({
    where: { id, employee: { tenantId } },
    data,
  })
  if (count === 0) return null
  return prisma.employeeForeignAssignment.findUnique({ where: { id } })
}

/**
 * Deletes a foreign assignment by ID, scoped to tenant via employee relation.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.employeeForeignAssignment.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
