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

func createTestTenantForEDPService(t *testing.T, db *repository.DB) *model.Tenant {
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

func createTestEmployeeForEDPService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "EMP-" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:6],
		FirstName:       "Test",
		LastName:        "Employee",
		IsActive:        true,
	}
	require.NoError(t, empRepo.Create(context.Background(), emp))
	return emp
}

func createTestDayPlanForEDPService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.DayPlan {
	t.Helper()
	dayPlanRepo := repository.NewDayPlanRepository(db)
	plan := &model.DayPlan{
		TenantID:     tenantID,
		Code:         "DP-" + uuid.New().String()[:8],
		Name:         "Test Day Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
		IsActive:     true,
	}
	require.NoError(t, dayPlanRepo.Create(context.Background(), plan))
	return plan
}

func newEDPService(db *repository.DB) *service.EmployeeDayPlanService {
	edpRepo := repository.NewEmployeeDayPlanRepository(db)
	empRepo := repository.NewEmployeeRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	shiftRepo := repository.NewShiftRepository(db)
	return service.NewEmployeeDayPlanService(edpRepo, empRepo, dayPlanRepo, shiftRepo)
}

func TestEmployeeDayPlanService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)

	// Create plans for 3 consecutive days
	baseDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		_, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			PlanDate:   baseDate.AddDate(0, 0, i),
			DayPlanID:  &dp.ID,
			Source:     "manual",
		})
		require.NoError(t, err)
	}

	// List all plans in range
	plans, err := svc.List(ctx, service.ListEmployeeDayPlansInput{
		TenantID: tenant.ID,
		From:     baseDate,
		To:       baseDate.AddDate(0, 0, 2),
	})
	require.NoError(t, err)
	assert.Len(t, plans, 3)
}

func TestEmployeeDayPlanService_List_ByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp1 := createTestEmployeeForEDPService(t, db, tenant.ID)
	emp2 := createTestEmployeeForEDPService(t, db, tenant.ID)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)

	baseDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	// Create a plan for each employee
	_, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID: tenant.ID, EmployeeID: emp1.ID, PlanDate: baseDate, DayPlanID: &dp.ID, Source: "manual",
	})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID: tenant.ID, EmployeeID: emp2.ID, PlanDate: baseDate, DayPlanID: &dp.ID, Source: "manual",
	})
	require.NoError(t, err)

	// Filter by employee1 only
	plans, err := svc.List(ctx, service.ListEmployeeDayPlansInput{
		TenantID:   tenant.ID,
		EmployeeID: &emp1.ID,
		From:       baseDate,
		To:         baseDate,
	})
	require.NoError(t, err)
	assert.Len(t, plans, 1)
	assert.Equal(t, emp1.ID, plans[0].EmployeeID)
}

func TestEmployeeDayPlanService_List_DateRangeRequired(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)

	_, err := svc.List(ctx, service.ListEmployeeDayPlansInput{
		TenantID: tenant.ID,
	})
	assert.ErrorIs(t, err, service.ErrEDPDateRangeReq)
}

func TestEmployeeDayPlanService_List_InvalidDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)

	_, err := svc.List(ctx, service.ListEmployeeDayPlansInput{
		TenantID: tenant.ID,
		From:     time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC),
		To:       time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	})
	assert.ErrorIs(t, err, service.ErrEDPDateRangeInvalid)
}

func TestEmployeeDayPlanService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)

	plan, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		DayPlanID:  &dp.ID,
		Source:     "manual",
		Notes:      "Override for this day",
	})
	require.NoError(t, err)
	assert.Equal(t, emp.ID, plan.EmployeeID)
	assert.Equal(t, model.EmployeeDayPlanSourceManual, plan.Source)
	assert.Equal(t, "Override for this day", plan.Notes)
}

func TestEmployeeDayPlanService_Create_OffDay(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)

	plan, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Source:     "manual",
	})
	require.NoError(t, err)
	assert.Nil(t, plan.DayPlanID)
	assert.True(t, plan.IsOffDay())
}

func TestEmployeeDayPlanService_Create_InvalidEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)

	_, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID:   tenant.ID,
		EmployeeID: uuid.New(), // Non-existent
		PlanDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Source:     "manual",
	})
	assert.ErrorIs(t, err, service.ErrEDPInvalidEmployee)
}

func TestEmployeeDayPlanService_Create_InvalidDayPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)
	invalidID := uuid.New()

	_, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		DayPlanID:  &invalidID,
		Source:     "manual",
	})
	assert.ErrorIs(t, err, service.ErrEDPInvalidDayPlan)
}

func TestEmployeeDayPlanService_Create_InvalidSource(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)

	_, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Source:     "invalid_source",
	})
	assert.ErrorIs(t, err, service.ErrEDPInvalidSource)
}

func TestEmployeeDayPlanService_Create_MissingSource(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)

	_, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Source:     "",
	})
	assert.ErrorIs(t, err, service.ErrEDPSourceReq)
}

func TestEmployeeDayPlanService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)
	dp1 := createTestDayPlanForEDPService(t, db, tenant.ID)
	dp2 := createTestDayPlanForEDPService(t, db, tenant.ID)

	plan, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID: tenant.ID, EmployeeID: emp.ID,
		PlanDate:  time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		DayPlanID: &dp1.ID, Source: "manual",
	})
	require.NoError(t, err)

	newNotes := "Updated notes"
	updated, err := svc.Update(ctx, plan.ID, tenant.ID, service.UpdateEmployeeDayPlanInput{
		DayPlanID: &dp2.ID,
		Notes:     &newNotes,
	})
	require.NoError(t, err)
	assert.Equal(t, &dp2.ID, updated.DayPlanID)
	assert.Equal(t, "Updated notes", updated.Notes)
}

func TestEmployeeDayPlanService_Update_ClearDayPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)

	plan, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID: tenant.ID, EmployeeID: emp.ID,
		PlanDate:  time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		DayPlanID: &dp.ID, Source: "manual",
	})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, plan.ID, tenant.ID, service.UpdateEmployeeDayPlanInput{
		ClearDayPlanID: true,
	})
	require.NoError(t, err)
	assert.Nil(t, updated.DayPlanID)
}

func TestEmployeeDayPlanService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)

	_, err := svc.Update(ctx, uuid.New(), tenant.ID, service.UpdateEmployeeDayPlanInput{})
	assert.ErrorIs(t, err, service.ErrEmployeeDayPlanNotFound)
}

func TestEmployeeDayPlanService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)

	plan, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID: tenant.ID, EmployeeID: emp.ID,
		PlanDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Source:   "manual",
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, plan.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, plan.ID)
	assert.ErrorIs(t, err, service.ErrEmployeeDayPlanNotFound)
}

func TestEmployeeDayPlanService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrEmployeeDayPlanNotFound)
}

func TestEmployeeDayPlanService_BulkCreate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)

	baseDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	entries := []service.BulkCreateEntry{
		{EmployeeID: emp.ID, PlanDate: baseDate, DayPlanID: &dp.ID, Source: "tariff"},
		{EmployeeID: emp.ID, PlanDate: baseDate.AddDate(0, 0, 1), DayPlanID: &dp.ID, Source: "tariff"},
		{EmployeeID: emp.ID, PlanDate: baseDate.AddDate(0, 0, 2), Source: "tariff"}, // off day
	}

	plans, err := svc.BulkCreate(ctx, service.BulkCreateInput{
		TenantID: tenant.ID,
		Entries:  entries,
	})
	require.NoError(t, err)
	assert.Len(t, plans, 3)
}

func TestEmployeeDayPlanService_BulkCreate_InvalidEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)

	baseDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	entries := []service.BulkCreateEntry{
		{EmployeeID: uuid.New(), PlanDate: baseDate, Source: "tariff"},
	}

	_, err := svc.BulkCreate(ctx, service.BulkCreateInput{
		TenantID: tenant.ID,
		Entries:  entries,
	})
	assert.ErrorIs(t, err, service.ErrEDPInvalidEmployee)
}

func TestEmployeeDayPlanService_DeleteRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)

	// Create plans for 5 days
	baseDate := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		_, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
			TenantID: tenant.ID, EmployeeID: emp.ID,
			PlanDate: baseDate.AddDate(0, 0, i), Source: "manual",
		})
		require.NoError(t, err)
	}

	// Delete middle 3 days
	err := svc.DeleteRange(ctx, service.DeleteRangeInput{
		EmployeeID: emp.ID,
		TenantID:   tenant.ID,
		From:       baseDate.AddDate(0, 0, 1),
		To:         baseDate.AddDate(0, 0, 3),
	})
	require.NoError(t, err)

	// Verify only 2 plans remain
	plans, err := svc.List(ctx, service.ListEmployeeDayPlansInput{
		TenantID:   tenant.ID,
		EmployeeID: &emp.ID,
		From:       baseDate,
		To:         baseDate.AddDate(0, 0, 4),
	})
	require.NoError(t, err)
	assert.Len(t, plans, 2)
}

func TestEmployeeDayPlanService_DeleteRange_InvalidEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)

	err := svc.DeleteRange(ctx, service.DeleteRangeInput{
		EmployeeID: uuid.New(),
		TenantID:   tenant.ID,
		From:       time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		To:         time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC),
	})
	assert.ErrorIs(t, err, service.ErrEDPInvalidEmployee)
}

func TestEmployeeDayPlanService_DeleteRange_InvalidDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID)

	err := svc.DeleteRange(ctx, service.DeleteRangeInput{
		EmployeeID: emp.ID,
		TenantID:   tenant.ID,
		From:       time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC),
		To:         time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	})
	assert.ErrorIs(t, err, service.ErrEDPDateRangeInvalid)
}

// --- GenerateFromTariff Tests ---

func createTestWeekPlanForEDP(t *testing.T, db *repository.DB, tenantID uuid.UUID, dayPlanIDs [7]*uuid.UUID) *model.WeekPlan {
	t.Helper()
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	wp := &model.WeekPlan{
		TenantID:           tenantID,
		Code:               "WP-" + uuid.New().String()[:8],
		Name:               "Test Week Plan",
		MondayDayPlanID:    dayPlanIDs[0],
		TuesdayDayPlanID:   dayPlanIDs[1],
		WednesdayDayPlanID: dayPlanIDs[2],
		ThursdayDayPlanID:  dayPlanIDs[3],
		FridayDayPlanID:    dayPlanIDs[4],
		SaturdayDayPlanID:  dayPlanIDs[5],
		SundayDayPlanID:    dayPlanIDs[6],
	}
	require.NoError(t, weekPlanRepo.Create(context.Background(), wp))
	return wp
}

func createTestTariffForEDP(t *testing.T, db *repository.DB, tenantID uuid.UUID, weekPlanID uuid.UUID) *model.Tariff {
	t.Helper()
	tariffRepo := repository.NewTariffRepository(db)
	tariff := &model.Tariff{
		TenantID:   tenantID,
		Code:       "TAR-" + uuid.New().String()[:8],
		Name:       "Test Tariff",
		WeekPlanID: &weekPlanID,
		RhythmType: model.RhythmTypeWeekly,
		IsActive:   true,
	}
	require.NoError(t, tariffRepo.Create(context.Background(), tariff))
	return tariff
}

func createTestEmployeeWithTariffForEDP(t *testing.T, db *repository.DB, tenantID uuid.UUID, tariffID *uuid.UUID) *model.Employee {
	t.Helper()
	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "EMP-" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:6],
		FirstName:       "Test",
		LastName:        "Employee",
		TariffID:        tariffID,
		EntryDate:       time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		IsActive:        true,
	}
	require.NoError(t, empRepo.Create(context.Background(), emp))
	return emp
}

func newEDPServiceWithTariff(db *repository.DB) *service.EmployeeDayPlanService {
	edpRepo := repository.NewEmployeeDayPlanRepository(db)
	empRepo := repository.NewEmployeeRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	shiftRepo := repository.NewShiftRepository(db)
	tariffRepo := repository.NewTariffRepository(db)

	svc := service.NewEmployeeDayPlanService(edpRepo, empRepo, dayPlanRepo, shiftRepo)
	svc.SetTariffRepo(tariffRepo)
	svc.SetEmployeeListRepo(empRepo)
	return svc
}

func TestEmployeeDayPlanService_GenerateFromTariff_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPServiceWithTariff(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)

	// Create week plan with same day plan for all days
	dayPlanIDs := [7]*uuid.UUID{&dp.ID, &dp.ID, &dp.ID, &dp.ID, &dp.ID, nil, nil} // Mon-Fri work, Sat-Sun off
	wp := createTestWeekPlanForEDP(t, db, tenant.ID, dayPlanIDs)
	tariff := createTestTariffForEDP(t, db, tenant.ID, wp.ID)
	emp := createTestEmployeeWithTariffForEDP(t, db, tenant.ID, &tariff.ID)

	// Generate for one week
	from := time.Date(2026, 2, 9, 0, 0, 0, 0, time.UTC)  // Monday
	to := time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC)   // Sunday

	result, err := svc.GenerateFromTariff(ctx, service.GenerateFromTariffInput{
		TenantID:              tenant.ID,
		EmployeeIDs:           []uuid.UUID{emp.ID},
		From:                  from,
		To:                    to,
		OverwriteTariffSource: true,
	})
	require.NoError(t, err)
	assert.Equal(t, 1, result.EmployeesProcessed)
	assert.Equal(t, 5, result.PlansCreated) // 5 working days (Mon-Fri)
	assert.Equal(t, 0, result.EmployeesSkipped)

	// Verify plans were created
	plans, err := svc.List(ctx, service.ListEmployeeDayPlansInput{
		TenantID:   tenant.ID,
		EmployeeID: &emp.ID,
		From:       from,
		To:         to,
	})
	require.NoError(t, err)
	assert.Len(t, plans, 5)

	// All plans should have source=tariff
	for _, plan := range plans {
		assert.Equal(t, model.EmployeeDayPlanSourceTariff, plan.Source)
		assert.Equal(t, &dp.ID, plan.DayPlanID)
	}
}

func TestEmployeeDayPlanService_GenerateFromTariff_PreservesManualPlans(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPServiceWithTariff(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)
	dpManual := createTestDayPlanForEDPService(t, db, tenant.ID)

	dayPlanIDs := [7]*uuid.UUID{&dp.ID, &dp.ID, &dp.ID, &dp.ID, &dp.ID, nil, nil}
	wp := createTestWeekPlanForEDP(t, db, tenant.ID, dayPlanIDs)
	tariff := createTestTariffForEDP(t, db, tenant.ID, wp.ID)
	emp := createTestEmployeeWithTariffForEDP(t, db, tenant.ID, &tariff.ID)

	// Create a manual override for Wednesday
	wednesday := time.Date(2026, 2, 11, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeDayPlanInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   wednesday,
		DayPlanID:  &dpManual.ID,
		Source:     "manual",
		Notes:      "Manual override",
	})
	require.NoError(t, err)

	// Generate for the week
	from := time.Date(2026, 2, 9, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC)

	result, err := svc.GenerateFromTariff(ctx, service.GenerateFromTariffInput{
		TenantID:              tenant.ID,
		EmployeeIDs:           []uuid.UUID{emp.ID},
		From:                  from,
		To:                    to,
		OverwriteTariffSource: true,
	})
	require.NoError(t, err)
	assert.Equal(t, 1, result.EmployeesProcessed)
	assert.Equal(t, 4, result.PlansCreated) // 4 days (Wed is manual)

	// Verify manual plan is preserved
	plans, err := svc.List(ctx, service.ListEmployeeDayPlansInput{
		TenantID:   tenant.ID,
		EmployeeID: &emp.ID,
		From:       wednesday,
		To:         wednesday,
	})
	require.NoError(t, err)
	assert.Len(t, plans, 1)
	assert.Equal(t, model.EmployeeDayPlanSourceManual, plans[0].Source)
	assert.Equal(t, "Manual override", plans[0].Notes)
}

func TestEmployeeDayPlanService_GenerateFromTariff_SkipsEmployeesWithoutTariff(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPServiceWithTariff(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	emp := createTestEmployeeForEDPService(t, db, tenant.ID) // No tariff assigned

	from := time.Date(2026, 2, 9, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC)

	result, err := svc.GenerateFromTariff(ctx, service.GenerateFromTariffInput{
		TenantID:              tenant.ID,
		EmployeeIDs:           []uuid.UUID{emp.ID},
		From:                  from,
		To:                    to,
		OverwriteTariffSource: true,
	})
	require.NoError(t, err)
	assert.Equal(t, 0, result.EmployeesProcessed)
	assert.Equal(t, 0, result.PlansCreated)
	assert.Equal(t, 1, result.EmployeesSkipped)
}

func TestEmployeeDayPlanService_GenerateFromTariff_AllActiveEmployees(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPServiceWithTariff(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)

	dayPlanIDs := [7]*uuid.UUID{&dp.ID, &dp.ID, &dp.ID, &dp.ID, &dp.ID, nil, nil}
	wp := createTestWeekPlanForEDP(t, db, tenant.ID, dayPlanIDs)
	tariff := createTestTariffForEDP(t, db, tenant.ID, wp.ID)

	// Create 3 employees with tariff
	emp1 := createTestEmployeeWithTariffForEDP(t, db, tenant.ID, &tariff.ID)
	emp2 := createTestEmployeeWithTariffForEDP(t, db, tenant.ID, &tariff.ID)
	emp3 := createTestEmployeeWithTariffForEDP(t, db, tenant.ID, nil) // No tariff

	_ = emp1
	_ = emp2
	_ = emp3

	from := time.Date(2026, 2, 9, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 2, 9, 0, 0, 0, 0, time.UTC) // Just Monday

	result, err := svc.GenerateFromTariff(ctx, service.GenerateFromTariffInput{
		TenantID:              tenant.ID,
		EmployeeIDs:           nil, // All active employees
		From:                  from,
		To:                    to,
		OverwriteTariffSource: true,
	})
	require.NoError(t, err)
	assert.Equal(t, 2, result.EmployeesProcessed)
	assert.Equal(t, 2, result.PlansCreated) // 1 plan per employee for Monday
	assert.Equal(t, 1, result.EmployeesSkipped)
}

func TestEmployeeDayPlanService_GenerateFromTariff_ReposNotConfigured(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPService(db) // Service without tariff repos
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)

	_, err := svc.GenerateFromTariff(ctx, service.GenerateFromTariffInput{
		TenantID: tenant.ID,
		From:     time.Now(),
		To:       time.Now().AddDate(0, 0, 7),
	})
	assert.ErrorIs(t, err, service.ErrGenerateRepoNotConfigured)
}

func TestEmployeeDayPlanService_GenerateFromTariff_RespectsEmployeeExitDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newEDPServiceWithTariff(db)
	ctx := context.Background()

	tenant := createTestTenantForEDPService(t, db)
	dp := createTestDayPlanForEDPService(t, db, tenant.ID)

	dayPlanIDs := [7]*uuid.UUID{&dp.ID, &dp.ID, &dp.ID, &dp.ID, &dp.ID, nil, nil}
	wp := createTestWeekPlanForEDP(t, db, tenant.ID, dayPlanIDs)
	tariff := createTestTariffForEDP(t, db, tenant.ID, wp.ID)

	// Create employee with exit date
	empRepo := repository.NewEmployeeRepository(db)
	exitDate := time.Date(2026, 2, 11, 0, 0, 0, 0, time.UTC) // Wednesday
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "EMP-" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:6],
		FirstName:       "Test",
		LastName:        "Employee",
		TariffID:        &tariff.ID,
		EntryDate:       time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		ExitDate:        &exitDate,
		IsActive:        true,
	}
	require.NoError(t, empRepo.Create(ctx, emp))

	// Try to generate for the whole week
	from := time.Date(2026, 2, 9, 0, 0, 0, 0, time.UTC)  // Monday
	to := time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC)   // Sunday

	result, err := svc.GenerateFromTariff(ctx, service.GenerateFromTariffInput{
		TenantID:              tenant.ID,
		EmployeeIDs:           []uuid.UUID{emp.ID},
		From:                  from,
		To:                    to,
		OverwriteTariffSource: true,
	})
	require.NoError(t, err)
	assert.Equal(t, 1, result.EmployeesProcessed)
	assert.Equal(t, 3, result.PlansCreated) // Only Mon, Tue, Wed (exit date is Wed)
}
