/**
 * Monthly Values Repository
 *
 * Pure Prisma data-access functions for the MonthlyValue model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Shared includes ---

const monthlyValueListInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
    },
  },
} as const

// --- Functions ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    year: number
    month: number
    page?: number
    pageSize?: number
    status?: "open" | "calculated" | "closed"
    departmentId?: string
    employeeId?: string
    dataScopeWhere?: Record<string, unknown> | null
  }
) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50

  const where: Record<string, unknown> = {
    tenantId,
    year: params.year,
    month: params.month,
  }

  // Status filter (Go mapping: "closed" -> isClosed=true; "open"/"calculated" -> isClosed=false)
  if (params.status === "closed") {
    where.isClosed = true
  } else if (params.status === "open" || params.status === "calculated") {
    where.isClosed = false
  }

  // Employee filter
  if (params.employeeId) {
    where.employeeId = params.employeeId
  }

  // Department filter (via employee relation)
  if (params.departmentId) {
    where.employee = {
      ...((where.employee as Record<string, unknown>) || {}),
      departmentId: params.departmentId,
    }
  }

  // Apply data scope
  if (params.dataScopeWhere) {
    if (params.dataScopeWhere.employee && where.employee) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        ...((params.dataScopeWhere.employee as Record<string, unknown>) || {}),
      }
    } else {
      Object.assign(where, params.dataScopeWhere)
    }
  }

  const [items, total] = await Promise.all([
    prisma.monthlyValue.findMany({
      where,
      include: monthlyValueListInclude,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.monthlyValue.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.monthlyValue.findFirst({
    where: { id, tenantId },
    include: monthlyValueListInclude,
  })
}

export async function findByIdOnly(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.monthlyValue.findFirst({
    where: { id, tenantId },
    include: monthlyValueListInclude,
  })
}

export async function findByEmployeeMonth(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number
) {
  return prisma.monthlyValue.findFirst({
    where: { employeeId, year, month, tenantId },
    include: monthlyValueListInclude,
  })
}

export async function findByEmployeeYearMonth(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number
) {
  return prisma.monthlyValue.findFirst({
    where: { employeeId, year, month, tenantId },
  })
}

export async function findActiveEmployeeIds(
  prisma: PrismaClient,
  tenantId: string,
  departmentId?: string
) {
  const where: Record<string, unknown> = {
    tenantId,
    isActive: true,
  }
  if (departmentId) {
    where.departmentId = departmentId
  }
  const employees = await prisma.employee.findMany({
    where,
    select: { id: true },
  })
  return employees.map((e) => e.id)
}
