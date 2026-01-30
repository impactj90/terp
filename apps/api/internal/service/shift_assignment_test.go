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

func createShiftTestFixtures(t *testing.T, db *repository.DB) (*model.Tenant, *model.Employee, *model.Shift) {
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

	shiftRepo := repository.NewShiftRepository(db)
	shiftSvc := service.NewShiftService(shiftRepo)
	shift, err := shiftSvc.Create(ctx, service.CreateShiftInput{
		TenantID: tenant.ID,
		Code:     "EARLY_" + uuid.New().String()[:4],
		Name:     "Early Shift",
	})
	require.NoError(t, err)

	return tenant, emp, shift
}

func TestShiftAssignmentService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	}

	a, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, emp.ID, a.EmployeeID)
	assert.Equal(t, shift.ID, a.ShiftID)
	assert.True(t, a.IsActive)
}

func TestShiftAssignmentService_Create_WithDates(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	vf := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	vt := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
		ValidFrom:  &vf,
		ValidTo:    &vt,
		Notes:      "Coverage for Q1-Q4",
	}

	a, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.NotNil(t, a.ValidFrom)
	assert.NotNil(t, a.ValidTo)
	assert.Equal(t, "Coverage for Q1-Q4", a.Notes)
}

func TestShiftAssignmentService_Create_InvalidDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	vf := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	vt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
		ValidFrom:  &vf,
		ValidTo:    &vt,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrShiftAssignmentDateRangeInvalid)
}

func TestShiftAssignmentService_Create_EmptyEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	input := service.CreateShiftAssignmentInput{
		TenantID:   uuid.New(),
		EmployeeID: uuid.Nil,
		ShiftID:    uuid.New(),
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrShiftAssignmentEmployeeRequired)
}

func TestShiftAssignmentService_Create_EmptyShift(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	input := service.CreateShiftAssignmentInput{
		TenantID:   uuid.New(),
		EmployeeID: uuid.New(),
		ShiftID:    uuid.Nil,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrShiftAssignmentShiftRequired)
}

func TestShiftAssignmentService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestShiftAssignmentService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrShiftAssignmentNotFound)
}

func TestShiftAssignmentService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	isActive := false
	notes := "Updated notes"
	updateInput := service.UpdateShiftAssignmentInput{
		IsActive: &isActive,
		Notes:    &notes,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.False(t, updated.IsActive)
	assert.Equal(t, "Updated notes", updated.Notes)
}

func TestShiftAssignmentService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ShiftID:    shift.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrShiftAssignmentNotFound)
}

func TestShiftAssignmentService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrShiftAssignmentNotFound)
}

func TestShiftAssignmentService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewShiftAssignmentRepository(db)
	svc := service.NewShiftAssignmentService(repo)
	ctx := context.Background()

	tenant, emp, shift := createShiftTestFixtures(t, db)

	for i := 0; i < 3; i++ {
		input := service.CreateShiftAssignmentInput{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ShiftID:    shift.ID,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	assignments, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, assignments, 3)
}
