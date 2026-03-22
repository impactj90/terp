/**
 * Employee Cards Repository
 *
 * Pure Prisma query functions for employee card data access.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

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
 * Lists all cards for an employee, ordered by createdAt descending.
 */
export async function listCardsByEmployee(
  prisma: PrismaClient,
  employeeId: string
) {
  return prisma.employeeCard.findMany({
    where: { employeeId },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Finds an existing card by card number within a tenant (for uniqueness check).
 */
export async function findCardByNumber(
  prisma: PrismaClient,
  tenantId: string,
  cardNumber: string
) {
  return prisma.employeeCard.findFirst({
    where: { tenantId, cardNumber },
  })
}

/**
 * Creates a new employee card record.
 */
export async function createCard(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    cardNumber: string
    cardType: string
    validFrom: Date
    validTo: Date | null
    isActive: boolean
  }
) {
  return prisma.employeeCard.create({ data })
}

/**
 * Finds a card by ID within a tenant.
 */
export async function findCardByIdAndTenant(
  prisma: PrismaClient,
  tenantId: string,
  cardId: string
) {
  return prisma.employeeCard.findFirst({
    where: { id: cardId, tenantId },
  })
}

/**
 * Updates a card's fields by ID.
 */
export async function updateCard(
  prisma: PrismaClient,
  tenantId: string,
  cardId: string,
  data: {
    isActive: boolean
    deactivatedAt: Date
    deactivationReason: string | null
  }
) {
  return tenantScopedUpdate(
    prisma.employeeCard,
    { id: cardId, tenantId },
    data as unknown as Record<string, unknown>,
    { entity: "EmployeeCard" },
  )
}
