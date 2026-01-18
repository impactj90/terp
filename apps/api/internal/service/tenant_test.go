package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func TestTenantService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	slug := "test-" + uuid.New().String()[:8]
	tenant, err := svc.Create(ctx, "Test Tenant", slug)
	require.NoError(t, err)
	assert.Equal(t, "Test Tenant", tenant.Name)
	assert.Equal(t, slug, tenant.Slug)
	assert.True(t, tenant.IsActive)
}

func TestTenantService_Create_NormalizesSlug(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	suffix := uuid.New().String()[:8]
	tenant, err := svc.Create(ctx, "  Test Tenant  ", "  TEST-"+suffix+"  ")
	require.NoError(t, err)
	assert.Equal(t, "Test Tenant", tenant.Name)
	assert.Equal(t, "test-"+suffix, tenant.Slug)
}

func TestTenantService_Create_SlugExists(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	slug := "existing-" + uuid.New().String()[:8]
	_, err := svc.Create(ctx, "First", slug)
	require.NoError(t, err)

	_, err = svc.Create(ctx, "Second", slug)
	assert.ErrorIs(t, err, service.ErrTenantSlugExists)
}

func TestTenantService_Create_InvalidSlug_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	_, err := svc.Create(ctx, "Test", "")
	assert.ErrorIs(t, err, service.ErrInvalidTenantSlug)
}

func TestTenantService_Create_InvalidSlug_TooShort(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	_, err := svc.Create(ctx, "Test", "ab")
	assert.ErrorIs(t, err, service.ErrInvalidTenantSlug)
}

func TestTenantService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	created, err := svc.Create(ctx, "Test", "test-"+uuid.New().String()[:8])
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Test", found.Name)
}

func TestTenantService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrTenantNotFound)
}

func TestTenantService_GetBySlug_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	slug := "unique-" + uuid.New().String()[:8]
	created, err := svc.Create(ctx, "Test", slug)
	require.NoError(t, err)

	found, err := svc.GetBySlug(ctx, slug)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestTenantService_GetBySlug_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	_, err := svc.GetBySlug(ctx, "nonexistent")
	assert.ErrorIs(t, err, service.ErrTenantNotFound)
}

func TestTenantService_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, "Original", "test-"+uuid.New().String()[:8])
	require.NoError(t, err)

	tenant.Name = "Updated"
	err = svc.Update(ctx, tenant)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated", found.Name)
}

func TestTenantService_List_All(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	_, err := svc.Create(ctx, "Tenant A", "tenant-a-"+uuid.New().String()[:8])
	require.NoError(t, err)
	_, err = svc.Create(ctx, "Tenant B", "tenant-b-"+uuid.New().String()[:8])
	require.NoError(t, err)

	tenants, err := svc.List(ctx, false)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(tenants), 2)
}

func TestTenantService_List_ActiveOnly(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	activeName := "Active-" + uuid.New().String()[:8]
	active, err := svc.Create(ctx, activeName, "active-"+uuid.New().String()[:8])
	require.NoError(t, err)

	inactive, err := svc.Create(ctx, "Inactive", "inactive-"+uuid.New().String()[:8])
	require.NoError(t, err)
	inactive.IsActive = false
	require.NoError(t, svc.Update(ctx, inactive))

	tenants, err := svc.List(ctx, true)
	require.NoError(t, err)
	// Find our active tenant in the results
	var found bool
	for _, tenant := range tenants {
		if tenant.ID == active.ID {
			found = true
			assert.Equal(t, activeName, tenant.Name)
			break
		}
	}
	assert.True(t, found, "Active tenant should be in results")
}

func TestTenantService_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, "ToDelete", "to-delete-"+uuid.New().String()[:8])
	require.NoError(t, err)

	err = svc.Delete(ctx, tenant.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, tenant.ID)
	assert.ErrorIs(t, err, service.ErrTenantNotFound)
}
