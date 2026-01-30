# ZMI Server Scheduler and Automated Tasks - Implementation Plan

## Overview

Implement a scheduler engine for automated background tasks in the ZMI Time clone. The scheduler supports configurable schedules with multiple timing types (seconds, minutes, hours, daily, weekly, monthly, manual), an ordered task catalog, execution logging, and manual trigger capability. The scheduler runs as a background goroutine alongside the HTTP server, with graceful shutdown support.

## Current State Analysis

- The application is purely HTTP request-driven. No background goroutines, scheduler, or task runner exists.
- Server lifecycle only handles HTTP server shutdown; no mechanism for stopping background tasks.
- Config has no scheduler-related fields.
- All computation services already exist with batch methods:
  - `RecalcService.TriggerRecalcAll()` for daily calculation across all employees
  - `MonthlyCalcService.CalculateMonthBatch()` for monthly calculations
  - `PayrollExportService.Generate()` for data export
  - `NotificationService` for sending notifications
- Multi-tenancy is HTTP-middleware-driven via `X-Tenant-ID` header. The scheduler needs to handle tenancy without HTTP context.
- The next migration sequence number is `000062`.

### Key Discoveries:
- `apps/api/cmd/server/main.go` lines 413-444: Server lifecycle with graceful shutdown -- needs scheduler stop added
- `apps/api/internal/service/recalc.go`: `TriggerRecalcAll(ctx, tenantID, from, to)` returns `*RecalcResult` with `ProcessedDays`, `FailedDays`, `Errors`
- `apps/api/internal/service/monthlycalc.go`: `CalculateMonthBatch(ctx, employeeIDs, year, month)` returns `*MonthlyCalcResult`
- `apps/api/internal/service/payrollexport.go`: `Generate(ctx, input)` for data exports
- `apps/api/internal/config/config.go`: Needs new `SchedulerEnabled` field
- `apps/api/internal/permissions/permissions.go`: Needs new `scheduler.manage` permission
- `apps/api/internal/model/base.go`: BaseModel pattern with UUID PK, CreatedAt, UpdatedAt
- `db/migrations/000061_create_payroll_exports.up.sql`: Good pattern for execution tracking (status, timestamps, error_message, parameters JSONB)

## Desired End State

A fully functional scheduler that:
1. Runs as a background goroutine, started from `main.go`, with graceful shutdown
2. Loads all enabled schedules per tenant and executes them on their configured timing
3. Supports CRUD management of schedules via REST API
4. Allows manual execution of any schedule, bypassing timing
5. Logs every execution with per-task status, timestamps, and error details
6. Provides a fixed task catalog that maps to existing service methods
7. OpenAPI documentation covering all scheduler endpoints and schemas

### Verification:
- Schedules can be created for each timing type (seconds, minutes, hours, daily, weekly, monthly, manual)
- Tasks execute top-to-bottom within a schedule
- Manual execution runs immediately via POST endpoint
- Execution logs capture success/failure and timestamps per task
- Pause/resume works without losing configuration
- `make test` passes with scheduler unit tests
- `make swagger-bundle` succeeds with new schemas
- `make generate` produces Go models for scheduler schemas

## What We're NOT Doing

- External cron library (using Go standard library `time.Ticker` / `time.Timer`)
- Terminal communication protocols (separate ticket per ticket scope)
- Actual database backup implementation (placeholder task only)
- Distributed scheduler / task queue (single-instance in-process scheduler)
- Real-time WebSocket notifications for task progress
- Task retry logic with exponential backoff (simple single-attempt per task)

## Implementation Approach

The implementation uses the existing clean architecture patterns. The scheduler engine is a new `scheduler` package under `apps/api/internal/` that owns the background loop. It receives references to existing services (recalc, monthly calc, payroll export, notification) to execute tasks. The CRUD management of schedules follows the standard repository/service/handler pattern. The scheduler engine is started from `main.go` after all services are wired, and stopped during graceful shutdown.

---

## Phase 1: Database Migrations and Domain Models

### Overview
Create the database tables for schedules, schedule tasks, and execution logs. Define corresponding GORM models.

### Changes Required:

#### 1. Migration: Create schedules table
**File**: `db/migrations/000062_create_schedules.up.sql`

```sql
-- =============================================================
-- Create schedules table
-- Stores schedule definitions with timing configuration
-- ZMI-TICKET-022: ZMI Server Scheduler
-- =============================================================
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    timing_type VARCHAR(20) NOT NULL
        CHECK (timing_type IN ('seconds', 'minutes', 'hours', 'daily', 'weekly', 'monthly', 'manual')),
    timing_config JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_schedules_tenant ON schedules(tenant_id);
CREATE INDEX idx_schedules_enabled ON schedules(tenant_id, is_enabled);
CREATE INDEX idx_schedules_next_run ON schedules(next_run_at) WHERE is_enabled = true;

CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE schedules IS 'Schedule definitions for automated background tasks.';
COMMENT ON COLUMN schedules.timing_type IS 'Type of timing: seconds, minutes, hours, daily, weekly, monthly, or manual.';
COMMENT ON COLUMN schedules.timing_config IS 'JSON config for timing. Examples: {"interval":30} for seconds/minutes/hours, {"time":"02:00"} for daily, {"day_of_week":1,"time":"02:00"} for weekly, {"day_of_month":1,"time":"02:00"} for monthly.';
COMMENT ON COLUMN schedules.last_run_at IS 'Timestamp of the last execution start.';
COMMENT ON COLUMN schedules.next_run_at IS 'Computed next execution time for the scheduler engine.';
```

**File**: `db/migrations/000062_create_schedules.down.sql`
```sql
DROP TABLE IF EXISTS schedules;
```

#### 2. Migration: Create schedule_tasks table
**File**: `db/migrations/000063_create_schedule_tasks.up.sql`

```sql
-- =============================================================
-- Create schedule_tasks table
-- Ordered list of tasks within a schedule
-- ZMI-TICKET-022: ZMI Server Scheduler
-- =============================================================
CREATE TABLE schedule_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL
        CHECK (task_type IN (
            'calculate_days', 'calculate_months',
            'backup_database', 'send_notifications',
            'export_data', 'alive_check'
        )),
    sort_order INT NOT NULL DEFAULT 0,
    parameters JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_tasks_schedule ON schedule_tasks(schedule_id);
CREATE INDEX idx_schedule_tasks_order ON schedule_tasks(schedule_id, sort_order);

CREATE TRIGGER update_schedule_tasks_updated_at
    BEFORE UPDATE ON schedule_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE schedule_tasks IS 'Ordered tasks within a schedule. Executed top-to-bottom by sort_order.';
COMMENT ON COLUMN schedule_tasks.task_type IS 'Task type from the catalog: calculate_days, calculate_months, backup_database, send_notifications, export_data, alive_check.';
COMMENT ON COLUMN schedule_tasks.sort_order IS 'Execution order within the schedule. Lower numbers run first.';
COMMENT ON COLUMN schedule_tasks.parameters IS 'JSON parameters for the task. E.g., {"date_range":"yesterday"} for calculate_days, {"year":2026,"month":1} for calculate_months.';
```

**File**: `db/migrations/000063_create_schedule_tasks.down.sql`
```sql
DROP TABLE IF EXISTS schedule_tasks;
```

#### 3. Migration: Create schedule_executions table
**File**: `db/migrations/000064_create_schedule_executions.up.sql`

```sql
-- =============================================================
-- Create schedule_executions table
-- Logs each execution run of a schedule
-- ZMI-TICKET-022: ZMI Server Scheduler
-- =============================================================
CREATE TABLE schedule_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (trigger_type IN ('scheduled', 'manual')),
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    tasks_total INT DEFAULT 0,
    tasks_succeeded INT DEFAULT 0,
    tasks_failed INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_executions_tenant ON schedule_executions(tenant_id);
CREATE INDEX idx_schedule_executions_schedule ON schedule_executions(schedule_id);
CREATE INDEX idx_schedule_executions_status ON schedule_executions(status);
CREATE INDEX idx_schedule_executions_created ON schedule_executions(created_at DESC);

COMMENT ON TABLE schedule_executions IS 'Execution log for schedule runs.';
COMMENT ON COLUMN schedule_executions.trigger_type IS 'How the execution was triggered: scheduled (automatic) or manual (API trigger).';
COMMENT ON COLUMN schedule_executions.status IS 'Overall execution status. partial means some tasks succeeded and some failed.';
```

**File**: `db/migrations/000064_create_schedule_executions.down.sql`
```sql
DROP TABLE IF EXISTS schedule_executions;
```

#### 4. Migration: Create schedule_task_executions table
**File**: `db/migrations/000065_create_schedule_task_executions.up.sql`

```sql
-- =============================================================
-- Create schedule_task_executions table
-- Per-task execution log within a schedule execution
-- ZMI-TICKET-022: ZMI Server Scheduler
-- =============================================================
CREATE TABLE schedule_task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES schedule_executions(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    result JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ste_execution ON schedule_task_executions(execution_id);
CREATE INDEX idx_ste_order ON schedule_task_executions(execution_id, sort_order);

COMMENT ON TABLE schedule_task_executions IS 'Per-task execution log within a schedule execution run.';
COMMENT ON COLUMN schedule_task_executions.result IS 'JSON result data from the task. E.g., {"processed_days":150,"failed_days":2} for calculate_days.';
```

**File**: `db/migrations/000065_create_schedule_task_executions.down.sql`
```sql
DROP TABLE IF EXISTS schedule_task_executions;
```

#### 5. Domain Models
**File**: `apps/api/internal/model/schedule.go`

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "gorm.io/datatypes"
)

// TaskType represents a scheduler task type from the catalog.
type TaskType string

const (
    TaskTypeCalculateDays    TaskType = "calculate_days"
    TaskTypeCalculateMonths  TaskType = "calculate_months"
    TaskTypeBackupDatabase   TaskType = "backup_database"
    TaskTypeSendNotifications TaskType = "send_notifications"
    TaskTypeExportData       TaskType = "export_data"
    TaskTypeAliveCheck       TaskType = "alive_check"
)

// TimingType represents a schedule timing type.
type TimingType string

const (
    TimingTypeSeconds TimingType = "seconds"
    TimingTypeMinutes TimingType = "minutes"
    TimingTypeHours   TimingType = "hours"
    TimingTypeDaily   TimingType = "daily"
    TimingTypeWeekly  TimingType = "weekly"
    TimingTypeMonthly TimingType = "monthly"
    TimingTypeManual  TimingType = "manual"
)

// ExecutionStatus represents the status of an execution.
type ExecutionStatus string

const (
    ExecutionStatusPending   ExecutionStatus = "pending"
    ExecutionStatusRunning   ExecutionStatus = "running"
    ExecutionStatusCompleted ExecutionStatus = "completed"
    ExecutionStatusFailed    ExecutionStatus = "failed"
    ExecutionStatusPartial   ExecutionStatus = "partial"
)

// TaskExecutionStatus represents the status of a task execution.
type TaskExecutionStatus string

const (
    TaskExecutionStatusPending   TaskExecutionStatus = "pending"
    TaskExecutionStatusRunning   TaskExecutionStatus = "running"
    TaskExecutionStatusCompleted TaskExecutionStatus = "completed"
    TaskExecutionStatusFailed    TaskExecutionStatus = "failed"
    TaskExecutionStatusSkipped   TaskExecutionStatus = "skipped"
)

// TriggerType represents how an execution was triggered.
type TriggerType string

const (
    TriggerTypeScheduled TriggerType = "scheduled"
    TriggerTypeManual    TriggerType = "manual"
)

// Schedule represents a schedule definition.
type Schedule struct {
    ID           uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Name         string         `gorm:"type:varchar(255);not null" json:"name"`
    Description  *string        `gorm:"type:text" json:"description,omitempty"`
    TimingType   TimingType     `gorm:"type:varchar(20);not null" json:"timing_type"`
    TimingConfig datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"timing_config"`
    IsEnabled    bool           `gorm:"default:true" json:"is_enabled"`
    LastRunAt    *time.Time     `gorm:"type:timestamptz" json:"last_run_at,omitempty"`
    NextRunAt    *time.Time     `gorm:"type:timestamptz" json:"next_run_at,omitempty"`
    CreatedAt    time.Time      `gorm:"type:timestamptz;default:now()" json:"created_at"`
    UpdatedAt    time.Time      `gorm:"type:timestamptz;default:now()" json:"updated_at"`

    // Relations
    Tasks []ScheduleTask `gorm:"foreignKey:ScheduleID" json:"tasks,omitempty"`
}

func (Schedule) TableName() string { return "schedules" }

// ScheduleTask represents an ordered task within a schedule.
type ScheduleTask struct {
    ID         uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    ScheduleID uuid.UUID      `gorm:"type:uuid;not null;index" json:"schedule_id"`
    TaskType   TaskType       `gorm:"type:varchar(50);not null" json:"task_type"`
    SortOrder  int            `gorm:"not null;default:0" json:"sort_order"`
    Parameters datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"parameters"`
    IsEnabled  bool           `gorm:"default:true" json:"is_enabled"`
    CreatedAt  time.Time      `gorm:"type:timestamptz;default:now()" json:"created_at"`
    UpdatedAt  time.Time      `gorm:"type:timestamptz;default:now()" json:"updated_at"`
}

func (ScheduleTask) TableName() string { return "schedule_tasks" }

// ScheduleExecution represents an execution run of a schedule.
type ScheduleExecution struct {
    ID             uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID       uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    ScheduleID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"schedule_id"`
    Status         ExecutionStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    TriggerType    TriggerType     `gorm:"type:varchar(20);not null;default:'scheduled'" json:"trigger_type"`
    TriggeredBy    *uuid.UUID      `gorm:"type:uuid" json:"triggered_by,omitempty"`
    StartedAt      *time.Time      `gorm:"type:timestamptz" json:"started_at,omitempty"`
    CompletedAt    *time.Time      `gorm:"type:timestamptz" json:"completed_at,omitempty"`
    ErrorMessage   *string         `gorm:"type:text" json:"error_message,omitempty"`
    TasksTotal     int             `gorm:"default:0" json:"tasks_total"`
    TasksSucceeded int             `gorm:"default:0" json:"tasks_succeeded"`
    TasksFailed    int             `gorm:"default:0" json:"tasks_failed"`
    CreatedAt      time.Time       `gorm:"type:timestamptz;default:now()" json:"created_at"`

    // Relations
    TaskExecutions []ScheduleTaskExecution `gorm:"foreignKey:ExecutionID" json:"task_executions,omitempty"`
    Schedule       *Schedule               `gorm:"foreignKey:ScheduleID" json:"schedule,omitempty"`
}

func (ScheduleExecution) TableName() string { return "schedule_executions" }

// ScheduleTaskExecution represents a single task execution within a schedule execution.
type ScheduleTaskExecution struct {
    ID           uuid.UUID           `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    ExecutionID  uuid.UUID           `gorm:"type:uuid;not null;index" json:"execution_id"`
    TaskType     TaskType            `gorm:"type:varchar(50);not null" json:"task_type"`
    SortOrder    int                 `gorm:"not null;default:0" json:"sort_order"`
    Status       TaskExecutionStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    StartedAt    *time.Time          `gorm:"type:timestamptz" json:"started_at,omitempty"`
    CompletedAt  *time.Time          `gorm:"type:timestamptz" json:"completed_at,omitempty"`
    ErrorMessage *string             `gorm:"type:text" json:"error_message,omitempty"`
    Result       datatypes.JSON      `gorm:"type:jsonb;default:'{}'" json:"result"`
    CreatedAt    time.Time           `gorm:"type:timestamptz;default:now()" json:"created_at"`
}

func (ScheduleTaskExecution) TableName() string { return "schedule_task_executions" }
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `make migrate-up`
- [ ] Migration rollback works: `make migrate-down` (4 times) then `make migrate-up`
- [ ] Model file compiles: `cd apps/api && go build ./internal/model/...`
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Inspect database tables with `\d schedules`, `\d schedule_tasks`, `\d schedule_executions`, `\d schedule_task_executions`
- [ ] Verify all CHECK constraints exist
- [ ] Verify all indexes exist
- [ ] Verify all foreign key cascades work

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: OpenAPI Spec and Generated Models

### Overview
Define OpenAPI schemas and paths for the scheduler endpoints. Generate Go models from the spec.

### Changes Required:

#### 1. OpenAPI Schemas
**File**: `api/schemas/schedules.yaml`

Define the following schemas:
- `Schedule` - Full schedule entity with all fields
- `ScheduleTask` - Task within a schedule
- `ScheduleExecution` - Execution log entry
- `ScheduleTaskExecution` - Per-task execution log
- `TaskCatalogEntry` - A task type in the catalog
- `TimingConfig` - Timing configuration object
- `CreateScheduleRequest` - Request body for creating a schedule (required: name, timing_type)
- `UpdateScheduleRequest` - Request body for updating a schedule (all optional)
- `CreateScheduleTaskRequest` - Request body for adding a task to a schedule (required: task_type, sort_order)
- `UpdateScheduleTaskRequest` - Request body for updating a task (all optional)
- `TriggerExecutionRequest` - Request body for manual trigger (optional: triggered_by user ID)
- `ScheduleList` - List wrapper with data array
- `ScheduleExecutionList` - List wrapper for execution logs
- `TaskCatalog` - List wrapper for task catalog entries

Key schema details:

```yaml
Schedule:
  type: object
  required:
    - id
    - tenant_id
    - name
    - timing_type
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    name:
      type: string
      example: "Nightly Calculation"
    description:
      type: string
      x-nullable: true
    timing_type:
      type: string
      enum: [seconds, minutes, hours, daily, weekly, monthly, manual]
    timing_config:
      $ref: '#/TimingConfig'
    is_enabled:
      type: boolean
    last_run_at:
      type: string
      format: date-time
      x-nullable: true
    next_run_at:
      type: string
      format: date-time
      x-nullable: true
    tasks:
      type: array
      items:
        $ref: '#/ScheduleTask'
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

TimingConfig:
  type: object
  properties:
    interval:
      type: integer
      description: "Interval value for seconds/minutes/hours timing types"
      example: 30
    time:
      type: string
      description: "Time of day for daily/weekly/monthly (HH:MM format)"
      example: "02:00"
    day_of_week:
      type: integer
      description: "Day of week for weekly (0=Sunday, 1=Monday, ...6=Saturday)"
      minimum: 0
      maximum: 6
    day_of_month:
      type: integer
      description: "Day of month for monthly timing type"
      minimum: 1
      maximum: 31

ScheduleTask:
  type: object
  required:
    - id
    - schedule_id
    - task_type
    - sort_order
  properties:
    id:
      type: string
      format: uuid
    schedule_id:
      type: string
      format: uuid
    task_type:
      type: string
      enum: [calculate_days, calculate_months, backup_database, send_notifications, export_data, alive_check]
    sort_order:
      type: integer
    parameters:
      type: object
      additionalProperties: true
    is_enabled:
      type: boolean
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

ScheduleExecution:
  type: object
  required:
    - id
    - schedule_id
    - status
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    schedule_id:
      type: string
      format: uuid
    status:
      type: string
      enum: [pending, running, completed, failed, partial]
    trigger_type:
      type: string
      enum: [scheduled, manual]
    triggered_by:
      type: string
      format: uuid
      x-nullable: true
    started_at:
      type: string
      format: date-time
      x-nullable: true
    completed_at:
      type: string
      format: date-time
      x-nullable: true
    error_message:
      type: string
      x-nullable: true
    tasks_total:
      type: integer
    tasks_succeeded:
      type: integer
    tasks_failed:
      type: integer
    task_executions:
      type: array
      items:
        $ref: '#/ScheduleTaskExecution'
    created_at:
      type: string
      format: date-time

ScheduleTaskExecution:
  type: object
  properties:
    id:
      type: string
      format: uuid
    execution_id:
      type: string
      format: uuid
    task_type:
      type: string
    sort_order:
      type: integer
    status:
      type: string
      enum: [pending, running, completed, failed, skipped]
    started_at:
      type: string
      format: date-time
      x-nullable: true
    completed_at:
      type: string
      format: date-time
      x-nullable: true
    error_message:
      type: string
      x-nullable: true
    result:
      type: object
      additionalProperties: true
    created_at:
      type: string
      format: date-time

TaskCatalogEntry:
  type: object
  required:
    - task_type
    - name
    - description
  properties:
    task_type:
      type: string
      enum: [calculate_days, calculate_months, backup_database, send_notifications, export_data, alive_check]
    name:
      type: string
    description:
      type: string
    parameter_schema:
      type: object
      additionalProperties: true
      description: "JSON schema describing the accepted parameters for this task type"
```

Also define: `CreateScheduleRequest`, `UpdateScheduleRequest`, `CreateScheduleTaskRequest`, `UpdateScheduleTaskRequest`, `TriggerExecutionRequest`, `ScheduleList`, `ScheduleExecutionList`, `TaskCatalog`.

#### 2. OpenAPI Paths
**File**: `api/paths/schedules.yaml`

Define the following paths:

```
/schedules           GET (list), POST (create)
/schedules/{id}      GET (get), PATCH (update), DELETE (delete)
/schedules/{id}/tasks           GET (list tasks), POST (add task)
/schedules/{id}/tasks/{taskId}  PATCH (update task), DELETE (remove task)
/schedules/{id}/execute         POST (trigger manual execution)
/schedules/{id}/executions      GET (list execution logs)
/schedule-executions/{id}       GET (get execution detail with task logs)
/scheduler/task-catalog         GET (list available task types)
```

Tag: `Scheduler`

Each endpoint follows the same pattern as `api/paths/export-interfaces.yaml`:
- `X-Tenant-ID` header implicit (tenant-scoped routes)
- UUID path parameters
- Standard error responses ($ref to common errors)
- Request/response bodies reference schemas

#### 3. Wire into openapi.yaml

Add to tags:
```yaml
  - name: Scheduler
    description: Schedule management and automated task execution
```

Add to paths section:
```yaml
  # Schedules
  /schedules:
    $ref: 'paths/schedules.yaml#/~1schedules'
  /schedules/{id}:
    $ref: 'paths/schedules.yaml#/~1schedules~1{id}'
  /schedules/{id}/tasks:
    $ref: 'paths/schedules.yaml#/~1schedules~1{id}~1tasks'
  /schedules/{id}/tasks/{taskId}:
    $ref: 'paths/schedules.yaml#/~1schedules~1{id}~1tasks~1{taskId}'
  /schedules/{id}/execute:
    $ref: 'paths/schedules.yaml#/~1schedules~1{id}~1execute'
  /schedules/{id}/executions:
    $ref: 'paths/schedules.yaml#/~1schedules~1{id}~1executions'
  /schedule-executions/{id}:
    $ref: 'paths/schedules.yaml#/~1schedule-executions~1{id}'
  /scheduler/task-catalog:
    $ref: 'paths/schedules.yaml#/~1scheduler~1task-catalog'
```

Add to definitions section:
```yaml
  # Schedules
  Schedule:
    $ref: 'schemas/schedules.yaml#/Schedule'
  ScheduleTask:
    $ref: 'schemas/schedules.yaml#/ScheduleTask'
  ScheduleExecution:
    $ref: 'schemas/schedules.yaml#/ScheduleExecution'
  ScheduleTaskExecution:
    $ref: 'schemas/schedules.yaml#/ScheduleTaskExecution'
  TaskCatalogEntry:
    $ref: 'schemas/schedules.yaml#/TaskCatalogEntry'
  TimingConfig:
    $ref: 'schemas/schedules.yaml#/TimingConfig'
  CreateScheduleRequest:
    $ref: 'schemas/schedules.yaml#/CreateScheduleRequest'
  UpdateScheduleRequest:
    $ref: 'schemas/schedules.yaml#/UpdateScheduleRequest'
  CreateScheduleTaskRequest:
    $ref: 'schemas/schedules.yaml#/CreateScheduleTaskRequest'
  UpdateScheduleTaskRequest:
    $ref: 'schemas/schedules.yaml#/UpdateScheduleTaskRequest'
  TriggerExecutionRequest:
    $ref: 'schemas/schedules.yaml#/TriggerExecutionRequest'
  ScheduleList:
    $ref: 'schemas/schedules.yaml#/ScheduleList'
  ScheduleExecutionList:
    $ref: 'schemas/schedules.yaml#/ScheduleExecutionList'
  TaskCatalog:
    $ref: 'schemas/schedules.yaml#/TaskCatalog'
```

#### 4. Bundle and Generate
```bash
make swagger-bundle
make generate
```

### Success Criteria:

#### Automated Verification:
- [ ] Bundle succeeds: `make swagger-bundle`
- [ ] Generate succeeds: `make generate`
- [ ] Generated models exist in `apps/api/gen/models/` for Schedule, ScheduleTask, etc.
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Swagger UI at `/swagger/` shows Scheduler tag with all endpoints
- [ ] Schema definitions render correctly in Swagger UI
- [ ] Timing config examples display properly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Repository Layer

### Overview
Implement repository layer for schedule CRUD, schedule tasks, and execution log queries.

### Changes Required:

#### 1. Schedule Repository
**File**: `apps/api/internal/repository/schedule.go`

```go
package repository

// ScheduleRepository handles schedule data access.
type ScheduleRepository struct {
    db *DB
}

func NewScheduleRepository(db *DB) *ScheduleRepository {
    return &ScheduleRepository{db: db}
}
```

Methods to implement:
- `Create(ctx, schedule *model.Schedule) error` - Create schedule
- `GetByID(ctx, id uuid.UUID) (*model.Schedule, error)` - Get by ID with tasks preloaded (sorted by sort_order)
- `List(ctx, tenantID uuid.UUID) ([]model.Schedule, error)` - List all schedules for tenant with tasks
- `ListEnabled(ctx) ([]model.Schedule, error)` - List ALL enabled schedules across ALL tenants with tasks (for the scheduler engine)
- `Update(ctx, schedule *model.Schedule) error` - Update schedule
- `Delete(ctx, id uuid.UUID) error` - Delete schedule (cascades to tasks)
- `UpdateRunTimes(ctx, id uuid.UUID, lastRunAt, nextRunAt *time.Time) error` - Update last_run_at and next_run_at without changing updated_at
- `GetByName(ctx, tenantID uuid.UUID, name string) (*model.Schedule, error)` - For uniqueness check

Pattern: Follow `ExportInterfaceRepository` exactly -- use `r.db.GORM.WithContext(ctx)`, handle `gorm.ErrRecordNotFound`, return domain errors.

#### 2. Schedule Task Repository
**File**: `apps/api/internal/repository/scheduletask.go`

Methods:
- `Create(ctx, task *model.ScheduleTask) error`
- `GetByID(ctx, id uuid.UUID) (*model.ScheduleTask, error)`
- `ListBySchedule(ctx, scheduleID uuid.UUID) ([]model.ScheduleTask, error)` - Ordered by sort_order
- `Update(ctx, task *model.ScheduleTask) error`
- `Delete(ctx, id uuid.UUID) error`

#### 3. Schedule Execution Repository
**File**: `apps/api/internal/repository/scheduleexecution.go`

Methods:
- `Create(ctx, execution *model.ScheduleExecution) error`
- `GetByID(ctx, id uuid.UUID) (*model.ScheduleExecution, error)` - With task executions preloaded
- `ListBySchedule(ctx, scheduleID uuid.UUID, limit int) ([]model.ScheduleExecution, error)` - Most recent first, limited
- `Update(ctx, execution *model.ScheduleExecution) error`
- `GetLastBySchedule(ctx, scheduleID uuid.UUID) (*model.ScheduleExecution, error)` - Most recent execution

#### 4. Schedule Task Execution Repository
**File**: `apps/api/internal/repository/scheduletaskexecution.go`

Methods:
- `Create(ctx, taskExec *model.ScheduleTaskExecution) error`
- `Update(ctx, taskExec *model.ScheduleTaskExecution) error`
- `ListByExecution(ctx, executionID uuid.UUID) ([]model.ScheduleTaskExecution, error)` - Ordered by sort_order

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./internal/repository/...`
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Repository methods follow the same patterns as `ExportInterfaceRepository`
- [ ] All methods include proper error handling with domain error types

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Service Layer - Schedule CRUD

### Overview
Implement the schedule service for CRUD operations with validation, and the task catalog.

### Changes Required:

#### 1. Schedule Service
**File**: `apps/api/internal/service/schedule.go`

```go
package service

import (
    "context"
    "errors"
    // ...
)

var (
    ErrScheduleNotFound        = errors.New("schedule not found")
    ErrScheduleNameRequired    = errors.New("schedule name is required")
    ErrScheduleNameExists      = errors.New("schedule with this name already exists")
    ErrScheduleTimingInvalid   = errors.New("invalid timing configuration")
    ErrScheduleTaskNotFound    = errors.New("schedule task not found")
    ErrScheduleTaskTypeInvalid = errors.New("invalid task type")
    ErrScheduleExecutionNotFound = errors.New("schedule execution not found")
)
```

Define local repository interfaces (following the pattern from `exportinterface.go`):
```go
type scheduleRepository interface {
    Create(ctx context.Context, s *model.Schedule) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Schedule, error)
    // ... all methods
}

type scheduleTaskRepository interface { ... }
type scheduleExecutionRepository interface { ... }
type scheduleTaskExecutionRepository interface { ... }
```

Input types:
```go
type CreateScheduleInput struct {
    TenantID     uuid.UUID
    Name         string
    Description  *string
    TimingType   string
    TimingConfig map[string]interface{}
    IsEnabled    bool
    Tasks        []CreateScheduleTaskInput
}

type UpdateScheduleInput struct {
    Name         *string
    Description  *string
    TimingType   *string
    TimingConfig map[string]interface{}
    IsEnabled    *bool
}

type CreateScheduleTaskInput struct {
    TaskType   string
    SortOrder  int
    Parameters map[string]interface{}
    IsEnabled  bool
}

type UpdateScheduleTaskInput struct {
    TaskType   *string
    SortOrder  *int
    Parameters map[string]interface{}
    IsEnabled  *bool
}
```

Service struct:
```go
type ScheduleService struct {
    scheduleRepo     scheduleRepository
    taskRepo         scheduleTaskRepository
    executionRepo    scheduleExecutionRepository
    taskExecRepo     scheduleTaskExecutionRepository
}

func NewScheduleService(
    scheduleRepo scheduleRepository,
    taskRepo scheduleTaskRepository,
    executionRepo scheduleExecutionRepository,
    taskExecRepo scheduleTaskExecutionRepository,
) *ScheduleService { ... }
```

Methods:
- `Create(ctx, input CreateScheduleInput) (*model.Schedule, error)` - Validate name, timing, create schedule and tasks
- `GetByID(ctx, id uuid.UUID) (*model.Schedule, error)` - Get with tasks
- `List(ctx, tenantID uuid.UUID) ([]model.Schedule, error)` - List all for tenant
- `Update(ctx, id uuid.UUID, input UpdateScheduleInput) (*model.Schedule, error)` - Partial update
- `Delete(ctx, id uuid.UUID) error` - Delete schedule
- `AddTask(ctx, scheduleID uuid.UUID, input CreateScheduleTaskInput) (*model.ScheduleTask, error)` - Add task to schedule
- `UpdateTask(ctx, taskID uuid.UUID, input UpdateScheduleTaskInput) (*model.ScheduleTask, error)` - Update task
- `RemoveTask(ctx, taskID uuid.UUID) error` - Remove task
- `ListExecutions(ctx, scheduleID uuid.UUID, limit int) ([]model.ScheduleExecution, error)` - Get execution history
- `GetExecution(ctx, executionID uuid.UUID) (*model.ScheduleExecution, error)` - Get execution detail
- `GetLastExecution(ctx, scheduleID uuid.UUID) (*model.ScheduleExecution, error)` - Get last execution

Validation logic:
- Name must be non-empty, trimmed
- Name must be unique within tenant
- TimingType must be one of the valid enum values
- TimingConfig validation per timing type:
  - `seconds`/`minutes`/`hours`: requires `interval` > 0
  - `daily`: requires `time` in HH:MM format
  - `weekly`: requires `day_of_week` (0-6) and `time`
  - `monthly`: requires `day_of_month` (1-31) and `time`
  - `manual`: no config required
- TaskType must be in the valid catalog

#### 2. Task Catalog
**File**: `apps/api/internal/service/taskcatalog.go`

```go
package service

// TaskCatalogEntry represents a task type in the catalog.
type TaskCatalogEntry struct {
    TaskType        string
    Name            string
    Description     string
    ParameterSchema map[string]interface{}
}

// TaskCatalog returns the list of available task types.
func TaskCatalog() []TaskCatalogEntry {
    return []TaskCatalogEntry{
        {
            TaskType:    "calculate_days",
            Name:        "Calculate Days",
            Description: "Calculate daily values for all active employees with new bookings.",
            ParameterSchema: map[string]interface{}{
                "type": "object",
                "properties": map[string]interface{}{
                    "date_range": map[string]interface{}{
                        "type":        "string",
                        "enum":        []string{"yesterday", "today", "last_7_days", "custom"},
                        "default":     "yesterday",
                        "description": "Date range to calculate",
                    },
                    "from_date": map[string]interface{}{
                        "type":        "string",
                        "format":      "date",
                        "description": "Start date (only for custom range)",
                    },
                    "to_date": map[string]interface{}{
                        "type":        "string",
                        "format":      "date",
                        "description": "End date (only for custom range)",
                    },
                },
            },
        },
        {
            TaskType:    "calculate_months",
            Name:        "Calculate Months",
            Description: "Calculate monthly evaluations for all active employees.",
            ParameterSchema: map[string]interface{}{
                "type": "object",
                "properties": map[string]interface{}{
                    "scope": map[string]interface{}{
                        "type":    "string",
                        "enum":    []string{"current", "previous", "full"},
                        "default": "current",
                    },
                },
            },
        },
        {
            TaskType:    "backup_database",
            Name:        "Backup Database",
            Description: "Create a database backup (placeholder - not yet implemented).",
        },
        {
            TaskType:    "send_notifications",
            Name:        "Send Notifications",
            Description: "Send pending notifications to users.",
        },
        {
            TaskType:    "export_data",
            Name:        "Export Data",
            Description: "Generate and export payroll data.",
            ParameterSchema: map[string]interface{}{
                "type": "object",
                "properties": map[string]interface{}{
                    "export_interface_id": map[string]interface{}{
                        "type":   "string",
                        "format": "uuid",
                    },
                    "year": map[string]interface{}{
                        "type": "integer",
                    },
                    "month": map[string]interface{}{
                        "type": "integer",
                    },
                },
            },
        },
        {
            TaskType:    "alive_check",
            Name:        "Alive Check",
            Description: "Simple health check that verifies the scheduler is running.",
        },
    }
}

// ValidTaskTypes returns a set of valid task type strings.
func ValidTaskTypes() map[string]bool {
    types := make(map[string]bool)
    for _, entry := range TaskCatalog() {
        types[entry.TaskType] = true
    }
    return types
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./internal/service/...`
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Service follows the same patterns as `ExportInterfaceService`
- [ ] All validation rules are implemented
- [ ] Task catalog is complete with all 6 task types

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Task Handlers and Scheduler Engine

### Overview
Implement the task execution handlers that call existing services, and the background scheduler engine.

### Changes Required:

#### 1. Task Executor
**File**: `apps/api/internal/scheduler/taskexecutor.go`

This is a new package: `apps/api/internal/scheduler/`

```go
package scheduler

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/google/uuid"
    "github.com/rs/zerolog/log"
)

// TaskResult represents the result of executing a task.
type TaskResult struct {
    Success bool
    Data    map[string]interface{}
    Error   string
}

// TaskExecutor executes individual tasks using the available services.
type TaskExecutor struct {
    recalcService       recalcServiceForScheduler
    monthlyCalcService  monthlyCalcServiceForScheduler
    employeeRepo        employeeRepoForScheduler
    // payrollExportService, notificationService as needed
}
```

Define local interfaces for the services the executor needs:
```go
type recalcServiceForScheduler interface {
    TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*service.RecalcResult, error)
}

type monthlyCalcServiceForScheduler interface {
    CalculateMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, year int, month int) (*service.MonthlyCalcResult, error)
}

type employeeRepoForScheduler interface {
    List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}
```

Task handler methods on `TaskExecutor`:
- `ExecuteTask(ctx context.Context, tenantID uuid.UUID, taskType string, params map[string]interface{}) TaskResult`
- Internal dispatch to:
  - `executeCalculateDays(ctx, tenantID, params)` - Calls `recalcService.TriggerRecalcAll()` with date range from params
  - `executeCalculateMonths(ctx, tenantID, params)` - Calls `monthlyCalcService.CalculateMonthBatch()` for current/previous month
  - `executeBackupDatabase(ctx, tenantID, params)` - Log placeholder, return success
  - `executeSendNotifications(ctx, tenantID, params)` - Placeholder
  - `executeExportData(ctx, tenantID, params)` - Calls payroll export service
  - `executeAliveCheck(ctx, tenantID, params)` - Log heartbeat, return success

The `executeCalculateDays` method:
```go
func (e *TaskExecutor) executeCalculateDays(ctx context.Context, tenantID uuid.UUID, params map[string]interface{}) TaskResult {
    // Determine date range from params (default: yesterday)
    dateRange, _ := params["date_range"].(string)
    if dateRange == "" {
        dateRange = "yesterday"
    }

    now := time.Now()
    var from, to time.Time
    switch dateRange {
    case "yesterday":
        yesterday := now.AddDate(0, 0, -1)
        from = yesterday
        to = yesterday
    case "today":
        from = now
        to = now
    case "last_7_days":
        from = now.AddDate(0, 0, -7)
        to = now
    case "custom":
        // Parse from_date, to_date from params
        // ...
    }

    result, err := e.recalcService.TriggerRecalcAll(ctx, tenantID, from, to)
    if err != nil {
        return TaskResult{Success: false, Error: err.Error()}
    }

    return TaskResult{
        Success: result.FailedDays == 0,
        Data: map[string]interface{}{
            "processed_days": result.ProcessedDays,
            "failed_days":    result.FailedDays,
        },
    }
}
```

#### 2. Scheduler Engine
**File**: `apps/api/internal/scheduler/engine.go`

```go
package scheduler

import (
    "context"
    "sync"
    "time"

    "github.com/rs/zerolog/log"
)

// Engine is the background scheduler that runs schedules on their configured timing.
type Engine struct {
    scheduleService   scheduleServiceForEngine
    executionService  executionServiceForEngine
    taskExecutor      *TaskExecutor
    tenantRepo        tenantRepoForEngine

    ctx        context.Context
    cancel     context.CancelFunc
    wg         sync.WaitGroup
    tickerStop chan struct{}
}

type scheduleServiceForEngine interface {
    ListAllEnabled(ctx context.Context) ([]model.Schedule, error)
    UpdateRunTimes(ctx context.Context, id uuid.UUID, lastRunAt, nextRunAt *time.Time) error
}

type executionServiceForEngine interface {
    CreateAndRun(ctx context.Context, schedule *model.Schedule, triggerType model.TriggerType, triggeredBy *uuid.UUID) (*model.ScheduleExecution, error)
}

type tenantRepoForEngine interface {
    List(ctx context.Context, filters repository.TenantListFilters) ([]model.Tenant, error)
}
```

Engine lifecycle:
```go
func NewEngine(
    scheduleService scheduleServiceForEngine,
    executionService executionServiceForEngine,
    taskExecutor *TaskExecutor,
    tenantRepo tenantRepoForEngine,
) *Engine { ... }

// Start begins the scheduler loop.
func (e *Engine) Start() {
    e.ctx, e.cancel = context.WithCancel(context.Background())
    e.tickerStop = make(chan struct{})

    e.wg.Add(1)
    go e.run()

    log.Info().Msg("Scheduler engine started")
}

// Stop gracefully stops the scheduler.
func (e *Engine) Stop() {
    log.Info().Msg("Stopping scheduler engine...")
    e.cancel()
    close(e.tickerStop)
    e.wg.Wait()
    log.Info().Msg("Scheduler engine stopped")
}
```

The `run()` loop:
```go
func (e *Engine) run() {
    defer e.wg.Done()

    // Check every 10 seconds for schedules that need to run
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-e.ctx.Done():
            return
        case <-ticker.C:
            e.tick()
        }
    }
}

func (e *Engine) tick() {
    schedules, err := e.scheduleService.ListAllEnabled(e.ctx)
    if err != nil {
        log.Error().Err(err).Msg("Failed to load enabled schedules")
        return
    }

    now := time.Now()
    for i := range schedules {
        s := &schedules[i]
        if s.TimingType == model.TimingTypeManual {
            continue // Manual schedules never auto-execute
        }
        if s.NextRunAt == nil || now.Before(*s.NextRunAt) {
            continue // Not due yet
        }

        // Execute in a goroutine to not block the tick loop
        e.wg.Add(1)
        go func(schedule model.Schedule) {
            defer e.wg.Done()
            e.executeSchedule(&schedule)
        }(*s)
    }
}

func (e *Engine) executeSchedule(schedule *model.Schedule) {
    log.Info().
        Str("schedule_id", schedule.ID.String()).
        Str("name", schedule.Name).
        Msg("Executing scheduled run")

    execution, err := e.executionService.CreateAndRun(e.ctx, schedule, model.TriggerTypeScheduled, nil)
    if err != nil {
        log.Error().Err(err).Str("schedule_id", schedule.ID.String()).Msg("Failed to execute schedule")
        return
    }

    // Update last_run_at and compute next_run_at
    now := time.Now()
    nextRun := computeNextRun(schedule.TimingType, schedule.TimingConfig, now)
    _ = e.scheduleService.UpdateRunTimes(e.ctx, schedule.ID, &now, nextRun)

    log.Info().
        Str("schedule_id", schedule.ID.String()).
        Str("status", string(execution.Status)).
        Int("tasks_succeeded", execution.TasksSucceeded).
        Int("tasks_failed", execution.TasksFailed).
        Msg("Schedule execution completed")
}
```

#### 3. Next Run Computation
**File**: `apps/api/internal/scheduler/timing.go`

```go
package scheduler

import (
    "encoding/json"
    "time"

    "github.com/tolga/terp/internal/model"
    "gorm.io/datatypes"
)

// TimingConfigData represents parsed timing configuration.
type TimingConfigData struct {
    Interval   int    `json:"interval,omitempty"`
    Time       string `json:"time,omitempty"`       // HH:MM
    DayOfWeek  *int   `json:"day_of_week,omitempty"`  // 0-6
    DayOfMonth *int   `json:"day_of_month,omitempty"` // 1-31
}

func parseTimingConfig(raw datatypes.JSON) TimingConfigData {
    var cfg TimingConfigData
    _ = json.Unmarshal(raw, &cfg)
    return cfg
}

// computeNextRun calculates the next run time based on timing type and config.
func computeNextRun(timingType model.TimingType, timingConfig datatypes.JSON, now time.Time) *time.Time {
    cfg := parseTimingConfig(timingConfig)

    var next time.Time
    switch timingType {
    case model.TimingTypeSeconds:
        next = now.Add(time.Duration(cfg.Interval) * time.Second)
    case model.TimingTypeMinutes:
        next = now.Add(time.Duration(cfg.Interval) * time.Minute)
    case model.TimingTypeHours:
        next = now.Add(time.Duration(cfg.Interval) * time.Hour)
    case model.TimingTypeDaily:
        next = nextDailyRun(cfg.Time, now)
    case model.TimingTypeWeekly:
        next = nextWeeklyRun(cfg.DayOfWeek, cfg.Time, now)
    case model.TimingTypeMonthly:
        next = nextMonthlyRun(cfg.DayOfMonth, cfg.Time, now)
    case model.TimingTypeManual:
        return nil // Manual schedules have no next run
    }
    return &next
}

func nextDailyRun(timeStr string, now time.Time) time.Time {
    // Parse HH:MM, create time for today at that time
    // If already past, schedule for tomorrow
    h, m := parseHHMM(timeStr)
    candidate := time.Date(now.Year(), now.Month(), now.Day(), h, m, 0, 0, now.Location())
    if candidate.Before(now) || candidate.Equal(now) {
        candidate = candidate.AddDate(0, 0, 1)
    }
    return candidate
}

func nextWeeklyRun(dayOfWeek *int, timeStr string, now time.Time) time.Time {
    // Find next occurrence of dayOfWeek at timeStr
    // ...
}

func nextMonthlyRun(dayOfMonth *int, timeStr string, now time.Time) time.Time {
    // Find next occurrence of dayOfMonth at timeStr
    // ...
}

func parseHHMM(s string) (int, int) {
    // Parse "HH:MM" format
    // ...
}
```

#### 4. Execution Orchestrator (in Schedule Service)
Add to `apps/api/internal/service/schedule.go`:

```go
// ExecuteSchedule runs all tasks in a schedule and records execution.
func (s *ScheduleService) ExecuteSchedule(ctx context.Context, scheduleID uuid.UUID, triggerType model.TriggerType, triggeredBy *uuid.UUID) (*model.ScheduleExecution, error) {
    schedule, err := s.scheduleRepo.GetByID(ctx, scheduleID)
    if err != nil {
        return nil, ErrScheduleNotFound
    }

    return s.CreateAndRun(ctx, schedule, triggerType, triggeredBy)
}

// CreateAndRun creates an execution record and runs all tasks sequentially.
func (s *ScheduleService) CreateAndRun(ctx context.Context, schedule *model.Schedule, triggerType model.TriggerType, triggeredBy *uuid.UUID) (*model.ScheduleExecution, error) {
    now := time.Now()

    // Create execution record
    execution := &model.ScheduleExecution{
        TenantID:    schedule.TenantID,
        ScheduleID:  schedule.ID,
        Status:      model.ExecutionStatusRunning,
        TriggerType: triggerType,
        TriggeredBy: triggeredBy,
        StartedAt:   &now,
        TasksTotal:  len(schedule.Tasks),
    }
    if err := s.executionRepo.Create(ctx, execution); err != nil {
        return nil, fmt.Errorf("failed to create execution: %w", err)
    }

    // Execute tasks in order
    succeeded := 0
    failed := 0
    for _, task := range schedule.Tasks {
        if !task.IsEnabled {
            // Create skipped task execution record
            s.recordTaskExecution(ctx, execution.ID, task, model.TaskExecutionStatusSkipped, nil)
            continue
        }

        taskStart := time.Now()
        // Create running task execution
        taskExec := &model.ScheduleTaskExecution{
            ExecutionID: execution.ID,
            TaskType:    task.TaskType,
            SortOrder:   task.SortOrder,
            Status:      model.TaskExecutionStatusRunning,
            StartedAt:   &taskStart,
        }
        _ = s.taskExecRepo.Create(ctx, taskExec)

        // Execute task
        var params map[string]interface{}
        _ = json.Unmarshal(task.Parameters, &params)
        result := s.taskExecutor.ExecuteTask(ctx, schedule.TenantID, string(task.TaskType), params)

        // Update task execution
        taskEnd := time.Now()
        taskExec.CompletedAt = &taskEnd
        if result.Success {
            taskExec.Status = model.TaskExecutionStatusCompleted
            succeeded++
        } else {
            taskExec.Status = model.TaskExecutionStatusFailed
            taskExec.ErrorMessage = &result.Error
            failed++
        }
        if result.Data != nil {
            resultJSON, _ := json.Marshal(result.Data)
            taskExec.Result = datatypes.JSON(resultJSON)
        }
        _ = s.taskExecRepo.Update(ctx, taskExec)
    }

    // Update execution status
    endTime := time.Now()
    execution.CompletedAt = &endTime
    execution.TasksSucceeded = succeeded
    execution.TasksFailed = failed
    if failed == 0 {
        execution.Status = model.ExecutionStatusCompleted
    } else if succeeded == 0 {
        execution.Status = model.ExecutionStatusFailed
    } else {
        execution.Status = model.ExecutionStatusPartial
    }
    _ = s.executionRepo.Update(ctx, execution)

    return execution, nil
}
```

The service needs a reference to the task executor:
```go
type ScheduleService struct {
    // ... repositories
    taskExecutor *scheduler.TaskExecutor  // Set via SetTaskExecutor method
}

func (s *ScheduleService) SetTaskExecutor(te *scheduler.TaskExecutor) {
    s.taskExecutor = te
}
```

#### 5. ListAllEnabled and UpdateRunTimes in Service

```go
// ListAllEnabled returns all enabled schedules across all tenants (for the engine).
func (s *ScheduleService) ListAllEnabled(ctx context.Context) ([]model.Schedule, error) {
    return s.scheduleRepo.ListEnabled(ctx)
}

// UpdateRunTimes updates the last_run_at and next_run_at for a schedule.
func (s *ScheduleService) UpdateRunTimes(ctx context.Context, id uuid.UUID, lastRunAt, nextRunAt *time.Time) error {
    return s.scheduleRepo.UpdateRunTimes(ctx, id, lastRunAt, nextRunAt)
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./internal/scheduler/...`
- [ ] Code compiles: `cd apps/api && go build ./internal/service/...`
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Task executor correctly dispatches to each task type
- [ ] Timing computation produces correct next run times for each timing type
- [ ] Engine loop correctly identifies due schedules

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 6: Handler Layer and Route Registration

### Overview
Implement HTTP handlers for schedule CRUD, task management, manual execution, execution logs, and task catalog. Wire everything in main.go.

### Changes Required:

#### 1. Schedule Handler
**File**: `apps/api/internal/handler/schedule.go`

```go
package handler

type ScheduleHandler struct {
    svc          *service.ScheduleService
    auditService *service.AuditLogService
}

func NewScheduleHandler(svc *service.ScheduleService) *ScheduleHandler {
    return &ScheduleHandler{svc: svc}
}

func (h *ScheduleHandler) SetAuditService(s *service.AuditLogService) {
    h.auditService = s
}
```

Handler methods (following `ExportInterfaceHandler` pattern):

- `List(w, r)` - GET /schedules - List all schedules for tenant
- `Get(w, r)` - GET /schedules/{id} - Get schedule with tasks
- `Create(w, r)` - POST /schedules - Create schedule with optional inline tasks
- `Update(w, r)` - PATCH /schedules/{id} - Update schedule
- `Delete(w, r)` - DELETE /schedules/{id} - Delete schedule
- `ListTasks(w, r)` - GET /schedules/{id}/tasks - List tasks for schedule
- `AddTask(w, r)` - POST /schedules/{id}/tasks - Add task
- `UpdateTask(w, r)` - PATCH /schedules/{id}/tasks/{taskId} - Update task
- `RemoveTask(w, r)` - DELETE /schedules/{id}/tasks/{taskId} - Remove task
- `Execute(w, r)` - POST /schedules/{id}/execute - Manual trigger
- `ListExecutions(w, r)` - GET /schedules/{id}/executions - Execution history
- `GetExecution(w, r)` - GET /schedule-executions/{id} - Execution detail with task logs
- `GetTaskCatalog(w, r)` - GET /scheduler/task-catalog - Task catalog

Each handler method follows the pattern:
1. Extract tenant ID from context
2. Parse URL params
3. Decode/validate request body (using generated models from `gen/models/`)
4. Map to service input
5. Call service method
6. Map domain model to response (using generated models)
7. Respond with JSON

Response mapping functions:
```go
func scheduleToResponse(s *model.Schedule) *models.Schedule { ... }
func scheduleListToResponse(schedules []model.Schedule) *models.ScheduleList { ... }
func scheduleExecutionToResponse(e *model.ScheduleExecution) *models.ScheduleExecution { ... }
func executionListToResponse(executions []model.ScheduleExecution) *models.ScheduleExecutionList { ... }
func taskCatalogToResponse() *models.TaskCatalog { ... }
```

Error handler:
```go
func handleScheduleError(w http.ResponseWriter, err error) {
    switch err {
    case service.ErrScheduleNotFound:
        respondError(w, http.StatusNotFound, "Schedule not found")
    case service.ErrScheduleNameRequired:
        respondError(w, http.StatusBadRequest, "Schedule name is required")
    case service.ErrScheduleNameExists:
        respondError(w, http.StatusConflict, "A schedule with this name already exists")
    case service.ErrScheduleTimingInvalid:
        respondError(w, http.StatusBadRequest, "Invalid timing configuration")
    case service.ErrScheduleTaskNotFound:
        respondError(w, http.StatusNotFound, "Schedule task not found")
    case service.ErrScheduleTaskTypeInvalid:
        respondError(w, http.StatusBadRequest, "Invalid task type")
    case service.ErrScheduleExecutionNotFound:
        respondError(w, http.StatusNotFound, "Schedule execution not found")
    default:
        respondError(w, http.StatusInternalServerError, "Internal server error")
    }
}
```

The `Execute` handler:
```go
func (h *ScheduleHandler) Execute(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid schedule ID")
        return
    }

    // Optionally parse triggered_by from request body or auth context
    var triggeredBy *uuid.UUID
    userID := middleware.UserIDFromContext(r.Context())
    if userID != uuid.Nil {
        triggeredBy = &userID
    }

    execution, err := h.svc.ExecuteSchedule(r.Context(), id, model.TriggerTypeManual, triggeredBy)
    if err != nil {
        handleScheduleError(w, err)
        return
    }

    // Audit log
    if h.auditService != nil {
        if tid, ok := middleware.TenantFromContext(r.Context()); ok {
            h.auditService.Log(r.Context(), r, service.LogEntry{
                TenantID:   tid,
                Action:     model.AuditActionCreate,
                EntityType: "schedule_execution",
                EntityID:   execution.ID,
            })
        }
    }

    respondJSON(w, http.StatusOK, scheduleExecutionToResponse(execution))
}
```

#### 2. Route Registration
**File**: `apps/api/internal/handler/routes.go` (add new function)

```go
// RegisterScheduleRoutes registers scheduler routes.
func RegisterScheduleRoutes(r chi.Router, h *ScheduleHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("scheduler.manage").String()

    r.Route("/schedules", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            r.Get("/{id}/tasks", h.ListTasks)
            r.Post("/{id}/tasks", h.AddTask)
            r.Patch("/{id}/tasks/{taskId}", h.UpdateTask)
            r.Delete("/{id}/tasks/{taskId}", h.RemoveTask)
            r.Post("/{id}/execute", h.Execute)
            r.Get("/{id}/executions", h.ListExecutions)
            return
        }

        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
        r.With(authz.RequirePermission(permManage)).Get("/{id}/tasks", h.ListTasks)
        r.With(authz.RequirePermission(permManage)).Post("/{id}/tasks", h.AddTask)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}/tasks/{taskId}", h.UpdateTask)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}/tasks/{taskId}", h.RemoveTask)
        r.With(authz.RequirePermission(permManage)).Post("/{id}/execute", h.Execute)
        r.With(authz.RequirePermission(permManage)).Get("/{id}/executions", h.ListExecutions)
    })

    // Execution detail (not nested under schedules)
    if authz == nil {
        r.Get("/schedule-executions/{id}", h.GetExecution)
    } else {
        r.With(authz.RequirePermission(permManage)).Get("/schedule-executions/{id}", h.GetExecution)
    }

    // Task catalog (read-only)
    if authz == nil {
        r.Get("/scheduler/task-catalog", h.GetTaskCatalog)
    } else {
        r.With(authz.RequirePermission(permManage)).Get("/scheduler/task-catalog", h.GetTaskCatalog)
    }
}
```

#### 3. Permission Registration
**File**: `apps/api/internal/permissions/permissions.go`

Add to `allPermissions` slice:
```go
{ID: permissionID("scheduler.manage"), Resource: "scheduler", Action: "manage", Description: "Manage schedules and trigger executions"},
```

#### 4. Config Addition
**File**: `apps/api/internal/config/config.go`

Add to Config struct:
```go
type Config struct {
    // ... existing fields
    SchedulerEnabled bool
}
```

In `Load()`:
```go
cfg.SchedulerEnabled = getEnv("SCHEDULER_ENABLED", "true") == "true"
```

#### 5. Wire in main.go
**File**: `apps/api/cmd/server/main.go`

Add after existing repository initialization:
```go
// Initialize scheduler repositories
scheduleRepo := repository.NewScheduleRepository(db)
scheduleTaskRepo := repository.NewScheduleTaskRepository(db)
scheduleExecutionRepo := repository.NewScheduleExecutionRepository(db)
scheduleTaskExecutionRepo := repository.NewScheduleTaskExecutionRepository(db)
```

Add after existing service initialization:
```go
// Initialize scheduler services
scheduleService := service.NewScheduleService(
    scheduleRepo, scheduleTaskRepo,
    scheduleExecutionRepo, scheduleTaskExecutionRepo,
)
```

Add after handler initialization:
```go
// Initialize scheduler components
taskExecutor := scheduler.NewTaskExecutor(recalcService, monthlyCalcService, employeeRepo)
scheduleService.SetTaskExecutor(taskExecutor)

scheduleHandler := handler.NewScheduleHandler(scheduleService)
scheduleHandler.SetAuditService(auditLogService)
```

Add route registration in the tenant-scoped group:
```go
handler.RegisterScheduleRoutes(r, scheduleHandler, authzMiddleware)
```

Add scheduler engine startup before HTTP server start:
```go
// Start scheduler engine (if enabled)
var schedulerEngine *scheduler.Engine
if cfg.SchedulerEnabled {
    schedulerEngine = scheduler.NewEngine(scheduleService, scheduleService, taskExecutor, tenantRepo)
    schedulerEngine.Start()
}
```

Update graceful shutdown to stop the scheduler:
```go
// Graceful shutdown
quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit
log.Info().Msg("Shutting down server...")

// Stop scheduler first
if schedulerEngine != nil {
    schedulerEngine.Stop()
}

shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

if err := srv.Shutdown(shutdownCtx); err != nil {
    log.Fatal().Err(err).Msg("Server forced to shutdown")
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Full application compiles: `cd apps/api && go build ./cmd/server/...`
- [ ] No linting errors: `make lint`
- [ ] Server starts successfully: `make dev` (verify scheduler engine log message)

#### Manual Verification:
- [ ] API endpoints accessible via Swagger UI
- [ ] Create a schedule via POST /api/v1/schedules
- [ ] Add tasks to the schedule via POST /api/v1/schedules/{id}/tasks
- [ ] Trigger manual execution via POST /api/v1/schedules/{id}/execute
- [ ] Verify execution logs via GET /api/v1/schedules/{id}/executions
- [ ] Verify task catalog via GET /api/v1/scheduler/task-catalog
- [ ] Pause schedule (set is_enabled=false), verify no automatic execution
- [ ] Resume schedule (set is_enabled=true), verify execution resumes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 7: Tests

### Overview
Write unit tests for the scheduler components: timing computation, task catalog validation, service logic, and handler endpoints.

### Changes Required:

#### 1. Timing Tests
**File**: `apps/api/internal/scheduler/timing_test.go`

Test cases:
- `TestComputeNextRun_Seconds` - Verify interval-based next run for seconds
- `TestComputeNextRun_Minutes` - Verify interval-based next run for minutes
- `TestComputeNextRun_Hours` - Verify interval-based next run for hours
- `TestComputeNextRun_Daily` - Verify daily at specific time, handles already-past time
- `TestComputeNextRun_Weekly` - Verify weekly on specific day+time
- `TestComputeNextRun_Monthly` - Verify monthly on specific day+time
- `TestComputeNextRun_Manual` - Returns nil
- `TestParseHHMM` - Parse various time formats

#### 2. Task Catalog Tests
**File**: `apps/api/internal/service/taskcatalog_test.go`

- `TestTaskCatalog_AllTypes` - Verify all 6 task types present
- `TestValidTaskTypes` - Verify valid/invalid types

#### 3. Service Tests
**File**: `apps/api/internal/service/schedule_test.go`

- `TestScheduleService_Create` - Create with valid input
- `TestScheduleService_Create_DuplicateName` - Reject duplicate names
- `TestScheduleService_Create_InvalidTimingType` - Reject bad timing type
- `TestScheduleService_Create_InvalidTimingConfig` - Reject missing interval/time
- `TestScheduleService_Update` - Partial update
- `TestScheduleService_Update_ToggleEnabled` - Enable/disable
- `TestScheduleService_Delete` - Delete schedule
- `TestScheduleService_AddTask` - Add valid task
- `TestScheduleService_AddTask_InvalidType` - Reject invalid task type
- `TestScheduleService_ExecuteSchedule_OrderedTasks` - Tasks run in sort_order
- `TestScheduleService_ExecuteSchedule_SkipDisabledTasks` - Disabled tasks are skipped
- `TestScheduleService_ExecuteSchedule_PartialFailure` - Some tasks fail, status is partial

#### 4. Handler Tests
**File**: `apps/api/internal/handler/schedule_test.go`

Test the HTTP endpoints following existing handler test patterns (if any exist in the codebase). Cover:
- CRUD schedule endpoints
- Task management endpoints
- Manual execution endpoint
- Execution log endpoints
- Task catalog endpoint
- Error responses for invalid inputs

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v -run TestSchedule ./internal/service/...`
- [ ] All tests pass: `cd apps/api && go test -v -run TestComputeNextRun ./internal/scheduler/...`
- [ ] All tests pass: `cd apps/api && go test -v -run TestTaskCatalog ./internal/service/...`
- [ ] Full test suite: `make test`
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Test coverage is adequate for critical paths
- [ ] Edge cases are covered (empty task list, all tasks fail, manual trigger)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Testing Strategy

### Unit Tests:
- Timing computation for all 7 timing types
- Schedule CRUD validation (name uniqueness, timing config validation)
- Task catalog completeness
- Task execution dispatch (mock services)
- Execution status computation (completed/failed/partial)
- Task ordering preservation

### Integration Tests:
- Create schedule with tasks, trigger manual execution, verify execution logs
- Pause schedule, verify no execution during pause
- Resume schedule, verify execution resumes
- Daily calculation task executes RecalcService correctly

### Manual Testing Steps:
1. Start server with `make dev`
2. Verify scheduler engine start log message
3. Create a schedule with timing_type=seconds, interval=30 via POST /api/v1/schedules
4. Add calculate_days and alive_check tasks
5. Wait 30+ seconds, check execution logs appear
6. Pause schedule, wait, verify no new executions
7. Trigger manual execution, verify immediate execution
8. Create a manual-only schedule, verify it never auto-executes
9. Verify task catalog endpoint returns all 6 types

## Performance Considerations

- The scheduler engine ticks every 10 seconds to check for due schedules. This is lightweight.
- Each schedule execution runs in its own goroutine to avoid blocking the tick loop.
- The `ListEnabled` query uses an index on `(tenant_id, is_enabled)` and `(next_run_at)` for efficient filtering.
- Long-running tasks (e.g., calculate_days for thousands of employees) should not block other schedules.
- Consider adding a maximum concurrent execution limit in future iterations if needed.

## Migration Notes

- Migrations 000062-000065 are additive (new tables only).
- No existing data is affected.
- Rollback is safe: dropping the new tables has no impact on existing functionality.
- The scheduler is opt-in via `SCHEDULER_ENABLED` environment variable (defaults to true).

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-022-zmi-server-scheduler.md`
- Research document: `thoughts/shared/research/2026-01-30-ZMI-TICKET-022-zmi-server-scheduler.md`
- ZMI manual reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (lines 958, 965, 2037-2041)
- Export interface pattern: `apps/api/internal/handler/exportinterface.go`, `apps/api/internal/service/exportinterface.go`, `apps/api/internal/repository/exportinterface.go`
- Payroll export migration pattern: `db/migrations/000061_create_payroll_exports.up.sql`
- Recalc service: `apps/api/internal/service/recalc.go`
- Monthly calc service: `apps/api/internal/service/monthlycalc.go`
