# Implementation Plan: NOK-144 Monthly Value Model + Repository

## Overview

Create the MonthlyValue GORM model and repository to persist monthly aggregation results.
The model maps to the `monthly_values` migration (000028) and the repository provides
CRUD, upsert, lookup, and month-closing operations. The `IsMonthClosed` method satisfies
the `monthlyValueLookupForBooking` interface used by BookingService.

---

## Phase 1: Create the MonthlyValue Model

**File:** `apps/api/internal/model/monthlyvalue.go`

**Pattern:** Follows DailyValue and VacationBalance models exactly.

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// MonthlyValue represents monthly aggregation results for an employee.
type MonthlyValue struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`

	// Period identification
	Year  int `gorm:"type:int;not null" json:"year"`
	Month int `gorm:"type:int;not null" json:"month"`

	// Aggregated time totals (all in minutes)
	TotalGrossTime  int `gorm:"default:0" json:"total_gross_time"`
	TotalNetTime    int `gorm:"default:0" json:"total_net_time"`
	TotalTargetTime int `gorm:"default:0" json:"total_target_time"`
	TotalOvertime   int `gorm:"default:0" json:"total_overtime"`
	TotalUndertime  int `gorm:"default:0" json:"total_undertime"`
	TotalBreakTime  int `gorm:"default:0" json:"total_break_time"`

	// Flextime balance (all in minutes)
	FlextimeStart    int `gorm:"default:0" json:"flextime_start"`
	FlextimeChange   int `gorm:"default:0" json:"flextime_change"`
	FlextimeEnd      int `gorm:"default:0" json:"flextime_end"`
	FlextimeCarryover int `gorm:"default:0" json:"flextime_carryover"`

	// Absence summary
	VacationTaken   decimal.Decimal `gorm:"type:decimal(5,2);default:0" json:"vacation_taken"`
	SickDays        int             `gorm:"default:0" json:"sick_days"`
	OtherAbsenceDays int            `gorm:"default:0" json:"other_absence_days"`

	// Work summary
	WorkDays       int `gorm:"default:0" json:"work_days"`
	DaysWithErrors int `gorm:"default:0" json:"days_with_errors"`

	// Month closing
	IsClosed   bool       `gorm:"default:false" json:"is_closed"`
	ClosedAt   *time.Time `gorm:"type:timestamptz" json:"closed_at,omitempty"`
	ClosedBy   *uuid.UUID `gorm:"type:uuid" json:"closed_by,omitempty"`
	ReopenedAt *time.Time `gorm:"type:timestamptz" json:"reopened_at,omitempty"`
	ReopenedBy *uuid.UUID `gorm:"type:uuid" json:"reopened_by,omitempty"`

	// Timestamps
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// TableName returns the database table name.
func (MonthlyValue) TableName() string {
	return "monthly_values"
}

// FlextimeBalance returns the net flextime change (overtime - undertime).
func (mv *MonthlyValue) FlextimeBalance() int {
	return mv.TotalOvertime - mv.TotalUndertime
}

// FormatFlextimeEnd returns the flextime end balance as HH:MM string with sign.
func (mv *MonthlyValue) FormatFlextimeEnd() string {
	if mv.FlextimeEnd < 0 {
		return "-" + MinutesToString(-mv.FlextimeEnd)
	}
	return MinutesToString(mv.FlextimeEnd)
}
```

**Verification:**
```bash
cd apps/api && go build ./internal/model/
```

---

## Phase 2: Create the MonthlyValue Repository

**File:** `apps/api/internal/repository/monthlyvalue.go`

**Pattern:** Follows DailyValue and VacationBalance repositories. Includes:
- Standard CRUD (Create, GetByID, Update, Delete)
- GetByEmployeeMonth (nil, nil for not found -- like VacationBalance.GetByEmployeeYear)
- Upsert on (employee_id, year, month) unique constraint
- ListByEmployee ordered by year, month
- ListByEmployeeYear filtered by year
- IsMonthClosed (satisfies BookingService interface)
- CloseMonth / ReopenMonth for month-closing workflow

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
	ErrMonthlyValueNotFound = errors.New("monthly value not found")
)

// MonthlyValueRepository handles monthly value data access.
type MonthlyValueRepository struct {
	db *DB
}

// NewMonthlyValueRepository creates a new monthly value repository.
func NewMonthlyValueRepository(db *DB) *MonthlyValueRepository {
	return &MonthlyValueRepository{db: db}
}

// Create creates a new monthly value.
func (r *MonthlyValueRepository) Create(ctx context.Context, mv *model.MonthlyValue) error {
	return r.db.GORM.WithContext(ctx).Create(mv).Error
}

// GetByID retrieves a monthly value by ID.
func (r *MonthlyValueRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyValue, error) {
	var mv model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		First(&mv, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMonthlyValueNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get monthly value: %w", err)
	}
	return &mv, nil
}

// Update updates a monthly value.
func (r *MonthlyValueRepository) Update(ctx context.Context, mv *model.MonthlyValue) error {
	return r.db.GORM.WithContext(ctx).Save(mv).Error
}

// Delete deletes a monthly value by ID.
func (r *MonthlyValueRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.MonthlyValue{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete monthly value: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMonthlyValueNotFound
	}
	return nil
}

// GetByEmployeeMonth retrieves the monthly value for an employee for a specific year/month.
// Returns nil, nil if no record exists.
func (r *MonthlyValueRepository) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	var mv model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
		First(&mv).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get monthly value: %w", err)
	}
	return &mv, nil
}

// Upsert creates or updates a monthly value based on employee_id + year + month.
func (r *MonthlyValueRepository) Upsert(ctx context.Context, mv *model.MonthlyValue) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "year"}, {Name: "month"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"total_gross_time", "total_net_time", "total_target_time",
				"total_overtime", "total_undertime", "total_break_time",
				"flextime_start", "flextime_change", "flextime_end", "flextime_carryover",
				"vacation_taken", "sick_days", "other_absence_days",
				"work_days", "days_with_errors",
				"updated_at",
			}),
		}).
		Create(mv).Error
}

// ListByEmployee retrieves all monthly values for an employee ordered by year, month.
func (r *MonthlyValueRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.MonthlyValue, error) {
	var values []model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Order("year ASC, month ASC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list monthly values: %w", err)
	}
	return values, nil
}

// ListByEmployeeYear retrieves monthly values for an employee for a specific year.
func (r *MonthlyValueRepository) ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.MonthlyValue, error) {
	var values []model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND year = ?", employeeID, year).
		Order("month ASC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list monthly values for year: %w", err)
	}
	return values, nil
}

// IsMonthClosed checks if the month containing the given date is closed for an employee.
// Satisfies the monthlyValueLookupForBooking interface in BookingService.
func (r *MonthlyValueRepository) IsMonthClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (bool, error) {
	var mv model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND employee_id = ? AND year = ? AND month = ?",
			tenantID, employeeID, date.Year(), int(date.Month())).
		First(&mv).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("failed to check month closed: %w", err)
	}
	return mv.IsClosed, nil
}

// CloseMonth marks a monthly value as closed.
func (r *MonthlyValueRepository) CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error {
	now := time.Now()
	result := r.db.GORM.WithContext(ctx).
		Model(&model.MonthlyValue{}).
		Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
		Updates(map[string]interface{}{
			"is_closed": true,
			"closed_at": now,
			"closed_by": closedBy,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to close month: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMonthlyValueNotFound
	}
	return nil
}

// ReopenMonth marks a monthly value as reopened.
func (r *MonthlyValueRepository) ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error {
	now := time.Now()
	result := r.db.GORM.WithContext(ctx).
		Model(&model.MonthlyValue{}).
		Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
		Updates(map[string]interface{}{
			"is_closed":   false,
			"reopened_at": now,
			"reopened_by": reopenedBy,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to reopen month: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMonthlyValueNotFound
	}
	return nil
}
```

**Verification:**
```bash
cd apps/api && go build ./internal/repository/
```

---

## Phase 3: Create Repository Tests

**File:** `apps/api/internal/repository/monthlyvalue_test.go`

**Pattern:** Follows DailyValue and VacationBalance test files exactly:
- Dedicated helper functions with `ForMV` suffix
- Standalone test functions with `TestMonthlyValueRepository_MethodName` pattern
- Uses testutil.SetupTestDB, require.NoError for critical checks, assert.Equal for assertions
- Decimal comparisons with `assert.True(t, found.Field.Equal(...))`

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

// createTestTenantForMV creates a tenant for use in monthly value tests.
func createTestTenantForMV(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

// createTestEmployeeForMV creates an employee for monthly value tests.
func createTestEmployeeForMV(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
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

func TestMonthlyValueRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		Year:            2026,
		Month:           1,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 9600,
		TotalOvertime:   0,
		TotalUndertime:  600,
		TotalBreakTime:  600,
		FlextimeStart:   120,
		FlextimeChange:  -600,
		FlextimeEnd:     -480,
		WorkDays:        20,
		DaysWithErrors:  1,
		VacationTaken:   decimal.NewFromFloat(2.5),
		SickDays:        1,
	}

	err := repo.Create(ctx, mv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, mv.ID)
}

func TestMonthlyValueRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		Year:            2026,
		Month:           1,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		FlextimeEnd:     -480,
		VacationTaken:   decimal.NewFromFloat(3.5),
	}
	require.NoError(t, repo.Create(ctx, mv))

	found, err := repo.GetByID(ctx, mv.ID)
	require.NoError(t, err)
	assert.Equal(t, mv.ID, found.ID)
	assert.Equal(t, 2026, found.Year)
	assert.Equal(t, 1, found.Month)
	assert.Equal(t, 9600, found.TotalGrossTime)
	assert.Equal(t, 9000, found.TotalNetTime)
	assert.Equal(t, -480, found.FlextimeEnd)
	assert.True(t, found.VacationTaken.Equal(decimal.NewFromFloat(3.5)))
}

func TestMonthlyValueRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 9600,
		TotalNetTime:   9000,
		FlextimeEnd:    0,
	}
	require.NoError(t, repo.Create(ctx, mv))

	mv.TotalGrossTime = 10000
	mv.TotalNetTime = 9500
	mv.FlextimeEnd = 500
	mv.DaysWithErrors = 2
	err := repo.Update(ctx, mv)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, mv.ID)
	require.NoError(t, err)
	assert.Equal(t, 10000, found.TotalGrossTime)
	assert.Equal(t, 9500, found.TotalNetTime)
	assert.Equal(t, 500, found.FlextimeEnd)
	assert.Equal(t, 2, found.DaysWithErrors)
}

func TestMonthlyValueRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
	}
	require.NoError(t, repo.Create(ctx, mv))

	err := repo.Delete(ctx, mv.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, mv.ID)
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_GetByEmployeeMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          3,
		TotalGrossTime: 9600,
		FlextimeEnd:    120,
	}
	require.NoError(t, repo.Create(ctx, mv))

	found, err := repo.GetByEmployeeMonth(ctx, emp.ID, 2026, 3)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, mv.ID, found.ID)
	assert.Equal(t, 9600, found.TotalGrossTime)
	assert.Equal(t, 120, found.FlextimeEnd)
}

func TestMonthlyValueRepository_GetByEmployeeMonth_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	found, err := repo.GetByEmployeeMonth(ctx, emp.ID, 2026, 6)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestMonthlyValueRepository_Upsert_Insert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 9600,
		TotalNetTime:   9000,
		FlextimeStart:  0,
		FlextimeChange: 600,
		FlextimeEnd:    600,
		WorkDays:       20,
		VacationTaken:  decimal.NewFromFloat(1.5),
	}

	err := repo.Upsert(ctx, mv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, mv.ID)

	found, err := repo.GetByEmployeeMonth(ctx, emp.ID, 2026, 1)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, 9600, found.TotalGrossTime)
	assert.Equal(t, 600, found.FlextimeEnd)
	assert.Equal(t, 20, found.WorkDays)
	assert.True(t, found.VacationTaken.Equal(decimal.NewFromFloat(1.5)))
}

func TestMonthlyValueRepository_Upsert_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// First upsert (insert)
	mv1 := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 9600,
		TotalNetTime:   9000,
		FlextimeEnd:    0,
		WorkDays:       20,
	}
	require.NoError(t, repo.Upsert(ctx, mv1))
	originalID := mv1.ID

	// Second upsert (update) with same employee+year+month
	mv2 := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 10000,
		TotalNetTime:   9500,
		TotalOvertime:  500,
		FlextimeEnd:    500,
		WorkDays:       21,
		VacationTaken:  decimal.NewFromFloat(2.0),
	}
	require.NoError(t, repo.Upsert(ctx, mv2))

	// Verify the original record was updated (not a new one created)
	found, err := repo.GetByID(ctx, originalID)
	require.NoError(t, err)
	assert.Equal(t, 10000, found.TotalGrossTime)
	assert.Equal(t, 9500, found.TotalNetTime)
	assert.Equal(t, 500, found.TotalOvertime)
	assert.Equal(t, 500, found.FlextimeEnd)
	assert.Equal(t, 21, found.WorkDays)
	assert.True(t, found.VacationTaken.Equal(decimal.NewFromFloat(2.0)))
}

func TestMonthlyValueRepository_ListByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// Create out of order: 2026-03, 2025-12, 2026-01
	months := []struct {
		year  int
		month int
	}{
		{2026, 3},
		{2025, 12},
		{2026, 1},
	}
	for _, m := range months {
		mv := &model.MonthlyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			Year:       m.year,
			Month:      m.month,
		}
		require.NoError(t, repo.Create(ctx, mv))
	}

	values, err := repo.ListByEmployee(ctx, emp.ID)
	require.NoError(t, err)
	require.Len(t, values, 3)

	// Verify ordering: 2025-12, 2026-01, 2026-03
	assert.Equal(t, 2025, values[0].Year)
	assert.Equal(t, 12, values[0].Month)
	assert.Equal(t, 2026, values[1].Year)
	assert.Equal(t, 1, values[1].Month)
	assert.Equal(t, 2026, values[2].Year)
	assert.Equal(t, 3, values[2].Month)
}

func TestMonthlyValueRepository_ListByEmployee_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	values, err := repo.ListByEmployee(ctx, emp.ID)
	require.NoError(t, err)
	assert.Empty(t, values)
}

func TestMonthlyValueRepository_ListByEmployeeYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// Create months across two years
	for _, m := range []struct{ year, month int }{{2025, 11}, {2025, 12}, {2026, 1}, {2026, 2}} {
		mv := &model.MonthlyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			Year:       m.year,
			Month:      m.month,
		}
		require.NoError(t, repo.Create(ctx, mv))
	}

	values, err := repo.ListByEmployeeYear(ctx, emp.ID, 2026)
	require.NoError(t, err)
	require.Len(t, values, 2)
	assert.Equal(t, 1, values[0].Month)
	assert.Equal(t, 2, values[1].Month)
}

func TestMonthlyValueRepository_ListByEmployeeYear_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	values, err := repo.ListByEmployeeYear(ctx, emp.ID, 2030)
	require.NoError(t, err)
	assert.Empty(t, values)
}

func TestMonthlyValueRepository_IsMonthClosed_NotClosed(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
		IsClosed:   false,
	}
	require.NoError(t, repo.Create(ctx, mv))

	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	closed, err := repo.IsMonthClosed(ctx, tenant.ID, emp.ID, date)
	require.NoError(t, err)
	assert.False(t, closed)
}

func TestMonthlyValueRepository_IsMonthClosed_Closed(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
		IsClosed:   true,
	}
	require.NoError(t, repo.Create(ctx, mv))

	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	closed, err := repo.IsMonthClosed(ctx, tenant.ID, emp.ID, date)
	require.NoError(t, err)
	assert.True(t, closed)
}

func TestMonthlyValueRepository_IsMonthClosed_NoRecord(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// No monthly value record exists -- should return false (not closed)
	date := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	closed, err := repo.IsMonthClosed(ctx, tenant.ID, emp.ID, date)
	require.NoError(t, err)
	assert.False(t, closed)
}

func TestMonthlyValueRepository_CloseMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
		IsClosed:   false,
	}
	require.NoError(t, repo.Create(ctx, mv))

	closerID := uuid.New()
	err := repo.CloseMonth(ctx, emp.ID, 2026, 1, closerID)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, mv.ID)
	require.NoError(t, err)
	assert.True(t, found.IsClosed)
	assert.NotNil(t, found.ClosedAt)
	assert.NotNil(t, found.ClosedBy)
	assert.Equal(t, closerID, *found.ClosedBy)
}

func TestMonthlyValueRepository_CloseMonth_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	err := repo.CloseMonth(ctx, uuid.New(), 2026, 1, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_ReopenMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	now := time.Now()
	closerID := uuid.New()
	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
		IsClosed:   true,
		ClosedAt:   &now,
		ClosedBy:   &closerID,
	}
	require.NoError(t, repo.Create(ctx, mv))

	reopenerID := uuid.New()
	err := repo.ReopenMonth(ctx, emp.ID, 2026, 1, reopenerID)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, mv.ID)
	require.NoError(t, err)
	assert.False(t, found.IsClosed)
	assert.NotNil(t, found.ReopenedAt)
	assert.NotNil(t, found.ReopenedBy)
	assert.Equal(t, reopenerID, *found.ReopenedBy)
}

func TestMonthlyValueRepository_ReopenMonth_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	err := repo.ReopenMonth(ctx, uuid.New(), 2026, 1, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv1 := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
	}
	require.NoError(t, repo.Create(ctx, mv1))

	// Try to create duplicate - should fail due to unique constraint
	mv2 := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
	}
	err := repo.Create(ctx, mv2)
	assert.Error(t, err)
}

func TestMonthlyValue_FlextimeBalance(t *testing.T) {
	mv := &model.MonthlyValue{
		TotalOvertime:  120,
		TotalUndertime: 30,
	}
	assert.Equal(t, 90, mv.FlextimeBalance())

	mv.TotalOvertime = 0
	mv.TotalUndertime = 60
	assert.Equal(t, -60, mv.FlextimeBalance())
}

func TestMonthlyValue_FormatFlextimeEnd(t *testing.T) {
	mv := &model.MonthlyValue{FlextimeEnd: 150} // 2:30
	assert.Equal(t, "02:30", mv.FormatFlextimeEnd())

	mv.FlextimeEnd = -90 // -1:30
	assert.Equal(t, "-01:30", mv.FormatFlextimeEnd())

	mv.FlextimeEnd = 0
	assert.Equal(t, "00:00", mv.FormatFlextimeEnd())
}
```

**Verification:**
```bash
cd apps/api && go test -v -run TestMonthlyValue ./internal/repository/...
```

---

## Phase 4: Verification

Run in sequence to confirm everything compiles and passes:

```bash
# 1. Compile model
cd apps/api && go build ./internal/model/

# 2. Compile repository
cd apps/api && go build ./internal/repository/

# 3. Format code
make fmt

# 4. Run lint
make lint

# 5. Run all tests (requires DB with migration 000028 applied)
make test
```

---

## Success Criteria

1. `apps/api/internal/model/monthlyvalue.go` compiles cleanly
2. `apps/api/internal/repository/monthlyvalue.go` compiles cleanly
3. All tests in `monthlyvalue_test.go` pass against the test database
4. `make lint` shows no new warnings
5. `MonthlyValueRepository.IsMonthClosed` signature matches `monthlyValueLookupForBooking` interface in `service/booking.go`

---

## Interface Compatibility Note

The `BookingService` in `apps/api/internal/service/booking.go` defines:
```go
type monthlyValueLookupForBooking interface {
    IsMonthClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (bool, error)
}
```

The `MonthlyValueRepository.IsMonthClosed` method has matching signature:
```go
func (r *MonthlyValueRepository) IsMonthClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (bool, error)
```

This means `*MonthlyValueRepository` can be passed directly to `NewBookingService` as the
`monthlyValueRepo` parameter without any adapter or wrapper.
