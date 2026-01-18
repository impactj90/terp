# TICKET-093: Create Correction Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 23 - Corrections
**Dependencies**: TICKET-092

## Description

Create the Correction model and repository.

## Files to Create

- `apps/api/internal/model/correction.go`
- `apps/api/internal/repository/correction.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type CorrectionType string

const (
    CorrectionTypeOvertime  CorrectionType = "overtime"
    CorrectionTypeUndertime CorrectionType = "undertime"
    CorrectionTypeFlextime  CorrectionType = "flextime"
    CorrectionTypeVacation  CorrectionType = "vacation"
    CorrectionTypeSick      CorrectionType = "sick"
)

type Correction struct {
    ID         uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID      `gorm:"type:uuid;not null;index" json:"employee_id"`
    ValueDate  time.Time      `gorm:"type:date;not null" json:"value_date"`

    CorrectionType CorrectionType `gorm:"type:varchar(20);not null" json:"correction_type"`
    Amount         int            `gorm:"not null" json:"amount"`
    Reason         string         `gorm:"type:text;not null" json:"reason"`

    ApprovedBy *uuid.UUID `gorm:"type:uuid" json:"approved_by,omitempty"`
    ApprovedAt *time.Time `json:"approved_at,omitempty"`

    CreatedBy uuid.UUID `gorm:"type:uuid;not null" json:"created_by"`
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (Correction) TableName() string {
    return "corrections"
}

// IsApproved returns true if correction has been approved
func (c *Correction) IsApproved() bool {
    return c.ApprovedBy != nil
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

type CorrectionRepository interface {
    Create(ctx context.Context, correction *model.Correction) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error)
    Update(ctx context.Context, correction *model.Correction) error
    Delete(ctx context.Context, id uuid.UUID) error
    ListByEmployee(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.Correction, error)
    ListByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.Correction, error)
    Approve(ctx context.Context, id uuid.UUID, approvedBy uuid.UUID) error
    SumByTypeInRange(ctx context.Context, employeeID uuid.UUID, correctionType model.CorrectionType, from, to time.Time) (int, error)
}

type correctionRepository struct {
    db *gorm.DB
}

func NewCorrectionRepository(db *gorm.DB) CorrectionRepository {
    return &correctionRepository{db: db}
}

func (r *correctionRepository) Create(ctx context.Context, correction *model.Correction) error {
    return r.db.WithContext(ctx).Create(correction).Error
}

func (r *correctionRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error) {
    var correction model.Correction
    err := r.db.WithContext(ctx).First(&correction, "id = ?", id).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &correction, err
}

func (r *correctionRepository) Update(ctx context.Context, correction *model.Correction) error {
    return r.db.WithContext(ctx).Save(correction).Error
}

func (r *correctionRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.Correction{}, "id = ?", id).Error
}

func (r *correctionRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.Correction, error) {
    var corrections []model.Correction
    err := r.db.WithContext(ctx).
        Where("employee_id = ? AND value_date >= ? AND value_date <= ?", employeeID, from, to).
        Order("value_date ASC").
        Find(&corrections).Error
    return corrections, err
}

func (r *correctionRepository) ListByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.Correction, error) {
    var corrections []model.Correction
    err := r.db.WithContext(ctx).
        Where("employee_id = ? AND value_date = ?", employeeID, date).
        Find(&corrections).Error
    return corrections, err
}

func (r *correctionRepository) Approve(ctx context.Context, id uuid.UUID, approvedBy uuid.UUID) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.Correction{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "approved_by": approvedBy,
            "approved_at": now,
        }).Error
}

func (r *correctionRepository) SumByTypeInRange(ctx context.Context, employeeID uuid.UUID, correctionType model.CorrectionType, from, to time.Time) (int, error) {
    var sum int
    err := r.db.WithContext(ctx).
        Model(&model.Correction{}).
        Where("employee_id = ? AND correction_type = ? AND value_date >= ? AND value_date <= ? AND approved_by IS NOT NULL",
            employeeID, correctionType, from, to).
        Select("COALESCE(SUM(amount), 0)").
        Scan(&sum).Error
    return sum, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/correction_test.go`

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

func TestCorrectionRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewCorrectionRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	createdBy := uuid.New()
	valueDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	correction := &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      valueDate,
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         30, // 30 minutes
		Reason:         "Manual adjustment for meeting",
		CreatedBy:      createdBy,
	}

	err := repo.Create(ctx, correction)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, correction.ID)
}

func TestCorrectionRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewCorrectionRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	createdBy := uuid.New()

	correction := &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         30,
		Reason:         "Test correction",
		CreatedBy:      createdBy,
	}
	repo.Create(ctx, correction)

	found, err := repo.GetByID(ctx, correction.ID)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, correction.ID, found.ID)
	assert.Equal(t, correction.Amount, found.Amount)

	// Test not found returns nil
	notFound, err := repo.GetByID(ctx, uuid.New())
	require.NoError(t, err)
	assert.Nil(t, notFound)
}

func TestCorrectionRepository_ListByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewCorrectionRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	createdBy := uuid.New()

	// Create corrections over a date range
	for i := 1; i <= 5; i++ {
		repo.Create(ctx, &model.Correction{
			TenantID:       tenantID,
			EmployeeID:     employeeID,
			ValueDate:      time.Date(2024, 6, i, 0, 0, 0, 0, time.UTC),
			CorrectionType: model.CorrectionTypeOvertime,
			Amount:         30,
			Reason:         "Test",
			CreatedBy:      createdBy,
		})
	}

	from := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC)

	corrections, err := repo.ListByEmployee(ctx, employeeID, from, to)
	require.NoError(t, err)
	assert.Len(t, corrections, 5)
	// Verify ordered by value_date ASC
	assert.Equal(t, 1, corrections[0].ValueDate.Day())
	assert.Equal(t, 5, corrections[4].ValueDate.Day())
}

func TestCorrectionRepository_ListByEmployeeDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewCorrectionRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	createdBy := uuid.New()
	date := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	// Create multiple corrections on same date
	repo.Create(ctx, &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      date,
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         30,
		Reason:         "Correction 1",
		CreatedBy:      createdBy,
	})
	repo.Create(ctx, &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      date,
		CorrectionType: model.CorrectionTypeFlextime,
		Amount:         60,
		Reason:         "Correction 2",
		CreatedBy:      createdBy,
	})

	corrections, err := repo.ListByEmployeeDate(ctx, employeeID, date)
	require.NoError(t, err)
	assert.Len(t, corrections, 2)
}

func TestCorrectionRepository_Approve(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewCorrectionRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	createdBy := uuid.New()
	approvedBy := uuid.New()

	correction := &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         30,
		Reason:         "Test",
		CreatedBy:      createdBy,
	}
	repo.Create(ctx, correction)

	err := repo.Approve(ctx, correction.ID, approvedBy)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, correction.ID)
	assert.NotNil(t, found.ApprovedBy)
	assert.Equal(t, approvedBy, *found.ApprovedBy)
	assert.NotNil(t, found.ApprovedAt)
}

func TestCorrectionRepository_SumByTypeInRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewCorrectionRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	createdBy := uuid.New()
	approvedBy := uuid.New()

	// Create approved overtime corrections
	correction1 := &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         30,
		Reason:         "Approved 1",
		CreatedBy:      createdBy,
	}
	repo.Create(ctx, correction1)
	repo.Approve(ctx, correction1.ID, approvedBy)

	correction2 := &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      time.Date(2024, 6, 5, 0, 0, 0, 0, time.UTC),
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         45,
		Reason:         "Approved 2",
		CreatedBy:      createdBy,
	}
	repo.Create(ctx, correction2)
	repo.Approve(ctx, correction2.ID, approvedBy)

	// Create unapproved overtime correction (should not count)
	repo.Create(ctx, &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      time.Date(2024, 6, 10, 0, 0, 0, 0, time.UTC),
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         60,
		Reason:         "Unapproved",
		CreatedBy:      createdBy,
	})

	// Create approved flextime correction (different type)
	flexCorrection := &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
		CorrectionType: model.CorrectionTypeFlextime,
		Amount:         120,
		Reason:         "Flextime",
		CreatedBy:      createdBy,
	}
	repo.Create(ctx, flexCorrection)
	repo.Approve(ctx, flexCorrection.ID, approvedBy)

	from := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC)

	// Sum overtime (should be 30 + 45 = 75)
	overtimeSum, err := repo.SumByTypeInRange(ctx, employeeID, model.CorrectionTypeOvertime, from, to)
	require.NoError(t, err)
	assert.Equal(t, 75, overtimeSum)

	// Sum flextime (should be 120)
	flextimeSum, err := repo.SumByTypeInRange(ctx, employeeID, model.CorrectionTypeFlextime, from, to)
	require.NoError(t, err)
	assert.Equal(t, 120, flextimeSum)
}

func TestCorrectionRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewCorrectionRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	createdBy := uuid.New()

	correction := &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         30,
		Reason:         "Original reason",
		CreatedBy:      createdBy,
	}
	repo.Create(ctx, correction)

	correction.Reason = "Updated reason"
	correction.Amount = 45
	err := repo.Update(ctx, correction)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, correction.ID)
	assert.Equal(t, "Updated reason", found.Reason)
	assert.Equal(t, 45, found.Amount)
}

func TestCorrectionRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewCorrectionRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	employeeID := uuid.New()
	createdBy := uuid.New()

	correction := &model.Correction{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		ValueDate:      time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
		CorrectionType: model.CorrectionTypeOvertime,
		Amount:         30,
		Reason:         "To delete",
		CreatedBy:      createdBy,
	}
	repo.Create(ctx, correction)

	err := repo.Delete(ctx, correction.ID)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, correction.ID)
	assert.Nil(t, found)
}

func TestCorrection_IsApproved(t *testing.T) {
	approvedBy := uuid.New()
	approved := &model.Correction{
		ApprovedBy: &approvedBy,
	}
	assert.True(t, approved.IsApproved())

	unapproved := &model.Correction{
		ApprovedBy: nil,
	}
	assert.False(t, unapproved.IsApproved())
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] IsApproved returns correct value
- [ ] SumByTypeInRange only counts approved corrections
- [ ] Approve method updates approved_by and approved_at fields
