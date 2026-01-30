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

func createShiftServiceTestTenant(t *testing.T, db *repository.DB) *model.Tenant {
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
	return tenant
}

func TestShiftService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	tenant := createShiftServiceTestTenant(t, db)

	input := service.CreateShiftInput{
		TenantID: tenant.ID,
		Code:     "EARLY",
		Name:     "Early Shift",
	}

	s, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "EARLY", s.Code)
	assert.Equal(t, "Early Shift", s.Name)
	assert.True(t, s.IsActive)
}

func TestShiftService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	tenant := createShiftServiceTestTenant(t, db)

	code := "DUP_" + uuid.New().String()[:4]
	input := service.CreateShiftInput{
		TenantID: tenant.ID,
		Code:     code,
		Name:     "Shift 1",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateShiftInput{
		TenantID: tenant.ID,
		Code:     code,
		Name:     "Shift 2",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrShiftCodeExists)
}

func TestShiftService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	input := service.CreateShiftInput{
		TenantID: uuid.New(),
		Code:     "",
		Name:     "Shift",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrShiftCodeRequired)
}

func TestShiftService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	input := service.CreateShiftInput{
		TenantID: uuid.New(),
		Code:     "CODE",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrShiftNameRequired)
}

func TestShiftService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	tenant := createShiftServiceTestTenant(t, db)

	created, err := svc.Create(ctx, service.CreateShiftInput{
		TenantID: tenant.ID,
		Code:     "GET_" + uuid.New().String()[:4],
		Name:     "Get Shift",
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestShiftService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrShiftNotFound)
}

func TestShiftService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	tenant := createShiftServiceTestTenant(t, db)

	created, err := svc.Create(ctx, service.CreateShiftInput{
		TenantID: tenant.ID,
		Code:     "UPD_" + uuid.New().String()[:4],
		Name:     "Original",
	})
	require.NoError(t, err)

	newName := "Updated"
	updated, err := svc.Update(ctx, created.ID, service.UpdateShiftInput{
		Name: &newName,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated", updated.Name)
}

func TestShiftService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	tenant := createShiftServiceTestTenant(t, db)

	created, err := svc.Create(ctx, service.CreateShiftInput{
		TenantID: tenant.ID,
		Code:     "DEL_" + uuid.New().String()[:4],
		Name:     "Delete Me",
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrShiftNotFound)
}

func TestShiftService_Delete_InUse(t *testing.T) {
	db := testutil.SetupTestDB(t)
	shiftRepo := repository.NewShiftRepository(db)
	shiftSvc := service.NewShiftService(shiftRepo)
	saRepo := repository.NewShiftAssignmentRepository(db)
	saSvc := service.NewShiftAssignmentService(saRepo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	// Create an assignment referencing this shift
	_, err := saSvc.Create(ctx, service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	})
	require.NoError(t, err)

	// Try to delete shift -- should fail because it is referenced
	err = shiftSvc.Delete(ctx, shift.ID)
	assert.ErrorIs(t, err, service.ErrShiftInUse)
}

func TestShiftService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrShiftNotFound)
}

func TestShiftService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftRepository(db)
	svc := service.NewShiftService(repo)
	ctx := context.Background()

	tenant := createShiftServiceTestTenant(t, db)

	for i := 0; i < 3; i++ {
		_, err := svc.Create(ctx, service.CreateShiftInput{
			TenantID: tenant.ID,
			Code:     "LIST_" + uuid.New().String()[:4],
			Name:     "Shift",
		})
		require.NoError(t, err)
	}

	shifts, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, shifts, 3)
}
