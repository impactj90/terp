package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createAccessTestFixtures(t *testing.T, db *repository.DB) (*model.Tenant, *model.Employee, *model.AccessProfile) {
	t.Helper()
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(ctx, tenant)
	require.NoError(t, err)

	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "EMP" + uuid.New().String()[:4],
		FirstName:       "Test",
		LastName:        "Employee",
	}
	err = empRepo.Create(ctx, emp)
	require.NoError(t, err)

	profileRepo := repository.NewAccessProfileRepository(db)
	profileSvc := service.NewAccessProfileService(profileRepo)
	profile, err := profileSvc.Create(ctx, service.CreateAccessProfileInput{
		TenantID: tenant.ID,
		Code:     "STD_" + uuid.New().String()[:4],
		Name:     "Standard Access",
	})
	require.NoError(t, err)

	return tenant, emp, profile
}

func TestEmployeeAccessAssignmentService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, profile := createAccessTestFixtures(t, db)

	input := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		AccessProfileID: profile.ID,
	}

	a, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, emp.ID, a.EmployeeID)
	assert.Equal(t, profile.ID, a.AccessProfileID)
	assert.True(t, a.IsActive)
}

func TestEmployeeAccessAssignmentService_Create_WithDates(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, profile := createAccessTestFixtures(t, db)

	vf := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	vt := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)

	input := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		AccessProfileID: profile.ID,
		ValidFrom:       &vf,
		ValidTo:         &vt,
	}

	a, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.NotNil(t, a.ValidFrom)
	assert.NotNil(t, a.ValidTo)
}

func TestEmployeeAccessAssignmentService_Create_EmptyEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	input := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        uuid.New(),
		EmployeeID:      uuid.Nil,
		AccessProfileID: uuid.New(),
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrEmployeeAccessAssignmentEmployeeRequired)
}

func TestEmployeeAccessAssignmentService_Create_EmptyProfile(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	input := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        uuid.New(),
		EmployeeID:      uuid.New(),
		AccessProfileID: uuid.Nil,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrEmployeeAccessAssignmentProfileRequired)
}

func TestEmployeeAccessAssignmentService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, profile := createAccessTestFixtures(t, db)

	input := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		AccessProfileID: profile.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestEmployeeAccessAssignmentService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrEmployeeAccessAssignmentNotFound)
}

func TestEmployeeAccessAssignmentService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, profile := createAccessTestFixtures(t, db)

	input := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		AccessProfileID: profile.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	isActive := false
	updateInput := service.UpdateEmployeeAccessAssignmentInput{
		IsActive: &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.False(t, updated.IsActive)
}

func TestEmployeeAccessAssignmentService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, profile := createAccessTestFixtures(t, db)

	input := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		AccessProfileID: profile.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrEmployeeAccessAssignmentNotFound)
}

func TestEmployeeAccessAssignmentService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrEmployeeAccessAssignmentNotFound)
}

func TestEmployeeAccessAssignmentService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeAccessAssignmentRepository(db)
	svc := service.NewEmployeeAccessAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, profile := createAccessTestFixtures(t, db)

	for i := 0; i < 3; i++ {
		input := service.CreateEmployeeAccessAssignmentInput{
			TenantID:        tenant.ID,
			EmployeeID:      emp.ID,
			AccessProfileID: profile.ID,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	assignments, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, assignments, 3)
}
