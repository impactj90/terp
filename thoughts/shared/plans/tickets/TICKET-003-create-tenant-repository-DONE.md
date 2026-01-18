# TICKET-003: Create Tenant Repository

**Type**: Repository
**Effort**: S
**Sprint**: 1 - Multi-Tenant Foundation
**Dependencies**: TICKET-002

## Description

Create the Tenant repository with data access methods.

## Files to Create

- `apps/api/internal/repository/tenant.go`

## Implementation

```go
package repository

import (
    "context"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type TenantRepository interface {
    Create(ctx context.Context, tenant *model.Tenant) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error)
    GetBySlug(ctx context.Context, slug string) (*model.Tenant, error)
    Update(ctx context.Context, tenant *model.Tenant) error
    List(ctx context.Context, activeOnly bool) ([]model.Tenant, error)
    Delete(ctx context.Context, id uuid.UUID) error
}

type tenantRepository struct {
    db *gorm.DB
}

func NewTenantRepository(db *gorm.DB) TenantRepository {
    return &tenantRepository{db: db}
}

func (r *tenantRepository) Create(ctx context.Context, tenant *model.Tenant) error {
    return r.db.WithContext(ctx).Create(tenant).Error
}

func (r *tenantRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error) {
    var tenant model.Tenant
    err := r.db.WithContext(ctx).Where("id = ?", id).First(&tenant).Error
    if err != nil {
        return nil, err
    }
    return &tenant, nil
}

func (r *tenantRepository) GetBySlug(ctx context.Context, slug string) (*model.Tenant, error) {
    var tenant model.Tenant
    err := r.db.WithContext(ctx).Where("slug = ?", slug).First(&tenant).Error
    if err != nil {
        return nil, err
    }
    return &tenant, nil
}

func (r *tenantRepository) Update(ctx context.Context, tenant *model.Tenant) error {
    return r.db.WithContext(ctx).Save(tenant).Error
}

func (r *tenantRepository) List(ctx context.Context, activeOnly bool) ([]model.Tenant, error) {
    var tenants []model.Tenant
    query := r.db.WithContext(ctx)
    if activeOnly {
        query = query.Where("is_active = ?", true)
    }
    err := query.Find(&tenants).Error
    return tenants, err
}

func (r *tenantRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.Tenant{}, "id = ?", id).Error
}
```

## Unit Tests

**File**: `apps/api/internal/repository/tenant_test.go`

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

func TestTenantRepository_Create(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewTenantRepository(db)
    ctx := context.Background()

    tenant := &model.Tenant{
        Name:     "Test Tenant",
        Slug:     "test-tenant",
        IsActive: true,
    }

    err := repo.Create(ctx, tenant)
    require.NoError(t, err)
    assert.NotEqual(t, uuid.Nil, tenant.ID)
}

func TestTenantRepository_GetByID(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewTenantRepository(db)
    ctx := context.Background()

    // Create tenant first
    tenant := &model.Tenant{Name: "Test", Slug: "test"}
    repo.Create(ctx, tenant)

    // Test GetByID
    found, err := repo.GetByID(ctx, tenant.ID)
    require.NoError(t, err)
    assert.Equal(t, tenant.ID, found.ID)
    assert.Equal(t, tenant.Name, found.Name)
}

func TestTenantRepository_GetByID_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewTenantRepository(db)
    ctx := context.Background()

    _, err := repo.GetByID(ctx, uuid.New())
    assert.Error(t, err)
}

func TestTenantRepository_GetBySlug(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewTenantRepository(db)
    ctx := context.Background()

    tenant := &model.Tenant{Name: "Test", Slug: "unique-slug"}
    repo.Create(ctx, tenant)

    found, err := repo.GetBySlug(ctx, "unique-slug")
    require.NoError(t, err)
    assert.Equal(t, tenant.ID, found.ID)
}

func TestTenantRepository_Update(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewTenantRepository(db)
    ctx := context.Background()

    tenant := &model.Tenant{Name: "Original", Slug: "test"}
    repo.Create(ctx, tenant)

    tenant.Name = "Updated"
    err := repo.Update(ctx, tenant)
    require.NoError(t, err)

    found, _ := repo.GetByID(ctx, tenant.ID)
    assert.Equal(t, "Updated", found.Name)
}

func TestTenantRepository_List(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewTenantRepository(db)
    ctx := context.Background()

    repo.Create(ctx, &model.Tenant{Name: "Active", Slug: "active", IsActive: true})
    repo.Create(ctx, &model.Tenant{Name: "Inactive", Slug: "inactive", IsActive: false})

    // All tenants
    all, err := repo.List(ctx, false)
    require.NoError(t, err)
    assert.Len(t, all, 2)

    // Active only
    active, err := repo.List(ctx, true)
    require.NoError(t, err)
    assert.Len(t, active, 1)
}

func TestTenantRepository_Delete(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewTenantRepository(db)
    ctx := context.Background()

    tenant := &model.Tenant{Name: "ToDelete", Slug: "delete"}
    repo.Create(ctx, tenant)

    err := repo.Delete(ctx, tenant.ID)
    require.NoError(t, err)

    _, err = repo.GetByID(ctx, tenant.ID)
    assert.Error(t, err)
}
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] All CRUD methods implemented
- [x] Context passed to all DB operations
- [x] Unit tests for all repository methods
- [x] Tests cover success and error cases
