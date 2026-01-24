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

// createTestTenantForMV creates a tenant for use in monthly value tests.
func createTestTenantForMV(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

// createTestEmployeeForMV creates an employee for monthly value tests.
func createTestEmployeeForMV(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
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

// createTestUserForMV creates a user for monthly value tests.
func createTestUserForMV(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.User {
	t.Helper()
	userRepo := repository.NewUserRepository(db)
	user := &model.User{
		TenantID:    &tenantID,
		Email:       "mv-test-" + uuid.New().String()[:8] + "@example.com",
		DisplayName: "Test User",
		IsActive:    true,
	}
	require.NoError(t, userRepo.Create(context.Background(), user))
	return user
}

func TestMonthlyValueRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:        tenant.ID,
		EmployeeID:      emp.ID,
		Year:            2026,
		Month:           1,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 9600,
		TotalOvertime:   0,
		TotalUndertime:  600,
		TotalBreakTime:  600,
		FlextimeStart:   120,
		FlextimeChange:  -600,
		FlextimeEnd:     -480,
		WorkDays:        20,
		DaysWithErrors:  1,
		VacationTaken:   decimal.NewFromFloat(2.5),
		SickDays:        1,
	}

	err := repo.Create(ctx, mv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, mv.ID)
}

func TestMonthlyValueRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 9600,
		TotalNetTime:   9000,
		FlextimeEnd:    -480,
		VacationTaken:  decimal.NewFromFloat(3.5),
	}
	require.NoError(t, repo.Create(ctx, mv))

	found, err := repo.GetByID(ctx, mv.ID)
	require.NoError(t, err)
	assert.Equal(t, mv.ID, found.ID)
	assert.Equal(t, 2026, found.Year)
	assert.Equal(t, 1, found.Month)
	assert.Equal(t, 9600, found.TotalGrossTime)
	assert.Equal(t, 9000, found.TotalNetTime)
	assert.Equal(t, -480, found.FlextimeEnd)
	assert.True(t, found.VacationTaken.Equal(decimal.NewFromFloat(3.5)))
}

func TestMonthlyValueRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 9600,
		TotalNetTime:   9000,
		FlextimeEnd:    0,
	}
	require.NoError(t, repo.Create(ctx, mv))

	mv.TotalGrossTime = 10000
	mv.TotalNetTime = 9500
	mv.FlextimeEnd = 500
	mv.DaysWithErrors = 2
	err := repo.Update(ctx, mv)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, mv.ID)
	require.NoError(t, err)
	assert.Equal(t, 10000, found.TotalGrossTime)
	assert.Equal(t, 9500, found.TotalNetTime)
	assert.Equal(t, 500, found.FlextimeEnd)
	assert.Equal(t, 2, found.DaysWithErrors)
}

func TestMonthlyValueRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
	}
	require.NoError(t, repo.Create(ctx, mv))

	err := repo.Delete(ctx, mv.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, mv.ID)
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_GetByEmployeeMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          3,
		TotalGrossTime: 9600,
		FlextimeEnd:    120,
	}
	require.NoError(t, repo.Create(ctx, mv))

	found, err := repo.GetByEmployeeMonth(ctx, emp.ID, 2026, 3)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, mv.ID, found.ID)
	assert.Equal(t, 9600, found.TotalGrossTime)
	assert.Equal(t, 120, found.FlextimeEnd)
}

func TestMonthlyValueRepository_GetByEmployeeMonth_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	found, err := repo.GetByEmployeeMonth(ctx, emp.ID, 2026, 6)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestMonthlyValueRepository_GetPreviousMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// Create March 2026 record
	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          3,
		TotalGrossTime: 9600,
		FlextimeEnd:    120,
	}
	require.NoError(t, repo.Create(ctx, mv))

	// GetPreviousMonth of April should return March
	found, err := repo.GetPreviousMonth(ctx, emp.ID, 2026, 4)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, 2026, found.Year)
	assert.Equal(t, 3, found.Month)
	assert.Equal(t, 9600, found.TotalGrossTime)
}

func TestMonthlyValueRepository_GetPreviousMonth_YearBoundary(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// Create Dec 2025 record
	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2025,
		Month:          12,
		TotalGrossTime: 8800,
		FlextimeEnd:    -60,
	}
	require.NoError(t, repo.Create(ctx, mv))

	// GetPreviousMonth of Jan 2026 should return Dec 2025
	found, err := repo.GetPreviousMonth(ctx, emp.ID, 2026, 1)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, 2025, found.Year)
	assert.Equal(t, 12, found.Month)
	assert.Equal(t, 8800, found.TotalGrossTime)
}

func TestMonthlyValueRepository_GetPreviousMonth_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// No previous month record exists
	found, err := repo.GetPreviousMonth(ctx, emp.ID, 2026, 1)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestMonthlyValueRepository_Upsert_Insert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 9600,
		TotalNetTime:   9000,
		FlextimeStart:  0,
		FlextimeChange: 600,
		FlextimeEnd:    600,
		WorkDays:       20,
		VacationTaken:  decimal.NewFromFloat(1.5),
	}

	err := repo.Upsert(ctx, mv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, mv.ID)

	found, err := repo.GetByEmployeeMonth(ctx, emp.ID, 2026, 1)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, 9600, found.TotalGrossTime)
	assert.Equal(t, 600, found.FlextimeEnd)
	assert.Equal(t, 20, found.WorkDays)
	assert.True(t, found.VacationTaken.Equal(decimal.NewFromFloat(1.5)))
}

func TestMonthlyValueRepository_Upsert_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// First upsert (insert)
	mv1 := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 9600,
		TotalNetTime:   9000,
		FlextimeEnd:    0,
		WorkDays:       20,
	}
	require.NoError(t, repo.Upsert(ctx, mv1))
	originalID := mv1.ID

	// Second upsert (update) with same employee+year+month
	mv2 := &model.MonthlyValue{
		TenantID:       tenant.ID,
		EmployeeID:     emp.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 10000,
		TotalNetTime:   9500,
		TotalOvertime:  500,
		FlextimeEnd:    500,
		WorkDays:       21,
		VacationTaken:  decimal.NewFromFloat(2.0),
	}
	require.NoError(t, repo.Upsert(ctx, mv2))

	// Verify the original record was updated (not a new one created)
	found, err := repo.GetByID(ctx, originalID)
	require.NoError(t, err)
	assert.Equal(t, 10000, found.TotalGrossTime)
	assert.Equal(t, 9500, found.TotalNetTime)
	assert.Equal(t, 500, found.TotalOvertime)
	assert.Equal(t, 500, found.FlextimeEnd)
	assert.Equal(t, 21, found.WorkDays)
	assert.True(t, found.VacationTaken.Equal(decimal.NewFromFloat(2.0)))
}

func TestMonthlyValueRepository_ListByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// Create out of order: 2026-03, 2025-12, 2026-01
	months := []struct {
		year  int
		month int
	}{
		{2026, 3},
		{2025, 12},
		{2026, 1},
	}
	for _, m := range months {
		mv := &model.MonthlyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			Year:       m.year,
			Month:      m.month,
		}
		require.NoError(t, repo.Create(ctx, mv))
	}

	values, err := repo.ListByEmployee(ctx, emp.ID)
	require.NoError(t, err)
	require.Len(t, values, 3)

	// Verify ordering: 2025-12, 2026-01, 2026-03
	assert.Equal(t, 2025, values[0].Year)
	assert.Equal(t, 12, values[0].Month)
	assert.Equal(t, 2026, values[1].Year)
	assert.Equal(t, 1, values[1].Month)
	assert.Equal(t, 2026, values[2].Year)
	assert.Equal(t, 3, values[2].Month)
}

func TestMonthlyValueRepository_ListByEmployee_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	values, err := repo.ListByEmployee(ctx, emp.ID)
	require.NoError(t, err)
	assert.Empty(t, values)
}

func TestMonthlyValueRepository_ListByEmployeeYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// Create months across two years
	for _, m := range []struct{ year, month int }{{2025, 11}, {2025, 12}, {2026, 1}, {2026, 2}} {
		mv := &model.MonthlyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			Year:       m.year,
			Month:      m.month,
		}
		require.NoError(t, repo.Create(ctx, mv))
	}

	values, err := repo.ListByEmployeeYear(ctx, emp.ID, 2026)
	require.NoError(t, err)
	require.Len(t, values, 2)
	assert.Equal(t, 1, values[0].Month)
	assert.Equal(t, 2, values[1].Month)
}

func TestMonthlyValueRepository_ListByEmployeeYear_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	values, err := repo.ListByEmployeeYear(ctx, emp.ID, 2030)
	require.NoError(t, err)
	assert.Empty(t, values)
}

func TestMonthlyValueRepository_IsMonthClosed_NotClosed(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
		IsClosed:   false,
	}
	require.NoError(t, repo.Create(ctx, mv))

	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	closed, err := repo.IsMonthClosed(ctx, tenant.ID, emp.ID, date)
	require.NoError(t, err)
	assert.False(t, closed)
}

func TestMonthlyValueRepository_IsMonthClosed_Closed(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
		IsClosed:   true,
	}
	require.NoError(t, repo.Create(ctx, mv))

	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	closed, err := repo.IsMonthClosed(ctx, tenant.ID, emp.ID, date)
	require.NoError(t, err)
	assert.True(t, closed)
}

func TestMonthlyValueRepository_IsMonthClosed_NoRecord(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	// No monthly value record exists -- should return false (not closed)
	date := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	closed, err := repo.IsMonthClosed(ctx, tenant.ID, emp.ID, date)
	require.NoError(t, err)
	assert.False(t, closed)
}

func TestMonthlyValueRepository_CloseMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)
	user := createTestUserForMV(t, db, tenant.ID)

	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
		IsClosed:   false,
	}
	require.NoError(t, repo.Create(ctx, mv))

	err := repo.CloseMonth(ctx, emp.ID, 2026, 1, user.ID)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, mv.ID)
	require.NoError(t, err)
	assert.True(t, found.IsClosed)
	assert.NotNil(t, found.ClosedAt)
	assert.NotNil(t, found.ClosedBy)
	assert.Equal(t, user.ID, *found.ClosedBy)
}

func TestMonthlyValueRepository_CloseMonth_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	err := repo.CloseMonth(ctx, uuid.New(), 2026, 1, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_ReopenMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)
	closer := createTestUserForMV(t, db, tenant.ID)
	reopener := createTestUserForMV(t, db, tenant.ID)

	now := time.Now()
	mv := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
		IsClosed:   true,
		ClosedAt:   &now,
		ClosedBy:   &closer.ID,
	}
	require.NoError(t, repo.Create(ctx, mv))

	err := repo.ReopenMonth(ctx, emp.ID, 2026, 1, reopener.ID)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, mv.ID)
	require.NoError(t, err)
	assert.False(t, found.IsClosed)
	assert.NotNil(t, found.ReopenedAt)
	assert.NotNil(t, found.ReopenedBy)
	assert.Equal(t, reopener.ID, *found.ReopenedBy)
}

func TestMonthlyValueRepository_ReopenMonth_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	err := repo.ReopenMonth(ctx, uuid.New(), 2026, 1, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMonthlyValueNotFound)
}

func TestMonthlyValueRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMonthlyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForMV(t, db)
	emp := createTestEmployeeForMV(t, db, tenant.ID)

	mv1 := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
	}
	require.NoError(t, repo.Create(ctx, mv1))

	// Try to create duplicate - should fail due to unique constraint
	mv2 := &model.MonthlyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		Year:       2026,
		Month:      1,
	}
	err := repo.Create(ctx, mv2)
	assert.Error(t, err)
}

func TestMonthlyValue_Balance(t *testing.T) {
	mv := &model.MonthlyValue{
		TotalOvertime:  120,
		TotalUndertime: 30,
	}
	assert.Equal(t, 90, mv.Balance())

	mv.TotalOvertime = 0
	mv.TotalUndertime = 60
	assert.Equal(t, -60, mv.Balance())
}

func TestMonthlyValue_FormatFlextimeEnd(t *testing.T) {
	mv := &model.MonthlyValue{FlextimeEnd: 150} // 2:30
	assert.Equal(t, "02:30", mv.FormatFlextimeEnd())

	mv.FlextimeEnd = -90 // -1:30
	assert.Equal(t, "-01:30", mv.FormatFlextimeEnd())

	mv.FlextimeEnd = 0
	assert.Equal(t, "00:00", mv.FormatFlextimeEnd())
}
