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

func createTestTenantForWeekPlanService(t *testing.T, db *repository.DB) *model.Tenant {
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

func createTestDayPlanForWeekPlanService(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string) *model.DayPlan {
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

// completeWeekPlanInput returns a CreateWeekPlanInput with all 7 days filled.
func completeWeekPlanInput(t *testing.T, db *repository.DB, tenantID uuid.UUID, code, name string) service.CreateWeekPlanInput {
	t.Helper()
	dp := createTestDayPlanForWeekPlanService(t, db, tenantID, code+"-"+uuid.New().String()[:4])
	return service.CreateWeekPlanInput{
		TenantID:           tenantID,
		Code:               code,
		Name:               name,
		MondayDayPlanID:    &dp.ID,
		TuesdayDayPlanID:   &dp.ID,
		WednesdayDayPlanID: &dp.ID,
		ThursdayDayPlanID:  &dp.ID,
		FridayDayPlanID:    &dp.ID,
		SaturdayDayPlanID:  &dp.ID,
		SundayDayPlanID:    &dp.ID,
	}
}

func TestWeekPlanService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	input := completeWeekPlanInput(t, db, tenant.ID, "STANDARD", "Standard Week")

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "STANDARD", plan.Code)
	assert.Equal(t, "Standard Week", plan.Name)
	assert.True(t, plan.IsActive)
}

func TestWeekPlanService_Create_WithDayPlans(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	monPlan := createTestDayPlanForWeekPlanService(t, db, tenant.ID, "MON-SVC")
	tuePlan := createTestDayPlanForWeekPlanService(t, db, tenant.ID, "TUE-SVC")
	otherPlan := createTestDayPlanForWeekPlanService(t, db, tenant.ID, "OTHER-SVC")

	input := service.CreateWeekPlanInput{
		TenantID:           tenant.ID,
		Code:               "WITH-DAYS",
		Name:               "Week with Days",
		MondayDayPlanID:    &monPlan.ID,
		TuesdayDayPlanID:   &tuePlan.ID,
		WednesdayDayPlanID: &otherPlan.ID,
		ThursdayDayPlanID:  &otherPlan.ID,
		FridayDayPlanID:    &otherPlan.ID,
		SaturdayDayPlanID:  &otherPlan.ID,
		SundayDayPlanID:    &otherPlan.ID,
	}

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, &monPlan.ID, plan.MondayDayPlanID)
	assert.Equal(t, &tuePlan.ID, plan.TuesdayDayPlanID)
	assert.NotNil(t, plan.WednesdayDayPlanID)
}

func TestWeekPlanService_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	description := "A standard 5-day work week"

	input := completeWeekPlanInput(t, db, tenant.ID, "DESC-TEST", "Description Test")
	input.Description = &description

	plan, err := svc.Create(ctx, input)
	require.NoError(t, err)
	require.NotNil(t, plan.Description)
	assert.Equal(t, description, *plan.Description)
}

func TestWeekPlanService_Create_Incomplete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	dp := createTestDayPlanForWeekPlanService(t, db, tenant.ID, "PARTIAL")

	// Only Monday set — missing 6 other days
	input := service.CreateWeekPlanInput{
		TenantID:        tenant.ID,
		Code:            "INCOMPLETE",
		Name:            "Incomplete Week",
		MondayDayPlanID: &dp.ID,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrWeekPlanIncomplete)
}

func TestWeekPlanService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)

	input := service.CreateWeekPlanInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Test Plan",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrWeekPlanCodeReq)
}

func TestWeekPlanService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)

	input := service.CreateWeekPlanInput{
		TenantID: tenant.ID,
		Code:     "TEST",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrWeekPlanNameReq)
}

func TestWeekPlanService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)

	input := completeWeekPlanInput(t, db, tenant.ID, "DUPLICATE", "First Plan")
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := completeWeekPlanInput(t, db, tenant.ID, "DUPLICATE", "Second Plan")
	// Use same code to trigger duplicate
	input2.Code = "DUPLICATE"
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrWeekPlanCodeExists)
}

func TestWeekPlanService_Create_InvalidDayPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	invalidID := uuid.New()
	dp := createTestDayPlanForWeekPlanService(t, db, tenant.ID, "VALID")

	input := service.CreateWeekPlanInput{
		TenantID:           tenant.ID,
		Code:               "INVALID-DAY",
		Name:               "Invalid Day Plan",
		MondayDayPlanID:    &invalidID,
		TuesdayDayPlanID:   &dp.ID,
		WednesdayDayPlanID: &dp.ID,
		ThursdayDayPlanID:  &dp.ID,
		FridayDayPlanID:    &dp.ID,
		SaturdayDayPlanID:  &dp.ID,
		SundayDayPlanID:    &dp.ID,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidDayPlan)
}

func TestWeekPlanService_Create_DayPlanFromOtherTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant1 := createTestTenantForWeekPlanService(t, db)
	tenant2 := createTestTenantForWeekPlanService(t, db)

	// Create day plan for tenant2
	otherTenantPlan := createTestDayPlanForWeekPlanService(t, db, tenant2.ID, "OTHER-TENANT")
	dp := createTestDayPlanForWeekPlanService(t, db, tenant1.ID, "VALID")

	// Try to use other tenant's plan for Monday
	input := service.CreateWeekPlanInput{
		TenantID:           tenant1.ID,
		Code:               "CROSS-TENANT",
		Name:               "Cross Tenant",
		MondayDayPlanID:    &otherTenantPlan.ID,
		TuesdayDayPlanID:   &dp.ID,
		WednesdayDayPlanID: &dp.ID,
		ThursdayDayPlanID:  &dp.ID,
		FridayDayPlanID:    &dp.ID,
		SaturdayDayPlanID:  &dp.ID,
		SundayDayPlanID:    &dp.ID,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidDayPlan)
}

func TestWeekPlanService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	input := completeWeekPlanInput(t, db, tenant.ID, "GET", "Get Test")

	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Get Test", found.Name)
}

func TestWeekPlanService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrWeekPlanNotFound)
}

func TestWeekPlanService_GetDetails_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	monPlan := createTestDayPlanForWeekPlanService(t, db, tenant.ID, "MON-DETAILS")
	otherPlan := createTestDayPlanForWeekPlanService(t, db, tenant.ID, "OTHER-DETAILS")

	input := service.CreateWeekPlanInput{
		TenantID:           tenant.ID,
		Code:               "DETAILS",
		Name:               "Details Test",
		MondayDayPlanID:    &monPlan.ID,
		TuesdayDayPlanID:   &otherPlan.ID,
		WednesdayDayPlanID: &otherPlan.ID,
		ThursdayDayPlanID:  &otherPlan.ID,
		FridayDayPlanID:    &otherPlan.ID,
		SaturdayDayPlanID:  &otherPlan.ID,
		SundayDayPlanID:    &otherPlan.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetDetails(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.NotNil(t, found.MondayDayPlan)
	assert.Equal(t, "MON-DETAILS", found.MondayDayPlan.Code)
}

func TestWeekPlanService_GetDetails_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	_, err := svc.GetDetails(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrWeekPlanNotFound)
}

func TestWeekPlanService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	input := completeWeekPlanInput(t, db, tenant.ID, "UPDATE", "Original Name")

	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	isActive := false
	updateInput := service.UpdateWeekPlanInput{
		Name:     &newName,
		IsActive: &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.False(t, updated.IsActive)
}

func TestWeekPlanService_Update_SwapDayPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	input := completeWeekPlanInput(t, db, tenant.ID, "SWAP-DAY", "Swap Day Plan")

	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Swap Monday to a new day plan
	newDayPlan := createTestDayPlanForWeekPlanService(t, db, tenant.ID, "NEW-MON")
	updateInput := service.UpdateWeekPlanInput{
		MondayDayPlanID: &newDayPlan.ID,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, &newDayPlan.ID, updated.MondayDayPlanID)
}

func TestWeekPlanService_Update_ClearDayPlan_Rejected(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	input := completeWeekPlanInput(t, db, tenant.ID, "CLEAR-DAY", "Clear Day Plan")

	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Clearing a day plan should fail since it would make the week plan incomplete
	updateInput := service.UpdateWeekPlanInput{
		ClearMondayDayPlan: true,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrWeekPlanIncomplete)
}

func TestWeekPlanService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateWeekPlanInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrWeekPlanNotFound)
}

func TestWeekPlanService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	input := completeWeekPlanInput(t, db, tenant.ID, "UPDATE-EMPTY", "Original Name")

	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateWeekPlanInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrWeekPlanNameReq)
}

func TestWeekPlanService_Update_InvalidDayPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	input := completeWeekPlanInput(t, db, tenant.ID, "UPDATE-INVALID", "Update Invalid")

	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	invalidID := uuid.New()
	updateInput := service.UpdateWeekPlanInput{
		MondayDayPlanID: &invalidID,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrInvalidDayPlan)
}

func TestWeekPlanService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)
	input := completeWeekPlanInput(t, db, tenant.ID, "DELETE", "To Delete")

	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrWeekPlanNotFound)
}

func TestWeekPlanService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrWeekPlanNotFound)
}

func TestWeekPlanService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)

	for _, code := range []string{"PLAN-A", "PLAN-B", "PLAN-C"} {
		input := completeWeekPlanInput(t, db, tenant.ID, code, "Plan "+code)
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	plans, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, plans, 3)
}

func TestWeekPlanService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForWeekPlanService(t, db)

	// Create active plan
	input1 := completeWeekPlanInput(t, db, tenant.ID, "ACTIVE", "Active Plan")
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate another plan
	input2 := completeWeekPlanInput(t, db, tenant.ID, "INACTIVE", "Inactive Plan")
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	isActive := false
	_, err = svc.Update(ctx, created2.ID, service.UpdateWeekPlanInput{IsActive: &isActive})
	require.NoError(t, err)

	plans, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, plans, 1)
	assert.Equal(t, "ACTIVE", plans[0].Code)
}
