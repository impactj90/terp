/**
 * Terminal Booking Service
 *
 * Business logic for terminal booking and import batch operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./terminal-booking-repository"

// --- Error Classes ---

export class TerminalBookingNotFoundError extends Error {
  constructor(message = "Import batch not found") {
    super(message)
    this.name = "TerminalBookingNotFoundError"
  }
}

export class TerminalBookingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TerminalBookingValidationError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    from?: string
    to?: string
    terminalId?: string
    employeeId?: string
    importBatchId?: string
    status?: string
    limit: number
    page: number
  }
) {
  const { data, total } = await repo.findManyRawBookings(
    prisma,
    tenantId,
    params
  )

  return {
    data,
    meta: {
      total,
      limit: params.limit,
      hasMore: params.page * params.limit < total,
    },
  }
}

export async function importBookings(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    batchReference: string
    terminalId: string
    bookings: Array<{
      employeePin: string
      rawTimestamp: string
      rawBookingCode: string
    }>
  }
) {
  // Validate input
  const batchReference = input.batchReference.trim()
  if (batchReference.length === 0) {
    throw new TerminalBookingValidationError("Batch reference is required")
  }
  const terminalId = input.terminalId.trim()
  if (terminalId.length === 0) {
    throw new TerminalBookingValidationError("Terminal ID is required")
  }

  // Idempotency check
  const existing = await repo.findBatchByReference(
    prisma,
    tenantId,
    batchReference
  )
  if (existing) {
    return {
      batch: existing,
      wasDuplicate: true,
      message: `Batch '${batchReference}' already imported (${existing.recordsTotal} records)`,
    }
  }

  // Create import batch
  const batch = await repo.createImportBatch(prisma, {
    tenantId,
    batchReference,
    source: "terminal",
    terminalId,
    status: "processing",
    recordsTotal: input.bookings.length,
    startedAt: new Date(),
  })

  try {
    // Build raw booking records
    const rawBookingData = []
    for (const b of input.bookings) {
      const rawTimestamp = new Date(b.rawTimestamp)
      const bookingDate = new Date(
        rawTimestamp.getFullYear(),
        rawTimestamp.getMonth(),
        rawTimestamp.getDate()
      )

      // Resolve employee by PIN (graceful)
      let employeeId: string | null = null
      const emp = await repo.findEmployeeByPin(prisma, tenantId, b.employeePin)
      if (emp) {
        employeeId = emp.id
      }

      // Resolve booking type by code (graceful)
      let bookingTypeId: string | null = null
      const bt = await repo.findBookingTypeByCode(
        prisma,
        tenantId,
        b.rawBookingCode
      )
      if (bt) {
        bookingTypeId = bt.id
      }

      rawBookingData.push({
        tenantId,
        importBatchId: batch.id,
        terminalId,
        employeePin: b.employeePin,
        employeeId,
        rawTimestamp,
        rawBookingCode: b.rawBookingCode,
        bookingDate,
        bookingTypeId,
        status: "pending",
      })
    }

    // Batch insert raw bookings
    await repo.createManyRawBookings(prisma, rawBookingData)

    // Mark batch as completed
    const updatedBatch = await repo.updateImportBatch(prisma, batch.id, {
      status: "completed",
      recordsImported: rawBookingData.length,
      completedAt: new Date(),
    })

    return {
      batch: updatedBatch,
      wasDuplicate: false,
      message: `Successfully imported ${rawBookingData.length} records from terminal '${terminalId}'`,
    }
  } catch (error) {
    // Mark batch as failed
    await repo.updateImportBatch(prisma, batch.id, {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Unknown error",
      completedAt: new Date(),
    })
    throw error
  }
}

export async function listBatches(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: string
    terminalId?: string
    limit: number
    page: number
  }
) {
  const { data, total } = await repo.findManyBatches(
    prisma,
    tenantId,
    params
  )

  return {
    data,
    meta: {
      total,
      limit: params.limit,
      hasMore: params.page * params.limit < total,
    },
  }
}

export async function getBatchById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const batch = await repo.findBatchById(prisma, tenantId, id)
  if (!batch) {
    throw new TerminalBookingNotFoundError()
  }
  return batch
}
