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

  // Idempotency check + batch create in a transaction to prevent duplicates
  const txResult = await prisma.$transaction(async (tx) => {
    const existing = await repo.findBatchByReference(
      tx as PrismaClient,
      tenantId,
      batchReference
    )
    if (existing) {
      return {
        batch: existing,
        wasDuplicate: true as const,
        message: `Batch '${batchReference}' already imported (${existing.recordsTotal} records)`,
      }
    }

    const batch = await repo.createImportBatch(tx as PrismaClient, {
      tenantId,
      batchReference,
      source: "terminal",
      terminalId,
      status: "processing",
      recordsTotal: input.bookings.length,
      startedAt: new Date(),
    })

    return { batch, wasDuplicate: false as const }
  })

  if (txResult.wasDuplicate) {
    return {
      batch: txResult.batch,
      wasDuplicate: true,
      message: txResult.message,
    }
  }

  const batch = txResult.batch

  try {
    // Pre-fetch lookup maps to avoid N+1
    const uniquePins = [...new Set(input.bookings.map((b) => b.employeePin))]
    const uniqueCodes = [...new Set(input.bookings.map((b) => b.rawBookingCode))]

    const [empsByPin, btsByCode] = await Promise.all([
      prisma.employee.findMany({
        where: { tenantId, pin: { in: uniquePins } },
        select: { id: true, pin: true },
      }),
      prisma.bookingType.findMany({
        where: {
          OR: [
            { tenantId, code: { in: uniqueCodes } },
            { tenantId: null, code: { in: uniqueCodes } },
          ],
        },
        select: { id: true, code: true },
      }),
    ])
    const pinMap = new Map(empsByPin.map((e) => [e.pin, e.id]))
    const codeMap = new Map(btsByCode.map((bt) => [bt.code, bt.id]))

    // Build raw booking records using pre-fetched maps
    const rawBookingData = input.bookings.map((b) => {
      const rawTimestamp = new Date(b.rawTimestamp)
      const bookingDate = new Date(
        rawTimestamp.getFullYear(),
        rawTimestamp.getMonth(),
        rawTimestamp.getDate()
      )
      return {
        tenantId,
        importBatchId: batch.id,
        terminalId,
        employeePin: b.employeePin,
        employeeId: pinMap.get(b.employeePin) ?? null,
        rawTimestamp,
        rawBookingCode: b.rawBookingCode,
        bookingDate,
        bookingTypeId: codeMap.get(b.rawBookingCode) ?? null,
        status: "pending",
      }
    })

    // Batch insert raw bookings
    await repo.createManyRawBookings(prisma, rawBookingData)

    // Mark batch as completed
    const updatedBatch = await repo.updateImportBatch(prisma, tenantId, batch.id, {
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
    await repo.updateImportBatch(prisma, tenantId, batch.id, {
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
