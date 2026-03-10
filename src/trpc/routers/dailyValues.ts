/**
 * Daily Values Router
 *
 * Provides daily value list and approval operations via tRPC procedures.
 * Daily values are the calculated daily results for work time, overtime, breaks, etc.
 *
 * Replaces the Go backend daily value endpoints:
 * - GET /employees/{id}/months/{year}/{month}/days -> dailyValues.list
 * - GET /daily-values -> dailyValues.listAll
 * - POST /daily-values/{id}/approve -> dailyValues.approve
 *
 * @see apps/api/internal/service/dailyvalue.go
 * @see apps/api/internal/handler/dailyvalue.go
 * @see apps/api/internal/repository/dailyvalue.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as dailyValueService from "@/lib/services/daily-value-service"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:484-501

const TIME_TRACKING_VIEW_OWN = permissionIdByKey("time_tracking.view_own")!
const TIME_TRACKING_VIEW_ALL = permissionIdByKey("time_tracking.view_all")!
const TIME_TRACKING_APPROVE = permissionIdByKey("time_tracking.approve")!

// --- Output Schemas ---

const employeeSummarySchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    isActive: z.boolean(),
    departmentId: z.string().nullable(),
    tariffId: z.string().nullable(),
  })
  .nullable()

const dailyValueOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  valueDate: z.date(),
  status: z.string(),
  grossTime: z.number().int(),
  netTime: z.number().int(),
  targetTime: z.number().int(),
  overtime: z.number().int(),
  undertime: z.number().int(),
  breakTime: z.number().int(),
  balanceMinutes: z.number().int(), // computed: overtime - undertime
  hasError: z.boolean(),
  errorCodes: z.array(z.string()),
  warnings: z.array(z.string()),
  firstCome: z.number().int().nullable(),
  lastGo: z.number().int().nullable(),
  bookingCount: z.number().int(),
  calculatedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Nested employee (included in listAll)
  employee: employeeSummarySchema.optional(),
})

// --- Input Schemas ---

const listInputSchema = z.object({
  employeeId: z.string(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

const listAllInputSchema = z
  .object({
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
    employeeId: z.string().optional(),
    departmentId: z.string().optional(),
    fromDate: z.string().date().optional(), // YYYY-MM-DD
    toDate: z.string().date().optional(), // YYYY-MM-DD
    status: z
      .enum(["pending", "calculated", "error", "approved"])
      .optional(),
    hasErrors: z.boolean().optional(),
  })
  .optional()

const approveInputSchema = z.object({
  id: z.string(),
})

// --- Helper Functions ---

/**
 * Maps a Prisma DailyValue record to the output schema shape.
 * Mirrors Go dailyValueToResponse at handler/dailyvalue.go:302-362.
 */
function mapDailyValueToOutput(
  record: Record<string, unknown>
): z.infer<typeof dailyValueOutputSchema> {
  const overtime = record.overtime as number
  const undertime = record.undertime as number

  const result: Record<string, unknown> = {
    id: record.id,
    tenantId: record.tenantId,
    employeeId: record.employeeId,
    valueDate: record.valueDate,
    status: record.status || (record.hasError ? "error" : "calculated"),
    grossTime: record.grossTime,
    netTime: record.netTime,
    targetTime: record.targetTime,
    overtime,
    undertime,
    breakTime: record.breakTime,
    balanceMinutes: overtime - undertime,
    hasError: record.hasError,
    errorCodes: record.errorCodes ?? [],
    warnings: record.warnings ?? [],
    firstCome: record.firstCome ?? null,
    lastGo: record.lastGo ?? null,
    bookingCount: record.bookingCount,
    calculatedAt: record.calculatedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }

  // Include employee if present (from listAll include)
  const employee = record.employee as
    | Record<string, unknown>
    | undefined
    | null
  if (employee !== undefined) {
    result.employee = employee
      ? {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          personnelNumber: employee.personnelNumber,
          isActive: employee.isActive,
          departmentId: employee.departmentId ?? null,
          tariffId: employee.tariffId ?? null,
        }
      : null
  }

  return result as z.infer<typeof dailyValueOutputSchema>
}

// --- Router ---

export const dailyValuesRouter = createTRPCRouter({
  /**
   * dailyValues.list -- Returns daily values for an employee in a specific month.
   *
   * Used by: month view, week view, monthly evaluation, dashboard widgets.
   * Replaces: GET /employees/{id}/months/{year}/{month}/days
   *
   * Requires: time_tracking.view_own (own) or time_tracking.view_all (any employee)
   */
  list: tenantProcedure
    .use(
      requireEmployeePermission(
        (input) => (input as { employeeId: string }).employeeId,
        TIME_TRACKING_VIEW_OWN,
        TIME_TRACKING_VIEW_ALL
      )
    )
    .input(listInputSchema)
    .output(z.array(dailyValueOutputSchema))
    .query(async ({ ctx, input }) => {
      try {
        const values = await dailyValueService.list(
          ctx.prisma,
          ctx.tenantId!,
          input
        )

        return values.map((v) =>
          mapDailyValueToOutput(v as unknown as Record<string, unknown>)
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dailyValues.listAll -- Returns paginated daily values for the admin view.
   *
   * Supports filters: employeeId, departmentId, fromDate, toDate, status, hasErrors.
   * Applies data scope filtering via employee relation.
   * Includes employee summary in each result.
   * Orders by value_date ASC (matches Go behavior).
   *
   * Used by: admin approvals page.
   * Replaces: GET /daily-values
   *
   * Requires: time_tracking.view_all permission
   */
  listAll: tenantProcedure
    .use(requirePermission(TIME_TRACKING_VIEW_ALL))
    .use(applyDataScope())
    .input(listAllInputSchema)
    .output(
      z.object({
        items: z.array(dailyValueOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope })
          .dataScope

        const result = await dailyValueService.listAll(
          ctx.prisma,
          ctx.tenantId!,
          dataScope,
          input ?? undefined
        )

        return {
          items: result.items.map((item) =>
            mapDailyValueToOutput(
              item as unknown as Record<string, unknown>
            )
          ),
          total: result.total,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dailyValues.getById -- Returns a single daily value by ID.
   *
   * Tenant-scoped. Data scope enforced after fetch.
   *
   * Replaces: GET /daily-values/{id}
   *
   * Requires: time_tracking.view_own or time_tracking.view_all
   */
  getById: tenantProcedure
    .use(requirePermission(TIME_TRACKING_VIEW_OWN, TIME_TRACKING_VIEW_ALL))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(dailyValueOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const dv = await dailyValueService.getById(
          ctx.prisma,
          ctx.tenantId!,
          dataScope,
          input.id
        )
        return mapDailyValueToOutput(dv as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dailyValues.recalculate -- Recalculates daily values for a date range.
   *
   * Optionally targets a single employee. If no employeeId is provided,
   * recalculates for all active employees in the tenant.
   *
   * Replaces: POST /daily-values/recalculate
   *
   * Requires: booking_overview.calculate_day permission
   */
  recalculate: tenantProcedure
    .use(requirePermission(permissionIdByKey("booking_overview.calculate_day")!))
    .input(
      z.object({
        from: z.string().date(), // YYYY-MM-DD
        to: z.string().date(), // YYYY-MM-DD
        employeeId: z.string().optional(),
      })
    )
    .output(
      z.object({
        message: z.string(),
        affectedDays: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await dailyValueService.recalculate(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * dailyValues.approve -- Approves a daily value (sets status to "approved").
   *
   * Validation:
   * - Daily value must not have errors (hasError=true or status="error")
   * - Daily value must not already be approved
   *
   * On success: sends "Timesheet approved" notification to the employee.
   *
   * Replaces: POST /daily-values/{id}/approve
   *
   * Requires: time_tracking.approve permission
   */
  approve: tenantProcedure
    .use(requirePermission(TIME_TRACKING_APPROVE))
    .use(applyDataScope())
    .input(approveInputSchema)
    .output(dailyValueOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope })
          .dataScope

        const updated = await dailyValueService.approve(
          ctx.prisma,
          ctx.tenantId!,
          dataScope,
          input.id
        )

        return mapDailyValueToOutput(
          updated as unknown as Record<string, unknown>
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
