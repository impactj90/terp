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

func createTestTenantForContactTypeService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestContactTypeService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID:    tenant.ID,
		Code:        "EMAIL",
		Name:        "Email Address",
		DataType:    "email",
		Description: "Standard email contact",
	}

	ct, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "EMAIL", ct.Code)
	assert.Equal(t, "Email Address", ct.Name)
	assert.Equal(t, "email", ct.DataType)
	assert.Equal(t, "Standard email contact", ct.Description)
	assert.Equal(t, tenant.ID, ct.TenantID)
	assert.True(t, ct.IsActive)
}

func TestContactTypeService_Create_AllDataTypes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	dataTypes := []string{"text", "email", "phone", "url"}
	for _, dt := range dataTypes {
		input := service.CreateContactTypeInput{
			TenantID: tenant.ID,
			Code:     "TYPE_" + dt,
			Name:     "Contact " + dt,
			DataType: dt,
		}
		ct, err := svc.Create(ctx, input)
		require.NoError(t, err, "Failed to create type with data_type=%s", dt)
		assert.Equal(t, dt, ct.DataType)
	}
}

func TestContactTypeService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Email",
		DataType: "email",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrContactTypeCodeRequired)
}

func TestContactTypeService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "",
		DataType: "email",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrContactTypeNameRequired)
}

func TestContactTypeService_Create_InvalidDataType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "SOCIAL",
		Name:     "Social",
		DataType: "social_handle",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrContactTypeInvalidData)
}

func TestContactTypeService_Create_EmptyDataType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "Email",
		DataType: "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrContactTypeDataTypeReq)
}

func TestContactTypeService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "Email Address",
		DataType: "email",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "Another Email",
		DataType: "email",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrContactTypeCodeExists)
}

func TestContactTypeService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "Email Address",
		DataType: "email",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "EMAIL", found.Code)
}

func TestContactTypeService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrContactTypeNotFound)
}

func TestContactTypeService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "Original",
		DataType: "email",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newDesc := "New description"
	isActive := false
	updateInput := service.UpdateContactTypeInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "New description", updated.Description)
	assert.False(t, updated.IsActive)
	// Code and DataType should remain unchanged
	assert.Equal(t, "EMAIL", updated.Code)
	assert.Equal(t, "email", updated.DataType)
}

func TestContactTypeService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	newName := "Updated"
	_, err := svc.Update(ctx, uuid.New(), service.UpdateContactTypeInput{Name: &newName})
	assert.ErrorIs(t, err, service.ErrContactTypeNotFound)
}

func TestContactTypeService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "To Delete",
		DataType: "email",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrContactTypeNotFound)
}

func TestContactTypeService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrContactTypeNotFound)
}

func TestContactTypeService_Delete_InUse(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	typeSvc := service.NewContactTypeService(typeRepo)
	kindSvc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	// Create a contact type
	ctInput := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "Email",
		DataType: "email",
	}
	ct, err := typeSvc.Create(ctx, ctInput)
	require.NoError(t, err)

	// Create a contact kind referencing it
	ckInput := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "Work Email",
	}
	_, err = kindSvc.Create(ctx, ckInput)
	require.NoError(t, err)

	// Try to delete the contact type -- should fail
	err = typeSvc.Delete(ctx, ct.ID)
	assert.ErrorIs(t, err, service.ErrContactTypeInUse)
}

func TestContactTypeService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	codes := []string{"EMAIL", "PHONE", "URL"}
	for _, code := range codes {
		input := service.CreateContactTypeInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Contact " + code,
			DataType: "text",
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	types, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, types, 3)
}

func TestContactTypeService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForContactTypeService(t, db)

	input1 := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "EMAIL",
		Name:     "Active",
		DataType: "email",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate
	input2 := service.CreateContactTypeInput{
		TenantID: tenant.ID,
		Code:     "PHONE",
		Name:     "Inactive",
		DataType: "phone",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, created2.ID, service.UpdateContactTypeInput{IsActive: &isActive})
	require.NoError(t, err)

	types, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, types, 1)
	assert.Equal(t, "EMAIL", types[0].Code)
}
