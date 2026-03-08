# Research: ZMI-TICKET-244 -- Prisma Schema: schedules, executions

**Date**: 2026-03-08
**Branch**: staging
**Repository**: terp

## Research Question

Document the current state of the schedules, schedule_tasks, schedule_executions, and schedule_task_executions tables across Go models, SQL migrations, existing Prisma schema, and frontend usage -- as context for adding the Schedule, ScheduleTask, ScheduleExecution, and ScheduleTaskExecution models to the Prisma schema in ZMI-TICKET-244.

## Summary

The Prisma schema at `apps/web/prisma/schema.prisma` (2975 lines) contains **NO** schedule-related models. All four tables exist in the database (migrations 000062-000065) and are fully implemented in the Go backend (model, repository, service, handler). The frontend currently accesses schedule data through the Go API via `openapi-fetch` HTTP hooks (`use-schedules.ts`), not through Prisma. There is no tRPC router for schedules yet (planned in ZMI-TICKET-247, which depends on this ticket).

**Key finding -- ticket schema vs. actual DB**:
- The ticket proposes `cron_expr String?` -- the actual DB column is `timing_type VARCHAR(20)` with a `timing_config JSONB` field. No `cron_expr` column exists.
- The ticket proposes `is_active Boolean` -- the actual DB column is `is_enabled BOOLEAN`.
- The ticket proposes `deleted_at DateTime?` -- no such column exists in the DB.
- The ticket proposes `config Json?` on ScheduleTask -- the actual DB column is `parameters JSONB`.
- The ticket proposes `is_active Boolean` on ScheduleTask -- the actual DB column is `is_enabled BOOLEAN`.
- The ticket omits several ScheduleExecution fields: `tenant_id`, `trigger_type`, `triggered_by`, `tasks_total`, `tasks_succeeded`, `tasks_failed`.
- The ticket proposes `error String?` -- the actual DB column is `error_message TEXT`.
- The ticket proposes `result Json?` on ScheduleExecution -- no such column exists in the DB.
- The ticket proposes `task_id` on ScheduleTaskExecution referencing ScheduleTask -- no such FK exists in the DB. The DB has `task_type VARCHAR(50)` and `sort_order INT` instead.
- The ticket proposes `affected_rows Int?` on ScheduleTaskExecution -- no such column exists in the DB.
- The ticket omits `sort_order` and `task_type` from ScheduleTaskExecution.

## Detailed Findings

### 1. Existing Prisma Models

**No schedule-related models exist in the Prisma schema.** The schema ends with `AbsenceDay` (line 2930-2975). The `Tenant` model (line 83-172) has no schedule-related reverse relations. The `User` model (line 28-71) has no schedule-related reverse relations.

### 2. Database Migrations

#### Table: `schedules` (migration 000062)

**File**: `db/migrations/000062_create_schedules.up.sql`

**Complete column list** (10 columns):
- `id` UUID PK DEFAULT gen_random_uuid()
- `tenant_id` UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
- `name` VARCHAR(255) NOT NULL
- `description` TEXT (nullable)
- `timing_type` VARCHAR(20) NOT NULL, CHECK (timing_type IN ('seconds', 'minutes', 'hours', 'daily', 'weekly', 'monthly', 'manual'))
- `timing_config` JSONB DEFAULT '{}'
- `is_enabled` BOOLEAN DEFAULT true
- `last_run_at` TIMESTAMPTZ (nullable)
- `next_run_at` TIMESTAMPTZ (nullable)
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()

**Unique constraint**: UNIQUE(tenant_id, name)

**Indexes**:
- `idx_schedules_tenant` ON (tenant_id)
- `idx_schedules_enabled` ON (tenant_id, is_enabled)
- `idx_schedules_next_run` ON (next_run_at) WHERE is_enabled = true (partial index, cannot be modeled in Prisma)

**Trigger**: `update_schedules_updated_at` BEFORE UPDATE (auto-sets updated_at)

#### Table: `schedule_tasks` (migration 000063)

**File**: `db/migrations/000063_create_schedule_tasks.up.sql`

**Complete column list** (7 columns):
- `id` UUID PK DEFAULT gen_random_uuid()
- `schedule_id` UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE
- `task_type` VARCHAR(50) NOT NULL, CHECK (task_type IN ('calculate_days', 'calculate_months', 'backup_database', 'send_notifications', 'export_data', 'alive_check'))
- `sort_order` INT NOT NULL DEFAULT 0
- `parameters` JSONB DEFAULT '{}'
- `is_enabled` BOOLEAN DEFAULT true
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()

**Note**: No `tenant_id` column. Tenant scoping is through the parent `schedules` table.

**Indexes**:
- `idx_schedule_tasks_schedule` ON (schedule_id)
- `idx_schedule_tasks_order` ON (schedule_id, sort_order)

**Trigger**: `update_schedule_tasks_updated_at` BEFORE UPDATE

#### Table: `schedule_executions` (migration 000064)

**File**: `db/migrations/000064_create_schedule_executions.up.sql`

**Complete column list** (11 columns):
- `id` UUID PK DEFAULT gen_random_uuid()
- `tenant_id` UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
- `schedule_id` UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE
- `status` VARCHAR(20) NOT NULL DEFAULT 'pending', CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial'))
- `trigger_type` VARCHAR(20) NOT NULL DEFAULT 'scheduled', CHECK (trigger_type IN ('scheduled', 'manual'))
- `triggered_by` UUID REFERENCES users(id) ON DELETE SET NULL (nullable)
- `started_at` TIMESTAMPTZ (nullable)
- `completed_at` TIMESTAMPTZ (nullable)
- `error_message` TEXT (nullable)
- `tasks_total` INT DEFAULT 0
- `tasks_succeeded` INT DEFAULT 0
- `tasks_failed` INT DEFAULT 0
- `created_at` TIMESTAMPTZ DEFAULT NOW()

**Note**: No `updated_at` column. This is an append-only execution log.

**FK on `triggered_by`**: REFERENCES users(id) ON DELETE SET NULL

**Indexes**:
- `idx_schedule_executions_tenant` ON (tenant_id)
- `idx_schedule_executions_schedule` ON (schedule_id)
- `idx_schedule_executions_status` ON (status)
- `idx_schedule_executions_created` ON (created_at DESC)

#### Table: `schedule_task_executions` (migration 000065)

**File**: `db/migrations/000065_create_schedule_task_executions.up.sql`

**Complete column list** (8 columns):
- `id` UUID PK DEFAULT gen_random_uuid()
- `execution_id` UUID NOT NULL REFERENCES schedule_executions(id) ON DELETE CASCADE
- `task_type` VARCHAR(50) NOT NULL
- `sort_order` INT NOT NULL DEFAULT 0
- `status` VARCHAR(20) NOT NULL DEFAULT 'pending', CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'))
- `started_at` TIMESTAMPTZ (nullable)
- `completed_at` TIMESTAMPTZ (nullable)
- `error_message` TEXT (nullable)
- `result` JSONB DEFAULT '{}'
- `created_at` TIMESTAMPTZ DEFAULT NOW()

**Note**: No `tenant_id` column. No `updated_at` column. No FK to `schedule_tasks` -- the `task_type` and `sort_order` are denormalized copies. This is an append-only execution log.

**Indexes**:
- `idx_ste_execution` ON (execution_id)
- `idx_ste_order` ON (execution_id, sort_order)

### 3. Go Models

**File**: `apps/api/internal/model/schedule.go` (144 lines)

#### Enum Types

```go
// TaskType: "calculate_days", "calculate_months", "backup_database",
//           "send_notifications", "export_data", "alive_check",
//           "terminal_sync", "terminal_import", "execute_macros", "generate_day_plans"
// Note: The last 4 types are NOT in the DB CHECK constraint (migration 000063)

// TimingType: "seconds", "minutes", "hours", "daily", "weekly", "monthly", "manual"

// ExecutionStatus: "pending", "running", "completed", "failed", "partial"

// TaskExecutionStatus: "pending", "running", "completed", "failed", "skipped"

// TriggerType: "scheduled", "manual"
```

#### Schedule struct

```go
type Schedule struct {
    ID           uuid.UUID      // PK
    TenantID     uuid.UUID      // FK tenants, NOT NULL
    Name         string         // VARCHAR(255) NOT NULL
    Description  *string        // TEXT, nullable
    TimingType   TimingType     // VARCHAR(20) NOT NULL
    TimingConfig datatypes.JSON // JSONB DEFAULT '{}'
    IsEnabled    bool           // DEFAULT true
    LastRunAt    *time.Time     // TIMESTAMPTZ, nullable
    NextRunAt    *time.Time     // TIMESTAMPTZ, nullable
    CreatedAt    time.Time
    UpdatedAt    time.Time
    Tasks        []ScheduleTask // HasMany via ScheduleID
}
// TableName: "schedules"
```

#### ScheduleTask struct

```go
type ScheduleTask struct {
    ID         uuid.UUID      // PK
    ScheduleID uuid.UUID      // FK schedules, NOT NULL
    TaskType   TaskType       // VARCHAR(50) NOT NULL
    SortOrder  int            // INT NOT NULL DEFAULT 0
    Parameters datatypes.JSON // JSONB DEFAULT '{}'
    IsEnabled  bool           // DEFAULT true
    CreatedAt  time.Time
    UpdatedAt  time.Time
}
// TableName: "schedule_tasks"
```

#### ScheduleExecution struct

```go
type ScheduleExecution struct {
    ID             uuid.UUID       // PK
    TenantID       uuid.UUID       // FK tenants, NOT NULL
    ScheduleID     uuid.UUID       // FK schedules, NOT NULL
    Status         ExecutionStatus // VARCHAR(20) DEFAULT 'pending'
    TriggerType    TriggerType     // VARCHAR(20) DEFAULT 'scheduled'
    TriggeredBy    *uuid.UUID      // FK users, nullable, ON DELETE SET NULL
    StartedAt      *time.Time      // nullable
    CompletedAt    *time.Time      // nullable
    ErrorMessage   *string         // TEXT, nullable
    TasksTotal     int             // INT DEFAULT 0
    TasksSucceeded int             // INT DEFAULT 0
    TasksFailed    int             // INT DEFAULT 0
    CreatedAt      time.Time
    TaskExecutions []ScheduleTaskExecution // HasMany via ExecutionID
    Schedule       *Schedule               // BelongsTo via ScheduleID
}
// TableName: "schedule_executions"
```

#### ScheduleTaskExecution struct

```go
type ScheduleTaskExecution struct {
    ID           uuid.UUID           // PK
    ExecutionID  uuid.UUID           // FK schedule_executions, NOT NULL
    TaskType     TaskType            // VARCHAR(50) NOT NULL
    SortOrder    int                 // INT NOT NULL DEFAULT 0
    Status       TaskExecutionStatus // VARCHAR(20) DEFAULT 'pending'
    StartedAt    *time.Time          // nullable
    CompletedAt  *time.Time          // nullable
    ErrorMessage *string             // TEXT, nullable
    Result       datatypes.JSON      // JSONB DEFAULT '{}'
    CreatedAt    time.Time
}
// TableName: "schedule_task_executions"
```

### 4. Go Backend Usage

#### Repository layer

**File**: `apps/api/internal/repository/schedule.go` (284 lines)

#### Service layer

**Files**:
- `apps/api/internal/service/schedule.go` (533 lines) -- CRUD, task management, execution logic
- `apps/api/internal/service/scheduler_catalog.go` (143 lines) -- task type catalog
- `apps/api/internal/service/scheduler_engine.go` -- scheduling engine
- `apps/api/internal/service/scheduler_executor.go` -- task execution
- `apps/api/internal/service/scheduler_tasks.go` -- task implementations
- `apps/api/internal/service/schedule_test.go` -- tests

#### Handler layer

**File**: `apps/api/internal/handler/schedule.go` (630 lines)

#### Route registration

**File**: `apps/api/internal/handler/routes.go`

### 5. Frontend Usage (via Go API, NOT Prisma)

The frontend accesses schedule data through the Go REST API via `openapi-fetch` HTTP hooks. There is no tRPC router for schedules.

**Hook file**: `apps/web/src/hooks/api/use-schedules.ts` (89 lines)
- `useSchedules()` -- list all schedules
- `useSchedule(id)` -- get single schedule
- `useCreateSchedule()` -- create schedule
- `useUpdateSchedule()` -- update schedule
- `useDeleteSchedule()` -- delete schedule
- `useScheduleTasks(scheduleId)` -- list tasks for a schedule
- `useCreateScheduleTask()` -- create task
- `useUpdateScheduleTask()` -- update task
- `useDeleteScheduleTask()` -- delete task
- `useExecuteSchedule()` -- trigger manual execution
- `useScheduleExecutions(scheduleId)` -- execution history
- `useScheduleExecution(id)` -- single execution detail
- `useTaskCatalog()` -- available task types

**Pages**:
- `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx` -- schedule list
- `apps/web/src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx` -- schedule detail

**Components** (in `apps/web/src/components/schedules/`):
- `schedule-data-table.tsx`
- `schedule-form-sheet.tsx`
- `schedule-task-form-dialog.tsx`
- `schedule-task-list.tsx`
- `schedule-timing-badge.tsx`
- `schedule-status-badge.tsx`
- `schedule-execution-log.tsx`
- `index.ts`

**Dashboard**: `apps/web/src/components/dashboard/today-schedule-card.tsx`

### 6. Ticket Schema vs. Actual DB -- Discrepancies

The ticket's proposed Prisma models (in `thoughts/shared/tickets/ZMI-TICKET-244-prisma-schema-schedules-executions.md`) contain significant differences from the actual database schema:

#### Schedule -- Ticket vs. DB

| Ticket proposes | Actual DB column | Status |
|---|---|---|
| `cron_expr String?` | N/A | Does NOT exist in DB |
| N/A | `timing_type VARCHAR(20) NOT NULL` with CHECK | Missing from ticket |
| N/A | `timing_config JSONB DEFAULT '{}'` | Missing from ticket |
| `is_active Boolean` | `is_enabled BOOLEAN DEFAULT true` | Different column name |
| `deleted_at DateTime?` | N/A | Does NOT exist in DB |
| N/A | UNIQUE(tenant_id, name) | Missing from ticket |

#### ScheduleTask -- Ticket vs. DB

| Ticket proposes | Actual DB column | Status |
|---|---|---|
| `config Json?` | `parameters JSONB DEFAULT '{}'` | Different column name |
| `is_active Boolean` | `is_enabled BOOLEAN DEFAULT true` | Different column name |

#### ScheduleExecution -- Ticket vs. DB

| Ticket proposes | Actual DB column | Status |
|---|---|---|
| N/A | `tenant_id UUID NOT NULL` FK tenants ON DELETE CASCADE | Missing from ticket |
| `status String @default("running")` | `status VARCHAR(20) DEFAULT 'pending'` | Different default |
| `started_at DateTime @default(now())` | `started_at TIMESTAMPTZ` (nullable, no default) | Different: DB has no default, field is nullable |
| N/A | `trigger_type VARCHAR(20) DEFAULT 'scheduled'` with CHECK | Missing from ticket |
| N/A | `triggered_by UUID` FK users ON DELETE SET NULL | Missing from ticket |
| `error String?` | `error_message TEXT` | Different column name |
| `result Json?` | N/A | Does NOT exist in DB |
| N/A | `tasks_total INT DEFAULT 0` | Missing from ticket |
| N/A | `tasks_succeeded INT DEFAULT 0` | Missing from ticket |
| N/A | `tasks_failed INT DEFAULT 0` | Missing from ticket |
| `@@index([schedule_id, started_at])` | 4 separate indexes (see migration) | Ticket only has 1 index |

#### ScheduleTaskExecution -- Ticket vs. DB

| Ticket proposes | Actual DB column | Status |
|---|---|---|
| `task_id String @db.Uuid` FK to ScheduleTask | N/A | Does NOT exist in DB (no FK to schedule_tasks) |
| N/A | `task_type VARCHAR(50) NOT NULL` | Missing from ticket (denormalized copy) |
| N/A | `sort_order INT NOT NULL DEFAULT 0` | Missing from ticket (denormalized copy) |
| `error String?` | `error_message TEXT` | Different column name |
| `affected_rows Int?` | N/A | Does NOT exist in DB |

### 7. Prisma Setup and Conventions

**File**: `apps/web/prisma/schema.prisma`

The schema is **read-only** against the DB. Comments at top: "DO NOT run `prisma db push` or `prisma migrate dev`. Schema changes are managed via SQL migrations in db/migrations/."

**Key conventions** (from existing models):
1. IDs use `@default(dbgenerated("gen_random_uuid()"))` not `@default(uuid())`
2. Column mapping via `@map("snake_case")` for camelCase Prisma fields
3. Table mapping via `@@map("table_name")`
4. All UUIDs annotated with `@db.Uuid`
5. Timestamps use `@db.Timestamptz(6)` for `created_at`/`updated_at`
6. `updatedAt` gets `@updatedAt` annotation when the table has an update trigger
7. Relations include `onDelete` clause matching DB FK constraints
8. Indexes include `map:` for named indexes matching existing DB index names
9. Each model has a section comment block documenting relevant migrations, CHECK constraints, partial indexes, and triggers
10. Partial unique indexes are documented in comments as "cannot be modeled in Prisma"
11. Reverse relations are added to parent models (Tenant, User, etc.)
12. Models with no `updated_at` column omit `@updatedAt` (e.g., MacroExecution has no `updatedAt`)

### 8. Analogous Pattern: Macro/MacroExecution

The `Macro` -> `MacroAssignment` -> `MacroExecution` hierarchy in Prisma is the closest analogy to the schedule hierarchy:

- `Macro` (line 1992): tenant-scoped parent with `isActive`, `createdAt`, `updatedAt @updatedAt`
- `MacroExecution` (line 2064): execution log with `status`, `triggerType`, `triggeredBy`, `startedAt`, `completedAt`, `result Json`, `errorMessage`, `createdAt` (NO `updatedAt`)
- `MacroExecution.triggeredByUser`: relation to `User` with `onDelete: SetNull`
- `User.macroExecutionsTriggers`: reverse relation array (line 59) -- named to avoid collision with other User relations

The schedule models should follow this same pattern for:
- `ScheduleExecution.triggeredBy` -> User relation with `onDelete: SetNull`
- `User` model needs a reverse relation like `scheduleExecutionsTriggers ScheduleExecution[]`
- `Tenant` model needs reverse relations for `schedules Schedule[]` and `scheduleExecutions ScheduleExecution[]`

### 9. Tenant Model Reverse Relations (Current State)

The Tenant model (line 83-172) currently has NO schedule-related reverse relations. When the four models are added, the following reverse relations need to be added:
- `schedules Schedule[]` -- for Schedule.tenantId
- `scheduleExecutions ScheduleExecution[]` -- for ScheduleExecution.tenantId

### 10. User Model Reverse Relations (Current State)

The User model (line 28-71) currently has NO schedule-related reverse relations. When ScheduleExecution is added, the following reverse relation needs to be added:
- `scheduleExecutionsTriggers ScheduleExecution[]` -- for ScheduleExecution.triggeredBy (following the `macroExecutionsTriggers` naming pattern)

### 11. FK Relationships Summary

#### schedules
- `tenant_id` -> `tenants(id)` ON DELETE CASCADE

#### schedule_tasks
- `schedule_id` -> `schedules(id)` ON DELETE CASCADE

#### schedule_executions
- `tenant_id` -> `tenants(id)` ON DELETE CASCADE
- `schedule_id` -> `schedules(id)` ON DELETE CASCADE
- `triggered_by` -> `users(id)` ON DELETE SET NULL

#### schedule_task_executions
- `execution_id` -> `schedule_executions(id)` ON DELETE CASCADE

### 12. Partial Indexes (Cannot Be Modeled in Prisma)

- `idx_schedules_next_run` ON schedules(next_run_at) WHERE is_enabled = true

This partial index will be documented in the model header comment, matching established convention.

### 13. Go TaskType Discrepancy

The Go model (`schedule.go`) defines 10 task types, but the DB CHECK constraint (migration 000063) only includes 6:
- **In DB**: `calculate_days`, `calculate_months`, `backup_database`, `send_notifications`, `export_data`, `alive_check`
- **Go-only** (not in DB CHECK): `terminal_sync`, `terminal_import`, `execute_macros`, `generate_day_plans`

This discrepancy exists in the Go codebase and is independent of the Prisma schema addition. The Prisma schema does not enforce CHECK constraints (those are DB-level only and documented in comments).

### 14. Generated Client Output

After `prisma generate`, models will be output to `apps/web/src/generated/prisma/models/`:
- `Schedule.ts` does NOT exist (will be generated when model is added)
- `ScheduleTask.ts` does NOT exist
- `ScheduleExecution.ts` does NOT exist
- `ScheduleTaskExecution.ts` does NOT exist

### 15. Related Tickets

- **ZMI-TICKET-200** (Prisma Schema: Core Foundation) -- dependency, establishes Prisma patterns
- **ZMI-TICKET-022** (ZMI Server Scheduler) -- original Go implementation that created the DB tables
- **ZMI-TICKET-247** (Schedules Router) -- depends on this ticket, will create tRPC router for schedules
- **ZMI-TICKET-245/246** (Vercel Cron) -- depends on this ticket, cron integration

## Code References

- `apps/api/internal/model/schedule.go` -- Go model structs (144 lines)
- `apps/web/prisma/schema.prisma` -- Prisma schema (2975 lines, no schedule models)
- `db/migrations/000062_create_schedules.up.sql` -- schedules table
- `db/migrations/000063_create_schedule_tasks.up.sql` -- schedule_tasks table
- `db/migrations/000064_create_schedule_executions.up.sql` -- schedule_executions table
- `db/migrations/000065_create_schedule_task_executions.up.sql` -- schedule_task_executions table
- `apps/web/src/hooks/api/use-schedules.ts` -- frontend hooks (Go API, not Prisma)
- `apps/api/internal/repository/schedule.go` -- Go repository (284 lines)
- `apps/api/internal/service/schedule.go` -- Go service (533 lines)
- `apps/api/internal/handler/schedule.go` -- Go handler (630 lines)
- `thoughts/shared/tickets/ZMI-TICKET-244-prisma-schema-schedules-executions.md` -- ticket definition
- `thoughts/shared/tickets/ZMI-TICKET-247-schedules-router.md` -- downstream ticket

## Open Questions

None -- all information needed for implementation is documented above. The Prisma models must match the actual database columns exactly (not the ticket's proposed schema), following the established project convention.
