/**
 * Payroll Export Service
 *
 * Business logic for payroll export operations including generate, preview, download.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { type Prisma } from "@/generated/prisma/client"
import { Decimal } from "@prisma/client/runtime/client"
import * as repo from "./payroll-export-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class PayrollExportNotFoundError extends Error {
  constructor(message = "Payroll export not found") {
    super(message)
    this.name = "PayrollExportNotFoundError"
  }
}

export class PayrollExportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PayrollExportValidationError"
  }
}

export class PayrollExportConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PayrollExportConflictError"
  }
}

// --- Helpers ---

function decimalToNumber(val: Decimal | null | undefined): number {
  if (val == null) return 0
  return Number(val)
}

function stripFileContent<T extends { fileContent?: unknown }>(
  record: T
): Omit<T, "fileContent"> {
  const { fileContent: _fileContent, ...rest } = record
  return rest
}

// --- Account value aggregation helper ---

async function buildAccountValueMap(
  prisma: PrismaClient,
  tenantId: string,
  empIds: string[],
  accountIds: string[],
  year: number,
  month: number,
): Promise<Map<string, Map<string, number>>> {
  const map = new Map<string, Map<string, number>>()
  if (accountIds.length === 0 || empIds.length === 0) return map

  const agg = await repo.aggregateDailyAccountValues(
    prisma, tenantId, empIds, accountIds, year, month,
  )
  for (const row of agg) {
    let empMap = map.get(row.employeeId)
    if (!empMap) {
      empMap = new Map()
      map.set(row.employeeId, empMap)
    }
    empMap.set(row.accountId, row._sum.valueMinutes ?? 0)
  }
  return map
}

function resolveAccountValues(
  empAccounts: Map<string, number> | undefined,
  accountInfoMap: Record<string, { code: string; payrollCode: string | null }>,
): Record<string, number> {
  const accountValues: Record<string, number> = {}
  if (empAccounts) {
    for (const [accountId, totalMinutes] of empAccounts) {
      const info = accountInfoMap[accountId]
      if (info) accountValues[info.code] = totalMinutes / 60
    }
  }
  return accountValues
}

// --- CSV/Format generation helpers ---

function generateStandardCsv(lines: ExportLine[], accountCodeList: string[]): string {
  const header = [
    "PersonnelNumber",
    "FirstName",
    "LastName",
    "DepartmentCode",
    "CostCenterCode",
    "TargetHours",
    "WorkedHours",
    "OvertimeHours",
    "VacationDays",
    "SickDays",
    "OtherAbsenceDays",
    ...accountCodeList.map((code) => `Account_${code}`),
  ]

  const csvRows = [header.join(";")]
  for (const line of lines) {
    const row = [
      line.personnelNumber,
      line.firstName,
      line.lastName,
      line.departmentCode,
      line.costCenterCode,
      line.targetHours.toFixed(2),
      line.workedHours.toFixed(2),
      line.overtimeHours.toFixed(2),
      line.vacationDays.toFixed(2),
      line.sickDays.toFixed(2),
      line.otherAbsenceDays.toFixed(2),
      ...accountCodeList.map((code) => {
        const val = line.accountValues[code] ?? 0
        return val.toFixed(2)
      }),
    ]
    csvRows.push(row.join(";"))
  }
  return csvRows.join("\n") + "\n"
}

// DATEV LODAS default format — subject to change per customer accountant requirements
function generateDatevLodas(
  lines: ExportLine[],
  accountInfoMap: Record<string, { code: string; payrollCode: string | null }>,
): string {
  const header = "Personalnummer;Nachname;Vorname;Lohnart;Stunden;Tage;Betrag;Kostenstelle"
  const csvRows = [header]

  // Fixed wage type codes
  const baseLohnarten: { code: string; getValue: (l: ExportLine) => { hours: number; days: number } }[] = [
    { code: "1000", getValue: (l) => ({ hours: l.targetHours, days: 0 }) },
    { code: "1001", getValue: (l) => ({ hours: l.workedHours, days: 0 }) },
    { code: "1002", getValue: (l) => ({ hours: l.overtimeHours, days: 0 }) },
    { code: "2000", getValue: (l) => ({ hours: 0, days: l.vacationDays }) },
    { code: "2001", getValue: (l) => ({ hours: 0, days: l.sickDays }) },
    { code: "2002", getValue: (l) => ({ hours: 0, days: l.otherAbsenceDays }) },
  ]

  for (const line of lines) {
    // Base wage types (only if value > 0)
    for (const la of baseLohnarten) {
      const { hours, days } = la.getValue(line)
      if (hours > 0 || days > 0) {
        csvRows.push([
          line.personnelNumber,
          line.lastName,
          line.firstName,
          la.code,
          hours.toFixed(2),
          days.toFixed(2),
          "", // Betrag left empty for hour/day-based entries
          line.costCenterCode,
        ].join(";"))
      }
    }

    // Account-based wage types (dynamic)
    for (const [_accountId, info] of Object.entries(accountInfoMap)) {
      const hours = line.accountValues[info.code] ?? 0
      if (hours > 0) {
        const lohnart = info.payrollCode || info.code
        csvRows.push([
          line.personnelNumber,
          line.lastName,
          line.firstName,
          lohnart,
          hours.toFixed(2),
          "0.00",
          "",
          line.costCenterCode,
        ].join(";"))
      }
    }
  }

  return csvRows.join("\n") + "\n"
}

// --- Download format conversion helpers ---

function parseCsv(csvContent: string): { headers: string[]; rows: string[][] } {
  const lines = csvContent.trim().split("\n")
  const headers = (lines[0] ?? "").split(";")
  const rows = lines.slice(1).map((line) => line.split(";"))
  return { headers, rows }
}

function convertToJson(headers: string[], rows: string[][]): string {
  const objects = rows.map((row) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i]
      if (key) obj[key] = row[i] ?? ""
    }
    return obj
  })
  return JSON.stringify(objects, null, 2)
}

function convertToXml(headers: string[], rows: string[][]): string {
  const xmlRows = rows.map((row) => {
    const fields = headers.map((h, i) => {
      const val = (row[i] ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      const tag = h.replace(/[^a-zA-Z0-9_]/g, "_")
      return `      <${tag}>${val}</${tag}>`
    })
    return `    <Row>\n${fields.join("\n")}\n    </Row>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<PayrollExport>\n${xmlRows.join("\n")}\n</PayrollExport>\n`
}

async function convertToXlsx(headers: string[], rows: string[][]): Promise<Buffer> {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("PayrollExport")

  // Header row (bold)
  const headerRow = sheet.addRow(headers)
  headerRow.font = { bold: true }

  // Data rows — attempt to parse numbers
  for (const row of rows) {
    const values = row.map((val) => {
      const num = Number(val)
      return !isNaN(num) && val.trim() !== "" ? num : val
    })
    sheet.addRow(values)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// --- Exported Types ---

export interface ExportLine {
  personnelNumber: string
  firstName: string
  lastName: string
  departmentCode: string
  costCenterCode: string
  targetHours: number
  workedHours: number
  overtimeHours: number
  vacationDays: number
  sickDays: number
  otherAbsenceDays: number
  accountValues: Record<string, number>
}

export interface PreviewLine extends ExportLine {
  employeeId: string
}

// --- Service Functions ---

export async function list(
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
  const { exports, hasMore } = await repo.findMany(prisma, tenantId, params)

  const data = exports.map((pe) => stripFileContent(pe))
  const lastExport = exports[exports.length - 1]
  const nextCursor = hasMore && lastExport ? lastExport.id : undefined

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
  const pe = await repo.findById(prisma, tenantId, id)
  if (!pe) {
    throw new PayrollExportNotFoundError()
  }
  return stripFileContent(pe)
}

export async function generate(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    year: number
    month: number
    format: string
    exportType: string
    exportInterfaceId?: string
    parameters?: {
      employeeIds?: string[]
      departmentIds?: string[]
      includeAccounts?: string[]
    }
  },
  audit: AuditContext,
  scopeFilter?: {
    departmentIds?: string[]
    employeeIds?: string[]
  }
) {
  // Validate not future month
  const now = new Date()
  if (
    input.year > now.getFullYear() ||
    (input.year === now.getFullYear() && input.month >= now.getMonth() + 1)
  ) {
    throw new PayrollExportValidationError(
      "Cannot generate export for a future month"
    )
  }

  // Get active employees in scope (before creating record so validation can reject early)
  const employees = await repo.findEmployeesWithRelations(
    prisma,
    tenantId,
    {
      departmentIds: input.parameters?.departmentIds,
      employeeIds: input.parameters?.employeeIds,
    },
    scopeFilter
  )

  // Validate all employees have closed monthly values
  const empIds = employees.map((e) => e.id)
  const allMvs = await repo.findMonthlyValuesBatch(prisma, tenantId, empIds, input.year, input.month)
  const mvMap = new Map(allMvs.map((mv) => [mv.employeeId, mv]))

  const unclosedEmployees = employees.filter((emp) => {
    const mv = mvMap.get(emp.id)
    return !mv || !mv.isClosed
  })

  if (unclosedEmployees.length > 0) {
    const names = unclosedEmployees
      .slice(0, 10)
      .map((e) => `${e.personnelNumber} ${e.firstName} ${e.lastName}`)
    const suffix = unclosedEmployees.length > 10
      ? ` (and ${unclosedEmployees.length - 10} more)`
      : ""
    throw new PayrollExportConflictError(
      `Monthly values not closed for: ${names.join(", ")}${suffix}`
    )
  }

  // Create export record in pending status
  let pe = await repo.create(prisma, {
    tenantId,
    exportInterfaceId: input.exportInterfaceId || null,
    year: input.year,
    month: input.month,
    status: "pending",
    exportType: input.exportType,
    format: input.format,
    parameters: (input.parameters ?? {}) as Prisma.InputJsonValue,
    requestedAt: new Date(),
    createdBy: audit.userId,
  })

  try {
    // Update to generating status
    pe = (await repo.update(prisma, tenantId, pe.id, {
      status: "generating",
      startedAt: new Date(),
    }))!

    // Determine which accounts to include
    let accountIds = input.parameters?.includeAccounts ?? []
    if (accountIds.length === 0 && input.exportInterfaceId) {
      const ifaceAccounts = await repo.findExportInterfaceAccounts(
        prisma,
        input.exportInterfaceId
      )
      accountIds = ifaceAccounts.map((a) => a.accountId)
    }

    // Build account info map (code + payrollCode for DATEV)
    const accountInfoMap: Record<string, { code: string; payrollCode: string | null }> = {}
    if (accountIds.length > 0) {
      const accounts = await repo.findAccountsByIds(prisma, tenantId, accountIds)
      for (const acct of accounts) {
        accountInfoMap[acct.id] = { code: acct.code, payrollCode: acct.payrollCode }
      }
    }
    const accountCodeList = Object.values(accountInfoMap).map((a) => a.code)

    // Aggregate daily account values
    const accountValueMap = await buildAccountValueMap(
      prisma, tenantId, empIds, accountIds, input.year, input.month,
    )

    // Generate export lines
    const lines: ExportLine[] = []
    let totalWorked = 0
    let totalOT = 0

    for (const emp of employees) {
      const mv = mvMap.get(emp.id)
      if (!mv) continue

      const targetHours = mv.totalTargetTime / 60
      const workedHours = mv.totalNetTime / 60
      const overtimeHours = mv.totalOvertime / 60

      totalWorked += workedHours
      totalOT += overtimeHours

      lines.push({
        personnelNumber: emp.personnelNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        departmentCode: emp.department?.code ?? "",
        costCenterCode: emp.costCenter?.code ?? "",
        targetHours,
        workedHours,
        overtimeHours,
        vacationDays: decimalToNumber(mv.vacationTaken),
        sickDays: mv.sickDays,
        otherAbsenceDays: mv.otherAbsenceDays,
        accountValues: resolveAccountValues(accountValueMap.get(emp.id), accountInfoMap),
      })
    }

    // Generate file content based on export type
    let fileContent: string
    switch (input.exportType) {
      case "datev":
        fileContent = generateDatevLodas(lines, accountInfoMap)
        break
      default: // 'standard', 'sage', 'custom'
        fileContent = generateStandardCsv(lines, accountCodeList)
        break
    }

    // Update record as completed
    pe = (await repo.update(prisma, tenantId, pe.id, {
      status: "completed",
      fileContent,
      fileSize: fileContent.length,
      rowCount: lines.length,
      employeeCount: lines.length,
      totalHours: new Decimal(totalWorked.toFixed(2)),
      totalOvertime: new Decimal(totalOT.toFixed(2)),
      completedAt: new Date(),
    }))!
  } catch (err) {
    // On error, set status to failed
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error"
    pe = (await repo.update(prisma, tenantId, pe.id, {
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    }))!
  }

  const result = stripFileContent(pe)

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "export",
    entityType: "payroll_export",
    entityId: pe.id,
    entityName: `${input.format} ${input.year}-${input.month}`,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  return result
}

export async function preview(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  scopeFilter?: {
    departmentIds?: string[]
    employeeIds?: string[]
  }
) {
  const pe = await repo.findById(prisma, tenantId, id)

  if (!pe) {
    throw new PayrollExportNotFoundError()
  }

  if (pe.status !== "completed") {
    throw new PayrollExportValidationError(
      "Export is not ready (still generating or not started)"
    )
  }

  // Parse parameters to get filters
  const params = pe.parameters as {
    employeeIds?: string[]
    departmentIds?: string[]
    includeAccounts?: string[]
  } | null

  // Get active employees
  const employees = await repo.findEmployeesWithRelations(
    prisma,
    tenantId,
    {
      employeeIds: params?.employeeIds,
    },
    scopeFilter
  )

  // Determine which accounts to include
  let accountIds = params?.includeAccounts ?? []
  if (accountIds.length === 0 && pe.exportInterfaceId) {
    const ifaceAccounts = await repo.findExportInterfaceAccounts(
      prisma,
      pe.exportInterfaceId
    )
    accountIds = ifaceAccounts.map((a) => a.accountId)
  }

  // Build account info map
  const accountInfoMap: Record<string, { code: string; payrollCode: string | null }> = {}
  if (accountIds.length > 0) {
    const accounts = await repo.findAccountsByIds(prisma, tenantId, accountIds)
    for (const acct of accounts) {
      accountInfoMap[acct.id] = { code: acct.code, payrollCode: acct.payrollCode }
    }
  }

  // Aggregate daily account values
  const empIds = employees.map((e) => e.id)
  const accountValueMap = await buildAccountValueMap(
    prisma, tenantId, empIds, accountIds, pe.year, pe.month,
  )

  const lines: PreviewLine[] = []
  let totalHours = 0
  let totalOvertime = 0

  // Batch-fetch all monthly values
  const allMvs = await repo.findMonthlyValuesBatch(prisma, tenantId, empIds, pe.year, pe.month)
  const mvMap = new Map(allMvs.map((mv) => [mv.employeeId, mv]))

  for (const emp of employees) {
    const mv = mvMap.get(emp.id)
    if (!mv) continue

    const targetHours = mv.totalTargetTime / 60
    const workedHours = mv.totalNetTime / 60
    const overtimeHours = mv.totalOvertime / 60

    totalHours += workedHours
    totalOvertime += overtimeHours

    lines.push({
      employeeId: emp.id,
      personnelNumber: emp.personnelNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      departmentCode: emp.department?.code ?? "",
      costCenterCode: emp.costCenter?.code ?? "",
      targetHours,
      workedHours,
      overtimeHours,
      vacationDays: decimalToNumber(mv.vacationTaken),
      sickDays: mv.sickDays,
      otherAbsenceDays: mv.otherAbsenceDays,
      accountValues: resolveAccountValues(accountValueMap.get(emp.id), accountInfoMap),
    })
  }

  return {
    lines,
    summary: {
      employeeCount: lines.length,
      totalHours: Math.round(totalHours * 100) / 100,
      totalOvertime: Math.round(totalOvertime * 100) / 100,
    },
  }
}

export async function download(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const pe = await repo.findById(prisma, tenantId, id)

  if (!pe) {
    throw new PayrollExportNotFoundError()
  }

  if (pe.status !== "completed") {
    throw new PayrollExportValidationError(
      "Export is not ready (still generating or not started)"
    )
  }

  if (!pe.fileContent) {
    throw new PayrollExportValidationError("Export has no file content")
  }

  // Determine content type and extension
  let contentType = "text/csv"
  let ext = "csv"
  switch (pe.format) {
    case "xlsx":
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ext = "xlsx"
      break
    case "xml":
      contentType = "application/xml"
      ext = "xml"
      break
    case "json":
      contentType = "application/json"
      ext = "json"
      break
  }

  const filename = `payroll_export_${pe.year}_${String(pe.month).padStart(2, "0")}.${ext}`

  // Convert from canonical CSV storage to requested format
  let outputBuffer: Buffer
  switch (pe.format) {
    case "xlsx": {
      const parsed = parseCsv(pe.fileContent)
      outputBuffer = await convertToXlsx(parsed.headers, parsed.rows)
      break
    }
    case "json": {
      const parsed = parseCsv(pe.fileContent)
      outputBuffer = Buffer.from(convertToJson(parsed.headers, parsed.rows))
      break
    }
    case "xml": {
      const parsed = parseCsv(pe.fileContent)
      outputBuffer = Buffer.from(convertToXml(parsed.headers, parsed.rows))
      break
    }
    default:
      outputBuffer = Buffer.from(pe.fileContent)
  }

  const content = outputBuffer.toString("base64")
  return { content, contentType, filename }
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new PayrollExportNotFoundError()
  }

  await repo.deleteById(prisma, tenantId, id)

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "delete",
    entityType: "payroll_export",
    entityId: id,
    entityName: `${existing.format} ${existing.year}-${existing.month}`,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}
