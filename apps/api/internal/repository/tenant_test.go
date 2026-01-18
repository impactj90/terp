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

func TestTenantRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
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
	repo := repository.NewTenantRepository(db)
	ctx := context.Background()

	// Create tenant first
	tenant := &model.Tenant{Name: "Test", Slug: "test"}
	require.NoError(t, repo.Create(ctx, tenant))

	// Test GetByID
	found, err := repo.GetByID(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Equal(t, tenant.ID, found.ID)
	assert.Equal(t, tenant.Name, found.Name)
}

func TestTenantRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTenantNotFound)
}

func TestTenantRepository_GetBySlug(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	ctx := context.Background()

	tenant := &model.Tenant{Name: "Test", Slug: "unique-slug"}
	require.NoError(t, repo.Create(ctx, tenant))

	found, err := repo.GetBySlug(ctx, "unique-slug")
	require.NoError(t, err)
	assert.Equal(t, tenant.ID, found.ID)
}

func TestTenantRepository_GetBySlug_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	ctx := context.Background()

	_, err := repo.GetBySlug(ctx, "nonexistent-slug")
	assert.ErrorIs(t, err, repository.ErrTenantNotFound)
}

func TestTenantRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	ctx := context.Background()

	tenant := &model.Tenant{Name: "Original", Slug: "test"}
	require.NoError(t, repo.Create(ctx, tenant))

	tenant.Name = "Updated"
	err := repo.Update(ctx, tenant)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated", found.Name)
}

func TestTenantRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	ctx := context.Background()

	require.NoError(t, repo.Create(ctx, &model.Tenant{Name: "Active", Slug: "active", IsActive: true}))

	// Create inactive tenant - must update after create because GORM's default:true
	// treats false as a zero value and uses the default instead
	inactive := &model.Tenant{Name: "Inactive", Slug: "inactive"}
	require.NoError(t, repo.Create(ctx, inactive))
	inactive.IsActive = false
	require.NoError(t, repo.Update(ctx, inactive))

	// All tenants
	all, err := repo.List(ctx, false)
	require.NoError(t, err)
	assert.Len(t, all, 2)

	// Active only
	active, err := repo.List(ctx, true)
	require.NoError(t, err)
	assert.Len(t, active, 1)
	assert.Equal(t, "Active", active[0].Name)
}

func TestTenantRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	ctx := context.Background()

	tenant := &model.Tenant{Name: "ToDelete", Slug: "delete"}
	require.NoError(t, repo.Create(ctx, tenant))

	err := repo.Delete(ctx, tenant.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, tenant.ID)
	assert.ErrorIs(t, err, repository.ErrTenantNotFound)
}

func TestTenantRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTenantNotFound)
}
