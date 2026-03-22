/**
 * Employee Contacts Repository
 *
 * Pure Prisma query functions for employee contact data access.
 */
import type { PrismaClient } from "@/generated/prisma/client"

/**
 * Verifies an employee exists and belongs to the given tenant (not soft-deleted).
 * Returns the employee id or null.
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
 * Lists all contacts for an employee, ordered by createdAt ascending.
 */
export async function listContactsByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeContact.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a new employee contact record.
 */
export async function createContact(
  prisma: PrismaClient,
  data: {
    employeeId: string
    contactType: string
    value: string
    label: string | null
    isPrimary: boolean
    contactKindId: string | null
  }
) {
  return prisma.employeeContact.create({ data })
}

/**
 * Finds a contact by ID, including the employee's tenantId for ownership check.
 */
export async function findContactWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string
) {
  return prisma.employeeContact.findFirst({
    where: { id: contactId, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}

/**
 * Deletes a contact by ID, scoped to tenant via employee relation.
 */
export async function deleteContact(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string
) {
  const { count } = await prisma.employeeContact.deleteMany({
    where: { id: contactId, employee: { tenantId } },
  })
  return count > 0
}
