# TICKET-097: Create Account Value Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 24 - Account Values
**Dependencies**: TICKET-096

## Description

Create the AccountValue model and repository.

## Files to Create

- `apps/api/internal/model/accountvalue.go`
- `apps/api/internal/repository/accountvalue.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type AccountType string

const (
    AccountTypeFlextime     AccountType = "flextime"
    AccountTypeOvertime     AccountType = "overtime"
    AccountTypeVacation     AccountType = "vacation"
    AccountTypeSick         AccountType = "sick"
    AccountTypeSpecialLeave AccountType = "special_leave"
)

type AccountValue struct {
    ID          uuid.UUID   `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID   `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID  uuid.UUID   `gorm:"type:uuid;not null;index" json:"employee_id"`
    AccountType AccountType `gorm:"type:varchar(30);not null" json:"account_type"`
    Year        int         `gorm:"not null" json:"year"`

    OpeningBalance    int  `gorm:"default:0" json:"opening_balance"`
    CurrentBalance    int  `gorm:"default:0" json:"current_balance"`
    ClosingBalance    *int `json:"closing_balance,omitempty"`
    YearlyEntitlement int  `gorm:"default:0" json:"yearly_entitlement"`

    IsClosed bool       `gorm:"default:false" json:"is_closed"`
    ClosedAt *time.Time `json:"closed_at,omitempty"`
    ClosedBy *uuid.UUID `gorm:"type:uuid" json:"closed_by,omitempty"`

    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (AccountValue) TableName() string {
    return "account_values"
}

// Available returns remaining balance (for vacation: entitlement + opening - used)
func (av *AccountValue) Available() int {
    if av.AccountType == AccountTypeVacation {
        return av.YearlyEntitlement + av.OpeningBalance - av.CurrentBalance
    }
    return av.CurrentBalance
}

// UsedThisYear returns usage for the current year
func (av *AccountValue) UsedThisYear() int {
    if av.AccountType == AccountTypeVacation {
        return av.CurrentBalance
    }
    return 0
}
```

### Repository

```go
package repository

import (
    "context"
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type AccountValueRepository interface {
    Create(ctx context.Context, value *model.AccountValue) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.AccountValue, error)
    GetByEmployeeTypeYear(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int) (*model.AccountValue, error)
    Update(ctx context.Context, value *model.AccountValue) error
    Upsert(ctx context.Context, value *model.AccountValue) error
    ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.AccountValue, error)
    ListByTenantYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.AccountValue, error)
    CloseYear(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int, closedBy uuid.UUID) error
    CarryOverToNextYear(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int, carryoverAmount int) error
}

type accountValueRepository struct {
    db *gorm.DB
}

func NewAccountValueRepository(db *gorm.DB) AccountValueRepository {
    return &accountValueRepository{db: db}
}

func (r *accountValueRepository) Create(ctx context.Context, value *model.AccountValue) error {
    return r.db.WithContext(ctx).Create(value).Error
}

func (r *accountValueRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AccountValue, error) {
    var value model.AccountValue
    err := r.db.WithContext(ctx).First(&value, "id = ?", id).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &value, err
}

func (r *accountValueRepository) GetByEmployeeTypeYear(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int) (*model.AccountValue, error) {
    var value model.AccountValue
    err := r.db.WithContext(ctx).
        Where("employee_id = ? AND account_type = ? AND year = ?", employeeID, accountType, year).
        First(&value).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &value, err
}

func (r *accountValueRepository) Update(ctx context.Context, value *model.AccountValue) error {
    return r.db.WithContext(ctx).Save(value).Error
}

func (r *accountValueRepository) Upsert(ctx context.Context, value *model.AccountValue) error {
    return r.db.WithContext(ctx).
        Where("employee_id = ? AND account_type = ? AND year = ?", value.EmployeeID, value.AccountType, value.Year).
        Assign(value).
        FirstOrCreate(value).Error
}

func (r *accountValueRepository) ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.AccountValue, error) {
    var values []model.AccountValue
    err := r.db.WithContext(ctx).
        Where("employee_id = ? AND year = ?", employeeID, year).
        Find(&values).Error
    return values, err
}

func (r *accountValueRepository) ListByTenantYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.AccountValue, error) {
    var values []model.AccountValue
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND year = ?", tenantID, year).
        Preload("Employee").
        Find(&values).Error
    return values, err
}

func (r *accountValueRepository) CloseYear(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int, closedBy uuid.UUID) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.AccountValue{}).
        Where("employee_id = ? AND account_type = ? AND year = ?", employeeID, accountType, year).
        Updates(map[string]interface{}{
            "is_closed":       true,
            "closed_at":       now,
            "closed_by":       closedBy,
            "closing_balance": gorm.Expr("current_balance"),
        }).Error
}

func (r *accountValueRepository) CarryOverToNextYear(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int, carryoverAmount int) error {
    nextYear := year + 1
    value := &model.AccountValue{
        EmployeeID:     employeeID,
        AccountType:    accountType,
        Year:           nextYear,
        OpeningBalance: carryoverAmount,
        CurrentBalance: 0,
    }
    return r.Upsert(ctx, value)
}
```

## Unit Tests

**File**: `apps/api/internal/repository/accountvalue_test.go`

```go
package repository

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"terp/apps/api/internal/model"
	"terp/apps/api/internal/testutil"
)

func TestAccountValueRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	value := &model.AccountValue{
		TenantID:          tenantID,
		EmployeeID:        employeeID,
		AccountType:       model.AccountTypeFlextime,
		Year:              2024,
		OpeningBalance:    120,
		CurrentBalance:    150,
		YearlyEntitlement: 0,
	}

	err := repo.Create(ctx, value)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, value.ID)
}

func TestAccountValueRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	value := &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeOvertime,
		Year:           2024,
		CurrentBalance: 200,
	}
	repo.Create(ctx, value)

	found, err := repo.GetByID(ctx, value.ID)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, value.ID, found.ID)
	assert.Equal(t, model.AccountTypeOvertime, found.AccountType)
	assert.Equal(t, 200, found.CurrentBalance)
}

func TestAccountValueRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	found, err := repo.GetByID(ctx, uuid.New())
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestAccountValueRepository_GetByEmployeeTypeYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	value := &model.AccountValue{
		TenantID:          tenantID,
		EmployeeID:        employeeID,
		AccountType:       model.AccountTypeVacation,
		Year:              2024,
		OpeningBalance:    5,
		CurrentBalance:    10,
		YearlyEntitlement: 25,
	}
	repo.Create(ctx, value)

	found, err := repo.GetByEmployeeTypeYear(ctx, employeeID, model.AccountTypeVacation, 2024)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, value.ID, found.ID)
	assert.Equal(t, model.AccountTypeVacation, found.AccountType)
	assert.Equal(t, 2024, found.Year)

	// Test not found returns nil
	notFound, err := repo.GetByEmployeeTypeYear(ctx, employeeID, model.AccountTypeVacation, 2025)
	require.NoError(t, err)
	assert.Nil(t, notFound)
}

func TestAccountValueRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	value := &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeFlextime,
		Year:           2024,
		CurrentBalance: 120,
	}
	repo.Create(ctx, value)

	value.CurrentBalance = 180
	err := repo.Update(ctx, value)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, value.ID)
	assert.Equal(t, 180, found.CurrentBalance)
}

func TestAccountValueRepository_Upsert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// First upsert (insert)
	value := &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeOvertime,
		Year:           2024,
		CurrentBalance: 100,
	}
	err := repo.Upsert(ctx, value)
	require.NoError(t, err)

	// Second upsert (update)
	value.CurrentBalance = 150
	err = repo.Upsert(ctx, value)
	require.NoError(t, err)

	// Verify only one record exists with updated values
	found, _ := repo.GetByEmployeeTypeYear(ctx, employeeID, model.AccountTypeOvertime, 2024)
	assert.Equal(t, 150, found.CurrentBalance)
}

func TestAccountValueRepository_ListByEmployeeYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create multiple account values for same employee/year
	repo.Create(ctx, &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeFlextime,
		Year:           2024,
		CurrentBalance: 120,
	})
	repo.Create(ctx, &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeVacation,
		Year:           2024,
		CurrentBalance: 10,
	})
	repo.Create(ctx, &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeOvertime,
		Year:           2024,
		CurrentBalance: 200,
	})
	// Different year, should not be included
	repo.Create(ctx, &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeFlextime,
		Year:           2025,
		CurrentBalance: 150,
	})

	values, err := repo.ListByEmployeeYear(ctx, employeeID, 2024)
	require.NoError(t, err)
	assert.Len(t, values, 3)

	accountTypes := make(map[model.AccountType]bool)
	for _, v := range values {
		accountTypes[v.AccountType] = true
	}
	assert.True(t, accountTypes[model.AccountTypeFlextime])
	assert.True(t, accountTypes[model.AccountTypeVacation])
	assert.True(t, accountTypes[model.AccountTypeOvertime])
}

func TestAccountValueRepository_ListByTenantYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employee1 := uuid.New()
	employee2 := uuid.New()

	// Create values for different employees in same tenant/year
	repo.Create(ctx, &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employee1,
		AccountType:    model.AccountTypeFlextime,
		Year:           2024,
		CurrentBalance: 120,
	})
	repo.Create(ctx, &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employee2,
		AccountType:    model.AccountTypeFlextime,
		Year:           2024,
		CurrentBalance: 150,
	})

	values, err := repo.ListByTenantYear(ctx, tenantID, 2024)
	require.NoError(t, err)
	assert.Len(t, values, 2)
}

func TestAccountValueRepository_CloseYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	closedBy := uuid.New()

	value := &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeFlextime,
		Year:           2024,
		OpeningBalance: 100,
		CurrentBalance: 150,
	}
	repo.Create(ctx, value)

	// Close the year
	err := repo.CloseYear(ctx, employeeID, model.AccountTypeFlextime, 2024, closedBy)
	require.NoError(t, err)

	// Verify year is closed
	found, _ := repo.GetByEmployeeTypeYear(ctx, employeeID, model.AccountTypeFlextime, 2024)
	assert.True(t, found.IsClosed)
	assert.NotNil(t, found.ClosedAt)
	assert.NotNil(t, found.ClosedBy)
	assert.Equal(t, closedBy, *found.ClosedBy)
	assert.NotNil(t, found.ClosingBalance)
	assert.Equal(t, 150, *found.ClosingBalance)
}

func TestAccountValueRepository_CarryOverToNextYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create 2024 record
	value2024 := &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeFlextime,
		Year:           2024,
		OpeningBalance: 100,
		CurrentBalance: 150,
	}
	repo.Create(ctx, value2024)

	// Carry over to 2025
	err := repo.CarryOverToNextYear(ctx, employeeID, model.AccountTypeFlextime, 2024, 150)
	require.NoError(t, err)

	// Verify 2025 record exists with correct opening balance
	found2025, _ := repo.GetByEmployeeTypeYear(ctx, employeeID, model.AccountTypeFlextime, 2025)
	assert.NotNil(t, found2025)
	assert.Equal(t, 2025, found2025.Year)
	assert.Equal(t, 150, found2025.OpeningBalance)
	assert.Equal(t, 0, found2025.CurrentBalance)
}

func TestAccountValueRepository_CarryOverToNextYear_Upsert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAccountValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create existing 2025 record
	value2025 := &model.AccountValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		AccountType:    model.AccountTypeFlextime,
		Year:           2025,
		OpeningBalance: 50,
		CurrentBalance: 100,
	}
	repo.Create(ctx, value2025)

	// Carry over to 2025 (should update existing record)
	err := repo.CarryOverToNextYear(ctx, employeeID, model.AccountTypeFlextime, 2024, 150)
	require.NoError(t, err)

	// Verify 2025 record updated with new opening balance
	found2025, _ := repo.GetByEmployeeTypeYear(ctx, employeeID, model.AccountTypeFlextime, 2025)
	assert.NotNil(t, found2025)
	assert.Equal(t, 150, found2025.OpeningBalance)
}

func TestAccountValue_Available_Vacation(t *testing.T) {
	value := &model.AccountValue{
		AccountType:       model.AccountTypeVacation,
		YearlyEntitlement: 25,
		OpeningBalance:    5,
		CurrentBalance:    10, // 10 days used
	}

	// Available = 25 (entitlement) + 5 (carryover) - 10 (used) = 20
	available := value.Available()
	assert.Equal(t, 20, available)
}

func TestAccountValue_Available_Flextime(t *testing.T) {
	value := &model.AccountValue{
		AccountType:    model.AccountTypeFlextime,
		CurrentBalance: 150,
	}

	// Available = current balance for non-vacation accounts
	available := value.Available()
	assert.Equal(t, 150, available)
}

func TestAccountValue_Available_Overtime(t *testing.T) {
	value := &model.AccountValue{
		AccountType:    model.AccountTypeOvertime,
		CurrentBalance: 200,
	}

	// Available = current balance for non-vacation accounts
	available := value.Available()
	assert.Equal(t, 200, available)
}

func TestAccountValue_UsedThisYear_Vacation(t *testing.T) {
	value := &model.AccountValue{
		AccountType:    model.AccountTypeVacation,
		CurrentBalance: 12,
	}

	// Used = current balance for vacation
	used := value.UsedThisYear()
	assert.Equal(t, 12, used)
}

func TestAccountValue_UsedThisYear_NonVacation(t *testing.T) {
	value := &model.AccountValue{
		AccountType:    model.AccountTypeFlextime,
		CurrentBalance: 150,
	}

	// Used = 0 for non-vacation accounts
	used := value.UsedThisYear()
	assert.Equal(t, 0, used)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] GetByID returns nil if not found
- [ ] GetByEmployeeTypeYear returns nil if not found
- [ ] Upsert handles employee+type+year uniqueness
- [ ] ListByEmployeeYear filters correctly
- [ ] ListByTenantYear preloads Employee relation
- [ ] CloseYear sets closing_balance to current_balance
- [ ] CarryOverToNextYear creates next year record with opening_balance
- [ ] CarryOverToNextYear upserts if next year already exists
- [ ] Available() calculates correctly for vacation accounts
- [ ] Available() returns current_balance for non-vacation accounts
- [ ] UsedThisYear() returns current_balance for vacation
- [ ] UsedThisYear() returns 0 for non-vacation accounts
