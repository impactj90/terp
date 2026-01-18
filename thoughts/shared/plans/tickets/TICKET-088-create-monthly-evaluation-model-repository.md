# TICKET-088: Create Monthly Evaluation Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 21 - Monthly Values
**Dependencies**: TICKET-087

## Description

Create the MonthlyEvaluation model and repository.

## Files to Create

- `apps/api/internal/model/monthlyevaluation.go`
- `apps/api/internal/repository/monthlyevaluation.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

type MonthlyEvaluation struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Name        string    `gorm:"type:varchar(100);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`

    // Flextime caps (minutes)
    FlextimeCapPositive *int `gorm:"type:int" json:"flextime_cap_positive,omitempty"`
    FlextimeCapNegative *int `gorm:"type:int" json:"flextime_cap_negative,omitempty"`

    // Overtime threshold (minutes)
    OvertimeThreshold *int `gorm:"type:int" json:"overtime_threshold,omitempty"`

    // Vacation carryover
    MaxCarryoverVacation decimal.Decimal `gorm:"type:decimal(5,2);default:5" json:"max_carryover_vacation"`

    IsDefault bool      `gorm:"default:false" json:"is_default"`
    IsActive  bool      `gorm:"default:true" json:"is_active"`
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`
}

func (MonthlyEvaluation) TableName() string {
    return "monthly_evaluations"
}

// ApplyFlextimeCap applies positive and negative caps to flextime
func (me *MonthlyEvaluation) ApplyFlextimeCap(flextime int) int {
    if me.FlextimeCapPositive != nil && flextime > *me.FlextimeCapPositive {
        return *me.FlextimeCapPositive
    }
    if me.FlextimeCapNegative != nil && flextime < -*me.FlextimeCapNegative {
        return -*me.FlextimeCapNegative
    }
    return flextime
}
```

### Repository

```go
type MonthlyEvaluationRepository interface {
    Create(ctx context.Context, eval *model.MonthlyEvaluation) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyEvaluation, error)
    Update(ctx context.Context, eval *model.MonthlyEvaluation) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.MonthlyEvaluation, error)
    GetDefault(ctx context.Context, tenantID uuid.UUID) (*model.MonthlyEvaluation, error)
    SetDefault(ctx context.Context, tenantID uuid.UUID, id uuid.UUID) error
}

func (r *monthlyEvaluationRepository) GetDefault(ctx context.Context, tenantID uuid.UUID) (*model.MonthlyEvaluation, error) {
    var eval model.MonthlyEvaluation
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND is_default = true AND is_active = true", tenantID).
        First(&eval).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &eval, err
}

func (r *monthlyEvaluationRepository) SetDefault(ctx context.Context, tenantID uuid.UUID, id uuid.UUID) error {
    return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        // Clear current default
        if err := tx.Model(&model.MonthlyEvaluation{}).
            Where("tenant_id = ?", tenantID).
            Update("is_default", false).Error; err != nil {
            return err
        }
        // Set new default
        return tx.Model(&model.MonthlyEvaluation{}).
            Where("id = ?", id).
            Update("is_default", true).Error
    })
}
```

## Repository Implementation

```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"terp/apps/api/internal/model"
)

type monthlyEvaluationRepository struct {
	db *gorm.DB
}

func NewMonthlyEvaluationRepository(db *gorm.DB) MonthlyEvaluationRepository {
	return &monthlyEvaluationRepository{db: db}
}

func (r *monthlyEvaluationRepository) Create(ctx context.Context, eval *model.MonthlyEvaluation) error {
	return r.db.WithContext(ctx).Create(eval).Error
}

func (r *monthlyEvaluationRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyEvaluation, error) {
	var eval model.MonthlyEvaluation
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&eval).Error
	return &eval, err
}

func (r *monthlyEvaluationRepository) Update(ctx context.Context, eval *model.MonthlyEvaluation) error {
	return r.db.WithContext(ctx).Save(eval).Error
}

func (r *monthlyEvaluationRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.MonthlyEvaluation{}, "id = ?", id).Error
}

func (r *monthlyEvaluationRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.MonthlyEvaluation, error) {
	var evals []model.MonthlyEvaluation
	err := r.db.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("name ASC").
		Find(&evals).Error
	return evals, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/monthlyevaluation_test.go`

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

func TestMonthlyEvaluationRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	capPos := 120
	capNeg := 120

	eval := &model.MonthlyEvaluation{
		TenantID:             tenantID,
		Name:                 "Standard Evaluation",
		Description:          "Standard monthly evaluation rules",
		FlextimeCapPositive:  &capPos,
		FlextimeCapNegative:  &capNeg,
		MaxCarryoverVacation: decimal.NewFromFloat(5.0),
		IsDefault:            true,
		IsActive:             true,
	}

	err := repo.Create(ctx, eval)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, eval.ID)
}

func TestMonthlyEvaluationRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	capPos := 120

	eval := &model.MonthlyEvaluation{
		TenantID:            tenantID,
		Name:                "Standard Evaluation",
		FlextimeCapPositive: &capPos,
		IsDefault:           true,
		IsActive:            true,
	}
	repo.Create(ctx, eval)

	found, err := repo.GetByID(ctx, eval.ID)
	require.NoError(t, err)
	assert.Equal(t, eval.ID, found.ID)
	assert.Equal(t, "Standard Evaluation", found.Name)
	assert.True(t, found.IsDefault)
	assert.NotNil(t, found.FlextimeCapPositive)
	assert.Equal(t, 120, *found.FlextimeCapPositive)
}

func TestMonthlyEvaluationRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestMonthlyEvaluationRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	capPos := 120

	eval := &model.MonthlyEvaluation{
		TenantID:            tenantID,
		Name:                "Original Name",
		FlextimeCapPositive: &capPos,
		IsActive:            true,
	}
	repo.Create(ctx, eval)

	eval.Name = "Updated Name"
	newCap := 150
	eval.FlextimeCapPositive = &newCap
	err := repo.Update(ctx, eval)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, eval.ID)
	assert.Equal(t, "Updated Name", found.Name)
	assert.Equal(t, 150, *found.FlextimeCapPositive)
}

func TestMonthlyEvaluationRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	eval := &model.MonthlyEvaluation{
		TenantID: tenantID,
		Name:     "To Delete",
		IsActive: true,
	}
	repo.Create(ctx, eval)

	err := repo.Delete(ctx, eval.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, eval.ID)
	assert.Error(t, err)
}

func TestMonthlyEvaluationRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create multiple evaluations
	repo.Create(ctx, &model.MonthlyEvaluation{
		TenantID: tenantID,
		Name:     "Zebra Evaluation",
		IsActive: true,
	})
	repo.Create(ctx, &model.MonthlyEvaluation{
		TenantID: tenantID,
		Name:     "Alpha Evaluation",
		IsActive: true,
	})
	repo.Create(ctx, &model.MonthlyEvaluation{
		TenantID: tenantID,
		Name:     "Beta Evaluation",
		IsActive: false,
	})

	evals, err := repo.List(ctx, tenantID)
	require.NoError(t, err)
	assert.Len(t, evals, 3)
	// Verify ordered by name ASC
	assert.Equal(t, "Alpha Evaluation", evals[0].Name)
	assert.Equal(t, "Beta Evaluation", evals[1].Name)
	assert.Equal(t, "Zebra Evaluation", evals[2].Name)
}

func TestMonthlyEvaluationRepository_GetDefault(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create non-default evaluation
	repo.Create(ctx, &model.MonthlyEvaluation{
		TenantID:  tenantID,
		Name:      "Non-Default",
		IsDefault: false,
		IsActive:  true,
	})

	// Create default evaluation
	defaultEval := &model.MonthlyEvaluation{
		TenantID:  tenantID,
		Name:      "Default Evaluation",
		IsDefault: true,
		IsActive:  true,
	}
	repo.Create(ctx, defaultEval)

	found, err := repo.GetDefault(ctx, tenantID)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, defaultEval.ID, found.ID)
	assert.Equal(t, "Default Evaluation", found.Name)
	assert.True(t, found.IsDefault)
}

func TestMonthlyEvaluationRepository_GetDefault_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create only non-default evaluations
	repo.Create(ctx, &model.MonthlyEvaluation{
		TenantID:  tenantID,
		Name:      "Non-Default",
		IsDefault: false,
		IsActive:  true,
	})

	found, err := repo.GetDefault(ctx, tenantID)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestMonthlyEvaluationRepository_GetDefault_IgnoresInactive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create default but inactive evaluation
	repo.Create(ctx, &model.MonthlyEvaluation{
		TenantID:  tenantID,
		Name:      "Inactive Default",
		IsDefault: true,
		IsActive:  false,
	})

	found, err := repo.GetDefault(ctx, tenantID)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestMonthlyEvaluationRepository_SetDefault(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create first default
	eval1 := &model.MonthlyEvaluation{
		TenantID:  tenantID,
		Name:      "First Default",
		IsDefault: true,
		IsActive:  true,
	}
	repo.Create(ctx, eval1)

	// Create second evaluation
	eval2 := &model.MonthlyEvaluation{
		TenantID:  tenantID,
		Name:      "Second",
		IsDefault: false,
		IsActive:  true,
	}
	repo.Create(ctx, eval2)

	// Set eval2 as default
	err := repo.SetDefault(ctx, tenantID, eval2.ID)
	require.NoError(t, err)

	// Verify eval1 is no longer default
	found1, _ := repo.GetByID(ctx, eval1.ID)
	assert.False(t, found1.IsDefault)

	// Verify eval2 is now default
	found2, _ := repo.GetByID(ctx, eval2.ID)
	assert.True(t, found2.IsDefault)

	// Verify GetDefault returns eval2
	defaultEval, _ := repo.GetDefault(ctx, tenantID)
	assert.Equal(t, eval2.ID, defaultEval.ID)
}

func TestMonthlyEvaluationRepository_SetDefault_OnlyAffectsTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewMonthlyEvaluationRepository(db)
	ctx := context.Background()

	tenant1 := uuid.New()
	tenant2 := uuid.New()

	// Create default for tenant1
	eval1 := &model.MonthlyEvaluation{
		TenantID:  tenant1,
		Name:      "Tenant 1 Default",
		IsDefault: true,
		IsActive:  true,
	}
	repo.Create(ctx, eval1)

	// Create default for tenant2
	eval2 := &model.MonthlyEvaluation{
		TenantID:  tenant2,
		Name:      "Tenant 2 Default",
		IsDefault: true,
		IsActive:  true,
	}
	repo.Create(ctx, eval2)

	// Create new eval for tenant1
	eval3 := &model.MonthlyEvaluation{
		TenantID:  tenant1,
		Name:      "Tenant 1 New",
		IsDefault: false,
		IsActive:  true,
	}
	repo.Create(ctx, eval3)

	// Set eval3 as default for tenant1
	err := repo.SetDefault(ctx, tenant1, eval3.ID)
	require.NoError(t, err)

	// Verify tenant1's old default is cleared
	found1, _ := repo.GetByID(ctx, eval1.ID)
	assert.False(t, found1.IsDefault)

	// Verify tenant2's default is unchanged
	found2, _ := repo.GetByID(ctx, eval2.ID)
	assert.True(t, found2.IsDefault)
}

func TestMonthlyEvaluation_ApplyFlextimeCap_PositiveCap(t *testing.T) {
	capPos := 120
	eval := &model.MonthlyEvaluation{
		FlextimeCapPositive: &capPos,
	}

	// Within cap
	assert.Equal(t, 100, eval.ApplyFlextimeCap(100))

	// At cap
	assert.Equal(t, 120, eval.ApplyFlextimeCap(120))

	// Exceeds cap
	assert.Equal(t, 120, eval.ApplyFlextimeCap(150))
}

func TestMonthlyEvaluation_ApplyFlextimeCap_NegativeCap(t *testing.T) {
	capNeg := 120
	eval := &model.MonthlyEvaluation{
		FlextimeCapNegative: &capNeg,
	}

	// Within cap
	assert.Equal(t, -100, eval.ApplyFlextimeCap(-100))

	// At cap
	assert.Equal(t, -120, eval.ApplyFlextimeCap(-120))

	// Exceeds cap
	assert.Equal(t, -120, eval.ApplyFlextimeCap(-150))
}

func TestMonthlyEvaluation_ApplyFlextimeCap_BothCaps(t *testing.T) {
	capPos := 120
	capNeg := 100
	eval := &model.MonthlyEvaluation{
		FlextimeCapPositive: &capPos,
		FlextimeCapNegative: &capNeg,
	}

	// Positive exceeds cap
	assert.Equal(t, 120, eval.ApplyFlextimeCap(150))

	// Negative exceeds cap
	assert.Equal(t, -100, eval.ApplyFlextimeCap(-150))

	// Within both caps
	assert.Equal(t, 50, eval.ApplyFlextimeCap(50))
	assert.Equal(t, -50, eval.ApplyFlextimeCap(-50))
}

func TestMonthlyEvaluation_ApplyFlextimeCap_NoCaps(t *testing.T) {
	eval := &model.MonthlyEvaluation{}

	// No caps, returns original value
	assert.Equal(t, 200, eval.ApplyFlextimeCap(200))
	assert.Equal(t, -200, eval.ApplyFlextimeCap(-200))
	assert.Equal(t, 0, eval.ApplyFlextimeCap(0))
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] GetDefault returns nil if not found
- [ ] GetDefault ignores inactive evaluations
- [ ] SetDefault ensures only one default per tenant
- [ ] SetDefault only affects the specified tenant
- [ ] ApplyFlextimeCap caps both positive and negative directions
- [ ] ApplyFlextimeCap handles missing caps gracefully
