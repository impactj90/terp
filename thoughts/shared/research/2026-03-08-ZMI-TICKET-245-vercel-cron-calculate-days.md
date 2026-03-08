# Research: ZMI-TICKET-245 -- Vercel Cron: calculate_days Task

Date: 2026-03-08

## 1. Go Scheduler Architecture (Being Replaced)

### 1.1 Scheduler Engine (`apps/api/internal/service/scheduler_engine.go`, 100 lines)

A background goroutine that ticks every 30 seconds (`NewSchedulerEngine(executor, 30*time.Second)`). On each tick it calls `executor.RunDueSchedules(ctx)`. Recovers from panics. Started/stopped in `main.go` lines 431-433.

### 1.2 Scheduler Executor (`apps/api/internal/service/scheduler_executor.go`, 209 lines)

Orchestrates schedule execution:

1. **`RunDueSchedules(ctx)`** -- Called by the engine each tick:
   - Calls `repo.ListDueSchedules(ctx, time.Now())` to get all enabled schedules where `next_run_at <= now`
   - Skips schedules with `TimingTypeManual`
   - Calls `executeSchedule()` for each due schedule

2. **`executeSchedule(ctx, schedule, triggerType, triggeredBy)`** -- Runs a single schedule:
   - Creates a `ScheduleExecution` record with status "running"
   - Iterates over `schedule.Tasks` in order (skips disabled tasks)
   - Calls `executeTask()` for each enabled task
   - Tallies succeeded/failed counts
   - Sets final status: "completed" (all pass), "failed" (all fail), "partial" (mixed)
   - Updates `ScheduleExecution` with final status and timestamps
   - Calls `computeNextRun()` and updates schedule's `last_run_at` and `next_run_at`

3. **`executeTask(ctx, executionID, tenantID, task)`** -- Runs a single task:
   - Creates a `ScheduleTaskExecution` record with status "running"
   - Looks up the handler from `handlers` map by `task.TaskType`
   - Calls `handler.Execute(ctx, tenantID, task.Parameters)`
   - Updates `ScheduleTaskExecution` with result, status, timestamps

4. **`TriggerExecution(ctx, tenantID, scheduleID, triggeredBy)`** -- Manual trigger:
   - Fetches schedule by tenant + ID
   - Calls `executeSchedule()` with `TriggerTypeManual`

5. **`RegisterHandler(taskType, handler)`** -- Registers a `TaskExecutor` for a task type

**`TaskExecutor` interface:**
```go
type TaskExecutor interface {
    Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error)
}
```

### 1.3 Calculate Days Task Handler (`apps/api/internal/service/scheduler_tasks.go`, lines 37-107)

**`CalculateDaysTaskHandler`** -- depends on `recalcServiceForScheduler` interface:
```go
type recalcServiceForScheduler interface {
    TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error)
}
```

**Execute logic:**
1. Parse `params` JSON for optional `date_range` field (default: `"yesterday"`)
2. Compute `from`/`to` dates based on `date_range`:
   - `"yesterday"` -- yesterday 00:00 to yesterday 00:00 (single day)
   - `"today"` -- today 00:00 to today 00:00
   - `"last_7_days"` -- 6 days ago to today
   - `"current_month"` -- 1st of month to today
3. Call `recalcService.TriggerRecalcAll(ctx, tenantID, from, to)`
4. Return JSON result with `date_range`, `from`, `to`, `processed_days`, `failed_days`

**Key observation:** The Go calculate_days task operates per-tenant (the tenantID is passed in from the schedule). The cron engine iterates schedules which already belong to specific tenants. The Vercel cron job needs to iterate ALL tenants itself.

### 1.4 Handler Registration in main.go (line 418)

```go
schedulerExecutor.RegisterHandler(model.TaskTypeCalculateDays,
    service.NewCalculateDaysTaskHandler(recalcService))
```

The `recalcService` is a Go `RecalcService` that wraps `DailyCalcService` and `EmployeeRepository`.

## 2. Go RecalcService (`apps/api/internal/service/recalc.go`, 147 lines)

Orchestrates daily + monthly recalculation:

- **`TriggerRecalcAll(ctx, tenantID, from, to)`**:
  1. Queries all active employees for the tenant via `employeeRepo.List(ctx, EmployeeFilter{TenantID, IsActive: true})`
  2. Extracts employee IDs
  3. Calls `TriggerRecalcBatch(ctx, tenantID, employeeIDs, from, to)`

- **`TriggerRecalcBatch(ctx, tenantID, employeeIDs, from, to)`**:
  - For each employee ID, calls `TriggerRecalcRange()`
  - Aggregates results (processedDays, failedDays, errors)
  - Continues on individual errors

- **`TriggerRecalcRange(ctx, tenantID, employeeID, from, to)`**:
  - Calls `dailyCalc.RecalculateRange(ctx, tenantID, employeeID, from, to)`
  - Returns count of processed/failed days

- **`TriggerRecalc(ctx, tenantID, employeeID, date)`**:
  - Calls `dailyCalc.CalculateDay(ctx, tenantID, employeeID, date)`
  - If `monthlyCalc` is set, also recalculates the affected month (best-effort)

## 3. TypeScript Services (Already Ported)

### 3.1 DailyCalcService (`apps/web/src/server/services/daily-calc.ts`, ~1000+ lines)

Ported from Go `daily_calc.go`. Constructor takes `PrismaClient`.

**Key public methods:**
- `calculateDay(tenantId: string, employeeId: string, date: Date): Promise<DailyValue | null>`
  - Full daily calculation: loads bookings, day plans, holidays, runs calculation engine, persists DailyValue + DailyAccountValue
- `calculateDateRange(tenantId: string, employeeId: string, fromDate: Date, toDate: Date): Promise<{count: number, values: DailyValue[]}>`
  - Iterates day-by-day calling `calculateDay()`

### 3.2 RecalcService (`apps/web/src/server/services/recalc.ts`, 161 lines)

Ported from Go `recalc.go`. Constructor takes `PrismaClient` (optionally `DailyCalcService` and `MonthlyCalcService`).

**Key public methods:**
- `triggerRecalc(tenantId, employeeId, date)` -- single day for one employee + monthly recalc (best-effort)
- `triggerRecalcRange(tenantId, employeeId, from, to)` -- date range for one employee
- `triggerRecalcBatch(tenantId, employeeIds, from, to)` -- date range for multiple employees
- **`triggerRecalcAll(tenantId, from, to)`** -- date range for ALL active employees in a tenant:
  ```typescript
  const employees = await this.prisma.employee.findMany({
    where: { tenantId, isActive: true, deletedAt: null },
    select: { id: true },
  })
  const employeeIds = employees.map((emp) => emp.id)
  return this.triggerRecalcBatch(tenantId, employeeIds, from, to)
  ```

### 3.3 MonthlyCalcService (`apps/web/src/server/services/monthly-calc.ts`)

Constructor takes `PrismaClient`. Key method: `calculateMonth(employeeId, year, month)`.

### 3.4 Service Instantiation Pattern

Services are instantiated inline within tRPC procedure handlers. No singleton pattern or DI container:

```typescript
// In bookings router:
const service = new RecalcService(prisma)
await service.triggerRecalc(tenantId, employeeId, bookingDate)

// In absences router:
const service = new RecalcService(prisma)
await service.triggerRecalcRange(tenantId, employeeId, fromDate, toDate)

// In employees router:
const service = new DailyCalcService(ctx.prisma)
const result = await service.calculateDay(tenantId, employeeId, date)

// In systemSettings router:
const recalcService = new RecalcService(ctx.prisma)
```

The `prisma` singleton is imported from `@/lib/db`:
```typescript
// apps/web/src/lib/db/prisma.ts
export const prisma = globalForPrisma.prisma ?? createPrismaClient()
```

## 4. Database Schema for Schedule Logging

### 4.1 Schedule (`schedules` table, Prisma model)

```
id           UUID (PK)
tenantId     UUID (FK -> tenants)
name         VARCHAR(255)
description  TEXT?
timingType   VARCHAR(20) -- 'seconds'|'minutes'|'hours'|'daily'|'weekly'|'monthly'|'manual'
timingConfig JSONB (default: {})
isEnabled    BOOLEAN (default: true)
lastRunAt    TIMESTAMPTZ?
nextRunAt    TIMESTAMPTZ?
createdAt    TIMESTAMPTZ
updatedAt    TIMESTAMPTZ
```
Unique constraint: `(tenantId, name)`

### 4.2 ScheduleTask (`schedule_tasks` table)

```
id         UUID (PK)
scheduleId UUID (FK -> schedules, CASCADE)
taskType   VARCHAR(50) -- 'calculate_days'|'calculate_months'|'backup_database'|...
sortOrder  INT (default: 0)
parameters JSONB (default: {})
isEnabled  BOOLEAN (default: true)
createdAt  TIMESTAMPTZ
updatedAt  TIMESTAMPTZ
```

### 4.3 ScheduleExecution (`schedule_executions` table)

```
id             UUID (PK)
tenantId       UUID (FK -> tenants)
scheduleId     UUID (FK -> schedules, CASCADE)
status         VARCHAR(20) -- 'pending'|'running'|'completed'|'failed'|'partial'
triggerType    VARCHAR(20) -- 'scheduled'|'manual'
triggeredBy    UUID? (FK -> users)
startedAt      TIMESTAMPTZ?
completedAt    TIMESTAMPTZ?
errorMessage   TEXT?
tasksTotal     INT (default: 0)
tasksSucceeded INT (default: 0)
tasksFailed    INT (default: 0)
createdAt      TIMESTAMPTZ
```

### 4.4 ScheduleTaskExecution (`schedule_task_executions` table)

```
id           UUID (PK)
executionId  UUID (FK -> schedule_executions, CASCADE)
taskType     VARCHAR(50)
sortOrder    INT (default: 0)
status       VARCHAR(20) -- 'pending'|'running'|'completed'|'failed'|'skipped'
startedAt    TIMESTAMPTZ?
completedAt  TIMESTAMPTZ?
errorMessage TEXT?
result       JSONB (default: {})
createdAt    TIMESTAMPTZ
```

Note: No FK to schedule_tasks -- task_type and sort_order are denormalized.

## 5. Querying Active Tenants and Employees

### 5.1 Active Tenants

The Tenant model has an `isActive` field (`Boolean?`, default `true`). Query for all active tenants:
```typescript
const tenants = await prisma.tenant.findMany({
  where: { isActive: true },
  select: { id: true },
})
```

### 5.2 Active Employees per Tenant

The Employee model has `isActive` (`Boolean`, default `true`) and `deletedAt` (`DateTime?`) for soft delete. The TypeScript RecalcService already queries active employees:
```typescript
const employees = await prisma.employee.findMany({
  where: { tenantId, isActive: true, deletedAt: null },
  select: { id: true },
})
```

## 6. Existing Vercel Cron Patterns

**No existing Vercel cron patterns found in the codebase.**

- No `vercel.json` file exists anywhere in the project
- No `app/api/cron/` directory exists
- No files reference `CRON_SECRET` or Vercel cron configuration
- The `apps/web/src/app/api/` directory contains only `trpc/` and `internal/` subdirectories

### 6.1 Existing Non-tRPC API Route Pattern

There is one existing Next.js API route at `apps/web/src/app/api/internal/notifications/publish/route.ts` that shows the pattern:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Validate internal API key
  const apiKey = req.headers.get('x-internal-api-key')
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... business logic ...
  return NextResponse.json({ ok: true })
}
```

This demonstrates the pattern for non-tRPC API routes: direct use of `NextRequest`/`NextResponse`, header-based auth validation, and `process.env` for secrets.

## 7. Next.js App Structure

- Framework: Next.js with App Router
- App directory: `apps/web/src/app/`
- API routes: `apps/web/src/app/api/`
- Config: `apps/web/next.config.ts` with `output: "standalone"` and `next-intl` plugin
- tRPC handler: `apps/web/src/app/api/trpc/[trpc]/route.ts`
- Prisma singleton: `apps/web/src/lib/db/prisma.ts` (uses `PrismaPg` adapter with `DATABASE_URL`)

## 8. Go Schedule Model Constants

From `apps/api/internal/model/schedule.go`:

**Task types:** `calculate_days`, `calculate_months`, `backup_database`, `send_notifications`, `export_data`, `alive_check`, `terminal_sync`, `terminal_import`, `execute_macros`, `generate_day_plans`

**Timing types:** `seconds`, `minutes`, `hours`, `daily`, `weekly`, `monthly`, `manual`

**Execution statuses:** `pending`, `running`, `completed`, `failed`, `partial`

**Task execution statuses:** `pending`, `running`, `completed`, `failed`, `skipped`

**Trigger types:** `scheduled`, `manual`

## 9. Key Architectural Differences: Go vs. Vercel Cron

| Aspect | Go Scheduler | Vercel Cron |
|--------|-------------|-------------|
| Scheduling | Engine polls DB every 30s for due schedules | Vercel invokes HTTP endpoint on cron schedule |
| Tenant scope | Each schedule belongs to one tenant | Cron job must iterate ALL active tenants |
| Configuration | Schedule + tasks stored in DB | Cron schedule in `vercel.json`, logic in route handler |
| Auth | Internal (no auth needed, runs in-process) | Needs `CRON_SECRET` validation |
| Max runtime | Unlimited (background goroutine) | 300 seconds (5 minutes) on Vercel Pro |
| Task orchestration | Generic executor with handler registry | Direct function call to services |

## 10. Files Referenced

### Go (being replaced)
- `apps/api/internal/service/scheduler_tasks.go` -- Task handlers (calculate_days at lines 37-107)
- `apps/api/internal/service/scheduler_executor.go` -- Executor orchestration (209 lines)
- `apps/api/internal/service/scheduler_engine.go` -- Background cron engine (100 lines)
- `apps/api/internal/service/recalc.go` -- RecalcService (147 lines)
- `apps/api/internal/model/schedule.go` -- Schedule models and constants
- `apps/api/cmd/server/main.go` -- Handler registration (lines 411-433)

### TypeScript (dependencies, already exist)
- `apps/web/src/server/services/daily-calc.ts` -- DailyCalcService
- `apps/web/src/server/services/daily-calc.types.ts` -- Types/constants
- `apps/web/src/server/services/daily-calc.helpers.ts` -- Helper functions
- `apps/web/src/server/services/recalc.ts` -- RecalcService
- `apps/web/src/server/services/recalc.types.ts` -- RecalcResult, RecalcError
- `apps/web/src/server/services/monthly-calc.ts` -- MonthlyCalcService
- `apps/web/src/lib/db/prisma.ts` -- Prisma singleton
- `apps/web/src/config/env.ts` -- Environment config
- `apps/web/prisma/schema.prisma` -- Schedule/ScheduleExecution models (lines 2993-3119)

### Infrastructure (to be created)
- `apps/web/src/app/api/cron/calculate-days/route.ts` -- New cron route handler
- `apps/web/vercel.json` (or project root) -- Vercel cron configuration
