# Implementation Plan: NOK-138 - Vacation Balance Model + Repository

## Date: 2026-01-24

## Overview

Create the VacationBalance model and repository for tracking employee vacation entitlements, carryover, adjustments, and usage per year. This includes a database migration, the Go model with helper methods, the repository with CRUD + upsert + atomic increment, and comprehensive tests.

---

## Phase 1: Create Migration

### File: `db/migrations/000027_create_vacation_balances.up.sql`

```sql
-- Vacation balances track annual vacation entitlement, carryover, adjustments, and usage per employee per year
CREATE TABLE vacation_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- The year this balance applies to
    year INT NOT NULL,

    -- Vacation day values (decimal for half-day support)
    entitlement DECIMAL(5,2) NOT NULL DEFAULT 0,
    carryover DECIMAL(5,2) NOT NULL DEFAULT 0,
    adjustments DECIMAL(5,2) NOT NULL DEFAULT 0,
    taken DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_vacation_balances_updated_at
    BEFORE UPDATE ON vacation_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_vacation_balances_tenant ON vacation_balances(tenant_id);
CREATE INDEX idx_vacation_balances_employee ON vacation_balances(employee_id);

-- One balance per employee per year (natural key for upsert)
CREATE UNIQUE INDEX idx_vacation_balances_employee_year ON vacation_balances(employee_id, year);

COMMENT ON TABLE vacation_balances IS 'Annual vacation balance tracking per employee per year';
COMMENT ON COLUMN vacation_balances.entitlement IS 'Annual vacation entitlement in days';
COMMENT ON COLUMN vacation_balances.carryover IS 'Remaining vacation carried over from previous year';
COMMENT ON COLUMN vacation_balances.adjustments IS 'Manual adjustments (positive or negative)';
COMMENT ON COLUMN vacation_balances.taken IS 'Vacation days used so far this year';
```

### File: `db/migrations/000027_create_vacation_balances.down.sql`

```sql
DROP TRIGGER IF EXISTS update_vacation_balances_updated_at ON vacation_balances;
DROP TABLE IF EXISTS vacation_balances;
```

### Verification

Run `make migrate-up` and verify no errors. The unique index on `(employee_id, year)` is critical for the Upsert operation.

---

## Phase 2: Create Model

### File: `apps/api/internal/model/vacationbalance.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// VacationBalance tracks an employee's vacation entitlement and usage for a specific year.
type VacationBalance struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	Year       int       `gorm:"type:int;not null" json:"year"`

	// Vacation day values (decimal for half-day support)
	Entitlement decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"entitlement"`
	Carryover   decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"carryover"`
	Adjustments decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"adjustments"`
	Taken       decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"taken"`

	// Timestamps
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// TableName returns the database table name.
func (VacationBalance) TableName() string {
	return "vacation_balances"
}

// Total returns the total available vacation entitlement (Entitlement + Carryover + Adjustments).
func (vb *VacationBalance) Total() decimal.Decimal {
	return vb.Entitlement.Add(vb.Carryover).Add(vb.Adjustments)
}

// Available returns the remaining vacation days (Total - Taken).
func (vb *VacationBalance) Available() decimal.Decimal {
	return vb.Total().Sub(vb.Taken)
}
```

### Key Design Decisions

1. **Decimal(5,2)**: Supports values up to 999.99 days, matching the Employee.VacationDaysPerYear pattern
2. **No soft delete**: VacationBalance records are permanent (unlike Employee which has DeletedAt)
3. **Employee relation**: Pointer with foreignKey for optional preloading
4. **Total() and Available()**: Pure computation methods, no side effects
5. **Inline fields**: No BaseModel embedding, following the newer model convention (AbsenceDay, DailyValue)

### Verification

Run `cd apps/api && go build ./...` to confirm the model compiles.

---

## Phase 3: Create Repository

### File: `apps/api/internal/repository/vacationbalance.go`

```go
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrVacationBalanceNotFound = errors.New("vacation balance not found")
)

// VacationBalanceRepository handles vacation balance data access.
type VacationBalanceRepository struct {
	db *DB
}

// NewVacationBalanceRepository creates a new vacation balance repository.
func NewVacationBalanceRepository(db *DB) *VacationBalanceRepository {
	return &VacationBalanceRepository{db: db}
}

// Create creates a new vacation balance.
func (r *VacationBalanceRepository) Create(ctx context.Context, balance *model.VacationBalance) error {
	return r.db.GORM.WithContext(ctx).Create(balance).Error
}

// GetByID retrieves a vacation balance by ID.
func (r *VacationBalanceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationBalance, error) {
	var balance model.VacationBalance
	err := r.db.GORM.WithContext(ctx).
		First(&balance, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationBalanceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation balance: %w", err)
	}
	return &balance, nil
}

// GetByEmployeeYear retrieves the vacation balance for an employee for a specific year.
// Returns nil, nil if no record exists (consistent with GetByEmployeeDate patterns).
func (r *VacationBalanceRepository) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	var balance model.VacationBalance
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND year = ?", employeeID, year).
		First(&balance).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation balance by employee year: %w", err)
	}
	return &balance, nil
}

// Update updates an existing vacation balance.
func (r *VacationBalanceRepository) Update(ctx context.Context, balance *model.VacationBalance) error {
	return r.db.GORM.WithContext(ctx).Save(balance).Error
}

// Upsert creates or updates a vacation balance based on employee_id + year unique constraint.
func (r *VacationBalanceRepository) Upsert(ctx context.Context, balance *model.VacationBalance) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "year"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"entitlement", "carryover", "adjustments", "taken", "updated_at",
			}),
		}).
		Create(balance).Error
}

// UpdateTaken sets the taken value directly for an employee's year balance.
func (r *VacationBalanceRepository) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.VacationBalance{}).
		Where("employee_id = ? AND year = ?", employeeID, year).
		Update("taken", taken)

	if result.Error != nil {
		return fmt.Errorf("failed to update taken: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVacationBalanceNotFound
	}
	return nil
}

// IncrementTaken atomically increments the taken value for an employee's year balance.
func (r *VacationBalanceRepository) IncrementTaken(ctx context.Context, employeeID uuid.UUID, year int, amount decimal.Decimal) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.VacationBalance{}).
		Where("employee_id = ? AND year = ?", employeeID, year).
		Update("taken", gorm.Expr("taken + ?", amount))

	if result.Error != nil {
		return fmt.Errorf("failed to increment taken: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVacationBalanceNotFound
	}
	return nil
}

// ListByEmployee retrieves all vacation balances for an employee, ordered by year ascending.
func (r *VacationBalanceRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.VacationBalance, error) {
	var balances []model.VacationBalance
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Order("year ASC").
		Find(&balances).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation balances: %w", err)
	}
	return balances, nil
}
```

### Key Design Decisions

1. **GetByID returns sentinel error**: Matches DailyValueRepository pattern - callers expect ErrVacationBalanceNotFound
2. **GetByEmployeeYear returns nil, nil**: Matches DailyValueRepository.GetByEmployeeDate pattern - "no record" is not an error
3. **Upsert uses clause.OnConflict**: Based on the `idx_vacation_balances_employee_year` unique index
4. **UpdateTaken checks RowsAffected**: Returns ErrVacationBalanceNotFound if no row matched
5. **IncrementTaken uses gorm.Expr**: Atomic SQL `taken + ?` expression, avoids race conditions
6. **ListByEmployee orders by year ASC**: Natural chronological order

### Verification

Run `cd apps/api && go build ./...` to confirm the repository compiles.

---

## Phase 4: Create Tests

### File: `apps/api/internal/repository/vacationbalance_test.go`

```go
package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// --- Test Helpers ---

func createTestTenantForVB(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestEmployeeForVB(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	repo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "E" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:4],
		FirstName:       "Test",
		LastName:        "Employee",
		EntryDate:       time.Now(),
		WeeklyHours:     decimal.NewFromFloat(40.0),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(context.Background(), emp))
	return emp
}

// --- Repository Tests ---

func TestVacationBalanceRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromFloat(5.5),
		Adjustments: decimal.NewFromInt(2),
		Taken:       decimal.NewFromInt(10),
	}

	err := repo.Create(ctx, vb)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, vb.ID)
}

func TestVacationBalanceRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromFloat(3.5),
		Adjustments: decimal.NewFromInt(0),
		Taken:       decimal.NewFromFloat(7.5),
	}
	require.NoError(t, repo.Create(ctx, vb))

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.Equal(t, vb.ID, found.ID)
	assert.Equal(t, 2026, found.Year)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(30)))
	assert.True(t, found.Carryover.Equal(decimal.NewFromFloat(3.5)))
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(7.5)))
}

func TestVacationBalanceRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrVacationBalanceNotFound)
}

func TestVacationBalanceRepository_GetByEmployeeYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(28),
	}
	require.NoError(t, repo.Create(ctx, vb))

	found, err := repo.GetByEmployeeYear(ctx, emp.ID, 2026)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, vb.ID, found.ID)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(28)))
}

func TestVacationBalanceRepository_GetByEmployeeYear_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	// No balance exists for 2025
	found, err := repo.GetByEmployeeYear(ctx, emp.ID, 2025)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestVacationBalanceRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(0),
		Adjustments: decimal.NewFromInt(0),
		Taken:       decimal.NewFromInt(0),
	}
	require.NoError(t, repo.Create(ctx, vb))

	// Update entitlement and carryover
	vb.Entitlement = decimal.NewFromInt(25)
	vb.Carryover = decimal.NewFromFloat(4.5)
	vb.Adjustments = decimal.NewFromInt(-2)
	err := repo.Update(ctx, vb)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(25)))
	assert.True(t, found.Carryover.Equal(decimal.NewFromFloat(4.5)))
	assert.True(t, found.Adjustments.Equal(decimal.NewFromInt(-2)))
}

func TestVacationBalanceRepository_Upsert_Insert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromFloat(5.0),
		Adjustments: decimal.NewFromInt(0),
		Taken:       decimal.NewFromInt(0),
	}

	err := repo.Upsert(ctx, vb)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, vb.ID)

	// Verify inserted correctly
	found, err := repo.GetByEmployeeYear(ctx, emp.ID, 2026)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(30)))
	assert.True(t, found.Carryover.Equal(decimal.NewFromFloat(5.0)))
}

func TestVacationBalanceRepository_Upsert_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	// Create initial balance
	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(0),
		Adjustments: decimal.NewFromInt(0),
		Taken:       decimal.NewFromInt(5),
	}
	require.NoError(t, repo.Create(ctx, vb))
	originalID := vb.ID

	// Upsert with updated values (same employee+year)
	updated := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(28),
		Carryover:   decimal.NewFromFloat(3.5),
		Adjustments: decimal.NewFromInt(1),
		Taken:       decimal.NewFromFloat(10.5),
	}
	err := repo.Upsert(ctx, updated)
	require.NoError(t, err)

	// Verify updated (not a new record)
	found, err := repo.GetByID(ctx, originalID)
	require.NoError(t, err)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(28)))
	assert.True(t, found.Carryover.Equal(decimal.NewFromFloat(3.5)))
	assert.True(t, found.Adjustments.Equal(decimal.NewFromInt(1)))
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(10.5)))
}

func TestVacationBalanceRepository_UpdateTaken(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(5),
	}
	require.NoError(t, repo.Create(ctx, vb))

	// Set taken to 12.5
	err := repo.UpdateTaken(ctx, emp.ID, 2026, decimal.NewFromFloat(12.5))
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(12.5)))
}

func TestVacationBalanceRepository_UpdateTaken_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	err := repo.UpdateTaken(ctx, uuid.New(), 2026, decimal.NewFromInt(5))
	assert.ErrorIs(t, err, repository.ErrVacationBalanceNotFound)
}

func TestVacationBalanceRepository_IncrementTaken(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(5),
	}
	require.NoError(t, repo.Create(ctx, vb))

	// Increment by 1.5 (e.g. 1 full day + 1 half day)
	err := repo.IncrementTaken(ctx, emp.ID, 2026, decimal.NewFromFloat(1.5))
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(6.5)))
}

func TestVacationBalanceRepository_IncrementTaken_Multiple(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(0),
	}
	require.NoError(t, repo.Create(ctx, vb))

	// Increment multiple times
	require.NoError(t, repo.IncrementTaken(ctx, emp.ID, 2026, decimal.NewFromInt(1)))
	require.NoError(t, repo.IncrementTaken(ctx, emp.ID, 2026, decimal.NewFromFloat(0.5)))
	require.NoError(t, repo.IncrementTaken(ctx, emp.ID, 2026, decimal.NewFromInt(2)))

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(3.5)))
}

func TestVacationBalanceRepository_IncrementTaken_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	err := repo.IncrementTaken(ctx, uuid.New(), 2026, decimal.NewFromInt(1))
	assert.ErrorIs(t, err, repository.ErrVacationBalanceNotFound)
}

func TestVacationBalanceRepository_ListByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	// Create balances for 3 years (out of order to test ordering)
	years := []int{2027, 2025, 2026}
	for _, year := range years {
		vb := &model.VacationBalance{
			TenantID:    tenant.ID,
			EmployeeID:  emp.ID,
			Year:        year,
			Entitlement: decimal.NewFromInt(30),
		}
		require.NoError(t, repo.Create(ctx, vb))
	}

	balances, err := repo.ListByEmployee(ctx, emp.ID)
	require.NoError(t, err)
	require.Len(t, balances, 3)

	// Verify ordering by year ASC
	assert.Equal(t, 2025, balances[0].Year)
	assert.Equal(t, 2026, balances[1].Year)
	assert.Equal(t, 2027, balances[2].Year)
}

func TestVacationBalanceRepository_ListByEmployee_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	balances, err := repo.ListByEmployee(ctx, emp.ID)
	require.NoError(t, err)
	assert.Empty(t, balances)
}

func TestVacationBalanceRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	// Create first balance for 2026
	vb1 := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
	}
	require.NoError(t, repo.Create(ctx, vb1))

	// Second balance for same employee+year should fail
	vb2 := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(25),
	}
	err := repo.Create(ctx, vb2)
	assert.Error(t, err)
}

// --- Model Unit Tests (no DB) ---

func TestVacationBalance_Total(t *testing.T) {
	tests := []struct {
		name        string
		entitlement decimal.Decimal
		carryover   decimal.Decimal
		adjustments decimal.Decimal
		expected    decimal.Decimal
	}{
		{
			"all zeros",
			decimal.Zero, decimal.Zero, decimal.Zero,
			decimal.Zero,
		},
		{
			"entitlement only",
			decimal.NewFromInt(30), decimal.Zero, decimal.Zero,
			decimal.NewFromInt(30),
		},
		{
			"all positive",
			decimal.NewFromInt(30), decimal.NewFromFloat(5.5), decimal.NewFromInt(2),
			decimal.NewFromFloat(37.5),
		},
		{
			"negative adjustment",
			decimal.NewFromInt(30), decimal.NewFromFloat(3.0), decimal.NewFromInt(-5),
			decimal.NewFromInt(28),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vb := &model.VacationBalance{
				Entitlement: tt.entitlement,
				Carryover:   tt.carryover,
				Adjustments: tt.adjustments,
			}
			assert.True(t, vb.Total().Equal(tt.expected),
				"expected %s, got %s", tt.expected.String(), vb.Total().String())
		})
	}
}

func TestVacationBalance_Available(t *testing.T) {
	tests := []struct {
		name        string
		entitlement decimal.Decimal
		carryover   decimal.Decimal
		adjustments decimal.Decimal
		taken       decimal.Decimal
		expected    decimal.Decimal
	}{
		{
			"nothing taken",
			decimal.NewFromInt(30), decimal.NewFromFloat(5.0), decimal.NewFromInt(0),
			decimal.Zero,
			decimal.NewFromInt(35),
		},
		{
			"some taken",
			decimal.NewFromInt(30), decimal.NewFromFloat(5.0), decimal.NewFromInt(0),
			decimal.NewFromFloat(10.5),
			decimal.NewFromFloat(24.5),
		},
		{
			"all taken",
			decimal.NewFromInt(30), decimal.NewFromInt(0), decimal.NewFromInt(0),
			decimal.NewFromInt(30),
			decimal.Zero,
		},
		{
			"overdrawn (negative available)",
			decimal.NewFromInt(30), decimal.NewFromInt(0), decimal.NewFromInt(0),
			decimal.NewFromInt(32),
			decimal.NewFromInt(-2),
		},
		{
			"with negative adjustment",
			decimal.NewFromInt(30), decimal.NewFromFloat(5.0), decimal.NewFromInt(-3),
			decimal.NewFromFloat(10.0),
			decimal.NewFromInt(22),
		},
		{
			"half days",
			decimal.NewFromInt(30), decimal.NewFromInt(0), decimal.NewFromInt(0),
			decimal.NewFromFloat(0.5),
			decimal.NewFromFloat(29.5),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vb := &model.VacationBalance{
				Entitlement: tt.entitlement,
				Carryover:   tt.carryover,
				Adjustments: tt.adjustments,
				Taken:       tt.taken,
			}
			assert.True(t, vb.Available().Equal(tt.expected),
				"expected %s, got %s", tt.expected.String(), vb.Available().String())
		})
	}
}
```

### Verification

Run `cd apps/api && go test -v ./internal/repository/ -run TestVacationBalance` to verify all tests pass.

---

## Phase 5: Final Verification

1. **Build check**: `cd apps/api && go build ./...`
2. **Run tests**: `cd apps/api && go test -race ./internal/repository/ -run TestVacationBalance`
3. **Full test suite**: `make test`
4. **Lint**: `make lint`

---

## Files Created Summary

| File | Purpose |
|------|---------|
| `db/migrations/000027_create_vacation_balances.up.sql` | Migration to create vacation_balances table |
| `db/migrations/000027_create_vacation_balances.down.sql` | Rollback migration |
| `apps/api/internal/model/vacationbalance.go` | VacationBalance model with Total() and Available() methods |
| `apps/api/internal/repository/vacationbalance.go` | Repository with CRUD, Upsert, UpdateTaken, IncrementTaken, ListByEmployee |
| `apps/api/internal/repository/vacationbalance_test.go` | Comprehensive tests covering all methods + model unit tests |

---

## Acceptance Criteria Mapping

| Criteria | Covered By |
|----------|------------|
| Available() calculates correctly | `TestVacationBalance_Available` (6 sub-tests including edge cases) |
| Upsert handles year uniqueness | `TestVacationBalanceRepository_Upsert_Insert` + `_Upsert_Update` |
| IncrementTaken atomic update | `TestVacationBalanceRepository_IncrementTaken` + `_Multiple` |
| GetByEmployeeYear returns nil if not found | `TestVacationBalanceRepository_GetByEmployeeYear_NotFound` |
| Unit tests pass | All tests in Phase 4 |
| `make test` passes | Phase 5 final verification |
