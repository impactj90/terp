package service_test

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
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

type orderBookingTestFixture struct {
	db       *repository.DB
	svc      *service.OrderBookingService
	tenant   *model.Tenant
	employee *model.Employee
	order    *model.Order
	activity *model.Activity
}

func setupOrderBookingTest(t *testing.T) *orderBookingTestFixture {
	t.Helper()
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	// Create tenant
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(ctx, tenant))

	// Create employee
	employeeRepo := repository.NewEmployeeRepository(db)
	employee := &model.Employee{
		TenantID:            tenant.ID,
		PersonnelNumber:     "EMP001",
		PIN:                 "1234",
		FirstName:           "Jane",
		LastName:            "Smith",
		EntryDate:           time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:         decimal.NewFromFloat(40.0),
		VacationDaysPerYear: decimal.NewFromFloat(30.0),
		IsActive:            true,
	}
	require.NoError(t, employeeRepo.Create(ctx, employee))

	// Create order
	orderRepo := repository.NewOrderRepository(db)
	order := &model.Order{
		TenantID: tenant.ID,
		Code:     "ORD-BOOK",
		Name:     "Booking Order",
		Status:   model.OrderStatusActive,
		IsActive: true,
	}
	require.NoError(t, orderRepo.Create(ctx, order))

	// Create activity
	activityRepo := repository.NewActivityRepository(db)
	activity := &model.Activity{
		TenantID: tenant.ID,
		Code:     "DEV",
		Name:     "Development",
		IsActive: true,
	}
	require.NoError(t, activityRepo.Create(ctx, activity))

	// Create service
	bookingRepo := repository.NewOrderBookingRepository(db)
	svc := service.NewOrderBookingService(bookingRepo)

	return &orderBookingTestFixture{
		db:       db,
		svc:      svc,
		tenant:   tenant,
		employee: employee,
		order:    order,
		activity: activity,
	}
}

func TestOrderBookingService_Create_Success(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	actID := f.activity.ID
	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		EmployeeID:  f.employee.ID,
		OrderID:     f.order.ID,
		ActivityID:  &actID,
		BookingDate: "2025-06-15",
		TimeMinutes: 480,
		Description: "Full day development",
	}

	ob, err := f.svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, f.order.ID, ob.OrderID)
	assert.Equal(t, f.employee.ID, ob.EmployeeID)
	assert.Equal(t, 480, ob.TimeMinutes)
	assert.Equal(t, "Full day development", ob.Description)
	assert.Equal(t, model.OrderBookingSourceManual, ob.Source)
}

func TestOrderBookingService_Create_MissingOrder(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		EmployeeID:  f.employee.ID,
		BookingDate: "2025-06-15",
		TimeMinutes: 480,
	}

	_, err := f.svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrOrderBookingOrderRequired)
}

func TestOrderBookingService_Create_MissingEmployee(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		OrderID:     f.order.ID,
		BookingDate: "2025-06-15",
		TimeMinutes: 480,
	}

	_, err := f.svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrOrderBookingEmployeeRequired)
}

func TestOrderBookingService_Create_MissingDate(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		EmployeeID:  f.employee.ID,
		OrderID:     f.order.ID,
		TimeMinutes: 480,
	}

	_, err := f.svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrOrderBookingDateRequired)
}

func TestOrderBookingService_Create_ZeroTime(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		EmployeeID:  f.employee.ID,
		OrderID:     f.order.ID,
		BookingDate: "2025-06-15",
		TimeMinutes: 0,
	}

	_, err := f.svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrOrderBookingTimeRequired)
}

func TestOrderBookingService_Create_NegativeTime(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		EmployeeID:  f.employee.ID,
		OrderID:     f.order.ID,
		BookingDate: "2025-06-15",
		TimeMinutes: -60,
	}

	_, err := f.svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrOrderBookingTimeRequired)
}

func TestOrderBookingService_GetByID_Success(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		EmployeeID:  f.employee.ID,
		OrderID:     f.order.ID,
		BookingDate: "2025-06-15",
		TimeMinutes: 480,
	}
	created, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := f.svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestOrderBookingService_GetByID_NotFound(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	_, err := f.svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrOrderBookingNotFound)
}

func TestOrderBookingService_Update_Success(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		EmployeeID:  f.employee.ID,
		OrderID:     f.order.ID,
		BookingDate: "2025-06-15",
		TimeMinutes: 480,
	}
	created, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	newTime := 240
	newDesc := "Half day"
	updateInput := service.UpdateOrderBookingInput{
		TimeMinutes: &newTime,
		Description: &newDesc,
	}

	updated, err := f.svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, 240, updated.TimeMinutes)
	assert.Equal(t, "Half day", updated.Description)
}

func TestOrderBookingService_Update_NotFound(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	newTime := 240
	_, err := f.svc.Update(ctx, uuid.New(), service.UpdateOrderBookingInput{TimeMinutes: &newTime})
	assert.ErrorIs(t, err, service.ErrOrderBookingNotFound)
}

func TestOrderBookingService_Delete_Success(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	input := service.CreateOrderBookingInput{
		TenantID:    f.tenant.ID,
		EmployeeID:  f.employee.ID,
		OrderID:     f.order.ID,
		BookingDate: "2025-06-15",
		TimeMinutes: 480,
	}
	created, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	err = f.svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = f.svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrOrderBookingNotFound)
}

func TestOrderBookingService_Delete_NotFound(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	err := f.svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrOrderBookingNotFound)
}

func TestOrderBookingService_List_WithFilters(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	// Create two bookings
	for i := 0; i < 2; i++ {
		input := service.CreateOrderBookingInput{
			TenantID:    f.tenant.ID,
			EmployeeID:  f.employee.ID,
			OrderID:     f.order.ID,
			BookingDate: time.Date(2025, 6, 15+i, 0, 0, 0, 0, time.UTC).Format("2006-01-02"),
			TimeMinutes: 480,
		}
		_, err := f.svc.Create(ctx, input)
		require.NoError(t, err)
	}

	// List all for this tenant
	bookings, err := f.svc.List(ctx, f.tenant.ID, service.OrderBookingListOptions{})
	require.NoError(t, err)
	assert.Len(t, bookings, 2)

	// Filter by employee
	empID := f.employee.ID
	bookings, err = f.svc.List(ctx, f.tenant.ID, service.OrderBookingListOptions{EmployeeID: &empID})
	require.NoError(t, err)
	assert.Len(t, bookings, 2)

	// Filter by order
	orderID := f.order.ID
	bookings, err = f.svc.List(ctx, f.tenant.ID, service.OrderBookingListOptions{OrderID: &orderID})
	require.NoError(t, err)
	assert.Len(t, bookings, 2)
}

func TestOrderBookingService_CreateAutoBooking(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	actID := f.activity.ID
	date := time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC)

	ob, err := f.svc.CreateAutoBooking(ctx, f.tenant.ID, f.employee.ID, f.order.ID, &actID, date, 480)
	require.NoError(t, err)
	assert.Equal(t, model.OrderBookingSourceAuto, ob.Source)
	assert.Equal(t, 480, ob.TimeMinutes)
	assert.Equal(t, "Auto-generated from target_with_order", ob.Description)
}

func TestOrderBookingService_DeleteAutoBookingsByDate(t *testing.T) {
	f := setupOrderBookingTest(t)
	ctx := context.Background()

	date := time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC)

	// Create an auto-booking
	_, err := f.svc.CreateAutoBooking(ctx, f.tenant.ID, f.employee.ID, f.order.ID, nil, date, 480)
	require.NoError(t, err)

	// Delete auto bookings for that date
	err = f.svc.DeleteAutoBookingsByDate(ctx, f.employee.ID, date)
	require.NoError(t, err)

	// Should have no bookings left (auto bookings were deleted)
	empID := f.employee.ID
	bookings, err := f.svc.List(ctx, f.tenant.ID, service.OrderBookingListOptions{EmployeeID: &empID})
	require.NoError(t, err)
	assert.Empty(t, bookings)
}
