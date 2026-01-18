# TICKET-043: Create Week Plan Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 7 - Week Plans
**Dependencies**: TICKET-042

## Description

Create the WeekPlan model with day plan relationships and repository.

## Files to Create

- `apps/api/internal/model/weekplan.go`
- `apps/api/internal/repository/weekplan.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type WeekPlan struct {
    ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string     `gorm:"type:varchar(20);not null" json:"code"`
    Name        string     `gorm:"type:varchar(255);not null" json:"name"`
    Description string     `gorm:"type:text" json:"description,omitempty"`

    // Day plan IDs
    MondayPlanID    *uuid.UUID `gorm:"type:uuid" json:"monday_plan_id,omitempty"`
    TuesdayPlanID   *uuid.UUID `gorm:"type:uuid" json:"tuesday_plan_id,omitempty"`
    WednesdayPlanID *uuid.UUID `gorm:"type:uuid" json:"wednesday_plan_id,omitempty"`
    ThursdayPlanID  *uuid.UUID `gorm:"type:uuid" json:"thursday_plan_id,omitempty"`
    FridayPlanID    *uuid.UUID `gorm:"type:uuid" json:"friday_plan_id,omitempty"`
    SaturdayPlanID  *uuid.UUID `gorm:"type:uuid" json:"saturday_plan_id,omitempty"`
    SundayPlanID    *uuid.UUID `gorm:"type:uuid" json:"sunday_plan_id,omitempty"`

    IsActive  bool      `gorm:"default:true" json:"is_active"`
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    MondayPlan    *DayPlan `gorm:"foreignKey:MondayPlanID" json:"monday_plan,omitempty"`
    TuesdayPlan   *DayPlan `gorm:"foreignKey:TuesdayPlanID" json:"tuesday_plan,omitempty"`
    WednesdayPlan *DayPlan `gorm:"foreignKey:WednesdayPlanID" json:"wednesday_plan,omitempty"`
    ThursdayPlan  *DayPlan `gorm:"foreignKey:ThursdayPlanID" json:"thursday_plan,omitempty"`
    FridayPlan    *DayPlan `gorm:"foreignKey:FridayPlanID" json:"friday_plan,omitempty"`
    SaturdayPlan  *DayPlan `gorm:"foreignKey:SaturdayPlanID" json:"saturday_plan,omitempty"`
    SundayPlan    *DayPlan `gorm:"foreignKey:SundayPlanID" json:"sunday_plan,omitempty"`
}

func (WeekPlan) TableName() string {
    return "week_plans"
}

// GetPlanForWeekday returns the day plan for a given weekday (0=Sunday, 1=Monday, etc.)
func (wp *WeekPlan) GetPlanForWeekday(weekday time.Weekday) *uuid.UUID {
    switch weekday {
    case time.Monday:
        return wp.MondayPlanID
    case time.Tuesday:
        return wp.TuesdayPlanID
    case time.Wednesday:
        return wp.WednesdayPlanID
    case time.Thursday:
        return wp.ThursdayPlanID
    case time.Friday:
        return wp.FridayPlanID
    case time.Saturday:
        return wp.SaturdayPlanID
    case time.Sunday:
        return wp.SundayPlanID
    }
    return nil
}

// WorkDaysPerWeek returns the count of days with assigned plans
func (wp *WeekPlan) WorkDaysPerWeek() int {
    count := 0
    if wp.MondayPlanID != nil { count++ }
    if wp.TuesdayPlanID != nil { count++ }
    if wp.WednesdayPlanID != nil { count++ }
    if wp.ThursdayPlanID != nil { count++ }
    if wp.FridayPlanID != nil { count++ }
    if wp.SaturdayPlanID != nil { count++ }
    if wp.SundayPlanID != nil { count++ }
    return count
}
```

### Repository

```go
type WeekPlanRepository interface {
    Create(ctx context.Context, plan *model.WeekPlan) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.WeekPlan, error)
    GetWithDayPlans(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
    Update(ctx context.Context, plan *model.WeekPlan) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error)
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

type WeekPlanRepository interface {
	Create(ctx context.Context, plan *model.WeekPlan) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.WeekPlan, error)
	GetWithDayPlans(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
	Update(ctx context.Context, plan *model.WeekPlan) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error)
}

type weekPlanRepository struct {
	db *gorm.DB
}

func NewWeekPlanRepository(db *gorm.DB) WeekPlanRepository {
	return &weekPlanRepository{db: db}
}

func (r *weekPlanRepository) Create(ctx context.Context, plan *model.WeekPlan) error {
	return r.db.WithContext(ctx).Create(plan).Error
}

func (r *weekPlanRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error) {
	var plan model.WeekPlan
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&plan).Error
	return &plan, err
}

func (r *weekPlanRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.WeekPlan, error) {
	var plan model.WeekPlan
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&plan).Error
	return &plan, err
}

func (r *weekPlanRepository) GetWithDayPlans(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error) {
	var plan model.WeekPlan
	err := r.db.WithContext(ctx).
		Preload("MondayPlan").
		Preload("TuesdayPlan").
		Preload("WednesdayPlan").
		Preload("ThursdayPlan").
		Preload("FridayPlan").
		Preload("SaturdayPlan").
		Preload("SundayPlan").
		Where("id = ?", id).
		First(&plan).Error
	return &plan, err
}

func (r *weekPlanRepository) Update(ctx context.Context, plan *model.WeekPlan) error {
	return r.db.WithContext(ctx).Save(plan).Error
}

func (r *weekPlanRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.WeekPlan{}, "id = ?", id).Error
}

func (r *weekPlanRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error) {
	var plans []model.WeekPlan
	err := r.db.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&plans).Error
	return plans, err
}

func (r *weekPlanRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error) {
	var plans []model.WeekPlan
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND is_active = true", tenantID).
		Order("code ASC").
		Find(&plans).Error
	return plans, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/weekplan_test.go`

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

func TestWeekPlanRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	mondayPlanID := uuid.New()

	plan := &model.WeekPlan{
		TenantID:     tenantID,
		Code:         "STANDARD",
		Name:         "Standard Week",
		Description:  "5-day work week",
		MondayPlanID: &mondayPlanID,
		IsActive:     true,
	}

	err := repo.Create(ctx, plan)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, plan.ID)
}

func TestWeekPlanRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.WeekPlan{
		TenantID: tenantID,
		Code:     "STANDARD",
		Name:     "Standard Week",
	}
	repo.Create(ctx, plan)

	found, err := repo.GetByID(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
	assert.Equal(t, plan.Code, found.Code)
}

func TestWeekPlanRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestWeekPlanRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.WeekPlan{
		TenantID: tenantID,
		Code:     "UNIQUE-WEEK",
		Name:     "Unique Week",
	}
	repo.Create(ctx, plan)

	found, err := repo.GetByCode(ctx, tenantID, "UNIQUE-WEEK")
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
}

func TestWeekPlanRepository_GetWithDayPlans(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	dayPlanRepo := NewDayPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create day plans
	mondayPlan := &model.DayPlan{TenantID: tenantID, Code: "MON", Name: "Monday Plan", TargetTime: 480}
	tuesdayPlan := &model.DayPlan{TenantID: tenantID, Code: "TUE", Name: "Tuesday Plan", TargetTime: 480}
	dayPlanRepo.Create(ctx, mondayPlan)
	dayPlanRepo.Create(ctx, tuesdayPlan)

	// Create week plan
	plan := &model.WeekPlan{
		TenantID:     tenantID,
		Code:         "DETAILED",
		Name:         "Week with Days",
		MondayPlanID: &mondayPlan.ID,
		TuesdayPlanID: &tuesdayPlan.ID,
	}
	repo.Create(ctx, plan)

	// Get with details
	found, err := repo.GetWithDayPlans(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
	assert.NotNil(t, found.MondayPlan)
	assert.NotNil(t, found.TuesdayPlan)
	assert.Equal(t, "MON", found.MondayPlan.Code)
	assert.Equal(t, "TUE", found.TuesdayPlan.Code)
}

func TestWeekPlanRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.WeekPlan{
		TenantID: tenantID,
		Code:     "UPDATE",
		Name:     "Original Name",
	}
	repo.Create(ctx, plan)

	plan.Name = "Updated Name"
	err := repo.Update(ctx, plan)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, plan.ID)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestWeekPlanRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	plan := &model.WeekPlan{
		TenantID: tenantID,
		Code:     "DELETE",
		Name:     "To Delete",
	}
	repo.Create(ctx, plan)

	err := repo.Delete(ctx, plan.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, plan.ID)
	assert.Error(t, err)
}

func TestWeekPlanRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	repo.Create(ctx, &model.WeekPlan{TenantID: tenantID, Code: "A", Name: "Week A"})
	repo.Create(ctx, &model.WeekPlan{TenantID: tenantID, Code: "B", Name: "Week B"})

	plans, err := repo.List(ctx, tenantID)
	require.NoError(t, err)
	assert.Len(t, plans, 2)
	assert.Equal(t, "A", plans[0].Code)
	assert.Equal(t, "B", plans[1].Code)
}

func TestWeekPlanRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewWeekPlanRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	repo.Create(ctx, &model.WeekPlan{TenantID: tenantID, Code: "ACTIVE", Name: "Active", IsActive: true})
	repo.Create(ctx, &model.WeekPlan{TenantID: tenantID, Code: "INACTIVE", Name: "Inactive", IsActive: false})

	plans, err := repo.ListActive(ctx, tenantID)
	require.NoError(t, err)
	assert.Len(t, plans, 1)
	assert.Equal(t, "ACTIVE", plans[0].Code)
}

func TestWeekPlan_GetPlanForWeekday(t *testing.T) {
	mondayID := uuid.New()
	tuesdayID := uuid.New()
	sundayID := uuid.New()

	plan := &model.WeekPlan{
		MondayPlanID: &mondayID,
		TuesdayPlanID: &tuesdayID,
		SundayPlanID: &sundayID,
	}

	assert.Equal(t, &mondayID, plan.GetPlanForWeekday(time.Monday))
	assert.Equal(t, &tuesdayID, plan.GetPlanForWeekday(time.Tuesday))
	assert.Equal(t, &sundayID, plan.GetPlanForWeekday(time.Sunday))
	assert.Nil(t, plan.GetPlanForWeekday(time.Wednesday))
}

func TestWeekPlan_WorkDaysPerWeek(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()
	id3 := uuid.New()

	plan := &model.WeekPlan{
		MondayPlanID:   &id1,
		TuesdayPlanID:  &id2,
		WednesdayPlanID: &id3,
	}

	assert.Equal(t, 3, plan.WorkDaysPerWeek())

	emptyPlan := &model.WeekPlan{}
	assert.Equal(t, 0, emptyPlan.WorkDaysPerWeek())
}
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] Unit tests cover all CRUD operations
- [x] Unit tests with test database
- [x] Tests cover error cases (not found)
- [x] GetPlanForWeekday helper works (GetDayPlanIDForWeekday)
- [x] GetWithDayPlans preloads all 7 day plan relations
- [x] WorkDaysPerWeek helper works

## Implementation Notes

- Used `monday_day_plan_id` naming to match OpenAPI schema
- Description field is a pointer type for optional null handling
- Concrete repository struct (not interface) matching existing patterns
