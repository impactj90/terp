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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as payrollExportService from "@/lib/services/payroll-export-service"

// --- Data Scope Helper ---

function dataScopeToEmployeeFilter(dataScope: DataScope): {
  departmentIds?: string[]
  employeeIds?: string[]
} | undefined {
  if (dataScope.type === "department") {
    return { departmentIds: dataScope.departmentIds }
  } else if (dataScope.type === "employee") {
    return { employeeIds: dataScope.employeeIds }
  }
  return undefined
}

// --- Permission Constants ---

const PAYROLL_VIEW = permissionIdByKey("payroll.view")!
const PAYROLL_MANAGE = permissionIdByKey("payroll.manage")!

// --- Enums ---

const payrollExportStatusEnum = z.enum(["pending", "generating", "completed", "failed"])
const payrollExportFormatEnum = z.enum(["csv", "xlsx", "xml", "json"])
const payrollExportTypeEnum = z.enum(["standard", "datev", "sage", "custom"])

// --- Output Schemas ---

const payrollExportOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  exportInterfaceId: z.string().nullable(),
  year: z.number(),
  month: z.number(),
  status: z.string(),
  exportType: z.string(),
  format: z.string(),
  parameters: z.unknown().nullable(),
  fileSize: z.number().nullable(),
  rowCount: z.number().nullable(),
  employeeCount: z.number().nullable(),
  totalHours: z.unknown().nullable(),
  totalOvertime: z.unknown().nullable(),
  errorMessage: z.string().nullable(),
  requestedAt: z.date(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const previewLineSchema = z.object({
  employeeId: z.string(),
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
        year: z.number().int().min(1).max(9999).optional(),
        month: z.number().int().min(1).max(12).optional(),
        status: payrollExportStatusEnum.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }).optional()
    )
    .output(
      z.object({
        data: z.array(payrollExportOutputSchema),
        meta: z.object({
          hasMore: z.boolean(),
          nextCursor: z.string().optional(),
        }),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await payrollExportService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ?? undefined
        )
      } catch (err) {
        handleServiceError(err)
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
    .input(z.object({ id: z.string() }))
    .output(payrollExportOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await payrollExportService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(
      z.object({
        year: z.number().int().min(1),
        month: z.number().int().min(1).max(12),
        format: payrollExportFormatEnum.default("csv"),
        exportType: payrollExportTypeEnum.default("standard"),
        exportInterfaceId: z.string().optional(),
        parameters: z.object({
          employeeIds: z.array(z.string()).optional(),
          departmentIds: z.array(z.string()).optional(),
          includeAccounts: z.array(z.string()).optional(),
        }).optional(),
      })
    )
    .output(payrollExportOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const scopeFilter = dataScopeToEmployeeFilter(dataScope)
        return await payrollExportService.generate(
          ctx.prisma,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
          scopeFilter
        )
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
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
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const scopeFilter = dataScopeToEmployeeFilter(dataScope)
        return await payrollExportService.preview(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          scopeFilter
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * payrollExports.download -- Returns base64-encoded file content for download.
   *
   * Requires: payroll.view permission
   */
  download: tenantProcedure
    .use(requirePermission(PAYROLL_VIEW))
    .input(z.object({ id: z.string() }))
    .output(
      z.object({
        content: z.string(),
        contentType: z.string(),
        filename: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await payrollExportService.download(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * payrollExports.delete -- Deletes a payroll export.
   *
   * Requires: payroll.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await payrollExportService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
