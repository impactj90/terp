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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:484-501

const TIME_TRACKING_VIEW_OWN = permissionIdByKey("time_tracking.view_own")!
const TIME_TRACKING_VIEW_ALL = permissionIdByKey("time_tracking.view_all")!
const TIME_TRACKING_APPROVE = permissionIdByKey("time_tracking.approve")!

// --- Output Schemas ---

const employeeSummarySchema = z
  .object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    isActive: z.boolean(),
    departmentId: z.string().uuid().nullable(),
    tariffId: z.string().uuid().nullable(),
  })
  .nullable()

const dailyValueOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
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
  employeeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

const listAllInputSchema = z
  .object({
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
    employeeId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    fromDate: z.string().date().optional(), // YYYY-MM-DD
    toDate: z.string().date().optional(), // YYYY-MM-DD
    status: z
      .enum(["pending", "calculated", "error", "approved"])
      .optional(),
    hasErrors: z.boolean().optional(),
  })
  .optional()

const approveInputSchema = z.object({
  id: z.string().uuid(),
})

// --- Prisma Include Objects ---

const dailyValueListAllInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
      tariffId: true,
    },
  },
} as const

// --- Data Scope Helpers ---

/**
 * Builds a Prisma WHERE clause for daily value data scope filtering.
 * Daily values are scoped via the employee relation (same as bookings).
 */
function buildDailyValueDataScopeWhere(
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
 * Checks that a daily value falls within the user's data scope.
 * Throws FORBIDDEN if not.
 */
function checkDailyValueDataScope(
  dataScope: DataScope,
  dailyValue: {
    employeeId: string
    employee?: { departmentId: string | null } | null
  }
): void {
  if (dataScope.type === "department") {
    if (
      !dailyValue.employee?.departmentId ||
      !dataScope.departmentIds.includes(dailyValue.employee.departmentId)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Daily value not within data scope",
      })
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(dailyValue.employeeId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Daily value not within data scope",
      })
    }
  }
}

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
      const tenantId = ctx.tenantId!
      const { employeeId, year, month } = input

      // Build date range for the month
      const from = new Date(year, month - 1, 1) // first day of month
      const to = new Date(year, month, 0) // last day of month

      const values = await ctx.prisma.dailyValue.findMany({
        where: {
          tenantId,
          employeeId,
          valueDate: { gte: from, lte: to },
        },
        orderBy: { valueDate: "asc" },
      })

      return values.map((v) =>
        mapDailyValueToOutput(v as unknown as Record<string, unknown>)
      )
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
      const tenantId = ctx.tenantId!
      const page = input?.page ?? 1
      const pageSize = input?.pageSize ?? 50
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      const where: Record<string, unknown> = { tenantId }

      // Optional filters
      if (input?.employeeId) {
        where.employeeId = input.employeeId
      }

      if (input?.status) {
        where.status = input.status
      }

      if (input?.hasErrors !== undefined) {
        where.hasError = input.hasErrors
      }

      // Department filter (via employee relation)
      if (input?.departmentId) {
        where.employee = {
          ...((where.employee as Record<string, unknown>) || {}),
          departmentId: input.departmentId,
        }
      }

      // Date range filters
      if (input?.fromDate || input?.toDate) {
        const valueDate: Record<string, unknown> = {}
        if (input?.fromDate) {
          valueDate.gte = new Date(input.fromDate)
        }
        if (input?.toDate) {
          valueDate.lte = new Date(input.toDate)
        }
        where.valueDate = valueDate
      }

      // Apply data scope filtering
      const scopeWhere = buildDailyValueDataScopeWhere(dataScope)
      if (scopeWhere) {
        // Merge with existing employee filter if present
        if (scopeWhere.employee && where.employee) {
          where.employee = {
            ...((where.employee as Record<string, unknown>) || {}),
            ...((scopeWhere.employee as Record<string, unknown>) || {}),
          }
        } else {
          Object.assign(where, scopeWhere)
        }
      }

      const [items, total] = await Promise.all([
        ctx.prisma.dailyValue.findMany({
          where,
          include: dailyValueListAllInclude,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { valueDate: "asc" },
        }),
        ctx.prisma.dailyValue.count({ where }),
      ])

      return {
        items: items.map((item) =>
          mapDailyValueToOutput(item as unknown as Record<string, unknown>)
        ),
        total,
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
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // 1. Fetch the daily value with employee relation (for data scope check)
      const dv = await ctx.prisma.dailyValue.findFirst({
        where: { id: input.id, tenantId },
        include: {
          employee: {
            select: { id: true, departmentId: true },
          },
        },
      })

      if (!dv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Daily value not found",
        })
      }

      // 2. Check data scope
      checkDailyValueDataScope(dataScope, dv)

      // 3. Validate approval rules (port of Go Approve logic)
      if (dv.hasError || dv.status === "error") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Daily value has errors and cannot be approved",
        })
      }

      if (dv.status === "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Daily value is already approved",
        })
      }

      // 4. Update status to approved
      const updated = await ctx.prisma.dailyValue.update({
        where: { id: input.id },
        data: { status: "approved" },
        include: dailyValueListAllInclude,
      })

      // 5. Send notification (best effort, matches Go notifyTimesheetApproved)
      try {
        const dateLabel = dv.valueDate.toISOString().split("T")[0]
        const link = `/timesheet?view=day&date=${dateLabel}`

        // Look up the user ID for this employee
        const userTenant = await ctx.prisma.$queryRaw<
          { user_id: string }[]
        >`
          SELECT ut.user_id
          FROM user_tenants ut
          JOIN users u ON u.id = ut.user_id
          WHERE ut.tenant_id = ${tenantId}::uuid
            AND u.employee_id = ${dv.employeeId}::uuid
          LIMIT 1
        `

        if (userTenant && userTenant.length > 0) {
          await ctx.prisma.notification.create({
            data: {
              tenantId,
              userId: userTenant[0]!.user_id,
              type: "approvals",
              title: "Timesheet approved",
              message: `Your timesheet for ${dateLabel} was approved.`,
              link,
            },
          })
        }
      } catch {
        // Best effort -- notification failure should not fail the approval
        console.error(
          "Failed to send approval notification for daily value",
          input.id
        )
      }

      return mapDailyValueToOutput(
        updated as unknown as Record<string, unknown>
      )
    }),
})
