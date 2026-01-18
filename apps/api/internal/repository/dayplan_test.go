package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForDayPlan(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestAccountForDayPlan(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Account {
	t.Helper()
	accountRepo := repository.NewAccountRepository(db)
	account := &model.Account{
		TenantID:    &tenantID,
		Code:        "BONUS_" + uuid.New().String()[:8],
		Name:        "Bonus Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}
	require.NoError(t, accountRepo.Create(context.Background(), account))
	return account
}

func TestDayPlanRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	plan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "STANDARD",
		Name:         "Standard Day",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
		IsActive:     true,
	}

	err := repo.Create(ctx, plan)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, plan.ID)
}

func TestDayPlanRepository_Create_WithTimeWindows(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	comeFrom := 420  // 07:00
	comeTo := 540    // 09:00
	goFrom := 960    // 16:00
	goTo := 1140     // 19:00
	coreStart := 540 // 09:00
	coreEnd := 960   // 16:00

	plan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "FLEX",
		Name:         "Flextime Day",
		PlanType:     model.PlanTypeFlextime,
		ComeFrom:     &comeFrom,
		ComeTo:       &comeTo,
		GoFrom:       &goFrom,
		GoTo:         &goTo,
		CoreStart:    &coreStart,
		CoreEnd:      &coreEnd,
		RegularHours: 480,
		IsActive:     true,
	}

	err := repo.Create(ctx, plan)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, plan.ID)

	found, err := repo.GetByID(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, &comeFrom, found.ComeFrom)
	assert.Equal(t, &comeTo, found.ComeTo)
	assert.Equal(t, &goFrom, found.GoFrom)
	assert.Equal(t, &goTo, found.GoTo)
	assert.Equal(t, &coreStart, found.CoreStart)
	assert.Equal(t, &coreEnd, found.CoreEnd)
}

func TestDayPlanRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	plan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "STANDARD",
		Name:         "Standard Day",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	require.NoError(t, repo.Create(ctx, plan))

	found, err := repo.GetByID(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
	assert.Equal(t, plan.Code, found.Code)
	assert.Equal(t, plan.Name, found.Name)
	assert.Equal(t, plan.PlanType, found.PlanType)
}

func TestDayPlanRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDayPlanNotFound)
}

func TestDayPlanRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	plan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "UNIQUE-CODE",
		Name:         "Unique Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	require.NoError(t, repo.Create(ctx, plan))

	found, err := repo.GetByCode(ctx, tenant.ID, "UNIQUE-CODE")
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
}

func TestDayPlanRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)

	_, err := repo.GetByCode(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrDayPlanNotFound)
}

func TestDayPlanRepository_GetWithDetails(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	account := createTestAccountForDayPlan(t, db, tenant.ID)

	plan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "DETAILED",
		Name:         "Plan with Details",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	require.NoError(t, repo.Create(ctx, plan))

	// Add breaks
	startTime1 := 720 // 12:00
	endTime1 := 750   // 12:30
	break1 := &model.DayPlanBreak{
		DayPlanID: plan.ID,
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime1,
		EndTime:   &endTime1,
		Duration:  30,
		IsPaid:    false,
		SortOrder: 1,
	}
	startTime2 := 600 // 10:00
	endTime2 := 615   // 10:15
	break2 := &model.DayPlanBreak{
		DayPlanID: plan.ID,
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime2,
		EndTime:   &endTime2,
		Duration:  15,
		IsPaid:    true,
		SortOrder: 2,
	}
	require.NoError(t, repo.AddBreak(ctx, break1))
	require.NoError(t, repo.AddBreak(ctx, break2))

	// Add bonuses
	bonus1 := &model.DayPlanBonus{
		DayPlanID:       plan.ID,
		AccountID:       account.ID,
		TimeFrom:        1200,
		TimeTo:          1380,
		CalculationType: model.CalculationPerMinute,
		ValueMinutes:    15,
		SortOrder:       1,
	}
	require.NoError(t, repo.AddBonus(ctx, bonus1))

	// Get with details
	found, err := repo.GetWithDetails(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, found.ID)
	assert.Len(t, found.Breaks, 2)
	assert.Len(t, found.Bonuses, 1)
	// Verify ordering
	assert.Equal(t, 1, found.Breaks[0].SortOrder)
	assert.Equal(t, 2, found.Breaks[1].SortOrder)
	// Verify account preload
	assert.NotNil(t, found.Bonuses[0].Account)
	assert.Equal(t, account.ID, found.Bonuses[0].Account.ID)
}

func TestDayPlanRepository_GetWithDetails_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	_, err := repo.GetWithDetails(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDayPlanNotFound)
}

func TestDayPlanRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	plan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "UPDATE",
		Name:         "Original Name",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	require.NoError(t, repo.Create(ctx, plan))

	plan.Name = "Updated Name"
	plan.RegularHours = 420
	err := repo.Update(ctx, plan)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
	assert.Equal(t, 420, found.RegularHours)
}

func TestDayPlanRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	plan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "DELETE",
		Name:         "To Delete",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	require.NoError(t, repo.Create(ctx, plan))

	err := repo.Delete(ctx, plan.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, plan.ID)
	assert.ErrorIs(t, err, repository.ErrDayPlanNotFound)
}

func TestDayPlanRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDayPlanNotFound)
}

func TestDayPlanRepository_Delete_CascadeBreaks(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	plan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "CASCADE",
		Name:         "Cascade Test",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	require.NoError(t, repo.Create(ctx, plan))

	// Add break
	startTime := 720
	endTime := 750
	breakItem := &model.DayPlanBreak{
		DayPlanID: plan.ID,
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime,
		EndTime:   &endTime,
		Duration:  30,
	}
	require.NoError(t, repo.AddBreak(ctx, breakItem))

	// Delete plan - should cascade delete break
	err := repo.Delete(ctx, plan.ID)
	require.NoError(t, err)

	// Break should be gone
	_, err = repo.GetBreak(ctx, breakItem.ID)
	assert.ErrorIs(t, err, repository.ErrDayPlanBreakNotFound)
}

func TestDayPlanRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	require.NoError(t, repo.Create(ctx, &model.DayPlan{TenantID: tenant.ID, Code: "B", Name: "Plan B", PlanType: model.PlanTypeFixed, RegularHours: 480}))
	require.NoError(t, repo.Create(ctx, &model.DayPlan{TenantID: tenant.ID, Code: "A", Name: "Plan A", PlanType: model.PlanTypeFixed, RegularHours: 420}))

	plans, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, plans, 2)
	// Verify ordered by code
	assert.Equal(t, "A", plans[0].Code)
	assert.Equal(t, "B", plans[1].Code)
}

func TestDayPlanRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)

	plans, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, plans)
}

func TestDayPlanRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	require.NoError(t, repo.Create(ctx, &model.DayPlan{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active", PlanType: model.PlanTypeFixed, RegularHours: 480, IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.DayPlan{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive", PlanType: model.PlanTypeFixed, RegularHours: 480, IsActive: false}))

	plans, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, plans, 1)
	assert.Equal(t, "ACTIVE", plans[0].Code)
}

func TestDayPlanRepository_ListByPlanType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	require.NoError(t, repo.Create(ctx, &model.DayPlan{TenantID: tenant.ID, Code: "FIXED1", Name: "Fixed 1", PlanType: model.PlanTypeFixed, RegularHours: 480}))
	require.NoError(t, repo.Create(ctx, &model.DayPlan{TenantID: tenant.ID, Code: "FLEX1", Name: "Flex 1", PlanType: model.PlanTypeFlextime, RegularHours: 480}))
	require.NoError(t, repo.Create(ctx, &model.DayPlan{TenantID: tenant.ID, Code: "FIXED2", Name: "Fixed 2", PlanType: model.PlanTypeFixed, RegularHours: 420}))

	fixedPlans, err := repo.ListByPlanType(ctx, tenant.ID, model.PlanTypeFixed)
	require.NoError(t, err)
	assert.Len(t, fixedPlans, 2)

	flextimePlans, err := repo.ListByPlanType(ctx, tenant.ID, model.PlanTypeFlextime)
	require.NoError(t, err)
	assert.Len(t, flextimePlans, 1)
	assert.Equal(t, "FLEX1", flextimePlans[0].Code)
}

func TestDayPlanRepository_BreakManagement(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	plan := &model.DayPlan{TenantID: tenant.ID, Code: "BREAK-TEST", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480}
	require.NoError(t, repo.Create(ctx, plan))

	// Add break
	startTime := 720
	endTime := 750
	breakItem := &model.DayPlanBreak{
		DayPlanID: plan.ID,
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime,
		EndTime:   &endTime,
		Duration:  30,
		IsPaid:    false,
		SortOrder: 1,
	}
	err := repo.AddBreak(ctx, breakItem)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, breakItem.ID)

	// Get break
	found, err := repo.GetBreak(ctx, breakItem.ID)
	require.NoError(t, err)
	assert.Equal(t, breakItem.ID, found.ID)
	assert.Equal(t, 30, found.Duration)

	// Update break
	newEndTime := 760
	breakItem.EndTime = &newEndTime
	breakItem.Duration = 40
	err = repo.UpdateBreak(ctx, breakItem)
	require.NoError(t, err)

	found, err = repo.GetBreak(ctx, breakItem.ID)
	require.NoError(t, err)
	assert.Equal(t, 40, found.Duration)

	// Delete break
	err = repo.DeleteBreak(ctx, breakItem.ID)
	require.NoError(t, err)

	_, err = repo.GetBreak(ctx, breakItem.ID)
	assert.ErrorIs(t, err, repository.ErrDayPlanBreakNotFound)
}

func TestDayPlanRepository_DeleteBreak_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	err := repo.DeleteBreak(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDayPlanBreakNotFound)
}

func TestDayPlanRepository_BonusManagement(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	account := createTestAccountForDayPlan(t, db, tenant.ID)
	plan := &model.DayPlan{TenantID: tenant.ID, Code: "BONUS-TEST", Name: "Bonus Test", PlanType: model.PlanTypeFixed, RegularHours: 480}
	require.NoError(t, repo.Create(ctx, plan))

	// Add bonus
	bonus := &model.DayPlanBonus{
		DayPlanID:       plan.ID,
		AccountID:       account.ID,
		TimeFrom:        1200,
		TimeTo:          1380,
		CalculationType: model.CalculationPerMinute,
		ValueMinutes:    15,
		SortOrder:       1,
	}
	err := repo.AddBonus(ctx, bonus)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, bonus.ID)

	// Get bonus
	found, err := repo.GetBonus(ctx, bonus.ID)
	require.NoError(t, err)
	assert.Equal(t, bonus.ID, found.ID)
	assert.Equal(t, 15, found.ValueMinutes)

	// Update bonus
	bonus.ValueMinutes = 25
	err = repo.UpdateBonus(ctx, bonus)
	require.NoError(t, err)

	found, err = repo.GetBonus(ctx, bonus.ID)
	require.NoError(t, err)
	assert.Equal(t, 25, found.ValueMinutes)

	// Delete bonus
	err = repo.DeleteBonus(ctx, bonus.ID)
	require.NoError(t, err)

	_, err = repo.GetBonus(ctx, bonus.ID)
	assert.ErrorIs(t, err, repository.ErrDayPlanBonusNotFound)
}

func TestDayPlanRepository_DeleteBonus_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	err := repo.DeleteBonus(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDayPlanBonusNotFound)
}

func TestDayPlanRepository_BreakTypes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDayPlan(t, db)
	plan := &model.DayPlan{TenantID: tenant.ID, Code: "BREAK-TYPES", Name: "Break Types", PlanType: model.PlanTypeFixed, RegularHours: 480}
	require.NoError(t, repo.Create(ctx, plan))

	// Fixed break
	startTime := 720
	endTime := 750
	fixedBreak := &model.DayPlanBreak{
		DayPlanID: plan.ID,
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime,
		EndTime:   &endTime,
		Duration:  30,
	}
	require.NoError(t, repo.AddBreak(ctx, fixedBreak))

	// Variable break
	variableBreak := &model.DayPlanBreak{
		DayPlanID:  plan.ID,
		BreakType:  model.BreakTypeVariable,
		Duration:   30,
		AutoDeduct: true,
	}
	require.NoError(t, repo.AddBreak(ctx, variableBreak))

	// Minimum break
	afterWork := 360 // 6 hours
	minimumBreak := &model.DayPlanBreak{
		DayPlanID:        plan.ID,
		BreakType:        model.BreakTypeMinimum,
		Duration:         30,
		AfterWorkMinutes: &afterWork,
	}
	require.NoError(t, repo.AddBreak(ctx, minimumBreak))

	// Get with details
	found, err := repo.GetWithDetails(ctx, plan.ID)
	require.NoError(t, err)
	assert.Len(t, found.Breaks, 3)
}
