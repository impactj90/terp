# Research: ZMI-TICKET-247 -- Schedules Router (CRUD + Execution Management)

Date: 2026-03-08

## 1. Go Business Logic Analysis

### 1.1 ScheduleService (`apps/api/internal/service/schedule.go`, 533 lines)

**Dependencies:**
- `scheduleRepository` interface (30 methods covering Schedule, Task, Execution, TaskExecution CRUD)
- `repository.ErrScheduleNotFound`, `repository.ErrScheduleTaskNotFound`

**Sentinel errors defined:**
```go
ErrScheduleNotFound          = errors.New("schedule not found")
ErrScheduleTaskNotFound      = errors.New("schedule task not found")
ErrScheduleExecutionNotFound = errors.New("schedule execution not found")
ErrScheduleNameRequired      = errors.New("schedule name is required")
ErrScheduleNameConflict      = errors.New("schedule name already exists for this tenant")
ErrScheduleTimingRequired    = errors.New("timing type is required")
ErrScheduleInvalidTiming     = errors.New("invalid timing type")
ErrScheduleInvalidTaskType   = errors.New("invalid task type")
ErrScheduleDisabled          = errors.New("schedule is disabled")
```

**Valid timing types:**
```go
"seconds", "minutes", "hours", "daily", "weekly", "monthly", "manual"
```

**Valid task types:**
```go
"calculate_days", "calculate_months", "backup_database", "send_notifications",
"export_data", "alive_check", "terminal_sync", "terminal_import",
"execute_macros", "generate_day_plans"
```

Note: DB CHECK constraint (migration 000089) only allows: `calculate_days`, `calculate_months`, `backup_database`, `send_notifications`, `export_data`, `alive_check`, `execute_macros`, `generate_day_plans`. The Go code also references `terminal_sync` and `terminal_import` which are NOT in the DB CHECK constraint.

**Input structs:**
- `CreateScheduleInput` -- tenantID, name, description*, timingType, timingConfig (json), isEnabled*, tasks[]
- `UpdateScheduleInput` -- name*, description*, timingType*, timingConfig (json), isEnabled* (all optional)
- `CreateScheduleTaskInput` -- taskType, sortOrder, parameters (json), isEnabled*
- `UpdateScheduleTaskInput` -- taskType*, sortOrder*, parameters (json), isEnabled* (all optional)

**Service methods:**

1. **Create** (lines 117-197):
   - Trims name, validates non-empty
   - Validates timingType against `validTimingTypes`
   - Checks name uniqueness within tenant (`repo.GetByName`)
   - Default isEnabled = true
   - Default timingConfig = `{}`
   - Computes nextRunAt if enabled AND not manual
   - Creates schedule, then creates tasks (skips invalid task types silently)
   - Re-fetches schedule with tasks via `GetByTenantAndID`

2. **GetByID** (lines 200-209):
   - Delegates to `repo.GetByTenantAndID(tenantID, id)`
   - Maps `repository.ErrScheduleNotFound` to `ErrScheduleNotFound`

3. **List** (lines 212-214):
   - Delegates directly to `repo.List(tenantID)`

4. **Update** (lines 217-273):
   - Fetches existing schedule (tenant-scoped)
   - Validates name uniqueness if changed
   - Partial update: only sets fields that are non-nil
   - Recomputes nextRunAt based on new timing
   - Sets nextRunAt to nil if disabled or manual

5. **Delete** (lines 276-285):
   - Verifies schedule exists in tenant, then hard deletes

6. **ListTasks** (lines 290-299):
   - Verifies schedule exists in tenant, then delegates to `repo.ListTasks`

7. **AddTask** (lines 302-336):
   - Validates schedule exists in tenant
   - Validates taskType against `validTaskTypes`
   - Default isEnabled = true, parameters = `{}`

8. **UpdateTask** (lines 339-380):
   - Validates schedule AND task exist
   - Verifies task.ScheduleID == scheduleID (ownership)
   - Partial update

9. **RemoveTask** (lines 383-404):
   - Validates schedule AND task exist, verifies ownership, then hard deletes

10. **ListExecutions** (lines 409-417):
    - Validates schedule exists, delegates to `repo.ListExecutions(scheduleID, limit)`

11. **GetExecutionByID** (lines 420-429):
    - Delegates to `repo.GetExecutionByID(id)`

**Timing computation** (lines 434-533):
- `computeNextRun(timingType, timingConfig, now)` -- computes next run time
- timingConfig JSON structure: `{ interval, time, day_of_week, day_of_month }`
- Default time: "02:00"
- Seconds/Minutes/Hours: simple interval addition
- Daily: next occurrence at specified time
- Weekly: next occurrence of specified weekday + time
- Monthly: specified day (capped at 28) + time, rolls to next month if past
- Manual: returns nil

### 1.2 SchedulerExecutor (`apps/api/internal/service/scheduler_executor.go`, 210 lines)

**Interface:**
```go
type TaskExecutor interface {
    Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error)
}
```

**Key methods:**
- `TriggerExecution(ctx, tenantID, scheduleID, triggeredBy)` -- manual execution trigger
  - Fetches schedule with `GetByTenantAndID`
  - Calls `executeSchedule` with `TriggerTypeManual`
- `executeSchedule(ctx, schedule, triggerType, triggeredBy)`:
  - Creates ScheduleExecution record (status: "running")
  - Iterates tasks in order, executes each via registered handler
  - Tracks succeeded/failed counts
  - Determines overall status: completed (0 failed), failed (0 succeeded), partial (mixed)
  - Updates execution record
  - Updates schedule's `last_run_at` and `next_run_at`
  - Re-fetches execution with task executions
- `executeTask(ctx, executionID, tenantID, task)`:
  - Creates ScheduleTaskExecution record
  - Looks up handler by taskType
  - Executes handler, records result/error
  - Updates task execution record
- `RunDueSchedules(ctx)` -- used by scheduler engine, not needed for router

### 1.3 SchedulerCatalog (`apps/api/internal/service/scheduler_catalog.go`, 143 lines)

**Function:** `GetTaskCatalog() []TaskCatalogItem` (static function, no dependencies)

**TaskCatalogItem struct:**
```go
type TaskCatalogItem struct {
    TaskType        model.TaskType         `json:"task_type"`
    Name            string                 `json:"name"`
    Description     string                 `json:"description"`
    ParameterSchema map[string]interface{} `json:"parameter_schema"`
}
```

**Catalog entries (10 items):**
1. `calculate_days` -- "Calculate Days" -- date_range param (enum: yesterday/today/last_7_days/current_month)
2. `calculate_months` -- "Calculate Months" -- year/month params
3. `backup_database` -- "Backup Database" -- no params (placeholder)
4. `send_notifications` -- "Send Notifications" -- no params
5. `export_data` -- "Export Data" -- export_interface_id param
6. `alive_check` -- "Alive Check" -- no params
7. `terminal_sync` -- "Terminal Sync" -- no params (placeholder)
8. `terminal_import` -- "Terminal Import" -- no params
9. `execute_macros` -- "Execute Macros" -- date param
10. `generate_day_plans` -- "Generate Day Plans" -- days_ahead param

### 1.4 SchedulerEngine (`apps/api/internal/service/scheduler_engine.go`, 101 lines)

Background worker that periodically calls `RunDueSchedules`. **Out of scope** for this ticket -- replaced by Vercel Cron (TICKET-245, 246).

### 1.5 SchedulerTasks (`apps/api/internal/service/scheduler_tasks.go`, 356 lines)

Individual task handlers implementing `TaskExecutor` interface. **Out of scope** for this ticket -- already ported to Vercel Cron routes.

---

## 2. Go Handler Analysis (`apps/api/internal/handler/schedule.go`, 630 lines)

### 2.1 Route Registration (`routes.go` lines 1141-1196)

All routes use single permission: `schedules.manage`

```
GET  /schedules                         -> List
POST /schedules                         -> Create
GET  /schedules/{id}                    -> Get
PATCH /schedules/{id}                   -> Update
DELETE /schedules/{id}                  -> Delete
GET  /schedules/{id}/tasks              -> ListTasks
POST /schedules/{id}/tasks              -> AddTask
PATCH /schedules/{id}/tasks/{taskId}    -> UpdateTask
DELETE /schedules/{id}/tasks/{taskId}   -> RemoveTask
POST /schedules/{id}/execute            -> TriggerExecution
GET  /schedules/{id}/executions         -> ListExecutions
GET  /schedule-executions/{id}          -> GetExecution
GET  /scheduler/task-catalog            -> GetTaskCatalog
```

### 2.2 Handler Endpoints

- **List** -- returns `ScheduleList { data: Schedule[] }` with tasks preloaded
- **Get** -- returns single `Schedule` with tasks
- **Create** -- parses `CreateScheduleRequest` from OpenAPI models, maps to service input
  - Uses generated `models.CreateScheduleRequest` (from OpenAPI spec)
  - Tasks are optional array in create request
- **Update** -- parses `UpdateScheduleRequest`, partial update
- **Delete** -- returns 204 No Content
- **ListTasks** -- returns `{ data: ScheduleTask[] }`
- **AddTask** -- parses `CreateScheduleTaskRequest`
- **UpdateTask** -- parses `UpdateScheduleTaskRequest`
- **RemoveTask** -- returns 204 No Content
- **TriggerExecution** -- calls `executor.TriggerExecution`, returns `ScheduleExecution`
  - Extracts triggeredBy from `auth.UserFromContext`
- **ListExecutions** -- accepts `?limit=N` query param (default 20), returns `ScheduleExecutionList`
- **GetExecution** -- returns `ScheduleExecution` with `TaskExecutions` preloaded
- **GetTaskCatalog** -- returns `TaskCatalog { data: TaskCatalogEntry[] }`

### 2.3 Response Mapping (lines 424-605)

Handler maps Go model structs to OpenAPI-generated response models. Key mappings:
- `Schedule` -> includes tasks array, timing_config as object, nullable last_run_at/next_run_at
- `ScheduleTask` -> parameters as generic interface
- `ScheduleExecution` -> includes task_executions array, nullable triggered_by/started_at/completed_at
- `ScheduleTaskExecution` -> result as generic interface

### 2.4 Error Mapping (lines 607-630)

```
ErrScheduleNotFound          -> 404
ErrScheduleTaskNotFound      -> 404
ErrScheduleExecutionNotFound -> 404
ErrScheduleNameRequired      -> 400
ErrScheduleNameConflict      -> 409
ErrScheduleTimingRequired    -> 400
ErrScheduleInvalidTiming     -> 400
ErrScheduleInvalidTaskType   -> 400
ErrScheduleDisabled          -> 400
Default                      -> 500
```

---

## 3. Go Repository Analysis (`apps/api/internal/repository/schedule.go`, 284 lines)

All methods use GORM. Key patterns:
- `Preload("Tasks", func(db *gorm.DB) { return db.Order("sort_order ASC") })` -- always load tasks sorted
- `GetByTenantAndID` -- scopes by tenant_id AND id
- `GetByName` -- scopes by tenant_id AND name
- `List` -- scoped by tenant_id, ordered by name ASC, tasks preloaded
- `ListEnabled` -- adds `is_enabled = true` filter for both schedule and tasks
- `ListDueSchedules` -- `is_enabled = true AND (next_run_at IS NULL OR next_run_at <= now) AND timing_type != 'manual'`
- `Delete` -- hard delete (cascade via FK to tasks)
- `ListExecutions` -- ordered by created_at DESC, tasks preloaded
- `GetExecutionByID` -- preloads TaskExecutions and Schedule

Prisma equivalent queries will use `include` and `orderBy` instead of GORM preloads.

---

## 4. Go Model Analysis (`apps/api/internal/model/schedule.go`, 145 lines)

### 4.1 Type Definitions

```go
// TaskType: calculate_days, calculate_months, backup_database, send_notifications,
//           export_data, alive_check, terminal_sync, terminal_import,
//           execute_macros, generate_day_plans

// TimingType: seconds, minutes, hours, daily, weekly, monthly, manual

// ExecutionStatus: pending, running, completed, failed, partial

// TaskExecutionStatus: pending, running, completed, failed, skipped

// TriggerType: scheduled, manual
```

### 4.2 Structs

- `Schedule` -- id, tenantID, name, description*, timingType, timingConfig (JSON), isEnabled, lastRunAt*, nextRunAt*, createdAt, updatedAt; has-many Tasks
- `ScheduleTask` -- id, scheduleID, taskType, sortOrder, parameters (JSON), isEnabled, createdAt, updatedAt
- `ScheduleExecution` -- id, tenantID, scheduleID, status, triggerType, triggeredBy*, startedAt*, completedAt*, errorMessage*, tasksTotal, tasksSucceeded, tasksFailed, createdAt; has-many TaskExecutions
- `ScheduleTaskExecution` -- id, executionID, taskType, sortOrder, status, startedAt*, completedAt*, errorMessage*, result (JSON), createdAt

---

## 5. Prisma Schema (from ZMI-TICKET-244)

Located at `/home/tolga/projects/terp/apps/web/prisma/schema.prisma` (lines 2993-3119).

### 5.1 Schedule (table: `schedules`)

```prisma
model Schedule {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  name         String    @db.VarChar(255)
  description  String?   @db.Text
  timingType   String    @map("timing_type") @db.VarChar(20)
  timingConfig Json      @default("{}") @map("timing_config") @db.JsonB
  isEnabled    Boolean   @default(true) @map("is_enabled")
  lastRunAt    DateTime? @map("last_run_at") @db.Timestamptz(6)
  nextRunAt    DateTime? @map("next_run_at") @db.Timestamptz(6)
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  tenant       Tenant    @relation(...)
  tasks        ScheduleTask[]
  executions   ScheduleExecution[]
  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([tenantId, isEnabled])
  @@map("schedules")
}
```

### 5.2 ScheduleTask (table: `schedule_tasks`)

```prisma
model ScheduleTask {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scheduleId String   @map("schedule_id") @db.Uuid
  taskType   String   @map("task_type") @db.VarChar(50)
  sortOrder  Int      @default(0) @map("sort_order")
  parameters Json     @default("{}") @db.JsonB
  isEnabled  Boolean  @default(true) @map("is_enabled")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  schedule   Schedule @relation(...)
  @@index([scheduleId])
  @@index([scheduleId, sortOrder])
  @@map("schedule_tasks")
}
```

### 5.3 ScheduleExecution (table: `schedule_executions`)

```prisma
model ScheduleExecution {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String    @map("tenant_id") @db.Uuid
  scheduleId     String    @map("schedule_id") @db.Uuid
  status         String    @default("pending") @db.VarChar(20)
  triggerType    String    @default("scheduled") @map("trigger_type") @db.VarChar(20)
  triggeredBy    String?   @map("triggered_by") @db.Uuid
  startedAt      DateTime? @map("started_at") @db.Timestamptz(6)
  completedAt    DateTime? @map("completed_at") @db.Timestamptz(6)
  errorMessage   String?   @map("error_message") @db.Text
  tasksTotal     Int       @default(0) @map("tasks_total")
  tasksSucceeded Int       @default(0) @map("tasks_succeeded")
  tasksFailed    Int       @default(0) @map("tasks_failed")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  tenant         Tenant    @relation(...)
  schedule       Schedule  @relation(...)
  triggeredByUser User?    @relation(...)
  taskExecutions ScheduleTaskExecution[]
  @@index([tenantId])
  @@index([scheduleId])
  @@index([status])
  @@index([createdAt(sort: Desc)])
  @@map("schedule_executions")
}
```

### 5.4 ScheduleTaskExecution (table: `schedule_task_executions`)

```prisma
model ScheduleTaskExecution {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  executionId  String    @map("execution_id") @db.Uuid
  taskType     String    @map("task_type") @db.VarChar(50)
  sortOrder    Int       @default(0) @map("sort_order")
  status       String    @default("pending") @db.VarChar(20)
  startedAt    DateTime? @map("started_at") @db.Timestamptz(6)
  completedAt  DateTime? @map("completed_at") @db.Timestamptz(6)
  errorMessage String?   @map("error_message") @db.Text
  result       Json      @default("{}") @db.JsonB
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  execution    ScheduleExecution @relation(...)
  @@index([executionId])
  @@index([executionId, sortOrder])
  @@map("schedule_task_executions")
}
```

**Important notes:**
- `@@unique([tenantId, name])` on Schedule enables Prisma's `where: { tenantId_name: { tenantId, name } }` compound unique
- ScheduleTask has no tenantId -- tenant scoping is via parent Schedule
- ScheduleExecution has no `updatedAt` (append-only table)
- ScheduleTaskExecution has no FK to ScheduleTask -- denormalized copies of taskType/sortOrder

---

## 6. Existing tRPC Router Patterns

### 6.1 Router Structure Pattern (from `macros.ts`, `employeeDayPlans.ts`)

**File:** `apps/web/src/server/routers/{name}.ts`

Standard structure:
```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// 1. Permission constants
const PERM = permissionIdByKey("xxx.manage")!

// 2. Enum constants
const TIMING_TYPES = [...] as const

// 3. Output schemas (Zod)
const outputSchema = z.object({...})

// 4. Input schemas (Zod)
const createInputSchema = z.object({...})

// 5. Prisma include objects
const withTasks = { tasks: { orderBy: { sortOrder: "asc" as const } } } as const

// 6. Router definition
export const schedulesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.void().optional())
    .output(z.object({ data: z.array(outputSchema) }))
    .query(async ({ ctx }) => { ... }),
  // ...
})
```

### 6.2 Procedure Chain Pattern

```
tenantProcedure                         -- requires auth + tenant ID
  .use(requirePermission(PERM_ID))      -- requires permission
  .input(zodSchema)                     -- validates input
  .output(zodSchema)                    -- validates output
  .query/mutation(async ({ ctx, input }) => { ... })
```

### 6.3 Tenant Scoping Pattern

- `ctx.tenantId!` -- always available after `tenantProcedure`
- All Prisma queries include `where: { tenantId }`
- For child entities (like ScheduleTask), verify parent exists in tenant first

### 6.4 Error Pattern

```typescript
throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" })
throw new TRPCError({ code: "BAD_REQUEST", message: "..." })
throw new TRPCError({ code: "CONFLICT", message: "Name already exists" })
```

### 6.5 Delete Pattern

Returns `{ success: boolean }` for mutations.

### 6.6 Output Mapping Pattern

tRPC routers in this codebase explicitly map Prisma results to output schema fields rather than returning raw Prisma objects.

### 6.7 Root Router Registration (`apps/web/src/server/root.ts`)

New router must be:
1. Imported: `import { schedulesRouter } from "./routers/schedules"`
2. Registered: `schedules: schedulesRouter,` in `appRouter`

---

## 7. Authorization Middleware Analysis

### 7.1 Permission Catalog

Located at: `apps/web/src/server/lib/permission-catalog.ts`

The schedule-related permission:
```
"schedules.manage" -- "schedules" resource, "manage" action
```

**Observation:** The ticket mentions `schedules.read`, `schedules.write`, `schedules.execute` permissions, but the permission catalog only has `schedules.manage`. The Go codebase uses a single `schedules.manage` permission for ALL operations (read, write, execute).

Current Go behavior:
- All schedule routes use the same `schedules.manage` permission
- No separate read/write/execute permissions exist

### 7.2 requirePermission Middleware

Located at: `apps/web/src/server/middleware/authorization.ts`

```typescript
export function requirePermission(...permissionIds: string[]) {
  return createMiddleware(async ({ ctx, next }) => {
    // Checks hasAnyPermission(user, permissionIds)
    // Throws FORBIDDEN if none matched
  })
}
```

Usage: `.use(requirePermission(PERM_ID))`

---

## 8. Existing Frontend Hooks (`apps/web/src/hooks/api/use-schedules.ts`)

Current hooks use `useApiQuery` / `useApiMutation` which call the Go REST API.

### 8.1 Exported Hooks (13 total)

```typescript
// Schedule CRUD
useSchedules(options?)           -- GET /schedules
useSchedule(id, enabled?)       -- GET /schedules/{id}
useCreateSchedule()             -- POST /schedules
useUpdateSchedule()             -- PATCH /schedules/{id}
useDeleteSchedule()             -- DELETE /schedules/{id}

// Schedule Tasks
useScheduleTasks(scheduleId, enabled?)     -- GET /schedules/{id}/tasks
useCreateScheduleTask()                    -- POST /schedules/{id}/tasks
useUpdateScheduleTask()                    -- PATCH /schedules/{id}/tasks/{taskId}
useDeleteScheduleTask()                    -- DELETE /schedules/{id}/tasks/{taskId}

// Execution
useExecuteSchedule()                      -- POST /schedules/{id}/execute
useScheduleExecutions(scheduleId, enabled?) -- GET /schedules/{id}/executions
useScheduleExecution(id, enabled?)         -- GET /schedule-executions/{id}

// Task Catalog
useTaskCatalog(enabled?)                  -- GET /scheduler/task-catalog
```

### 8.2 Cache Invalidation Keys

- Schedule mutations invalidate: `['/schedules']`
- Task mutations invalidate: `['/schedules'], ['/schedules/{id}/tasks']`
- Execute invalidates: `['/schedules']`

### 8.3 Frontend Consumers

Components using these hooks (found via grep):
- `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx` -- uses `useSchedules`, `useDeleteSchedule`, `useUpdateSchedule`
- `apps/web/src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx` -- uses `useSchedule`, `useDeleteSchedule`, `useExecuteSchedule`, `useScheduleExecutions`
- `apps/web/src/components/schedules/schedule-task-form-dialog.tsx` -- uses `useCreateScheduleTask`, `useUpdateScheduleTask`, `useTaskCatalog`

### 8.4 Hook Export Location

Exported from `apps/web/src/hooks/api/index.ts` (lines 503-518).

---

## 9. Existing Cron Job Implementations (ZMI-TICKET-245, 246)

### 9.1 CronExecutionLogger (`apps/web/src/server/services/cron-execution-logger.ts`)

Shared service used by all cron routes. Key methods:
- `ensureSchedule(tenantId, name, taskType, options?)` -- upserts Schedule + ScheduleTask
- `startExecution(tenantId, scheduleId, triggerType, taskType)` -- creates ScheduleExecution + ScheduleTaskExecution records
- `completeExecution(executionId, taskExecutionId, scheduleId, result)` -- updates all three records in a transaction

**This service writes to the same Schedule/ScheduleExecution tables that the new router will read/manage.** The cron jobs create schedule records named `calculate_days_cron`, `calculate_months_cron`, `generate_day_plans_cron`, `execute_macros_cron` via upsert.

### 9.2 Vercel Cron Routes (4 routes)

All in `apps/web/src/app/api/cron/`:
1. `/api/cron/calculate-days/route.ts` (ZMI-TICKET-245) -- daily at 02:00 UTC
2. `/api/cron/calculate-months/route.ts` (ZMI-TICKET-246) -- monthly on 2nd at 03:00 UTC
3. `/api/cron/generate-day-plans/route.ts` (ZMI-TICKET-246) -- weekly Sunday at 01:00 UTC
4. `/api/cron/execute-macros/route.ts` (ZMI-TICKET-246) -- every 15 minutes

All follow the same pattern:
1. Validate CRON_SECRET from Authorization header
2. Parse query params
3. Iterate all active tenants
4. For each tenant: ensureSchedule, startExecution, run task, completeExecution
5. Return JSON summary

**Cron config:** `apps/web/vercel.json`

### 9.3 Interaction with Schedules Router

The cron jobs create schedule records that the frontend may display. The schedules router's `execute` mutation is for MANUAL execution only -- it does NOT replace the cron jobs.

The `execute` procedure needs to:
1. Fetch the schedule with tasks
2. Create ScheduleExecution (trigger_type: "manual")
3. For each enabled task: create ScheduleTaskExecution, but since actual task execution is handled by cron jobs, the manual execute could either:
   a. Run the actual task logic inline (like Go executor does)
   b. Log a placeholder execution (simpler approach)

Looking at the Go `SchedulerExecutor.TriggerExecution` -- it actually RUNS the tasks via registered handlers. This means the tRPC router's `execute` mutation needs equivalent execution capability.

However, the cron routes already have the execution logic. The manual execute path would need to import and call the same services (RecalcService, MonthlyCalcService, EmployeeDayPlanGenerator, MacroExecutor) that cron routes use.

**Decision point:** The manual execution could be a simplified version that creates execution records without actually running tasks, or it could fully execute tasks. The Go implementation fully executes tasks. The existing CronExecutionLogger already provides the execution record creation pattern.

---

## 10. DB Migration Analysis

### 10.1 Task Type CHECK Constraint

Migration `000089_add_schedule_task_types.up.sql`:
```sql
ALTER TABLE schedule_tasks ADD CONSTRAINT schedule_tasks_task_type_check
    CHECK (task_type IN (
        'calculate_days', 'calculate_months',
        'backup_database', 'send_notifications',
        'export_data', 'alive_check',
        'execute_macros', 'generate_day_plans'
    ));
```

Note: `terminal_sync` and `terminal_import` are NOT in the CHECK constraint but ARE in the Go validTaskTypes map. The tRPC router should use the DB-valid set only.

---

## 11. Procedure-to-Go Method Mapping

| tRPC Procedure | Go Method | Notes |
|---|---|---|
| `schedules.list` | `ScheduleService.List` | query, returns Schedule[] with tasks |
| `schedules.getById` | `ScheduleService.GetByID` | query, single Schedule with tasks |
| `schedules.create` | `ScheduleService.Create` | mutation, creates schedule + optional tasks |
| `schedules.update` | `ScheduleService.Update` | mutation, partial update |
| `schedules.delete` | `ScheduleService.Delete` | mutation, hard delete |
| `schedules.tasks` | `ScheduleService.ListTasks` | query, tasks for a schedule |
| `schedules.createTask` | `ScheduleService.AddTask` | mutation, add task to schedule |
| `schedules.updateTask` | `ScheduleService.UpdateTask` | mutation, partial update |
| `schedules.deleteTask` | `ScheduleService.RemoveTask` | mutation, hard delete |
| `schedules.execute` | `SchedulerExecutor.TriggerExecution` | mutation, manual execution |
| `schedules.executions` | `ScheduleService.ListExecutions` | query, execution history |
| `schedules.execution` | `ScheduleService.GetExecutionByID` | query, single execution with task executions |
| `schedules.taskCatalog` | `GetTaskCatalog()` | query, static catalog |

---

## 12. Key Files Summary

### Go files being replaced:
- `/home/tolga/projects/terp/apps/api/internal/service/schedule.go` (533 lines) -- service layer
- `/home/tolga/projects/terp/apps/api/internal/handler/schedule.go` (630 lines) -- HTTP handlers
- `/home/tolga/projects/terp/apps/api/internal/repository/schedule.go` (284 lines) -- data access
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_catalog.go` (143 lines) -- task catalog

### Go files NOT being replaced (out of scope):
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_executor.go` (210 lines) -- replaced by cron routes
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_engine.go` (101 lines) -- replaced by Vercel Cron
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_tasks.go` (356 lines) -- replaced by cron routes
- `/home/tolga/projects/terp/apps/api/internal/model/schedule.go` (145 lines) -- replaced by Prisma schema

### New/Modified TypeScript files:
- `apps/web/src/server/routers/schedules.ts` -- **NEW** tRPC router
- `apps/web/src/server/root.ts` -- **MODIFY** to register schedulesRouter
- `apps/web/src/hooks/api/use-schedules.ts` -- **MODIFY** to use tRPC instead of REST

### Existing TypeScript files (dependencies, read-only):
- `apps/web/prisma/schema.prisma` -- Schedule models (ZMI-TICKET-244)
- `apps/web/src/server/trpc.ts` -- tenantProcedure, createTRPCRouter
- `apps/web/src/server/middleware/authorization.ts` -- requirePermission
- `apps/web/src/server/lib/permission-catalog.ts` -- "schedules.manage" permission
- `apps/web/src/server/services/cron-execution-logger.ts` -- CronExecutionLogger (used by cron routes)

### Frontend consumers (reference, may need hook API updates):
- `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx`
- `apps/web/src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx`
- `apps/web/src/components/schedules/schedule-task-form-dialog.tsx`
- `apps/web/src/components/schedules/schedule-data-table.tsx`
- `apps/web/src/components/schedules/schedule-task-list.tsx`
- `apps/web/src/components/schedules/schedule-execution-log.tsx`
- `apps/web/src/components/schedules/schedule-form-sheet.tsx`
- `apps/web/src/components/schedules/schedule-timing-badge.tsx`
- `apps/web/src/components/schedules/schedule-status-badge.tsx`

---

## 13. Design Decisions to Resolve

1. **Permission granularity:** Ticket mentions `schedules.read`, `schedules.write`, `schedules.execute`. Catalog only has `schedules.manage`. Go uses single `schedules.manage` for everything. Recommendation: Use single `schedules.manage` to match Go behavior and existing permission catalog.

2. **Manual execution scope:** The `execute` mutation needs to either:
   a. Actually run task logic (matching Go behavior) -- requires importing all task services
   b. Only create execution records (log-only) -- simpler but different from Go
   The Go implementation actually runs tasks. Since cron routes already have task execution infrastructure, the manual execute could leverage CronExecutionLogger for record creation and call task-specific services inline.

3. **Task type validation:** Use the DB CHECK constraint set (8 types) rather than the Go validTaskTypes set (10 types with terminal_sync/terminal_import).

4. **Timing computation for nextRunAt:** The Go service computes nextRunAt on create/update. Since Vercel Cron handles actual scheduling, nextRunAt is informational only. The tRPC router should still compute it to match Go behavior and provide accurate UI display.
