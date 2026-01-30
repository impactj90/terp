# Research: ZMI-TICKET-032 - Weekly and Monthly Macros

**Date**: 2026-01-30
**Ticket**: ZMI-TICKET-032
**Status**: Research complete

## 1. Ticket Summary

The ticket requires implementing macro definitions and scheduling for weekly and monthly automation:
- Macro data model (name, type weekly/monthly, script/action, active flag)
- Macro assignment to employees or tariffs
- Execution scheduling (weekday for weekly, day-of-month for monthly with fallback to last day)
- Macros execute after daily calculation
- CRUD endpoints, assignment endpoints, trigger execution endpoint
- OpenAPI spec coverage

Dependencies: Tariff definitions (ZMI-TICKET-018), ZMI Server scheduler (ZMI-TICKET-022)

## 2. Reference Manual Coverage

### 2.1 Macro References in the Reference Manual

The reference manual (`thoughts/shared/reference/zmi-calculation-manual-reference.md`) contains limited explicit macro documentation. The relevant mentions are:

**Section 14 (Tariff / Employment Contract), Page 89 context:**
- "Weekly target hours: The entered value can be used for a macro."
- "Monthly target hours: The entered value can be used for a macro."
- "Annual target hours: The entered value can be used for a macro."

This indicates that tariff-level target hour fields (weekly, monthly, annual) serve as input data for macros. The macros can reference these values during execution.

**No dedicated sections 4.10.4 or 4.10.5 exist in the current reference manual.** The reference manual does not contain sections numbered 4.10.x. The ticket references these sections, but they are not present in the extracted reference material. The ticket's requirements themselves serve as the primary specification.

### 2.2 Abgleich (Section 7)

Section 7 covers "Abgleich - Rounding" which is about booking time rounding/adjustment, not directly related to macros. The section 3.4.4.5 reference in the ticket does not appear to map to content in the current reference file. The Abgleich concept concerns time-booking rounding rules, not macro execution.

## 3. Existing Codebase Patterns

### 3.1 Project Structure

The project follows clean architecture in `apps/api/internal/`:

```
handler/   - HTTP handlers (request parsing, response formatting)
service/   - Business logic (validation, orchestration)
repository/- Data access (GORM queries, DB wrapper)
model/     - Domain models (GORM structs)
middleware/- Auth, tenant context injection
auth/      - JWT management, dev user simulation
config/    - Environment config loading
```

### 3.2 CRUD Feature Pattern

Each feature follows a consistent layered pattern. Using tariff as a representative example:

**Model layer** (`apps/api/internal/model/tariff.go`):
- GORM struct with UUID primary key, TenantID, timestamps
- Custom type constants (e.g., `RhythmType`, `CreditType`, `VacationBasis`)
- `TableName()` method returning the SQL table name
- Helper methods on the struct (e.g., `GetAnnualVacationDays()`, `GetDayPlanIDForDate()`)
- Relation fields with GORM `foreignKey` tags

**Repository layer** (`apps/api/internal/repository/tariff.go`):
- Struct wrapping `*DB`
- Constructor `NewXxxRepository(db *DB) *XxxRepository`
- Standard methods: `Create`, `GetByID`, `GetByTenantAndID`, `List`, `Update`, `Delete`
- Sentinel error variables (e.g., `ErrTariffNotFound`)
- Uses `r.db.GORM.WithContext(ctx)` for all queries
- Preloads relations where needed
- Tenant-scoped queries with `WHERE tenant_id = ?`

**Service layer** (`apps/api/internal/service/tariff.go`):
- Defines a repository interface (unexported)
- Input structs for Create/Update operations
- Constructor `NewXxxService(repo xxxRepository) *XxxService`
- Business validation before repository calls
- Maps service errors to domain-level sentinel errors
- Checks for name/code uniqueness within tenant

**Handler layer** (`apps/api/internal/handler/tariff.go`):
- Struct wrapping `*service.XxxService`
- Constructor `NewXxxHandler(svc *service.XxxService) *XxxHandler`
- Each method: extract tenant from context, parse request, call service, map to response
- Uses `models.CreateXxxRequest` / `models.UpdateXxxRequest` from generated models
- Validates requests with `req.Validate(nil)`
- Maps domain models to `gen/models` response types
- Error handling via dedicated `handleXxxError` function

**Route registration** (`apps/api/internal/handler/routes.go`):
- Function signature: `RegisterXxxRoutes(r chi.Router, h *XxxHandler, authz *middleware.AuthorizationMiddleware)`
- Uses `r.Route("/xxx", func(r chi.Router) { ... })`
- Permission-guarded with `authz.RequirePermission(permManage)`
- Pattern: if authz is nil (testing), register plain routes; else register with permission middleware
- Standard CRUD: GET `/`, POST `/`, GET `/{id}`, PATCH `/{id}`, DELETE `/{id}`

**Main.go wiring** (`apps/api/cmd/server/main.go`):
- Initialize repo: `xxxRepo := repository.NewXxxRepository(db)`
- Initialize service: `xxxService := service.NewXxxService(xxxRepo, ...)`
- Initialize handler: `xxxHandler := handler.NewXxxHandler(xxxService)`
- Register routes in tenant-scoped group: `handler.RegisterXxxRoutes(r, xxxHandler, authzMiddleware)`

### 3.3 Existing Tariff Infrastructure (ZMI-TICKET-018 Dependency)

**Model** (`apps/api/internal/model/tariff.go`):
- `Tariff` struct with 30+ fields including vacation, target hours, rhythm, flextime, and capping settings
- Related structs: `TariffBreak`, `TariffWeekPlan`, `TariffDayPlan`
- Custom types: `VacationBasis`, `CreditType`, `RhythmType`
- Helper methods for calculating pro-rated vacation, rhythm-based day plan lookup
- Target hour fields relevant to macros: `DailyTargetHours`, `WeeklyTargetHours`, `MonthlyTargetHours`, `AnnualTargetHours`

**Employee-Tariff Assignment** (`apps/api/internal/model/employeetariffassignment.go`):
- `EmployeeTariffAssignment` struct with EmployeeID, TariffID, EffectiveFrom, EffectiveTo, OverwriteBehavior
- Provides date-ranged tariff assignment to employees
- `ContainsDate()` helper method

**Repository** (`apps/api/internal/repository/tariff.go`):
- Standard CRUD with tenant scoping
- Preloads Breaks, TariffWeekPlans, TariffDayPlans, WeekPlan relations

**Service** (`apps/api/internal/service/tariff.go`):
- Create, GetByID, List, Update, Delete
- Code uniqueness validation within tenant

**Handler** (`apps/api/internal/handler/tariff.go`):
- CRUD handlers plus break management endpoints (CreateBreak, DeleteBreak)
- Maps between domain models and generated OpenAPI models

**OpenAPI** (`api/paths/tariffs.yaml`, `api/schemas/tariffs.yaml`):
- Full CRUD endpoints under `/tariffs`
- Sub-resource endpoints: `/tariffs/{id}/breaks`
- Schema includes all ZMI fields

### 3.4 Existing Employee Infrastructure

**Model** (`apps/api/internal/model/employee.go`):
- `Employee` struct with TariffID foreign key
- Target hour override fields: `DailyTargetHours`, `WeeklyTargetHours`, `MonthlyTargetHours`, `AnnualTargetHours`
- Relations to Tariff, Department, CostCenter, EmploymentType, groups

### 3.5 Existing Scheduler Infrastructure (ZMI-TICKET-022 Dependency)

The scheduler is fully implemented with the following components:

**Model** (`apps/api/internal/model/schedule.go`):
- `Schedule` - Core schedule definition with TimingType enum (seconds, minutes, hours, daily, weekly, monthly, manual) and JSONB TimingConfig
- `ScheduleTask` - Ordered task within a schedule with TaskType, SortOrder, Parameters (JSONB)
- `ScheduleExecution` - Execution run record with status tracking
- `ScheduleTaskExecution` - Individual task execution within a run
- Task types defined: `calculate_days`, `calculate_months`, `backup_database`, `send_notifications`, `export_data`, `alive_check`, `terminal_sync`, `terminal_import`
- Execution statuses: pending, running, completed, failed, partial
- Trigger types: scheduled, manual

**Service - Schedule CRUD** (`apps/api/internal/service/schedule.go`):
- Full CRUD for schedules and tasks
- Timing computation: `computeNextRun()`, `computeNextWeeklyRun()`, `computeNextMonthlyRun()`
- Monthly run already handles day capping: `if dayOfMonth > 28 { dayOfMonth = 28 }` (conservative)
- Validates timing types and task types against allowlists

**Service - Scheduler Executor** (`apps/api/internal/service/scheduler_executor.go`):
- `TaskExecutor` interface: `Execute(ctx, tenantID, params) (result, error)`
- `SchedulerExecutor` orchestrates schedule runs
- Registry pattern: `RegisterHandler(taskType, handler)` maps task types to executors
- `TriggerExecution()` for manual triggers
- `RunDueSchedules()` called by engine to find and execute due schedules
- Records execution results with task-level granularity

**Service - Scheduler Engine** (`apps/api/internal/service/scheduler_engine.go`):
- Background goroutine ticking every 30 seconds
- Calls `RunDueSchedules()` on each tick
- Graceful shutdown via `Stop()`

**Service - Task Catalog** (`apps/api/internal/service/scheduler_catalog.go`):
- `GetTaskCatalog()` returns list of available task types with names, descriptions, and parameter schemas

**Service - Task Handlers** (`apps/api/internal/service/scheduler_tasks.go`):
- Concrete task handler implementations: `AliveCheckTaskHandler`, `CalculateDaysTaskHandler`, `CalculateMonthsTaskHandler`, `SendNotificationsTaskHandler`, `TerminalImportTaskHandler`, `PlaceholderTaskHandler`
- Each implements the `TaskExecutor` interface

**Repository** (`apps/api/internal/repository/schedule.go`):
- Full CRUD for Schedule, ScheduleTask, ScheduleExecution, ScheduleTaskExecution
- `ListDueSchedules()` finds enabled schedules with `next_run_at <= now`

**Handler** (`apps/api/internal/handler/schedule.go`):
- `ScheduleHandler` wraps both `ScheduleService` and `SchedulerExecutor`
- CRUD endpoints, task management (list/add/update/remove), execution trigger, execution history
- Maps all domain models to generated response types

**Route Registration** (`apps/api/internal/handler/routes.go`):
- `RegisterScheduleRoutes` with `schedules.manage` permission
- Schedule CRUD: `/schedules` (GET, POST), `/schedules/{id}` (GET, PATCH, DELETE)
- Task management: `/schedules/{id}/tasks` (GET, POST), `/schedules/{id}/tasks/{taskId}` (PATCH, DELETE)
- Execution: `/schedules/{id}/execute` (POST), `/schedules/{id}/executions` (GET)
- Execution detail: `/schedule-executions/{id}` (GET)
- Task catalog: `/scheduler/task-catalog` (GET)

**Main.go Wiring** (`apps/api/cmd/server/main.go`):
```go
scheduleRepo := repository.NewScheduleRepository(db)
scheduleService := service.NewScheduleService(scheduleRepo)
schedulerExecutor := service.NewSchedulerExecutor(scheduleRepo)

// Register task handlers
schedulerExecutor.RegisterHandler(model.TaskTypeAliveCheck, service.NewAliveCheckTaskHandler())
schedulerExecutor.RegisterHandler(model.TaskTypeCalculateDays, service.NewCalculateDaysTaskHandler(recalcService))
// ... more handlers

scheduleHandler := handler.NewScheduleHandler(scheduleService, schedulerExecutor)
schedulerEngine := service.NewSchedulerEngine(schedulerExecutor, 30*time.Second)
schedulerEngine.Start()
```

### 3.6 OpenAPI Spec Patterns

**Root file** (`api/openapi.yaml`):
- Swagger 2.0 format
- Tags section lists all feature domains
- Paths reference `paths/*.yaml` files using `$ref`
- Path references use tilde encoding: `$ref: 'paths/tariffs.yaml#/~1tariffs'`

**Path files** (`api/paths/*.yaml`):
- One file per domain (e.g., `tariffs.yaml`, `schedules.yaml`)
- Define REST endpoints with tags, operationId, parameters, responses
- Reference schemas using `$ref: '../schemas/xxx.yaml#/SchemaName'`
- Reference error responses using `$ref: '../responses/errors.yaml#/Xxx'`

**Schema files** (`api/schemas/*.yaml`):
- One file per domain (e.g., `tariffs.yaml`, `schedules.yaml`)
- Define response schemas, create/update request schemas, list wrapper schemas
- Use `x-nullable: true` for optional fields
- Use enums for constrained values

**Generated models** (`apps/api/gen/models/`):
- Generated from the bundled OpenAPI spec via `make generate`
- Used in handlers for request parsing and response formatting
- Examples: `models.CreateScheduleRequest`, `models.Schedule`, `models.ScheduleList`

### 3.7 Migration Patterns

**File naming**: `{number}_{description}.up.sql` / `{number}_{description}.down.sql`
- Current highest number: `000076` (shift planning)
- Next available: `000077`

**SQL pattern** (from `000062_create_schedules.up.sql`, `000076_create_shift_planning.up.sql`):
```sql
CREATE TABLE xxx (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- domain fields
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)  -- if applicable
);

CREATE INDEX idx_xxx_tenant ON xxx(tenant_id);
-- additional indexes

CREATE TRIGGER update_xxx_updated_at
    BEFORE UPDATE ON xxx
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE xxx IS 'Description';
```

Down migration: `DROP TABLE IF EXISTS xxx CASCADE;`

### 3.8 Existing Macro-Related Code

**No macro-related code exists in the codebase.** There are:
- No `macro` model files
- No `macro` handler, service, or repository files
- No `macro` OpenAPI path or schema files
- No `macro` migration files
- No `macro` generated model files

The word "macro" only appears in the `pnpm-lock.yaml` (unrelated npm package). The feature is entirely new.

## 4. Dependency Analysis

### 4.1 Tariff Dependency (ZMI-TICKET-018) - SATISFIED

The tariff infrastructure is fully implemented:
- Tariff model with all ZMI fields including target hours (weekly, monthly, annual) that macros reference
- Employee-tariff assignment model with date-ranged assignments
- Full CRUD at all layers
- OpenAPI spec and generated models

### 4.2 Scheduler Dependency (ZMI-TICKET-022) - SATISFIED

The scheduler infrastructure is fully implemented:
- Schedule model with weekly and monthly timing types already supported
- `computeNextWeeklyRun()` and `computeNextMonthlyRun()` exist in `schedule.go` service
- TaskExecutor interface for adding new task types
- Registry pattern for handler registration
- Engine runs on 30-second tick cycle
- Execution history tracking at schedule and task level

### 4.3 Integration Points for Macros

The macro feature can integrate with the existing scheduler in two ways:
1. **As a new task type**: Add a `macro_execution` task type to the scheduler. Macros would be triggered by scheduler tasks that reference macro IDs in their parameters.
2. **As an independent scheduling system**: Macros could have their own execution scheduling separate from the scheduler, but this would duplicate timing logic.

The existing scheduler already supports:
- Weekly timing with `day_of_week` and `time` config
- Monthly timing with `day_of_month` and `time` config
- The `computeNextMonthlyRun()` already handles day capping (currently caps at 28)

The ticket requirement "macros execute after daily calculation" means macro execution must be ordered after `calculate_days` tasks in the scheduler pipeline, or triggered as a post-calculation hook.

## 5. Key Files Summary

### Models
- `/home/tolga/projects/terp/apps/api/internal/model/tariff.go` - Tariff model with target hour fields referenced by macros
- `/home/tolga/projects/terp/apps/api/internal/model/employee.go` - Employee model with tariff FK and target hour overrides
- `/home/tolga/projects/terp/apps/api/internal/model/employeetariffassignment.go` - Date-ranged tariff assignment
- `/home/tolga/projects/terp/apps/api/internal/model/schedule.go` - Schedule, ScheduleTask, ScheduleExecution, ScheduleTaskExecution models
- `/home/tolga/projects/terp/apps/api/internal/model/base.go` - BaseModel with ID, CreatedAt, UpdatedAt

### Handlers
- `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` - All route registration functions
- `/home/tolga/projects/terp/apps/api/internal/handler/schedule.go` - Schedule handler with response mapping
- `/home/tolga/projects/terp/apps/api/internal/handler/tariff.go` - Tariff handler pattern
- `/home/tolga/projects/terp/apps/api/internal/handler/response.go` - respondJSON, respondError helpers

### Services
- `/home/tolga/projects/terp/apps/api/internal/service/schedule.go` - Schedule CRUD with timing computation
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_executor.go` - TaskExecutor interface and execution orchestration
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_engine.go` - Background scheduler engine
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_catalog.go` - Task type catalog
- `/home/tolga/projects/terp/apps/api/internal/service/scheduler_tasks.go` - Concrete task handler implementations
- `/home/tolga/projects/terp/apps/api/internal/service/tariff.go` - Tariff service pattern

### Repositories
- `/home/tolga/projects/terp/apps/api/internal/repository/schedule.go` - Schedule repository pattern
- `/home/tolga/projects/terp/apps/api/internal/repository/tariff.go` - Tariff repository pattern

### OpenAPI
- `/home/tolga/projects/terp/api/openapi.yaml` - Root spec file with tags and path references
- `/home/tolga/projects/terp/api/paths/schedules.yaml` - Schedule endpoint definitions
- `/home/tolga/projects/terp/api/paths/tariffs.yaml` - Tariff endpoint definitions
- `/home/tolga/projects/terp/api/schemas/schedules.yaml` - Schedule schemas
- `/home/tolga/projects/terp/api/schemas/tariffs.yaml` - Tariff schemas
- `/home/tolga/projects/terp/api/schemas/employee-tariff-assignments.yaml` - Assignment schema pattern

### Migrations
- `/home/tolga/projects/terp/db/migrations/000062_create_schedules.up.sql` - Schedule migration pattern
- `/home/tolga/projects/terp/db/migrations/000076_create_shift_planning.up.sql` - Latest migration (highest number)

### Main Wiring
- `/home/tolga/projects/terp/apps/api/cmd/server/main.go` - Repository/service/handler initialization and route registration

## 6. Observations

1. The next migration number is `000077`.
2. No macro code exists anywhere in the codebase - this is a greenfield feature.
3. The scheduler already has weekly and monthly timing with `computeNextWeeklyRun()` and `computeNextMonthlyRun()`.
4. The monthly run computation caps at day 28 (conservative). The ticket requires fallback to last day of month when configured day exceeds month length (e.g., day 31 in February runs on Feb 28/29).
5. The `TaskExecutor` interface provides a clean extension point for a macro execution task type.
6. The tariff model already has `WeeklyTargetHours`, `MonthlyTargetHours`, and `AnnualTargetHours` fields that macros reference.
7. The employee model has its own override fields for the same target hours.
8. The employee-tariff assignment model provides the pattern for a "macro assignment" model (linking macros to employees or tariffs).
9. All existing CRUD features use generated models from `gen/models/` for request/response payloads.
10. The ticket mentions "script or predefined action" for macros but notes this is "to be defined," so the initial implementation may use predefined action types rather than a scripting system.
