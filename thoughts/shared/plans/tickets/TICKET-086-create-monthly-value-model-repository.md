# TICKET-086: Create Monthly Value Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 21 - Monthly Values
**Dependencies**: TICKET-085

## Description

Create the MonthlyValue model and repository.

## Files to Create

- `apps/api/internal/model/monthlyvalue.go`
- `apps/api/internal/repository/monthlyvalue.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

type MonthlyValue struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
    Year       int       `gorm:"not null" json:"year"`
    Month      int       `gorm:"not null" json:"month"`

    // Aggregated time values (minutes)
    TotalGrossTime  int `gorm:"default:0" json:"total_gross_time"`
    TotalNetTime    int `gorm:"default:0" json:"total_net_time"`
    TotalTargetTime int `gorm:"default:0" json:"total_target_time"`
    TotalOvertime   int `gorm:"default:0" json:"total_overtime"`
    TotalUndertime  int `gorm:"default:0" json:"total_undertime"`
    TotalBreakTime  int `gorm:"default:0" json:"total_break_time"`

    // Flextime tracking
    FlextimeStart    int `gorm:"default:0" json:"flextime_start"`
    FlextimeChange   int `gorm:"default:0" json:"flextime_change"`
    FlextimeEnd      int `gorm:"default:0" json:"flextime_end"`
    FlextimeCarryover int `gorm:"default:0" json:"flextime_carryover"`

    // Absence summary
    VacationTaken    decimal.Decimal `gorm:"type:decimal(5,2);default:0" json:"vacation_taken"`
    SickDays         int             `gorm:"default:0" json:"sick_days"`
    OtherAbsenceDays int             `gorm:"default:0" json:"other_absence_days"`

    // Work summary
    WorkDays       int `gorm:"default:0" json:"work_days"`
    DaysWithErrors int `gorm:"default:0" json:"days_with_errors"`

    // Month closing
    IsClosed   bool       `gorm:"default:false" json:"is_closed"`
    ClosedAt   *time.Time `json:"closed_at,omitempty"`
    ClosedBy   *uuid.UUID `gorm:"type:uuid" json:"closed_by,omitempty"`
    ReopenedAt *time.Time `json:"reopened_at,omitempty"`
    ReopenedBy *uuid.UUID `gorm:"type:uuid" json:"reopened_by,omitempty"`

    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (MonthlyValue) TableName() string {
    return "monthly_values"
}

// Balance returns net overtime/undertime for the month
func (mv *MonthlyValue) Balance() int {
    return mv.TotalOvertime - mv.TotalUndertime
}
```

### Repository

```go
type MonthlyValueRepository interface {
    Create(ctx context.Context, value *model.MonthlyValue) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyValue, error)
    GetByEmployeeYearMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    GetPreviousMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    Update(ctx context.Context, value *model.MonthlyValue) error
    Upsert(ctx context.Context, value *model.MonthlyValue) error
    ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.MonthlyValue, error)
    Close(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error
    Reopen(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error
}

func (r *monthlyValueRepository) GetPreviousMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
    prevYear, prevMonth := year, month-1
    if prevMonth < 1 {
        prevMonth = 12
        prevYear--
    }
    return r.GetByEmployeeYearMonth(ctx, employeeID, prevYear, prevMonth)
}

func (r *monthlyValueRepository) Close(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.MonthlyValue{}).
        Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
        Updates(map[string]interface{}{
            "is_closed": true,
            "closed_at": now,
            "closed_by": closedBy,
        }).Error
}

func (r *monthlyValueRepository) Reopen(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.MonthlyValue{}).
        Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
        Updates(map[string]interface{}{
            "is_closed":   false,
            "reopened_at": now,
            "reopened_by": reopenedBy,
        }).Error
}
```

## Repository Implementation

```go
package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"terp/apps/api/internal/model"
)

type monthlyValueRepository struct {
	db *gorm.DB
}

func NewMonthlyValueRepository(db *gorm.DB) MonthlyValueRepository {
	return &monthlyValueRepository{db: db}
}

func (r *monthlyValueRepository) Create(ctx context.Context, value *model.MonthlyValue) error {
	return r.db.WithContext(ctx).Create(value).Error
}

func (r *monthlyValueRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyValue, error) {
	var value model.MonthlyValue
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&value).Error
	return &value, err
}

func (r *monthlyValueRepository) GetByEmployeeYearMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	var value model.MonthlyValue
	err := r.db.WithContext(ctx).
		Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
		First(&value).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &value, err
}

func (r *monthlyValueRepository) Update(ctx context.Context, value *model.MonthlyValue) error {
	return r.db.WithContext(ctx).Save(value).Error
}

func (r *monthlyValueRepository) Upsert(ctx context.Context, value *model.MonthlyValue) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "employee_id"}, {Name: "year"}, {Name: "month"}},
			DoUpdates: clause.AssignmentColumns([]string{"total_gross_time", "total_net_time", "total_target_time", "total_overtime", "total_undertime", "total_break_time", "flextime_start", "flextime_change", "flextime_end", "flextime_carryover", "vacation_taken", "sick_days", "other_absence_days", "work_days", "days_with_errors", "updated_at"}),
		}).
		Create(value).Error
}

func (r *monthlyValueRepository) ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.MonthlyValue, error) {
	var values []model.MonthlyValue
	err := r.db.WithContext(ctx).
		Where("employee_id = ? AND year = ?", employeeID, year).
		Order("month ASC").
		Find(&values).Error
	return values, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/monthlyvalue_test.go`

```go
package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"terp/apps/api/internal/model"
	"terp/apps/api/internal/testutil"
)

func TestMonthlyValueRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	value := &model.MonthlyValue{
		TenantID:        tenantID,
		EmployeeID:      employeeID,
		Year:            2024,
		Month:           6,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 8800,
		TotalOvertime:   200,
		FlextimeStart:   100,
		FlextimeChange:  200,
		FlextimeEnd:     300,
		VacationTaken:   decimal.NewFromFloat(2.5),
		WorkDays:        20,
	}

	err := repo.Create(ctx, value)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, value.ID)
}

func TestMonthlyValueRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	value := &model.MonthlyValue{
		TenantID:        tenantID,
		EmployeeID:      employeeID,
		Year:            2024,
		Month:           6,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 8800,
		TotalOvertime:   200,
	}
	repo.Create(ctx, value)

	found, err := repo.GetByID(ctx, value.ID)
	require.NoError(t, err)
	assert.Equal(t, value.ID, found.ID)
	assert.Equal(t, 9600, found.TotalGrossTime)
	assert.Equal(t, 200, found.TotalOvertime)
}

func TestMonthlyValueRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestMonthlyValueRepository_GetByEmployeeYearMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	value := &model.MonthlyValue{
		TenantID:        tenantID,
		EmployeeID:      employeeID,
		Year:            2024,
		Month:           6,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 8800,
	}
	repo.Create(ctx, value)

	found, err := repo.GetByEmployeeYearMonth(ctx, employeeID, 2024, 6)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, value.ID, found.ID)
	assert.Equal(t, 2024, found.Year)
	assert.Equal(t, 6, found.Month)

	// Test not found returns nil
	notFound, err := repo.GetByEmployeeYearMonth(ctx, employeeID, 2024, 7)
	require.NoError(t, err)
	assert.Nil(t, notFound)
}

func TestMonthlyValueRepository_GetPreviousMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create May 2024
	mayValue := &model.MonthlyValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		Year:           2024,
		Month:          5,
		FlextimeEnd:    150,
		TotalGrossTime: 9600,
	}
	repo.Create(ctx, mayValue)

	// Get previous month from June 2024
	prev, err := repo.GetPreviousMonth(ctx, employeeID, 2024, 6)
	require.NoError(t, err)
	assert.NotNil(t, prev)
	assert.Equal(t, 2024, prev.Year)
	assert.Equal(t, 5, prev.Month)
	assert.Equal(t, 150, prev.FlextimeEnd)
}

func TestMonthlyValueRepository_GetPreviousMonth_YearBoundary(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create December 2023
	decValue := &model.MonthlyValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		Year:           2023,
		Month:          12,
		FlextimeEnd:    200,
		TotalGrossTime: 8800,
	}
	repo.Create(ctx, decValue)

	// Get previous month from January 2024 (should get Dec 2023)
	prev, err := repo.GetPreviousMonth(ctx, employeeID, 2024, 1)
	require.NoError(t, err)
	assert.NotNil(t, prev)
	assert.Equal(t, 2023, prev.Year)
	assert.Equal(t, 12, prev.Month)
	assert.Equal(t, 200, prev.FlextimeEnd)
}

func TestMonthlyValueRepository_Upsert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// First upsert (insert)
	value := &model.MonthlyValue{
		TenantID:        tenantID,
		EmployeeID:      employeeID,
		Year:            2024,
		Month:           6,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 8800,
	}
	err := repo.Upsert(ctx, value)
	require.NoError(t, err)

	// Second upsert (update)
	value.TotalGrossTime = 10000
	value.TotalNetTime = 9500
	err = repo.Upsert(ctx, value)
	require.NoError(t, err)

	// Verify only one record exists with updated values
	found, _ := repo.GetByEmployeeYearMonth(ctx, employeeID, 2024, 6)
	assert.Equal(t, 10000, found.TotalGrossTime)
	assert.Equal(t, 9500, found.TotalNetTime)
}

func TestMonthlyValueRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	value := &model.MonthlyValue{
		TenantID:        tenantID,
		EmployeeID:      employeeID,
		Year:            2024,
		Month:           6,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 8800,
		WorkDays:        20,
	}
	repo.Create(ctx, value)

	value.TotalGrossTime = 10000
	value.WorkDays = 22
	err := repo.Update(ctx, value)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, value.ID)
	assert.Equal(t, 10000, found.TotalGrossTime)
	assert.Equal(t, 22, found.WorkDays)
}

func TestMonthlyValueRepository_Close(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	closedBy := uuid.New()

	value := &model.MonthlyValue{
		TenantID:        tenantID,
		EmployeeID:      employeeID,
		Year:            2024,
		Month:           6,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 8800,
	}
	repo.Create(ctx, value)

	// Close the month
	err := repo.Close(ctx, employeeID, 2024, 6, closedBy)
	require.NoError(t, err)

	// Verify month is closed
	found, _ := repo.GetByEmployeeYearMonth(ctx, employeeID, 2024, 6)
	assert.True(t, found.IsClosed)
	assert.NotNil(t, found.ClosedAt)
	assert.NotNil(t, found.ClosedBy)
	assert.Equal(t, closedBy, *found.ClosedBy)
}

func TestMonthlyValueRepository_Reopen(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	closedBy := uuid.New()
	reopenedBy := uuid.New()

	value := &model.MonthlyValue{
		TenantID:        tenantID,
		EmployeeID:      employeeID,
		Year:            2024,
		Month:           6,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 8800,
	}
	repo.Create(ctx, value)

	// Close then reopen
	repo.Close(ctx, employeeID, 2024, 6, closedBy)
	err := repo.Reopen(ctx, employeeID, 2024, 6, reopenedBy)
	require.NoError(t, err)

	// Verify month is reopened
	found, _ := repo.GetByEmployeeYearMonth(ctx, employeeID, 2024, 6)
	assert.False(t, found.IsClosed)
	assert.NotNil(t, found.ReopenedAt)
	assert.NotNil(t, found.ReopenedBy)
	assert.Equal(t, reopenedBy, *found.ReopenedBy)
}

func TestMonthlyValueRepository_ListByEmployeeYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create values for multiple months
	repo.Create(ctx, &model.MonthlyValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		Year:           2024,
		Month:          1,
		TotalGrossTime: 9600,
	})
	repo.Create(ctx, &model.MonthlyValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		Year:           2024,
		Month:          6,
		TotalGrossTime: 10000,
	})
	repo.Create(ctx, &model.MonthlyValue{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		Year:           2024,
		Month:          3,
		TotalGrossTime: 9800,
	})

	values, err := repo.ListByEmployeeYear(ctx, employeeID, 2024)
	require.NoError(t, err)
	assert.Len(t, values, 3)
	// Verify ordered by month ASC
	assert.Equal(t, 1, values[0].Month)
	assert.Equal(t, 3, values[1].Month)
	assert.Equal(t, 6, values[2].Month)
}

func TestMonthlyValue_Balance(t *testing.T) {
	value := &model.MonthlyValue{
		TotalOvertime:  250,
		TotalUndertime: 50,
	}

	// Balance = 250 - 50 = 200
	balance := value.Balance()
	assert.Equal(t, 200, balance)
}

func TestMonthlyValue_Balance_Negative(t *testing.T) {
	value := &model.MonthlyValue{
		TotalOvertime:  50,
		TotalUndertime: 250,
	}

	// Balance = 50 - 250 = -200
	balance := value.Balance()
	assert.Equal(t, -200, balance)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] GetByEmployeeYearMonth returns nil if not found
- [ ] GetPreviousMonth handles year boundary
- [ ] Close/Reopen update correct fields
- [ ] Upsert handles employee+year+month uniqueness
- [ ] Balance() calculates correctly
