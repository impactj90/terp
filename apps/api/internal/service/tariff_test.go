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

func createTestTenantForTariffService(t *testing.T, db *repository.DB) *model.Tenant {
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

func createTestWeekPlanForTariffService(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string) *model.WeekPlan {
	t.Helper()
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	plan := &model.WeekPlan{
		TenantID: tenantID,
		Code:     code,
		Name:     "Week Plan " + code,
		IsActive: true,
	}
	require.NoError(t, weekPlanRepo.Create(context.Background(), plan))
	return plan
}

func TestTariffService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "Standard Tariff",
	}

	tariff, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "STANDARD", tariff.Code)
	assert.Equal(t, "Standard Tariff", tariff.Name)
	assert.True(t, tariff.IsActive)
}

func TestTariffService_Create_WithWeekPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)
	weekPlan := createTestWeekPlanForTariffService(t, db, tenant.ID, "WP-TARIFF")

	input := service.CreateTariffInput{
		TenantID:   tenant.ID,
		Code:       "WITH-WP",
		Name:       "Tariff with Week Plan",
		WeekPlanID: &weekPlan.ID,
	}

	tariff, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, &weekPlan.ID, tariff.WeekPlanID)
}

func TestTariffService_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)
	description := "A standard tariff with default settings"

	input := service.CreateTariffInput{
		TenantID:    tenant.ID,
		Code:        "DESC-TEST",
		Name:        "Description Test",
		Description: &description,
	}

	tariff, err := svc.Create(ctx, input)
	require.NoError(t, err)
	require.NotNil(t, tariff.Description)
	assert.Equal(t, description, *tariff.Description)
}

func TestTariffService_Create_WithValidityDates(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)
	validFrom := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	validTo := time.Date(2024, 12, 31, 0, 0, 0, 0, time.UTC)

	input := service.CreateTariffInput{
		TenantID:  tenant.ID,
		Code:      "DATED",
		Name:      "Dated Tariff",
		ValidFrom: &validFrom,
		ValidTo:   &validTo,
	}

	tariff, err := svc.Create(ctx, input)
	require.NoError(t, err)
	require.NotNil(t, tariff.ValidFrom)
	require.NotNil(t, tariff.ValidTo)
	assert.Equal(t, validFrom.Year(), tariff.ValidFrom.Year())
	assert.Equal(t, validTo.Year(), tariff.ValidTo.Year())
}

func TestTariffService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Test Tariff",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrTariffCodeReq)
}

func TestTariffService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "TEST",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrTariffNameReq)
}

func TestTariffService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "DUPLICATE",
		Name:     "First Tariff",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "DUPLICATE",
		Name:     "Second Tariff",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrTariffCodeExists)
}

func TestTariffService_Create_InvalidWeekPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)
	invalidID := uuid.New()

	input := service.CreateTariffInput{
		TenantID:   tenant.ID,
		Code:       "INVALID-WP",
		Name:       "Invalid Week Plan",
		WeekPlanID: &invalidID,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidWeekPlan)
}

func TestTariffService_Create_WeekPlanFromOtherTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant1 := createTestTenantForTariffService(t, db)
	tenant2 := createTestTenantForTariffService(t, db)

	// Create week plan for tenant2
	otherTenantWeekPlan := createTestWeekPlanForTariffService(t, db, tenant2.ID, "OTHER-TENANT-WP")

	// Try to use it for tenant1's tariff
	input := service.CreateTariffInput{
		TenantID:   tenant1.ID,
		Code:       "CROSS-TENANT",
		Name:       "Cross Tenant",
		WeekPlanID: &otherTenantWeekPlan.ID,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidWeekPlan)
}

func TestTariffService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "GET",
		Name:     "Get Test",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Get Test", found.Name)
}

func TestTariffService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrTariffNotFound)
}

func TestTariffService_GetDetails_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)
	weekPlan := createTestWeekPlanForTariffService(t, db, tenant.ID, "WP-DETAILS")

	input := service.CreateTariffInput{
		TenantID:   tenant.ID,
		Code:       "DETAILS",
		Name:       "Details Test",
		WeekPlanID: &weekPlan.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Add a break
	breakInput := service.CreateTariffBreakInput{
		TariffID:  created.ID,
		BreakType: "minimum",
		Duration:  30,
	}
	_, err = svc.CreateBreak(ctx, breakInput)
	require.NoError(t, err)

	found, err := svc.GetDetails(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.NotNil(t, found.WeekPlan)
	assert.Equal(t, "WP-DETAILS", found.WeekPlan.Code)
	assert.Len(t, found.Breaks, 1)
}

func TestTariffService_GetDetails_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	_, err := svc.GetDetails(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrTariffNotFound)
}

func TestTariffService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "UPDATE",
		Name:     "Original Name",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	isActive := false
	updateInput := service.UpdateTariffInput{
		Name:     &newName,
		IsActive: &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, tenant.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.False(t, updated.IsActive)
}

func TestTariffService_Update_AddWeekPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)
	weekPlan := createTestWeekPlanForTariffService(t, db, tenant.ID, "WP-UPDATE")

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "UPDATE-WP",
		Name:     "Update Week Plan",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Nil(t, created.WeekPlanID)

	updateInput := service.UpdateTariffInput{
		WeekPlanID: &weekPlan.ID,
	}

	updated, err := svc.Update(ctx, created.ID, tenant.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, &weekPlan.ID, updated.WeekPlanID)
}

func TestTariffService_Update_ClearWeekPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)
	weekPlan := createTestWeekPlanForTariffService(t, db, tenant.ID, "WP-CLEAR")

	input := service.CreateTariffInput{
		TenantID:   tenant.ID,
		Code:       "CLEAR-WP",
		Name:       "Clear Week Plan",
		WeekPlanID: &weekPlan.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.NotNil(t, created.WeekPlanID)

	updateInput := service.UpdateTariffInput{
		ClearWeekPlan: true,
	}

	updated, err := svc.Update(ctx, created.ID, tenant.ID, updateInput)
	require.NoError(t, err)
	assert.Nil(t, updated.WeekPlanID)
}

func TestTariffService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	newName := "Updated"
	updateInput := service.UpdateTariffInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), tenant.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrTariffNotFound)
}

func TestTariffService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "UPDATE-EMPTY",
		Name:     "Original Name",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateTariffInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, tenant.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrTariffNameReq)
}

func TestTariffService_Update_InvalidWeekPlan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "UPDATE-INVALID",
		Name:     "Update Invalid",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	invalidID := uuid.New()
	updateInput := service.UpdateTariffInput{
		WeekPlanID: &invalidID,
	}

	_, err = svc.Update(ctx, created.ID, tenant.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrInvalidWeekPlan)
}

func TestTariffService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "DELETE",
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrTariffNotFound)
}

func TestTariffService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrTariffNotFound)
}

func TestTariffService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	for _, code := range []string{"TARIFF-A", "TARIFF-B", "TARIFF-C"} {
		input := service.CreateTariffInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Tariff " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	tariffs, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, tariffs, 3)
}

func TestTariffService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	// Create active tariff
	_, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active Tariff"})
	require.NoError(t, err)

	// Create and deactivate another tariff
	created2, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive Tariff"})
	require.NoError(t, err)

	isActive := false
	_, err = svc.Update(ctx, created2.ID, tenant.ID, service.UpdateTariffInput{IsActive: &isActive})
	require.NoError(t, err)

	tariffs, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, tariffs, 1)
	assert.Equal(t, "ACTIVE", tariffs[0].Code)
}

func TestTariffService_CreateBreak_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test"})
	require.NoError(t, err)

	afterWork := 360
	breakInput := service.CreateTariffBreakInput{
		TariffID:         tariff.ID,
		BreakType:        "minimum",
		AfterWorkMinutes: &afterWork,
		Duration:         30,
		IsPaid:           false,
	}

	tariffBreak, err := svc.CreateBreak(ctx, breakInput)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, tariffBreak.ID)
	assert.Equal(t, model.BreakTypeMinimum, tariffBreak.BreakType)
	assert.Equal(t, 30, tariffBreak.Duration)
	assert.Equal(t, 360, *tariffBreak.AfterWorkMinutes)
	assert.Equal(t, 0, tariffBreak.SortOrder)
}

func TestTariffService_CreateBreak_TariffNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	breakInput := service.CreateTariffBreakInput{
		TariffID:  uuid.New(),
		BreakType: "minimum",
		Duration:  30,
	}

	_, err := svc.CreateBreak(ctx, breakInput)
	assert.ErrorIs(t, err, service.ErrTariffNotFound)
}

func TestTariffService_CreateBreak_InvalidBreakType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "BREAK-TYPE", Name: "Break Type Test"})
	require.NoError(t, err)

	breakInput := service.CreateTariffBreakInput{
		TariffID:  tariff.ID,
		BreakType: "invalid",
		Duration:  30,
	}

	_, err = svc.CreateBreak(ctx, breakInput)
	assert.ErrorIs(t, err, service.ErrInvalidBreakType)
}

func TestTariffService_CreateBreak_ZeroDuration(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "BREAK-DUR", Name: "Break Duration Test"})
	require.NoError(t, err)

	breakInput := service.CreateTariffBreakInput{
		TariffID:  tariff.ID,
		BreakType: "fixed",
		Duration:  0,
	}

	_, err = svc.CreateBreak(ctx, breakInput)
	assert.ErrorIs(t, err, service.ErrBreakDurationReq)
}

func TestTariffService_CreateBreak_SortOrderIncrement(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "BREAK-SORT", Name: "Break Sort Test"})
	require.NoError(t, err)

	// Create first break
	break1, err := svc.CreateBreak(ctx, service.CreateTariffBreakInput{TariffID: tariff.ID, BreakType: "minimum", Duration: 15})
	require.NoError(t, err)
	assert.Equal(t, 0, break1.SortOrder)

	// Create second break
	break2, err := svc.CreateBreak(ctx, service.CreateTariffBreakInput{TariffID: tariff.ID, BreakType: "minimum", Duration: 30})
	require.NoError(t, err)
	assert.Equal(t, 1, break2.SortOrder)
}

func TestTariffService_DeleteBreak_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "DEL-BREAK", Name: "Delete Break"})
	require.NoError(t, err)

	tariffBreak, err := svc.CreateBreak(ctx, service.CreateTariffBreakInput{TariffID: tariff.ID, BreakType: "fixed", Duration: 15})
	require.NoError(t, err)

	err = svc.DeleteBreak(ctx, tariff.ID, tariffBreak.ID)
	require.NoError(t, err)

	_, err = svc.GetBreakByID(ctx, tariffBreak.ID)
	assert.ErrorIs(t, err, service.ErrTariffBreakNotFound)
}

func TestTariffService_DeleteBreak_TariffNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	err := svc.DeleteBreak(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, service.ErrTariffNotFound)
}

func TestTariffService_DeleteBreak_BreakNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "DEL-BREAK-NF", Name: "Delete Break NF"})
	require.NoError(t, err)

	err = svc.DeleteBreak(ctx, tariff.ID, uuid.New())
	assert.ErrorIs(t, err, service.ErrTariffBreakNotFound)
}

func TestTariffService_DeleteBreak_WrongTariff(t *testing.T) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	ctx := context.Background()

	tenant := createTestTenantForTariffService(t, db)

	// Create two tariffs
	tariff1, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "TARIFF-1", Name: "Tariff 1"})
	require.NoError(t, err)
	tariff2, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "TARIFF-2", Name: "Tariff 2"})
	require.NoError(t, err)

	// Create break for tariff1
	tariffBreak, err := svc.CreateBreak(ctx, service.CreateTariffBreakInput{TariffID: tariff1.ID, BreakType: "fixed", Duration: 15})
	require.NoError(t, err)

	// Try to delete break using tariff2's ID
	err = svc.DeleteBreak(ctx, tariff2.ID, tariffBreak.ID)
	assert.ErrorIs(t, err, service.ErrTariffBreakNotFound)
}
