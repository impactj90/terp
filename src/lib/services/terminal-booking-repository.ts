/**
 * Terminal Booking Repository
 *
 * Pure Prisma data-access functions for RawTerminalBooking and ImportBatch models.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const rawBookingInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
    },
  },
  bookingType: {
    select: { id: true, code: true, name: true },
  },
} as const

export async function findManyRawBookings(
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
  const where: Record<string, unknown> = { tenantId }
  if (params.terminalId) {
    where.terminalId = params.terminalId
  }
  if (params.employeeId) {
    where.employeeId = params.employeeId
  }
  if (params.importBatchId) {
    where.importBatchId = params.importBatchId
  }
  if (params.status) {
    where.status = params.status
  }
  if (params.from && params.to) {
    where.bookingDate = {
      gte: new Date(params.from),
      lte: new Date(params.to),
    }
  }

  const [data, total] = await Promise.all([
    prisma.rawTerminalBooking.findMany({
      where,
      take: params.limit,
      skip: (params.page - 1) * params.limit,
      orderBy: { rawTimestamp: "desc" },
      include: rawBookingInclude,
    }),
    prisma.rawTerminalBooking.count({ where }),
  ])

  return { data, total }
}

export async function findBatchByReference(
  prisma: PrismaClient,
  tenantId: string,
  batchReference: string
) {
  return prisma.importBatch.findFirst({
    where: { tenantId, batchReference },
  })
}

export async function createImportBatch(
  prisma: PrismaClient,
  data: {
    tenantId: string
    batchReference: string
    source: string
    terminalId: string
    status: string
    recordsTotal: number
    startedAt: Date
  }
) {
  return prisma.importBatch.create({ data })
}

export async function updateImportBatch(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.importBatch.update({ where: { id }, data })
}

export async function findEmployeeByPin(
  prisma: PrismaClient,
  tenantId: string,
  pin: string
) {
  return prisma.employee.findFirst({
    where: { tenantId, pin },
  })
}

export async function findBookingTypeByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.bookingType.findFirst({
    where: {
      OR: [
        { tenantId, code },
        { tenantId: null, code },
      ],
    },
  })
}

export async function createManyRawBookings(
  prisma: PrismaClient,
  data: Array<{
    tenantId: string
    importBatchId: string
    terminalId: string
    employeePin: string
    employeeId: string | null
    rawTimestamp: Date
    rawBookingCode: string
    bookingDate: Date
    bookingTypeId: string | null
    status: string
  }>
) {
  return prisma.rawTerminalBooking.createMany({ data })
}

export async function findManyBatches(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    status?: string
    terminalId?: string
    limit: number
    page: number
  }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.status) {
    where.status = params.status
  }
  if (params.terminalId) {
    where.terminalId = params.terminalId
  }

  const [data, total] = await Promise.all([
    prisma.importBatch.findMany({
      where,
      take: params.limit,
      skip: (params.page - 1) * params.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.importBatch.count({ where }),
  ])

  return { data, total }
}

export async function findBatchById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.importBatch.findFirst({
    where: { id, tenantId },
  })
}
