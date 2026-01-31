# ZMI-TICKET-036: Day Plan Net/Cap Accounts Implementation Plan

## Overview

Add two nullable account reference fields (`net_account_id`, `cap_account_id`) to day plans, create a `daily_account_values` table for per-account daily postings, and integrate account posting into the daily calculation flow. After each daily calculation, if the day plan has a net or cap account configured, the service posts the computed `NetTime` or `CappedTime` (respectively) as a `DailyAccountValue` row. Recalculation replaces existing postings via upsert semantics.

## Current State Analysis

- `day_plans` table has no `net_account_id` or `cap_account_id` columns.
- `DayPlan` model (`apps/api/internal/model/dayplan.go`) has no such fields.
- No `daily_account_values` table or model exists.
- The OpenAPI schema `AccountValue` exists in `api/schemas/accounts.yaml` (lines 111-166) but has no backing migration, model, repository, or handler.
- `DailyCalcService.CalculateDay` (`apps/api/internal/service/daily_calc.go:157`) computes `NetTime` and `CappedTime` via the calculator but does not write account postings.
- The `DayPlanBonus.AccountID` pattern (UUID FK to `accounts`) is the existing reference for associating day plans with accounts.
- The `DailyValueRepository.Upsert` method (`apps/api/internal/repository/dailyvalue.go:171`) uses `clause.OnConflict` for upsert -- the same pattern needed for daily account values.

### Key Discoveries:
- `CalculationResult` already has `NetTime` (int) and `CappedTime` (int) fields (`apps/api/internal/calculation/types.go`)
- The `DayPlanRepository.Create` uses explicit `Select(...)` for column list (`apps/api/internal/repository/dayplan.go:32-34`) -- new columns must be added here
- `DayPlanService.Copy` explicitly copies all fields (`apps/api/internal/service/dayplan.go:365-389`) -- new fields must be added
- `AccountRepository.ListFiltered` computes `usage_count` from `day_plan_bonuses` only (`apps/api/internal/repository/account.go:170-201`) -- needs expansion to include new FK columns
- `AccountRepository.ListDayPlansUsingAccount` queries only `day_plan_bonuses` (`apps/api/internal/repository/account.go:204-218`) -- needs expansion

## Desired End State

After this plan is complete:

1. Day plans can reference a "net account" and a "cap account" (both nullable, both must be `account_type=day`).
2. After daily calculation, if the day plan has `net_account_id` set, a `daily_account_values` row is upserted with `value_minutes = NetTime` and `source = 'net_time'`.
3. After daily calculation, if the day plan has `cap_account_id` set, a `daily_account_values` row is upserted with `value_minutes = CappedTime` and `source = 'capped_time'`.
4. Recalculation replaces existing postings (upsert on `employee_id + value_date + account_id + source`).
5. Off-days and days without a plan produce no account postings.
6. The API exposes the new fields on day plan CRUD and provides a read endpoint for daily account values.
7. Account usage tracking includes the new FK columns.

### Verification:
- `make migrate-up` applies cleanly
- `make generate` regenerates models with new fields
- `make test` passes with new unit tests
- `make lint` passes
- API endpoints accept/return new fields

## What We're NOT Doing

- Payroll export changes (existing export logic handles `AccountValues` as computed map)
- Monthly aggregation of daily account values (future ticket)
- Manual correction of daily account values (future ticket)
- UI changes (frontend ticket)

## Implementation Approach

Four phases:
1. **Database + Models**: Migration, internal model, OpenAPI schema, code generation
2. **Repository Layer**: DailyAccountValue repository, DayPlan repository updates, Account usage updates
3. **Service + Handler Layer**: DayPlan service input updates, DailyCalc integration, handler updates, API endpoint for listing
4. **Tests**: Unit tests for service logic, integration tests for daily calc flow

---

## Phase 1: Database Migration + Models + OpenAPI

### Overview
Create the database migration, update internal models, update OpenAPI schemas, and regenerate Go models.

### Changes Required:

#### 1. Database Migration
**File**: `db/migrations/000079_add_day_plan_net_cap_accounts.up.sql` (CREATE)

```sql
-- Add net/cap account references to day_plans
ALTER TABLE day_plans
    ADD COLUMN IF NOT EXISTS net_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cap_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Create daily account values table
CREATE TABLE daily_account_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    value_date DATE NOT NULL,
    value_minutes INT NOT NULL DEFAULT 0,
    source VARCHAR(20) NOT NULL,  -- 'net_time' or 'capped_time'
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per employee per date per account per source
    UNIQUE(employee_id, value_date, account_id, source)
);

-- Indexes for common query patterns
CREATE INDEX idx_daily_account_values_tenant ON daily_account_values(tenant_id);
CREATE INDEX idx_daily_account_values_employee ON daily_account_values(employee_id);
CREATE INDEX idx_daily_account_values_account ON daily_account_values(account_id);
CREATE INDEX idx_daily_account_values_date ON daily_account_values(value_date);
CREATE INDEX idx_daily_account_values_lookup ON daily_account_values(employee_id, value_date);

COMMENT ON TABLE daily_account_values IS 'Daily account postings from calculation (net time, capped time)';
COMMENT ON COLUMN daily_account_values.source IS 'Source of posting: net_time or capped_time';
COMMENT ON COLUMN daily_account_values.value_minutes IS 'Posted value in minutes';
```

**File**: `db/migrations/000079_add_day_plan_net_cap_accounts.down.sql` (CREATE)

```sql
DROP TABLE IF EXISTS daily_account_values;
ALTER TABLE day_plans
    DROP COLUMN IF EXISTS net_account_id,
    DROP COLUMN IF EXISTS cap_account_id;
```

#### 2. Internal Model - DayPlan Update
**File**: `apps/api/internal/model/dayplan.go`
**Changes**: Add two nullable UUID pointer fields after `ShiftAltPlan6`, before `IsActive`.

Add after `ShiftAltPlan6` (line ~124):
```go
	// ZMI: Tagesnetto-Konto - account for posting daily net time
	NetAccountID *uuid.UUID `gorm:"column:net_account_id;type:uuid" json:"net_account_id,omitempty"`
	// ZMI: Kappungskonto - account for posting capped minutes
	CapAccountID *uuid.UUID `gorm:"column:cap_account_id;type:uuid" json:"cap_account_id,omitempty"`
```

#### 3. Internal Model - DailyAccountValue
**File**: `apps/api/internal/model/daily_account_value.go` (CREATE)

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// DailyAccountValueSource defines the source of a daily account posting.
type DailyAccountValueSource string

const (
	DailyAccountValueSourceNetTime    DailyAccountValueSource = "net_time"
	DailyAccountValueSourceCappedTime DailyAccountValueSource = "capped_time"
)

// DailyAccountValue represents a daily account posting from calculation.
type DailyAccountValue struct {
	ID           uuid.UUID               `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID               `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID   uuid.UUID               `gorm:"type:uuid;not null;index" json:"employee_id"`
	AccountID    uuid.UUID               `gorm:"type:uuid;not null;index" json:"account_id"`
	ValueDate    time.Time               `gorm:"type:date;not null" json:"value_date"`
	ValueMinutes int                     `gorm:"default:0" json:"value_minutes"`
	Source       DailyAccountValueSource `gorm:"type:varchar(20);not null" json:"source"`
	DayPlanID    *uuid.UUID              `gorm:"type:uuid" json:"day_plan_id,omitempty"`

	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Account  *Account  `gorm:"foreignKey:AccountID" json:"account,omitempty"`
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// TableName returns the database table name.
func (DailyAccountValue) TableName() string {
	return "daily_account_values"
}

// DailyAccountValueListOptions defines filters for listing daily account values.
type DailyAccountValueListOptions struct {
	EmployeeID *uuid.UUID
	AccountID  *uuid.UUID
	From       *time.Time
	To         *time.Time
	Source     *DailyAccountValueSource
}
```

#### 4. OpenAPI Schema Updates
**File**: `api/schemas/day-plans.yaml`
**Changes**: Add `net_account_id` and `cap_account_id` to `DayPlan`, `CreateDayPlanRequest`, and `UpdateDayPlanRequest`.

In `DayPlan` properties (after `shift_alt_plan_6` block, before `is_active`):
```yaml
    # Account references for daily posting
    net_account_id:
      type: string
      format: uuid
      x-nullable: true
      description: Account for posting daily net time (must be account_type=day)
    cap_account_id:
      type: string
      format: uuid
      x-nullable: true
      description: Account for posting daily capped minutes (must be account_type=day)
```

In `CreateDayPlanRequest` properties (after `shift_alt_plan_6`, before `is_active`):
```yaml
    net_account_id:
      type: string
      format: uuid
    cap_account_id:
      type: string
      format: uuid
```

In `UpdateDayPlanRequest` properties (after `shift_alt_plan_6`, before `is_active`):
```yaml
    net_account_id:
      type: string
      format: uuid
    cap_account_id:
      type: string
      format: uuid
```

**File**: `api/schemas/accounts.yaml`
**Changes**: Update `AccountValue.source` enum to include `net_time` and `capped_time`, and add `day_plan_id` field.

Update the `source` enum (line ~140):
```yaml
    source:
      type: string
      enum:
        - calculated
        - manual
        - correction
        - import
        - net_time
        - capped_time
      example: "calculated"
```

Add `day_plan_id` property after `source_id`:
```yaml
    day_plan_id:
      type: string
      format: uuid
      x-nullable: true
      description: Day plan that generated this posting
```

#### 5. Regenerate Models
Run:
```bash
make swagger-bundle
make generate
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `make migrate-up`
- [ ] Migration rollback works: `make migrate-down` then `make migrate-up`
- [ ] OpenAPI bundle succeeds: `make swagger-bundle`
- [ ] Model generation succeeds: `make generate`
- [ ] Code compiles: `cd apps/api && go build ./...`

#### Manual Verification:
- [ ] Verify `day_plans` table has `net_account_id` and `cap_account_id` columns via psql
- [ ] Verify `daily_account_values` table exists with correct schema via psql

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Repository Layer

### Overview
Create the DailyAccountValue repository and update the DayPlan and Account repositories to handle the new fields.

### Changes Required:

#### 1. DailyAccountValue Repository
**File**: `apps/api/internal/repository/daily_account_value.go` (CREATE)

Follow the `DailyValueRepository` pattern (`apps/api/internal/repository/dailyvalue.go`).

```go
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrDailyAccountValueNotFound = errors.New("daily account value not found")
)

// DailyAccountValueRepository handles daily account value data access.
type DailyAccountValueRepository struct {
	db *DB
}

// NewDailyAccountValueRepository creates a new daily account value repository.
func NewDailyAccountValueRepository(db *DB) *DailyAccountValueRepository {
	return &DailyAccountValueRepository{db: db}
}

// Upsert creates or updates a daily account value based on employee_id + value_date + account_id + source.
func (r *DailyAccountValueRepository) Upsert(ctx context.Context, dav *model.DailyAccountValue) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "employee_id"},
				{Name: "value_date"},
				{Name: "account_id"},
				{Name: "source"},
			},
			DoUpdates: clause.AssignmentColumns([]string{
				"value_minutes", "day_plan_id", "updated_at",
			}),
		}).
		Create(dav).Error
}

// DeleteByEmployeeDate deletes all daily account values for an employee on a date.
func (r *DailyAccountValueRepository) DeleteByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date = ?", employeeID, date).
		Delete(&model.DailyAccountValue{})
	return result.Error
}

// ListFiltered retrieves daily account values with optional filters.
func (r *DailyAccountValueRepository) ListFiltered(ctx context.Context, tenantID uuid.UUID, opts model.DailyAccountValueListOptions) ([]model.DailyAccountValue, error) {
	var values []model.DailyAccountValue
	q := r.db.GORM.WithContext(ctx).
		Preload("Account").
		Preload("Employee").
		Where("tenant_id = ?", tenantID)

	if opts.EmployeeID != nil {
		q = q.Where("employee_id = ?", *opts.EmployeeID)
	}
	if opts.AccountID != nil {
		q = q.Where("account_id = ?", *opts.AccountID)
	}
	if opts.From != nil {
		q = q.Where("value_date >= ?", *opts.From)
	}
	if opts.To != nil {
		q = q.Where("value_date <= ?", *opts.To)
	}
	if opts.Source != nil {
		q = q.Where("source = ?", *opts.Source)
	}

	err := q.Order("value_date ASC, account_id ASC").Find(&values).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list daily account values: %w", err)
	}
	return values, nil
}

// GetByEmployeeDateAccountSource retrieves a specific daily account value.
func (r *DailyAccountValueRepository) GetByEmployeeDateAccountSource(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	accountID uuid.UUID,
	source model.DailyAccountValueSource,
) (*model.DailyAccountValue, error) {
	var dav model.DailyAccountValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date = ? AND account_id = ? AND source = ?",
			employeeID, date, accountID, source).
		First(&dav).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get daily account value: %w", err)
	}
	return &dav, nil
}
```

#### 2. DayPlan Repository Update
**File**: `apps/api/internal/repository/dayplan.go`
**Changes**: Add `NetAccountID` and `CapAccountID` to the explicit `Select(...)` list in the `Create` method.

Update line 33 to include the new fields in the Select:
```go
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "PlanType", "ComeFrom", "ComeTo", "GoFrom", "GoTo", "CoreStart", "CoreEnd", "RegularHours", "ToleranceComePlus", "ToleranceComeMinus", "ToleranceGoPlus", "ToleranceGoMinus", "RoundingComeType", "RoundingComeInterval", "RoundingGoType", "RoundingGoInterval", "MinWorkTime", "MaxNetWorkTime", "NetAccountID", "CapAccountID", "IsActive").
		Create(plan).Error
```

#### 3. Account Repository Updates
**File**: `apps/api/internal/repository/account.go`
**Changes**: Update `ListFiltered` usage_count subquery and `ListDayPlansUsingAccount` to include `net_account_id` and `cap_account_id` references.

Update `ListFiltered` (replace lines 172-177) -- usage subquery should be a UNION of bonus references and direct FK references:
```go
	// Count day plans using this account via bonuses, net_account_id, or cap_account_id
	usageSubquery := r.db.GORM.WithContext(ctx).
		Raw(`
			SELECT account_id, COUNT(DISTINCT day_plan_id) AS usage_count FROM (
				SELECT dpb.account_id, dpb.day_plan_id
				FROM day_plan_bonuses dpb
				JOIN day_plans dp ON dp.id = dpb.day_plan_id
				WHERE dp.tenant_id = ?
				UNION ALL
				SELECT dp.net_account_id AS account_id, dp.id AS day_plan_id
				FROM day_plans dp
				WHERE dp.tenant_id = ? AND dp.net_account_id IS NOT NULL
				UNION ALL
				SELECT dp.cap_account_id AS account_id, dp.id AS day_plan_id
				FROM day_plans dp
				WHERE dp.tenant_id = ? AND dp.cap_account_id IS NOT NULL
			) AS refs
			GROUP BY account_id
		`, tenantID, tenantID, tenantID)
```

Update `ListDayPlansUsingAccount` (replace lines 206-217) -- UNION query to include bonus + net + cap references:
```go
func (r *AccountRepository) ListDayPlansUsingAccount(ctx context.Context, tenantID uuid.UUID, accountID uuid.UUID) ([]model.AccountUsageDayPlan, error) {
	var plans []model.AccountUsageDayPlan
	err := r.db.GORM.WithContext(ctx).
		Raw(`
			SELECT DISTINCT dp.id, dp.code, dp.name
			FROM day_plans dp
			WHERE dp.tenant_id = ? AND (
				dp.id IN (SELECT day_plan_id FROM day_plan_bonuses WHERE account_id = ?)
				OR dp.net_account_id = ?
				OR dp.cap_account_id = ?
			)
			ORDER BY dp.code ASC
		`, tenantID, accountID, accountID, accountID).
		Scan(&plans).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list day plans for account: %w", err)
	}
	return plans, nil
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Existing tests pass: `cd apps/api && go test ./internal/repository/...`

#### Manual Verification:
- [ ] Verify new repository file exists and follows project patterns

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Service + Handler Layer

### Overview
Update the DayPlan service to handle net/cap account fields in CRUD operations. Integrate account posting into daily calculation. Add handler support for the new fields and a list endpoint for daily account values.

### Changes Required:

#### 1. DayPlan Service Input Updates
**File**: `apps/api/internal/service/dayplan.go`

Add fields to `CreateDayPlanInput` (after `MaxNetWorkTime *int`, line ~79):
```go
	NetAccountID   *uuid.UUID
	CapAccountID   *uuid.UUID
```

Add fields to `UpdateDayPlanInput` (after `MaxNetWorkTime *int`, line ~220):
```go
	NetAccountID   *uuid.UUID
	CapAccountID   *uuid.UUID
```

Update `Create` method -- set new fields on the model (after `MaxNetWorkTime` assignment, around line 139):
```go
		NetAccountID:         input.NetAccountID,
		CapAccountID:         input.CapAccountID,
```

Update `Update` method -- handle new fields (after `MaxNetWorkTime` handling, around line 297):
```go
	if input.NetAccountID != nil {
		plan.NetAccountID = input.NetAccountID
	}
	if input.CapAccountID != nil {
		plan.CapAccountID = input.CapAccountID
	}
```

Update `Copy` method -- copy new fields (after `MaxNetWorkTime` in `newPlan` struct, around line 388):
```go
		NetAccountID:         original.NetAccountID,
		CapAccountID:         original.CapAccountID,
```

#### 2. Daily Calculation Service Integration
**File**: `apps/api/internal/service/daily_calc.go`

Add a new interface for account value posting:
```go
// dailyAccountValueRepository defines the interface for daily account value data access.
type dailyAccountValueRepository interface {
	Upsert(ctx context.Context, dav *model.DailyAccountValue) error
	DeleteByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) error
}
```

Add field to `DailyCalcService` struct (after `settingsLookup`):
```go
	dailyAccValueRepo dailyAccountValueRepository
```

Add setter method:
```go
// SetDailyAccountValueRepo sets the daily account value repository for account postings.
func (s *DailyCalcService) SetDailyAccountValueRepo(repo dailyAccountValueRepository) {
	s.dailyAccValueRepo = repo
}
```

Add private method for posting account values (new method):
```go
// postAccountValues writes daily account values for net time and capped time
// based on the day plan configuration. Uses upsert to handle recalculation.
func (s *DailyCalcService) postAccountValues(
	ctx context.Context,
	tenantID, employeeID uuid.UUID,
	date time.Time,
	dayPlan *model.DayPlan,
	netTime, cappedTime int,
) {
	if s.dailyAccValueRepo == nil || dayPlan == nil {
		return
	}

	if dayPlan.NetAccountID != nil {
		dav := &model.DailyAccountValue{
			TenantID:     tenantID,
			EmployeeID:   employeeID,
			AccountID:    *dayPlan.NetAccountID,
			ValueDate:    date,
			ValueMinutes: netTime,
			Source:       model.DailyAccountValueSourceNetTime,
			DayPlanID:    &dayPlan.ID,
		}
		_ = s.dailyAccValueRepo.Upsert(ctx, dav)
	}

	if dayPlan.CapAccountID != nil {
		dav := &model.DailyAccountValue{
			TenantID:     tenantID,
			EmployeeID:   employeeID,
			AccountID:    *dayPlan.CapAccountID,
			ValueDate:    date,
			ValueMinutes: cappedTime,
			Source:       model.DailyAccountValueSourceCappedTime,
			DayPlanID:    &dayPlan.ID,
		}
		_ = s.dailyAccValueRepo.Upsert(ctx, dav)
	}
}
```

Integrate into `CalculateDay` -- after the daily value is persisted (after `s.dailyValueRepo.Upsert(ctx, dailyValue)` call at line ~216) and before the notification call:

```go
	// Post account values (net time, capped time) if day plan has accounts configured
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		// For normal calculation with bookings, use the calculation result values
		// For special cases (off-day, holiday, no-bookings), netTime from dailyValue is used,
		// capped time is 0 since no capping occurs without bookings
		s.postAccountValues(ctx, tenantID, employeeID, date, empDayPlan.DayPlan, dailyValue.NetTime, 0)
	}
```

And update `calculateWithBookings` -- pass capped time to a new return value, or better: invoke `postAccountValues` after `calculateWithBookings` returns. The cleanest approach is to store the capped time on the result and pass it from `CalculateDay`.

Specifically, update the `calculateWithBookings` return signature to also return `cappedTime int`:

**Current** (line ~836):
```go
func (s *DailyCalcService) calculateWithBookings(...) (*model.DailyValue, error) {
```
**Updated**:
```go
func (s *DailyCalcService) calculateWithBookings(...) (*model.DailyValue, int, error) {
```

Inside `calculateWithBookings`, before the return at line ~905:
```go
	return dailyValue, result.CappedTime, nil
```

Update the caller in `CalculateDay` (line ~206):
```go
	} else {
		// Normal calculation with bookings
		var cappedTime int
		dailyValue, cappedTime, err = s.calculateWithBookings(ctx, tenantID, employeeID, date, empDayPlan, bookings, isHoliday)
		if err != nil {
			return nil, err
		}
		// cappedTime is used for account posting below
		_ = cappedTime
	}
```

Then the account posting block after upsert becomes:
```go
	// Post account values (net time, capped time) if day plan has accounts configured
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		capped := 0
		if cappedTime > 0 {
			capped = cappedTime
		}
		s.postAccountValues(ctx, tenantID, employeeID, date, empDayPlan.DayPlan, dailyValue.NetTime, capped)
	}
```

NOTE: To keep `cappedTime` in scope, declare it at the top of `CalculateDay`:
```go
	var dailyValue *model.DailyValue
	var cappedTime int
```

And update each branch:
- Off-day: `cappedTime = 0` (default, no change needed)
- Holiday: `cappedTime = 0` (default, no change needed)
- No-bookings: `cappedTime = 0` (default, no change needed)
- calculateWithBookings: returns cappedTime as second return value

#### 3. DayPlan Handler Updates
**File**: `apps/api/internal/handler/dayplan.go`

Update `Create` handler -- map new fields from request (after `MaxNetWorkTime` handling, around line 150):
```go
	if req.NetAccountID != "" {
		id, err := uuid.Parse(string(req.NetAccountID))
		if err == nil {
			input.NetAccountID = &id
		}
	}
	if req.CapAccountID != "" {
		id, err := uuid.Parse(string(req.CapAccountID))
		if err == nil {
			input.CapAccountID = &id
		}
	}
```

Update `Update` handler -- map new fields (after `MaxNetWorkTime` handling, around line 275):
```go
	if req.NetAccountID != "" {
		id, err := uuid.Parse(string(req.NetAccountID))
		if err == nil {
			input.NetAccountID = &id
		}
	}
	if req.CapAccountID != "" {
		id, err := uuid.Parse(string(req.CapAccountID))
		if err == nil {
			input.CapAccountID = &id
		}
	}
```

#### 4. DailyAccountValue Handler
**File**: `apps/api/internal/handler/daily_account_value.go` (CREATE)

Follow the `DailyValueHandler` pattern (`apps/api/internal/handler/dailyvalue.go`).

```go
package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// DailyAccountValueHandler handles daily account value requests.
type DailyAccountValueHandler struct {
	dailyAccountValueService *service.DailyAccountValueService
}

// NewDailyAccountValueHandler creates a new DailyAccountValueHandler.
func NewDailyAccountValueHandler(svc *service.DailyAccountValueService) *DailyAccountValueHandler {
	return &DailyAccountValueHandler{dailyAccountValueService: svc}
}

// List handles GET /account-values
func (h *DailyAccountValueHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	opts := model.DailyAccountValueListOptions{}

	if empIDStr := r.URL.Query().Get("employee_id"); empIDStr != "" {
		empID, err := uuid.Parse(empIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		opts.EmployeeID = &empID
	}

	if accIDStr := r.URL.Query().Get("account_id"); accIDStr != "" {
		accID, err := uuid.Parse(accIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid account_id")
			return
		}
		opts.AccountID = &accID
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		from, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date format, expected YYYY-MM-DD")
			return
		}
		opts.From = &from
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		to, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date format, expected YYYY-MM-DD")
			return
		}
		opts.To = &to
	}

	values, err := h.dailyAccountValueService.List(r.Context(), tenantID, opts)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list account values")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": values})
}
```

#### 5. DailyAccountValue Service
**File**: `apps/api/internal/service/daily_account_value.go` (CREATE)

```go
package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// dailyAccountValueRepo defines the interface for the service.
type dailyAccountValueRepo interface {
	ListFiltered(ctx context.Context, tenantID uuid.UUID, opts model.DailyAccountValueListOptions) ([]model.DailyAccountValue, error)
}

// DailyAccountValueService handles daily account value business logic.
type DailyAccountValueService struct {
	repo dailyAccountValueRepo
}

// NewDailyAccountValueService creates a new DailyAccountValueService.
func NewDailyAccountValueService(repo dailyAccountValueRepo) *DailyAccountValueService {
	return &DailyAccountValueService{repo: repo}
}

// List returns daily account values with filters.
func (s *DailyAccountValueService) List(ctx context.Context, tenantID uuid.UUID, opts model.DailyAccountValueListOptions) ([]model.DailyAccountValue, error) {
	return s.repo.ListFiltered(ctx, tenantID, opts)
}
```

#### 6. Server Wiring
**File**: `apps/api/cmd/server/main.go`

After the `dailyValueRepo` initialization (around line 134):
```go
	dailyAccValueRepo := repository.NewDailyAccountValueRepository(db)
```

After `dailyCalcService.SetSettingsLookup(systemSettingsService)` (around line 139):
```go
	dailyCalcService.SetDailyAccountValueRepo(dailyAccValueRepo)
```

After `dailyValueService` initialization (around line 140):
```go
	dailyAccValueService := service.NewDailyAccountValueService(dailyAccValueRepo)
```

In the handler initialization section, add:
```go
	dailyAccValueHandler := handler.NewDailyAccountValueHandler(dailyAccValueService)
```

#### 7. Route Registration
**File**: `apps/api/internal/handler/routes.go`

Add a function to register the account value routes. Follow the existing pattern from `RegisterDailyValueRoutes`:

```go
// RegisterDailyAccountValueRoutes registers routes for daily account value endpoints.
func RegisterDailyAccountValueRoutes(r chi.Router, h *DailyAccountValueHandler, authz *middleware.AuthorizationMiddleware) {
	permView := permissions.ID("daily_values.view").String()
	r.Route("/account-values", func(r chi.Router) {
		r.With(authz.RequirePermission(permView)).Get("/", h.List)
	})
}
```

In `main.go`, call the registration in the protected routes section:
```go
	handler.RegisterDailyAccountValueRoutes(protectedRouter, dailyAccValueHandler, authzMiddleware)
```

#### 8. OpenAPI Path for account-values
The existing `api/paths/accounts.yaml` already defines `/account-values` (GET) at lines 162-195. This endpoint definition matches our handler. No changes needed to the path spec since the existing spec uses `AccountValueList` which wraps `AccountValue` objects.

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Existing tests pass: `cd apps/api && go test ./...`
- [ ] Linting passes: `make lint`

#### Manual Verification:
- [ ] Create a day plan with `net_account_id` via API and verify it persists
- [ ] GET day plan returns the new account fields
- [ ] GET /account-values returns empty list initially

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Tests

### Overview
Add unit tests for the new functionality: day plan CRUD with account fields, daily calculation account posting, and daily account value listing.

### Changes Required:

#### 1. Day Plan Service Tests
**File**: `apps/api/internal/service/dayplan_test.go`

Add tests following the existing pattern (see `TestDayPlanService_Create`, `TestDayPlanService_Update`, `TestDayPlanService_Copy`).

New test cases:
```go
func TestDayPlanService_CreateWithAccountFields(t *testing.T) {
	// Setup: create a day-type account
	// Create day plan with net_account_id and cap_account_id
	// Verify fields are persisted and returned
}

func TestDayPlanService_UpdateWithAccountFields(t *testing.T) {
	// Setup: create day plan, create day-type accounts
	// Update to set net_account_id and cap_account_id
	// Verify fields are updated
}

func TestDayPlanService_CopyWithAccountFields(t *testing.T) {
	// Setup: create day plan with net/cap account IDs
	// Copy the plan
	// Verify new plan has the same account IDs
}
```

#### 2. Daily Calculation Account Posting Tests
**File**: `apps/api/internal/service/daily_calc_test.go`

Add tests following existing patterns in this file.

New test cases:
```go
func TestDailyCalcService_PostsNetTimeToAccount(t *testing.T) {
	// Setup: day plan with net_account_id, employee, bookings
	// Run CalculateDay
	// Verify daily_account_values row exists with correct minutes and source='net_time'
}

func TestDailyCalcService_PostsCappedTimeToAccount(t *testing.T) {
	// Setup: day plan with cap_account_id and max_net_work_time, bookings exceeding cap
	// Run CalculateDay
	// Verify daily_account_values row exists with correct capped minutes and source='capped_time'
}

func TestDailyCalcService_RecalcUpdatesAccountValues(t *testing.T) {
	// Setup: day plan with net_account_id, calculate, then recalculate with different bookings
	// Verify single row with updated minutes (upsert, no duplicate)
}

func TestDailyCalcService_NoPostingsWithoutAccounts(t *testing.T) {
	// Setup: day plan without net/cap account IDs
	// Run CalculateDay
	// Verify no daily_account_values rows exist
}

func TestDailyCalcService_NoPostingsOnOffDay(t *testing.T) {
	// Setup: no day plan assigned (off day), bookings present
	// Run CalculateDay
	// Verify no daily_account_values rows exist
}
```

#### 3. DailyAccountValue Repository Tests
**File**: `apps/api/internal/repository/daily_account_value_test.go` (CREATE)

```go
func TestDailyAccountValueRepository_Upsert(t *testing.T) {
	// Insert a new record
	// Upsert same key with different value_minutes
	// Verify only one row, with updated value
}

func TestDailyAccountValueRepository_ListFiltered(t *testing.T) {
	// Insert multiple records for different employees, dates, accounts
	// Filter by employee_id, account_id, date range
	// Verify correct results
}

func TestDailyAccountValueRepository_DeleteByEmployeeDate(t *testing.T) {
	// Insert records
	// Delete by employee + date
	// Verify records removed
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -race ./...`
- [ ] Linting passes: `make lint`
- [ ] Formatting correct: `make fmt`

#### Manual Verification:
- [ ] Test coverage for new code is adequate

**Implementation Note**: After completing this phase and all automated verification passes, the implementation is complete.

---

## Testing Strategy

### Unit Tests:
- Day plan CRUD with net/cap account fields (create, update, copy)
- Daily account value upsert semantics (insert, replace)
- Account posting logic (net_time, capped_time sources)
- No postings for off-days, holidays without bookings, missing day plans
- Account usage count includes new FK columns

### Integration Tests:
- Full daily calculation flow: bookings -> calculate -> verify daily_values + daily_account_values
- Recalculation replaces postings without duplicates
- Account value listing with filters (employee, account, date range)

### Manual Testing Steps:
1. Create a day-type account via API
2. Create a day plan with `net_account_id` pointing to the account
3. Create bookings for an employee on a date assigned to that day plan
4. Trigger calculation and verify `daily_account_values` row appears
5. Trigger recalculation and verify the row is updated (not duplicated)
6. GET `/account-values?employee_id=...&from=...&to=...` returns the posting

## Performance Considerations

- The `daily_account_values` table has an index on `(employee_id, value_date)` for fast lookups during recalculation.
- Account posting uses upsert (ON CONFLICT) to avoid separate SELECT + INSERT/UPDATE roundtrips.
- Account postings happen inline during `CalculateDay`, adding at most 2 upsert queries per calculation (negligible overhead).

## Migration Notes

- Existing day plans will have `NULL` for both `net_account_id` and `cap_account_id` after migration, producing no account postings (backward compatible).
- The `daily_account_values` table starts empty -- historical data requires recalculation to populate.
- Foreign keys use `ON DELETE SET NULL` for `net_account_id`/`cap_account_id` (deleting an account does not break day plans) and `ON DELETE CASCADE` for `tenant_id`/`employee_id` (tenant/employee deletion cascades).

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-036-day-plan-net-cap-accounts.md`
- Research: `thoughts/shared/research/2026-01-30-ZMI-TICKET-036-day-plan-net-cap-accounts.md`
- Day plan model: `apps/api/internal/model/dayplan.go`
- Daily calc service: `apps/api/internal/service/daily_calc.go`
- Daily value repository (upsert pattern): `apps/api/internal/repository/dailyvalue.go:171`
- Account repository (usage count): `apps/api/internal/repository/account.go:170`
- Migration pattern: `db/migrations/000030_add_day_plan_zmi_fields.up.sql`
- OpenAPI day plan schema: `api/schemas/day-plans.yaml`
- OpenAPI account schema: `api/schemas/accounts.yaml`
