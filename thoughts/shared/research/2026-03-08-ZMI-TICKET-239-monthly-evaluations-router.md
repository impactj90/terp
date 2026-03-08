# Research: ZMI-TICKET-239 -- Monthly Evaluations Router

**Date**: 2026-03-08
**Branch**: staging
**Repository**: terp

## Research Question

Document the Go source code, existing TypeScript patterns, Prisma schema, frontend hooks, authorization middleware, and MonthlyCalcService needed to build the `monthlyValues` tRPC router with 8 procedures and frontend hook migration.

## Summary

The Monthly Evaluations Router merges two sets of Go endpoints into one tRPC router: the nested `/employees/{id}/months/...` routes (monthlyeval handler, 461 lines) and the flat `/monthly-values/...` routes (monthly_value handler, 405 lines). The Go service layer has already been ported to TypeScript as `MonthlyCalcService` (ZMI-TICKET-238). The Prisma `MonthlyValue` model exists. Two frontend hook files need migration: `use-monthly-values.ts` (legacy REST, 236 lines) and `use-admin-monthly-values.ts` (legacy REST, 106 lines). The `dailyValues` router (468 lines) is the closest analog for tRPC router structure, permission middleware, and data scope patterns.

---

## 1. Go Source Files to Replace

### 1.1 handler/monthly_value.go (405 lines)

**File**: `apps/api/internal/handler/monthly_value.go`

**Purpose**: Flat monthly value routes -- admin-facing list, get by ID, close, reopen, batch close, recalculate.

**Handler struct**: `MonthlyValueHandler` with three dependencies:
- `monthlyValueService *service.MonthlyValueService`
- `monthlyCalcService *service.MonthlyCalcService`
- `employeeService *service.EmployeeService`

**Endpoints (6 total)**:

1. **`List`** -- `GET /monthly-values`
   - Extracts tenant from context
   - Builds `MonthlyValueFilter` from query params: `employee_id`, `year`, `month`, `status` (closed/open/calculated), `department_id`
   - Status mapping: "closed" -> `IsClosed=true`; "open"/"calculated" -> `IsClosed=false`
   - Returns `MonthlyValueList` with `Data: []*models.MonthlyValue`
   - Permission: `reports.view`

2. **`Get`** -- `GET /monthly-values/{id}`
   - Parses UUID from URL path
   - Returns single `MonthlyValue`
   - Permission: `reports.view`

3. **`Close`** -- `POST /monthly-values/{id}/close`
   - Gets user from context for `closedBy`
   - Calls `monthlyValueService.Close(ctx, id, user.ID)`
   - Error mapping: ErrMonthlyValueNotFound -> 404, ErrMonthlyValueAlreadyClosed -> 400
   - Returns updated `MonthlyValue`
   - Permission: `reports.view`

4. **`Reopen`** -- `POST /monthly-values/{id}/reopen`
   - Gets user from context for `reopenedBy`
   - Calls `monthlyValueService.Reopen(ctx, id, user.ID)`
   - Error mapping: ErrMonthlyValueNotFound -> 404, ErrMonthlyValueNotClosed -> 400
   - Returns updated `MonthlyValue`
   - Permission: `reports.view`

5. **`CloseBatch`** -- `POST /monthly-values/close-batch`
   - Request body: `{ year, month, employee_ids, department_id, recalculate }`
   - If no employee_ids: fetches all active employees (optionally filtered by department)
   - Optionally recalculates before closing (recalculate defaults to true)
   - Iterates employees: finds monthly value by filter -> skips if closed/missing -> closes
   - Response: `{ closed_count, skipped_count, error_count, errors: [{employee_id, reason}] }`
   - Permission: `reports.view`

6. **`Recalculate`** -- `POST /monthly-values/recalculate`
   - Request body: `{ year, month, employee_id (optional) }`
   - If no employee_id: fetches all active employees in tenant
   - Calls `monthlyCalcService.CalculateMonthBatch(ctx, employeeIDs, year, month)`
   - Returns HTTP 202: `{ message, affected_employees }`
   - Permission: `booking_overview.calculate_month`

**Response mapping** (`monthlyValueToResponse`):
- Maps internal `model.MonthlyValue` to generated `models.MonthlyValue`
- Computes `status`: "closed" if IsClosed, else "calculated"
- Computes `balanceMinutes` via `mv.Balance()` (overtime - undertime)
- Computes `absenceDays` as sum of SickDays + OtherAbsenceDays
- All time values in minutes (int64)

### 1.2 handler/monthlyeval.go (461 lines)

**File**: `apps/api/internal/handler/monthlyeval.go`

**Purpose**: Employee-scoped monthly evaluation routes -- per-employee month summary, year overview, close/reopen, daily breakdown, recalculate.

**Handler struct**: `MonthlyEvalHandler` with two dependencies:
- `monthlyEvalService *service.MonthlyEvalService`
- `employeeService *service.EmployeeService`

**Endpoints (6 total)**:

1. **`GetMonthSummary`** -- `GET /employees/{id}/months/{year}/{month}`
   - Parses employee ID, year, month from URL
   - Calls `ensureEmployeeScope()` for access control
   - Returns `MonthSummaryResponse`
   - Permission: `reports.view`

2. **`GetYearOverview`** -- `GET /employees/{id}/months/{year}`
   - Parses employee ID, year from URL
   - Returns `YearOverviewResponse` with `Year` and `Data: []*MonthSummaryResponse`
   - Permission: `reports.view`

3. **`CloseMonth`** -- `POST /employees/{id}/months/{year}/{month}/close`
   - Gets user from context for closedBy
   - Calls `monthlyEvalService.CloseMonth()`, then returns updated summary
   - Permission: `reports.view`

4. **`ReopenMonth`** -- `POST /employees/{id}/months/{year}/{month}/reopen`
   - Gets user from context for reopenedBy
   - Calls `monthlyEvalService.ReopenMonth()`, then returns updated summary
   - Permission: `reports.view`

5. **`GetDailyBreakdown`** -- `GET /employees/{id}/months/{year}/{month}/days`
   - Returns `DailyBreakdownResponse` with `Data: []*DailyBreakdownItem`
   - Permission: `reports.view`

6. **`Recalculate`** -- `POST /employees/{id}/months/{year}/{month}/recalculate`
   - Calls `monthlyEvalService.RecalculateMonth()`
   - Returns updated month summary
   - Permission: `reports.view` + `booking_overview.calculate_month`

**Access control**:
- `ensureEmployeeScope()` -- verifies employee exists, checks data scope via `scopeFromContext()`

**Error mapping** (`handleServiceError`):
- `ErrMonthClosed` -> 403 "Month is closed"
- `ErrMonthNotClosed` -> 400 "Month is not closed"
- `ErrInvalidMonth` -> 400 "Invalid month"
- `ErrInvalidYearMonth` -> 400 "Invalid year or month"
- `ErrMonthlyValueNotFound` -> 404 "Monthly value not found"
- `ErrEmployeeNotFoundForEval` -> 404 "Employee not found"

### 1.3 service/monthlyvalue.go (94 lines)

**File**: `apps/api/internal/service/monthlyvalue.go`

**Purpose**: Thin service layer for flat monthly value operations.

**Service struct**: `MonthlyValueService` with one dependency:
- `repo monthlyValueRepoForService`

**Methods (3)**:
1. `List(ctx, filter)` -- delegates to repo.ListAll
2. `GetByID(ctx, id)` -- delegates to repo.GetByID, maps ErrMonthlyValueNotFound
3. `Close(ctx, id, closedBy)` -- fetches by ID, checks not already closed, calls repo.CloseMonth, re-fetches
4. `Reopen(ctx, id, reopenedBy)` -- fetches by ID, checks is closed, calls repo.ReopenMonth, re-fetches

**Error types**:
- `ErrMonthlyValueAlreadyClosed` = "monthly value is already closed"
- `ErrMonthlyValueNotClosed` = "monthly value is not closed"

### 1.4 repository/monthlyvalue.go (242 lines)

**File**: `apps/api/internal/repository/monthlyvalue.go`

**Purpose**: GORM data access for monthly_values table.

**Methods (13)**: Create, GetByID, Update, Delete, GetByEmployeeMonth, GetPreviousMonth, Upsert, ListAll (with MonthlyValueFilter), ListByEmployee, ListByEmployeeYear, IsMonthClosed, CloseMonth, ReopenMonth.

**Key filter pattern** (`MonthlyValueFilter`):
```go
type MonthlyValueFilter struct {
    TenantID     uuid.UUID
    EmployeeID   *uuid.UUID
    Year         *int
    Month        *int
    IsClosed     *bool
    DepartmentID *uuid.UUID
}
```
- DepartmentID filter joins `employees` table and includes `team_members` -> `teams` for department association
- Orders by `year DESC, month DESC`

### 1.5 Go Route Registration

**Monthly eval routes** (`routes.go:571-599`):
```
/employees/{id}/months/{year}                       GET  -> GetYearOverview     [reports.view]
/employees/{id}/months/{year}/{month}               GET  -> GetMonthSummary     [reports.view]
/employees/{id}/months/{year}/{month}/days           GET  -> GetDailyBreakdown   [reports.view]
/employees/{id}/months/{year}/{month}/close          POST -> CloseMonth          [reports.view]
/employees/{id}/months/{year}/{month}/reopen         POST -> ReopenMonth         [reports.view]
/employees/{id}/months/{year}/{month}/recalculate    POST -> Recalculate         [reports.view + booking_overview.calculate_month]
```

**Monthly value flat routes** (`routes.go:1641-1661`):
```
/monthly-values                   GET  -> List          [reports.view]
/monthly-values/close-batch       POST -> CloseBatch    [reports.view]
/monthly-values/recalculate       POST -> Recalculate   [booking_overview.calculate_month]
/monthly-values/{id}              GET  -> Get           [reports.view]
/monthly-values/{id}/close        POST -> Close         [reports.view]
/monthly-values/{id}/reopen       POST -> Reopen        [reports.view]
```

---

## 2. Existing TypeScript MonthlyCalcService (ZMI-TICKET-238)

### 2.1 Service File

**File**: `apps/web/src/server/services/monthly-calc.ts` (772 lines)

Already ported from Go. Contains `MonthlyCalcService` class with all necessary public methods:

**Orchestration methods** (from `monthlycalc.go`):
- `calculateMonth(employeeId, year, month): Promise<MonthlyValue>`
- `calculateMonthBatch(employeeIds, year, month): Promise<MonthlyCalcResult>`
- `recalculateFromMonth(employeeId, startYear, startMonth): Promise<MonthlyCalcResult>`
- `recalculateFromMonthBatch(employeeIds, startYear, startMonth): Promise<MonthlyCalcResult>`

**Evaluation methods** (from `monthlyeval.go`):
- `getMonthSummary(employeeId, year, month): Promise<MonthSummary>`
- `recalculateMonth(employeeId, year, month): Promise<void>`
- `closeMonth(employeeId, year, month, closedBy): Promise<void>`
- `reopenMonth(employeeId, year, month, reopenedBy): Promise<void>`
- `getYearOverview(employeeId, year): Promise<MonthSummary[]>`
- `getDailyBreakdown(employeeId, year, month): Promise<DailyValue[]>`

Constructor: `new MonthlyCalcService(prisma: PrismaClient)`

### 2.2 Types File

**File**: `apps/web/src/server/services/monthly-calc.types.ts` (94 lines)

Defines:
- `MonthSummary` interface (all fields matching Go)
- `MonthlyCalcResult`, `MonthlyCalcError` interfaces
- `AbsenceDayWithType` Prisma payload type
- Error constants: `ERR_FUTURE_MONTH`, `ERR_MONTH_CLOSED`, `ERR_MONTH_NOT_CLOSED`, `ERR_INVALID_MONTH`, `ERR_INVALID_YEAR_MONTH`, `ERR_MONTHLY_VALUE_NOT_FOUND`, `ERR_EMPLOYEE_NOT_FOUND`
- Absence category constants: `ABSENCE_CATEGORY_VACATION`, `ABSENCE_CATEGORY_ILLNESS`, `ABSENCE_CATEGORY_SPECIAL`

### 2.3 Test File

**File**: `apps/web/src/server/services/__tests__/monthly-calc.test.ts`

Exists with comprehensive tests using vitest + mock PrismaClient pattern.

---

## 3. Prisma Schema

### 3.1 MonthlyValue Model

**Location**: `apps/web/prisma/schema.prisma`, lines 2377-2415

```prisma
model MonthlyValue {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String    @map("tenant_id") @db.Uuid
  employeeId       String    @map("employee_id") @db.Uuid
  year             Int
  month            Int
  totalGrossTime   Int       @default(0) @map("total_gross_time")
  totalNetTime     Int       @default(0) @map("total_net_time")
  totalTargetTime  Int       @default(0) @map("total_target_time")
  totalOvertime    Int       @default(0) @map("total_overtime")
  totalUndertime   Int       @default(0) @map("total_undertime")
  totalBreakTime   Int       @default(0) @map("total_break_time")
  flextimeStart    Int       @default(0) @map("flextime_start")
  flextimeChange   Int       @default(0) @map("flextime_change")
  flextimeEnd      Int       @default(0) @map("flextime_end")
  flextimeCarryover Int      @default(0) @map("flextime_carryover")
  vacationTaken    Decimal   @default(0) @map("vacation_taken") @db.Decimal(5, 2)
  sickDays         Int       @default(0) @map("sick_days")
  otherAbsenceDays Int       @default(0) @map("other_absence_days")
  workDays         Int       @default(0) @map("work_days")
  daysWithErrors   Int       @default(0) @map("days_with_errors")
  isClosed         Boolean   @default(false) @map("is_closed")
  closedAt         DateTime? @map("closed_at") @db.Timestamptz(6)
  closedBy         String?   @map("closed_by") @db.Uuid
  reopenedAt       DateTime? @map("reopened_at") @db.Timestamptz(6)
  reopenedBy       String?   @map("reopened_by") @db.Uuid
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([employeeId, year, month])
  @@index([tenantId], map: "idx_mv_tenant")
  @@index([employeeId], map: "idx_mv_employee")
  @@map("monthly_values")
}
```

Key points:
- Unique constraint on `[employeeId, year, month]` allows `findUnique` via `employeeId_year_month` compound key
- `vacationTaken` is Decimal(5,2) for half-day precision
- `isClosed` is the close status; `closedAt`/`closedBy` and `reopenedAt`/`reopenedBy` are nullable audit fields
- Relations: Employee (cascade delete), Tenant (cascade delete)

### 3.2 No MonthlyAccountValue Model

There is no `MonthlyAccountValue` model in the Prisma schema. The Go model `MonthlyValue` does not reference account-level breakdowns.

---

## 4. tRPC Router Patterns

### 4.1 Daily Values Router (Closest Analog)

**File**: `apps/web/src/server/routers/dailyValues.ts` (468 lines)

Pattern elements:
1. **Imports**: `z` (zod), `TRPCError`, `createTRPCRouter`, `tenantProcedure`, authorization middleware, `permissionIdByKey`
2. **Permission constants**: Resolved at module level via `permissionIdByKey(key)!`
3. **Output schemas**: Defined as `z.object({...})` with all fields typed
4. **Input schemas**: Defined as `z.object({...})` with validation constraints
5. **Data scope helpers**: Functions `buildDataScopeWhere()` and `checkDataScope()` for filtering
6. **Mapper function**: `mapDailyValueToOutput()` converts Prisma records to output shape
7. **Router**: `createTRPCRouter({...})` with procedures chained as `tenantProcedure.use(...).input(...).output(...).query/mutation(...)`

Procedure chain pattern:
```typescript
procedureName: tenantProcedure
  .use(requirePermission(PERM_ID))        // or requireEmployeePermission(...)
  .use(applyDataScope())                   // for admin views
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ ctx, input }) => { ... })
```

Key differences for monthly values:
- Monthly values use the `MonthlyCalcService` for business logic (not inline Prisma queries for close/reopen/recalculate)
- Monthly values router needs both employee-scoped and admin-scoped procedures
- The batch close and recalculate operations are more complex than daily value approve

### 4.2 Daily Account Values Router

**File**: `apps/web/src/server/routers/dailyAccountValues.ts` (158 lines)

Simpler pattern -- single `list` query procedure. Uses same structure (permission constants, output schemas, Prisma queries inline).

### 4.3 Root Router Registration

**File**: `apps/web/src/server/root.ts` (143 lines)

Pattern: Import router at top, add key-value pair to `createTRPCRouter({...})`. Currently has 60+ routers registered. New `monthlyValues` router should be registered here after creation.

### 4.4 tRPC Context

**File**: `apps/web/src/server/trpc.ts` (224 lines)

Context provides:
- `ctx.prisma` -- PrismaClient
- `ctx.user` -- `ContextUser` (includes `userGroup`, `userTenants`, `employeeId`)
- `ctx.session` -- Supabase session
- `ctx.tenantId` -- string (narrowed to non-null by `tenantProcedure`)

`tenantProcedure` guarantees: `user` non-null, `session` non-null, `tenantId` non-null, user has access to the tenant.

---

## 5. Authorization Middleware

### 5.1 Middleware Functions

**File**: `apps/web/src/server/middleware/authorization.ts` (202 lines)

Four middleware functions:

1. **`requirePermission(...permissionIds)`**
   - Checks if user has ANY of the specified permissions (OR logic)
   - Usage: `.use(requirePermission(PERM_ID))`

2. **`requireSelfOrPermission(userIdGetter, permissionId)`**
   - Allows self-access by user ID, or requires permission
   - Not needed for monthly values (employee-based, not user-based)

3. **`requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)`**
   - Own employee: allows if user has ownPermission OR allPermission
   - Other employee: allows only with allPermission
   - Admin bypass (mirrors Go admin role)
   - Usage: `.use(requireEmployeePermission(input => input.employeeId, OWN_PERM, ALL_PERM))`

4. **`applyDataScope()`**
   - Reads user's data scope configuration, adds `DataScope` to context
   - `DataScope` types: "all", "tenant", "department", "employee"
   - Contains: `tenantIds`, `departmentIds`, `employeeIds` arrays

### 5.2 Data Scope Usage Pattern (from dailyValues router)

For list/admin queries:
```typescript
function buildMonthlyValueDataScopeWhere(dataScope: DataScope): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}
```

For single-item mutations:
```typescript
function checkMonthlyValueDataScope(dataScope: DataScope, item: { employeeId, employee? }): void {
  // Throws TRPCError FORBIDDEN if not in scope
}
```

### 5.3 Permission IDs for Monthly Values

**File**: `apps/web/src/server/lib/permission-catalog.ts`

Relevant permissions from Go route registration:
- `reports.view` -- Used for most monthly value operations (list, get, close, reopen, batch close)
- `booking_overview.calculate_month` -- Used for recalculate operations
- `time_tracking.view_own` -- For own employee data viewing
- `time_tracking.view_all` -- For viewing all employees' data

Permission ID resolution:
```typescript
const REPORTS_VIEW = permissionIdByKey("reports.view")!
const CALCULATE_MONTH = permissionIdByKey("booking_overview.calculate_month")!
const TIME_TRACKING_VIEW_OWN = permissionIdByKey("time_tracking.view_own")!
const TIME_TRACKING_VIEW_ALL = permissionIdByKey("time_tracking.view_all")!
```

---

## 6. Frontend Hooks (To Be Migrated)

### 6.1 use-monthly-values.ts (236 lines)

**File**: `apps/web/src/hooks/api/use-monthly-values.ts`

Current state: **Legacy REST** using `fetch()` and `@tanstack/react-query` directly.

Exports:
- `useMonthlyValues(options)` -- fetches single month via `GET /employees/{id}/months/{year}/{month}`
  - Returns `{ data: MonthSummary[] }` (wrapped in array for backward compat)
  - Has `addLegacyFields()` transform for snake_case compatibility
- `useYearOverview(options)` -- fetches year via `GET /employees/{id}/months/{year}`
- `useCloseMonth()` -- mutation via `POST /employees/{id}/months/{year}/{month}/close`
- `useReopenMonth()` -- mutation via `POST /employees/{id}/months/{year}/{month}/reopen`
- `useRecalculateMonth()` -- mutation via `POST /employees/{id}/months/{year}/{month}/recalculate`

`MonthSummary` interface (snake_case, 73 lines):
- Core fields: `employee_id`, `year`, `month`, time totals, flextime tracking, absence summary, status fields
- Legacy field aliases: `id`, `target_minutes`, `gross_minutes`, `break_minutes`, `net_minutes`, `balance_minutes`, `working_days`, `worked_days`, `absence_days`, `holiday_days`, `status`, `account_balances`

**Consumers** (5 files):
- `apps/web/src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx` -- uses `useMonthlyValues`
- `apps/web/src/app/[locale]/(dashboard)/year-overview/page.tsx` -- uses `useYearOverview`
- `apps/web/src/components/monthly-evaluation/close-month-sheet.tsx` -- uses `useCloseMonth`
- `apps/web/src/components/monthly-evaluation/reopen-month-sheet.tsx` -- uses `useReopenMonth`
- `apps/web/src/components/timesheet/month-view.tsx` -- uses `useMonthlyValues`
- `apps/web/src/components/dashboard/flextime-balance-card.tsx` -- uses `useMonthlyValues`

### 6.2 use-admin-monthly-values.ts (106 lines)

**File**: `apps/web/src/hooks/api/use-admin-monthly-values.ts`

Current state: **Legacy REST** using `useApiQuery`, `useApiMutation`, and `api` from openapi-fetch.

Exports:
- `useAdminMonthlyValues(options)` -- `GET /monthly-values` with query params (year, month, status, department_id, employee_id)
- `useMonthlyValueById(id)` -- `GET /monthly-values/{id}`
- `useCloseMonthById()` -- `POST /monthly-values/{id}/close`
- `useReopenMonthById()` -- `POST /monthly-values/{id}/reopen`
- `useCloseMonthBatch()` -- `POST /monthly-values/close-batch`
- `useRecalculateMonthlyValues()` -- `POST /monthly-values/recalculate` (custom hook, handles HTTP 202)

**Consumers** (4 files):
- `apps/web/src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx` -- uses `useAdminMonthlyValues`
- `apps/web/src/components/monthly-values/batch-close-dialog.tsx` -- uses `useCloseMonthBatch`
- `apps/web/src/components/monthly-values/batch-reopen-dialog.tsx` -- uses `useReopenMonthById`
- `apps/web/src/components/monthly-values/recalculate-dialog.tsx` -- uses `useRecalculateMonthlyValues`

### 6.3 Hook index.ts Exports

**File**: `apps/web/src/hooks/api/index.ts`

Currently exports from both hook files:
```typescript
// Monthly Values
export { useMonthlyValues, useYearOverview, useCloseMonth, useReopenMonth, useRecalculateMonth, type MonthSummary } from './use-monthly-values'

// Admin Monthly Values (flat routes)
export { useAdminMonthlyValues, useMonthlyValueById, useCloseMonthById, useReopenMonthById, useCloseMonthBatch, useRecalculateMonthlyValues } from './use-admin-monthly-values'
```

### 6.4 Frontend Hook Migration Pattern (from daily values)

**File**: `apps/web/src/hooks/api/use-daily-values.ts` (258 lines)

Pattern for tRPC migration:
1. Import `useTRPC` from `@/trpc`
2. Import `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`
3. Define legacy `DailyValue` interface (snake_case) for backward compatibility
4. Create `transformToLegacyFormat()` function for camelCase -> snake_case mapping
5. Hook: `useQuery({ ...trpc.routerName.procedure.queryOptions(input, opts), select: transformFn })`
6. Mutation hook: `useMutation({ ...trpc.routerName.procedure.mutationOptions(), onSuccess: invalidateQueries })`

Key pattern: hooks wrap tRPC calls and add a `select` transform to convert camelCase tRPC output to snake_case legacy format, maintaining backward compatibility with existing components.

---

## 7. Go Model Details

### 7.1 MonthlyValue Model

**File**: `apps/api/internal/model/monthlyvalue.go` (75 lines)

All fields documented in section 3.1 (Prisma schema). Key details:
- `Balance()` method: returns `TotalOvertime - TotalUndertime`
- `FormatFlextimeEnd()` method: formats flextime end as HH:MM with sign
- Table name: `monthly_values`
- Relations: `Employee *Employee` (foreign key: EmployeeID)

### 7.2 Go MonthlyValue Response Model

**File**: Generated at `apps/api/gen/models/monthly_value.go`

Response fields (from handler mapping):
- `ID`, `TenantID`, `EmployeeID`, `Year`, `Month` (all required)
- `Status` (string: "calculated" or "closed")
- `GrossMinutes`, `NetMinutes`, `TargetMinutes`, `OvertimeMinutes`, `UndertimeMinutes`, `BreakMinutes`, `BalanceMinutes` (all int64)
- `WorkedDays`, `AbsenceDays` (int64/float64)
- `ClosedAt`, `ClosedBy` (optional)
- `CreatedAt`, `UpdatedAt` (timestamps)

---

## 8. Ticket-Specified Procedure Mapping

### 8.1 tRPC Procedures (from ticket)

| Procedure | Go Source | Service Method | Middleware |
|---|---|---|---|
| `monthlyValues.forEmployee` | `monthlyeval.GetMonthSummary` | `MonthlyCalcService.getMonthSummary()` | `requireEmployeePermission(own, all)` |
| `monthlyValues.yearOverview` | `monthlyeval.GetYearOverview` | `MonthlyCalcService.getYearOverview()` | `requireEmployeePermission(own, all)` |
| `monthlyValues.list` | `monthly_value.List` | `prisma.monthlyValue.findMany()` (inline) | `requirePermission(reports.view)` + `applyDataScope()` |
| `monthlyValues.getById` | `monthly_value.Get` | `prisma.monthlyValue.findFirst()` (inline) | `requirePermission(reports.view)` |
| `monthlyValues.close` | `monthly_value.Close` | `MonthlyCalcService.closeMonth()` | `requirePermission(reports.view)` |
| `monthlyValues.reopen` | `monthly_value.Reopen` | `MonthlyCalcService.reopenMonth()` | `requirePermission(reports.view)` |
| `monthlyValues.closeBatch` | `monthly_value.CloseBatch` | Loop: find + `closeMonth()` | `requirePermission(reports.view)` |
| `monthlyValues.recalculate` | `monthly_value.Recalculate` | `MonthlyCalcService.calculateMonthBatch()` | `requirePermission(calculate_month)` |

### 8.2 Important Business Logic Notes

**forEmployee (getMonthSummary)**:
- If no persisted MonthlyValue exists, calculates on-the-fly (does NOT persist)
- Returns `MonthSummary` object (not the raw Prisma `MonthlyValue`)

**close**:
- The ticket specifies input `{ id }` but the `MonthlyCalcService.closeMonth()` expects `(employeeId, year, month, closedBy)`
- Must look up the MonthlyValue by ID first to get employeeId, year, month
- Then call service.closeMonth()

**reopen**:
- Same pattern as close -- look up by ID, call service.reopenMonth()

**closeBatch**:
- The ticket specifies input `{ ids: string[] }` (simpler than Go which supports year/month/department)
- But the Go handler is more complex: accepts `{ year, month, employee_ids, department_id, recalculate }`
- Decision needed: follow ticket spec (simple IDs) or match Go behavior (richer input)
- The Go batch close also optionally recalculates before closing

**recalculate**:
- Returns `{ status: "accepted" }` (HTTP 202 pattern from ticket)
- Go handler returns `{ message, affected_employees }`
- Uses `MonthlyCalcService.calculateMonthBatch()` which returns `MonthlyCalcResult`

---

## 9. Dependencies Status

### 9.1 ZMI-TICKET-238 (MonthlyCalcService) -- IN PROGRESS

All three files exist on the staging branch (untracked):
- `apps/web/src/server/services/monthly-calc.ts` (772 lines)
- `apps/web/src/server/services/monthly-calc.types.ts` (94 lines)
- `apps/web/src/server/services/__tests__/monthly-calc.test.ts`

Also exist:
- `apps/web/src/lib/calculation/monthly.ts` (325 lines) -- pure calculation engine
- `apps/web/src/lib/calculation/__tests__/monthly.test.ts`
- `apps/web/src/lib/calculation/errors.ts` -- monthly warning codes already added

### 9.2 ZMI-TICKET-236 (Daily Values Router) -- COMPLETED

- `apps/web/src/server/routers/dailyValues.ts` (468 lines)
- `apps/web/src/server/routers/dailyAccountValues.ts` (158 lines)
- Both registered in `root.ts`

### 9.3 ZMI-TICKET-203 (Authorization Middleware) -- COMPLETED

- `apps/web/src/server/middleware/authorization.ts` (202 lines)
- All four middleware functions available: `requirePermission`, `requireSelfOrPermission`, `requireEmployeePermission`, `applyDataScope`

### 9.4 ZMI-TICKET-237 (Prisma Schema) -- COMPLETED

- `MonthlyValue` model exists in Prisma schema
- `AbsenceDay` model exists in Prisma schema
- Generated client available

---

## 10. Instantiation Pattern

### 10.1 MonthlyCalcService Instantiation

The `MonthlyCalcService` takes `PrismaClient` in its constructor. For the tRPC router, it should be instantiated with `ctx.prisma`:

```typescript
const monthlyCalcService = new MonthlyCalcService(ctx.prisma)
```

This matches how the `DailyCalcService` is used in the employees router:

**File**: `apps/web/src/server/routers/employees.ts` (line ~1545)
```typescript
const dailyCalcService = new DailyCalcService(ctx.prisma)
```

The service is created per-request within the procedure handler, not at module level. This ensures each request uses the correct PrismaClient instance.

---

## 11. Frontend Component Consumers

### 11.1 Components Using Monthly Value Hooks

| Component | Hook Used | Notes |
|---|---|---|
| `monthly-evaluation/page.tsx` | `useMonthlyValues` | Per-employee month view |
| `year-overview/page.tsx` | `useYearOverview` | Year overview grid |
| `admin/monthly-values/page.tsx` | `useAdminMonthlyValues` | Admin list with filters |
| `close-month-sheet.tsx` | `useCloseMonth` | Employee close action |
| `reopen-month-sheet.tsx` | `useReopenMonth` | Employee reopen action |
| `batch-close-dialog.tsx` | `useCloseMonthBatch` | Admin batch close |
| `batch-reopen-dialog.tsx` | `useReopenMonthById` | Admin batch reopen |
| `recalculate-dialog.tsx` | `useRecalculateMonthlyValues` | Admin recalculate |
| `month-view.tsx` | `useMonthlyValues` | Timesheet month view |
| `flextime-balance-card.tsx` | `useMonthlyValues` | Dashboard widget |

### 11.2 Legacy Field Dependencies

The `MonthSummary` interface in `use-monthly-values.ts` includes snake_case legacy aliases used by components:
- `status` (computed: "closed" or "open")
- `balance_minutes` (computed: overtime - undertime)
- `absence_days` (computed: vacation + sick + other)
- `working_days`, `worked_days` (aliases for work_days)
- `account_balances.flextime` (alias for flextime_end)
- `id` (synthetic: `${employee_id}-${year}-${month}`)

The tRPC migration should preserve these legacy transforms (matching the `useDailyValues` pattern with a `transformToLegacy` function).

---

## 12. Existing Research and Plans

### 12.1 ZMI-TICKET-238 Research

**File**: `thoughts/shared/research/2026-03-08-ZMI-TICKET-238-monthly-calc-service-port.md` (624 lines)

Comprehensive research covering:
- All Go source code analysis (monthlycalc.go, monthlyeval.go, monthlyvalue.go, monthly.go)
- Go test coverage (2,813 lines total)
- Prisma schema state
- Existing TypeScript patterns
- Data flow diagrams
- Mapping tables

### 12.2 ZMI-TICKET-238 Plan

**File**: `thoughts/shared/plans/2026-03-08-ZMI-TICKET-238-monthly-calc-service-port.md` (1,060 lines)

7-phase plan covering:
- Phase 1: Monthly warning codes
- Phase 2: Pure monthly calculation engine
- Phase 3: Calculation engine tests
- Phase 4: MonthlyCalcService types
- Phase 5: MonthlyCalcService implementation
- Phase 6: MonthlyCalcService tests
- Phase 7: Final verification

This plan explicitly notes "NOT creating the monthlyValues tRPC router (that is ZMI-TICKET-239)".

---

## 13. Key Implementation Considerations

### 13.1 Router Uses Service + Inline Prisma

Some procedures use `MonthlyCalcService` (close, reopen, recalculate, forEmployee, yearOverview) while others use inline Prisma queries (list, getById). The list procedure needs direct Prisma queries for data scope filtering and pagination, since the service doesn't have a list method with those capabilities.

### 13.2 Close/Reopen by ID vs by Employee+Year+Month

The ticket specifies `close` and `reopen` with input `{ id }`. The `MonthlyCalcService.closeMonth()` accepts `(employeeId, year, month, closedBy)`. The router must:
1. Fetch MonthlyValue by ID (Prisma findFirst with tenantId check)
2. Extract employeeId, year, month
3. Call service method

### 13.3 CloseBatch Simplification

The ticket specifies `{ ids: string[] }` for closeBatch. The Go handler is richer with `{ year, month, employee_ids, department_id, recalculate }`. The Go handler's complexity includes:
- Looking up employees by department
- Optional recalculation before closing
- Tracking closed/skipped/error counts

The frontend `BatchCloseDialog` sends: `{ year, month, employee_ids, department_id, recalculate }`. The tRPC input should match the Go behavior to avoid breaking the existing frontend component.

### 13.4 Department Filter with Team Join

The Go `ListAll` method joins the employees table for department filtering and includes team membership:
```sql
employees.department_id = ? OR employees.id IN (
  SELECT tm.employee_id FROM team_members tm
  JOIN teams t ON t.id = tm.team_id
  WHERE t.department_id = ?
)
```

The Prisma equivalent for this needs a raw query or a relation-based approach.

### 13.5 User ID for Close/Reopen Audit Trail

The close/reopen procedures need the current user's ID for the `closedBy`/`reopenedBy` audit fields. This comes from `ctx.user.id` (guaranteed non-null by `tenantProcedure`).

### 13.6 Pagination for Admin List

The ticket specifies `list` with `{ page?, pageSize? }`. The Go handler does NOT paginate (returns all matching records). The ticket adds pagination with `{ items, total }` response shape. This matches the `dailyValues.listAll` pattern which uses `skip`/`take` with `count`.
