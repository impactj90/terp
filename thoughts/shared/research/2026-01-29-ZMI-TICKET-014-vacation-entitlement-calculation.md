# Research: ZMI-TICKET-014 - Vacation Entitlement Calculation (Urlaubsberechnung)

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-014
**Dependencies**: ZMI-TICKET-004 (Personnel Master Data), ZMI-TICKET-018 (Tariff Definitions), ZMI-TICKET-001 (Mandant Basis Setting)

---

## 1. Ticket Summary

Implement full ZMI vacation entitlement calculation including:
- Standard vacation calculation (fixed, non-editable)
- Special calculations (age, tenure, disability) with thresholds and bonus days
- Calculation groups with basis (calendar year or entry date) and selected special calculations
- CRUD endpoints for special calculations and calculation groups
- Calculate entitlement preview endpoint for an employee/year
- OpenAPI documentation

**Key Business Rules:**
- Annual vacation entitlement entered as full-year value; system prorates for mid-year entry
- Employment type selects which vacation calculation group applies
- Calendar year basis: Jan 1-Dec 31; Entry date basis: employee's hire anniversary year
- Age: add bonus days if age >= threshold
- Tenure: add bonus days if years of service >= threshold
- Disability: add bonus days if disability flag is set
- Part-time adjustment uses weekly hours/part-time percent

---

## 2. Existing Vacation Calculation Code

### 2.1 Calculation Engine (ALREADY IMPLEMENTED)

The core vacation calculation engine already exists in:

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/vacation.go`

Key types:
```go
// Line 9-17: VacationBasis type
type VacationBasis string
const (
    VacationBasisCalendarYear VacationBasis = "calendar_year"
    VacationBasisEntryDate    VacationBasis = "entry_date"
)

// Line 19-29: SpecialCalcType
type SpecialCalcType string
const (
    SpecialCalcAge        SpecialCalcType = "age"
    SpecialCalcTenure     SpecialCalcType = "tenure"
    SpecialCalcDisability SpecialCalcType = "disability"
)

// Line 31-36: VacationSpecialCalc
type VacationSpecialCalc struct {
    Type      SpecialCalcType
    Threshold int
    BonusDays decimal.Decimal
}

// Line 38-56: VacationCalcInput
type VacationCalcInput struct {
    BirthDate           time.Time
    EntryDate           time.Time
    ExitDate            *time.Time
    WeeklyHours         decimal.Decimal
    HasDisability       bool
    BaseVacationDays    decimal.Decimal
    StandardWeeklyHours decimal.Decimal
    Basis               VacationBasis
    SpecialCalcs        []VacationSpecialCalc
    Year                int
    ReferenceDate       time.Time
}

// Line 58-73: VacationCalcOutput
type VacationCalcOutput struct {
    BaseEntitlement     decimal.Decimal
    ProRatedEntitlement decimal.Decimal
    PartTimeAdjustment  decimal.Decimal
    AgeBonus            decimal.Decimal
    TenureBonus         decimal.Decimal
    DisabilityBonus     decimal.Decimal
    TotalEntitlement    decimal.Decimal
    MonthsEmployed      int
    AgeAtReference      int
    TenureYears         int
}
```

The `CalculateVacation(input)` function (lines 78-133) implements the full calculation pipeline:
1. Calculate age and tenure at reference date
2. Calculate months employed in year
3. Pro-rate by months
4. Part-time adjustment
5. Apply special calculations (age, tenure, disability bonuses)
6. Sum and round to nearest 0.5

Also includes:
- `CalculateCarryover(available, maxCarryover)` - carryover capping (lines 138-146)
- `CalculateVacationDeduction(deductionValue, durationDays)` - absence deduction (lines 150-152)
- Helper functions: `calculateAge`, `calculateTenure`, `calculateMonthsEmployedInYear`, `roundToHalfDay`

### 2.2 Vacation Calculation Tests (ALREADY IMPLEMENTED)

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/vacation_test.go`

Comprehensive unit tests exist (21 test functions) covering:
- Basic full year (line 21)
- Part-time 50%/75% (lines 42, 60)
- Pro-rated mid-year entry (line 78)
- Pro-rated mid-year exit (line 97)
- Age bonus applied/below threshold (lines 118, 140)
- Tenure bonus applied/stacked (lines 162, 256)
- Disability bonus applied/not applied (lines 184, 206)
- All bonuses combined (line 228)
- Entry date basis (lines 279, 297)
- Rounding to half-day (lines 316, 334)
- Zero standard hours edge case (line 352)
- Not yet employed (line 371)
- Pro-rated with part-time combined (line 390)
- Carryover calculation (line 412)
- Vacation deduction (line 439)
- Leap year birthday (line 464)
- Exact birthday match (line 489)

### 2.3 Vacation Service (EXISTING - NEEDS EXTENSION)

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation.go`

Current `VacationService` (lines 53-83) supports:
- `GetBalance(ctx, employeeID, year)` - retrieves vacation balance
- `InitializeYear(ctx, employeeID, year)` - calculates and stores entitlement
- `RecalculateTaken(ctx, employeeID, year)` - recalculates taken days
- `AdjustBalance(ctx, employeeID, year, adjustment, notes)` - manual adjustments
- `CarryoverFromPreviousYear(ctx, employeeID, year)` - carryover logic

**Important**: The `InitializeYear` method (lines 107-161) currently builds `VacationCalcInput` with:
- `StandardWeeklyHours: decimal.NewFromInt(40)` (hardcoded default, line 126)
- Empty `SpecialCalcs` (no bonuses applied, line 130)
- Uses `resolveVacationBasis` which checks tenant then tariff (lines 163-176)

This is the **gap to fill**: the service does not yet load special calculation rules or calculation group configuration.

### 2.4 Vacation Handler (EXISTING - NEEDS EXTENSION)

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacation.go`

Currently minimal - only `GetBalance` endpoint (lines 31-73). Maps to `GET /employees/{id}/vacation-balance`.

### 2.5 Vacation Balance Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vacationbalance.go`

```go
type VacationBalance struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    EmployeeID  uuid.UUID
    Year        int
    Entitlement decimal.Decimal
    Carryover   decimal.Decimal
    Adjustments decimal.Decimal
    Taken       decimal.Decimal
    CreatedAt   time.Time
    UpdatedAt   time.Time
    Employee    *Employee
}
// Helper: Total() = Entitlement + Carryover + Adjustments
// Helper: Available() = Total() - Taken
```

### 2.6 Vacation Balance Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationbalance.go`

CRUD operations: Create, GetByID, GetByEmployeeYear, Update, Upsert (ON CONFLICT), UpdateTaken, IncrementTaken, ListByEmployee.

### 2.7 Vacation Balance Migration

**File**: `/home/tolga/projects/terp/db/migrations/000027_create_vacation_balances.up.sql`

Schema: `vacation_balances(id, tenant_id, employee_id, year, entitlement, carryover, adjustments, taken, created_at, updated_at)` with unique index on `(employee_id, year)`.

---

## 3. Related Existing Models

### 3.1 Employee Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employee.go`

Key fields for vacation calculation:
- `EntryDate time.Time` (line 20) - hire date
- `ExitDate *time.Time` (line 21) - termination date
- `EmploymentTypeID *uuid.UUID` (line 24) - links to employment type
- `TariffID *uuid.UUID` (line 25) - links to tariff
- `WeeklyHours decimal.Decimal` (line 26) - actual weekly hours
- `VacationDaysPerYear decimal.Decimal` (line 27) - annual entitlement
- `BirthDate *time.Time` (line 37) - for age bonus
- `PartTimePercent *decimal.Decimal` (line 53) - part-time percentage
- `DisabilityFlag bool` (line 54) - for disability bonus
- `WorkDaysPerWeek *decimal.Decimal` (line 59) - work days/week

### 3.2 Tariff Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tariff.go`

Key vacation-related fields:
- `AnnualVacationDays *decimal.Decimal` (line 80) - base vacation days
- `WorkDaysPerWeek *int` (line 84) - standard work days
- `VacationBasis VacationBasis` (line 88) - calendar_year or entry_date
- `WeeklyTargetHours *decimal.Decimal` (line 100) - standard weekly hours

Helper methods:
- `GetAnnualVacationDays()` (line 169) - returns base days, fallback 30
- `GetWorkDaysPerWeek()` (line 177) - returns work days, fallback 5
- `GetVacationBasis()` (line 185) - returns basis, fallback calendar_year
- `CalculateProRatedVacation(workDaysActual int)` (line 212) - pro-rate by work days

### 3.3 Employment Type Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employmenttype.go`

```go
type EmploymentType struct {
    ID                 uuid.UUID
    TenantID           uuid.UUID
    Code               string
    Name               string
    DefaultWeeklyHours decimal.Decimal
    IsActive           bool
    CreatedAt          time.Time
    UpdatedAt          time.Time
}
```

Note: No vacation calculation group FK yet. The ticket states "Employment type selects which vacation calculation group applies". This will need a new FK column.

### 3.4 Tenant Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tenant.go`

- `VacationBasis VacationBasis` (line 23) - tenant-level default vacation basis
- `Settings datatypes.JSON` (line 24) - JSONB for additional settings

### 3.5 VacationBasis Type (Shared)

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tariff.go` (lines 14-22)

```go
type VacationBasis string
const (
    VacationBasisCalendarYear VacationBasis = "calendar_year"
    VacationBasisEntryDate    VacationBasis = "entry_date"
)
```

Also defined in the calculation package (`calculation.VacationBasis`) with the same values.

---

## 4. CRUD Pattern Reference (Calculation Rules - ZMI-TICKET-013)

The CalculationRule CRUD implementation from ZMI-TICKET-013 is the closest pattern to follow for the new special calculation and calculation group entities.

### 4.1 Model Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/model/calculationrule.go`

```go
type CalculationRule struct {
    ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string     `gorm:"type:varchar(50);not null" json:"code"`
    Name        string     `gorm:"type:varchar(255);not null" json:"name"`
    Description *string    `gorm:"type:text" json:"description,omitempty"`
    // ... specific fields
    IsActive    bool       `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time  `gorm:"default:now()" json:"updated_at"`
    // Relations
    Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (CalculationRule) TableName() string { return "calculation_rules" }
```

### 4.2 Repository Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/calculationrule.go`

```go
type CalculationRuleRepository struct { db *DB }

func NewCalculationRuleRepository(db *DB) *CalculationRuleRepository

func (r *CalculationRuleRepository) Create(ctx, rule) error
func (r *CalculationRuleRepository) GetByID(ctx, id) (*model.CalculationRule, error)
func (r *CalculationRuleRepository) List(ctx, tenantID) ([]model.CalculationRule, error)
func (r *CalculationRuleRepository) ListActive(ctx, tenantID) ([]model.CalculationRule, error)
func (r *CalculationRuleRepository) Update(ctx, rule) error
func (r *CalculationRuleRepository) Delete(ctx, id) error
func (r *CalculationRuleRepository) CountByAbsenceType(ctx, ruleID) (int64, error)
```

Pattern: Uses `r.db.GORM.WithContext(ctx)` for all queries. Returns `nil, nil` for "not found" scenarios (vs `gorm.ErrRecordNotFound`).

### 4.3 Service Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/calculationrule.go`

```go
// Errors
var (
    ErrCalculationRuleNotFound     = errors.New(...)
    ErrCalculationRuleCodeRequired = errors.New(...)
    ErrCalculationRuleNameRequired = errors.New(...)
    ErrCalculationRuleCodeExists   = errors.New(...)
    ErrCalculationRuleInUse        = errors.New(...)
    ErrCalculationRuleInactive     = errors.New(...)
    ErrInvalidValue                = errors.New(...)
    ErrInvalidFactor               = errors.New(...)
)

// Input structs
type CreateCalculationRuleInput struct { ... }
type UpdateCalculationRuleInput struct { ... }  // Uses pointers for optional fields

type CalculationRuleService struct {
    repo *repository.CalculationRuleRepository
}

func NewCalculationRuleService(repo) *CalculationRuleService

func (s *CalculationRuleService) Create(ctx, input) (*model.CalculationRule, error)
func (s *CalculationRuleService) GetByID(ctx, id) (*model.CalculationRule, error)
func (s *CalculationRuleService) List(ctx, tenantID) ([]model.CalculationRule, error)
func (s *CalculationRuleService) ListActive(ctx, tenantID) ([]model.CalculationRule, error)
func (s *CalculationRuleService) Update(ctx, id, input) (*model.CalculationRule, error)
func (s *CalculationRuleService) Delete(ctx, id) error
func (s *CalculationRuleService) ValidateRuleForAssignment(ctx, id) error
```

Key pattern: Uses typed Input structs for Create/Update, returns `*model.X, error`. Update uses pointer fields for partial updates.

### 4.4 Handler Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/calculationrule.go`

```go
type CalculationRuleHandler struct {
    service      *service.CalculationRuleService
    auditService *service.AuditLogService
}

func NewCalculationRuleHandler(svc) *CalculationRuleHandler
func (h *CalculationRuleHandler) SetAuditService(svc)

func (h *CalculationRuleHandler) Create(w, r)
func (h *CalculationRuleHandler) Get(w, r)
func (h *CalculationRuleHandler) List(w, r)
func (h *CalculationRuleHandler) Update(w, r)
func (h *CalculationRuleHandler) Delete(w, r)
```

Handler pattern:
1. Extract tenant ID from context: `middleware.TenantFromContext(r.Context())`
2. Parse path params: `chi.URLParam(r, "id")` + `uuid.Parse()`
3. Decode JSON body: `json.NewDecoder(r.Body).Decode(&req)`
4. Build service input struct
5. Call service method
6. Handle errors with `switch` on sentinel errors
7. Map model to API response using `gen/models` package
8. Respond with `respondJSON(w, status, response)`

### 4.5 Route Registration Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 748-765)

```go
func RegisterCalculationRuleRoutes(r chi.Router, h *CalculationRuleHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("absence_types.manage").String()
    r.Route("/calculation-rules", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
    })
}
```

### 4.6 main.go Wiring Pattern

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go` (lines 207-209)

```go
calculationRuleRepo := repository.NewCalculationRuleRepository(db)
calculationRuleService := service.NewCalculationRuleService(calculationRuleRepo)
calculationRuleHandler := handler.NewCalculationRuleHandler(calculationRuleService)
// ... then in route registration (line 317):
handler.RegisterCalculationRuleRoutes(r, calculationRuleHandler, authzMiddleware)
```

---

## 5. OpenAPI Spec Patterns

### 5.1 Spec Organization

**Main file**: `/home/tolga/projects/terp/api/openapi.yaml` (Swagger 2.0)
- `api/paths/*.yaml` - endpoint definitions
- `api/schemas/*.yaml` - data model schemas
- `api/responses/errors.yaml` - reusable error responses

### 5.2 Path File Pattern (Calculation Rules)

**File**: `/home/tolga/projects/terp/api/paths/calculation-rules.yaml`

Standard CRUD structure:
- `/calculation-rules` - GET (list) + POST (create)
- `/calculation-rules/{id}` - GET (by ID) + PATCH (update) + DELETE

Each operation has: `tags`, `summary`, `operationId`, `parameters`, `responses` with `$ref` to schemas.

### 5.3 Schema File Pattern (Calculation Rules)

**File**: `/home/tolga/projects/terp/api/schemas/calculation-rules.yaml`

Standard schema structure:
- `CalculationRule` - full response model
- `CalculationRuleSummary` - abbreviated model for lists/references
- `CreateCalculationRuleRequest` - creation payload with required fields
- `UpdateCalculationRuleRequest` - update payload (all fields optional)
- `CalculationRuleList` - list wrapper with `data` array

### 5.4 Existing Vacation OpenAPI

**Paths**: `/home/tolga/projects/terp/api/paths/vacation-balances.yaml`
- `GET /vacation-balances` - list with employee_id, year, department_id filters
- `POST /vacation-balances` - create
- `GET /vacation-balances/{id}` - get by ID
- `PATCH /vacation-balances/{id}` - update
- `POST /vacation-balances/initialize` - initialize for year

**Schemas**: `/home/tolga/projects/terp/api/schemas/vacation-balances.yaml`
- `VacationBalance`, `VacationBalanceSummary`, `CreateVacationBalanceRequest`, `UpdateVacationBalanceRequest`, `VacationBalanceList`

### 5.5 openapi.yaml Path References

In main openapi.yaml, paths are registered as:
```yaml
/calculation-rules:
  $ref: 'paths/calculation-rules.yaml#/~1calculation-rules'
/calculation-rules/{id}:
  $ref: 'paths/calculation-rules.yaml#/~1calculation-rules~1{id}'
```

Tags are listed in the `tags` section (e.g., line 114: `- name: Calculation Rules`).

---

## 6. Migration Patterns

### 6.1 Naming Convention

**Pattern**: `NNNNNN_description.up.sql` / `NNNNNN_description.down.sql`

Latest migration: `000047`. Next available: `000048`.

### 6.2 Table Creation Pattern

**File**: `/home/tolga/projects/terp/db/migrations/000046_create_calculation_rules.up.sql`

```sql
CREATE TABLE calculation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- ... specific fields
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_calculation_rules_tenant ON calculation_rules(tenant_id);
-- ... additional indexes

CREATE TRIGGER update_calculation_rules_updated_at
    BEFORE UPDATE ON calculation_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE calculation_rules IS '...';
COMMENT ON COLUMN calculation_rules.code IS '...';
```

### 6.3 FK Addition Pattern

**File**: `/home/tolga/projects/terp/db/migrations/000047_add_calculation_rule_to_absence_types.up.sql`

```sql
ALTER TABLE absence_types
    ADD COLUMN calculation_rule_id UUID REFERENCES calculation_rules(id) ON DELETE SET NULL;
CREATE INDEX idx_absence_types_calculation_rule ON absence_types(calculation_rule_id);
COMMENT ON COLUMN absence_types.calculation_rule_id IS '...';
```

Down migration: `ALTER TABLE absence_types DROP COLUMN IF EXISTS calculation_rule_id;`

---

## 7. Test Patterns

### 7.1 Unit Test (Calculation Package)

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/vacation_test.go`

Pattern: Pure function testing, no DB/mocks needed.
```go
func TestCalculateVacation_BasicFullYear(t *testing.T) {
    input := calculation.VacationCalcInput{ ... }
    output := calculation.CalculateVacation(input)
    assert.True(t, decimalFromFloat(30).Equal(output.BaseEntitlement), "msg")
}
```

### 7.2 Service Test (Mock-Based)

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation_test.go`

Pattern: Uses `testify/mock` for repository interfaces.
```go
type mockVacationBalanceRepoForVacation struct { mock.Mock }
// ... implement interface methods

func newTestVacationService(maxCarryover decimal.Decimal) (...) {
    vacBalanceRepo := new(mockVacationBalanceRepoForVacation)
    svc := NewVacationService(vacBalanceRepo, ...)
    return svc, vacBalanceRepo, ...
}

func TestVacationService_GetBalance_Success(t *testing.T) {
    svc, vacBalanceRepo, ... := newTestVacationService(decimal.Zero)
    vacBalanceRepo.On("GetByEmployeeYear", ctx, ...).Return(expected, nil)
    result, err := svc.GetBalance(ctx, employeeID, year)
    require.NoError(t, err)
    assert.Equal(t, ...)
    vacBalanceRepo.AssertExpectations(t)
}
```

### 7.3 Service Test (Integration with DB)

**File**: `/home/tolga/projects/terp/apps/api/internal/service/calculationrule_test.go`

Pattern: Uses `testutil.SetupTestDB(t)` for real DB connection.
```go
func TestCalculationRuleService_Create_Success(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewCalculationRuleRepository(db)
    svc := service.NewCalculationRuleService(repo)
    tenant := createTestTenantForService(t, db)

    input := service.CreateCalculationRuleInput{ ... }
    rule, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, "FULL_DAY", rule.Code)
}
```

### 7.4 Handler Test (Integration)

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/calculationrule_test.go`

Pattern:
```go
func setupCalculationRuleHandler(t *testing.T) (*handler.CalculationRuleHandler, *service.CalculationRuleService, *model.Tenant, *repository.DB) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewCalculationRuleRepository(db)
    svc := service.NewCalculationRuleService(repo)
    h := handler.NewCalculationRuleHandler(svc)
    // Create test tenant
    tenant := &model.Tenant{...}
    tenantRepo.Create(ctx, tenant)
    return h, svc, tenant, db
}

func TestHandler_Create_Success(t *testing.T) {
    h, _, tenant, _ := setupHandler(t)
    body := `{"code": "TEST", ...}`
    req := httptest.NewRequest("POST", "/path", bytes.NewBufferString(body))
    req = withTenantContext(req, tenant)
    rr := httptest.NewRecorder()
    h.Create(rr, req)
    assert.Equal(t, http.StatusCreated, rr.Code)
}
```

### 7.5 Test DB Setup

**File**: `/home/tolga/projects/terp/apps/api/internal/testutil/db.go`

Uses `testutil.SetupTestDB(t)` which returns `*repository.DB` with transaction isolation per test (auto-rollback on cleanup).

---

## 8. Gap Analysis

### 8.1 What ALREADY EXISTS (No need to implement)

1. **Calculation engine** (`calculation/vacation.go`) - full `CalculateVacation()` with pro-rating, part-time, age/tenure/disability bonuses
2. **Calculation tests** (`calculation/vacation_test.go`) - comprehensive coverage
3. **VacationBalance model** (`model/vacationbalance.go`) - balance tracking
4. **VacationBalance repository** (`repository/vacationbalance.go`) - CRUD + Upsert
5. **VacationBalance migration** (migration 000027) - `vacation_balances` table
6. **VacationService** (`service/vacation.go`) - GetBalance, InitializeYear, RecalculateTaken, AdjustBalance, CarryoverFromPreviousYear
7. **VacationService tests** (`service/vacation_test.go`) - mock-based tests
8. **VacationHandler** (`handler/vacation.go`) - GET /employees/{id}/vacation-balance
9. **OpenAPI vacation balance specs** - paths and schemas
10. **Employee fields** - BirthDate, EntryDate, ExitDate, DisabilityFlag, WeeklyHours, PartTimePercent, WorkDaysPerWeek
11. **Tariff fields** - AnnualVacationDays, WorkDaysPerWeek, VacationBasis, WeeklyTargetHours
12. **Tenant field** - VacationBasis (default basis)

### 8.2 What NEEDS TO BE IMPLEMENTED

#### New Data Models

1. **VacationSpecialCalculation** (Sonderberechnung)
   - `id UUID PK`
   - `tenant_id UUID FK -> tenants`
   - `type VARCHAR(20)` -- 'age', 'tenure', 'disability'
   - `threshold INT` -- age in years or tenure in years (0 for disability)
   - `bonus_days DECIMAL(5,2)` -- additional days
   - `description TEXT` (optional)
   - `is_active BOOLEAN DEFAULT true`
   - `created_at, updated_at TIMESTAMPTZ`
   - Unique constraint: `(tenant_id, type, threshold)`

2. **VacationCalculationGroup** (Berechnungsgruppe)
   - `id UUID PK`
   - `tenant_id UUID FK -> tenants`
   - `code VARCHAR(50)`
   - `name VARCHAR(255)`
   - `basis VARCHAR(20)` -- 'calendar_year' or 'entry_date'
   - `description TEXT` (optional)
   - `is_active BOOLEAN DEFAULT true`
   - `created_at, updated_at TIMESTAMPTZ`
   - Unique constraint: `(tenant_id, code)`

3. **VacationCalcGroupSpecialCalc** (Junction table)
   - `id UUID PK`
   - `group_id UUID FK -> vacation_calculation_groups ON DELETE CASCADE`
   - `special_calculation_id UUID FK -> vacation_special_calculations ON DELETE CASCADE`
   - `created_at TIMESTAMPTZ`
   - Unique constraint: `(group_id, special_calculation_id)`

4. **Employment Type FK** (add column)
   - `employment_types.vacation_calc_group_id UUID FK -> vacation_calculation_groups ON DELETE SET NULL`

#### New CRUD Endpoints

5. **Special Calculations CRUD**
   - `GET /vacation-special-calculations` - List all for tenant
   - `POST /vacation-special-calculations` - Create
   - `GET /vacation-special-calculations/{id}` - Get by ID
   - `PATCH /vacation-special-calculations/{id}` - Update
   - `DELETE /vacation-special-calculations/{id}` - Delete (check if in use by groups)

6. **Calculation Groups CRUD**
   - `GET /vacation-calculation-groups` - List all for tenant
   - `POST /vacation-calculation-groups` - Create (with selected special calc IDs)
   - `GET /vacation-calculation-groups/{id}` - Get by ID (includes linked special calcs)
   - `PATCH /vacation-calculation-groups/{id}` - Update (including special calc assignments)
   - `DELETE /vacation-calculation-groups/{id}` - Delete (check if assigned to employment types)

#### New Preview/Calculation Endpoint

7. **Entitlement Preview**
   - `POST /vacation-entitlement/preview` - Calculate entitlement for employee/year
   - Input: `{ employee_id, year, calculation_group_id (optional) }`
   - Output: Full `VacationCalcOutput` breakdown (base, pro-rated, part-time adjusted, bonuses, total)

#### Service Extensions

8. **Extend VacationService.InitializeYear** to:
   - Look up employee's employment type
   - Resolve the applicable vacation calculation group
   - Load the group's special calculations
   - Pass special calcs to `CalculateVacation()` input
   - Use tariff's `WeeklyTargetHours` as `StandardWeeklyHours` (instead of hardcoded 40)
   - Use employee's `BirthDate` and `DisabilityFlag`

### 8.3 Files to Create

| Layer | File | Contents |
|-------|------|----------|
| Model | `apps/api/internal/model/vacationspecialcalc.go` | `VacationSpecialCalculation` GORM struct |
| Model | `apps/api/internal/model/vacationcalcgroup.go` | `VacationCalculationGroup` + junction GORM struct |
| Repository | `apps/api/internal/repository/vacationspecialcalc.go` | CRUD for special calcs |
| Repository | `apps/api/internal/repository/vacationcalcgroup.go` | CRUD for calc groups + junction management |
| Service | `apps/api/internal/service/vacationspecialcalc.go` | Business logic for special calcs |
| Service | `apps/api/internal/service/vacationcalcgroup.go` | Business logic for calc groups |
| Handler | `apps/api/internal/handler/vacationspecialcalc.go` | HTTP handlers for special calcs |
| Handler | `apps/api/internal/handler/vacationcalcgroup.go` | HTTP handlers for calc groups |
| Migration | `db/migrations/000048_create_vacation_special_calculations.up.sql` | DDL for special calcs table |
| Migration | `db/migrations/000048_create_vacation_special_calculations.down.sql` | Drop table |
| Migration | `db/migrations/000049_create_vacation_calculation_groups.up.sql` | DDL for groups + junction + FK |
| Migration | `db/migrations/000049_create_vacation_calculation_groups.down.sql` | Reverse |
| OpenAPI | `api/paths/vacation-special-calculations.yaml` | Endpoint definitions |
| OpenAPI | `api/paths/vacation-calculation-groups.yaml` | Endpoint definitions |
| OpenAPI | `api/schemas/vacation-special-calculations.yaml` | Schema definitions |
| OpenAPI | `api/schemas/vacation-calculation-groups.yaml` | Schema definitions |
| Test | `apps/api/internal/service/vacationspecialcalc_test.go` | Service tests |
| Test | `apps/api/internal/service/vacationcalcgroup_test.go` | Service tests |
| Test | `apps/api/internal/handler/vacationspecialcalc_test.go` | Handler tests |
| Test | `apps/api/internal/handler/vacationcalcgroup_test.go` | Handler tests |

### 8.4 Files to Modify

| File | Changes |
|------|---------|
| `apps/api/internal/model/employmenttype.go` | Add `VacationCalcGroupID *uuid.UUID` FK |
| `apps/api/internal/service/vacation.go` | Extend `InitializeYear` to load group/special calcs, use tariff's `WeeklyTargetHours`, use employee's `BirthDate`/`DisabilityFlag` |
| `apps/api/internal/handler/vacation.go` | Add preview endpoint handler |
| `apps/api/internal/handler/routes.go` | Add route registrations |
| `apps/api/cmd/server/main.go` | Wire new repos/services/handlers |
| `api/openapi.yaml` | Add path references and tags |
| `api/paths/vacation-balances.yaml` | Add preview endpoint (or new file) |
| `api/schemas/vacation-balances.yaml` | Add preview response schema (or new file) |

---

## 9. Implementation Considerations

### 9.1 Naming Decisions

Following existing codebase conventions:
- DB tables: `vacation_special_calculations`, `vacation_calculation_groups`, `vacation_calc_group_special_calcs`
- Go types: `VacationSpecialCalculation`, `VacationCalculationGroup`, `VacationCalcGroupSpecialCalc`
- API paths: `/vacation-special-calculations`, `/vacation-calculation-groups`
- Tags: "Vacation Special Calculations", "Vacation Calculation Groups"

### 9.2 Special Calc Uniqueness

A tenant can have multiple special calcs of the same type with different thresholds. For example:
- Tenure >= 5 years: +1 day
- Tenure >= 10 years: +2 days (stacked)

These are already supported by the calculation engine (see `TestCalculateVacation_StackedTenureBonuses` in the existing tests).

Unique constraint should be `(tenant_id, type, threshold)` to prevent exact duplicates while allowing stacking.

### 9.3 Calculation Group Resolution Order

Per existing pattern in `VacationService.resolveVacationBasis` (line 163-176):
1. Employee's employment type -> vacation_calc_group_id
2. Fallback to default (no special calcs, standard calculation only)

The `basis` field in the calculation group overrides the tenant/tariff level `VacationBasis` when a group is assigned.

### 9.4 Preview Endpoint Design

The preview endpoint should:
- Accept `employee_id` + `year` (required), optionally `calculation_group_id` override
- Load all required data (employee, tariff, employment type, calc group, special calcs)
- Build `VacationCalcInput` with full data
- Return `VacationCalcOutput` plus input summary for transparency

### 9.5 Generated Models

After defining OpenAPI schemas, run `make generate` to create Go models in `apps/api/gen/models/`. Use these generated models for request/response payloads in handlers (per CLAUDE.md instructions).

### 9.6 Decimal Library

The project uses `github.com/shopspring/decimal` for all decimal calculations. Follow this convention for bonus_days fields.

---

## 10. Existing Generated Model Examples

**File**: `/home/tolga/projects/terp/apps/api/gen/models/calculation_rule.go`

Generated models exist for:
- `CalculationRule`, `CreateCalculationRuleRequest`, `UpdateCalculationRuleRequest`, `CalculationRuleList`, `CalculationRuleSummary`
- `VacationBalance`, `CreateVacationBalanceRequest`, `UpdateVacationBalanceRequest`, `VacationBalanceList`, `VacationBalanceSummary`

New generated models will be needed for:
- `VacationSpecialCalculation`, `CreateVacationSpecialCalculationRequest`, `UpdateVacationSpecialCalculationRequest`, `VacationSpecialCalculationList`
- `VacationCalculationGroup`, `CreateVacationCalculationGroupRequest`, `UpdateVacationCalculationGroupRequest`, `VacationCalculationGroupList`
- `VacationEntitlementPreview` (response model for preview endpoint)

---

## 11. Summary

The ticket's core calculation logic is **already fully implemented** in `calculation/vacation.go` with comprehensive tests. The main work is:

1. **Data model layer** (2 new tables + junction + FK): Define special calculations and calculation groups as persistent, tenant-scoped configuration
2. **CRUD endpoints** (2 new entity types): Standard CRUD following the CalculationRule pattern
3. **Preview endpoint**: Assemble inputs from employee/tariff/group, delegate to existing `CalculateVacation()`, return breakdown
4. **Service integration**: Wire the group/special calc lookup into `VacationService.InitializeYear` so balance initialization uses the full configuration
5. **OpenAPI specs**: Define schemas and paths for new endpoints
6. **Tests**: Service and handler tests following existing patterns
