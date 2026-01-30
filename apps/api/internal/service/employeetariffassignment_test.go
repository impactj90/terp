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

func setupAssignmentService(t *testing.T) (
	*service.EmployeeTariffAssignmentService,
	*repository.EmployeeRepository,
	*repository.TariffRepository,
	*model.Tenant,
) {
	t.Helper()
	db := testutil.SetupTestDB(t)

	tenantRepo := repository.NewTenantRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	assignmentRepo := repository.NewEmployeeTariffAssignmentRepository(db)

	svc := service.NewEmployeeTariffAssignmentService(assignmentRepo, employeeRepo, tariffRepo)

	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))

	return svc, employeeRepo, tariffRepo, tenant
}

func createTestEmployee(t *testing.T, employeeRepo *repository.EmployeeRepository, tenantID uuid.UUID, pn string) *model.Employee {
	t.Helper()
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: pn,
		PIN:             "0000",
		FirstName:       "Test",
		LastName:        "Employee",
		EntryDate:       time.Now().AddDate(0, 0, -30),
		IsActive:        true,
	}
	require.NoError(t, employeeRepo.Create(context.Background(), emp))
	return emp
}

func createTestAssignmentTariff(t *testing.T, tariffRepo *repository.TariffRepository, tenantID uuid.UUID, code string) *model.Tariff {
	t.Helper()
	tariff := &model.Tariff{
		TenantID: tenantID,
		Code:     code,
		Name:     "Tariff " + code,
		IsActive: true,
	}
	require.NoError(t, tariffRepo.Create(context.Background(), tariff))
	return tariff
}

func TestEmployeeTariffAssignment_Create_Success(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-01")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-01")

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)

	assignment, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:          tenant.ID,
		EmployeeID:        emp.ID,
		TariffID:          tariff.ID,
		EffectiveFrom:     from,
		EffectiveTo:       &to,
		OverwriteBehavior: model.OverwriteBehaviorPreserveManual,
		Notes:             "Initial assignment",
	})
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, assignment.ID)
	assert.Equal(t, emp.ID, assignment.EmployeeID)
	assert.Equal(t, tariff.ID, assignment.TariffID)
	assert.True(t, assignment.IsActive)
	assert.Equal(t, model.OverwriteBehaviorPreserveManual, assignment.OverwriteBehavior)
	assert.Equal(t, "Initial assignment", assignment.Notes)
}

func TestEmployeeTariffAssignment_Create_OpenEnded(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-02")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-02")

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	assignment, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from,
	})
	require.NoError(t, err)
	assert.Nil(t, assignment.EffectiveTo)
}

func TestEmployeeTariffAssignment_Create_InvalidDates(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-03")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-03")

	from := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC) // Before from

	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from,
		EffectiveTo:   &to,
	})
	assert.ErrorIs(t, err, service.ErrAssignmentInvalidDates)
}

func TestEmployeeTariffAssignment_Create_OverlapDetected(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-04")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-04")

	// Create first assignment: Jan - Jun 2026
	from1 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to1 := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from1,
		EffectiveTo:   &to1,
	})
	require.NoError(t, err)

	// Try to create overlapping assignment: Mar - Sep 2026
	from2 := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	to2 := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)
	_, err = svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from2,
		EffectiveTo:   &to2,
	})
	assert.ErrorIs(t, err, service.ErrAssignmentOverlap)
}

func TestEmployeeTariffAssignment_Create_NonOverlapping_Success(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-05")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-05")

	// Create first assignment: Jan - Jun 2026
	from1 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to1 := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from1,
		EffectiveTo:   &to1,
	})
	require.NoError(t, err)

	// Create non-overlapping: Jul - Dec 2026
	from2 := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	to2 := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	assignment2, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from2,
		EffectiveTo:   &to2,
	})
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, assignment2.ID)
}

func TestEmployeeTariffAssignment_Create_EmployeeNotFound(t *testing.T) {
	svc, _, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-06")

	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    uuid.New(), // non-existent
		TariffID:      tariff.ID,
		EffectiveFrom: time.Now(),
	})
	assert.ErrorIs(t, err, service.ErrAssignmentEmployeeNotFound)
}

func TestEmployeeTariffAssignment_Create_TariffNotFound(t *testing.T) {
	svc, employeeRepo, _, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-07")

	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      uuid.New(), // non-existent
		EffectiveFrom: time.Now(),
	})
	assert.ErrorIs(t, err, service.ErrAssignmentTariffNotFound)
}

func TestEmployeeTariffAssignment_Update_Success(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-08")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-08")

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	created, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from,
		EffectiveTo:   &to,
	})
	require.NoError(t, err)

	// Update effective_to date
	newTo := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)
	notes := "Extended"
	updated, err := svc.Update(ctx, created.ID, tenant.ID, service.UpdateEmployeeTariffAssignmentInput{
		EffectiveTo: &newTo,
		Notes:       &notes,
	})
	require.NoError(t, err)
	assert.Equal(t, "Extended", updated.Notes)
	assert.Equal(t, newTo.Truncate(24*time.Hour), updated.EffectiveTo.Truncate(24*time.Hour))
}

func TestEmployeeTariffAssignment_Update_NotFound(t *testing.T) {
	svc, _, _, tenant := setupAssignmentService(t)
	ctx := context.Background()

	notes := "test"
	_, err := svc.Update(ctx, uuid.New(), tenant.ID, service.UpdateEmployeeTariffAssignmentInput{
		Notes: &notes,
	})
	assert.ErrorIs(t, err, service.ErrAssignmentNotFound)
}

func TestEmployeeTariffAssignment_Delete_Success(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-09")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-09")

	created, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: time.Now(),
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	assert.NoError(t, err)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrAssignmentNotFound)
}

func TestEmployeeTariffAssignment_Delete_NotFound(t *testing.T) {
	svc, _, _, _ := setupAssignmentService(t)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAssignmentNotFound)
}

func TestEmployeeTariffAssignment_ListByEmployee(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-10")
	tariff1 := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-10A")
	tariff2 := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-10B")

	// Create two non-overlapping assignments
	from1 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to1 := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff1.ID,
		EffectiveFrom: from1,
		EffectiveTo:   &to1,
	})
	require.NoError(t, err)

	from2 := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	_, err = svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff2.ID,
		EffectiveFrom: from2,
	})
	require.NoError(t, err)

	assignments, err := svc.ListByEmployee(ctx, emp.ID, false)
	require.NoError(t, err)
	assert.Len(t, assignments, 2)
	// Should be ordered by effective_from ASC
	assert.True(t, assignments[0].EffectiveFrom.Before(assignments[1].EffectiveFrom) ||
		assignments[0].EffectiveFrom.Equal(assignments[1].EffectiveFrom))
}

func TestEmployeeTariffAssignment_GetEffective_FromAssignment(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-11")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-11")

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from,
		EffectiveTo:   &to,
	})
	require.NoError(t, err)

	// Query for a date within the assignment range
	result, err := svc.GetEffectiveTariff(ctx, emp.ID, time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	assert.Equal(t, "assignment", result.Source)
	assert.NotNil(t, result.Tariff)
	assert.Equal(t, tariff.ID, result.Tariff.ID)
	assert.NotNil(t, result.Assignment)
}

func TestEmployeeTariffAssignment_GetEffective_FallbackToDefault(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-12")

	// Create employee with default tariff
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E-ASSIGN-12",
		PIN:             "0000",
		FirstName:       "Test",
		LastName:        "Default",
		EntryDate:       time.Now().AddDate(0, 0, -30),
		TariffID:        &tariff.ID,
		IsActive:        true,
	}
	require.NoError(t, employeeRepo.Create(ctx, emp))

	// No assignments exist - should fall back to default
	result, err := svc.GetEffectiveTariff(ctx, emp.ID, time.Now())
	require.NoError(t, err)
	assert.Equal(t, "default", result.Source)
	assert.NotNil(t, result.Tariff)
	assert.Equal(t, tariff.ID, result.Tariff.ID)
	assert.Nil(t, result.Assignment)
}

func TestEmployeeTariffAssignment_GetEffective_None(t *testing.T) {
	svc, employeeRepo, _, tenant := setupAssignmentService(t)
	ctx := context.Background()

	// Employee with no default tariff and no assignments
	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-13")

	result, err := svc.GetEffectiveTariff(ctx, emp.ID, time.Now())
	require.NoError(t, err)
	assert.Equal(t, "none", result.Source)
	assert.Nil(t, result.Tariff)
	assert.Nil(t, result.Assignment)
}

func TestEmployeeTariffAssignment_GetEffective_OutsideRange(t *testing.T) {
	svc, employeeRepo, tariffRepo, tenant := setupAssignmentService(t)
	ctx := context.Background()

	emp := createTestEmployee(t, employeeRepo, tenant.ID, "E-ASSIGN-14")
	tariff := createTestAssignmentTariff(t, tariffRepo, tenant.ID, "T-ASSIGN-14")

	// Assignment: Jan - Jun 2026
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from,
		EffectiveTo:   &to,
	})
	require.NoError(t, err)

	// Query for date outside the range
	result, err := svc.GetEffectiveTariff(ctx, emp.ID, time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	assert.Equal(t, "none", result.Source)
}
