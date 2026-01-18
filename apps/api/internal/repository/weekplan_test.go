package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForWeekPlan(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestDayPlanForWeekPlan(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string) *model.DayPlan {
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

func TestWeekPlanRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)
	mondayPlan := createTestDayPlanForWeekPlan(t, db, tenant.ID, "MON-CREATE")

	plan := &model.WeekPlan{
		TenantID:        tenant.ID,
		Code:            "STANDARD",
		Name:            "Standard Week",
		MondayDayPlanID: &mondayPlan.ID,
		IsActive:        true,
	}

	err := repo.Create(ctx, plan)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, plan.ID)
}

func TestWeekPlanRepository_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)
	description := "A standard 5-day work week"

	plan := &model.WeekPlan{
		TenantID:    tenant.ID,
		Code:        "STANDARD-DESC",
		Name:        "Standard Week",
		Description: &description,
		IsActive:    true,
	}

	err := repo.Create(ctx, plan)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, plan.ID)
	require.NoError(t, err)
	require.NotNil(t, found.Description)
	assert.Equal(t, description, *found.Description)
}

func TestWeekPlanRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)
	plan := &model.WeekPlan{
		TenantID: tenant.ID,
		Code:     "GETBYID",
		Name:     "Get By ID Test",
	}
	require.NoError(t, repo.Create(ctx, plan))

	found, err := repo.GetByID(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
	assert.Equal(t, plan.Code, found.Code)
	assert.Equal(t, plan.Name, found.Name)
}

func TestWeekPlanRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrWeekPlanNotFound)
}

func TestWeekPlanRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)
	plan := &model.WeekPlan{
		TenantID: tenant.ID,
		Code:     "UNIQUE-WEEK",
		Name:     "Unique Week",
	}
	require.NoError(t, repo.Create(ctx, plan))

	found, err := repo.GetByCode(ctx, tenant.ID, "UNIQUE-WEEK")
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
}

func TestWeekPlanRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)

	_, err := repo.GetByCode(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrWeekPlanNotFound)
}

func TestWeekPlanRepository_GetWithDayPlans(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)

	// Create day plans
	mondayPlan := createTestDayPlanForWeekPlan(t, db, tenant.ID, "MON")
	tuesdayPlan := createTestDayPlanForWeekPlan(t, db, tenant.ID, "TUE")

	// Create week plan
	plan := &model.WeekPlan{
		TenantID:         tenant.ID,
		Code:             "DETAILED",
		Name:             "Week with Days",
		MondayDayPlanID:  &mondayPlan.ID,
		TuesdayDayPlanID: &tuesdayPlan.ID,
	}
	require.NoError(t, repo.Create(ctx, plan))

	// Get with details
	found, err := repo.GetWithDayPlans(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
	assert.NotNil(t, found.MondayDayPlan)
	assert.NotNil(t, found.TuesdayDayPlan)
	assert.Equal(t, "MON", found.MondayDayPlan.Code)
	assert.Equal(t, "TUE", found.TuesdayDayPlan.Code)
	assert.Nil(t, found.WednesdayDayPlan)
}

func TestWeekPlanRepository_GetWithDayPlans_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	_, err := repo.GetWithDayPlans(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrWeekPlanNotFound)
}

func TestWeekPlanRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)
	plan := &model.WeekPlan{
		TenantID: tenant.ID,
		Code:     "UPDATE",
		Name:     "Original Name",
	}
	require.NoError(t, repo.Create(ctx, plan))

	plan.Name = "Updated Name"
	err := repo.Update(ctx, plan)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, plan.ID)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestWeekPlanRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)
	plan := &model.WeekPlan{
		TenantID: tenant.ID,
		Code:     "DELETE",
		Name:     "To Delete",
	}
	require.NoError(t, repo.Create(ctx, plan))

	err := repo.Delete(ctx, plan.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, plan.ID)
	assert.ErrorIs(t, err, repository.ErrWeekPlanNotFound)
}

func TestWeekPlanRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrWeekPlanNotFound)
}

func TestWeekPlanRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)
	require.NoError(t, repo.Create(ctx, &model.WeekPlan{TenantID: tenant.ID, Code: "B", Name: "Week B"}))
	require.NoError(t, repo.Create(ctx, &model.WeekPlan{TenantID: tenant.ID, Code: "A", Name: "Week A"}))

	plans, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, plans, 2)
	// Verify ordered by code
	assert.Equal(t, "A", plans[0].Code)
	assert.Equal(t, "B", plans[1].Code)
}

func TestWeekPlanRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)

	plans, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, plans)
}

func TestWeekPlanRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)
	require.NoError(t, repo.Create(ctx, &model.WeekPlan{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active", IsActive: true}))

	// Create and then update to inactive (GORM doesn't send false since it's the zero value)
	inactivePlan := &model.WeekPlan{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive"}
	require.NoError(t, repo.Create(ctx, inactivePlan))
	inactivePlan.IsActive = false
	require.NoError(t, repo.Update(ctx, inactivePlan))

	plans, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, plans, 1)
	assert.Equal(t, "ACTIVE", plans[0].Code)
}

func TestWeekPlan_GetDayPlanIDForWeekday(t *testing.T) {
	mondayID := uuid.New()
	tuesdayID := uuid.New()
	sundayID := uuid.New()

	plan := &model.WeekPlan{
		MondayDayPlanID:  &mondayID,
		TuesdayDayPlanID: &tuesdayID,
		SundayDayPlanID:  &sundayID,
	}

	assert.Equal(t, &mondayID, plan.GetDayPlanIDForWeekday(time.Monday))
	assert.Equal(t, &tuesdayID, plan.GetDayPlanIDForWeekday(time.Tuesday))
	assert.Equal(t, &sundayID, plan.GetDayPlanIDForWeekday(time.Sunday))
	assert.Nil(t, plan.GetDayPlanIDForWeekday(time.Wednesday))
}

func TestWeekPlan_WorkDaysPerWeek(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()
	id3 := uuid.New()

	plan := &model.WeekPlan{
		MondayDayPlanID:    &id1,
		TuesdayDayPlanID:   &id2,
		WednesdayDayPlanID: &id3,
	}

	assert.Equal(t, 3, plan.WorkDaysPerWeek())

	emptyPlan := &model.WeekPlan{}
	assert.Equal(t, 0, emptyPlan.WorkDaysPerWeek())
}

func TestWeekPlanRepository_FullWeek(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewWeekPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlan(t, db)

	// Create day plans for each day
	monPlan := createTestDayPlanForWeekPlan(t, db, tenant.ID, "MON-FULL")
	tuePlan := createTestDayPlanForWeekPlan(t, db, tenant.ID, "TUE-FULL")
	wedPlan := createTestDayPlanForWeekPlan(t, db, tenant.ID, "WED-FULL")
	thuPlan := createTestDayPlanForWeekPlan(t, db, tenant.ID, "THU-FULL")
	friPlan := createTestDayPlanForWeekPlan(t, db, tenant.ID, "FRI-FULL")

	// Create week plan with 5-day week
	plan := &model.WeekPlan{
		TenantID:           tenant.ID,
		Code:               "FULL-WEEK",
		Name:               "5-Day Work Week",
		MondayDayPlanID:    &monPlan.ID,
		TuesdayDayPlanID:   &tuePlan.ID,
		WednesdayDayPlanID: &wedPlan.ID,
		ThursdayDayPlanID:  &thuPlan.ID,
		FridayDayPlanID:    &friPlan.ID,
		// Saturday and Sunday are off (nil)
		IsActive: true,
	}
	require.NoError(t, repo.Create(ctx, plan))

	// Verify
	found, err := repo.GetWithDayPlans(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, 5, found.WorkDaysPerWeek())
	assert.NotNil(t, found.MondayDayPlan)
	assert.NotNil(t, found.TuesdayDayPlan)
	assert.NotNil(t, found.WednesdayDayPlan)
	assert.NotNil(t, found.ThursdayDayPlan)
	assert.NotNil(t, found.FridayDayPlan)
	assert.Nil(t, found.SaturdayDayPlan)
	assert.Nil(t, found.SundayDayPlan)
}
