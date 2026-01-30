# Implementation Plan: ZMI-TICKET-030 Travel Allowance (Ausloese)

## Summary

Implement travel allowance (per diem) configuration and calculation preview for the ZMI Ausloese module. This covers three database entities -- travel allowance rule sets (parent container), local travel rules (Nahmontage, same-day trips), and extended travel rules (Fernmontage, multi-day trips) -- plus a preview calculation endpoint. The feature follows the established clean architecture pattern (model / repository / service / handler) with OpenAPI-first design.

**Scope boundaries from ticket:** Data model and configuration per manual section 10.14. Full behavioral parity is out of scope until detailed Ausloese documentation is available.

---

## Phases

### Phase 1: Database Migration

**Files to create:**
- `db/migrations/000075_create_travel_allowance.up.sql`
- `db/migrations/000075_create_travel_allowance.down.sql`

**Up migration (`000075_create_travel_allowance.up.sql`):**

```sql
-- Travel allowance rule sets (configuration containers per ZMI manual 10.14)
CREATE TABLE travel_allowance_rule_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    valid_from DATE,
    valid_to DATE,
    calculation_basis VARCHAR(20) DEFAULT 'per_day',
    distance_rule VARCHAR(20) DEFAULT 'longest',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_travel_allowance_rule_sets_tenant ON travel_allowance_rule_sets(tenant_id);

CREATE TRIGGER update_travel_allowance_rule_sets_updated_at
    BEFORE UPDATE ON travel_allowance_rule_sets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE travel_allowance_rule_sets IS 'Travel allowance (Ausloese) rule set containers with validity period and calculation options (ZMI manual 10.14)';

-- Local travel rules (Nahmontage - same-day trips, ZMI manual 10.14.1)
CREATE TABLE local_travel_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_set_id UUID NOT NULL REFERENCES travel_allowance_rule_sets(id) ON DELETE CASCADE,
    min_distance_km NUMERIC(10,2) DEFAULT 0,
    max_distance_km NUMERIC(10,2),
    min_duration_minutes INTEGER DEFAULT 0,
    max_duration_minutes INTEGER,
    tax_free_amount NUMERIC(10,2) DEFAULT 0,
    taxable_amount NUMERIC(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_local_travel_rules_tenant ON local_travel_rules(tenant_id);
CREATE INDEX idx_local_travel_rules_rule_set ON local_travel_rules(rule_set_id);

CREATE TRIGGER update_local_travel_rules_updated_at
    BEFORE UPDATE ON local_travel_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE local_travel_rules IS 'Local travel (Nahmontage) rules: distance/duration ranges with tax-free and taxable amounts (ZMI manual 10.14.1)';

-- Extended travel rules (Fernmontage - multi-day trips, ZMI manual 10.14.2)
CREATE TABLE extended_travel_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_set_id UUID NOT NULL REFERENCES travel_allowance_rule_sets(id) ON DELETE CASCADE,
    arrival_day_tax_free NUMERIC(10,2) DEFAULT 0,
    arrival_day_taxable NUMERIC(10,2) DEFAULT 0,
    departure_day_tax_free NUMERIC(10,2) DEFAULT 0,
    departure_day_taxable NUMERIC(10,2) DEFAULT 0,
    intermediate_day_tax_free NUMERIC(10,2) DEFAULT 0,
    intermediate_day_taxable NUMERIC(10,2) DEFAULT 0,
    three_month_enabled BOOLEAN DEFAULT false,
    three_month_tax_free NUMERIC(10,2) DEFAULT 0,
    three_month_taxable NUMERIC(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_extended_travel_rules_tenant ON extended_travel_rules(tenant_id);
CREATE INDEX idx_extended_travel_rules_rule_set ON extended_travel_rules(rule_set_id);

CREATE TRIGGER update_extended_travel_rules_updated_at
    BEFORE UPDATE ON extended_travel_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE extended_travel_rules IS 'Extended travel (Fernmontage) rules: arrival/departure/intermediate day rates with three-month rule (ZMI manual 10.14.2)';
```

**Down migration (`000075_create_travel_allowance.down.sql`):**

```sql
DROP TABLE IF EXISTS extended_travel_rules;
DROP TABLE IF EXISTS local_travel_rules;
DROP TABLE IF EXISTS travel_allowance_rule_sets;
```

**Column explanations:**
- `calculation_basis`: `'per_day'` or `'per_booking'` -- controls whether allowance is calculated per calendar day or per booking entry (ZMI manual 10.14.1 Calculation Options)
- `distance_rule`: `'longest'`, `'shortest'`, `'first'`, `'last'` -- which distance to use when multiple stops exist (ZMI manual 10.14.1 Calculation Options)
- `min_distance_km` / `max_distance_km`: Distance range in kilometers (NULL max means unlimited upper bound)
- `min_duration_minutes` / `max_duration_minutes`: Duration threshold in minutes (NULL max means unlimited upper bound)
- `three_month_enabled`: Whether the three-month rule (Dreimonatsberechnung) applies for same-location extended trips
- `three_month_tax_free` / `three_month_taxable`: Reduced rates after three months at the same location

**Verification:** Run `make migrate-up` and verify tables exist with correct columns.

---

### Phase 2: OpenAPI Specification

**Files to create:**
- `api/schemas/travel-allowance.yaml`
- `api/paths/travel-allowance.yaml`

**File to modify:**
- `api/openapi.yaml`

#### 2a. Schema definitions (`api/schemas/travel-allowance.yaml`)

Define schemas for all three entities plus preview request/response. Follow the pattern from `api/schemas/vehicles.yaml`:

```yaml
# Travel Allowance Rule Set schemas
TravelAllowanceRuleSet:
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
      example: "TA-2026"
    name:
      type: string
      example: "Standard Travel Allowance 2026"
    description:
      type: string
      x-nullable: true
    valid_from:
      type: string
      format: date
      x-nullable: true
    valid_to:
      type: string
      format: date
      x-nullable: true
    calculation_basis:
      type: string
      enum: [per_day, per_booking]
      example: "per_day"
    distance_rule:
      type: string
      enum: [longest, shortest, first, last]
      example: "longest"
    is_active:
      type: boolean
      example: true
    sort_order:
      type: integer
      example: 0
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateTravelAllowanceRuleSetRequest:
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
    valid_from:
      type: string
      format: date
    valid_to:
      type: string
      format: date
    calculation_basis:
      type: string
      enum: [per_day, per_booking]
    distance_rule:
      type: string
      enum: [longest, shortest, first, last]
    sort_order:
      type: integer

UpdateTravelAllowanceRuleSetRequest:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    valid_from:
      type: string
      format: date
    valid_to:
      type: string
      format: date
    calculation_basis:
      type: string
      enum: [per_day, per_booking]
    distance_rule:
      type: string
      enum: [longest, shortest, first, last]
    is_active:
      type: boolean
    sort_order:
      type: integer

TravelAllowanceRuleSetList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/TravelAllowanceRuleSet'

# Local Travel Rule schemas (Nahmontage)
LocalTravelRule:
  type: object
  required:
    - id
    - tenant_id
    - rule_set_id
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    rule_set_id:
      type: string
      format: uuid
    min_distance_km:
      type: number
      format: double
      example: 0
    max_distance_km:
      type: number
      format: double
      x-nullable: true
      example: 50
    min_duration_minutes:
      type: integer
      example: 0
    max_duration_minutes:
      type: integer
      x-nullable: true
      example: 480
    tax_free_amount:
      type: number
      format: double
      example: 14.00
    taxable_amount:
      type: number
      format: double
      example: 6.00
    is_active:
      type: boolean
      example: true
    sort_order:
      type: integer
      example: 0
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateLocalTravelRuleRequest:
  type: object
  required:
    - rule_set_id
  properties:
    rule_set_id:
      type: string
      format: uuid
    min_distance_km:
      type: number
      format: double
    max_distance_km:
      type: number
      format: double
    min_duration_minutes:
      type: integer
    max_duration_minutes:
      type: integer
    tax_free_amount:
      type: number
      format: double
    taxable_amount:
      type: number
      format: double
    sort_order:
      type: integer

UpdateLocalTravelRuleRequest:
  type: object
  properties:
    min_distance_km:
      type: number
      format: double
    max_distance_km:
      type: number
      format: double
    min_duration_minutes:
      type: integer
    max_duration_minutes:
      type: integer
    tax_free_amount:
      type: number
      format: double
    taxable_amount:
      type: number
      format: double
    is_active:
      type: boolean
    sort_order:
      type: integer

LocalTravelRuleList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/LocalTravelRule'

# Extended Travel Rule schemas (Fernmontage)
ExtendedTravelRule:
  type: object
  required:
    - id
    - tenant_id
    - rule_set_id
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    rule_set_id:
      type: string
      format: uuid
    arrival_day_tax_free:
      type: number
      format: double
      example: 14.00
    arrival_day_taxable:
      type: number
      format: double
      example: 6.00
    departure_day_tax_free:
      type: number
      format: double
      example: 14.00
    departure_day_taxable:
      type: number
      format: double
      example: 6.00
    intermediate_day_tax_free:
      type: number
      format: double
      example: 28.00
    intermediate_day_taxable:
      type: number
      format: double
      example: 12.00
    three_month_enabled:
      type: boolean
      example: false
    three_month_tax_free:
      type: number
      format: double
      example: 14.00
    three_month_taxable:
      type: number
      format: double
      example: 6.00
    is_active:
      type: boolean
      example: true
    sort_order:
      type: integer
      example: 0
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateExtendedTravelRuleRequest:
  type: object
  required:
    - rule_set_id
  properties:
    rule_set_id:
      type: string
      format: uuid
    arrival_day_tax_free:
      type: number
      format: double
    arrival_day_taxable:
      type: number
      format: double
    departure_day_tax_free:
      type: number
      format: double
    departure_day_taxable:
      type: number
      format: double
    intermediate_day_tax_free:
      type: number
      format: double
    intermediate_day_taxable:
      type: number
      format: double
    three_month_enabled:
      type: boolean
    three_month_tax_free:
      type: number
      format: double
    three_month_taxable:
      type: number
      format: double
    sort_order:
      type: integer

UpdateExtendedTravelRuleRequest:
  type: object
  properties:
    arrival_day_tax_free:
      type: number
      format: double
    arrival_day_taxable:
      type: number
      format: double
    departure_day_tax_free:
      type: number
      format: double
    departure_day_taxable:
      type: number
      format: double
    intermediate_day_tax_free:
      type: number
      format: double
    intermediate_day_taxable:
      type: number
      format: double
    three_month_enabled:
      type: boolean
    three_month_tax_free:
      type: number
      format: double
    three_month_taxable:
      type: number
      format: double
    is_active:
      type: boolean
    sort_order:
      type: integer

ExtendedTravelRuleList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/ExtendedTravelRule'

# Travel Allowance Preview schemas
TravelAllowancePreviewRequest:
  type: object
  required:
    - rule_set_id
    - trip_type
  properties:
    rule_set_id:
      type: string
      format: uuid
      description: "Rule set to apply for the calculation"
    trip_type:
      type: string
      enum: [local, extended]
      description: "Type of trip: local (Nahmontage) or extended (Fernmontage)"
    distance_km:
      type: number
      format: double
      description: "Trip distance in kilometers (required for local trips)"
    duration_minutes:
      type: integer
      description: "Trip duration in minutes (required for local trips)"
    start_date:
      type: string
      format: date
      description: "Trip start date (required for extended trips)"
    end_date:
      type: string
      format: date
      description: "Trip end date (required for extended trips)"
    three_month_active:
      type: boolean
      description: "Whether three-month rule is currently active for extended trips"
      default: false

TravelAllowancePreview:
  type: object
  properties:
    trip_type:
      type: string
      enum: [local, extended]
    rule_set_id:
      type: string
      format: uuid
    rule_set_name:
      type: string
    tax_free_total:
      type: number
      format: double
      description: "Total tax-free amount"
    taxable_total:
      type: number
      format: double
      description: "Total taxable amount"
    total_allowance:
      type: number
      format: double
      description: "Combined total allowance (tax_free + taxable)"
    breakdown:
      type: array
      items:
        $ref: '#/TravelAllowanceBreakdownItem'

TravelAllowanceBreakdownItem:
  type: object
  properties:
    description:
      type: string
      description: "Description of the line item (e.g. 'Arrival day', 'Intermediate day x3')"
    days:
      type: integer
      description: "Number of days this line applies to"
    tax_free_amount:
      type: number
      format: double
    taxable_amount:
      type: number
      format: double
    tax_free_subtotal:
      type: number
      format: double
    taxable_subtotal:
      type: number
      format: double
```

#### 2b. Path definitions (`api/paths/travel-allowance.yaml`)

Follow the pattern from `api/paths/vehicles.yaml`. Define CRUD for all three entities plus the preview endpoint. Use tags:
- `Travel Allowance Rule Sets`
- `Local Travel Rules`
- `Extended Travel Rules`
- `Travel Allowance` (for preview)

Paths to define:
- `/travel-allowance-rule-sets` (GET list, POST create)
- `/travel-allowance-rule-sets/{id}` (GET, PATCH, DELETE)
- `/local-travel-rules` (GET list, POST create)
- `/local-travel-rules/{id}` (GET, PATCH, DELETE)
- `/extended-travel-rules` (GET list, POST create)
- `/extended-travel-rules/{id}` (GET, PATCH, DELETE)
- `/travel-allowance/preview` (POST)

Each CRUD path follows the exact vehicle pattern:
- operationId in camelCase (e.g., `listTravelAllowanceRuleSets`, `createLocalTravelRule`)
- Standard response refs for 401/404/400/409 errors
- Body parameter for POST/PATCH

The preview path follows the vacation carryover preview pattern:
- operationId: `previewTravelAllowance`
- POST with body parameter referencing `TravelAllowancePreviewRequest`
- 200 response referencing `TravelAllowancePreview`

#### 2c. Root spec modifications (`api/openapi.yaml`)

**Tags section** (add after the Trip Records tag, around line 165):
```yaml
  - name: Travel Allowance Rule Sets
    description: Travel allowance (Ausloese) rule set configuration
  - name: Local Travel Rules
    description: Local travel (Nahmontage) rule management for same-day trips
  - name: Extended Travel Rules
    description: Extended travel (Fernmontage) rule management for multi-day trips
  - name: Travel Allowance
    description: Travel allowance preview calculations
```

**Paths section** (add after the trip-records paths, around line 712):
```yaml
  # Travel Allowance Rule Sets
  /travel-allowance-rule-sets:
    $ref: 'paths/travel-allowance.yaml#/~1travel-allowance-rule-sets'
  /travel-allowance-rule-sets/{id}:
    $ref: 'paths/travel-allowance.yaml#/~1travel-allowance-rule-sets~1{id}'

  # Local Travel Rules
  /local-travel-rules:
    $ref: 'paths/travel-allowance.yaml#/~1local-travel-rules'
  /local-travel-rules/{id}:
    $ref: 'paths/travel-allowance.yaml#/~1local-travel-rules~1{id}'

  # Extended Travel Rules
  /extended-travel-rules:
    $ref: 'paths/travel-allowance.yaml#/~1extended-travel-rules'
  /extended-travel-rules/{id}:
    $ref: 'paths/travel-allowance.yaml#/~1extended-travel-rules~1{id}'

  # Travel Allowance Preview
  /travel-allowance/preview:
    $ref: 'paths/travel-allowance.yaml#/~1travel-allowance~1preview'
```

**Definitions section** (add after the TripRecordList definition, around line 1473):
```yaml
  # Travel Allowance Rule Sets
  TravelAllowanceRuleSet:
    $ref: 'schemas/travel-allowance.yaml#/TravelAllowanceRuleSet'
  CreateTravelAllowanceRuleSetRequest:
    $ref: 'schemas/travel-allowance.yaml#/CreateTravelAllowanceRuleSetRequest'
  UpdateTravelAllowanceRuleSetRequest:
    $ref: 'schemas/travel-allowance.yaml#/UpdateTravelAllowanceRuleSetRequest'
  TravelAllowanceRuleSetList:
    $ref: 'schemas/travel-allowance.yaml#/TravelAllowanceRuleSetList'

  # Local Travel Rules
  LocalTravelRule:
    $ref: 'schemas/travel-allowance.yaml#/LocalTravelRule'
  CreateLocalTravelRuleRequest:
    $ref: 'schemas/travel-allowance.yaml#/CreateLocalTravelRuleRequest'
  UpdateLocalTravelRuleRequest:
    $ref: 'schemas/travel-allowance.yaml#/UpdateLocalTravelRuleRequest'
  LocalTravelRuleList:
    $ref: 'schemas/travel-allowance.yaml#/LocalTravelRuleList'

  # Extended Travel Rules
  ExtendedTravelRule:
    $ref: 'schemas/travel-allowance.yaml#/ExtendedTravelRule'
  CreateExtendedTravelRuleRequest:
    $ref: 'schemas/travel-allowance.yaml#/CreateExtendedTravelRuleRequest'
  UpdateExtendedTravelRuleRequest:
    $ref: 'schemas/travel-allowance.yaml#/UpdateExtendedTravelRuleRequest'
  ExtendedTravelRuleList:
    $ref: 'schemas/travel-allowance.yaml#/ExtendedTravelRuleList'

  # Travel Allowance Preview
  TravelAllowancePreviewRequest:
    $ref: 'schemas/travel-allowance.yaml#/TravelAllowancePreviewRequest'
  TravelAllowancePreview:
    $ref: 'schemas/travel-allowance.yaml#/TravelAllowancePreview'
  TravelAllowanceBreakdownItem:
    $ref: 'schemas/travel-allowance.yaml#/TravelAllowanceBreakdownItem'
```

**Verification:** Run `make swagger-bundle` and confirm no errors.

---

### Phase 3: Generated Models

**Command:** `make generate` (runs after Phase 2)

This generates Go models from the bundled OpenAPI spec into `apps/api/gen/models/`. Expected generated files:
- `travel_allowance_rule_set.go`
- `create_travel_allowance_rule_set_request.go`
- `update_travel_allowance_rule_set_request.go`
- `travel_allowance_rule_set_list.go`
- `local_travel_rule.go`
- `create_local_travel_rule_request.go`
- `update_local_travel_rule_request.go`
- `local_travel_rule_list.go`
- `extended_travel_rule.go`
- `create_extended_travel_rule_request.go`
- `update_extended_travel_rule_request.go`
- `extended_travel_rule_list.go`
- `travel_allowance_preview_request.go`
- `travel_allowance_preview.go`
- `travel_allowance_breakdown_item.go`

**Verification:** Run `make generate` and confirm generated files exist in `apps/api/gen/models/` with `Validate()` methods.

---

### Phase 4: Model Layer

**Files to create:**
- `apps/api/internal/model/travel_allowance_rule_set.go`
- `apps/api/internal/model/local_travel_rule.go`
- `apps/api/internal/model/extended_travel_rule.go`

#### 4a. TravelAllowanceRuleSet model

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

type TravelAllowanceRuleSet struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID         uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code             string     `gorm:"type:varchar(50);not null" json:"code"`
	Name             string     `gorm:"type:varchar(255);not null" json:"name"`
	Description      string     `gorm:"type:text" json:"description,omitempty"`
	ValidFrom        *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo          *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
	CalculationBasis string     `gorm:"type:varchar(20);default:'per_day'" json:"calculation_basis"`
	DistanceRule     string     `gorm:"type:varchar(20);default:'longest'" json:"distance_rule"`
	IsActive         bool       `gorm:"default:true" json:"is_active"`
	SortOrder        int        `gorm:"default:0" json:"sort_order"`
	CreatedAt        time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt        time.Time  `gorm:"default:now()" json:"updated_at"`
}

func (TravelAllowanceRuleSet) TableName() string {
	return "travel_allowance_rule_sets"
}
```

#### 4b. LocalTravelRule model

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type LocalTravelRule struct {
	ID                uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID          uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	RuleSetID         uuid.UUID       `gorm:"type:uuid;not null" json:"rule_set_id"`
	MinDistanceKm     decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"min_distance_km"`
	MaxDistanceKm     *decimal.Decimal `gorm:"type:numeric(10,2)" json:"max_distance_km,omitempty"`
	MinDurationMinutes int            `gorm:"default:0" json:"min_duration_minutes"`
	MaxDurationMinutes *int           `json:"max_duration_minutes,omitempty"`
	TaxFreeAmount     decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"tax_free_amount"`
	TaxableAmount     decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"taxable_amount"`
	IsActive          bool            `gorm:"default:true" json:"is_active"`
	SortOrder         int             `gorm:"default:0" json:"sort_order"`
	CreatedAt         time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt         time.Time       `gorm:"default:now()" json:"updated_at"`

	// Associations
	RuleSet *TravelAllowanceRuleSet `gorm:"foreignKey:RuleSetID" json:"rule_set,omitempty"`
}

func (LocalTravelRule) TableName() string {
	return "local_travel_rules"
}
```

#### 4c. ExtendedTravelRule model

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type ExtendedTravelRule struct {
	ID                     uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID               uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	RuleSetID              uuid.UUID       `gorm:"type:uuid;not null" json:"rule_set_id"`
	ArrivalDayTaxFree      decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"arrival_day_tax_free"`
	ArrivalDayTaxable      decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"arrival_day_taxable"`
	DepartureDayTaxFree    decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"departure_day_tax_free"`
	DepartureDayTaxable    decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"departure_day_taxable"`
	IntermediateDayTaxFree decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"intermediate_day_tax_free"`
	IntermediateDayTaxable decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"intermediate_day_taxable"`
	ThreeMonthEnabled      bool            `gorm:"default:false" json:"three_month_enabled"`
	ThreeMonthTaxFree      decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"three_month_tax_free"`
	ThreeMonthTaxable      decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"three_month_taxable"`
	IsActive               bool            `gorm:"default:true" json:"is_active"`
	SortOrder              int             `gorm:"default:0" json:"sort_order"`
	CreatedAt              time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt              time.Time       `gorm:"default:now()" json:"updated_at"`

	// Associations
	RuleSet *TravelAllowanceRuleSet `gorm:"foreignKey:RuleSetID" json:"rule_set,omitempty"`
}

func (ExtendedTravelRule) TableName() string {
	return "extended_travel_rules"
}
```

**Verification:** Compile check -- `cd apps/api && go build ./internal/model/...`

---

### Phase 5: Repository Layer

**Files to create:**
- `apps/api/internal/repository/travel_allowance_rule_set.go`
- `apps/api/internal/repository/local_travel_rule.go`
- `apps/api/internal/repository/extended_travel_rule.go`

Each repository follows the exact pattern from `apps/api/internal/repository/vehicle.go`:

#### 5a. TravelAllowanceRuleSetRepository

Standard CRUD methods:
- `Create(ctx, *model.TravelAllowanceRuleSet) error`
- `GetByID(ctx, uuid.UUID) (*model.TravelAllowanceRuleSet, error)` -- ErrRecordNotFound maps to repo error
- `GetByCode(ctx, tenantID uuid.UUID, code string) (*model.TravelAllowanceRuleSet, error)` -- for code uniqueness
- `List(ctx, tenantID uuid.UUID) ([]model.TravelAllowanceRuleSet, error)` -- tenant-scoped, ordered by `sort_order ASC, code ASC`
- `Update(ctx, *model.TravelAllowanceRuleSet) error`
- `Delete(ctx, uuid.UUID) error`

Error variable: `ErrTravelAllowanceRuleSetNotFound`

#### 5b. LocalTravelRuleRepository

Standard CRUD methods:
- `Create(ctx, *model.LocalTravelRule) error`
- `GetByID(ctx, uuid.UUID) (*model.LocalTravelRule, error)`
- `List(ctx, tenantID uuid.UUID) ([]model.LocalTravelRule, error)` -- ordered by `sort_order ASC`
- `ListByRuleSet(ctx, ruleSetID uuid.UUID) ([]model.LocalTravelRule, error)` -- filter by rule_set_id, ordered by `sort_order ASC, min_distance_km ASC`
- `Update(ctx, *model.LocalTravelRule) error`
- `Delete(ctx, uuid.UUID) error`

Note: `ListByRuleSet` is an **extra method** beyond the standard CRUD pattern. It is needed for the preview calculation to fetch all local rules for a given rule set.

Error variable: `ErrLocalTravelRuleNotFound`

#### 5c. ExtendedTravelRuleRepository

Standard CRUD methods:
- `Create(ctx, *model.ExtendedTravelRule) error`
- `GetByID(ctx, uuid.UUID) (*model.ExtendedTravelRule, error)`
- `List(ctx, tenantID uuid.UUID) ([]model.ExtendedTravelRule, error)` -- ordered by `sort_order ASC`
- `ListByRuleSet(ctx, ruleSetID uuid.UUID) ([]model.ExtendedTravelRule, error)` -- filter by rule_set_id, ordered by `sort_order ASC`
- `Update(ctx, *model.ExtendedTravelRule) error`
- `Delete(ctx, uuid.UUID) error`

Error variable: `ErrExtendedTravelRuleNotFound`

**Verification:** Compile check -- `cd apps/api && go build ./internal/repository/...`

---

### Phase 6: Service Layer

**Files to create:**
- `apps/api/internal/service/travel_allowance_rule_set.go`
- `apps/api/internal/service/local_travel_rule.go`
- `apps/api/internal/service/extended_travel_rule.go`
- `apps/api/internal/service/travel_allowance_preview.go`

#### 6a. TravelAllowanceRuleSetService

Follow the `VehicleService` pattern exactly:

**Error variables:**
```go
var (
	ErrTravelAllowanceRuleSetNotFound     = errors.New("travel allowance rule set not found")
	ErrTravelAllowanceRuleSetCodeRequired = errors.New("travel allowance rule set code is required")
	ErrTravelAllowanceRuleSetNameRequired = errors.New("travel allowance rule set name is required")
	ErrTravelAllowanceRuleSetCodeExists   = errors.New("travel allowance rule set code already exists for this tenant")
)
```

**Repository interface** (unexported, local):
```go
type travelAllowanceRuleSetRepository interface {
	Create(ctx context.Context, rs *model.TravelAllowanceRuleSet) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.TravelAllowanceRuleSet, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.TravelAllowanceRuleSet, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.TravelAllowanceRuleSet, error)
	Update(ctx context.Context, rs *model.TravelAllowanceRuleSet) error
	Delete(ctx context.Context, id uuid.UUID) error
}
```

**Input structs:**
- `CreateTravelAllowanceRuleSetInput` -- TenantID, Code, Name, Description, ValidFrom, ValidTo, CalculationBasis, DistanceRule, SortOrder
- `UpdateTravelAllowanceRuleSetInput` -- Name, Description, ValidFrom, ValidTo, CalculationBasis, DistanceRule, IsActive, SortOrder (all pointer types)

**Methods:** Create, GetByID, Update, Delete, List -- following VehicleService validation pattern.

**Validation:**
- Code and Name required (trimmed)
- Code uniqueness per tenant
- `CalculationBasis` must be `"per_day"` or `"per_booking"` if provided (default `"per_day"`)
- `DistanceRule` must be `"longest"`, `"shortest"`, `"first"`, or `"last"` if provided (default `"longest"`)

#### 6b. LocalTravelRuleService

**Error variables:**
```go
var (
	ErrLocalTravelRuleNotFound       = errors.New("local travel rule not found")
	ErrLocalTravelRuleSetIDRequired  = errors.New("rule set ID is required")
)
```

**Repository interface:** Include `ListByRuleSet` in addition to standard CRUD.

**Input structs:**
- `CreateLocalTravelRuleInput` -- TenantID, RuleSetID, MinDistanceKm, MaxDistanceKm, MinDurationMinutes, MaxDurationMinutes, TaxFreeAmount, TaxableAmount, SortOrder
- `UpdateLocalTravelRuleInput` -- all pointer types for partial update

**Validation:**
- RuleSetID required for create

#### 6c. ExtendedTravelRuleService

**Error variables:**
```go
var (
	ErrExtendedTravelRuleNotFound      = errors.New("extended travel rule not found")
	ErrExtendedTravelRuleSetIDRequired = errors.New("rule set ID is required")
)
```

**Repository interface:** Include `ListByRuleSet` in addition to standard CRUD.

**Input structs:**
- `CreateExtendedTravelRuleInput` -- TenantID, RuleSetID, all rate fields, ThreeMonthEnabled, SortOrder
- `UpdateExtendedTravelRuleInput` -- all pointer types for partial update

**Validation:**
- RuleSetID required for create

#### 6d. TravelAllowancePreviewService

Follows the `VacationCarryoverService` pattern -- aggregates data from multiple repositories and calls a pure calculation function.

**Error variables:**
```go
var (
	ErrTravelPreviewRuleSetNotFound     = errors.New("rule set not found for travel allowance preview")
	ErrTravelPreviewRuleSetIDRequired   = errors.New("rule set ID is required for preview")
	ErrTravelPreviewTripTypeRequired    = errors.New("trip type is required (local or extended)")
	ErrTravelPreviewInvalidTripType     = errors.New("trip type must be 'local' or 'extended'")
	ErrTravelPreviewDistanceRequired    = errors.New("distance is required for local travel preview")
	ErrTravelPreviewDurationRequired    = errors.New("duration is required for local travel preview")
	ErrTravelPreviewDatesRequired       = errors.New("start_date and end_date are required for extended travel preview")
	ErrTravelPreviewNoMatchingRule      = errors.New("no matching local travel rule found for given distance and duration")
	ErrTravelPreviewNoExtendedRule      = errors.New("no active extended travel rule found for this rule set")
)
```

**Repository interfaces** (unexported, local):
```go
type previewRuleSetRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.TravelAllowanceRuleSet, error)
}

type previewLocalRuleRepository interface {
	ListByRuleSet(ctx context.Context, ruleSetID uuid.UUID) ([]model.LocalTravelRule, error)
}

type previewExtendedRuleRepository interface {
	ListByRuleSet(ctx context.Context, ruleSetID uuid.UUID) ([]model.ExtendedTravelRule, error)
}
```

**Service struct:**
```go
type TravelAllowancePreviewService struct {
	ruleSetRepo      previewRuleSetRepository
	localRuleRepo    previewLocalRuleRepository
	extendedRuleRepo previewExtendedRuleRepository
}
```

**PreviewInput struct:**
```go
type TravelAllowancePreviewInput struct {
	RuleSetID        uuid.UUID
	TripType         string // "local" or "extended"
	DistanceKm       decimal.Decimal
	DurationMinutes  int
	StartDate        time.Time
	EndDate          time.Time
	ThreeMonthActive bool
}
```

**PreviewResult struct:**
```go
type TravelAllowancePreviewResult struct {
	TripType       string
	RuleSetID      uuid.UUID
	RuleSetName    string
	TaxFreeTotal   decimal.Decimal
	TaxableTotal   decimal.Decimal
	TotalAllowance decimal.Decimal
	Breakdown      []TravelAllowanceBreakdownItem
}

type TravelAllowanceBreakdownItem struct {
	Description     string
	Days            int
	TaxFreeAmount   decimal.Decimal
	TaxableAmount   decimal.Decimal
	TaxFreeSubtotal decimal.Decimal
	TaxableSubtotal decimal.Decimal
}
```

**Method:** `Preview(ctx, input) (*TravelAllowancePreviewResult, error)`
1. Validate input (trip type, required fields per type)
2. Fetch rule set by ID
3. For local: fetch local rules by rule set, call `calculation.CalculateLocalTravelAllowance()`
4. For extended: fetch extended rules by rule set, call `calculation.CalculateExtendedTravelAllowance()`
5. Map calculation output to result

**Verification:** Compile check -- `cd apps/api && go build ./internal/service/...`

---

### Phase 7: Calculation Layer

**File to create:**
- `apps/api/internal/calculation/travel_allowance.go`

Pure functions with no database or HTTP dependencies. Follow the pattern from `apps/api/internal/calculation/carryover.go`.

#### 7a. Local Travel Calculation

```go
// LocalTravelInput holds parameters for local travel allowance calculation.
type LocalTravelInput struct {
	DistanceKm      decimal.Decimal
	DurationMinutes int
	Rules           []LocalTravelRuleInput
}

type LocalTravelRuleInput struct {
	MinDistanceKm      decimal.Decimal
	MaxDistanceKm      *decimal.Decimal
	MinDurationMinutes int
	MaxDurationMinutes *int
	TaxFreeAmount      decimal.Decimal
	TaxableAmount      decimal.Decimal
}

type LocalTravelOutput struct {
	Matched         bool
	TaxFreeTotal    decimal.Decimal
	TaxableTotal    decimal.Decimal
	TotalAllowance  decimal.Decimal
	MatchedRuleIdx  int // index of the matched rule, -1 if none
}

// CalculateLocalTravelAllowance finds the first matching rule by distance/duration and returns the amounts.
func CalculateLocalTravelAllowance(input LocalTravelInput) LocalTravelOutput { ... }
```

**Matching logic:**
- Iterate rules in sort_order (already sorted by repository)
- For each rule, check if `distance >= min_distance_km AND (max_distance_km IS NULL OR distance <= max_distance_km)`
- AND `duration >= min_duration_minutes AND (max_duration_minutes IS NULL OR duration <= max_duration_minutes)`
- First matching rule wins
- Return its tax-free and taxable amounts

#### 7b. Extended Travel Calculation

```go
// ExtendedTravelInput holds parameters for extended travel allowance calculation.
type ExtendedTravelInput struct {
	StartDate          time.Time
	EndDate            time.Time
	ThreeMonthActive   bool
	Rule               ExtendedTravelRuleInput
}

type ExtendedTravelRuleInput struct {
	ArrivalDayTaxFree      decimal.Decimal
	ArrivalDayTaxable      decimal.Decimal
	DepartureDayTaxFree    decimal.Decimal
	DepartureDayTaxable    decimal.Decimal
	IntermediateDayTaxFree decimal.Decimal
	IntermediateDayTaxable decimal.Decimal
	ThreeMonthEnabled      bool
	ThreeMonthTaxFree      decimal.Decimal
	ThreeMonthTaxable      decimal.Decimal
}

type ExtendedTravelOutput struct {
	TotalDays       int
	ArrivalDays     int
	DepartureDays   int
	IntermediateDays int
	TaxFreeTotal    decimal.Decimal
	TaxableTotal    decimal.Decimal
	TotalAllowance  decimal.Decimal
	Breakdown       []ExtendedTravelBreakdownItem
}

type ExtendedTravelBreakdownItem struct {
	Description     string
	Days            int
	TaxFreeAmount   decimal.Decimal
	TaxableAmount   decimal.Decimal
	TaxFreeSubtotal decimal.Decimal
	TaxableSubtotal decimal.Decimal
}

// CalculateExtendedTravelAllowance computes the allowance for a multi-day trip.
func CalculateExtendedTravelAllowance(input ExtendedTravelInput) ExtendedTravelOutput { ... }
```

**Calculation logic:**
1. Calculate total days from StartDate to EndDate (inclusive)
2. If same day: treat as 1 arrival day only
3. If 2 days: 1 arrival day + 1 departure day
4. If 3+ days: 1 arrival day + (N-2) intermediate days + 1 departure day
5. If `ThreeMonthActive && Rule.ThreeMonthEnabled`: use three-month rates for intermediate days
6. Build breakdown items and sum totals

**Verification:** Compile check -- `cd apps/api && go build ./internal/calculation/...`

---

### Phase 8: Handler Layer

**Files to create:**
- `apps/api/internal/handler/travel_allowance_rule_set.go`
- `apps/api/internal/handler/local_travel_rule.go`
- `apps/api/internal/handler/extended_travel_rule.go`
- `apps/api/internal/handler/travel_allowance_preview.go`

#### 8a. TravelAllowanceRuleSetHandler

Follow the exact pattern from `apps/api/internal/handler/vehicle.go`:

**Struct:**
```go
type TravelAllowanceRuleSetHandler struct {
	svc *service.TravelAllowanceRuleSetService
}
```

**Methods:** List, Get, Create, Update, Delete

**Response mapper:** `travelAllowanceRuleSetToResponse(*model.TravelAllowanceRuleSet) *models.TravelAllowanceRuleSet`
- Map `ValidFrom`/`ValidTo` using `strfmt.Date` (handle nil pointers)
- Map other fields using `strfmt.UUID`, `strfmt.DateTime`

**List mapper:** `travelAllowanceRuleSetListToResponse([]model.TravelAllowanceRuleSet) models.TravelAllowanceRuleSetList`

**Error mapper:** `handleTravelAllowanceRuleSetError(w, err)` mapping service errors to HTTP status codes.

#### 8b. LocalTravelRuleHandler

Same pattern. Note: for Create, the handler must extract `rule_set_id` from the request body (it's a UUID field, parse with `uuid.Parse()`).

**Response mapper:** Map `decimal.Decimal` fields to `float64` using `.InexactFloat64()`.

#### 8c. ExtendedTravelRuleHandler

Same pattern. Response mapper must handle all the decimal rate fields.

#### 8d. TravelAllowancePreviewHandler

Follow the pattern from `apps/api/internal/handler/vacationcarryover.go`:

**Struct:**
```go
type TravelAllowancePreviewHandler struct {
	svc *service.TravelAllowancePreviewService
}
```

**Method:** `Preview(w http.ResponseWriter, r *http.Request)`
1. Decode request body into `models.TravelAllowancePreviewRequest`
2. Validate with `req.Validate(nil)`
3. Parse `rule_set_id` UUID
4. Build `service.TravelAllowancePreviewInput` from request fields
5. Call `h.svc.Preview(ctx, input)`
6. Map result to `models.TravelAllowancePreview`
7. Respond with 200 OK

**Error mapper:** `handleTravelAllowancePreviewError(w, err)` mapping preview service errors.

**Verification:** Compile check -- `cd apps/api && go build ./internal/handler/...`

---

### Phase 9: Route Registration, Permissions, and Wiring

**Files to modify:**
- `apps/api/internal/handler/routes.go`
- `apps/api/internal/permissions/permissions.go`
- `apps/api/cmd/server/main.go`

#### 9a. Permissions (`permissions.go`)

Add a single permission entry after the `vehicle_data.manage` entry (line 77):

```go
{ID: permissionID("travel_allowance.manage"), Resource: "travel_allowance", Action: "manage", Description: "Manage travel allowance rule sets, rules, and preview"},
```

#### 9b. Route Registration (`routes.go`)

Add four registration functions following the existing patterns:

```go
// RegisterTravelAllowanceRuleSetRoutes registers travel allowance rule set routes.
func RegisterTravelAllowanceRuleSetRoutes(r chi.Router, h *TravelAllowanceRuleSetHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("travel_allowance.manage").String()
	r.Route("/travel-allowance-rule-sets", func(r chi.Router) {
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

// RegisterLocalTravelRuleRoutes registers local travel rule routes.
func RegisterLocalTravelRuleRoutes(r chi.Router, h *LocalTravelRuleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("travel_allowance.manage").String()
	r.Route("/local-travel-rules", func(r chi.Router) {
		// ... same pattern ...
	})
}

// RegisterExtendedTravelRuleRoutes registers extended travel rule routes.
func RegisterExtendedTravelRuleRoutes(r chi.Router, h *ExtendedTravelRuleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("travel_allowance.manage").String()
	r.Route("/extended-travel-rules", func(r chi.Router) {
		// ... same pattern ...
	})
}

// RegisterTravelAllowancePreviewRoutes registers travel allowance preview routes.
func RegisterTravelAllowancePreviewRoutes(r chi.Router, h *TravelAllowancePreviewHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("travel_allowance.manage").String()
	if authz == nil {
		r.Post("/travel-allowance/preview", h.Preview)
		return
	}
	r.With(authz.RequirePermission(permManage)).Post("/travel-allowance/preview", h.Preview)
}
```

#### 9c. Wiring in main.go

Add initialization after the vehicle data wiring block (after line 334) and route registration after line 497:

**Initialization (after vehicle data block):**
```go
// Initialize Travel Allowance (Ausloese)
travelAllowanceRuleSetRepo := repository.NewTravelAllowanceRuleSetRepository(db)
travelAllowanceRuleSetService := service.NewTravelAllowanceRuleSetService(travelAllowanceRuleSetRepo)
travelAllowanceRuleSetHandler := handler.NewTravelAllowanceRuleSetHandler(travelAllowanceRuleSetService)

localTravelRuleRepo := repository.NewLocalTravelRuleRepository(db)
localTravelRuleService := service.NewLocalTravelRuleService(localTravelRuleRepo)
localTravelRuleHandler := handler.NewLocalTravelRuleHandler(localTravelRuleService)

extendedTravelRuleRepo := repository.NewExtendedTravelRuleRepository(db)
extendedTravelRuleService := service.NewExtendedTravelRuleService(extendedTravelRuleRepo)
extendedTravelRuleHandler := handler.NewExtendedTravelRuleHandler(extendedTravelRuleService)

travelAllowancePreviewService := service.NewTravelAllowancePreviewService(
	travelAllowanceRuleSetRepo, localTravelRuleRepo, extendedTravelRuleRepo,
)
travelAllowancePreviewHandler := handler.NewTravelAllowancePreviewHandler(travelAllowancePreviewService)
```

**Route registration (after trip record routes):**
```go
handler.RegisterTravelAllowanceRuleSetRoutes(r, travelAllowanceRuleSetHandler, authzMiddleware)
handler.RegisterLocalTravelRuleRoutes(r, localTravelRuleHandler, authzMiddleware)
handler.RegisterExtendedTravelRuleRoutes(r, extendedTravelRuleHandler, authzMiddleware)
handler.RegisterTravelAllowancePreviewRoutes(r, travelAllowancePreviewHandler, authzMiddleware)
```

**Verification:** Full build -- `cd apps/api && go build ./cmd/server/...`

---

### Phase 10: Swagger Bundle and Copy

After all code is in place:

```bash
make swagger-bundle
cp api/openapi.bundled.yaml apps/api/cmd/server/openapi.bundled.yaml
```

**Verification:** The bundled file should contain all travel allowance definitions and paths.

---

### Phase 11: Final Verification

1. **Build:** `cd apps/api && go build ./...` -- no compilation errors
2. **Migration:** `make migrate-up` -- tables created successfully
3. **API Start:** `make dev` -- server starts without errors
4. **Swagger UI:** Visit `http://localhost:8080/swagger/` -- verify travel allowance endpoints appear
5. **CRUD Test (manual):**
   - POST `/api/v1/travel-allowance-rule-sets` with `{"code": "TA-2026", "name": "Test Rule Set"}`
   - GET `/api/v1/travel-allowance-rule-sets` -- returns the created rule set
   - POST `/api/v1/local-travel-rules` with `{"rule_set_id": "<id>", "min_distance_km": 0, "max_distance_km": 50, "min_duration_minutes": 480, "tax_free_amount": 14, "taxable_amount": 6}`
   - POST `/api/v1/extended-travel-rules` with `{"rule_set_id": "<id>", "arrival_day_tax_free": 14, ...}`
   - POST `/api/v1/travel-allowance/preview` with local trip parameters -- verify correct amounts returned

---

## File Summary

### New files (19):

| File | Purpose |
|------|---------|
| `db/migrations/000075_create_travel_allowance.up.sql` | Create 3 tables |
| `db/migrations/000075_create_travel_allowance.down.sql` | Drop 3 tables |
| `api/schemas/travel-allowance.yaml` | OpenAPI schema definitions |
| `api/paths/travel-allowance.yaml` | OpenAPI path definitions |
| `apps/api/internal/model/travel_allowance_rule_set.go` | Rule set domain model |
| `apps/api/internal/model/local_travel_rule.go` | Local travel rule domain model |
| `apps/api/internal/model/extended_travel_rule.go` | Extended travel rule domain model |
| `apps/api/internal/repository/travel_allowance_rule_set.go` | Rule set data access |
| `apps/api/internal/repository/local_travel_rule.go` | Local rule data access |
| `apps/api/internal/repository/extended_travel_rule.go` | Extended rule data access |
| `apps/api/internal/service/travel_allowance_rule_set.go` | Rule set business logic |
| `apps/api/internal/service/local_travel_rule.go` | Local rule business logic |
| `apps/api/internal/service/extended_travel_rule.go` | Extended rule business logic |
| `apps/api/internal/service/travel_allowance_preview.go` | Preview calculation orchestration |
| `apps/api/internal/handler/travel_allowance_rule_set.go` | Rule set HTTP handlers |
| `apps/api/internal/handler/local_travel_rule.go` | Local rule HTTP handlers |
| `apps/api/internal/handler/extended_travel_rule.go` | Extended rule HTTP handlers |
| `apps/api/internal/handler/travel_allowance_preview.go` | Preview HTTP handler |
| `apps/api/internal/calculation/travel_allowance.go` | Pure calculation functions |

### Modified files (4):

| File | Change |
|------|--------|
| `api/openapi.yaml` | Add tags, path refs, definition refs |
| `apps/api/internal/handler/routes.go` | Add 4 route registration functions |
| `apps/api/internal/permissions/permissions.go` | Add `travel_allowance.manage` permission |
| `apps/api/cmd/server/main.go` | Add wiring for repos/services/handlers |

### Auto-generated files (via `make generate`):

~15 files in `apps/api/gen/models/` (generated from OpenAPI schema definitions)

---

## Success Criteria

1. All 3 database tables exist with correct schema after migration.
2. CRUD operations work for all three entity types (rule sets, local rules, extended rules).
3. Preview endpoint returns correct tax-free and taxable amounts for a simple local travel scenario:
   - Given a rule set with a local rule for distance 0-50 km, duration >= 480 min, tax_free=14, taxable=6
   - When previewing with distance=30 km, duration=540 min
   - Then response includes tax_free_total=14, taxable_total=6, total_allowance=20
4. Preview endpoint returns correct breakdown for an extended travel scenario:
   - Given a rule set with an extended rule for arrival_day_tax_free=14, intermediate_day_tax_free=28, departure_day_tax_free=14
   - When previewing with start_date=2026-02-01, end_date=2026-02-05 (5 days)
   - Then response includes 1 arrival day + 3 intermediate days + 1 departure day breakdown
5. Server compiles and starts without errors.
6. OpenAPI documentation is complete and swagger UI shows all endpoints.
