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

func createTestTenantForAccessProfileService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestAccessProfileService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	input := service.CreateAccessProfileInput{
		TenantID:    tenant.ID,
		Code:        "STANDARD",
		Name:        "Standard Access",
		Description: "Default access profile",
	}

	ap, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "STANDARD", ap.Code)
	assert.Equal(t, "Standard Access", ap.Name)
	assert.Equal(t, "Default access profile", ap.Description)
	assert.Equal(t, tenant.ID, ap.TenantID)
	assert.True(t, ap.IsActive)
}

func TestAccessProfileService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	input := service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Profile",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrAccessProfileCodeRequired)
}

func TestAccessProfileService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	input := service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrAccessProfileNameRequired)
}

func TestAccessProfileService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	input := service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "Standard",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "Another Standard",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrAccessProfileCodeExists)
}

func TestAccessProfileService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	input := service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "Standard Access",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "STANDARD", found.Code)
}

func TestAccessProfileService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAccessProfileNotFound)
}

func TestAccessProfileService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	input := service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newDesc := "New description"
	isActive := false
	updateInput := service.UpdateAccessProfileInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "New description", updated.Description)
	assert.False(t, updated.IsActive)
	assert.Equal(t, "STANDARD", updated.Code)
}

func TestAccessProfileService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	input := service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "Profile to Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrAccessProfileNotFound)
}

func TestAccessProfileService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAccessProfileNotFound)
}

func TestAccessProfileService_Delete_InUse(t *testing.T) {
	db := testutil.SetupTestDB(t)
	profileRepo := repository.NewAccessProfileRepository(db)
	assignmentRepo := repository.NewEmployeeAccessAssignmentRepository(db)
	profileSvc := service.NewAccessProfileService(profileRepo)
	assignmentSvc := service.NewEmployeeAccessAssignmentService(assignmentRepo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	// Create an access profile
	apInput := service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "Standard",
	}
	ap, err := profileSvc.Create(ctx, apInput)
	require.NoError(t, err)

	// Create an employee for the assignment
	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:       tenant.ID,
		PersonnelNumber: "EMP001",
		FirstName:      "Test",
		LastName:       "Employee",
	}
	err = empRepo.Create(ctx, emp)
	require.NoError(t, err)

	// Create assignment referencing the profile
	aInput := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		AccessProfileID: ap.ID,
	}
	_, err = assignmentSvc.Create(ctx, aInput)
	require.NoError(t, err)

	// Try to delete the access profile -- should fail
	err = profileSvc.Delete(ctx, ap.ID)
	assert.ErrorIs(t, err, service.ErrAccessProfileInUse)
}

func TestAccessProfileService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccessProfileRepository(db)
	svc := service.NewAccessProfileService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccessProfileService(t, db)

	codes := []string{"STANDARD", "PREMIUM", "VIP"}
	for _, code := range codes {
		input := service.CreateAccessProfileInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Profile " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	profiles, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, profiles, 3)
}
