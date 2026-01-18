# TICKET-047: Create Tariff Model + Repository

**Type**: Model/Repository
**Effort**: M
**Sprint**: 8 - Tariffs
**Dependencies**: TICKET-046

## Description

Create the Tariff model with relationships and repository.

## Files to Create

- `apps/api/internal/model/tariff.go`
- `apps/api/internal/repository/tariff.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type TariffType string

const (
    TariffTypeWeek   TariffType = "week"
    TariffTypeRolling TariffType = "rolling"
    TariffTypeRhythm TariffType = "rhythm"
)

type Tariff struct {
    ID          uuid.UUID   `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID   `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID  uuid.UUID   `gorm:"type:uuid;not null;index" json:"employee_id"`
    ValidFrom   time.Time   `gorm:"type:date;not null" json:"valid_from"`
    ValidTo     *time.Time  `gorm:"type:date" json:"valid_to,omitempty"`
    TariffType  TariffType  `gorm:"type:varchar(20);not null" json:"tariff_type"`
    WeekPlanID  *uuid.UUID  `gorm:"type:uuid" json:"week_plan_id,omitempty"`
    RhythmDays  *int        `gorm:"type:int" json:"rhythm_days,omitempty"`
    IsCurrent   bool        `gorm:"default:false" json:"is_current"`
    CreatedAt   time.Time   `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time   `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee       `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
    WeekPlan *WeekPlan       `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
    DayPlans []TariffDayPlan `gorm:"foreignKey:TariffID" json:"day_plans,omitempty"`
}

func (Tariff) TableName() string {
    return "tariffs"
}

// IsValidOnDate returns true if tariff is valid on given date
func (t *Tariff) IsValidOnDate(date time.Time) bool {
    if date.Before(t.ValidFrom) {
        return false
    }
    if t.ValidTo != nil && date.After(*t.ValidTo) {
        return false
    }
    return true
}

type TariffDayPlan struct {
    TariffID  uuid.UUID  `gorm:"type:uuid;primaryKey" json:"tariff_id"`
    DayIndex  int        `gorm:"primaryKey" json:"day_index"`
    DayPlanID *uuid.UUID `gorm:"type:uuid" json:"day_plan_id,omitempty"`

    // Relations
    DayPlan *DayPlan `gorm:"foreignKey:DayPlanID" json:"day_plan,omitempty"`
}

func (TariffDayPlan) TableName() string {
    return "tariff_day_plans"
}
```

### Repository

```go
type TariffRepository interface {
    Create(ctx context.Context, tariff *model.Tariff) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
    GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
    Update(ctx context.Context, tariff *model.Tariff) error
    Delete(ctx context.Context, id uuid.UUID) error

    // Employee-specific queries
    GetCurrentForEmployee(ctx context.Context, employeeID uuid.UUID) (*model.Tariff, error)
    GetForEmployeeOnDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.Tariff, error)
    ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.Tariff, error)

    // Day plan resolution
    SetDayPlans(ctx context.Context, tariffID uuid.UUID, dayPlans []model.TariffDayPlan) error
}

func (r *tariffRepository) GetCurrentForEmployee(ctx context.Context, employeeID uuid.UUID) (*model.Tariff, error) {
    var tariff model.Tariff
    err := r.db.WithContext(ctx).
        Preload("WeekPlan").
        Preload("DayPlans").
        Preload("DayPlans.DayPlan").
        Where("employee_id = ? AND is_current = true", employeeID).
        First(&tariff).Error
    return &tariff, err
}

func (r *tariffRepository) GetForEmployeeOnDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.Tariff, error) {
    var tariff model.Tariff
    err := r.db.WithContext(ctx).
        Where("employee_id = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)",
            employeeID, date, date).
        Order("valid_from DESC").
        First(&tariff).Error
    return &tariff, err
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

	"terp/apps/api/internal/model"
)

type TariffRepository interface {
	Create(ctx context.Context, tariff *model.Tariff) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
	Update(ctx context.Context, tariff *model.Tariff) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetCurrentForEmployee(ctx context.Context, employeeID uuid.UUID) (*model.Tariff, error)
	GetForEmployeeOnDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.Tariff, error)
	ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.Tariff, error)
	SetDayPlans(ctx context.Context, tariffID uuid.UUID, dayPlans []model.TariffDayPlan) error
}

type tariffRepository struct {
	db *gorm.DB
}

func NewTariffRepository(db *gorm.DB) TariffRepository {
	return &tariffRepository{db: db}
}

func (r *tariffRepository) Create(ctx context.Context, tariff *model.Tariff) error {
	return r.db.WithContext(ctx).Create(tariff).Error
}

func (r *tariffRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	var tariff model.Tariff
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&tariff).Error
	return &tariff, err
}

func (r *tariffRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	var tariff model.Tariff
	err := r.db.WithContext(ctx).
		Preload("WeekPlan").
		Preload("DayPlans").
		Preload("DayPlans.DayPlan").
		Where("id = ?", id).
		First(&tariff).Error
	return &tariff, err
}

func (r *tariffRepository) Update(ctx context.Context, tariff *model.Tariff) error {
	return r.db.WithContext(ctx).Save(tariff).Error
}

func (r *tariffRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.Tariff{}, "id = ?", id).Error
}

func (r *tariffRepository) GetCurrentForEmployee(ctx context.Context, employeeID uuid.UUID) (*model.Tariff, error) {
	var tariff model.Tariff
	err := r.db.WithContext(ctx).
		Preload("WeekPlan").
		Preload("DayPlans").
		Preload("DayPlans.DayPlan").
		Where("employee_id = ? AND is_current = true", employeeID).
		First(&tariff).Error
	return &tariff, err
}

func (r *tariffRepository) GetForEmployeeOnDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.Tariff, error) {
	var tariff model.Tariff
	err := r.db.WithContext(ctx).
		Where("employee_id = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)",
			employeeID, date, date).
		Order("valid_from DESC").
		First(&tariff).Error
	return &tariff, err
}

func (r *tariffRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.Tariff, error) {
	var tariffs []model.Tariff
	err := r.db.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Order("valid_from DESC").
		Find(&tariffs).Error
	return tariffs, err
}

func (r *tariffRepository) SetDayPlans(ctx context.Context, tariffID uuid.UUID, dayPlans []model.TariffDayPlan) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tariff_id = ?", tariffID).Delete(&model.TariffDayPlan{}).Error; err != nil {
			return err
		}
		if len(dayPlans) > 0 {
			for i := range dayPlans {
				dayPlans[i].TariffID = tariffID
			}
			return tx.Create(&dayPlans).Error
		}
		return nil
	})
}
```

## Unit Tests

**File**: `apps/api/internal/repository/tariff_test.go`

```go
package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"terp/apps/api/internal/model"
	"terp/apps/api/internal/testutil"
)

func TestTariffRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	tariff := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom,
		TariffType: model.TariffTypeWeek,
		IsCurrent:  true,
	}

	err := repo.Create(ctx, tariff)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, tariff.ID)
}

func TestTariffRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	tariff := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom,
		TariffType: model.TariffTypeWeek,
	}
	repo.Create(ctx, tariff)

	found, err := repo.GetByID(ctx, tariff.ID)
	require.NoError(t, err)
	assert.Equal(t, tariff.ID, found.ID)
	assert.Equal(t, tariff.TariffType, found.TariffType)
}

func TestTariffRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestTariffRepository_GetWithDetails(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	weekPlanID := uuid.New()
	dayPlanID := uuid.New()
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	tariff := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom,
		TariffType: model.TariffTypeWeek,
		WeekPlanID: &weekPlanID,
	}
	repo.Create(ctx, tariff)

	// Add day plans
	dayPlan := model.TariffDayPlan{
		TariffID:  tariff.ID,
		DayIndex:  1,
		DayPlanID: &dayPlanID,
	}
	repo.SetDayPlans(ctx, tariff.ID, []model.TariffDayPlan{dayPlan})

	found, err := repo.GetWithDetails(ctx, tariff.ID)
	require.NoError(t, err)
	assert.Equal(t, tariff.ID, found.ID)
	assert.Len(t, found.DayPlans, 1)
}

func TestTariffRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	tariff := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom,
		TariffType: model.TariffTypeWeek,
		IsCurrent:  false,
	}
	repo.Create(ctx, tariff)

	tariff.IsCurrent = true
	err := repo.Update(ctx, tariff)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, tariff.ID)
	assert.True(t, found.IsCurrent)
}

func TestTariffRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	tariff := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom,
		TariffType: model.TariffTypeWeek,
	}
	repo.Create(ctx, tariff)

	err := repo.Delete(ctx, tariff.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, tariff.ID)
	assert.Error(t, err)
}

func TestTariffRepository_GetCurrentForEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	// Create non-current tariff
	repo.Create(ctx, &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom,
		TariffType: model.TariffTypeWeek,
		IsCurrent:  false,
	})

	// Create current tariff
	current := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom.AddDate(0, 1, 0),
		TariffType: model.TariffTypeRolling,
		IsCurrent:  true,
	}
	repo.Create(ctx, current)

	found, err := repo.GetCurrentForEmployee(ctx, employeeID)
	require.NoError(t, err)
	assert.Equal(t, current.ID, found.ID)
	assert.Equal(t, model.TariffTypeRolling, found.TariffType)
}

func TestTariffRepository_GetForEmployeeOnDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()

	// Tariff valid from Jan to Mar
	validFrom1 := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	validTo1 := time.Date(2024, 3, 31, 0, 0, 0, 0, time.UTC)
	tariff1 := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom1,
		ValidTo:    &validTo1,
		TariffType: model.TariffTypeWeek,
	}
	repo.Create(ctx, tariff1)

	// Tariff valid from Apr onwards
	validFrom2 := time.Date(2024, 4, 1, 0, 0, 0, 0, time.UTC)
	tariff2 := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom2,
		TariffType: model.TariffTypeRolling,
	}
	repo.Create(ctx, tariff2)

	// Query for date in Feb (should get tariff1)
	found1, err := repo.GetForEmployeeOnDate(ctx, employeeID, time.Date(2024, 2, 15, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	assert.Equal(t, tariff1.ID, found1.ID)

	// Query for date in May (should get tariff2)
	found2, err := repo.GetForEmployeeOnDate(ctx, employeeID, time.Date(2024, 5, 15, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	assert.Equal(t, tariff2.ID, found2.ID)
}

func TestTariffRepository_ListByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	otherEmployeeID := uuid.New()

	repo.Create(ctx, &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		TariffType: model.TariffTypeWeek,
	})
	repo.Create(ctx, &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
		TariffType: model.TariffTypeRolling,
	})
	repo.Create(ctx, &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: otherEmployeeID,
		ValidFrom:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		TariffType: model.TariffTypeWeek,
	})

	tariffs, err := repo.ListByEmployee(ctx, employeeID)
	require.NoError(t, err)
	assert.Len(t, tariffs, 2)
	// Verify ordered by valid_from DESC
	assert.Equal(t, 6, tariffs[0].ValidFrom.Month())
	assert.Equal(t, 1, tariffs[1].ValidFrom.Month())
}

func TestTariffRepository_SetDayPlans(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewTariffRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	tariff := &model.Tariff{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValidFrom:  validFrom,
		TariffType: model.TariffTypeRhythm,
	}
	repo.Create(ctx, tariff)

	dayPlan1ID := uuid.New()
	dayPlan2ID := uuid.New()

	dayPlans := []model.TariffDayPlan{
		{DayIndex: 1, DayPlanID: &dayPlan1ID},
		{DayIndex: 2, DayPlanID: &dayPlan2ID},
	}

	err := repo.SetDayPlans(ctx, tariff.ID, dayPlans)
	require.NoError(t, err)

	found, _ := repo.GetWithDetails(ctx, tariff.ID)
	assert.Len(t, found.DayPlans, 2)

	// Replace day plans
	dayPlan3ID := uuid.New()
	newDayPlans := []model.TariffDayPlan{
		{DayIndex: 1, DayPlanID: &dayPlan3ID},
	}
	err = repo.SetDayPlans(ctx, tariff.ID, newDayPlans)
	require.NoError(t, err)

	found, _ = repo.GetWithDetails(ctx, tariff.ID)
	assert.Len(t, found.DayPlans, 1)
}

func TestTariff_IsValidOnDate(t *testing.T) {
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	validTo := time.Date(2024, 12, 31, 0, 0, 0, 0, time.UTC)

	tariff := &model.Tariff{
		ValidFrom: validFrom,
		ValidTo:   &validTo,
	}

	// Before range
	assert.False(t, tariff.IsValidOnDate(time.Date(2023, 12, 31, 0, 0, 0, 0, time.UTC)))

	// Within range
	assert.True(t, tariff.IsValidOnDate(time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)))

	// After range
	assert.False(t, tariff.IsValidOnDate(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)))

	// No end date
	openTariff := &model.Tariff{
		ValidFrom: validFrom,
		ValidTo:   nil,
	}
	assert.True(t, openTariff.IsValidOnDate(time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC)))
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] GetCurrentForEmployee finds current tariff
- [ ] GetForEmployeeOnDate finds tariff valid on specific date
- [ ] TariffDayPlan composite key works
- [ ] SetDayPlans replaces existing day plans
