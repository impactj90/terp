# Research: ZMI-TICKET-027 - Terminal Integration and Raw Booking Ingest

**Ticket**: ZMI-TICKET-027
**Date**: 2026-01-30
**Status**: Research Complete
**Dependencies**: ZMI-TICKET-011 (Booking Ingest/Edit), ZMI-TICKET-022 (Scheduler)

---

## 1. Current State Analysis

### 1.1 Booking System

The existing booking system is fully implemented with the following components:

- **Model**: `apps/api/internal/model/booking.go` (lines 1-95)
  - `Booking` struct with `Source` field (type `BookingSource`, varchar 20)
  - Source enum constants: `BookingSourceWeb`, `BookingSourceTerminal`, `BookingSourceAPI`, `BookingSourceImport`, `BookingSourceCorrection`
  - `TerminalID` field exists as `*uuid.UUID` (nullable)
  - Three time values: `OriginalTime`, `EditedTime` (both `int`, minutes from midnight, not null), `CalculatedTime` (`*int`, nullable)
  - Methods: `TimeString()`, `EffectiveTime()`, `IsEdited()`, `MinutesToTime()`

- **Database table**: `db/migrations/000022_create_bookings.up.sql`
  - `source VARCHAR(20) DEFAULT 'web'`
  - `terminal_id UUID` (nullable, no FK constraint)
  - Indexes: `idx_bookings_tenant`, `idx_bookings_employee_date`, `idx_bookings_date`, `idx_bookings_pair`
  - No index on `source` column currently
  - No index on `terminal_id` column currently

- **Repository**: `apps/api/internal/repository/booking.go` (lines 1-351)
  - `BookingFilter` struct includes `Source *model.BookingSource` filter field
  - `List()` applies `source` filter via `query.Where("source = ?", *filter.Source)`
  - CRUD operations: `Create`, `GetByID`, `GetWithDetails`, `Update`, `Delete`
  - Query methods: `List`, `GetByEmployeeAndDate`, `GetByEmployeeAndDateRange`, `GetByDateRange`, `GetUnpaired`
  - Bulk operations: `UpdateCalculatedTimes`, `DeleteByDateRange`, `CountByDateRange`, `Upsert`

- **Service**: `apps/api/internal/service/booking.go` (lines 1-267)
  - `CreateBookingInput` includes `Source model.BookingSource` and `TerminalID *uuid.UUID`
  - `Create()` validates time, checks month closure, validates booking type, creates booking, triggers recalculation
  - `Update()` only allows `EditedTime` and `Notes` changes, clears `CalculatedTime` on edit
  - `Delete()` checks month closure, deletes, triggers recalculation

- **Handler**: `apps/api/internal/handler/booking.go` (lines 1-978)
  - `Create()` hardcodes `Source: model.BookingSourceWeb` for HTTP-created bookings
  - `modelToResponse()` maps `TerminalID` to response when present
  - Full audit logging on create, update, delete operations

### 1.2 Terminal Bookings - Evaluation View

An evaluation endpoint for terminal bookings already exists, filtering the existing `bookings` table by `source='terminal'`:

- **Handler**: `apps/api/internal/handler/evaluation.go` (lines 124-164)
  - `ListTerminalBookings()` at `GET /evaluations/terminal-bookings`
  - Requires date range (`from`, `to`), supports `employee_id`, `department_id` filters
  - Applies data scope filtering (tenant, department, employee scopes)

- **Service**: `apps/api/internal/service/evaluation.go` (lines 239-335)
  - `EvalTerminalBookingFilter` struct with `TenantID`, `From`, `To`, `EmployeeID`, `DepartmentID`, scope fields, pagination
  - `ListTerminalBookings()` creates a `BookingFilter` with `Source: &terminalSource` where `terminalSource = model.BookingSourceTerminal`
  - `mapTerminalBookingToEval()` maps to `models.EvaluationTerminalBooking` with both `OriginalTime`/`OriginalTimeString` and `EditedTime`/`EditedTimeString` plus `WasEdited` boolean

- **OpenAPI paths**: `api/paths/evaluations.yaml` (lines 142-194)
  - `GET /evaluations/terminal-bookings` defined with `from`, `to`, `employee_id`, `department_id`, `limit`, `page` parameters
  - Response schema: `EvaluationTerminalBookingList`

- **OpenAPI schemas**: `api/schemas/evaluations.yaml` (lines 145-208)
  - `EvaluationTerminalBooking` with fields: `id`, `employee_id`, `booking_date`, `booking_type_id`, `original_time`, `original_time_string`, `edited_time`, `edited_time_string`, `calculated_time`, `was_edited`, `terminal_id`, `source`, `created_at`, `employee` (EmployeeSummary), `booking_type` (BookingTypeSummary)
  - `EvaluationTerminalBookingList` with `data` array and `meta` (PaginationMeta)

- **Generated models**: `apps/api/gen/models/evaluation_terminal_booking.go` and `evaluation_terminal_booking_list.go` exist

### 1.3 No Separate Raw Terminal Bookings Table

Currently, there is NO separate `terminal_bookings` or `raw_terminal_bookings` table. Terminal bookings are stored directly in the `bookings` table with `source='terminal'`. The ticket explicitly states "Raw terminal bookings are stored separately from processed bookings."

### 1.4 Employee Identification

Employees have fields relevant to terminal identification:

- **Model**: `apps/api/internal/model/employee.go` (lines 11-86)
  - `PIN string` (varchar 20, not null) - used for terminal identification
  - `PersonnelNumber string` (varchar 50, not null)
  - `EmployeeCard` struct (lines 124-141) with `CardNumber`, `CardType`, `ValidFrom`, `ValidTo`, `IsActive`

### 1.5 Booking Types

- **Model**: `apps/api/internal/model/bookingtype.go` (lines 1-55)
  - `BookingDirection`: `in` or `out`
  - `BookingCategory`: `work`, `break`, `business_trip`, `other`
  - Standard types: A1 (Kommen/in), A2 (Gehen/out), P1 (Break start/out), P2 (Break end/in), D1 (Work errand start/out), D2 (Work errand end/in)

---

## 2. Relevant Code Patterns

### 2.1 Migration Pattern

**Latest migration**: `000070` (`db/migrations/000070_create_employee_messages.up.sql`)

Standard migration structure (from migration 000070):
```sql
-- =============================================================
-- Header comment with description
-- Ticket reference
-- =============================================================

CREATE TABLE table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- domain-specific columns
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_table_name_tenant ON table_name(tenant_id);
-- additional indexes

CREATE TRIGGER update_table_name_updated_at
    BEFORE UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE table_name IS 'description';
```

Down migrations follow the pattern: `DROP TABLE IF EXISTS table_name;`

New migrations would start at **000071**.

### 2.2 Model Pattern

All models use:
- `uuid.UUID` for IDs with `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
- `TenantID uuid.UUID` with `gorm:"type:uuid;not null;index"`
- `CreatedAt time.Time` with `gorm:"default:now()"`
- `UpdatedAt time.Time` with `gorm:"default:now()"`
- `TableName()` method returning the table name
- GORM struct tags for column types
- JSON struct tags for serialization
- Nullable fields use pointers (e.g., `*uuid.UUID`, `*string`, `*time.Time`)

### 2.3 Repository Pattern

Repositories follow:
- `NewXxxRepository(db *DB) *XxxRepository` constructor
- `db *DB` field (which has both `GORM *gorm.DB` and `Pool *pgxpool.Pool`)
- CRUD methods accepting `context.Context` as first parameter
- Filter structs for `List()` methods with pagination (Limit, Offset)
- Error variables at package level (e.g., `var ErrBookingNotFound = errors.New("booking not found")`)
- GORM query builder pattern with `WithContext(ctx)`, `Where()`, `Find()`, `Count()`
- Preload for relations: `.Preload("Employee").Preload("BookingType")`

### 2.4 Service Pattern

Services follow:
- Interface-based dependency injection (private interfaces defined per service file)
- `NewXxxService(deps...) *XxxService` constructor
- Business logic validation before repository calls
- Error wrapping and sentinel errors
- Test files use testify `mock.Mock` for dependency mocking

Example interface pattern (`apps/api/internal/service/booking.go` lines 23-30):
```go
type bookingRepositoryForService interface {
    Create(ctx context.Context, booking *model.Booking) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error)
    // ...
}
```

### 2.5 Handler Pattern

Handlers follow:
- `NewXxxHandler(service, ...deps) *XxxHandler` constructor
- Request parsing with `json.NewDecoder(r.Body).Decode(&req)` and `req.Validate(nil)`
- Tenant from context: `middleware.TenantFromContext(r.Context())`
- Scope checking: `scopeFromContext(r.Context())`
- URL parameter parsing: `chi.URLParam(r, "id")`
- Query parameter parsing: `r.URL.Query().Get("key")`
- Response helpers: `respondJSON(w, status, data)`, `respondError(w, status, message)`
- Uses generated models from `gen/models` for request/response payloads

### 2.6 Route Registration Pattern

Routes are registered in `apps/api/internal/handler/routes.go`:
- `RegisterXxxRoutes(r chi.Router, h *XxxHandler, authz *middleware.AuthorizationMiddleware)` function per module
- Permission-based middleware: `authz.RequirePermission(permManage)` with permission IDs from `permissions.ID("resource.action").String()`
- Dual registration pattern: if `authz == nil` registers without middleware, else registers with middleware
- Called from `apps/api/cmd/server/main.go` in the tenant-scoped router group

### 2.7 Server Wiring Pattern (`main.go`)

Order of initialization (lines 69-322 of `apps/api/cmd/server/main.go`):
1. Repositories: `repository.NewXxxRepository(db)`
2. Services: `service.NewXxxService(repo, ...deps)`
3. Handlers: `handler.NewXxxHandler(service, ...deps)`
4. Scheduler task handlers: `schedulerExecutor.RegisterHandler(model.TaskTypeXxx, service.NewXxxTaskHandler(deps))`
5. Route registration in tenant-scoped group: `handler.RegisterXxxRoutes(r, xxxHandler, authzMiddleware)`

---

## 3. Data Model Patterns

### 3.1 Multi-Tenancy

All domain tables have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. Tenant context is injected via middleware and extracted in handlers via `middleware.TenantFromContext(r.Context())`.

### 3.2 UUID Primary Keys

All tables use `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`. Go models use `github.com/google/uuid` package.

### 3.3 Timestamps

Standard pattern: `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()` with an `update_updated_at_column()` trigger.

### 3.4 Foreign Keys

Referenced via `REFERENCES parent_table(id) ON DELETE CASCADE` in migrations. In Go models, FK fields are typed as `uuid.UUID` (required) or `*uuid.UUID` (optional/nullable).

### 3.5 Indexes

Named with prefix `idx_tablename_columnname`. Partial indexes are used where beneficial (e.g., `idx_bookings_pair ON bookings(pair_id) WHERE pair_id IS NOT NULL`).

---

## 4. API Pattern Analysis

### 4.1 OpenAPI Spec Structure

- **Paths**: Defined in `api/paths/*.yaml` files, one file per resource group
- **Schemas**: Defined in `api/schemas/*.yaml` files, one file per resource group
- **References**: Cross-file with `$ref: '../schemas/file.yaml#/SchemaName'` or `$ref: './file.yaml#/SchemaName'`
- **OpenAPI version**: Swagger 2.0

### 4.2 Code Generation

- `make swagger-bundle` bundles multi-file spec into `api/openapi.bundled.yaml`
- `make generate` runs go-swagger to generate Go models into `apps/api/gen/models/`
- Generated models are used for request/response payloads in handlers
- Generated models include `Validate(formats)` method for request validation

### 4.3 Existing Evaluation Endpoints

The evaluation module at `api/paths/evaluations.yaml` provides read-only query endpoints:
- `GET /evaluations/daily-values` - daily value evaluations
- `GET /evaluations/bookings` - booking evaluations (all sources)
- `GET /evaluations/terminal-bookings` - terminal booking evaluations (source='terminal' only)
- `GET /evaluations/logs` - change log evaluations
- `GET /evaluations/workflow-history` - workflow history evaluations

All evaluation endpoints share common patterns:
- Required date range: `from` and `to` query parameters
- Optional filters: `employee_id`, `department_id`
- Pagination: `limit` (default 50) and `page` (default 1)
- Response format: `{ data: [...], meta: { limit, total } }`

### 4.4 Existing Permission Keys

From `apps/api/internal/permissions/permissions.go` (lines 33-75):
- No terminal-specific permission exists yet
- Related permissions: `time_tracking.view_own`, `time_tracking.view_all`, `time_tracking.edit`, `schedules.manage`, `reports.view`

---

## 5. Scheduler Integration Points

### 5.1 Scheduler Architecture

The scheduler system consists of four components:

1. **Engine** (`apps/api/internal/service/scheduler_engine.go`): Polls for due schedules every N seconds (configured as 30 seconds)
2. **Executor** (`apps/api/internal/service/scheduler_executor.go` lines 1-210): Orchestrates execution, runs tasks, tracks status
3. **Task Handlers** (`apps/api/internal/service/scheduler_tasks.go` lines 1-250): Individual task implementations
4. **Task Catalog** (`apps/api/internal/service/scheduler_catalog.go` lines 1-96): Describes available task types

### 5.2 Task Type Registration

Task types are defined as constants in `apps/api/internal/model/schedule.go` (lines 13-20):
```go
const (
    TaskTypeCalculateDays     TaskType = "calculate_days"
    TaskTypeCalculateMonths   TaskType = "calculate_months"
    TaskTypeBackupDatabase    TaskType = "backup_database"
    TaskTypeSendNotifications TaskType = "send_notifications"
    TaskTypeExportData        TaskType = "export_data"
    TaskTypeAliveCheck        TaskType = "alive_check"
)
```

No `terminal_sync` or `terminal_import` task type exists yet.

### 5.3 Task Handler Interface

Defined in `apps/api/internal/service/scheduler_executor.go` (line 18):
```go
type TaskExecutor interface {
    Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error)
}
```

All task handlers implement this interface. They are registered via:
```go
schedulerExecutor.RegisterHandler(model.TaskTypeXxx, service.NewXxxTaskHandler(deps))
```

### 5.4 Task Catalog Structure

Each catalog entry (`apps/api/internal/service/scheduler_catalog.go`) has:
- `TaskType`: the type constant
- `Name`: human-readable name
- `Description`: what the task does
- `ParameterSchema`: JSON Schema describing accepted parameters

### 5.5 OpenAPI Task Type Enum

In `api/schemas/schedules.yaml` (lines 86, 196, 254, 268), the task_type enum is:
```yaml
enum: [calculate_days, calculate_months, backup_database, send_notifications, export_data, alive_check]
```

This enum would need to be extended for new terminal sync task types.

### 5.6 Task Handler Registration in main.go

From `apps/api/cmd/server/main.go` (lines 310-315):
```go
schedulerExecutor.RegisterHandler(model.TaskTypeAliveCheck, service.NewAliveCheckTaskHandler())
schedulerExecutor.RegisterHandler(model.TaskTypeCalculateDays, service.NewCalculateDaysTaskHandler(recalcService))
schedulerExecutor.RegisterHandler(model.TaskTypeCalculateMonths, service.NewCalculateMonthsTaskHandler(monthlyCalcService, employeeRepo))
schedulerExecutor.RegisterHandler(model.TaskTypeBackupDatabase, service.NewPlaceholderTaskHandler("backup_database"))
schedulerExecutor.RegisterHandler(model.TaskTypeSendNotifications, service.NewSendNotificationsTaskHandler(employeeMessageService))
schedulerExecutor.RegisterHandler(model.TaskTypeExportData, service.NewPlaceholderTaskHandler("export_data"))
```

### 5.7 Placeholder Task Handler

For tasks not yet implemented, a `PlaceholderTaskHandler` exists (`apps/api/internal/service/scheduler_tasks.go` lines 228-249) that logs the execution as a no-op.

---

## 6. Dependencies and Constraints

### 6.1 ZMI-TICKET-011 (Booking Ingest/Edit)

Already implemented. The booking system supports:
- Creating bookings with `Source` and `TerminalID` metadata
- Three-value time model (original, edited, calculated)
- Source tracking (web, terminal, api, import, correction)
- Recalculation triggers on create/update/delete

### 6.2 ZMI-TICKET-022 (Scheduler)

Already implemented. The scheduler supports:
- Schedule definitions with timing configurations
- Task types registered via handlers
- Manual and automated execution triggers
- Execution tracking with status and error reporting
- Task catalog for UI discovery

### 6.3 Database Connection

The `repository.DB` struct (`apps/api/internal/repository/db.go`) provides:
- `GORM *gorm.DB` for ORM operations
- `Pool *pgxpool.Pool` for raw SQL when needed

### 6.4 Code Generation Pipeline

Changes to OpenAPI schemas require:
1. Edit `api/schemas/*.yaml` and `api/paths/*.yaml`
2. Run `make swagger-bundle` to produce `api/openapi.bundled.yaml`
3. Run `make generate` to produce Go models in `apps/api/gen/models/`
4. Handlers must use generated models for request/response payloads

### 6.5 Test Infrastructure

Tests use:
- `testing` package with `t.Run()` for subtests
- `github.com/stretchr/testify/assert`, `require`, `mock`
- Mock implementations of service interfaces defined in test files
- Pattern: `newTestXxxService()` helper returning service and all mocks
- Run tests: `cd apps/api && go test -v -run TestName ./internal/service/...`

---

## 7. Key Findings Summary

1. **No separate raw terminal bookings table exists**. The ticket requires raw terminal bookings to be stored separately from processed bookings. Currently, terminal bookings go directly into the `bookings` table with `source='terminal'`.

2. **The booking model already supports terminal metadata**. The `Booking` struct has `Source` (with `BookingSourceTerminal` constant) and `TerminalID` fields. This means processed bookings from terminals are already handled.

3. **An evaluation endpoint for terminal bookings exists** at `GET /evaluations/terminal-bookings`, which filters by `source='terminal'` from the `bookings` table.

4. **No import batch tracking exists**. The ticket requires an `import_batch_id` field for idempotent batch imports. No batch import tracking infrastructure exists in the current codebase.

5. **No terminal sync scheduler tasks exist**. The scheduler system supports registration of new task types, but no `terminal_sync` or `terminal_import` task type is defined. The task type enum in both the Go model and OpenAPI schema would need extension.

6. **Employee identification for terminals exists** via the `PIN` field (varchar 20) and `EmployeeCard` model (with card number, card type, validity dates).

7. **Latest migration number is 000070**. New migrations for this feature would start at 000071.

8. **The OpenAPI task_type enum** in `api/schemas/schedules.yaml` is duplicated across four schema definitions (`ScheduleTask`, `TaskCatalogEntry`, `CreateScheduleTaskRequest`, `UpdateScheduleTaskRequest`) and all four would need updating for new task types.

9. **The PlaceholderTaskHandler pattern** exists for tasks that are defined but not yet fully implemented, which could be used for terminal protocol-specific tasks pending vendor documentation.

10. **No terminal-specific permissions exist** in the permissions registry. Related permissions are `time_tracking.*`, `schedules.manage`, and `reports.view`.

---

## 8. File Reference Index

| Area | File | Purpose |
|------|------|---------|
| Booking Model | `apps/api/internal/model/booking.go` | Booking struct, BookingSource enum |
| Booking Type Model | `apps/api/internal/model/bookingtype.go` | BookingType, Direction, Category |
| Employee Model | `apps/api/internal/model/employee.go` | Employee with PIN, EmployeeCard |
| Schedule Model | `apps/api/internal/model/schedule.go` | Schedule, TaskType constants |
| Base Model | `apps/api/internal/model/base.go` | BaseModel pattern |
| Booking Repository | `apps/api/internal/repository/booking.go` | BookingFilter, CRUD, queries |
| Booking Service | `apps/api/internal/service/booking.go` | Business logic, validation |
| Booking Handler | `apps/api/internal/handler/booking.go` | HTTP handlers, response mapping |
| Booking Tests | `apps/api/internal/service/booking_test.go` | Test patterns, mock setup |
| Evaluation Service | `apps/api/internal/service/evaluation.go` | Terminal booking query logic |
| Evaluation Handler | `apps/api/internal/handler/evaluation.go` | Terminal booking HTTP endpoint |
| Scheduler Executor | `apps/api/internal/service/scheduler_executor.go` | TaskExecutor interface, execution |
| Scheduler Tasks | `apps/api/internal/service/scheduler_tasks.go` | Task handler implementations |
| Scheduler Catalog | `apps/api/internal/service/scheduler_catalog.go` | Task catalog with parameter schemas |
| Routes | `apps/api/internal/handler/routes.go` | All route registration functions |
| Permissions | `apps/api/internal/permissions/permissions.go` | Permission definitions |
| Server Wiring | `apps/api/cmd/server/main.go` | Dependency injection, startup |
| Booking Migration | `db/migrations/000022_create_bookings.up.sql` | Bookings table DDL |
| Schedule Migration | `db/migrations/000062_create_schedules.up.sql` | Schedules table DDL |
| Latest Migration | `db/migrations/000070_create_employee_messages.up.sql` | Latest migration (number 70) |
| Booking Schema | `api/schemas/bookings.yaml` | Booking OpenAPI schema |
| Evaluation Schemas | `api/schemas/evaluations.yaml` | Terminal booking eval schema |
| Evaluation Paths | `api/paths/evaluations.yaml` | Terminal booking endpoint |
| Schedule Schemas | `api/schemas/schedules.yaml` | Task type enums |
| OpenAPI Root | `api/openapi.yaml` | All route definitions |
