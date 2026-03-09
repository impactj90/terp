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
} from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---
// All 5 evaluation endpoints require reports.view
// Matching Go route registration at apps/api/internal/handler/routes.go:1030-1049

const REPORTS_VIEW = permissionIdByKey("reports.view")!

// --- Shared Output Schemas ---

const employeeSummarySchema = z
  .object({
    id: z.string().uuid(),
    personnelNumber: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    isActive: z.boolean(),
  })
  .nullable()

const bookingTypeSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    direction: z.string(),
  })
  .nullable()

const userSummarySchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string(),
  })
  .nullable()

// --- Output Schemas ---

const dailyValueEvalOutputSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
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
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  bookingDate: z.date(),
  bookingTypeId: z.string().uuid(),
  originalTime: z.number().int(),
  editedTime: z.number().int(),
  calculatedTime: z.number().int().nullable(),
  timeString: z.string(),
  pairId: z.string().uuid().nullable(),
  terminalId: z.string().uuid().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  employee: employeeSummarySchema.optional(),
  bookingType: bookingTypeSummarySchema.optional(),
})

const terminalBookingEvalOutputSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  bookingDate: z.date(),
  bookingTypeId: z.string().uuid(),
  originalTime: z.number().int(),
  editedTime: z.number().int(),
  calculatedTime: z.number().int().nullable(),
  wasEdited: z.boolean(),
  originalTimeString: z.string(),
  editedTimeString: z.string(),
  source: z.string().nullable(),
  terminalId: z.string().uuid().nullable(),
  createdAt: z.date(),
  employee: employeeSummarySchema.optional(),
  bookingType: bookingTypeSummarySchema.optional(),
})

const logEvalOutputSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  entityName: z.string().nullable(),
  changes: z.unknown().nullable(),
  performedAt: z.date(),
  userId: z.string().uuid().nullable(),
  user: userSummarySchema.optional(),
})

const workflowEvalOutputSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  entityName: z.string().nullable(),
  metadata: z.unknown().nullable(),
  performedAt: z.date(),
  userId: z.string().uuid().nullable(),
  user: userSummarySchema.optional(),
})

// --- Input Schemas ---

const dailyValuesInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  hasErrors: z.boolean().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})

const bookingsInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  bookingTypeId: z.string().uuid().optional(),
  source: z.string().optional(),
  direction: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})

const terminalBookingsInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})

const logsInputSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
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

// --- Prisma Include Objects ---

const evalDailyValueInclude = {
  employee: {
    select: {
      id: true,
      personnelNumber: true,
      firstName: true,
      lastName: true,
      isActive: true,
    },
  },
} as const

const evalBookingInclude = {
  employee: {
    select: {
      id: true,
      personnelNumber: true,
      firstName: true,
      lastName: true,
      isActive: true,
    },
  },
  bookingType: {
    select: { id: true, code: true, name: true, direction: true },
  },
} as const

const evalLogInclude = {
  user: {
    select: { id: true, displayName: true },
  },
} as const

// --- Data Scope Helper ---

/**
 * Builds a Prisma WHERE clause for evaluation data scope filtering.
 * Data scope is applied via the employee relation (same pattern as dailyValues/bookings routers).
 */
function buildDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

// --- Helper Functions ---

/**
 * Converts minutes from midnight to HH:MM string.
 * Port of Go timeutil.MinutesToString().
 */
function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

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
      const tenantId = ctx.tenantId!
      const { page, pageSize } = input
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      const where: Record<string, unknown> = { tenantId }

      // Date range filter (required)
      where.valueDate = {
        gte: new Date(input.fromDate),
        lte: new Date(input.toDate),
      }

      // Optional filters
      if (input.employeeId) {
        where.employeeId = input.employeeId
      }

      if (input.hasErrors !== undefined) {
        where.hasError = input.hasErrors
      }

      // Department filter (via employee relation)
      if (input.departmentId) {
        where.employee = {
          ...((where.employee as Record<string, unknown>) || {}),
          departmentId: input.departmentId,
        }
      }

      // Apply data scope filtering
      const scopeWhere = buildDataScopeWhere(dataScope)
      if (scopeWhere) {
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
          include: evalDailyValueInclude,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { valueDate: "asc" },
        }),
        ctx.prisma.dailyValue.count({ where }),
      ])

      return {
        items: items.map((record) => {
          const r = record as unknown as Record<string, unknown>
          const overtime = (r.overtime as number) ?? 0
          const undertime = (r.undertime as number) ?? 0
          const employee = r.employee as Record<string, unknown> | null | undefined

          return {
            id: r.id as string,
            employeeId: r.employeeId as string,
            valueDate: r.valueDate as Date,
            status: (r.status as string) || "pending",
            targetMinutes: (r.targetTime as number) ?? 0,
            grossMinutes: (r.grossTime as number) ?? 0,
            netMinutes: (r.netTime as number) ?? 0,
            breakMinutes: (r.breakTime as number) ?? 0,
            overtimeMinutes: overtime,
            undertimeMinutes: undertime,
            balanceMinutes: overtime - undertime,
            bookingCount: (r.bookingCount as number) ?? 0,
            hasErrors: (r.hasError as boolean) ?? false,
            firstCome: (r.firstCome as number | null) ?? null,
            lastGo: (r.lastGo as number | null) ?? null,
            employee: employee
              ? {
                  id: employee.id as string,
                  personnelNumber: employee.personnelNumber as string,
                  firstName: employee.firstName as string,
                  lastName: employee.lastName as string,
                  isActive: employee.isActive as boolean,
                }
              : null,
          }
        }),
        total,
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
      const tenantId = ctx.tenantId!
      const { page, pageSize } = input
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      const where: Record<string, unknown> = { tenantId }

      // Date range filter (required)
      where.bookingDate = {
        gte: new Date(input.fromDate),
        lte: new Date(input.toDate),
      }

      // Optional filters
      if (input.employeeId) {
        where.employeeId = input.employeeId
      }

      if (input.bookingTypeId) {
        where.bookingTypeId = input.bookingTypeId
      }

      if (input.source) {
        where.source = input.source
      }

      // Direction filter via bookingType relation
      if (input.direction) {
        where.bookingType = {
          ...((where.bookingType as Record<string, unknown>) || {}),
          direction: input.direction,
        }
      }

      // Department filter (via employee relation)
      if (input.departmentId) {
        where.employee = {
          ...((where.employee as Record<string, unknown>) || {}),
          departmentId: input.departmentId,
        }
      }

      // Apply data scope filtering
      const scopeWhere = buildDataScopeWhere(dataScope)
      if (scopeWhere) {
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
        ctx.prisma.booking.findMany({
          where,
          include: evalBookingInclude,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ bookingDate: "desc" }, { editedTime: "desc" }],
        }),
        ctx.prisma.booking.count({ where }),
      ])

      return {
        items: items.map((record) => {
          const r = record as unknown as Record<string, unknown>
          const employee = r.employee as Record<string, unknown> | null | undefined
          const bookingType = r.bookingType as Record<string, unknown> | null | undefined
          const editedTime = (r.editedTime as number) ?? 0

          return {
            id: r.id as string,
            employeeId: r.employeeId as string,
            bookingDate: r.bookingDate as Date,
            bookingTypeId: r.bookingTypeId as string,
            originalTime: (r.originalTime as number) ?? 0,
            editedTime,
            calculatedTime: (r.calculatedTime as number | null) ?? null,
            timeString: minutesToTimeString(editedTime),
            pairId: (r.pairId as string | null) ?? null,
            terminalId: (r.terminalId as string | null) ?? null,
            source: (r.source as string | null) ?? null,
            notes: (r.notes as string | null) ?? null,
            createdAt: r.createdAt as Date,
            employee: employee
              ? {
                  id: employee.id as string,
                  personnelNumber: employee.personnelNumber as string,
                  firstName: employee.firstName as string,
                  lastName: employee.lastName as string,
                  isActive: employee.isActive as boolean,
                }
              : null,
            bookingType: bookingType
              ? {
                  id: bookingType.id as string,
                  code: bookingType.code as string,
                  name: bookingType.name as string,
                  direction: bookingType.direction as string,
                }
              : null,
          }
        }),
        total,
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
      const tenantId = ctx.tenantId!
      const { page, pageSize } = input
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      const where: Record<string, unknown> = { tenantId }

      // Date range filter (required)
      where.bookingDate = {
        gte: new Date(input.fromDate),
        lte: new Date(input.toDate),
      }

      // Hardcoded terminal source filter
      where.source = "terminal"

      // Optional filters
      if (input.employeeId) {
        where.employeeId = input.employeeId
      }

      // Department filter (via employee relation)
      if (input.departmentId) {
        where.employee = {
          ...((where.employee as Record<string, unknown>) || {}),
          departmentId: input.departmentId,
        }
      }

      // Apply data scope filtering
      const scopeWhere = buildDataScopeWhere(dataScope)
      if (scopeWhere) {
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
        ctx.prisma.booking.findMany({
          where,
          include: evalBookingInclude,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ bookingDate: "desc" }, { editedTime: "desc" }],
        }),
        ctx.prisma.booking.count({ where }),
      ])

      return {
        items: items.map((record) => {
          const r = record as unknown as Record<string, unknown>
          const employee = r.employee as Record<string, unknown> | null | undefined
          const bookingType = r.bookingType as Record<string, unknown> | null | undefined
          const originalTime = (r.originalTime as number) ?? 0
          const editedTime = (r.editedTime as number) ?? 0

          return {
            id: r.id as string,
            employeeId: r.employeeId as string,
            bookingDate: r.bookingDate as Date,
            bookingTypeId: r.bookingTypeId as string,
            originalTime,
            editedTime,
            calculatedTime: (r.calculatedTime as number | null) ?? null,
            wasEdited: originalTime !== editedTime,
            originalTimeString: minutesToTimeString(originalTime),
            editedTimeString: minutesToTimeString(editedTime),
            source: (r.source as string | null) ?? null,
            terminalId: (r.terminalId as string | null) ?? null,
            createdAt: r.createdAt as Date,
            employee: employee
              ? {
                  id: employee.id as string,
                  personnelNumber: employee.personnelNumber as string,
                  firstName: employee.firstName as string,
                  lastName: employee.lastName as string,
                  isActive: employee.isActive as boolean,
                }
              : null,
            bookingType: bookingType
              ? {
                  id: bookingType.id as string,
                  code: bookingType.code as string,
                  name: bookingType.name as string,
                  direction: bookingType.direction as string,
                }
              : null,
          }
        }),
        total,
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
      const tenantId = ctx.tenantId!
      const { page, pageSize } = input

      const where: Record<string, unknown> = { tenantId }

      // Date range filter with end-of-day adjustment
      // Matches Go: f.To.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
      const toEnd = new Date(input.toDate)
      toEnd.setHours(23, 59, 59, 999)
      where.performedAt = {
        gte: new Date(input.fromDate),
        lte: toEnd,
      }

      // Optional filters
      if (input.entityType) {
        where.entityType = input.entityType
      }

      if (input.action) {
        where.action = input.action
      }

      if (input.userId) {
        where.userId = input.userId
      }

      const [items, total] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where,
          include: evalLogInclude,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { performedAt: "desc" },
        }),
        ctx.prisma.auditLog.count({ where }),
      ])

      return {
        items: items.map((record) => {
          const r = record as unknown as Record<string, unknown>
          const user = r.user as Record<string, unknown> | null | undefined

          return {
            id: r.id as string,
            action: r.action as string,
            entityType: r.entityType as string,
            entityId: r.entityId as string,
            entityName: (r.entityName as string | null) ?? null,
            changes: r.changes ?? null,
            performedAt: r.performedAt as Date,
            userId: (r.userId as string | null) ?? null,
            user: user
              ? {
                  id: user.id as string,
                  displayName: user.displayName as string,
                }
              : null,
          }
        }),
        total,
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
      const tenantId = ctx.tenantId!
      const { page, pageSize } = input

      const where: Record<string, unknown> = { tenantId }

      // Date range filter with end-of-day adjustment
      const toEnd = new Date(input.toDate)
      toEnd.setHours(23, 59, 59, 999)
      where.performedAt = {
        gte: new Date(input.fromDate),
        lte: toEnd,
      }

      // Default entity types for workflow (when not specified)
      const entityTypes = input.entityType
        ? [input.entityType]
        : ["absence", "monthly_value"]
      where.entityType = { in: entityTypes }

      // Default actions for workflow (when not specified)
      const actions = input.action
        ? [input.action]
        : ["create", "approve", "reject", "close", "reopen"]
      where.action = { in: actions }

      const [items, total] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where,
          include: evalLogInclude,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { performedAt: "desc" },
        }),
        ctx.prisma.auditLog.count({ where }),
      ])

      return {
        items: items.map((record) => {
          const r = record as unknown as Record<string, unknown>
          const user = r.user as Record<string, unknown> | null | undefined

          return {
            id: r.id as string,
            action: r.action as string,
            entityType: r.entityType as string,
            entityId: r.entityId as string,
            entityName: (r.entityName as string | null) ?? null,
            metadata: r.metadata ?? null,
            performedAt: r.performedAt as Date,
            userId: (r.userId as string | null) ?? null,
            user: user
              ? {
                  id: user.id as string,
                  displayName: user.displayName as string,
                }
              : null,
          }
        }),
        total,
      }
    }),
})
