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

func createTestTenantForATGService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "ATG Test Tenant " + uuid.New().String()[:8],
		Slug:     "atg-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func newAbsenceTypeGroupService(db *repository.DB) *service.AbsenceTypeGroupService {
	return service.NewAbsenceTypeGroupService(repository.NewAbsenceTypeGroupRepository(db))
}

func TestAbsenceTypeGroupService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	g, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID:    tenant.ID,
		Code:        "LEAVE",
		Name:        "Leave Types",
		Description: "All leave-related absence types",
	})
	require.NoError(t, err)
	assert.Equal(t, "LEAVE", g.Code)
	assert.Equal(t, "Leave Types", g.Name)
	assert.NotNil(t, g.Description)
	assert.Equal(t, "All leave-related absence types", *g.Description)
	assert.True(t, g.IsActive)
}

func TestAbsenceTypeGroupService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	_, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "DUP",
		Name:     "First",
	})
	require.NoError(t, err)

	_, err = svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "DUP",
		Name:     "Second",
	})
	assert.ErrorIs(t, err, service.ErrAbsenceTypeGroupCodeExists)
}

func TestAbsenceTypeGroupService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	_, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Test",
	})
	assert.ErrorIs(t, err, service.ErrAbsenceTypeGroupCodeRequired)
}

func TestAbsenceTypeGroupService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	_, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "TEST",
		Name:     "",
	})
	assert.ErrorIs(t, err, service.ErrAbsenceTypeGroupNameRequired)
}

func TestAbsenceTypeGroupService_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	created, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "GET01",
		Name:     "Get Test",
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "GET01", found.Code)
}

func TestAbsenceTypeGroupService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAbsenceTypeGroupNotFound)
}

func TestAbsenceTypeGroupService_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	created, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "UPD01",
		Name:     "Original",
	})
	require.NoError(t, err)

	newName := "Updated"
	newDesc := "Updated description"
	inactive := false
	updated, err := svc.Update(ctx, created.ID, service.UpdateAbsenceTypeGroupInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &inactive,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated", updated.Name)
	assert.NotNil(t, updated.Description)
	assert.Equal(t, "Updated description", *updated.Description)
	assert.False(t, updated.IsActive)
}

func TestAbsenceTypeGroupService_Update_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	_, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "EXIST",
		Name:     "Existing",
	})
	require.NoError(t, err)

	second, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "OTHER",
		Name:     "Other",
	})
	require.NoError(t, err)

	dupeCode := "EXIST"
	_, err = svc.Update(ctx, second.ID, service.UpdateAbsenceTypeGroupInput{
		Code: &dupeCode,
	})
	assert.ErrorIs(t, err, service.ErrAbsenceTypeGroupCodeExists)
}

func TestAbsenceTypeGroupService_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	created, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "DEL01",
		Name:     "To Delete",
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrAbsenceTypeGroupNotFound)
}

func TestAbsenceTypeGroupService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAbsenceTypeGroupNotFound)
}

func TestAbsenceTypeGroupService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newAbsenceTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForATGService(t, db)

	for _, code := range []string{"LST01", "LST02", "LST03"} {
		_, err := svc.Create(ctx, service.CreateAbsenceTypeGroupInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "List " + code,
		})
		require.NoError(t, err)
	}

	groups, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, groups, 3)
}
