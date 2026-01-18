# TICKET-013: Create Employment Type Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 2 - Reference Tables
**Dependencies**: TICKET-012

## Description

Create the EmploymentType model and repository.

## Files to Create

- `apps/api/internal/model/employmenttype.go`
- `apps/api/internal/repository/employmenttype.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

type EmploymentType struct {
    ID                 uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID           uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code               string          `gorm:"type:varchar(50);not null" json:"code"`
    Name               string          `gorm:"type:varchar(255);not null" json:"name"`
    WeeklyHoursDefault decimal.Decimal `gorm:"type:decimal(5,2);default:40.00" json:"weekly_hours_default"`
    IsActive           bool            `gorm:"default:true" json:"is_active"`
    CreatedAt          time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt          time.Time       `gorm:"default:now()" json:"updated_at"`
}

func (EmploymentType) TableName() string {
    return "employment_types"
}
```

### Repository

```go
package repository

import (
    "context"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type EmploymentTypeRepository interface {
    Create(ctx context.Context, et *model.EmploymentType) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.EmploymentType, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.EmploymentType, error)
    Update(ctx context.Context, et *model.EmploymentType) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error)
}

type employmentTypeRepository struct {
    db *gorm.DB
}

func NewEmploymentTypeRepository(db *gorm.DB) EmploymentTypeRepository {
    return &employmentTypeRepository{db: db}
}

func (r *employmentTypeRepository) Create(ctx context.Context, et *model.EmploymentType) error {
    return r.db.WithContext(ctx).Create(et).Error
}

func (r *employmentTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.EmploymentType, error) {
    var et model.EmploymentType
    err := r.db.WithContext(ctx).Where("id = ?", id).First(&et).Error
    return &et, err
}

func (r *employmentTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.EmploymentType, error) {
    var et model.EmploymentType
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND code = ?", tenantID, code).
        First(&et).Error
    return &et, err
}

func (r *employmentTypeRepository) Update(ctx context.Context, et *model.EmploymentType) error {
    return r.db.WithContext(ctx).Save(et).Error
}

func (r *employmentTypeRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.EmploymentType{}, "id = ?", id).Error
}

func (r *employmentTypeRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error) {
    var employmentTypes []model.EmploymentType
    err := r.db.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("code ASC").
        Find(&employmentTypes).Error
    return employmentTypes, err
}

func (r *employmentTypeRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error) {
    var employmentTypes []model.EmploymentType
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND is_active = ?", tenantID, true).
        Order("code ASC").
        Find(&employmentTypes).Error
    return employmentTypes, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/employmenttype_test.go`

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

func TestEmploymentTypeRepository_Create(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewEmploymentTypeRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    et := &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "FT",
        Name:               "Full Time",
        WeeklyHoursDefault: decimal.NewFromFloat(40.0),
        IsActive:           true,
    }

    err := repo.Create(ctx, et)
    require.NoError(t, err)
    assert.NotEqual(t, uuid.Nil, et.ID)
}

func TestEmploymentTypeRepository_GetByID(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewEmploymentTypeRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    et := &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "FT",
        Name:               "Full Time",
        WeeklyHoursDefault: decimal.NewFromFloat(40.0),
    }
    repo.Create(ctx, et)

    found, err := repo.GetByID(ctx, et.ID)
    require.NoError(t, err)
    assert.Equal(t, et.ID, found.ID)
    assert.Equal(t, et.Code, found.Code)
    assert.True(t, et.WeeklyHoursDefault.Equal(found.WeeklyHoursDefault))
}

func TestEmploymentTypeRepository_GetByID_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewEmploymentTypeRepository(db)
    ctx := context.Background()

    _, err := repo.GetByID(ctx, uuid.New())
    assert.Error(t, err)
}

func TestEmploymentTypeRepository_GetByCode(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewEmploymentTypeRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    et := &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "FT",
        Name:               "Full Time",
        WeeklyHoursDefault: decimal.NewFromFloat(40.0),
    }
    repo.Create(ctx, et)

    found, err := repo.GetByCode(ctx, tenantID, "FT")
    require.NoError(t, err)
    assert.Equal(t, et.ID, found.ID)
    assert.Equal(t, "FT", found.Code)
}

func TestEmploymentTypeRepository_Update(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewEmploymentTypeRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    et := &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "FT",
        Name:               "Original Name",
        WeeklyHoursDefault: decimal.NewFromFloat(40.0),
    }
    repo.Create(ctx, et)

    et.Name = "Updated Name"
    et.WeeklyHoursDefault = decimal.NewFromFloat(35.0)
    err := repo.Update(ctx, et)
    require.NoError(t, err)

    found, _ := repo.GetByID(ctx, et.ID)
    assert.Equal(t, "Updated Name", found.Name)
    assert.True(t, decimal.NewFromFloat(35.0).Equal(found.WeeklyHoursDefault))
}

func TestEmploymentTypeRepository_Delete(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewEmploymentTypeRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    et := &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "FT",
        Name:               "To Delete",
        WeeklyHoursDefault: decimal.NewFromFloat(40.0),
    }
    repo.Create(ctx, et)

    err := repo.Delete(ctx, et.ID)
    require.NoError(t, err)

    _, err = repo.GetByID(ctx, et.ID)
    assert.Error(t, err)
}

func TestEmploymentTypeRepository_List(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewEmploymentTypeRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "FT",
        Name:               "Full Time",
        WeeklyHoursDefault: decimal.NewFromFloat(40.0),
        IsActive:           true,
    })
    repo.Create(ctx, &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "PT",
        Name:               "Part Time",
        WeeklyHoursDefault: decimal.NewFromFloat(20.0),
        IsActive:           false,
    })

    types, err := repo.List(ctx, tenantID)
    require.NoError(t, err)
    assert.Len(t, types, 2)
}

func TestEmploymentTypeRepository_ListActive(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewEmploymentTypeRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "FT",
        Name:               "Full Time",
        WeeklyHoursDefault: decimal.NewFromFloat(40.0),
        IsActive:           true,
    })
    repo.Create(ctx, &model.EmploymentType{
        TenantID:           tenantID,
        Code:               "PT",
        Name:               "Part Time",
        WeeklyHoursDefault: decimal.NewFromFloat(20.0),
        IsActive:           false,
    })

    types, err := repo.ListActive(ctx, tenantID)
    require.NoError(t, err)
    assert.Len(t, types, 1)
    assert.Equal(t, "FT", types[0].Code)
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] WeeklyHoursDefault uses decimal type
- [x] Unit tests for all repository methods
- [x] Tests cover success and error cases
