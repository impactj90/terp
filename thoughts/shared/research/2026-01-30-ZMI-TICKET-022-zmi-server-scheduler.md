# Research: ZMI-TICKET-022 - ZMI Server Scheduler and Automated Tasks

**Date**: 2026-01-30
**Ticket**: ZMI-TICKET-022
**Status**: Complete

## Summary

This document researches the existing codebase to understand what exists relevant to implementing a scheduler for automated tasks. The ticket requires schedule definitions, a task catalog, execution timing, task ordering, execution logs, and OpenAPI coverage. No scheduler or background task infrastructure currently exists in the codebase. All computation is currently triggered by HTTP requests only.

---

## 1. ZMI Manual Reference Analysis

### 1.1 References to ZMI Server / Scheduled Tasks

The ZMI calculation manual reference at `thoughts/shared/reference/zmi-calculation-manual-reference.md` mentions the ZMI Server in the context of day calculation:

**Line 958** (Original German):
> "Am 24.03. erfolgt bei Tag berechnen (i.d.R. automatisch als Termin im ZMI Server) das Auffüllen der Zeit vom 23.03. auf 00:00 Uhr."

**Line 965** (Translation):
> "On 24.03 when calculating the day (usually automatically as a scheduled task in ZMI Server), the time from 23.03 is filled up to 00:00."

**Lines 2037-2041** (Night calculation):
> "Note: The final calculation of a day always occurs only on the following day, e.g., during the automatic calculation at night. Only then are the pairs finally assembled and calculated."

These references confirm that:
- The ZMI Server runs scheduled tasks, particularly daily calculation.
- Daily calculation is typically scheduled to run overnight (nightly batch).
- The nightly calculation finalizes day pairs (e.g., auto-complete across midnight).
- Manual calculation via the UI triggers an immediate recalculation for verification purposes.

### 1.2 Ticket Definition

**File**: `thoughts/shared/tickets/ZMI-TICKET-022-zmi-server-scheduler.md`

The ticket defines:
- **Schedule fields**: name, description, timing type (seconds/minutes/hours/daily/weekly/monthly/manual), timing config (interval, day, time), enabled flag, ordered task list.
- **Task catalog**: calculate days with new bookings, calculate months (current/full), backup database, send notifications, export data, alive check, and placeholders for other tasks.
- **Business rules**: top-to-bottom execution, manual execution bypasses schedule timing, pause/resume without losing config, backup before calculation in recommended schedules.
- **API endpoints**: CRUD schedules, trigger manual execution, list task catalog, get last execution status/logs.
- **Dependencies**: ZMI-TICKET-006 (daily calculation), ZMI-TICKET-016 (monthly evaluation), ZMI-TICKET-021 (data exchange).

---

## 2. Current Project Structure Relevant to Scheduler

### 2.1 Application Architecture

The application follows a clean architecture in `apps/api/internal/`:

```
handler/    - HTTP handlers (request parsing, response formatting)
service/    - Business logic (validation, orchestration)
repository/ - Data access (GORM queries)
model/      - Domain models (GORM structs)
middleware/ - Auth, tenant context injection
auth/       - JWT management
config/     - Environment config loading
```

**File**: `apps/api/cmd/server/main.go`

The main.go initializes the entire application in a linear sequence:
1. Load config from environment variables
2. Initialize JWT manager
3. Connect to database via `repository.NewDB()`
4. Initialize all repositories (concrete types, not interfaces)
5. Initialize all services (accepting repositories via constructor injection)
6. Wire cross-service dependencies via `Set*()` methods after construction
7. Initialize all handlers (accepting services)
8. Set up Chi router with middleware stack
9. Register all route groups
10. Start HTTP server with graceful shutdown

There is no background goroutine, scheduler, or task runner. The server is purely an HTTP request handler.

### 2.2 Server Lifecycle

**File**: `apps/api/cmd/server/main.go` lines 413-444

The server lifecycle is:
```go
// Start server in goroutine
go func() {
    srv.ListenAndServe()
}()

// Graceful shutdown
quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit

shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
srv.Shutdown(shutdownCtx)
```

The shutdown handles only the HTTP server. There is no mechanism to stop background tasks.

### 2.3 Configuration

**File**: `apps/api/internal/config/config.go`

Current config structure:
```go
type Config struct {
    Env         string
    Port        string
    DatabaseURL string
    JWT         JWTConfig
    LogLevel    string
    BaseURL     string
    FrontendURL string
}
```

No scheduler-related configuration fields exist. No cron expressions, task runner settings, or background worker configuration.

### 2.4 Multi-Tenancy

Routes require `X-Tenant-ID` header. Tenant context is injected via `middleware.RequireTenant`. The tenant ID is extracted from context using `middleware.TenantFromContext(r.Context())`.

A scheduler would need to handle multi-tenancy differently since there is no HTTP request context. Each tenant's schedules would need to be loaded independently.

---

## 3. Existing Search for Scheduler-Like Code

A comprehensive search for `scheduler`, `schedule`, `cron`, `timer`, `ticker`, and `background` across `apps/api/` returned no results. There is no existing scheduler infrastructure in the codebase.

---

## 4. Dependency Module Implementations

### 4.1 Daily Calculation (ZMI-TICKET-006)

The daily calculation is the primary task that would be scheduled for nightly runs.

**Service**: `apps/api/internal/service/daily_calc.go`

Key interface methods:
```go
type dailyCalcServiceForRecalc interface {
    CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
    RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error)
}
```

**Recalc Service**: `apps/api/internal/service/recalc.go`

The `RecalcService` wraps daily calculation with batch operations:
```go
type RecalcService struct {
    dailyCalc    dailyCalcServiceForRecalc
    employeeRepo employeeRepositoryForRecalc
}
```

Key methods:
- `TriggerRecalc(ctx, tenantID, employeeID, date)` - Single day, single employee.
- `TriggerRecalcRange(ctx, tenantID, employeeID, from, to)` - Date range, single employee.
- `TriggerRecalcBatch(ctx, tenantID, employeeIDs, from, to)` - Date range, multiple employees.
- `TriggerRecalcAll(ctx, tenantID, from, to)` - Date range, ALL active employees.

`TriggerRecalcAll` queries all active employees for a tenant:
```go
filter := repository.EmployeeFilter{
    TenantID: tenantID,
    IsActive: &isActive,
}
employees, _, err := s.employeeRepo.List(ctx, filter)
```

These methods return `*RecalcResult`:
```go
type RecalcResult struct {
    ProcessedDays int
    FailedDays    int
    Errors        []RecalcError
}
```

This is directly usable by a scheduler task for "Calculate days with new bookings."

### 4.2 Monthly Evaluation (ZMI-TICKET-016)

**Service**: `apps/api/internal/service/monthlycalc.go`

The `MonthlyCalcService` handles batch monthly calculations:
```go
type MonthlyCalcService struct {
    evalService      monthlyEvalServiceForCalc
    monthlyValueRepo monthlyValueRepoForCalc
}
```

Key methods:
- `CalculateMonth(ctx, employeeID, year, month)` - Single employee, single month.
- `CalculateMonthBatch(ctx, employeeIDs, year, month)` - Multiple employees, single month.
- `RecalculateFromMonth(ctx, employeeID, startYear, startMonth)` - Cascading from a start month to current.
- `RecalculateFromMonthBatch(ctx, employeeIDs, startYear, startMonth)` - Cascading for multiple employees.

Returns `*MonthlyCalcResult`:
```go
type MonthlyCalcResult struct {
    ProcessedMonths int
    SkippedMonths   int
    FailedMonths    int
    Errors          []MonthlyCalcError
}
```

`MonthlyEvalService` at `apps/api/internal/service/monthlyeval.go` handles the actual evaluation logic:
```go
type MonthlyEvalService struct {
    monthlyValueRepo monthlyValueRepoForMonthlyEval
    dailyValueRepo   dailyValueRepoForMonthlyEval
    absenceDayRepo   absenceDayRepoForMonthlyEval
    employeeRepo     employeeRepoForMonthlyEval
    tariffRepo       tariffRepoForMonthlyEval
}
```

These services are directly usable by a scheduler task for "Calculate months (current/full month)."

### 4.3 Data Exchange / Exports (ZMI-TICKET-021)

**Export Interface Service**: `apps/api/internal/service/exportinterface.go`

Manages export interface definitions (CRUD) with validation:
```go
type ExportInterfaceService struct {
    repo exportInterfaceRepository
}
```

**Payroll Export Service**: `apps/api/internal/service/payrollexport.go`

Generates payroll export files:
```go
type PayrollExportService struct {
    repo              payrollExportRepository
    monthlyValueRepo  payrollMonthlyValueRepository
    employeeRepo      payrollEmployeeRepository
    accountRepo       payrollAccountRepository
    exportInterfaceRepo payrollExportInterfaceRepository
}
```

Key input:
```go
type GeneratePayrollExportInput struct {
    TenantID          uuid.UUID
    Year              int
    Month             int
    ExportType        string
    Format            string
    ExportInterfaceID *uuid.UUID
    EmployeeIDs       []uuid.UUID
    DepartmentIDs     []uuid.UUID
    IncludeAccounts   []uuid.UUID
    CreatedBy         *uuid.UUID
}
```

This is usable by a scheduler task for "Export data" -- the scheduler would call the payroll export service with appropriate parameters stored in the schedule task configuration.

### 4.4 Notification Service

**Service**: `apps/api/internal/service/notification.go`

The notification service has a `CreateNotificationInput` type and a stream hub for real-time events:
```go
type NotificationService struct {
    notificationRepo *repository.NotificationRepository
    preferencesRepo  *repository.NotificationPreferencesRepository
    userRepo         notificationUserRepository
    streamHub        *NotificationStreamHub
}
```

This could be used by a scheduler task for "Send notifications."

---

## 5. Existing Patterns

### 5.1 Model Pattern

**File**: `apps/api/internal/model/base.go`

All models use a BaseModel:
```go
type BaseModel struct {
    ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
    CreatedAt time.Time `gorm:"not null;default:now()"`
    UpdatedAt time.Time `gorm:"not null;default:now()"`
}
```

Many models include `TenantID uuid.UUID` with a `gorm:"type:uuid;not null;index"` tag for multi-tenancy.

Example model (ExportInterface at `apps/api/internal/model/exportinterface.go`):
```go
type ExportInterface struct {
    ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID        uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    InterfaceNumber int        `gorm:"not null" json:"interface_number"`
    Name            string     `gorm:"type:varchar(255);not null" json:"name"`
    MandantNumber   *string    `gorm:"type:varchar(50)" json:"mandant_number,omitempty"`
    ExportScript    *string    `gorm:"type:varchar(255)" json:"export_script,omitempty"`
    ExportPath      *string    `gorm:"type:varchar(500)" json:"export_path,omitempty"`
    OutputFilename  *string    `gorm:"type:varchar(255)" json:"output_filename,omitempty"`
    IsActive        bool       `gorm:"default:true" json:"is_active"`
    CreatedAt       time.Time  `gorm:"type:timestamptz;default:now()" json:"created_at"`
    UpdatedAt       time.Time  `gorm:"type:timestamptz;default:now()" json:"updated_at"`
    Accounts        []ExportInterfaceAccount `gorm:"foreignKey:ExportInterfaceID" json:"accounts,omitempty"`
}
```

Audit log model at `apps/api/internal/model/auditlog.go` shows a log-like pattern:
```go
type AuditLog struct {
    ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenant_id"`
    UserID      *uuid.UUID     `gorm:"type:uuid" json:"user_id,omitempty"`
    Action      AuditAction    `gorm:"type:varchar(20);not null" json:"action"`
    EntityType  string         `gorm:"type:varchar(100);not null" json:"entity_type"`
    EntityID    uuid.UUID      `gorm:"type:uuid;not null" json:"entity_id"`
    EntityName  *string        `gorm:"type:text" json:"entity_name,omitempty"`
    Changes     datatypes.JSON `gorm:"type:jsonb" json:"changes,omitempty"`
    Metadata    datatypes.JSON `gorm:"type:jsonb" json:"metadata,omitempty"`
    IPAddress   *string        `gorm:"type:text" json:"ip_address,omitempty"`
    UserAgent   *string        `gorm:"type:text" json:"user_agent,omitempty"`
    PerformedAt time.Time      `gorm:"type:timestamptz;default:now()" json:"performed_at"`
}
```

The `AuditAction` type uses string constants:
```go
type AuditAction string
const (
    AuditActionCreate  AuditAction = "create"
    AuditActionUpdate  AuditAction = "update"
    AuditActionDelete  AuditAction = "delete"
    AuditActionApprove AuditAction = "approve"
    AuditActionReject  AuditAction = "reject"
    AuditActionClose   AuditAction = "close"
    AuditActionReopen  AuditAction = "reopen"
    AuditActionExport  AuditAction = "export"
    AuditActionImport  AuditAction = "import"
    AuditActionLogin   AuditAction = "login"
    AuditActionLogout  AuditAction = "logout"
)
```

### 5.2 Repository Pattern

**File**: `apps/api/internal/repository/db.go`

The DB wrapper:
```go
db, err := repository.NewDB(cfg.DatabaseURL)
```

Repositories are concrete struct types initialized with the DB wrapper:
```go
exportInterfaceRepo := repository.NewExportInterfaceRepository(db)
```

**File**: `apps/api/internal/repository/exportinterface.go`

Example repository with standard CRUD operations, tenant scoping, and unique constraint checks.

### 5.3 Service Pattern

Services define repository interfaces locally (not shared) for testability. Example from `apps/api/internal/service/exportinterface.go`:

```go
type exportInterfaceRepository interface {
    Create(ctx context.Context, ei *model.ExportInterface) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error)
    // ... other methods
}

type ExportInterfaceService struct {
    repo exportInterfaceRepository
}

func NewExportInterfaceService(repo exportInterfaceRepository) *ExportInterfaceService {
    return &ExportInterfaceService{repo: repo}
}
```

Cross-service wiring uses `Set*()` methods. Example from main.go:
```go
dailyCalcService.SetOrderBookingService(orderBookingService)
absenceService.SetNotificationService(notificationService)
```

Error constants defined as package-level variables:
```go
var (
    ErrExportInterfaceNotFound     = errors.New("export interface not found")
    ErrExportInterfaceNameRequired = errors.New("export interface name is required")
)
```

### 5.4 Handler Pattern

**File**: `apps/api/internal/handler/exportinterface.go`

Handler structure:
```go
type ExportInterfaceHandler struct {
    svc          *service.ExportInterfaceService
    auditService *service.AuditLogService
}

func NewExportInterfaceHandler(svc *service.ExportInterfaceService) *ExportInterfaceHandler {
    return &ExportInterfaceHandler{svc: svc}
}

func (h *ExportInterfaceHandler) SetAuditService(s *service.AuditLogService) {
    h.auditService = s
}
```

Request handling pattern:
1. Extract tenant ID from context: `middleware.TenantFromContext(r.Context())`
2. Parse URL params: `uuid.Parse(chi.URLParam(r, "id"))`
3. Decode request body: `json.NewDecoder(r.Body).Decode(&req)` using generated models
4. Validate request: `req.Validate(nil)` (go-swagger validation)
5. Map to service input structs
6. Call service method
7. Optionally log audit entry
8. Map domain model to response using generated models
9. Respond: `respondJSON(w, status, data)` or `respondError(w, status, msg)`

Error handling uses a dedicated function per domain:
```go
func handleExportInterfaceError(w http.ResponseWriter, err error) {
    switch err {
    case service.ErrExportInterfaceNotFound:
        respondError(w, http.StatusNotFound, "Export interface not found")
    // ...
    }
}
```

### 5.5 Route Registration Pattern

**File**: `apps/api/internal/handler/routes.go`

Each module has a `Register*Routes` function:
```go
func RegisterExportInterfaceRoutes(r chi.Router, h *ExportInterfaceHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("payroll.manage").String()
    r.Route("/export-interfaces", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            // ...
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        // ...
    })
}
```

Pattern characteristics:
- Permission IDs use dot notation: `"payroll.manage"`, `"time_tracking.view_all"`, etc.
- `authz == nil` branch provides routes without permission checks (for testing).
- Routes are registered inside `r.Route("/prefix", func(r chi.Router) { ... })`.

In `main.go`, routes are registered inside the tenant-scoped group:
```go
r.Group(func(r chi.Router) {
    r.Use(tenantMiddleware.RequireTenant)
    handler.RegisterExportInterfaceRoutes(r, exportInterfaceHandler, authzMiddleware)
})
```

### 5.6 Migration Pattern

**Latest migration**: `000061_create_payroll_exports` (up and down SQL files).

Migration naming: `{6-digit-sequence}_{description}.{up|down}.sql`

Example migration structure (from `000059_create_export_interfaces.up.sql`):
```sql
-- Header comment with section reference
CREATE TABLE export_interfaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- domain fields
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, interface_number)
);

CREATE INDEX idx_ei_tenant ON export_interfaces(tenant_id);

CREATE TRIGGER update_export_interfaces_updated_at
    BEFORE UPDATE ON export_interfaces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE export_interfaces IS '...';
COMMENT ON COLUMN export_interfaces.column_name IS '...';
```

Common patterns:
- UUID primary keys with `gen_random_uuid()`
- `tenant_id` foreign key to `tenants(id)` with `ON DELETE CASCADE`
- `created_at` and `updated_at` with `TIMESTAMPTZ DEFAULT NOW()`
- Update trigger using `update_updated_at_column()` function
- Indexes on `tenant_id` and other foreign keys
- CHECK constraints for enum-like fields (e.g., `CHECK (status IN ('pending', 'generating', 'completed', 'failed'))`)
- JSONB columns for flexible structured data (e.g., `parameters JSONB DEFAULT '{}'`)
- Table and column comments

From `000061_create_payroll_exports.up.sql`, the payroll export table shows a pattern relevant to execution tracking:
```sql
status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
parameters JSONB DEFAULT '{}',
error_message TEXT,
requested_at TIMESTAMPTZ DEFAULT NOW(),
started_at TIMESTAMPTZ,
completed_at TIMESTAMPTZ,
created_by UUID REFERENCES users(id) ON DELETE SET NULL,
```

### 5.7 OpenAPI Spec Pattern

**Main spec**: `api/openapi.yaml` (Swagger 2.0 format)

Organization:
- `api/paths/*.yaml` - endpoint definitions by domain
- `api/schemas/*.yaml` - data model schemas by domain
- `api/responses/` - reusable response definitions

Path references use `$ref` with tilde-encoded slashes:
```yaml
/export-interfaces:
    $ref: 'paths/export-interfaces.yaml#/~1export-interfaces'
/export-interfaces/{id}:
    $ref: 'paths/export-interfaces.yaml#/~1export-interfaces~1{id}'
```

Schema definitions reference:
```yaml
definitions:
  ExportInterface:
    $ref: 'schemas/export-interfaces.yaml#/ExportInterface'
```

Tags group endpoints:
```yaml
tags:
  - name: Export Interfaces
    description: Data exchange interface configuration
```

Example path definition (from `api/paths/export-interfaces.yaml`):
Standard CRUD with list, create, get, update, delete operations using the tag, parameter references, and schema references.

Example schema definition (from `api/schemas/export-interfaces.yaml`):
Defines the main entity, list wrapper, create/update request models with required fields, type constraints, and examples.

Generated Go models use go-swagger at `apps/api/gen/models/`. The build command:
```bash
swagger generate model -f api/openapi.bundled.yaml -t apps/api/gen --model-package=models
```

### 5.8 Dependency Injection in main.go

The initialization follows a strict order in `main.go`:
1. Repositories first (lines 69-94)
2. Services next (lines 97-121), passing repositories
3. Cross-service wiring via Set methods (lines 197, 289-307)
4. Handlers last (lines 199-257), passing services
5. Route registration (lines 347-404)

Example of a full initialization chain for export interfaces:
```go
// Repository
exportInterfaceRepo := repository.NewExportInterfaceRepository(db)
// Service
exportInterfaceService := service.NewExportInterfaceService(exportInterfaceRepo)
// Handler
exportInterfaceHandler := handler.NewExportInterfaceHandler(exportInterfaceService)
// Wire audit
exportInterfaceHandler.SetAuditService(auditLogService)
// Register routes
handler.RegisterExportInterfaceRoutes(r, exportInterfaceHandler, authzMiddleware)
```

---

## 6. Execution Log Pattern Analysis

The PayrollExport model at `apps/api/internal/model/payrollexport.go` (migration `000061`) provides a pattern for execution tracking that is relevant to scheduler execution logs:

```sql
status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
error_message TEXT,
requested_at TIMESTAMPTZ DEFAULT NOW(),
started_at TIMESTAMPTZ,
completed_at TIMESTAMPTZ,
```

The AuditLog model provides another pattern for logging actions with metadata:
```go
type AuditLog struct {
    Action      AuditAction
    EntityType  string
    EntityID    uuid.UUID
    Changes     datatypes.JSON
    Metadata    datatypes.JSON
    PerformedAt time.Time
}
```

---

## 7. External Dependencies

**Go module**: `apps/api/go.mod`

Current dependencies that might be relevant:
- `github.com/rs/zerolog` - Structured logging (used throughout)
- Standard library `time` package - Used for time operations
- No cron library, no task queue library, no scheduler library currently in the dependency list

The Go standard library provides `time.Ticker` and `time.Timer` which could be used for basic scheduling without adding external dependencies.

---

## 8. Key Observations

1. **No scheduler infrastructure exists**. The application is purely HTTP request-driven.

2. **The server lifecycle does not account for background tasks**. The graceful shutdown only handles the HTTP server, not background goroutines.

3. **The config has no scheduler-related fields**. No environment variables for enabling/disabling the scheduler.

4. **All computation services exist and have batch methods**:
   - `RecalcService.TriggerRecalcAll()` - Calculate all employees for a date range
   - `MonthlyCalcService.CalculateMonthBatch()` - Calculate months for multiple employees
   - `PayrollExportService.Generate()` - Generate export files
   - `NotificationService` - Send notifications

5. **Multi-tenancy is HTTP-middleware-driven**. The scheduler would need to iterate over tenants and create contexts with tenant IDs without HTTP requests.

6. **The audit log and payroll export models provide patterns for execution logging** (status tracking, timestamps, error messages, JSONB metadata).

7. **The next migration sequence number would be 000062**.

8. **The OpenAPI spec currently has no scheduler-related tags, paths, or schemas**. New files would need to be added to `api/paths/`, `api/schemas/`, and referenced from `api/openapi.yaml`.

9. **The `permissions` package defines permission IDs**. A new permission like `"scheduler.manage"` would need to be added.

10. **Cross-service wiring uses Set methods**. A scheduler service would need access to `RecalcService`, `MonthlyCalcService`, `PayrollExportService`, and `NotificationService` via either constructor injection or Set methods.
