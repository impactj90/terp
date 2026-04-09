/**
 * Employee Garnishments Repository
 *
 * Pure Prisma query functions for employee garnishment data access.
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
 * Lists all garnishments for an employee, ordered by createdAt ascending.
 */
export async function listByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeGarnishment.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a new employee garnishment record.
 */
export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    creditorName: string
    creditorAddress: string | null
    fileReference: string | null
    garnishmentAmount: Prisma.Decimal
    calculationMethod: string
    dependentsCount: number
    rank: number
    isPAccount: boolean
    maintenanceObligation: boolean
    startDate: Date
    endDate: Date | null
    attachmentFileId: string | null
    notes: string | null
  }
) {
  return prisma.employeeGarnishment.create({ data })
}

/**
 * Finds a garnishment by ID, including the employee's tenantId for ownership check.
 */
export async function findByIdWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeGarnishment.findFirst({
    where: { id, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}

/**
 * Updates a garnishment by ID, scoped to tenant via employee relation.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.employeeGarnishment.updateMany({
    where: { id, employee: { tenantId } },
    data,
  })
  if (count === 0) return null
  return prisma.employeeGarnishment.findUnique({ where: { id } })
}

/**
 * Deletes a garnishment by ID, scoped to tenant via employee relation.
 */
export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.employeeGarnishment.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
