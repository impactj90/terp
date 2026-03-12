/**
 * Order Booking Service
 *
 * Business logic for order booking operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./order-booking-repository"

// --- Error Classes ---

export class OrderBookingNotFoundError extends Error {
  constructor(message = "Order booking not found") {
    super(message)
    this.name = "OrderBookingNotFoundError"
  }
}

export class OrderBookingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderBookingValidationError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    page: number
    pageSize: number
    employeeId?: string
    orderId?: string
    fromDate?: string
    toDate?: string
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const booking = await repo.findById(prisma, tenantId, id)
  if (!booking) {
    throw new OrderBookingNotFoundError()
  }
  return booking
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  input: {
    employeeId: string
    orderId: string
    activityId?: string
    bookingDate: string
    timeMinutes: number
    description?: string
  }
) {
  // Validate employee exists in tenant
  const employee = await repo.findEmployee(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new OrderBookingValidationError("Employee not found")
  }

  // Validate order exists in tenant
  const order = await repo.findOrder(prisma, tenantId, input.orderId)
  if (!order) {
    throw new OrderBookingValidationError("Order not found")
  }

  // Validate activity exists in tenant (if provided)
  if (input.activityId) {
    const activity = await repo.findActivity(
      prisma,
      tenantId,
      input.activityId
    )
    if (!activity) {
      throw new OrderBookingValidationError("Activity not found")
    }
  }

  // Create order booking
  const created = await repo.create(prisma, {
    tenantId,
    employeeId: input.employeeId,
    orderId: input.orderId,
    activityId: input.activityId || null,
    bookingDate: new Date(input.bookingDate),
    timeMinutes: input.timeMinutes,
    description: input.description?.trim() || null,
    source: "manual",
    createdBy: userId,
    updatedBy: userId,
  })

  // Re-fetch with includes
  const result = await repo.findByIdWithInclude(prisma, tenantId, created.id)
  if (!result) {
    throw new OrderBookingNotFoundError()
  }
  return result
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  input: {
    id: string
    orderId?: string
    activityId?: string | null
    bookingDate?: string
    timeMinutes?: number
    description?: string | null
  }
) {
  // Fetch existing (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new OrderBookingNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = { updatedBy: userId }

  if (input.orderId !== undefined) {
    // Validate order exists in tenant
    const order = await repo.findOrder(prisma, tenantId, input.orderId)
    if (!order) {
      throw new OrderBookingValidationError("Order not found")
    }
    data.orderId = input.orderId
  }

  if (input.activityId !== undefined) {
    if (input.activityId !== null) {
      // Validate activity exists in tenant
      const activity = await repo.findActivity(
        prisma,
        tenantId,
        input.activityId
      )
      if (!activity) {
        throw new OrderBookingValidationError("Activity not found")
      }
    }
    data.activityId = input.activityId
  }

  if (input.bookingDate !== undefined) {
    data.bookingDate = new Date(input.bookingDate)
  }

  if (input.timeMinutes !== undefined) {
    data.timeMinutes = input.timeMinutes
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Update
  await repo.update(prisma, input.id, data)

  // Re-fetch with includes
  const result = await repo.findByIdWithInclude(prisma, tenantId, input.id)
  if (!result) {
    throw new OrderBookingNotFoundError()
  }
  return result
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Fetch existing (tenant-scoped)
  const existing = await repo.findByIdSimple(prisma, tenantId, id)
  if (!existing) {
    throw new OrderBookingNotFoundError()
  }

  await repo.deleteById(prisma, id)
}
