# Implementation Plan: ZMI-TICKET-014 - Vacation Entitlement Calculation

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-014
**Dependencies**: ZMI-TICKET-004 (Personnel Master Data), ZMI-TICKET-018 (Tariff Definitions), ZMI-TICKET-001 (Mandant Basis Setting)
**Status**: Ready for implementation

---

## Summary

Implement the full vacation entitlement calculation configuration layer: special calculations (Sonderberechnungen) for age, tenure, and disability bonuses; calculation groups (Berechnungsgruppen) that bundle a basis setting and selected special calculations; and a preview endpoint that computes entitlement breakdowns for any employee/year. The core calculation engine already exists in `calculation/vacation.go` -- this ticket adds the persistent configuration, CRUD management, and wiring into the existing `VacationService.InitializeYear` flow.

### What Already Exists (DO NOT reimplement)

- `apps/api/internal/calculation/vacation.go` -- `CalculateVacation()` with pro-rating, part-time adjustment, age/tenure/disability bonuses, rounding
- `apps/api/internal/calculation/vacation_test.go` -- 21 comprehensive test functions
- `apps/api/internal/model/vacationbalance.go` -- VacationBalance GORM model
- `apps/api/internal/repository/vacationbalance.go` -- CRUD + Upsert
- `apps/api/internal/service/vacation.go` -- GetBalance, InitializeYear, RecalculateTaken, AdjustBalance, CarryoverFromPreviousYear
- `apps/api/internal/handler/vacation.go` -- GetBalance endpoint
- Employee model fields: BirthDate, EntryDate, ExitDate, DisabilityFlag, WeeklyHours, PartTimePercent
- Tariff model fields: AnnualVacationDays, WorkDaysPerWeek, VacationBasis, WeeklyTargetHours

---

## Phase 1: Database Schema & Models

### 1.1 Create `vacation_special_calculations` table

**File**: `/home/tolga/projects/terp/db/migrations/000048_create_vacation_special_calculations.up.sql`

```sql
-- =============================================================
-- Create vacation_special_calculations table
-- ZMI manual section 19.2-19.4: Sonderberechnungen
-- Types: age (Alter), tenure (Betriebszugehoerigkeit), disability (Behinderung)
-- =============================================================
CREATE TABLE vacation_special_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('age', 'tenure', 'disability')),
    threshold INT NOT NULL DEFAULT 0,
    bonus_days DECIMAL(5,2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, type, threshold)
);

CREATE INDEX idx_vsc_tenant ON vacation_special_calculations(tenant_id);
CREATE INDEX idx_vsc_tenant_active ON vacation_special_calculations(tenant_id, is_active);
CREATE INDEX idx_vsc_type ON vacation_special_calculations(tenant_id, type);

CREATE TRIGGER update_vacation_special_calculations_updated_at
    BEFORE UPDATE ON vacation_special_calculations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vacation_special_calculations IS 'Vacation special calculation rules (Sonderberechnungen) for age, tenure, and disability bonuses.';
COMMENT ON COLUMN vacation_special_calculations.type IS 'Type of special calculation: age, tenure, or disability.';
COMMENT ON COLUMN vacation_special_calculations.threshold IS 'Age in years (age type), tenure in years (tenure type), ignored for disability (always 0).';
COMMENT ON COLUMN vacation_special_calculations.bonus_days IS 'Additional vacation days to add when threshold is met.';
```

**File**: `/home/tolga/projects/terp/db/migrations/000048_create_vacation_special_calculations.down.sql`

```sql
DROP TABLE IF EXISTS vacation_special_calculations;
```

### 1.2 Create `vacation_calculation_groups` table, junction table, and employment type FK

**File**: `/home/tolga/projects/terp/db/migrations/000049_create_vacation_calculation_groups.up.sql`

```sql
-- =============================================================
-- Create vacation_calculation_groups table
-- ZMI manual section 19.1: Berechnungsgruppen with basis selection
-- =============================================================
CREATE TABLE vacation_calculation_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    basis VARCHAR(20) NOT NULL DEFAULT 'calendar_year' CHECK (basis IN ('calendar_year', 'entry_date')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_vcg_tenant ON vacation_calculation_groups(tenant_id);
CREATE INDEX idx_vcg_tenant_active ON vacation_calculation_groups(tenant_id, is_active);

CREATE TRIGGER update_vacation_calculation_groups_updated_at
    BEFORE UPDATE ON vacation_calculation_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vacation_calculation_groups IS 'Vacation calculation groups (Berechnungsgruppen) combining basis and special calculations.';
COMMENT ON COLUMN vacation_calculation_groups.basis IS 'Vacation year basis: calendar_year (Jan-Dec) or entry_date (hire anniversary).';

-- =============================================================
-- Junction table: links groups to their special calculations
-- =============================================================
CREATE TABLE vacation_calc_group_special_calcs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES vacation_calculation_groups(id) ON DELETE CASCADE,
    special_calculation_id UUID NOT NULL REFERENCES vacation_special_calculations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, special_calculation_id)
);

CREATE INDEX idx_vcgsc_group ON vacation_calc_group_special_calcs(group_id);
CREATE INDEX idx_vcgsc_special_calc ON vacation_calc_group_special_calcs(special_calculation_id);

COMMENT ON TABLE vacation_calc_group_special_calcs IS 'Junction table linking vacation calculation groups to their special calculations.';

-- =============================================================
-- Add vacation_calc_group_id FK to employment_types
-- Employment type selects which vacation calculation group applies
-- =============================================================
ALTER TABLE employment_types
    ADD COLUMN vacation_calc_group_id UUID REFERENCES vacation_calculation_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_employment_types_vacation_calc_group ON employment_types(vacation_calc_group_id);

COMMENT ON COLUMN employment_types.vacation_calc_group_id IS 'Links employment type to its vacation calculation group.';
```

**File**: `/home/tolga/projects/terp/db/migrations/000049_create_vacation_calculation_groups.down.sql`

```sql
ALTER TABLE employment_types DROP COLUMN IF EXISTS vacation_calc_group_id;
DROP TABLE IF EXISTS vacation_calc_group_special_calcs;
DROP TABLE IF EXISTS vacation_calculation_groups;
```

### 1.3 GORM Model: VacationSpecialCalculation

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vacationspecialcalc.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// VacationSpecialCalcType defines the type of vacation special calculation.
type VacationSpecialCalcType string

const (
	VacationSpecialCalcAge        VacationSpecialCalcType = "age"
	VacationSpecialCalcTenure     VacationSpecialCalcType = "tenure"
	VacationSpecialCalcDisability VacationSpecialCalcType = "disability"
)

// ValidVacationSpecialCalcTypes lists all valid special calculation types.
var ValidVacationSpecialCalcTypes = []VacationSpecialCalcType{
	VacationSpecialCalcAge,
	VacationSpecialCalcTenure,
	VacationSpecialCalcDisability,
}

// IsValidVacationSpecialCalcType checks if a type string is valid.
func IsValidVacationSpecialCalcType(t string) bool {
	for _, valid := range ValidVacationSpecialCalcTypes {
		if string(valid) == t {
			return true
		}
	}
	return false
}

// VacationSpecialCalculation defines a special vacation calculation rule (Sonderberechnung).
// ZMI manual sections 19.2-19.4.
type VacationSpecialCalculation struct {
	ID          uuid.UUID               `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID               `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Type        VacationSpecialCalcType  `gorm:"type:varchar(20);not null" json:"type"`
	Threshold   int                     `gorm:"type:int;not null;default:0" json:"threshold"`
	BonusDays   decimal.Decimal         `gorm:"type:decimal(5,2);not null" json:"bonus_days"`
	Description *string                 `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool                    `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time               `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time               `gorm:"default:now()" json:"updated_at"`

	// Relations
	Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (VacationSpecialCalculation) TableName() string {
	return "vacation_special_calculations"
}
```

### 1.4 GORM Model: VacationCalculationGroup + Junction

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vacationcalcgroup.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// VacationCalculationGroup defines a vacation calculation group (Berechnungsgruppe).
// Groups combine a basis (calendar year or entry date) with a set of special calculations.
// ZMI manual section 19.1.
type VacationCalculationGroup struct {
	ID          uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID     `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string        `gorm:"type:varchar(50);not null" json:"code"`
	Name        string        `gorm:"type:varchar(255);not null" json:"name"`
	Description *string       `gorm:"type:text" json:"description,omitempty"`
	Basis       VacationBasis `gorm:"type:varchar(20);not null;default:'calendar_year'" json:"basis"`
	IsActive    bool          `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time     `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time     `gorm:"default:now()" json:"updated_at"`

	// Relations
	Tenant             *Tenant                      `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
	SpecialCalculations []VacationSpecialCalculation `gorm:"many2many:vacation_calc_group_special_calcs;foreignKey:ID;joinForeignKey:GroupID;References:ID;joinReferences:SpecialCalculationID" json:"special_calculations,omitempty"`
}

func (VacationCalculationGroup) TableName() string {
	return "vacation_calculation_groups"
}

// VacationCalcGroupSpecialCalc is the junction table linking groups to special calculations.
type VacationCalcGroupSpecialCalc struct {
	ID                     uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID                uuid.UUID `gorm:"type:uuid;not null" json:"group_id"`
	SpecialCalculationID   uuid.UUID `gorm:"type:uuid;not null" json:"special_calculation_id"`
	CreatedAt              time.Time `gorm:"default:now()" json:"created_at"`
}

func (VacationCalcGroupSpecialCalc) TableName() string {
	return "vacation_calc_group_special_calcs"
}
```

### 1.5 Modify EmploymentType Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employmenttype.go`

Add `VacationCalcGroupID` field after `IsActive`:

```go
VacationCalcGroupID *uuid.UUID `gorm:"type:uuid" json:"vacation_calc_group_id,omitempty"`

// Relations
VacationCalcGroup *VacationCalculationGroup `gorm:"foreignKey:VacationCalcGroupID" json:"vacation_calc_group,omitempty"`
```

### 1.6 Verification Steps

```bash
# Apply migrations
make migrate-up

# Verify models compile
cd apps/api && go build ./...
```

---

## Phase 2: OpenAPI Specification

### 2.1 Vacation Special Calculations Schema

**File**: `/home/tolga/projects/terp/api/schemas/vacation-special-calculations.yaml`

```yaml
# Vacation Special Calculation schemas
VacationSpecialCalculation:
  type: object
  required:
    - id
    - tenant_id
    - type
    - threshold
    - bonus_days
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    type:
      type: string
      enum: [age, tenure, disability]
      description: "Type of special calculation: age (Alter), tenure (Betriebszugehoerigkeit), or disability (Behinderung)"
      example: "age"
    threshold:
      type: integer
      description: "Age in years (age), tenure in years (tenure), 0 for disability"
      example: 50
    bonus_days:
      type: number
      format: double
      description: "Additional vacation days when threshold is met"
      example: 2.0
    description:
      type: string
      x-nullable: true
    is_active:
      type: boolean
      example: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

VacationSpecialCalculationSummary:
  type: object
  required:
    - id
    - type
    - threshold
    - bonus_days
  properties:
    id:
      type: string
      format: uuid
    type:
      type: string
      enum: [age, tenure, disability]
    threshold:
      type: integer
    bonus_days:
      type: number
      format: double

CreateVacationSpecialCalculationRequest:
  type: object
  required:
    - type
    - bonus_days
  properties:
    type:
      type: string
      enum: [age, tenure, disability]
    threshold:
      type: integer
      default: 0
      description: "Age or tenure threshold in years. Must be 0 for disability type."
    bonus_days:
      type: number
      format: double
      minimum: 0.5
      description: "Additional vacation days"
    description:
      type: string

UpdateVacationSpecialCalculationRequest:
  type: object
  properties:
    threshold:
      type: integer
    bonus_days:
      type: number
      format: double
      minimum: 0.5
    description:
      type: string
    is_active:
      type: boolean

VacationSpecialCalculationList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/VacationSpecialCalculation'
```

### 2.2 Vacation Calculation Groups Schema

**File**: `/home/tolga/projects/terp/api/schemas/vacation-calculation-groups.yaml`

```yaml
# Vacation Calculation Group schemas
VacationCalculationGroup:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
    - basis
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
      example: "STANDARD"
    name:
      type: string
      example: "Standard Vacation Group"
    description:
      type: string
      x-nullable: true
    basis:
      type: string
      enum: [calendar_year, entry_date]
      description: "Vacation year basis: calendar_year (Jan-Dec) or entry_date (hire anniversary)"
      example: "calendar_year"
    is_active:
      type: boolean
      example: true
    special_calculations:
      type: array
      items:
        $ref: '../schemas/vacation-special-calculations.yaml#/VacationSpecialCalculationSummary'
      description: "Special calculations linked to this group"
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

VacationCalculationGroupSummary:
  type: object
  required:
    - id
    - code
    - name
    - basis
  properties:
    id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
    basis:
      type: string
      enum: [calendar_year, entry_date]

CreateVacationCalculationGroupRequest:
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
    basis:
      type: string
      enum: [calendar_year, entry_date]
      default: "calendar_year"
    special_calculation_ids:
      type: array
      items:
        type: string
        format: uuid
      description: "IDs of special calculations to link to this group"

UpdateVacationCalculationGroupRequest:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    basis:
      type: string
      enum: [calendar_year, entry_date]
    is_active:
      type: boolean
    special_calculation_ids:
      type: array
      items:
        type: string
        format: uuid
      description: "Replace linked special calculations with this set"

VacationCalculationGroupList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/VacationCalculationGroup'
```

### 2.3 Vacation Entitlement Preview Schema

**File**: `/home/tolga/projects/terp/api/schemas/vacation-entitlement.yaml`

```yaml
# Vacation Entitlement Preview schemas
VacationEntitlementPreviewRequest:
  type: object
  required:
    - employee_id
    - year
  properties:
    employee_id:
      type: string
      format: uuid
    year:
      type: integer
      example: 2026
    calculation_group_id:
      type: string
      format: uuid
      description: "Optional override: use this group instead of the employee's employment type group"

VacationEntitlementPreview:
  type: object
  required:
    - employee_id
    - year
  properties:
    employee_id:
      type: string
      format: uuid
    employee_name:
      type: string
      description: "Employee display name for convenience"
    year:
      type: integer
    basis:
      type: string
      enum: [calendar_year, entry_date]
    calculation_group_id:
      type: string
      format: uuid
      x-nullable: true
    calculation_group_name:
      type: string
      x-nullable: true
    base_entitlement:
      type: number
      format: double
      description: "Full-year base vacation days from tariff/employee"
    pro_rated_entitlement:
      type: number
      format: double
      description: "After pro-rating for months employed"
    part_time_adjustment:
      type: number
      format: double
      description: "After part-time factor adjustment"
    age_bonus:
      type: number
      format: double
      description: "Bonus days from age special calculations"
    tenure_bonus:
      type: number
      format: double
      description: "Bonus days from tenure special calculations"
    disability_bonus:
      type: number
      format: double
      description: "Bonus days from disability special calculations"
    total_entitlement:
      type: number
      format: double
      description: "Final entitlement (rounded to nearest 0.5)"
    months_employed:
      type: integer
      description: "Number of months employed in the year"
    age_at_reference:
      type: integer
      description: "Employee age at reference date"
    tenure_years:
      type: integer
      description: "Years of service at reference date"
    weekly_hours:
      type: number
      format: double
      description: "Employee weekly hours"
    standard_weekly_hours:
      type: number
      format: double
      description: "Standard full-time weekly hours"
    part_time_factor:
      type: number
      format: double
      description: "Part-time factor (weekly_hours / standard_weekly_hours)"
```

### 2.4 Vacation Special Calculations Paths

**File**: `/home/tolga/projects/terp/api/paths/vacation-special-calculations.yaml`

```yaml
# Vacation Special Calculation endpoints
/vacation-special-calculations:
  get:
    tags:
      - Vacation Special Calculations
    summary: List vacation special calculations
    operationId: listVacationSpecialCalculations
    parameters:
      - name: active_only
        in: query
        type: boolean
        description: Filter to only active special calculations
      - name: type
        in: query
        type: string
        enum: [age, tenure, disability]
        description: Filter by special calculation type
    responses:
      200:
        description: List of vacation special calculations
        schema:
          $ref: '../schemas/vacation-special-calculations.yaml#/VacationSpecialCalculationList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Vacation Special Calculations
    summary: Create vacation special calculation
    operationId: createVacationSpecialCalculation
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/vacation-special-calculations.yaml#/CreateVacationSpecialCalculationRequest'
    responses:
      201:
        description: Created vacation special calculation
        schema:
          $ref: '../schemas/vacation-special-calculations.yaml#/VacationSpecialCalculation'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Duplicate type+threshold combination for this tenant
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/vacation-special-calculations/{id}:
  get:
    tags:
      - Vacation Special Calculations
    summary: Get vacation special calculation by ID
    operationId: getVacationSpecialCalculation
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Vacation special calculation details
        schema:
          $ref: '../schemas/vacation-special-calculations.yaml#/VacationSpecialCalculation'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Vacation Special Calculations
    summary: Update vacation special calculation
    operationId: updateVacationSpecialCalculation
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
          $ref: '../schemas/vacation-special-calculations.yaml#/UpdateVacationSpecialCalculationRequest'
    responses:
      200:
        description: Updated vacation special calculation
        schema:
          $ref: '../schemas/vacation-special-calculations.yaml#/VacationSpecialCalculation'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Vacation Special Calculations
    summary: Delete vacation special calculation
    operationId: deleteVacationSpecialCalculation
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Vacation special calculation deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
      409:
        description: Special calculation is still assigned to calculation groups
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'
```

### 2.5 Vacation Calculation Groups Paths

**File**: `/home/tolga/projects/terp/api/paths/vacation-calculation-groups.yaml`

```yaml
# Vacation Calculation Group endpoints
/vacation-calculation-groups:
  get:
    tags:
      - Vacation Calculation Groups
    summary: List vacation calculation groups
    operationId: listVacationCalculationGroups
    parameters:
      - name: active_only
        in: query
        type: boolean
        description: Filter to only active groups
    responses:
      200:
        description: List of vacation calculation groups
        schema:
          $ref: '../schemas/vacation-calculation-groups.yaml#/VacationCalculationGroupList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Vacation Calculation Groups
    summary: Create vacation calculation group
    operationId: createVacationCalculationGroup
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/vacation-calculation-groups.yaml#/CreateVacationCalculationGroupRequest'
    responses:
      201:
        description: Created vacation calculation group
        schema:
          $ref: '../schemas/vacation-calculation-groups.yaml#/VacationCalculationGroup'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists for this tenant
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/vacation-calculation-groups/{id}:
  get:
    tags:
      - Vacation Calculation Groups
    summary: Get vacation calculation group by ID
    operationId: getVacationCalculationGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Vacation calculation group details (includes linked special calculations)
        schema:
          $ref: '../schemas/vacation-calculation-groups.yaml#/VacationCalculationGroup'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Vacation Calculation Groups
    summary: Update vacation calculation group
    operationId: updateVacationCalculationGroup
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
          $ref: '../schemas/vacation-calculation-groups.yaml#/UpdateVacationCalculationGroupRequest'
    responses:
      200:
        description: Updated vacation calculation group
        schema:
          $ref: '../schemas/vacation-calculation-groups.yaml#/VacationCalculationGroup'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Vacation Calculation Groups
    summary: Delete vacation calculation group
    operationId: deleteVacationCalculationGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Vacation calculation group deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
      409:
        description: Group is still assigned to employment types
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'
```

### 2.6 Vacation Entitlement Preview Path

**File**: `/home/tolga/projects/terp/api/paths/vacation-entitlement.yaml`

```yaml
# Vacation Entitlement Preview endpoint
/vacation-entitlement/preview:
  post:
    tags:
      - Vacation
    summary: Preview vacation entitlement for an employee
    description: |
      Calculates and returns a detailed breakdown of vacation entitlement for an employee in a given year.
      Uses the employee's employment type to resolve the calculation group, or accepts an optional override.
      Does NOT persist the result -- use /vacation-balances/initialize for that.
    operationId: previewVacationEntitlement
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/vacation-entitlement.yaml#/VacationEntitlementPreviewRequest'
    responses:
      200:
        description: Vacation entitlement breakdown
        schema:
          $ref: '../schemas/vacation-entitlement.yaml#/VacationEntitlementPreview'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        description: Employee not found
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'
```

### 2.7 Update `api/openapi.yaml`

**Modify** `/home/tolga/projects/terp/api/openapi.yaml`:

Add tags (after "Correction Assistant" tag, around line 116):
```yaml
  - name: Vacation Special Calculations
    description: Vacation special calculation rules (age, tenure, disability bonuses)
  - name: Vacation Calculation Groups
    description: Vacation calculation groups combining basis and special calculations
```

Add path references (after correction-assistant paths, around line 464):
```yaml
  # Vacation Special Calculations
  /vacation-special-calculations:
    $ref: 'paths/vacation-special-calculations.yaml#/~1vacation-special-calculations'
  /vacation-special-calculations/{id}:
    $ref: 'paths/vacation-special-calculations.yaml#/~1vacation-special-calculations~1{id}'

  # Vacation Calculation Groups
  /vacation-calculation-groups:
    $ref: 'paths/vacation-calculation-groups.yaml#/~1vacation-calculation-groups'
  /vacation-calculation-groups/{id}:
    $ref: 'paths/vacation-calculation-groups.yaml#/~1vacation-calculation-groups~1{id}'

  # Vacation Entitlement Preview
  /vacation-entitlement/preview:
    $ref: 'paths/vacation-entitlement.yaml#/~1vacation-entitlement~1preview'
```

Add definition references (after CalculationRuleList, around line 893):
```yaml
  # Vacation Special Calculations
  VacationSpecialCalculation:
    $ref: 'schemas/vacation-special-calculations.yaml#/VacationSpecialCalculation'
  VacationSpecialCalculationSummary:
    $ref: 'schemas/vacation-special-calculations.yaml#/VacationSpecialCalculationSummary'
  CreateVacationSpecialCalculationRequest:
    $ref: 'schemas/vacation-special-calculations.yaml#/CreateVacationSpecialCalculationRequest'
  UpdateVacationSpecialCalculationRequest:
    $ref: 'schemas/vacation-special-calculations.yaml#/UpdateVacationSpecialCalculationRequest'
  VacationSpecialCalculationList:
    $ref: 'schemas/vacation-special-calculations.yaml#/VacationSpecialCalculationList'

  # Vacation Calculation Groups
  VacationCalculationGroup:
    $ref: 'schemas/vacation-calculation-groups.yaml#/VacationCalculationGroup'
  VacationCalculationGroupSummary:
    $ref: 'schemas/vacation-calculation-groups.yaml#/VacationCalculationGroupSummary'
  CreateVacationCalculationGroupRequest:
    $ref: 'schemas/vacation-calculation-groups.yaml#/CreateVacationCalculationGroupRequest'
  UpdateVacationCalculationGroupRequest:
    $ref: 'schemas/vacation-calculation-groups.yaml#/UpdateVacationCalculationGroupRequest'
  VacationCalculationGroupList:
    $ref: 'schemas/vacation-calculation-groups.yaml#/VacationCalculationGroupList'

  # Vacation Entitlement Preview
  VacationEntitlementPreviewRequest:
    $ref: 'schemas/vacation-entitlement.yaml#/VacationEntitlementPreviewRequest'
  VacationEntitlementPreview:
    $ref: 'schemas/vacation-entitlement.yaml#/VacationEntitlementPreview'
```

### 2.8 Generate Models & Verification

```bash
make swagger-bundle
make generate
cd apps/api && go build ./...
```

---

## Phase 3: Repository Layer

### 3.1 VacationSpecialCalculation Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationspecialcalc.go`

```go
package repository

// VacationSpecialCalcRepository handles vacation special calculation data access.
type VacationSpecialCalcRepository struct {
	db *DB
}

func NewVacationSpecialCalcRepository(db *DB) *VacationSpecialCalcRepository

// Create creates a new special calculation.
// Uses Select to specify columns: TenantID, Type, Threshold, BonusDays, Description, IsActive.
func (r *VacationSpecialCalcRepository) Create(ctx, calc *model.VacationSpecialCalculation) error

// GetByID retrieves a special calculation by ID.
// Returns ErrVacationSpecialCalcNotFound for gorm.ErrRecordNotFound.
func (r *VacationSpecialCalcRepository) GetByID(ctx, id uuid.UUID) (*model.VacationSpecialCalculation, error)

// List retrieves all special calculations for a tenant.
// Ordered by type ASC, threshold ASC.
func (r *VacationSpecialCalcRepository) List(ctx, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error)

// ListActive retrieves only active special calculations for a tenant.
func (r *VacationSpecialCalcRepository) ListActive(ctx, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error)

// ListByType retrieves special calculations of a specific type for a tenant.
func (r *VacationSpecialCalcRepository) ListByType(ctx, tenantID uuid.UUID, calcType string) ([]model.VacationSpecialCalculation, error)

// ListByIDs retrieves special calculations by a slice of IDs.
// Used when loading group's linked special calcs.
func (r *VacationSpecialCalcRepository) ListByIDs(ctx, ids []uuid.UUID) ([]model.VacationSpecialCalculation, error)

// Update saves changes to a special calculation.
func (r *VacationSpecialCalcRepository) Update(ctx, calc *model.VacationSpecialCalculation) error

// Delete deletes a special calculation by ID.
// Returns ErrVacationSpecialCalcNotFound if RowsAffected == 0.
func (r *VacationSpecialCalcRepository) Delete(ctx, id uuid.UUID) error

// CountGroupUsages counts how many calculation groups reference this special calculation.
// Used to prevent deletion of in-use special calculations.
func (r *VacationSpecialCalcRepository) CountGroupUsages(ctx, specialCalcID uuid.UUID) (int64, error)

// ExistsByTypeAndThreshold checks if a special calc with the same tenant+type+threshold exists.
// Used for uniqueness validation.
func (r *VacationSpecialCalcRepository) ExistsByTypeAndThreshold(ctx, tenantID uuid.UUID, calcType string, threshold int) (bool, error)
```

Key implementation notes:
- `CountGroupUsages` queries `vacation_calc_group_special_calcs` table: `WHERE special_calculation_id = ?`
- `ExistsByTypeAndThreshold` queries with `WHERE tenant_id = ? AND type = ? AND threshold = ?`
- All methods use `r.db.GORM.WithContext(ctx)` pattern

### 3.2 VacationCalculationGroup Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationcalcgroup.go`

```go
package repository

// VacationCalcGroupRepository handles vacation calculation group data access.
type VacationCalcGroupRepository struct {
	db *DB
}

func NewVacationCalcGroupRepository(db *DB) *VacationCalcGroupRepository

// Create creates a new calculation group.
// Uses Select to specify columns: TenantID, Code, Name, Description, Basis, IsActive.
func (r *VacationCalcGroupRepository) Create(ctx, group *model.VacationCalculationGroup) error

// GetByID retrieves a group by ID, preloading SpecialCalculations.
// Uses Preload("SpecialCalculations") to eagerly load the many2many relation.
func (r *VacationCalcGroupRepository) GetByID(ctx, id uuid.UUID) (*model.VacationCalculationGroup, error)

// GetByCode retrieves a group by tenant + code.
func (r *VacationCalcGroupRepository) GetByCode(ctx, tenantID uuid.UUID, code string) (*model.VacationCalculationGroup, error)

// List retrieves all groups for a tenant, preloading SpecialCalculations.
// Ordered by code ASC.
func (r *VacationCalcGroupRepository) List(ctx, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error)

// ListActive retrieves only active groups for a tenant.
func (r *VacationCalcGroupRepository) ListActive(ctx, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error)

// Update saves changes to a group (excluding special calculation links).
func (r *VacationCalcGroupRepository) Update(ctx, group *model.VacationCalculationGroup) error

// Delete deletes a group by ID.
// Junction table entries are deleted automatically via ON DELETE CASCADE.
func (r *VacationCalcGroupRepository) Delete(ctx, id uuid.UUID) error

// CountEmploymentTypeUsages counts how many employment types reference this group.
// Used to prevent deletion of in-use groups.
func (r *VacationCalcGroupRepository) CountEmploymentTypeUsages(ctx, groupID uuid.UUID) (int64, error)

// ReplaceSpecialCalculations replaces the group's special calculation links.
// Deletes all existing junction rows for the group, then inserts the new set.
// Called within a transaction.
func (r *VacationCalcGroupRepository) ReplaceSpecialCalculations(ctx, groupID uuid.UUID, specialCalcIDs []uuid.UUID) error
```

Key implementation notes:
- `GetByID` uses `Preload("SpecialCalculations")` before `First(&group, "id = ?", id)`
- `List` uses `Preload("SpecialCalculations")` before `Where("tenant_id = ?", tenantID).Find(&groups)`
- `CountEmploymentTypeUsages` queries `employment_types WHERE vacation_calc_group_id = ?`
- `ReplaceSpecialCalculations` implementation:
  1. Delete all from `vacation_calc_group_special_calcs WHERE group_id = ?`
  2. For each specialCalcID, insert a new `VacationCalcGroupSpecialCalc{GroupID, SpecialCalculationID}`
  3. Use `r.db.GORM.WithContext(ctx).Transaction(...)` to wrap both operations

### 3.3 Verification Steps

```bash
cd apps/api && go build ./internal/repository/...
```

---

## Phase 4: Service Layer

### 4.1 VacationSpecialCalc Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacationspecialcalc.go`

```go
package service

// Errors
var (
	ErrVacationSpecialCalcNotFound       = errors.New("vacation special calculation not found")
	ErrVacationSpecialCalcTypeRequired   = errors.New("vacation special calculation type is required")
	ErrVacationSpecialCalcTypeInvalid    = errors.New("vacation special calculation type must be age, tenure, or disability")
	ErrVacationSpecialCalcBonusRequired  = errors.New("bonus days must be positive")
	ErrVacationSpecialCalcDuplicate      = errors.New("a special calculation with this type and threshold already exists")
	ErrVacationSpecialCalcInUse          = errors.New("vacation special calculation is assigned to calculation groups")
	ErrVacationSpecialCalcInvalidThreshold = errors.New("threshold must be 0 for disability type and positive for age/tenure types")
)

// Repository interface (private)
type vacationSpecialCalcRepository interface {
	Create(ctx context.Context, calc *model.VacationSpecialCalculation) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationSpecialCalculation, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error)
	ListByType(ctx context.Context, tenantID uuid.UUID, calcType string) ([]model.VacationSpecialCalculation, error)
	ListByIDs(ctx context.Context, ids []uuid.UUID) ([]model.VacationSpecialCalculation, error)
	Update(ctx context.Context, calc *model.VacationSpecialCalculation) error
	Delete(ctx context.Context, id uuid.UUID) error
	CountGroupUsages(ctx context.Context, specialCalcID uuid.UUID) (int64, error)
	ExistsByTypeAndThreshold(ctx context.Context, tenantID uuid.UUID, calcType string, threshold int) (bool, error)
}

// Input types
type CreateVacationSpecialCalcInput struct {
	TenantID    uuid.UUID
	Type        string
	Threshold   int
	BonusDays   float64
	Description *string
}

type UpdateVacationSpecialCalcInput struct {
	Threshold   *int
	BonusDays   *float64
	Description *string
	IsActive    *bool
}

// Service struct
type VacationSpecialCalcService struct {
	repo vacationSpecialCalcRepository
}

func NewVacationSpecialCalcService(repo vacationSpecialCalcRepository) *VacationSpecialCalcService
```

**Methods**:

- **Create**: Validate type is one of `age`, `tenure`, `disability`. Validate threshold > 0 for age/tenure, threshold == 0 for disability. Validate bonus_days > 0. Check uniqueness via `ExistsByTypeAndThreshold`. Build model, call repo.Create, return result.

- **GetByID**: Call repo.GetByID. Map repo error to service error.

- **List**: Call repo.List. Supports optional type filter.

- **ListActive**: Call repo.ListActive.

- **Update**: Get existing by ID. Apply pointer fields. If threshold changes, re-validate uniqueness. Save.

- **Delete**: Get by ID. Check `CountGroupUsages > 0` -> return ErrVacationSpecialCalcInUse. Call repo.Delete.

### 4.2 VacationCalcGroup Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacationcalcgroup.go`

```go
package service

// Errors
var (
	ErrVacationCalcGroupNotFound     = errors.New("vacation calculation group not found")
	ErrVacationCalcGroupCodeRequired = errors.New("vacation calculation group code is required")
	ErrVacationCalcGroupNameRequired = errors.New("vacation calculation group name is required")
	ErrVacationCalcGroupCodeExists   = errors.New("vacation calculation group code already exists")
	ErrVacationCalcGroupInUse        = errors.New("vacation calculation group is assigned to employment types")
	ErrVacationCalcGroupInvalidBasis = errors.New("basis must be calendar_year or entry_date")
	ErrSpecialCalcNotFound           = errors.New("one or more special calculation IDs not found")
)

// Repository interfaces (private)
type vacationCalcGroupRepository interface {
	Create(ctx context.Context, group *model.VacationCalculationGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCalculationGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCalculationGroup, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error)
	Update(ctx context.Context, group *model.VacationCalculationGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	CountEmploymentTypeUsages(ctx context.Context, groupID uuid.UUID) (int64, error)
	ReplaceSpecialCalculations(ctx context.Context, groupID uuid.UUID, specialCalcIDs []uuid.UUID) error
}

// Input types
type CreateVacationCalcGroupInput struct {
	TenantID             uuid.UUID
	Code                 string
	Name                 string
	Description          *string
	Basis                string   // "calendar_year" or "entry_date"
	SpecialCalculationIDs []uuid.UUID
}

type UpdateVacationCalcGroupInput struct {
	Name                  *string
	Description           *string
	Basis                 *string
	IsActive              *bool
	SpecialCalculationIDs *[]uuid.UUID // nil = don't change, non-nil = replace
}

// Service struct
type VacationCalcGroupService struct {
	groupRepo       vacationCalcGroupRepository
	specialCalcRepo vacationSpecialCalcRepository
}

func NewVacationCalcGroupService(
	groupRepo vacationCalcGroupRepository,
	specialCalcRepo vacationSpecialCalcRepository,
) *VacationCalcGroupService
```

**Methods**:

- **Create**: Validate code (required, trimmed), name (required, trimmed), basis (must be `calendar_year` or `entry_date`, default `calendar_year`). Check code uniqueness via `GetByCode`. If `SpecialCalculationIDs` provided, validate all IDs exist via `specialCalcRepo.ListByIDs` and compare counts. Create group. Then call `ReplaceSpecialCalculations` to set links. Reload with `GetByID` to return full object with preloaded relations.

- **GetByID**: Call `groupRepo.GetByID` (which preloads SpecialCalculations).

- **List**: Call `groupRepo.List`.

- **ListActive**: Call `groupRepo.ListActive`.

- **Update**: Get existing by ID. Apply pointer fields. If basis changes, validate it. If `SpecialCalculationIDs` is non-nil, validate all IDs exist, then call `ReplaceSpecialCalculations`. Save group. Reload with `GetByID`.

- **Delete**: Get by ID. Check `CountEmploymentTypeUsages > 0` -> return ErrVacationCalcGroupInUse. Call repo.Delete.

### 4.3 Extend VacationService for Preview and Improved InitializeYear

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation.go` (MODIFY)

#### 4.3.1 Add new repository interface

Add to the existing interfaces section:

```go
// employmentTypeRepoForVacation defines the interface for employment type data.
type employmentTypeRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmploymentType, error)
}

// vacationCalcGroupRepoForVacation defines the interface for vacation calc group data.
type vacationCalcGroupRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCalculationGroup, error)
}
```

#### 4.3.2 Add fields to VacationService struct

```go
type VacationService struct {
	vacationBalanceRepo  vacationBalanceRepoForVacation
	absenceDayRepo       absenceDayRepoForVacation
	absenceTypeRepo      absenceTypeRepoForVacation
	employeeRepo         employeeRepoForVacation
	tenantRepo           tenantRepoForVacation
	tariffRepo           tariffRepoForVacation
	employmentTypeRepo   employmentTypeRepoForVacation   // NEW
	vacationCalcGroupRepo vacationCalcGroupRepoForVacation // NEW
	defaultMaxCarryover  decimal.Decimal
}
```

Update `NewVacationService` to accept the two new dependencies.

#### 4.3.3 Add `resolveCalcGroup` method

```go
// resolveCalcGroup resolves the vacation calculation group for an employee.
// Resolution order:
//   1. Employee's employment type -> vacation_calc_group_id
//   2. Returns nil if no group is configured (fallback to default behavior)
func (s *VacationService) resolveCalcGroup(ctx context.Context, employee *model.Employee) *model.VacationCalculationGroup
```

Logic:
1. If `employee.EmploymentTypeID` is nil, return nil
2. If `employmentTypeRepo` is nil, return nil
3. Load employment type by ID
4. If `employmentType.VacationCalcGroupID` is nil, return nil
5. If `vacationCalcGroupRepo` is nil, return nil
6. Load calc group by ID (which preloads SpecialCalculations)
7. Return the group

#### 4.3.4 Add `buildCalcInput` method

```go
// buildCalcInput constructs the VacationCalcInput from employee, tariff, and optional calc group.
func (s *VacationService) buildCalcInput(
	ctx context.Context,
	employee *model.Employee,
	year int,
	calcGroup *model.VacationCalculationGroup,
) calculation.VacationCalcInput
```

Logic:
1. Start with employee's EntryDate, ExitDate, WeeklyHours
2. Set BaseVacationDays from employee.VacationDaysPerYear
3. Resolve StandardWeeklyHours:
   - If employee has TariffID -> load tariff -> use tariff.WeeklyTargetHours (fallback 40)
   - Else use 40 as default
4. Set BirthDate from employee.BirthDate (zero time if nil)
5. Set HasDisability from employee.DisabilityFlag
6. Resolve Basis:
   - If calcGroup is not nil -> use calcGroup.Basis
   - Else fall back to existing `resolveVacationBasis` logic (tenant -> tariff)
7. Build SpecialCalcs:
   - If calcGroup is not nil -> convert each `calcGroup.SpecialCalculations` to `calculation.VacationSpecialCalc{Type, Threshold, BonusDays}`
   - Else empty slice (no bonuses)
8. Set Year and ReferenceDate:
   - If basis is calendar_year: ReferenceDate = Jan 1 of year
   - If basis is entry_date: ReferenceDate = employee's entry anniversary date in that year
9. Return the built input

#### 4.3.5 Rewrite `InitializeYear` to use `buildCalcInput`

Replace current hardcoded logic:

```go
func (s *VacationService) InitializeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	if year < 1900 || year > 2200 {
		return nil, ErrInvalidYear
	}

	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}

	// Resolve calculation group from employment type
	calcGroup := s.resolveCalcGroup(ctx, employee)

	// Build full calculation input
	input := s.buildCalcInput(ctx, employee, year, calcGroup)

	// Calculate entitlement using existing engine
	output := calculation.CalculateVacation(input)

	// ... rest unchanged (upsert balance) ...
}
```

#### 4.3.6 Add `PreviewEntitlement` method

```go
// PreviewEntitlementInput represents input for entitlement preview.
type PreviewEntitlementInput struct {
	EmployeeID         uuid.UUID
	Year               int
	CalcGroupIDOverride *uuid.UUID // Optional: override the employee's default group
}

// PreviewEntitlementOutput contains the preview result.
type PreviewEntitlementOutput struct {
	EmployeeID          uuid.UUID
	EmployeeName        string
	Year                int
	Basis               string
	CalcGroupID         *uuid.UUID
	CalcGroupName       *string
	CalcOutput          calculation.VacationCalcOutput
	WeeklyHours         decimal.Decimal
	StandardWeeklyHours decimal.Decimal
	PartTimeFactor      decimal.Decimal
}

// PreviewEntitlement calculates a vacation entitlement preview without persisting.
func (s *VacationService) PreviewEntitlement(ctx context.Context, input PreviewEntitlementInput) (*PreviewEntitlementOutput, error)
```

Logic:
1. Validate year range
2. Load employee by ID
3. Determine calc group:
   - If `CalcGroupIDOverride` is set -> load that group from repo
   - Else -> call `resolveCalcGroup`
4. Call `buildCalcInput(ctx, employee, year, calcGroup)`
5. Call `calculation.CalculateVacation(calcInput)`
6. Build and return `PreviewEntitlementOutput` with all breakdown fields + metadata

### 4.4 Business Logic Details

#### Standard Calculation
- Base vacation days come from `employee.VacationDaysPerYear` (set from tariff's AnnualVacationDays)
- Full-year value is always stored; system handles pro-rating

#### Proration Formula
- Count months employed in the year period (calendar year or entry-date year)
- `prorated = baseVacationDays * (monthsEmployed / 12)`
- Partial months count as full months per ZMI convention

#### Calendar Year vs Entry Date Basis
- **Calendar year**: Period is Jan 1 - Dec 31 of the given year
- **Entry date**: Period starts on employee's hire anniversary date in the given year, ends one year later minus one day
- The basis is set on the VacationCalculationGroup. If no group is assigned, fallback to tariff -> tenant level basis

#### Special Calculation Types

1. **Age** (`type = "age"`):
   - Threshold = minimum age in years
   - If employee's age at reference date >= threshold, add bonus_days
   - Example: threshold=50, bonus_days=2.0 => employee age 52 gets +2 days
   - Multiple age thresholds can stack (e.g., 50 -> +1, 55 -> +1 = +2 total)

2. **Tenure** (`type = "tenure"`):
   - Threshold = minimum years of service
   - If employee's tenure at reference date >= threshold, add bonus_days
   - Example: threshold=5, bonus_days=1.0 => employee with 7 years gets +1 day
   - Multiple tenure thresholds can stack (e.g., 5 -> +1, 10 -> +2 = +3 total)

3. **Disability** (`type = "disability"`):
   - Threshold is always 0 (ignored in calculation)
   - If employee.DisabilityFlag is true, add bonus_days
   - Example: bonus_days=5.0 => disabled employee gets +5 days

#### Calculation Groups
- A group defines: a basis (calendar_year or entry_date) + a set of special calculations
- The group is linked to an employment type via `employment_types.vacation_calc_group_id`
- When calculating for an employee:
  1. Look up employee's employment type
  2. Get the employment type's vacation_calc_group_id
  3. Load the group with its special calculations
  4. Use the group's basis and special calculations in the calculation input

#### Part-Time Adjustment Formula
- `partTimeFactor = employee.WeeklyHours / tariff.WeeklyTargetHours`
- `partTimeAdjusted = proRatedEntitlement * partTimeFactor`
- Example: 30 days base, 20 hours / 40 standard = 0.5 factor => 15 days
- If StandardWeeklyHours is 0 or not set, no adjustment is applied (factor = 1.0)

#### Preview Endpoint Computation Flow
1. Receive `{employee_id, year, calculation_group_id?}`
2. Load employee from DB
3. Resolve calculation group:
   a. If `calculation_group_id` is provided, use that group
   b. Else, look up employee -> employment type -> vacation_calc_group_id -> group
   c. If no group found, use defaults (no special calcs, fallback basis)
4. Load tariff for StandardWeeklyHours
5. Build `VacationCalcInput` with all fields
6. Call `CalculateVacation(input)` (existing engine)
7. Return `VacationCalcOutput` + metadata (employee name, group info, input values)

### 4.5 Verification Steps

```bash
cd apps/api && go build ./internal/service/...
```

---

## Phase 5: Handler Layer

### 5.1 VacationSpecialCalc Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationspecialcalc.go`

```go
package handler

// VacationSpecialCalcHandler handles vacation special calculation HTTP requests.
type VacationSpecialCalcHandler struct {
	svc          *service.VacationSpecialCalcService
	auditService *service.AuditLogService
}

func NewVacationSpecialCalcHandler(svc *service.VacationSpecialCalcService) *VacationSpecialCalcHandler
func (h *VacationSpecialCalcHandler) SetAuditService(s *service.AuditLogService)

// List handles GET /vacation-special-calculations
// Supports query params: active_only (bool), type (string filter)
func (h *VacationSpecialCalcHandler) List(w http.ResponseWriter, r *http.Request)

// Get handles GET /vacation-special-calculations/{id}
func (h *VacationSpecialCalcHandler) Get(w http.ResponseWriter, r *http.Request)

// Create handles POST /vacation-special-calculations
// Decodes gen/models.CreateVacationSpecialCalculationRequest
func (h *VacationSpecialCalcHandler) Create(w http.ResponseWriter, r *http.Request)

// Update handles PATCH /vacation-special-calculations/{id}
// Decodes gen/models.UpdateVacationSpecialCalculationRequest
func (h *VacationSpecialCalcHandler) Update(w http.ResponseWriter, r *http.Request)

// Delete handles DELETE /vacation-special-calculations/{id}
func (h *VacationSpecialCalcHandler) Delete(w http.ResponseWriter, r *http.Request)

// Helper: vacationSpecialCalcToResponse converts model to generated API response
func vacationSpecialCalcToResponse(sc *model.VacationSpecialCalculation) *models.VacationSpecialCalculation

// Helper: vacationSpecialCalcListToResponse converts list
func vacationSpecialCalcListToResponse(calcs []model.VacationSpecialCalculation) models.VacationSpecialCalculationList

// Helper: handleVacationSpecialCalcError maps service errors to HTTP responses
func handleVacationSpecialCalcError(w http.ResponseWriter, err error)
```

Handler pattern (same as CalculationRuleHandler):
1. Extract tenant ID from context
2. Parse path/query params
3. Decode JSON body into generated request model
4. Build service input struct
5. Call service method
6. Handle errors with switch on sentinel errors
7. Map model to API response
8. Respond with `respondJSON(w, status, response)`

Error mapping:
- `ErrVacationSpecialCalcNotFound` -> 404
- `ErrVacationSpecialCalcTypeRequired` -> 400
- `ErrVacationSpecialCalcTypeInvalid` -> 400
- `ErrVacationSpecialCalcBonusRequired` -> 400
- `ErrVacationSpecialCalcInvalidThreshold` -> 400
- `ErrVacationSpecialCalcDuplicate` -> 409
- `ErrVacationSpecialCalcInUse` -> 409

### 5.2 VacationCalcGroup Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationcalcgroup.go`

```go
package handler

// VacationCalcGroupHandler handles vacation calculation group HTTP requests.
type VacationCalcGroupHandler struct {
	svc          *service.VacationCalcGroupService
	auditService *service.AuditLogService
}

func NewVacationCalcGroupHandler(svc *service.VacationCalcGroupService) *VacationCalcGroupHandler
func (h *VacationCalcGroupHandler) SetAuditService(s *service.AuditLogService)

// List handles GET /vacation-calculation-groups
func (h *VacationCalcGroupHandler) List(w http.ResponseWriter, r *http.Request)

// Get handles GET /vacation-calculation-groups/{id}
func (h *VacationCalcGroupHandler) Get(w http.ResponseWriter, r *http.Request)

// Create handles POST /vacation-calculation-groups
func (h *VacationCalcGroupHandler) Create(w http.ResponseWriter, r *http.Request)

// Update handles PATCH /vacation-calculation-groups/{id}
func (h *VacationCalcGroupHandler) Update(w http.ResponseWriter, r *http.Request)

// Delete handles DELETE /vacation-calculation-groups/{id}
func (h *VacationCalcGroupHandler) Delete(w http.ResponseWriter, r *http.Request)

// Helpers
func vacationCalcGroupToResponse(g *model.VacationCalculationGroup) *models.VacationCalculationGroup
func vacationCalcGroupListToResponse(groups []model.VacationCalculationGroup) models.VacationCalculationGroupList
func handleVacationCalcGroupError(w http.ResponseWriter, err error)
```

The response mapper (`vacationCalcGroupToResponse`) must also map the nested `SpecialCalculations` slice to `VacationSpecialCalculationSummary` objects in the response.

Error mapping:
- `ErrVacationCalcGroupNotFound` -> 404
- `ErrVacationCalcGroupCodeRequired` -> 400
- `ErrVacationCalcGroupNameRequired` -> 400
- `ErrVacationCalcGroupInvalidBasis` -> 400
- `ErrVacationCalcGroupCodeExists` -> 409
- `ErrVacationCalcGroupInUse` -> 409
- `ErrSpecialCalcNotFound` -> 400

### 5.3 Vacation Entitlement Preview Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacation.go` (MODIFY)

Add to existing `VacationHandler`:

```go
// PreviewEntitlement handles POST /vacation-entitlement/preview
func (h *VacationHandler) PreviewEntitlement(w http.ResponseWriter, r *http.Request) {
	// 1. Extract tenant ID from context
	// 2. Decode gen/models.VacationEntitlementPreviewRequest
	// 3. Parse employee_id, year, optional calculation_group_id
	// 4. Build service.PreviewEntitlementInput
	// 5. Call vacationService.PreviewEntitlement
	// 6. Map output to gen/models.VacationEntitlementPreview response
	// 7. Respond with 200 OK
}
```

Response mapping builds `models.VacationEntitlementPreview` from `PreviewEntitlementOutput`:
- All breakdown fields from `CalcOutput` (base, prorated, part-time, bonuses, total, months, age, tenure)
- Metadata: employee_id, employee_name, year, basis, group info
- Computed: `partTimeFactor = weeklyHours / standardWeeklyHours`

### 5.4 Route Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (MODIFY)

Add after `RegisterCorrectionAssistantRoutes`:

```go
// RegisterVacationSpecialCalcRoutes registers vacation special calculation routes.
func RegisterVacationSpecialCalcRoutes(r chi.Router, h *VacationSpecialCalcHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/vacation-special-calculations", func(r chi.Router) {
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

// RegisterVacationCalcGroupRoutes registers vacation calculation group routes.
func RegisterVacationCalcGroupRoutes(r chi.Router, h *VacationCalcGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/vacation-calculation-groups", func(r chi.Router) {
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

// RegisterVacationEntitlementRoutes registers vacation entitlement preview routes.
func RegisterVacationEntitlementRoutes(r chi.Router, h *VacationHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	if authz == nil {
		r.Post("/vacation-entitlement/preview", h.PreviewEntitlement)
		return
	}
	r.With(authz.RequirePermission(permManage)).Post("/vacation-entitlement/preview", h.PreviewEntitlement)
}
```

### 5.5 main.go Wiring

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go` (MODIFY)

Add after the correctionAssistantHandler wiring (around line 213):

```go
// Vacation special calculations
vacationSpecialCalcRepo := repository.NewVacationSpecialCalcRepository(db)
vacationSpecialCalcService := service.NewVacationSpecialCalcService(vacationSpecialCalcRepo)
vacationSpecialCalcHandler := handler.NewVacationSpecialCalcHandler(vacationSpecialCalcService)

// Vacation calculation groups
vacationCalcGroupRepo := repository.NewVacationCalcGroupRepository(db)
vacationCalcGroupService := service.NewVacationCalcGroupService(vacationCalcGroupRepo, vacationSpecialCalcRepo)
vacationCalcGroupHandler := handler.NewVacationCalcGroupHandler(vacationCalcGroupService)
```

Update the existing VacationService initialization to include the new repos:
```go
// Update existing VacationService construction to pass new repos
vacationService := service.NewVacationService(
	vacationBalanceRepo,
	absenceDayRepo,
	absenceTypeRepo,
	employeeRepo,
	tenantRepo,
	tariffRepo,
	employmentTypeRepo,     // NEW parameter
	vacationCalcGroupRepo,  // NEW parameter
	decimal.Zero,
)
```

Add route registrations in the tenant-scoped route group (around line 318):
```go
handler.RegisterVacationSpecialCalcRoutes(r, vacationSpecialCalcHandler, authzMiddleware)
handler.RegisterVacationCalcGroupRoutes(r, vacationCalcGroupHandler, authzMiddleware)
handler.RegisterVacationEntitlementRoutes(r, vacationHandler, authzMiddleware)
```

Wire audit service:
```go
vacationSpecialCalcHandler.SetAuditService(auditLogService)
vacationCalcGroupHandler.SetAuditService(auditLogService)
```

### 5.6 Verification Steps

```bash
cd apps/api && go build ./...
make swagger-bundle
```

---

## Phase 6: Tests

### 6.1 VacationSpecialCalc Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacationspecialcalc_test.go`

Uses integration pattern with `testutil.SetupTestDB(t)`:

```go
func TestVacationSpecialCalcService_Create_AgeType(t *testing.T)
	// Create age type with threshold=50, bonus_days=2.0
	// Assert: type="age", threshold=50, bonus_days=2.0, is_active=true

func TestVacationSpecialCalcService_Create_TenureType(t *testing.T)
	// Create tenure type with threshold=5, bonus_days=1.0

func TestVacationSpecialCalcService_Create_DisabilityType(t *testing.T)
	// Create disability type, threshold must be 0, bonus_days=5.0

func TestVacationSpecialCalcService_Create_InvalidType(t *testing.T)
	// Use type="invalid" -> expect ErrVacationSpecialCalcTypeInvalid

func TestVacationSpecialCalcService_Create_InvalidThreshold_DisabilityNonZero(t *testing.T)
	// Use type="disability", threshold=10 -> expect ErrVacationSpecialCalcInvalidThreshold

func TestVacationSpecialCalcService_Create_InvalidThreshold_AgeZero(t *testing.T)
	// Use type="age", threshold=0 -> expect ErrVacationSpecialCalcInvalidThreshold

func TestVacationSpecialCalcService_Create_Duplicate(t *testing.T)
	// Create same tenant+type+threshold twice -> expect ErrVacationSpecialCalcDuplicate

func TestVacationSpecialCalcService_Create_InvalidBonusDays(t *testing.T)
	// bonus_days=0 or negative -> expect ErrVacationSpecialCalcBonusRequired

func TestVacationSpecialCalcService_Update_Success(t *testing.T)
	// Update bonus_days from 2.0 to 3.0

func TestVacationSpecialCalcService_Delete_Success(t *testing.T)

func TestVacationSpecialCalcService_Delete_InUse(t *testing.T)
	// Create a group that references this calc -> expect ErrVacationSpecialCalcInUse

func TestVacationSpecialCalcService_List(t *testing.T)
	// Create multiple, verify list returns all
```

### 6.2 VacationCalcGroup Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacationcalcgroup_test.go`

```go
func TestVacationCalcGroupService_Create_Success(t *testing.T)
	// Create group with code="STANDARD", basis="calendar_year", with 2 special calc IDs
	// Assert: group created, special calculations are loaded in response

func TestVacationCalcGroupService_Create_WithEntryDateBasis(t *testing.T)
	// basis="entry_date"

func TestVacationCalcGroupService_Create_CodeRequired(t *testing.T)
	// Empty code -> expect error

func TestVacationCalcGroupService_Create_DuplicateCode(t *testing.T)
	// Same tenant+code -> expect ErrVacationCalcGroupCodeExists

func TestVacationCalcGroupService_Create_InvalidBasis(t *testing.T)
	// basis="invalid" -> expect ErrVacationCalcGroupInvalidBasis

func TestVacationCalcGroupService_Create_InvalidSpecialCalcIDs(t *testing.T)
	// Reference non-existent special calc IDs -> expect ErrSpecialCalcNotFound

func TestVacationCalcGroupService_Update_ChangeSpecialCalcs(t *testing.T)
	// Replace linked special calcs with new set

func TestVacationCalcGroupService_Update_ChangeBasis(t *testing.T)
	// Change basis from calendar_year to entry_date

func TestVacationCalcGroupService_Delete_Success(t *testing.T)

func TestVacationCalcGroupService_Delete_InUse(t *testing.T)
	// Create employment type with group -> expect ErrVacationCalcGroupInUse

func TestVacationCalcGroupService_List(t *testing.T)
```

### 6.3 Vacation Preview Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation_preview_test.go`

Uses mock-based testing (extends existing vacation_test.go pattern):

```go
func TestVacationService_PreviewEntitlement_CalendarYear(t *testing.T)
	// Employee: entry 2026-03-01, annual=30, basis=calendar_year
	// Expected: prorated for Mar-Dec (10/12 of 30 = 25.0)
	// Ticket test case #1

func TestVacationService_PreviewEntitlement_EntryDateBasis(t *testing.T)
	// Employee: entry 2026-03-01, basis=entry_date
	// Expected: full 12 months in entry-date year
	// Ticket test case #2

func TestVacationService_PreviewEntitlement_AgeBonus(t *testing.T)
	// Employee born 1976-01-01, year=2026 -> age 50
	// Special calc: age threshold=50, bonus=2.0
	// Expected: includes +2 age bonus
	// Ticket test case #3

func TestVacationService_PreviewEntitlement_DisabilityBonus(t *testing.T)
	// Employee with disability=true
	// Special calc: disability, bonus=5.0
	// Expected: includes +5 disability bonus
	// Ticket test case #4

func TestVacationService_PreviewEntitlement_PartTime(t *testing.T)
	// Employee: weekly_hours=20, standard=40
	// Expected: entitlement * 0.5

func TestVacationService_PreviewEntitlement_AllBonusesCombined(t *testing.T)
	// Employee: age >=50 (+2), tenure >=5 (+1), disability (+5)
	// Expected: all bonuses stacked

func TestVacationService_PreviewEntitlement_NoCalcGroup(t *testing.T)
	// Employee without employment type -> fallback to no special calcs

func TestVacationService_PreviewEntitlement_CalcGroupOverride(t *testing.T)
	// Pass explicit calculation_group_id override -> uses that group

func TestVacationService_PreviewEntitlement_InvalidYear(t *testing.T)
	// Year 0 -> expect ErrInvalidYear

func TestVacationService_PreviewEntitlement_EmployeeNotFound(t *testing.T)
	// Non-existent employee ID -> expect error
```

### 6.4 Handler Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationspecialcalc_test.go`

```go
func setupVacationSpecialCalcHandler(t *testing.T) (*handler.VacationSpecialCalcHandler, *model.Tenant, *repository.DB)

func TestVacationSpecialCalcHandler_Create_Success(t *testing.T)
	// POST /vacation-special-calculations with valid body -> 201

func TestVacationSpecialCalcHandler_Create_InvalidBody(t *testing.T)
	// Invalid JSON -> 400

func TestVacationSpecialCalcHandler_Get_Success(t *testing.T)
	// GET /vacation-special-calculations/{id} -> 200

func TestVacationSpecialCalcHandler_Get_NotFound(t *testing.T)
	// Non-existent ID -> 404

func TestVacationSpecialCalcHandler_List_Success(t *testing.T)
	// GET /vacation-special-calculations -> 200 with data array

func TestVacationSpecialCalcHandler_Update_Success(t *testing.T)
	// PATCH /vacation-special-calculations/{id} -> 200

func TestVacationSpecialCalcHandler_Delete_Success(t *testing.T)
	// DELETE /vacation-special-calculations/{id} -> 204

func TestVacationSpecialCalcHandler_Delete_InUse(t *testing.T)
	// DELETE when in use -> 409
```

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacationcalcgroup_test.go`

```go
func setupVacationCalcGroupHandler(t *testing.T) (*handler.VacationCalcGroupHandler, *model.Tenant, *repository.DB)

func TestVacationCalcGroupHandler_Create_Success(t *testing.T)
	// POST with special_calculation_ids -> 201, response includes nested special calcs

func TestVacationCalcGroupHandler_Get_Success(t *testing.T)
	// GET -> 200, response includes nested special calcs

func TestVacationCalcGroupHandler_List_Success(t *testing.T)
	// GET /vacation-calculation-groups -> 200

func TestVacationCalcGroupHandler_Update_ReplaceSpecialCalcs(t *testing.T)
	// PATCH with new special_calculation_ids -> 200, verify replacement

func TestVacationCalcGroupHandler_Delete_Success(t *testing.T)
	// DELETE -> 204

func TestVacationCalcGroupHandler_Delete_InUse(t *testing.T)
	// DELETE when assigned to employment type -> 409
```

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/vacation_preview_test.go`

```go
func TestVacationHandler_PreviewEntitlement_Success(t *testing.T)
	// POST /vacation-entitlement/preview -> 200
	// Verify breakdown fields in response

func TestVacationHandler_PreviewEntitlement_WithOverride(t *testing.T)
	// POST with calculation_group_id override -> 200

func TestVacationHandler_PreviewEntitlement_EmployeeNotFound(t *testing.T)
	// Non-existent employee -> 404
```

### 6.5 Integration Test: Full Flow

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation_integration_test.go`

```go
func TestVacationIntegration_InitializeYearWithCalcGroup(t *testing.T)
	// 1. Create special calculations (age threshold=50 +2 days, disability +5 days)
	// 2. Create calculation group with basis=calendar_year, link both special calcs
	// 3. Create employment type with vacation_calc_group_id
	// 4. Create employee (born 1970, entry 2024, disability=true, weekly_hours=40, employment_type_id set)
	// 5. Call InitializeYear(employee, 2026)
	// 6. Assert: total includes age bonus (+2) and disability bonus (+5)
	// 7. Verify balance stored in DB matches
```

### 6.6 Verification Steps

```bash
# Run all new tests
cd apps/api && go test -v -run TestVacationSpecialCalc ./internal/service/...
cd apps/api && go test -v -run TestVacationCalcGroup ./internal/service/...
cd apps/api && go test -v -run TestVacationService_Preview ./internal/service/...
cd apps/api && go test -v -run TestVacationIntegration ./internal/service/...
cd apps/api && go test -v -run TestVacationSpecialCalcHandler ./internal/handler/...
cd apps/api && go test -v -run TestVacationCalcGroupHandler ./internal/handler/...
cd apps/api && go test -v -run TestVacationHandler_Preview ./internal/handler/...

# Run full test suite
make test
```

---

## File Summary

### Files to Create

| # | File | Layer | Description |
|---|------|-------|-------------|
| 1 | `db/migrations/000048_create_vacation_special_calculations.up.sql` | Migration | Special calculations table |
| 2 | `db/migrations/000048_create_vacation_special_calculations.down.sql` | Migration | Drop table |
| 3 | `db/migrations/000049_create_vacation_calculation_groups.up.sql` | Migration | Groups + junction + employment type FK |
| 4 | `db/migrations/000049_create_vacation_calculation_groups.down.sql` | Migration | Reverse all |
| 5 | `apps/api/internal/model/vacationspecialcalc.go` | Model | VacationSpecialCalculation GORM struct |
| 6 | `apps/api/internal/model/vacationcalcgroup.go` | Model | VacationCalculationGroup + junction GORM structs |
| 7 | `apps/api/internal/repository/vacationspecialcalc.go` | Repository | Special calculation CRUD + usage count |
| 8 | `apps/api/internal/repository/vacationcalcgroup.go` | Repository | Group CRUD + junction management |
| 9 | `apps/api/internal/service/vacationspecialcalc.go` | Service | Special calculation business logic |
| 10 | `apps/api/internal/service/vacationcalcgroup.go` | Service | Group business logic |
| 11 | `apps/api/internal/handler/vacationspecialcalc.go` | Handler | Special calculation HTTP handlers |
| 12 | `apps/api/internal/handler/vacationcalcgroup.go` | Handler | Group HTTP handlers |
| 13 | `api/schemas/vacation-special-calculations.yaml` | OpenAPI | Special calculation schemas |
| 14 | `api/schemas/vacation-calculation-groups.yaml` | OpenAPI | Group schemas |
| 15 | `api/schemas/vacation-entitlement.yaml` | OpenAPI | Preview request/response schemas |
| 16 | `api/paths/vacation-special-calculations.yaml` | OpenAPI | Special calculation endpoints |
| 17 | `api/paths/vacation-calculation-groups.yaml` | OpenAPI | Group endpoints |
| 18 | `api/paths/vacation-entitlement.yaml` | OpenAPI | Preview endpoint |
| 19 | `apps/api/internal/service/vacationspecialcalc_test.go` | Test | Special calc service tests |
| 20 | `apps/api/internal/service/vacationcalcgroup_test.go` | Test | Group service tests |
| 21 | `apps/api/internal/service/vacation_preview_test.go` | Test | Preview service tests |
| 22 | `apps/api/internal/service/vacation_integration_test.go` | Test | Full integration test |
| 23 | `apps/api/internal/handler/vacationspecialcalc_test.go` | Test | Special calc handler tests |
| 24 | `apps/api/internal/handler/vacationcalcgroup_test.go` | Test | Group handler tests |
| 25 | `apps/api/internal/handler/vacation_preview_test.go` | Test | Preview handler test |

### Files to Modify

| # | File | Changes |
|---|------|---------|
| 1 | `apps/api/internal/model/employmenttype.go` | Add `VacationCalcGroupID *uuid.UUID` field and `VacationCalcGroup` relation |
| 2 | `apps/api/internal/service/vacation.go` | Add new repo interfaces, extend struct, add `resolveCalcGroup`, `buildCalcInput`, `PreviewEntitlement`; rewrite `InitializeYear` to use full config |
| 3 | `apps/api/internal/handler/vacation.go` | Add `PreviewEntitlement` handler method |
| 4 | `apps/api/internal/handler/routes.go` | Add `RegisterVacationSpecialCalcRoutes`, `RegisterVacationCalcGroupRoutes`, `RegisterVacationEntitlementRoutes` |
| 5 | `apps/api/cmd/server/main.go` | Wire new repos/services/handlers, update VacationService constructor, register routes |
| 6 | `api/openapi.yaml` | Add tags, path references, and definition references |

---

## Implementation Order

1. **Phase 1** (Migration + Models): Create tables and GORM structs. Verify: `make migrate-up && go build ./...`
2. **Phase 2** (OpenAPI): Create specs, bundle, generate. Verify: `make swagger-bundle && make generate && go build ./...`
3. **Phase 3** (Repository): Implement data access. Verify: `go build ./internal/repository/...`
4. **Phase 4** (Service): Implement business logic + extend VacationService. Verify: `go build ./internal/service/...`
5. **Phase 5** (Handler): Implement HTTP layer, wiring. Verify: `go build ./...`
6. **Phase 6** (Tests): Write and run all tests. Verify: `make test`
