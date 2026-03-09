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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as reportsService from "@/lib/services/reports-service"

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
      try {
        return await reportsService.list(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
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
      try {
        return await reportsService.getById(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        return await reportsService.generate(ctx.prisma, ctx.tenantId!, {
          reportType: input.reportType,
          format: input.format,
          name: input.name,
          parameters: input.parameters,
          createdBy: ctx.user?.id || null,
        })
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        return await reportsService.download(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        await reportsService.remove(ctx.prisma, ctx.tenantId!, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
