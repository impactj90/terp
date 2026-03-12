/**
 * Correction Repository
 *
 * Pure Prisma data-access functions for the Correction model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const correctionInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      departmentId: true,
    },
  },
  account: {
    select: { id: true, code: true, name: true },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    page?: number
    pageSize?: number
    employeeId?: string
    fromDate?: string
    toDate?: string
    correctionType?: string
    status?: string
  }
) {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 50

  const where: Record<string, unknown> = { tenantId }

  if (params?.employeeId) {
    where.employeeId = params.employeeId
  }

  if (params?.correctionType) {
    where.correctionType = params.correctionType
  }

  if (params?.status) {
    where.status = params.status
  }

  // Date range filters
  if (params?.fromDate || params?.toDate) {
    const correctionDate: Record<string, unknown> = {}
    if (params?.fromDate) {
      correctionDate.gte = new Date(params.fromDate)
    }
    if (params?.toDate) {
      correctionDate.lte = new Date(params.toDate)
    }
    where.correctionDate = correctionDate
  }

  const [items, total] = await Promise.all([
    prisma.correction.findMany({
      where,
      include: correctionInclude,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ correctionDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.correction.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.correction.findFirst({
    where: { id, tenantId },
    include: correctionInclude,
  })
}

export async function findByIdBasic(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.correction.findFirst({
    where: { id, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    correctionDate: Date
    correctionType: string
    accountId: string | null
    valueMinutes: number
    reason: string
    status: string
    createdBy: string
  }
) {
  return prisma.correction.create({
    data,
    include: correctionInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.correction.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.correction.update({
    where: { id },
    data,
    include: correctionInclude,
  })
}

/**
 * Atomically updates a correction only if it has the expected status.
 * Returns the updated record, or null if the status didn't match (already changed).
 */
export async function updateIfStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.correction.findFirst({ where: { id, tenantId, status: expectedStatus } })
  if (!existing) {
    return null
  }
  return prisma.correction.update({
    where: { id },
    data,
    include: correctionInclude,
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.correction.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function employeeExists(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
  })
  return !!employee
}

export async function accountExists(
  prisma: PrismaClient,
  tenantId: string,
  accountId: string
) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, tenantId },
  })
  return !!account
}
