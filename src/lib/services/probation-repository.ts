import { Prisma } from "@/generated/prisma/client"
import type { PrismaClient } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import { PROBATION_ENDING_SOON_WINDOW_DAYS, type ProbationFilter } from "./probation-service"

type EmployeeListFilters = {
  tenantId: string
  tenantProbationDefaultMonths: number
  dataScope: DataScope
  today: Date
  search?: string
  departmentId?: string
  costCenterId?: string
  employmentTypeId?: string
  locationId?: string
  isActive?: boolean
  hasExitDate?: boolean
}

export type ProbationEmployeePageParams = EmployeeListFilters & {
  probationFilter: Exclude<ProbationFilter, "ALL">
  skip: number
  take: number
}

export type ProbationDashboardParams = {
  tenantId: string
  tenantProbationDefaultMonths: number
  dataScope: DataScope
  today: Date
  limit: number
}

export type ProbationReminderCandidateParams = {
  tenantId: string
  tenantProbationDefaultMonths: number
  dataScope: DataScope
  today: Date
  reminderDays: number[]
}

export type ProbationDashboardRow = {
  id: string
  firstName: string
  lastName: string
  departmentId: string | null
  departmentName: string | null
  entryDate: Date | string
  exitDate: Date | string | null
  probationMonths: number | null
}

export type ProbationReminderCandidateRow = ProbationDashboardRow & {
  probationEndDate: Date | string
  daysRemaining: number
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildScopeCondition(dataScope: DataScope): Prisma.Sql | null {
  if (dataScope.type === "department") {
    if (dataScope.departmentIds.length === 0) {
      return Prisma.sql`1 = 0`
    }

    return Prisma.sql`e.department_id IN (${Prisma.join(
      dataScope.departmentIds.map((id) => Prisma.sql`${id}::uuid`)
    )})`
  }

  if (dataScope.type === "employee") {
    if (dataScope.employeeIds.length === 0) {
      return Prisma.sql`1 = 0`
    }

    return Prisma.sql`e.id IN (${Prisma.join(
      dataScope.employeeIds.map((id) => Prisma.sql`${id}::uuid`)
    )})`
  }

  return null
}

function buildEmployeeBaseConditions(params: EmployeeListFilters): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`e.tenant_id = ${params.tenantId}::uuid`,
    Prisma.sql`e.deleted_at IS NULL`,
  ]

  if (params.search) {
    const pattern = `%${params.search}%`
    conditions.push(
      Prisma.sql`(
        e.first_name ILIKE ${pattern}
        OR e.last_name ILIKE ${pattern}
        OR e.personnel_number ILIKE ${pattern}
        OR COALESCE(e.email, '') ILIKE ${pattern}
      )`
    )
  }

  if (params.departmentId !== undefined) {
    conditions.push(Prisma.sql`e.department_id = ${params.departmentId}::uuid`)
  }

  if (params.costCenterId !== undefined) {
    conditions.push(Prisma.sql`e.cost_center_id = ${params.costCenterId}::uuid`)
  }

  if (params.employmentTypeId !== undefined) {
    conditions.push(
      Prisma.sql`e.employment_type_id = ${params.employmentTypeId}::uuid`
    )
  }

  if (params.locationId !== undefined) {
    conditions.push(Prisma.sql`e.location_id = ${params.locationId}::uuid`)
  }

  if (params.isActive !== undefined) {
    conditions.push(Prisma.sql`e.is_active = ${params.isActive}`)
  }

  if (params.hasExitDate !== undefined) {
    conditions.push(
      params.hasExitDate
        ? Prisma.sql`e.exit_date IS NOT NULL`
        : Prisma.sql`e.exit_date IS NULL`
    )
  }

  const scopeCondition = buildScopeCondition(params.dataScope)
  if (scopeCondition) {
    conditions.push(scopeCondition)
  }

  return conditions
}

function buildProbationExpressions(
  tenantProbationDefaultMonths: number
): {
  effectiveMonthsExpr: Prisma.Sql
  probationEndDateExpr: Prisma.Sql
} {
  const effectiveMonthsExpr = Prisma.sql`COALESCE(
    e.probation_months,
    ${tenantProbationDefaultMonths}
  )`

  const probationEndDateExpr = Prisma.sql`(
    (
      e.entry_date::timestamp
      + make_interval(months => ${effectiveMonthsExpr})
    )::date
  )`

  return {
    effectiveMonthsExpr,
    probationEndDateExpr,
  }
}

function buildRelevantProbationConditions(
  tenantProbationDefaultMonths: number,
  today: Date
): {
  conditions: Prisma.Sql[]
  probationEndDateExpr: Prisma.Sql
} {
  const { effectiveMonthsExpr, probationEndDateExpr } =
    buildProbationExpressions(tenantProbationDefaultMonths)
  const todayDate = formatDateOnly(today)

  return {
    probationEndDateExpr,
    conditions: [
      Prisma.sql`e.entry_date IS NOT NULL`,
      Prisma.sql`${effectiveMonthsExpr} > 0`,
      Prisma.sql`(e.exit_date IS NULL OR e.exit_date > ${todayDate}::date)`,
    ],
  }
}

function buildProbationStatusCondition(
  probationFilter: Exclude<ProbationFilter, "ALL">,
  probationEndDateExpr: Prisma.Sql,
  today: Date
): Prisma.Sql {
  const todayDate = formatDateOnly(today)
  const windowEnd = new Date(today)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + PROBATION_ENDING_SOON_WINDOW_DAYS)
  const windowEndDate = formatDateOnly(windowEnd)

  if (probationFilter === "IN_PROBATION") {
    return Prisma.sql`${probationEndDateExpr} >= ${todayDate}::date`
  }

  if (probationFilter === "ENDS_IN_30_DAYS") {
    return Prisma.sql`${probationEndDateExpr} BETWEEN ${todayDate}::date AND ${windowEndDate}::date`
  }

  return Prisma.sql`${probationEndDateExpr} < ${todayDate}::date`
}

function joinConditions(conditions: Prisma.Sql[]): Prisma.Sql {
  return Prisma.join(conditions, " AND ")
}

export async function findEmployeeIdsByProbationFilter(
  prisma: PrismaClient,
  params: ProbationEmployeePageParams
): Promise<{ ids: string[]; total: number }> {
  const baseConditions = buildEmployeeBaseConditions(params)
  const { conditions: relevantConditions, probationEndDateExpr } =
    buildRelevantProbationConditions(
      params.tenantProbationDefaultMonths,
      params.today
    )
  const whereConditions = [
    ...baseConditions,
    ...relevantConditions,
    buildProbationStatusCondition(
      params.probationFilter,
      probationEndDateExpr,
      params.today
    ),
  ]
  const whereSql = joinConditions(whereConditions)

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM employees e
      WHERE ${whereSql}
    `),
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT e.id
      FROM employees e
      WHERE ${whereSql}
      ORDER BY e.last_name ASC, e.first_name ASC, e.id ASC
      LIMIT ${params.take}
      OFFSET ${params.skip}
    `),
  ])

  return {
    ids: idRows.map((row) => row.id),
    total: Number(countRows[0]?.total ?? 0),
  }
}

export async function findProbationDashboardRows(
  prisma: PrismaClient,
  params: ProbationDashboardParams
): Promise<{ total: number; items: ProbationDashboardRow[] }> {
  const baseConditions = buildEmployeeBaseConditions({
    tenantId: params.tenantId,
    tenantProbationDefaultMonths: params.tenantProbationDefaultMonths,
    dataScope: params.dataScope,
    today: params.today,
  })
  const { conditions: relevantConditions, probationEndDateExpr } =
    buildRelevantProbationConditions(
      params.tenantProbationDefaultMonths,
      params.today
    )
  const whereConditions = [
    ...baseConditions,
    ...relevantConditions,
    buildProbationStatusCondition(
      "ENDS_IN_30_DAYS",
      probationEndDateExpr,
      params.today
    ),
  ]
  const whereSql = joinConditions(whereConditions)

  const [countRows, items] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM employees e
      WHERE ${whereSql}
    `),
    prisma.$queryRaw<ProbationDashboardRow[]>(Prisma.sql`
      SELECT
        e.id,
        e.first_name AS "firstName",
        e.last_name AS "lastName",
        e.department_id AS "departmentId",
        d.name AS "departmentName",
        e.entry_date AS "entryDate",
        e.exit_date AS "exitDate",
        e.probation_months AS "probationMonths"
      FROM employees e
      LEFT JOIN departments d
        ON d.id = e.department_id
      WHERE ${whereSql}
      ORDER BY ${probationEndDateExpr} ASC, e.last_name ASC, e.first_name ASC, e.id ASC
      LIMIT ${params.limit}
    `),
  ])

  return {
    total: Number(countRows[0]?.total ?? 0),
    items,
  }
}

export async function findDueProbationReminderCandidates(
  prisma: PrismaClient,
  params: ProbationReminderCandidateParams
): Promise<ProbationReminderCandidateRow[]> {
  if (params.reminderDays.length === 0) {
    return []
  }

  const baseConditions = buildEmployeeBaseConditions({
    tenantId: params.tenantId,
    tenantProbationDefaultMonths: params.tenantProbationDefaultMonths,
    dataScope: params.dataScope,
    today: params.today,
  })
  const { conditions: relevantConditions, probationEndDateExpr } =
    buildRelevantProbationConditions(
      params.tenantProbationDefaultMonths,
      params.today
    )
  const todayDate = formatDateOnly(params.today)
  const daysRemainingExpr = Prisma.sql`(${probationEndDateExpr} - ${todayDate}::date)`
  const dueStagesCondition = Prisma.sql`${daysRemainingExpr} IN (${Prisma.join(
    params.reminderDays.map((day) => Prisma.sql`${day}`)
  )})`
  const whereConditions = [
    ...baseConditions,
    ...relevantConditions,
    buildProbationStatusCondition(
      "ENDS_IN_30_DAYS",
      probationEndDateExpr,
      params.today
    ),
    dueStagesCondition,
  ]
  const whereSql = joinConditions(whereConditions)

  return prisma.$queryRaw<ProbationReminderCandidateRow[]>(Prisma.sql`
    SELECT
      e.id,
      e.first_name AS "firstName",
      e.last_name AS "lastName",
      e.department_id AS "departmentId",
      d.name AS "departmentName",
      e.entry_date AS "entryDate",
      e.exit_date AS "exitDate",
      e.probation_months AS "probationMonths",
      ${probationEndDateExpr} AS "probationEndDate",
      ${daysRemainingExpr}::int AS "daysRemaining"
    FROM employees e
    LEFT JOIN departments d
      ON d.id = e.department_id
    WHERE ${whereSql}
    ORDER BY ${probationEndDateExpr} ASC, e.last_name ASC, e.first_name ASC, e.id ASC
  `)
}
