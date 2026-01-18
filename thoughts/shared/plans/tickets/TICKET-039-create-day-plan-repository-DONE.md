# TICKET-039: Create Day Plan Repository

**Type**: Repository
**Effort**: S
**Sprint**: 6 - Day Plans
**Dependencies**: TICKET-038

## Description

Create the DayPlan repository with CRUD and copy functionality.

## Files to Create

- `apps/api/internal/repository/dayplan.go`

## Implementation

```go
package repository

import (
    "context"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type DayPlanRepository interface {
    Create(ctx context.Context, plan *model.DayPlan) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.DayPlan, error)
    GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
    Update(ctx context.Context, plan *model.DayPlan) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error)

    // Break management
    AddBreak(ctx context.Context, b *model.DayPlanBreak) error
    UpdateBreak(ctx context.Context, b *model.DayPlanBreak) error
    DeleteBreak(ctx context.Context, breakID uuid.UUID) error

    // Bonus management
    AddBonus(ctx context.Context, b *model.DayPlanBonus) error
    UpdateBonus(ctx context.Context, b *model.DayPlanBonus) error
    DeleteBonus(ctx context.Context, bonusID uuid.UUID) error
}

type dayPlanRepository struct {
    db *gorm.DB
}

func NewDayPlanRepository(db *gorm.DB) DayPlanRepository {
    return &dayPlanRepository{db: db}
}

func (r *dayPlanRepository) Create(ctx context.Context, plan *model.DayPlan) error {
    return r.db.WithContext(ctx).Create(plan).Error
}

func (r *dayPlanRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
    var plan model.DayPlan
    err := r.db.WithContext(ctx).Where("id = ?", id).First(&plan).Error
    return &plan, err
}

func (r *dayPlanRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.DayPlan, error) {
    var plan model.DayPlan
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND code = ?", tenantID, code).
        First(&plan).Error
    return &plan, err
}

func (r *dayPlanRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
    var plan model.DayPlan
    err := r.db.WithContext(ctx).
        Preload("Breaks", func(db *gorm.DB) *gorm.DB {
            return db.Order("sort_order ASC")
        }).
        Preload("Bonuses", func(db *gorm.DB) *gorm.DB {
            return db.Order("sort_order ASC")
        }).
        Preload("Bonuses.Account").
        Where("id = ?", id).
        First(&plan).Error
    return &plan, err
}

func (r *dayPlanRepository) Update(ctx context.Context, plan *model.DayPlan) error {
    return r.db.WithContext(ctx).Save(plan).Error
}

func (r *dayPlanRepository) Delete(ctx context.Context, id uuid.UUID) error {
    // Breaks and bonuses cascade-delete
    return r.db.WithContext(ctx).Delete(&model.DayPlan{}, "id = ?", id).Error
}

func (r *dayPlanRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error) {
    var plans []model.DayPlan
    err := r.db.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("code ASC").
        Find(&plans).Error
    return plans, err
}

func (r *dayPlanRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error) {
    var plans []model.DayPlan
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND is_active = true", tenantID).
        Order("code ASC").
        Find(&plans).Error
    return plans, err
}

func (r *dayPlanRepository) AddBreak(ctx context.Context, b *model.DayPlanBreak) error {
    return r.db.WithContext(ctx).Create(b).Error
}

func (r *dayPlanRepository) UpdateBreak(ctx context.Context, b *model.DayPlanBreak) error {
    return r.db.WithContext(ctx).Save(b).Error
}

func (r *dayPlanRepository) DeleteBreak(ctx context.Context, breakID uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.DayPlanBreak{}, "id = ?", breakID).Error
}

func (r *dayPlanRepository) AddBonus(ctx context.Context, b *model.DayPlanBonus) error {
    return r.db.WithContext(ctx).Create(b).Error
}

func (r *dayPlanRepository) UpdateBonus(ctx context.Context, b *model.DayPlanBonus) error {
    return r.db.WithContext(ctx).Save(b).Error
}

func (r *dayPlanRepository) DeleteBonus(ctx context.Context, bonusID uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.DayPlanBonus{}, "id = ?", bonusID).Error
}
```

## Unit Tests

**File**: `apps/api/internal/repository/dayplan_test.go`

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

func TestDayPlanRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.DayPlan{
		TenantID:    tenantID,
		Code:        "STANDARD",
		Name:        "Standard Day",
		Description: "Standard working day",
		TargetTime:  480, // 8 hours
		IsActive:    true,
	}

	err := repo.Create(ctx, plan)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, plan.ID)
}

func TestDayPlanRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.DayPlan{
		TenantID:   tenantID,
		Code:       "STANDARD",
		Name:       "Standard Day",
		TargetTime: 480,
	}
	repo.Create(ctx, plan)

	found, err := repo.GetByID(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
	assert.Equal(t, plan.Code, found.Code)
	assert.Equal(t, plan.TargetTime, found.TargetTime)
}

func TestDayPlanRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestDayPlanRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.DayPlan{
		TenantID:   tenantID,
		Code:       "UNIQUE-CODE",
		Name:       "Unique Plan",
		TargetTime: 480,
	}
	repo.Create(ctx, plan)

	found, err := repo.GetByCode(ctx, tenantID, "UNIQUE-CODE")
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
}

func TestDayPlanRepository_GetWithDetails(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.DayPlan{
		TenantID:   tenantID,
		Code:       "DETAILED",
		Name:       "Plan with Details",
		TargetTime: 480,
	}
	repo.Create(ctx, plan)

	// Add breaks
	break1 := &model.DayPlanBreak{
		DayPlanID: plan.ID,
		FromTime:  600,
		ToTime:    630,
		IsPaid:    false,
		SortOrder: 1,
	}
	break2 := &model.DayPlanBreak{
		DayPlanID: plan.ID,
		FromTime:  720,
		ToTime:    780,
		IsPaid:    true,
		SortOrder: 2,
	}
	repo.AddBreak(ctx, break1)
	repo.AddBreak(ctx, break2)

	// Add bonuses
	accountID := uuid.New()
	bonus1 := &model.DayPlanBonus{
		DayPlanID: plan.ID,
		AccountID: accountID,
		Amount:    30,
		SortOrder: 1,
	}
	repo.AddBonus(ctx, bonus1)

	// Get with details
	found, err := repo.GetWithDetails(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
	assert.Len(t, found.Breaks, 2)
	assert.Len(t, found.Bonuses, 1)
	// Verify ordering
	assert.Equal(t, 1, found.Breaks[0].SortOrder)
	assert.Equal(t, 2, found.Breaks[1].SortOrder)
}

func TestDayPlanRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.DayPlan{
		TenantID:   tenantID,
		Code:       "UPDATE",
		Name:       "Original Name",
		TargetTime: 480,
	}
	repo.Create(ctx, plan)

	plan.Name = "Updated Name"
	plan.TargetTime = 420
	err := repo.Update(ctx, plan)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, plan.ID)
	assert.Equal(t, "Updated Name", found.Name)
	assert.Equal(t, 420, found.TargetTime)
}

func TestDayPlanRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.DayPlan{
		TenantID:   tenantID,
		Code:       "DELETE",
		Name:       "To Delete",
		TargetTime: 480,
	}
	repo.Create(ctx, plan)

	err := repo.Delete(ctx, plan.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, plan.ID)
	assert.Error(t, err)
}

func TestDayPlanRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	repo.Create(ctx, &model.DayPlan{TenantID: tenantID, Code: "A", Name: "Plan A", TargetTime: 480})
	repo.Create(ctx, &model.DayPlan{TenantID: tenantID, Code: "B", Name: "Plan B", TargetTime: 420})

	plans, err := repo.List(ctx, tenantID)
	require.NoError(t, err)
	assert.Len(t, plans, 2)
	// Verify ordered by code
	assert.Equal(t, "A", plans[0].Code)
	assert.Equal(t, "B", plans[1].Code)
}

func TestDayPlanRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	repo.Create(ctx, &model.DayPlan{TenantID: tenantID, Code: "ACTIVE", Name: "Active", TargetTime: 480, IsActive: true})
	repo.Create(ctx, &model.DayPlan{TenantID: tenantID, Code: "INACTIVE", Name: "Inactive", TargetTime: 480, IsActive: false})

	plans, err := repo.ListActive(ctx, tenantID)
	require.NoError(t, err)
	assert.Len(t, plans, 1)
	assert.Equal(t, "ACTIVE", plans[0].Code)
}

func TestDayPlanRepository_BreakManagement(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.DayPlan{TenantID: tenantID, Code: "BREAK-TEST", Name: "Break Test", TargetTime: 480}
	repo.Create(ctx, plan)

	// Add break
	breakItem := &model.DayPlanBreak{
		DayPlanID: plan.ID,
		FromTime:  600,
		ToTime:    630,
		IsPaid:    false,
		SortOrder: 1,
	}
	err := repo.AddBreak(ctx, breakItem)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, breakItem.ID)

	// Update break
	breakItem.ToTime = 645
	err = repo.UpdateBreak(ctx, breakItem)
	require.NoError(t, err)

	// Delete break
	err = repo.DeleteBreak(ctx, breakItem.ID)
	require.NoError(t, err)
}

func TestDayPlanRepository_BonusManagement(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.DayPlan{TenantID: tenantID, Code: "BONUS-TEST", Name: "Bonus Test", TargetTime: 480}
	repo.Create(ctx, plan)

	accountID := uuid.New()

	// Add bonus
	bonus := &model.DayPlanBonus{
		DayPlanID: plan.ID,
		AccountID: accountID,
		Amount:    30,
		SortOrder: 1,
	}
	err := repo.AddBonus(ctx, bonus)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, bonus.ID)

	// Update bonus
	bonus.Amount = 45
	err = repo.UpdateBonus(ctx, bonus)
	require.NoError(t, err)

	// Delete bonus
	err = repo.DeleteBonus(ctx, bonus.ID)
	require.NoError(t, err)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] GetWithDetails preloads breaks and bonuses ordered
- [ ] Break/Bonus CRUD methods work
