package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForAccessZoneService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestAccessZoneService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessZoneService(t, db)

	input := service.CreateAccessZoneInput{
		TenantID:    tenant.ID,
		Code:        "ZONE_A",
		Name:        "Building A Entrance",
		Description: "Main entrance",
	}

	az, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "ZONE_A", az.Code)
	assert.Equal(t, "Building A Entrance", az.Name)
	assert.Equal(t, "Main entrance", az.Description)
	assert.Equal(t, tenant.ID, az.TenantID)
	assert.True(t, az.IsActive)
}

func TestAccessZoneService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessZoneService(t, db)

	input := service.CreateAccessZoneInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Zone",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrAccessZoneCodeRequired)
}

func TestAccessZoneService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessZoneService(t, db)

	input := service.CreateAccessZoneInput{
		TenantID: tenant.ID,
		Code:     "ZONE_A",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrAccessZoneNameRequired)
}

func TestAccessZoneService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessZoneService(t, db)

	input := service.CreateAccessZoneInput{
		TenantID: tenant.ID,
		Code:     "ZONE_A",
		Name:     "Zone A",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateAccessZoneInput{
		TenantID: tenant.ID,
		Code:     "ZONE_A",
		Name:     "Another Zone A",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrAccessZoneCodeExists)
}

func TestAccessZoneService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessZoneService(t, db)

	input := service.CreateAccessZoneInput{
		TenantID: tenant.ID,
		Code:     "ZONE_A",
		Name:     "Zone A",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "ZONE_A", found.Code)
}

func TestAccessZoneService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAccessZoneNotFound)
}

func TestAccessZoneService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessZoneService(t, db)

	input := service.CreateAccessZoneInput{
		TenantID: tenant.ID,
		Code:     "ZONE_A",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newDesc := "New description"
	isActive := false
	updateInput := service.UpdateAccessZoneInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "New description", updated.Description)
	assert.False(t, updated.IsActive)
	assert.Equal(t, "ZONE_A", updated.Code)
}

func TestAccessZoneService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessZoneService(t, db)

	input := service.CreateAccessZoneInput{
		TenantID: tenant.ID,
		Code:     "ZONE_A",
		Name:     "Zone to Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrAccessZoneNotFound)
}

func TestAccessZoneService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAccessZoneNotFound)
}

func TestAccessZoneService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessZoneRepository(db)
	svc := service.NewAccessZoneService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessZoneService(t, db)

	codes := []string{"ZONE_A", "ZONE_B", "ZONE_C"}
	for _, code := range codes {
		input := service.CreateAccessZoneInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Zone " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	zones, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, zones, 3)
}
