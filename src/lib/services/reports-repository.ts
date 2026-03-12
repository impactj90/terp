/**
 * Reports Repository
 *
 * Pure Prisma data-access functions for the Report model
 * and related data gathering queries.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Types ---

export interface ReportListParams {
  reportType?: string
  status?: string
  limit: number
  cursor?: string
}

export interface EmployeeScope {
  id: string
  personnelNumber: string
  firstName: string
  lastName: string
  departmentId: string | null
  costCenterId: string | null
  department: { code: string; name: string } | null
  costCenter: { code: string } | null
}

export interface ReportCreateData {
  tenantId: string
  reportType: string
  name: string
  status: string
  format: string
  parameters: unknown
  requestedAt: Date
  createdBy: string | null
}

interface AbsenceDayRow {
  absence_date: Date
  employee_id: string
  personnel_number: string
  absence_type_name: string
  status: string
  duration: number
}

// --- Report CRUD ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: ReportListParams
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.reportType) where.reportType = params.reportType
  if (params.status) where.status = params.status
  if (params.cursor) {
    where.id = { lt: params.cursor }
  }

  return prisma.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: params.limit + 1,
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.report.findFirst({
    where: { id, tenantId },
  })
}

export async function create(
  prisma: PrismaClient,
  data: ReportCreateData
) {
  return prisma.report.create({
    data: {
      tenantId: data.tenantId,
      reportType: data.reportType,
      name: data.name,
      status: data.status,
      format: data.format,
      parameters: data.parameters as never,
      requestedAt: data.requestedAt,
      createdBy: data.createdBy,
    },
  })
}

export async function updateStatus(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.report.update({
    where: { id },
    data,
  })
}

export async function deleteById(prisma: PrismaClient, id: string) {
  return prisma.report.delete({
    where: { id },
  })
}

// --- Employee Scope Queries ---

export async function findEmployeesInScope(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    departmentIds?: string[]
    costCenterIds?: string[]
    teamIds?: string[]
    employeeIds?: string[]
  }
): Promise<EmployeeScope[]> {
  const empWhere: Record<string, unknown> = {
    tenantId,
    isActive: true,
  }
  if (params.departmentIds && params.departmentIds.length > 0) {
    empWhere.departmentId = { in: params.departmentIds }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let employees: any[] = await (prisma.employee as any).findMany({
    where: empWhere,
    include: {
      department: { select: { code: true, name: true } },
      costCenter: { select: { code: true } },
    },
    take: 10000,
  })

  // Filter by cost center IDs
  if (params.costCenterIds && params.costCenterIds.length > 0) {
    const ccSet = new Set(params.costCenterIds)
    employees = employees.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (emp: any) => emp.costCenterId && ccSet.has(emp.costCenterId)
    )
  }

  // Filter by team IDs
  if (params.teamIds && params.teamIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members = await (prisma.teamMember as any).findMany({
      where: { teamId: { in: params.teamIds } },
      select: { employeeId: true },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamEmpIds = new Set((members as any[]).map((m: any) => m.employeeId))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    employees = employees.filter((emp: any) => teamEmpIds.has(emp.id))
  }

  // Filter by specific employee IDs
  if (params.employeeIds && params.employeeIds.length > 0) {
    const idSet = new Set(params.employeeIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    employees = employees.filter((emp: any) => idSet.has(emp.id))
  }

  return employees
}

// --- Monthly Value Queries ---

export async function findMonthlyValue(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.monthlyValue as any).findFirst({
    where: { tenantId, employeeId, year, month },
  })
}

// --- Vacation Balance Queries ---

export async function findVacationBalance(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.vacationBalance as any).findFirst({
    where: { tenantId, employeeId, year },
  })
}

export async function findMonthlyValuesBatch(
  prisma: PrismaClient,
  tenantId: string,
  employeeIds: string[],
  yearMonthPairs: Array<{ year: number; month: number }>
) {
  if (employeeIds.length === 0 || yearMonthPairs.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.monthlyValue as any).findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      OR: yearMonthPairs.map((ym) => ({ year: ym.year, month: ym.month })),
    },
  })
}

export async function findVacationBalancesBatch(
  prisma: PrismaClient,
  tenantId: string,
  employeeIds: string[],
  year: number
) {
  if (employeeIds.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.vacationBalance as any).findMany({
    where: { tenantId, employeeId: { in: employeeIds }, year },
  })
}

// --- Daily Value Queries ---

export async function findDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    from: Date
    to: Date
    employeeIds?: string[]
  }
) {
  const dvWhere: Record<string, unknown> = {
    tenantId,
    valueDate: {
      gte: params.from,
      lte: params.to,
    },
  }
  if (params.employeeIds && params.employeeIds.length > 0) {
    dvWhere.employeeId = { in: params.employeeIds }
  }

  return prisma.dailyValue.findMany({
    where: dvWhere,
    include: {
      employee: {
        select: {
          personnelNumber: true,
        },
      },
    },
    orderBy: [
      { valueDate: "asc" },
      { employee: { personnelNumber: "asc" } },
    ],
    take: 10000,
  })
}

// --- Absence Day Queries ---

export async function findAbsenceDays(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    from: Date
    to: Date
    employeeIds?: string[]
  }
): Promise<AbsenceDayRow[]> {
  const employeeFilter = params.employeeIds && params.employeeIds.length > 0
    ? `AND ad.employee_id = ANY($4::uuid[])`
    : ""

  const queryParams: unknown[] = [
    tenantId,
    params.from.toISOString().slice(0, 10),
    params.to.toISOString().slice(0, 10),
  ]
  if (params.employeeIds && params.employeeIds.length > 0) {
    queryParams.push(params.employeeIds)
  }

  return prisma.$queryRawUnsafe(
    `SELECT ad.absence_date, ad.employee_id, e.personnel_number,
            COALESCE(at.name, '') as absence_type_name,
            ad.status, ad.duration
     FROM absence_days ad
     JOIN employees e ON e.id = ad.employee_id
     LEFT JOIN absence_types at ON at.id = ad.absence_type_id
     WHERE ad.tenant_id = $1
       AND ad.absence_date >= $2
       AND ad.absence_date <= $3
       ${employeeFilter}
     ORDER BY ad.absence_date, e.personnel_number
     LIMIT 10000`,
    ...queryParams
  )
}
