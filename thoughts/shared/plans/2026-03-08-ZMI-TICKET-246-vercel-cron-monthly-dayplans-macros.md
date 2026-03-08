# Implementation Plan: ZMI-TICKET-246 -- Vercel Cron: calculate_months, generate_day_plans, execute_macros

Date: 2026-03-08

## Overview

Implement three additional Vercel Cron Jobs to replace the corresponding Go scheduler tasks:

1. **calculate-months** -- Monthly aggregation of daily values (2nd of each month at 03:00 UTC)
2. **generate-day-plans** -- Expand tariff week plans into employee day plans (Sundays at 01:00 UTC)
3. **execute-macros** -- Execute due weekly/monthly macros (every 15 minutes)

Each follows the pattern established by TICKET-245's `calculate-days` cron job: Next.js API route, CRON_SECRET auth, sequential tenant iteration, CronExecutionLogger for execution tracking.

## Dependencies (all already implemented)

- ZMI-TICKET-238: `MonthlyCalcService` at `apps/web/src/server/services/monthly-calc.ts`
- ZMI-TICKET-229: `employeeDayPlans` router with `generateFromTariff` logic at `apps/web/src/server/routers/employeeDayPlans.ts`
- ZMI-TICKET-222: `macros` router with `executeAction` helper at `apps/web/src/server/routers/macros.ts`
- ZMI-TICKET-244: Prisma schema for Schedule, ScheduleExecution, ScheduleTaskExecution
- ZMI-TICKET-245: `CronExecutionLogger` at `apps/web/src/server/services/cron-execution-logger.ts`

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `db/migrations/000089_add_schedule_task_types.up.sql` | Add `execute_macros`, `generate_day_plans` to CHECK constraint |
| CREATE | `db/migrations/000089_add_schedule_task_types.down.sql` | Revert CHECK constraint change |
| MODIFY | `apps/web/src/server/services/cron-execution-logger.ts` | Parameterize `timingType`/`timingConfig` in `ensureSchedule()` |
| CREATE | `apps/web/src/server/services/employee-day-plan-generator.ts` | Extracted standalone service from tRPC router |
| CREATE | `apps/web/src/server/services/macro-executor.ts` | Standalone `executeDueMacros()` service (port from Go) |
| CREATE | `apps/web/src/app/api/cron/calculate-months/route.ts` | Cron route for monthly calculations |
| CREATE | `apps/web/src/app/api/cron/generate-day-plans/route.ts` | Cron route for day plan generation |
| CREATE | `apps/web/src/app/api/cron/execute-macros/route.ts` | Cron route for macro execution |
| CREATE | `apps/web/src/app/api/cron/calculate-months/__tests__/route.test.ts` | Tests |
| CREATE | `apps/web/src/app/api/cron/generate-day-plans/__tests__/route.test.ts` | Tests |
| CREATE | `apps/web/src/app/api/cron/execute-macros/__tests__/route.test.ts` | Tests |
| MODIFY | `apps/web/vercel.json` | Add 3 new cron schedules |

---

## Phase 0: Prerequisite -- DB Migration and CronExecutionLogger Update

### 0A: DB Migration for schedule_tasks CHECK constraint

The `schedule_tasks.task_type` column has a CHECK constraint that only allows: `calculate_days`, `calculate_months`, `backup_database`, `send_notifications`, `export_data`, `alive_check`. The task types `execute_macros` and `generate_day_plans` are missing.

**File: `db/migrations/000089_add_schedule_task_types.up.sql`**

```sql
-- =============================================================
-- Add execute_macros and generate_day_plans to schedule_tasks CHECK constraint
-- ZMI-TICKET-246: Vercel Cron monthly/dayplans/macros
-- =============================================================

-- Drop the existing CHECK constraint and recreate with expanded values
ALTER TABLE schedule_tasks DROP CONSTRAINT IF EXISTS schedule_tasks_task_type_check;
ALTER TABLE schedule_tasks ADD CONSTRAINT schedule_tasks_task_type_check
    CHECK (task_type IN (
        'calculate_days', 'calculate_months',
        'backup_database', 'send_notifications',
        'export_data', 'alive_check',
        'execute_macros', 'generate_day_plans'
    ));
```

**File: `db/migrations/000089_add_schedule_task_types.down.sql`**

```sql
-- Revert to original CHECK constraint
ALTER TABLE schedule_tasks DROP CONSTRAINT IF EXISTS schedule_tasks_task_type_check;
ALTER TABLE schedule_tasks ADD CONSTRAINT schedule_tasks_task_type_check
    CHECK (task_type IN (
        'calculate_days', 'calculate_months',
        'backup_database', 'send_notifications',
        'export_data', 'alive_check'
    ));
```

**Verification:** Run `make db-reset` or apply migration manually, confirm no errors.

### 0B: Parameterize CronExecutionLogger.ensureSchedule()

The current `ensureSchedule()` hardcodes `timingType: "daily"` and `timingConfig: { time: "02:00", source: "vercel_cron" }`. Each new cron job has different timing metadata. Update the method signature to accept optional timing parameters.

**File: `apps/web/src/server/services/cron-execution-logger.ts`**

**Change:** Add optional `options` parameter to `ensureSchedule()`:

```typescript
async ensureSchedule(
  tenantId: string,
  name: string,
  taskType: string,
  options?: {
    timingType?: string
    timingConfig?: Record<string, unknown>
  },
): Promise<string> {
  const schedule = await this.prisma.schedule.upsert({
    where: {
      tenantId_name: { tenantId, name },
    },
    create: {
      tenantId,
      name,
      description: `Vercel Cron: ${name}`,
      timingType: options?.timingType ?? "daily",
      timingConfig: options?.timingConfig ?? { time: "02:00", source: "vercel_cron" },
      isEnabled: true,
      tasks: {
        create: {
          taskType,
          sortOrder: 0,
          parameters: {},
          isEnabled: true,
        },
      },
    },
    update: {
      isEnabled: true,
    },
    select: { id: true },
  })

  return schedule.id
}
```

This is backward-compatible: the existing `calculate-days` route does not pass `options`, so it continues using the defaults.

**Verification:** Existing `calculate-days` tests still pass. TypeScript compiles.

---

## Phase 1: calculate-months Cron Route

### 1A: Route Handler

**File: `apps/web/src/app/api/cron/calculate-months/route.ts`**

**Port of:** Go `CalculateMonthsTaskHandler.Execute` (scheduler_tasks.go lines 109-188)

**Pattern:** Follow `calculate-days/route.ts` exactly. Export `runtime`, `maxDuration`, core logic function, and `GET` handler.

**Constants:**
```typescript
const SCHEDULE_NAME = "calculate_months_cron"
const TASK_TYPE = "calculate_months"
```

**Core logic function: `executeCalculateMonths(year?: number, month?: number, now?: Date)`**

1. **Compute default year/month:** If not provided, default to **previous month** (matching Go behavior):
   ```typescript
   const defaultDate = new Date(Date.UTC(
     now.getUTCFullYear(), now.getUTCMonth() - 1, 1
   ))
   const targetYear = year ?? defaultDate.getUTCFullYear()
   const targetMonth = month ?? (defaultDate.getUTCMonth() + 1) // 1-indexed
   ```
   NOTE: `new Date(Date.UTC(2026, -1, 1))` correctly wraps to December 2025.

2. **Load all active tenants:**
   ```typescript
   const tenants = await prisma.tenant.findMany({
     where: { isActive: true },
     select: { id: true },
   })
   ```

3. **Instantiate services:**
   ```typescript
   const monthlyCalcService = new MonthlyCalcService(prisma)
   const logger = new CronExecutionLogger(prisma)
   ```

4. **Sequential tenant loop:**

   For each tenant:
   a. `logger.ensureSchedule(tenant.id, SCHEDULE_NAME, TASK_TYPE, { timingType: "monthly", timingConfig: { dayOfMonth: 2, time: "03:00", source: "vercel_cron" } })`
   b. `logger.startExecution(tenant.id, scheduleId, "scheduled", TASK_TYPE)`
   c. Query active employees:
      ```typescript
      const employees = await prisma.employee.findMany({
        where: { tenantId: tenant.id, isActive: true, deletedAt: null },
        select: { id: true },
      })
      const employeeIds = employees.map(e => e.id)
      ```
   d. Call `monthlyCalcService.calculateMonthBatch(employeeIds, targetYear, targetMonth)`
   e. Determine status: `failedMonths === 0 ? "completed" : processedMonths === 0 ? "failed" : "partial"`
   f. `logger.completeExecution(...)` with result:
      ```typescript
      {
        status,
        taskResult: {
          year: targetYear,
          month: targetMonth,
          processed_months: result.processedMonths,
          skipped_months: result.skippedMonths,
          failed_months: result.failedMonths,
          errors: result.errors.length > 0 ? result.errors : undefined,
        },
        errorMessage: status === "failed" ? `All ${result.failedMonths} months failed` : undefined,
      }
      ```
   g. Catch errors per-tenant, log and continue.

5. **Return summary JSON:**
   ```typescript
   {
     ok: boolean,
     year: number,
     month: number,
     tenantsProcessed: number,
     tenantsFailed: number,
     totalProcessedMonths: number,
     totalSkippedMonths: number,
     totalFailedMonths: number,
     results: TenantResult[],
   }
   ```

**GET handler:**
1. CRON_SECRET validation (same pattern as calculate-days)
2. Parse optional query params: `?year=2026&month=2` (both optional, default to previous month)
3. Validate: year must be 1900-2200, month must be 1-12 (if provided)
4. Call `executeCalculateMonths(year, month)`
5. Return result as JSON

**Imports:**
```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { MonthlyCalcService } from "@/server/services/monthly-calc"
import { CronExecutionLogger } from "@/server/services/cron-execution-logger"
```

**Export structure:**
```typescript
export const runtime = "nodejs"
export const maxDuration = 300
export function computeDefaultMonth(now: Date): { year: number; month: number }  // pure, testable
export async function executeCalculateMonths(year?: number, month?: number, now?: Date): Promise<...>
export async function GET(request: Request): Promise<NextResponse>
```

### 1B: Tests

**File: `apps/web/src/app/api/cron/calculate-months/__tests__/route.test.ts`**

**Follow the exact test pattern from `calculate-days/__tests__/route.test.ts`:**

1. **Pure function tests for `computeDefaultMonth()`:**
   - January 15 -> December of previous year
   - March 8 -> February of same year
   - December -> November of same year

2. **Route handler tests with mocked dependencies:**
   - Mock `@/lib/db/prisma`, `@/server/services/monthly-calc`, `@/server/services/cron-execution-logger`
   - Use `vi.hoisted()` for mock state

3. **Test categories:**
   - Authorization: 401 for missing/wrong secret
   - Query params: `?year=2026&month=1` respected, invalid values return 400
   - Tenant iteration: processes all tenants, continues on failure
   - Partial status: when some employees have failed months
   - Empty tenants: returns 200 with 0 processed

### Verification
- `cd apps/web && npx vitest run src/app/api/cron/calculate-months`
- All tests pass

---

## Phase 2: generate-day-plans Cron Route

### 2A: Extract EmployeeDayPlanGenerator Service

The `generateFromTariff` logic is currently embedded in the tRPC router (`employeeDayPlans.ts` lines 889-1104). The cron route cannot call a tRPC procedure. Extract the core logic into a standalone service.

**File: `apps/web/src/server/services/employee-day-plan-generator.ts`**

**Pattern:** Same constructor-takes-PrismaClient as `RecalcService`, `MonthlyCalcService`.

**Approach:** Extract ONLY the orchestration logic. The helper functions (`getDayPlanIdForDate`, `getTariffSyncWindow`, `getWeekdayDayPlanId`) and type definitions (`TariffForGenerate`, `EmployeeForGenerate`, `WeekPlanData`) are defined at module scope in the router file. Import them from the router file OR move them to this service file and re-export from the router.

**Recommended approach:** Move the helper functions and types to the new service file, then import them in the router. This avoids circular dependencies and keeps the service self-contained. The tRPC router's `generateFromTariff` procedure would then delegate to this service.

**Interface:**

```typescript
import type { PrismaClient } from "@/generated/prisma/client"

export interface GenerateFromTariffInput {
  tenantId: string
  employeeIds?: string[]
  from?: Date
  to?: Date
  overwriteTariffSource?: boolean
}

export interface GenerateFromTariffResult {
  employeesProcessed: number
  plansCreated: number
  plansUpdated: number
  employeesSkipped: number
}

export class EmployeeDayPlanGenerator {
  constructor(private prisma: PrismaClient) {}

  async generateFromTariff(input: GenerateFromTariffInput): Promise<GenerateFromTariffResult>
}
```

**Implementation -- extract from `employeeDayPlans.ts` lines 900-1104:**

The `generateFromTariff` method body should be essentially the same as the tRPC procedure handler, with these changes:
- Replace `ctx.prisma` with `this.prisma`
- Replace `ctx.tenantId!` with `input.tenantId`
- Replace `input.employeeIds` (zod-validated) with `input.employeeIds` (direct param)
- Replace `input.from` / `input.to` string parsing with direct Date params
- Keep all the same logic: default date range, employee fetching, tariff loading, sync window, skip map, day resolution, bulk upsert

**Also move these functions/types from `employeeDayPlans.ts` to this service file:**
- `WeekPlanData` interface
- `TariffForGenerate` interface
- `EmployeeForGenerate` interface
- `getWeekdayDayPlanId()` function
- `getDayPlanIdForDate()` function
- `getTariffSyncWindow()` function
- `tariffGenerateInclude` const

Then update `employeeDayPlans.ts` to import them:
```typescript
import {
  EmployeeDayPlanGenerator,
  getDayPlanIdForDate,
  getTariffSyncWindow,
  getWeekdayDayPlanId,
  type TariffForGenerate,
  type EmployeeForGenerate,
  type WeekPlanData,
} from "@/server/services/employee-day-plan-generator"
```

And update the tRPC `generateFromTariff` procedure to delegate to the service:
```typescript
generateFromTariff: tenantProcedure
  .use(requirePermission(TIME_PLANS_MANAGE))
  .input(generateFromTariffInputSchema)
  .output(...)
  .mutation(async ({ ctx, input }) => {
    const generator = new EmployeeDayPlanGenerator(ctx.prisma)
    return generator.generateFromTariff({
      tenantId: ctx.tenantId!,
      employeeIds: input.employeeIds,
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
      overwriteTariffSource: input.overwriteTariffSource,
    })
  }),
```

**Also export `tariffGenerateInclude` from the service** so the router can use it if needed for other queries.

### 2B: Route Handler

**File: `apps/web/src/app/api/cron/generate-day-plans/route.ts`**

**Port of:** Go `GenerateDayPlansTaskHandler.Execute` (scheduler_tasks.go lines 293-355)

**Constants:**
```typescript
const SCHEDULE_NAME = "generate_day_plans_cron"
const TASK_TYPE = "generate_day_plans"
const DEFAULT_DAYS_AHEAD = 14
```

**Core logic function: `executeGenerateDayPlans(daysAhead?: number, now?: Date)`**

1. **Compute date range:**
   ```typescript
   const effectiveDaysAhead = daysAhead ?? DEFAULT_DAYS_AHEAD
   const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
   const toDate = new Date(todayUTC)
   toDate.setUTCDate(toDate.getUTCDate() + effectiveDaysAhead)
   ```

2. **Load all active tenants** (same pattern)

3. **Instantiate services:**
   ```typescript
   const generator = new EmployeeDayPlanGenerator(prisma)
   const logger = new CronExecutionLogger(prisma)
   ```

4. **Sequential tenant loop:**

   For each tenant:
   a. `logger.ensureSchedule(tenant.id, SCHEDULE_NAME, TASK_TYPE, { timingType: "weekly", timingConfig: { dayOfWeek: 0, time: "01:00", source: "vercel_cron" } })`
   b. `logger.startExecution(tenant.id, scheduleId, "scheduled", TASK_TYPE)`
   c. Call:
      ```typescript
      const result = await generator.generateFromTariff({
        tenantId: tenant.id,
        // employeeIds: undefined = all active employees
        from: todayUTC,
        to: toDate,
        overwriteTariffSource: true,
      })
      ```
   d. Determine status: all employees skipped = `"completed"` (nothing to do is fine), otherwise by whether plansCreated > 0
   e. `logger.completeExecution(...)` with result:
      ```typescript
      {
        status: "completed",  // generate_day_plans doesn't have a natural "failed" per-item
        taskResult: {
          days_ahead: effectiveDaysAhead,
          from: todayStr,
          to: toStr,
          employees_processed: result.employeesProcessed,
          plans_created: result.plansCreated,
          plans_updated: result.plansUpdated,
          employees_skipped: result.employeesSkipped,
        },
      }
      ```
   f. Catch errors per-tenant, log and continue.

5. **Return summary JSON:**
   ```typescript
   {
     ok: boolean,
     daysAhead: number,
     from: string,
     to: string,
     tenantsProcessed: number,
     tenantsFailed: number,
     totalEmployeesProcessed: number,
     totalPlansCreated: number,
     totalPlansUpdated: number,
     totalEmployeesSkipped: number,
     results: TenantResult[],
   }
   ```

**GET handler:**
1. CRON_SECRET validation
2. Parse optional query param: `?days_ahead=14` (default: 14, validate 1-365)
3. Call `executeGenerateDayPlans(daysAhead)`
4. Return result as JSON

**Export structure:**
```typescript
export const runtime = "nodejs"
export const maxDuration = 300
export async function executeGenerateDayPlans(daysAhead?: number, now?: Date): Promise<...>
export async function GET(request: Request): Promise<NextResponse>
```

### 2C: Tests

**File: `apps/web/src/app/api/cron/generate-day-plans/__tests__/route.test.ts`**

**Mock:** `@/lib/db/prisma`, `@/server/services/employee-day-plan-generator`, `@/server/services/cron-execution-logger`

**Test categories:**
1. Authorization: 401 for missing/wrong secret
2. Query params: `?days_ahead=7` respected, invalid values (0, -1, 999) return 400
3. Tenant iteration: processes all tenants, continues on failure
4. Default behavior: days_ahead defaults to 14
5. Date range computation: from=today, to=today+14

### Verification
- `cd apps/web && npx vitest run src/app/api/cron/generate-day-plans`
- Verify `employeeDayPlans` router still works (no broken imports after refactor)
- `cd apps/web && npx vitest run src/server/routers/employeeDayPlans` (if tests exist)

---

## Phase 3: execute-macros Cron Route

### 3A: Create MacroExecutor Service

The Go `MacroService.ExecuteDueMacros` logic has **not been ported to TypeScript**. The existing TypeScript macros router only supports manual single-macro execution. We need to port the scheduling logic from Go `macro.go` lines 368-433.

**File: `apps/web/src/server/services/macro-executor.ts`**

**Pattern:** Same constructor-takes-PrismaClient pattern.

**Port from Go:** `MacroService.ExecuteDueMacros` and `MacroService.executeMacro`

**Import the existing `executeAction` helper** from the macros router:
```typescript
import { executeAction } from "@/server/routers/macros"
```

NOTE: `executeAction` is currently a non-exported module-scope function in `macros.ts`. It needs to be **exported** from that file:
```typescript
// In macros.ts, change:
// async function executeAction(...) {
// To:
export async function executeAction(...) {
```

**Interface:**

```typescript
import type { PrismaClient } from "@/generated/prisma/client"

export interface ExecuteDueMacrosResult {
  executed: number
  failed: number
  errors: Array<{ macroId: string; assignmentId: string; error: string }>
}

export class MacroExecutor {
  constructor(private prisma: PrismaClient) {}

  async executeDueMacros(tenantId: string, date: Date): Promise<ExecuteDueMacrosResult>
}
```

**Implementation of `executeDueMacros(tenantId, date)`:**

```typescript
async executeDueMacros(tenantId: string, date: Date): Promise<ExecuteDueMacrosResult> {
  const weekday = date.getUTCDay() // 0=Sunday..6=Saturday (matches Go's time.Weekday())
  const dayOfMonth = date.getUTCDate()
  const lastDayOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()

  let executed = 0
  let failed = 0
  const errors: Array<{ macroId: string; assignmentId: string; error: string }> = []

  // 1. Execute weekly macros
  const weeklyMacros = await this.prisma.macro.findMany({
    where: { tenantId, macroType: "weekly", isActive: true },
    include: { assignments: true },
  })

  for (const macro of weeklyMacros) {
    for (const assignment of macro.assignments) {
      if (!assignment.isActive) continue
      if (assignment.executionDay === weekday) {
        try {
          await this.executeSingleMacro(macro, "scheduled", assignment.id)
          executed++
        } catch (err) {
          failed++
          errors.push({
            macroId: macro.id,
            assignmentId: assignment.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  // 2. Execute monthly macros
  const monthlyMacros = await this.prisma.macro.findMany({
    where: { tenantId, macroType: "monthly", isActive: true },
    include: { assignments: true },
  })

  for (const macro of monthlyMacros) {
    for (const assignment of macro.assignments) {
      if (!assignment.isActive) continue
      // Monthly day fallback: if configured day exceeds month length, use last day
      let effectiveDay = assignment.executionDay
      if (effectiveDay > lastDayOfMonth) {
        effectiveDay = lastDayOfMonth
      }
      if (effectiveDay === dayOfMonth) {
        try {
          await this.executeSingleMacro(macro, "scheduled", assignment.id)
          executed++
        } catch (err) {
          failed++
          errors.push({
            macroId: macro.id,
            assignmentId: assignment.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  return { executed, failed, errors }
}
```

**Implementation of `executeSingleMacro(macro, triggerType, assignmentId)`:**

Port of Go `executeMacro` (macro.go lines 435-476):

```typescript
private async executeSingleMacro(
  macro: { id: string; tenantId: string; name: string; macroType: string; actionType: string; actionParams: unknown },
  triggerType: "scheduled" | "manual",
  assignmentId: string,
): Promise<void> {
  // 1. Create execution record with status "running"
  const execution = await this.prisma.macroExecution.create({
    data: {
      tenantId: macro.tenantId,
      macroId: macro.id,
      assignmentId,
      status: "running",
      triggerType,
      startedAt: new Date(),
    },
  })

  // 2. Run the action
  const actionResult = await executeAction({
    id: macro.id,
    name: macro.name,
    macroType: macro.macroType,
    actionType: macro.actionType,
    actionParams: macro.actionParams,
  })

  // 3. Update execution record
  await this.prisma.macroExecution.update({
    where: { id: execution.id },
    data: {
      completedAt: new Date(),
      status: actionResult.error ? "failed" : "completed",
      result: (actionResult.result as object) ?? {},
      errorMessage: actionResult.error,
    },
  })

  // 4. If action returned an error, throw so caller counts it as failed
  if (actionResult.error) {
    throw new Error(actionResult.error)
  }
}
```

### 3B: Route Handler

**File: `apps/web/src/app/api/cron/execute-macros/route.ts`**

**Port of:** Go `ExecuteMacrosTaskHandler.Execute` (macro_task.go)

**Constants:**
```typescript
const SCHEDULE_NAME = "execute_macros_cron"
const TASK_TYPE = "execute_macros"
```

**Core logic function: `executeExecuteMacros(dateStr?: string, now?: Date)`**

1. **Compute target date:**
   ```typescript
   let targetDate: Date
   if (dateStr) {
     targetDate = new Date(dateStr + "T00:00:00.000Z")
     if (isNaN(targetDate.getTime())) {
       throw new Error(`Invalid date: ${dateStr}`)
     }
   } else {
     targetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
   }
   ```

2. **Load all active tenants** (same pattern)

3. **Instantiate services:**
   ```typescript
   const macroExecutor = new MacroExecutor(prisma)
   const logger = new CronExecutionLogger(prisma)
   ```

4. **Sequential tenant loop:**

   For each tenant:
   a. `logger.ensureSchedule(tenant.id, SCHEDULE_NAME, TASK_TYPE, { timingType: "minutes", timingConfig: { interval: 15, source: "vercel_cron" } })`
   b. `logger.startExecution(tenant.id, scheduleId, "scheduled", TASK_TYPE)`
   c. Call `macroExecutor.executeDueMacros(tenant.id, targetDate)`
   d. Determine status: `result.failed === 0 ? "completed" : result.executed === 0 && result.failed > 0 ? "failed" : "partial"`
      - Special case: if `executed === 0 && failed === 0`, status is `"completed"` (no macros due, which is fine)
   e. `logger.completeExecution(...)` with result:
      ```typescript
      {
        status,
        taskResult: {
          date: targetDate.toISOString().slice(0, 10),
          executed: result.executed,
          failed: result.failed,
          errors: result.errors.length > 0 ? result.errors : undefined,
        },
        errorMessage: result.failed > 0 ? `${result.failed} macro executions failed` : undefined,
      }
      ```
   f. Catch errors per-tenant, log and continue.

5. **Return summary JSON:**
   ```typescript
   {
     ok: boolean,
     date: string,
     tenantsProcessed: number,
     tenantsFailed: number,
     totalExecuted: number,
     totalFailed: number,
     results: TenantResult[],
   }
   ```

**GET handler:**
1. CRON_SECRET validation
2. Parse optional query param: `?date=2026-03-08` (default: today, YYYY-MM-DD format)
3. Validate date format if provided
4. Call `executeExecuteMacros(date)`
5. Return result as JSON

**Important considerations:**
- This runs every 15 minutes. The `maxDuration` should still be 300s but in practice each run should be fast since it only executes macros whose assignment day matches today's date/weekday.
- Weekly macros: a macro with `executionDay=3` (Wednesday) will be due every time this cron runs on a Wednesday. Since it runs every 15 minutes, we could execute the same macro 96 times on Wednesday. **However:** The Go implementation also had this pattern -- the scheduler ran the task at a configured time (e.g., once daily after daily calc). The 15-minute Vercel cron is fine IF we add idempotency or the macro actions themselves are idempotent (which they currently are -- log_message and the placeholder actions). Document this as a known consideration.
- **Alternative:** Use a daily schedule instead of 15-minute. The Go scheduler ran `execute_macros` once per day. Using `*/15` means macros execute multiple times per day. Per the ticket schedule (`*/15 * * * *`), we follow the spec. If the actions are not idempotent in the future, deduplication logic should be added.

**Export structure:**
```typescript
export const runtime = "nodejs"
export const maxDuration = 300
export async function executeExecuteMacros(dateStr?: string, now?: Date): Promise<...>
export async function GET(request: Request): Promise<NextResponse>
```

### 3C: Export executeAction from macros router

**File: `apps/web/src/server/routers/macros.ts`**

**Change:** Export the `executeAction` function (currently module-private):

```typescript
// Line 151: change from:
async function executeAction(macro: {
// to:
export async function executeAction(macro: {
```

This is a minimal change -- just adding `export`. The function is already a standalone helper, not tied to tRPC context.

### 3D: Tests

**File: `apps/web/src/app/api/cron/execute-macros/__tests__/route.test.ts`**

**Mock:** `@/lib/db/prisma`, `@/server/services/macro-executor`, `@/server/services/cron-execution-logger`

**Test categories:**
1. Authorization: 401 for missing/wrong secret
2. Query params: `?date=2026-03-08` respected, invalid date returns 400
3. Default date: today when not provided
4. Tenant iteration: processes all tenants, continues on failure
5. Empty results: no macros due returns ok=true with 0 executed

**Separate unit tests for `MacroExecutor`** (in `apps/web/src/server/services/__tests__/macro-executor.test.ts`):
1. Weekly macro: triggers when weekday matches
2. Weekly macro: skips when weekday does not match
3. Monthly macro: triggers when dayOfMonth matches
4. Monthly macro: day fallback -- macro set for day 31 triggers on day 28 in February
5. Inactive assignment: skipped
6. Inactive macro: not queried (filtered in Prisma where clause)
7. Action error: counted as failed, execution record updated
8. Mixed results: some executed, some failed

### Verification
- `cd apps/web && npx vitest run src/app/api/cron/execute-macros`
- `cd apps/web && npx vitest run src/server/services/__tests__/macro-executor`

---

## Phase 4: Update vercel.json

**File: `apps/web/vercel.json`**

**Change:** Add the 3 new cron schedules:

```json
{
  "crons": [
    {
      "path": "/api/cron/calculate-days",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/calculate-months",
      "schedule": "0 3 2 * *"
    },
    {
      "path": "/api/cron/generate-day-plans",
      "schedule": "0 1 * * 0"
    },
    {
      "path": "/api/cron/execute-macros",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

| Path | Schedule | Description |
|------|----------|-------------|
| `/api/cron/calculate-days` | `0 2 * * *` | Daily at 02:00 UTC (existing) |
| `/api/cron/calculate-months` | `0 3 2 * *` | 2nd of each month at 03:00 UTC |
| `/api/cron/generate-day-plans` | `0 1 * * 0` | Sundays at 01:00 UTC |
| `/api/cron/execute-macros` | `*/15 * * * *` | Every 15 minutes |

### Verification
- `vercel.json` is valid JSON
- All 4 cron entries present

---

## Implementation Order

Execute phases in this order due to dependencies:

1. **Phase 0A** -- DB migration (unblocks Phase 1-3 execution logging)
2. **Phase 0B** -- CronExecutionLogger update (unblocks Phase 1-3)
3. **Phase 1** -- calculate-months (simplest, uses existing `MonthlyCalcService` directly)
4. **Phase 2A** -- Extract EmployeeDayPlanGenerator service
5. **Phase 2B+2C** -- generate-day-plans route and tests
6. **Phase 3C** -- Export executeAction from macros router
7. **Phase 3A** -- Create MacroExecutor service
8. **Phase 3B+3D** -- execute-macros route and tests
9. **Phase 4** -- Update vercel.json

## Error Handling Philosophy

All three cron routes follow the same error handling strategy from TICKET-245:

1. **Per-tenant isolation:** An error in one tenant does not block processing of other tenants
2. **Per-operation isolation:** Within a tenant, errors in individual operations (employee calc, macro execution) are caught and aggregated
3. **Execution logging resilience:** If the execution logging itself fails in the catch block, log the error and continue
4. **HTTP response:** Always return 200 with a summary (not 500), unless the entire route fatally crashes (DB unreachable at startup). The `ok` field indicates whether all tenants succeeded.

## Key Differences from Go Implementation

1. **Tenant iteration:** Go scheduler ran per-tenant (schedule belonged to tenant). Vercel cron iterates all tenants.
2. **Sequential processing:** Avoid connection pool exhaustion by processing tenants one at a time.
3. **No params JSON:** Go tasks read parameters from a JSON column in the schedule_tasks table. Vercel cron routes read from query parameters (for manual override) with hardcoded defaults.
4. **Timing metadata:** Go scheduler used the schedule's timing config to determine when to run. Vercel cron uses `vercel.json`. The timing fields in the Schedule table are purely informational/cosmetic.

## Success Criteria

- [ ] DB migration adds `execute_macros` and `generate_day_plans` to schedule_tasks CHECK constraint
- [ ] CronExecutionLogger.ensureSchedule() accepts optional timingType/timingConfig
- [ ] `/api/cron/calculate-months` works end-to-end with CRON_SECRET auth
- [ ] `/api/cron/generate-day-plans` works end-to-end with CRON_SECRET auth
- [ ] `/api/cron/execute-macros` works end-to-end with CRON_SECRET auth
- [ ] EmployeeDayPlanGenerator is a standalone service, tRPC router delegates to it
- [ ] MacroExecutor correctly implements weekly/monthly day matching with fallback
- [ ] `executeAction` is exported from macros router for reuse
- [ ] vercel.json has all 4 cron schedules
- [ ] All tests pass for all 3 new routes
- [ ] Per-tenant error isolation: one tenant failure does not block others
- [ ] Existing calculate-days cron continues to work unchanged
