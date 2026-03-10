/**
 * Evaluations Router
 *
 * Provides read-only evaluation query endpoints via tRPC procedures.
 * Queries daily values, bookings, terminal bookings, audit logs, and workflow history
 * with filtering, pagination, and data scope enforcement.
 *
 * Replaces the Go backend evaluation endpoints:
 * - GET /evaluations/daily-values -> evaluations.dailyValues
 * - GET /evaluations/bookings -> evaluations.bookings
 * - GET /evaluations/terminal-bookings -> evaluations.terminalBookings
 * - GET /evaluations/logs -> evaluations.logs
 * - GET /evaluations/workflow-history -> evaluations.workflowHistory
 *
 * @see apps/api/internal/service/evaluation.go
 * @see apps/api/internal/handler/evaluation.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import {
  requirePermission,
  applyDataScope,
  type DataScope,
} from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as evalService from "@/lib/services/evaluations-service"

// --- Permission Constants ---
// All 5 evaluation endpoints require reports.view
// Matching Go route registration at apps/api/internal/handler/routes.go:1030-1049

const REPORTS_VIEW = permissionIdByKey("reports.view")!

// --- Shared Output Schemas ---

const employeeSummarySchema = z
  .object({
    id: z.string(),
    personnelNumber: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    isActive: z.boolean(),
  })
  .nullable()

const bookingTypeSummarySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    direction: z.string(),
  })
  .nullable()

const userSummarySchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
  })
  .nullable()

// --- Output Schemas ---

const dailyValueEvalOutputSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  valueDate: z.date(),
  status: z.string(),
  targetMinutes: z.number().int(),
  grossMinutes: z.number().int(),
  netMinutes: z.number().int(),
  breakMinutes: z.number().int(),
  overtimeMinutes: z.number().int(),
  undertimeMinutes: z.number().int(),
  balanceMinutes: z.number().int(),
  bookingCount: z.number().int(),
  hasErrors: z.boolean(),
  firstCome: z.number().int().nullable(),
  lastGo: z.number().int().nullable(),
  employee: employeeSummarySchema.optional(),
})

const bookingEvalOutputSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  bookingDate: z.date(),
  bookingTypeId: z.string(),
  originalTime: z.number().int(),
  editedTime: z.number().int(),
  calculatedTime: z.number().int().nullable(),
  timeString: z.string(),
  pairId: z.string().nullable(),
  terminalId: z.string().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  employee: employeeSummarySchema.optional(),
  bookingType: bookingTypeSummarySchema.optional(),
})

const terminalBookingEvalOutputSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  bookingDate: z.date(),
  bookingTypeId: z.string(),
  originalTime: z.number().int(),
  editedTime: z.number().int(),
  calculatedTime: z.number().int().nullable(),
  wasEdited: z.boolean(),
  originalTimeString: z.string(),
  editedTimeString: z.string(),
  source: z.string().nullable(),
  terminalId: z.string().nullable(),
  createdAt: z.date(),
  employee: employeeSummarySchema.optional(),
  bookingType: bookingTypeSummarySchema.optional(),
})

const logEvalOutputSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  entityName: z.string().nullable(),
  changes: z.unknown().nullable(),
  performedAt: z.date(),
  userId: z.string().nullable(),
  user: userSummarySchema.optional(),
})

const workflowEvalOutputSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  entityName: z.string().nullable(),
  metadata: z.unknown().nullable(),
  performedAt: z.date(),
  userId: z.string().nullable(),
  user: userSummarySchema.optional(),
})

// --- Input Schemas ---

const dailyValuesInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  hasErrors: z.boolean().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})

const bookingsInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  bookingTypeId: z.string().optional(),
  source: z.string().optional(),
  direction: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})

const terminalBookingsInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})

const logsInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})

const workflowHistoryInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})

// --- Router ---

export const evaluationsRouter = createTRPCRouter({
  /**
   * evaluations.dailyValues -- Returns paginated daily value evaluation data.
   *
   * Supports filters: employeeId, departmentId, hasErrors, date range.
   * Applies data scope filtering via employee relation.
   * Includes employee summary in each result.
   *
   * Replaces: GET /evaluations/daily-values
   * Requires: reports.view permission
   */
  dailyValues: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .use(applyDataScope())
    .input(dailyValuesInputSchema)
    .output(
      z.object({
        items: z.array(dailyValueEvalOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const dataScopeWhere = evalService.buildDataScopeWhere(dataScope)

        return await evalService.listDailyValues(
          ctx.prisma,
          ctx.tenantId!,
          { ...input, dataScopeWhere }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * evaluations.bookings -- Returns paginated booking evaluation data.
   *
   * Supports filters: employeeId, departmentId, bookingTypeId, source, direction, date range.
   * Applies data scope filtering via employee relation.
   * Includes employee and bookingType summaries in each result.
   *
   * Replaces: GET /evaluations/bookings
   * Requires: reports.view permission
   */
  bookings: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .use(applyDataScope())
    .input(bookingsInputSchema)
    .output(
      z.object({
        items: z.array(bookingEvalOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const dataScopeWhere = evalService.buildDataScopeWhere(dataScope)

        return await evalService.listBookings(
          ctx.prisma,
          ctx.tenantId!,
          { ...input, dataScopeWhere }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * evaluations.terminalBookings -- Returns paginated terminal booking evaluation data.
   *
   * Same as bookings but hardcoded to source='terminal'.
   * Includes wasEdited computed field and formatted time strings.
   * Applies data scope filtering via employee relation.
   *
   * Replaces: GET /evaluations/terminal-bookings
   * Requires: reports.view permission
   */
  terminalBookings: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .use(applyDataScope())
    .input(terminalBookingsInputSchema)
    .output(
      z.object({
        items: z.array(terminalBookingEvalOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const dataScopeWhere = evalService.buildDataScopeWhere(dataScope)

        return await evalService.listTerminalBookings(
          ctx.prisma,
          ctx.tenantId!,
          { ...input, dataScopeWhere }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * evaluations.logs -- Returns paginated audit log entries.
   *
   * Supports filters: entityType, action, userId, date range.
   * Does NOT apply data scope (admin-level tenant-only view).
   * Includes user summary in each result.
   *
   * Replaces: GET /evaluations/logs
   * Requires: reports.view permission
   */
  logs: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(logsInputSchema)
    .output(
      z.object({
        items: z.array(logEvalOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await evalService.listLogs(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * evaluations.workflowHistory -- Returns paginated workflow history entries.
   *
   * Queries auditLog with workflow-specific default filters:
   * - Entity types: ["absence", "monthly_value"] (when not specified)
   * - Actions: ["create", "approve", "reject", "close", "reopen"] (when not specified)
   *
   * Does NOT apply data scope (admin-level tenant-only view).
   * Includes user summary in each result.
   *
   * Replaces: GET /evaluations/workflow-history
   * Requires: reports.view permission
   */
  workflowHistory: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(workflowHistoryInputSchema)
    .output(
      z.object({
        items: z.array(workflowEvalOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await evalService.listWorkflowHistory(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
