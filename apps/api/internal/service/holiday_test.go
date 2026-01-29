package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenant(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestHolidayService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "New Year's Day",
		Category:     1,
		AppliesToAll: true,
	}

	holiday, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "New Year's Day", holiday.Name)
	assert.Equal(t, tenant.ID, holiday.TenantID)
	assert.Equal(t, 1, holiday.Category)
	assert.True(t, holiday.AppliesToAll)
}

func TestHolidayService_Create_Category2(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 12, 24, 0, 0, 0, 0, time.UTC),
		Name:         "Christmas Eve",
		Category:     2,
		AppliesToAll: true,
	}

	holiday, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, 2, holiday.Category)
}

func TestHolidayService_Create_WithDepartment(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	deptID := uuid.New()

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 7, 4, 0, 0, 0, 0, time.UTC),
		Name:         "Department Holiday",
		Category:     1,
		AppliesToAll: false,
		DepartmentID: &deptID,
	}

	holiday, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.False(t, holiday.AppliesToAll)
	assert.NotNil(t, holiday.DepartmentID)
	assert.Equal(t, deptID, *holiday.DepartmentID)
}

func TestHolidayService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "",
		Category:     1,
		AppliesToAll: true,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrHolidayNameRequired)
}

func TestHolidayService_Create_ZeroDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Time{},
		Name:         "Test Holiday",
		Category:     1,
		AppliesToAll: true,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrHolidayDateRequired)
}

func TestHolidayService_Create_InvalidCategory(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC),
		Name:         "Invalid Category",
		Category:     4,
		AppliesToAll: true,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrHolidayCategoryInvalid)
}

func TestHolidayService_Create_DuplicateDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	date := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  date,
		Name:         "First Holiday",
		Category:     1,
		AppliesToAll: true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  date,
		Name:         "Second Holiday",
		Category:     1,
		AppliesToAll: true,
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrHolidayAlreadyExists)
}

func TestHolidayService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Test Holiday",
		Category:     1,
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Test Holiday", found.Name)
}

func TestHolidayService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrHolidayNotFound)
}

func TestHolidayService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Original Name",
		Category:     1,
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	category := 2
	updateInput := service.UpdateHolidayInput{
		Name:     &newName,
		Category: &category,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, 2, updated.Category)
}

func TestHolidayService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateHolidayInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrHolidayNotFound)
}

func TestHolidayService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Original Name",
		Category:     1,
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateHolidayInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrHolidayNameRequired)
}

func TestHolidayService_Update_InvalidCategory(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Original Name",
		Category:     1,
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	badCategory := 0
	updateInput := service.UpdateHolidayInput{
		Category: &badCategory,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrHolidayCategoryInvalid)
}

func TestHolidayService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "To Delete",
		Category:     1,
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrHolidayNotFound)
}

func TestHolidayService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrHolidayNotFound)
}

func TestHolidayService_ListByYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	// Create holidays in 2024
	dates := []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 7, 4, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC),
	}
	for i, date := range dates {
		input := service.CreateHolidayInput{
			TenantID:     tenant.ID,
			HolidayDate:  date,
			Name:         "Holiday " + string(rune('A'+i)),
			Category:     1,
			AppliesToAll: true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	// Create a holiday in different year
	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "New Year 2025",
		Category:     1,
		AppliesToAll: true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	holidays, err := svc.ListByYear(ctx, tenant.ID, 2024, nil)
	require.NoError(t, err)
	assert.Len(t, holidays, 3)
}

func TestHolidayService_ListByDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	// Create holidays
	dates := []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 7, 4, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC),
	}
	for i, date := range dates {
		input := service.CreateHolidayInput{
			TenantID:     tenant.ID,
			HolidayDate:  date,
			Name:         "Holiday " + string(rune('A'+i)),
			Category:     1,
			AppliesToAll: true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	// Query Q1 only
	from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 3, 31, 0, 0, 0, 0, time.UTC)
	holidays, err := svc.ListByDateRange(ctx, tenant.ID, from, to, nil)
	require.NoError(t, err)
	assert.Len(t, holidays, 2)
}

func TestHolidayService_GetByDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	date := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  date,
		Name:         "New Year's Day",
		Category:     1,
		AppliesToAll: true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	holiday, err := svc.GetByDate(ctx, tenant.ID, date)
	require.NoError(t, err)
	assert.NotNil(t, holiday)
	assert.Equal(t, "New Year's Day", holiday.Name)
}

func TestHolidayService_GetByDate_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	date := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	holiday, err := svc.GetByDate(ctx, tenant.ID, date)
	require.NoError(t, err)
	assert.Nil(t, holiday)
}

func TestHolidayService_GenerateForYearState(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	holidays, err := svc.GenerateForYearState(ctx, service.GenerateHolidayInput{
		TenantID:     tenant.ID,
		Year:         2026,
		State:        "BY",
		SkipExisting: true,
	})
	require.NoError(t, err)
	assert.NotEmpty(t, holidays)

	found := false
	for _, holiday := range holidays {
		if holiday.Name == "Neujahr" && holiday.HolidayDate.Equal(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)) {
			found = true
			assert.Equal(t, 1, holiday.Category)
			assert.True(t, holiday.AppliesToAll)
			break
		}
	}
	assert.True(t, found)
}

func TestHolidayService_CopyFromYear_WithOverride(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	_, err := svc.Create(ctx, service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2025, 12, 24, 0, 0, 0, 0, time.UTC),
		Name:         "Christmas Eve",
		Category:     1,
		AppliesToAll: true,
	})
	require.NoError(t, err)

	copied, err := svc.CopyFromYear(ctx, service.CopyHolidayInput{
		TenantID:   tenant.ID,
		SourceYear: 2025,
		TargetYear: 2026,
		CategoryOverrides: []service.HolidayCategoryOverride{
			{Month: 12, Day: 24, Category: 2},
		},
		SkipExisting: true,
	})
	require.NoError(t, err)
	require.Len(t, copied, 1)
	assert.Equal(t, 2, copied[0].Category)
	assert.Equal(t, "Christmas Eve", copied[0].Name)
	assert.True(t, copied[0].HolidayDate.Equal(time.Date(2026, 12, 24, 0, 0, 0, 0, time.UTC)))
}

type mockRecalcServiceForHoliday struct {
	mock.Mock
}

func (m *mockRecalcServiceForHoliday) TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*service.RecalcResult, error) {
	args := m.Called(ctx, tenantID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*service.RecalcResult), args.Error(1)
}

type mockMonthlyCalcServiceForHoliday struct {
	mock.Mock
}

func (m *mockMonthlyCalcServiceForHoliday) RecalculateFromMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, startYear, startMonth int) *service.MonthlyCalcResult {
	args := m.Called(ctx, employeeIDs, startYear, startMonth)
	if args.Get(0) == nil {
		return nil
	}
	return args.Get(0).(*service.MonthlyCalcResult)
}

type mockEmployeeRepositoryForHoliday struct {
	mock.Mock
}

func (m *mockEmployeeRepositoryForHoliday) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
	args := m.Called(ctx, filter)
	if args.Get(0) == nil {
		return nil, 0, args.Error(2)
	}
	return args.Get(0).([]model.Employee), args.Get(1).(int64), args.Error(2)
}

func TestHolidayService_Create_TriggersRecalcForPast(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	recalcSvc := new(mockRecalcServiceForHoliday)
	monthlyCalc := new(mockMonthlyCalcServiceForHoliday)
	employeeRepo := new(mockEmployeeRepositoryForHoliday)
	svc.SetRecalcServices(recalcSvc, monthlyCalc, employeeRepo)

	pastDate := time.Now().UTC().AddDate(0, 0, -2)
	expectedDate := time.Date(pastDate.Year(), pastDate.Month(), pastDate.Day(), 0, 0, 0, 0, time.UTC)

	employeeID := uuid.New()
	isActive := true
	employeeRepo.On("List", ctx, mock.MatchedBy(func(filter repository.EmployeeFilter) bool {
		return filter.TenantID == tenant.ID && filter.IsActive != nil && *filter.IsActive == isActive
	})).Return([]model.Employee{{ID: employeeID}}, int64(1), nil)

	recalcSvc.On("TriggerRecalcAll", ctx, tenant.ID, expectedDate, expectedDate).
		Return(&service.RecalcResult{}, nil)
	monthlyCalc.On("RecalculateFromMonthBatch", ctx, []uuid.UUID{employeeID}, expectedDate.Year(), int(expectedDate.Month())).
		Return(&service.MonthlyCalcResult{})

	_, err := svc.Create(ctx, service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  expectedDate,
		Name:         "Past Holiday",
		Category:     1,
		AppliesToAll: true,
	})
	require.NoError(t, err)

	recalcSvc.AssertExpectations(t)
	monthlyCalc.AssertExpectations(t)
	employeeRepo.AssertExpectations(t)
}

func TestHolidayService_Create_NoRecalcForFuture(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	recalcSvc := new(mockRecalcServiceForHoliday)
	monthlyCalc := new(mockMonthlyCalcServiceForHoliday)
	employeeRepo := new(mockEmployeeRepositoryForHoliday)
	svc.SetRecalcServices(recalcSvc, monthlyCalc, employeeRepo)

	futureDate := time.Now().UTC().AddDate(0, 0, 2)

	_, err := svc.Create(ctx, service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  futureDate,
		Name:         "Future Holiday",
		Category:     1,
		AppliesToAll: true,
	})
	require.NoError(t, err)

	recalcSvc.AssertNotCalled(t, "TriggerRecalcAll", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	monthlyCalc.AssertNotCalled(t, "RecalculateFromMonthBatch", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	employeeRepo.AssertNotCalled(t, "List", mock.Anything, mock.Anything)
}
