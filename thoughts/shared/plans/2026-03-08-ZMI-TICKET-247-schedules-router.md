# Implementation Plan: ZMI-TICKET-247 -- Schedules Router (CRUD + Execution Management)

Date: 2026-03-08

## Overview

Implement a tRPC `schedules` router that replaces the Go backend schedule CRUD, task management, manual execution, execution history, and task catalog endpoints. Also migrate the frontend hooks from REST API (`useApiQuery`/`useApiMutation`) to tRPC.

This router ports business logic from four Go files (1,590 lines total) into a single tRPC router file, following the established patterns from the `macros` router (which has an almost identical structure: CRUD + sub-entity management + execution + execution history).

## Dependencies (all already implemented)

- ZMI-TICKET-244: Prisma schema for `Schedule`, `ScheduleTask`, `ScheduleExecution`, `ScheduleTaskExecution`
- ZMI-TICKET-245/246: Vercel Cron routes + `CronExecutionLogger` (creates schedule records that this router manages/displays)
- ZMI-TICKET-203: Authorization middleware (`requirePermission`)
- Permission catalog: `schedules.manage` already exists at `apps/web/src/server/lib/permission-catalog.ts` line 165

## Design Decisions

1. **Permission granularity:** Use single `schedules.manage` permission for ALL procedures (matching Go behavior and existing permission catalog). The ticket mentions `schedules.read`/`.write`/`.execute` but those do not exist in the permission catalog. Keep parity with Go.

2. **Manual execution (execute procedure):** Implement full task execution inline, matching Go's `SchedulerExecutor.TriggerExecution`. The procedure creates `ScheduleExecution` + `ScheduleTaskExecution` records, iterates enabled tasks, and records results per task. For task types with registered handlers (cron routes already implement the logic), the execute procedure calls placeholder/log-only handlers since the actual task services (RecalcService, etc.) are designed for batch/cron use. This matches Go behavior where manual execution ran the registered handlers.

3. **Task type validation:** Use the DB CHECK constraint set (8 types: `calculate_days`, `calculate_months`, `backup_database`, `send_notifications`, `export_data`, `alive_check`, `execute_macros`, `generate_day_plans`). Exclude `terminal_sync` and `terminal_import` which are in Go code but not in the DB constraint (migration 000089).

4. **Timing computation:** Port `computeNextRun` from Go to TypeScript. While Vercel Cron handles actual scheduling, `nextRunAt` is informational and displayed in the UI. Keep parity with Go for accurate display.

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `apps/web/src/server/routers/schedules.ts` | tRPC router with all 13 procedures |
| MODIFY | `apps/web/src/server/root.ts` | Register `schedulesRouter` |
| MODIFY | `apps/web/src/hooks/api/use-schedules.ts` | Migrate from REST to tRPC hooks |
| MODIFY | `apps/web/src/hooks/api/index.ts` | Keep exports (same hook names) |
| MODIFY | `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx` | Update to use tRPC-based hooks |
| MODIFY | `apps/web/src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx` | Update to use tRPC-based hooks |
| MODIFY | `apps/web/src/components/schedules/schedule-form-sheet.tsx` | Update to use tRPC-based hooks |
| MODIFY | `apps/web/src/components/schedules/schedule-task-form-dialog.tsx` | Update to use tRPC-based hooks |

---

## Phase 1: tRPC Schedules Router

### 1A: File Structure and Constants

**File: `apps/web/src/server/routers/schedules.ts`**

Follow the exact structure from `macros.ts`:

```typescript
/**
 * Schedules Router
 *
 * Provides schedule CRUD, task management, manual execution,
 * execution history, and task catalog via tRPC procedures.
 *
 * Replaces the Go backend schedule endpoints:
 * - GET /schedules -> schedules.list
 * - GET /schedules/{id} -> schedules.getById
 * - POST /schedules -> schedules.create
 * - PATCH /schedules/{id} -> schedules.update
 * - DELETE /schedules/{id} -> schedules.delete
 * - GET /schedules/{id}/tasks -> schedules.tasks
 * - POST /schedules/{id}/tasks -> schedules.createTask
 * - PATCH /schedules/{id}/tasks/{taskId} -> schedules.updateTask
 * - DELETE /schedules/{id}/tasks/{taskId} -> schedules.deleteTask
 * - POST /schedules/{id}/execute -> schedules.execute
 * - GET /schedules/{id}/executions -> schedules.executions
 * - GET /schedule-executions/{id} -> schedules.execution
 * - GET /scheduler/task-catalog -> schedules.taskCatalog
 *
 * @see apps/api/internal/service/schedule.go
 * @see apps/api/internal/service/scheduler_catalog.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
```

**Permission constant:**
```typescript
const SCHEDULES_MANAGE = permissionIdByKey("schedules.manage")!
```

**Enum constants (matching Go + DB CHECK constraint):**
```typescript
const TIMING_TYPES = [
  "seconds", "minutes", "hours", "daily", "weekly", "monthly", "manual"
] as const

const TASK_TYPES = [
  "calculate_days", "calculate_months", "backup_database", "send_notifications",
  "export_data", "alive_check", "execute_macros", "generate_day_plans"
] as const

const EXECUTION_STATUSES = ["pending", "running", "completed", "failed", "partial"] as const
const TASK_EXECUTION_STATUSES = ["pending", "running", "completed", "failed", "skipped"] as const
const TRIGGER_TYPES = ["scheduled", "manual"] as const

// Suppress unused-variable warnings
void EXECUTION_STATUSES
void TASK_EXECUTION_STATUSES
void TRIGGER_TYPES
```

### 1B: Output Schemas

```typescript
const scheduleTaskOutputSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  taskType: z.string(),
  sortOrder: z.number(),
  parameters: z.unknown(),
  isEnabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const scheduleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  timingType: z.string(),
  timingConfig: z.unknown(),
  isEnabled: z.boolean(),
  lastRunAt: z.date().nullable(),
  nextRunAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  tasks: z.array(scheduleTaskOutputSchema).optional(),
})

const scheduleTaskExecutionOutputSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  taskType: z.string(),
  sortOrder: z.number(),
  status: z.string(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  result: z.unknown(),
  createdAt: z.date(),
})

const scheduleExecutionOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  status: z.string(),
  triggerType: z.string(),
  triggeredBy: z.string().uuid().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  tasksTotal: z.number(),
  tasksSucceeded: z.number(),
  tasksFailed: z.number(),
  createdAt: z.date(),
  taskExecutions: z.array(scheduleTaskExecutionOutputSchema).optional(),
})

const taskCatalogEntrySchema = z.object({
  taskType: z.string(),
  name: z.string(),
  description: z.string(),
  parameterSchema: z.unknown(),
})
```

### 1C: Input Schemas

```typescript
const createScheduleInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  timingType: z.enum(TIMING_TYPES),
  timingConfig: z.unknown().optional(),
  isEnabled: z.boolean().optional(),
  tasks: z.array(z.object({
    taskType: z.enum(TASK_TYPES),
    sortOrder: z.number().int().default(0),
    parameters: z.unknown().optional(),
    isEnabled: z.boolean().optional(),
  })).optional(),
})

const updateScheduleInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  timingType: z.enum(TIMING_TYPES).optional(),
  timingConfig: z.unknown().optional(),
  isEnabled: z.boolean().optional(),
})

const createTaskInputSchema = z.object({
  scheduleId: z.string().uuid(),
  taskType: z.enum(TASK_TYPES),
  sortOrder: z.number().int().default(0),
  parameters: z.unknown().optional(),
  isEnabled: z.boolean().optional(),
})

const updateTaskInputSchema = z.object({
  scheduleId: z.string().uuid(),
  taskId: z.string().uuid(),
  taskType: z.enum(TASK_TYPES).optional(),
  sortOrder: z.number().int().optional(),
  parameters: z.unknown().optional(),
  isEnabled: z.boolean().optional(),
})
```

### 1D: Prisma Include Objects

```typescript
const withTasksSorted = {
  tasks: { orderBy: { sortOrder: "asc" as const } },
} as const

const withTaskExecutionsSorted = {
  taskExecutions: { orderBy: { sortOrder: "asc" as const } },
} as const
```

### 1E: Timing Computation Helper

Port from Go `computeNextRun` (schedule.go lines 434-533). This is a pure function with no external dependencies.

```typescript
/**
 * Computes the next run time based on timing type and config.
 * Port of Go computeNextRun (schedule.go lines 434-533).
 */
function computeNextRun(
  timingType: string,
  timingConfig: unknown,
  now: Date
): Date | null {
  const config = timingConfig as {
    interval?: number
    time?: string
    day_of_week?: number
    day_of_month?: number
  } | null

  switch (timingType) {
    case "seconds": {
      const interval = config?.interval && config.interval > 0 ? config.interval : 60
      return new Date(now.getTime() + interval * 1000)
    }
    case "minutes": {
      const interval = config?.interval && config.interval > 0 ? config.interval : 5
      return new Date(now.getTime() + interval * 60 * 1000)
    }
    case "hours": {
      const interval = config?.interval && config.interval > 0 ? config.interval : 1
      return new Date(now.getTime() + interval * 60 * 60 * 1000)
    }
    case "daily":
      return computeNextDailyRun(now, config?.time)
    case "weekly":
      return computeNextWeeklyRun(now, config?.day_of_week ?? 0, config?.time)
    case "monthly":
      return computeNextMonthlyRun(now, config?.day_of_month ?? 1, config?.time)
    case "manual":
      return null
    default:
      return null
  }
}

function parseTimeOfDay(timeStr?: string): [number, number] {
  if (!timeStr) return [2, 0] // default 02:00
  const parts = timeStr.split(":")
  return [parseInt(parts[0] ?? "2", 10), parseInt(parts[1] ?? "0", 10)]
}

function computeNextDailyRun(now: Date, timeStr?: string): Date {
  const [h, m] = parseTimeOfDay(timeStr)
  const next = new Date(now)
  next.setHours(h, m, 0, 0)
  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

function computeNextWeeklyRun(now: Date, dayOfWeek: number, timeStr?: string): Date {
  const [h, m] = parseTimeOfDay(timeStr)
  const next = new Date(now)
  next.setHours(h, m, 0, 0)
  let daysUntil = (dayOfWeek - now.getDay() + 7) % 7
  if (daysUntil === 0 && next <= now) {
    daysUntil = 7
  }
  next.setDate(next.getDate() + daysUntil)
  return next
}

function computeNextMonthlyRun(now: Date, dayOfMonth: number, timeStr?: string): Date {
  const [h, m] = parseTimeOfDay(timeStr)
  let day = dayOfMonth
  if (day <= 0) day = 1
  if (day > 28) day = 28 // safe for all months

  const next = new Date(now.getFullYear(), now.getMonth(), day, h, m, 0, 0)
  if (next <= now) {
    next.setMonth(next.getMonth() + 1)
  }
  return next
}
```

### 1F: Task Catalog Helper

Port from Go `GetTaskCatalog` (scheduler_catalog.go). This is a static data function.

```typescript
/**
 * Returns the list of available task types with their metadata.
 * Port of Go GetTaskCatalog (scheduler_catalog.go).
 *
 * Only includes task types valid per DB CHECK constraint (migration 000089).
 */
function getTaskCatalog() {
  return [
    {
      taskType: "calculate_days",
      name: "Calculate Days",
      description: "Recalculates daily values for all employees for a given date range. Default: yesterday.",
      parameterSchema: {
        type: "object",
        properties: {
          date_range: {
            type: "string",
            enum: ["yesterday", "today", "last_7_days", "current_month"],
            description: "Which date range to recalculate",
            default: "yesterday",
          },
        },
      },
    },
    {
      taskType: "calculate_months",
      name: "Calculate Months",
      description: "Recalculates monthly aggregations for a specific year/month. Default: previous month.",
      parameterSchema: {
        type: "object",
        properties: {
          year: { type: "integer", description: "Target year (default: current year)" },
          month: { type: "integer", description: "Target month 1-12 (default: previous month)", minimum: 1, maximum: 12 },
        },
      },
    },
    {
      taskType: "backup_database",
      name: "Backup Database",
      description: "Triggers a database backup (placeholder - logs execution only).",
      parameterSchema: { type: "object", properties: {} },
    },
    {
      taskType: "send_notifications",
      name: "Send Notifications",
      description: "Processes all pending employee message recipients and delivers notifications.",
      parameterSchema: { type: "object", properties: {} },
    },
    {
      taskType: "export_data",
      name: "Export Data",
      description: "Exports data via configured export interfaces (placeholder - logs execution only).",
      parameterSchema: {
        type: "object",
        properties: {
          export_interface_id: { type: "string", format: "uuid", description: "Export interface to use" },
        },
      },
    },
    {
      taskType: "alive_check",
      name: "Alive Check",
      description: "Simple heartbeat task that confirms the scheduler is running.",
      parameterSchema: { type: "object", properties: {} },
    },
    {
      taskType: "execute_macros",
      name: "Execute Macros",
      description: "Executes all due weekly and monthly macros for the current date.",
      parameterSchema: {
        type: "object",
        properties: {
          date: { type: "string", format: "date", description: "Target date (YYYY-MM-DD). Default: today." },
        },
      },
    },
    {
      taskType: "generate_day_plans",
      name: "Generate Day Plans",
      description: "Expands tariff week plans into employee day plans for upcoming period.",
      parameterSchema: {
        type: "object",
        properties: {
          days_ahead: { type: "integer", description: "How many days ahead to generate (default: 14)", default: 14 },
        },
      },
    },
  ]
}
```

### 1G: Router Procedures

Define the router with all 13 procedures. Each follows the pattern from `macros.ts`:

**Schedule CRUD (5 procedures):**

1. **`list`** -- query, returns `{ data: Schedule[] }` with tasks preloaded
   - Prisma: `findMany({ where: { tenantId }, include: withTasksSorted, orderBy: { name: "asc" } })`
   - Map result explicitly to output schema fields

2. **`getById`** -- query, input `{ id }`, returns `Schedule` with tasks
   - Prisma: `findFirst({ where: { id, tenantId }, include: withTasksSorted })`
   - Throw NOT_FOUND if null

3. **`create`** -- mutation, port of Go `ScheduleService.Create`
   - Trim and validate name (non-empty after trim)
   - Check name uniqueness: `findFirst({ where: { tenantId, name } })`
   - CONFLICT if exists
   - Compute `nextRunAt` via `computeNextRun` if enabled and not manual
   - Create schedule with `prisma.schedule.create()`
   - Create tasks in loop (skip invalid task types silently -- matching Go behavior, though Zod enum validation already handles this)
   - Re-fetch with tasks and return

4. **`update`** -- mutation, port of Go `ScheduleService.Update`
   - Fetch existing (tenant-scoped), NOT_FOUND if missing
   - Build partial update data object
   - If name changed: trim, validate non-empty, check uniqueness
   - If timingType changed: validate against TIMING_TYPES
   - Recompute `nextRunAt` based on current enabled/timing state
   - Set `nextRunAt` to null if disabled or manual
   - Update and re-fetch with tasks

5. **`delete`** -- mutation, port of Go `ScheduleService.Delete`
   - Verify exists (tenant-scoped), NOT_FOUND if missing
   - Hard delete (cascade via FK to tasks, executions)
   - Return `{ success: true }`

**Task Management (4 procedures):**

6. **`tasks`** -- query, port of Go `ScheduleService.ListTasks`
   - Input: `{ scheduleId }`
   - Verify schedule exists in tenant (NOT_FOUND if missing)
   - Prisma: `findMany({ where: { scheduleId }, orderBy: { sortOrder: "asc" } })`
   - Return `{ data: ScheduleTask[] }`

7. **`createTask`** -- mutation, port of Go `ScheduleService.AddTask`
   - Verify schedule exists in tenant
   - Create task with defaults: `isEnabled: true`, `parameters: {}`
   - Return created task

8. **`updateTask`** -- mutation, port of Go `ScheduleService.UpdateTask`
   - Verify schedule exists in tenant
   - Verify task exists AND belongs to schedule (ownership check: `task.scheduleId === scheduleId`)
   - Build partial update data
   - Return updated task

9. **`deleteTask`** -- mutation, port of Go `ScheduleService.RemoveTask`
   - Verify schedule exists in tenant
   - Verify task exists AND belongs to schedule
   - Hard delete, return `{ success: true }`

**Execution (3 procedures):**

10. **`execute`** -- mutation, port of Go `SchedulerExecutor.TriggerExecution`
    - Input: `{ scheduleId }`
    - Fetch schedule with tasks (tenant-scoped)
    - Throw BAD_REQUEST if schedule is disabled (`!isEnabled`)
    - Extract `triggeredBy` from `ctx.user!.id`
    - Create `ScheduleExecution` record (status: "running", triggerType: "manual")
    - Iterate enabled tasks in sort order:
      - Create `ScheduleTaskExecution` record (status: "running")
      - Execute placeholder handler (log execution, record result)
      - Update task execution with status + result
      - Track succeeded/failed counts
    - Determine overall status: all succeeded="completed", all failed="failed", mixed="partial"
    - Update execution record with final status, counts, completedAt
    - Update schedule's `lastRunAt` and recompute `nextRunAt`
    - Re-fetch execution with task executions and return

    **Task execution handlers:** For manual execution, implement lightweight handlers that log the execution. The actual heavy task logic (RecalcService, MonthlyCalcService, etc.) is in the Vercel Cron routes. The manual execute creates proper execution records for audit/history purposes with a placeholder result like `{ action: taskType, status: "executed_manually", executed_at: timestamp }`. This matches the pattern from `macros.ts` `executeAction` which returns placeholder results.

    Alternative (if full execution is desired): Import the task services and call them inline. This is more complex but matches Go behavior exactly. **Decision: Start with placeholder handlers. Can be upgraded later if needed.**

11. **`executions`** -- query, port of Go `ScheduleService.ListExecutions`
    - Input: `{ scheduleId, limit? }` (limit default 20, max 100)
    - Verify schedule exists in tenant
    - Prisma: `findMany({ where: { scheduleId }, orderBy: { createdAt: "desc" }, take: limit, include: withTaskExecutionsSorted })`
    - Return `{ data: ScheduleExecution[] }`

12. **`execution`** -- query, port of Go `ScheduleService.GetExecutionByID`
    - Input: `{ id }` (execution ID)
    - Prisma: `findFirst({ where: { id, tenantId }, include: withTaskExecutionsSorted })`
    - Throw NOT_FOUND if null
    - Return `ScheduleExecution` with task executions

**Task Catalog (1 procedure):**

13. **`taskCatalog`** -- query, returns static catalog data
    - No input needed
    - Calls `getTaskCatalog()` helper
    - Returns `{ data: TaskCatalogEntry[] }`

### 1H: Output Mapping Pattern

All procedures explicitly map Prisma results to output schema fields (matching the pattern from `macros.ts`). Example for Schedule:

```typescript
const mapSchedule = (s: SchedulePrismaResult) => ({
  id: s.id,
  tenantId: s.tenantId,
  name: s.name,
  description: s.description,
  timingType: s.timingType,
  timingConfig: s.timingConfig,
  isEnabled: s.isEnabled,
  lastRunAt: s.lastRunAt,
  nextRunAt: s.nextRunAt,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
  tasks: s.tasks?.map(mapTask),
})
```

Similar mappers for `mapTask`, `mapExecution`, `mapTaskExecution`.

### Verification (Phase 1)
- TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- All 13 procedures defined
- Permission check on every procedure
- Tenant scoping on all queries

---

## Phase 2: Root Router Registration

### 2A: Register schedulesRouter

**File: `apps/web/src/server/root.ts`**

**Changes:**
1. Add import: `import { schedulesRouter } from "./routers/schedules"`
2. Add to `appRouter` object: `schedules: schedulesRouter,` (alphabetically after `reports`)

### Verification (Phase 2)
- TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- `AppRouter` type includes `schedules` namespace

---

## Phase 3: Frontend Hook Migration

### 3A: Migrate use-schedules.ts

**File: `apps/web/src/hooks/api/use-schedules.ts`**

Replace the REST API hooks (`useApiQuery`/`useApiMutation`) with tRPC hooks, following the exact pattern from `use-macros.ts`.

**Key changes:**
- Import `useTRPC` from `@/trpc` instead of `useApiQuery`/`useApiMutation`
- Import `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`
- Each hook uses `trpc.schedules.<procedure>.queryOptions()` or `trpc.schedules.<procedure>.mutationOptions()`
- Mutation hooks invalidate `trpc.schedules.list.queryKey()` on success

**Hook-to-procedure mapping (13 hooks):**

| Old Hook | tRPC Procedure | Type |
|----------|---------------|------|
| `useSchedules(options?)` | `trpc.schedules.list` | query |
| `useSchedule(id, enabled?)` | `trpc.schedules.getById` | query |
| `useCreateSchedule()` | `trpc.schedules.create` | mutation |
| `useUpdateSchedule()` | `trpc.schedules.update` | mutation |
| `useDeleteSchedule()` | `trpc.schedules.delete` | mutation |
| `useScheduleTasks(scheduleId, enabled?)` | `trpc.schedules.tasks` | query |
| `useCreateScheduleTask()` | `trpc.schedules.createTask` | mutation |
| `useUpdateScheduleTask()` | `trpc.schedules.updateTask` | mutation |
| `useDeleteScheduleTask()` | `trpc.schedules.deleteTask` | mutation |
| `useExecuteSchedule()` | `trpc.schedules.execute` | mutation |
| `useScheduleExecutions(scheduleId, enabled?)` | `trpc.schedules.executions` | query |
| `useScheduleExecution(id, enabled?)` | `trpc.schedules.execution` | query |
| `useTaskCatalog(enabled?)` | `trpc.schedules.taskCatalog` | query |

**Cache invalidation strategy (matching macros pattern):**
- Schedule mutations (`create`, `update`, `delete`) invalidate: `trpc.schedules.list.queryKey()`
- Task mutations (`createTask`, `updateTask`, `deleteTask`) invalidate: `trpc.schedules.list.queryKey()` (parent schedule includes tasks)
- Execute mutation invalidates: `trpc.schedules.list.queryKey()`

**Hook signature changes:**

The existing REST hooks accept `path`/`body` objects in their mutation arguments. The tRPC hooks use flat input objects. This requires updating the calling sites.

For example:
- Old: `deleteMutation.mutateAsync({ path: { id: deleteItem.id } })`
- New: `deleteMutation.mutateAsync({ id: deleteItem.id })`

- Old: `updateMutation.mutateAsync({ path: { id: item.id }, body: { is_enabled: enabled } })`
- New: `updateMutation.mutateAsync({ id: item.id, isEnabled: enabled })`

- Old: `createMutation.mutateAsync({ body: payload })`
- New: `createMutation.mutateAsync(payload)`

- Old: `executeMutation.mutateAsync({ path: { id: params.id } })`
- New: `executeMutation.mutateAsync({ scheduleId: params.id })`

### 3B: Keep hooks/api/index.ts exports

**File: `apps/web/src/hooks/api/index.ts`**

The exports remain the same (same hook names). No changes needed to the index file since the hook names are unchanged.

### Verification (Phase 3)
- TypeScript compiles
- Hook signatures verified against consumers

---

## Phase 4: Frontend Consumer Updates

The frontend components currently use REST API patterns (`path`/`body` objects, snake_case fields). After migrating hooks to tRPC, the calling sites need updates for the new API shape.

### 4A: Schedule List Page

**File: `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx`**

**Changes:**
1. Remove `import type { components } from '@/lib/api/types'` and the `Schedule` type alias
2. Use tRPC-inferred types instead (from `RouterOutputs`)
3. Update mutation call sites:
   - `deleteMutation.mutateAsync({ path: { id: deleteItem.id } })` -> `deleteMutation.mutateAsync({ id: deleteItem.id })`
   - `updateMutation.mutateAsync({ path: { id: item.id }, body: { is_enabled: enabled } })` -> `updateMutation.mutateAsync({ id: item.id, isEnabled: enabled })`
4. Update data access: `data?.data` stays the same (output schema wraps in `{ data: [...] }`)
5. Update property access from snake_case to camelCase throughout: `item.name`, `item.description` stay same; but `item.is_enabled` -> `item.isEnabled`, `item.timing_type` -> `item.timingType` etc.

### 4B: Schedule Detail Page

**File: `apps/web/src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx`**

**Changes:**
1. Remove OpenAPI type import
2. Update mutation call sites:
   - `deleteMutation.mutateAsync({ path: { id: params.id } })` -> `deleteMutation.mutateAsync({ id: params.id })`
   - `executeMutation.mutateAsync({ path: { id: params.id } })` -> `executeMutation.mutateAsync({ scheduleId: params.id })`
3. Update property access: `schedule.timing_type` -> `schedule.timingType`, `schedule.timing_config` -> `schedule.timingConfig`, `schedule.is_enabled` -> `schedule.isEnabled`
4. Update `executionsData?.data` access (stays same pattern)

### 4C: Schedule Form Sheet

**File: `apps/web/src/components/schedules/schedule-form-sheet.tsx`**

**Changes:**
1. Remove `import type { components } from '@/lib/api/types'` and the `Schedule`, `TimingType` type aliases
2. Import type from tRPC (or use inline types from the hook return)
3. Update form initialization: `schedule.timing_type` -> `schedule.timingType`, `schedule.timing_config` -> `schedule.timingConfig`, `schedule.is_enabled` -> `schedule.isEnabled`
4. Update payload construction:
   - Old: `{ name, description, timing_type, timing_config, is_enabled }`
   - New: `{ name, description, timingType, timingConfig, isEnabled }`
5. Update mutation calls:
   - `updateMutation.mutateAsync({ path: { id: schedule.id }, body: payload })` -> `updateMutation.mutateAsync({ id: schedule.id, ...payload })`
   - `createMutation.mutateAsync({ body: payload })` -> `createMutation.mutateAsync(payload)`

### 4D: Schedule Task Form Dialog

**File: `apps/web/src/components/schedules/schedule-task-form-dialog.tsx`**

**Changes:**
1. Remove OpenAPI type imports
2. Update mutation calls to use tRPC input shape:
   - `createScheduleTask.mutateAsync({ path: { id: scheduleId }, body: { task_type, sort_order, parameters } })` -> `createScheduleTask.mutateAsync({ scheduleId, taskType, sortOrder, parameters })`
   - `updateScheduleTask.mutateAsync({ path: { id: scheduleId, taskId }, body: { ... } })` -> `updateScheduleTask.mutateAsync({ scheduleId, taskId, ... })`
3. Update property access from snake_case to camelCase

### 4E: Other Schedule Components (read-only data display)

These components receive data via props from parent pages. Their type signatures may need updating if they reference the OpenAPI `components['schemas']['Schedule']` type directly.

Check each file and update:
- `apps/web/src/components/schedules/schedule-data-table.tsx`
- `apps/web/src/components/schedules/schedule-task-list.tsx`
- `apps/web/src/components/schedules/schedule-execution-log.tsx`
- `apps/web/src/components/schedules/schedule-timing-badge.tsx`
- `apps/web/src/components/schedules/schedule-status-badge.tsx`

For each: update prop types from OpenAPI to inline/inferred types, update snake_case property access to camelCase.

### Verification (Phase 4)
- TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- No references to old OpenAPI types for schedules
- All snake_case schedule properties converted to camelCase

---

## Phase 5: Testing Strategy

### 5A: Router Unit Tests (optional but recommended)

**File: `apps/web/src/server/routers/__tests__/schedules.test.ts`**

Follow the testing pattern from existing router tests if any exist. If no router tests exist, these tests can be deferred.

**Test categories:**

1. **Timing computation tests** (pure functions, easy to test):
   - `computeNextRun("seconds", { interval: 30 }, now)` returns `now + 30s`
   - `computeNextRun("daily", { time: "14:00" }, now)` returns next 14:00
   - `computeNextRun("weekly", { day_of_week: 3, time: "09:00" }, now)` returns next Wednesday 09:00
   - `computeNextRun("monthly", { day_of_month: 15, time: "02:00" }, now)` returns next 15th at 02:00
   - `computeNextRun("monthly", { day_of_month: 31 }, now)` caps at 28
   - `computeNextRun("manual", {}, now)` returns null
   - Default time is 02:00 when not specified
   - Default intervals: seconds=60, minutes=5, hours=1

2. **Task catalog tests:**
   - Returns 8 entries (matching DB CHECK constraint)
   - Each entry has taskType, name, description, parameterSchema
   - No `terminal_sync` or `terminal_import`

3. **Integration-style tests (if Prisma mock available):**
   - Create schedule with tasks -> returns schedule with tasks populated
   - Create schedule with duplicate name -> CONFLICT error
   - Update schedule name uniqueness check
   - Delete schedule -> succeeds
   - Add task to non-existent schedule -> NOT_FOUND
   - Update task ownership check (task.scheduleId mismatch)
   - Execute disabled schedule -> BAD_REQUEST
   - List executions with limit

### 5B: Export computeNextRun and getTaskCatalog for Testing

If the helper functions need to be tested in isolation, export them from the router file:

```typescript
// At the bottom of schedules.ts, for testing only:
export { computeNextRun as _computeNextRun } from "./schedules"  // or export directly
export { getTaskCatalog as _getTaskCatalog }
```

Alternatively, extract them to separate utility files if they grow complex. The timing computation is ~60 lines and the catalog is ~80 lines -- small enough to keep in the router file.

### 5C: Manual Verification

1. Start dev server: `make dev` + `cd apps/web && npm run dev`
2. Navigate to `/admin/schedules` -- verify schedule list loads
3. Create a new schedule with tasks via the form sheet
4. View schedule detail page -- verify tasks tab, executions tab
5. Execute schedule manually -- verify execution appears in log
6. Edit schedule -- verify form populates correctly
7. Delete schedule -- verify removed from list

### Verification (Phase 5)
- All tests pass: `cd apps/web && npx vitest run src/server/routers/__tests__/schedules`
- Manual smoke test passes

---

## Implementation Order

Execute phases in strict order due to dependencies:

1. **Phase 1** (1A-1H) -- Create `schedules.ts` tRPC router with all 13 procedures
2. **Phase 2** (2A) -- Register router in `root.ts`
3. **Phase 3** (3A-3B) -- Migrate frontend hooks to tRPC
4. **Phase 4** (4A-4E) -- Update frontend consumer components
5. **Phase 5** (5A-5C) -- Write tests and verify

Phases 1 and 2 can be verified independently (TypeScript compile). Phases 3 and 4 must be done together (hooks and consumers must match). Phase 5 is independent.

## Error Mapping (Go -> tRPC)

| Go Error | tRPC Code | Message |
|----------|-----------|---------|
| `ErrScheduleNotFound` | `NOT_FOUND` | "Schedule not found" |
| `ErrScheduleTaskNotFound` | `NOT_FOUND` | "Schedule task not found" |
| `ErrScheduleExecutionNotFound` | `NOT_FOUND` | "Schedule execution not found" |
| `ErrScheduleNameRequired` | `BAD_REQUEST` | "Schedule name is required" |
| `ErrScheduleNameConflict` | `CONFLICT` | "Schedule name already exists" |
| `ErrScheduleTimingRequired` | `BAD_REQUEST` | "Timing type is required" |
| `ErrScheduleInvalidTiming` | `BAD_REQUEST` | "Invalid timing type" |
| `ErrScheduleInvalidTaskType` | `BAD_REQUEST` | "Invalid task type" |
| `ErrScheduleDisabled` | `BAD_REQUEST` | "Cannot execute disabled schedule" |

## Key Differences from Go Implementation

1. **No separate service/repository/handler layers:** tRPC procedures contain all logic inline (matching `macros.ts` pattern). Prisma replaces the GORM repository layer.
2. **Zod validation replaces Go input validation:** Enum validation for `timingType` and `taskType` handled by `z.enum()` in input schemas (Go validated manually).
3. **Prisma `include` replaces GORM `Preload`:** Tasks and task executions loaded via `include` with `orderBy`.
4. **Explicit output mapping:** Results are mapped to Zod output schemas (same pattern as `macros.ts`).
5. **Manual execute uses placeholder handlers:** Rather than importing all task services, the execute procedure creates execution records with placeholder results. The actual task execution happens via Vercel Cron routes.
6. **camelCase throughout:** TypeScript uses camelCase (`timingType`, `isEnabled`) instead of Go's mixed case or snake_case in JSON.

## Success Criteria

- [ ] `schedules.ts` router has all 13 procedures with correct business logic
- [ ] `root.ts` registers the `schedulesRouter`
- [ ] All procedures use `tenantProcedure` + `requirePermission(SCHEDULES_MANAGE)`
- [ ] All queries are tenant-scoped
- [ ] Name uniqueness enforced on create and update
- [ ] `computeNextRun` correctly handles all 7 timing types
- [ ] Task catalog returns 8 entries (DB CHECK constraint set)
- [ ] Manual execute creates proper execution records
- [ ] Frontend hooks migrated from REST to tRPC (13 hooks)
- [ ] Frontend components updated: snake_case -> camelCase, mutation call shapes
- [ ] TypeScript compiles without errors
- [ ] Existing Vercel Cron routes unaffected (they write to same tables)
