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

func createTestTenantForActivityService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestActivityService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	input := service.CreateActivityInput{
		TenantID:    tenant.ID,
		Code:        "ACT001",
		Name:        "Development",
		Description: "Software development activities",
	}

	a, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "ACT001", a.Code)
	assert.Equal(t, "Development", a.Name)
	assert.Equal(t, "Software development activities", a.Description)
	assert.Equal(t, tenant.ID, a.TenantID)
	assert.True(t, a.IsActive)
}

func TestActivityService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	input := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Development",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrActivityCodeRequired)
}

func TestActivityService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	input := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "ACT001",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrActivityNameRequired)
}

func TestActivityService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	input := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "ACT001",
		Name:     "Development",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "ACT001",
		Name:     "Testing",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrActivityCodeExists)
}

func TestActivityService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	input := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "ACT001",
		Name:     "Development",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "ACT001", found.Code)
}

func TestActivityService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrActivityNotFound)
}

func TestActivityService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	input := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "ACT001",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newDesc := "New description"
	isActive := false
	updateInput := service.UpdateActivityInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "New description", updated.Description)
	assert.False(t, updated.IsActive)
}

func TestActivityService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	newName := "Updated"
	_, err := svc.Update(ctx, uuid.New(), service.UpdateActivityInput{Name: &newName})
	assert.ErrorIs(t, err, service.ErrActivityNotFound)
}

func TestActivityService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	input := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "ACT001",
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrActivityNotFound)
}

func TestActivityService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrActivityNotFound)
}

func TestActivityService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	codes := []string{"ACT001", "ACT002", "ACT003"}
	for _, code := range codes {
		input := service.CreateActivityInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Activity " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	activities, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, activities, 3)
}

func TestActivityService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewActivityRepository(db)
	svc := service.NewActivityService(repo)
	ctx := context.Background()

	tenant := createTestTenantForActivityService(t, db)

	input1 := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "ACT001",
		Name:     "Active",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate
	input2 := service.CreateActivityInput{
		TenantID: tenant.ID,
		Code:     "ACT002",
		Name:     "Inactive",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, created2.ID, service.UpdateActivityInput{IsActive: &isActive})
	require.NoError(t, err)

	activities, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, activities, 1)
	assert.Equal(t, "ACT001", activities[0].Code)
}
