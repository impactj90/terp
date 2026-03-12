/**
 * Payroll Export Repository
 *
 * Pure Prisma data-access functions for the PayrollExport model.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    year?: number
    month?: number
    status?: string
    limit?: number
    cursor?: string
  }
) {
  const limit = params?.limit ?? 20
  const where: Record<string, unknown> = { tenantId }

  if (params?.year) where.year = params.year
  if (params?.month) where.month = params.month
  if (params?.status) where.status = params.status

  if (params?.cursor) {
    where.id = { lt: params.cursor }
  }

  const exports = await prisma.payrollExport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  })

  const hasMore = exports.length > limit
  if (hasMore) {
    exports.pop()
  }

  return { exports, hasMore }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.payrollExport.findFirst({
    where: { id, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    exportInterfaceId: string | null
    year: number
    month: number
    status: string
    exportType: string
    format: string
    parameters: Prisma.InputJsonValue
    requestedAt: Date
    createdBy: string | null
  }
) {
  return prisma.payrollExport.create({ data })
}

export async function update(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.payrollExport.update({
    where: { id },
    data,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.payrollExport.delete({
    where: { id },
  })
}

export async function findEmployeesWithRelations(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    departmentIds?: string[]
    employeeIds?: string[]
  }
) {
  const empWhere: Record<string, unknown> = {
    tenantId,
    isActive: true,
  }
  if (params?.departmentIds && params.departmentIds.length > 0) {
    empWhere.departmentId = { in: params.departmentIds }
  }

  let employees = await prisma.employee.findMany({
    where: empWhere,
    include: {
      department: { select: { code: true } },
      costCenter: { select: { code: true } },
    },
    take: 10000,
  })

  // Filter by specific employee IDs if provided
  if (params?.employeeIds && params.employeeIds.length > 0) {
    const idSet = new Set(params.employeeIds)
    employees = employees.filter((e) => idSet.has(e.id))
  }

  return employees
}

export async function findMonthlyValue(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number
) {
  return prisma.monthlyValue.findFirst({
    where: { tenantId, employeeId, year, month },
  })
}

export async function findMonthlyValuesBatch(
  prisma: PrismaClient,
  tenantId: string,
  employeeIds: string[],
  year: number,
  month: number
) {
  if (employeeIds.length === 0) return []
  return prisma.monthlyValue.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, year, month },
  })
}

export async function findExportInterfaceAccounts(
  prisma: PrismaClient,
  exportInterfaceId: string
) {
  return prisma.exportInterfaceAccount.findMany({
    where: { exportInterfaceId },
    orderBy: { sortOrder: "asc" },
  })
}

export async function findAccountsByIds(
  prisma: PrismaClient,
  ids: string[]
) {
  return prisma.account.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true },
  })
}
