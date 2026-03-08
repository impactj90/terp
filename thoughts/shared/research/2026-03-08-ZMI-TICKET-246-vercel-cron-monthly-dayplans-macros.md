# Research: ZMI-TICKET-246 -- Vercel Cron: calculate_months, generate_day_plans, execute_macros

Date: 2026-03-08

## 1. Go Business Logic Analysis

### 1.1 CalculateMonthsTaskHandler (`scheduler_tasks.go` lines 109-188)

**Interface dependency:**
```go
type monthlyCalcServiceForScheduler interface {
    CalculateMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, year, month int) *MonthlyCalcResult
}

type employeeRepoForScheduler interface {
    List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}
```

**Execute logic (per-tenant):**
1. Parse optional `year` and `month` from params JSON
2. Defaults: `year` = current year, `month` = previous month (Go: `now.AddDate(0, -1, 0)`)
3. Query all active employees for the tenant via `employeeRepo.List(ctx, EmployeeFilter{TenantID, IsActive: true})`
4. Extract employee IDs
5. Call `monthlyCalcService.CalculateMonthBatch(ctx, employeeIDs, year, month)`
6. Return JSON result: `{ year, month, processed_months, skipped_months, failed_months }`

**Catalog entry (`scheduler_catalog.go` lines 31-51):**
- Task type: `calculate_months`
- Description: "Recalculates monthly aggregations for a specific year/month. Default: previous month."
- Parameters: `year` (integer, optional), `month` (integer 1-12, optional)

### 1.2 GenerateDayPlansTaskHandler (`scheduler_tasks.go` lines 293-355)

**Interface dependency:**
```go
type generateDayPlansServiceForScheduler interface {
    GenerateFromTariff(ctx context.Context, input GenerateFromTariffInput) (*GenerateFromTariffResult, error)
}
```

**Execute logic (per-tenant):**
1. Parse optional `days_ahead` from params JSON (default: 14)
2. Compute `from` = today (truncated to midnight), `to` = today + `days_ahead` days
3. Build `GenerateFromTariffInput`:
   - `TenantID` = current tenant
   - `EmployeeIDs` = nil (all employees)
   - `From` / `To` = computed date range
   - `OverwriteTariffSource` = true
4. Call `edpService.GenerateFromTariff(ctx, input)`
5. Return JSON result: `{ days_ahead, from, to, employees_processed, plans_created, employees_skipped }`

**Go input/result types (`employeedayplan.go` lines 381-396):**
```go
type GenerateFromTariffInput struct {
    TenantID              uuid.UUID
    EmployeeIDs           []uuid.UUID // empty = all active employees with tariff
    From                  time.Time
    To                    time.Time
    OverwriteTariffSource bool
}

type GenerateFromTariffResult struct {
    EmployeesProcessed int
    PlansCreated       int
    PlansUpdated       int
    EmployeesSkipped   int
}
```

**Catalog entry (`scheduler_catalog.go` lines 127-141):**
- Task type: `generate_day_plans`
- Description: "Expands tariff week plans into employee day plans for upcoming period."
- Parameters: `days_ahead` (integer, default 14)

### 1.3 ExecuteMacrosTaskHandler (`macro_task.go`, 64 lines)

**Interface dependency:**
```go
type macroServiceForScheduler interface {
    ExecuteDueMacros(ctx context.Context, tenantID uuid.UUID, date time.Time) (int, int, error)
}
```

**Execute logic (per-tenant):**
1. Parse optional `date` from params JSON (YYYY-MM-DD format, default: today)
2. Call `macroService.ExecuteDueMacros(ctx, tenantID, date)`
3. Return JSON result: `{ date, executed, failed }`

### 1.4 MacroService.ExecuteDueMacros (`macro.go` lines 368-433)

Core logic for determining which macros are due on a given date:

1. Compute `weekday` = `date.Weekday()` (0=Sunday..6=Saturday), `dayOfMonth` = `date.Day()`, `lastDayOfMonth` = last day of the month
2. **Weekly macros:** Query `ListActiveByType(ctx, tenantID, "weekly")`. For each macro, iterate assignments. If assignment `isActive` and `executionDay == weekday`, execute the macro.
3. **Monthly macros:** Query `ListActiveByType(ctx, tenantID, "monthly")`. For each macro, iterate assignments. Apply day fallback: if `executionDay > lastDayOfMonth`, use `lastDayOfMonth`. If `effectiveDay == dayOfMonth`, execute the macro.
4. For each execution, create a `MacroExecution` record via `executeMacro()`:
   - Creates execution record with status "running"
   - Calls `executeAction(ctx, macro)` -- dispatches by `actionType` (log_message, recalculate_target_hours, reset_flextime, carry_forward_balance)
   - Updates execution record with result/error and "completed"/"failed" status
5. Return `(executed_count, failed_count, error)`

**`lastDay` helper (`macro.go` line 559):**
```go
func lastDay(year int, month time.Month) int {
    return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}
```

**Catalog entry (`scheduler_catalog.go` lines 113-126):**
- Task type: `execute_macros`
- Description: "Executes all due weekly and monthly macros for the current date. Runs after daily calculation."
- Parameters: `date` (string, YYYY-MM-DD format, default: today)

## 2. Existing Cron Pattern from TICKET-245

### 2.1 Route Handler: `apps/web/src/app/api/cron/calculate-days/route.ts` (309 lines)

**Structure:**
- Exports `runtime = "nodejs"` and `maxDuration = 300` (5-minute Vercel Pro limit)
- Exports `computeDateRange()` as a pure function (for testability)
- Exports `executeCalculateDays()` as standalone async function (core logic, separated from HTTP handler)
- Exports `GET()` as the HTTP handler

**Pattern:**
1. **CRON_SECRET validation:** `request.headers.get("authorization") !== \`Bearer ${process.env.CRON_SECRET}\`` -> 401
2. **Query param parsing:** `url.searchParams.get("date_range")` with validation against allowed set
3. **Core logic** in `executeCalculateDays()`:
   - Load all active tenants: `prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } })`
   - Instantiate services: `new RecalcService(prisma)`, `new CronExecutionLogger(prisma)`
   - **Sequential tenant loop** (to avoid connection pool exhaustion):
     a. `logger.ensureSchedule(tenantId, SCHEDULE_NAME, TASK_TYPE)`
     b. `logger.startExecution(tenantId, scheduleId, "scheduled", TASK_TYPE)`
     c. Service call (e.g., `recalcService.triggerRecalcAll(tenantId, from, to)`)
     d. `logger.completeExecution(...)` with result
     e. Catch errors per-tenant, log and continue
   - Return summary JSON
4. **Error handling:** Per-tenant try/catch with failure logging. If execution logging records exist, attempt to mark them as "failed" in the catch block.

**Constants:**
```typescript
const SCHEDULE_NAME = "calculate_days_cron"
const TASK_TYPE = "calculate_days"
```

**Response format:**
```json
{
  "ok": true,
  "dateRange": "today",
  "from": "2026-03-08",
  "to": "2026-03-08",
  "tenantsProcessed": 3,
  "tenantsFailed": 0,
  "totalProcessedDays": 150,
  "totalFailedDays": 2,
  "results": [{ "tenantId": "...", "processedDays": 50, "failedDays": 1, "durationMs": 1234 }]
}
```

### 2.2 CronExecutionLogger: `apps/web/src/server/services/cron-execution-logger.ts` (158 lines)

Reusable service for logging cron job executions. Already fully implemented and used by TICKET-245.

**Public API:**
- `constructor(prisma: PrismaClient)`
- `ensureSchedule(tenantId, name, taskType): Promise<string>` -- upserts Schedule + ScheduleTask, returns scheduleId
- `startExecution(tenantId, scheduleId, triggerType, taskType): Promise<{ executionId, taskExecutionId }>` -- creates ScheduleExecution + ScheduleTaskExecution with "running" status
- `completeExecution(executionId, taskExecutionId, scheduleId, result): Promise<void>` -- updates ScheduleTaskExecution, ScheduleExecution, and Schedule.lastRunAt in a transaction

**Note:** The `ensureSchedule()` method hardcodes `timingType: "daily"` and `timingConfig: { time: "02:00", source: "vercel_cron" }` in the create clause. For TICKET-246, different timingTypes and configs will be needed (monthly, weekly, minutes). This may need to be parameterized.

### 2.3 Vercel Configuration: `apps/web/vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/calculate-days",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### 2.4 Environment: `apps/web/.env.example`

Already includes `CRON_SECRET=local-cron-secret-for-testing`.

### 2.5 Test Pattern: `apps/web/src/app/api/cron/calculate-days/__tests__/route.test.ts` (541 lines)

Uses Vitest with `vi.mock()` to mock:
- `@/lib/db/prisma` -- mock Prisma client
- `@/server/services/recalc` -- mock RecalcService
- `@/server/services/cron-execution-logger` -- mock CronExecutionLogger

**Test structure:**
- Pure function tests for `computeDateRange()` (imported directly from route)
- Route handler tests using `vi.hoisted()` for mock state + dynamic import of `GET`
- Helper `makeRequest()` to construct Request objects
- Test categories: authorization, date_range validation, tenant iteration, fatal error handling
- CronExecutionLogger unit tests using `vi.importActual()` to test actual class

## 3. Available TypeScript Services and Their APIs

### 3.1 MonthlyCalcService: `apps/web/src/server/services/monthly-calc.ts` (772 lines)

Already fully implemented (TICKET-238). Constructor takes `PrismaClient`.

**Key methods for TICKET-246:**
- `calculateMonthBatch(employeeIds: string[], year: number, month: number): Promise<MonthlyCalcResult>` -- This is the direct equivalent of the Go interface used by the scheduler.
  - Validates not future month
  - For each employee, calls `recalculateMonth(employeeId, year, month)`
  - Skips closed months (counts as `skippedMonths`)
  - Continues on errors, aggregates results
  - Returns: `{ processedMonths, skippedMonths, failedMonths, errors: MonthlyCalcError[] }`

**`MonthlyCalcResult` type (`monthly-calc.types.ts`):**
```typescript
interface MonthlyCalcResult {
  processedMonths: number
  skippedMonths: number // closed months
  failedMonths: number
  errors: MonthlyCalcError[]
}
interface MonthlyCalcError {
  employeeId: string
  year: number
  month: number
  error: string
}
```

### 3.2 Employee Day Plan Generation: `apps/web/src/server/routers/employeeDayPlans.ts` (lines 876-1105)

The `generateFromTariff` logic exists as a **tRPC mutation** inline in the router, NOT as a standalone service class. This is the full port of Go's `EmployeeDayPlanService.GenerateFromTariff`.

**Location:** `employeeDayPlans.generateFromTariff` procedure (lines 889-1104)

**What it does:**
1. Apply date range defaults: `from` = today, `to` = today + 3 months (when not specified)
2. Get employees: specific IDs or all active employees for tenant
3. For each employee:
   - Skip if no tariffId
   - Fetch tariff with weekPlan, tariffWeekPlans, tariffDayPlans
   - Calculate sync window constrained by employee entry/exit dates and tariff validity
   - Build skip map (preserve manual/holiday plans)
   - For each day in window, resolve dayPlanId from tariff rhythm type (weekly, rolling_weekly, x_days)
   - Bulk upsert via `$transaction`
4. Return: `{ employeesProcessed, plansCreated, plansUpdated, employeesSkipped }`

**Important:** This logic is NOT extracted into a standalone service. It is embedded in the tRPC procedure handler using `ctx.prisma`. The cron job cannot call a tRPC procedure directly. The logic will need to be extracted into a standalone function or service that takes a `PrismaClient` and `tenantId` as parameters.

**Helper functions already exist as standalone (exported from router file):**
- `getDayPlanIdForDate(tariff, date)` -- resolves day plan based on rhythm type
- `getTariffSyncWindow(employee, tariff, from, to)` -- computes effective window
- `getWeekdayDayPlanId(weekPlan, weekday)` -- maps weekday to day plan column

### 3.3 Macro Execution: `apps/web/src/server/routers/macros.ts` (928 lines)

The macro execution logic exists as a **tRPC mutation** (`macros.triggerExecution`, lines 761-834) and an inline `executeAction()` helper function (lines 151-200).

**There is no standalone `ExecuteDueMacros` function in TypeScript.** The Go `MacroService.ExecuteDueMacros` logic -- which queries macros by type, checks assignment execution days, and handles monthly day fallback -- has NOT been ported to TypeScript as a service. Only individual macro execution (`triggerExecution`) is available.

**What exists in TypeScript:**
- `executeAction(macro)` -- standalone function that dispatches by actionType (log_message, recalculate_target_hours, reset_flextime, carry_forward_balance). Currently returns placeholder results for all action types except log_message.
- `macros.triggerExecution` tRPC mutation -- creates execution record, calls executeAction, updates execution record. This executes a single macro manually, not by schedule.

**What does NOT exist:**
- `ExecuteDueMacros(tenantId, date)` -- the logic to find all due weekly/monthly macros by checking assignment execution days against the current date/weekday. This will need to be built from scratch, porting the Go logic from `macro.go` lines 368-433.

### 3.4 Service Instantiation Pattern

Services are instantiated inline. No DI container:
```typescript
const recalcService = new RecalcService(prisma)
const logger = new CronExecutionLogger(prisma)
const monthlyCalcService = new MonthlyCalcService(prisma)
```

Import `prisma` from `@/lib/db/prisma`.

## 4. Prisma Schema for Execution Logging

### 4.1 Schedule Models (already exist, TICKET-244)

Located at `apps/web/prisma/schema.prisma` lines 2993-3119:

- **Schedule** (`schedules`): `{ id, tenantId, name, timingType, timingConfig, isEnabled, lastRunAt, nextRunAt }` -- Unique: `(tenantId, name)`
- **ScheduleTask** (`schedule_tasks`): `{ id, scheduleId, taskType, sortOrder, parameters, isEnabled }`
- **ScheduleExecution** (`schedule_executions`): `{ id, tenantId, scheduleId, status, triggerType, triggeredBy, startedAt, completedAt, errorMessage, tasksTotal, tasksSucceeded, tasksFailed }`
- **ScheduleTaskExecution** (`schedule_task_executions`): `{ id, executionId, taskType, sortOrder, status, startedAt, completedAt, errorMessage, result }`

### 4.2 Macro Models (already exist, TICKET-222/077)

Located at `apps/web/prisma/schema.prisma` lines 1995-2093:

- **Macro** (`macros`): `{ id, tenantId, name, macroType, actionType, actionParams, isActive }` -- macroType: "weekly" or "monthly"
- **MacroAssignment** (`macro_assignments`): `{ id, tenantId, macroId, tariffId?, employeeId?, executionDay, isActive }` -- XOR constraint on tariffId/employeeId
- **MacroExecution** (`macro_executions`): `{ id, tenantId, macroId, assignmentId?, status, triggerType, triggeredBy?, startedAt, completedAt, result, errorMessage }`

### 4.3 DB CHECK Constraint on ScheduleTask.taskType

From schema comments: The DB CHECK constraint only allows: `'calculate_days', 'calculate_months', 'backup_database', 'send_notifications', 'export_data', 'alive_check'`. The task types `'execute_macros'` and `'generate_day_plans'` are used by Go code but are NOT in the DB CHECK constraint.

This means `CronExecutionLogger.ensureSchedule()` will fail if it tries to create a ScheduleTask with taskType `'execute_macros'` or `'generate_day_plans'` due to the DB CHECK constraint violation.

**Action needed:** A migration to add `'execute_macros'`, `'generate_day_plans'`, and `'terminal_sync'`, `'terminal_import'` to the `schedule_tasks` CHECK constraint, or the CHECK constraint needs to be dropped/updated.

## 5. Tenant Iteration Pattern

All cron jobs iterate over all active tenants. The pattern from TICKET-245:

```typescript
const tenants = await prisma.tenant.findMany({
  where: { isActive: true },
  select: { id: true },
})

for (const tenant of tenants) {
  try {
    // ... process tenant
  } catch (err) {
    // Log error and continue to next tenant
  }
}
```

**Sequential processing** to avoid connection pool exhaustion. Each tenant gets its own execution logging records.

## 6. Gaps and Missing Dependencies

### 6.1 CronExecutionLogger: Hardcoded timingType

The `ensureSchedule()` method hardcodes `timingType: "daily"` and `timingConfig: { time: "02:00", source: "vercel_cron" }`. For the new cron jobs:
- `calculate_months`: should be `timingType: "monthly"`, `timingConfig: { dayOfMonth: 2, time: "03:00", source: "vercel_cron" }`
- `generate_day_plans`: should be `timingType: "weekly"`, `timingConfig: { dayOfWeek: 0, time: "01:00", source: "vercel_cron" }`
- `execute_macros`: should be `timingType: "minutes"`, `timingConfig: { interval: 15, source: "vercel_cron" }`

**Options:** Either parameterize `ensureSchedule()` to accept timingType/timingConfig, or keep the hardcoded values (since they're only cosmetic metadata -- the actual scheduling is in vercel.json).

### 6.2 No Standalone EmployeeDayPlanService for generateFromTariff

The generation logic (1100+ lines including helpers) is embedded in the tRPC router at `apps/web/src/server/routers/employeeDayPlans.ts`. The cron job needs this as a standalone function. The helper functions (`getDayPlanIdForDate`, `getTariffSyncWindow`, `getWeekdayDayPlanId`) are defined at module scope in the router file and could be imported, but the main orchestration logic is inside the `generateFromTariff` procedure's handler function.

**Action needed:** Extract the generateFromTariff logic into a standalone function (or lightweight service class) that takes `PrismaClient`, `tenantId`, and optional parameters (`employeeIds`, `from`, `to`, `overwriteTariffSource`).

### 6.3 No ExecuteDueMacros Function in TypeScript

The Go `MacroService.ExecuteDueMacros` has NOT been ported. The TypeScript macros router only supports individual manual execution. The scheduling logic (weekly day matching, monthly day matching with fallback, iterating assignments) needs to be implemented from scratch.

**Action needed:** Create a standalone function or service that implements the `ExecuteDueMacros(prisma, tenantId, date)` logic, porting from Go `macro.go` lines 368-433.

### 6.4 DB CHECK Constraint on schedule_tasks.task_type

As noted in section 4.3, the DB CHECK constraint does not include `execute_macros` or `generate_day_plans`. A migration is needed to update the constraint.

### 6.5 Active Employees Query for calculate_months

The Go task handler queries active employees via `employeeRepo.List(ctx, EmployeeFilter{TenantID, IsActive: true})`. In TypeScript, the equivalent is:
```typescript
const employees = await prisma.employee.findMany({
  where: { tenantId, isActive: true, deletedAt: null },
  select: { id: true },
})
```
This pattern already exists in `RecalcService.triggerRecalcAll()` and the `generateFromTariff` procedure.

## 7. Cron Schedules (from Ticket)

| Task | Vercel Cron Schedule | Description |
|------|---------------------|-------------|
| `calculate-months` | `0 3 2 * *` | 2nd of each month at 03:00 UTC |
| `generate-day-plans` | `0 1 * * 0` | Sundays at 01:00 UTC |
| `execute-macros` | `*/15 * * * *` | Every 15 minutes |

## 8. Files Referenced

### Go (source of business logic)
- `apps/api/internal/service/scheduler_tasks.go` -- CalculateMonthsTaskHandler (lines 109-188), GenerateDayPlansTaskHandler (lines 293-355)
- `apps/api/internal/service/macro_task.go` -- ExecuteMacrosTaskHandler (64 lines)
- `apps/api/internal/service/macro.go` -- MacroService.ExecuteDueMacros (lines 368-433), executeMacro (lines 435-476), executeAction (lines 479+), lastDay helper (line 559)
- `apps/api/internal/service/scheduler_catalog.go` -- Task catalog definitions (143 lines)
- `apps/api/internal/service/employeedayplan.go` -- GenerateFromTariffInput/Result types (lines 381-396), GenerateFromTariff method (lines 402+)

### TypeScript (existing, to be called/extended)
- `apps/web/src/server/services/monthly-calc.ts` -- MonthlyCalcService with `calculateMonthBatch()`
- `apps/web/src/server/services/monthly-calc.types.ts` -- MonthlyCalcResult, MonthlyCalcError
- `apps/web/src/server/services/recalc.ts` -- RecalcService (reference for service pattern)
- `apps/web/src/server/services/cron-execution-logger.ts` -- CronExecutionLogger (reusable)
- `apps/web/src/server/routers/employeeDayPlans.ts` -- generateFromTariff logic (lines 889-1104), helper functions
- `apps/web/src/server/routers/macros.ts` -- executeAction helper (lines 151-200), manual triggerExecution
- `apps/web/src/lib/db/prisma.ts` -- Prisma singleton
- `apps/web/src/app/api/cron/calculate-days/route.ts` -- Existing cron route pattern (309 lines)
- `apps/web/src/app/api/cron/calculate-days/__tests__/route.test.ts` -- Test pattern (541 lines)

### Infrastructure (existing)
- `apps/web/vercel.json` -- Vercel cron configuration (to be extended)
- `apps/web/.env.example` -- Already has CRON_SECRET

### Prisma Schema
- `apps/web/prisma/schema.prisma` lines 2993-3119 -- Schedule, ScheduleTask, ScheduleExecution, ScheduleTaskExecution
- `apps/web/prisma/schema.prisma` lines 1995-2093 -- Macro, MacroAssignment, MacroExecution
