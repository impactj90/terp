# TICKET-058: DailyValue Model + Repository Implementation Plan

## Overview

Implement the DailyValue model and repository following established codebase patterns. The `daily_values` table migration (000024) already exists. This ticket creates the Go model with GORM tags, a repository with CRUD operations, date-based queries, upsert functionality, error filtering, monthly aggregation, and comprehensive tests.

## Current State Analysis

- **Migration**: `db/migrations/000024_create_daily_values.up.sql` exists with full table schema
- **Model patterns**: Established in `booking.go`, `employeedayplan.go`
- **Repository patterns**: Established in `booking.go:33-271`, `employeedayplan.go:21-137`
- **Test patterns**: Established in `booking_test.go`, `employeedayplan_test.go`
- **Time utilities**: `MinutesToString()` exists in `booking.go:96-101` for reuse

### Key Discoveries:
- `pq.StringArray` from `github.com/lib/pq` needed for `error_codes` and `warnings` (TEXT[] columns) - new pattern
- Unique constraint on `(employee_id, value_date)` enables upsert behavior
- Partial index on `has_error = true` optimizes error filtering queries
- All time values stored as integers (minutes)

## Desired End State

After implementation:
1. `apps/api/internal/model/dailyvalue.go` contains `DailyValue` struct with GORM tags
2. `apps/api/internal/repository/dailyvalue.go` contains `DailyValueRepository` with all methods
3. `apps/api/internal/repository/dailyvalue_test.go` contains comprehensive tests
4. All tests pass: `cd apps/api && go test -v ./internal/repository/... -run DailyValue`
5. Code compiles without errors: `cd apps/api && go build ./...`

## What We're NOT Doing

- No API handlers (separate ticket)
- No service layer (separate ticket)
- No OpenAPI schema changes (separate ticket)
- No changes to other models or repositories

## Implementation Approach

Follow existing patterns exactly. Use `pq.StringArray` for TEXT[] columns. Implement the repository with standard CRUD plus specialized methods for date queries, error filtering, and monthly aggregation.

---

## Phase 1: Create DailyValue Model

### Overview
Create the domain model with GORM tags matching the migration schema.

### Changes Required:

#### 1. Create Model File
**File**: `apps/api/internal/model/dailyvalue.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// DailyValue represents calculated daily time tracking results for an employee.
type DailyValue struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	ValueDate  time.Time `gorm:"type:date;not null" json:"value_date"`

	// Core time values (all in minutes)
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

	// Booking summary (times as minutes from midnight 0-1439)
	FirstCome    *int `gorm:"type:int" json:"first_come,omitempty"`
	LastGo       *int `gorm:"type:int" json:"last_go,omitempty"`
	BookingCount int  `gorm:"default:0" json:"booking_count"`

	// Calculation tracking
	CalculatedAt       *time.Time `gorm:"type:timestamptz" json:"calculated_at,omitempty"`
	CalculationVersion int        `gorm:"default:1" json:"calculation_version"`

	// Timestamps
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// TableName returns the database table name.
func (DailyValue) TableName() string {
	return "daily_values"
}

// Balance returns the net time difference (overtime - undertime).
func (dv *DailyValue) Balance() int {
	return dv.Overtime - dv.Undertime
}

// FormatGrossTime returns gross time as HH:MM string.
func (dv *DailyValue) FormatGrossTime() string {
	return MinutesToString(dv.GrossTime)
}

// FormatNetTime returns net time as HH:MM string.
func (dv *DailyValue) FormatNetTime() string {
	return MinutesToString(dv.NetTime)
}

// FormatTargetTime returns target time as HH:MM string.
func (dv *DailyValue) FormatTargetTime() string {
	return MinutesToString(dv.TargetTime)
}

// FormatBalance returns balance as HH:MM string with sign.
func (dv *DailyValue) FormatBalance() string {
	balance := dv.Balance()
	if balance < 0 {
		return "-" + MinutesToString(-balance)
	}
	return MinutesToString(balance)
}

// HasBookings returns true if there are any bookings for this day.
func (dv *DailyValue) HasBookings() bool {
	return dv.BookingCount > 0
}
```

### Success Criteria:

#### Automated Verification:
- [x] Code compiles: `cd apps/api && go build ./internal/model/...`
- [x] No linting errors: `cd apps/api && golangci-lint run ./internal/model/...`

---

## Phase 2: Create DailyValue Repository

### Overview
Create the repository with CRUD operations, date-based queries, upsert, error filtering, and monthly aggregation.

### Changes Required:

#### 1. Create Repository File
**File**: `apps/api/internal/repository/dailyvalue.go`

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
	ErrDailyValueNotFound = errors.New("daily value not found")
)

// DailyValueSum holds aggregated monthly totals.
type DailyValueSum struct {
	TotalGrossTime  int `gorm:"column:total_gross_time"`
	TotalNetTime    int `gorm:"column:total_net_time"`
	TotalTargetTime int `gorm:"column:total_target_time"`
	TotalOvertime   int `gorm:"column:total_overtime"`
	TotalUndertime  int `gorm:"column:total_undertime"`
	TotalBreakTime  int `gorm:"column:total_break_time"`
	TotalDays       int `gorm:"column:total_days"`
	DaysWithErrors  int `gorm:"column:days_with_errors"`
}

// DailyValueRepository handles daily value data access.
type DailyValueRepository struct {
	db *DB
}

// NewDailyValueRepository creates a new daily value repository.
func NewDailyValueRepository(db *DB) *DailyValueRepository {
	return &DailyValueRepository{db: db}
}

// Create creates a new daily value.
func (r *DailyValueRepository) Create(ctx context.Context, dv *model.DailyValue) error {
	return r.db.GORM.WithContext(ctx).Create(dv).Error
}

// GetByID retrieves a daily value by ID.
func (r *DailyValueRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.DailyValue, error) {
	var dv model.DailyValue
	err := r.db.GORM.WithContext(ctx).
		First(&dv, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDailyValueNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get daily value: %w", err)
	}
	return &dv, nil
}

// Update updates a daily value.
func (r *DailyValueRepository) Update(ctx context.Context, dv *model.DailyValue) error {
	return r.db.GORM.WithContext(ctx).Save(dv).Error
}

// Delete deletes a daily value by ID.
func (r *DailyValueRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.DailyValue{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete daily value: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrDailyValueNotFound
	}
	return nil
}

// GetByEmployeeDate retrieves the daily value for an employee on a specific date.
// Returns nil, nil if no record exists for that date.
func (r *DailyValueRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
	var dv model.DailyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date = ?", employeeID, date).
		First(&dv).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get daily value: %w", err)
	}
	return &dv, nil
}

// GetByEmployeeDateRange retrieves all daily values for an employee within a date range.
func (r *DailyValueRepository) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
	var values []model.DailyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date >= ? AND value_date <= ?", employeeID, from, to).
		Order("value_date ASC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get daily values for range: %w", err)
	}
	return values, nil
}

// Upsert creates or updates a daily value based on employee_id + value_date.
func (r *DailyValueRepository) Upsert(ctx context.Context, dv *model.DailyValue) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "value_date"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"gross_time", "net_time", "target_time", "overtime", "undertime", "break_time",
				"has_error", "error_codes", "warnings",
				"first_come", "last_go", "booking_count",
				"calculated_at", "calculation_version", "updated_at",
			}),
		}).
		Create(dv).Error
}

// BulkUpsert creates or updates multiple daily values efficiently.
func (r *DailyValueRepository) BulkUpsert(ctx context.Context, values []model.DailyValue) error {
	if len(values) == 0 {
		return nil
	}
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "value_date"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"gross_time", "net_time", "target_time", "overtime", "undertime", "break_time",
				"has_error", "error_codes", "warnings",
				"first_come", "last_go", "booking_count",
				"calculated_at", "calculation_version", "updated_at",
			}),
		}).
		CreateInBatches(values, 100).Error
}

// GetWithErrors retrieves daily values with errors for a tenant within a date range.
// Results are preloaded with Employee relation.
func (r *DailyValueRepository) GetWithErrors(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
	var values []model.DailyValue
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Where("tenant_id = ? AND has_error = true AND value_date >= ? AND value_date <= ?", tenantID, from, to).
		Order("value_date DESC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get daily values with errors: %w", err)
	}
	return values, nil
}

// SumForMonth calculates aggregated totals for an employee for a specific month.
func (r *DailyValueRepository) SumForMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*DailyValueSum, error) {
	var sum DailyValueSum
	err := r.db.GORM.WithContext(ctx).
		Model(&model.DailyValue{}).
		Select(`
			COALESCE(SUM(gross_time), 0) as total_gross_time,
			COALESCE(SUM(net_time), 0) as total_net_time,
			COALESCE(SUM(target_time), 0) as total_target_time,
			COALESCE(SUM(overtime), 0) as total_overtime,
			COALESCE(SUM(undertime), 0) as total_undertime,
			COALESCE(SUM(break_time), 0) as total_break_time,
			COUNT(*) as total_days,
			COUNT(*) FILTER (WHERE has_error = true) as days_with_errors
		`).
		Where("employee_id = ? AND EXTRACT(YEAR FROM value_date) = ? AND EXTRACT(MONTH FROM value_date) = ?",
			employeeID, year, month).
		Scan(&sum).Error

	if err != nil {
		return nil, fmt.Errorf("failed to sum daily values for month: %w", err)
	}
	return &sum, nil
}

// DeleteRange deletes all daily values for an employee within a date range.
func (r *DailyValueRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date >= ? AND value_date <= ?", employeeID, from, to).
		Delete(&model.DailyValue{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete daily values: %w", result.Error)
	}
	return nil
}
```

### Success Criteria:

#### Automated Verification:
- [x] Code compiles: `cd apps/api && go build ./internal/repository/...`
- [x] No linting errors: `cd apps/api && golangci-lint run ./internal/repository/...`

---

## Phase 3: Create DailyValue Repository Tests

### Overview
Create comprehensive unit tests following established patterns.

### Changes Required:

#### 1. Create Test File
**File**: `apps/api/internal/repository/dailyvalue_test.go`

```go
package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForDV creates a tenant for use in daily value tests.
func createTestTenantForDV(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

// createTestEmployeeForDV creates an employee for daily value tests.
func createTestEmployeeForDV(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
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

func TestDailyValueRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		GrossTime:  480,
		NetTime:    450,
		TargetTime: 480,
		Overtime:   0,
		Undertime:  30,
		BreakTime:  30,
	}

	err := repo.Create(ctx, dv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, dv.ID)
}

func TestDailyValueRepository_Create_WithErrors(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		HasError:   true,
		ErrorCodes: pq.StringArray{"MISSING_COME", "MISSING_GO"},
		Warnings:   pq.StringArray{"LATE_ARRIVAL"},
	}

	err := repo.Create(ctx, dv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, dv.ID)

	// Verify arrays are stored correctly
	found, err := repo.GetByID(ctx, dv.ID)
	require.NoError(t, err)
	assert.True(t, found.HasError)
	assert.Len(t, found.ErrorCodes, 2)
	assert.Contains(t, found.ErrorCodes, "MISSING_COME")
	assert.Contains(t, found.ErrorCodes, "MISSING_GO")
	assert.Len(t, found.Warnings, 1)
	assert.Contains(t, found.Warnings, "LATE_ARRIVAL")
}

func TestDailyValueRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		GrossTime:  480,
		NetTime:    450,
	}
	require.NoError(t, repo.Create(ctx, dv))

	found, err := repo.GetByID(ctx, dv.ID)
	require.NoError(t, err)
	assert.Equal(t, dv.ID, found.ID)
	assert.Equal(t, 480, found.GrossTime)
	assert.Equal(t, 450, found.NetTime)
}

func TestDailyValueRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDailyValueNotFound)
}

func TestDailyValueRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		GrossTime:  480,
		NetTime:    450,
	}
	require.NoError(t, repo.Create(ctx, dv))

	dv.GrossTime = 510
	dv.NetTime = 480
	dv.Overtime = 30
	err := repo.Update(ctx, dv)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, dv.ID)
	require.NoError(t, err)
	assert.Equal(t, 510, found.GrossTime)
	assert.Equal(t, 480, found.NetTime)
	assert.Equal(t, 30, found.Overtime)
}

func TestDailyValueRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		GrossTime:  480,
	}
	require.NoError(t, repo.Create(ctx, dv))

	err := repo.Delete(ctx, dv.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, dv.ID)
	assert.ErrorIs(t, err, repository.ErrDailyValueNotFound)
}

func TestDailyValueRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDailyValueNotFound)
}

func TestDailyValueRepository_GetByEmployeeDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
	}
	require.NoError(t, repo.Create(ctx, dv))

	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, dv.ID, found.ID)
}

func TestDailyValueRepository_GetByEmployeeDate_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Should return nil, nil when not found
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestDailyValueRepository_GetByEmployeeDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create values for 5 days (-2 to +2)
	for i := -2; i <= 2; i++ {
		date := today.AddDate(0, 0, i)
		dv := &model.DailyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  date,
			GrossTime:  480 + i*10,
		}
		require.NoError(t, repo.Create(ctx, dv))
	}

	// Query for 3 days (-1 to +1)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)

	values, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, values, 3)

	// Verify ordering by date
	assert.True(t, values[0].ValueDate.Before(values[1].ValueDate))
	assert.True(t, values[1].ValueDate.Before(values[2].ValueDate))
}

func TestDailyValueRepository_GetByEmployeeDateRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)

	values, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Empty(t, values)
}

func TestDailyValueRepository_Upsert_Insert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
		NetTime:    450,
	}

	err := repo.Upsert(ctx, dv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, dv.ID)

	// Verify created
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, 480, found.GrossTime)
}

func TestDailyValueRepository_Upsert_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// First upsert (insert)
	dv1 := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
		NetTime:    450,
	}
	require.NoError(t, repo.Upsert(ctx, dv1))
	originalID := dv1.ID

	// Second upsert (update) with same employee+date
	dv2 := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  510,
		NetTime:    480,
		Overtime:   30,
	}
	require.NoError(t, repo.Upsert(ctx, dv2))

	// Verify the original record was updated (not a new one created)
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, originalID, found.ID)
	assert.Equal(t, 510, found.GrossTime)
	assert.Equal(t, 480, found.NetTime)
	assert.Equal(t, 30, found.Overtime)
}

func TestDailyValueRepository_BulkUpsert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create 10 daily values
	var values []model.DailyValue
	for i := range 10 {
		values = append(values, model.DailyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  today.AddDate(0, 0, i),
			GrossTime:  480 + i*10,
		})
	}

	err := repo.BulkUpsert(ctx, values)
	require.NoError(t, err)

	// Verify all created
	from := today
	to := today.AddDate(0, 0, 9)
	found, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, found, 10)
}

func TestDailyValueRepository_BulkUpsert_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	// Should not error with empty slice
	err := repo.BulkUpsert(ctx, []model.DailyValue{})
	require.NoError(t, err)
}

func TestDailyValueRepository_BulkUpsert_UpdateExisting(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create initial record
	initial := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
	}
	require.NoError(t, repo.Create(ctx, initial))

	// Bulk upsert with overlap - should update existing
	values := []model.DailyValue{
		{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  today, // Overlaps with existing
			GrossTime:  510,
			Overtime:   30,
		},
		{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  today.AddDate(0, 0, 1), // New
			GrossTime:  480,
		},
	}

	err := repo.BulkUpsert(ctx, values)
	require.NoError(t, err)

	// Verify existing was updated
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, 510, found.GrossTime)
	assert.Equal(t, 30, found.Overtime)

	// Verify new was created
	found2, err := repo.GetByEmployeeDate(ctx, emp.ID, today.AddDate(0, 0, 1))
	require.NoError(t, err)
	require.NotNil(t, found2)
}

func TestDailyValueRepository_GetWithErrors(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create values with and without errors
	noError := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
		HasError:   false,
	}
	require.NoError(t, repo.Create(ctx, noError))

	withError := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today.AddDate(0, 0, 1),
		HasError:   true,
		ErrorCodes: pq.StringArray{"MISSING_GO"},
	}
	require.NoError(t, repo.Create(ctx, withError))

	// Query only errors
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 2)
	values, err := repo.GetWithErrors(ctx, tenant.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, values, 1)
	assert.True(t, values[0].HasError)
	assert.NotNil(t, values[0].Employee) // Verify preload
}

func TestDailyValueRepository_GetWithErrors_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create value without error
	noError := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
		HasError:   false,
	}
	require.NoError(t, repo.Create(ctx, noError))

	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)
	values, err := repo.GetWithErrors(ctx, tenant.ID, from, to)
	require.NoError(t, err)
	assert.Empty(t, values)
}

func TestDailyValueRepository_SumForMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	// Use a fixed date to ensure all days are in the same month
	baseDate := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)

	// Create 5 daily values in the same month
	for i := range 5 {
		dv := &model.DailyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  baseDate.AddDate(0, 0, i),
			GrossTime:  480,
			NetTime:    450,
			TargetTime: 480,
			Overtime:   0,
			Undertime:  30,
			BreakTime:  30,
			HasError:   i == 0 || i == 1, // 2 days with errors
		}
		require.NoError(t, repo.Create(ctx, dv))
	}

	sum, err := repo.SumForMonth(ctx, emp.ID, 2026, 1)
	require.NoError(t, err)
	require.NotNil(t, sum)

	assert.Equal(t, 2400, sum.TotalGrossTime)  // 480 * 5
	assert.Equal(t, 2250, sum.TotalNetTime)    // 450 * 5
	assert.Equal(t, 2400, sum.TotalTargetTime) // 480 * 5
	assert.Equal(t, 0, sum.TotalOvertime)
	assert.Equal(t, 150, sum.TotalUndertime) // 30 * 5
	assert.Equal(t, 150, sum.TotalBreakTime) // 30 * 5
	assert.Equal(t, 5, sum.TotalDays)
	assert.Equal(t, 2, sum.DaysWithErrors)
}

func TestDailyValueRepository_SumForMonth_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	sum, err := repo.SumForMonth(ctx, emp.ID, 2026, 1)
	require.NoError(t, err)
	require.NotNil(t, sum)

	// All values should be 0
	assert.Equal(t, 0, sum.TotalGrossTime)
	assert.Equal(t, 0, sum.TotalDays)
	assert.Equal(t, 0, sum.DaysWithErrors)
}

func TestDailyValueRepository_DeleteRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create values for 5 days (-2 to +2)
	for i := -2; i <= 2; i++ {
		date := today.AddDate(0, 0, i)
		dv := &model.DailyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  date,
			GrossTime:  480,
		}
		require.NoError(t, repo.Create(ctx, dv))
	}

	// Delete range (-1 to +1)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)
	err := repo.DeleteRange(ctx, emp.ID, from, to)
	require.NoError(t, err)

	// Verify only 2 remain (day -2 and day +2)
	allValues, err := repo.GetByEmployeeDateRange(ctx, emp.ID, today.AddDate(0, 0, -2), today.AddDate(0, 0, 2))
	require.NoError(t, err)
	assert.Len(t, allValues, 2)

	// Verify the correct ones remain
	for _, value := range allValues {
		dayDiff := int(value.ValueDate.Sub(today).Hours() / 24)
		assert.True(t, dayDiff == -2 || dayDiff == 2)
	}
}

func TestDailyValueRepository_DeleteRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Should not error when nothing to delete
	err := repo.DeleteRange(ctx, emp.ID, today, today.AddDate(0, 0, 7))
	require.NoError(t, err)
}

func TestDailyValueRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create first record
	dv1 := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
	}
	require.NoError(t, repo.Create(ctx, dv1))

	// Try to create duplicate - should fail due to unique constraint
	dv2 := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today, // Same date
		GrossTime:  510,
	}
	err := repo.Create(ctx, dv2)
	assert.Error(t, err)
}

func TestDailyValue_Balance(t *testing.T) {
	dv := &model.DailyValue{
		Overtime:  60,
		Undertime: 0,
	}
	assert.Equal(t, 60, dv.Balance())

	dv.Overtime = 0
	dv.Undertime = 30
	assert.Equal(t, -30, dv.Balance())
}

func TestDailyValue_FormatMethods(t *testing.T) {
	dv := &model.DailyValue{
		GrossTime:  510, // 8:30
		NetTime:    480, // 8:00
		TargetTime: 480, // 8:00
		Overtime:   30,
		Undertime:  0,
	}

	assert.Equal(t, "08:30", dv.FormatGrossTime())
	assert.Equal(t, "08:00", dv.FormatNetTime())
	assert.Equal(t, "08:00", dv.FormatTargetTime())
	assert.Equal(t, "00:30", dv.FormatBalance())

	// Test negative balance
	dv.Overtime = 0
	dv.Undertime = 30
	assert.Equal(t, "-00:30", dv.FormatBalance())
}

func TestDailyValue_HasBookings(t *testing.T) {
	dv := &model.DailyValue{
		BookingCount: 0,
	}
	assert.False(t, dv.HasBookings())

	dv.BookingCount = 4
	assert.True(t, dv.HasBookings())
}
```

### Success Criteria:

#### Automated Verification:
- [x] All tests pass: `cd apps/api && go test -v -run DailyValue ./internal/repository/...`
- [x] Code compiles: `cd apps/api && go build ./...`
- [x] No linting errors: `cd apps/api && golangci-lint run ./...`

---

## Testing Strategy

### Unit Tests:
- CRUD operations (Create, GetByID, Update, Delete)
- Date-based queries (GetByEmployeeDate, GetByEmployeeDateRange)
- Upsert behavior (insert and update cases)
- Bulk operations (BulkUpsert with empty, new, and overlapping records)
- Error filtering (GetWithErrors with preloaded Employee)
- Monthly aggregation (SumForMonth with various scenarios)
- Unique constraint violation
- Model helper methods (Balance, Format*, HasBookings)

### Edge Cases:
- Empty results (not found returns nil, nil)
- Empty slices (BulkUpsert, DeleteRange)
- pq.StringArray storage and retrieval
- Negative balance formatting

## Performance Considerations

- Indexes on tenant_id, employee_id, value_date are already in migration
- Composite index on (employee_id, value_date) for lookup queries
- Partial index on has_error = true for error filtering
- BulkUpsert uses batches of 100 records

## References

- Original research: `thoughts/shared/research/2026-01-18-TICKET-058-create-daily-value-model-repository.md`
- Migration: `db/migrations/000024_create_daily_values.up.sql`
- Pattern reference: `apps/api/internal/model/booking.go`, `apps/api/internal/repository/booking.go`
- Pattern reference: `apps/api/internal/model/employeedayplan.go`, `apps/api/internal/repository/employeedayplan.go`
