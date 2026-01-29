# Implementation Plan: ZMI-TICKET-013 - Absence Calculation Rules

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-013
**Dependencies**: ZMI-TICKET-009 (Accounts), ZMI-TICKET-007 (Absence Types), ZMI-TICKET-006 (Day Plans)
**Status**: Ready for implementation

---

## Summary

Implement the absence calculation rule system that determines how absence days impact time accounts. The core formula from ZMI manual section 15.3:

- **Account value = Value * Factor**
- **Exception**: if Value = 0, use **Daily target time (time plan) * Factor**

A calculation rule is a named, reusable configuration assigned to absence types. When an absence day is evaluated, the linked calculation rule determines what value gets written to the linked account.

---

## Phase 1: Database Migration

### 1.1 Create `calculation_rules` table

**File**: `/home/tolga/projects/terp/db/migrations/000046_create_calculation_rules.up.sql`

```sql
-- =============================================================
-- Create calculation_rules table
-- ZMI manual section 15.3: Account value = Value * Factor
-- Exception: Value = 0 -> Daily target time (time plan) * Factor
-- =============================================================
CREATE TABLE calculation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    value INT NOT NULL DEFAULT 0,
    factor NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_calculation_rules_tenant ON calculation_rules(tenant_id);
CREATE INDEX idx_calculation_rules_account ON calculation_rules(account_id);
CREATE INDEX idx_calculation_rules_active ON calculation_rules(tenant_id, is_active);

CREATE TRIGGER update_calculation_rules_updated_at
    BEFORE UPDATE ON calculation_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE calculation_rules IS 'Absence calculation rules defining how absence days affect accounts. Formula: account_value = value * factor (if value=0, use daily target time * factor)';
COMMENT ON COLUMN calculation_rules.code IS 'Unique code per tenant for rule identification';
COMMENT ON COLUMN calculation_rules.account_id IS 'Optional linked account. If set, calculation writes to this account';
COMMENT ON COLUMN calculation_rules.value IS 'Value in minutes. 0 means use daily target time from time plan';
COMMENT ON COLUMN calculation_rules.factor IS 'Multiplier applied to value or target time (e.g. 1.00 = full, 0.50 = half)';
```

**Pattern reference**: `/home/tolga/projects/terp/db/migrations/000045_create_correction_messages.up.sql`

**File**: `/home/tolga/projects/terp/db/migrations/000046_create_calculation_rules.down.sql`

```sql
DROP TABLE IF EXISTS calculation_rules;
```

### 1.2 Add `calculation_rule_id` FK to `absence_types`

**File**: `/home/tolga/projects/terp/db/migrations/000047_add_calculation_rule_to_absence_types.up.sql`

```sql
-- Add calculation rule FK to absence_types
ALTER TABLE absence_types
    ADD COLUMN calculation_rule_id UUID REFERENCES calculation_rules(id) ON DELETE SET NULL;

CREATE INDEX idx_absence_types_calculation_rule ON absence_types(calculation_rule_id);

COMMENT ON COLUMN absence_types.calculation_rule_id IS 'Optional calculation rule that determines account value when this absence type is applied';
```

**Pattern reference**: `/home/tolga/projects/terp/db/migrations/000042_create_absence_type_groups.up.sql` (lines 22-25, same ALTER TABLE + FK pattern)

**File**: `/home/tolga/projects/terp/db/migrations/000047_add_calculation_rule_to_absence_types.down.sql`

```sql
ALTER TABLE absence_types DROP COLUMN IF EXISTS calculation_rule_id;
```

### Verification

```bash
cd /home/tolga/projects/terp && make migrate-up
```

Confirm no errors. Verify tables exist:
```sql
\d calculation_rules
\d absence_types  -- should show calculation_rule_id column
```

---

## Phase 2: OpenAPI Spec

### 2.1 Create Calculation Rule Schema

**File**: `/home/tolga/projects/terp/api/schemas/calculation-rules.yaml`

```yaml
# Calculation Rule schemas
CalculationRule:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
    - value
    - factor
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
      example: "FULL_DAY"
    name:
      type: string
      example: "Full Day Credit"
    description:
      type: string
      x-nullable: true
    account_id:
      type: string
      format: uuid
      x-nullable: true
      description: Linked account for value writing
    value:
      type: integer
      description: "Value in minutes. 0 = use daily target time from time plan"
      example: 0
    factor:
      type: number
      format: double
      description: "Multiplier (e.g. 1.0 = full, 0.5 = half, 2.0 = double)"
      example: 1.0
    is_active:
      type: boolean
      example: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time
    # Expanded relations
    account:
      allOf:
        - $ref: './accounts.yaml#/AccountSummary'
      x-nullable: true

CreateCalculationRuleRequest:
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
    account_id:
      type: string
      format: uuid
      x-nullable: true
    value:
      type: integer
      default: 0
      description: "Value in minutes (0 = use daily target time)"
    factor:
      type: number
      format: double
      default: 1.0
      description: "Multiplier factor"

UpdateCalculationRuleRequest:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    account_id:
      type: string
      format: uuid
      x-nullable: true
    value:
      type: integer
    factor:
      type: number
      format: double
    is_active:
      type: boolean

CalculationRuleList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/CalculationRule'

CalculationPreviewRequest:
  type: object
  required:
    - calculation_rule_id
  properties:
    calculation_rule_id:
      type: string
      format: uuid
    daily_target_minutes:
      type: integer
      description: "Override daily target time in minutes (optional, defaults to 480)"
      example: 480

CalculationPreviewResponse:
  type: object
  required:
    - rule_code
    - value
    - factor
    - base_minutes
    - result_minutes
  properties:
    rule_code:
      type: string
    rule_name:
      type: string
    value:
      type: integer
      description: "Configured value in minutes (0 = uses target time)"
    factor:
      type: number
      format: double
    base_minutes:
      type: integer
      description: "Effective base: value if >0, else daily target time"
    result_minutes:
      type: integer
      description: "Final result: base_minutes * factor"
    account_id:
      type: string
      format: uuid
      x-nullable: true
    account_name:
      type: string
      x-nullable: true
```

**Pattern reference**: `/home/tolga/projects/terp/api/schemas/accounts.yaml`

### 2.2 Create Calculation Rule Paths

**File**: `/home/tolga/projects/terp/api/paths/calculation-rules.yaml`

```yaml
# Calculation Rule endpoints
/calculation-rules:
  get:
    tags:
      - Calculation Rules
    summary: List calculation rules
    description: |
      Returns calculation rules for the tenant. Rules define how absence
      days affect time accounts using the formula: account_value = value * factor.
      If value is 0, the daily target time from the time plan is used as base.
    operationId: listCalculationRules
    parameters:
      - name: active
        in: query
        type: boolean
        description: Filter by active status
    responses:
      200:
        description: List of calculation rules
        schema:
          $ref: '../schemas/calculation-rules.yaml#/CalculationRuleList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Calculation Rules
    summary: Create calculation rule
    operationId: createCalculationRule
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/calculation-rules.yaml#/CreateCalculationRuleRequest'
    responses:
      201:
        description: Created calculation rule
        schema:
          $ref: '../schemas/calculation-rules.yaml#/CalculationRule'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/calculation-rules/{id}:
  get:
    tags:
      - Calculation Rules
    summary: Get calculation rule by ID
    operationId: getCalculationRule
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Calculation rule details
        schema:
          $ref: '../schemas/calculation-rules.yaml#/CalculationRule'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Calculation Rules
    summary: Update calculation rule
    operationId: updateCalculationRule
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
          $ref: '../schemas/calculation-rules.yaml#/UpdateCalculationRuleRequest'
    responses:
      200:
        description: Updated calculation rule
        schema:
          $ref: '../schemas/calculation-rules.yaml#/CalculationRule'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Calculation Rules
    summary: Delete calculation rule
    operationId: deleteCalculationRule
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Calculation rule deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/calculation-rules/preview:
  post:
    tags:
      - Calculation Rules
    summary: Preview calculation result
    description: |
      Computes the account value for a calculation rule without persisting anything.
      Uses the formula: base * factor, where base is the rule's value if > 0,
      otherwise the provided daily_target_minutes (default 480 = 8h).
    operationId: previewCalculation
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/calculation-rules.yaml#/CalculationPreviewRequest'
    responses:
      200:
        description: Preview calculation result
        schema:
          $ref: '../schemas/calculation-rules.yaml#/CalculationPreviewResponse'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

**Pattern reference**: `/home/tolga/projects/terp/api/paths/accounts.yaml`

### 2.3 Update Absence Type Schema

**File to modify**: `/home/tolga/projects/terp/api/schemas/absence-types.yaml`

Add `calculation_rule_id` property to `AbsenceType`, `CreateAbsenceTypeRequest`, and `UpdateAbsenceTypeRequest`:

In `AbsenceType` properties (after `absence_type_group_id`):
```yaml
    calculation_rule_id:
      type: string
      format: uuid
      x-nullable: true
      description: Linked calculation rule for account value computation
```

In `CreateAbsenceTypeRequest` properties (after `absence_type_group_id`):
```yaml
    calculation_rule_id:
      type: string
      format: uuid
      x-nullable: true
      description: Calculation rule to assign
```

In `UpdateAbsenceTypeRequest` properties (after `absence_type_group_id`):
```yaml
    calculation_rule_id:
      type: string
      format: uuid
      x-nullable: true
      description: Calculation rule to assign (null to remove)
```

### 2.4 Update Main OpenAPI Spec

**File to modify**: `/home/tolga/projects/terp/api/openapi.yaml`

Add under `tags:` (after `Correction Assistant`):
```yaml
  - name: Calculation Rules
    description: Absence calculation rule management
```

Add under `paths:` (after correction assistant entries):
```yaml
  # Calculation Rules
  /calculation-rules:
    $ref: 'paths/calculation-rules.yaml#/~1calculation-rules'
  /calculation-rules/{id}:
    $ref: 'paths/calculation-rules.yaml#/~1calculation-rules~1{id}'
  /calculation-rules/preview:
    $ref: 'paths/calculation-rules.yaml#/~1calculation-rules~1preview'
```

Add under `definitions:` (after Correction Assistant entries):
```yaml
  # Calculation Rules
  CalculationRule:
    $ref: 'schemas/calculation-rules.yaml#/CalculationRule'
  CreateCalculationRuleRequest:
    $ref: 'schemas/calculation-rules.yaml#/CreateCalculationRuleRequest'
  UpdateCalculationRuleRequest:
    $ref: 'schemas/calculation-rules.yaml#/UpdateCalculationRuleRequest'
  CalculationRuleList:
    $ref: 'schemas/calculation-rules.yaml#/CalculationRuleList'
  CalculationPreviewRequest:
    $ref: 'schemas/calculation-rules.yaml#/CalculationPreviewRequest'
  CalculationPreviewResponse:
    $ref: 'schemas/calculation-rules.yaml#/CalculationPreviewResponse'
```

### Verification

```bash
cd /home/tolga/projects/terp && make swagger-bundle
```

Confirm `api/openapi.bundled.yaml` is generated without errors.

---

## Phase 3: Generate Models

```bash
cd /home/tolga/projects/terp && make swagger-bundle && make generate
```

This generates Go model structs in `/home/tolga/projects/terp/apps/api/gen/models/` including:
- `CalculationRule`
- `CreateCalculationRuleRequest`
- `UpdateCalculationRuleRequest`
- `CalculationRuleList`
- `CalculationPreviewRequest`
- `CalculationPreviewResponse`

Also regenerates the `AbsenceType` / `CreateAbsenceTypeRequest` / `UpdateAbsenceTypeRequest` models with the new `calculation_rule_id` field.

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

Confirm no compilation errors.

---

## Phase 4: Domain Model & Repository

### 4.1 Create CalculationRule Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/calculationrule.go`

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

// CalculationRule defines how absence days affect time accounts.
// ZMI manual section 15.3 formula:
//   Account value = Value * Factor
//   Exception: Value = 0 -> Daily target time (time plan) * Factor
type CalculationRule struct {
    ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string     `gorm:"type:varchar(50);not null" json:"code"`
    Name        string     `gorm:"type:varchar(255);not null" json:"name"`
    Description *string    `gorm:"type:text" json:"description,omitempty"`

    // Linked account (optional - if set, calculation writes to this account)
    AccountID *uuid.UUID `gorm:"type:uuid" json:"account_id,omitempty"`

    // Value in minutes (0 = use daily target time from day plan)
    Value int `gorm:"type:int;not null;default:0" json:"value"`

    // Factor (multiplier, e.g., 1.0, 0.5, 2.0)
    Factor float64 `gorm:"type:numeric(5,2);not null;default:1.00" json:"factor"`

    IsActive  bool      `gorm:"default:true" json:"is_active"`
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Account *Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}

func (CalculationRule) TableName() string {
    return "calculation_rules"
}

// CalculateAccountValue computes the account value for an absence day.
// If Value > 0: returns Value * Factor
// If Value == 0: returns dailyTargetMinutes * Factor
func (r *CalculationRule) CalculateAccountValue(dailyTargetMinutes int) int {
    base := r.Value
    if base == 0 {
        base = dailyTargetMinutes
    }
    return int(float64(base) * r.Factor)
}
```

**Pattern reference**: `/home/tolga/projects/terp/apps/api/internal/model/account.go`

### 4.2 Update AbsenceType Model

**File to modify**: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`

Add after the `AbsenceTypeGroup` relation field (line 66):

```go
    // Calculation rule assignment (ZMI section 15.3)
    CalculationRuleID *uuid.UUID       `gorm:"type:uuid" json:"calculation_rule_id,omitempty"`
    CalculationRule   *CalculationRule  `gorm:"foreignKey:CalculationRuleID" json:"calculation_rule,omitempty"`
```

### 4.3 Create CalculationRule Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/calculationrule.go`

```go
package repository

import (
    "context"
    "errors"
    "fmt"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "github.com/tolga/terp/internal/model"
)

var (
    ErrCalculationRuleNotFound = errors.New("calculation rule not found")
)

// CalculationRuleRepository handles calculation rule data access.
type CalculationRuleRepository struct {
    db *DB
}

// NewCalculationRuleRepository creates a new calculation rule repository.
func NewCalculationRuleRepository(db *DB) *CalculationRuleRepository {
    return &CalculationRuleRepository{db: db}
}

// Create creates a new calculation rule.
func (r *CalculationRuleRepository) Create(ctx context.Context, rule *model.CalculationRule) error {
    return r.db.GORM.WithContext(ctx).Create(rule).Error
}

// GetByID retrieves a calculation rule by ID.
func (r *CalculationRuleRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.CalculationRule, error) {
    var rule model.CalculationRule
    err := r.db.GORM.WithContext(ctx).
        Preload("Account").
        First(&rule, "id = ?", id).Error

    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrCalculationRuleNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get calculation rule: %w", err)
    }
    return &rule, nil
}

// GetByCode retrieves a calculation rule by tenant ID and code.
func (r *CalculationRuleRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CalculationRule, error) {
    var rule model.CalculationRule
    err := r.db.GORM.WithContext(ctx).
        Preload("Account").
        Where("tenant_id = ? AND code = ?", tenantID, code).
        First(&rule).Error

    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrCalculationRuleNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get calculation rule by code: %w", err)
    }
    return &rule, nil
}

// Update updates a calculation rule.
func (r *CalculationRuleRepository) Update(ctx context.Context, rule *model.CalculationRule) error {
    return r.db.GORM.WithContext(ctx).Save(rule).Error
}

// Delete deletes a calculation rule by ID.
func (r *CalculationRuleRepository) Delete(ctx context.Context, id uuid.UUID) error {
    result := r.db.GORM.WithContext(ctx).Delete(&model.CalculationRule{}, "id = ?", id)
    if result.Error != nil {
        return fmt.Errorf("failed to delete calculation rule: %w", result.Error)
    }
    if result.RowsAffected == 0 {
        return ErrCalculationRuleNotFound
    }
    return nil
}

// List retrieves all calculation rules for a tenant.
func (r *CalculationRuleRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error) {
    var rules []model.CalculationRule
    err := r.db.GORM.WithContext(ctx).
        Preload("Account").
        Where("tenant_id = ?", tenantID).
        Order("code ASC").
        Find(&rules).Error

    if err != nil {
        return nil, fmt.Errorf("failed to list calculation rules: %w", err)
    }
    return rules, nil
}

// ListActive retrieves all active calculation rules for a tenant.
func (r *CalculationRuleRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error) {
    var rules []model.CalculationRule
    err := r.db.GORM.WithContext(ctx).
        Preload("Account").
        Where("tenant_id = ? AND is_active = ?", tenantID, true).
        Order("code ASC").
        Find(&rules).Error

    if err != nil {
        return nil, fmt.Errorf("failed to list active calculation rules: %w", err)
    }
    return rules, nil
}

// ListFiltered retrieves calculation rules with optional active filter.
func (r *CalculationRuleRepository) ListFiltered(ctx context.Context, tenantID uuid.UUID, active *bool) ([]model.CalculationRule, error) {
    var rules []model.CalculationRule
    query := r.db.GORM.WithContext(ctx).
        Preload("Account").
        Where("tenant_id = ?", tenantID)

    if active != nil {
        query = query.Where("is_active = ?", *active)
    }

    err := query.Order("code ASC").Find(&rules).Error
    if err != nil {
        return nil, fmt.Errorf("failed to list calculation rules: %w", err)
    }
    return rules, nil
}

// CountByAccountID returns the number of rules referencing the given account.
func (r *CalculationRuleRepository) CountByAccountID(ctx context.Context, accountID uuid.UUID) (int64, error) {
    var count int64
    err := r.db.GORM.WithContext(ctx).
        Model(&model.CalculationRule{}).
        Where("account_id = ?", accountID).
        Count(&count).Error
    return count, err
}
```

**Pattern reference**: `/home/tolga/projects/terp/apps/api/internal/repository/account.go`

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

Confirm no compilation errors.

---

## Phase 5: Service Layer

### 5.1 Create CalculationRule Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/calculationrule.go`

```go
package service

import (
    "context"
    "errors"
    "strings"

    "github.com/google/uuid"

    "github.com/tolga/terp/internal/model"
)

var (
    ErrCalculationRuleNotFound    = errors.New("calculation rule not found")
    ErrCalculationRuleCodeRequired = errors.New("calculation rule code is required")
    ErrCalculationRuleNameRequired = errors.New("calculation rule name is required")
    ErrCalculationRuleCodeExists   = errors.New("calculation rule code already exists")
    ErrCalculationRuleInactive     = errors.New("cannot assign inactive calculation rule")
    ErrCalculationRuleInvalidFactor = errors.New("factor must be greater than zero")
    ErrCalculationRuleNegativeValue = errors.New("value must not be negative")
    ErrCalculationRuleAccountNotFound = errors.New("linked account not found")
    ErrCalculationRuleInUse        = errors.New("calculation rule is assigned to absence types and cannot be deleted")
)

// calculationRuleRepository defines the interface for calculation rule data access.
type calculationRuleRepository interface {
    Create(ctx context.Context, rule *model.CalculationRule) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.CalculationRule, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CalculationRule, error)
    Update(ctx context.Context, rule *model.CalculationRule) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error)
    ListFiltered(ctx context.Context, tenantID uuid.UUID, active *bool) ([]model.CalculationRule, error)
}

// absenceTypeRepositoryForRules is a minimal interface for absence type lookups.
type absenceTypeRepositoryForRules interface {
    CountByCalculationRuleID(ctx context.Context, ruleID uuid.UUID) (int64, error)
}

type CalculationRuleService struct {
    ruleRepo    calculationRuleRepository
    accountRepo accountRepository
    absenceTypeRepo absenceTypeRepositoryForRules
}

func NewCalculationRuleService(
    ruleRepo calculationRuleRepository,
    accountRepo accountRepository,
    absenceTypeRepo absenceTypeRepositoryForRules,
) *CalculationRuleService {
    return &CalculationRuleService{
        ruleRepo:    ruleRepo,
        accountRepo: accountRepo,
        absenceTypeRepo: absenceTypeRepo,
    }
}

// CreateCalculationRuleInput represents the input for creating a calculation rule.
type CreateCalculationRuleInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description *string
    AccountID   *uuid.UUID
    Value       int
    Factor      float64
}

// Create creates a new calculation rule with validation.
func (s *CalculationRuleService) Create(ctx context.Context, input CreateCalculationRuleInput) (*model.CalculationRule, error) {
    code := strings.TrimSpace(input.Code)
    if code == "" {
        return nil, ErrCalculationRuleCodeRequired
    }
    name := strings.TrimSpace(input.Name)
    if name == "" {
        return nil, ErrCalculationRuleNameRequired
    }
    if input.Value < 0 {
        return nil, ErrCalculationRuleNegativeValue
    }
    if input.Factor <= 0 {
        return nil, ErrCalculationRuleInvalidFactor
    }

    // Check for existing rule with same code for this tenant
    existing, err := s.ruleRepo.GetByCode(ctx, input.TenantID, code)
    if err == nil && existing != nil {
        return nil, ErrCalculationRuleCodeExists
    }

    // Validate linked account exists if specified
    if input.AccountID != nil {
        _, err := s.accountRepo.GetByID(ctx, *input.AccountID)
        if err != nil {
            return nil, ErrCalculationRuleAccountNotFound
        }
    }

    // Default factor to 1.0 if not provided (zero value)
    factor := input.Factor
    if factor == 0 {
        factor = 1.0
    }

    rule := &model.CalculationRule{
        TenantID:    input.TenantID,
        Code:        code,
        Name:        name,
        Description: input.Description,
        AccountID:   input.AccountID,
        Value:       input.Value,
        Factor:      factor,
        IsActive:    true,
    }

    if err := s.ruleRepo.Create(ctx, rule); err != nil {
        return nil, err
    }

    // Reload with preloaded account
    return s.ruleRepo.GetByID(ctx, rule.ID)
}

// UpdateCalculationRuleInput represents the input for updating a calculation rule.
type UpdateCalculationRuleInput struct {
    Name        *string
    Description *string
    AccountID   *uuid.UUID
    ClearAccount bool    // When true, sets account_id to NULL
    Value       *int
    Factor      *float64
    IsActive    *bool
}

// Update updates a calculation rule.
func (s *CalculationRuleService) Update(ctx context.Context, id uuid.UUID, input UpdateCalculationRuleInput) (*model.CalculationRule, error) {
    rule, err := s.ruleRepo.GetByID(ctx, id)
    if err != nil {
        return nil, ErrCalculationRuleNotFound
    }

    if input.Name != nil {
        name := strings.TrimSpace(*input.Name)
        if name == "" {
            return nil, ErrCalculationRuleNameRequired
        }
        rule.Name = name
    }
    if input.Description != nil {
        rule.Description = input.Description
    }
    if input.ClearAccount {
        rule.AccountID = nil
    } else if input.AccountID != nil {
        _, err := s.accountRepo.GetByID(ctx, *input.AccountID)
        if err != nil {
            return nil, ErrCalculationRuleAccountNotFound
        }
        rule.AccountID = input.AccountID
    }
    if input.Value != nil {
        if *input.Value < 0 {
            return nil, ErrCalculationRuleNegativeValue
        }
        rule.Value = *input.Value
    }
    if input.Factor != nil {
        if *input.Factor <= 0 {
            return nil, ErrCalculationRuleInvalidFactor
        }
        rule.Factor = *input.Factor
    }
    if input.IsActive != nil {
        rule.IsActive = *input.IsActive
    }

    if err := s.ruleRepo.Update(ctx, rule); err != nil {
        return nil, err
    }

    return s.ruleRepo.GetByID(ctx, rule.ID)
}

// GetByID retrieves a calculation rule by ID.
func (s *CalculationRuleService) GetByID(ctx context.Context, id uuid.UUID) (*model.CalculationRule, error) {
    rule, err := s.ruleRepo.GetByID(ctx, id)
    if err != nil {
        return nil, ErrCalculationRuleNotFound
    }
    return rule, nil
}

// Delete deletes a calculation rule by ID.
// Prevents deletion if the rule is assigned to any absence types.
func (s *CalculationRuleService) Delete(ctx context.Context, id uuid.UUID) error {
    _, err := s.ruleRepo.GetByID(ctx, id)
    if err != nil {
        return ErrCalculationRuleNotFound
    }

    // Check if rule is in use by any absence types
    if s.absenceTypeRepo != nil {
        count, err := s.absenceTypeRepo.CountByCalculationRuleID(ctx, id)
        if err != nil {
            return err
        }
        if count > 0 {
            return ErrCalculationRuleInUse
        }
    }

    return s.ruleRepo.Delete(ctx, id)
}

// List retrieves all calculation rules for a tenant.
func (s *CalculationRuleService) List(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error) {
    return s.ruleRepo.List(ctx, tenantID)
}

// ListFiltered retrieves calculation rules with optional active filter.
func (s *CalculationRuleService) ListFiltered(ctx context.Context, tenantID uuid.UUID, active *bool) ([]model.CalculationRule, error) {
    return s.ruleRepo.ListFiltered(ctx, tenantID, active)
}

// PreviewCalculation computes the account value without persisting.
type PreviewInput struct {
    RuleID             uuid.UUID
    DailyTargetMinutes int // Override; default 480 (8h) if 0
}

type PreviewResult struct {
    RuleCode      string
    RuleName      string
    Value         int
    Factor        float64
    BaseMinutes   int
    ResultMinutes int
    AccountID     *uuid.UUID
    AccountName   *string
}

// Preview computes the account value for a given rule and target time.
func (s *CalculationRuleService) Preview(ctx context.Context, input PreviewInput) (*PreviewResult, error) {
    rule, err := s.ruleRepo.GetByID(ctx, input.RuleID)
    if err != nil {
        return nil, ErrCalculationRuleNotFound
    }

    dailyTarget := input.DailyTargetMinutes
    if dailyTarget <= 0 {
        dailyTarget = 480 // Default 8h
    }

    resultMinutes := rule.CalculateAccountValue(dailyTarget)

    base := rule.Value
    if base == 0 {
        base = dailyTarget
    }

    result := &PreviewResult{
        RuleCode:      rule.Code,
        RuleName:      rule.Name,
        Value:         rule.Value,
        Factor:        rule.Factor,
        BaseMinutes:   base,
        ResultMinutes: resultMinutes,
        AccountID:     rule.AccountID,
    }

    if rule.Account != nil {
        result.AccountName = &rule.Account.Name
    }

    return result, nil
}

// ValidateRuleForAssignment checks that a rule can be assigned to an absence type.
func (s *CalculationRuleService) ValidateRuleForAssignment(ctx context.Context, ruleID uuid.UUID) error {
    rule, err := s.ruleRepo.GetByID(ctx, ruleID)
    if err != nil {
        return ErrCalculationRuleNotFound
    }
    if !rule.IsActive {
        return ErrCalculationRuleInactive
    }
    return nil
}
```

**Pattern reference**: `/home/tolga/projects/terp/apps/api/internal/service/account.go`

### 5.2 Add `CountByCalculationRuleID` to AbsenceType Repository

**File to modify**: `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go`

Add this method:

```go
// CountByCalculationRuleID returns the number of absence types using the given calculation rule.
func (r *AbsenceTypeRepository) CountByCalculationRuleID(ctx context.Context, ruleID uuid.UUID) (int64, error) {
    var count int64
    err := r.db.GORM.WithContext(ctx).
        Model(&model.AbsenceType{}).
        Where("calculation_rule_id = ?", ruleID).
        Count(&count).Error
    return count, err
}
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 6: HTTP Handlers

### 6.1 Create CalculationRule Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/calculationrule.go`

```go
package handler

import (
    "encoding/json"
    "net/http"
    "strconv"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "github.com/tolga/terp/gen/models"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/service"
)

type CalculationRuleHandler struct {
    ruleService  *service.CalculationRuleService
    auditService *service.AuditLogService
}

func NewCalculationRuleHandler(ruleService *service.CalculationRuleService) *CalculationRuleHandler {
    return &CalculationRuleHandler{ruleService: ruleService}
}

func (h *CalculationRuleHandler) SetAuditService(s *service.AuditLogService) {
    h.auditService = s
}

// List handles GET /calculation-rules
func (h *CalculationRuleHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    var activeFilter *bool
    if activeStr := r.URL.Query().Get("active"); activeStr != "" {
        active, err := strconv.ParseBool(activeStr)
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid active filter")
            return
        }
        activeFilter = &active
    }

    rules, err := h.ruleService.ListFiltered(r.Context(), tenantID, activeFilter)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to list calculation rules")
        return
    }

    respondJSON(w, http.StatusOK, map[string]any{"data": rules})
}

// Create handles POST /calculation-rules
func (h *CalculationRuleHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    var req models.CreateCalculationRuleRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "Invalid request body")
        return
    }

    if err := req.Validate(nil); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    var accountID *uuid.UUID
    if req.AccountID != nil {
        aid, err := uuid.Parse(req.AccountID.String())
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid account_id")
            return
        }
        accountID = &aid
    }

    var description *string
    if req.Description != "" {
        description = &req.Description
    }

    factor := 1.0
    if req.Factor != 0 {
        factor = req.Factor
    }

    input := service.CreateCalculationRuleInput{
        TenantID:    tenantID,
        Code:        *req.Code,
        Name:        *req.Name,
        Description: description,
        AccountID:   accountID,
        Value:       int(req.Value),
        Factor:      factor,
    }

    rule, err := h.ruleService.Create(r.Context(), input)
    if err != nil {
        switch err {
        case service.ErrCalculationRuleCodeRequired:
            respondError(w, http.StatusBadRequest, "Code is required")
        case service.ErrCalculationRuleNameRequired:
            respondError(w, http.StatusBadRequest, "Name is required")
        case service.ErrCalculationRuleCodeExists:
            respondError(w, http.StatusConflict, "A calculation rule with this code already exists")
        case service.ErrCalculationRuleAccountNotFound:
            respondError(w, http.StatusBadRequest, "Linked account not found")
        case service.ErrCalculationRuleInvalidFactor:
            respondError(w, http.StatusBadRequest, "Factor must be greater than zero")
        case service.ErrCalculationRuleNegativeValue:
            respondError(w, http.StatusBadRequest, "Value must not be negative")
        default:
            respondError(w, http.StatusInternalServerError, "Failed to create calculation rule")
        }
        return
    }

    // Audit log
    if h.auditService != nil {
        h.auditService.Log(r.Context(), r, service.LogEntry{
            TenantID:   tenantID,
            Action:     model.AuditActionCreate,
            EntityType: "calculation_rule",
            EntityID:   rule.ID,
            EntityName: rule.Name,
            Changes: map[string]any{
                "code":       rule.Code,
                "name":       rule.Name,
                "value":      rule.Value,
                "factor":     rule.Factor,
                "account_id": rule.AccountID,
            },
        })
    }

    respondJSON(w, http.StatusCreated, rule)
}

// Get handles GET /calculation-rules/{id}
func (h *CalculationRuleHandler) Get(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid calculation rule ID")
        return
    }

    rule, err := h.ruleService.GetByID(r.Context(), id)
    if err != nil {
        respondError(w, http.StatusNotFound, "Calculation rule not found")
        return
    }

    respondJSON(w, http.StatusOK, rule)
}

// Update handles PATCH /calculation-rules/{id}
func (h *CalculationRuleHandler) Update(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid calculation rule ID")
        return
    }

    var req models.UpdateCalculationRuleRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "Invalid request body")
        return
    }

    if err := req.Validate(nil); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    // Get old rule for audit diff
    oldRule, _ := h.ruleService.GetByID(r.Context(), id)

    input := service.UpdateCalculationRuleInput{}
    if req.Name != "" {
        input.Name = &req.Name
    }
    if req.Description != "" {
        input.Description = &req.Description
    }
    if req.AccountID != nil {
        aid, err := uuid.Parse(req.AccountID.String())
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid account_id")
            return
        }
        input.AccountID = &aid
    }
    if req.Value != nil {
        v := int(*req.Value)
        input.Value = &v
    }
    if req.Factor != nil {
        input.Factor = req.Factor
    }
    if req.IsActive != nil {
        input.IsActive = req.IsActive
    }

    rule, err := h.ruleService.Update(r.Context(), id, input)
    if err != nil {
        switch err {
        case service.ErrCalculationRuleNotFound:
            respondError(w, http.StatusNotFound, "Calculation rule not found")
        case service.ErrCalculationRuleNameRequired:
            respondError(w, http.StatusBadRequest, "Name cannot be empty")
        case service.ErrCalculationRuleAccountNotFound:
            respondError(w, http.StatusBadRequest, "Linked account not found")
        case service.ErrCalculationRuleInvalidFactor:
            respondError(w, http.StatusBadRequest, "Factor must be greater than zero")
        case service.ErrCalculationRuleNegativeValue:
            respondError(w, http.StatusBadRequest, "Value must not be negative")
        default:
            respondError(w, http.StatusInternalServerError, "Failed to update calculation rule")
        }
        return
    }

    // Audit log
    if h.auditService != nil {
        changes := map[string]any{}
        if oldRule != nil {
            if rule.Name != oldRule.Name {
                changes["name"] = map[string]any{"from": oldRule.Name, "to": rule.Name}
            }
            if rule.Value != oldRule.Value {
                changes["value"] = map[string]any{"from": oldRule.Value, "to": rule.Value}
            }
            if rule.Factor != oldRule.Factor {
                changes["factor"] = map[string]any{"from": oldRule.Factor, "to": rule.Factor}
            }
            if rule.IsActive != oldRule.IsActive {
                changes["is_active"] = map[string]any{"from": oldRule.IsActive, "to": rule.IsActive}
            }
        }
        h.auditService.Log(r.Context(), r, service.LogEntry{
            TenantID:   tenantID,
            Action:     model.AuditActionUpdate,
            EntityType: "calculation_rule",
            EntityID:   rule.ID,
            EntityName: rule.Name,
            Changes:    changes,
        })
    }

    respondJSON(w, http.StatusOK, rule)
}

// Delete handles DELETE /calculation-rules/{id}
func (h *CalculationRuleHandler) Delete(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid calculation rule ID")
        return
    }

    // Get rule for audit before deleting
    oldRule, _ := h.ruleService.GetByID(r.Context(), id)

    if err := h.ruleService.Delete(r.Context(), id); err != nil {
        switch err {
        case service.ErrCalculationRuleNotFound:
            respondError(w, http.StatusNotFound, "Calculation rule not found")
        case service.ErrCalculationRuleInUse:
            respondError(w, http.StatusConflict, "Calculation rule is assigned to absence types")
        default:
            respondError(w, http.StatusInternalServerError, "Failed to delete calculation rule")
        }
        return
    }

    // Audit log
    if h.auditService != nil && oldRule != nil {
        h.auditService.Log(r.Context(), r, service.LogEntry{
            TenantID:   tenantID,
            Action:     model.AuditActionDelete,
            EntityType: "calculation_rule",
            EntityID:   id,
            EntityName: oldRule.Name,
        })
    }

    w.WriteHeader(http.StatusNoContent)
}

// Preview handles POST /calculation-rules/preview
func (h *CalculationRuleHandler) Preview(w http.ResponseWriter, r *http.Request) {
    _, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    var req models.CalculationPreviewRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "Invalid request body")
        return
    }

    if err := req.Validate(nil); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    ruleID, err := uuid.Parse(req.CalculationRuleID.String())
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid calculation_rule_id")
        return
    }

    input := service.PreviewInput{
        RuleID:             ruleID,
        DailyTargetMinutes: int(req.DailyTargetMinutes),
    }

    result, err := h.ruleService.Preview(r.Context(), input)
    if err != nil {
        switch err {
        case service.ErrCalculationRuleNotFound:
            respondError(w, http.StatusNotFound, "Calculation rule not found")
        default:
            respondError(w, http.StatusInternalServerError, "Failed to compute preview")
        }
        return
    }

    respondJSON(w, http.StatusOK, result)
}
```

**Pattern reference**: `/home/tolga/projects/terp/apps/api/internal/handler/account.go`

### 6.2 Register Routes

**File to modify**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

Add this function at the end of the file:

```go
// RegisterCalculationRuleRoutes registers calculation rule routes.
func RegisterCalculationRuleRoutes(r chi.Router, h *CalculationRuleHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("absence_types.manage").String()
    r.Route("/calculation-rules", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Post("/preview", h.Preview)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Post("/preview", h.Preview)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
    })
}
```

**Note**: Uses `absence_types.manage` permission since calculation rules are conceptually part of absence type configuration. This avoids adding a new permission that would need to be assigned to existing user groups.

### 6.3 Wire Up in main.go

**File to modify**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

Add after the existing repository initializations (after `absenceTypeGroupRepo` around line 116):

```go
calculationRuleRepo := repository.NewCalculationRuleRepository(db)
```

Add after service initializations (after `absenceTypeGroupService`):

```go
calculationRuleService := service.NewCalculationRuleService(calculationRuleRepo, accountRepo, absenceTypeRepo)
```

Add after handler initializations (after `absenceTypeGroupHandler`):

```go
calculationRuleHandler := handler.NewCalculationRuleHandler(calculationRuleService)
```

Add after the audit service wiring block (after `absenceHandler.SetAuditService(auditLogService)`):

```go
calculationRuleHandler.SetAuditService(auditLogService)
```

Add inside the tenant-scoped routes group (after `RegisterCorrectionAssistantRoutes`):

```go
handler.RegisterCalculationRuleRoutes(r, calculationRuleHandler, authzMiddleware)
```

### 6.4 Update Absence Handler for Calculation Rule Assignment

**File to modify**: `/home/tolga/projects/terp/apps/api/internal/handler/absence.go`

In the `CreateType` and `UpdateType` methods, add handling for the `calculation_rule_id` field from the request body. When setting `calculation_rule_id` on an absence type:

1. Parse the `calculation_rule_id` from the request body
2. If not null, validate the rule exists and is active via `CalculationRuleService.ValidateRuleForAssignment()`
3. Set the field on the `AbsenceType` model

This requires the absence handler to get a reference to the calculation rule service. Add:

```go
func (h *AbsenceHandler) SetCalculationRuleService(svc *service.CalculationRuleService) {
    h.calcRuleService = svc
}
```

And wire in main.go:
```go
absenceHandler.SetCalculationRuleService(calculationRuleService)
```

In the absence type create/update flows, when `calculation_rule_id` is present:
- Call `h.calcRuleService.ValidateRuleForAssignment(ctx, ruleID)`
- If it returns `ErrCalculationRuleInactive`, respond with 400 "Cannot assign inactive calculation rule"
- If it returns `ErrCalculationRuleNotFound`, respond with 400 "Calculation rule not found"
- Otherwise set the field on the model

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 7: Tests

### 7.1 Service Unit Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/calculationrule_test.go`

Tests to implement:

```go
// === Calculation logic tests ===

func TestCalculationRule_CalculateAccountValue_ValueTimesFactory(t *testing.T)
// Input: rule with value=120 (2h), factor=3.0
// Expected: 360 (6h)

func TestCalculationRule_CalculateAccountValue_ValueZeroUsesTargetTime(t *testing.T)
// Input: rule with value=0, factor=1.0, dailyTarget=480 (8h)
// Expected: 480

func TestCalculationRule_CalculateAccountValue_ValueZeroWithHalfFactor(t *testing.T)
// Input: rule with value=0, factor=0.5, dailyTarget=480
// Expected: 240

func TestCalculationRule_CalculateAccountValue_ValueWithFraction(t *testing.T)
// Input: rule with value=60 (1h), factor=1.5
// Expected: 90

// === CRUD tests ===

func TestCalculationRuleService_Create_Success(t *testing.T)
// Create rule with all fields, verify returned struct

func TestCalculationRuleService_Create_EmptyCode(t *testing.T)
// Expect ErrCalculationRuleCodeRequired

func TestCalculationRuleService_Create_EmptyName(t *testing.T)
// Expect ErrCalculationRuleNameRequired

func TestCalculationRuleService_Create_DuplicateCode(t *testing.T)
// Expect ErrCalculationRuleCodeExists

func TestCalculationRuleService_Create_InvalidAccount(t *testing.T)
// Expect ErrCalculationRuleAccountNotFound

func TestCalculationRuleService_Create_NegativeValue(t *testing.T)
// Expect ErrCalculationRuleNegativeValue

func TestCalculationRuleService_Create_ZeroFactor(t *testing.T)
// Expect ErrCalculationRuleInvalidFactor

func TestCalculationRuleService_GetByID_Success(t *testing.T)
func TestCalculationRuleService_GetByID_NotFound(t *testing.T)

func TestCalculationRuleService_Update_Success(t *testing.T)
func TestCalculationRuleService_Update_EmptyName(t *testing.T)
func TestCalculationRuleService_Update_NotFound(t *testing.T)

func TestCalculationRuleService_Delete_Success(t *testing.T)
func TestCalculationRuleService_Delete_NotFound(t *testing.T)
func TestCalculationRuleService_Delete_InUse(t *testing.T)
// Create rule, assign to absence type, verify delete returns ErrCalculationRuleInUse

func TestCalculationRuleService_List(t *testing.T)
func TestCalculationRuleService_ListFiltered_ActiveOnly(t *testing.T)

// === Validation tests ===

func TestCalculationRuleService_ValidateForAssignment_Active(t *testing.T)
// Create active rule, expect nil error

func TestCalculationRuleService_ValidateForAssignment_Inactive(t *testing.T)
// Create inactive rule, expect ErrCalculationRuleInactive

func TestCalculationRuleService_ValidateForAssignment_NotFound(t *testing.T)
// Random UUID, expect ErrCalculationRuleNotFound

// === Preview tests ===

func TestCalculationRuleService_Preview_WithValue(t *testing.T)
// rule: value=120, factor=2.0 -> baseMinutes=120, resultMinutes=240

func TestCalculationRuleService_Preview_ValueZero_DefaultTarget(t *testing.T)
// rule: value=0, factor=1.0, no target override -> base=480, result=480

func TestCalculationRuleService_Preview_ValueZero_CustomTarget(t *testing.T)
// rule: value=0, factor=1.5, target=360 -> base=360, result=540
```

**Test structure pattern** (per `/home/tolga/projects/terp/apps/api/internal/service/account_test.go`):

```go
func createTestTenantForCalcRuleService(t *testing.T, db *repository.DB) *model.Tenant {
    t.Helper()
    tenantRepo := repository.NewTenantRepository(db)
    tenant := &model.Tenant{
        Name:     "Test Tenant " + uuid.New().String()[:8],
        Slug:     "test-" + uuid.New().String()[:8],
        IsActive: true,
    }
    err := tenantRepo.Create(context.Background(), tenant)
    require.NoError(t, err)
    return tenant
}

func createTestAccountForCalcRule(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Account {
    t.Helper()
    repo := repository.NewAccountRepository(db)
    account := &model.Account{
        TenantID:    &tenantID,
        Code:        "TEST_ACC_" + uuid.New().String()[:8],
        Name:        "Test Account",
        AccountType: model.AccountTypeDay,
        Unit:        model.AccountUnitMinutes,
        IsActive:    true,
    }
    err := repo.Create(context.Background(), account)
    require.NoError(t, err)
    return account
}
```

### 7.2 Handler Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/calculationrule_test.go`

Tests to implement:

```go
func setupCalculationRuleHandler(t *testing.T) (*handler.CalculationRuleHandler, *service.CalculationRuleService, *model.Tenant, *repository.DB)

func withCalcRuleTenantContext(r *http.Request, tenant *model.Tenant) *http.Request

// === CRUD handler tests ===

func TestCalculationRuleHandler_Create_Success(t *testing.T)
// POST with valid body, expect 201

func TestCalculationRuleHandler_Create_InvalidBody(t *testing.T)
// POST with invalid JSON, expect 400

func TestCalculationRuleHandler_Create_MissingCode(t *testing.T)
// POST without code, expect 400

func TestCalculationRuleHandler_Create_DuplicateCode(t *testing.T)
// Create, then POST same code, expect 409

func TestCalculationRuleHandler_Create_NoTenant(t *testing.T)
// POST without tenant context, expect 401

func TestCalculationRuleHandler_Get_Success(t *testing.T)
func TestCalculationRuleHandler_Get_NotFound(t *testing.T)
func TestCalculationRuleHandler_Get_InvalidID(t *testing.T)

func TestCalculationRuleHandler_List_Success(t *testing.T)
func TestCalculationRuleHandler_List_ActiveFilter(t *testing.T)
func TestCalculationRuleHandler_List_NoTenant(t *testing.T)

func TestCalculationRuleHandler_Update_Success(t *testing.T)
func TestCalculationRuleHandler_Update_NotFound(t *testing.T)
func TestCalculationRuleHandler_Update_InvalidBody(t *testing.T)

func TestCalculationRuleHandler_Delete_Success(t *testing.T)
func TestCalculationRuleHandler_Delete_NotFound(t *testing.T)
func TestCalculationRuleHandler_Delete_InUse(t *testing.T)

// === Preview handler test ===

func TestCalculationRuleHandler_Preview_WithValue(t *testing.T)
// POST /calculation-rules/preview with rule_id, expect computed result

func TestCalculationRuleHandler_Preview_ValueZero(t *testing.T)
// POST /calculation-rules/preview with value=0 rule, verify uses target time

// === Audit log verification ===

func TestCalculationRuleHandler_Create_AuditLog(t *testing.T)
// Create with audit service wired, verify log entry created

func TestCalculationRuleHandler_Update_AuditLog(t *testing.T)
// Update with audit service, verify changes captured
```

**Test structure pattern** (per `/home/tolga/projects/terp/apps/api/internal/handler/account_test.go`):

```go
func setupCalculationRuleHandler(t *testing.T) (*handler.CalculationRuleHandler, *service.CalculationRuleService, *model.Tenant, *repository.DB) {
    db := testutil.SetupTestDB(t)
    ruleRepo := repository.NewCalculationRuleRepository(db)
    accountRepo := repository.NewAccountRepository(db)
    absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
    tenantRepo := repository.NewTenantRepository(db)

    svc := service.NewCalculationRuleService(ruleRepo, accountRepo, absenceTypeRepo)
    h := handler.NewCalculationRuleHandler(svc)

    tenant := &model.Tenant{
        Name:     "Test Tenant " + uuid.New().String()[:8],
        Slug:     "test-" + uuid.New().String()[:8],
        IsActive: true,
    }
    err := tenantRepo.Create(context.Background(), tenant)
    require.NoError(t, err)

    return h, svc, tenant, db
}
```

### 7.3 Run Tests

```bash
cd /home/tolga/projects/terp/apps/api && go test -v -run TestCalculationRule ./internal/service/...
cd /home/tolga/projects/terp/apps/api && go test -v -run TestCalculationRule ./internal/handler/...
```

### 7.4 Full Test Suite

```bash
cd /home/tolga/projects/terp && make test
```

### Verification

All tests pass with no regressions.

---

## File Summary

### New Files

| File | Description |
|------|-------------|
| `db/migrations/000046_create_calculation_rules.up.sql` | Create calculation_rules table |
| `db/migrations/000046_create_calculation_rules.down.sql` | Drop calculation_rules table |
| `db/migrations/000047_add_calculation_rule_to_absence_types.up.sql` | Add calculation_rule_id FK to absence_types |
| `db/migrations/000047_add_calculation_rule_to_absence_types.down.sql` | Drop calculation_rule_id column |
| `api/schemas/calculation-rules.yaml` | OpenAPI schema definitions |
| `api/paths/calculation-rules.yaml` | OpenAPI path definitions |
| `apps/api/internal/model/calculationrule.go` | CalculationRule GORM model + CalculateAccountValue method |
| `apps/api/internal/repository/calculationrule.go` | CalculationRule repository (CRUD + tenant-scoped queries) |
| `apps/api/internal/service/calculationrule.go` | Business logic, validation, preview computation |
| `apps/api/internal/handler/calculationrule.go` | HTTP handlers + audit logging |
| `apps/api/internal/service/calculationrule_test.go` | Service unit tests |
| `apps/api/internal/handler/calculationrule_test.go` | Handler integration tests |

### Modified Files

| File | Change |
|------|--------|
| `api/openapi.yaml` | Add Calculation Rules tag, paths, and definitions |
| `api/schemas/absence-types.yaml` | Add `calculation_rule_id` to AbsenceType, Create, Update schemas |
| `apps/api/internal/model/absencetype.go` | Add `CalculationRuleID` and `CalculationRule` relation fields |
| `apps/api/internal/repository/absencetype.go` | Add `CountByCalculationRuleID` method |
| `apps/api/internal/handler/routes.go` | Add `RegisterCalculationRuleRoutes` function |
| `apps/api/internal/handler/absence.go` | Add `SetCalculationRuleService` and validation on type create/update |
| `apps/api/cmd/server/main.go` | Wire repo, service, handler, audit, routes |

---

## Implementation Order

Execute phases sequentially:

1. **Phase 1** - Database migration (depends on nothing)
2. **Phase 2** - OpenAPI spec (depends on nothing, can parallelize with Phase 1)
3. **Phase 3** - Generate models (depends on Phase 2)
4. **Phase 4** - Domain model + repository (depends on Phase 1, Phase 3)
5. **Phase 5** - Service layer (depends on Phase 4)
6. **Phase 6** - HTTP handlers + wiring (depends on Phase 5)
7. **Phase 7** - Tests (depends on Phase 6)

---

## Acceptance Criteria Mapping

| Criterion | Phase | How verified |
|-----------|-------|-------------|
| Calculation rules can be created and assigned to absence types | Phase 5, 6 | CRUD tests + assignment validation test |
| Absence day evaluation applies the rule consistently | Phase 4 (CalculateAccountValue) | Unit tests for value*factor and value=0 cases |
| Account values written if configured | Phase 5 (Preview) | Preview endpoint returns computed value |
| Audit log captures rule changes with user identity | Phase 6 | Audit log tests verify entries created |

---

## Test Case Mapping

| Test Case | Test Function |
|-----------|--------------|
| value=120, factor=3.0 -> 360 | `TestCalculationRule_CalculateAccountValue_ValueTimesFactory` |
| value=0, factor=1.0, target=480 -> 480 | `TestCalculationRule_CalculateAccountValue_ValueZeroUsesTargetTime` |
| Assign inactive rule -> error | `TestCalculationRuleService_ValidateForAssignment_Inactive` |
| Create + assign + preview | `TestCalculationRuleHandler_Preview_WithValue` |
| Update + audit log | `TestCalculationRuleHandler_Update_AuditLog` |

---

## Notes

- **Permission**: Reuses `absence_types.manage` since calculation rules are conceptually part of absence type configuration. No new permission entry needed in `permissions.go`.
- **Daily calc integration**: The `daily_calc.go` service does NOT yet write account values during absence day processing. This can be a follow-up: look up the absence type's calculation rule in `handleAbsenceCredit()`, compute the value, and write to the account_values table. The current ticket focuses on the CRUD + formula + preview, not the runtime integration.
- **Factor validation**: Factor must be > 0. A factor of 0 would always produce 0, which is likely a configuration error.
- **Value semantics**: Value is in minutes. value=0 is a special sentinel meaning "use daily target time from the time plan". Negative values are rejected.
