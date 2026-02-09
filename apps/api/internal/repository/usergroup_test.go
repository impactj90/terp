package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/datatypes"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForUserGroup creates a tenant for use in user group tests.
func createTestTenantForUserGroup(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestUserGroupRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)
	ug := &model.UserGroup{
		TenantID:    &tenant.ID,
		Name:        "Administrators",
		Code:        "ADMIN",
		Description: "Admin group",
		IsAdmin:     true,
		Permissions: datatypes.JSON([]byte(`["read","write"]`)),
	}

	err := repo.Create(ctx, ug)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, ug.ID)
}

func TestUserGroupRepository_Create_WithDefaults(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "Users",
		Code:     "USERS",
	}

	err := repo.Create(ctx, ug)
	require.NoError(t, err)
	assert.False(t, ug.IsAdmin)
	assert.False(t, ug.IsSystem)
}

func TestUserGroupRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "Administrators",
		Code:     "ADMIN",
		IsAdmin:  true,
	}
	require.NoError(t, repo.Create(ctx, ug))

	found, err := repo.GetByID(ctx, ug.ID)
	require.NoError(t, err)
	assert.Equal(t, ug.ID, found.ID)
	assert.Equal(t, ug.Name, found.Name)
	assert.True(t, found.IsAdmin)
}

func TestUserGroupRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrUserGroupNotFound)
}

func TestUserGroupRepository_GetByName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "Administrators",
		Code:     "ADMIN",
		IsAdmin:  true,
	}
	require.NoError(t, repo.Create(ctx, ug))

	found, err := repo.GetByName(ctx, tenant.ID, "Administrators")
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, ug.ID, found.ID)
}

func TestUserGroupRepository_GetByName_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)

	found, err := repo.GetByName(ctx, tenant.ID, "NonExistent")
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestUserGroupRepository_GetByName_DifferentTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant1 := createTestTenantForUserGroup(t, db)
	tenant2 := createTestTenantForUserGroup(t, db)

	ug := &model.UserGroup{
		TenantID: &tenant1.ID,
		Name:     "Administrators",
		Code:     "ADMIN",
		IsAdmin:  true,
	}
	require.NoError(t, repo.Create(ctx, ug))

	// Should not find in different tenant
	found, err := repo.GetByName(ctx, tenant2.ID, "Administrators")
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestUserGroupRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "Original Name",
		Code:     "ORIGINAL",
		IsAdmin:  false,
	}
	require.NoError(t, repo.Create(ctx, ug))

	ug.Name = "Updated Name"
	ug.IsAdmin = true
	ug.Description = "Updated description"
	err := repo.Update(ctx, ug)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, ug.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
	assert.True(t, found.IsAdmin)
	assert.Equal(t, "Updated description", found.Description)
}

func TestUserGroupRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "To Delete",
		Code:     "TO_DELETE",
	}
	require.NoError(t, repo.Create(ctx, ug))

	err := repo.Delete(ctx, ug.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, ug.ID)
	assert.ErrorIs(t, err, repository.ErrUserGroupNotFound)
}

func TestUserGroupRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrUserGroupNotFound)
}

func TestUserGroupRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)
	require.NoError(t, repo.Create(ctx, &model.UserGroup{TenantID: &tenant.ID, Name: "Admins", Code: "ADMINS", IsAdmin: true}))
	require.NoError(t, repo.Create(ctx, &model.UserGroup{TenantID: &tenant.ID, Name: "Users", Code: "USERS", IsAdmin: false}))

	groups, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	// Count only tenant-specific groups (system groups also included)
	var tenantGroups []model.UserGroup
	for _, g := range groups {
		if g.TenantID != nil {
			tenantGroups = append(tenantGroups, g)
		}
	}
	assert.Len(t, tenantGroups, 2)
}

func TestUserGroupRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUserGroup(t, db)

	groups, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	// Only system groups should be present (no tenant-specific ones)
	for _, g := range groups {
		assert.Nil(t, g.TenantID)
	}
}

func TestUserGroupRepository_List_TenantIsolation(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	ctx := context.Background()

	tenant1 := createTestTenantForUserGroup(t, db)
	tenant2 := createTestTenantForUserGroup(t, db)

	require.NoError(t, repo.Create(ctx, &model.UserGroup{TenantID: &tenant1.ID, Name: "Tenant1 Group", Code: "TENANT1"}))
	require.NoError(t, repo.Create(ctx, &model.UserGroup{TenantID: &tenant2.ID, Name: "Tenant2 Group", Code: "TENANT2"}))

	groups1, err := repo.List(ctx, tenant1.ID)
	require.NoError(t, err)
	// Should contain tenant1's group + system groups, but not tenant2's group
	var found1 bool
	for _, g := range groups1 {
		if g.TenantID != nil {
			assert.Equal(t, "Tenant1 Group", g.Name)
			found1 = true
		}
	}
	assert.True(t, found1)

	groups2, err := repo.List(ctx, tenant2.ID)
	require.NoError(t, err)
	var found2 bool
	for _, g := range groups2 {
		if g.TenantID != nil {
			assert.Equal(t, "Tenant2 Group", g.Name)
			found2 = true
		}
	}
	assert.True(t, found2)
}
