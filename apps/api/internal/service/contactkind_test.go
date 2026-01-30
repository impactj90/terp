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

func createTestTenantForContactKindService(t *testing.T, db *repository.DB) *model.Tenant {
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

func createTestContactType(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string) *model.ContactType {
	t.Helper()
	repo := repository.NewContactTypeRepository(db)
	svc := service.NewContactTypeService(repo)
	ct, err := svc.Create(context.Background(), service.CreateContactTypeInput{
		TenantID: tenantID,
		Code:     code,
		Name:     "Test Type " + code,
		DataType: "text",
	})
	require.NoError(t, err)
	return ct
}

func TestContactKindService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "Work Email",
	}

	ck, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "WORK_EMAIL", ck.Code)
	assert.Equal(t, "Work Email", ck.Label)
	assert.Equal(t, ct.ID, ck.ContactTypeID)
	assert.Equal(t, tenant.ID, ck.TenantID)
	assert.True(t, ck.IsActive)
}

func TestContactKindService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "",
		Label:         "Work Email",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrContactKindCodeRequired)
}

func TestContactKindService_Create_EmptyLabel(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrContactKindLabelReq)
}

func TestContactKindService_Create_MissingTypeID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: uuid.Nil,
		Code:          "WORK_EMAIL",
		Label:         "Work Email",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrContactKindTypeIDReq)
}

func TestContactKindService_Create_TypeNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: uuid.New(), // Non-existent type
		Code:          "WORK_EMAIL",
		Label:         "Work Email",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrContactKindTypeNotFound)
}

func TestContactKindService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "Work Email",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "Another Work Email",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrContactKindCodeExists)
}

func TestContactKindService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "Work Email",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "WORK_EMAIL", found.Code)
}

func TestContactKindService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrContactKindNotFound)
}

func TestContactKindService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newLabel := "Updated Label"
	isActive := false
	updateInput := service.UpdateContactKindInput{
		Label:    &newLabel,
		IsActive: &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Label", updated.Label)
	assert.False(t, updated.IsActive)
	// Code and ContactTypeID should remain unchanged
	assert.Equal(t, "WORK_EMAIL", updated.Code)
	assert.Equal(t, ct.ID, updated.ContactTypeID)
}

func TestContactKindService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	newLabel := "Updated"
	_, err := svc.Update(ctx, uuid.New(), service.UpdateContactKindInput{Label: &newLabel})
	assert.ErrorIs(t, err, service.ErrContactKindNotFound)
}

func TestContactKindService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	input := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrContactKindNotFound)
}

func TestContactKindService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrContactKindNotFound)
}

func TestContactKindService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	codes := []string{"WORK_EMAIL", "PERSONAL_EMAIL", "BACKUP_EMAIL"}
	for _, code := range codes {
		input := service.CreateContactKindInput{
			TenantID:      tenant.ID,
			ContactTypeID: ct.ID,
			Code:          code,
			Label:         "Kind " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	kinds, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, kinds, 3)
}

func TestContactKindService_ListByContactType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	emailType := createTestContactType(t, db, tenant.ID, "EMAIL")
	phoneType := createTestContactType(t, db, tenant.ID, "PHONE")

	// Two email kinds
	for _, code := range []string{"WORK_EMAIL", "PERSONAL_EMAIL"} {
		input := service.CreateContactKindInput{
			TenantID:      tenant.ID,
			ContactTypeID: emailType.ID,
			Code:          code,
			Label:         "Kind " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	// One phone kind
	phoneInput := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: phoneType.ID,
		Code:          "MOBILE",
		Label:         "Mobile Phone",
	}
	_, err := svc.Create(ctx, phoneInput)
	require.NoError(t, err)

	emailKinds, err := svc.ListByContactType(ctx, tenant.ID, emailType.ID)
	require.NoError(t, err)
	assert.Len(t, emailKinds, 2)

	phoneKinds, err := svc.ListByContactType(ctx, tenant.ID, phoneType.ID)
	require.NoError(t, err)
	assert.Len(t, phoneKinds, 1)
}

func TestContactKindService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	typeRepo := repository.NewContactTypeRepository(db)
	kindRepo := repository.NewContactKindRepository(db)
	svc := service.NewContactKindService(kindRepo, typeRepo)
	ctx := context.Background()

	tenant := createTestTenantForContactKindService(t, db)
	ct := createTestContactType(t, db, tenant.ID, "EMAIL")

	input1 := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "WORK_EMAIL",
		Label:         "Active",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate
	input2 := service.CreateContactKindInput{
		TenantID:      tenant.ID,
		ContactTypeID: ct.ID,
		Code:          "OLD_EMAIL",
		Label:         "Inactive",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, created2.ID, service.UpdateContactKindInput{IsActive: &isActive})
	require.NoError(t, err)

	kinds, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, kinds, 1)
	assert.Equal(t, "WORK_EMAIL", kinds[0].Code)
}
