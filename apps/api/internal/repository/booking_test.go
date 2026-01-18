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

// createTestTenantForBooking creates a tenant for use in booking tests.
func createTestTenantForBooking(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

// createTestEmployee creates an employee for booking tests.
func createTestEmployee(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
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

// createTestBookingType creates a booking type for tests.
func createTestBookingType(t *testing.T, db *repository.DB, tenantID *uuid.UUID, direction model.BookingDirection) *model.BookingType {
	t.Helper()
	repo := repository.NewBookingTypeRepository(db)
	bt := &model.BookingType{
		TenantID:  tenantID,
		Code:      "T" + uuid.New().String()[:6],
		Name:      "Test Type",
		Direction: direction,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(context.Background(), bt))
	return bt
}

func TestBookingRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480, // 08:00
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}

	err := repo.Create(ctx, booking)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, booking.ID)
}

func TestBookingRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	found, err := repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Equal(t, booking.ID, found.ID)
	assert.Equal(t, 480, found.OriginalTime)
}

func TestBookingRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_GetWithDetails(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	found, err := repo.GetWithDetails(ctx, booking.ID)
	require.NoError(t, err)
	assert.NotNil(t, found.Employee)
	assert.NotNil(t, found.BookingType)
	assert.Equal(t, emp.ID, found.Employee.ID)
	assert.Equal(t, bt.ID, found.BookingType.ID)
}

func TestBookingRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	booking.EditedTime = 490 // Edit to 08:10
	booking.Notes = "Updated"
	err := repo.Update(ctx, booking)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Equal(t, 490, found.EditedTime)
	assert.Equal(t, "Updated", found.Notes)
}

func TestBookingRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	err := repo.Delete(ctx, booking.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, booking.ID)
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	for i := range 3 {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   today,
			BookingTypeID: bt.ID,
			OriginalTime:  480 + i*60,
			EditedTime:    480 + i*60,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	filter := repository.BookingFilter{
		TenantID: tenant.ID,
		Limit:    10,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Len(t, bookings, 3)
}

func TestBookingRepository_List_FilterByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp1 := createTestEmployee(t, db, tenant.ID)
	emp2 := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	for _, empID := range []uuid.UUID{emp1.ID, emp1.ID, emp2.ID} {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    empID,
			BookingDate:   today,
			BookingTypeID: bt.ID,
			OriginalTime:  480,
			EditedTime:    480,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	filter := repository.BookingFilter{
		TenantID:   tenant.ID,
		EmployeeID: &emp1.ID,
		Limit:      10,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, bookings, 2)
}

func TestBookingRepository_List_FilterByDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	yesterday := today.AddDate(0, 0, -1)
	tomorrow := today.AddDate(0, 0, 1)

	for _, date := range []time.Time{yesterday, today, tomorrow} {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   date,
			BookingTypeID: bt.ID,
			OriginalTime:  480,
			EditedTime:    480,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	filter := repository.BookingFilter{
		TenantID:  tenant.ID,
		StartDate: &yesterday,
		EndDate:   &today,
		Limit:     10,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, bookings, 2)
}

func TestBookingRepository_List_FilterByPairStatus(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	btIn := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)
	btOut := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionOut)

	today := time.Now().Truncate(24 * time.Hour)

	// Create unpaired booking
	unpairedBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, unpairedBooking))

	// Create paired bookings
	pairedIn := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  540,
		EditedTime:    540,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, pairedIn))

	pairedOut := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btOut.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, pairedOut))

	require.NoError(t, repo.SetPair(ctx, pairedIn.ID, pairedOut.ID))

	// Filter unpaired only
	hasPair := false
	filter := repository.BookingFilter{
		TenantID: tenant.ID,
		HasPair:  &hasPair,
		Limit:    10,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Len(t, bookings, 1)

	// Filter paired only
	hasPair = true
	filter.HasPair = &hasPair
	bookings, total, err = repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, bookings, 2)
}

func TestBookingRepository_List_WithPagination(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	for i := range 5 {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   today,
			BookingTypeID: bt.ID,
			OriginalTime:  480 + i*60,
			EditedTime:    480 + i*60,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	filter := repository.BookingFilter{
		TenantID: tenant.ID,
		Limit:    2,
		Offset:   0,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, bookings, 2)

	// Second page
	filter.Offset = 2
	bookings, total, err = repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, bookings, 2)
}

func TestBookingRepository_GetByEmployeeAndDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	yesterday := today.AddDate(0, 0, -1)

	// Create bookings for today
	for i := range 2 {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   today,
			BookingTypeID: bt.ID,
			OriginalTime:  480 + i*60,
			EditedTime:    480 + i*60,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	// Create booking for yesterday
	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   yesterday,
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	bookings, err := repo.GetByEmployeeAndDate(ctx, tenant.ID, emp.ID, today)
	require.NoError(t, err)
	assert.Len(t, bookings, 2)
	// Verify ordering by time
	assert.True(t, bookings[0].EditedTime < bookings[1].EditedTime)
}

func TestBookingRepository_GetByDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	for i := range 5 {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   today.AddDate(0, 0, i-2), // -2 to +2 days
			BookingTypeID: bt.ID,
			OriginalTime:  480,
			EditedTime:    480,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	startDate := today.AddDate(0, 0, -1)
	endDate := today.AddDate(0, 0, 1)
	bookings, err := repo.GetByDateRange(ctx, tenant.ID, startDate, endDate)
	require.NoError(t, err)
	assert.Len(t, bookings, 3)
}

func TestBookingRepository_GetUnpaired(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	btIn := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)
	btOut := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionOut)

	today := time.Now().Truncate(24 * time.Hour)

	// Create unpaired in booking
	unpairedIn := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, unpairedIn))

	// Create paired bookings
	pairedIn := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  540,
		EditedTime:    540,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, pairedIn))

	pairedOut := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btOut.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, pairedOut))

	require.NoError(t, repo.SetPair(ctx, pairedIn.ID, pairedOut.ID))

	// Get unpaired "in" bookings
	bookings, err := repo.GetUnpaired(ctx, tenant.ID, emp.ID, today, model.BookingDirectionIn)
	require.NoError(t, err)
	assert.Len(t, bookings, 1)
	assert.Equal(t, unpairedIn.ID, bookings[0].ID)

	// Get unpaired "out" bookings - should be empty
	bookings, err = repo.GetUnpaired(ctx, tenant.ID, emp.ID, today, model.BookingDirectionOut)
	require.NoError(t, err)
	assert.Empty(t, bookings)
}

func TestBookingRepository_SetPair(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	btIn := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)
	btOut := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionOut)

	today := time.Now().Truncate(24 * time.Hour)

	comeBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, comeBooking))

	goBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btOut.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, goBooking))

	err := repo.SetPair(ctx, comeBooking.ID, goBooking.ID)
	require.NoError(t, err)

	// Verify both have same pair_id
	come, err := repo.GetByID(ctx, comeBooking.ID)
	require.NoError(t, err)
	go_, err := repo.GetByID(ctx, goBooking.ID)
	require.NoError(t, err)

	assert.NotNil(t, come.PairID)
	assert.NotNil(t, go_.PairID)
	assert.Equal(t, *come.PairID, *go_.PairID)
}

func TestBookingRepository_SetPair_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	err := repo.SetPair(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_ClearPair(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	btIn := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)
	btOut := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionOut)

	today := time.Now().Truncate(24 * time.Hour)

	comeBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, comeBooking))

	goBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btOut.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, goBooking))

	require.NoError(t, repo.SetPair(ctx, comeBooking.ID, goBooking.ID))

	// Get pair ID
	come, err := repo.GetByID(ctx, comeBooking.ID)
	require.NoError(t, err)
	pairID := *come.PairID

	// Clear pair
	err = repo.ClearPair(ctx, pairID)
	require.NoError(t, err)

	// Verify both are now unpaired
	come, err = repo.GetByID(ctx, comeBooking.ID)
	require.NoError(t, err)
	go_, err := repo.GetByID(ctx, goBooking.ID)
	require.NoError(t, err)

	assert.Nil(t, come.PairID)
	assert.Nil(t, go_.PairID)
}

func TestBookingRepository_UpdateCalculatedTimes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)

	booking1 := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking1))

	booking2 := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: bt.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking2))

	updates := map[uuid.UUID]int{
		booking1.ID: 485,  // Rounded to 08:05
		booking2.ID: 1015, // Rounded to 16:55
	}

	err := repo.UpdateCalculatedTimes(ctx, updates)
	require.NoError(t, err)

	// Verify updates
	b1, err := repo.GetByID(ctx, booking1.ID)
	require.NoError(t, err)
	assert.NotNil(t, b1.CalculatedTime)
	assert.Equal(t, 485, *b1.CalculatedTime)

	b2, err := repo.GetByID(ctx, booking2.ID)
	require.NoError(t, err)
	assert.NotNil(t, b2.CalculatedTime)
	assert.Equal(t, 1015, *b2.CalculatedTime)
}

func TestBookingRepository_UpdateCalculatedTimes_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	// Should not error with empty map
	err := repo.UpdateCalculatedTimes(ctx, map[uuid.UUID]int{})
	require.NoError(t, err)
}

func TestBookingRepository_UpdateCalculatedTimes_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	updates := map[uuid.UUID]int{
		uuid.New(): 480,
	}

	err := repo.UpdateCalculatedTimes(ctx, updates)
	assert.ErrorContains(t, err, "not found")
}

func TestBookingRepository_ClearCalculatedTime(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	// Set calculated time
	updates := map[uuid.UUID]int{booking.ID: 485}
	require.NoError(t, repo.UpdateCalculatedTimes(ctx, updates))

	// Verify it's set
	b, err := repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.NotNil(t, b.CalculatedTime)

	// Clear it
	err = repo.ClearCalculatedTime(ctx, booking.ID)
	require.NoError(t, err)

	// Verify it's cleared
	b, err = repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Nil(t, b.CalculatedTime)
}

func TestBookingRepository_ClearCalculatedTime_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	err := repo.ClearCalculatedTime(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_EffectiveTime(t *testing.T) {
	// Test the model's EffectiveTime method through repository
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    485,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	// Without calculated time, should return edited time
	b, err := repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Equal(t, 485, b.EffectiveTime())

	// Set calculated time
	updates := map[uuid.UUID]int{booking.ID: 490}
	require.NoError(t, repo.UpdateCalculatedTimes(ctx, updates))

	// With calculated time, should return calculated time
	b, err = repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Equal(t, 490, b.EffectiveTime())
}
