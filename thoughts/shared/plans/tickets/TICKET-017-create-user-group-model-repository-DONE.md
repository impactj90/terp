# TICKET-017: Create User Group Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 3 - User Groups & Permissions
**Dependencies**: TICKET-016

## Description

Create the UserGroup model and repository.

## Files to Create

- `apps/api/internal/model/usergroup.go`
- `apps/api/internal/repository/usergroup.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "gorm.io/datatypes"
)

type UserGroup struct {
    ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Name        string         `gorm:"type:varchar(100);not null" json:"name"`
    Description string         `gorm:"type:text" json:"description,omitempty"`
    Permissions datatypes.JSON `gorm:"type:jsonb;default:'[]'" json:"permissions"`
    IsAdmin     bool           `gorm:"default:false" json:"is_admin"`
    IsSystem    bool           `gorm:"default:false" json:"is_system"`
    CreatedAt   time.Time      `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time      `gorm:"default:now()" json:"updated_at"`

    // Relations
    Users []User `gorm:"foreignKey:UserGroupID" json:"users,omitempty"`
}

func (UserGroup) TableName() string {
    return "user_groups"
}

// HasPermission checks if the group has a specific permission
func (ug *UserGroup) HasPermission(permission string) bool {
    if ug.IsAdmin {
        return true
    }
    var perms []string
    if err := json.Unmarshal(ug.Permissions, &perms); err != nil {
        return false
    }
    for _, p := range perms {
        if p == permission {
            return true
        }
    }
    return false
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

type UserGroupRepository interface {
    Create(ctx context.Context, ug *model.UserGroup) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.UserGroup, error)
    GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.UserGroup, error)
    Update(ctx context.Context, ug *model.UserGroup) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.UserGroup, error)
}

type userGroupRepository struct {
    db *gorm.DB
}

func NewUserGroupRepository(db *gorm.DB) UserGroupRepository {
    return &userGroupRepository{db: db}
}

func (r *userGroupRepository) Create(ctx context.Context, ug *model.UserGroup) error {
    return r.db.WithContext(ctx).Create(ug).Error
}

func (r *userGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.UserGroup, error) {
    var ug model.UserGroup
    err := r.db.WithContext(ctx).Where("id = ?", id).First(&ug).Error
    return &ug, err
}

func (r *userGroupRepository) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.UserGroup, error) {
    var ug model.UserGroup
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND name = ?", tenantID, name).
        First(&ug).Error
    return &ug, err
}

func (r *userGroupRepository) Update(ctx context.Context, ug *model.UserGroup) error {
    return r.db.WithContext(ctx).Save(ug).Error
}

func (r *userGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.UserGroup{}, "id = ?", id).Error
}

func (r *userGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.UserGroup, error) {
    var groups []model.UserGroup
    err := r.db.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("name ASC").
        Find(&groups).Error
    return groups, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/usergroup_test.go`

```go
package repository

import (
    "context"
    "testing"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
    "gorm.io/datatypes"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/testutil"
)

func TestUserGroupRepository_Create(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserGroupRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    ug := &model.UserGroup{
        TenantID:    tenantID,
        Name:        "Administrators",
        Description: "Admin group",
        IsAdmin:     true,
        Permissions: datatypes.JSON([]byte(`["read","write"]`)),
    }

    err := repo.Create(ctx, ug)
    require.NoError(t, err)
    assert.NotEqual(t, uuid.Nil, ug.ID)
}

func TestUserGroupRepository_GetByID(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserGroupRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    ug := &model.UserGroup{
        TenantID: tenantID,
        Name:     "Administrators",
        IsAdmin:  true,
    }
    repo.Create(ctx, ug)

    found, err := repo.GetByID(ctx, ug.ID)
    require.NoError(t, err)
    assert.Equal(t, ug.ID, found.ID)
    assert.Equal(t, ug.Name, found.Name)
    assert.True(t, found.IsAdmin)
}

func TestUserGroupRepository_GetByID_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserGroupRepository(db)
    ctx := context.Background()

    _, err := repo.GetByID(ctx, uuid.New())
    assert.Error(t, err)
}

func TestUserGroupRepository_GetByName(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserGroupRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    ug := &model.UserGroup{
        TenantID: tenantID,
        Name:     "Administrators",
        IsAdmin:  true,
    }
    repo.Create(ctx, ug)

    found, err := repo.GetByName(ctx, tenantID, "Administrators")
    require.NoError(t, err)
    assert.Equal(t, ug.ID, found.ID)
}

func TestUserGroupRepository_Update(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserGroupRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    ug := &model.UserGroup{
        TenantID: tenantID,
        Name:     "Original Name",
        IsAdmin:  false,
    }
    repo.Create(ctx, ug)

    ug.Name = "Updated Name"
    ug.IsAdmin = true
    err := repo.Update(ctx, ug)
    require.NoError(t, err)

    found, _ := repo.GetByID(ctx, ug.ID)
    assert.Equal(t, "Updated Name", found.Name)
    assert.True(t, found.IsAdmin)
}

func TestUserGroupRepository_Delete(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserGroupRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    ug := &model.UserGroup{
        TenantID: tenantID,
        Name:     "To Delete",
    }
    repo.Create(ctx, ug)

    err := repo.Delete(ctx, ug.ID)
    require.NoError(t, err)

    _, err = repo.GetByID(ctx, ug.ID)
    assert.Error(t, err)
}

func TestUserGroupRepository_List(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewUserGroupRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.UserGroup{TenantID: tenantID, Name: "Admins", IsAdmin: true})
    repo.Create(ctx, &model.UserGroup{TenantID: tenantID, Name: "Users", IsAdmin: false})

    groups, err := repo.List(ctx, tenantID)
    require.NoError(t, err)
    assert.Len(t, groups, 2)
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] HasPermission helper method works
- [x] IsAdmin bypasses permission check
- [x] Unit tests for all repository methods
- [x] Tests cover success and error cases
- [x] Service layer with tests
- [x] Handler layer with tests
- [x] Routes registered in main.go
