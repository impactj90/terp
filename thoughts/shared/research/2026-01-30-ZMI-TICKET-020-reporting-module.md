# Research: ZMI-TICKET-020 Reporting Module (Berichte)

Date: 2026-01-30

## Architecture Overview

The project is a Go monorepo (`go.work`) with the API at `apps/api/`. The architecture follows clean architecture with these layers:

```
apps/api/
  cmd/server/main.go    -- entry point, wires repos -> services -> handlers
  internal/
    handler/            -- HTTP handlers (Chi router), request parsing, response mapping
    service/            -- Business logic, validation, orchestration
    repository/         -- Data access (GORM queries), filter structs
    model/              -- Domain models (GORM structs)
    middleware/         -- Auth, tenant context injection, authorization
    auth/              -- JWT management, dev user simulation
    config/            -- Environment config
    permissions/       -- Permission definitions (deterministic UUIDs)
    access/            -- Scope helpers (data scope from user)
    testutil/          -- Test database helpers
    calculation/       -- Calculation logic (pairing, breaks, etc.)
    timeutil/          -- Time utility functions
  gen/models/          -- Generated Go models from OpenAPI spec (go-swagger)
```

The API is OpenAPI-first:
- Specs defined in `api/paths/*.yaml` and `api/schemas/*.yaml`
- Bundled with `make swagger-bundle` into `api/openapi.bundled.yaml`
- Go models generated with `make generate` into `apps/api/gen/models/`
- Swagger UI at `/swagger/` in dev mode

Multi-tenancy: Routes require `X-Tenant-ID` header. Tenant context injected via `middleware.RequireTenant`.

## Existing Models and Schemas Relevant to Reporting

### Domain Models (in `apps/api/internal/model/`)

Key models that reports would query:

1. **Employee** (`employee.go`): Full personnel data including `PersonnelNumber`, `FirstName`, `LastName`, `Email`, `Phone`, `EntryDate`, `ExitDate`, `DepartmentID`, `CostCenterID`, `TariffID`, `WeeklyHours`, `VacationDaysPerYear`, `IsActive`, `BirthDate`, `Gender`, address fields. Relations: Department, CostCenter, EmploymentType, Tariff, Teams.

2. **MonthlyValue** (`monthlyvalue.go`): Aggregated monthly time data per employee. Fields: `Year`, `Month`, `TotalGrossTime`, `TotalNetTime`, `TotalTargetTime`, `TotalOvertime`, `TotalUndertime`, `TotalBreakTime`, `FlextimeStart/Change/End/Carryover`, `VacationTaken`, `SickDays`, `OtherAbsenceDays`, `WorkDays`, `DaysWithErrors`, `IsClosed`, `ClosedAt`. All times in minutes.

3. **DailyValue** (`dailyvalue.go`): Daily calculated time values. Fields: `ValueDate`, `Status` (pending/calculated/error/approved), `GrossTime`, `NetTime`, `TargetTime`, `Overtime`, `Undertime`, `BreakTime`, `HasError`, `ErrorCodes`, `Warnings`, `FirstCome`, `LastGo`, `BookingCount`.

4. **AbsenceDay** (`absenceday.go`): Absence records. Fields: `AbsenceDate`, `AbsenceTypeID`, `Duration` (1.0 = full, 0.5 = half), `HalfDayPeriod`, `Status` (pending/approved/rejected/cancelled).

5. **VacationBalance** (`vacationbalance.go`): Per-employee per-year vacation tracking. Fields: `Entitlement`, `Carryover`, `Adjustments`, `Taken`, `CarryoverExpiresAt`.

6. **Order** (`order.go`): Order records with `Code`, `Name`, `Description`, `Status`, `Customer`, `CostCenterID`, `BillingRatePerHour`, `ValidFrom/To`.

7. **OrderBooking** (`order_booking.go`): Time bookings against orders.

8. **Team** (`team.go`): Team structure with `DepartmentID`, `LeaderEmployeeID`. `TeamMember` links employees to teams with roles (member/lead/deputy).

9. **Department** (`department.go`): Hierarchical departments with `ParentID`, `Code`, `Name`, `ManagerEmployeeID`.

10. **CostCenter** (`costcenter.go`): Cost center with `Code`, `Name`.

11. **Account** (`account.go`): Time accounts (bonus/day/month types) with `Code`, `Name`, `Unit`, `DisplayFormat`, `BonusFactor`, `IsPayrollRelevant`.

12. **PayrollExport** (`payrollexport.go`): Existing export model with status lifecycle (pending -> generating -> completed/failed), parameters (JSON), file content storage, format support (csv/xlsx/xml/json).

### Generated Models (in `apps/api/gen/models/`)

Report-specific generated models already exist:

1. **`Report`** (`report.go`): Full report response model with fields:
   - `ID`, `TenantID`, `ReportType`, `Name`, `Description`, `Status`, `Parameters`, `Format`, `FileURL`, `FileSize`, `RowCount`, timestamps
   - `ReportType` enum: `daily_overview`, `weekly_overview`, `monthly_overview`, `employee_timesheet`, `department_summary`, `absence_report`, `vacation_report`, `overtime_report`, `account_balances`, `custom`
   - `Status` enum: `pending`, `generating`, `completed`, `failed`
   - `Format` enum: `json`, `csv`, `xlsx`, `pdf`
   - `Parameters` sub-struct: `FromDate`, `ToDate`, `EmployeeIds`, `DepartmentIds`

2. **`GenerateReportRequest`** (`generate_report_request.go`): Request model with `ReportType` (required), `Format` (required), `Name`, `Parameters` (same structure as Report Parameters).

3. **`ReportList`** (`report_list.go`): Standard list response with `Data []*Report` and `Meta *PaginationMeta`.

## Existing Handler/Service/Repository Patterns

### Handler Pattern

Each module follows this structure:

```go
// handler/mymodule.go
type MyHandler struct {
    svc *service.MyService
}

func NewMyHandler(svc *service.MyService) *MyHandler {
    return &MyHandler{svc: svc}
}

// List handles GET /my-resource
func (h *MyHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusBadRequest, "missing tenant context")
        return
    }
    // Parse query params, call service, map to gen/models response
    respondJSON(w, http.StatusOK, response)
}
```

Key patterns:
- Handlers use `respondJSON()` and `respondError()` helper functions from `response.go`
- Request bodies are decoded into generated models, validated with `.Validate(nil)`
- Domain models are mapped to generated response models manually (e.g., `payrollExportToResponse()`)
- UUID parsing via `chi.URLParam(r, "id")` and `uuid.Parse()`
- Query parameter parsing via `r.URL.Query().Get()` and helper functions (`parseOptionalUUID`, `parseOptionalBool`, `parseIntDefault`, `parseDateRange`)
- Error handling via dedicated `handleXxxError()` functions that switch on service errors

### Service Pattern

```go
// service/mymodule.go
type myRepository interface {
    // Interface matching what the service needs
    Create(ctx context.Context, m *model.My) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.My, error)
    // ...
}

type MyService struct {
    repo myRepository
}

func NewMyService(repo myRepository) *MyService {
    return &MyService{repo: repo}
}
```

Key patterns:
- Services define private interfaces for their repository dependencies
- Constructor injection via `NewXxxService()`
- Sentinel error variables (e.g., `var ErrPayrollExportNotFound = errors.New(...)`)
- Input structs for complex operations (e.g., `GeneratePayrollExportInput`)
- Filter structs for list operations (e.g., `PayrollExportListFilter`)

### Repository Pattern

```go
// repository/mymodule.go
type MyFilter struct {
    TenantID uuid.UUID
    // filter fields...
    Limit  int
    Cursor *uuid.UUID
}

type MyRepository struct {
    db *DB
}

func NewMyRepository(db *DB) *MyRepository {
    return &MyRepository{db: db}
}

func (r *MyRepository) List(ctx context.Context, filter MyFilter) ([]model.My, error) {
    query := r.db.GORM.WithContext(ctx).Where("tenant_id = ?", filter.TenantID)
    // Apply filters...
    // Cursor-based pagination with Limit(limit + 1)
    var results []model.My
    err := query.Order("created_at DESC").Limit(limit + 1).Find(&results).Error
    return results, err
}
```

Key patterns:
- `repository.DB` wraps `*gorm.DB` and `*pgxpool.Pool`
- GORM used for CRUD operations with `WithContext(ctx)`
- Filter structs with optional pointer fields
- Cursor-based pagination (fetch limit+1, check if hasMore)
- Sentinel errors for not-found cases

### Route Registration Pattern

```go
// handler/routes.go
func RegisterMyRoutes(r chi.Router, h *MyHandler, authz *middleware.AuthorizationMiddleware) {
    permView := permissions.ID("reports.view").String()
    r.Route("/my-resource", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            // ...
            return
        }
        r.With(authz.RequirePermission(permView)).Get("/", h.List)
        // ...
    })
}
```

### Wiring in main.go

```go
// cmd/server/main.go
// 1. Create repository
myRepo := repository.NewMyRepository(db)
// 2. Create service
myService := service.NewMyService(myRepo)
// 3. Create handler
myHandler := handler.NewMyHandler(myService)
// 4. Register routes (inside tenant-scoped group)
handler.RegisterMyRoutes(r, myHandler, authzMiddleware)
```

## OpenAPI Spec Patterns

### Path Files (`api/paths/*.yaml`)

- Each module has its own path file (e.g., `reports.yaml`, `payroll-exports.yaml`)
- Swagger 2.0 format
- Each endpoint has: `tags`, `summary`, `description`, `operationId`, `parameters`, `responses`
- Schema references use relative paths: `$ref: '../schemas/reports.yaml#/Report'`
- Error responses reference common errors: `$ref: '../responses/errors.yaml#/Unauthorized'`
- Download endpoints specify `produces` with multiple MIME types
- File responses use `type: file` schema with `Content-Disposition` header

### Schema Files (`api/schemas/*.yaml`)

- One file per domain (e.g., `reports.yaml`, `payroll-exports.yaml`)
- Define: main entity, list wrapper, request/create/update schemas, summary schemas
- Standard list pattern: `{ data: [items], meta: PaginationMeta }`
- Common pagination: `$ref: './common.yaml#/PaginationMeta'`
- Enums for status/type fields with string values
- `x-nullable: true` for optional fields
- Format annotations: `format: uuid`, `format: date`, `format: date-time`, `format: uri`

### Reports OpenAPI Already Defined

The reports OpenAPI spec already exists at:
- **Paths**: `api/paths/reports.yaml` -- defines 4 endpoints:
  - `GET /reports` -- list reports with `report_type` and `status` query filters
  - `POST /reports` -- generate report (async, returns 202)
  - `GET /reports/{id}` -- get report by ID
  - `DELETE /reports/{id}` -- delete report
  - `GET /reports/{id}/download` -- download report file (produces octet-stream, xlsx, csv, pdf)

- **Schemas**: `api/schemas/reports.yaml` -- defines:
  - `Report` -- full report object with all fields
  - `ReportSummary` -- lightweight version
  - `GenerateReportRequest` -- input with `report_type`, `format`, `name`, `parameters`
  - `ReportList` -- standard list wrapper

### Generated Models Already Exist

The following generated models exist in `apps/api/gen/models/`:
- `report.go` -- `models.Report` with `ReportParameters` sub-struct
- `generate_report_request.go` -- `models.GenerateReportRequest` with parameters
- `report_list.go` -- `models.ReportList`

## Test Patterns

### Unit Tests (most common)

Tests use `testify/assert`, `testify/require`, and `testify/mock`:

```go
// service/mymodule_test.go
type mockMyRepo struct {
    mock.Mock
}

func (m *mockMyRepo) Create(ctx context.Context, item *model.My) error {
    args := m.Called(ctx, item)
    return args.Error(0)
}

func TestMyService_Create(t *testing.T) {
    repo := &mockMyRepo{}
    svc := NewMyService(repo)

    repo.On("Create", mock.Anything, mock.Anything).Return(nil)

    result, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, expected, result.Field)
    repo.AssertExpectations(t)
}
```

### Handler Tests

Handler tests create `httptest.NewRequest` and `httptest.NewRecorder`:

```go
func TestParseDateRange_Valid(t *testing.T) {
    r := httptest.NewRequest(http.MethodGet, "/evaluations/daily-values?from=2026-01-01&to=2026-01-31", nil)
    from, to, err := parseDateRange(r)
    require.NoError(t, err)
    assert.Equal(t, "2026-01-01", from.Format("2006-01-02"))
}
```

### Integration Tests

Use `testutil.SetupTestDB(t)` for transaction-wrapped DB access:

```go
func TestMyRepo_CRUD(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewMyRepository(db)
    // Tests run in transaction, auto-rollback on cleanup
}
```

### Test File Locations

Tests exist at every layer:
- `internal/model/*_test.go` -- model method tests
- `internal/service/*_test.go` -- service logic tests (most numerous, use mocks)
- `internal/handler/*_test.go` -- handler/routing tests
- `internal/repository/*_test.go` -- repository integration tests
- `internal/calculation/*_test.go` -- calculation logic tests
- `internal/middleware/*_test.go` -- middleware tests

## Dependencies Status

### Evaluation Module (ZMI-TICKET-019) -- EXISTS

Fully implemented:
- **Service**: `apps/api/internal/service/evaluation.go` -- `EvaluationService` with methods:
  - `ListDailyValues()` -- queries daily values with scope filtering
  - `ListBookings()` -- queries bookings with filters
  - `ListTerminalBookings()` -- terminal bookings
  - `ListLogs()` -- audit logs
  - `ListWorkflowHistory()` -- workflow audit trail
- **Handler**: `apps/api/internal/handler/evaluation.go` -- 5 GET endpoints
- **Routes**: `RegisterEvaluationRoutes` in `routes.go` under `reports.view` permission
- **Tests**: `service/evaluation_test.go`, `handler/evaluation_test.go`
- **OpenAPI**: `api/paths/evaluations.yaml`, `api/schemas/evaluations.yaml`

### User Permissions (ZMI-TICKET-003) -- EXISTS

Fully implemented:
- **Permissions**: `apps/api/internal/permissions/permissions.go` -- defines all permissions including:
  - `reports.view` (Resource: "reports", Action: "read") -- already exists
- **Middleware**: `apps/api/internal/middleware/authorization.go` -- `AuthorizationMiddleware` with:
  - `RequirePermission(permID)` -- checks user has specific permission
  - `RequireEmployeePermission(paramName, viewOwnPerm, viewAllPerm)` -- employee-scoped
- **Data Scope**: `apps/api/internal/access/` -- `Scope` struct with Type/DepartmentIDs/EmployeeIDs
- **User Groups**: User groups with JSON permission arrays

### Orders Module (ZMI-TICKET-017) -- EXISTS

Fully implemented:
- **Models**: `order.go`, `order_assignment.go`, `order_booking.go`
- **Services**: `order.go`, `order_assignment.go`, `order_booking.go`
- **Handlers**: `order.go`, `order_assignment.go`, `order_booking.go`
- **Routes**: `RegisterOrderRoutes`, `RegisterOrderAssignmentRoutes`, `RegisterOrderBookingRoutes`
- **Permissions**: `orders.manage`, `order_assignments.manage`, `order_bookings.manage`, `order_bookings.view`
- **Migrations**: 055-058 (orders, order_assignments, order_bookings, employee default_order)

### Monthly Evaluation (ZMI-TICKET-016) -- EXISTS

Fully implemented:
- **Service**: `monthlyeval.go` -- `MonthlyEvalService` with month summary, daily breakdown, close/reopen
- **Handler**: `monthlyeval.go` -- `MonthlyEvalHandler` under `/employees/{id}/months/`
- **Model**: `monthlyvalue.go` -- `MonthlyValue` with time aggregates and closing state

### Payroll Export (Related) -- EXISTS

Closest pattern for report generation:
- **Model**: `payrollexport.go` -- status lifecycle, file content storage, format enum
- **Service**: `payrollexport.go` -- Generate, GetByID, List, Delete, GetDownloadContent, GetPreviewData
- **Handler**: `payrollexport.go` -- Generate (POST), List (GET), Get (GET), Delete (DELETE), Download (GET), Preview (GET)
- **Repository**: `payrollexport.go` -- CRUD with filter/cursor pagination

## Key Files and Locations

### OpenAPI Specs (Already Defined)
- `api/paths/reports.yaml` -- Report endpoint definitions
- `api/schemas/reports.yaml` -- Report, GenerateReportRequest, ReportList schemas

### Generated Models (Already Generated)
- `apps/api/gen/models/report.go` -- Report, ReportParameters
- `apps/api/gen/models/generate_report_request.go` -- GenerateReportRequest
- `apps/api/gen/models/report_list.go` -- ReportList

### Files Needing Creation
- `apps/api/internal/model/report.go` -- Domain model (Report GORM struct)
- `apps/api/internal/repository/report.go` -- Report repository
- `apps/api/internal/service/report.go` -- Report service
- `apps/api/internal/handler/report.go` -- Report handler
- `apps/api/internal/handler/routes.go` -- Add `RegisterReportRoutes`
- `apps/api/cmd/server/main.go` -- Wire report handler
- `db/migrations/000062_create_reports.up.sql` -- Reports table migration
- `db/migrations/000062_create_reports.down.sql` -- Down migration

### Test Files Needing Creation
- `apps/api/internal/service/report_test.go`
- `apps/api/internal/handler/report_test.go`

### Closest Analogous Pattern: Payroll Export
- `apps/api/internal/model/payrollexport.go`
- `apps/api/internal/service/payrollexport.go`
- `apps/api/internal/repository/payrollexport.go`
- `apps/api/internal/handler/payrollexport.go`
- `apps/api/internal/service/payrollexport_test.go`

## Gaps and Considerations

### No PDF/Excel Libraries in go.mod

The `go.mod` file does **not** include any PDF or Excel generation libraries:
- No `excelize` (XLSX generation)
- No `gofpdf`, `pdfcpu`, or similar (PDF generation)
- The existing payroll export only generates CSV content (stores as text string)
- The PayrollExport format enum includes "xlsx" but the actual generation code only produces CSV

To support PDF and XLSX output, new dependencies would need to be added to `go.mod`.

### No Existing Report Handler/Service/Repository

While the OpenAPI spec and generated models exist, there is **no implementation** yet:
- No `handler/report.go`
- No `service/report.go`
- No `repository/report.go`
- No `model/report.go`
- No database migration for a reports table
- No `RegisterReportRoutes` function
- No wiring in `main.go`

### Permission Already Defined

The `reports.view` permission already exists in `permissions.go`:
```go
{ID: permissionID("reports.view"), Resource: "reports", Action: "read", Description: "View reports"}
```

This is already used by:
- `RegisterEvaluationRoutes` -- evaluation queries
- `RegisterMonthlyEvalRoutes` -- monthly evaluation views

### Report Types vs Ticket Requirements Mapping

The OpenAPI spec defines these report types:
- `daily_overview` -- maps to day plan reports
- `weekly_overview` -- maps to weekly plan reports
- `monthly_overview` -- maps to monthly summary reports
- `employee_timesheet` -- maps to personnel/master data reports
- `department_summary` -- maps to department grouping
- `absence_report` -- maps to absence statistics
- `vacation_report` -- maps to vacation lists/slips
- `overtime_report` -- maps to variable time reports
- `account_balances` -- maps to account reports
- `custom` -- catch-all

The ticket additionally mentions:
- Birthday lists (employee data with BirthDate field exists)
- Phone lists (employee Phone field exists)
- Team reports (Team model with members exists)
- Order reports (Order/OrderBooking models exist)
- Error reports (DailyValue.HasError, MonthlyValue.DaysWithErrors exist)

The OpenAPI spec may need additional report types for team reports and order reports if they need separate identifiers.

### Report Parameters Scope

The current OpenAPI parameters include: `from_date`, `to_date`, `employee_ids`, `department_ids`.

The ticket requires additional filters: `cost_center`, `team`. These are not currently in the OpenAPI spec parameters.

### File Storage Pattern

The PayrollExport stores file content as a `TEXT` column in the database (`FileContent *string`). Reports may follow the same pattern for simplicity, or could use filesystem/object storage for larger files.

### Async Pattern

Both the OpenAPI spec (returns 202) and PayrollExport (Generate returns record, generates synchronously for now) suggest an async generation pattern. Reports may similarly generate synchronously in the first implementation and optionally move to async later.

### Data Scope / Access Control

The evaluation handler uses `scopeFromContext()` to get data scope (all/department/employee level) from the authenticated user. Reports would need the same data scope filtering to ensure users only see data they have access to.

### Existing Data Sources for Reports

All data sources needed for reports exist:
- Employee master data: `EmployeeRepository.List()` with filters
- Daily values: `DailyValueRepository.ListAll()` with scope
- Monthly values: `MonthlyValueRepository` with `GetByEmployeeMonth()`
- Absence days: `AbsenceDayRepository` with scope filtering
- Vacation balances: `VacationBalanceRepository`
- Orders/bookings: `OrderRepository`, `OrderBookingRepository`
- Teams: `TeamRepository` with members
- Departments: `DepartmentRepository`
- Cost centers: `CostCenterRepository`
- Accounts: `AccountRepository`

### Migration Sequence

The latest migration is `000061_create_payroll_exports`. The reports migration would be `000062` (need to check if `000062` is already taken -- it is not based on current listing ending at 61).
