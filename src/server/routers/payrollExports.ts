/**
 * Payroll Exports Router
 *
 * Provides list, getById, generate, preview, download, and delete
 * operations for payroll exports via tRPC procedures.
 *
 * Replaces the Go backend payroll export endpoints:
 * - GET    /payroll-exports               -> payrollExports.list
 * - POST   /payroll-exports               -> payrollExports.generate
 * - GET    /payroll-exports/{id}          -> payrollExports.getById
 * - DELETE /payroll-exports/{id}          -> payrollExports.delete
 * - GET    /payroll-exports/{id}/download -> payrollExports.download
 * - GET    /payroll-exports/{id}/preview  -> payrollExports.preview
 *
 * @see apps/api/internal/service/payrollexport.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Decimal } from "@prisma/client/runtime/client"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const PAYROLL_VIEW = permissionIdByKey("payroll.view")!
const PAYROLL_MANAGE = permissionIdByKey("payroll.manage")!

// --- Enums ---

const payrollExportStatusEnum = z.enum(["pending", "generating", "completed", "failed"])
const payrollExportFormatEnum = z.enum(["csv", "xlsx", "xml", "json"])
const payrollExportTypeEnum = z.enum(["standard", "datev", "sage", "custom"])

// --- Output Schemas ---

const payrollExportOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  exportInterfaceId: z.string().uuid().nullable(),
  year: z.number(),
  month: z.number(),
  status: z.string(),
  exportType: z.string(),
  format: z.string(),
  parameters: z.unknown(),
  fileSize: z.number().nullable(),
  rowCount: z.number().nullable(),
  employeeCount: z.number().nullable(),
  totalHours: z.unknown().nullable(),
  totalOvertime: z.unknown().nullable(),
  errorMessage: z.string().nullable(),
  requestedAt: z.date(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const previewLineSchema = z.object({
  employeeId: z.string().uuid(),
  personnelNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  departmentCode: z.string(),
  costCenterCode: z.string(),
  targetHours: z.number(),
  workedHours: z.number(),
  overtimeHours: z.number(),
  vacationDays: z.number(),
  sickDays: z.number(),
  otherAbsenceDays: z.number(),
  accountValues: z.record(z.string(), z.number()),
})

// --- Helper Functions ---

function stripFileContent<T extends { fileContent?: unknown }>(record: T): Omit<T, "fileContent"> {
  const { fileContent: _, ...rest } = record
  return rest
}

function decimalToNumber(val: Decimal | null | undefined): number {
  if (val == null) return 0
  return Number(val)
}

// --- Router ---

export const payrollExportsRouter = createTRPCRouter({
  /**
   * payrollExports.list -- Returns payroll exports with cursor-based pagination.
   *
   * Strips fileContent from output.
   *
   * Requires: payroll.view permission
   */
  list: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
    .input(
      z.object({
        year: z.number().optional(),
        month: z.number().optional(),
        status: payrollExportStatusEnum.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().uuid().optional(),
      }).optional()
    )
    .output(
      z.object({
        data: z.array(payrollExportOutputSchema),
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

      if (input?.year) where.year = input.year
      if (input?.month) where.month = input.month
      if (input?.status) where.status = input.status

      if (input?.cursor) {
        where.id = { lt: input.cursor }
      }

      const exports = await ctx.prisma.payrollExport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      })

      const hasMore = exports.length > limit
      if (hasMore) {
        exports.pop()
      }

      const data = exports.map((pe) => stripFileContent(pe))
      const lastExport = exports[exports.length - 1]
      const nextCursor = hasMore && lastExport
        ? lastExport.id
        : undefined

      return {
        data,
        meta: { hasMore, nextCursor },
      }
    }),

  /**
   * payrollExports.getById -- Returns a single payroll export by ID.
   *
   * Strips fileContent from output.
   *
   * Requires: payroll.view permission
   */
  getById: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .output(payrollExportOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const pe = await ctx.prisma.payrollExport.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!pe) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payroll export not found",
        })
      }

      return stripFileContent(pe)
    }),

  /**
   * payrollExports.generate -- Generates a payroll export synchronously.
   *
   * Validates year/month/format, rejects future month.
   * Gathers employee + monthly value data, generates CSV.
   *
   * Requires: payroll.manage permission
   */
  generate: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(
      z.object({
        year: z.number().int().min(1),
        month: z.number().int().min(1).max(12),
        format: payrollExportFormatEnum.default("csv"),
        exportType: payrollExportTypeEnum.default("standard"),
        exportInterfaceId: z.string().uuid().optional(),
        parameters: z.object({
          employeeIds: z.array(z.string().uuid()).optional(),
          departmentIds: z.array(z.string().uuid()).optional(),
          includeAccounts: z.array(z.string().uuid()).optional(),
        }).optional(),
      })
    )
    .output(payrollExportOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Validate not future month
      const now = new Date()
      if (
        input.year > now.getFullYear() ||
        (input.year === now.getFullYear() && input.month >= now.getMonth() + 1)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot generate export for a future month",
        })
      }

      // Create export record in pending status
      let pe = await ctx.prisma.payrollExport.create({
        data: {
          tenantId,
          exportInterfaceId: input.exportInterfaceId || null,
          year: input.year,
          month: input.month,
          status: "pending",
          exportType: input.exportType,
          format: input.format,
          parameters: input.parameters ?? {},
          requestedAt: new Date(),
          createdBy: ctx.user?.id || null,
        },
      })

      try {
        // Update to generating status
        pe = await ctx.prisma.payrollExport.update({
          where: { id: pe.id },
          data: { status: "generating", startedAt: new Date() },
        })

        // Get active employees in scope
        const empWhere: Record<string, unknown> = {
          tenantId,
          isActive: true,
        }
        if (input.parameters?.departmentIds && input.parameters.departmentIds.length > 0) {
          empWhere.departmentId = { in: input.parameters.departmentIds }
        }

        let employees = await ctx.prisma.employee.findMany({
          where: empWhere,
          include: {
            department: { select: { code: true } },
            costCenter: { select: { code: true } },
          },
          take: 10000,
        })

        // Filter by specific employee IDs if provided
        if (input.parameters?.employeeIds && input.parameters.employeeIds.length > 0) {
          const idSet = new Set(input.parameters.employeeIds)
          employees = employees.filter((e) => idSet.has(e.id))
        }

        // Determine which accounts to include
        let accountIds = input.parameters?.includeAccounts ?? []
        if (accountIds.length === 0 && input.exportInterfaceId) {
          const ifaceAccounts = await ctx.prisma.exportInterfaceAccount.findMany({
            where: { exportInterfaceId: input.exportInterfaceId },
            orderBy: { sortOrder: "asc" },
          })
          accountIds = ifaceAccounts.map((a) => a.accountId)
        }

        // Build account code map
        const accountCodeMap: Record<string, string> = {}
        if (accountIds.length > 0) {
          const accounts = await ctx.prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, code: true },
          })
          for (const acct of accounts) {
            accountCodeMap[acct.id] = acct.code
          }
        }

        // Generate export lines
        interface ExportLine {
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

        const lines: ExportLine[] = []
        let totalWorked = 0
        let totalOT = 0

        for (const emp of employees) {
          const mv = await ctx.prisma.monthlyValue.findFirst({
            where: { employeeId: emp.id, year: input.year, month: input.month },
          })
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
          "PersonnelNumber", "FirstName", "LastName",
          "DepartmentCode", "CostCenterCode",
          "TargetHours", "WorkedHours", "OvertimeHours",
          "VacationDays", "SickDays", "OtherAbsenceDays",
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
        pe = await ctx.prisma.payrollExport.update({
          where: { id: pe.id },
          data: {
            status: "completed",
            fileContent: csvContent,
            fileSize: csvContent.length,
            rowCount: lines.length,
            employeeCount: lines.length,
            totalHours: new Decimal(totalWorked.toFixed(2)),
            totalOvertime: new Decimal(totalOT.toFixed(2)),
            completedAt: new Date(),
          },
        })
      } catch (err) {
        // On error, set status to failed
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        pe = await ctx.prisma.payrollExport.update({
          where: { id: pe.id },
          data: {
            status: "failed",
            errorMessage,
            completedAt: new Date(),
          },
        })
      }

      return stripFileContent(pe)
    }),

  /**
   * payrollExports.preview -- Returns structured preview data for a completed export.
   *
   * Re-generates lines from employee + monthly value data (not from stored file).
   *
   * Requires: payroll.view permission
   */
  preview: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .output(
      z.object({
        lines: z.array(previewLineSchema),
        summary: z.object({
          employeeCount: z.number(),
          totalHours: z.number(),
          totalOvertime: z.number(),
        }),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const pe = await ctx.prisma.payrollExport.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!pe) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payroll export not found",
        })
      }

      if (pe.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Export is not ready (still generating or not started)",
        })
      }

      // Parse parameters to get filters
      const params = pe.parameters as {
        employeeIds?: string[]
        departmentIds?: string[]
      } | null

      // Get active employees
      const empWhere: Record<string, unknown> = {
        tenantId,
        isActive: true,
      }

      let employees = await ctx.prisma.employee.findMany({
        where: empWhere,
        include: {
          department: { select: { code: true } },
          costCenter: { select: { code: true } },
        },
        take: 10000,
      })

      // Filter by specific employee IDs
      if (params?.employeeIds && params.employeeIds.length > 0) {
        const idSet = new Set(params.employeeIds)
        employees = employees.filter((e) => idSet.has(e.id))
      }

      const lines: z.infer<typeof previewLineSchema>[] = []
      let totalHours = 0
      let totalOvertime = 0

      for (const emp of employees) {
        const mv = await ctx.prisma.monthlyValue.findFirst({
          where: { employeeId: emp.id, year: pe.year, month: pe.month },
        })
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
    }),

  /**
   * payrollExports.download -- Returns base64-encoded file content for download.
   *
   * Requires: payroll.view permission
   */
  download: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
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

      const pe = await ctx.prisma.payrollExport.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!pe) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payroll export not found",
        })
      }

      if (pe.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Export is not ready (still generating or not started)",
        })
      }

      if (!pe.fileContent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Export has no file content",
        })
      }

      // Determine content type and extension
      let contentType = "text/csv"
      let ext = "csv"
      switch (pe.format) {
        case "xlsx":
          contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
    }),

  /**
   * payrollExports.delete -- Deletes a payroll export.
   *
   * Requires: payroll.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const existing = await ctx.prisma.payrollExport.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payroll export not found",
        })
      }

      await ctx.prisma.payrollExport.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
