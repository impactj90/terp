/**
 * Reports Router
 *
 * Provides list, getById, generate, download, and delete
 * operations for reports via tRPC procedures.
 *
 * Replaces the Go backend report endpoints:
 * - GET    /reports               -> reports.list
 * - POST   /reports               -> reports.generate
 * - GET    /reports/{id}          -> reports.getById
 * - DELETE /reports/{id}          -> reports.delete
 * - GET    /reports/{id}/download -> reports.download
 *
 * NOTE: Only CSV and JSON formats are supported in this implementation.
 * XLSX and PDF formats require additional Node.js libraries and are
 * deferred to a follow-up ticket.
 *
 * @see apps/api/internal/service/report.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const REPORTS_VIEW = permissionIdByKey("reports.view")!
const REPORTS_MANAGE = permissionIdByKey("reports.manage")!

// --- Enums ---

const reportTypeEnum = z.enum([
  "daily_overview",
  "weekly_overview",
  "monthly_overview",
  "employee_timesheet",
  "department_summary",
  "absence_report",
  "vacation_report",
  "overtime_report",
  "account_balances",
  "custom",
])

const reportStatusEnum = z.enum(["pending", "generating", "completed", "failed"])
const reportFormatEnum = z.enum(["csv", "json"])

// --- Output Schemas ---

const reportOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  reportType: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  format: z.string(),
  parameters: z.unknown(),
  fileSize: z.number().nullable(),
  rowCount: z.number().nullable(),
  errorMessage: z.string().nullable(),
  requestedAt: z.date(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Helper Types ---

interface ReportRow {
  headers: string[]
  values: string[][]
}

interface ReportParameters {
  fromDate?: string
  toDate?: string
  employeeIds?: string[]
  departmentIds?: string[]
  costCenterIds?: string[]
  teamIds?: string[]
}

// --- Utility Functions (ported from Go report.go) ---

function requiresDateRange(reportType: string): boolean {
  return [
    "daily_overview",
    "weekly_overview",
    "monthly_overview",
    "employee_timesheet",
    "absence_report",
    "overtime_report",
    "department_summary",
    "account_balances",
  ].includes(reportType)
}

function parseDateRange(
  fromStr?: string,
  toStr?: string
): { from: Date | null; to: Date | null } {
  let from: Date | null = null
  let to: Date | null = null

  if (fromStr) {
    const parsed = new Date(fromStr + "T00:00:00Z")
    if (!isNaN(parsed.getTime())) from = parsed
  }
  if (toStr) {
    const parsed = new Date(toStr + "T00:00:00Z")
    if (!isNaN(parsed.getTime())) to = parsed
  }

  return { from, to }
}

function iterateMonths(
  from: Date | null,
  to: Date | null,
  fn: (year: number, month: number) => void
): void {
  if (!from || !to) return
  const current = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (current <= end) {
    fn(current.getFullYear(), current.getMonth() + 1) // 1-indexed month
    current.setMonth(current.getMonth() + 1)
  }
}

function minutesToHoursString(minutes: number): string {
  const h = Math.trunc(minutes / 60)
  let m = minutes % 60
  if (m < 0) m = -m
  if (minutes < 0 && h === 0) {
    return `-${h}:${String(m).padStart(2, "0")}`
  }
  return `${h}:${String(m).padStart(2, "0")}`
}

function formatReportName(reportType: string): string {
  let name = reportType.replace(/_/g, " ")
  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1)
  }
  return `${name} - ${new Date().toISOString().slice(0, 10)}`
}

function decimalToNumber(val: unknown): number {
  if (val == null) return 0
  return Number(val)
}

function generateReportCSV(data: ReportRow): string {
  const escapeField = (field: string): string => {
    if (field.includes(";") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`
    }
    return field
  }

  const rows = [data.headers.map(escapeField).join(";")]
  for (const row of data.values) {
    rows.push(row.map(escapeField).join(";"))
  }
  return rows.join("\n") + "\n"
}

function generateReportJSON(data: ReportRow): string {
  const rows = data.values.map((row) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < data.headers.length; i++) {
      const header = data.headers[i]
      if (header !== undefined) {
        obj[header] = i < row.length ? (row[i] ?? "") : ""
      }
    }
    return obj
  })
  return JSON.stringify(rows, null, 2)
}

// --- File content strip helper ---

function stripFileContent<T extends { fileContent?: unknown }>(record: T): Omit<T, "fileContent"> {
  const { fileContent: _, ...rest } = record
  return rest
}

// --- Router ---

export const reportsRouter = createTRPCRouter({
  /**
   * reports.list -- Returns reports with cursor-based pagination.
   *
   * Strips fileContent from output.
   *
   * Requires: reports.view permission
   */
  list: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(
      z.object({
        reportType: reportTypeEnum.optional(),
        status: reportStatusEnum.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().uuid().optional(),
      }).optional()
    )
    .output(
      z.object({
        data: z.array(reportOutputSchema),
        meta: z.object({
          hasMore: z.boolean(),
          nextCursor: z.string().uuid().optional(),
        }),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const limit = input?.limit ?? 20
      const where: Record<string, unknown> = { tenantId }

      if (input?.reportType) where.reportType = input.reportType
      if (input?.status) where.status = input.status

      if (input?.cursor) {
        where.id = { lt: input.cursor }
      }

      const reports = await ctx.prisma.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      })

      const hasMore = reports.length > limit
      if (hasMore) {
        reports.pop()
      }

      const data = reports.map((r) => stripFileContent(r))
      const lastReport = reports[reports.length - 1]
      const nextCursor = hasMore && lastReport
        ? lastReport.id
        : undefined

      return {
        data,
        meta: { hasMore, nextCursor },
      }
    }),

  /**
   * reports.getById -- Returns a single report by ID.
   *
   * Strips fileContent from output.
   *
   * Requires: reports.view permission
   */
  getById: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .output(reportOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const report = await ctx.prisma.report.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        })
      }

      return stripFileContent(report)
    }),

  /**
   * reports.generate -- Generates a report synchronously.
   *
   * Supports CSV and JSON formats.
   * Validates reportType, format, and date range requirements.
   *
   * Requires: reports.manage permission
   */
  generate: tenantProcedure
    .use(requirePermission(REPORTS_MANAGE))
    .input(
      z.object({
        reportType: reportTypeEnum,
        format: reportFormatEnum,
        name: z.string().max(255).optional(),
        parameters: z.object({
          fromDate: z.string().optional(),
          toDate: z.string().optional(),
          employeeIds: z.array(z.string().uuid()).optional(),
          departmentIds: z.array(z.string().uuid()).optional(),
          costCenterIds: z.array(z.string().uuid()).optional(),
          teamIds: z.array(z.string().uuid()).optional(),
        }).optional(),
      })
    )
    .output(reportOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Check date range requirement
      if (requiresDateRange(input.reportType)) {
        if (!input.parameters?.fromDate || !input.parameters?.toDate) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "from_date and to_date are required for this report type",
          })
        }
      }

      const reportName = input.name || formatReportName(input.reportType)

      const params: ReportParameters = {
        fromDate: input.parameters?.fromDate,
        toDate: input.parameters?.toDate,
        employeeIds: input.parameters?.employeeIds,
        departmentIds: input.parameters?.departmentIds,
        costCenterIds: input.parameters?.costCenterIds,
        teamIds: input.parameters?.teamIds,
      }

      // Create report record in pending status
      let report = await ctx.prisma.report.create({
        data: {
          tenantId,
          reportType: input.reportType,
          name: reportName,
          status: "pending",
          format: input.format,
          parameters: JSON.parse(JSON.stringify(params)),
          requestedAt: new Date(),
          createdBy: ctx.user?.id || null,
        },
      })

      try {
        // Update to generating status
        report = await ctx.prisma.report.update({
          where: { id: report.id },
          data: { status: "generating", startedAt: new Date() },
        })

        // Get employees in scope
        const employees = await getEmployeesInScope(ctx, tenantId, params)

        // Gather data based on report type
        let data: ReportRow

        switch (input.reportType) {
          case "monthly_overview":
            data = await gatherMonthlyOverview(ctx, params, employees)
            break
          case "overtime_report":
            data = await gatherOvertimeReport(ctx, params, employees)
            break
          case "department_summary":
            data = await gatherDepartmentSummary(ctx, params, employees)
            break
          case "account_balances":
            data = await gatherAccountBalances(ctx, params, employees)
            break
          case "vacation_report":
            data = await gatherVacationReport(ctx, params, employees)
            break
          case "daily_overview":
          case "weekly_overview":
          case "employee_timesheet":
            data = await gatherDailyOverview(ctx, params, tenantId)
            break
          case "absence_report":
            data = await gatherAbsenceReport(ctx, params, tenantId)
            break
          case "custom":
            data = {
              headers: ["Info"],
              values: [["Custom report - no data"]],
            }
            break
          default:
            throw new Error(`Unsupported report type: ${input.reportType}`)
        }

        // Generate file content
        let content: string
        if (input.format === "json") {
          content = generateReportJSON(data)
        } else {
          content = generateReportCSV(data)
        }

        const contentBuffer = Buffer.from(content)

        // Update record as completed
        report = await ctx.prisma.report.update({
          where: { id: report.id },
          data: {
            status: "completed",
            fileContent: contentBuffer,
            fileSize: contentBuffer.length,
            rowCount: data.values.length,
            completedAt: new Date(),
          },
        })
      } catch (err) {
        // On error, set status to failed
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        report = await ctx.prisma.report.update({
          where: { id: report.id },
          data: {
            status: "failed",
            errorMessage,
            completedAt: new Date(),
          },
        })
      }

      return stripFileContent(report)
    }),

  /**
   * reports.download -- Returns base64-encoded file content for download.
   *
   * Requires: reports.view permission
   */
  download: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .output(
      z.object({
        content: z.string(),
        contentType: z.string(),
        filename: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const report = await ctx.prisma.report.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        })
      }

      if (report.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Report is not ready (still generating or not started)",
        })
      }

      if (!report.fileContent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Report has no file content",
        })
      }

      // Determine content type based on format
      let contentType = "text/csv"
      let ext = "csv"
      switch (report.format) {
        case "json":
          contentType = "application/json"
          ext = "json"
          break
        case "xlsx":
          contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          ext = "xlsx"
          break
        case "pdf":
          contentType = "application/pdf"
          ext = "pdf"
          break
      }

      const filename = `report_${report.id.slice(0, 8)}.${ext}`
      const content = Buffer.from(report.fileContent).toString("base64")

      return { content, contentType, filename }
    }),

  /**
   * reports.delete -- Deletes a report.
   *
   * Requires: reports.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(REPORTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const existing = await ctx.prisma.report.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        })
      }

      await ctx.prisma.report.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})

// --- Data Gathering Functions (ported from Go report.go) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEmployeesInScope(
  ctx: AnyCtx,
  tenantId: string,
  params: ReportParameters
): Promise<Array<{
  id: string
  personnelNumber: string
  firstName: string
  lastName: string
  departmentId: string | null
  costCenterId: string | null
  department: { code: string; name: string } | null
  costCenter: { code: string } | null
}>> {
  const empWhere: Record<string, unknown> = {
    tenantId,
    isActive: true,
  }
  if (params.departmentIds && params.departmentIds.length > 0) {
    empWhere.departmentId = { in: params.departmentIds }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let employees = await (ctx.prisma.employee as any).findMany({
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
    const teamEmpIds = new Set<string>()
    for (const teamId of params.teamIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members = await (ctx.prisma.teamMember as any).findMany({
        where: { teamId },
        select: { employeeId: true },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of members as any[]) {
        teamEmpIds.add(m.employeeId)
      }
    }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherMonthlyOverview(ctx: AnyCtx, params: ReportParameters, employees: any[]): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "PersonnelNumber", "FirstName", "LastName",
      "Year", "Month",
      "TargetHours", "WorkedHours", "OvertimeHours",
      "VacationDays", "SickDays", "OtherAbsenceDays",
      "FlextimeEnd", "IsClosed",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)

  for (const emp of employees) {
    const months: Array<{ year: number; month: number }> = []
    iterateMonths(from, to, (year, month) => {
      months.push({ year, month })
    })

    for (const { year, month } of months) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mv = await (ctx.prisma.monthlyValue as any).findFirst({
        where: { employeeId: emp.id, year, month },
      })
      if (!mv) continue

      const targetHours = (mv.totalTargetTime / 60).toFixed(2)
      const workedHours = (mv.totalNetTime / 60).toFixed(2)
      const overtimeHours = (mv.totalOvertime / 60).toFixed(2)
      const flextimeEnd = (mv.flextimeEnd / 60).toFixed(2)
      const closed = mv.isClosed ? "Yes" : "No"

      data.values.push([
        emp.personnelNumber,
        emp.firstName,
        emp.lastName,
        String(year),
        String(month),
        targetHours,
        workedHours,
        overtimeHours,
        decimalToNumber(mv.vacationTaken).toFixed(2),
        String(mv.sickDays),
        String(mv.otherAbsenceDays),
        flextimeEnd,
        closed,
      ])
    }
  }

  return data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherOvertimeReport(ctx: AnyCtx, params: ReportParameters, employees: any[]): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "PersonnelNumber", "FirstName", "LastName",
      "Year", "Month",
      "TargetHours", "WorkedHours", "OvertimeHours",
      "FlextimeEnd",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)

  for (const emp of employees) {
    const months: Array<{ year: number; month: number }> = []
    iterateMonths(from, to, (year, month) => {
      months.push({ year, month })
    })

    for (const { year, month } of months) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mv = await (ctx.prisma.monthlyValue as any).findFirst({
        where: { employeeId: emp.id, year, month },
      })
      if (!mv) continue

      data.values.push([
        emp.personnelNumber,
        emp.firstName,
        emp.lastName,
        String(year),
        String(month),
        (mv.totalTargetTime / 60).toFixed(2),
        (mv.totalNetTime / 60).toFixed(2),
        (mv.totalOvertime / 60).toFixed(2),
        (mv.flextimeEnd / 60).toFixed(2),
      ])
    }
  }

  return data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherDepartmentSummary(ctx: AnyCtx, params: ReportParameters, employees: any[]): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "Department", "EmployeeCount",
      "TotalTargetHours", "TotalWorkedHours", "TotalOvertimeHours",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)

  // Group employees by department
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deptMap = new Map<string, any[]>()
  for (const emp of employees) {
    const deptName = emp.department?.name ?? "Unknown"
    if (!deptMap.has(deptName)) {
      deptMap.set(deptName, [])
    }
    deptMap.get(deptName)!.push(emp)
  }

  for (const [deptName, deptEmps] of deptMap) {
    let totalTarget = 0
    let totalWorked = 0
    let totalOT = 0

    for (const emp of deptEmps) {
      const months: Array<{ year: number; month: number }> = []
      iterateMonths(from, to, (year, month) => {
        months.push({ year, month })
      })

      for (const { year, month } of months) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mv = await (ctx.prisma.monthlyValue as any).findFirst({
          where: { employeeId: emp.id, year, month },
        })
        if (!mv) continue
        totalTarget += mv.totalTargetTime / 60
        totalWorked += mv.totalNetTime / 60
        totalOT += mv.totalOvertime / 60
      }
    }

    data.values.push([
      deptName,
      String(deptEmps.length),
      totalTarget.toFixed(2),
      totalWorked.toFixed(2),
      totalOT.toFixed(2),
    ])
  }

  return data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherAccountBalances(ctx: AnyCtx, params: ReportParameters, employees: any[]): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "PersonnelNumber", "FirstName", "LastName",
      "Year", "Month",
      "FlextimeStart", "FlextimeChange", "FlextimeEnd",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)

  for (const emp of employees) {
    const months: Array<{ year: number; month: number }> = []
    iterateMonths(from, to, (year, month) => {
      months.push({ year, month })
    })

    for (const { year, month } of months) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mv = await (ctx.prisma.monthlyValue as any).findFirst({
        where: { employeeId: emp.id, year, month },
      })
      if (!mv) continue

      data.values.push([
        emp.personnelNumber,
        emp.firstName,
        emp.lastName,
        String(year),
        String(month),
        (mv.flextimeStart / 60).toFixed(2),
        (mv.flextimeChange / 60).toFixed(2),
        (mv.flextimeEnd / 60).toFixed(2),
      ])
    }
  }

  return data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherVacationReport(ctx: AnyCtx, params: ReportParameters, employees: any[]): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "PersonnelNumber", "FirstName", "LastName",
      "Year", "Entitlement", "Carryover",
      "Adjustments", "Taken", "Remaining",
    ],
    values: [],
  }

  let year = new Date().getFullYear()
  if (params.fromDate) {
    const parsed = new Date(params.fromDate + "T00:00:00Z")
    if (!isNaN(parsed.getTime())) {
      year = parsed.getFullYear()
    }
  }

  for (const emp of employees) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vb = await (ctx.prisma.vacationBalance as any).findFirst({
      where: { employeeId: emp.id, year },
    })
    if (!vb) continue

    const entitlement = decimalToNumber(vb.entitlement)
    const carryover = decimalToNumber(vb.carryover)
    const adjustments = decimalToNumber(vb.adjustments)
    const taken = decimalToNumber(vb.taken)
    const remaining = entitlement + carryover + adjustments - taken

    data.values.push([
      emp.personnelNumber,
      emp.firstName,
      emp.lastName,
      String(year),
      entitlement.toFixed(2),
      carryover.toFixed(2),
      adjustments.toFixed(2),
      taken.toFixed(2),
      remaining.toFixed(2),
    ])
  }

  return data
}

async function gatherDailyOverview(ctx: AnyCtx, params: ReportParameters, tenantId: string): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "Date", "EmployeeID", "PersonnelNumber",
      "GrossTime", "NetTime", "TargetTime",
      "Overtime", "Undertime", "BreakTime",
      "Status",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)
  if (!from || !to) return data

  const dvWhere: Record<string, unknown> = {
    tenantId,
    valueDate: {
      gte: from,
      lte: to,
    },
  }
  if (params.employeeIds && params.employeeIds.length > 0) {
    dvWhere.employeeId = { in: params.employeeIds }
  }

  const values = await ctx.prisma.dailyValue.findMany({
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

  for (const dv of values) {
    data.values.push([
      dv.valueDate instanceof Date
        ? dv.valueDate.toISOString().slice(0, 10)
        : String(dv.valueDate),
      String(dv.employeeId),
      dv.employee.personnelNumber || "",
      minutesToHoursString(dv.grossTime || 0),
      minutesToHoursString(dv.netTime || 0),
      minutesToHoursString(dv.targetTime || 0),
      minutesToHoursString(dv.overtime || 0),
      minutesToHoursString(dv.undertime || 0),
      minutesToHoursString(dv.breakTime || 0),
      dv.status || "",
    ])
  }

  return data
}

async function gatherAbsenceReport(ctx: AnyCtx, params: ReportParameters, tenantId: string): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "Date", "EmployeeID", "PersonnelNumber",
      "AbsenceType", "Status", "Duration",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)
  if (!from || !to) return data

  const employeeFilter = params.employeeIds && params.employeeIds.length > 0
    ? `AND ad.employee_id = ANY($3::uuid[])`
    : ""

  const queryParams: unknown[] = [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
  if (params.employeeIds && params.employeeIds.length > 0) {
    queryParams.push(params.employeeIds)
  }

  interface AbsenceDayRow {
    absence_date: Date
    employee_id: string
    personnel_number: string
    absence_type_name: string
    status: string
    duration: number
  }

  const days: AbsenceDayRow[] = await ctx.prisma.$queryRawUnsafe(
    `SELECT ad.absence_date, ad.employee_id, e.personnel_number,
            COALESCE(at.name, '') as absence_type_name,
            ad.status, ad.duration
     FROM absence_days ad
     JOIN employees e ON e.id = ad.employee_id
     LEFT JOIN absence_types at ON at.id = ad.absence_type_id
     WHERE ad.tenant_id = '${tenantId}'
       AND ad.absence_date >= $1
       AND ad.absence_date <= $2
       ${employeeFilter}
     ORDER BY ad.absence_date, e.personnel_number
     LIMIT 10000`,
    ...queryParams
  )

  for (const ad of days) {
    data.values.push([
      ad.absence_date instanceof Date
        ? ad.absence_date.toISOString().slice(0, 10)
        : String(ad.absence_date),
      String(ad.employee_id),
      ad.personnel_number || "",
      ad.absence_type_name || "",
      ad.status || "",
      decimalToNumber(ad.duration).toFixed(2),
    ])
  }

  return data
}
