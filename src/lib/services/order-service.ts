/**
 * Order Service
 *
 * Business logic for order operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import { Prisma } from "@/generated/prisma/client"
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./order-repository"

// --- Error Classes ---

export class OrderNotFoundError extends Error {
  constructor(message = "Order not found") {
    super(message)
    this.name = "OrderNotFoundError"
  }
}

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderValidationError"
  }
}

export class OrderConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderConflictError"
  }
}

// --- Helpers ---

function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z")
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; status?: string }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const order = await repo.findById(prisma, tenantId, id)
  if (!order) {
    throw new OrderNotFoundError()
  }
  return order
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    status?: string
    customer?: string
    costCenterId?: string
    billingRatePerHour?: number
    validFrom?: string
    validTo?: string
  }
) {
  // Trim and validate code
  const code = input.code.trim()
  if (code.length === 0) {
    throw new OrderValidationError("Order code is required")
  }

  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new OrderValidationError("Order name is required")
  }

  // Check code uniqueness within tenant
  const existingByCode = await repo.findByCode(prisma, tenantId, code)
  if (existingByCode) {
    throw new OrderConflictError("Order code already exists")
  }

  // Trim optional string fields
  const description = input.description?.trim() || null
  const customer = input.customer?.trim() || null

  // Create order
  const created = await repo.create(prisma, {
    tenantId,
    code,
    name,
    description,
    status: input.status || "active",
    customer,
    isActive: true,
    costCenterId: input.costCenterId || undefined,
    billingRatePerHour:
      input.billingRatePerHour !== undefined
        ? new Prisma.Decimal(input.billingRatePerHour)
        : undefined,
    validFrom: input.validFrom ? parseDate(input.validFrom) : undefined,
    validTo: input.validTo ? parseDate(input.validTo) : undefined,
  })

  // Re-fetch with CostCenter preload
  const result = await repo.findByIdWithInclude(prisma, tenantId, created.id)
  if (!result) {
    throw new OrderNotFoundError()
  }
  return result
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    description?: string | null
    status?: string
    customer?: string | null
    costCenterId?: string | null
    billingRatePerHour?: number | null
    validFrom?: string | null
    validTo?: string | null
    isActive?: boolean
  }
) {
  // Verify order exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new OrderNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle code update
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0) {
      throw new OrderValidationError("Order code is required")
    }
    // Check uniqueness if changed
    if (code !== existing.code) {
      const existingByCode = await repo.findByCode(
        prisma,
        tenantId,
        code,
        input.id
      )
      if (existingByCode) {
        throw new OrderConflictError("Order code already exists")
      }
    }
    data.code = code
  }

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new OrderValidationError("Order name is required")
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle status update
  if (input.status !== undefined) {
    data.status = input.status
  }

  // Handle customer update
  if (input.customer !== undefined) {
    data.customer =
      input.customer === null ? null : input.customer.trim()
  }

  // Handle costCenterId update (nullable)
  if (input.costCenterId !== undefined) {
    data.costCenterId = input.costCenterId
  }

  // Handle billingRatePerHour update (nullable)
  if (input.billingRatePerHour !== undefined) {
    data.billingRatePerHour =
      input.billingRatePerHour === null
        ? null
        : new Prisma.Decimal(input.billingRatePerHour)
  }

  // Handle validFrom update (nullable)
  if (input.validFrom !== undefined) {
    data.validFrom =
      input.validFrom === null ? null : parseDate(input.validFrom)
  }

  // Handle validTo update (nullable)
  if (input.validTo !== undefined) {
    data.validTo =
      input.validTo === null ? null : parseDate(input.validTo)
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  await repo.update(prisma, input.id, data)

  // Re-fetch with CostCenter preload
  const result = await repo.findByIdWithInclude(prisma, tenantId, input.id)
  if (!result) {
    throw new OrderNotFoundError()
  }
  return result
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify order exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new OrderNotFoundError()
  }

  // Hard delete (OrderAssignments cascade via FK)
  await repo.deleteById(prisma, id)
}
