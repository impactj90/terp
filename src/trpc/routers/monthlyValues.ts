/**
 * Monthly Values Router
 *
 * Provides monthly value list, close/reopen, batch operations, and recalculation
 * via tRPC procedures.
 *
 * Merges Go backend monthly value endpoints:
 * - GET /employees/{id}/months/{year}/{month} -> monthlyValues.forEmployee
 * - GET /employees/{id}/months/{year} -> monthlyValues.yearOverview
 * - GET /monthly-values -> monthlyValues.list
 * - GET /monthly-values/{id} -> monthlyValues.getById
 * - POST /monthly-values/{id}/close -> monthlyValues.close
 * - POST /monthly-values/{id}/reopen -> monthlyValues.reopen
 * - POST /monthly-values/close-batch -> monthlyValues.closeBatch
 * - POST /monthly-values/recalculate -> monthlyValues.recalculate
 *
 * @see apps/api/internal/handler/monthly_value.go
 * @see apps/api/internal/handler/monthlyeval.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Decimal } from "@prisma/client/runtime/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as monthlyValuesService from "@/lib/services/monthly-values-service"
import type { MonthSummary } from "@/lib/services/monthly-calc.types"
import {
  ERR_FUTURE_MONTH,
  ERR_MONTH_CLOSED,
  ERR_MONTH_NOT_CLOSED,
  ERR_INVALID_MONTH,
  ERR_INVALID_YEAR_MONTH,
  ERR_MONTHLY_VALUE_NOT_FOUND,
  ERR_EMPLOYEE_NOT_FOUND,
} from "@/lib/services/monthly-calc.types"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:571-599,1641-1661

const REPORTS_VIEW = permissionIdByKey("reports.view")!
const CALCULATE_MONTH = permissionIdByKey("booking_overview.calculate_month")!
const TIME_TRACKING_VIEW_OWN = permissionIdByKey("time_tracking.view_own")!
const TIME_TRACKING_VIEW_ALL = permissionIdByKey("time_tracking.view_all")!

// --- Output Schemas ---

const monthSummaryOutputSchema = z.object({
  employeeId: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  totalGrossTime: z.number().int(),
  totalNetTime: z.number().int(),
  totalTargetTime: z.number().int(),
  totalOvertime: z.number().int(),
  totalUndertime: z.number().int(),
  totalBreakTime: z.number().int(),
  flextimeStart: z.number().int(),
  flextimeChange: z.number().int(),
  flextimeEnd: z.number().int(),
  flextimeCarryover: z.number().int(),
  vacationTaken: z.number(), // Decimal serialized as number
  sickDays: z.number().int(),
  otherAbsenceDays: z.number().int(),
  workDays: z.number().int(),
  daysWithErrors: z.number().int(),
  isClosed: z.boolean(),
  closedAt: z.date().nullable(),
  closedBy: z.string().nullable(),
  reopenedAt: z.date().nullable(),
  reopenedBy: z.string().nullable(),
  warnings: z.array(z.string()),
})

const employeeSummarySchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    isActive: z.boolean(),
    departmentId: z.string().nullable(),
  })
  .nullable()

const monthlyValueOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  status: z.string(), // "calculated" or "closed"
  totalGrossTime: z.number().int(),
  totalNetTime: z.number().int(),
  totalTargetTime: z.number().int(),
  totalOvertime: z.number().int(),
  totalUndertime: z.number().int(),
  totalBreakTime: z.number().int(),
  balanceMinutes: z.number().int(), // computed: overtime - undertime
  flextimeStart: z.number().int(),
  flextimeChange: z.number().int(),
  flextimeEnd: z.number().int(),
  flextimeCarryover: z.number().int(),
  vacationTaken: z.number(),
  sickDays: z.number().int(),
  otherAbsenceDays: z.number().int(),
  workDays: z.number().int(),
  daysWithErrors: z.number().int(),
  closedAt: z.date().nullable(),
  closedBy: z.string().nullable(),
  reopenedAt: z.date().nullable(),
  reopenedBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: employeeSummarySchema.optional(),
})

// --- Input Schemas ---

// forEmployee
const forEmployeeInputSchema = z.object({
  employeeId: z.string(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

// yearOverview
const yearOverviewInputSchema = z.object({
  employeeId: z.string(),
  year: z.number().int().min(2000).max(2100),
})

// list (admin, paginated)
const listInputSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  status: z.enum(["open", "calculated", "closed"]).optional(),
  departmentId: z.string().optional(),
  employeeId: z.string().optional(),
})

// close/reopen -- accept either { id } or { employeeId, year, month }
const closeReopenInputSchema = z.union([
  z.object({ id: z.string() }),
  z.object({
    employeeId: z.string(),
    year: z.number().int(),
    month: z.number().int(),
  }),
])

// getById
const byIdInputSchema = z.object({
  id: z.string(),
})

// closeBatch -- match Go handler behavior (used by frontend batch-close-dialog.tsx)
const closeBatchInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  employeeIds: z.array(z.string()).optional(),
  departmentId: z.string().optional(),
  recalculate: z.boolean().optional().default(true),
})

// recalculate
const recalculateInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  employeeId: z.string().optional(),
})

// --- Data Scope Helpers ---

/**
 * Builds a Prisma WHERE clause for monthly value data scope filtering.
 * Monthly values are scoped via the employee relation.
 */
function buildMonthlyValueDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

/**
 * Checks that a monthly value falls within the user's data scope.
 * Throws FORBIDDEN if not.
 */
function checkMonthlyValueDataScope(
  dataScope: DataScope,
  item: {
    employeeId: string
    employee?: { departmentId: string | null } | null
  }
): void {
  if (dataScope.type === "department") {
    if (
      !item.employee?.departmentId ||
      !dataScope.departmentIds.includes(item.employee.departmentId)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Monthly value not within data scope",
      })
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(item.employeeId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Monthly value not within data scope",
      })
    }
  }
}

// --- Error Mapping ---

/**
 * Maps service error messages to TRPCError with appropriate codes.
 * Used for MonthlyCalcService errors which use message-based error strings.
 */
function mapServiceError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  switch (message) {
    case ERR_MONTHLY_VALUE_NOT_FOUND:
      throw new TRPCError({ code: "NOT_FOUND", message: "Monthly value not found" })
    case ERR_EMPLOYEE_NOT_FOUND:
      throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" })
    case ERR_MONTH_CLOSED:
      throw new TRPCError({ code: "BAD_REQUEST", message: "Month is closed" })
    case ERR_MONTH_NOT_CLOSED:
      throw new TRPCError({ code: "BAD_REQUEST", message: "Month is not closed" })
    case ERR_INVALID_MONTH:
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid month" })
    case ERR_INVALID_YEAR_MONTH:
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid year or month" })
    case ERR_FUTURE_MONTH:
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot calculate future month" })
    default:
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message })
  }
}

// --- Mapper Functions ---

/**
 * Maps a Prisma MonthlyValue record to the output schema shape.
 * Mirrors Go monthlyValueToResponse at handler/monthly_value.go:362-404.
 */
function mapMonthlyValueToOutput(
  record: Record<string, unknown>
): z.infer<typeof monthlyValueOutputSchema> {
  const overtime = record.totalOvertime as number
  const undertime = record.totalUndertime as number
  const isClosed = record.isClosed as boolean

  const result: Record<string, unknown> = {
    id: record.id,
    tenantId: record.tenantId,
    employeeId: record.employeeId,
    year: record.year,
    month: record.month,
    status: isClosed ? "closed" : "calculated",
    totalGrossTime: record.totalGrossTime,
    totalNetTime: record.totalNetTime,
    totalTargetTime: record.totalTargetTime,
    totalOvertime: overtime,
    totalUndertime: undertime,
    totalBreakTime: record.totalBreakTime,
    balanceMinutes: overtime - undertime,
    flextimeStart: record.flextimeStart,
    flextimeChange: record.flextimeChange,
    flextimeEnd: record.flextimeEnd,
    flextimeCarryover: record.flextimeCarryover,
    vacationTaken:
      record.vacationTaken instanceof Decimal
        ? (record.vacationTaken as Decimal).toNumber()
        : Number(record.vacationTaken),
    sickDays: record.sickDays,
    otherAbsenceDays: record.otherAbsenceDays,
    workDays: record.workDays,
    daysWithErrors: record.daysWithErrors,
    closedAt: record.closedAt ?? null,
    closedBy: record.closedBy ?? null,
    reopenedAt: record.reopenedAt ?? null,
    reopenedBy: record.reopenedBy ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }

  // Include employee if present (from list include)
  const employee = record.employee as Record<string, unknown> | undefined | null
  if (employee !== undefined) {
    result.employee = employee
      ? {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          personnelNumber: employee.personnelNumber,
          isActive: employee.isActive,
          departmentId: employee.departmentId ?? null,
        }
      : null
  }

  return result as z.infer<typeof monthlyValueOutputSchema>
}

/**
 * Maps a MonthSummary (from service) to the output schema shape.
 * Handles Decimal serialization.
 */
function mapMonthSummaryToOutput(
  summary: MonthSummary
): z.infer<typeof monthSummaryOutputSchema> {
  return {
    ...summary,
    vacationTaken:
      summary.vacationTaken instanceof Decimal
        ? summary.vacationTaken.toNumber()
        : Number(summary.vacationTaken),
  }
}

// --- Router ---

export const monthlyValuesRouter = createTRPCRouter({
  /**
   * monthlyValues.forEmployee -- Returns monthly summary for an employee in a specific month.
   *
   * If no persisted MonthlyValue exists, calculates on-the-fly (does NOT persist).
   *
   * Used by: monthly evaluation view, employee month overview.
   * Replaces: GET /employees/{id}/months/{year}/{month}
   *
   * Requires: time_tracking.view_own (own) or time_tracking.view_all (any employee)
   */
  forEmployee: tenantProcedure
    .use(
      requireEmployeePermission(
        (input) => (input as { employeeId: string }).employeeId,
        TIME_TRACKING_VIEW_OWN,
        TIME_TRACKING_VIEW_ALL
      )
    )
    .input(forEmployeeInputSchema)
    .output(monthSummaryOutputSchema)
    .query(async ({ ctx, input }) => {
      const { employeeId, year, month } = input
      try {
        const summary = await monthlyValuesService.forEmployee(
          ctx.prisma,
          employeeId,
          year,
          month
        )
        return mapMonthSummaryToOutput(summary)
      } catch (err) {
        mapServiceError(err)
      }
    }),

  /**
   * monthlyValues.yearOverview -- Returns all monthly summaries for an employee in a year.
   *
   * Used by: year overview widget, annual summary.
   * Replaces: GET /employees/{id}/months/{year}
   *
   * Requires: time_tracking.view_own (own) or time_tracking.view_all (any employee)
   */
  yearOverview: tenantProcedure
    .use(
      requireEmployeePermission(
        (input) => (input as { employeeId: string }).employeeId,
        TIME_TRACKING_VIEW_OWN,
        TIME_TRACKING_VIEW_ALL
      )
    )
    .input(yearOverviewInputSchema)
    .output(z.array(monthSummaryOutputSchema))
    .query(async ({ ctx, input }) => {
      const { employeeId, year } = input
      try {
        const summaries = await monthlyValuesService.yearOverview(
          ctx.prisma,
          employeeId,
          year
        )
        return summaries.map(mapMonthSummaryToOutput)
      } catch (err) {
        mapServiceError(err)
      }
    }),

  /**
   * monthlyValues.list -- Returns paginated monthly values for the admin view.
   *
   * Supports filters: year, month, status, departmentId, employeeId.
   * Applies data scope filtering via employee relation.
   * Includes employee summary in each result.
   *
   * Used by: admin monthly values page.
   * Replaces: GET /monthly-values
   *
   * Requires: reports.view permission
   */
  list: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .use(applyDataScope())
    .input(listInputSchema)
    .output(
      z.object({
        items: z.array(monthlyValueOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
      const dataScopeWhere = buildMonthlyValueDataScopeWhere(dataScope)

      try {
        const { items, total } = await monthlyValuesService.list(
          ctx.prisma,
          tenantId,
          {
            year: input.year,
            month: input.month,
            page: input.page,
            pageSize: input.pageSize,
            status: input.status,
            departmentId: input.departmentId,
            employeeId: input.employeeId,
            dataScopeWhere,
          }
        )
        return {
          items: items.map((item) =>
            mapMonthlyValueToOutput(item as unknown as Record<string, unknown>)
          ),
          total,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * monthlyValues.getById -- Returns a single monthly value by ID.
   *
   * Used by: monthly value detail view.
   * Replaces: GET /monthly-values/{id}
   *
   * Requires: reports.view permission
   */
  getById: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(byIdInputSchema)
    .output(monthlyValueOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      try {
        const mv = await monthlyValuesService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapMonthlyValueToOutput(mv as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * monthlyValues.close -- Closes a month (prevents further modifications).
   *
   * Accepts either { id } or { employeeId, year, month } input shape.
   *
   * Used by: admin close button, employee close-month-sheet.
   * Replaces: POST /monthly-values/{id}/close, POST /employees/{id}/months/{year}/{month}/close
   *
   * Requires: reports.view permission
   */
  close: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(closeReopenInputSchema)
    .output(monthlyValueOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      try {
        const updated = await monthlyValuesService.close(
          ctx.prisma,
          tenantId,
          input,
          ctx.user!.id
        )
        return mapMonthlyValueToOutput(
          updated as unknown as Record<string, unknown>
        )
      } catch (err) {
        mapServiceError(err)
      }
    }),

  /**
   * monthlyValues.reopen -- Reopens a closed month (allows modifications).
   *
   * Accepts either { id } or { employeeId, year, month } input shape.
   *
   * Used by: admin reopen button, employee reopen-month-sheet.
   * Replaces: POST /monthly-values/{id}/reopen, POST /employees/{id}/months/{year}/{month}/reopen
   *
   * Requires: reports.view permission
   */
  reopen: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(closeReopenInputSchema)
    .output(monthlyValueOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      try {
        const updated = await monthlyValuesService.reopen(
          ctx.prisma,
          tenantId,
          input,
          ctx.user!.id
        )
        return mapMonthlyValueToOutput(
          updated as unknown as Record<string, unknown>
        )
      } catch (err) {
        mapServiceError(err)
      }
    }),

  /**
   * monthlyValues.closeBatch -- Batch close monthly values.
   *
   * Matches Go handler shape: { year, month, employeeIds?, departmentId?, recalculate? }
   * Used by frontend batch-close-dialog.tsx.
   *
   * Replaces: POST /monthly-values/close-batch
   *
   * Requires: reports.view permission
   */
  closeBatch: tenantProcedure
    .use(requirePermission(REPORTS_VIEW))
    .input(closeBatchInputSchema)
    .output(
      z.object({
        closedCount: z.number().int(),
        skippedCount: z.number().int(),
        errorCount: z.number().int(),
        errors: z.array(
          z.object({
            employeeId: z.string(),
            reason: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const userId = ctx.user!.id
      try {
        return await monthlyValuesService.closeBatch(
          ctx.prisma,
          tenantId,
          input,
          userId
        )
      } catch (err) {
        mapServiceError(err)
      }
    }),

  /**
   * monthlyValues.recalculate -- Recalculates monthly values.
   *
   * Can target a specific employee or all active employees in the tenant.
   *
   * Used by: admin recalculate dialog.
   * Replaces: POST /monthly-values/recalculate
   *
   * Requires: booking_overview.calculate_month permission
   */
  recalculate: tenantProcedure
    .use(requirePermission(CALCULATE_MONTH))
    .input(recalculateInputSchema)
    .output(
      z.object({
        message: z.string(),
        affectedEmployees: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      try {
        return await monthlyValuesService.recalculate(
          ctx.prisma,
          tenantId,
          input
        )
      } catch (err) {
        mapServiceError(err)
      }
    }),
})

// --- Exported helpers for testing ---

export {
  mapMonthlyValueToOutput,
  mapMonthSummaryToOutput,
  buildMonthlyValueDataScopeWhere,
  checkMonthlyValueDataScope,
  mapServiceError,
}
