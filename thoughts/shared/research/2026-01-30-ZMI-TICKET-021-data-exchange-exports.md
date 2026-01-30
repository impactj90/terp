# Research: ZMI-TICKET-021 - Data Exchange and Payroll Exports

## 1. Ticket Overview

ZMI-TICKET-021 implements data exchange configuration and export generation for payroll systems. The scope includes:
- Interface definition CRUD (interface number, name, mandant number in payroll system, export script, export path, output filename)
- Account selection for export (only accounts with export flag enabled)
- Export file generation for a period with employee filters
- Dependencies on Accounts module (ZMI-TICKET-009) and Monthly evaluation (ZMI-TICKET-016)

Reference: ZMI calculation manual section 11 (Data Exchange / Datenaustausch) in `impl_plan/zmi-docs/08-data-exchange-server.md`.

---

## 2. Existing Codebase Analysis

### 2.1 Account Model and Export-Related Fields

The Account model already has payroll export fields implemented as part of ZMI-TICKET-009.

**Domain model** (`apps/api/internal/model/account.go`):
```go
type Account struct {
    ID                uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID          *uuid.UUID    `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
    Code              string        `gorm:"type:varchar(50);not null" json:"code"`
    Name              string        `gorm:"type:varchar(255);not null" json:"name"`
    // ... other fields ...
    IsPayrollRelevant bool          `gorm:"default:false" json:"is_payroll_relevant"`
    PayrollCode       *string       `gorm:"type:varchar(50)" json:"payroll_code,omitempty"`
    // ...
}
```

Key fields for data exchange:
- `IsPayrollRelevant` (bool) - corresponds to the "Exportieren" checkbox / ExportEnabled flag from the ZMI manual. Controls whether the account is included in payroll exports.
- `PayrollCode` (*string) - corresponds to the "Lohnart" (payroll type) field from the ZMI manual. Used as the code in the export to the payroll system.

**Database migration** (`db/migrations/000033_add_account_fields.up.sql`):
```sql
ALTER TABLE accounts
  ADD COLUMN is_payroll_relevant BOOLEAN DEFAULT false,
  ADD COLUMN payroll_code VARCHAR(50),
  -- plus description, sort_order, year_carryover
```

**Repository filtering** (`apps/api/internal/repository/account.go`):
The `ListFiltered` method supports a `payrollRelevant *bool` filter parameter, enabling queries like "list all accounts where is_payroll_relevant = true":
```go
func (r *AccountRepository) ListFiltered(ctx context.Context, tenantID uuid.UUID, includeSystem bool, active *bool, accountType *model.AccountType, payrollRelevant *bool) ([]model.Account, error) {
    // ...
    if payrollRelevant != nil {
        query = query.Where("is_payroll_relevant = ?", *payrollRelevant)
    }
    // ...
}
```

**Service layer** (`apps/api/internal/service/account.go`):
- `CreateAccountInput` includes `IsPayrollRelevant bool` and `PayrollCode *string`
- `UpdateAccountInput` includes `IsPayrollRelevant *bool` and `PayrollCode *string`
- `ListFiltered` passes through the `payrollRelevant` filter

**Handler layer** (`apps/api/internal/handler/account.go`):
- List endpoint supports `?payroll_relevant=true|false` query parameter
- Create/Update endpoints map `is_payroll_relevant` and `payroll_code` from the request body

**OpenAPI schema** (`api/schemas/accounts.yaml`):
```yaml
Account:
  properties:
    is_payroll_relevant:
      type: boolean
      description: Include in payroll export
    payroll_code:
      type: string
      x-nullable: true
      description: Code for payroll system export
```

### 2.2 Tenant Model and Payroll Export Base Path

The tenant model (`apps/api/internal/model/tenant.go`) already contains a payroll export base path field:
```go
type Tenant struct {
    // ...
    PayrollExportBasePath *string `gorm:"type:text" json:"payroll_export_base_path,omitempty"`
    // ...
}
```

Added via migration `db/migrations/000037_add_tenant_mandant_fields.up.sql`:
```sql
ALTER TABLE tenants
  ADD COLUMN payroll_export_base_path TEXT;
```

### 2.3 Monthly Evaluation Implementation

The monthly evaluation (ZMI-TICKET-016) is fully implemented. This is a key dependency for generating payroll exports, as exports are based on monthly aggregated values.

**Monthly value model** (`apps/api/internal/model/monthlyvalue.go`):
```go
type MonthlyValue struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey"`
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    Year       int
    Month      int

    // Aggregated time totals (all in minutes)
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    // Flextime balance (all in minutes)
    FlextimeStart     int
    FlextimeChange    int
    FlextimeEnd       int
    FlextimeCarryover int

    // Absence summary
    VacationTaken    decimal.Decimal
    SickDays         int
    OtherAbsenceDays int

    // Work summary
    WorkDays       int
    DaysWithErrors int

    // Month closing
    IsClosed   bool
    ClosedAt   *time.Time
    ClosedBy   *uuid.UUID
    ReopenedAt *time.Time
    ReopenedBy *uuid.UUID
}
```

**Monthly value repository** (`apps/api/internal/repository/monthlyvalue.go`):
Key methods:
- `GetByEmployeeMonth(ctx, employeeID, year, month)` - get single employee month
- `ListByEmployeeYear(ctx, employeeID, year)` - year overview
- `Upsert(ctx, mv)` - create or update
- `CloseMonth(ctx, employeeID, year, month, closedBy)` - close month
- `ReopenMonth(ctx, employeeID, year, month, reopenedBy)` - reopen month

**Monthly evaluation service** (`apps/api/internal/service/monthlyeval.go`):
Key methods:
- `CalculateMonthSummary(ctx, employeeID, year, month)` - calculate aggregated values
- `GetOrCalculateMonthSummary(ctx, employeeID, year, month)` - get stored or calculate
- `CloseMonth(ctx, employeeID, year, month, closedBy)` - close a month
- `ReopenMonth(ctx, employeeID, year, month, reopenedBy)` - reopen
- `GetYearOverview(ctx, employeeID, year)` - year overview

**Monthly evaluation handler** (`apps/api/internal/handler/monthlyeval.go`):
Endpoints registered under `/employees/{id}/months`:
- `GET /{year}` - year overview
- `GET /{year}/{month}` - month summary
- `GET /{year}/{month}/days` - daily breakdown
- `POST /{year}/{month}/close` - close month
- `POST /{year}/{month}/reopen` - reopen month
- `POST /{year}/{month}/recalculate` - recalculate month

### 2.4 Existing Payroll Export OpenAPI Specs (Spec Only, No Implementation)

OpenAPI specs exist for payroll exports but there is NO corresponding Go implementation (no handler, service, repository, or model).

**OpenAPI paths** (`api/paths/payroll-exports.yaml`):
Defined endpoints:
- `GET /payroll-exports` - List payroll exports (with year, month, status filters)
- `POST /payroll-exports` - Generate payroll export (async)
- `GET /payroll-exports/{id}` - Get export by ID
- `DELETE /payroll-exports/{id}` - Delete export
- `GET /payroll-exports/{id}/download` - Download export file
- `GET /payroll-exports/{id}/preview` - Preview export data as JSON

**OpenAPI schemas** (`api/schemas/payroll-exports.yaml`):
Defined schemas:
- `PayrollExport` - Full export record with status (pending/generating/completed/failed), export_type (standard/datev/sage/custom), format (csv/xlsx/xml/json), parameters (employee_ids, department_ids, include_accounts), file_url, file_size, row_count, summary totals
- `PayrollExportSummary` - Lightweight version
- `PayrollExportLine` - Per-employee line item with time values, account values, absence days
- `GeneratePayrollExportRequest` - Request to generate an export (year, month, export_type, format, parameters)
- `PayrollExportList` - Paginated list wrapper

**Generated Go models** (`apps/api/gen/models/`):
- `payroll_export.go` - PayrollExport struct and PayrollExportParameters nested struct
- `payroll_export_list.go` - PayrollExportList struct
- `generate_payroll_export_request.go` - GeneratePayrollExportRequest struct and GeneratePayrollExportRequestParameters nested struct

Note: The existing specs define a general payroll export mechanism. ZMI-TICKET-021 requires adding the "Interface definition" CRUD which is NOT yet in the OpenAPI specs. The interface definition includes: interface number, name, mandant number in payroll system, export script, export path, output filename -- these map to the ZMI manual section 11.2.

### 2.5 CRUD Endpoint Patterns (Handler -> Service -> Repository)

The codebase follows a consistent clean architecture pattern. Using the Account module as reference:

**Route registration** (`apps/api/internal/handler/routes.go`):
```go
func RegisterAccountRoutes(r chi.Router, h *AccountHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("accounts.manage").String()
    r.Route("/accounts", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        // ... same routes with authz middleware
    })
}
```

Pattern: Routes are registered in `routes.go` with a `Register*Routes` function. The function accepts the handler, router, and optional authz middleware. Each route block has a nil-authz fallback for testing.

**Handler pattern** (`apps/api/internal/handler/account.go`):
```go
type AccountHandler struct {
    accountService *service.AccountService
}

func NewAccountHandler(accountService *service.AccountService) *AccountHandler {
    return &AccountHandler{accountService: accountService}
}

func (h *AccountHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    // Decode request using generated models
    var req models.CreateAccountRequest
    json.NewDecoder(r.Body).Decode(&req)
    req.Validate(nil)
    // Map to service input struct
    input := service.CreateAccountInput{...}
    // Call service
    account, err := h.accountService.Create(r.Context(), input)
    // Error mapping to HTTP status codes
    // respondJSON(w, http.StatusCreated, account)
}
```

Pattern: Handlers take a service, decode using generated models, validate with `.Validate(nil)`, map to service input structs, call service methods, and map service errors to HTTP status codes. Response uses `respondJSON` / `respondError` from `response.go`.

**Service pattern** (`apps/api/internal/service/account.go`):
```go
type accountRepository interface {
    // Interface methods...
}

type AccountService struct {
    accountRepo accountRepository
}

func NewAccountService(accountRepo accountRepository) *AccountService {
    return &AccountService{accountRepo: accountRepo}
}

type CreateAccountInput struct { ... }
type UpdateAccountInput struct { ... }

func (s *AccountService) Create(ctx context.Context, input CreateAccountInput) (*model.Account, error) {
    // Validation
    // Business logic
    // Repository calls
}
```

Pattern: Services define a repository interface (not using the concrete type), have input/output structs, return domain model types, and define error variables at package level.

**Repository pattern** (`apps/api/internal/repository/account.go`):
```go
type AccountRepository struct {
    db *DB
}

func NewAccountRepository(db *DB) *AccountRepository {
    return &AccountRepository{db: db}
}

func (r *AccountRepository) Create(ctx context.Context, account *model.Account) error {
    return r.db.GORM.WithContext(ctx).Select(...).Create(account).Error
}
```

Pattern: Repositories take `*DB` (which wraps `*gorm.DB`), use `WithContext(ctx)` for all queries, return domain model pointers, and define error variables at package level.

**Wiring in main.go** (`apps/api/cmd/server/main.go`):
```go
// Initialize repositories
accountRepo := repository.NewAccountRepository(db)
// Initialize services
accountService := service.NewAccountService(accountRepo)
// Initialize handlers
accountHandler := handler.NewAccountHandler(accountService)
// Register routes
handler.RegisterAccountRoutes(r, accountHandler, authzMiddleware)
```

### 2.6 OpenAPI Spec Patterns

**Path files** (`api/paths/*.yaml`):
Each resource gets its own path file. Example: `api/paths/payroll-exports.yaml` defines all endpoints for the payroll export resource using Swagger 2.0 format. References to schemas use relative paths like `'../schemas/payroll-exports.yaml#/PayrollExport'`.

**Schema files** (`api/schemas/*.yaml`):
Each domain resource gets its own schema file. Contains: the main entity schema, summary schema, list wrapper (with `data` array + `meta` PaginationMeta), and request schemas (Create/Update).

**Main spec** (`api/openapi.yaml`):
References paths and schemas using `$ref` with relative paths. Payroll exports are already referenced:
```yaml
/payroll-exports:
  $ref: 'paths/payroll-exports.yaml#/~1payroll-exports'
```

**Generation pipeline**:
1. Define schemas in `api/schemas/*.yaml`
2. Define paths in `api/paths/*.yaml`
3. Reference in `api/openapi.yaml`
4. Run `make swagger-bundle` (uses swagger-cli to produce `api/openapi.bundled.yaml`)
5. Run `make generate` (uses go-swagger to generate Go models in `apps/api/gen/models/`)

### 2.7 Migration Patterns

**Latest migration number**: 000052 (`db/migrations/000052_create_employee_capping_exceptions.up.sql`). The next migration would be 000053.

**Migration naming convention**: `{sequence}_{description}.{up|down}.sql`

**Migration structure pattern** (from `db/migrations/000052_create_employee_capping_exceptions.up.sql`):
```sql
-- Header comment explaining purpose
-- Reference to ZMI manual section
CREATE TABLE table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- fields...
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- unique constraints inline
    UNIQUE(...)
);

CREATE INDEX idx_prefix_column ON table_name(column);

CREATE TRIGGER update_table_name_updated_at
    BEFORE UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE table_name IS '...';
COMMENT ON COLUMN table_name.column IS '...';
```

### 2.8 Test Patterns

**Service tests** (`apps/api/internal/service/account_test.go`):
```go
func TestAccountService_Create_Success(t *testing.T) {
    db := testutil.SetupTestDB(t)          // Transaction-based isolation
    repo := repository.NewAccountRepository(db)
    svc := service.NewAccountService(repo)
    ctx := context.Background()
    tenant := createTestTenantForAccountService(t, db)  // Helper to create test tenant

    input := service.CreateAccountInput{...}
    account, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, "OVERTIME", account.Code)
}
```

Pattern: Uses `testutil.SetupTestDB(t)` for transaction-based isolation (auto-rollback on cleanup). Creates real database objects. Tests both success and error cases with `require.NoError` / `assert.ErrorIs`.

**Handler tests** (`apps/api/internal/handler/account_test.go`):
```go
func setupAccountHandler(t *testing.T) (*handler.AccountHandler, *service.AccountService, ...) {
    db := testutil.SetupTestDB(t)
    accountRepo := repository.NewAccountRepository(db)
    svc := service.NewAccountService(accountRepo)
    h := handler.NewAccountHandler(svc)
    // Create test tenant
    return h, svc, accountRepo, tenant, db
}

func TestAccountHandler_Create_Success(t *testing.T) {
    h, _, _, tenant, _ := setupAccountHandler(t)
    body := `{"code": "OVERTIME", "name": "Overtime Account", "account_type": "bonus"}`
    req := httptest.NewRequest("POST", "/accounts", bytes.NewBufferString(body))
    req = withAccountTenantContext(req, tenant)  // Inject tenant context
    rr := httptest.NewRecorder()
    h.Create(rr, req)
    assert.Equal(t, http.StatusCreated, rr.Code)
}
```

Pattern: Uses `httptest.NewRequest` / `httptest.NewRecorder`. Injects tenant context manually. Tests HTTP status codes and response body. Chi route context is injected manually for URL parameters:
```go
rctx := chi.NewRouteContext()
rctx.URLParams.Add("id", id.String())
req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
```

**Test utilities** (`apps/api/internal/testutil/db.go`):
Uses a shared database connection initialized once via `sync.Once`. Each test gets a transaction that is rolled back on cleanup.

---

## 3. Dependencies Status

### ZMI-TICKET-009: Accounts Module
**Status: IMPLEMENTED**

All required account fields for data exchange are in place:
- `is_payroll_relevant` (bool) - the export flag
- `payroll_code` (string, nullable) - the Lohnart/payroll type code
- Full CRUD API with filtering by `payroll_relevant`
- Database migration applied (000033)
- OpenAPI spec with these fields
- Generated models include these fields

### ZMI-TICKET-016: Monthly Evaluation and Closing
**Status: IMPLEMENTED**

Full monthly evaluation is in place:
- `MonthlyValue` model with all aggregated time totals, flextime, absences, work summary
- Month closing/reopening lifecycle (IsClosed, ClosedAt, ClosedBy)
- `MonthlyEvalService` with calculate, close, reopen, recalculate
- Repository with GetByEmployeeMonth, ListByEmployeeYear, Upsert, CloseMonth, ReopenMonth
- Handler with year overview, month summary, daily breakdown, close/reopen/recalculate endpoints
- Database migration applied (000028)

### What Does NOT Exist Yet
- No `export_interfaces` or `data_exchange_interfaces` database table
- No Go domain model for export interface definitions
- No repository, service, or handler for export interface CRUD
- No Go implementation for the payroll export endpoints (handler, service, repository)
- No database table for storing payroll export records
- No route registration for payroll export endpoints in main.go

### What Already Exists (Spec Only)
- OpenAPI paths for payroll exports (`api/paths/payroll-exports.yaml`)
- OpenAPI schemas for payroll exports (`api/schemas/payroll-exports.yaml`)
- Generated Go models for payroll exports (`apps/api/gen/models/payroll_export.go`, etc.)
- Payroll exports referenced in `api/openapi.yaml`
- Tenant model has `PayrollExportBasePath` field

---

## 4. Key Files Reference

### Account Model and Export Fields
- `/home/tolga/projects/terp/apps/api/internal/model/account.go` - Domain model with IsPayrollRelevant, PayrollCode
- `/home/tolga/projects/terp/apps/api/internal/repository/account.go` - Repository with ListFiltered (payrollRelevant filter)
- `/home/tolga/projects/terp/apps/api/internal/service/account.go` - Service with CRUD and ListFiltered
- `/home/tolga/projects/terp/apps/api/internal/handler/account.go` - Handler with payroll_relevant query filter
- `/home/tolga/projects/terp/db/migrations/000033_add_account_fields.up.sql` - Migration adding is_payroll_relevant, payroll_code

### Tenant Model (PayrollExportBasePath)
- `/home/tolga/projects/terp/apps/api/internal/model/tenant.go` - Tenant with PayrollExportBasePath
- `/home/tolga/projects/terp/db/migrations/000037_add_tenant_mandant_fields.up.sql` - Migration adding payroll_export_base_path

### Monthly Evaluation
- `/home/tolga/projects/terp/apps/api/internal/model/monthlyvalue.go` - MonthlyValue model
- `/home/tolga/projects/terp/apps/api/internal/repository/monthlyvalue.go` - MonthlyValue repository
- `/home/tolga/projects/terp/apps/api/internal/service/monthlyeval.go` - MonthlyEvalService
- `/home/tolga/projects/terp/apps/api/internal/handler/monthlyeval.go` - MonthlyEval handler
- `/home/tolga/projects/terp/db/migrations/000028_create_monthly_values.up.sql` - monthly_values table

### Existing Payroll Export Specs (No Implementation)
- `/home/tolga/projects/terp/api/paths/payroll-exports.yaml` - OpenAPI paths
- `/home/tolga/projects/terp/api/schemas/payroll-exports.yaml` - OpenAPI schemas
- `/home/tolga/projects/terp/apps/api/gen/models/payroll_export.go` - Generated PayrollExport model
- `/home/tolga/projects/terp/apps/api/gen/models/payroll_export_list.go` - Generated PayrollExportList model
- `/home/tolga/projects/terp/apps/api/gen/models/generate_payroll_export_request.go` - Generated GeneratePayrollExportRequest model

### CRUD Pattern Reference Files
- `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` - Route registration patterns
- `/home/tolga/projects/terp/apps/api/internal/handler/response.go` - respondJSON, respondError helpers
- `/home/tolga/projects/terp/apps/api/cmd/server/main.go` - Wiring pattern (repo -> service -> handler -> routes)
- `/home/tolga/projects/terp/api/openapi.yaml` - Main OpenAPI spec referencing all paths/schemas

### Migration Pattern Reference
- `/home/tolga/projects/terp/db/migrations/000052_create_employee_capping_exceptions.up.sql` - Latest migration (000052)
- `/home/tolga/projects/terp/db/migrations/000006_create_accounts.up.sql` - Account table creation
- `/home/tolga/projects/terp/db/migrations/000043_account_groups_and_fields.up.sql` - Account groups and additional fields

### Test Pattern Reference
- `/home/tolga/projects/terp/apps/api/internal/service/account_test.go` - Service test patterns
- `/home/tolga/projects/terp/apps/api/internal/handler/account_test.go` - Handler test patterns
- `/home/tolga/projects/terp/apps/api/internal/testutil/db.go` - Test database setup utility

### Reference Documentation
- `/home/tolga/projects/terp/impl_plan/zmi-docs/08-data-exchange-server.md` - ZMI manual section 11: Data Exchange
- `/home/tolga/projects/terp/thoughts/shared/tickets/ZMI-TICKET-021-data-exchange-exports.md` - Ticket definition
- `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md` - Account ExportEnabled/PayrollType reference

### Build and Generation
- `/home/tolga/projects/terp/Makefile` - make swagger-bundle, make generate commands
