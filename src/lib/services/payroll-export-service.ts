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
  userId: string | null
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
    createdBy: userId,
  })

  try {
    // Update to generating status
    pe = await repo.update(prisma, pe.id, {
      status: "generating",
      startedAt: new Date(),
    })

    // Get active employees in scope
    const employees = await repo.findEmployeesWithRelations(
      prisma,
      tenantId,
      {
        departmentIds: input.parameters?.departmentIds,
        employeeIds: input.parameters?.employeeIds,
      }
    )

    // Determine which accounts to include
    let accountIds = input.parameters?.includeAccounts ?? []
    if (accountIds.length === 0 && input.exportInterfaceId) {
      const ifaceAccounts = await repo.findExportInterfaceAccounts(
        prisma,
        input.exportInterfaceId
      )
      accountIds = ifaceAccounts.map((a) => a.accountId)
    }

    // Build account code map
    const accountCodeMap: Record<string, string> = {}
    if (accountIds.length > 0) {
      const accounts = await repo.findAccountsByIds(prisma, accountIds)
      for (const acct of accounts) {
        accountCodeMap[acct.id] = acct.code
      }
    }

    // Generate export lines
    const lines: ExportLine[] = []
    let totalWorked = 0
    let totalOT = 0

    for (const emp of employees) {
      const mv = await repo.findMonthlyValue(
        prisma,
        tenantId,
        emp.id,
        input.year,
        input.month
      )
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
        accountValues: {},
      })
    }

    // Generate CSV content with semicolon delimiter
    const accountCodeList = Object.values(accountCodeMap)
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
    const csvContent = csvRows.join("\n") + "\n"

    // Update record as completed
    pe = await repo.update(prisma, pe.id, {
      status: "completed",
      fileContent: csvContent,
      fileSize: csvContent.length,
      rowCount: lines.length,
      employeeCount: lines.length,
      totalHours: new Decimal(totalWorked.toFixed(2)),
      totalOvertime: new Decimal(totalOT.toFixed(2)),
      completedAt: new Date(),
    })
  } catch (err) {
    // On error, set status to failed
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error"
    pe = await repo.update(prisma, pe.id, {
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    })
  }

  return stripFileContent(pe)
}

export async function preview(
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

  // Parse parameters to get filters
  const params = pe.parameters as {
    employeeIds?: string[]
    departmentIds?: string[]
  } | null

  // Get active employees
  const employees = await repo.findEmployeesWithRelations(
    prisma,
    tenantId,
    {
      employeeIds: params?.employeeIds,
    }
  )

  const lines: PreviewLine[] = []
  let totalHours = 0
  let totalOvertime = 0

  for (const emp of employees) {
    const mv = await repo.findMonthlyValue(prisma, tenantId, emp.id, pe.year, pe.month)
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
      accountValues: {},
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
  const content = Buffer.from(pe.fileContent).toString("base64")

  return { content, contentType, filename }
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new PayrollExportNotFoundError()
  }

  await repo.deleteById(prisma, id)
}
