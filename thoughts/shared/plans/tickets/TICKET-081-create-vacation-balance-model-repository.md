# TICKET-081: Create Vacation Balance Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 20 - Vacation Balance
**Dependencies**: TICKET-080

## Description

Create the VacationBalance model and repository.

## Files to Create

- `apps/api/internal/model/vacationbalance.go`
- `apps/api/internal/repository/vacationbalance.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

type VacationBalance struct {
    ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"employee_id"`
    Year        int             `gorm:"not null" json:"year"`
    Entitlement decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"entitlement"`
    Carryover   decimal.Decimal `gorm:"type:decimal(5,2);default:0" json:"carryover"`
    Adjustments decimal.Decimal `gorm:"type:decimal(5,2);default:0" json:"adjustments"`
    Taken       decimal.Decimal `gorm:"type:decimal(5,2);default:0" json:"taken"`
    Notes       string          `gorm:"type:text" json:"notes,omitempty"`
    CreatedAt   time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time       `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (VacationBalance) TableName() string {
    return "vacation_balances"
}

// Available returns the available vacation days
func (vb *VacationBalance) Available() decimal.Decimal {
    return vb.Entitlement.Add(vb.Carryover).Add(vb.Adjustments).Sub(vb.Taken)
}

// Total returns total days available before deductions
func (vb *VacationBalance) Total() decimal.Decimal {
    return vb.Entitlement.Add(vb.Carryover).Add(vb.Adjustments)
}
```

### Repository

```go
type VacationBalanceRepository interface {
    Create(ctx context.Context, balance *model.VacationBalance) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.VacationBalance, error)
    GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
    Update(ctx context.Context, balance *model.VacationBalance) error
    Upsert(ctx context.Context, balance *model.VacationBalance) error
    UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error
    IncrementTaken(ctx context.Context, employeeID uuid.UUID, year int, amount decimal.Decimal) error
    ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.VacationBalance, error)
}

func (r *vacationBalanceRepository) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
    var balance model.VacationBalance
    err := r.db.WithContext(ctx).
        Where("employee_id = ? AND year = ?", employeeID, year).
        First(&balance).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &balance, err
}

func (r *vacationBalanceRepository) Upsert(ctx context.Context, balance *model.VacationBalance) error {
    return r.db.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns:   []clause.Column{{Name: "employee_id"}, {Name: "year"}},
            DoUpdates: clause.AssignmentColumns([]string{"entitlement", "carryover", "adjustments", "taken", "notes", "updated_at"}),
        }).
        Create(balance).Error
}

func (r *vacationBalanceRepository) IncrementTaken(ctx context.Context, employeeID uuid.UUID, year int, amount decimal.Decimal) error {
    return r.db.WithContext(ctx).
        Model(&model.VacationBalance{}).
        Where("employee_id = ? AND year = ?", employeeID, year).
        Update("taken", gorm.Expr("taken + ?", amount)).Error
}
```

## Repository Implementation

```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"terp/apps/api/internal/model"
)

type vacationBalanceRepository struct {
	db *gorm.DB
}

func NewVacationBalanceRepository(db *gorm.DB) VacationBalanceRepository {
	return &vacationBalanceRepository{db: db}
}

func (r *vacationBalanceRepository) Create(ctx context.Context, balance *model.VacationBalance) error {
	return r.db.WithContext(ctx).Create(balance).Error
}

func (r *vacationBalanceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationBalance, error) {
	var balance model.VacationBalance
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&balance).Error
	return &balance, err
}

func (r *vacationBalanceRepository) Update(ctx context.Context, balance *model.VacationBalance) error {
	return r.db.WithContext(ctx).Save(balance).Error
}

func (r *vacationBalanceRepository) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error {
	return r.db.WithContext(ctx).
		Model(&model.VacationBalance{}).
		Where("employee_id = ? AND year = ?", employeeID, year).
		Update("taken", taken).Error
}

func (r *vacationBalanceRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.VacationBalance, error) {
	var balances []model.VacationBalance
	err := r.db.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Order("year DESC").
		Find(&balances).Error
	return balances, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/vacationbalance_test.go`

```go
package repository

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"terp/apps/api/internal/model"
	"terp/apps/api/internal/testutil"
)

func TestVacationBalanceRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	balance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2024,
		Entitlement: decimal.NewFromFloat(25.0),
		Carryover:   decimal.NewFromFloat(5.0),
		Adjustments: decimal.NewFromFloat(2.0),
		Taken:       decimal.NewFromFloat(10.0),
	}

	err := repo.Create(ctx, balance)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, balance.ID)
}

func TestVacationBalanceRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	balance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2024,
		Entitlement: decimal.NewFromFloat(25.0),
	}
	repo.Create(ctx, balance)

	found, err := repo.GetByID(ctx, balance.ID)
	require.NoError(t, err)
	assert.Equal(t, balance.ID, found.ID)
	assert.True(t, balance.Entitlement.Equal(found.Entitlement))
}

func TestVacationBalanceRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestVacationBalanceRepository_GetByEmployeeYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	balance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2024,
		Entitlement: decimal.NewFromFloat(25.0),
	}
	repo.Create(ctx, balance)

	found, err := repo.GetByEmployeeYear(ctx, employeeID, 2024)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, balance.ID, found.ID)

	// Test not found returns nil
	notFound, err := repo.GetByEmployeeYear(ctx, employeeID, 2025)
	require.NoError(t, err)
	assert.Nil(t, notFound)
}

func TestVacationBalanceRepository_Upsert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// First upsert (insert)
	balance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2024,
		Entitlement: decimal.NewFromFloat(25.0),
		Taken:       decimal.NewFromFloat(5.0),
	}
	err := repo.Upsert(ctx, balance)
	require.NoError(t, err)

	// Second upsert (update)
	balance.Entitlement = decimal.NewFromFloat(30.0)
	balance.Taken = decimal.NewFromFloat(10.0)
	err = repo.Upsert(ctx, balance)
	require.NoError(t, err)

	// Verify only one record exists with updated values
	found, _ := repo.GetByEmployeeYear(ctx, employeeID, 2024)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromFloat(30.0)))
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(10.0)))
}

func TestVacationBalanceRepository_UpdateTaken(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	balance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2024,
		Entitlement: decimal.NewFromFloat(25.0),
		Taken:       decimal.NewFromFloat(5.0),
	}
	repo.Create(ctx, balance)

	err := repo.UpdateTaken(ctx, employeeID, 2024, decimal.NewFromFloat(12.0))
	require.NoError(t, err)

	found, _ := repo.GetByEmployeeYear(ctx, employeeID, 2024)
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(12.0)))
}

func TestVacationBalanceRepository_IncrementTaken(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	balance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2024,
		Entitlement: decimal.NewFromFloat(25.0),
		Taken:       decimal.NewFromFloat(5.0),
	}
	repo.Create(ctx, balance)

	// Increment by 3 days
	err := repo.IncrementTaken(ctx, employeeID, 2024, decimal.NewFromFloat(3.0))
	require.NoError(t, err)

	found, _ := repo.GetByEmployeeYear(ctx, employeeID, 2024)
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(8.0)))
}

func TestVacationBalanceRepository_ListByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create balances for multiple years
	repo.Create(ctx, &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2023,
		Entitlement: decimal.NewFromFloat(25.0),
	})
	repo.Create(ctx, &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2024,
		Entitlement: decimal.NewFromFloat(25.0),
	})
	repo.Create(ctx, &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromFloat(30.0),
	})

	balances, err := repo.ListByEmployee(ctx, employeeID)
	require.NoError(t, err)
	assert.Len(t, balances, 3)
	// Verify ordered by year DESC
	assert.Equal(t, 2025, balances[0].Year)
	assert.Equal(t, 2024, balances[1].Year)
	assert.Equal(t, 2023, balances[2].Year)
}

func TestVacationBalanceRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	balance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2024,
		Entitlement: decimal.NewFromFloat(25.0),
		Notes:       "Original notes",
	}
	repo.Create(ctx, balance)

	balance.Notes = "Updated notes"
	balance.Adjustments = decimal.NewFromFloat(2.5)
	err := repo.Update(ctx, balance)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, balance.ID)
	assert.Equal(t, "Updated notes", found.Notes)
	assert.True(t, found.Adjustments.Equal(decimal.NewFromFloat(2.5)))
}

func TestVacationBalance_Available(t *testing.T) {
	balance := &model.VacationBalance{
		Entitlement: decimal.NewFromFloat(25.0),
		Carryover:   decimal.NewFromFloat(5.0),
		Adjustments: decimal.NewFromFloat(2.0),
		Taken:       decimal.NewFromFloat(10.0),
	}

	// Available = 25 + 5 + 2 - 10 = 22
	available := balance.Available()
	assert.True(t, available.Equal(decimal.NewFromFloat(22.0)))
}

func TestVacationBalance_Total(t *testing.T) {
	balance := &model.VacationBalance{
		Entitlement: decimal.NewFromFloat(25.0),
		Carryover:   decimal.NewFromFloat(5.0),
		Adjustments: decimal.NewFromFloat(2.0),
		Taken:       decimal.NewFromFloat(10.0),
	}

	// Total = 25 + 5 + 2 = 32
	total := balance.Total()
	assert.True(t, total.Equal(decimal.NewFromFloat(32.0)))
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] Available() calculates correctly
- [ ] Upsert handles year uniqueness
- [ ] IncrementTaken atomic update
- [ ] GetByEmployeeYear returns nil if not found
