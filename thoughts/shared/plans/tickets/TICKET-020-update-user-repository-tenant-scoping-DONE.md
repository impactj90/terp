# TICKET-020: Update User Repository for Tenant Scoping

**Type**: Repository
**Effort**: S
**Sprint**: 3 - User Groups & Permissions
**Dependencies**: TICKET-019

## Description

Update the User repository to include tenant scoping on all queries.

## Files to Modify

- `apps/api/internal/repository/user.go`

## Implementation

Update repository interface and implementation:

```go
package repository

type UserRepository interface {
    // Existing methods - now with tenant scoping
    Create(ctx context.Context, user *model.User) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.User, error)
    GetByEmail(ctx context.Context, tenantID uuid.UUID, email string) (*model.User, error)
    Update(ctx context.Context, user *model.User) error
    Delete(ctx context.Context, id uuid.UUID) error

    // New methods
    GetByUsername(ctx context.Context, tenantID uuid.UUID, username string) (*model.User, error)
    ListByTenant(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]model.User, error)
    GetWithRelations(ctx context.Context, id uuid.UUID) (*model.User, error)
}

type userRepository struct {
    db *gorm.DB
}

func (r *userRepository) GetByEmail(ctx context.Context, tenantID uuid.UUID, email string) (*model.User, error) {
    var user model.User
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND email = ? AND deleted_at IS NULL", tenantID, email).
        First(&user).Error
    return &user, err
}

func (r *userRepository) GetByUsername(ctx context.Context, tenantID uuid.UUID, username string) (*model.User, error) {
    var user model.User
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND username = ? AND deleted_at IS NULL", tenantID, username).
        First(&user).Error
    return &user, err
}

func (r *userRepository) ListByTenant(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]model.User, error) {
    var users []model.User
    query := r.db.WithContext(ctx).Where("tenant_id = ?", tenantID)
    if !includeInactive {
        query = query.Where("is_active = ?", true)
    }
    err := query.Find(&users).Error
    return users, err
}

func (r *userRepository) GetWithRelations(ctx context.Context, id uuid.UUID) (*model.User, error) {
    var user model.User
    err := r.db.WithContext(ctx).
        Preload("Tenant").
        Preload("UserGroup").
        Preload("Employee").
        Where("id = ? AND deleted_at IS NULL", id).
        First(&user).Error
    return &user, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/user_test.go`

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

func TestUserRepository_GetByEmail(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    user := &model.User{
        TenantID: tenantID,
        Email:    "test@example.com",
        Username: "testuser",
        IsActive: true,
    }
    repo.Create(ctx, user)

    found, err := repo.GetByEmail(ctx, tenantID, "test@example.com")
    require.NoError(t, err)
    assert.Equal(t, user.ID, found.ID)
    assert.Equal(t, user.Email, found.Email)
}

func TestUserRepository_GetByEmail_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserRepository(db)
    ctx := context.Background()

    _, err := repo.GetByEmail(ctx, uuid.New(), "nonexistent@example.com")
    assert.Error(t, err)
}

func TestUserRepository_GetByUsername(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    user := &model.User{
        TenantID: tenantID,
        Email:    "test@example.com",
        Username: "testuser",
        IsActive: true,
    }
    repo.Create(ctx, user)

    found, err := repo.GetByUsername(ctx, tenantID, "testuser")
    require.NoError(t, err)
    assert.Equal(t, user.ID, found.ID)
    assert.Equal(t, user.Username, found.Username)
}

func TestUserRepository_ListByTenant(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.User{TenantID: tenantID, Email: "user1@example.com", Username: "user1", IsActive: true})
    repo.Create(ctx, &model.User{TenantID: tenantID, Email: "user2@example.com", Username: "user2", IsActive: false})

    users, err := repo.ListByTenant(ctx, tenantID, true)
    require.NoError(t, err)
    assert.Len(t, users, 2)
}

func TestUserRepository_ListByTenant_ActiveOnly(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.User{TenantID: tenantID, Email: "user1@example.com", Username: "user1", IsActive: true})
    repo.Create(ctx, &model.User{TenantID: tenantID, Email: "user2@example.com", Username: "user2", IsActive: false})

    users, err := repo.ListByTenant(ctx, tenantID, false)
    require.NoError(t, err)
    assert.Len(t, users, 1)
    assert.True(t, users[0].IsActive)
}

func TestUserRepository_GetWithRelations(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    user := &model.User{
        TenantID: tenantID,
        Email:    "test@example.com",
        Username: "testuser",
        IsActive: true,
    }
    repo.Create(ctx, user)

    found, err := repo.GetWithRelations(ctx, user.ID)
    require.NoError(t, err)
    assert.NotNil(t, found)
    assert.Equal(t, user.ID, found.ID)
}
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] All queries filter by tenant_id
- [x] Soft deletes are respected (deleted_at IS NULL)
- [x] GetWithRelations preloads related entities
- [x] Unit tests for all repository methods
- [x] Tests cover success and error cases
