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

func createTestTenantForEmployeeTariffService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestDayPlanForEmployeeTariff(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string) *model.DayPlan {
	t.Helper()
	dayPlanRepo := repository.NewDayPlanRepository(db)
	plan := &model.DayPlan{
		TenantID:     tenantID,
		Code:         code,
		Name:         "Day Plan " + code,
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
		IsActive:     true,
	}
	require.NoError(t, dayPlanRepo.Create(context.Background(), plan))
	return plan
}

func createTestWeekPlanForEmployeeTariff(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string, dayPlanID uuid.UUID) *model.WeekPlan {
	t.Helper()
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	planID := dayPlanID
	plan := &model.WeekPlan{
		TenantID:           tenantID,
		Code:               code,
		Name:               "Week Plan " + code,
		MondayDayPlanID:    &planID,
		TuesdayDayPlanID:   &planID,
		WednesdayDayPlanID: &planID,
		ThursdayDayPlanID:  &planID,
		FridayDayPlanID:    &planID,
		SaturdayDayPlanID:  &planID,
		SundayDayPlanID:    &planID,
		IsActive:           true,
	}
	require.NoError(t, weekPlanRepo.Create(context.Background(), plan))
	return plan
}

func createTestTariffForEmployeeTariff(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string, weekPlanID *uuid.UUID) *model.Tariff {
	t.Helper()
	tariffRepo := repository.NewTariffRepository(db)
	tariff := &model.Tariff{
		TenantID:   tenantID,
		Code:       code,
		Name:       "Tariff " + code,
		WeekPlanID: weekPlanID,
		IsActive:   true,
	}
	require.NoError(t, tariffRepo.Create(context.Background(), tariff))
	return tariff
}

func TestEmployeeService_TariffSyncPreservesManualPlans(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	employeeRepo := repository.NewEmployeeRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	svc := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo, nil)

	tenant := createTestTenantForEmployeeTariffService(t, db)
	dayPlanA := createTestDayPlanForEmployeeTariff(t, db, tenant.ID, "DP-A")
	dayPlanB := createTestDayPlanForEmployeeTariff(t, db, tenant.ID, "DP-B")
	weekPlanA := createTestWeekPlanForEmployeeTariff(t, db, tenant.ID, "WP-A", dayPlanA.ID)
	weekPlanB := createTestWeekPlanForEmployeeTariff(t, db, tenant.ID, "WP-B", dayPlanB.ID)
	tariffA := createTestTariffForEmployeeTariff(t, db, tenant.ID, "TA", &weekPlanA.ID)
	tariffB := createTestTariffForEmployeeTariff(t, db, tenant.ID, "TB", &weekPlanB.ID)

	employee, err := svc.Create(ctx, service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "Jane",
		LastName:        "Doe",
		EntryDate:       time.Now().AddDate(0, 0, -1),
		TariffID:        &tariffA.ID,
	})
	require.NoError(t, err)

	targetDate := time.Now().Truncate(24*time.Hour).AddDate(0, 0, 1)
	manualPlan := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: employee.ID,
		PlanDate:   targetDate,
		DayPlanID:  &dayPlanB.ID,
		Source:     model.EmployeeDayPlanSourceManual,
	}
	require.NoError(t, empDayPlanRepo.Upsert(ctx, manualPlan))

	_, err = svc.Update(ctx, employee.ID, service.UpdateEmployeeInput{TariffID: &tariffB.ID})
	require.NoError(t, err)

	plans, err := empDayPlanRepo.GetForEmployeeDateRange(ctx, employee.ID, targetDate, targetDate)
	require.NoError(t, err)
	require.Len(t, plans, 1)
	assert.Equal(t, model.EmployeeDayPlanSourceManual, plans[0].Source)
	assert.Equal(t, dayPlanB.ID, *plans[0].DayPlanID)
}

func TestEmployeeService_ClearTariffRemovesOnlyTariffPlans(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	employeeRepo := repository.NewEmployeeRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	svc := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo, nil)

	tenant := createTestTenantForEmployeeTariffService(t, db)
	dayPlanA := createTestDayPlanForEmployeeTariff(t, db, tenant.ID, "DP-CLEAR")
	weekPlanA := createTestWeekPlanForEmployeeTariff(t, db, tenant.ID, "WP-CLEAR", dayPlanA.ID)
	tariffA := createTestTariffForEmployeeTariff(t, db, tenant.ID, "TC", &weekPlanA.ID)

	employee, err := svc.Create(ctx, service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E002",
		PIN:             "5678",
		FirstName:       "Alex",
		LastName:        "Smith",
		EntryDate:       time.Now().AddDate(0, 0, -1),
		TariffID:        &tariffA.ID,
	})
	require.NoError(t, err)

	targetDate := time.Now().Truncate(24*time.Hour).AddDate(0, 0, 1)
	manualPlan := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: employee.ID,
		PlanDate:   targetDate,
		DayPlanID:  &dayPlanA.ID,
		Source:     model.EmployeeDayPlanSourceManual,
	}
	require.NoError(t, empDayPlanRepo.Upsert(ctx, manualPlan))

	_, err = svc.Update(ctx, employee.ID, service.UpdateEmployeeInput{ClearTariffID: true})
	require.NoError(t, err)

	startDate := time.Now().Truncate(24 * time.Hour)
	endDate := startDate.AddDate(0, 0, 1)
	plans, err := empDayPlanRepo.GetForEmployeeDateRange(ctx, employee.ID, startDate, endDate)
	require.NoError(t, err)

	for _, plan := range plans {
		assert.NotEqual(t, model.EmployeeDayPlanSourceTariff, plan.Source)
	}

	foundManual := false
	for _, plan := range plans {
		if plan.PlanDate.Equal(targetDate) {
			foundManual = true
		}
	}
	assert.True(t, foundManual)
}

func TestEmployeeService_BulkAssignTariff_SelectedIDs(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	employeeRepo := repository.NewEmployeeRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	svc := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo, nil)

	tenant := createTestTenantForEmployeeTariffService(t, db)
	tariff := createTestTariffForEmployeeTariff(t, db, tenant.ID, "TBULK", nil)

	emp1, err := svc.Create(ctx, service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E101",
		PIN:             "1111",
		FirstName:       "Sam",
		LastName:        "One",
		EntryDate:       time.Now().AddDate(0, 0, -1),
	})
	require.NoError(t, err)
	emp2, err := svc.Create(ctx, service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E102",
		PIN:             "2222",
		FirstName:       "Pat",
		LastName:        "Two",
		EntryDate:       time.Now().AddDate(0, 0, -1),
	})
	require.NoError(t, err)

	updated, skipped, err := svc.BulkAssignTariff(ctx, service.BulkAssignTariffInput{
		TenantID:    tenant.ID,
		EmployeeIDs: []uuid.UUID{emp1.ID, emp2.ID},
		TariffID:    &tariff.ID,
	})
	require.NoError(t, err)
	assert.Equal(t, 2, updated)
	assert.Equal(t, 0, skipped)

	updatedEmp1, err := employeeRepo.GetByID(ctx, emp1.ID)
	require.NoError(t, err)
	updatedEmp2, err := employeeRepo.GetByID(ctx, emp2.ID)
	require.NoError(t, err)
	assert.Equal(t, tariff.ID, *updatedEmp1.TariffID)
	assert.Equal(t, tariff.ID, *updatedEmp2.TariffID)
}

func TestEmployeeService_BulkAssignTariff_Filtered(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	employeeRepo := repository.NewEmployeeRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	svc := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo, nil)

	tenant := createTestTenantForEmployeeTariffService(t, db)
	tariff := createTestTariffForEmployeeTariff(t, db, tenant.ID, "TFILTER", nil)

	emp1, err := svc.Create(ctx, service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E201",
		PIN:             "3333",
		FirstName:       "Alice",
		LastName:        "Filter",
		EntryDate:       time.Now().AddDate(0, 0, -1),
	})
	require.NoError(t, err)
	emp2, err := svc.Create(ctx, service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E202",
		PIN:             "4444",
		FirstName:       "Bob",
		LastName:        "Filter",
		EntryDate:       time.Now().AddDate(0, 0, -1),
	})
	require.NoError(t, err)

	filter := &repository.EmployeeFilter{
		SearchQuery: "Alice",
	}
	updated, skipped, err := svc.BulkAssignTariff(ctx, service.BulkAssignTariffInput{
		TenantID: tenant.ID,
		Filter:   filter,
		TariffID: &tariff.ID,
	})
	require.NoError(t, err)
	assert.Equal(t, 1, updated)
	assert.Equal(t, 0, skipped)

	updatedEmp1, err := employeeRepo.GetByID(ctx, emp1.ID)
	require.NoError(t, err)
	updatedEmp2, err := employeeRepo.GetByID(ctx, emp2.ID)
	require.NoError(t, err)
	assert.Equal(t, tariff.ID, *updatedEmp1.TariffID)
	assert.Nil(t, updatedEmp2.TariffID)
}
