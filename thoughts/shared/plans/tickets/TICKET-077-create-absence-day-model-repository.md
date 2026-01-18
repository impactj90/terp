# TICKET-077: Create Absence Day Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 19 - Absence Days
**Dependencies**: TICKET-076

## Description

Create the AbsenceDay model and repository.

## Files to Create

- `apps/api/internal/model/absenceday.go`
- `apps/api/internal/repository/absenceday.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

type AbsenceStatus string

const (
    AbsenceStatusPending  AbsenceStatus = "pending"
    AbsenceStatusApproved AbsenceStatus = "approved"
    AbsenceStatusRejected AbsenceStatus = "rejected"
)

type AbsenceDay struct {
    ID            uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID      uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"employee_id"`
    AbsenceDate   time.Time       `gorm:"type:date;not null" json:"absence_date"`
    AbsenceTypeID uuid.UUID       `gorm:"type:uuid;not null" json:"absence_type_id"`
    Duration      decimal.Decimal `gorm:"type:decimal(3,2);default:1.00" json:"duration"`
    Status        AbsenceStatus   `gorm:"type:varchar(20);default:'approved'" json:"status"`
    Notes         string          `gorm:"type:text" json:"notes,omitempty"`
    ApprovedBy    *uuid.UUID      `gorm:"type:uuid" json:"approved_by,omitempty"`
    ApprovedAt    *time.Time      `json:"approved_at,omitempty"`
    CreatedAt     time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt     time.Time       `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee    *Employee    `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
    AbsenceType *AbsenceType `gorm:"foreignKey:AbsenceTypeID" json:"absence_type,omitempty"`
    Approver    *User        `gorm:"foreignKey:ApprovedBy" json:"approver,omitempty"`
}

func (AbsenceDay) TableName() string {
    return "absence_days"
}

// IsFullDay returns true if duration is 1.0
func (ad *AbsenceDay) IsFullDay() bool {
    return ad.Duration.Equal(decimal.NewFromFloat(1.0))
}

// IsApproved returns true if status is approved
func (ad *AbsenceDay) IsApproved() bool {
    return ad.Status == AbsenceStatusApproved
}
```

### Repository

```go
type AbsenceRepository interface {
    Create(ctx context.Context, absence *model.AbsenceDay) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error)
    Update(ctx context.Context, absence *model.AbsenceDay) error
    Delete(ctx context.Context, id uuid.UUID) error

    // Lookups
    GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error)
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
    ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error)

    // Bulk operations
    CreateRange(ctx context.Context, absences []model.AbsenceDay) error
    DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error

    // Queries
    CountByTypeInRange(ctx context.Context, employeeID uuid.UUID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error)
}

func (r *absenceRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
    var absence model.AbsenceDay
    err := r.db.WithContext(ctx).
        Preload("AbsenceType").
        Where("employee_id = ? AND absence_date = ?", employeeID, date).
        First(&absence).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &absence, err
}

func (r *absenceRepository) CreateRange(ctx context.Context, absences []model.AbsenceDay) error {
    if len(absences) == 0 {
        return nil
    }
    return r.db.WithContext(ctx).CreateInBatches(absences, 100).Error
}

func (r *absenceRepository) CountByTypeInRange(ctx context.Context, employeeID uuid.UUID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error) {
    var sum decimal.Decimal
    err := r.db.WithContext(ctx).
        Model(&model.AbsenceDay{}).
        Select("COALESCE(SUM(duration), 0)").
        Where("employee_id = ? AND absence_type_id = ? AND absence_date >= ? AND absence_date <= ? AND status = ?",
            employeeID, typeID, from, to, model.AbsenceStatusApproved).
        Scan(&sum).Error
    return sum, err
}
```

## Repository Implementation

```go
package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"terp/apps/api/internal/model"
)

type absenceRepository struct {
	db *gorm.DB
}

func NewAbsenceRepository(db *gorm.DB) AbsenceRepository {
	return &absenceRepository{db: db}
}

func (r *absenceRepository) Create(ctx context.Context, absence *model.AbsenceDay) error {
	return r.db.WithContext(ctx).Create(absence).Error
}

func (r *absenceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	var absence model.AbsenceDay
	err := r.db.WithContext(ctx).
		Preload("AbsenceType").
		Where("id = ?", id).
		First(&absence).Error
	return &absence, err
}

func (r *absenceRepository) Update(ctx context.Context, absence *model.AbsenceDay) error {
	return r.db.WithContext(ctx).Save(absence).Error
}

func (r *absenceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.AbsenceDay{}, "id = ?", id).Error
}

func (r *absenceRepository) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	var absences []model.AbsenceDay
	err := r.db.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ? AND absence_date >= ? AND absence_date <= ?", employeeID, from, to).
		Order("absence_date ASC").
		Find(&absences).Error
	return absences, err
}

func (r *absenceRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
	var absences []model.AbsenceDay
	err := r.db.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ?", employeeID).
		Order("absence_date DESC").
		Find(&absences).Error
	return absences, err
}

func (r *absenceRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	return r.db.WithContext(ctx).
		Where("employee_id = ? AND absence_date >= ? AND absence_date <= ?", employeeID, from, to).
		Delete(&model.AbsenceDay{}).Error
}
```

## Unit Tests

**File**: `apps/api/internal/repository/absenceday_test.go`

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

func TestAbsenceRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	typeID := uuid.New()
	absenceDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	absence := &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   absenceDate,
		AbsenceTypeID: typeID,
		Duration:      decimal.NewFromFloat(1.0),
		Status:        model.AbsenceStatusApproved,
	}

	err := repo.Create(ctx, absence)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, absence.ID)
}

func TestAbsenceRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	typeID := uuid.New()
	absenceDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	absence := &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   absenceDate,
		AbsenceTypeID: typeID,
		Duration:      decimal.NewFromFloat(1.0),
		Status:        model.AbsenceStatusApproved,
	}
	repo.Create(ctx, absence)

	found, err := repo.GetByID(ctx, absence.ID)
	require.NoError(t, err)
	assert.Equal(t, absence.ID, found.ID)
	assert.True(t, absence.Duration.Equal(found.Duration))
}

func TestAbsenceRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestAbsenceRepository_GetByEmployeeDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	typeID := uuid.New()
	absenceDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	absence := &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   absenceDate,
		AbsenceTypeID: typeID,
		Duration:      decimal.NewFromFloat(1.0),
		Status:        model.AbsenceStatusApproved,
	}
	repo.Create(ctx, absence)

	found, err := repo.GetByEmployeeDate(ctx, employeeID, absenceDate)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, absence.ID, found.ID)

	// Test not found returns nil
	notFound, err := repo.GetByEmployeeDate(ctx, employeeID, time.Date(2024, 6, 16, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	assert.Nil(t, notFound)
}

func TestAbsenceRepository_GetByEmployeeDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	typeID := uuid.New()

	// Create absences for a week
	for i := 1; i <= 5; i++ {
		repo.Create(ctx, &model.AbsenceDay{
			TenantID:      tenantID,
			EmployeeID:    employeeID,
			AbsenceDate:   time.Date(2024, 6, i, 0, 0, 0, 0, time.UTC),
			AbsenceTypeID: typeID,
			Duration:      decimal.NewFromFloat(1.0),
			Status:        model.AbsenceStatusApproved,
		})
	}

	from := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC)

	absences, err := repo.GetByEmployeeDateRange(ctx, employeeID, from, to)
	require.NoError(t, err)
	assert.Len(t, absences, 5)
	// Verify ordering by date ASC
	assert.Equal(t, 1, absences[0].AbsenceDate.Day())
	assert.Equal(t, 5, absences[4].AbsenceDate.Day())
}

func TestAbsenceRepository_CreateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	typeID := uuid.New()

	absences := []model.AbsenceDay{
		{
			TenantID:      tenantID,
			EmployeeID:    employeeID,
			AbsenceDate:   time.Date(2024, 6, 10, 0, 0, 0, 0, time.UTC),
			AbsenceTypeID: typeID,
			Duration:      decimal.NewFromFloat(1.0),
			Status:        model.AbsenceStatusApproved,
		},
		{
			TenantID:      tenantID,
			EmployeeID:    employeeID,
			AbsenceDate:   time.Date(2024, 6, 11, 0, 0, 0, 0, time.UTC),
			AbsenceTypeID: typeID,
			Duration:      decimal.NewFromFloat(1.0),
			Status:        model.AbsenceStatusApproved,
		},
	}

	err := repo.CreateRange(ctx, absences)
	require.NoError(t, err)

	// Verify created
	from := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC)
	found, _ := repo.GetByEmployeeDateRange(ctx, employeeID, from, to)
	assert.Len(t, found, 2)
}

func TestAbsenceRepository_DeleteRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	typeID := uuid.New()

	// Create absences for 10 days
	for i := 1; i <= 10; i++ {
		repo.Create(ctx, &model.AbsenceDay{
			TenantID:      tenantID,
			EmployeeID:    employeeID,
			AbsenceDate:   time.Date(2024, 6, i, 0, 0, 0, 0, time.UTC),
			AbsenceTypeID: typeID,
			Duration:      decimal.NewFromFloat(1.0),
			Status:        model.AbsenceStatusApproved,
		})
	}

	// Delete days 3-7
	from := time.Date(2024, 6, 3, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 6, 7, 0, 0, 0, 0, time.UTC)
	err := repo.DeleteRange(ctx, employeeID, from, to)
	require.NoError(t, err)

	// Verify only 5 remain (days 1, 2, 8, 9, 10)
	allFrom := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	allTo := time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC)
	remaining, _ := repo.GetByEmployeeDateRange(ctx, employeeID, allFrom, allTo)
	assert.Len(t, remaining, 5)
}

func TestAbsenceRepository_CountByTypeInRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	vacationTypeID := uuid.New()
	sickTypeID := uuid.New()

	// Create vacation absences
	repo.Create(ctx, &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: vacationTypeID,
		Duration:      decimal.NewFromFloat(1.0),
		Status:        model.AbsenceStatusApproved,
	})
	repo.Create(ctx, &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: vacationTypeID,
		Duration:      decimal.NewFromFloat(0.5),
		Status:        model.AbsenceStatusApproved,
	})

	// Create pending vacation (should not count)
	repo.Create(ctx, &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   time.Date(2024, 6, 4, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: vacationTypeID,
		Duration:      decimal.NewFromFloat(1.0),
		Status:        model.AbsenceStatusPending,
	})

	from := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC)

	vacationSum, err := repo.CountByTypeInRange(ctx, employeeID, vacationTypeID, from, to)
	require.NoError(t, err)
	assert.True(t, vacationSum.Equal(decimal.NewFromFloat(1.5))) // Only approved
}

func TestAbsenceRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	typeID := uuid.New()

	absence := &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: typeID,
		Duration:      decimal.NewFromFloat(1.0),
		Status:        model.AbsenceStatusPending,
	}
	repo.Create(ctx, absence)

	absence.Status = model.AbsenceStatusApproved
	err := repo.Update(ctx, absence)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, absence.ID)
	assert.Equal(t, model.AbsenceStatusApproved, found.Status)
}

func TestAbsenceRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	typeID := uuid.New()

	absence := &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: typeID,
		Duration:      decimal.NewFromFloat(1.0),
		Status:        model.AbsenceStatusApproved,
	}
	repo.Create(ctx, absence)

	err := repo.Delete(ctx, absence.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, absence.ID)
	assert.Error(t, err)
}

func TestAbsenceDay_IsFullDay(t *testing.T) {
	fullDay := &model.AbsenceDay{
		Duration: decimal.NewFromFloat(1.0),
	}
	assert.True(t, fullDay.IsFullDay())

	halfDay := &model.AbsenceDay{
		Duration: decimal.NewFromFloat(0.5),
	}
	assert.False(t, halfDay.IsFullDay())
}

func TestAbsenceDay_IsApproved(t *testing.T) {
	approved := &model.AbsenceDay{
		Status: model.AbsenceStatusApproved,
	}
	assert.True(t, approved.IsApproved())

	pending := &model.AbsenceDay{
		Status: model.AbsenceStatusPending,
	}
	assert.False(t, pending.IsApproved())
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] GetByEmployeeDate returns nil if not found
- [ ] CreateRange bulk inserts efficiently
- [ ] CountByTypeInRange sums durations correctly
- [ ] Only approved absences counted in range queries
