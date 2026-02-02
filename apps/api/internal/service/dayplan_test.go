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

func createTestTenantForDayPlanService(t *testing.T, db *repository.DB) *model.Tenant {
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

func createTestAccountForDayPlanService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Account {
	t.Helper()
	accountRepo := repository.NewAccountRepository(db)
	account := &model.Account{
		TenantID:    &tenantID,
		Code:        "BONUS_SVC_" + uuid.New().String()[:8],
		Name:        "Bonus Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}
	require.NoError(t, accountRepo.Create(context.Background(), account))
	return account
}

func TestDayPlanService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "STANDARD",
		Name:         "Standard Day",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "STANDARD", plan.Code)
	assert.Equal(t, "Standard Day", plan.Name)
	assert.Equal(t, model.PlanTypeFixed, plan.PlanType)
	assert.Equal(t, 480, plan.RegularHours)
	assert.True(t, plan.IsActive)
}

func TestDayPlanService_Create_WithTimeWindows(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	comeFrom := 420  // 07:00
	comeTo := 540    // 09:00
	goFrom := 960    // 16:00
	goTo := 1140     // 19:00
	coreStart := 540 // 09:00
	coreEnd := 960   // 16:00

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "FLEX",
		Name:         "Flextime Standard",
		PlanType:     model.PlanTypeFlextime,
		ComeFrom:     &comeFrom,
		ComeTo:       &comeTo,
		GoFrom:       &goFrom,
		GoTo:         &goTo,
		CoreStart:    &coreStart,
		CoreEnd:      &coreEnd,
		RegularHours: 480,
	}

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "FLEX", plan.Code)
	assert.Equal(t, model.PlanTypeFlextime, plan.PlanType)
	assert.Equal(t, &comeFrom, plan.ComeFrom)
	assert.Equal(t, &comeTo, plan.ComeTo)
}

func TestDayPlanService_Create_DefaultPlanType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "DEFAULT",
		Name:         "Default Plan",
		RegularHours: 480,
		// PlanType not specified
	}

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, model.PlanTypeFixed, plan.PlanType)
}

func TestDayPlanService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "",
		Name:         "Test Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrDayPlanCodeRequired)
}

func TestDayPlanService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "TEST",
		Name:         "",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrDayPlanNameRequired)
}

func TestDayPlanService_Create_InvalidRegularHours(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "TEST",
		Name:         "Test Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 0, // Invalid
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidRegularHours)
}

func TestDayPlanService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "DUPLICATE",
		Name:         "First Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "DUPLICATE",
		Name:         "Second Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrDayPlanCodeExists)
}

func TestDayPlanService_Create_ReservedCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "u",
		Name:         "Reserved Code",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrDayPlanCodeReserved)
}

func TestDayPlanService_Create_InvalidTimeRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	comeFrom := 540 // 09:00
	comeTo := 480   // 08:00 (before comeFrom - invalid)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "INVALID",
		Name:         "Invalid Time Range",
		PlanType:     model.PlanTypeFlextime,
		ComeFrom:     &comeFrom,
		ComeTo:       &comeTo,
		RegularHours: 480,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidTimeRange)
}

func TestDayPlanService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "GET",
		Name:         "Get Test",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Get Test", found.Name)
}

func TestDayPlanService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrDayPlanNotFound)
}

func TestDayPlanService_GetDetails_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)
	account := createTestAccountForDayPlanService(t, db, tenant.ID)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "DETAILS",
		Name:         "Details Test",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Add break
	startTime := 720
	endTime := 750
	breakInput := service.CreateBreakInput{
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime,
		EndTime:   &endTime,
		Duration:  30,
	}
	_, err = svc.AddBreak(ctx, created.ID, breakInput)
	require.NoError(t, err)

	// Add bonus
	bonusInput := service.CreateBonusInput{
		AccountID:       account.ID,
		TimeFrom:        1200,
		TimeTo:          1380,
		CalculationType: model.CalculationPerMinute,
		ValueMinutes:    15,
	}
	_, err = svc.AddBonus(ctx, created.ID, bonusInput)
	require.NoError(t, err)

	found, err := svc.GetDetails(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Len(t, found.Breaks, 1)
	assert.Len(t, found.Bonuses, 1)
}

func TestDayPlanService_GetByCode_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "BYCODE",
		Name:         "By Code Test",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByCode(ctx, tenant.ID, "BYCODE")
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestDayPlanService_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	_, err := svc.GetByCode(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, service.ErrDayPlanNotFound)
}

func TestDayPlanService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "UPDATE",
		Name:         "Original Name",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newRegularHours := 420
	isActive := false
	updateInput := service.UpdateDayPlanInput{
		Name:         &newName,
		RegularHours: &newRegularHours,
		IsActive:     &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, 420, updated.RegularHours)
	assert.False(t, updated.IsActive)
}

func TestDayPlanService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateDayPlanInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrDayPlanNotFound)
}

func TestDayPlanService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "UPDATE",
		Name:         "Original Name",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateDayPlanInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrDayPlanNameRequired)
}

func TestDayPlanService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "DELETE",
		Name:         "To Delete",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrDayPlanNotFound)
}

func TestDayPlanService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrDayPlanNotFound)
}

func TestDayPlanService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	for _, code := range []string{"PLAN-A", "PLAN-B", "PLAN-C"} {
		input := service.CreateDayPlanInput{
			TenantID:     tenant.ID,
			Code:         code,
			Name:         "Plan " + code,
			PlanType:     model.PlanTypeFixed,
			RegularHours: 480,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	plans, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, plans, 3)
}

func TestDayPlanService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	// Create active plan
	input1 := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "ACTIVE",
		Name:         "Active Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate another plan
	input2 := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "INACTIVE",
		Name:         "Inactive Plan",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	isActive := false
	_, err = svc.Update(ctx, created2.ID, service.UpdateDayPlanInput{IsActive: &isActive})
	require.NoError(t, err)

	plans, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, plans, 1)
	assert.Equal(t, "ACTIVE", plans[0].Code)
}

func TestDayPlanService_ListByPlanType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	_, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "FIXED1", Name: "Fixed 1", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "FLEX1", Name: "Flex 1", PlanType: model.PlanTypeFlextime, RegularHours: 480})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "FIXED2", Name: "Fixed 2", PlanType: model.PlanTypeFixed, RegularHours: 420})
	require.NoError(t, err)

	fixedPlans, err := svc.ListByPlanType(ctx, tenant.ID, model.PlanTypeFixed)
	require.NoError(t, err)
	assert.Len(t, fixedPlans, 2)

	flextimePlans, err := svc.ListByPlanType(ctx, tenant.ID, model.PlanTypeFlextime)
	require.NoError(t, err)
	assert.Len(t, flextimePlans, 1)
}

func TestDayPlanService_Copy_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)
	account := createTestAccountForDayPlanService(t, db, tenant.ID)

	comeFrom := 420
	comeTo := 540
	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "ORIGINAL",
		Name:         "Original Plan",
		PlanType:     model.PlanTypeFlextime,
		ComeFrom:     &comeFrom,
		ComeTo:       &comeTo,
		RegularHours: 480,
	}
	original, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Add break
	startTime := 720
	endTime := 750
	breakInput := service.CreateBreakInput{
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime,
		EndTime:   &endTime,
		Duration:  30,
	}
	_, err = svc.AddBreak(ctx, original.ID, breakInput)
	require.NoError(t, err)

	// Add bonus
	bonusInput := service.CreateBonusInput{
		AccountID:       account.ID,
		TimeFrom:        1200,
		TimeTo:          1380,
		CalculationType: model.CalculationPerMinute,
		ValueMinutes:    15,
	}
	_, err = svc.AddBonus(ctx, original.ID, bonusInput)
	require.NoError(t, err)

	// Copy
	copied, err := svc.Copy(ctx, original.ID, "COPY", "Copied Plan")
	require.NoError(t, err)

	assert.NotEqual(t, original.ID, copied.ID)
	assert.Equal(t, "COPY", copied.Code)
	assert.Equal(t, "Copied Plan", copied.Name)
	assert.Equal(t, model.PlanTypeFlextime, copied.PlanType)
	assert.Equal(t, &comeFrom, copied.ComeFrom)
	assert.Len(t, copied.Breaks, 1)
	assert.Len(t, copied.Bonuses, 1)
}

func TestDayPlanService_Copy_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	_, err := svc.Copy(ctx, uuid.New(), "NEW", "New Plan")
	assert.ErrorIs(t, err, service.ErrDayPlanNotFound)
}

func TestDayPlanService_Copy_CodeExists(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	_, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "ORIGINAL", Name: "Original", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)
	created2, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "EXISTING", Name: "Existing", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	_, err = svc.Copy(ctx, created2.ID, "ORIGINAL", "Copy")
	assert.ErrorIs(t, err, service.ErrDayPlanCodeExists)
}

func TestDayPlanService_Copy_ReservedCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	original, err := svc.Create(ctx, service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "ORIGINAL",
		Name:         "Original",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	})
	require.NoError(t, err)

	_, err = svc.Copy(ctx, original.ID, "K", "Copy")
	assert.ErrorIs(t, err, service.ErrDayPlanCodeReserved)
}

func TestDayPlanService_AddBreak_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	startTime := 720
	endTime := 750
	breakInput := service.CreateBreakInput{
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime,
		EndTime:   &endTime,
		Duration:  30,
	}

	b, err := svc.AddBreak(ctx, plan.ID, breakInput)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, b.ID)
	assert.Equal(t, 30, b.Duration)
}

func TestDayPlanService_AddBreak_PlanNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	startTime := 720
	endTime := 750
	breakInput := service.CreateBreakInput{
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime,
		EndTime:   &endTime,
		Duration:  30,
	}

	_, err := svc.AddBreak(ctx, uuid.New(), breakInput)
	assert.ErrorIs(t, err, service.ErrDayPlanNotFound)
}

func TestDayPlanService_AddBreak_InvalidConfig_FixedWithoutTimes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	breakInput := service.CreateBreakInput{
		BreakType: model.BreakTypeFixed,
		Duration:  30,
		// Missing start/end time for fixed break
	}

	_, err = svc.AddBreak(ctx, plan.ID, breakInput)
	assert.ErrorIs(t, err, service.ErrInvalidBreakConfig)
}

func TestDayPlanService_AddBreak_InvalidConfig_MinimumWithoutAfterWork(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	breakInput := service.CreateBreakInput{
		BreakType: model.BreakTypeMinimum,
		Duration:  30,
		// Missing after_work_minutes for minimum break
	}

	_, err = svc.AddBreak(ctx, plan.ID, breakInput)
	assert.ErrorIs(t, err, service.ErrInvalidBreakConfig)
}

func TestDayPlanService_AddBreak_InvalidTimeRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	startTime := 750
	endTime := 720 // Invalid: end before start
	breakInput := service.CreateBreakInput{
		BreakType: model.BreakTypeFixed,
		StartTime: &startTime,
		EndTime:   &endTime,
		Duration:  30,
	}

	_, err = svc.AddBreak(ctx, plan.ID, breakInput)
	assert.ErrorIs(t, err, service.ErrInvalidTimeRange)
}

func TestDayPlanService_DeleteBreak_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	startTime := 720
	endTime := 750
	b, err := svc.AddBreak(ctx, plan.ID, service.CreateBreakInput{BreakType: model.BreakTypeFixed, StartTime: &startTime, EndTime: &endTime, Duration: 30})
	require.NoError(t, err)

	err = svc.DeleteBreak(ctx, b.ID)
	require.NoError(t, err)

	// Verify deleted
	details, err := svc.GetDetails(ctx, plan.ID)
	require.NoError(t, err)
	assert.Len(t, details.Breaks, 0)
}

func TestDayPlanService_DeleteBreak_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	err := svc.DeleteBreak(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrDayPlanBreakNotFound)
}

func TestDayPlanService_AddBonus_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)
	account := createTestAccountForDayPlanService(t, db, tenant.ID)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BONUS", Name: "Bonus Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	bonusInput := service.CreateBonusInput{
		AccountID:       account.ID,
		TimeFrom:        1200,
		TimeTo:          1380,
		CalculationType: model.CalculationPerMinute,
		ValueMinutes:    15,
	}

	b, err := svc.AddBonus(ctx, plan.ID, bonusInput)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, b.ID)
	assert.Equal(t, 15, b.ValueMinutes)
}

func TestDayPlanService_AddBonus_InvalidTimeRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)
	account := createTestAccountForDayPlanService(t, db, tenant.ID)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BONUS", Name: "Bonus Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	bonusInput := service.CreateBonusInput{
		AccountID:       account.ID,
		TimeFrom:        1380,
		TimeTo:          1200, // Invalid: end before start
		CalculationType: model.CalculationPerMinute,
		ValueMinutes:    15,
	}

	_, err = svc.AddBonus(ctx, plan.ID, bonusInput)
	assert.ErrorIs(t, err, service.ErrInvalidTimeRange)
}

func TestDayPlanService_DeleteBonus_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)
	account := createTestAccountForDayPlanService(t, db, tenant.ID)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BONUS", Name: "Bonus Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	b, err := svc.AddBonus(ctx, plan.ID, service.CreateBonusInput{AccountID: account.ID, TimeFrom: 1200, TimeTo: 1380, CalculationType: model.CalculationPerMinute, ValueMinutes: 15})
	require.NoError(t, err)

	err = svc.DeleteBonus(ctx, b.ID)
	require.NoError(t, err)

	// Verify deleted
	details, err := svc.GetDetails(ctx, plan.ID)
	require.NoError(t, err)
	assert.Len(t, details.Bonuses, 0)
}

func TestDayPlanService_DeleteBonus_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	err := svc.DeleteBonus(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrDayPlanBonusNotFound)
}

func TestDayPlanService_AddBreak_VariableBreak(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "VARIABLE", Name: "Variable Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	breakInput := service.CreateBreakInput{
		BreakType:  model.BreakTypeVariable,
		Duration:   30,
		AutoDeduct: true,
	}

	b, err := svc.AddBreak(ctx, plan.ID, breakInput)
	require.NoError(t, err)
	assert.Equal(t, model.BreakTypeVariable, b.BreakType)
	assert.True(t, b.AutoDeduct)
}

func TestDayPlanService_AddBreak_MinimumBreak(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "MINIMUM", Name: "Minimum Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	afterWork := 360 // 6 hours
	breakInput := service.CreateBreakInput{
		BreakType:        model.BreakTypeMinimum,
		Duration:         30,
		AfterWorkMinutes: &afterWork,
	}

	b, err := svc.AddBreak(ctx, plan.ID, breakInput)
	require.NoError(t, err)
	assert.Equal(t, model.BreakTypeMinimum, b.BreakType)
	assert.Equal(t, &afterWork, b.AfterWorkMinutes)
}

func TestDayPlanService_Create_WithNetCapAccounts(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)
	netAccount := createTestAccountForDayPlanService(t, db, tenant.ID)
	capAccount := createTestAccountForDayPlanService(t, db, tenant.ID)

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "NETCAP",
		Name:         "Day Plan with Net/Cap",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
		NetAccountID: &netAccount.ID,
		CapAccountID: &capAccount.ID,
	}

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "NETCAP", plan.Code)
	require.NotNil(t, plan.NetAccountID)
	assert.Equal(t, netAccount.ID, *plan.NetAccountID)
	require.NotNil(t, plan.CapAccountID)
	assert.Equal(t, capAccount.ID, *plan.CapAccountID)
}

func TestDayPlanService_Update_NetCapAccounts(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	// Create plan without net/cap accounts
	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "UPNETCAP",
		Name:         "Update Net/Cap",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Nil(t, plan.NetAccountID)
	assert.Nil(t, plan.CapAccountID)

	// Create accounts
	netAccount := createTestAccountForDayPlanService(t, db, tenant.ID)
	capAccount := createTestAccountForDayPlanService(t, db, tenant.ID)

	// Update with net/cap account IDs
	updateInput := service.UpdateDayPlanInput{
		NetAccountID:    &netAccount.ID,
		SetNetAccountID: true,
		CapAccountID:    &capAccount.ID,
		SetCapAccountID: true,
	}
	updated, err := svc.Update(ctx, plan.ID, updateInput)
	require.NoError(t, err)
	require.NotNil(t, updated.NetAccountID)
	assert.Equal(t, netAccount.ID, *updated.NetAccountID)
	require.NotNil(t, updated.CapAccountID)
	assert.Equal(t, capAccount.ID, *updated.CapAccountID)
}

func TestDayPlanService_Copy_PreservesNetCapAccounts(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)
	netAccount := createTestAccountForDayPlanService(t, db, tenant.ID)
	capAccount := createTestAccountForDayPlanService(t, db, tenant.ID)

	// Create plan with net/cap accounts
	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "CPYNETCAP",
		Name:         "Copy Net/Cap",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
		NetAccountID: &netAccount.ID,
		CapAccountID: &capAccount.ID,
	}
	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Copy the plan
	copied, err := svc.Copy(ctx, plan.ID, "CPYNETCAP2", "Copy Net/Cap 2")
	require.NoError(t, err)
	require.NotNil(t, copied.NetAccountID)
	assert.Equal(t, netAccount.ID, *copied.NetAccountID)
	require.NotNil(t, copied.CapAccountID)
	assert.Equal(t, capAccount.ID, *copied.CapAccountID)
}

// --- ZMI-TICKET-039: Flextime tolerance normalization tests ---

func TestDayPlanService_Create_FlextimeNormalizesTolerance(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	comeFrom := 420
	goTo := 1020
	input := service.CreateDayPlanInput{
		TenantID:           tenant.ID,
		Code:               "FLEX-TOL",
		Name:               "Flextime With Tolerance",
		PlanType:           model.PlanTypeFlextime,
		ComeFrom:           &comeFrom,
		GoTo:               &goTo,
		RegularHours:       480,
		ToleranceComePlus:  5,
		ToleranceComeMinus: 10,
		ToleranceGoPlus:    10,
		ToleranceGoMinus:   5,
		VariableWorkTime:   true,
	}

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// ZMI Section 6.2: These fields have no meaning for flextime
	assert.Equal(t, 0, plan.ToleranceComePlus, "ComePlus should be normalized to 0 for flextime")
	assert.Equal(t, 0, plan.ToleranceGoMinus, "GoMinus should be normalized to 0 for flextime")
	assert.False(t, plan.VariableWorkTime, "VariableWorkTime should be normalized to false for flextime")

	// These fields ARE valid for flextime and should be preserved
	assert.Equal(t, 10, plan.ToleranceComeMinus, "ComeMinus should be preserved for flextime")
	assert.Equal(t, 10, plan.ToleranceGoPlus, "GoPlus should be preserved for flextime")
}

func TestDayPlanService_Create_FixedPreservesTolerance(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	input := service.CreateDayPlanInput{
		TenantID:           tenant.ID,
		Code:               "FIXED-TOL",
		Name:               "Fixed With Tolerance",
		PlanType:           model.PlanTypeFixed,
		RegularHours:       480,
		ToleranceComePlus:  5,
		ToleranceComeMinus: 10,
		ToleranceGoPlus:    10,
		ToleranceGoMinus:   5,
		VariableWorkTime:   true,
	}

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Fixed plans should preserve all tolerance values
	assert.Equal(t, 5, plan.ToleranceComePlus, "ComePlus should be preserved for fixed")
	assert.Equal(t, 10, plan.ToleranceComeMinus, "ComeMinus should be preserved for fixed")
	assert.Equal(t, 10, plan.ToleranceGoPlus, "GoPlus should be preserved for fixed")
	assert.Equal(t, 5, plan.ToleranceGoMinus, "GoMinus should be preserved for fixed")
	assert.True(t, plan.VariableWorkTime, "VariableWorkTime should be preserved for fixed")
}

func TestDayPlanService_Update_ChangeToFlextimeNormalizesTolerance(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	// Create a fixed plan with tolerance values
	input := service.CreateDayPlanInput{
		TenantID:           tenant.ID,
		Code:               "FIX2FLEX",
		Name:               "Fixed to Flextime",
		PlanType:           model.PlanTypeFixed,
		RegularHours:       480,
		ToleranceComePlus:  5,
		ToleranceComeMinus: 10,
		ToleranceGoPlus:    10,
		ToleranceGoMinus:   5,
		VariableWorkTime:   true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Verify fixed plan preserved values
	assert.Equal(t, 5, created.ToleranceComePlus)
	assert.Equal(t, 5, created.ToleranceGoMinus)
	assert.True(t, created.VariableWorkTime)

	// Update plan_type to flextime
	flextimePT := model.PlanTypeFlextime
	updated, err := svc.Update(ctx, created.ID, service.UpdateDayPlanInput{
		PlanType: &flextimePT,
	})
	require.NoError(t, err)

	// ZMI Section 6.2: After switching to flextime, fields should be normalized
	assert.Equal(t, 0, updated.ToleranceComePlus, "ComePlus should be normalized to 0 after switch to flextime")
	assert.Equal(t, 0, updated.ToleranceGoMinus, "GoMinus should be normalized to 0 after switch to flextime")
	assert.False(t, updated.VariableWorkTime, "VariableWorkTime should be normalized to false after switch to flextime")

	// ComeMinus and GoPlus should be preserved
	assert.Equal(t, 10, updated.ToleranceComeMinus, "ComeMinus should be preserved for flextime")
	assert.Equal(t, 10, updated.ToleranceGoPlus, "GoPlus should be preserved for flextime")
}

func TestDayPlanService_Update_FlextimeToleranceSetToNonZeroNormalized(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	// Create a flextime plan (tolerance fields already normalized to 0)
	comeFrom := 420
	goTo := 1020
	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "FLEX-UPD",
		Name:         "Flextime Update Test",
		PlanType:     model.PlanTypeFlextime,
		ComeFrom:     &comeFrom,
		GoTo:         &goTo,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, 0, created.ToleranceComePlus)

	// Try to update with non-zero ComePlus
	comePlus := 5
	updated, err := svc.Update(ctx, created.ID, service.UpdateDayPlanInput{
		ToleranceComePlus: &comePlus,
	})
	require.NoError(t, err)

	// Should still be 0 after normalization
	assert.Equal(t, 0, updated.ToleranceComePlus, "ComePlus should be normalized to 0 even when explicitly set for flextime")
}

func TestDayPlanService_Copy_FlextimeNormalizesTolerance(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDayPlanRepository(db)
	svc := service.NewDayPlanService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDayPlanService(t, db)

	// Create a fixed plan with tolerance values
	input := service.CreateDayPlanInput{
		TenantID:           tenant.ID,
		Code:               "ORIG-CPY",
		Name:               "Original For Copy",
		PlanType:           model.PlanTypeFixed,
		RegularHours:       480,
		ToleranceComePlus:  5,
		ToleranceComeMinus: 10,
		ToleranceGoPlus:    10,
		ToleranceGoMinus:   5,
		VariableWorkTime:   true,
	}
	original, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Switch original to flextime
	flextimePT := model.PlanTypeFlextime
	original, err = svc.Update(ctx, original.ID, service.UpdateDayPlanInput{
		PlanType: &flextimePT,
	})
	require.NoError(t, err)

	// Copy the flextime plan
	copied, err := svc.Copy(ctx, original.ID, "COPY-FLEX", "Copied Flextime")
	require.NoError(t, err)

	// Copy should also be normalized
	assert.Equal(t, model.PlanTypeFlextime, copied.PlanType)
	assert.Equal(t, 0, copied.ToleranceComePlus, "ComePlus should be normalized to 0 in copied flextime plan")
	assert.Equal(t, 0, copied.ToleranceGoMinus, "GoMinus should be normalized to 0 in copied flextime plan")
	assert.False(t, copied.VariableWorkTime, "VariableWorkTime should be normalized to false in copied flextime plan")
}
