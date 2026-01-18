package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForEDP creates a tenant for use in employee day plan tests.
func createTestTenantForEDP(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

// createTestEmployeeForEDP creates an employee for employee day plan tests.
func createTestEmployeeForEDP(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	repo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "E" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:4],
		FirstName:       "Test",
		LastName:        "Employee",
		EntryDate:       time.Now(),
		WeeklyHours:     decimal.NewFromFloat(40.0),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(context.Background(), emp))
	return emp
}

// createTestDayPlanForEDP creates a day plan for employee day plan tests.
func createTestDayPlanForEDP(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.DayPlan {
	t.Helper()
	repo := repository.NewDayPlanRepository(db)
	dp := &model.DayPlan{
		TenantID:     tenantID,
		Code:         "DP" + uuid.New().String()[:6],
		Name:         "Test Day Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
		IsActive:     true,
	}
	require.NoError(t, repo.Create(context.Background(), dp))
	return dp
}

func TestEmployeeDayPlanRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	edp := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Now().Truncate(24 * time.Hour),
		DayPlanID:  &dp.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}

	err := repo.Create(ctx, edp)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, edp.ID)
}

func TestEmployeeDayPlanRepository_Create_OffDay(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)

	// Create with nil DayPlanID (off day)
	edp := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Now().Truncate(24 * time.Hour),
		DayPlanID:  nil,
		Source:     model.EmployeeDayPlanSourceManual,
		Notes:      "Day off",
	}

	err := repo.Create(ctx, edp)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, edp.ID)
	assert.True(t, edp.IsOffDay())
}

func TestEmployeeDayPlanRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	edp := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Now().Truncate(24 * time.Hour),
		DayPlanID:  &dp.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}
	require.NoError(t, repo.Create(ctx, edp))

	found, err := repo.GetByID(ctx, edp.ID)
	require.NoError(t, err)
	assert.Equal(t, edp.ID, found.ID)
	assert.Equal(t, emp.ID, found.EmployeeID)
	assert.Equal(t, dp.ID, *found.DayPlanID)
}

func TestEmployeeDayPlanRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrEmployeeDayPlanNotFound)
}

func TestEmployeeDayPlanRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp1 := createTestDayPlanForEDP(t, db, tenant.ID)
	dp2 := createTestDayPlanForEDP(t, db, tenant.ID)

	edp := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Now().Truncate(24 * time.Hour),
		DayPlanID:  &dp1.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}
	require.NoError(t, repo.Create(ctx, edp))

	// Update to different day plan
	edp.DayPlanID = &dp2.ID
	edp.Source = model.EmployeeDayPlanSourceManual
	edp.Notes = "Changed plan"
	err := repo.Update(ctx, edp)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, edp.ID)
	require.NoError(t, err)
	assert.Equal(t, dp2.ID, *found.DayPlanID)
	assert.Equal(t, model.EmployeeDayPlanSourceManual, found.Source)
	assert.Equal(t, "Changed plan", found.Notes)
}

func TestEmployeeDayPlanRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	edp := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   time.Now().Truncate(24 * time.Hour),
		DayPlanID:  &dp.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}
	require.NoError(t, repo.Create(ctx, edp))

	err := repo.Delete(ctx, edp.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, edp.ID)
	assert.ErrorIs(t, err, repository.ErrEmployeeDayPlanNotFound)
}

func TestEmployeeDayPlanRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrEmployeeDayPlanNotFound)
}

func TestEmployeeDayPlanRepository_GetForEmployeeDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	edp := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   today,
		DayPlanID:  &dp.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}
	require.NoError(t, repo.Create(ctx, edp))

	found, err := repo.GetForEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, edp.ID, found.ID)
	// Verify DayPlan is preloaded
	assert.NotNil(t, found.DayPlan)
	assert.Equal(t, dp.ID, found.DayPlan.ID)
}

func TestEmployeeDayPlanRepository_GetForEmployeeDate_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Should return nil, nil when not found
	found, err := repo.GetForEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestEmployeeDayPlanRepository_GetForEmployeeDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create plans for 5 days (-2 to +2)
	for i := -2; i <= 2; i++ {
		date := today.AddDate(0, 0, i)
		edp := &model.EmployeeDayPlan{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			PlanDate:   date,
			DayPlanID:  &dp.ID,
			Source:     model.EmployeeDayPlanSourceTariff,
		}
		require.NoError(t, repo.Create(ctx, edp))
	}

	// Query for 3 days (-1 to +1)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)

	plans, err := repo.GetForEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, plans, 3)

	// Verify ordering by date
	assert.True(t, plans[0].PlanDate.Before(plans[1].PlanDate))
	assert.True(t, plans[1].PlanDate.Before(plans[2].PlanDate))

	// Verify DayPlan is preloaded
	for _, plan := range plans {
		assert.NotNil(t, plan.DayPlan)
	}
}

func TestEmployeeDayPlanRepository_GetForEmployeeDateRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)

	plans, err := repo.GetForEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Empty(t, plans)
}

func TestEmployeeDayPlanRepository_Upsert_Insert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	edp := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   today,
		DayPlanID:  &dp.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}

	err := repo.Upsert(ctx, edp)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, edp.ID)

	// Verify created
	found, err := repo.GetForEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, dp.ID, *found.DayPlanID)
}

func TestEmployeeDayPlanRepository_Upsert_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp1 := createTestDayPlanForEDP(t, db, tenant.ID)
	dp2 := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// First upsert (insert)
	edp1 := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   today,
		DayPlanID:  &dp1.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}
	require.NoError(t, repo.Upsert(ctx, edp1))
	originalID := edp1.ID

	// Second upsert (update) with same employee+date
	edp2 := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   today,
		DayPlanID:  &dp2.ID,
		Source:     model.EmployeeDayPlanSourceManual,
		Notes:      "Updated via upsert",
	}
	require.NoError(t, repo.Upsert(ctx, edp2))

	// Verify the original record was updated (not a new one created)
	found, err := repo.GetForEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, originalID, found.ID)
	assert.Equal(t, dp2.ID, *found.DayPlanID)
	assert.Equal(t, model.EmployeeDayPlanSourceManual, found.Source)
	assert.Equal(t, "Updated via upsert", found.Notes)
}

func TestEmployeeDayPlanRepository_BulkCreate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create 10 day plans
	var plans []model.EmployeeDayPlan
	for i := range 10 {
		plans = append(plans, model.EmployeeDayPlan{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			PlanDate:   today.AddDate(0, 0, i),
			DayPlanID:  &dp.ID,
			Source:     model.EmployeeDayPlanSourceTariff,
		})
	}

	err := repo.BulkCreate(ctx, plans)
	require.NoError(t, err)

	// Verify all created
	from := today
	to := today.AddDate(0, 0, 9)
	found, err := repo.GetForEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, found, 10)
}

func TestEmployeeDayPlanRepository_BulkCreate_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	// Should not error with empty slice
	err := repo.BulkCreate(ctx, []model.EmployeeDayPlan{})
	require.NoError(t, err)
}

func TestEmployeeDayPlanRepository_BulkCreate_UpsertBehavior(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp1 := createTestDayPlanForEDP(t, db, tenant.ID)
	dp2 := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create initial record
	initial := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   today,
		DayPlanID:  &dp1.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}
	require.NoError(t, repo.Create(ctx, initial))

	// Bulk create with overlap - should update existing
	plans := []model.EmployeeDayPlan{
		{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			PlanDate:   today, // Overlaps with existing
			DayPlanID:  &dp2.ID,
			Source:     model.EmployeeDayPlanSourceManual,
			Notes:      "Bulk updated",
		},
		{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			PlanDate:   today.AddDate(0, 0, 1), // New
			DayPlanID:  &dp2.ID,
			Source:     model.EmployeeDayPlanSourceManual,
		},
	}

	err := repo.BulkCreate(ctx, plans)
	require.NoError(t, err)

	// Verify existing was updated
	found, err := repo.GetForEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, dp2.ID, *found.DayPlanID)
	assert.Equal(t, "Bulk updated", found.Notes)

	// Verify new was created
	found2, err := repo.GetForEmployeeDate(ctx, emp.ID, today.AddDate(0, 0, 1))
	require.NoError(t, err)
	require.NotNil(t, found2)
}

func TestEmployeeDayPlanRepository_DeleteRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create plans for 5 days (-2 to +2)
	for i := -2; i <= 2; i++ {
		date := today.AddDate(0, 0, i)
		edp := &model.EmployeeDayPlan{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			PlanDate:   date,
			DayPlanID:  &dp.ID,
			Source:     model.EmployeeDayPlanSourceTariff,
		}
		require.NoError(t, repo.Create(ctx, edp))
	}

	// Delete range (-1 to +1)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)
	err := repo.DeleteRange(ctx, emp.ID, from, to)
	require.NoError(t, err)

	// Verify only 2 remain (day -2 and day +2)
	allPlans, err := repo.GetForEmployeeDateRange(ctx, emp.ID, today.AddDate(0, 0, -2), today.AddDate(0, 0, 2))
	require.NoError(t, err)
	assert.Len(t, allPlans, 2)

	// Verify the correct ones remain
	for _, plan := range allPlans {
		dayDiff := int(plan.PlanDate.Sub(today).Hours() / 24)
		assert.True(t, dayDiff == -2 || dayDiff == 2)
	}
}

func TestEmployeeDayPlanRepository_DeleteRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Should not error when nothing to delete
	err := repo.DeleteRange(ctx, emp.ID, today, today.AddDate(0, 0, 7))
	require.NoError(t, err)
}

func TestEmployeeDayPlanRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create first record
	edp1 := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   today,
		DayPlanID:  &dp.ID,
		Source:     model.EmployeeDayPlanSourceTariff,
	}
	require.NoError(t, repo.Create(ctx, edp1))

	// Try to create duplicate - should fail due to unique constraint
	edp2 := &model.EmployeeDayPlan{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		PlanDate:   today, // Same date
		DayPlanID:  &dp.ID,
		Source:     model.EmployeeDayPlanSourceManual,
	}
	err := repo.Create(ctx, edp2)
	assert.Error(t, err)
}

func TestEmployeeDayPlanRepository_Sources(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEDP(t, db)
	emp := createTestEmployeeForEDP(t, db, tenant.ID)
	dp := createTestDayPlanForEDP(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	sources := []model.EmployeeDayPlanSource{
		model.EmployeeDayPlanSourceTariff,
		model.EmployeeDayPlanSourceManual,
		model.EmployeeDayPlanSourceHoliday,
	}

	for i, source := range sources {
		edp := &model.EmployeeDayPlan{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			PlanDate:   today.AddDate(0, 0, i),
			DayPlanID:  &dp.ID,
			Source:     source,
		}
		require.NoError(t, repo.Create(ctx, edp))

		found, err := repo.GetForEmployeeDate(ctx, emp.ID, today.AddDate(0, 0, i))
		require.NoError(t, err)
		assert.Equal(t, source, found.Source)
	}
}

func TestEmployeeDayPlan_IsOffDay(t *testing.T) {
	// Test the model's IsOffDay method
	dp := &model.EmployeeDayPlan{
		DayPlanID: nil,
	}
	assert.True(t, dp.IsOffDay())

	dpID := uuid.New()
	dp.DayPlanID = &dpID
	assert.False(t, dp.IsOffDay())
}
