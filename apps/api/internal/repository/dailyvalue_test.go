package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForDV creates a tenant for use in daily value tests.
func createTestTenantForDV(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

// createTestEmployeeForDV creates an employee for daily value tests.
func createTestEmployeeForDV(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
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

func TestDailyValueRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		GrossTime:  480,
		NetTime:    450,
		TargetTime: 480,
		Overtime:   0,
		Undertime:  30,
		BreakTime:  30,
	}

	err := repo.Create(ctx, dv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, dv.ID)
}

func TestDailyValueRepository_Create_WithErrors(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		HasError:   true,
		ErrorCodes: pq.StringArray{"MISSING_COME", "MISSING_GO"},
		Warnings:   pq.StringArray{"LATE_ARRIVAL"},
	}

	err := repo.Create(ctx, dv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, dv.ID)

	// Verify arrays are stored correctly
	found, err := repo.GetByID(ctx, dv.ID)
	require.NoError(t, err)
	assert.True(t, found.HasError)
	assert.Len(t, found.ErrorCodes, 2)
	assert.Contains(t, found.ErrorCodes, "MISSING_COME")
	assert.Contains(t, found.ErrorCodes, "MISSING_GO")
	assert.Len(t, found.Warnings, 1)
	assert.Contains(t, found.Warnings, "LATE_ARRIVAL")
}

func TestDailyValueRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		GrossTime:  480,
		NetTime:    450,
	}
	require.NoError(t, repo.Create(ctx, dv))

	found, err := repo.GetByID(ctx, dv.ID)
	require.NoError(t, err)
	assert.Equal(t, dv.ID, found.ID)
	assert.Equal(t, 480, found.GrossTime)
	assert.Equal(t, 450, found.NetTime)
}

func TestDailyValueRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDailyValueNotFound)
}

func TestDailyValueRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		GrossTime:  480,
		NetTime:    450,
	}
	require.NoError(t, repo.Create(ctx, dv))

	dv.GrossTime = 510
	dv.NetTime = 480
	dv.Overtime = 30
	err := repo.Update(ctx, dv)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, dv.ID)
	require.NoError(t, err)
	assert.Equal(t, 510, found.GrossTime)
	assert.Equal(t, 480, found.NetTime)
	assert.Equal(t, 30, found.Overtime)
}

func TestDailyValueRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  time.Now().Truncate(24 * time.Hour),
		GrossTime:  480,
	}
	require.NoError(t, repo.Create(ctx, dv))

	err := repo.Delete(ctx, dv.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, dv.ID)
	assert.ErrorIs(t, err, repository.ErrDailyValueNotFound)
}

func TestDailyValueRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDailyValueNotFound)
}

func TestDailyValueRepository_GetByEmployeeDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
	}
	require.NoError(t, repo.Create(ctx, dv))

	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, dv.ID, found.ID)
}

func TestDailyValueRepository_GetByEmployeeDate_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Should return nil, nil when not found
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestDailyValueRepository_GetByEmployeeDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create values for 5 days (-2 to +2)
	for i := -2; i <= 2; i++ {
		date := today.AddDate(0, 0, i)
		dv := &model.DailyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  date,
			GrossTime:  480 + i*10,
		}
		require.NoError(t, repo.Create(ctx, dv))
	}

	// Query for 3 days (-1 to +1)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)

	values, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, values, 3)

	// Verify ordering by date
	assert.True(t, values[0].ValueDate.Before(values[1].ValueDate))
	assert.True(t, values[1].ValueDate.Before(values[2].ValueDate))
}

func TestDailyValueRepository_GetByEmployeeDateRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)

	values, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Empty(t, values)
}

func TestDailyValueRepository_Upsert_Insert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)
	dv := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
		NetTime:    450,
	}

	err := repo.Upsert(ctx, dv)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, dv.ID)

	// Verify created
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, 480, found.GrossTime)
}

func TestDailyValueRepository_Upsert_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// First upsert (insert)
	dv1 := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
		NetTime:    450,
	}
	require.NoError(t, repo.Upsert(ctx, dv1))
	originalID := dv1.ID

	// Second upsert (update) with same employee+date
	dv2 := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  510,
		NetTime:    480,
		Overtime:   30,
	}
	require.NoError(t, repo.Upsert(ctx, dv2))

	// Verify the original record was updated (not a new one created)
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, originalID, found.ID)
	assert.Equal(t, 510, found.GrossTime)
	assert.Equal(t, 480, found.NetTime)
	assert.Equal(t, 30, found.Overtime)
}

func TestDailyValueRepository_BulkUpsert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create 10 daily values
	var values []model.DailyValue
	for i := range 10 {
		values = append(values, model.DailyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  today.AddDate(0, 0, i),
			GrossTime:  480 + i*10,
		})
	}

	err := repo.BulkUpsert(ctx, values)
	require.NoError(t, err)

	// Verify all created
	from := today
	to := today.AddDate(0, 0, 9)
	found, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, found, 10)
}

func TestDailyValueRepository_BulkUpsert_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	// Should not error with empty slice
	err := repo.BulkUpsert(ctx, []model.DailyValue{})
	require.NoError(t, err)
}

func TestDailyValueRepository_BulkUpsert_UpdateExisting(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create initial record
	initial := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
	}
	require.NoError(t, repo.Create(ctx, initial))

	// Bulk upsert with overlap - should update existing
	values := []model.DailyValue{
		{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  today, // Overlaps with existing
			GrossTime:  510,
			Overtime:   30,
		},
		{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  today.AddDate(0, 0, 1), // New
			GrossTime:  480,
		},
	}

	err := repo.BulkUpsert(ctx, values)
	require.NoError(t, err)

	// Verify existing was updated
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, today)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, 510, found.GrossTime)
	assert.Equal(t, 30, found.Overtime)

	// Verify new was created
	found2, err := repo.GetByEmployeeDate(ctx, emp.ID, today.AddDate(0, 0, 1))
	require.NoError(t, err)
	require.NotNil(t, found2)
}

func TestDailyValueRepository_GetWithErrors(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create values with and without errors
	noError := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
		HasError:   false,
	}
	require.NoError(t, repo.Create(ctx, noError))

	withError := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today.AddDate(0, 0, 1),
		HasError:   true,
		ErrorCodes: pq.StringArray{"MISSING_GO"},
	}
	require.NoError(t, repo.Create(ctx, withError))

	// Query only errors
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 2)
	values, err := repo.GetWithErrors(ctx, tenant.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, values, 1)
	assert.True(t, values[0].HasError)
	assert.NotNil(t, values[0].Employee) // Verify preload
}

func TestDailyValueRepository_GetWithErrors_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create value without error
	noError := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
		HasError:   false,
	}
	require.NoError(t, repo.Create(ctx, noError))

	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)
	values, err := repo.GetWithErrors(ctx, tenant.ID, from, to)
	require.NoError(t, err)
	assert.Empty(t, values)
}

func TestDailyValueRepository_SumForMonth(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	// Use a fixed date to ensure all days are in the same month
	baseDate := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)

	// Create 5 daily values in the same month
	for i := range 5 {
		dv := &model.DailyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  baseDate.AddDate(0, 0, i),
			GrossTime:  480,
			NetTime:    450,
			TargetTime: 480,
			Overtime:   0,
			Undertime:  30,
			BreakTime:  30,
			HasError:   i == 0 || i == 1, // 2 days with errors
		}
		require.NoError(t, repo.Create(ctx, dv))
	}

	sum, err := repo.SumForMonth(ctx, emp.ID, 2026, 1)
	require.NoError(t, err)
	require.NotNil(t, sum)

	assert.Equal(t, 2400, sum.TotalGrossTime)  // 480 * 5
	assert.Equal(t, 2250, sum.TotalNetTime)    // 450 * 5
	assert.Equal(t, 2400, sum.TotalTargetTime) // 480 * 5
	assert.Equal(t, 0, sum.TotalOvertime)
	assert.Equal(t, 150, sum.TotalUndertime) // 30 * 5
	assert.Equal(t, 150, sum.TotalBreakTime) // 30 * 5
	assert.Equal(t, 5, sum.TotalDays)
	assert.Equal(t, 2, sum.DaysWithErrors)
}

func TestDailyValueRepository_SumForMonth_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	sum, err := repo.SumForMonth(ctx, emp.ID, 2026, 1)
	require.NoError(t, err)
	require.NotNil(t, sum)

	// All values should be 0
	assert.Equal(t, 0, sum.TotalGrossTime)
	assert.Equal(t, 0, sum.TotalDays)
	assert.Equal(t, 0, sum.DaysWithErrors)
}

func TestDailyValueRepository_DeleteRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create values for 5 days (-2 to +2)
	for i := -2; i <= 2; i++ {
		date := today.AddDate(0, 0, i)
		dv := &model.DailyValue{
			TenantID:   tenant.ID,
			EmployeeID: emp.ID,
			ValueDate:  date,
			GrossTime:  480,
		}
		require.NoError(t, repo.Create(ctx, dv))
	}

	// Delete range (-1 to +1)
	from := today.AddDate(0, 0, -1)
	to := today.AddDate(0, 0, 1)
	err := repo.DeleteRange(ctx, emp.ID, from, to)
	require.NoError(t, err)

	// Verify only 2 remain (day -2 and day +2)
	allValues, err := repo.GetByEmployeeDateRange(ctx, emp.ID, today.AddDate(0, 0, -2), today.AddDate(0, 0, 2))
	require.NoError(t, err)
	assert.Len(t, allValues, 2)

	// Verify the correct ones remain
	for _, value := range allValues {
		dayDiff := int(value.ValueDate.Sub(today).Hours() / 24)
		assert.True(t, dayDiff == -2 || dayDiff == 2)
	}
}

func TestDailyValueRepository_DeleteRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Should not error when nothing to delete
	err := repo.DeleteRange(ctx, emp.ID, today, today.AddDate(0, 0, 7))
	require.NoError(t, err)
}

func TestDailyValueRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDailyValueRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDV(t, db)
	emp := createTestEmployeeForDV(t, db, tenant.ID)

	today := time.Now().Truncate(24 * time.Hour)

	// Create first record
	dv1 := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today,
		GrossTime:  480,
	}
	require.NoError(t, repo.Create(ctx, dv1))

	// Try to create duplicate - should fail due to unique constraint
	dv2 := &model.DailyValue{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		ValueDate:  today, // Same date
		GrossTime:  510,
	}
	err := repo.Create(ctx, dv2)
	assert.Error(t, err)
}

func TestDailyValue_Balance(t *testing.T) {
	dv := &model.DailyValue{
		Overtime:  60,
		Undertime: 0,
	}
	assert.Equal(t, 60, dv.Balance())

	dv.Overtime = 0
	dv.Undertime = 30
	assert.Equal(t, -30, dv.Balance())
}

func TestDailyValue_FormatMethods(t *testing.T) {
	dv := &model.DailyValue{
		GrossTime:  510, // 8:30
		NetTime:    480, // 8:00
		TargetTime: 480, // 8:00
		Overtime:   30,
		Undertime:  0,
	}

	assert.Equal(t, "08:30", dv.FormatGrossTime())
	assert.Equal(t, "08:00", dv.FormatNetTime())
	assert.Equal(t, "08:00", dv.FormatTargetTime())
	assert.Equal(t, "00:30", dv.FormatBalance())

	// Test negative balance
	dv.Overtime = 0
	dv.Undertime = 30
	assert.Equal(t, "-00:30", dv.FormatBalance())
}

func TestDailyValue_HasBookings(t *testing.T) {
	dv := &model.DailyValue{
		BookingCount: 0,
	}
	assert.False(t, dv.HasBookings())

	dv.BookingCount = 4
	assert.True(t, dv.HasBookings())
}
