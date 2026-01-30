# Research: ZMI-TICKET-015 - Vacation Carryover and Capping Rules

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-015

## Summary

This document researches the existing codebase to understand the implementation context for vacation carryover and capping rules (Kappungsregeln), including year-end and mid-year forfeiture, individual employee exceptions, and assignment to tariffs/employees.

---

## 1. ZMI Reference Manual Analysis

### 1.1 Section 20 - Kappungsregeln (Capping Rules) (Pages 215-217)

**Location**: `thoughts/shared/reference/zmi-calculation-manual-reference.md` lines 1900-1967

#### 20.1 Year-End Capping (Page 215)

Original: "Kappung zum Jahresende - Soll zum Jahresende der Resturlaub der Mitarbeiter/-innen gestrichen werden, legen Sie die Kappung wie folgt an:"

Translation: "Year-end capping - If the remaining vacation of employees should be forfeited at year-end, create the capping as follows:"

**Behavior**: At year-end, remaining vacation is forfeited or limited to a maximum carryover amount. A `CapValue` of 0 forfeits all remaining vacation; a positive value caps at that number.

#### 20.2 Mid-Year Capping (Page 215)

Original: "Kappung wahrend des Jahres - Im Beispiel unten wurde eine Kappung des Resturlaubs aus dem Vorjahr zum 31.03. angelegt."

Translation: "Mid-year capping - In the example below, a capping of remaining vacation from the previous year was created for March 31."

**Behavior**: After a configured cutoff date (e.g., March 31), prior-year carryover is forfeited. This only affects the carryover portion from the previous year, not the current year's entitlement.

#### 20.3 Individual Exceptions (Page 217)

Original: "Hinweis: Es besteht die Moglichkeit, das System so zu konfigurieren, dass einzelne Mitarbeiter/-innen trotz aktiver Kappung ihren Resturlaub bzw. Teile davon behalten konnen."

Translation: "Note: It is possible to configure the system so that individual employees can keep their remaining vacation or parts of it despite active capping."

**Behavior**: Individual employees can be exempted from capping (full exemption) or given a partial exemption (retain a specific number of days).

#### Derived Data Model from Reference

```
type CappingRule struct {
    ID          string
    Name        string
    Date        MonthDay      // e.g., March 31 for mid-year; December 31 for year-end
    CapValue    int           // 0 = forfeit all, >0 = cap at this value
    AppliesTo   CappingScope  // PreviousYearVacation, FlexTime, etc.
}

type EmployeeCappingException struct {
    EmployeeID     string
    CappingRuleID  string
    ExemptionType  ExemptionType  // FullExemption, PartialExemption
    RetainValue    *int           // For partial: how much to keep
}
```

### 1.2 Ticket Definition

**Location**: `thoughts/shared/tickets/ZMI-TICKET-015-vacation-carryover-capping.md`

Scope:
- Capping rule definitions: name, type (year-end, mid-year), cutoff date, max carryover, grouping, active flag
- Vacation balance fields: carryover, adjustments, taken, entitlement
- Year-end capping limits unused vacation carried into next year
- Mid-year capping forfeits prior-year carryover after cutoff date
- Capping rules can be grouped and assigned to tariffs/employees
- CRUD endpoints for capping rules
- Assign capping rule groups to tariffs/employees
- Run carryover/capping for a given year
- Preview carryover results

Test Cases:
1. Year-end cap: remaining=8, cap=5 -> carryover=5
2. Mid-year cutoff: prior-year carryover=3, cutoff=03-31, date=04-01 -> carryover forfeited
3. No rule: remaining=8, no capping rule -> carryover=8

---

## 2. Existing Vacation Code

### 2.1 Vacation Balance Model

**File**: `apps/api/internal/model/vacationbalance.go`

```go
type VacationBalance struct {
    ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID       `gorm:"type:uuid;not null;index" json:"employee_id"`
    Year       int             `gorm:"type:int;not null" json:"year"`

    Entitlement decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"entitlement"`
    Carryover   decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"carryover"`
    Adjustments decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"adjustments"`
    Taken       decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"taken"`

    // Computed methods: Total() and Available()
}
```

Fields: `Entitlement` (annual), `Carryover` (from previous year), `Adjustments` (manual), `Taken` (used).
- `Total() = Entitlement + Carryover + Adjustments`
- `Available() = Total() - Taken`

### 2.2 Vacation Balance Migration

**File**: `db/migrations/000027_create_vacation_balances.up.sql`

Creates `vacation_balances` table with fields: `id`, `tenant_id`, `employee_id`, `year`, `entitlement`, `carryover`, `adjustments`, `taken`.
- Unique constraint on `(employee_id, year)`.
- No carryover-related metadata fields (no `carryover_expires_at`, no `capping_rule_id`).

### 2.3 Vacation Balance Repository

**File**: `apps/api/internal/repository/vacationbalance.go`

Repository methods:
- `Create(ctx, balance)` - creates new balance
- `GetByID(ctx, id)` - get by UUID
- `GetByEmployeeYear(ctx, employeeID, year)` - get by employee+year (returns nil if not found)
- `Update(ctx, balance)` - full save
- `Upsert(ctx, balance)` - insert/update on conflict `(employee_id, year)`
- `UpdateTaken(ctx, employeeID, year, taken)` - update taken field only
- `IncrementTaken(ctx, employeeID, year, amount)` - atomically add to taken
- `ListByEmployee(ctx, employeeID)` - list all years for employee

### 2.4 Vacation Service

**File**: `apps/api/internal/service/vacation.go`

Key methods:
- `GetBalance(ctx, employeeID, year)` - retrieve vacation balance
- `InitializeYear(ctx, employeeID, year)` - calculate and store entitlement
- `PreviewEntitlement(ctx, input)` - preview calculation without persisting
- `RecalculateTaken(ctx, employeeID, year)` - recalculate taken from absences
- `AdjustBalance(ctx, employeeID, year, adjustment, notes)` - add manual adjustment
- `CarryoverFromPreviousYear(ctx, employeeID, year)` - carry over remaining balance

**Carryover Logic** (existing):
```go
func (s *VacationService) CarryoverFromPreviousYear(ctx, employeeID, year) error {
    prevBalance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year-1)
    available := prevBalance.Available()
    carryover := calculation.CalculateCarryover(available, s.defaultMaxCarryover) // simple cap
    currentBalance.Carryover = carryover
    return s.vacationBalanceRepo.Upsert(ctx, currentBalance)
}
```

The existing carryover logic uses a single `defaultMaxCarryover` value passed during service construction (currently `decimal.Zero` = unlimited). There is no per-rule, per-employee, or date-based capping.

**Dependencies injected**:
- `vacationBalanceRepo`
- `absenceDayRepo`
- `absenceTypeRepo`
- `employeeRepo`
- `tenantRepo`
- `tariffRepo`
- `employmentTypeRepo`
- `vacationCalcGroupRepo`
- `defaultMaxCarryover decimal.Decimal`

### 2.5 Calculation Package - Vacation Functions

**File**: `apps/api/internal/calculation/vacation.go`

Key functions:
- `CalculateVacation(input VacationCalcInput) VacationCalcOutput` - full entitlement calc
- `CalculateCarryover(available, maxCarryover decimal.Decimal) decimal.Decimal` - simple cap:
  ```go
  func CalculateCarryover(available, maxCarryover decimal.Decimal) decimal.Decimal {
      if available.LessThanOrEqual(decimal.Zero) { return decimal.Zero }
      if maxCarryover.IsPositive() && available.GreaterThan(maxCarryover) { return maxCarryover }
      return available
  }
  ```
- `CalculateVacationDeduction(deductionValue, durationDays decimal.Decimal) decimal.Decimal`

The `CalculateCarryover` function is the year-end capping logic. It currently only applies a simple max cap. For ZMI-TICKET-015, this needs to be extended or new functions added for:
- Year-end capping with rule-based max carryover
- Mid-year capping that forfeits prior-year carryover after a cutoff date

### 2.6 Vacation Special Calculations

**File**: `apps/api/internal/model/vacationspecialcalc.go`

Defines bonus rules (age, tenure, disability) linked to vacation calculation groups. Pattern reference for creating capping rule definitions.

### 2.7 Vacation Calculation Groups

**File**: `apps/api/internal/model/vacationcalcgroup.go`

Groups combine a basis + set of special calculations. Linked to employment types via FK. This is the existing "grouping" pattern -- similar pattern needed for capping rule groups.

**Junction table**: `VacationCalcGroupSpecialCalc` links groups to special calculations (many2many).

### 2.8 Vacation Handlers

**File**: `apps/api/internal/handler/vacation.go`

Handler methods for balance CRUD, initialization, and preview. Registered in routes as:
- `RegisterVacationRoutes(r, vacationHandler)` - `GET /employees/{id}/vacation-balance`
- `RegisterVacationEntitlementRoutes(r, vacationHandler, authz)` - `POST /vacation-entitlement/preview`

**File**: `apps/api/internal/handler/vacationcalcgroup.go`
Standard CRUD handler for vacation calculation groups.

**File**: `apps/api/internal/handler/vacationspecialcalc.go`
Standard CRUD handler for vacation special calculations.

---

## 3. Existing Tariff Code

### 3.1 Tariff Model

**File**: `apps/api/internal/model/tariff.go`

The Tariff model contains vacation-related fields:
- `AnnualVacationDays *decimal.Decimal` - base annual vacation days
- `WorkDaysPerWeek *int` - work days per week (default 5)
- `VacationBasis VacationBasis` - calendar_year or entry_date

It also includes flextime fields that may relate to capping:
- `CreditType CreditType` - how flextime is credited (includes `no_carryover` option)
- `MaxFlextimePerMonth`, `UpperLimitAnnual`, `LowerLimitAnnual`, `FlextimeThreshold`

Currently, there is NO `CappingRuleGroupID` or similar FK on the Tariff model. This will need to be added.

### 3.2 Employee-Tariff Relationship

**File**: `apps/api/internal/model/employee.go`

Employee has `TariffID *uuid.UUID` FK linking to a tariff. Also has:
- `EmploymentTypeID *uuid.UUID` - links to employment type (which links to vacation calc groups)
- `DisabilityFlag bool` - used for vacation special calculations
- `WeeklyHours decimal.Decimal` - for part-time calculations

The existing pattern for assigning groups is:
- Employee -> EmploymentType -> VacationCalcGroupID -> VacationCalculationGroup

For capping rules, the assignment pattern should be similar:
- Capping rules grouped -> group assigned to tariff and/or employee (with employee-level override/exception)

### 3.3 Employment Type Linkage

**File**: `apps/api/internal/model/employmenttype.go`

```go
type EmploymentType struct {
    // ...
    VacationCalcGroupID *uuid.UUID `gorm:"type:uuid" json:"vacation_calc_group_id,omitempty"`
    VacationCalcGroup *VacationCalculationGroup `gorm:"foreignKey:VacationCalcGroupID"`
}
```

This is the existing FK linkage pattern: employment type holds a nullable FK to a group. For capping rules, a similar FK could be added to `Tariff` or `EmploymentType` (or both).

---

## 4. Existing Patterns

### 4.1 Model Definition Pattern

Standard GORM model with:
- UUID primary key with `gen_random_uuid()` default
- `TenantID uuid.UUID` for multi-tenancy
- `Code string` + `Name string` for human-readable identification
- `IsActive bool` with `default:true`
- `CreatedAt`, `UpdatedAt` timestamps
- Optional `Description *string`
- `TableName()` method returning table name
- Relations via GORM tags

Example (VacationCalculationGroup):
```go
type VacationCalculationGroup struct {
    ID          uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID    uuid.UUID     `gorm:"type:uuid;not null;index"`
    Code        string        `gorm:"type:varchar(50);not null"`
    Name        string        `gorm:"type:varchar(255);not null"`
    Description *string       `gorm:"type:text"`
    Basis       VacationBasis `gorm:"type:varchar(20);not null;default:'calendar_year'"`
    IsActive    bool          `gorm:"default:true"`
    CreatedAt   time.Time     `gorm:"default:now()"`
    UpdatedAt   time.Time     `gorm:"default:now()"`
}
```

### 4.2 Repository Pattern

Standard repository with DB wrapper:
```go
type XRepository struct {
    db *DB
}

func NewXRepository(db *DB) *XRepository {
    return &XRepository{db: db}
}
```

Methods: `Create`, `GetByID`, `List`, `Update`, `Delete`, and specialized queries as needed.

Uses GORM:
- `.WithContext(ctx)` for all queries
- `.First(&model, "id = ?", id)` for single fetches
- `.Where(conditions).Find(&results)` for lists
- `.Clauses(clause.OnConflict{...})` for upserts
- Error handling: check `gorm.ErrRecordNotFound`

### 4.3 Service Pattern

Services define local interfaces for their dependencies:
```go
type xRepositoryForService interface {
    Method(ctx context.Context, ...) (Result, error)
}
```

Service struct holds interfaces (not concrete types). Constructor receives all deps. Error variables defined at package level.

### 4.4 Handler Pattern

Handlers:
```go
type XHandler struct {
    service *service.XService
}

func NewXHandler(service *service.XService) *XHandler {
    return &XHandler{service: service}
}
```

Methods follow pattern: parse request, validate, call service, respond with `respondJSON` or `respondError`.

Uses generated models from `gen/models` for request/response payloads:
```go
var req models.CreateXRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil { ... }
if err := req.Validate(nil); err != nil { ... }
```

### 4.5 Route Registration Pattern

**File**: `apps/api/internal/handler/routes.go`

Standard pattern:
```go
func RegisterXRoutes(r chi.Router, h *XHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("x.manage").String()
    r.Route("/x-resources", func(r chi.Router) {
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
        // ...etc
    })
}
```

### 4.6 Migration Pattern

**Latest migration number**: 000049

Migration files follow naming: `db/migrations/000XXX_description.{up,down}.sql`

Pattern for creating tables:
```sql
CREATE TABLE x (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- fields...
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_x_tenant ON x(tenant_id);
CREATE TRIGGER update_x_updated_at
    BEFORE UPDATE ON x
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

Pattern for junction tables (from migration 000049):
```sql
CREATE TABLE junction_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES parent_table(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES child_table(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_id, child_id)
);
```

Pattern for adding FK columns to existing tables:
```sql
ALTER TABLE existing_table
    ADD COLUMN fk_id UUID REFERENCES new_table(id) ON DELETE SET NULL;
CREATE INDEX idx_existing_table_fk ON existing_table(fk_id);
```

### 4.7 OpenAPI Spec Pattern

**Path files**: `api/paths/x.yaml` (Swagger 2.0)
**Schema files**: `api/schemas/x.yaml`

Standard CRUD pattern (from vacation-calculation-groups):
- `GET /x` - list (with optional query filters)
- `POST /x` - create
- `GET /x/{id}` - get by ID
- `PATCH /x/{id}` - update
- `DELETE /x/{id}` - delete

Schemas define: main resource, summary variant, create request, update request, list wrapper.

### 4.8 Main.go Wiring Pattern

**File**: `apps/api/cmd/server/main.go`

Order:
1. Initialize repository: `xRepo := repository.NewXRepository(db)`
2. Initialize service: `xService := service.NewXService(xRepo, ...deps)`
3. Initialize handler: `xHandler := handler.NewXHandler(xService)`
4. Register routes: `handler.RegisterXRoutes(r, xHandler, authzMiddleware)`

---

## 5. OpenAPI Spec - Existing Vacation Endpoints

### 5.1 Vacation Balances

**File**: `api/paths/vacation-balances.yaml`

Endpoints:
- `GET /vacation-balances` - list (filters: employee_id, year, department_id)
- `POST /vacation-balances` - create
- `GET /vacation-balances/{id}` - get by ID
- `PATCH /vacation-balances/{id}` - update
- `POST /vacation-balances/initialize` - initialize for year (with optional carryover flag)

**File**: `api/schemas/vacation-balances.yaml`

VacationBalance schema includes:
- `base_entitlement`, `additional_entitlement`, `carryover_from_previous`, `manual_adjustment`
- `used_days`, `planned_days`
- `total_entitlement`, `remaining_days`
- `carryover_to_next` (nullable)
- `carryover_expires_at` (nullable date)

Note: The OpenAPI schema has `carryover_expires_at` and `carryover_to_next` fields that are NOT yet in the GORM model. These may be needed for capping rules.

### 5.2 Vacation Entitlement Preview

**File**: `api/paths/vacation-entitlement.yaml`

- `POST /vacation-entitlement/preview` - preview entitlement calculation

### 5.3 Vacation Calculation Groups

**File**: `api/paths/vacation-calculation-groups.yaml`

Full CRUD endpoints for calculation groups. Pattern to follow for capping rule groups.

### 5.4 Vacation Special Calculations

**File**: `api/paths/vacation-special-calculations.yaml`

Full CRUD endpoints for special calculations.

---

## 6. Database Schema

### 6.1 Current Vacation Tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| `vacation_balances` | 000027 | Per-employee per-year balance tracking |
| `vacation_special_calculations` | 000048 | Bonus rules (age, tenure, disability) |
| `vacation_calculation_groups` | 000049 | Groups combining basis + special calcs |
| `vacation_calc_group_special_calcs` | 000049 | Junction: group <-> special calc |

### 6.2 Employment Type FK

`employment_types.vacation_calc_group_id` FK added in migration 000049, links employment type to vacation calculation group.

### 6.3 Tariff Table

Tariff has vacation-related columns (`annual_vacation_days`, `work_days_per_week`, `vacation_basis`) but NO capping rule group FK.

### 6.4 Employee Table

Employee has `tariff_id`, `employment_type_id`, and various override fields but NO direct capping rule or exception FK.

---

## 7. Existing Calculation Capping (Time-Based)

### 7.1 calculation/capping.go

**File**: `apps/api/internal/calculation/capping.go`

This file implements TIME-BASED capping (daily work time capping), NOT vacation capping:
- `CappingSource` enum: `early_arrival`, `late_leave`, `max_net_time`
- `CalculateEarlyArrivalCapping` - caps time before evaluation window
- `CalculateLateDepatureCapping` - caps time after evaluation window
- `CalculateMaxNetTimeCapping` - caps net work time at maximum
- `AggregateCapping` - combines multiple capping items
- `ApplyCapping` / `ApplyWindowCapping` - convenience wrappers

This is completely separate from vacation capping rules. The naming overlap is coincidental -- "capping" in ZMI refers to both daily time capping (Section 8.6) and vacation balance capping (Section 20).

---

## 8. Previous Research/Plans

### 8.1 Existing Research

No existing research files found for ZMI-TICKET-015.

### 8.2 Related Ticket Research

- `2026-01-29-ZMI-TICKET-014-vacation-entitlement-calculation.md` - vacation entitlement (dependency, implemented)
- `2026-01-25-NOK-147-capping-account-logic.md` - daily time capping account (different concept)
- `2026-01-24-NOK-138-vacation-balance-model-repository.md` - vacation balance model
- `2026-01-24-NOK-139-vacation-calculation-logic.md` - vacation calculation logic
- `2026-01-24-NOK-140-create-vacation-service.md` - vacation service

### 8.3 Ticket File

`thoughts/shared/tickets/ZMI-TICKET-015-vacation-carryover-capping.md` exists with full requirements.

---

## 9. Gap Analysis

### 9.1 What Exists

- Vacation balance model with `Carryover` field
- Simple carryover calculation (`CalculateCarryover`) with flat max cap
- `CarryoverFromPreviousYear` method on VacationService using `defaultMaxCarryover`
- OpenAPI schema with `carryover_expires_at` and `carryover_to_next` fields (not in GORM model yet)
- Vacation calculation groups pattern (model, repo, service, handler, migration, OpenAPI)
- Employment type -> vacation calc group linkage pattern

### 9.2 What Is Missing

1. **Capping Rule Model**: No `CappingRule` GORM model exists. Need: name, type (year_end/mid_year), cutoff_month, cutoff_day, max_carryover_days, applies_to scope, is_active, tenant_id.

2. **Capping Rule Group Model**: No group model. Need: name, code, tenant_id, is_active, with junction table to link rules to groups.

3. **Employee Capping Exception Model**: No exception model. Need: employee_id, capping_rule_id (or group_id), exemption_type (full/partial), retain_value.

4. **Tariff FK**: No `capping_rule_group_id` on tariff. Need to add FK.

5. **Employee FK or Override**: May need employee-level override FK or rely on exception table.

6. **Repository/Service/Handler**: No capping rule CRUD exists.

7. **Vacation Balance Enhancements**: The GORM model lacks `carryover_expires_at` (already in OpenAPI schema). May need migration to add this field.

8. **Mid-Year Capping Logic**: No function to check if a cutoff date has passed and forfeit carryover.

9. **OpenAPI Spec**: No capping rule endpoints defined.

10. **Route Registration**: No capping rule routes in `routes.go` or `main.go`.

---

## 10. Key Files Reference

### Models
- `apps/api/internal/model/vacationbalance.go` - Vacation balance GORM model
- `apps/api/internal/model/vacationcalcgroup.go` - Vacation calculation group model (pattern reference)
- `apps/api/internal/model/vacationspecialcalc.go` - Special calculation model (pattern reference)
- `apps/api/internal/model/tariff.go` - Tariff model (needs capping rule group FK)
- `apps/api/internal/model/employee.go` - Employee model (has tariff_id, employment_type_id)
- `apps/api/internal/model/employmenttype.go` - Employment type (has vacation_calc_group_id FK pattern)

### Repositories
- `apps/api/internal/repository/vacationbalance.go` - Vacation balance repository
- `apps/api/internal/repository/vacationcalcgroup.go` - Vacation calc group repository (pattern reference)
- `apps/api/internal/repository/vacationspecialcalc.go` - Special calc repository (pattern reference)

### Services
- `apps/api/internal/service/vacation.go` - Vacation service with carryover logic
- `apps/api/internal/service/vacationcalcgroup.go` - Calc group service (pattern reference)
- `apps/api/internal/service/vacationspecialcalc.go` - Special calc service (pattern reference)
- `apps/api/internal/service/tariff.go` - Tariff service (pattern reference)

### Handlers
- `apps/api/internal/handler/vacation.go` - Vacation handler
- `apps/api/internal/handler/vacationcalcgroup.go` - Calc group handler (pattern reference)
- `apps/api/internal/handler/vacationspecialcalc.go` - Special calc handler (pattern reference)
- `apps/api/internal/handler/routes.go` - Route registration patterns

### Calculation Package
- `apps/api/internal/calculation/vacation.go` - CalculateCarryover function
- `apps/api/internal/calculation/capping.go` - Daily time capping (NOT vacation capping)

### Migrations
- `db/migrations/000027_create_vacation_balances.up.sql` - Vacation balance table
- `db/migrations/000048_create_vacation_special_calculations.up.sql` - Special calcs (pattern)
- `db/migrations/000049_create_vacation_calculation_groups.up.sql` - Calc groups + junction + FK (pattern)

### OpenAPI
- `api/paths/vacation-balances.yaml` - Vacation balance endpoints
- `api/schemas/vacation-balances.yaml` - Vacation balance schemas (has carryover_expires_at)
- `api/paths/vacation-calculation-groups.yaml` - Calc group endpoints (CRUD pattern)
- `api/schemas/vacation-calculation-groups.yaml` - Calc group schemas (CRUD pattern)
- `api/paths/vacation-entitlement.yaml` - Preview endpoint

### Wiring
- `apps/api/cmd/server/main.go` - Repository/service/handler initialization and route registration

### Reference Material
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` - Lines 1900-1967 (Section 20)
- `thoughts/shared/tickets/ZMI-TICKET-015-vacation-carryover-capping.md` - Ticket definition

### Latest Migration Number
- 000049 (`create_vacation_calculation_groups`)
