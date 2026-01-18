# TICKET-011: Create Cost Center Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 2 - Reference Tables
**Dependencies**: TICKET-010

## Description

Create the CostCenter model and repository.

## Files to Create

- `apps/api/internal/model/costcenter.go`
- `apps/api/internal/repository/costcenter.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type CostCenter struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (CostCenter) TableName() string {
    return "cost_centers"
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

type CostCenterRepository interface {
    Create(ctx context.Context, cc *model.CostCenter) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.CostCenter, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CostCenter, error)
    Update(ctx context.Context, cc *model.CostCenter) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error)
}

type costCenterRepository struct {
    db *gorm.DB
}

func NewCostCenterRepository(db *gorm.DB) CostCenterRepository {
    return &costCenterRepository{db: db}
}

func (r *costCenterRepository) Create(ctx context.Context, cc *model.CostCenter) error {
    return r.db.WithContext(ctx).Create(cc).Error
}

func (r *costCenterRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.CostCenter, error) {
    var cc model.CostCenter
    err := r.db.WithContext(ctx).Where("id = ?", id).First(&cc).Error
    return &cc, err
}

func (r *costCenterRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CostCenter, error) {
    var cc model.CostCenter
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND code = ?", tenantID, code).
        First(&cc).Error
    return &cc, err
}

func (r *costCenterRepository) Update(ctx context.Context, cc *model.CostCenter) error {
    return r.db.WithContext(ctx).Save(cc).Error
}

func (r *costCenterRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.CostCenter{}, "id = ?", id).Error
}

func (r *costCenterRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error) {
    var costCenters []model.CostCenter
    err := r.db.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("code ASC").
        Find(&costCenters).Error
    return costCenters, err
}

func (r *costCenterRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error) {
    var costCenters []model.CostCenter
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND is_active = ?", tenantID, true).
        Order("code ASC").
        Find(&costCenters).Error
    return costCenters, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/costcenter_test.go`

```go
package repository

import (
    "context"
    "testing"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/testutil"
)

func TestCostCenterRepository_Create(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    cc := &model.CostCenter{
        TenantID: tenantID,
        Code:     "CC001",
        Name:     "Marketing",
        IsActive: true,
    }

    err := repo.Create(ctx, cc)
    require.NoError(t, err)
    assert.NotEqual(t, uuid.Nil, cc.ID)
}

func TestCostCenterRepository_GetByID(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    cc := &model.CostCenter{
        TenantID: tenantID,
        Code:     "CC001",
        Name:     "Marketing",
    }
    repo.Create(ctx, cc)

    found, err := repo.GetByID(ctx, cc.ID)
    require.NoError(t, err)
    assert.Equal(t, cc.ID, found.ID)
    assert.Equal(t, cc.Code, found.Code)
    assert.Equal(t, cc.Name, found.Name)
}

func TestCostCenterRepository_GetByID_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    _, err := repo.GetByID(ctx, uuid.New())
    assert.Error(t, err)
}

func TestCostCenterRepository_GetByCode(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    cc := &model.CostCenter{
        TenantID: tenantID,
        Code:     "CC001",
        Name:     "Marketing",
    }
    repo.Create(ctx, cc)

    found, err := repo.GetByCode(ctx, tenantID, "CC001")
    require.NoError(t, err)
    assert.Equal(t, cc.ID, found.ID)
    assert.Equal(t, "CC001", found.Code)
}

func TestCostCenterRepository_GetByCode_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    _, err := repo.GetByCode(ctx, uuid.New(), "NONEXISTENT")
    assert.Error(t, err)
}

func TestCostCenterRepository_Update(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    cc := &model.CostCenter{
        TenantID: tenantID,
        Code:     "CC001",
        Name:     "Original Name",
    }
    repo.Create(ctx, cc)

    cc.Name = "Updated Name"
    err := repo.Update(ctx, cc)
    require.NoError(t, err)

    found, _ := repo.GetByID(ctx, cc.ID)
    assert.Equal(t, "Updated Name", found.Name)
}

func TestCostCenterRepository_Delete(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    cc := &model.CostCenter{
        TenantID: tenantID,
        Code:     "CC001",
        Name:     "To Delete",
    }
    repo.Create(ctx, cc)

    err := repo.Delete(ctx, cc.ID)
    require.NoError(t, err)

    _, err = repo.GetByID(ctx, cc.ID)
    assert.Error(t, err)
}

func TestCostCenterRepository_List(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.CostCenter{TenantID: tenantID, Code: "CC001", Name: "Marketing", IsActive: true})
    repo.Create(ctx, &model.CostCenter{TenantID: tenantID, Code: "CC002", Name: "Sales", IsActive: false})

    costCenters, err := repo.List(ctx, tenantID)
    require.NoError(t, err)
    assert.Len(t, costCenters, 2)
}

func TestCostCenterRepository_ListActive(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewCostCenterRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.CostCenter{TenantID: tenantID, Code: "CC001", Name: "Marketing", IsActive: true})
    repo.Create(ctx, &model.CostCenter{TenantID: tenantID, Code: "CC002", Name: "Sales", IsActive: false})

    costCenters, err := repo.ListActive(ctx, tenantID)
    require.NoError(t, err)
    assert.Len(t, costCenters, 1)
    assert.Equal(t, "CC001", costCenters[0].Code)
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] ListActive filters by is_active = true
- [x] Unit tests for all repository methods
- [x] Tests cover success and error cases

## Additional Implementation (beyond original plan)

- [x] Service layer with validation (`apps/api/internal/service/costcenter.go`)
- [x] Service tests (`apps/api/internal/service/costcenter_test.go`)
- [x] Handler layer with HTTP endpoints (`apps/api/internal/handler/costcenter.go`)
- [x] Handler tests (`apps/api/internal/handler/costcenter_test.go`)
- [x] Route registration (`apps/api/internal/handler/routes.go`)
- [x] Updated test database cleanup (`apps/api/internal/testutil/db.go`)
