/**
 * Reports Service
 *
 * Business logic for report operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./reports-repository"
import type { EmployeeScope } from "./reports-repository"

// --- Error Classes ---

export class ReportNotFoundError extends Error {
  constructor(message = "Report not found") {
    super(message)
    this.name = "ReportNotFoundError"
  }
}

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReportValidationError"
  }
}

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

// --- Utility Functions ---

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

function stripFileContent<T extends { fileContent?: unknown }>(
  record: T
): Omit<T, "fileContent"> {
  const { fileContent: _fileContent, ...rest } = record
  return rest
}

// --- Data Gathering Functions ---

async function gatherMonthlyOverview(
  prisma: PrismaClient,
  tenantId: string,
  params: ReportParameters,
  employees: EmployeeScope[]
): Promise<ReportRow> {
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
  const months: Array<{ year: number; month: number }> = []
  iterateMonths(from, to, (year, month) => {
    months.push({ year, month })
  })

  const empIds = employees.map((e) => e.id)
  const allMvs = await repo.findMonthlyValuesBatch(prisma, tenantId, empIds, months)
  const mvMap = new Map<string, (typeof allMvs)[number]>()
  for (const mv of allMvs) {
    mvMap.set(`${mv.employeeId}-${mv.year}-${mv.month}`, mv)
  }

  for (const emp of employees) {
    for (const { year, month } of months) {
      const mv = mvMap.get(`${emp.id}-${year}-${month}`)
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

async function gatherOvertimeReport(
  prisma: PrismaClient,
  tenantId: string,
  params: ReportParameters,
  employees: EmployeeScope[]
): Promise<ReportRow> {
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
  const months: Array<{ year: number; month: number }> = []
  iterateMonths(from, to, (year, month) => {
    months.push({ year, month })
  })

  const empIds = employees.map((e) => e.id)
  const allMvs = await repo.findMonthlyValuesBatch(prisma, tenantId, empIds, months)
  const mvMap = new Map<string, (typeof allMvs)[number]>()
  for (const mv of allMvs) {
    mvMap.set(`${mv.employeeId}-${mv.year}-${mv.month}`, mv)
  }

  for (const emp of employees) {
    for (const { year, month } of months) {
      const mv = mvMap.get(`${emp.id}-${year}-${month}`)
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

async function gatherDepartmentSummary(
  prisma: PrismaClient,
  tenantId: string,
  params: ReportParameters,
  employees: EmployeeScope[]
): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "Department", "EmployeeCount",
      "TotalTargetHours", "TotalWorkedHours", "TotalOvertimeHours",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)
  const months: Array<{ year: number; month: number }> = []
  iterateMonths(from, to, (year, month) => {
    months.push({ year, month })
  })

  const empIds = employees.map((e) => e.id)
  const allMvs = await repo.findMonthlyValuesBatch(prisma, tenantId, empIds, months)
  const mvMap = new Map<string, (typeof allMvs)[number]>()
  for (const mv of allMvs) {
    mvMap.set(`${mv.employeeId}-${mv.year}-${mv.month}`, mv)
  }

  // Group employees by department
  const deptMap = new Map<string, EmployeeScope[]>()
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
      for (const { year, month } of months) {
        const mv = mvMap.get(`${emp.id}-${year}-${month}`)
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

async function gatherAccountBalances(
  prisma: PrismaClient,
  tenantId: string,
  params: ReportParameters,
  employees: EmployeeScope[]
): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "PersonnelNumber", "FirstName", "LastName",
      "Year", "Month",
      "FlextimeStart", "FlextimeChange", "FlextimeEnd",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)
  const months: Array<{ year: number; month: number }> = []
  iterateMonths(from, to, (year, month) => {
    months.push({ year, month })
  })

  const empIds = employees.map((e) => e.id)
  const allMvs = await repo.findMonthlyValuesBatch(prisma, tenantId, empIds, months)
  const mvMap = new Map<string, (typeof allMvs)[number]>()
  for (const mv of allMvs) {
    mvMap.set(`${mv.employeeId}-${mv.year}-${mv.month}`, mv)
  }

  for (const emp of employees) {
    for (const { year, month } of months) {
      const mv = mvMap.get(`${emp.id}-${year}-${month}`)
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

async function gatherVacationReport(
  prisma: PrismaClient,
  tenantId: string,
  params: ReportParameters,
  employees: EmployeeScope[]
): Promise<ReportRow> {
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

  const empIds = employees.map((e) => e.id)
  const allVbs = await repo.findVacationBalancesBatch(prisma, tenantId, empIds, year)
  const vbMap = new Map<string, (typeof allVbs)[number]>()
  for (const vb of allVbs) {
    vbMap.set(vb.employeeId, vb)
  }

  for (const emp of employees) {
    const vb = vbMap.get(emp.id)
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

async function gatherDailyOverview(
  prisma: PrismaClient,
  params: ReportParameters,
  tenantId: string
): Promise<ReportRow> {
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

  const values = await repo.findDailyValues(prisma, tenantId, {
    from,
    to,
    employeeIds: params.employeeIds,
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

async function gatherAbsenceReport(
  prisma: PrismaClient,
  params: ReportParameters,
  tenantId: string
): Promise<ReportRow> {
  const data: ReportRow = {
    headers: [
      "Date", "EmployeeID", "PersonnelNumber",
      "AbsenceType", "Status", "Duration",
    ],
    values: [],
  }

  const { from, to } = parseDateRange(params.fromDate, params.toDate)
  if (!from || !to) return data

  const days = await repo.findAbsenceDays(prisma, tenantId, {
    from,
    to,
    employeeIds: params.employeeIds,
  })

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

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    reportType?: string
    status?: string
    limit?: number
    cursor?: string
  }
) {
  const limit = params?.limit ?? 20

  const reports = await repo.findMany(prisma, tenantId, {
    reportType: params?.reportType,
    status: params?.status,
    limit,
    cursor: params?.cursor,
  })

  const hasMore = reports.length > limit
  if (hasMore) {
    reports.pop()
  }

  const data = reports.map((r) => stripFileContent(r))
  const lastReport = reports[reports.length - 1]
  const nextCursor = hasMore && lastReport ? lastReport.id : undefined

  return {
    data,
    meta: { hasMore, nextCursor },
  }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const report = await repo.findById(prisma, tenantId, id)

  if (!report) {
    throw new ReportNotFoundError()
  }

  return stripFileContent(report)
}

export async function generate(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    reportType: string
    format: string
    name?: string
    parameters?: {
      fromDate?: string
      toDate?: string
      employeeIds?: string[]
      departmentIds?: string[]
      costCenterIds?: string[]
      teamIds?: string[]
    }
    createdBy: string | null
  },
  scopeFilter?: {
    departmentIds?: string[]
    employeeIds?: string[]
  }
) {
  // Check date range requirement
  if (requiresDateRange(input.reportType)) {
    if (!input.parameters?.fromDate || !input.parameters?.toDate) {
      throw new ReportValidationError(
        "from_date and to_date are required for this report type"
      )
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
  let report = await repo.create(prisma, {
    tenantId,
    reportType: input.reportType,
    name: reportName,
    status: "pending",
    format: input.format,
    parameters: JSON.parse(JSON.stringify(params)),
    requestedAt: new Date(),
    createdBy: input.createdBy,
  })

  try {
    // Update to generating status
    report = (await repo.updateStatus(prisma, tenantId, report.id, {
      status: "generating",
      startedAt: new Date(),
    }))!

    // Get employees in scope
    const employees = await repo.findEmployeesInScope(prisma, tenantId, params, scopeFilter)

    // Gather data based on report type
    let data: ReportRow

    switch (input.reportType) {
      case "monthly_overview":
        data = await gatherMonthlyOverview(prisma, tenantId, params, employees)
        break
      case "overtime_report":
        data = await gatherOvertimeReport(prisma, tenantId, params, employees)
        break
      case "department_summary":
        data = await gatherDepartmentSummary(prisma, tenantId, params, employees)
        break
      case "account_balances":
        data = await gatherAccountBalances(prisma, tenantId, params, employees)
        break
      case "vacation_report":
        data = await gatherVacationReport(prisma, tenantId, params, employees)
        break
      case "daily_overview":
      case "weekly_overview":
      case "employee_timesheet":
        data = await gatherDailyOverview(prisma, params, tenantId)
        break
      case "absence_report":
        data = await gatherAbsenceReport(prisma, params, tenantId)
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
    report = (await repo.updateStatus(prisma, tenantId, report.id, {
      status: "completed",
      fileContent: contentBuffer,
      fileSize: contentBuffer.length,
      rowCount: data.values.length,
      completedAt: new Date(),
    }))!
  } catch (err) {
    // On error, set status to failed
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    report = (await repo.updateStatus(prisma, tenantId, report.id, {
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    }))!
  }

  return stripFileContent(report)
}

export async function download(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const report = await repo.findById(prisma, tenantId, id)

  if (!report) {
    throw new ReportNotFoundError()
  }

  if (report.status !== "completed") {
    throw new ReportValidationError(
      "Report is not ready (still generating or not started)"
    )
  }

  if (!report.fileContent) {
    throw new ReportValidationError("Report has no file content")
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
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ReportNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)
}
