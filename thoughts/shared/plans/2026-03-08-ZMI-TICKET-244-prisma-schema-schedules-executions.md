# ZMI-TICKET-244: Prisma Schema -- Schedules, Executions -- Implementation Plan

## Overview

Add four Prisma models (`Schedule`, `ScheduleTask`, `ScheduleExecution`, `ScheduleTaskExecution`) to the existing read-only Prisma schema. These models map to tables already created by SQL migrations 000062-000065. The Prisma schema must match the **actual database columns exactly** (not the ticket's proposed schema, which contains significant inaccuracies documented in the research).

## Key Decisions

### Use Actual DB Schema, Not Ticket Schema

The ticket's proposed Prisma models diverge from the real database in many ways (wrong column names, missing columns, non-existent columns). The research document catalogs all discrepancies. This plan follows the actual DB schema from migrations 000062-000065.

### No New SQL Migration Needed

All four tables already exist in the database. This ticket only adds Prisma model definitions that introspect against existing tables. No `prisma db push` or `prisma migrate dev` -- the project uses SQL migrations exclusively.

### tenant_id Uses Relation to Tenant Model

Following established convention (Macro, MacroExecution, VacationBalance, etc.), `tenantId` fields will have a `Tenant @relation(...)` with `onDelete: Cascade`. Reverse relations will be added to the `Tenant` model.

## What We Are NOT Doing

- **Creating SQL migrations** -- tables already exist (migrations 000062-000065).
- **Modifying CHECK constraints** -- those are DB-level only, documented in Prisma comments.
- **Adding partial indexes to Prisma** -- `idx_schedules_next_run` is a partial index (`WHERE is_enabled = true`) which Prisma cannot model. It will be documented in a comment.
- **Creating tRPC routers or frontend hooks** -- that is ZMI-TICKET-247.
- **Writing Prisma-level tests** -- this ticket adds schema models only. A basic `prisma generate` verification is sufficient. The downstream router ticket (ZMI-TICKET-247) will add query tests.

## Desired End State

After implementation:
1. Four new models exist in `apps/web/prisma/schema.prisma`: `Schedule`, `ScheduleTask`, `ScheduleExecution`, `ScheduleTaskExecution`.
2. All fields match the actual DB columns from migrations 000062-000065.
3. Reverse relations added to `Tenant` model (`schedules`, `scheduleExecutions`) and `User` model (`scheduleExecutionsTriggers`).
4. `prisma generate` succeeds without errors.
5. TypeScript compilation passes (`npx tsc --noEmit`).

### Verification Commands
```bash
cd apps/web && npx prisma generate
cd apps/web && npx tsc --noEmit
```

---

## Phase 1: Add Reverse Relations to Existing Models

### Goal
Add reverse relation arrays to `Tenant` and `User` models so the new schedule models can reference them.

### Changes

#### 1.1 Add reverse relations to `Tenant` model

**File**: `apps/web/prisma/schema.prisma`

Add after the last existing reverse relation (currently `absenceDays AbsenceDay[]` at ~line 167):

```prisma
  schedules                   Schedule[]
  scheduleExecutions          ScheduleExecution[]
```

This follows the pattern of `macros Macro[]` and `macroExecutions MacroExecution[]` already present on `Tenant`.

#### 1.2 Add reverse relation to `User` model

**File**: `apps/web/prisma/schema.prisma`

Add after the last existing reverse relation (currently `reportsCreated Report[]` at ~line 61):

```prisma
  scheduleExecutionsTriggers  ScheduleExecution[]
```

This follows the `macroExecutionsTriggers MacroExecution[]` naming convention already on `User`.

---

## Phase 2: Add Schedule Model

### Goal
Add the `Schedule` model mapping to the `schedules` table (migration 000062).

### Changes

#### 2.1 Add Schedule model

**File**: `apps/web/prisma/schema.prisma`

Add after the last model (`AbsenceDay`, ending at ~line 2975):

```prisma
// -----------------------------------------------------------------------------
// Schedule
// -----------------------------------------------------------------------------
// Migration: 000062
//
// Schedule definitions for automated background tasks.
// CHECK constraints (enforced at DB level only):
//   - timing_type IN ('seconds', 'minutes', 'hours', 'daily', 'weekly', 'monthly', 'manual')
//
// Partial index (cannot be modeled in Prisma):
//   - idx_schedules_next_run: ON (next_run_at) WHERE is_enabled = true
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
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

  // Relations
  tenant     Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  tasks      ScheduleTask[]
  executions ScheduleExecution[]

  // Indexes
  @@unique([tenantId, name])
  @@index([tenantId], map: "idx_schedules_tenant")
  @@index([tenantId, isEnabled], map: "idx_schedules_enabled")
  @@map("schedules")
}
```

**Field mapping notes**:
- `timingType` maps to `timing_type VARCHAR(20) NOT NULL` -- the ticket proposed `cron_expr` which does not exist in the DB.
- `timingConfig` maps to `timing_config JSONB DEFAULT '{}'` -- missing from ticket entirely.
- `isEnabled` maps to `is_enabled BOOLEAN DEFAULT true` -- the ticket used `is_active` (wrong name).
- No `deleted_at` field -- the ticket proposed it but it does not exist in the DB.
- `@@unique([tenantId, name])` matches the `UNIQUE(tenant_id, name)` constraint.
- The partial index `idx_schedules_next_run` cannot be modeled in Prisma and is documented in the header comment.

---

## Phase 3: Add ScheduleTask Model

### Goal
Add the `ScheduleTask` model mapping to the `schedule_tasks` table (migration 000063).

### Changes

#### 3.1 Add ScheduleTask model

**File**: `apps/web/prisma/schema.prisma`

Add after the `Schedule` model:

```prisma
// -----------------------------------------------------------------------------
// ScheduleTask
// -----------------------------------------------------------------------------
// Migration: 000063
//
// Ordered tasks within a schedule. Executed top-to-bottom by sort_order.
// CHECK constraints (enforced at DB level only):
//   - task_type IN ('calculate_days', 'calculate_months', 'backup_database',
//     'send_notifications', 'export_data', 'alive_check')
//   Note: Go code also uses 'terminal_sync', 'terminal_import', 'execute_macros',
//   'generate_day_plans' which are not in the DB CHECK constraint.
//
// Note: No tenant_id column. Tenant scoping is through the parent schedules table.
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model ScheduleTask {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scheduleId String   @map("schedule_id") @db.Uuid
  taskType   String   @map("task_type") @db.VarChar(50)
  sortOrder  Int      @default(0) @map("sort_order")
  parameters Json     @default("{}") @db.JsonB
  isEnabled  Boolean  @default(true) @map("is_enabled")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  schedule Schedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([scheduleId], map: "idx_schedule_tasks_schedule")
  @@index([scheduleId, sortOrder], map: "idx_schedule_tasks_order")
  @@map("schedule_tasks")
}
```

**Field mapping notes**:
- `parameters` maps to `parameters JSONB DEFAULT '{}'` -- the ticket used `config` (wrong name).
- `isEnabled` maps to `is_enabled BOOLEAN DEFAULT true` -- the ticket used `is_active` (wrong name).
- No `tenant_id` -- this table does not have one; scoping is through the parent `Schedule`.
- No reverse relation to `ScheduleTaskExecution` -- the DB has no FK from `schedule_task_executions` to `schedule_tasks`. Task executions use denormalized `task_type` and `sort_order` instead.

---

## Phase 4: Add ScheduleExecution Model

### Goal
Add the `ScheduleExecution` model mapping to the `schedule_executions` table (migration 000064).

### Changes

#### 4.1 Add ScheduleExecution model

**File**: `apps/web/prisma/schema.prisma`

Add after the `ScheduleTask` model:

```prisma
// -----------------------------------------------------------------------------
// ScheduleExecution
// -----------------------------------------------------------------------------
// Migration: 000064
//
// Execution log for schedule runs. Append-only (no updated_at column).
// CHECK constraints (enforced at DB level only):
//   - status IN ('pending', 'running', 'completed', 'failed', 'partial')
//   - trigger_type IN ('scheduled', 'manual')
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

  // Relations
  tenant          Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  schedule        Schedule                @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  triggeredByUser User?                   @relation(fields: [triggeredBy], references: [id], onDelete: SetNull)
  taskExecutions  ScheduleTaskExecution[]

  // Indexes
  @@index([tenantId], map: "idx_schedule_executions_tenant")
  @@index([scheduleId], map: "idx_schedule_executions_schedule")
  @@index([status], map: "idx_schedule_executions_status")
  @@index([createdAt(sort: Desc)], map: "idx_schedule_executions_created")
  @@map("schedule_executions")
}
```

**Field mapping notes**:
- `status` default is `"pending"` -- the ticket proposed `"running"` (wrong default).
- `startedAt` is nullable with no default -- the ticket proposed `@default(now())` (wrong).
- `triggerType`, `triggeredBy`, `tasksTotal`, `tasksSucceeded`, `tasksFailed` -- all missing from ticket but present in DB.
- `errorMessage` maps to `error_message TEXT` -- the ticket used `error` (wrong name).
- No `result Json?` -- the ticket proposed it but no such column exists in the DB.
- No `updatedAt` -- this is an append-only execution log (matching `MacroExecution` pattern).
- `triggeredByUser` relation follows the `MacroExecution.triggeredByUser` pattern with `onDelete: SetNull`.
- `createdAt(sort: Desc)` index follows the `MacroExecution` pattern at line 2088.

---

## Phase 5: Add ScheduleTaskExecution Model

### Goal
Add the `ScheduleTaskExecution` model mapping to the `schedule_task_executions` table (migration 000065).

### Changes

#### 5.1 Add ScheduleTaskExecution model

**File**: `apps/web/prisma/schema.prisma`

Add after the `ScheduleExecution` model:

```prisma
// -----------------------------------------------------------------------------
// ScheduleTaskExecution
// -----------------------------------------------------------------------------
// Migration: 000065
//
// Per-task execution log within a schedule execution run. Append-only (no updated_at column).
// CHECK constraints (enforced at DB level only):
//   - status IN ('pending', 'running', 'completed', 'failed', 'skipped')
//
// Note: No FK to schedule_tasks. task_type and sort_order are denormalized copies
// from the schedule_task at time of execution.
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

  // Relations
  execution ScheduleExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([executionId], map: "idx_ste_execution")
  @@index([executionId, sortOrder], map: "idx_ste_order")
  @@map("schedule_task_executions")
}
```

**Field mapping notes**:
- No `task_id` FK to `ScheduleTask` -- the ticket proposed this but the DB has no such FK. Task type and sort order are denormalized copies.
- `taskType` and `sortOrder` are denormalized copies from `schedule_tasks` at execution time.
- `errorMessage` maps to `error_message TEXT` -- the ticket used `error` (wrong name).
- `result` maps to `result JSONB DEFAULT '{}'` -- this column DOES exist in the DB (unlike on `ScheduleExecution` where it does not).
- No `affected_rows` -- the ticket proposed it but no such column exists in the DB.
- No `updatedAt` -- append-only execution log.
- No `tenant_id` -- scoping is through parent `ScheduleExecution`.

---

## Phase 6: Verify

### Goal
Ensure the schema is valid and generates correctly.

### Steps

1. **Run `prisma generate`**:
   ```bash
   cd apps/web && npx prisma generate
   ```
   This validates the schema syntax and generates the Prisma client. If there are any field name collisions, relation naming issues, or type mismatches, this step will catch them.

2. **Run TypeScript compilation**:
   ```bash
   cd apps/web && npx tsc --noEmit
   ```
   Ensures no existing code breaks due to the schema changes (e.g., reverse relations changing the Tenant or User types in unexpected ways).

3. **Verify generated files exist**:
   After `prisma generate`, confirm that the new model types are available:
   - `Schedule` type in generated client
   - `ScheduleTask` type in generated client
   - `ScheduleExecution` type in generated client
   - `ScheduleTaskExecution` type in generated client

---

## Summary of All File Changes

| File | Change Type | Description |
|---|---|---|
| `apps/web/prisma/schema.prisma` | Modified | Add reverse relations to `Tenant` model (2 lines) |
| `apps/web/prisma/schema.prisma` | Modified | Add reverse relation to `User` model (1 line) |
| `apps/web/prisma/schema.prisma` | Modified | Add `Schedule` model (~30 lines) |
| `apps/web/prisma/schema.prisma` | Modified | Add `ScheduleTask` model (~25 lines) |
| `apps/web/prisma/schema.prisma` | Modified | Add `ScheduleExecution` model (~30 lines) |
| `apps/web/prisma/schema.prisma` | Modified | Add `ScheduleTaskExecution` model (~25 lines) |

**Total**: 1 file modified, ~110 lines added. No new files. No SQL migrations.

## Tests

No dedicated tests are needed for this ticket. The Prisma schema is a declarative mapping; correctness is verified by:
1. `prisma generate` succeeding (validates schema against DB structure).
2. `tsc --noEmit` passing (validates generated types integrate with existing code).

The downstream ticket ZMI-TICKET-247 (Schedules Router) will add tRPC query tests that exercise these models at runtime.
