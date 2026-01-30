# Implementation Plan: ZMI-TICKET-020 Reporting Module (Berichte)

Date: 2026-01-30
Ticket: ZMI-TICKET-020
Status: Ready for implementation

## Overview

Implement the Reporting Module which provides endpoints for generating, listing, downloading, and deleting reports. Reports query existing data (employees, daily values, monthly values, absences, vacations, orders) and produce downloadable PDF and Excel files.

The module follows the established pattern used by the PayrollExport module (the closest analogue): create a Report record in pending state, gather data, generate file content, store in DB, and make downloadable.

## Pre-existing Assets

The following already exist and do NOT need to be created:

- **OpenAPI spec**: `api/paths/reports.yaml` (5 endpoints), `api/schemas/reports.yaml` (4 schemas)
- **OpenAPI root**: `api/openapi.yaml` already references reports paths and definitions
- **Generated models**: `apps/api/gen/models/report.go`, `generate_report_request.go`, `report_list.go`
- **Permission**: `reports.view` in `apps/api/internal/permissions/permissions.go`
- **Data sources**: All repositories needed (Employee, DailyValue, MonthlyValue, AbsenceDay, VacationBalance, Order, OrderBooking, Team, Department, CostCenter) are fully implemented

## Phase 1: OpenAPI Spec Updates

**Goal**: Extend the existing OpenAPI spec to add `cost_center_ids` and `team_ids` filter parameters, and add a `reports.manage` permission for generate/delete operations.

### Files to modify

1. **`api/schemas/reports.yaml`** -- Add `cost_center_ids` and `team_ids` to the `parameters` sub-object in both `Report` and `GenerateReportRequest`:
   ```yaml
   # Inside parameters properties (both Report and GenerateReportRequest):
   cost_center_ids:
     type: array
     items:
       type: string
       format: uuid
   team_ids:
     type: array
     items:
       type: string
       format: uuid
   ```

2. **`api/paths/reports.yaml`** -- No changes needed. The existing 5 endpoints (list, generate, get, delete, download) cover all ticket requirements.

### Verification
- Run `make swagger-bundle` to rebundle the spec
- Run `make generate` to regenerate Go models with new parameter fields
- Verify `apps/api/gen/models/report.go` and `generate_report_request.go` now include `CostCenterIds` and `TeamIds` fields

### Dependencies
- None (first phase)

---

## Phase 2: Permission Update

**Goal**: Add a `reports.manage` permission for generate/delete operations (separate from existing `reports.view` which is read-only).

### Files to modify

1. **`apps/api/internal/permissions/permissions.go`** -- Add one new permission entry after the existing `reports.view`:
   ```go
   {ID: permissionID("reports.manage"), Resource: "reports", Action: "manage", Description: "Generate and manage reports"},
   ```

### Pattern reference
- Follow the PayrollExport pattern: `payroll.view` for read, `payroll.manage` for write (see `routes.go` lines 1057-1077)

### Verification
- Compile: `cd apps/api && go build ./...`
- Check that `permissions.ID("reports.manage")` resolves correctly

### Dependencies
- None

---

## Phase 3: Database Migration

**Goal**: Create the `reports` table to store report records and file content.

### Files to create

1. **`db/migrations/000062_create_reports.up.sql`**:

```sql
-- =============================================================
-- Create reports table
-- Stores generated report records and file content
-- =============================================================
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_type VARCHAR(30) NOT NULL
        CHECK (report_type IN (
            'daily_overview', 'weekly_overview', 'monthly_overview',
            'employee_timesheet', 'department_summary',
            'absence_report', 'vacation_report', 'overtime_report',
            'account_balances', 'custom'
        )),
    name VARCHAR(255),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    format VARCHAR(10) NOT NULL DEFAULT 'xlsx'
        CHECK (format IN ('json', 'csv', 'xlsx', 'pdf')),
    parameters JSONB DEFAULT '{}',
    file_content BYTEA,
    file_size INT,
    row_count INT,
    error_message TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_tenant ON reports(tenant_id);
CREATE INDEX idx_reports_type ON reports(tenant_id, report_type);
CREATE INDEX idx_reports_status ON reports(status);

CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE reports IS 'Generated report records with file content.';
COMMENT ON COLUMN reports.file_content IS 'Binary file content (PDF/XLSX). Stored as BYTEA for binary formats.';
COMMENT ON COLUMN reports.parameters IS 'JSON with from_date, to_date, employee_ids, department_ids, cost_center_ids, team_ids.';
```

**Key design decision**: Use `BYTEA` instead of `TEXT` for `file_content`. Unlike PayrollExport which only generates CSV (text), reports need to store binary PDF and XLSX content. BYTEA handles both binary and text formats.

2. **`db/migrations/000062_create_reports.down.sql`**:

```sql
DROP TABLE IF EXISTS reports;
```

### Pattern reference
- Follow `db/migrations/000061_create_payroll_exports.up.sql` structure

### Verification
- Run `make migrate-up` and verify the table is created
- Run `make migrate-down` and verify clean rollback

### Dependencies
- Phase 1 (spec must be finalized before modeling the table)

---

## Phase 4: Domain Model

**Goal**: Create the GORM domain model for the reports table.

### Files to create

1. **`apps/api/internal/model/report.go`**:

```go
package model

import (
    "encoding/json"
    "time"

    "github.com/google/uuid"
)

// ReportStatus represents the status of a report.
type ReportStatus string

const (
    ReportStatusPending    ReportStatus = "pending"
    ReportStatusGenerating ReportStatus = "generating"
    ReportStatusCompleted  ReportStatus = "completed"
    ReportStatusFailed     ReportStatus = "failed"
)

// ReportType represents the type of report.
type ReportType string

const (
    ReportTypeDailyOverview     ReportType = "daily_overview"
    ReportTypeWeeklyOverview    ReportType = "weekly_overview"
    ReportTypeMonthlyOverview   ReportType = "monthly_overview"
    ReportTypeEmployeeTimesheet ReportType = "employee_timesheet"
    ReportTypeDepartmentSummary ReportType = "department_summary"
    ReportTypeAbsenceReport     ReportType = "absence_report"
    ReportTypeVacationReport    ReportType = "vacation_report"
    ReportTypeOvertimeReport    ReportType = "overtime_report"
    ReportTypeAccountBalances   ReportType = "account_balances"
    ReportTypeCustom            ReportType = "custom"
)

// ReportFormat represents the output format.
type ReportFormat string

const (
    ReportFormatJSON ReportFormat = "json"
    ReportFormatCSV  ReportFormat = "csv"
    ReportFormatXLSX ReportFormat = "xlsx"
    ReportFormatPDF  ReportFormat = "pdf"
)

// Report represents a generated report record.
type Report struct {
    ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    ReportType   ReportType      `gorm:"type:varchar(30);not null" json:"report_type"`
    Name         string          `gorm:"type:varchar(255)" json:"name,omitempty"`
    Description  *string         `gorm:"type:text" json:"description,omitempty"`
    Status       ReportStatus    `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    Format       ReportFormat    `gorm:"type:varchar(10);not null;default:'xlsx'" json:"format"`
    Parameters   json.RawMessage `gorm:"type:jsonb;default:'{}'" json:"parameters,omitempty"`
    FileContent  []byte          `gorm:"type:bytea" json:"-"` // Not exposed in API
    FileSize     *int            `gorm:"type:int" json:"file_size,omitempty"`
    RowCount     *int            `gorm:"type:int" json:"row_count,omitempty"`
    ErrorMessage *string         `gorm:"type:text" json:"error_message,omitempty"`
    RequestedAt  time.Time       `gorm:"type:timestamptz;default:now()" json:"requested_at"`
    StartedAt    *time.Time      `gorm:"type:timestamptz" json:"started_at,omitempty"`
    CompletedAt  *time.Time      `gorm:"type:timestamptz" json:"completed_at,omitempty"`
    CreatedBy    *uuid.UUID      `gorm:"type:uuid" json:"created_by,omitempty"`
    CreatedAt    time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt    time.Time       `gorm:"default:now()" json:"updated_at"`
}

// TableName returns the database table name.
func (Report) TableName() string {
    return "reports"
}

// IsCompleted returns true if the report is completed.
func (r *Report) IsCompleted() bool {
    return r.Status == ReportStatusCompleted
}

// ReportParameters defines report filter parameters.
type ReportParameters struct {
    FromDate      *string     `json:"from_date,omitempty"`
    ToDate        *string     `json:"to_date,omitempty"`
    EmployeeIDs   []uuid.UUID `json:"employee_ids,omitempty"`
    DepartmentIDs []uuid.UUID `json:"department_ids,omitempty"`
    CostCenterIDs []uuid.UUID `json:"cost_center_ids,omitempty"`
    TeamIDs       []uuid.UUID `json:"team_ids,omitempty"`
}

// IsValidReportStatus checks if a string is a valid report status.
func IsValidReportStatus(s string) bool {
    switch ReportStatus(s) {
    case ReportStatusPending, ReportStatusGenerating,
        ReportStatusCompleted, ReportStatusFailed:
        return true
    }
    return false
}

// IsValidReportType checks if a string is a valid report type.
func IsValidReportType(s string) bool {
    switch ReportType(s) {
    case ReportTypeDailyOverview, ReportTypeWeeklyOverview,
        ReportTypeMonthlyOverview, ReportTypeEmployeeTimesheet,
        ReportTypeDepartmentSummary, ReportTypeAbsenceReport,
        ReportTypeVacationReport, ReportTypeOvertimeReport,
        ReportTypeAccountBalances, ReportTypeCustom:
        return true
    }
    return false
}

// IsValidReportFormat checks if a string is a valid report format.
func IsValidReportFormat(s string) bool {
    switch ReportFormat(s) {
    case ReportFormatJSON, ReportFormatCSV, ReportFormatXLSX, ReportFormatPDF:
        return true
    }
    return false
}
```

### Pattern reference
- Follow `apps/api/internal/model/payrollexport.go` structure exactly

### Verification
- Compile: `cd apps/api && go build ./...`

### Dependencies
- Phase 3 (table must exist for GORM model to match)

---

## Phase 5: Repository Layer

**Goal**: Create the report repository with CRUD operations and filter/pagination.

### Files to create

1. **`apps/api/internal/repository/report.go`**:

```go
package repository

// ReportFilter defines filter criteria for listing reports.
type ReportFilter struct {
    TenantID   uuid.UUID
    ReportType *string
    Status     *string
    Limit      int
    Cursor     *uuid.UUID
}

// ReportRepository handles report data access.
type ReportRepository struct {
    db *DB
}

func NewReportRepository(db *DB) *ReportRepository { ... }
func (r *ReportRepository) Create(ctx, report) error { ... }
func (r *ReportRepository) GetByID(ctx, id) (*model.Report, error) { ... }
func (r *ReportRepository) Update(ctx, report) error { ... }
func (r *ReportRepository) Delete(ctx, id) error { ... }
func (r *ReportRepository) List(ctx, filter) ([]model.Report, error) { ... }
```

Implementation details:
- `Create`: `r.db.GORM.WithContext(ctx).Create(report).Error`
- `GetByID`: `r.db.GORM.WithContext(ctx).First(&report, "id = ?", id)` with `gorm.ErrRecordNotFound` sentinel
- `Update`: `r.db.GORM.WithContext(ctx).Save(report).Error`
- `Delete`: `r.db.GORM.WithContext(ctx).Delete(&model.Report{}, "id = ?", id)` with RowsAffected check
- `List`: Tenant-scoped, with optional `report_type` and `status` filters, cursor-based pagination (`id < cursor`), `ORDER BY requested_at DESC`, `Limit(limit + 1)`

### Pattern reference
- Follow `apps/api/internal/repository/payrollexport.go` exactly

### Verification
- Compile: `cd apps/api && go build ./...`

### Dependencies
- Phase 4 (model must exist)

---

## Phase 6: Add Go Dependencies for PDF/Excel

**Goal**: Add the `excelize` library for XLSX generation and `go-pdf/fpdf` for PDF generation.

### Commands to run

```bash
cd apps/api
go get github.com/xuri/excelize/v2@latest
go get github.com/go-pdf/fpdf@latest
```

### Rationale
- `excelize` (github.com/xuri/excelize/v2): Most popular Go library for creating/reading XLSX files. Production-ready, actively maintained.
- `fpdf` (github.com/go-pdf/fpdf): Fork of the original gofpdf. Lightweight PDF generation with table support. Actively maintained.
- Neither library currently exists in `go.mod`.

### Verification
- `cd apps/api && go build ./...`
- Verify `go.mod` and `go.sum` updated

### Dependencies
- None (can be done in parallel with other phases)

---

## Phase 7: Service Layer

**Goal**: Implement report generation business logic, including data gathering for each report type and file format generation (CSV, XLSX, PDF).

### Files to create

1. **`apps/api/internal/service/report.go`**:

The service is the most complex component. It orchestrates:
- Input validation
- Report record lifecycle (pending -> generating -> completed/failed)
- Data gathering from multiple repositories based on report type
- File generation in requested format (CSV, XLSX, PDF)
- Data scope filtering (tenant + user access scope)

#### Service Structure

```go
package service

// Repository interfaces (private, following existing pattern)
type reportRepository interface {
    Create(ctx context.Context, r *model.Report) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Report, error)
    Update(ctx context.Context, r *model.Report) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, filter repository.ReportFilter) ([]model.Report, error)
}

type reportEmployeeRepository interface {
    List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

type reportDailyValueRepository interface {
    ListAll(ctx context.Context, filter repository.DailyValueFilter) ([]model.DailyValue, error)
}

type reportMonthlyValueRepository interface {
    GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
}

type reportAbsenceDayRepository interface {
    List(ctx context.Context, filter repository.AbsenceDayFilter) ([]model.AbsenceDay, error)
}

type reportVacationBalanceRepository interface {
    GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
}

type reportTeamRepository interface {
    List(ctx context.Context, filter repository.TeamFilter) ([]model.Team, error)
    ListMembers(ctx context.Context, teamID uuid.UUID) ([]model.TeamMember, error)
}

// Input/Filter structs
type GenerateReportInput struct {
    TenantID      uuid.UUID
    ReportType    string
    Format        string
    Name          string
    FromDate      *string
    ToDate        *string
    EmployeeIDs   []uuid.UUID
    DepartmentIDs []uuid.UUID
    CostCenterIDs []uuid.UUID
    TeamIDs       []uuid.UUID
    CreatedBy     *uuid.UUID
}

type ReportListFilter struct {
    TenantID   uuid.UUID
    ReportType *string
    Status     *string
    Limit      int
    Cursor     *uuid.UUID
}

// ReportService handles report generation business logic.
type ReportService struct {
    repo         reportRepository
    employeeRepo reportEmployeeRepository
    dailyRepo    reportDailyValueRepository
    monthlyRepo  reportMonthlyValueRepository
    absenceRepo  reportAbsenceDayRepository
    vacationRepo reportVacationBalanceRepository
    teamRepo     reportTeamRepository
}

func NewReportService(
    repo reportRepository,
    employeeRepo reportEmployeeRepository,
    dailyRepo reportDailyValueRepository,
    monthlyRepo reportMonthlyValueRepository,
    absenceRepo reportAbsenceDayRepository,
    vacationRepo reportVacationBalanceRepository,
    teamRepo reportTeamRepository,
) *ReportService { ... }
```

#### Service Methods

```go
// Generate creates and generates a report synchronously.
func (s *ReportService) Generate(ctx context.Context, input GenerateReportInput) (*model.Report, error)

// GetByID retrieves a report by ID.
func (s *ReportService) GetByID(ctx context.Context, id uuid.UUID) (*model.Report, error)

// List retrieves reports with filters.
func (s *ReportService) List(ctx context.Context, filter ReportListFilter) ([]model.Report, bool, error)

// Delete deletes a report.
func (s *ReportService) Delete(ctx context.Context, id uuid.UUID) error

// GetDownloadContent returns the file content and metadata for download.
func (s *ReportService) GetDownloadContent(ctx context.Context, id uuid.UUID) ([]byte, string, string, error)
```

Note: `GetDownloadContent` returns `[]byte` (not `string` like PayrollExport) because reports produce binary content (PDF/XLSX).

#### Sentinel Errors

```go
var (
    ErrReportNotFound        = errors.New("report not found")
    ErrReportTypeRequired    = errors.New("report type is required")
    ErrReportTypeInvalid     = errors.New("invalid report type")
    ErrReportFormatRequired  = errors.New("report format is required")
    ErrReportFormatInvalid   = errors.New("invalid report format")
    ErrReportDateRangeNeeded = errors.New("from_date and to_date are required for this report type")
    ErrReportNotReady        = errors.New("report is not ready (still generating or not started)")
)
```

#### Generate Flow (mirrors PayrollExport pattern)

1. Validate input (type, format, required parameters per type)
2. Serialize parameters to JSON
3. Create `model.Report` in `pending` status, persist via repo
4. Mark as `generating`, update `started_at`
5. Gather data based on `report_type`:
   - **monthly_overview**: Query MonthlyValue for each employee in scope for the date range
   - **daily_overview**: Query DailyValue for employees in scope within date range
   - **employee_timesheet**: Query DailyValue + bookings for a specific employee over a date range
   - **absence_report**: Query AbsenceDay records within date range and scope
   - **vacation_report**: Query VacationBalance for employees in scope for the year
   - **overtime_report**: Query MonthlyValue focusing on overtime fields
   - **department_summary**: Group by department, aggregate MonthlyValue
   - **account_balances**: Query MonthlyValue flextime/account fields
   - **weekly_overview**: Query DailyValue grouped by week
   - **custom**: Placeholder (returns empty or minimal data)
6. Filter employees by scope (tenant, department IDs, cost center IDs, team IDs, employee IDs)
7. Generate file content based on `format`:
   - **csv**: Use `encoding/csv` (same pattern as PayrollExport)
   - **xlsx**: Use `excelize/v2` to build workbook with header row + data rows
   - **pdf**: Use `go-pdf/fpdf` to create a table-based PDF document
   - **json**: Use `encoding/json` to marshal structured data
8. On success: Update status to `completed`, store `file_content`, set `file_size`, `row_count`, `completed_at`
9. On error: Update status to `failed`, store `error_message`
10. Return the report record

#### Internal Data Gathering Helpers

Each report type has a private method that gathers the relevant data:

```go
func (s *ReportService) gatherMonthlyOverview(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) ([]reportRow, error)
func (s *ReportService) gatherDailyOverview(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) ([]reportRow, error)
func (s *ReportService) gatherAbsenceReport(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) ([]reportRow, error)
func (s *ReportService) gatherVacationReport(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) ([]reportRow, error)
func (s *ReportService) gatherOvertimeReport(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) ([]reportRow, error)
// ... etc.
```

Each returns a `[]reportRow` (a flat list of key-value rows suitable for CSV/XLSX/PDF table rendering).

#### Internal File Generation Helpers

```go
// reportRow is an internal type for tabular report data
type reportRow struct {
    headers []string
    values  [][]string
}

func generateReportCSV(data reportRow) ([]byte, error)     // encoding/csv
func generateReportXLSX(data reportRow, title string) ([]byte, error)  // excelize
func generateReportPDF(data reportRow, title string) ([]byte, error)   // fpdf
func generateReportJSON(data any) ([]byte, error)          // encoding/json
```

### Scope filtering logic

Employee scope filtering should follow this order:
1. Start with all active employees for the tenant
2. If `department_ids` provided, filter to those departments
3. If `cost_center_ids` provided, filter to those cost centers
4. If `team_ids` provided, resolve team members and filter
5. If `employee_ids` provided, filter to those specific employees

### Pattern reference
- Follow `apps/api/internal/service/payrollexport.go` for lifecycle management
- Follow `apps/api/internal/service/evaluation.go` for data querying patterns

### Verification
- Compile: `cd apps/api && go build ./...`

### Dependencies
- Phase 4 (model), Phase 5 (repository), Phase 6 (PDF/Excel libs)

---

## Phase 8: Handler Layer

**Goal**: Implement HTTP handlers that parse requests, call the service, and map domain models to generated response models.

### Files to create

1. **`apps/api/internal/handler/report.go`**:

#### Handler Structure

```go
package handler

type ReportHandler struct {
    svc *service.ReportService
}

func NewReportHandler(svc *service.ReportService) *ReportHandler {
    return &ReportHandler{svc: svc}
}
```

#### Handler Methods (must match OpenAPI spec endpoints)

1. **`List`** -- `GET /reports` (listReports)
   - Extract tenant from context: `middleware.TenantFromContext(r.Context())`
   - Parse query params: `report_type`, `status`, `limit`, `cursor`
   - Call `s.svc.List(ctx, filter)`
   - Map `[]model.Report` to `[]*models.Report` via `reportToResponse()`
   - Build cursor pagination
   - Respond with `models.ReportList{Data, Meta}`

2. **`Generate`** -- `POST /reports` (generateReport)
   - Extract tenant from context
   - Decode request body into `models.GenerateReportRequest`
   - Validate with `req.Validate(nil)`
   - Map to `service.GenerateReportInput`
   - Parse parameters (from_date, to_date, employee_ids, department_ids, cost_center_ids, team_ids)
   - Get current user via `auth.UserFromContext()`
   - Call `s.svc.Generate(ctx, input)`
   - Respond 202 with `reportToResponse(report)`

3. **`Get`** -- `GET /reports/{id}` (getReport)
   - Parse UUID from `chi.URLParam(r, "id")`
   - Call `s.svc.GetByID(ctx, id)`
   - Respond 200 with `reportToResponse(report)`

4. **`Delete`** -- `DELETE /reports/{id}` (deleteReport)
   - Parse UUID from URL param
   - Call `s.svc.Delete(ctx, id)`
   - Respond 204

5. **`Download`** -- `GET /reports/{id}/download` (downloadReport)
   - Parse UUID from URL param
   - Call `s.svc.GetDownloadContent(ctx, id)` -- returns `([]byte, contentType, filename, error)`
   - Set `Content-Type`, `Content-Disposition`, `Content-Length` headers
   - Write binary content to response body

#### Response Mapping Function

```go
func reportToResponse(r *model.Report) *models.Report {
    // Map model.Report fields to gen/models.Report fields
    // Follow payrollExportToResponse() pattern exactly
    // Use strfmt.UUID, strfmt.DateTime conversions
}
```

#### Error Handler Function

```go
func handleReportError(w http.ResponseWriter, err error) {
    switch err {
    case service.ErrReportNotFound:
        respondError(w, http.StatusNotFound, "Report not found")
    case service.ErrReportTypeRequired:
        respondError(w, http.StatusBadRequest, "Report type is required")
    case service.ErrReportTypeInvalid:
        respondError(w, http.StatusBadRequest, "Invalid report type")
    case service.ErrReportFormatRequired:
        respondError(w, http.StatusBadRequest, "Report format is required")
    case service.ErrReportFormatInvalid:
        respondError(w, http.StatusBadRequest, "Invalid report format")
    case service.ErrReportDateRangeNeeded:
        respondError(w, http.StatusBadRequest, "Date range (from_date, to_date) required for this report type")
    case service.ErrReportNotReady:
        respondError(w, http.StatusConflict, "Report is not ready (still generating or failed)")
    default:
        respondError(w, http.StatusInternalServerError, "Internal server error")
    }
}
```

### Pattern reference
- Follow `apps/api/internal/handler/payrollexport.go` exactly

### Verification
- Compile: `cd apps/api && go build ./...`

### Dependencies
- Phase 7 (service must exist)

---

## Phase 9: Route Registration

**Goal**: Register report routes and wire everything up in main.go.

### Files to modify

1. **`apps/api/internal/handler/routes.go`** -- Add `RegisterReportRoutes`:

```go
// RegisterReportRoutes registers report routes.
func RegisterReportRoutes(r chi.Router, h *ReportHandler, authz *middleware.AuthorizationMiddleware) {
    permView := permissions.ID("reports.view").String()
    permManage := permissions.ID("reports.manage").String()
    r.Route("/reports", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Generate)
            r.Get("/{id}", h.Get)
            r.Delete("/{id}", h.Delete)
            r.Get("/{id}/download", h.Download)
            return
        }
        r.With(authz.RequirePermission(permView)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Generate)
        r.With(authz.RequirePermission(permView)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
        r.With(authz.RequirePermission(permView)).Get("/{id}/download", h.Download)
    })
}
```

Permission mapping:
- `GET /reports` -- `reports.view` (read)
- `POST /reports` -- `reports.manage` (generate)
- `GET /reports/{id}` -- `reports.view` (read)
- `DELETE /reports/{id}` -- `reports.manage` (delete)
- `GET /reports/{id}/download` -- `reports.view` (download)

2. **`apps/api/cmd/server/main.go`** -- Add wiring in the repository/service/handler/route chain.

In the repositories section (after payrollExportRepo):
```go
reportRepo := repository.NewReportRepository(db)
```

In the services section (after payrollExportService):
```go
reportService := service.NewReportService(
    reportRepo,
    employeeRepo,
    dailyValueRepo,
    monthlyValueRepo,
    absenceDayRepo,
    vacationBalanceRepo,
    teamRepo,
)
```

In the handlers section (after payrollExportHandler):
```go
reportHandler := handler.NewReportHandler(reportService)
```

In the tenant-scoped routes group (after RegisterPayrollExportRoutes):
```go
handler.RegisterReportRoutes(r, reportHandler, authzMiddleware)
```

### Pattern reference
- Follow PayrollExport wiring pattern in main.go (lines 273-276 and line 402)
- Follow route registration pattern in routes.go (RegisterPayrollExportRoutes)

### Verification
- Compile: `cd apps/api && go build ./...`
- Start dev server: `make dev` and verify no startup errors

### Dependencies
- Phase 8 (handler must exist)

---

## Phase 10: Tests

**Goal**: Write comprehensive unit tests for the service layer and handler layer.

### Files to create

1. **`apps/api/internal/service/report_test.go`**:

#### Mock Repository Definitions

```go
type mockReportRepo struct { mock.Mock }
// Implement: Create, GetByID, Update, Delete, List

type mockReportEmployeeRepo struct { mock.Mock }
// Implement: List

type mockReportDailyValueRepo struct { mock.Mock }
// Implement: ListAll

type mockReportMonthlyValueRepo struct { mock.Mock }
// Implement: GetByEmployeeMonth

type mockReportAbsenceDayRepo struct { mock.Mock }
// Implement: List

type mockReportVacationBalanceRepo struct { mock.Mock }
// Implement: GetByEmployeeYear

type mockReportTeamRepo struct { mock.Mock }
// Implement: List, ListMembers
```

#### Test Cases

**Validation tests:**
- `TestReportService_Generate_MissingReportType` -- returns `ErrReportTypeRequired`
- `TestReportService_Generate_InvalidReportType` -- returns `ErrReportTypeInvalid`
- `TestReportService_Generate_MissingFormat` -- returns `ErrReportFormatRequired`
- `TestReportService_Generate_InvalidFormat` -- returns `ErrReportFormatInvalid`
- `TestReportService_Generate_DateRangeRequired` -- monthly/daily reports need date range, returns `ErrReportDateRangeNeeded`

**Generation tests:**
- `TestReportService_Generate_MonthlyOverview_CSV` -- generate monthly overview as CSV, verify completed status and file content
- `TestReportService_Generate_MonthlyOverview_XLSX` -- same as above for XLSX format
- `TestReportService_Generate_MonthlyOverview_PDF` -- same as above for PDF format
- `TestReportService_Generate_AbsenceReport` -- absence report generation
- `TestReportService_Generate_VacationReport` -- vacation report generation
- `TestReportService_Generate_EmptyData` -- no employees matched, still completes with 0 rows
- `TestReportService_Generate_FailedGeneration` -- repo error during data gathering leads to failed status

**CRUD tests:**
- `TestReportService_GetByID_Success`
- `TestReportService_GetByID_NotFound`
- `TestReportService_List_Success` -- with filters and pagination
- `TestReportService_List_HasMore` -- pagination cursor
- `TestReportService_Delete_Success`
- `TestReportService_Delete_NotFound`
- `TestReportService_GetDownloadContent_Success`
- `TestReportService_GetDownloadContent_NotReady` -- pending report, returns `ErrReportNotReady`
- `TestReportService_GetDownloadContent_NoContent` -- completed but nil content

**Format output tests:**
- `TestGenerateReportCSV` -- verify CSV output structure
- `TestGenerateReportXLSX` -- verify XLSX output is valid (non-empty bytes)
- `TestGenerateReportPDF` -- verify PDF output is valid (starts with `%PDF`)

2. **`apps/api/internal/handler/report_test.go`**:

**Handler tests** (lighter-weight, primarily testing request parsing and response mapping):
- `TestReportHandler_List_QueryParams` -- verify query param parsing
- `TestReportHandler_Generate_ValidRequest` -- verify request body decoding and validation
- `TestReportHandler_Get_InvalidID` -- verify UUID parsing error handling
- `TestReportHandler_Download_ContentHeaders` -- verify response headers are set correctly

### Pattern reference
- Follow `apps/api/internal/service/payrollexport_test.go` for mock definitions and test structure
- Follow `apps/api/internal/handler/evaluation_test.go` for handler tests

### Verification
- Run tests: `cd apps/api && go test -v -run TestReport ./internal/service/...`
- Run handler tests: `cd apps/api && go test -v -run TestReport ./internal/handler/...`
- Run all tests: `cd apps/api && go test -race ./...`

### Dependencies
- Phase 7 (service), Phase 8 (handler)

---

## Phase 11: Verification

**Goal**: End-to-end verification that everything works.

### Steps

1. **Compile check**:
   ```bash
   cd apps/api && go build ./...
   ```

2. **Lint**:
   ```bash
   make lint
   ```

3. **Format**:
   ```bash
   make fmt
   ```

4. **All tests pass**:
   ```bash
   make test
   ```

5. **Migration**:
   ```bash
   make migrate-up
   make migrate-down
   make migrate-up
   ```

6. **Bundle OpenAPI** (if spec was modified):
   ```bash
   make swagger-bundle
   make generate
   ```

7. **Manual smoke test** (if dev environment available):
   ```bash
   make dev
   # In another terminal:
   # 1. Login to get JWT
   curl -s http://localhost:8080/api/v1/auth/dev/login?role=admin | jq .token
   # 2. Generate a report
   curl -X POST http://localhost:8080/api/v1/reports \
     -H "Authorization: Bearer <token>" \
     -H "X-Tenant-ID: <tenant-id>" \
     -H "Content-Type: application/json" \
     -d '{"report_type":"monthly_overview","format":"xlsx","parameters":{"from_date":"2026-01-01","to_date":"2026-01-31"}}'
   # 3. List reports
   curl http://localhost:8080/api/v1/reports \
     -H "Authorization: Bearer <token>" \
     -H "X-Tenant-ID: <tenant-id>"
   # 4. Download report
   curl http://localhost:8080/api/v1/reports/<id>/download \
     -H "Authorization: Bearer <token>" \
     -H "X-Tenant-ID: <tenant-id>" \
     -o report.xlsx
   ```

### Dependencies
- All previous phases

---

## File Summary

### Files to create (8 new files)

| File | Phase | Description |
|------|-------|-------------|
| `db/migrations/000062_create_reports.up.sql` | 3 | Reports table |
| `db/migrations/000062_create_reports.down.sql` | 3 | Rollback migration |
| `apps/api/internal/model/report.go` | 4 | Domain model |
| `apps/api/internal/repository/report.go` | 5 | Data access layer |
| `apps/api/internal/service/report.go` | 7 | Business logic + file generation |
| `apps/api/internal/handler/report.go` | 8 | HTTP handler |
| `apps/api/internal/service/report_test.go` | 10 | Service unit tests |
| `apps/api/internal/handler/report_test.go` | 10 | Handler tests |

### Files to modify (5 existing files)

| File | Phase | Changes |
|------|-------|---------|
| `api/schemas/reports.yaml` | 1 | Add cost_center_ids, team_ids parameters |
| `apps/api/internal/permissions/permissions.go` | 2 | Add reports.manage permission |
| `apps/api/internal/handler/routes.go` | 9 | Add RegisterReportRoutes function |
| `apps/api/cmd/server/main.go` | 9 | Wire report repository, service, handler, routes |
| `apps/api/go.mod` | 6 | Add excelize and fpdf dependencies |

### Files to regenerate (phase 1)

| File | Phase | Action |
|------|-------|--------|
| `api/openapi.bundled.yaml` | 1 | `make swagger-bundle` |
| `apps/api/gen/models/report.go` | 1 | `make generate` (adds cost_center_ids, team_ids) |
| `apps/api/gen/models/generate_report_request.go` | 1 | `make generate` (adds cost_center_ids, team_ids) |

---

## Implementation Order Summary

```
Phase 1:  OpenAPI spec updates + bundle + generate
Phase 2:  Permission update (reports.manage)
Phase 3:  Database migration (reports table)
Phase 4:  Domain model (model/report.go)
Phase 5:  Repository (repository/report.go)
Phase 6:  Go dependencies (excelize, fpdf) -- can parallel with 3-5
Phase 7:  Service layer (service/report.go) -- depends on 4, 5, 6
Phase 8:  Handler layer (handler/report.go) -- depends on 7
Phase 9:  Route registration + main.go wiring -- depends on 8
Phase 10: Tests -- depends on 7, 8
Phase 11: Full verification -- depends on all
```

## Key Design Decisions

1. **BYTEA for file_content**: Unlike PayrollExport (TEXT for CSV), reports use BYTEA to store binary PDF/XLSX content. The handler writes raw `[]byte` to the response.

2. **Synchronous generation**: Like PayrollExport, generation is synchronous in the first implementation. The 202 response pattern is preserved for future async migration.

3. **Report type dispatch**: The service dispatches to type-specific data gatherers via a switch on `report_type`. Each gatherer returns a uniform `reportRow` struct.

4. **Format dispatch**: After data gathering, format-specific generators produce the final `[]byte` output. This separates data logic from rendering.

5. **Permission split**: `reports.view` (existing) for read operations, `reports.manage` (new) for generate/delete, matching the PayrollExport pattern.

6. **Scope filtering**: Employee filtering respects tenant scope and cascades through department -> cost center -> team -> individual employee filters.
