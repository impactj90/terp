# Implementation Plan: ZMI-TICKET-021 Data Exchange and Payroll Exports

## Overview

Implement data exchange configuration and export generation for payroll systems per ZMI manual section 11 (Datenaustausch). This ticket delivers:

1. **Export Interface Definitions** -- CRUD for configuring export interfaces (interface number, name, mandant number in payroll system, export script, export path, output filename).
2. **Interface-Account Mapping** -- Selecting which accounts are included in an interface's export. Only accounts with `is_payroll_relevant = true` are eligible.
3. **Payroll Export Generation** -- Implementing the Go backend for the already-specified OpenAPI payroll export endpoints. This generates export data from monthly values for a given period and set of employees, scoped by the interface's account selection.

### Dependencies (all implemented)

- **ZMI-TICKET-009 (Accounts)**: `is_payroll_relevant` flag and `payroll_code` field on accounts. Repository `ListFiltered` supports `payrollRelevant` filter.
- **ZMI-TICKET-016 (Monthly Evaluation)**: `MonthlyValue` model with aggregated time totals, flextime, absences. `MonthlyEvalService` for calculation and closing.
- **Tenant model**: `PayrollExportBasePath` field already exists.

### What already exists

- OpenAPI paths: `api/paths/payroll-exports.yaml` (6 endpoints defined)
- OpenAPI schemas: `api/schemas/payroll-exports.yaml` (PayrollExport, PayrollExportSummary, PayrollExportLine, GeneratePayrollExportRequest, PayrollExportList)
- Generated Go models: `apps/api/gen/models/payroll_export.go`, `payroll_export_list.go`, `generate_payroll_export_request.go`
- Payroll exports referenced in `api/openapi.yaml` (paths + definitions)

### What does NOT exist yet

- No `export_interfaces` table or model
- No `export_interface_accounts` junction table
- No `payroll_exports` database table
- No Go implementation (handler, service, repository) for export interfaces or payroll exports
- No route registration for either resource

---

## Implementation Phases

### Phase 1: Database Migrations & OpenAPI Specs

#### 1.1 Migration: Create export_interfaces table

**File**: `db/migrations/000053_create_export_interfaces.up.sql`

```sql
-- =============================================================
-- Create export_interfaces table
-- ZMI manual section 11.2: Interface Configuration
-- =============================================================
CREATE TABLE export_interfaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    interface_number INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    mandant_number VARCHAR(50),
    export_script VARCHAR(255),
    export_path VARCHAR(500),
    output_filename VARCHAR(255),
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

COMMENT ON TABLE export_interfaces IS 'Export interface definitions for payroll system integration (ZMI manual section 11.2).';
COMMENT ON COLUMN export_interfaces.interface_number IS 'Unique interface number within the tenant (Nummer).';
COMMENT ON COLUMN export_interfaces.name IS 'Interface name/label (Bezeichnung).';
COMMENT ON COLUMN export_interfaces.mandant_number IS 'Mandant number in the external payroll system (Mandantennummer).';
COMMENT ON COLUMN export_interfaces.export_script IS 'Export script name from Export folder (Skript).';
COMMENT ON COLUMN export_interfaces.export_path IS 'Destination folder for exported file (Exportpfad).';
COMMENT ON COLUMN export_interfaces.output_filename IS 'Output file name with extension (Dateiname).';
```

**File**: `db/migrations/000053_create_export_interfaces.down.sql`

```sql
DROP TABLE IF EXISTS export_interfaces;
```

#### 1.2 Migration: Create export_interface_accounts junction table

**File**: `db/migrations/000054_create_export_interface_accounts.up.sql`

```sql
-- =============================================================
-- Create export_interface_accounts junction table
-- ZMI manual section 11.3: Adding Accounts to an interface
-- =============================================================
CREATE TABLE export_interface_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_interface_id UUID NOT NULL REFERENCES export_interfaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(export_interface_id, account_id)
);

CREATE INDEX idx_eia_interface ON export_interface_accounts(export_interface_id);
CREATE INDEX idx_eia_account ON export_interface_accounts(account_id);

COMMENT ON TABLE export_interface_accounts IS 'Accounts selected for each export interface. Only accounts with is_payroll_relevant=true should be added.';
COMMENT ON COLUMN export_interface_accounts.sort_order IS 'Order in which accounts appear in the export output.';
```

**File**: `db/migrations/000054_create_export_interface_accounts.down.sql`

```sql
DROP TABLE IF EXISTS export_interface_accounts;
```

#### 1.3 Migration: Create payroll_exports table

**File**: `db/migrations/000055_create_payroll_exports.up.sql`

```sql
-- =============================================================
-- Create payroll_exports table
-- Stores generated export records and file content
-- =============================================================
CREATE TABLE payroll_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    export_interface_id UUID REFERENCES export_interfaces(id) ON DELETE SET NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    export_type VARCHAR(20) DEFAULT 'standard'
        CHECK (export_type IN ('standard', 'datev', 'sage', 'custom')),
    format VARCHAR(10) DEFAULT 'csv'
        CHECK (format IN ('csv', 'xlsx', 'xml', 'json')),
    parameters JSONB DEFAULT '{}',
    file_content TEXT,
    file_size INT,
    row_count INT,
    employee_count INT,
    total_hours DECIMAL(12,2),
    total_overtime DECIMAL(12,2),
    error_message TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pe_tenant ON payroll_exports(tenant_id);
CREATE INDEX idx_pe_interface ON payroll_exports(export_interface_id);
CREATE INDEX idx_pe_period ON payroll_exports(tenant_id, year, month);
CREATE INDEX idx_pe_status ON payroll_exports(status);

CREATE TRIGGER update_payroll_exports_updated_at
    BEFORE UPDATE ON payroll_exports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE payroll_exports IS 'Payroll export records with generated file content.';
COMMENT ON COLUMN payroll_exports.file_content IS 'Generated export file content (CSV text). Stored in DB for simplicity; future: write to filesystem using export_path.';
COMMENT ON COLUMN payroll_exports.parameters IS 'JSON with employee_ids, department_ids, include_accounts filter arrays.';
```

**File**: `db/migrations/000055_create_payroll_exports.down.sql`

```sql
DROP TABLE IF EXISTS payroll_exports;
```

#### 1.4 OpenAPI Schema: Export Interfaces

**File**: `api/schemas/export-interfaces.yaml`

Define these schemas following the `vacation-capping-rules.yaml` pattern:

- `ExportInterface` -- Full entity (id, tenant_id, interface_number, name, mandant_number, export_script, export_path, output_filename, is_active, accounts array, created_at, updated_at)
- `ExportInterfaceSummary` -- Lightweight (id, interface_number, name, is_active)
- `CreateExportInterfaceRequest` -- Required: interface_number, name. Optional: mandant_number, export_script, export_path, output_filename
- `UpdateExportInterfaceRequest` -- All optional patch fields
- `ExportInterfaceList` -- List wrapper with `data` array
- `SetExportInterfaceAccountsRequest` -- `account_ids` array (UUID[]) for bulk set
- `ExportInterfaceAccount` -- account_id, account_code, account_name, payroll_code, sort_order

#### 1.5 OpenAPI Paths: Export Interfaces

**File**: `api/paths/export-interfaces.yaml`

Endpoints:

```
GET    /export-interfaces              -- List all interfaces (with ?active_only filter)
POST   /export-interfaces              -- Create interface
GET    /export-interfaces/{id}         -- Get by ID (includes accounts)
PATCH  /export-interfaces/{id}         -- Update interface
DELETE /export-interfaces/{id}         -- Delete interface
PUT    /export-interfaces/{id}/accounts -- Set accounts for interface (bulk replace)
GET    /export-interfaces/{id}/accounts -- List accounts for interface
```

Tags: `Export Interfaces`

#### 1.6 Update Existing Payroll Export Schemas

**File**: `api/schemas/payroll-exports.yaml` (MODIFY)

Add `export_interface_id` field to both `PayrollExport` and `GeneratePayrollExportRequest`:

```yaml
# In PayrollExport, add:
export_interface_id:
  type: string
  format: uuid
  x-nullable: true
  description: Export interface used to generate this export

# In GeneratePayrollExportRequest, add:
export_interface_id:
  type: string
  format: uuid
  description: Interface to use (determines accounts if include_accounts not specified)
```

#### 1.7 Update api/openapi.yaml

Add references for the new export interface resource:

```yaml
# In paths section:
/export-interfaces:
  $ref: 'paths/export-interfaces.yaml#/~1export-interfaces'
/export-interfaces/{id}:
  $ref: 'paths/export-interfaces.yaml#/~1export-interfaces~1{id}'
/export-interfaces/{id}/accounts:
  $ref: 'paths/export-interfaces.yaml#/~1export-interfaces~1{id}~1accounts'

# In tags section:
- name: Export Interfaces
  description: Data exchange interface configuration

# In definitions section:
ExportInterface:
  $ref: 'schemas/export-interfaces.yaml#/ExportInterface'
CreateExportInterfaceRequest:
  $ref: 'schemas/export-interfaces.yaml#/CreateExportInterfaceRequest'
UpdateExportInterfaceRequest:
  $ref: 'schemas/export-interfaces.yaml#/UpdateExportInterfaceRequest'
ExportInterfaceList:
  $ref: 'schemas/export-interfaces.yaml#/ExportInterfaceList'
SetExportInterfaceAccountsRequest:
  $ref: 'schemas/export-interfaces.yaml#/SetExportInterfaceAccountsRequest'
```

#### 1.8 Bundle and Generate

```bash
make swagger-bundle
make generate
```

This produces updated generated models in `apps/api/gen/models/` including new ExportInterface models and updated PayrollExport models.

---

### Phase 2: Core Implementation -- Export Interfaces

#### 2.1 Model: ExportInterface

**File**: `apps/api/internal/model/exportinterface.go`

```go
package model

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
    CreatedAt       time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt       time.Time  `gorm:"default:now()" json:"updated_at"`

    // Relations
    Accounts []ExportInterfaceAccount `gorm:"foreignKey:ExportInterfaceID" json:"accounts,omitempty"`
}

func (ExportInterface) TableName() string { return "export_interfaces" }

type ExportInterfaceAccount struct {
    ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    ExportInterfaceID uuid.UUID `gorm:"type:uuid;not null;index" json:"export_interface_id"`
    AccountID         uuid.UUID `gorm:"type:uuid;not null;index" json:"account_id"`
    SortOrder         int       `gorm:"default:0" json:"sort_order"`
    CreatedAt         time.Time `gorm:"default:now()" json:"created_at"`

    // Relations (for eager loading)
    Account *Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}

func (ExportInterfaceAccount) TableName() string { return "export_interface_accounts" }
```

#### 2.2 Repository: ExportInterface

**File**: `apps/api/internal/repository/exportinterface.go`

Following the `AccountRepository` pattern:

```go
type ExportInterfaceRepository struct {
    db *DB
}

func NewExportInterfaceRepository(db *DB) *ExportInterfaceRepository

// CRUD
func (r *ExportInterfaceRepository) Create(ctx context.Context, ei *model.ExportInterface) error
func (r *ExportInterfaceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error)
    // Preloads Accounts and Accounts.Account
func (r *ExportInterfaceRepository) GetByNumber(ctx context.Context, tenantID uuid.UUID, number int) (*model.ExportInterface, error)
func (r *ExportInterfaceRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error)
func (r *ExportInterfaceRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error)
func (r *ExportInterfaceRepository) Update(ctx context.Context, ei *model.ExportInterface) error
func (r *ExportInterfaceRepository) Delete(ctx context.Context, id uuid.UUID) error

// Account mapping
func (r *ExportInterfaceRepository) SetAccounts(ctx context.Context, interfaceID uuid.UUID, accountIDs []uuid.UUID) error
    // Deletes existing, inserts new. Sets sort_order by position in array.
func (r *ExportInterfaceRepository) ListAccounts(ctx context.Context, interfaceID uuid.UUID) ([]model.ExportInterfaceAccount, error)
    // Preloads Account relation

// Usage check
func (r *ExportInterfaceRepository) CountExports(ctx context.Context, interfaceID uuid.UUID) (int64, error)
```

**Error sentinels**:
```go
var (
    ErrExportInterfaceNotFound = errors.New("export interface not found")
)
```

**Key implementation details for SetAccounts**:
- Use a transaction
- DELETE FROM export_interface_accounts WHERE export_interface_id = ?
- INSERT new rows with sort_order = position index

#### 2.3 Service: ExportInterface

**File**: `apps/api/internal/service/exportinterface.go`

```go
type exportInterfaceRepository interface {
    Create(ctx context.Context, ei *model.ExportInterface) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error)
    GetByNumber(ctx context.Context, tenantID uuid.UUID, number int) (*model.ExportInterface, error)
    List(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error)
    Update(ctx context.Context, ei *model.ExportInterface) error
    Delete(ctx context.Context, id uuid.UUID) error
    SetAccounts(ctx context.Context, interfaceID uuid.UUID, accountIDs []uuid.UUID) error
    ListAccounts(ctx context.Context, interfaceID uuid.UUID) ([]model.ExportInterfaceAccount, error)
    CountExports(ctx context.Context, interfaceID uuid.UUID) (int64, error)
}

type accountRepository interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.Account, error)
    GetByIDs(ctx context.Context, ids []uuid.UUID) ([]model.Account, error)
    // Uses existing method; if GetByIDs doesn't exist, add it.
}

type ExportInterfaceService struct {
    repo        exportInterfaceRepository
    accountRepo accountRepository
}
```

**Input structs**:

```go
type CreateExportInterfaceInput struct {
    TenantID        uuid.UUID
    InterfaceNumber int
    Name            string
    MandantNumber   *string
    ExportScript    *string
    ExportPath      *string
    OutputFilename  *string
}

type UpdateExportInterfaceInput struct {
    InterfaceNumber *int
    Name            *string
    MandantNumber   *string
    ExportScript    *string
    ExportPath      *string
    OutputFilename  *string
    IsActive        *bool
}
```

**Methods**:

- `Create(ctx, input) (*model.ExportInterface, error)` -- Validates: name required, interface_number > 0, number unique per tenant
- `GetByID(ctx, id) (*model.ExportInterface, error)` -- Returns with accounts preloaded
- `List(ctx, tenantID) ([]model.ExportInterface, error)`
- `Update(ctx, id, input) (*model.ExportInterface, error)` -- Validates same as Create
- `Delete(ctx, id) error` -- Check no exports reference this interface (or allow cascade)
- `SetAccounts(ctx, interfaceID, accountIDs) error` -- Validates each account exists and has `is_payroll_relevant = true`. Returns error if any account is not payroll-relevant.
- `ListAccounts(ctx, interfaceID) ([]model.ExportInterfaceAccount, error)`

**Error sentinels**:

```go
var (
    ErrExportInterfaceNotFound            = errors.New("export interface not found")
    ErrExportInterfaceNameRequired        = errors.New("export interface name is required")
    ErrExportInterfaceNumberRequired      = errors.New("export interface number must be positive")
    ErrExportInterfaceNumberExists        = errors.New("interface number already exists for this tenant")
    ErrExportInterfaceInUse               = errors.New("export interface has generated exports")
    ErrAccountNotPayrollRelevant          = errors.New("account is not payroll-relevant and cannot be added to export interface")
    ErrAccountNotFound                    = errors.New("one or more accounts not found")
)
```

#### 2.4 Handler: ExportInterface

**File**: `apps/api/internal/handler/exportinterface.go`

Following the AccountHandler pattern:

```go
type ExportInterfaceHandler struct {
    exportInterfaceService *service.ExportInterfaceService
}

func NewExportInterfaceHandler(svc *service.ExportInterfaceService) *ExportInterfaceHandler

// HTTP handlers using generated models for request/response
func (h *ExportInterfaceHandler) List(w http.ResponseWriter, r *http.Request)
func (h *ExportInterfaceHandler) Create(w http.ResponseWriter, r *http.Request)
func (h *ExportInterfaceHandler) Get(w http.ResponseWriter, r *http.Request)
func (h *ExportInterfaceHandler) Update(w http.ResponseWriter, r *http.Request)
func (h *ExportInterfaceHandler) Delete(w http.ResponseWriter, r *http.Request)
func (h *ExportInterfaceHandler) SetAccounts(w http.ResponseWriter, r *http.Request)
func (h *ExportInterfaceHandler) ListAccounts(w http.ResponseWriter, r *http.Request)
```

**Request/response mapping**:
- Decode using generated models (e.g., `models.CreateExportInterfaceRequest`)
- Call `.Validate(nil)` on generated model
- Map to service input struct
- Call service method
- Map domain model to generated response model
- Use `respondJSON` / `respondError`

**Error mapping**:
- `ErrExportInterfaceNotFound` -> 404
- `ErrExportInterfaceNumberExists` -> 409
- `ErrAccountNotPayrollRelevant` -> 400
- `ErrExportInterfaceInUse` -> 409
- Validation errors -> 400

---

### Phase 3: Export Generation -- Payroll Exports

#### 3.1 Model: PayrollExport

**File**: `apps/api/internal/model/payrollexport.go`

```go
package model

type PayrollExportStatus string

const (
    PayrollExportStatusPending    PayrollExportStatus = "pending"
    PayrollExportStatusGenerating PayrollExportStatus = "generating"
    PayrollExportStatusCompleted  PayrollExportStatus = "completed"
    PayrollExportStatusFailed     PayrollExportStatus = "failed"
)

type PayrollExportType string

const (
    PayrollExportTypeStandard PayrollExportType = "standard"
    PayrollExportTypeDatev    PayrollExportType = "datev"
    PayrollExportTypeSage     PayrollExportType = "sage"
    PayrollExportTypeCustom   PayrollExportType = "custom"
)

type PayrollExportFormat string

const (
    PayrollExportFormatCSV  PayrollExportFormat = "csv"
    PayrollExportFormatXLSX PayrollExportFormat = "xlsx"
    PayrollExportFormatXML  PayrollExportFormat = "xml"
    PayrollExportFormatJSON PayrollExportFormat = "json"
)

type PayrollExport struct {
    ID                uuid.UUID            `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID          uuid.UUID            `gorm:"type:uuid;not null;index" json:"tenant_id"`
    ExportInterfaceID *uuid.UUID           `gorm:"type:uuid;index" json:"export_interface_id,omitempty"`
    Year              int                  `gorm:"not null" json:"year"`
    Month             int                  `gorm:"not null" json:"month"`
    Status            PayrollExportStatus  `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    ExportType        PayrollExportType    `gorm:"type:varchar(20);default:'standard'" json:"export_type"`
    Format            PayrollExportFormat  `gorm:"type:varchar(10);default:'csv'" json:"format"`
    Parameters        datatypes.JSON       `gorm:"type:jsonb;default:'{}'" json:"parameters"`
    FileContent       *string              `gorm:"type:text" json:"-"`  // Not exposed in JSON
    FileSize          *int                 `json:"file_size,omitempty"`
    RowCount          *int                 `json:"row_count,omitempty"`
    EmployeeCount     *int                 `json:"employee_count,omitempty"`
    TotalHours        *float64             `gorm:"type:decimal(12,2)" json:"total_hours,omitempty"`
    TotalOvertime     *float64             `gorm:"type:decimal(12,2)" json:"total_overtime,omitempty"`
    ErrorMessage      *string              `gorm:"type:text" json:"error_message,omitempty"`
    RequestedAt       time.Time            `gorm:"default:now()" json:"requested_at"`
    StartedAt         *time.Time           `json:"started_at,omitempty"`
    CompletedAt       *time.Time           `json:"completed_at,omitempty"`
    CreatedBy         *uuid.UUID           `gorm:"type:uuid" json:"created_by,omitempty"`
    CreatedAt         time.Time            `gorm:"default:now()" json:"created_at"`
    UpdatedAt         time.Time            `gorm:"default:now()" json:"updated_at"`

    // Relations
    ExportInterface *ExportInterface `gorm:"foreignKey:ExportInterfaceID" json:"export_interface,omitempty"`
}

func (PayrollExport) TableName() string { return "payroll_exports" }

// PayrollExportParameters holds the filter parameters stored as JSON.
type PayrollExportParameters struct {
    EmployeeIDs     []uuid.UUID `json:"employee_ids,omitempty"`
    DepartmentIDs   []uuid.UUID `json:"department_ids,omitempty"`
    IncludeAccounts []uuid.UUID `json:"include_accounts,omitempty"`
}
```

#### 3.2 Repository: PayrollExport

**File**: `apps/api/internal/repository/payrollexport.go`

```go
type PayrollExportRepository struct {
    db *DB
}

func NewPayrollExportRepository(db *DB) *PayrollExportRepository

func (r *PayrollExportRepository) Create(ctx context.Context, pe *model.PayrollExport) error
func (r *PayrollExportRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error)
func (r *PayrollExportRepository) List(ctx context.Context, tenantID uuid.UUID, year *int, month *int, status *string, limit int, cursor *string) ([]model.PayrollExport, string, error)
    // Cursor-based pagination, sorted by requested_at DESC
func (r *PayrollExportRepository) Update(ctx context.Context, pe *model.PayrollExport) error
func (r *PayrollExportRepository) Delete(ctx context.Context, id uuid.UUID) error
func (r *PayrollExportRepository) GetFileContent(ctx context.Context, id uuid.UUID) (*string, error)
    // Separate method to load file_content (large field)
```

**Error sentinels**:
```go
var ErrPayrollExportNotFound = errors.New("payroll export not found")
```

#### 3.3 Service: PayrollExport

**File**: `apps/api/internal/service/payrollexport.go`

```go
type payrollExportRepository interface {
    Create(ctx context.Context, pe *model.PayrollExport) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error)
    List(ctx context.Context, tenantID uuid.UUID, year *int, month *int, status *string, limit int, cursor *string) ([]model.PayrollExport, string, error)
    Update(ctx context.Context, pe *model.PayrollExport) error
    Delete(ctx context.Context, id uuid.UUID) error
    GetFileContent(ctx context.Context, id uuid.UUID) (*string, error)
}

// Additional dependencies
type monthlyValueRepository interface {
    GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    // ... any batch methods
}

type employeeRepository interface {
    ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]model.Employee, error)
    GetByIDs(ctx context.Context, ids []uuid.UUID) ([]model.Employee, error)
}

type PayrollExportService struct {
    repo              payrollExportRepository
    interfaceRepo     exportInterfaceRepository
    monthlyValueRepo  monthlyValueRepository
    employeeRepo      employeeRepository
    accountRepo       accountRepository
}

func NewPayrollExportService(
    repo payrollExportRepository,
    interfaceRepo exportInterfaceRepository,
    monthlyValueRepo monthlyValueRepository,
    employeeRepo employeeRepository,
    accountRepo accountRepository,
) *PayrollExportService
```

**Input structs**:

```go
type GeneratePayrollExportInput struct {
    TenantID          uuid.UUID
    ExportInterfaceID *uuid.UUID
    Year              int
    Month             int
    ExportType        string    // standard, datev, sage, custom
    Format            string    // csv, xlsx, xml, json
    EmployeeIDs       []uuid.UUID
    DepartmentIDs     []uuid.UUID
    IncludeAccounts   []uuid.UUID
    CreatedBy         *uuid.UUID
}

type PayrollExportLine struct {
    EmployeeID      uuid.UUID
    PersonnelNumber string
    FirstName       string
    LastName        string
    DepartmentCode  string
    CostCenterCode  string
    TargetHours     float64
    WorkedHours     float64
    OvertimeHours   float64
    AccountValues   map[string]float64  // payroll_code -> hours value
    VacationDays    float64
    SickDays        float64
    OtherAbsenceDays float64
}
```

**Methods**:

- `Generate(ctx, input) (*model.PayrollExport, error)` -- Main export generation method:
  1. Create PayrollExport record with status=pending
  2. Update to status=generating, set started_at
  3. Resolve accounts to include:
     - If `ExportInterfaceID` provided: load interface's accounts
     - Else if `IncludeAccounts` provided: use those
     - Else: load all payroll-relevant accounts for tenant
  4. Resolve employees:
     - If `EmployeeIDs` provided: filter to those
     - Else: load all active employees for tenant
  5. For each employee, get MonthlyValue for year/month
  6. Build export lines (one per employee)
  7. Generate CSV content from lines + account columns
  8. Update PayrollExport with file_content, file_size, row_count, employee_count, total_hours, total_overtime
  9. Set status=completed, completed_at
  10. On error: set status=failed, error_message
  11. Return export record

- `GetByID(ctx, id) (*model.PayrollExport, error)`
- `List(ctx, tenantID, year, month, status, limit, cursor) ([]model.PayrollExport, string, error)`
- `Delete(ctx, id) error` -- Only allow deleting completed/failed exports
- `GetFileContent(ctx, id) (string, error)` -- For download
- `Preview(ctx, id) ([]PayrollExportLine, error)` -- Returns parsed lines for preview

**CSV Generation Logic** (private method `generateCSV`):

```
Header row:
  PersonnelNumber, FirstName, LastName, Department, CostCenter,
  TargetHours, WorkedHours, OvertimeHours,
  [PayrollCode1], [PayrollCode2], ...,
  VacationDays, SickDays, OtherAbsenceDays

Data rows:
  One row per employee with their monthly values.
  Account value columns use the account's payroll_code as header.
  Time values converted from minutes to hours (divide by 60, round to 2 decimals).
```

**Error sentinels**:

```go
var (
    ErrPayrollExportNotFound       = errors.New("payroll export not found")
    ErrPayrollExportYearRequired   = errors.New("year is required")
    ErrPayrollExportMonthInvalid   = errors.New("month must be between 1 and 12")
    ErrPayrollExportFormatInvalid  = errors.New("format must be csv, xlsx, xml, or json")
    ErrPayrollExportNotReady       = errors.New("export is not yet completed")
    ErrPayrollExportNoAccounts     = errors.New("no payroll-relevant accounts configured for export")
    ErrPayrollExportNoEmployees    = errors.New("no employees found for export")
)
```

#### 3.4 Handler: PayrollExport

**File**: `apps/api/internal/handler/payrollexport.go`

```go
type PayrollExportHandler struct {
    payrollExportService *service.PayrollExportService
}

func NewPayrollExportHandler(svc *service.PayrollExportService) *PayrollExportHandler

func (h *PayrollExportHandler) List(w http.ResponseWriter, r *http.Request)
func (h *PayrollExportHandler) Generate(w http.ResponseWriter, r *http.Request)
func (h *PayrollExportHandler) Get(w http.ResponseWriter, r *http.Request)
func (h *PayrollExportHandler) Delete(w http.ResponseWriter, r *http.Request)
func (h *PayrollExportHandler) Download(w http.ResponseWriter, r *http.Request)
    // Sets Content-Type: text/csv, Content-Disposition: attachment; filename=...
func (h *PayrollExportHandler) Preview(w http.ResponseWriter, r *http.Request)
    // Returns JSON preview of export lines
```

**Key handler behavior**:

- `Generate`: Decodes `GeneratePayrollExportRequest`, validates with `.Validate(nil)`, maps to `GeneratePayrollExportInput`, calls `service.Generate()`, responds 202 with the PayrollExport record
- `Download`: Gets file content, sets appropriate headers (`Content-Type: text/csv`, `Content-Disposition: attachment; filename="export.csv"`), writes raw content. Returns 409 if export not completed.
- `Preview`: Returns parsed lines as JSON. Returns 409 if export not completed.

---

### Phase 4: Route Registration & Wiring

#### 4.1 Route Registration

**File**: `apps/api/internal/handler/routes.go` (MODIFY -- add two new registration functions)

```go
// RegisterExportInterfaceRoutes registers export interface routes.
func RegisterExportInterfaceRoutes(r chi.Router, h *ExportInterfaceHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("payroll.manage").String()
    r.Route("/export-interfaces", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            r.Put("/{id}/accounts", h.SetAccounts)
            r.Get("/{id}/accounts", h.ListAccounts)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
        r.With(authz.RequirePermission(permManage)).Put("/{id}/accounts", h.SetAccounts)
        r.With(authz.RequirePermission(permManage)).Get("/{id}/accounts", h.ListAccounts)
    })
}

// RegisterPayrollExportRoutes registers payroll export routes.
func RegisterPayrollExportRoutes(r chi.Router, h *PayrollExportHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("payroll.manage").String()
    r.Route("/payroll-exports", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Generate)
            r.Get("/{id}", h.Get)
            r.Delete("/{id}", h.Delete)
            r.Get("/{id}/download", h.Download)
            r.Get("/{id}/preview", h.Preview)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Generate)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
        r.With(authz.RequirePermission(permManage)).Get("/{id}/download", h.Download)
        r.With(authz.RequirePermission(permManage)).Get("/{id}/preview", h.Preview)
    })
}
```

#### 4.2 Permission Registration

**File**: `apps/api/internal/permissions/permissions.go` (MODIFY)

Add the `payroll.manage` permission:

```go
Register("payroll.manage", "payroll", "manage", "Manage payroll exports and interfaces")
```

#### 4.3 Wire in main.go

**File**: `apps/api/cmd/server/main.go` (MODIFY)

Add to the repositories section:
```go
exportInterfaceRepo := repository.NewExportInterfaceRepository(db)
payrollExportRepo := repository.NewPayrollExportRepository(db)
```

Add to the services section:
```go
exportInterfaceService := service.NewExportInterfaceService(exportInterfaceRepo, accountRepo)
payrollExportService := service.NewPayrollExportService(
    payrollExportRepo, exportInterfaceRepo, monthlyValueRepo, employeeRepo, accountRepo,
)
```

Add to the handlers section:
```go
exportInterfaceHandler := handler.NewExportInterfaceHandler(exportInterfaceService)
payrollExportHandler := handler.NewPayrollExportHandler(payrollExportService)
```

Add to the tenant-scoped route registration block:
```go
handler.RegisterExportInterfaceRoutes(r, exportInterfaceHandler, authzMiddleware)
handler.RegisterPayrollExportRoutes(r, payrollExportHandler, authzMiddleware)
```

---

### Phase 5: Tests

#### 5.1 Service Tests: ExportInterface

**File**: `apps/api/internal/service/exportinterface_test.go`

Using mock-based testing following the `vacationcappingrule_test.go` pattern:

**Test cases**:

1. `TestExportInterfaceService_Create_Success` -- Valid input creates interface
2. `TestExportInterfaceService_Create_NameRequired` -- Empty name returns error
3. `TestExportInterfaceService_Create_NumberRequired` -- Number <= 0 returns error
4. `TestExportInterfaceService_Create_DuplicateNumber` -- Same number for tenant returns ErrExportInterfaceNumberExists
5. `TestExportInterfaceService_GetByID_Success` -- Returns interface with accounts preloaded
6. `TestExportInterfaceService_GetByID_NotFound` -- Returns ErrExportInterfaceNotFound
7. `TestExportInterfaceService_Update_Success` -- Partial update works
8. `TestExportInterfaceService_Delete_Success` -- Deletes when no exports reference it
9. `TestExportInterfaceService_Delete_InUse` -- Returns ErrExportInterfaceInUse when exports exist
10. `TestExportInterfaceService_SetAccounts_Success` -- Sets accounts when all are payroll-relevant
11. `TestExportInterfaceService_SetAccounts_NotPayrollRelevant` -- Returns ErrAccountNotPayrollRelevant when any account has is_payroll_relevant=false
12. `TestExportInterfaceService_SetAccounts_AccountNotFound` -- Returns ErrAccountNotFound when account UUID doesn't exist

#### 5.2 Service Tests: PayrollExport

**File**: `apps/api/internal/service/payrollexport_test.go`

**Test cases**:

1. `TestPayrollExportService_Generate_Success` -- Valid export generation produces CSV with correct structure
2. `TestPayrollExportService_Generate_WithInterface` -- Uses interface's accounts when interface_id provided
3. `TestPayrollExportService_Generate_WithExplicitAccounts` -- Uses explicit include_accounts when no interface_id
4. `TestPayrollExportService_Generate_AllPayrollRelevant` -- Defaults to all payroll-relevant accounts when neither specified
5. `TestPayrollExportService_Generate_MonthRequired` -- Invalid month returns error
6. `TestPayrollExportService_Generate_YearRequired` -- Missing year returns error
7. `TestPayrollExportService_Generate_NoAccounts` -- Returns ErrPayrollExportNoAccounts when no payroll-relevant accounts found
8. `TestPayrollExportService_Generate_NoEmployees` -- Returns ErrPayrollExportNoEmployees when no employees match filters
9. `TestPayrollExportService_Generate_CSVContent` -- Verifies CSV output has correct headers and values
10. `TestPayrollExportService_Generate_EmployeeFilter` -- Only includes specified employees when employee_ids provided
11. `TestPayrollExportService_GetByID_NotFound` -- Returns error for nonexistent ID
12. `TestPayrollExportService_Delete_Success` -- Deletes completed export
13. `TestPayrollExportService_Download_NotReady` -- Returns ErrPayrollExportNotReady when status != completed

#### 5.3 Ticket Test Cases

From the ticket's test case pack:

| # | Test Case | Input | Expected | Service Test |
|---|-----------|-------|----------|-------------|
| 1 | Valid interface export | Interface configured with script/path/name | Export file generated | `TestPayrollExportService_Generate_WithInterface` |
| 2 | Missing configuration | Missing export path | Validation error | `TestExportInterfaceService_Create_*` validation tests |
| 3 | Export flag | Account with export=false | Account excluded from export | `TestExportInterfaceService_SetAccounts_NotPayrollRelevant` |

#### 5.4 Handler Tests (Optional, Secondary Priority)

**File**: `apps/api/internal/handler/exportinterface_test.go`

Follow the `account_test.go` pattern with `httptest.NewRequest` / `httptest.NewRecorder`:

1. `TestExportInterfaceHandler_Create_Success` -- POST returns 201
2. `TestExportInterfaceHandler_Create_BadRequest` -- Invalid JSON returns 400
3. `TestExportInterfaceHandler_Get_NotFound` -- Returns 404
4. `TestExportInterfaceHandler_SetAccounts_Success` -- PUT /accounts returns 200

**File**: `apps/api/internal/handler/payrollexport_test.go`

1. `TestPayrollExportHandler_Generate_Success` -- POST returns 202
2. `TestPayrollExportHandler_Download_Success` -- Returns CSV content with correct headers
3. `TestPayrollExportHandler_Download_NotReady` -- Returns 409

---

## File Manifest

### New Files

| File | Purpose |
|------|---------|
| `db/migrations/000053_create_export_interfaces.up.sql` | Create export_interfaces table |
| `db/migrations/000053_create_export_interfaces.down.sql` | Drop export_interfaces table |
| `db/migrations/000054_create_export_interface_accounts.up.sql` | Create junction table |
| `db/migrations/000054_create_export_interface_accounts.down.sql` | Drop junction table |
| `db/migrations/000055_create_payroll_exports.up.sql` | Create payroll_exports table |
| `db/migrations/000055_create_payroll_exports.down.sql` | Drop payroll_exports table |
| `api/schemas/export-interfaces.yaml` | OpenAPI schemas for export interfaces |
| `api/paths/export-interfaces.yaml` | OpenAPI paths for export interfaces |
| `apps/api/internal/model/exportinterface.go` | ExportInterface + ExportInterfaceAccount domain models |
| `apps/api/internal/model/payrollexport.go` | PayrollExport domain model |
| `apps/api/internal/repository/exportinterface.go` | ExportInterface repository |
| `apps/api/internal/repository/payrollexport.go` | PayrollExport repository |
| `apps/api/internal/service/exportinterface.go` | ExportInterface service |
| `apps/api/internal/service/payrollexport.go` | PayrollExport service with CSV generation |
| `apps/api/internal/handler/exportinterface.go` | ExportInterface HTTP handler |
| `apps/api/internal/handler/payrollexport.go` | PayrollExport HTTP handler |
| `apps/api/internal/service/exportinterface_test.go` | ExportInterface service tests |
| `apps/api/internal/service/payrollexport_test.go` | PayrollExport service tests |

### Modified Files

| File | Change |
|------|--------|
| `api/openapi.yaml` | Add export-interfaces paths, tags, definitions |
| `api/schemas/payroll-exports.yaml` | Add export_interface_id field to PayrollExport and GeneratePayrollExportRequest |
| `apps/api/internal/handler/routes.go` | Add RegisterExportInterfaceRoutes, RegisterPayrollExportRoutes |
| `apps/api/internal/permissions/permissions.go` | Add `payroll.manage` permission |
| `apps/api/cmd/server/main.go` | Wire repos, services, handlers, routes |

### Generated Files (auto-generated, do not edit)

| File | Generated by |
|------|-------------|
| `api/openapi.bundled.yaml` | `make swagger-bundle` |
| `apps/api/gen/models/export_interface.go` | `make generate` |
| `apps/api/gen/models/export_interface_list.go` | `make generate` |
| `apps/api/gen/models/create_export_interface_request.go` | `make generate` |
| `apps/api/gen/models/update_export_interface_request.go` | `make generate` |
| `apps/api/gen/models/set_export_interface_accounts_request.go` | `make generate` |
| `apps/api/gen/models/payroll_export.go` | `make generate` (updated with interface_id) |
| `apps/api/gen/models/generate_payroll_export_request.go` | `make generate` (updated with interface_id) |

---

## Verification Steps

### Phase 1 Verification

1. Run `make migrate-up` -- All three migrations apply without errors
2. Run `make migrate-down` three times -- Clean rollback
3. Run `make swagger-bundle` -- Bundles without errors
4. Run `make generate` -- Generates Go models without errors
5. Verify generated models exist in `apps/api/gen/models/` for ExportInterface and updated PayrollExport
6. Verify `api/openapi.bundled.yaml` contains export-interfaces paths

### Phase 2 Verification

1. Code compiles: `cd apps/api && go build ./...`
2. Service tests pass: `cd apps/api && go test -v -run TestExportInterface ./internal/service/...`
3. Create an export interface via API: POST /api/v1/export-interfaces
4. Set accounts on interface: PUT /api/v1/export-interfaces/{id}/accounts
5. Verify only payroll-relevant accounts are accepted
6. Verify CRUD operations work (List, Get, Update, Delete)

### Phase 3 Verification

1. Code compiles: `cd apps/api && go build ./...`
2. Service tests pass: `cd apps/api && go test -v -run TestPayrollExport ./internal/service/...`
3. Generate export via API: POST /api/v1/payroll-exports with interface_id
4. Verify export record has status=completed
5. Download export: GET /api/v1/payroll-exports/{id}/download
6. Verify CSV content has correct headers and employee rows
7. Preview export: GET /api/v1/payroll-exports/{id}/preview returns JSON

### Phase 4 Verification

1. All routes registered and accessible
2. Swagger UI shows new endpoints at /swagger/
3. All tests pass: `cd apps/api && go test ./...`
4. Lint passes: `make lint`

### Phase 5 Verification

1. All service tests pass with `go test -v -run "TestExportInterface|TestPayrollExport" ./internal/service/...`
2. Tests cover all ticket acceptance criteria:
   - Interfaces can be configured and used to generate export files
   - Export contains only selected accounts and values
   - Errors are returned when configuration is incomplete
3. All ticket test cases covered:
   - TC1: Valid interface export generates file
   - TC2: Missing configuration returns validation error
   - TC3: Account with export=false is excluded

---

## Notes and Design Decisions

1. **Synchronous export generation**: For the initial implementation, export generation runs synchronously in the Generate handler. The 202 status code is used per the existing spec, but the response will already have status=completed for small datasets. Async generation with background workers can be added later.

2. **CSV-first format**: Phase 1 implements CSV format only. XLSX/XML/JSON can be added as incremental enhancements since the service architecture supports multiple formats through the format field.

3. **File storage in database**: Export file content is stored in the `file_content` TEXT column for simplicity. The `GetFileContent` repository method loads it separately to avoid fetching large content during List queries. Future enhancement: write to filesystem using `export_path` and `PayrollExportBasePath`.

4. **Account resolution priority**: When generating an export:
   - If `export_interface_id` provided -> use that interface's account list
   - Else if `include_accounts` provided in parameters -> use those
   - Else -> fall back to all payroll-relevant accounts for the tenant

5. **Permission**: Uses `payroll.manage` permission for both export interfaces and payroll exports. This could be split into `payroll.configure` and `payroll.export` later if needed.

6. **Account repository dependency**: The `ExportInterfaceService` needs to verify accounts are payroll-relevant. It uses the existing `AccountRepository`. If `GetByIDs` (batch get by multiple IDs) doesn't exist, it needs to be added to the repository. Check the existing account repository and add if missing.
