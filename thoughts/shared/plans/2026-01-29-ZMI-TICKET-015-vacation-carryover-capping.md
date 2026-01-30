# Implementation Plan: ZMI-TICKET-015 - Vacation Carryover and Capping Rules

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-015
**Dependencies**: ZMI-TICKET-014 (Vacation Entitlement Calculation), ZMI-TICKET-018 (Tariff Definitions)
**Status**: Ready for implementation

---

## Summary

Implement vacation carryover and capping rules (Kappungsregeln) as defined in ZMI manual Section 20. This includes:

- **Year-end capping**: At year-end, remaining vacation is limited to a maximum carryover amount. A cap value of 0 forfeits all remaining vacation; a positive value caps at that number.
- **Mid-year capping**: After a configured cutoff date (e.g., March 31), prior-year carryover is forfeited. This only affects the carryover portion from the previous year, not the current year's entitlement.
- **Individual exceptions**: Specific employees can be fully or partially exempted from capping rules.
- **Capping rule groups**: Rules are grouped and assigned to tariffs. Employees inherit the capping rules from their tariff.
- **Preview and apply**: Dry-run preview of carryover results, and a persist operation to apply carryover.

### What Already Exists (DO NOT reimplement)

- `apps/api/internal/model/vacationbalance.go` -- VacationBalance GORM model with Carryover field
- `apps/api/internal/repository/vacationbalance.go` -- CRUD + Upsert + GetByEmployeeYear
- `apps/api/internal/service/vacation.go` -- VacationService with CarryoverFromPreviousYear (uses simple defaultMaxCarryover)
- `apps/api/internal/calculation/vacation.go` -- CalculateCarryover (simple flat cap)
- `apps/api/internal/model/tariff.go` -- Tariff model (no capping FK yet)
- `apps/api/internal/model/employee.go` -- Employee with TariffID
- Vacation calculation groups pattern (model, repo, service, handler, migration, OpenAPI) -- used as structural reference
- Migration numbering at 000049

---

## Phase 1: Database Schema & Models

### 1.1 Create `vacation_capping_rules` table

**File**: `/home/tolga/projects/terp/db/migrations/000050_create_vacation_capping_rules.up.sql`

```sql
-- =============================================================
-- Create vacation_capping_rules table
-- ZMI manual section 20: Kappungsregeln
-- Types: year_end (Kappung zum Jahresende), mid_year (Kappung wahrend des Jahres)
-- =============================================================
CREATE TABLE vacation_capping_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('year_end', 'mid_year')),
    cutoff_month INT NOT NULL DEFAULT 12 CHECK (cutoff_month BETWEEN 1 AND 12),
    cutoff_day INT NOT NULL DEFAULT 31 CHECK (cutoff_day BETWEEN 1 AND 31),
    cap_value DECIMAL(5,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_vcr_tenant ON vacation_capping_rules(tenant_id);
CREATE INDEX idx_vcr_tenant_active ON vacation_capping_rules(tenant_id, is_active);
CREATE INDEX idx_vcr_type ON vacation_capping_rules(tenant_id, rule_type);

CREATE TRIGGER update_vacation_capping_rules_updated_at
    BEFORE UPDATE ON vacation_capping_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vacation_capping_rules IS 'Vacation capping rules (Kappungsregeln) for year-end and mid-year carryover limits.';
COMMENT ON COLUMN vacation_capping_rules.rule_type IS 'year_end: limits carryover at year boundary; mid_year: forfeits prior-year carryover after cutoff date.';
COMMENT ON COLUMN vacation_capping_rules.cutoff_month IS 'Month of the cutoff date (1-12). For year_end typically 12; for mid_year e.g. 3 for March.';
COMMENT ON COLUMN vacation_capping_rules.cutoff_day IS 'Day of the cutoff date (1-31). For year_end typically 31; for mid_year e.g. 31 for March 31.';
COMMENT ON COLUMN vacation_capping_rules.cap_value IS 'Maximum days to carry over. 0 means forfeit all remaining; positive value caps at that amount.';
```

**File**: `/home/tolga/projects/terp/db/migrations/000050_create_vacation_capping_rules.down.sql`

```sql
DROP TABLE IF EXISTS vacation_capping_rules;
```

### 1.2 Create `vacation_capping_rule_groups` table, junction table, and tariff FK

**File**: `/home/tolga/projects/terp/db/migrations/000051_create_vacation_capping_rule_groups.up.sql`

```sql
-- =============================================================
-- Create vacation_capping_rule_groups table
-- Groups combine multiple capping rules for assignment to tariffs
-- =============================================================
CREATE TABLE vacation_capping_rule_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_vcrg_tenant ON vacation_capping_rule_groups(tenant_id);
CREATE INDEX idx_vcrg_tenant_active ON vacation_capping_rule_groups(tenant_id, is_active);

CREATE TRIGGER update_vacation_capping_rule_groups_updated_at
    BEFORE UPDATE ON vacation_capping_rule_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vacation_capping_rule_groups IS 'Groups of vacation capping rules for assignment to tariffs.';

-- =============================================================
-- Junction table: links groups to their capping rules
-- =============================================================
CREATE TABLE vacation_capping_rule_group_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES vacation_capping_rule_groups(id) ON DELETE CASCADE,
    capping_rule_id UUID NOT NULL REFERENCES vacation_capping_rules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, capping_rule_id)
);

CREATE INDEX idx_vcrgr_group ON vacation_capping_rule_group_rules(group_id);
CREATE INDEX idx_vcrgr_rule ON vacation_capping_rule_group_rules(capping_rule_id);

COMMENT ON TABLE vacation_capping_rule_group_rules IS 'Junction table linking capping rule groups to their capping rules.';

-- =============================================================
-- Add vacation_capping_rule_group_id FK to tariffs
-- Tariff selects which capping rule group applies to its employees
-- =============================================================
ALTER TABLE tariffs
    ADD COLUMN vacation_capping_rule_group_id UUID REFERENCES vacation_capping_rule_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_tariffs_vacation_capping_rule_group ON tariffs(vacation_capping_rule_group_id);

COMMENT ON COLUMN tariffs.vacation_capping_rule_group_id IS 'Links tariff to its vacation capping rule group.';
```

**File**: `/home/tolga/projects/terp/db/migrations/000051_create_vacation_capping_rule_groups.down.sql`

```sql
ALTER TABLE tariffs DROP COLUMN IF EXISTS vacation_capping_rule_group_id;
DROP TABLE IF EXISTS vacation_capping_rule_group_rules;
DROP TABLE IF EXISTS vacation_capping_rule_groups;
```

### 1.3 Create `employee_capping_exceptions` table and add `carryover_expires_at` to `vacation_balances`

**File**: `/home/tolga/projects/terp/db/migrations/000052_create_employee_capping_exceptions.up.sql`

```sql
-- =============================================================
-- Create employee_capping_exceptions table
-- ZMI manual section 20.3: Individual exceptions from capping rules
-- =============================================================
CREATE TABLE employee_capping_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    capping_rule_id UUID NOT NULL REFERENCES vacation_capping_rules(id) ON DELETE CASCADE,
    exemption_type VARCHAR(20) NOT NULL CHECK (exemption_type IN ('full', 'partial')),
    retain_days DECIMAL(5,2),
    year INT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, capping_rule_id, year)
);

CREATE INDEX idx_ece_tenant ON employee_capping_exceptions(tenant_id);
CREATE INDEX idx_ece_employee ON employee_capping_exceptions(employee_id);
CREATE INDEX idx_ece_rule ON employee_capping_exceptions(capping_rule_id);
CREATE INDEX idx_ece_employee_year ON employee_capping_exceptions(employee_id, year);

CREATE TRIGGER update_employee_capping_exceptions_updated_at
    BEFORE UPDATE ON employee_capping_exceptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_capping_exceptions IS 'Individual employee exceptions from vacation capping rules.';
COMMENT ON COLUMN employee_capping_exceptions.exemption_type IS 'full: employee keeps all vacation; partial: employee keeps up to retain_days.';
COMMENT ON COLUMN employee_capping_exceptions.retain_days IS 'For partial exemption: max days the employee can retain despite capping. NULL for full exemption.';
COMMENT ON COLUMN employee_capping_exceptions.year IS 'Year this exception applies to. NULL means applies to all years.';

-- =============================================================
-- Add carryover_expires_at to vacation_balances
-- Tracks when mid-year capping should forfeit the carryover
-- =============================================================
ALTER TABLE vacation_balances
    ADD COLUMN carryover_expires_at DATE;

COMMENT ON COLUMN vacation_balances.carryover_expires_at IS 'Date after which carryover from previous year is forfeited (mid-year capping).';
```

**File**: `/home/tolga/projects/terp/db/migrations/000052_create_employee_capping_exceptions.down.sql`

```sql
ALTER TABLE vacation_balances DROP COLUMN IF EXISTS carryover_expires_at;
DROP TABLE IF EXISTS employee_capping_exceptions;
```

### 1.4 GORM Model: VacationCappingRule

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vacationcappingrule.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// CappingRuleType defines the type of vacation capping rule.
type CappingRuleType string

const (
	CappingRuleTypeYearEnd CappingRuleType = "year_end"
	CappingRuleTypeMidYear CappingRuleType = "mid_year"
)

// ValidCappingRuleTypes lists all valid capping rule types.
var ValidCappingRuleTypes = []CappingRuleType{
	CappingRuleTypeYearEnd,
	CappingRuleTypeMidYear,
}

// IsValidCappingRuleType checks if a type string is valid.
func IsValidCappingRuleType(t string) bool {
	for _, valid := range ValidCappingRuleTypes {
		if string(valid) == t {
			return true
		}
	}
	return false
}

// VacationCappingRule defines a vacation capping rule (Kappungsregel).
// ZMI manual section 20.
type VacationCappingRule struct {
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string          `gorm:"type:varchar(50);not null" json:"code"`
	Name        string          `gorm:"type:varchar(255);not null" json:"name"`
	Description *string         `gorm:"type:text" json:"description,omitempty"`
	RuleType    CappingRuleType `gorm:"type:varchar(20);not null;column:rule_type" json:"rule_type"`
	CutoffMonth int             `gorm:"type:int;not null;default:12" json:"cutoff_month"`
	CutoffDay   int             `gorm:"type:int;not null;default:31" json:"cutoff_day"`
	CapValue    decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"cap_value"`
	IsActive    bool            `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time       `gorm:"default:now()" json:"updated_at"`

	// Relations
	Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (VacationCappingRule) TableName() string {
	return "vacation_capping_rules"
}

// CutoffDate returns the cutoff date for a given year.
func (r *VacationCappingRule) CutoffDate(year int) time.Time {
	return time.Date(year, time.Month(r.CutoffMonth), r.CutoffDay, 0, 0, 0, 0, time.UTC)
}
```

### 1.5 GORM Model: VacationCappingRuleGroup + Junction

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vacationcappingrulegroup.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// VacationCappingRuleGroup defines a group of vacation capping rules.
// Groups are assigned to tariffs to determine which capping rules apply.
type VacationCappingRuleGroup struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(50);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Tenant       *Tenant               `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
	CappingRules []VacationCappingRule  `gorm:"many2many:vacation_capping_rule_group_rules;foreignKey:ID;joinForeignKey:GroupID;References:ID;joinReferences:CappingRuleID" json:"capping_rules,omitempty"`
}

func (VacationCappingRuleGroup) TableName() string {
	return "vacation_capping_rule_groups"
}

// VacationCappingRuleGroupRule is the junction table linking groups to capping rules.
type VacationCappingRuleGroupRule struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID       uuid.UUID `gorm:"type:uuid;not null" json:"group_id"`
	CappingRuleID uuid.UUID `gorm:"type:uuid;not null" json:"capping_rule_id"`
	CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
}

func (VacationCappingRuleGroupRule) TableName() string {
	return "vacation_capping_rule_group_rules"
}
```

### 1.6 GORM Model: EmployeeCappingException

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employeecappingexception.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ExemptionType defines the type of capping exception.
type ExemptionType string

const (
	ExemptionTypeFull    ExemptionType = "full"
	ExemptionTypePartial ExemptionType = "partial"
)

// EmployeeCappingException defines an individual employee exception from capping rules.
// ZMI manual section 20.3.
type EmployeeCappingException struct {
	ID            uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID      uuid.UUID        `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID    uuid.UUID        `gorm:"type:uuid;not null;index" json:"employee_id"`
	CappingRuleID uuid.UUID        `gorm:"type:uuid;not null;index" json:"capping_rule_id"`
	ExemptionType ExemptionType    `gorm:"type:varchar(20);not null" json:"exemption_type"`
	RetainDays    *decimal.Decimal `gorm:"type:decimal(5,2)" json:"retain_days,omitempty"`
	Year          *int             `gorm:"type:int" json:"year,omitempty"`
	Notes         *string          `gorm:"type:text" json:"notes,omitempty"`
	IsActive      bool             `gorm:"default:true" json:"is_active"`
	CreatedAt     time.Time        `gorm:"default:now()" json:"created_at"`
	UpdatedAt     time.Time        `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee    *Employee            `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	CappingRule *VacationCappingRule  `gorm:"foreignKey:CappingRuleID" json:"capping_rule,omitempty"`
}

func (EmployeeCappingException) TableName() string {
	return "employee_capping_exceptions"
}
```

### 1.7 Modify Tariff Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tariff.go` (MODIFY)

Add after the flextime fields section, before the TIMESTAMPS section:

```go
// =====================================================
// ZMI VACATION CAPPING FIELDS (Section 20)
// =====================================================

// VacationCappingRuleGroupID links to the capping rule group for this tariff
// ZMI: Kappungsregelgruppe
VacationCappingRuleGroupID *uuid.UUID `gorm:"type:uuid" json:"vacation_capping_rule_group_id,omitempty"`
```

Add to the Relations section:

```go
VacationCappingRuleGroup *VacationCappingRuleGroup `gorm:"foreignKey:VacationCappingRuleGroupID" json:"vacation_capping_rule_group,omitempty"`
```

### 1.8 Modify VacationBalance Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vacationbalance.go` (MODIFY)

Add after the `Taken` field:

```go
CarryoverExpiresAt *time.Time `gorm:"type:date" json:"carryover_expires_at,omitempty"`
```

### 1.9 Verification Steps

```bash
make migrate-up
cd apps/api && go build ./...
```

---

## Phase 2: OpenAPI Specification

### 2.1 Vacation Capping Rules Schema

**File**: `/home/tolga/projects/terp/api/schemas/vacation-capping-rules.yaml`

```yaml
# Vacation Capping Rule schemas
VacationCappingRule:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
    - rule_type
    - cutoff_month
    - cutoff_day
    - cap_value
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
      example: "YEAR_END_CAP_5"
    name:
      type: string
      example: "Year-End Cap 5 Days"
    description:
      type: string
      x-nullable: true
    rule_type:
      type: string
      enum: [year_end, mid_year]
      description: "year_end: limits carryover at year boundary; mid_year: forfeits prior-year carryover after cutoff date"
      example: "year_end"
    cutoff_month:
      type: integer
      minimum: 1
      maximum: 12
      description: "Month of the cutoff date (1-12)"
      example: 12
    cutoff_day:
      type: integer
      minimum: 1
      maximum: 31
      description: "Day of the cutoff date (1-31)"
      example: 31
    cap_value:
      type: number
      format: double
      minimum: 0
      description: "Maximum days to carry over. 0 forfeits all remaining vacation."
      example: 5.0
    is_active:
      type: boolean
      example: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

VacationCappingRuleSummary:
  type: object
  required:
    - id
    - code
    - name
    - rule_type
    - cap_value
  properties:
    id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
    rule_type:
      type: string
      enum: [year_end, mid_year]
    cutoff_month:
      type: integer
    cutoff_day:
      type: integer
    cap_value:
      type: number
      format: double

CreateVacationCappingRuleRequest:
  type: object
  required:
    - code
    - name
    - rule_type
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 50
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    rule_type:
      type: string
      enum: [year_end, mid_year]
    cutoff_month:
      type: integer
      minimum: 1
      maximum: 12
      default: 12
    cutoff_day:
      type: integer
      minimum: 1
      maximum: 31
      default: 31
    cap_value:
      type: number
      format: double
      minimum: 0
      default: 0

UpdateVacationCappingRuleRequest:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    cutoff_month:
      type: integer
      minimum: 1
      maximum: 12
    cutoff_day:
      type: integer
      minimum: 1
      maximum: 31
    cap_value:
      type: number
      format: double
      minimum: 0
    is_active:
      type: boolean

VacationCappingRuleList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/VacationCappingRule'
```

### 2.2 Vacation Capping Rule Groups Schema

**File**: `/home/tolga/projects/terp/api/schemas/vacation-capping-rule-groups.yaml`

```yaml
# Vacation Capping Rule Group schemas
VacationCappingRuleGroup:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
      example: "STANDARD_CAPPING"
    name:
      type: string
      example: "Standard Capping Group"
    description:
      type: string
      x-nullable: true
    is_active:
      type: boolean
      example: true
    capping_rules:
      type: array
      items:
        $ref: '../schemas/vacation-capping-rules.yaml#/VacationCappingRuleSummary'
      description: "Capping rules linked to this group"
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateVacationCappingRuleGroupRequest:
  type: object
  required:
    - code
    - name
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 50
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    capping_rule_ids:
      type: array
      items:
        type: string
        format: uuid
      description: "IDs of capping rules to link to this group"

UpdateVacationCappingRuleGroupRequest:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    is_active:
      type: boolean
    capping_rule_ids:
      type: array
      items:
        type: string
        format: uuid
      description: "Replace linked capping rules with this set"

VacationCappingRuleGroupList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/VacationCappingRuleGroup'
```

### 2.3 Employee Capping Exceptions Schema

**File**: `/home/tolga/projects/terp/api/schemas/employee-capping-exceptions.yaml`

```yaml
# Employee Capping Exception schemas
EmployeeCappingException:
  type: object
  required:
    - id
    - tenant_id
    - employee_id
    - capping_rule_id
    - exemption_type
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    employee_id:
      type: string
      format: uuid
    capping_rule_id:
      type: string
      format: uuid
    exemption_type:
      type: string
      enum: [full, partial]
      description: "full: employee keeps all vacation; partial: employee keeps up to retain_days"
    retain_days:
      type: number
      format: double
      x-nullable: true
      description: "For partial exemption: max days the employee can retain. NULL for full exemption."
    year:
      type: integer
      x-nullable: true
      description: "Year this exception applies to. NULL means all years."
    notes:
      type: string
      x-nullable: true
    is_active:
      type: boolean
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateEmployeeCappingExceptionRequest:
  type: object
  required:
    - employee_id
    - capping_rule_id
    - exemption_type
  properties:
    employee_id:
      type: string
      format: uuid
    capping_rule_id:
      type: string
      format: uuid
    exemption_type:
      type: string
      enum: [full, partial]
    retain_days:
      type: number
      format: double
      minimum: 0
    year:
      type: integer
    notes:
      type: string

UpdateEmployeeCappingExceptionRequest:
  type: object
  properties:
    exemption_type:
      type: string
      enum: [full, partial]
    retain_days:
      type: number
      format: double
      minimum: 0
    year:
      type: integer
    notes:
      type: string
    is_active:
      type: boolean

EmployeeCappingExceptionList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/EmployeeCappingException'
```

### 2.4 Vacation Carryover Schema

**File**: `/home/tolga/projects/terp/api/schemas/vacation-carryover.yaml`

```yaml
# Vacation Carryover schemas
CarryoverPreviewRequest:
  type: object
  required:
    - year
  properties:
    year:
      type: integer
      description: "Target year to receive carryover (carryover FROM year-1 INTO this year)"
      example: 2027
    employee_ids:
      type: array
      items:
        type: string
        format: uuid
      description: "Optional: limit to specific employees. If empty, processes all employees."
    department_id:
      type: string
      format: uuid
      description: "Optional: limit to employees in a department"

CarryoverPreviewResult:
  type: object
  required:
    - year
    - results
  properties:
    year:
      type: integer
    results:
      type: array
      items:
        $ref: '#/CarryoverEmployeeResult'

CarryoverEmployeeResult:
  type: object
  required:
    - employee_id
    - employee_name
    - previous_year_available
    - carryover_amount
    - forfeited_amount
  properties:
    employee_id:
      type: string
      format: uuid
    employee_name:
      type: string
    previous_year_available:
      type: number
      format: double
      description: "Available vacation days at end of previous year"
    carryover_amount:
      type: number
      format: double
      description: "Amount that will be/was carried over"
    forfeited_amount:
      type: number
      format: double
      description: "Amount forfeited due to capping"
    capping_rule_applied:
      type: string
      x-nullable: true
      description: "Name of the capping rule that was applied"
    exception_applied:
      type: boolean
      description: "Whether an individual exception was applied"
    carryover_expires_at:
      type: string
      format: date
      x-nullable: true
      description: "Date after which carryover expires (from mid-year rule)"

CarryoverApplyRequest:
  type: object
  required:
    - year
  properties:
    year:
      type: integer
      description: "Target year to receive carryover"
      example: 2027
    employee_ids:
      type: array
      items:
        type: string
        format: uuid
      description: "Optional: limit to specific employees"

CarryoverApplyResult:
  type: object
  required:
    - year
    - processed_count
    - results
  properties:
    year:
      type: integer
    processed_count:
      type: integer
    results:
      type: array
      items:
        $ref: '#/CarryoverEmployeeResult'

MidYearCappingApplyRequest:
  type: object
  required:
    - reference_date
  properties:
    reference_date:
      type: string
      format: date
      description: "Date to check mid-year capping against (e.g., 2027-04-01)"
    employee_ids:
      type: array
      items:
        type: string
        format: uuid
```

### 2.5 Paths for Capping Rules

**File**: `/home/tolga/projects/terp/api/paths/vacation-capping-rules.yaml`

```yaml
# Vacation Capping Rule endpoints
/vacation-capping-rules:
  get:
    tags:
      - Vacation Capping Rules
    summary: List vacation capping rules
    operationId: listVacationCappingRules
    parameters:
      - name: active_only
        in: query
        type: boolean
        description: Filter to only active rules
      - name: rule_type
        in: query
        type: string
        enum: [year_end, mid_year]
        description: Filter by rule type
    responses:
      200:
        description: List of vacation capping rules
        schema:
          $ref: '../schemas/vacation-capping-rules.yaml#/VacationCappingRuleList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Vacation Capping Rules
    summary: Create vacation capping rule
    operationId: createVacationCappingRule
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/vacation-capping-rules.yaml#/CreateVacationCappingRuleRequest'
    responses:
      201:
        description: Created vacation capping rule
        schema:
          $ref: '../schemas/vacation-capping-rules.yaml#/VacationCappingRule'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists for this tenant
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/vacation-capping-rules/{id}:
  get:
    tags:
      - Vacation Capping Rules
    summary: Get vacation capping rule by ID
    operationId: getVacationCappingRule
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Vacation capping rule details
        schema:
          $ref: '../schemas/vacation-capping-rules.yaml#/VacationCappingRule'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Vacation Capping Rules
    summary: Update vacation capping rule
    operationId: updateVacationCappingRule
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/vacation-capping-rules.yaml#/UpdateVacationCappingRuleRequest'
    responses:
      200:
        description: Updated vacation capping rule
        schema:
          $ref: '../schemas/vacation-capping-rules.yaml#/VacationCappingRule'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Vacation Capping Rules
    summary: Delete vacation capping rule
    operationId: deleteVacationCappingRule
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Vacation capping rule deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
      409:
        description: Rule is still assigned to capping rule groups
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'
```

### 2.6 Paths for Capping Rule Groups

**File**: `/home/tolga/projects/terp/api/paths/vacation-capping-rule-groups.yaml`

Standard CRUD, same pattern as `vacation-calculation-groups.yaml`. Tag: `Vacation Capping Rule Groups`.

### 2.7 Paths for Employee Capping Exceptions

**File**: `/home/tolga/projects/terp/api/paths/employee-capping-exceptions.yaml`

Standard CRUD with employee_id filter. Tag: `Employee Capping Exceptions`.

### 2.8 Paths for Vacation Carryover

**File**: `/home/tolga/projects/terp/api/paths/vacation-carryover.yaml`

```yaml
# Vacation Carryover endpoints
/vacation-carryover/preview:
  post:
    tags:
      - Vacation Carryover
    summary: Preview carryover results
    description: |
      Calculates carryover amounts for the specified year without persisting.
      Shows what each employee would carry over, what would be forfeited, and which rules apply.
    operationId: previewVacationCarryover
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/vacation-carryover.yaml#/CarryoverPreviewRequest'
    responses:
      200:
        description: Carryover preview results
        schema:
          $ref: '../schemas/vacation-carryover.yaml#/CarryoverPreviewResult'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'

/vacation-carryover/apply:
  post:
    tags:
      - Vacation Carryover
    summary: Apply carryover for a year
    description: |
      Calculates and persists carryover amounts into vacation balances for the target year.
      Applies year-end capping rules and sets carryover_expires_at for mid-year rules.
    operationId: applyVacationCarryover
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/vacation-carryover.yaml#/CarryoverApplyRequest'
    responses:
      200:
        description: Carryover applied successfully
        schema:
          $ref: '../schemas/vacation-carryover.yaml#/CarryoverApplyResult'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'

/vacation-carryover/apply-mid-year:
  post:
    tags:
      - Vacation Carryover
    summary: Apply mid-year capping
    description: |
      Checks and applies mid-year capping rules. For employees whose carryover_expires_at
      has passed, sets the carryover to zero (or adjusted amount per exceptions).
    operationId: applyMidYearCapping
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/vacation-carryover.yaml#/MidYearCappingApplyRequest'
    responses:
      200:
        description: Mid-year capping applied
        schema:
          $ref: '../schemas/vacation-carryover.yaml#/CarryoverApplyResult'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
```

### 2.9 Update `api/openapi.yaml`

**Modify**: `/home/tolga/projects/terp/api/openapi.yaml`

Add tags (after "Vacation Calculation Groups" tag):
```yaml
  - name: Vacation Capping Rules
    description: Vacation capping rule definitions (Kappungsregeln)
  - name: Vacation Capping Rule Groups
    description: Groups of vacation capping rules for assignment to tariffs
  - name: Employee Capping Exceptions
    description: Individual employee exceptions from capping rules
  - name: Vacation Carryover
    description: Vacation carryover preview and application
```

Add path references (after vacation-entitlement paths):
```yaml
  # Vacation Capping Rules
  /vacation-capping-rules:
    $ref: 'paths/vacation-capping-rules.yaml#/~1vacation-capping-rules'
  /vacation-capping-rules/{id}:
    $ref: 'paths/vacation-capping-rules.yaml#/~1vacation-capping-rules~1{id}'

  # Vacation Capping Rule Groups
  /vacation-capping-rule-groups:
    $ref: 'paths/vacation-capping-rule-groups.yaml#/~1vacation-capping-rule-groups'
  /vacation-capping-rule-groups/{id}:
    $ref: 'paths/vacation-capping-rule-groups.yaml#/~1vacation-capping-rule-groups~1{id}'

  # Employee Capping Exceptions
  /employee-capping-exceptions:
    $ref: 'paths/employee-capping-exceptions.yaml#/~1employee-capping-exceptions'
  /employee-capping-exceptions/{id}:
    $ref: 'paths/employee-capping-exceptions.yaml#/~1employee-capping-exceptions~1{id}'

  # Vacation Carryover
  /vacation-carryover/preview:
    $ref: 'paths/vacation-carryover.yaml#/~1vacation-carryover~1preview'
  /vacation-carryover/apply:
    $ref: 'paths/vacation-carryover.yaml#/~1vacation-carryover~1apply'
  /vacation-carryover/apply-mid-year:
    $ref: 'paths/vacation-carryover.yaml#/~1vacation-carryover~1apply-mid-year'
```

Add definition references (after VacationEntitlementPreview):
```yaml
  # Vacation Capping Rules
  VacationCappingRule:
    $ref: 'schemas/vacation-capping-rules.yaml#/VacationCappingRule'
  VacationCappingRuleSummary:
    $ref: 'schemas/vacation-capping-rules.yaml#/VacationCappingRuleSummary'
  CreateVacationCappingRuleRequest:
    $ref: 'schemas/vacation-capping-rules.yaml#/CreateVacationCappingRuleRequest'
  UpdateVacationCappingRuleRequest:
    $ref: 'schemas/vacation-capping-rules.yaml#/UpdateVacationCappingRuleRequest'
  VacationCappingRuleList:
    $ref: 'schemas/vacation-capping-rules.yaml#/VacationCappingRuleList'

  # Vacation Capping Rule Groups
  VacationCappingRuleGroup:
    $ref: 'schemas/vacation-capping-rule-groups.yaml#/VacationCappingRuleGroup'
  CreateVacationCappingRuleGroupRequest:
    $ref: 'schemas/vacation-capping-rule-groups.yaml#/CreateVacationCappingRuleGroupRequest'
  UpdateVacationCappingRuleGroupRequest:
    $ref: 'schemas/vacation-capping-rule-groups.yaml#/UpdateVacationCappingRuleGroupRequest'
  VacationCappingRuleGroupList:
    $ref: 'schemas/vacation-capping-rule-groups.yaml#/VacationCappingRuleGroupList'

  # Employee Capping Exceptions
  EmployeeCappingException:
    $ref: 'schemas/employee-capping-exceptions.yaml#/EmployeeCappingException'
  CreateEmployeeCappingExceptionRequest:
    $ref: 'schemas/employee-capping-exceptions.yaml#/CreateEmployeeCappingExceptionRequest'
  UpdateEmployeeCappingExceptionRequest:
    $ref: 'schemas/employee-capping-exceptions.yaml#/UpdateEmployeeCappingExceptionRequest'
  EmployeeCappingExceptionList:
    $ref: 'schemas/employee-capping-exceptions.yaml#/EmployeeCappingExceptionList'

  # Vacation Carryover
  CarryoverPreviewRequest:
    $ref: 'schemas/vacation-carryover.yaml#/CarryoverPreviewRequest'
  CarryoverPreviewResult:
    $ref: 'schemas/vacation-carryover.yaml#/CarryoverPreviewResult'
  CarryoverEmployeeResult:
    $ref: 'schemas/vacation-carryover.yaml#/CarryoverEmployeeResult'
  CarryoverApplyRequest:
    $ref: 'schemas/vacation-carryover.yaml#/CarryoverApplyRequest'
  CarryoverApplyResult:
    $ref: 'schemas/vacation-carryover.yaml#/CarryoverApplyResult'
  MidYearCappingApplyRequest:
    $ref: 'schemas/vacation-carryover.yaml#/MidYearCappingApplyRequest'
```

### 2.10 Generate Models & Verification

```bash
make swagger-bundle
make generate
cd apps/api && go build ./...
```

---

## Phase 3: Repository Layer

### 3.1 VacationCappingRule Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationcappingrule.go`

```go
package repository

// VacationCappingRuleRepository handles vacation capping rule data access.
type VacationCappingRuleRepository struct {
	db *DB
}

func NewVacationCappingRuleRepository(db *DB) *VacationCappingRuleRepository

// Create creates a new capping rule.
// Uses Select to specify columns: TenantID, Code, Name, Description, RuleType, CutoffMonth, CutoffDay, CapValue, IsActive.
func (r *VacationCappingRuleRepository) Create(ctx, rule *model.VacationCappingRule) error

// GetByID retrieves a capping rule by ID.
func (r *VacationCappingRuleRepository) GetByID(ctx, id uuid.UUID) (*model.VacationCappingRule, error)

// GetByCode retrieves a capping rule by tenant + code.
func (r *VacationCappingRuleRepository) GetByCode(ctx, tenantID uuid.UUID, code string) (*model.VacationCappingRule, error)

// List retrieves all capping rules for a tenant. Ordered by code ASC.
func (r *VacationCappingRuleRepository) List(ctx, tenantID uuid.UUID) ([]model.VacationCappingRule, error)

// ListActive retrieves only active capping rules for a tenant.
func (r *VacationCappingRuleRepository) ListActive(ctx, tenantID uuid.UUID) ([]model.VacationCappingRule, error)

// ListByType retrieves capping rules of a specific type for a tenant.
func (r *VacationCappingRuleRepository) ListByType(ctx, tenantID uuid.UUID, ruleType string) ([]model.VacationCappingRule, error)

// ListByIDs retrieves capping rules by a slice of IDs.
func (r *VacationCappingRuleRepository) ListByIDs(ctx, ids []uuid.UUID) ([]model.VacationCappingRule, error)

// Update saves changes to a capping rule.
func (r *VacationCappingRuleRepository) Update(ctx, rule *model.VacationCappingRule) error

// Delete deletes a capping rule by ID.
func (r *VacationCappingRuleRepository) Delete(ctx, id uuid.UUID) error

// CountGroupUsages counts how many capping rule groups reference this rule.
func (r *VacationCappingRuleRepository) CountGroupUsages(ctx, ruleID uuid.UUID) (int64, error)
```

### 3.2 VacationCappingRuleGroup Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationcappingrulegroup.go`

```go
package repository

// VacationCappingRuleGroupRepository handles vacation capping rule group data access.
type VacationCappingRuleGroupRepository struct {
	db *DB
}

func NewVacationCappingRuleGroupRepository(db *DB) *VacationCappingRuleGroupRepository

// Create creates a new capping rule group.
func (r *VacationCappingRuleGroupRepository) Create(ctx, group *model.VacationCappingRuleGroup) error

// GetByID retrieves a group by ID, preloading CappingRules.
func (r *VacationCappingRuleGroupRepository) GetByID(ctx, id uuid.UUID) (*model.VacationCappingRuleGroup, error)

// GetByCode retrieves a group by tenant + code.
func (r *VacationCappingRuleGroupRepository) GetByCode(ctx, tenantID uuid.UUID, code string) (*model.VacationCappingRuleGroup, error)

// List retrieves all groups for a tenant, preloading CappingRules.
func (r *VacationCappingRuleGroupRepository) List(ctx, tenantID uuid.UUID) ([]model.VacationCappingRuleGroup, error)

// ListActive retrieves only active groups.
func (r *VacationCappingRuleGroupRepository) ListActive(ctx, tenantID uuid.UUID) ([]model.VacationCappingRuleGroup, error)

// Update saves changes to a group.
func (r *VacationCappingRuleGroupRepository) Update(ctx, group *model.VacationCappingRuleGroup) error

// Delete deletes a group by ID.
func (r *VacationCappingRuleGroupRepository) Delete(ctx, id uuid.UUID) error

// CountTariffUsages counts how many tariffs reference this group.
func (r *VacationCappingRuleGroupRepository) CountTariffUsages(ctx, groupID uuid.UUID) (int64, error)

// ReplaceCappingRules replaces the group's capping rule links (within transaction).
func (r *VacationCappingRuleGroupRepository) ReplaceCappingRules(ctx, groupID uuid.UUID, ruleIDs []uuid.UUID) error
```

### 3.3 EmployeeCappingException Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/employeecappingexception.go`

```go
package repository

// EmployeeCappingExceptionRepository handles employee capping exception data access.
type EmployeeCappingExceptionRepository struct {
	db *DB
}

func NewEmployeeCappingExceptionRepository(db *DB) *EmployeeCappingExceptionRepository

// Create creates a new exception.
func (r *EmployeeCappingExceptionRepository) Create(ctx, exc *model.EmployeeCappingException) error

// GetByID retrieves an exception by ID.
func (r *EmployeeCappingExceptionRepository) GetByID(ctx, id uuid.UUID) (*model.EmployeeCappingException, error)

// List retrieves all exceptions for a tenant.
func (r *EmployeeCappingExceptionRepository) List(ctx, tenantID uuid.UUID) ([]model.EmployeeCappingException, error)

// ListByEmployee retrieves exceptions for a specific employee.
func (r *EmployeeCappingExceptionRepository) ListByEmployee(ctx, employeeID uuid.UUID) ([]model.EmployeeCappingException, error)

// ListByEmployeeAndRule retrieves exceptions for employee + rule combination, optionally filtered by year.
func (r *EmployeeCappingExceptionRepository) ListByEmployeeAndRule(ctx, employeeID, ruleID uuid.UUID, year *int) ([]model.EmployeeCappingException, error)

// GetActiveForEmployeeRuleYear returns the active exception for a specific employee, rule, and year.
// Checks both year-specific exceptions (year = given year) and general exceptions (year IS NULL).
func (r *EmployeeCappingExceptionRepository) GetActiveForEmployeeRuleYear(ctx, employeeID, ruleID uuid.UUID, year int) (*model.EmployeeCappingException, error)

// Update saves changes to an exception.
func (r *EmployeeCappingExceptionRepository) Update(ctx, exc *model.EmployeeCappingException) error

// Delete deletes an exception by ID.
func (r *EmployeeCappingExceptionRepository) Delete(ctx, id uuid.UUID) error
```

### 3.4 Verification Steps

```bash
cd apps/api && go build ./internal/repository/...
```

---

## Phase 4: Service Layer

### 4.1 VacationCappingRule Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacationcappingrule.go`

```go
package service

// Errors
var (
	ErrCappingRuleNotFound       = errors.New("vacation capping rule not found")
	ErrCappingRuleCodeRequired   = errors.New("capping rule code is required")
	ErrCappingRuleNameRequired   = errors.New("capping rule name is required")
	ErrCappingRuleCodeExists     = errors.New("capping rule code already exists for this tenant")
	ErrCappingRuleTypeRequired   = errors.New("capping rule type is required")
	ErrCappingRuleTypeInvalid    = errors.New("capping rule type must be year_end or mid_year")
	ErrCappingRuleInvalidCutoff  = errors.New("cutoff month must be 1-12 and day must be 1-31")
	ErrCappingRuleInvalidCap     = errors.New("cap value must be >= 0")
	ErrCappingRuleInUse          = errors.New("capping rule is assigned to capping rule groups")
)

// Repository interface
type cappingRuleRepoForService interface {
	Create(ctx context.Context, rule *model.VacationCappingRule) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRule, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCappingRule, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error)
	ListByType(ctx context.Context, tenantID uuid.UUID, ruleType string) ([]model.VacationCappingRule, error)
	Update(ctx context.Context, rule *model.VacationCappingRule) error
	Delete(ctx context.Context, id uuid.UUID) error
	CountGroupUsages(ctx context.Context, ruleID uuid.UUID) (int64, error)
}

// Input types
type CreateCappingRuleInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description *string
	RuleType    string // "year_end" or "mid_year"
	CutoffMonth int
	CutoffDay   int
	CapValue    float64
}

type UpdateCappingRuleInput struct {
	Name        *string
	Description *string
	CutoffMonth *int
	CutoffDay   *int
	CapValue    *float64
	IsActive    *bool
}

// Service
type VacationCappingRuleService struct {
	repo cappingRuleRepoForService
}

func NewVacationCappingRuleService(repo cappingRuleRepoForService) *VacationCappingRuleService
```

**Methods**: Create, GetByID, List, ListActive, Update, Delete -- following the exact same pattern as VacationSpecialCalcService.

### 4.2 VacationCappingRuleGroup Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacationcappingrulegroup.go`

```go
package service

// Errors
var (
	ErrCappingRuleGroupNotFound     = errors.New("vacation capping rule group not found")
	ErrCappingRuleGroupCodeRequired = errors.New("capping rule group code is required")
	ErrCappingRuleGroupNameRequired = errors.New("capping rule group name is required")
	ErrCappingRuleGroupCodeExists   = errors.New("capping rule group code already exists for this tenant")
	ErrCappingRuleGroupInUse        = errors.New("capping rule group is assigned to tariffs")
	ErrCappingRuleIDNotFound        = errors.New("one or more capping rule IDs not found")
)

// Service follows same pattern as VacationCalcGroupService
type VacationCappingRuleGroupService struct {
	groupRepo cappingRuleGroupRepoForService
	ruleRepo  cappingRuleRepoForGroupService
}

func NewVacationCappingRuleGroupService(
	groupRepo cappingRuleGroupRepoForService,
	ruleRepo cappingRuleRepoForGroupService,
) *VacationCappingRuleGroupService
```

**Methods**: Create, GetByID, List, ListActive, Update, Delete -- following VacationCalcGroupService pattern.

- `Delete` checks `CountTariffUsages > 0` before allowing deletion.
- `Create`/`Update` with `capping_rule_ids` validates IDs exist via `ruleRepo.ListByIDs` and calls `ReplaceCappingRules`.

### 4.3 EmployeeCappingException Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/employeecappingexception.go`

```go
package service

// Errors
var (
	ErrCappingExceptionNotFound           = errors.New("employee capping exception not found")
	ErrCappingExceptionEmployeeRequired   = errors.New("employee_id is required")
	ErrCappingExceptionRuleRequired       = errors.New("capping_rule_id is required")
	ErrCappingExceptionTypeRequired       = errors.New("exemption_type is required")
	ErrCappingExceptionTypeInvalid        = errors.New("exemption_type must be full or partial")
	ErrCappingExceptionRetainRequired     = errors.New("retain_days is required for partial exemption")
	ErrCappingExceptionDuplicate          = errors.New("exception already exists for this employee, rule, and year")
)

type EmployeeCappingExceptionService struct {
	repo     employeeCappingExceptionRepoForService
	empRepo  employeeRepoForExceptionService
	ruleRepo cappingRuleRepoForExceptionService
}
```

**Methods**: Create, GetByID, List, ListByEmployee, Update, Delete.

### 4.4 Carryover Calculation Logic

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/vacation_capping.go`

This is the core calculation logic for carryover with capping.

```go
package calculation

import (
	"time"

	"github.com/shopspring/decimal"
)

// CappingRuleInput represents a single capping rule for carryover calculation.
type CappingRuleInput struct {
	RuleType    string          // "year_end" or "mid_year"
	CutoffMonth int
	CutoffDay   int
	CapValue    decimal.Decimal // 0 = forfeit all, >0 = cap at this
	RuleName    string          // For reporting
}

// CappingExceptionInput represents an individual exception for an employee.
type CappingExceptionInput struct {
	ExemptionType string           // "full" or "partial"
	RetainDays    *decimal.Decimal // For partial exemption
}

// CarryoverCalcInput contains all data needed for carryover calculation.
type CarryoverCalcInput struct {
	AvailableDays    decimal.Decimal    // Remaining vacation from previous year
	CappingRules     []CappingRuleInput // Applicable capping rules (from group)
	Exception        *CappingExceptionInput // Employee-specific exception (for year_end rule)
	Year             int                // Target year (receiving carryover)
}

// CarryoverCalcOutput contains the results of carryover calculation.
type CarryoverCalcOutput struct {
	CarryoverAmount    decimal.Decimal // Final carryover amount
	ForfeitedAmount    decimal.Decimal // Amount forfeited
	CappingRuleApplied string          // Name of the rule that limited carryover (empty if none)
	ExceptionApplied   bool            // Whether an exception was used
	CarryoverExpiresAt *time.Time      // Mid-year expiry date (nil if no mid-year rule)
}

// CalculateCarryoverWithCapping computes the carryover amount applying capping rules.
//
// Algorithm:
//   1. Start with available days from previous year (if <= 0, carryover = 0)
//   2. Find applicable year_end capping rule (if any)
//   3. Apply year_end cap: carryover = min(available, cap_value)
//      - If cap_value == 0, carryover = 0 (forfeit all)
//      - Check for employee exception:
//        - full exemption: bypass capping entirely
//        - partial exemption: carryover = min(available, retain_days)
//   4. Find applicable mid_year capping rule (if any)
//      - Set CarryoverExpiresAt = cutoff date in target year
//      - (Mid-year forfeiture is applied separately via ApplyMidYearCapping)
//   5. Return result with carryover amount, forfeited amount, rule name, expiry
func CalculateCarryoverWithCapping(input CarryoverCalcInput) CarryoverCalcOutput
```

```go
// MidYearCappingInput contains data for mid-year capping evaluation.
type MidYearCappingInput struct {
	CurrentCarryover   decimal.Decimal    // Current carryover amount in balance
	CarryoverExpiresAt *time.Time         // Expiry date from balance
	ReferenceDate      time.Time          // Date to check against (today)
	Exception          *CappingExceptionInput // Employee exception for this rule
}

// MidYearCappingOutput contains the result of mid-year evaluation.
type MidYearCappingOutput struct {
	NewCarryover    decimal.Decimal // Updated carryover (0 if expired, or partial per exception)
	ForfeitedAmount decimal.Decimal // Amount forfeited
	WasApplied      bool            // Whether capping was actually applied (expiry passed)
}

// ApplyMidYearCapping checks if the mid-year cutoff has passed and forfeits carryover.
//
// Algorithm:
//   1. If CarryoverExpiresAt is nil, no mid-year rule applies -> return unchanged
//   2. If ReferenceDate is on or after CarryoverExpiresAt:
//      - Check exception: full -> keep all; partial -> keep min(current, retain_days)
//      - Otherwise: forfeit all prior-year carryover (set to 0)
//   3. If ReferenceDate is before CarryoverExpiresAt: return unchanged
func ApplyMidYearCapping(input MidYearCappingInput) MidYearCappingOutput
```

### 4.5 Carryover Service (Enhanced VacationService)

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation.go` (MODIFY)

#### 4.5.1 Add new repository interfaces

```go
// cappingRuleGroupRepoForVacation defines the interface for capping rule group data.
type cappingRuleGroupRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRuleGroup, error)
}

// employeeCappingExceptionRepoForVacation defines the interface for employee capping exceptions.
type employeeCappingExceptionRepoForVacation interface {
	GetActiveForEmployeeRuleYear(ctx context.Context, employeeID, ruleID uuid.UUID, year int) (*model.EmployeeCappingException, error)
}

// vacationBalanceListRepoForVacation adds batch listing for carryover operations.
type vacationBalanceListRepoForVacation interface {
	ListByYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.VacationBalance, error)
}
```

#### 4.5.2 Add fields to VacationService struct

```go
cappingRuleGroupRepo     cappingRuleGroupRepoForVacation       // NEW
cappingExceptionRepo     employeeCappingExceptionRepoForVacation // NEW
```

Update `NewVacationService` to accept these new dependencies. Keep `defaultMaxCarryover` for backward compatibility but it will be superseded by capping rules when present.

#### 4.5.3 Add `resolveCappingRules` method

```go
// resolveCappingRules resolves the applicable capping rules for an employee.
// Resolution: Employee -> TariffID -> Tariff.VacationCappingRuleGroupID -> Group.CappingRules
func (s *VacationService) resolveCappingRules(ctx context.Context, employee *model.Employee) []model.VacationCappingRule
```

Logic:
1. If employee.TariffID is nil, return nil
2. Load tariff
3. If tariff.VacationCappingRuleGroupID is nil, return nil
4. Load capping rule group (which preloads CappingRules)
5. Return group.CappingRules

#### 4.5.4 Rewrite `CarryoverFromPreviousYear` to use capping rules

```go
// CarryoverFromPreviousYear carries over remaining vacation from the previous year.
// The year parameter is the TARGET year (receiving the carryover).
// Applies capping rules from the employee's tariff capping rule group.
// Falls back to defaultMaxCarryover if no capping rules are configured.
func (s *VacationService) CarryoverFromPreviousYear(ctx context.Context, employeeID uuid.UUID, year int) (*CarryoverResult, error)
```

This method now:
1. Gets employee + previous year balance
2. Resolves capping rules from employee's tariff
3. For each applicable rule, checks for employee-specific exceptions
4. Calls `calculation.CalculateCarryoverWithCapping()`
5. Sets `currentBalance.Carryover` and `currentBalance.CarryoverExpiresAt`
6. Upserts the balance
7. Returns a structured result with details

#### 4.5.5 Add `PreviewCarryover` method

```go
// PreviewCarryoverInput represents input for carryover preview.
type PreviewCarryoverInput struct {
	TenantID    uuid.UUID
	Year        int
	EmployeeIDs []uuid.UUID // Empty = all employees
}

// CarryoverResult represents the result for a single employee.
type CarryoverResult struct {
	EmployeeID           uuid.UUID
	EmployeeName         string
	PreviousYearAvailable decimal.Decimal
	CarryoverAmount      decimal.Decimal
	ForfeitedAmount      decimal.Decimal
	CappingRuleApplied   string
	ExceptionApplied     bool
	CarryoverExpiresAt   *time.Time
}

// PreviewCarryover calculates carryover for multiple employees without persisting.
func (s *VacationService) PreviewCarryover(ctx context.Context, input PreviewCarryoverInput) ([]CarryoverResult, error)
```

Logic:
1. Load employees (all for tenant, or filtered by IDs)
2. For each employee:
   a. Get previous year balance
   b. Resolve capping rules
   c. Check for exceptions
   d. Call `CalculateCarryoverWithCapping`
   e. Build result
3. Return all results

#### 4.5.6 Add `ApplyCarryover` method

```go
// ApplyCarryover calculates and persists carryover for multiple employees.
func (s *VacationService) ApplyCarryover(ctx context.Context, input PreviewCarryoverInput) ([]CarryoverResult, error)
```

Same logic as PreviewCarryover, but also persists each result via `vacationBalanceRepo.Upsert`.

#### 4.5.7 Add `ApplyMidYearCapping` method

```go
// ApplyMidYearCappingInput represents input for mid-year capping.
type ApplyMidYearCappingInput struct {
	TenantID      uuid.UUID
	ReferenceDate time.Time
	EmployeeIDs   []uuid.UUID // Empty = all employees
}

// ApplyMidYearCapping checks and applies mid-year capping for employees.
// For each employee whose carryover_expires_at has passed, sets carryover to 0
// (or adjusted amount per exceptions).
func (s *VacationService) ApplyMidYearCapping(ctx context.Context, input ApplyMidYearCappingInput) ([]CarryoverResult, error)
```

Logic:
1. Load current year balances where `carryover_expires_at IS NOT NULL`
2. For each balance where `reference_date >= carryover_expires_at`:
   a. Check for employee exception
   b. Call `calculation.ApplyMidYearCapping`
   c. Update balance: set `Carryover = newCarryover`, clear `CarryoverExpiresAt`
   d. Build result
3. Return results

### 4.6 VacationBalance Repository Extension

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationbalance.go` (MODIFY)

Add new methods:

```go
// ListByYear retrieves all vacation balances for a tenant and year.
func (r *VacationBalanceRepository) ListByYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.VacationBalance, error)

// ListWithExpiredCarryover retrieves balances where carryover_expires_at <= referenceDate.
func (r *VacationBalanceRepository) ListWithExpiredCarryover(ctx context.Context, tenantID uuid.UUID, referenceDate time.Time) ([]model.VacationBalance, error)
```

### 4.7 Business Logic Details

#### Year-End Capping

Per ZMI Section 20.1:
- At year-end, remaining vacation (Available() = Total() - Taken) is evaluated
- A year_end capping rule with `cap_value = 0` forfeits everything (carryover = 0)
- A year_end capping rule with `cap_value = 5` means: carryover = min(available, 5)
- If no capping rule applies (no group on tariff, or no year_end rule in group): carryover = available (unlimited)
- Test case: remaining=8, cap=5 -> carryover=5

#### Mid-Year Capping

Per ZMI Section 20.2:
- A mid_year capping rule specifies a cutoff date (e.g., March 31)
- After the cutoff date, the carryover from the previous year is forfeited
- This only affects the `Carryover` field, not the current year's Entitlement
- The `carryover_expires_at` field on VacationBalance tracks when this happens
- During year-end carryover, if a mid_year rule exists, `carryover_expires_at` is set to the cutoff date
- When `ApplyMidYearCapping` is called (e.g., on April 1), balances with expired carryover have their Carryover set to 0
- Test case: prior-year carryover=3, cutoff=03-31, date=04-01 -> carryover forfeited to 0

#### Individual Exceptions

Per ZMI Section 20.3:
- Full exemption: employee bypasses the capping rule entirely, keeps all vacation
- Partial exemption: employee retains up to `retain_days` despite capping (acts as a personal cap override)
- Exceptions can be for a specific year or permanent (year = NULL)
- Resolution: check year-specific first, then permanent

#### No Rule Applied

- If employee's tariff has no VacationCappingRuleGroupID, no capping is applied
- Carryover = available (unlimited, or limited by defaultMaxCarryover for backward compatibility)
- Test case: remaining=8, no capping rule -> carryover=8

### 4.8 Verification Steps

```bash
cd apps/api && go build ./internal/service/...
cd apps/api && go build ./internal/calculation/...
```

---

## Phase 5: Handler Layer

### 5.1 VacationCappingRule Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationcappingrule.go`

```go
package handler

// VacationCappingRuleHandler handles vacation capping rule HTTP requests.
type VacationCappingRuleHandler struct {
	svc          *service.VacationCappingRuleService
	auditService *service.AuditLogService
}

func NewVacationCappingRuleHandler(svc *service.VacationCappingRuleService) *VacationCappingRuleHandler
func (h *VacationCappingRuleHandler) SetAuditService(s *service.AuditLogService)

// List handles GET /vacation-capping-rules
// Supports query params: active_only (bool), rule_type (string)
func (h *VacationCappingRuleHandler) List(w http.ResponseWriter, r *http.Request)

// Get handles GET /vacation-capping-rules/{id}
func (h *VacationCappingRuleHandler) Get(w http.ResponseWriter, r *http.Request)

// Create handles POST /vacation-capping-rules
func (h *VacationCappingRuleHandler) Create(w http.ResponseWriter, r *http.Request)

// Update handles PATCH /vacation-capping-rules/{id}
func (h *VacationCappingRuleHandler) Update(w http.ResponseWriter, r *http.Request)

// Delete handles DELETE /vacation-capping-rules/{id}
func (h *VacationCappingRuleHandler) Delete(w http.ResponseWriter, r *http.Request)
```

Error mapping:
- `ErrCappingRuleNotFound` -> 404
- `ErrCappingRuleCodeRequired` / `ErrCappingRuleNameRequired` / `ErrCappingRuleTypeRequired` / `ErrCappingRuleTypeInvalid` / `ErrCappingRuleInvalidCutoff` / `ErrCappingRuleInvalidCap` -> 400
- `ErrCappingRuleCodeExists` -> 409
- `ErrCappingRuleInUse` -> 409

### 5.2 VacationCappingRuleGroup Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationcappingrulegroup.go`

Same pattern as `vacationcalcgroup.go`. CRUD handler with nested capping rule summaries in response.

### 5.3 EmployeeCappingException Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/employeecappingexception.go`

CRUD handler. Supports employee_id query filter on List.

### 5.4 Vacation Carryover Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationcarryover.go`

```go
package handler

// VacationCarryoverHandler handles vacation carryover operations.
type VacationCarryoverHandler struct {
	vacationService *service.VacationService
	auditService    *service.AuditLogService
}

func NewVacationCarryoverHandler(svc *service.VacationService) *VacationCarryoverHandler
func (h *VacationCarryoverHandler) SetAuditService(s *service.AuditLogService)

// PreviewCarryover handles POST /vacation-carryover/preview
// Decodes gen/models.CarryoverPreviewRequest, calls service.PreviewCarryover
func (h *VacationCarryoverHandler) PreviewCarryover(w http.ResponseWriter, r *http.Request)

// ApplyCarryover handles POST /vacation-carryover/apply
// Decodes gen/models.CarryoverApplyRequest, calls service.ApplyCarryover
func (h *VacationCarryoverHandler) ApplyCarryover(w http.ResponseWriter, r *http.Request)

// ApplyMidYearCapping handles POST /vacation-carryover/apply-mid-year
// Decodes gen/models.MidYearCappingApplyRequest, calls service.ApplyMidYearCapping
func (h *VacationCarryoverHandler) ApplyMidYearCapping(w http.ResponseWriter, r *http.Request)
```

### 5.5 Route Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (MODIFY)

Add:

```go
// RegisterVacationCappingRuleRoutes registers vacation capping rule routes.
func RegisterVacationCappingRuleRoutes(r chi.Router, h *VacationCappingRuleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/vacation-capping-rules", func(r chi.Router) {
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

// RegisterVacationCappingRuleGroupRoutes registers vacation capping rule group routes.
func RegisterVacationCappingRuleGroupRoutes(r chi.Router, h *VacationCappingRuleGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/vacation-capping-rule-groups", func(r chi.Router) {
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

// RegisterEmployeeCappingExceptionRoutes registers employee capping exception routes.
func RegisterEmployeeCappingExceptionRoutes(r chi.Router, h *EmployeeCappingExceptionHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/employee-capping-exceptions", func(r chi.Router) {
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

// RegisterVacationCarryoverRoutes registers vacation carryover routes.
func RegisterVacationCarryoverRoutes(r chi.Router, h *VacationCarryoverHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	if authz == nil {
		r.Post("/vacation-carryover/preview", h.PreviewCarryover)
		r.Post("/vacation-carryover/apply", h.ApplyCarryover)
		r.Post("/vacation-carryover/apply-mid-year", h.ApplyMidYearCapping)
		return
	}
	r.With(authz.RequirePermission(permManage)).Post("/vacation-carryover/preview", h.PreviewCarryover)
	r.With(authz.RequirePermission(permManage)).Post("/vacation-carryover/apply", h.ApplyCarryover)
	r.With(authz.RequirePermission(permManage)).Post("/vacation-carryover/apply-mid-year", h.ApplyMidYearCapping)
}
```

### 5.6 main.go Wiring

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go` (MODIFY)

Add after the vacationCalcGroupHandler wiring:

```go
// Vacation capping rules
cappingRuleRepo := repository.NewVacationCappingRuleRepository(db)
cappingRuleService := service.NewVacationCappingRuleService(cappingRuleRepo)
cappingRuleHandler := handler.NewVacationCappingRuleHandler(cappingRuleService)

// Vacation capping rule groups
cappingRuleGroupRepo := repository.NewVacationCappingRuleGroupRepository(db)
cappingRuleGroupService := service.NewVacationCappingRuleGroupService(cappingRuleGroupRepo, cappingRuleRepo)
cappingRuleGroupHandler := handler.NewVacationCappingRuleGroupHandler(cappingRuleGroupService)

// Employee capping exceptions
cappingExceptionRepo := repository.NewEmployeeCappingExceptionRepository(db)
cappingExceptionService := service.NewEmployeeCappingExceptionService(cappingExceptionRepo, employeeRepo, cappingRuleRepo)
cappingExceptionHandler := handler.NewEmployeeCappingExceptionHandler(cappingExceptionService)
```

Update the existing VacationService construction to pass new repos:
```go
vacationService := service.NewVacationService(
	vacationBalanceRepo,
	absenceDayRepo,
	absenceTypeRepo,
	employeeRepo,
	tenantRepo,
	tariffRepo,
	employmentTypeRepo,
	vacationCalcGroupRepo,
	cappingRuleGroupRepo,     // NEW
	cappingExceptionRepo,     // NEW
	decimal.Zero,
)
```

Create carryover handler:
```go
vacationCarryoverHandler := handler.NewVacationCarryoverHandler(vacationService)
```

Add route registrations in the tenant-scoped route group:
```go
handler.RegisterVacationCappingRuleRoutes(r, cappingRuleHandler, authzMiddleware)
handler.RegisterVacationCappingRuleGroupRoutes(r, cappingRuleGroupHandler, authzMiddleware)
handler.RegisterEmployeeCappingExceptionRoutes(r, cappingExceptionHandler, authzMiddleware)
handler.RegisterVacationCarryoverRoutes(r, vacationCarryoverHandler, authzMiddleware)
```

Wire audit service:
```go
cappingRuleHandler.SetAuditService(auditLogService)
cappingRuleGroupHandler.SetAuditService(auditLogService)
cappingExceptionHandler.SetAuditService(auditLogService)
vacationCarryoverHandler.SetAuditService(auditLogService)
```

### 5.7 Verification Steps

```bash
cd apps/api && go build ./...
make swagger-bundle
```

---

## Phase 6: Tests

### 6.1 Calculation Tests: Carryover with Capping

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/vacation_capping_test.go`

```go
// Test cases from ticket:

func TestCalculateCarryoverWithCapping_YearEndCap(t *testing.T)
	// Input: available=8, year_end rule cap_value=5
	// Expected: carryover=5, forfeited=3

func TestCalculateCarryoverWithCapping_YearEndForfeitAll(t *testing.T)
	// Input: available=8, year_end rule cap_value=0
	// Expected: carryover=0, forfeited=8

func TestCalculateCarryoverWithCapping_NoRule(t *testing.T)
	// Input: available=8, no capping rules
	// Expected: carryover=8, forfeited=0

func TestCalculateCarryoverWithCapping_NegativeAvailable(t *testing.T)
	// Input: available=-2 (deficit), any rule
	// Expected: carryover=0, forfeited=0

func TestCalculateCarryoverWithCapping_FullExemption(t *testing.T)
	// Input: available=8, year_end cap=5, full exemption
	// Expected: carryover=8 (exempted from capping)

func TestCalculateCarryoverWithCapping_PartialExemption(t *testing.T)
	// Input: available=8, year_end cap=5, partial exemption retain=7
	// Expected: carryover=7 (partial override)

func TestCalculateCarryoverWithCapping_PartialExemptionLessThanAvailable(t *testing.T)
	// Input: available=8, year_end cap=5, partial exemption retain=6
	// Expected: carryover=6

func TestCalculateCarryoverWithCapping_MidYearSetExpiry(t *testing.T)
	// Input: available=8, mid_year rule cutoff=3/31
	// Expected: carryover=8, carryover_expires_at=2027-03-31

func TestCalculateCarryoverWithCapping_BothRules(t *testing.T)
	// Input: available=10, year_end cap=5, mid_year cutoff=3/31
	// Expected: carryover=5, carryover_expires_at=2027-03-31

func TestApplyMidYearCapping_Expired(t *testing.T)
	// Input: carryover=5, expires_at=2027-03-31, reference_date=2027-04-01
	// Expected: carryover=0, forfeited=5

func TestApplyMidYearCapping_NotExpired(t *testing.T)
	// Input: carryover=5, expires_at=2027-03-31, reference_date=2027-03-15
	// Expected: carryover=5 (unchanged)

func TestApplyMidYearCapping_NoExpiry(t *testing.T)
	// Input: carryover=5, expires_at=nil
	// Expected: carryover=5 (unchanged)

func TestApplyMidYearCapping_ExpiredWithFullExemption(t *testing.T)
	// Input: carryover=5, expired, full exemption
	// Expected: carryover=5 (exempted)

func TestApplyMidYearCapping_ExpiredWithPartialExemption(t *testing.T)
	// Input: carryover=5, expired, partial exemption retain=3
	// Expected: carryover=3
```

### 6.2 Capping Rule Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacationcappingrule_test.go`

```go
func TestVacationCappingRuleService_Create_YearEnd(t *testing.T)
	// Create year_end rule with cap_value=5
	// Assert fields match

func TestVacationCappingRuleService_Create_MidYear(t *testing.T)
	// Create mid_year rule with cutoff_month=3, cutoff_day=31
	// Assert fields match

func TestVacationCappingRuleService_Create_InvalidType(t *testing.T)
	// rule_type="invalid" -> error

func TestVacationCappingRuleService_Create_DuplicateCode(t *testing.T)
	// Same tenant+code -> ErrCappingRuleCodeExists

func TestVacationCappingRuleService_Update_Success(t *testing.T)
func TestVacationCappingRuleService_Delete_Success(t *testing.T)
func TestVacationCappingRuleService_Delete_InUse(t *testing.T)
func TestVacationCappingRuleService_List(t *testing.T)
```

### 6.3 Capping Rule Group Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacationcappingrulegroup_test.go`

```go
func TestVacationCappingRuleGroupService_Create_Success(t *testing.T)
func TestVacationCappingRuleGroupService_Create_WithRules(t *testing.T)
func TestVacationCappingRuleGroupService_Create_DuplicateCode(t *testing.T)
func TestVacationCappingRuleGroupService_Update_ReplaceRules(t *testing.T)
func TestVacationCappingRuleGroupService_Delete_Success(t *testing.T)
func TestVacationCappingRuleGroupService_Delete_InUse(t *testing.T)
	// Group assigned to tariff -> ErrCappingRuleGroupInUse
```

### 6.4 Carryover Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation_carryover_test.go`

```go
func TestVacationService_PreviewCarryover_YearEndCapped(t *testing.T)
	// Setup: employee with tariff, tariff has capping group with year_end cap=5
	// Previous year balance: available=8
	// Expected: carryover=5, forfeited=3

func TestVacationService_PreviewCarryover_MidYearExpiry(t *testing.T)
	// Setup: employee with mid_year cutoff=3/31
	// Expected: carryover=available, carryover_expires_at set

func TestVacationService_PreviewCarryover_NoRules(t *testing.T)
	// Setup: employee with no capping group
	// Expected: carryover=available (unlimited)

func TestVacationService_PreviewCarryover_WithException(t *testing.T)
	// Setup: full exemption exception for employee
	// Expected: carryover=available (bypasses cap)

func TestVacationService_ApplyCarryover_Success(t *testing.T)
	// Apply and verify balances persisted

func TestVacationService_ApplyMidYearCapping_Success(t *testing.T)
	// Setup: balance with carryover_expires_at in past
	// Apply and verify carryover zeroed out
```

### 6.5 Handler Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationcappingrule_test.go`

```go
func TestVacationCappingRuleHandler_Create_Success(t *testing.T)
func TestVacationCappingRuleHandler_Get_Success(t *testing.T)
func TestVacationCappingRuleHandler_List_Success(t *testing.T)
func TestVacationCappingRuleHandler_Update_Success(t *testing.T)
func TestVacationCappingRuleHandler_Delete_Success(t *testing.T)
```

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationcarryover_test.go`

```go
func TestVacationCarryoverHandler_Preview_Success(t *testing.T)
func TestVacationCarryoverHandler_Apply_Success(t *testing.T)
func TestVacationCarryoverHandler_ApplyMidYear_Success(t *testing.T)
```

### 6.6 Verification Steps

```bash
# Run calculation tests
cd apps/api && go test -v -run TestCalculateCarryoverWithCapping ./internal/calculation/...
cd apps/api && go test -v -run TestApplyMidYearCapping ./internal/calculation/...

# Run service tests
cd apps/api && go test -v -run TestVacationCappingRule ./internal/service/...
cd apps/api && go test -v -run TestVacationCappingRuleGroup ./internal/service/...
cd apps/api && go test -v -run TestVacationService_Preview ./internal/service/...
cd apps/api && go test -v -run TestVacationService_Apply ./internal/service/...

# Run handler tests
cd apps/api && go test -v -run TestVacationCappingRule ./internal/handler/...
cd apps/api && go test -v -run TestVacationCarryover ./internal/handler/...

# Run full test suite
make test
```

---

## File Summary

### Files to Create

| # | File | Layer | Description |
|---|------|-------|-------------|
| 1 | `db/migrations/000050_create_vacation_capping_rules.up.sql` | Migration | Capping rules table |
| 2 | `db/migrations/000050_create_vacation_capping_rules.down.sql` | Migration | Drop table |
| 3 | `db/migrations/000051_create_vacation_capping_rule_groups.up.sql` | Migration | Groups + junction + tariff FK |
| 4 | `db/migrations/000051_create_vacation_capping_rule_groups.down.sql` | Migration | Reverse all |
| 5 | `db/migrations/000052_create_employee_capping_exceptions.up.sql` | Migration | Exceptions table + vacation_balances.carryover_expires_at |
| 6 | `db/migrations/000052_create_employee_capping_exceptions.down.sql` | Migration | Reverse all |
| 7 | `apps/api/internal/model/vacationcappingrule.go` | Model | VacationCappingRule GORM struct |
| 8 | `apps/api/internal/model/vacationcappingrulegroup.go` | Model | VacationCappingRuleGroup + junction GORM structs |
| 9 | `apps/api/internal/model/employeecappingexception.go` | Model | EmployeeCappingException GORM struct |
| 10 | `apps/api/internal/repository/vacationcappingrule.go` | Repository | Capping rule CRUD + usage count |
| 11 | `apps/api/internal/repository/vacationcappingrulegroup.go` | Repository | Group CRUD + junction management |
| 12 | `apps/api/internal/repository/employeecappingexception.go` | Repository | Exception CRUD + lookup |
| 13 | `apps/api/internal/service/vacationcappingrule.go` | Service | Capping rule business logic |
| 14 | `apps/api/internal/service/vacationcappingrulegroup.go` | Service | Group business logic |
| 15 | `apps/api/internal/service/employeecappingexception.go` | Service | Exception business logic |
| 16 | `apps/api/internal/calculation/vacation_capping.go` | Calculation | Carryover with capping calculation functions |
| 17 | `apps/api/internal/handler/vacationcappingrule.go` | Handler | Capping rule HTTP handlers |
| 18 | `apps/api/internal/handler/vacationcappingrulegroup.go` | Handler | Group HTTP handlers |
| 19 | `apps/api/internal/handler/employeecappingexception.go` | Handler | Exception HTTP handlers |
| 20 | `apps/api/internal/handler/vacationcarryover.go` | Handler | Carryover preview/apply HTTP handlers |
| 21 | `api/schemas/vacation-capping-rules.yaml` | OpenAPI | Capping rule schemas |
| 22 | `api/schemas/vacation-capping-rule-groups.yaml` | OpenAPI | Group schemas |
| 23 | `api/schemas/employee-capping-exceptions.yaml` | OpenAPI | Exception schemas |
| 24 | `api/schemas/vacation-carryover.yaml` | OpenAPI | Carryover preview/apply schemas |
| 25 | `api/paths/vacation-capping-rules.yaml` | OpenAPI | Capping rule endpoints |
| 26 | `api/paths/vacation-capping-rule-groups.yaml` | OpenAPI | Group endpoints |
| 27 | `api/paths/employee-capping-exceptions.yaml` | OpenAPI | Exception endpoints |
| 28 | `api/paths/vacation-carryover.yaml` | OpenAPI | Carryover endpoints |
| 29 | `apps/api/internal/calculation/vacation_capping_test.go` | Test | Carryover calculation unit tests |
| 30 | `apps/api/internal/service/vacationcappingrule_test.go` | Test | Capping rule service tests |
| 31 | `apps/api/internal/service/vacationcappingrulegroup_test.go` | Test | Group service tests |
| 32 | `apps/api/internal/service/vacation_carryover_test.go` | Test | Carryover service tests |
| 33 | `apps/api/internal/handler/vacationcappingrule_test.go` | Test | Capping rule handler tests |
| 34 | `apps/api/internal/handler/vacationcarryover_test.go` | Test | Carryover handler tests |

### Files to Modify

| # | File | Changes |
|---|------|---------|
| 1 | `apps/api/internal/model/tariff.go` | Add `VacationCappingRuleGroupID *uuid.UUID` field and `VacationCappingRuleGroup` relation |
| 2 | `apps/api/internal/model/vacationbalance.go` | Add `CarryoverExpiresAt *time.Time` field |
| 3 | `apps/api/internal/repository/vacationbalance.go` | Add `ListByYear` and `ListWithExpiredCarryover` methods |
| 4 | `apps/api/internal/service/vacation.go` | Add new repo interfaces, extend struct + constructor, add `resolveCappingRules`, rewrite `CarryoverFromPreviousYear`, add `PreviewCarryover`, `ApplyCarryover`, `ApplyMidYearCapping` |
| 5 | `apps/api/internal/handler/routes.go` | Add `RegisterVacationCappingRuleRoutes`, `RegisterVacationCappingRuleGroupRoutes`, `RegisterEmployeeCappingExceptionRoutes`, `RegisterVacationCarryoverRoutes` |
| 6 | `apps/api/cmd/server/main.go` | Wire new repos/services/handlers, update VacationService constructor, register routes |
| 7 | `api/openapi.yaml` | Add tags, path references, and definition references for all new endpoints |

---

## Implementation Order

1. **Phase 1** (Migration + Models): Create tables and GORM structs, modify tariff and vacation balance models. Verify: `make migrate-up && go build ./...`
2. **Phase 2** (OpenAPI): Create all spec files, update openapi.yaml, bundle, generate. Verify: `make swagger-bundle && make generate && go build ./...`
3. **Phase 3** (Repository): Implement data access for all new entities + extend vacation balance repo. Verify: `go build ./internal/repository/...`
4. **Phase 4** (Service + Calculation): Implement capping calculation functions, CRUD services, extend VacationService with carryover logic. Verify: `go build ./internal/service/... && go build ./internal/calculation/...`
5. **Phase 5** (Handler): Implement HTTP layer for all CRUD + carryover operations, wire in main.go. Verify: `go build ./...`
6. **Phase 6** (Tests): Write and run all tests. Verify: `make test`
