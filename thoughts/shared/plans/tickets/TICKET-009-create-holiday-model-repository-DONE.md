# TICKET-009: Create Holiday Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 2 - Reference Tables
**Dependencies**: TICKET-008

## Description

Create the Holiday model and repository with date range queries.

## Files to Create

- `apps/api/internal/model/holiday.go`
- `apps/api/internal/repository/holiday.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type Holiday struct {
    ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    HolidayDate  time.Time  `gorm:"type:date;not null" json:"holiday_date"`
    Name         string     `gorm:"type:varchar(255);not null" json:"name"`
    IsHalfDay    bool       `gorm:"default:false" json:"is_half_day"`
    AppliesToAll bool       `gorm:"default:true" json:"applies_to_all"`
    DepartmentID *uuid.UUID `gorm:"type:uuid" json:"department_id,omitempty"`
    CreatedAt    time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt    time.Time  `gorm:"default:now()" json:"updated_at"`
}

func (Holiday) TableName() string {
    return "holidays"
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

type HolidayRepository interface {
    Create(ctx context.Context, holiday *model.Holiday) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Holiday, error)
    Update(ctx context.Context, holiday *model.Holiday) error
    Delete(ctx context.Context, id uuid.UUID) error
    GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error)
    GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error)
    ListByYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.Holiday, error)
}

type holidayRepository struct {
    db *gorm.DB
}

func NewHolidayRepository(db *gorm.DB) HolidayRepository {
    return &holidayRepository{db: db}
}

func (r *holidayRepository) Create(ctx context.Context, holiday *model.Holiday) error {
    return r.db.WithContext(ctx).Create(holiday).Error
}

func (r *holidayRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Holiday, error) {
    var holiday model.Holiday
    err := r.db.WithContext(ctx).Where("id = ?", id).First(&holiday).Error
    return &holiday, err
}

func (r *holidayRepository) Update(ctx context.Context, holiday *model.Holiday) error {
    return r.db.WithContext(ctx).Save(holiday).Error
}

func (r *holidayRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.Holiday{}, "id = ?", id).Error
}

func (r *holidayRepository) GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error) {
    var holidays []model.Holiday
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND holiday_date >= ? AND holiday_date <= ?", tenantID, from, to).
        Order("holiday_date ASC").
        Find(&holidays).Error
    return holidays, err
}

func (r *holidayRepository) GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error) {
    var holiday model.Holiday
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND holiday_date = ?", tenantID, date).
        First(&holiday).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &holiday, err
}

func (r *holidayRepository) ListByYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.Holiday, error) {
    var holidays []model.Holiday
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND EXTRACT(YEAR FROM holiday_date) = ?", tenantID, year).
        Order("holiday_date ASC").
        Find(&holidays).Error
    return holidays, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/holiday_test.go`

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

func TestHolidayRepository_Create(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    holiday := &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        Name:        "New Year",
        IsHalfDay:   false,
    }

    err := repo.Create(ctx, holiday)
    require.NoError(t, err)
    assert.NotEqual(t, uuid.Nil, holiday.ID)
}

func TestHolidayRepository_GetByID(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    holiday := &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        Name:        "New Year",
    }
    repo.Create(ctx, holiday)

    found, err := repo.GetByID(ctx, holiday.ID)
    require.NoError(t, err)
    assert.Equal(t, holiday.ID, found.ID)
    assert.Equal(t, holiday.Name, found.Name)
}

func TestHolidayRepository_GetByID_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    _, err := repo.GetByID(ctx, uuid.New())
    assert.Error(t, err)
}

func TestHolidayRepository_Update(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    holiday := &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        Name:        "Original Name",
    }
    repo.Create(ctx, holiday)

    holiday.Name = "Updated Name"
    err := repo.Update(ctx, holiday)
    require.NoError(t, err)

    found, _ := repo.GetByID(ctx, holiday.ID)
    assert.Equal(t, "Updated Name", found.Name)
}

func TestHolidayRepository_Delete(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    holiday := &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        Name:        "To Delete",
    }
    repo.Create(ctx, holiday)

    err := repo.Delete(ctx, holiday.ID)
    require.NoError(t, err)

    _, err = repo.GetByID(ctx, holiday.ID)
    assert.Error(t, err)
}

func TestHolidayRepository_GetByDateRange(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        Name:        "New Year",
    })
    repo.Create(ctx, &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC),
        Name:        "Christmas",
    })

    from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
    to := time.Date(2024, 12, 31, 0, 0, 0, 0, time.UTC)
    holidays, err := repo.GetByDateRange(ctx, tenantID, from, to)
    require.NoError(t, err)
    assert.Len(t, holidays, 2)
}

func TestHolidayRepository_GetByDate(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    date := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
    repo.Create(ctx, &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: date,
        Name:        "New Year",
    })

    found, err := repo.GetByDate(ctx, tenantID, date)
    require.NoError(t, err)
    assert.NotNil(t, found)
    assert.Equal(t, "New Year", found.Name)
}

func TestHolidayRepository_GetByDate_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    date := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

    found, err := repo.GetByDate(ctx, tenantID, date)
    require.NoError(t, err)
    assert.Nil(t, found)
}

func TestHolidayRepository_ListByYear(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewHolidayRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        Name:        "New Year 2024",
    })
    repo.Create(ctx, &model.Holiday{
        TenantID:    tenantID,
        HolidayDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
        Name:        "New Year 2025",
    })

    holidays, err := repo.ListByYear(ctx, tenantID, 2024)
    require.NoError(t, err)
    assert.Len(t, holidays, 1)
    assert.Equal(t, "New Year 2024", holidays[0].Name)
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] GetByDateRange returns holidays in date range
- [x] GetByDate returns nil if no holiday on date
- [x] ListByYear filters by year correctly
- [x] Unit tests for all repository methods
- [x] Tests cover success and error cases
