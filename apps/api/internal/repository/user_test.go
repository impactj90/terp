package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForUser creates a tenant for use in user tests.
func createTestTenantForUser(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestUserRepository_GetByEmail(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUser(t, db)
	username := "testuser"
	user := &model.User{
		TenantID:    &tenant.ID,
		Email:       "test@example.com",
		Username:    &username,
		DisplayName: "Test User",
		IsActive:    true,
	}
	require.NoError(t, repo.Create(ctx, user))

	found, err := repo.GetByEmail(ctx, tenant.ID, "test@example.com")
	require.NoError(t, err)
	assert.Equal(t, user.ID, found.ID)
	assert.Equal(t, user.Email, found.Email)
}

func TestUserRepository_GetByEmail_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUser(t, db)

	_, err := repo.GetByEmail(ctx, tenant.ID, "nonexistent@example.com")
	assert.ErrorIs(t, err, repository.ErrUserNotFound)
}

func TestUserRepository_GetByEmail_DifferentTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant1 := createTestTenantForUser(t, db)
	tenant2 := createTestTenantForUser(t, db)

	username := "testuser"
	user := &model.User{
		TenantID:    &tenant1.ID,
		Email:       "test@example.com",
		Username:    &username,
		DisplayName: "Test User",
		IsActive:    true,
	}
	require.NoError(t, repo.Create(ctx, user))

	// Should not find in different tenant
	_, err := repo.GetByEmail(ctx, tenant2.ID, "test@example.com")
	assert.ErrorIs(t, err, repository.ErrUserNotFound)
}

func TestUserRepository_GetByUsername(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUser(t, db)
	username := "testuser"
	user := &model.User{
		TenantID:    &tenant.ID,
		Email:       "test@example.com",
		Username:    &username,
		DisplayName: "Test User",
		IsActive:    true,
	}
	require.NoError(t, repo.Create(ctx, user))

	found, err := repo.GetByUsername(ctx, tenant.ID, "testuser")
	require.NoError(t, err)
	assert.Equal(t, user.ID, found.ID)
	assert.Equal(t, *user.Username, *found.Username)
}

func TestUserRepository_GetByUsername_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUser(t, db)

	_, err := repo.GetByUsername(ctx, tenant.ID, "nonexistent")
	assert.ErrorIs(t, err, repository.ErrUserNotFound)
}

func TestUserRepository_GetByUsername_DifferentTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant1 := createTestTenantForUser(t, db)
	tenant2 := createTestTenantForUser(t, db)

	username := "testuser"
	user := &model.User{
		TenantID:    &tenant1.ID,
		Email:       "test@example.com",
		Username:    &username,
		DisplayName: "Test User",
		IsActive:    true,
	}
	require.NoError(t, repo.Create(ctx, user))

	// Should not find in different tenant
	_, err := repo.GetByUsername(ctx, tenant2.ID, "testuser")
	assert.ErrorIs(t, err, repository.ErrUserNotFound)
}

func TestUserRepository_ListByTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUser(t, db)
	username1 := "user1"
	username2 := "user2"
	require.NoError(t, repo.Create(ctx, &model.User{
		TenantID:    &tenant.ID,
		Email:       "user1@example.com",
		Username:    &username1,
		DisplayName: "User 1",
		IsActive:    true,
	}))
	require.NoError(t, repo.Create(ctx, &model.User{
		TenantID:    &tenant.ID,
		Email:       "user2@example.com",
		Username:    &username2,
		DisplayName: "User 2",
		IsActive:    true,
	}))

	users, err := repo.ListByTenant(ctx, tenant.ID, true)
	require.NoError(t, err)
	assert.Len(t, users, 2)
}

func TestUserRepository_ListByTenant_ActiveOnly(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUser(t, db)
	username1 := "user1"
	username2 := "user2"
	require.NoError(t, repo.Create(ctx, &model.User{
		TenantID:    &tenant.ID,
		Email:       "user1@example.com",
		Username:    &username1,
		DisplayName: "User 1",
		IsActive:    true,
	}))

	// Create inactive user - must update after create due to GORM default handling
	inactiveUser := &model.User{
		TenantID:    &tenant.ID,
		Email:       "user2@example.com",
		Username:    &username2,
		DisplayName: "User 2",
	}
	require.NoError(t, repo.Create(ctx, inactiveUser))
	inactiveUser.IsActive = false
	require.NoError(t, repo.Update(ctx, inactiveUser))

	users, err := repo.ListByTenant(ctx, tenant.ID, false)
	require.NoError(t, err)
	assert.Len(t, users, 1)
	assert.True(t, users[0].IsActive)
}

func TestUserRepository_ListByTenant_TenantIsolation(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant1 := createTestTenantForUser(t, db)
	tenant2 := createTestTenantForUser(t, db)

	username1 := "user1"
	username2 := "user2"
	require.NoError(t, repo.Create(ctx, &model.User{
		TenantID:    &tenant1.ID,
		Email:       "user1@example.com",
		Username:    &username1,
		DisplayName: "Tenant1 User",
		IsActive:    true,
	}))
	require.NoError(t, repo.Create(ctx, &model.User{
		TenantID:    &tenant2.ID,
		Email:       "user2@example.com",
		Username:    &username2,
		DisplayName: "Tenant2 User",
		IsActive:    true,
	}))

	users1, err := repo.ListByTenant(ctx, tenant1.ID, true)
	require.NoError(t, err)
	assert.Len(t, users1, 1)
	assert.Equal(t, "Tenant1 User", users1[0].DisplayName)

	users2, err := repo.ListByTenant(ctx, tenant2.ID, true)
	require.NoError(t, err)
	assert.Len(t, users2, 1)
	assert.Equal(t, "Tenant2 User", users2[0].DisplayName)
}

func TestUserRepository_ListByTenant_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUser(t, db)

	users, err := repo.ListByTenant(ctx, tenant.ID, true)
	require.NoError(t, err)
	assert.Empty(t, users)
}

func TestUserRepository_GetWithRelations(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForUser(t, db)
	username := "testuser"
	user := &model.User{
		TenantID:    &tenant.ID,
		Email:       "test@example.com",
		Username:    &username,
		DisplayName: "Test User",
		IsActive:    true,
	}
	require.NoError(t, repo.Create(ctx, user))

	found, err := repo.GetWithRelations(ctx, user.ID)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, user.ID, found.ID)
	// Tenant should be preloaded
	assert.NotNil(t, found.Tenant)
	assert.Equal(t, tenant.ID, found.Tenant.ID)
}

func TestUserRepository_GetWithRelations_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewUserRepository(db)
	ctx := context.Background()

	_, err := repo.GetWithRelations(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrUserNotFound)
}
