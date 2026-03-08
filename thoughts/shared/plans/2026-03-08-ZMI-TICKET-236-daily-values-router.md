# Implementation Plan: ZMI-TICKET-236 -- Daily Values Router (List, Approve) + Daily Account Values Router

Date: 2026-03-08
Ticket: ZMI-TICKET-236
Dependencies: ZMI-TICKET-231 (Prisma Schema), ZMI-TICKET-234 (DailyCalcService Port), ZMI-TICKET-235 (Calculate-Day Endpoint), ZMI-TICKET-203 (Authorization Middleware)

---

## 1. Summary

This ticket implements four interconnected pieces:

1. **`dailyValues` tRPC router** -- A new router with `list`, `listAll`, and `approve` procedures that replace the Go `GET /daily-values`, `GET /employees/{id}/months/{year}/{month}/days`, and `POST /daily-values/{id}/approve` endpoints.
2. **`dailyAccountValues` tRPC router** -- A new router with a `list` procedure that replaces the Go `GET /daily-account-values` endpoint.
3. **Frontend hooks migration** -- Rewrites `use-daily-values.ts` and `use-team-daily-values.ts` to use tRPC instead of direct Go API calls.
4. **Approval notification** -- Sends a "Timesheet approved" notification to the employee when a daily value is approved.

**Out of scope:** Recalculate endpoint (depends on RecalcService, not ported yet), monthly aggregation (TICKET-238).

---

## 2. Prerequisites

All prerequisites are already met:

| Dependency | Status | Location |
|---|---|---|
| Prisma models (DailyValue, DailyAccountValue, Account) | Exist | `apps/web/prisma/schema.prisma` lines 2819-2908 |
| DailyCalcService | Fully ported | `apps/web/src/server/services/daily-calc.ts` |
| Authorization middleware | All exist | `apps/web/src/server/middleware/authorization.ts` |
| Permission catalog (time_tracking.*, accounts.manage) | All exist | `apps/web/src/server/lib/permission-catalog.ts` |
| Bookings router (reference pattern) | Fully ported | `apps/web/src/server/routers/bookings.ts` |
| Employees router (dayView pattern) | Fully ported | `apps/web/src/server/routers/employees.ts` |
| Notification model | Exists | `apps/web/prisma/schema.prisma` line 1824 |

---

## 3. Key Design Decisions

### 3.1 Permission Mapping (Ticket vs Go vs Reality)

The ticket specifies aspirational permission keys (`daily_values.read_own`, `daily_values.read`, `daily_values.approve`) that do NOT exist in the permission catalog. The Go code uses:

| Ticket Permission | Go Permission | Permission Catalog Key |
|---|---|---|
| `daily_values.read_own` | `time_tracking.view_own` | `time_tracking.view_own` |
| `daily_values.read` | `time_tracking.view_all` | `time_tracking.view_all` |
| `daily_values.approve` | `time_tracking.approve` | `time_tracking.approve` |
| (account values) | `accounts.manage` | `accounts.manage` |

**Decision:** Use the existing Go permission keys (`time_tracking.*`, `accounts.manage`) since they are already in the catalog and match the Go behavior. No new permissions need to be created.

### 3.2 DailyAccountValues Input Shape

The ticket specifies `{ dailyValueId }` as input for `dailyAccountValues.list`, but the `daily_account_values` table has NO foreign key to `daily_values`. The Go endpoint uses `employee_id`, `account_id`, `from`, `to`, `source` filters.

**Decision:** Use the Go input shape (`employeeId`, `accountId`, `from`, `to`, `source`). For the common use case of "show account values for a specific day", consumers will pass `employeeId + from + to` (same date). The daily value's employee_id and value_date are always available from the parent context.

### 3.3 Response Shape: camelCase vs snake_case

The Go API returns snake_case fields (`employee_id`, `value_date`, `gross_minutes`, etc.). The existing tRPC routers use camelCase (Prisma convention). Frontend consumers that use the Go API hooks access snake_case fields.

**Decision:** The tRPC router returns camelCase (matching Prisma field names and existing tRPC conventions). The frontend hooks will map the tRPC response back to the existing snake_case `DailyValue` interface shape to minimize breaking changes for existing consumers. This is the same approach used in `use-employee-day.ts`.

### 3.4 `list` procedure: Employee Monthly Values

The `dailyValues.list` procedure serves the employee-scoped monthly data view (month/week view, monthly evaluation). Input: `{ employeeId, year, month }`. This maps to `GET /employees/{id}/months/{year}/{month}/days` in Go.

Implementation: Query `prisma.dailyValue.findMany` with `employeeId` + date range filter (`valueDate >= firstOfMonth AND valueDate <= lastOfMonth`).

---

## 4. Phases

### Phase 1: `dailyValues` tRPC Router

**Goal**: Create a new `dailyValues` router file with `list`, `listAll`, and `approve` procedures.

#### Files to Create

- `apps/web/src/server/routers/dailyValues.ts` -- New router file

#### Files to Modify

- `apps/web/src/server/root.ts` -- Register the new router

#### Implementation Steps

**Step 1.1: Create router file with permission constants**

Create `apps/web/src/server/routers/dailyValues.ts`. Follow the bookings router pattern exactly:

```typescript
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
```

**Step 1.2: Define output schemas**

The output schema for daily values must include the employee relation (used in admin listAll view) and computed `balanceMinutes`:

```typescript
// --- Output Schemas ---

const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  personnelNumber: z.string(),
  isActive: z.boolean(),
  departmentId: z.string().uuid().nullable(),
  tariffId: z.string().uuid().nullable(),
}).nullable()

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
```

**Step 1.3: Define input schemas**

```typescript
// --- Input Schemas ---

const listInputSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

const listAllInputSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  fromDate: z.string().date().optional(), // YYYY-MM-DD
  toDate: z.string().date().optional(), // YYYY-MM-DD
  status: z.enum(["pending", "calculated", "error", "approved"]).optional(),
  hasErrors: z.boolean().optional(),
}).optional()

const approveInputSchema = z.object({
  id: z.string().uuid(),
})
```

**Step 1.4: Define Prisma include objects**

```typescript
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
```

**Step 1.5: Add data scope helpers**

Follow the bookings router pattern exactly:

```typescript
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
```

**Step 1.6: Add helper to map Prisma record to output**

```typescript
// --- Helper Functions ---

/**
 * Maps a Prisma DailyValue record to the output schema shape.
 * Mirrors Go dailyValueToResponse at handler/dailyvalue.go:302-362.
 */
function mapDailyValueToOutput(record: Record<string, unknown>): z.infer<typeof dailyValueOutputSchema> {
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
  const employee = record.employee as Record<string, unknown> | undefined | null
  if (employee !== undefined) {
    result.employee = employee ? {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      personnelNumber: employee.personnelNumber,
      isActive: employee.isActive,
      departmentId: employee.departmentId ?? null,
      tariffId: employee.tariffId ?? null,
    } : null
  }

  return result as z.infer<typeof dailyValueOutputSchema>
}
```

**Step 1.7: Implement the `list` procedure**

Employee-scoped monthly daily values. Uses `requireEmployeePermission` for own-vs-all access:

```typescript
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
    .use(requireEmployeePermission(
      (input) => (input as { employeeId: string }).employeeId,
      TIME_TRACKING_VIEW_OWN,
      TIME_TRACKING_VIEW_ALL
    ))
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

      return values.map((v) => mapDailyValueToOutput(v as unknown as Record<string, unknown>))
    }),
```

**Key decisions:**
- Uses `requireEmployeePermission` so employees can view their own data with `view_own`, or managers can view any employee with `view_all`.
- No pagination needed (max 31 rows per month).
- No `applyDataScope()` -- the `requireEmployeePermission` middleware handles access control. Data scope is relevant for the `listAll` procedure.
- Does NOT include employee relation (caller already knows the employee).

**Step 1.8: Implement the `listAll` procedure**

Admin-facing paginated list with filters and data scope:

```typescript
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
    .output(z.object({
      items: z.array(dailyValueOutputSchema),
      total: z.number(),
    }))
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
        where.employee = { ...(where.employee as Record<string, unknown> || {}), departmentId: input.departmentId }
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
          where.employee = { ...(where.employee as Record<string, unknown>), ...(scopeWhere.employee as Record<string, unknown>) }
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
```

**Key decisions:**
- Uses `requirePermission(TIME_TRACKING_VIEW_ALL)` (matches Go: `time_tracking.view_all`).
- Uses `applyDataScope()` for department/employee-level filtering.
- Includes employee relation in output (admin view shows employee name/number).
- Orders by `valueDate ASC` (matches Go repository: `ORDER BY value_date ASC`).
- Supports pagination via `page`/`pageSize`.
- Department filter uses employee relation JOIN (matches Go: JOIN employees, filter employees.department_id).

**Step 1.9: Implement the `approve` procedure**

Port of Go `DailyValueService.Approve()` with notification:

```typescript
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
        const userTenant = await ctx.prisma.$queryRaw<{ user_id: string }[]>`
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
        console.error("Failed to send approval notification for daily value", input.id)
      }

      return mapDailyValueToOutput(updated as unknown as Record<string, unknown>)
    }),
})
```

**Key decisions:**
- Uses `requirePermission(TIME_TRACKING_APPROVE)` (matches Go: `time_tracking.approve`).
- Checks data scope after fetch (per-record check, same as Go `ensureEmployeeScope`).
- Approval validation exactly matches Go: `hasError || status == "error"` -> BAD_REQUEST, `status == "approved"` -> BAD_REQUEST.
- Notification uses the same pattern as `DailyCalcService.notifyDailyCalcError`: raw SQL to look up user_id from employee_id, then `prisma.notification.create`.
- Notification type is `"approvals"` (matches Go `model.NotificationTypeApprovals`).
- Notification is best-effort (error is caught and logged, does not fail the approval).

**Step 1.10: Register router in root.ts**

Add to `apps/web/src/server/root.ts`:

```typescript
import { dailyValuesRouter } from "./routers/dailyValues"

// In createTRPCRouter:
dailyValues: dailyValuesRouter,
```

#### Verification

1. Call `trpc.dailyValues.list({ employeeId, year: 2026, month: 3 })` -- should return array of DailyValue objects for the month
2. Call `trpc.dailyValues.listAll({ status: "calculated", fromDate: "2026-03-01", toDate: "2026-03-31" })` -- should return `{ items, total }` with employee summaries
3. Call `trpc.dailyValues.listAll({ departmentId: "..." })` -- should filter by department via employee relation
4. Call `trpc.dailyValues.approve({ id: "..." })` on a calculated daily value -- should set status to "approved" and create notification
5. Call `trpc.dailyValues.approve({ id: "..." })` on a daily value with errors -- should return BAD_REQUEST
6. Call `trpc.dailyValues.approve({ id: "..." })` on an already approved daily value -- should return BAD_REQUEST
7. Call with insufficient permissions -- should return FORBIDDEN

---

### Phase 2: `dailyAccountValues` tRPC Router

**Goal**: Create a new `dailyAccountValues` router file with a `list` procedure.

#### Files to Create

- `apps/web/src/server/routers/dailyAccountValues.ts` -- New router file

#### Files to Modify

- `apps/web/src/server/root.ts` -- Register the new router

#### Implementation Steps

**Step 2.1: Create router file**

Create `apps/web/src/server/routers/dailyAccountValues.ts`:

```typescript
/**
 * Daily Account Values Router
 *
 * Provides daily account value list operations via tRPC procedures.
 * Daily account values store per-day minutes allocated to specific accounts
 * (e.g., time accounts, surcharge accounts, capped time accounts).
 *
 * Replaces the Go backend daily account value endpoints:
 * - GET /daily-account-values -> dailyAccountValues.list
 *
 * @see apps/api/internal/service/daily_account_value.go
 * @see apps/api/internal/handler/daily_account_value.go
 * @see apps/api/internal/repository/daily_account_value.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---
const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!
```

**Step 2.2: Define output schema**

```typescript
// --- Output Schemas ---

const accountSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  accountType: z.string(),
  unit: z.string(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
}).nullable()

const dailyAccountValueOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  accountId: z.string().uuid(),
  valueDate: z.date(),
  valueMinutes: z.number().int(),
  source: z.string(), // "net_time" | "capped_time" | "surcharge"
  dayPlanId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Nested account details
  account: accountSummarySchema.optional(),
})
```

**Step 2.3: Define input schema**

```typescript
// --- Input Schemas ---

const listInputSchema = z.object({
  employeeId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  fromDate: z.string().date().optional(), // YYYY-MM-DD
  toDate: z.string().date().optional(), // YYYY-MM-DD
  source: z.enum(["net_time", "capped_time", "surcharge"]).optional(),
}).optional()
```

**Step 2.4: Define Prisma include and helper**

```typescript
// --- Prisma Include Objects ---

const dailyAccountValueInclude = {
  account: {
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      unit: true,
      isSystem: true,
      isActive: true,
    },
  },
} as const
```

**Step 2.5: Implement the `list` procedure**

```typescript
export const dailyAccountValuesRouter = createTRPCRouter({
  /**
   * dailyAccountValues.list -- Returns daily account values with optional filters.
   *
   * Includes account details (name, code, type) for each value.
   * Orders by valueDate ASC, source ASC (matches Go behavior).
   *
   * Replaces: GET /daily-account-values
   *
   * Requires: accounts.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ACCOUNTS_MANAGE))
    .input(listInputSchema)
    .output(z.object({ items: z.array(dailyAccountValueOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }

      if (input?.employeeId) {
        where.employeeId = input.employeeId
      }

      if (input?.accountId) {
        where.accountId = input.accountId
      }

      if (input?.source) {
        where.source = input.source
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

      const items = await ctx.prisma.dailyAccountValue.findMany({
        where,
        include: dailyAccountValueInclude,
        orderBy: [{ valueDate: "asc" }, { source: "asc" }],
      })

      return {
        items: items.map((item) => ({
          id: item.id,
          tenantId: item.tenantId,
          employeeId: item.employeeId,
          accountId: item.accountId,
          valueDate: item.valueDate,
          valueMinutes: item.valueMinutes,
          source: item.source,
          dayPlanId: item.dayPlanId,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          account: item.account ? {
            id: item.account.id,
            code: item.account.code,
            name: item.account.name,
            accountType: item.account.accountType,
            unit: item.account.unit,
            isSystem: item.account.isSystem,
            isActive: item.account.isActive,
          } : null,
        })),
      }
    }),
})
```

**Key decisions:**
- Uses `requirePermission(ACCOUNTS_MANAGE)` (matches Go: `accounts.manage`).
- No pagination (account values per day are typically < 20 rows, even for a date range the result set is manageable).
- Returns `{ items }` wrapper (consistent with other list endpoints).
- Orders by `valueDate ASC, source ASC` (matches Go repository).
- Includes account relation for display purposes.

**Step 2.6: Register router in root.ts**

Add to `apps/web/src/server/root.ts`:

```typescript
import { dailyAccountValuesRouter } from "./routers/dailyAccountValues"

// In createTRPCRouter:
dailyAccountValues: dailyAccountValuesRouter,
```

#### Verification

1. Call `trpc.dailyAccountValues.list({ employeeId: "...", fromDate: "2026-03-01", toDate: "2026-03-01" })` -- should return account values for that employee/day
2. Call with `source: "net_time"` filter -- should return only net_time entries
3. Call with `accountId` filter -- should return only entries for that account
4. Call without `accounts.manage` permission -- should return FORBIDDEN

---

### Phase 3: Frontend Hooks Migration (`use-daily-values.ts`)

**Goal**: Rewrite `use-daily-values.ts` to use tRPC instead of direct Go API calls, while maintaining backward compatibility with the existing `DailyValue` interface shape (snake_case).

#### Files to Modify

- `apps/web/src/hooks/api/use-daily-values.ts` -- Full rewrite

#### Implementation Steps

**Step 3.1: Rewrite `useDailyValues` hook**

Replace the `apiRequest`-based implementation with tRPC. The hook must maintain the same return shape (`{ data: DailyValue[] }`) and the same `DailyValue` interface (snake_case fields) for backward compatibility with existing consumers.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Keep the existing DailyValue interface (snake_case) for backward compatibility
export interface DailyValue {
  id: string
  employee_id: string
  value_date: string
  target_time: number
  gross_time: number
  break_time: number
  net_time: number
  overtime: number
  undertime: number
  has_error: boolean
  error_codes: string[] | null
  warnings: string[] | null
  booking_count: number
  first_come?: number
  last_go?: number
  // Legacy field aliases
  date?: string
  target_minutes?: number | null
  gross_minutes?: number | null
  break_minutes?: number | null
  net_minutes?: number | null
  balance_minutes?: number | null
  has_errors?: boolean
  errors?: Array<{ error_type: string; message?: string; severity?: 'error' | 'warning' }> | null
  status?: string
  is_holiday?: boolean
  is_absence?: boolean
  absence_type?: { id?: string; name: string } | null
  is_locked?: boolean
  calculated_at?: string | null
  day_plan?: { name: string; target_minutes: number } | null
}

interface UseDailyValuesOptions {
  employeeId?: string
  year?: number
  month?: number
  from?: string
  to?: string
  enabled?: boolean
}

/**
 * Transform tRPC response to legacy DailyValue shape for backward compatibility.
 */
function transformToLegacyDailyValue(dv: Record<string, unknown>): DailyValue {
  const overtime = (dv.overtime as number) ?? 0
  const undertime = (dv.undertime as number) ?? 0
  const balance = overtime - undertime
  const errorCodes = (dv.errorCodes as string[]) ?? []
  const warnings = (dv.warnings as string[]) ?? []

  // Build structured errors for legacy consumers
  const structuredErrors: Array<{ error_type: string; message?: string; severity?: 'error' | 'warning' }> = []
  for (const code of errorCodes) {
    structuredErrors.push({ error_type: code, message: code, severity: 'error' })
  }
  for (const code of warnings) {
    structuredErrors.push({ error_type: code, message: code, severity: 'warning' })
  }

  const valueDate = dv.valueDate instanceof Date
    ? dv.valueDate.toISOString().split('T')[0]!
    : String(dv.valueDate)

  return {
    id: dv.id as string,
    employee_id: dv.employeeId as string,
    value_date: valueDate,
    target_time: dv.targetTime as number,
    gross_time: dv.grossTime as number,
    break_time: dv.breakTime as number,
    net_time: dv.netTime as number,
    overtime,
    undertime,
    has_error: dv.hasError as boolean,
    error_codes: errorCodes.length > 0 ? errorCodes : null,
    warnings: warnings.length > 0 ? warnings : null,
    booking_count: dv.bookingCount as number,
    first_come: dv.firstCome as number | undefined,
    last_go: dv.lastGo as number | undefined,
    // Legacy aliases
    date: valueDate,
    target_minutes: dv.targetTime as number,
    gross_minutes: dv.grossTime as number,
    break_minutes: dv.breakTime as number,
    net_minutes: dv.netTime as number,
    balance_minutes: balance,
    has_errors: dv.hasError as boolean,
    errors: structuredErrors.length > 0 ? structuredErrors : null,
    status: dv.hasError ? 'error' : (warnings.length > 0 ? 'warning' : 'ok'),
    calculated_at: dv.calculatedAt ? String(dv.calculatedAt) : null,
    // Defaults for fields not available from this endpoint
    is_holiday: false,
    is_absence: false,
    absence_type: null,
    is_locked: false,
    day_plan: null,
  }
}

/**
 * Hook to fetch daily values for a specific month.
 * Uses tRPC dailyValues.list query.
 */
export function useDailyValues(options: UseDailyValuesOptions = {}) {
  const { employeeId, year, month, from, enabled = true } = options
  const trpc = useTRPC()

  // Support legacy from/to parameters
  let queryYear = year
  let queryMonth = month
  if (!queryYear && !queryMonth && from) {
    const fromDate = new Date(from)
    queryYear = fromDate.getFullYear()
    queryMonth = fromDate.getMonth() + 1
  }

  return useQuery({
    ...trpc.dailyValues.list.queryOptions(
      {
        employeeId: employeeId!,
        year: queryYear!,
        month: queryMonth!,
      },
      {
        enabled: enabled && !!employeeId && !!queryYear && !!queryMonth,
      }
    ),
    select: (data) => ({
      data: data.map((dv) => transformToLegacyDailyValue(dv as unknown as Record<string, unknown>)),
    }),
  })
}
```

**Key decisions:**
- Uses tRPC `dailyValues.list` query.
- Applies a `select` transform to convert camelCase tRPC response to snake_case `DailyValue` interface.
- Maintains the same return shape `{ data: DailyValue[] }` via `select`.
- The `DailyValue` interface is preserved exactly as-is for backward compatibility.
- Legacy `from`/`to` parameters are still supported (extracted to `year`/`month`).

**Step 3.2: Rewrite `useAllDailyValues` hook**

```typescript
interface UseAllDailyValuesOptions {
  employeeId?: string
  from?: string
  to?: string
  status?: 'pending' | 'calculated' | 'error' | 'approved'
  hasErrors?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch all daily values for admin approvals view.
 * Uses tRPC dailyValues.listAll query.
 */
export function useAllDailyValues(options: UseAllDailyValuesOptions = {}) {
  const { employeeId, from, to, status, hasErrors, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.dailyValues.listAll.queryOptions(
      {
        employeeId,
        fromDate: from,
        toDate: to,
        status,
        hasErrors,
        pageSize: 100,
      },
      { enabled }
    ),
    select: (data) => ({
      data: data.items.map((dv) => transformToLegacyDailyValue(dv as unknown as Record<string, unknown>)),
    }),
  })
}
```

**Key decisions:**
- Returns `{ data: DailyValue[] }` shape (matching existing `useApiQuery` return shape that consumers expect: `dailyValuesData?.data`).
- Uses `pageSize: 100` to match Go's default limit used by the frontend.
- The approvals page accesses `dv.employee_id` and `dv.value_date` -- both are included in the legacy transform.

**Step 3.3: Rewrite `useApproveDailyValue` hook**

```typescript
/**
 * Hook to approve a daily value.
 * Uses tRPC dailyValues.approve mutation.
 */
export function useApproveDailyValue() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.dailyValues.approve.mutationOptions(),
    onSuccess: () => {
      // Invalidate daily values queries so lists refetch
      queryClient.invalidateQueries({
        queryKey: trpc.dailyValues.listAll.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.dailyValues.list.queryKey(),
      })
    },
  })
}
```

**Key impact on consumers:**

The approvals page currently calls:
```typescript
await approveDailyValue.mutateAsync({ path: { id } })
```

This will need to change to:
```typescript
await approveDailyValue.mutateAsync({ id })
```

This is a breaking change in the mutation call signature that must be updated in Phase 5.

#### Verification

1. Load the timesheet month view -- should display daily values correctly (same data shape)
2. Load the monthly evaluation page -- same check
3. Load the admin approvals page -- should show daily values with employee names
4. Approve a timesheet -- should succeed and create a notification
5. Check that all legacy field aliases work (date, target_minutes, gross_minutes, etc.)

---

### Phase 4: Frontend Hooks Migration (`use-team-daily-values.ts`)

**Goal**: Rewrite `use-team-daily-values.ts` to use tRPC instead of direct Go API calls.

#### Files to Modify

- `apps/web/src/hooks/api/use-team-daily-values.ts` -- Full rewrite

#### Implementation Steps

**Step 4.1: Rewrite the hook**

```typescript
import { useTRPC } from "@/trpc"
import { useQueries } from "@tanstack/react-query"

export interface TeamDailyValuesResult {
  employeeId: string
  values: DailyValue[]
}

interface UseTeamDailyValuesOptions {
  employeeIds: string[]
  from: string
  to: string
  enabled?: boolean
  staleTime?: number
}

/**
 * Hook to fetch daily values for multiple employees over a date range.
 * Uses tRPC dailyValues.listAll with per-employee queries in parallel.
 *
 * Used by: Team Overview page.
 */
export function useTeamDailyValues({
  employeeIds,
  from,
  to,
  enabled = true,
  staleTime = 60 * 1000,
}: UseTeamDailyValuesOptions) {
  const trpc = useTRPC()

  const queries = useQueries({
    queries: employeeIds.map((employeeId) => ({
      ...trpc.dailyValues.listAll.queryOptions(
        {
          employeeId,
          fromDate: from,
          toDate: to,
          pageSize: 100,
        },
        {
          enabled: enabled && !!employeeId && !!from && !!to,
          staleTime,
        }
      ),
      select: (data: { items: Record<string, unknown>[]; total: number }): TeamDailyValuesResult => ({
        employeeId,
        values: data.items.map((dv) =>
          transformToLegacyDailyValue(dv as unknown as Record<string, unknown>)
        ),
      }),
    })),
  })

  return {
    data: queries.map((q) => q.data).filter(Boolean) as TeamDailyValuesResult[],
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    refetchAll: () => queries.forEach((q) => q.refetch()),
  }
}
```

**Key decisions:**
- Uses `dailyValues.listAll` per employee (same approach as the old hook which fired parallel `GET /daily-values?employee_id=X` calls).
- Applies the same `transformToLegacyDailyValue` function for backward compatibility.
- The `TeamDailyValuesResult` interface is preserved (same shape: `{ employeeId, values }`).
- The `DailyValue` type from the Go API OpenAPI types (`components['schemas']['DailyValue']`) is replaced by the local `DailyValue` interface from `use-daily-values.ts`.

**Step 4.2: Update import to use local DailyValue type**

The old file imports `components['schemas']['DailyValue']` from the OpenAPI types. The new file should import `DailyValue` from `./use-daily-values` and `transformToLegacyDailyValue` from the same file:

```typescript
import type { DailyValue } from './use-daily-values'
// Import the transform function -- it needs to be exported from use-daily-values.ts
```

This means `transformToLegacyDailyValue` needs to be exported from `use-daily-values.ts`.

#### Verification

1. Load the team overview page -- should display daily values for all team members
2. Change date range -- should refetch with new parameters
3. Verify `refetchAll()` works correctly

---

### Phase 5: Update Frontend Consumers

**Goal**: Update consumer components to handle the migration from Go API hooks to tRPC hooks.

#### Files to Search/Modify

The primary breaking change is in `useApproveDailyValue` mutation call signature.

**Step 5.1: Update approvals page mutation call**

In `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx`, the `handleApproveTimesheet` function needs updating:

```typescript
// OLD:
await approveDailyValue.mutateAsync({ path: { id } })

// NEW:
await approveDailyValue.mutateAsync({ id })
```

**Step 5.2: Update hooks index exports**

In `apps/web/src/hooks/api/index.ts`, the existing exports should continue to work since the function names and types are preserved:

```typescript
export {
  useDailyValues,
  useAllDailyValues,
  useApproveDailyValue,
  type DailyValue,
} from './use-daily-values'
```

No changes needed to the index file.

**Step 5.3: Verify all consumers**

All these files consume `useDailyValues` with the same options interface and access `data?.data` for the array. Since the `select` transform maintains this shape, no changes are needed:

- `apps/web/src/components/timesheet/week-view.tsx`
- `apps/web/src/components/timesheet/month-view.tsx`
- `apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx`
- `apps/web/src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx`
- `apps/web/src/components/dashboard/hours-this-week-card.tsx`
- `apps/web/src/components/dashboard/pending-actions.tsx`

The `useAllDailyValues` consumers:
- `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx` -- Only mutation call signature change needed (Step 5.1)

The `useTeamDailyValues` consumer:
- `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx` -- No changes needed (same interface)

#### Verification

1. Build the frontend (`npm run build`) -- should compile without errors
2. Run `npx tsc --noEmit` -- should pass
3. Test the approvals page approve button manually
4. Verify all pages that use daily values render correctly

---

## 5. Complete File Change Summary

### Files to Create

| File | Phase | Description |
|---|---|---|
| `apps/web/src/server/routers/dailyValues.ts` | 1 | DailyValues tRPC router (list, listAll, approve) |
| `apps/web/src/server/routers/dailyAccountValues.ts` | 2 | DailyAccountValues tRPC router (list) |

### Files to Modify

| File | Phase | Changes |
|---|---|---|
| `apps/web/src/server/root.ts` | 1, 2 | Register `dailyValues` and `dailyAccountValues` routers |
| `apps/web/src/hooks/api/use-daily-values.ts` | 3 | Full rewrite: Go API -> tRPC, add `transformToLegacyDailyValue` |
| `apps/web/src/hooks/api/use-team-daily-values.ts` | 4 | Full rewrite: Go API -> tRPC |
| `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx` | 5 | Update `approveDailyValue.mutateAsync` call signature |

---

## 6. Go Files Being Replaced

These Go files are being replaced by this ticket:

| Go File | Lines | Replaced By |
|---|---|---|
| `apps/api/internal/service/dailyvalue.go` | 101 | `dailyValues` router (inline business logic) |
| `apps/api/internal/handler/dailyvalue.go` | 383 | `dailyValues` router procedures |
| `apps/api/internal/repository/dailyvalue.go` | 299 | Prisma queries (inline in router) |
| `apps/api/internal/service/daily_account_value.go` | 44 | `dailyAccountValues` router (inline) |
| `apps/api/internal/handler/daily_account_value.go` | 88 | `dailyAccountValues` router procedures |
| `apps/api/internal/repository/daily_account_value.go` | 149 | Prisma queries (inline in router) |

**Note:** The Go `Recalculate` handler (POST /daily-values/recalculate) is NOT ported in this ticket. It depends on `RecalcService` which orchestrates multi-day/multi-employee recalculation and is out of scope.

---

## 7. Success Criteria

- [ ] `trpc.dailyValues.list({ employeeId, year, month })` returns daily values for the month
- [ ] `trpc.dailyValues.listAll({ status, fromDate, toDate })` returns paginated results with employee summaries
- [ ] `trpc.dailyValues.listAll` applies data scope filtering correctly (department, employee)
- [ ] `trpc.dailyValues.listAll` supports department filter via employee relation
- [ ] `trpc.dailyValues.approve({ id })` sets status to "approved" and sends notification
- [ ] Approve rejects daily values with errors (BAD_REQUEST)
- [ ] Approve rejects already-approved daily values (BAD_REQUEST)
- [ ] `trpc.dailyAccountValues.list({ employeeId, fromDate, toDate })` returns account values with account details
- [ ] Frontend `useDailyValues` hook uses tRPC (backward-compatible DailyValue shape)
- [ ] Frontend `useAllDailyValues` hook uses tRPC
- [ ] Frontend `useApproveDailyValue` hook uses tRPC with cache invalidation
- [ ] Frontend `useTeamDailyValues` hook uses tRPC
- [ ] Admin approvals page works end-to-end (list + approve)
- [ ] Timesheet month/week views display daily values correctly
- [ ] Team overview page displays daily values for team members
- [ ] Frontend builds without errors (`npm run build`)
- [ ] Permission checks: `time_tracking.view_own` allows own monthly values, `time_tracking.view_all` for admin list, `time_tracking.approve` for approval, `accounts.manage` for account values

---

## 8. Risk Assessment

### Low Risk
- **Schema shape differences**: The snake_case to camelCase transform is handled by `transformToLegacyDailyValue`. All existing consumers use the snake_case `DailyValue` interface which is preserved.
- **Approval mutation signature**: Only one consumer (`approvals/page.tsx`) calls `approveDailyValue.mutateAsync`. The change from `{ path: { id } }` to `{ id }` is mechanical.
- **DailyAccountValues simplicity**: The router is a single list query with straightforward filters. No complex business logic.

### Medium Risk
- **Notification user lookup**: The raw SQL query to find user_id from employee_id (`user_tenants JOIN users`) is the same pattern used in `DailyCalcService`. It works but relies on the `user_tenants` join table and `users.employee_id` being populated. If an employee has no linked user, the notification silently skips (best-effort).
- **Data scope merging in listAll**: When both a department filter (`input.departmentId`) and a data scope department filter are applied, the `employee` WHERE clause needs careful merging to avoid overwriting. The implementation uses spread operator to merge both conditions into the same `employee` object.
- **Team daily values parallel queries**: The `useTeamDailyValues` hook fires N parallel `listAll` queries (one per employee). For large teams (50+ employees), this could be a lot of parallel requests. The Go API had the same behavior (parallel `GET /daily-values?employee_id=X` calls). Mitigation: `staleTime` prevents re-fetching, and the requests are lightweight (single employee filter + date range).

### Low Risk (Deferred)
- **Recalculate endpoint**: The Go `POST /daily-values/recalculate` endpoint is not ported. It depends on `RecalcService` (multi-day/multi-employee recalculation). This is intentionally deferred.
- **Get by ID endpoint**: The Go `GET /daily-values/{id}` endpoint is not ported as a separate procedure. It is not used by any frontend consumer. If needed, it can be added later.
