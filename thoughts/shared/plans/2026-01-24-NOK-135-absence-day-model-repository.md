# NOK-135: AbsenceDay Model + Repository Implementation Plan

## Overview

Create the AbsenceDay model and repository, building on the absence_days migration (`000026_create_absence_days`). The model tracks employee absence records per date with approval workflow, half-day support, and links to AbsenceType for credit calculation. Implementation follows the established struct-based repository pattern.

## Current State Analysis

- **Migration exists**: `db/migrations/000026_create_absence_days.up.sql` creates the table with FK constraints and unique partial index
- **AbsenceType model exists**: `apps/api/internal/model/absencetype.go` provides `CreditMultiplier()` used in credit calculation
- **AbsenceType repository exists**: `apps/api/internal/repository/absencetype.go` for creating test fixtures
- **No AbsenceDay model or repository yet**

### Key Discoveries:
- Models use inline ID/CreatedAt/UpdatedAt fields, not `BaseModel` embedding (`model/booking.go`)
- Repositories are struct-based with `*DB` dependency (`repository/absencetype.go:17-18`)
- DB access via `r.db.GORM.WithContext(ctx)` (`repository/dailyvalue.go:44`)
- Range queries use `WHERE employee_id = ? AND date >= ? AND date <= ?` with `ORDER BY date ASC` (`repository/dailyvalue.go:99-102`)
- DeleteRange does NOT check RowsAffected (deleting 0 is fine) (`repository/dailyvalue.go:186-194`)
- GetByEmployeeDate returns `nil, nil` when not found (`repository/dailyvalue.go:87-88`)
- CreateInBatches pattern: empty slice guard, then `CreateInBatches(values, 100)` (`repository/dailyvalue.go:127-141`)
- Preload pattern: `Preload("RelationName")` before query (`repository/dailyvalue.go:148`)
- Decimal fields use `github.com/shopspring/decimal` with `gorm:"type:decimal(3,2)"` tag (`model/employee.go`)
- Tests use external package `repository_test` with `testutil.SetupTestDB(t)` (`repository/dailyvalue_test.go:1`)
- Test helpers create real FK dependencies (Tenant, Employee) via other repositories

## Desired End State

Three new files exist, all tests pass, and the AbsenceDay model correctly maps to the `absence_days` DB schema with CalculateCredit method and half-day support.

### Verification:
- `cd apps/api && go build ./...` succeeds
- `cd apps/api && go test -v ./internal/repository/ -run TestAbsenceDay` passes all tests
- `make lint` passes

## What We're NOT Doing

- No handler/service layer (separate ticket)
- No OpenAPI-to-internal model mapping (handler layer responsibility)
- No migration changes (already exists as 000026)
- No interface definition (codebase uses structs)
- No vacation account tracking (separate ticket NOK-136)

## Implementation Approach

Three phases: model -> repository -> tests. The model must be defined before the repository references it, and both must exist before tests can compile.

---

## Phase 1: AbsenceDay Model

**File**: `apps/api/internal/model/absenceday.go`

### Changes Required:

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// AbsenceStatus represents the approval status of an absence day.
type AbsenceStatus string

const (
	AbsenceStatusPending   AbsenceStatus = "pending"
	AbsenceStatusApproved  AbsenceStatus = "approved"
	AbsenceStatusRejected  AbsenceStatus = "rejected"
	AbsenceStatusCancelled AbsenceStatus = "cancelled"
)

// HalfDayPeriod represents which half of the day an absence covers.
type HalfDayPeriod string

const (
	HalfDayPeriodMorning   HalfDayPeriod = "morning"
	HalfDayPeriodAfternoon HalfDayPeriod = "afternoon"
)

// AbsenceDay represents an employee absence record for a specific date.
type AbsenceDay struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	CreatedAt  time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time `gorm:"default:now()" json:"updated_at"`

	// The date and type of absence
	AbsenceDate   time.Time `gorm:"type:date;not null" json:"absence_date"`
	AbsenceTypeID uuid.UUID `gorm:"type:uuid;not null" json:"absence_type_id"`

	// Duration: 1.00 = full day, 0.50 = half day
	Duration decimal.Decimal `gorm:"type:decimal(3,2);not null;default:1.00" json:"duration"`

	// Half day specification (when duration = 0.5)
	HalfDayPeriod *HalfDayPeriod `gorm:"type:varchar(10)" json:"half_day_period,omitempty"`

	// Approval workflow
	Status          AbsenceStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	ApprovedBy      *uuid.UUID    `gorm:"type:uuid" json:"approved_by,omitempty"`
	ApprovedAt      *time.Time    `gorm:"type:timestamptz" json:"approved_at,omitempty"`
	RejectionReason *string       `gorm:"type:text" json:"rejection_reason,omitempty"`

	// Optional notes
	Notes *string `gorm:"type:text" json:"notes,omitempty"`

	// Audit
	CreatedBy *uuid.UUID `gorm:"type:uuid" json:"created_by,omitempty"`

	// Relations
	Employee    *Employee    `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	AbsenceType *AbsenceType `gorm:"foreignKey:AbsenceTypeID" json:"absence_type,omitempty"`
}

func (AbsenceDay) TableName() string {
	return "absence_days"
}

// IsFullDay returns true if this is a full day absence.
func (ad *AbsenceDay) IsFullDay() bool {
	return ad.Duration.Equal(decimal.NewFromInt(1))
}

// IsHalfDay returns true if this is a half day absence.
func (ad *AbsenceDay) IsHalfDay() bool {
	return ad.Duration.Equal(decimal.NewFromFloat(0.5))
}

// IsApproved returns true if the absence has been approved.
func (ad *AbsenceDay) IsApproved() bool {
	return ad.Status == AbsenceStatusApproved
}

// IsCancelled returns true if the absence has been cancelled.
func (ad *AbsenceDay) IsCancelled() bool {
	return ad.Status == AbsenceStatusCancelled
}

// CalculateCredit computes the time credit for this absence day.
// Formula: regelarbeitszeit * absenceType.CreditMultiplier() * duration
// Requires AbsenceType relation to be preloaded.
// Returns 0 if AbsenceType is not loaded.
func (ad *AbsenceDay) CalculateCredit(regelarbeitszeit int) int {
	if ad.AbsenceType == nil {
		return 0
	}
	multiplier := ad.AbsenceType.CreditMultiplier()
	duration := ad.Duration.InexactFloat64()
	return int(float64(regelarbeitszeit) * multiplier * duration)
}
```

### Phase 1 Verification:
```bash
cd apps/api && go build ./internal/model/
```

---

## Phase 2: AbsenceDay Repository

**File**: `apps/api/internal/repository/absenceday.go`

### Changes Required:

```go
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAbsenceDayNotFound = errors.New("absence day not found")

// AbsenceDayRepository handles absence day data access.
type AbsenceDayRepository struct {
	db *DB
}

// NewAbsenceDayRepository creates a new absence day repository.
func NewAbsenceDayRepository(db *DB) *AbsenceDayRepository {
	return &AbsenceDayRepository{db: db}
}

// Create creates a new absence day.
func (r *AbsenceDayRepository) Create(ctx context.Context, ad *model.AbsenceDay) error {
	return r.db.GORM.WithContext(ctx).Create(ad).Error
}

// CreateRange creates multiple absence days in a batch.
func (r *AbsenceDayRepository) CreateRange(ctx context.Context, days []model.AbsenceDay) error {
	if len(days) == 0 {
		return nil
	}
	return r.db.GORM.WithContext(ctx).CreateInBatches(days, 100).Error
}

// GetByID retrieves an absence day by ID with AbsenceType preloaded.
func (r *AbsenceDayRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	var ad model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		First(&ad, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceDayNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence day: %w", err)
	}
	return &ad, nil
}

// GetByEmployeeDate retrieves the absence day for an employee on a specific date.
// Returns nil, nil if no record exists (not an error - checking for absences is normal).
// Only returns non-cancelled absences (matching the unique constraint).
func (r *AbsenceDayRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
	var ad model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ? AND absence_date = ? AND status != ?", employeeID, date, model.AbsenceStatusCancelled).
		First(&ad).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence day: %w", err)
	}
	return &ad, nil
}

// GetByEmployeeDateRange retrieves all absence days for an employee within a date range.
// Returns all statuses (for UI display). Use CountByTypeInRange for calculation-only queries.
func (r *AbsenceDayRepository) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	var days []model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ? AND absence_date >= ? AND absence_date <= ?", employeeID, from, to).
		Order("absence_date ASC").
		Find(&days).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get absence days for range: %w", err)
	}
	return days, nil
}

// Update updates an absence day.
func (r *AbsenceDayRepository) Update(ctx context.Context, ad *model.AbsenceDay) error {
	return r.db.GORM.WithContext(ctx).Save(ad).Error
}

// Delete deletes an absence day by ID.
func (r *AbsenceDayRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AbsenceDay{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete absence day: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAbsenceDayNotFound
	}
	return nil
}

// DeleteRange deletes all absence days for an employee within a date range.
func (r *AbsenceDayRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND absence_date >= ? AND absence_date <= ?", employeeID, from, to).
		Delete(&model.AbsenceDay{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete absence days: %w", result.Error)
	}
	return nil
}

// CountByTypeInRange sums the duration of approved absences for an employee
// of a specific type within a date range. Returns decimal (e.g. 1.5 for full + half day).
// Only counts status = 'approved'.
func (r *AbsenceDayRepository) CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error) {
	var result decimal.Decimal
	err := r.db.GORM.WithContext(ctx).
		Model(&model.AbsenceDay{}).
		Select("COALESCE(SUM(duration), 0)").
		Where("employee_id = ? AND absence_type_id = ? AND absence_date >= ? AND absence_date <= ? AND status = ?",
			employeeID, typeID, from, to, model.AbsenceStatusApproved).
		Scan(&result).Error

	if err != nil {
		return decimal.Zero, fmt.Errorf("failed to count absence days by type: %w", err)
	}
	return result, nil
}
```

### Phase 2 Verification:
```bash
cd apps/api && go build ./internal/repository/
```

---

## Phase 3: Repository Tests

**File**: `apps/api/internal/repository/absenceday_test.go`

### Changes Required:

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

func createTestTenantForAbsenceDay(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestEmployeeForAbsenceDay(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
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

func createTestAbsenceTypeForAbsenceDay(t *testing.T, db *repository.DB, tenantID *uuid.UUID, code string) *model.AbsenceType {
	t.Helper()
	repo := repository.NewAbsenceTypeRepository(db)
	at := &model.AbsenceType{
		TenantID: tenantID,
		Code:     code,
		Name:     "Test " + code,
		Category: model.AbsenceCategoryVacation,
		Portion:  model.AbsencePortionFull,
		IsActive: true,
	}
	require.NoError(t, repo.Create(context.Background(), at))
	return at
}

// --- Repository Tests ---

func TestAbsenceDayRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	err := repo.Create(ctx, ad)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, ad.ID)
}

func TestAbsenceDayRepository_Create_HalfDay(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	period := model.HalfDayPeriodMorning
	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromFloat(0.5),
		HalfDayPeriod: &period,
		Status:        model.AbsenceStatusPending,
	}

	err := repo.Create(ctx, ad)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, ad.ID)

	// Verify half day fields stored correctly
	found, err := repo.GetByID(ctx, ad.ID)
	require.NoError(t, err)
	assert.True(t, found.Duration.Equal(decimal.NewFromFloat(0.5)))
	require.NotNil(t, found.HalfDayPeriod)
	assert.Equal(t, model.HalfDayPeriodMorning, *found.HalfDayPeriod)
}

func TestAbsenceDayRepository_CreateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	var days []model.AbsenceDay
	baseDate := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	for i := range 5 {
		days = append(days, model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: absType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		})
	}

	err := repo.CreateRange(ctx, days)
	require.NoError(t, err)

	// Verify all created
	found, err := repo.GetByEmployeeDateRange(ctx, emp.ID, baseDate, baseDate.AddDate(0, 0, 4))
	require.NoError(t, err)
	assert.Len(t, found, 5)
}

func TestAbsenceDayRepository_CreateRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	err := repo.CreateRange(ctx, []model.AbsenceDay{})
	require.NoError(t, err)
}

func TestAbsenceDayRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "K"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, ad))

	found, err := repo.GetByID(ctx, ad.ID)
	require.NoError(t, err)
	assert.Equal(t, ad.ID, found.ID)
	assert.Equal(t, model.AbsenceStatusApproved, found.Status)
	// Verify AbsenceType is preloaded
	require.NotNil(t, found.AbsenceType)
	assert.Equal(t, absType.ID, found.AbsenceType.ID)
}

func TestAbsenceDayRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAbsenceDayNotFound)
}

func TestAbsenceDayRepository_GetByEmployeeDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)
	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, ad))

	found, err := repo.GetByEmployeeDate(ctx, emp.ID, date)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, ad.ID, found.ID)
	// Verify AbsenceType is preloaded
	require.NotNil(t, found.AbsenceType)
}

func TestAbsenceDayRepository_GetByEmployeeDate_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)

	date := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)

	// Should return nil, nil when not found
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, date)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestAbsenceDayRepository_GetByEmployeeDate_IgnoresCancelled(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	date := time.Date(2026, 1, 25, 0, 0, 0, 0, time.UTC)

	// Create a cancelled absence
	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusCancelled,
	}
	require.NoError(t, repo.Create(ctx, ad))

	// Should not find the cancelled absence
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, date)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestAbsenceDayRepository_GetByEmployeeDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	baseDate := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)

	// Create absences for 5 consecutive days
	for i := range 5 {
		ad := &model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: absType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		}
		require.NoError(t, repo.Create(ctx, ad))
	}

	// Query for 3 days (day 1-3)
	from := baseDate.AddDate(0, 0, 1)
	to := baseDate.AddDate(0, 0, 3)
	days, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, days, 3)

	// Verify ordering by date ASC
	assert.True(t, days[0].AbsenceDate.Before(days[1].AbsenceDate))
	assert.True(t, days[1].AbsenceDate.Before(days[2].AbsenceDate))

	// Verify AbsenceType is preloaded
	for _, d := range days {
		require.NotNil(t, d.AbsenceType)
	}
}

func TestAbsenceDayRepository_GetByEmployeeDateRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)

	from := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 4, 30, 0, 0, 0, 0, time.UTC)

	days, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Empty(t, days)
}

func TestAbsenceDayRepository_GetByEmployeeDateRange_IncludesAllStatuses(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	baseDate := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	statuses := []model.AbsenceStatus{
		model.AbsenceStatusPending,
		model.AbsenceStatusApproved,
		model.AbsenceStatusRejected,
		model.AbsenceStatusCancelled,
	}

	for i, status := range statuses {
		ad := &model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: absType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        status,
		}
		require.NoError(t, repo.Create(ctx, ad))
	}

	days, err := repo.GetByEmployeeDateRange(ctx, emp.ID, baseDate, baseDate.AddDate(0, 0, 3))
	require.NoError(t, err)
	assert.Len(t, days, 4) // All statuses included
}

func TestAbsenceDayRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	require.NoError(t, repo.Create(ctx, ad))

	// Approve the absence
	now := time.Now()
	approverID := uuid.New()
	ad.Status = model.AbsenceStatusApproved
	ad.ApprovedBy = &approverID
	ad.ApprovedAt = &now
	err := repo.Update(ctx, ad)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, ad.ID)
	require.NoError(t, err)
	assert.Equal(t, model.AbsenceStatusApproved, found.Status)
	require.NotNil(t, found.ApprovedBy)
	assert.Equal(t, approverID, *found.ApprovedBy)
	require.NotNil(t, found.ApprovedAt)
}

func TestAbsenceDayRepository_Update_Rejection(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	require.NoError(t, repo.Create(ctx, ad))

	// Reject the absence
	reason := "Insufficient staff coverage"
	ad.Status = model.AbsenceStatusRejected
	ad.RejectionReason = &reason
	err := repo.Update(ctx, ad)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, ad.ID)
	require.NoError(t, err)
	assert.Equal(t, model.AbsenceStatusRejected, found.Status)
	require.NotNil(t, found.RejectionReason)
	assert.Equal(t, "Insufficient staff coverage", *found.RejectionReason)
}

func TestAbsenceDayRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	require.NoError(t, repo.Create(ctx, ad))

	err := repo.Delete(ctx, ad.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, ad.ID)
	assert.ErrorIs(t, err, repository.ErrAbsenceDayNotFound)
}

func TestAbsenceDayRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAbsenceDayNotFound)
}

func TestAbsenceDayRepository_DeleteRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	baseDate := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	// Create absences for 5 days
	for i := range 5 {
		ad := &model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: absType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		}
		require.NoError(t, repo.Create(ctx, ad))
	}

	// Delete days 1-3 (inclusive)
	from := baseDate.AddDate(0, 0, 1)
	to := baseDate.AddDate(0, 0, 3)
	err := repo.DeleteRange(ctx, emp.ID, from, to)
	require.NoError(t, err)

	// Verify only 2 remain (day 0 and day 4)
	remaining, err := repo.GetByEmployeeDateRange(ctx, emp.ID, baseDate, baseDate.AddDate(0, 0, 4))
	require.NoError(t, err)
	assert.Len(t, remaining, 2)
}

func TestAbsenceDayRepository_DeleteRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)

	// Should not error when nothing to delete
	from := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC)
	err := repo.DeleteRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
}

func TestAbsenceDayRepository_CountByTypeInRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	vacationType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])
	illnessType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "K"+uuid.New().String()[:4])

	baseDate := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	// Create 3 approved vacation days (2 full + 1 half = 2.5)
	for i := range 2 {
		ad := &model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: vacationType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		}
		require.NoError(t, repo.Create(ctx, ad))
	}
	halfDay := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   baseDate.AddDate(0, 0, 2),
		AbsenceTypeID: vacationType.ID,
		Duration:      decimal.NewFromFloat(0.5),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, halfDay))

	// Create 1 pending vacation day (should NOT be counted)
	pendingDay := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   baseDate.AddDate(0, 0, 3),
		AbsenceTypeID: vacationType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	require.NoError(t, repo.Create(ctx, pendingDay))

	// Create 1 illness day (different type, should NOT be counted)
	illnessDay := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   baseDate.AddDate(0, 0, 4),
		AbsenceTypeID: illnessType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, illnessDay))

	// Count vacation days in range
	from := baseDate
	to := baseDate.AddDate(0, 0, 10)
	count, err := repo.CountByTypeInRange(ctx, emp.ID, vacationType.ID, from, to)
	require.NoError(t, err)
	assert.True(t, count.Equal(decimal.NewFromFloat(2.5)), "expected 2.5, got %s", count.String())
}

func TestAbsenceDayRepository_CountByTypeInRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	from := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC)

	count, err := repo.CountByTypeInRange(ctx, emp.ID, absType.ID, from, to)
	require.NoError(t, err)
	assert.True(t, count.Equal(decimal.Zero))
}

func TestAbsenceDayRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	date := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)

	// Create first non-cancelled absence
	ad1 := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, ad1))

	// Second non-cancelled absence on same date should fail (unique constraint)
	ad2 := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	err := repo.Create(ctx, ad2)
	assert.Error(t, err)
}

func TestAbsenceDayRepository_UniqueConstraint_CancelledAllowed(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	date := time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC)

	// Create a cancelled absence
	cancelled := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusCancelled,
	}
	require.NoError(t, repo.Create(ctx, cancelled))

	// New non-cancelled absence on same date should succeed
	active := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	err := repo.Create(ctx, active)
	require.NoError(t, err)
}

// --- Model Unit Tests (no DB) ---

func TestAbsenceDay_IsFullDay(t *testing.T) {
	ad := &model.AbsenceDay{Duration: decimal.NewFromInt(1)}
	assert.True(t, ad.IsFullDay())

	ad.Duration = decimal.NewFromFloat(0.5)
	assert.False(t, ad.IsFullDay())
}

func TestAbsenceDay_IsHalfDay(t *testing.T) {
	ad := &model.AbsenceDay{Duration: decimal.NewFromFloat(0.5)}
	assert.True(t, ad.IsHalfDay())

	ad.Duration = decimal.NewFromInt(1)
	assert.False(t, ad.IsHalfDay())
}

func TestAbsenceDay_IsApproved(t *testing.T) {
	ad := &model.AbsenceDay{Status: model.AbsenceStatusApproved}
	assert.True(t, ad.IsApproved())

	ad.Status = model.AbsenceStatusPending
	assert.False(t, ad.IsApproved())
}

func TestAbsenceDay_IsCancelled(t *testing.T) {
	ad := &model.AbsenceDay{Status: model.AbsenceStatusCancelled}
	assert.True(t, ad.IsCancelled())

	ad.Status = model.AbsenceStatusApproved
	assert.False(t, ad.IsCancelled())
}

func TestAbsenceDay_CalculateCredit(t *testing.T) {
	tests := []struct {
		name             string
		portion          model.AbsencePortion
		duration         decimal.Decimal
		regelarbeitszeit int
		expected         int
	}{
		{"full day, full portion, 8h", model.AbsencePortionFull, decimal.NewFromInt(1), 480, 480},
		{"half day, full portion, 8h", model.AbsencePortionFull, decimal.NewFromFloat(0.5), 480, 240},
		{"full day, half portion, 8h", model.AbsencePortionHalf, decimal.NewFromInt(1), 480, 240},
		{"half day, half portion, 8h", model.AbsencePortionHalf, decimal.NewFromFloat(0.5), 480, 120},
		{"full day, no portion, 8h", model.AbsencePortionNone, decimal.NewFromInt(1), 480, 0},
		{"full day, full portion, 7.5h", model.AbsencePortionFull, decimal.NewFromInt(1), 450, 450},
		{"half day, full portion, 7.5h", model.AbsencePortionFull, decimal.NewFromFloat(0.5), 450, 225},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ad := &model.AbsenceDay{
				Duration:    tt.duration,
				AbsenceType: &model.AbsenceType{Portion: tt.portion},
			}
			assert.Equal(t, tt.expected, ad.CalculateCredit(tt.regelarbeitszeit))
		})
	}
}

func TestAbsenceDay_CalculateCredit_NilAbsenceType(t *testing.T) {
	ad := &model.AbsenceDay{
		Duration:    decimal.NewFromInt(1),
		AbsenceType: nil,
	}
	assert.Equal(t, 0, ad.CalculateCredit(480))
}
```

### Phase 3 Verification:
```bash
cd apps/api && go test -v ./internal/repository/ -run TestAbsenceDay
```

---

## Testing Strategy

### Unit Tests (no DB):
- `IsFullDay()` / `IsHalfDay()` duration checks
- `IsApproved()` / `IsCancelled()` status checks
- `CalculateCredit()` with various portion/duration combinations
- `CalculateCredit()` with nil AbsenceType (guard check)

### Integration Tests (with DB):
- CRUD operations (Create, GetByID, Update, Delete)
- Half-day creation with HalfDayPeriod field
- `CreateRange` batch creation and empty-slice guard
- `GetByEmployeeDate` returns nil,nil when not found
- `GetByEmployeeDate` ignores cancelled absences
- `GetByEmployeeDateRange` ordering and AbsenceType preload
- `GetByEmployeeDateRange` includes all statuses (for UI display)
- `DeleteRange` partial deletion and empty-range safety
- `CountByTypeInRange` sums only approved absences of correct type
- `CountByTypeInRange` returns zero for empty results
- Unique constraint: two non-cancelled absences on same date fails
- Unique constraint: cancelled + active on same date succeeds

## Final Verification

```bash
cd apps/api && go build ./...
cd apps/api && go test -v ./internal/repository/ -run TestAbsenceDay
cd apps/api && golangci-lint run ./...
```

## References

- Research: `thoughts/shared/research/2026-01-24-NOK-135-absence-day-model-repository.md`
- Migration: `db/migrations/000026_create_absence_days.up.sql`
- Related model: `apps/api/internal/model/absencetype.go`
- Reference repository: `apps/api/internal/repository/dailyvalue.go` (range queries, DeleteRange, bulk ops)
- Reference tests: `apps/api/internal/repository/dailyvalue_test.go`
- ZMI calculation manual: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (page 160, credit calculation)
