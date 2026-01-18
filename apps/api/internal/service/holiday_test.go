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
		IsHalfDay:    false,
		AppliesToAll: true,
	}

	holiday, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "New Year's Day", holiday.Name)
	assert.Equal(t, tenant.ID, holiday.TenantID)
	assert.False(t, holiday.IsHalfDay)
	assert.True(t, holiday.AppliesToAll)
}

func TestHolidayService_Create_HalfDay(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	svc := service.NewHolidayService(repo)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 12, 24, 0, 0, 0, 0, time.UTC),
		Name:         "Christmas Eve",
		IsHalfDay:    true,
		AppliesToAll: true,
	}

	holiday, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.True(t, holiday.IsHalfDay)
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
		IsHalfDay:    false,
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
		AppliesToAll: true,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrHolidayDateRequired)
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
		AppliesToAll: true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  date,
		Name:         "Second Holiday",
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
		IsHalfDay:    false,
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	isHalfDay := true
	updateInput := service.UpdateHolidayInput{
		Name:      &newName,
		IsHalfDay: &isHalfDay,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.True(t, updated.IsHalfDay)
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
		AppliesToAll: true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	holidays, err := svc.ListByYear(ctx, tenant.ID, 2024)
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
			AppliesToAll: true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	// Query Q1 only
	from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 3, 31, 0, 0, 0, 0, time.UTC)
	holidays, err := svc.ListByDateRange(ctx, tenant.ID, from, to)
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
