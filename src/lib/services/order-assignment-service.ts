/**
 * Order Assignment Service
 *
 * Business logic for order assignment operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./order-assignment-repository"

// --- Error Classes ---

export class OrderAssignmentNotFoundError extends Error {
  constructor(message = "Order assignment not found") {
    super(message)
    this.name = "OrderAssignmentNotFoundError"
  }
}

export class OrderAssignmentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderAssignmentConflictError"
  }
}

// --- Helpers ---

/**
 * Parses an ISO date string ("2026-01-15") into a Date at midnight UTC.
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z")
}

/**
 * Checks if a Prisma error is a unique constraint violation (P2002).
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { orderId?: string; employeeId?: string }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const assignment = await repo.findById(prisma, tenantId, id)
  if (!assignment) {
    throw new OrderAssignmentNotFoundError()
  }
  return assignment
}

export async function byOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
) {
  return repo.findByOrder(prisma, tenantId, orderId)
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    orderId: string
    employeeId: string
    role?: string
    validFrom?: string
    validTo?: string
  }
) {
  let created: { id: string }
  try {
    created = await repo.create(prisma, {
      tenantId,
      orderId: input.orderId,
      employeeId: input.employeeId,
      role: input.role || "worker",
      isActive: true,
      validFrom: input.validFrom ? parseDate(input.validFrom) : undefined,
      validTo: input.validTo ? parseDate(input.validTo) : undefined,
    })
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new OrderAssignmentConflictError(
        "Order assignment already exists for this employee, order, and role"
      )
    }
    throw error
  }

  // Re-fetch with relation preloads
  const result = await repo.findByIdWithIncludes(prisma, tenantId, created.id)
  if (!result) {
    throw new OrderAssignmentNotFoundError()
  }
  return result
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    role?: string
    validFrom?: string | null
    validTo?: string | null
    isActive?: boolean
  }
) {
  // Verify assignment exists (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new OrderAssignmentNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.role !== undefined) {
    data.role = input.role
  }
  if (input.validFrom !== undefined) {
    data.validFrom =
      input.validFrom === null ? null : parseDate(input.validFrom)
  }
  if (input.validTo !== undefined) {
    data.validTo =
      input.validTo === null ? null : parseDate(input.validTo)
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  await repo.update(prisma, tenantId, input.id, data)

  // Re-fetch with relation preloads
  const result = await repo.findByIdWithIncludes(prisma, tenantId, input.id)
  if (!result) {
    throw new OrderAssignmentNotFoundError()
  }
  return result
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify assignment exists (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, id)
  if (!existing) {
    throw new OrderAssignmentNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)
}
