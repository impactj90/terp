package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/permissions"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForUserGroupService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func TestUserGroupService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID:    tenant.ID,
		Name:        "Administrators",
		Description: "Admin group with full access",
		Permissions: []string{
			permissions.ID("employees.view").String(),
			permissions.ID("employees.create").String(),
			permissions.ID("employees.delete").String(),
		},
		IsAdmin: true,
	}

	ug, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "Administrators", ug.Name)
	assert.Equal(t, &tenant.ID, ug.TenantID)
	assert.Equal(t, "Admin group with full access", ug.Description)
	assert.True(t, ug.IsAdmin)
	assert.False(t, ug.IsSystem)
}

func TestUserGroupService_Create_WithDefaults(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Users",
	}

	ug, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "Users", ug.Name)
	assert.False(t, ug.IsAdmin)
	assert.False(t, ug.IsSystem)
}

func TestUserGroupService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrUserGroupNameRequired)
}

func TestUserGroupService_Create_WhitespaceName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "   ",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrUserGroupNameRequired)
}

func TestUserGroupService_Create_DuplicateName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Administrators",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create with same name
	input2 := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Administrators",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrUserGroupNameExists)
}

func TestUserGroupService_Create_InvalidPermissionID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID:    tenant.ID,
		Name:        "Invalid Perms",
		Permissions: []string{"not-a-permission"},
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidPermissionID)
}

func TestUserGroupService_Create_SameNameDifferentTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant1 := createTestTenantForUserGroupService(t, db)
	tenant2 := createTestTenantForUserGroupService(t, db)

	input1 := service.CreateUserGroupInput{
		TenantID: tenant1.ID,
		Name:     "Administrators",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Same name in different tenant should succeed
	input2 := service.CreateUserGroupInput{
		TenantID: tenant2.ID,
		Name:     "Administrators",
	}
	ug, err := svc.Create(ctx, input2)
	require.NoError(t, err)
	assert.Equal(t, &tenant2.ID, ug.TenantID)
}

func TestUserGroupService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Test Group",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Test Group", found.Name)
}

func TestUserGroupService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrUserGroupNotFound)
}

func TestUserGroupService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID:    tenant.ID,
		Name:        "Original Name",
		Description: "Original description",
		IsAdmin:     false,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newDesc := "Updated description"
	isAdmin := true
	newPerms := []string{
		permissions.ID("employees.view").String(),
		permissions.ID("employees.edit").String(),
	}
	updateInput := service.UpdateUserGroupInput{
		Name:        &newName,
		Description: &newDesc,
		IsAdmin:     &isAdmin,
		Permissions: &newPerms,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "Updated description", updated.Description)
	assert.True(t, updated.IsAdmin)
}

func TestUserGroupService_Update_InvalidPermissionID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Test Group",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	invalid := []string{"not-a-permission"}
	updateInput := service.UpdateUserGroupInput{
		Permissions: &invalid,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrInvalidPermissionID)
}

func TestUserGroupService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateUserGroupInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrUserGroupNotFound)
}

func TestUserGroupService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Original Name",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateUserGroupInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrUserGroupNameRequired)
}

func TestUserGroupService_Update_DuplicateName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	// Create two groups
	input1 := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Group One",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	input2 := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Group Two",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to rename Group Two to Group One
	newName := "Group One"
	updateInput := service.UpdateUserGroupInput{
		Name: &newName,
	}

	_, err = svc.Update(ctx, created2.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrUserGroupNameExists)
}

func TestUserGroupService_Update_SameNameNoConflict(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Test Group",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Update with same name should succeed
	sameName := "Test Group"
	updateInput := service.UpdateUserGroupInput{
		Name: &sameName,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Test Group", updated.Name)
}

func TestUserGroupService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrUserGroupNotFound)
}

func TestUserGroupService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrUserGroupNotFound)
}

func TestUserGroupService_Delete_SystemGroup(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	// Create system group directly via repo
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "System Group",
		IsSystem: true,
	}
	require.NoError(t, repo.Create(ctx, ug))

	err := svc.Delete(ctx, ug.ID)
	assert.ErrorIs(t, err, service.ErrCannotDeleteSystemGroup)
}

func TestUserGroupService_Update_SystemGroup(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	// Create system group directly via repo
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "System Group",
		IsSystem: true,
	}
	require.NoError(t, repo.Create(ctx, ug))

	newName := "Updated Name"
	updateInput := service.UpdateUserGroupInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, ug.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCannotModifySystemGroup)
}

func TestUserGroupService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	// Create groups
	input1 := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Admins",
		IsAdmin:  true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	input2 := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Users",
		IsAdmin:  false,
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	groups, err := svc.List(ctx, tenant.ID, nil)
	require.NoError(t, err)
	assert.Len(t, groups, 2)
}

func TestUserGroupService_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	groups, err := svc.List(ctx, tenant.ID, nil)
	require.NoError(t, err)
	assert.Empty(t, groups)
}

func TestUserGroupService_GetByName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Test Group",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByName(ctx, tenant.ID, "Test Group")
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, created.ID, found.ID)
}

func TestUserGroupService_GetByName_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserGroupRepository(db)
	svc := service.NewUserGroupService(repo, nil)
	ctx := context.Background()

	tenant := createTestTenantForUserGroupService(t, db)

	found, err := svc.GetByName(ctx, tenant.ID, "NonExistent")
	require.NoError(t, err)
	assert.Nil(t, found)
}
