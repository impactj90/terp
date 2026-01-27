# TICKET-058: Create Daily Value Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 11 - Daily Values
**Dependencies**: TICKET-057

## Description

Create the DailyValue model and repository.

## Files to Create

- `apps/api/internal/model/dailyvalue.go`
- `apps/api/internal/repository/dailyvalue.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/lib/pq"
)

type DailyValue struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
    ValueDate  time.Time `gorm:"type:date;not null" json:"value_date"`

    // Core time values (minutes)
    GrossTime  int `gorm:"default:0" json:"gross_time"`
    NetTime    int `gorm:"default:0" json:"net_time"`
    TargetTime int `gorm:"default:0" json:"target_time"`
    Overtime   int `gorm:"default:0" json:"overtime"`
    Undertime  int `gorm:"default:0" json:"undertime"`
    BreakTime  int `gorm:"default:0" json:"break_time"`

    // Status
    HasError   bool           `gorm:"default:false" json:"has_error"`
    ErrorCodes pq.StringArray `gorm:"type:text[]" json:"error_codes,omitempty"`
    Warnings   pq.StringArray `gorm:"type:text[]" json:"warnings,omitempty"`

    // Booking summary
    FirstCome    *int `gorm:"type:int" json:"first_come,omitempty"`
    LastGo       *int `gorm:"type:int" json:"last_go,omitempty"`
    BookingCount int  `gorm:"default:0" json:"booking_count"`

    // Calculation tracking
    CalculatedAt       *time.Time `json:"calculated_at,omitempty"`
    CalculationVersion int        `gorm:"default:1" json:"calculation_version"`

    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (DailyValue) TableName() string {
    return "daily_values"
}

// Balance returns overtime - undertime
func (dv *DailyValue) Balance() int {
    return dv.Overtime - dv.Undertime
}

// HasBookings returns true if there were any bookings
func (dv *DailyValue) HasBookings() bool {
    return dv.BookingCount > 0
}

// FormatGrossTime returns gross time as HH:MM
func (dv *DailyValue) FormatGrossTime() string {
    return MinutesToString(dv.GrossTime)
}

// FormatNetTime returns net time as HH:MM
func (dv *DailyValue) FormatNetTime() string {
    return MinutesToString(dv.NetTime)
}
```

### Repository

```go
type DailyValueRepository interface {
    Create(ctx context.Context, value *model.DailyValue) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.DailyValue, error)
    Update(ctx context.Context, value *model.DailyValue) error
    Upsert(ctx context.Context, value *model.DailyValue) error

    // Lookups
    GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error)
    GetWithErrors(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.DailyValue, error)

    // Aggregations
    SumForMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*DailyValueSum, error)
}

type DailyValueSum struct {
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int
    DaysWithErrors  int
    TotalDays       int
}

func (r *dailyValueRepository) Upsert(ctx context.Context, value *model.DailyValue) error {
    return r.db.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns: []clause.Column{{Name: "employee_id"}, {Name: "value_date"}},
            DoUpdates: clause.AssignmentColumns([]string{
                "gross_time", "net_time", "target_time", "overtime", "undertime", "break_time",
                "has_error", "error_codes", "warnings", "first_come", "last_go", "booking_count",
                "calculated_at", "calculation_version", "updated_at",
            }),
        }).
        Create(value).Error
}

func (r *dailyValueRepository) SumForMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*DailyValueSum, error) {
    var sum DailyValueSum
    err := r.db.WithContext(ctx).
        Model(&model.DailyValue{}).
        Select(`
            SUM(gross_time) as total_gross_time,
            SUM(net_time) as total_net_time,
            SUM(target_time) as total_target_time,
            SUM(overtime) as total_overtime,
            SUM(undertime) as total_undertime,
            SUM(break_time) as total_break_time,
            SUM(CASE WHEN has_error THEN 1 ELSE 0 END) as days_with_errors,
            COUNT(*) as total_days
        `).
        Where("employee_id = ? AND EXTRACT(YEAR FROM value_date) = ? AND EXTRACT(MONTH FROM value_date) = ?",
            employeeID, year, month).
        Scan(&sum).Error
    return &sum, err
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

type DailyValueRepository interface {
	Create(ctx context.Context, value *model.DailyValue) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.DailyValue, error)
	Update(ctx context.Context, value *model.DailyValue) error
	Upsert(ctx context.Context, value *model.DailyValue) error
	GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
	GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error)
	GetWithErrors(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.DailyValue, error)
	SumForMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*DailyValueSum, error)
}

type DailyValueSum struct {
	TotalGrossTime  int
	TotalNetTime    int
	TotalTargetTime int
	TotalOvertime   int
	TotalUndertime  int
	TotalBreakTime  int
	DaysWithErrors  int
	TotalDays       int
}

type dailyValueRepository struct {
	db *gorm.DB
}

func NewDailyValueRepository(db *gorm.DB) DailyValueRepository {
	return &dailyValueRepository{db: db}
}

func (r *dailyValueRepository) Create(ctx context.Context, value *model.DailyValue) error {
	return r.db.WithContext(ctx).Create(value).Error
}

func (r *dailyValueRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.DailyValue, error) {
	var value model.DailyValue
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&value).Error
	return &value, err
}

func (r *dailyValueRepository) Update(ctx context.Context, value *model.DailyValue) error {
	return r.db.WithContext(ctx).Save(value).Error
}

func (r *dailyValueRepository) Upsert(ctx context.Context, value *model.DailyValue) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "value_date"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"gross_time", "net_time", "target_time", "overtime", "undertime", "break_time",
				"has_error", "error_codes", "warnings", "first_come", "last_go", "booking_count",
				"calculated_at", "calculation_version", "updated_at",
			}),
		}).
		Create(value).Error
}

func (r *dailyValueRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
	var value model.DailyValue
	err := r.db.WithContext(ctx).
		Where("employee_id = ? AND value_date = ?", employeeID, date).
		First(&value).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &value, err
}

func (r *dailyValueRepository) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
	var values []model.DailyValue
	err := r.db.WithContext(ctx).
		Where("employee_id = ? AND value_date >= ? AND value_date <= ?", employeeID, from, to).
		Order("value_date ASC").
		Find(&values).Error
	return values, err
}

func (r *dailyValueRepository) GetWithErrors(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
	var values []model.DailyValue
	err := r.db.WithContext(ctx).
		Preload("Employee").
		Where("tenant_id = ? AND has_error = true AND value_date >= ? AND value_date <= ?", tenantID, from, to).
		Order("value_date DESC").
		Find(&values).Error
	return values, err
}

func (r *dailyValueRepository) SumForMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*DailyValueSum, error) {
	var sum DailyValueSum
	err := r.db.WithContext(ctx).
		Model(&model.DailyValue{}).
		Select(`
			SUM(gross_time) as total_gross_time,
			SUM(net_time) as total_net_time,
			SUM(target_time) as total_target_time,
			SUM(overtime) as total_overtime,
			SUM(undertime) as total_undertime,
			SUM(break_time) as total_break_time,
			SUM(CASE WHEN has_error THEN 1 ELSE 0 END) as days_with_errors,
			COUNT(*) as total_days
		`).
		Where("employee_id = ? AND EXTRACT(YEAR FROM value_date) = ? AND EXTRACT(MONTH FROM value_date) = ?",
			employeeID, year, month).
		Scan(&sum).Error
	return &sum, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/dailyvalue_test.go`

```go
package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"terp/apps/api/internal/model"
	"terp/apps/api/internal/testutil"
)

func TestDailyValueRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	valueDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	value := &model.DailyValue{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValueDate:  valueDate,
		GrossTime:  480,
		NetTime:    450,
		TargetTime: 480,
		BreakTime:  30,
	}

	err := repo.Create(ctx, value)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, value.ID)
}

func TestDailyValueRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	valueDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	value := &model.DailyValue{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValueDate:  valueDate,
		GrossTime:  480,
	}
	repo.Create(ctx, value)

	found, err := repo.GetByID(ctx, value.ID)
	require.NoError(t, err)
	assert.Equal(t, value.ID, found.ID)
	assert.Equal(t, value.GrossTime, found.GrossTime)
}

func TestDailyValueRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestDailyValueRepository_GetByEmployeeDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	valueDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	value := &model.DailyValue{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValueDate:  valueDate,
		GrossTime:  480,
	}
	repo.Create(ctx, value)

	found, err := repo.GetByEmployeeDate(ctx, employeeID, valueDate)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, value.ID, found.ID)

	// Test not found
	notFound, err := repo.GetByEmployeeDate(ctx, employeeID, time.Date(2024, 6, 16, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	assert.Nil(t, notFound)
}

func TestDailyValueRepository_Upsert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	valueDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	// First upsert (insert)
	value := &model.DailyValue{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValueDate:  valueDate,
		GrossTime:  480,
		NetTime:    450,
	}
	err := repo.Upsert(ctx, value)
	require.NoError(t, err)

	// Second upsert (update)
	value.GrossTime = 500
	value.NetTime = 470
	err = repo.Upsert(ctx, value)
	require.NoError(t, err)

	// Verify only one record exists with updated values
	found, _ := repo.GetByEmployeeDate(ctx, employeeID, valueDate)
	assert.Equal(t, 500, found.GrossTime)
	assert.Equal(t, 470, found.NetTime)
}

func TestDailyValueRepository_GetByEmployeeDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create daily values for a week
	for i := 1; i <= 7; i++ {
		repo.Create(ctx, &model.DailyValue{
			TenantID:   tenantID,
			EmployeeID: employeeID,
			ValueDate:  time.Date(2024, 6, i, 0, 0, 0, 0, time.UTC),
			GrossTime:  480,
		})
	}

	from := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC)

	values, err := repo.GetByEmployeeDateRange(ctx, employeeID, from, to)
	require.NoError(t, err)
	assert.Len(t, values, 7)
	// Verify ordering
	assert.Equal(t, 1, values[0].ValueDate.Day())
	assert.Equal(t, 7, values[6].ValueDate.Day())
}

func TestDailyValueRepository_GetWithErrors(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create value with error
	repo.Create(ctx, &model.DailyValue{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValueDate:  time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
		GrossTime:  480,
		HasError:   true,
		ErrorCodes: pq.StringArray{"ERR_001", "ERR_002"},
	})

	// Create value without error
	repo.Create(ctx, &model.DailyValue{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValueDate:  time.Date(2024, 6, 16, 0, 0, 0, 0, time.UTC),
		GrossTime:  480,
		HasError:   false,
	})

	from := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC)

	values, err := repo.GetWithErrors(ctx, tenantID, from, to)
	require.NoError(t, err)
	assert.Len(t, values, 1)
	assert.True(t, values[0].HasError)
	assert.Len(t, values[0].ErrorCodes, 2)
}

func TestDailyValueRepository_SumForMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Create daily values for June 2024
	for i := 1; i <= 5; i++ {
		hasError := i == 3 // Day 3 has error
		repo.Create(ctx, &model.DailyValue{
			TenantID:   tenantID,
			EmployeeID: employeeID,
			ValueDate:  time.Date(2024, 6, i, 0, 0, 0, 0, time.UTC),
			GrossTime:  480,
			NetTime:    450,
			TargetTime: 480,
			Overtime:   0,
			Undertime:  30,
			BreakTime:  30,
			HasError:   hasError,
		})
	}

	sum, err := repo.SumForMonth(ctx, employeeID, 2024, 6)
	require.NoError(t, err)
	assert.Equal(t, 2400, sum.TotalGrossTime)   // 480 * 5
	assert.Equal(t, 2250, sum.TotalNetTime)     // 450 * 5
	assert.Equal(t, 2400, sum.TotalTargetTime)  // 480 * 5
	assert.Equal(t, 0, sum.TotalOvertime)       // 0 * 5
	assert.Equal(t, 150, sum.TotalUndertime)    // 30 * 5
	assert.Equal(t, 150, sum.TotalBreakTime)    // 30 * 5
	assert.Equal(t, 1, sum.DaysWithErrors)
	assert.Equal(t, 5, sum.TotalDays)
}

func TestDailyValueRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDailyValueRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	valueDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	value := &model.DailyValue{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValueDate:  valueDate,
		GrossTime:  480,
	}
	repo.Create(ctx, value)

	value.GrossTime = 500
	err := repo.Update(ctx, value)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, value.ID)
	assert.Equal(t, 500, found.GrossTime)
}

func TestDailyValue_Balance(t *testing.T) {
	value := &model.DailyValue{
		Overtime:  30,
		Undertime: 10,
	}
	assert.Equal(t, 20, value.Balance())

	value2 := &model.DailyValue{
		Overtime:  10,
		Undertime: 30,
	}
	assert.Equal(t, -20, value2.Balance())
}

func TestDailyValue_HasBookings(t *testing.T) {
	value := &model.DailyValue{
		BookingCount: 5,
	}
	assert.True(t, value.HasBookings())

	value2 := &model.DailyValue{
		BookingCount: 0,
	}
	assert.False(t, value2.HasBookings())
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] Upsert handles conflict correctly
- [ ] SumForMonth aggregates monthly totals
- [ ] pq.StringArray works for error_codes
- [ ] GetWithErrors filters correctly
