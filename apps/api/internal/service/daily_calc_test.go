package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

// mockBookingRepository implements bookingRepository for testing.
type mockBookingRepository struct {
	mock.Mock
}

func (m *mockBookingRepository) GetByEmployeeAndDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error) {
	args := m.Called(ctx, tenantID, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Booking), args.Error(1)
}

func (m *mockBookingRepository) GetByEmployeeAndDateRange(ctx context.Context, tenantID, employeeID uuid.UUID, startDate, endDate time.Time) ([]model.Booking, error) {
	args := m.Called(ctx, tenantID, employeeID, startDate, endDate)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Booking), args.Error(1)
}

func (m *mockBookingRepository) UpdateCalculatedTimes(ctx context.Context, updates map[uuid.UUID]int) error {
	args := m.Called(ctx, updates)
	return args.Error(0)
}

func (m *mockBookingRepository) Create(ctx context.Context, booking *model.Booking) error {
	args := m.Called(ctx, booking)
	return args.Error(0)
}

// mockEmployeeDayPlanRepository implements employeeDayPlanRepository for testing.
type mockEmployeeDayPlanRepository struct {
	mock.Mock
}

func (m *mockEmployeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error) {
	args := m.Called(ctx, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.EmployeeDayPlan), args.Error(1)
}

// mockDayPlanRepository implements dayPlanLookup for testing.
type mockDayPlanRepository struct {
	mock.Mock
}

func (m *mockDayPlanRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.DayPlan), args.Error(1)
}

func (m *mockDayPlanRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.DayPlan), args.Error(1)
}

// mockDailyValueRepository implements dailyValueRepository for testing.
type mockDailyValueRepository struct {
	mock.Mock
}

func (m *mockDailyValueRepository) Upsert(ctx context.Context, dv *model.DailyValue) error {
	args := m.Called(ctx, dv)
	return args.Error(0)
}

func (m *mockDailyValueRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
	args := m.Called(ctx, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.DailyValue), args.Error(1)
}

// mockHolidayLookup implements holidayLookup for testing.
type mockHolidayLookup struct {
	mock.Mock
}

func (m *mockHolidayLookup) GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error) {
	args := m.Called(ctx, tenantID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Holiday), args.Error(1)
}

// mockEmployeeLookup implements employeeLookup for testing.
type mockEmployeeLookup struct {
	mock.Mock
}

func (m *mockEmployeeLookup) GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Employee), args.Error(1)
}

// mockAbsenceDayLookup implements absenceDayLookup for testing.
type mockAbsenceDayLookup struct {
	mock.Mock
}

func (m *mockAbsenceDayLookup) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceDay), args.Error(1)
}

// Helper functions for tests
func testDate(year, month, day int) time.Time {
	return time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
}

func intPtr(i int) *int {
	return &i
}

func newTestService(
	bookingRepo *mockBookingRepository,
	empDayPlanRepo *mockEmployeeDayPlanRepository,
	dayPlanRepo *mockDayPlanRepository,
	dailyValueRepo *mockDailyValueRepository,
	holidayRepo *mockHolidayLookup,
) *DailyCalcService {
	if dayPlanRepo == nil {
		dayPlanRepo = new(mockDayPlanRepository)
	}
	employeeRepo := new(mockEmployeeLookup)
	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	if dailyValueRepo != nil {
		dailyValueRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	}
	return NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
}

func createStandardDayPlan(tenantID uuid.UUID) *model.DayPlan {
	dayPlanID := uuid.New()
	return &model.DayPlan{
		ID:           dayPlanID,
		TenantID:     tenantID,
		Code:         "STD",
		Name:         "Standard",
		RegularHours: 480,          // 8 hours
		ComeFrom:     intPtr(420),  // 7:00
		ComeTo:       intPtr(540),  // 9:00
		GoFrom:       intPtr(960),  // 16:00
		GoTo:         intPtr(1080), // 18:00
	}
}

func createBookingType(direction model.BookingDirection, code string) *model.BookingType {
	return &model.BookingType{
		ID:        uuid.New(),
		Code:      code,
		Name:      code,
		Direction: direction,
	}
}

func createBooking(tenantID, employeeID uuid.UUID, date time.Time, minutes int, bookingType *model.BookingType) model.Booking {
	return model.Booking{
		ID:            uuid.New(),
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingDate:   date,
		EditedTime:    minutes,
		OriginalTime:  minutes,
		BookingType:   bookingType,
		BookingTypeID: bookingType.ID,
	}
}

// Tests

func TestCalculateDay_NormalWithBookings(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	// Setup mocks
	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	// Day plan with 8 hour target
	dayPlan := createStandardDayPlan(tenantID)
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &dayPlanID,
		DayPlan:    dayPlan,
	}

	// Bookings: 8:00 - 16:30 = 510 minutes gross
	comeType := createBookingType(model.BookingDirectionIn, "COME")
	goType := createBookingType(model.BookingDirectionOut, "GO")
	bookings := []model.Booking{
		{
			ID:          uuid.New(),
			TenantID:    tenantID,
			EmployeeID:  employeeID,
			BookingDate: date,
			EditedTime:  480, // 8:00
			BookingType: comeType,
		},
		{
			ID:          uuid.New(),
			TenantID:    tenantID,
			EmployeeID:  employeeID,
			BookingDate: date,
			EditedTime:  990, // 16:30
			BookingType: goType,
		},
	}

	// Set expectations
	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return(bookings, nil)
	bookingRepo.On("UpdateCalculatedTimes", ctx, mock.Anything).Return(nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return dv.EmployeeID == employeeID &&
			dv.ValueDate.Equal(date) &&
			dv.TenantID == tenantID &&
			dv.TargetTime == 480 &&
			dv.BookingCount == 2
	})).Return(nil)

	// Execute
	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	// Assert
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, employeeID, result.EmployeeID)
	assert.Equal(t, tenantID, result.TenantID)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 2, result.BookingCount)

	bookingRepo.AssertExpectations(t)
	empDayPlanRepo.AssertExpectations(t)
	dailyValueRepo.AssertExpectations(t)
	holidayRepo.AssertExpectations(t)
}

func TestCalculateDay_OffDay(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 18) // Saturday

	// Setup mocks
	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	// No day plan = off day
	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(nil, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return([]model.Booking{}, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return dv.TargetTime == 0 &&
			containsString(dv.Warnings, "OFF_DAY")
	})).Return(nil)

	// Execute
	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	// Assert
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 0, result.TargetTime)
	assert.Contains(t, []string(result.Warnings), "OFF_DAY")

	empDayPlanRepo.AssertExpectations(t)
	dailyValueRepo.AssertExpectations(t)
}

func TestCalculateDay_OffDayWithBookings(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 18) // Saturday

	// Setup mocks
	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	// Bookings on off day
	comeType := createBookingType(model.BookingDirectionIn, "COME")
	bookings := []model.Booking{
		{
			ID:          uuid.New(),
			TenantID:    tenantID,
			EmployeeID:  employeeID,
			BookingDate: date,
			EditedTime:  480,
			BookingType: comeType,
		},
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(nil, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return(bookings, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return containsString(dv.Warnings, "OFF_DAY") &&
			containsString(dv.Warnings, "BOOKINGS_ON_OFF_DAY") &&
			dv.BookingCount == 1
	})).Return(nil)

	// Execute
	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	// Assert
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Contains(t, []string(result.Warnings), "OFF_DAY")
	assert.Contains(t, []string(result.Warnings), "BOOKINGS_ON_OFF_DAY")
	assert.Equal(t, 1, result.BookingCount)
}

func TestCalculateDay_Holiday_CreditTarget(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1) // New Year's Day

	// Setup mocks
	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	// Holiday
	holiday := &model.Holiday{
		ID:          uuid.New(),
		TenantID:    tenantID,
		HolidayDate: date,
		Name:        "New Year's Day",
		Category:    1,
	}

	// Day plan with 8 hour target and holiday credit cat1 configured
	dayPlan := createStandardDayPlan(tenantID)
	dayPlan.HolidayCreditCat1 = intPtr(480) // Full target credit for category 1 holidays
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &dayPlanID,
		DayPlan:    dayPlan,
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(holiday, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return([]model.Booking{}, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return dv.TargetTime == 480 &&
			dv.NetTime == 480 && // Full target credited
			dv.GrossTime == 480 &&
			containsString(dv.Warnings, "HOLIDAY")
	})).Return(nil)

	// Execute
	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	// Assert
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 480, result.NetTime)
	assert.Equal(t, 480, result.GrossTime)
	assert.Contains(t, []string(result.Warnings), "HOLIDAY")
}

func TestCalculateDay_NoBookings_Error(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	// Setup mocks
	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	// Day plan with 8 hour target
	dayPlan := createStandardDayPlan(tenantID)
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &dayPlanID,
		DayPlan:    dayPlan,
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return([]model.Booking{}, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return dv.HasError &&
			containsString(dv.ErrorCodes, "NO_BOOKINGS") &&
			dv.Undertime == 480
	})).Return(nil)

	// Execute
	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	// Assert
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.True(t, result.HasError)
	assert.Contains(t, []string(result.ErrorCodes), "NO_BOOKINGS")
	assert.Equal(t, 480, result.Undertime)
}

func TestCalculateDay_WorkedOnHoliday(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1) // New Year's Day

	// Setup mocks
	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	// Holiday
	holiday := &model.Holiday{
		ID:          uuid.New(),
		TenantID:    tenantID,
		HolidayDate: date,
		Name:        "New Year's Day",
	}

	// Day plan
	dayPlan := createStandardDayPlan(tenantID)
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &dayPlanID,
		DayPlan:    dayPlan,
	}

	// Bookings on holiday
	comeType := createBookingType(model.BookingDirectionIn, "COME")
	goType := createBookingType(model.BookingDirectionOut, "GO")
	bookings := []model.Booking{
		{
			ID:          uuid.New(),
			TenantID:    tenantID,
			EmployeeID:  employeeID,
			BookingDate: date,
			EditedTime:  480,
			BookingType: comeType,
		},
		{
			ID:          uuid.New(),
			TenantID:    tenantID,
			EmployeeID:  employeeID,
			BookingDate: date,
			EditedTime:  960,
			BookingType: goType,
		},
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(holiday, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return(bookings, nil)
	bookingRepo.On("UpdateCalculatedTimes", ctx, mock.Anything).Return(nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return containsString(dv.Warnings, "WORKED_ON_HOLIDAY") &&
			dv.BookingCount == 2
	})).Return(nil)

	// Execute
	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	// Assert
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Contains(t, []string(result.Warnings), "WORKED_ON_HOLIDAY")
	assert.Equal(t, 2, result.BookingCount)
}

func TestRecalculateRange(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	from := testDate(2026, 1, 20)
	to := testDate(2026, 1, 22)

	// Setup mocks
	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	// Expect 3 days of calculations
	for i := 0; i < 3; i++ {
		date := from.AddDate(0, 0, i)
		holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
		empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(nil, nil)
		bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return([]model.Booking{}, nil)
		dailyValueRepo.On("Upsert", ctx, mock.Anything).Return(nil)
	}

	// Execute
	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	count, err := svc.RecalculateRange(ctx, tenantID, employeeID, from, to)

	// Assert
	require.NoError(t, err)
	assert.Equal(t, 3, count)
}

func TestHandleNoBookings_AdoptTarget(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlan.NoBookingBehavior = model.NoBookingAdoptTarget
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 480, result.NetTime)
	assert.Equal(t, 480, result.GrossTime)
	assert.Contains(t, []string(result.Warnings), "NO_BOOKINGS_CREDITED")
}

func TestHandleNoBookings_DeductTarget(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlan.NoBookingBehavior = model.NoBookingDeductTarget
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 0, result.NetTime)
	assert.Equal(t, 0, result.GrossTime)
	assert.Equal(t, 480, result.Undertime)
	assert.Contains(t, []string(result.Warnings), "NO_BOOKINGS_DEDUCTED")
}

func TestHandleNoBookings_Error(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlan.NoBookingBehavior = model.NoBookingError
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.True(t, result.HasError)
	assert.Contains(t, []string(result.ErrorCodes), "NO_BOOKINGS")
}

func TestHandleHolidayCredit_Category3_NoCredit(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	// No holiday credit configured — should credit 0 per ZMI spec
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result := svc.handleHolidayCredit(ctx, employeeID, date, empDayPlan, 3)

	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 0, result.NetTime)
	assert.Equal(t, 0, result.GrossTime)
	assert.Equal(t, 480, result.Undertime)
	assert.Contains(t, []string(result.Warnings), "HOLIDAY")
}

func TestHandleHolidayCredit_Category1_WithCredit(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlan.HolidayCreditCat1 = intPtr(480) // Full day credit
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result := svc.handleHolidayCredit(ctx, employeeID, date, empDayPlan, 1)

	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 480, result.NetTime)
	assert.Equal(t, 480, result.GrossTime)
	assert.Equal(t, 0, result.Undertime)
	assert.Contains(t, []string(result.Warnings), "HOLIDAY")
}

func TestHandleNoBookings_VocationalSchool(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlan.NoBookingBehavior = model.NoBookingVocationalSchool
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 480, result.NetTime)
	assert.Equal(t, 480, result.GrossTime)
	assert.Contains(t, []string(result.Warnings), "VOCATIONAL_SCHOOL")
}

func TestHandleNoBookings_TargetWithOrder(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlan.NoBookingBehavior = model.NoBookingTargetWithOrder
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 480, result.NetTime)
	assert.Equal(t, 480, result.GrossTime)
	assert.Contains(t, []string(result.Warnings), "ORDER_BOOKING_NOT_IMPLEMENTED")
}

func TestHandleHolidayCredit_Category2_WithCredit(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlan.HolidayCreditCat2 = intPtr(240) // Half day credit for category 2
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result := svc.handleHolidayCredit(ctx, employeeID, date, empDayPlan, 2)

	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 240, result.NetTime)
	assert.Equal(t, 240, result.GrossTime)
	assert.Equal(t, 240, result.Undertime)
	assert.Contains(t, []string(result.Warnings), "HOLIDAY")
}

func TestResolveTargetHours_EmployeeMaster(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	dailyTarget := decimal.NewFromFloat(7.5)
	emp := &model.Employee{
		ID:               employeeID,
		DailyTargetHours: &dailyTarget,
	}

	employeeRepo := new(mockEmployeeLookup)
	employeeRepo.On("GetByID", ctx, employeeID).Return(emp, nil)
	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(nil, nil)

	svc := &DailyCalcService{
		employeeRepo:   employeeRepo,
		absenceDayRepo: absenceDayRepo,
	}

	dp := createStandardDayPlan(uuid.New())
	dp.FromEmployeeMaster = true

	result := svc.resolveTargetHours(ctx, employeeID, date, dp)
	assert.Equal(t, 450, result) // 7.5 * 60
}

func TestResolveTargetHours_RegularHours2OnAbsenceDay(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	absence := &model.AbsenceDay{
		EmployeeID:  employeeID,
		AbsenceDate: date,
		Status:      model.AbsenceStatusApproved,
	}

	employeeRepo := new(mockEmployeeLookup)
	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(absence, nil)

	svc := &DailyCalcService{
		employeeRepo:   employeeRepo,
		absenceDayRepo: absenceDayRepo,
	}

	dp := createStandardDayPlan(uuid.New())
	dp.RegularHours2 = intPtr(360)

	result := svc.resolveTargetHours(ctx, employeeID, date, dp)
	assert.Equal(t, 360, result)
}

func TestResolveTargetHours_FallsBackToRegularHours(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	employeeRepo := new(mockEmployeeLookup)
	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(nil, nil)

	svc := &DailyCalcService{
		employeeRepo:   employeeRepo,
		absenceDayRepo: absenceDayRepo,
	}

	dp := createStandardDayPlan(uuid.New())

	result := svc.resolveTargetHours(ctx, employeeID, date, dp)
	assert.Equal(t, 480, result) // Standard RegularHours
}

func TestResolveTargetHours_EmployeeMasterTakesPriority(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	dailyTarget := decimal.NewFromFloat(7.0)
	emp := &model.Employee{
		ID:               employeeID,
		DailyTargetHours: &dailyTarget,
	}

	absence := &model.AbsenceDay{
		EmployeeID:  employeeID,
		AbsenceDate: date,
		Status:      model.AbsenceStatusApproved,
	}

	employeeRepo := new(mockEmployeeLookup)
	employeeRepo.On("GetByID", ctx, employeeID).Return(emp, nil)
	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(absence, nil)

	svc := &DailyCalcService{
		employeeRepo:   employeeRepo,
		absenceDayRepo: absenceDayRepo,
	}

	dp := createStandardDayPlan(uuid.New())
	dp.FromEmployeeMaster = true
	dp.RegularHours2 = intPtr(360) // Should be ignored because employee master takes priority

	result := svc.resolveTargetHours(ctx, employeeID, date, dp)
	assert.Equal(t, 420, result) // 7.0 * 60 = employee master wins
}

func TestBuildCalcInput_WithBreaks(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	// Day plan with breaks
	dayPlan := createStandardDayPlan(tenantID)
	breakDuration := 30
	dayPlan.Breaks = []model.DayPlanBreak{
		{
			ID:        uuid.New(),
			DayPlanID: dayPlan.ID,
			BreakType: model.BreakTypeFixed,
			StartTime: intPtr(720), // 12:00
			EndTime:   intPtr(780), // 13:00
			Duration:  breakDuration,
		},
	}
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	// Bookings
	comeType := createBookingType(model.BookingDirectionIn, "COME")
	goType := createBookingType(model.BookingDirectionOut, "GO")
	bookings := []model.Booking{
		{
			ID:          uuid.New(),
			BookingDate: date,
			EditedTime:  480,
			BookingType: comeType,
		},
		{
			ID:          uuid.New(),
			BookingDate: date,
			EditedTime:  960,
			BookingType: goType,
		},
	}

	input := svc.buildCalcInput(ctx, employeeID, date, empDayPlan, bookings)

	assert.Equal(t, employeeID, input.EmployeeID)
	assert.Equal(t, date, input.Date)
	assert.Equal(t, 480, input.DayPlan.RegularHours)
	assert.Len(t, input.DayPlan.Breaks, 1)
	assert.Equal(t, breakDuration, input.DayPlan.Breaks[0].Duration)
	assert.Len(t, input.Bookings, 2)
}

func TestBuildCalcInput_BreakBookings(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	absenceDayRepo := new(mockAbsenceDayLookup)
	absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	svc := &DailyCalcService{
		employeeRepo:   new(mockEmployeeLookup),
		absenceDayRepo: absenceDayRepo,
	}

	// Bookings with break type
	breakStartType := createBookingType(model.BookingDirectionOut, "BREAK_START")
	breakEndType := createBookingType(model.BookingDirectionIn, "BREAK_END")
	bookings := []model.Booking{
		{
			ID:          uuid.New(),
			BookingDate: date,
			EditedTime:  720,
			BookingType: breakStartType,
		},
		{
			ID:          uuid.New(),
			BookingDate: date,
			EditedTime:  750,
			BookingType: breakEndType,
		},
	}

	input := svc.buildCalcInput(ctx, employeeID, date, nil, bookings)

	assert.Len(t, input.Bookings, 2)
	assert.Equal(t, "break", string(input.Bookings[0].Category))
	assert.Equal(t, "out", string(input.Bookings[0].Direction))
	assert.Equal(t, "break", string(input.Bookings[1].Category))
	assert.Equal(t, "in", string(input.Bookings[1].Direction))
}

func TestCalculateDay_DayChangeAtArrival(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)
	nextDate := date.AddDate(0, 0, 1)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	dayPlan := createStandardDayPlan(tenantID)
	dayPlan.DayChangeBehavior = model.DayChangeAtArrival
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &dayPlanID,
		DayPlan:    dayPlan,
	}

	comeType := createBookingType(model.BookingDirectionIn, "COME")
	goType := createBookingType(model.BookingDirectionOut, "GO")
	bookings := []model.Booking{
		createBooking(tenantID, employeeID, date, 1320, comeType),  // 22:00
		createBooking(tenantID, employeeID, nextDate, 120, goType), // 02:00 next day
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDateRange", ctx, tenantID, employeeID, date.AddDate(0, 0, -1), date.AddDate(0, 0, 1)).Return(bookings, nil)
	bookingRepo.On("UpdateCalculatedTimes", ctx, mock.Anything).Return(nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return dv.GrossTime == 240
	})).Return(nil)

	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 240, result.GrossTime)
}

func TestCalculateDay_DayChangeAtDeparture(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)
	prevDate := date.AddDate(0, 0, -1)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	dayPlan := createStandardDayPlan(tenantID)
	dayPlan.DayChangeBehavior = model.DayChangeAtDeparture
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &dayPlanID,
		DayPlan:    dayPlan,
	}

	comeType := createBookingType(model.BookingDirectionIn, "COME")
	goType := createBookingType(model.BookingDirectionOut, "GO")
	bookings := []model.Booking{
		createBooking(tenantID, employeeID, prevDate, 1320, comeType), // 22:00 previous day
		createBooking(tenantID, employeeID, date, 120, goType),        // 02:00
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDateRange", ctx, tenantID, employeeID, date.AddDate(0, 0, -1), date.AddDate(0, 0, 1)).Return(bookings, nil)
	bookingRepo.On("UpdateCalculatedTimes", ctx, mock.Anything).Return(nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return dv.GrossTime == 240
	})).Return(nil)

	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 240, result.GrossTime)
}

func TestCalculateDay_DayChangeAutoComplete(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)
	nextDate := date.AddDate(0, 0, 1)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	dayPlan := createStandardDayPlan(tenantID)
	dayPlan.DayChangeBehavior = model.DayChangeAutoComplete
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &dayPlanID,
		DayPlan:    dayPlan,
	}

	comeType := createBookingType(model.BookingDirectionIn, "COME")
	goType := createBookingType(model.BookingDirectionOut, "GO")
	bookings := []model.Booking{
		createBooking(tenantID, employeeID, date, 1320, comeType),  // 22:00
		createBooking(tenantID, employeeID, nextDate, 120, goType), // 02:00 next day
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDateRange", ctx, tenantID, employeeID, date.AddDate(0, 0, -1), date.AddDate(0, 0, 1)).Return(bookings, nil)
	bookingRepo.On("Create", ctx, mock.MatchedBy(func(b *model.Booking) bool {
		return b.BookingDate.Equal(nextDate) &&
			b.EditedTime == 0 &&
			b.Source == model.BookingSourceCorrection &&
			b.Notes == autoCompleteNotes &&
			b.BookingType != nil &&
			b.BookingType.Direction == model.BookingDirectionOut
	})).Return(nil).Once()
	bookingRepo.On("Create", ctx, mock.MatchedBy(func(b *model.Booking) bool {
		return b.BookingDate.Equal(nextDate) &&
			b.EditedTime == 0 &&
			b.Source == model.BookingSourceCorrection &&
			b.Notes == autoCompleteNotes &&
			b.BookingType != nil &&
			b.BookingType.Direction == model.BookingDirectionIn
	})).Return(nil).Once()
	bookingRepo.On("UpdateCalculatedTimes", ctx, mock.Anything).Return(nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return dv.GrossTime == 120
	})).Return(nil)

	svc := newTestService(bookingRepo, empDayPlanRepo, nil, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 120, result.GrossTime)
}

func TestCalculateDay_ShiftDetection_SelectsAlternativePlan(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dayPlanRepo := new(mockDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	assignedPlan := createStandardDayPlan(tenantID)
	assignedPlan.ShiftDetectArriveFrom = intPtr(480)
	assignedPlan.ShiftDetectArriveTo = intPtr(540)
	assignedPlan.ShiftDetectDepartFrom = intPtr(960)
	assignedPlan.ShiftDetectDepartTo = intPtr(1020)

	altPlanID := uuid.New()
	assignedPlan.ShiftAltPlan1 = &altPlanID

	altPlan := &model.DayPlan{
		ID:                    altPlanID,
		TenantID:              tenantID,
		Code:                  "ALT",
		Name:                  "Alt Shift",
		RegularHours:          420,
		ShiftDetectArriveFrom: intPtr(420),
		ShiftDetectArriveTo:   intPtr(480),
		ShiftDetectDepartFrom: intPtr(900),
		ShiftDetectDepartTo:   intPtr(960),
	}

	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &assignedPlan.ID,
		DayPlan:    assignedPlan,
	}

	comeType := createBookingType(model.BookingDirectionIn, "COME")
	goType := createBookingType(model.BookingDirectionOut, "GO")
	bookings := []model.Booking{
		createBooking(tenantID, employeeID, date, 435, comeType), // 07:15
		createBooking(tenantID, employeeID, date, 930, goType),   // 15:30
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return(bookings, nil)
	bookingRepo.On("UpdateCalculatedTimes", ctx, mock.Anything).Return(nil)
	dayPlanRepo.On("GetByID", ctx, altPlanID).Return(altPlan, nil)
	dayPlanRepo.On("GetWithDetails", ctx, altPlanID).Return(altPlan, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return dv.TargetTime == 420
	})).Return(nil)

	svc := newTestService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 420, result.TargetTime)
}

func TestCalculateDay_ShiftDetection_NoMatchAddsError(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dayPlanRepo := new(mockDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)

	assignedPlan := createStandardDayPlan(tenantID)
	assignedPlan.ShiftDetectArriveFrom = intPtr(600) // 10:00
	assignedPlan.ShiftDetectArriveTo = intPtr(660)   // 11:00
	assignedPlan.ShiftDetectDepartFrom = intPtr(900) // 15:00
	assignedPlan.ShiftDetectDepartTo = intPtr(960)   // 16:00

	empDayPlan := &model.EmployeeDayPlan{
		ID:         uuid.New(),
		TenantID:   tenantID,
		EmployeeID: employeeID,
		PlanDate:   date,
		DayPlanID:  &assignedPlan.ID,
		DayPlan:    assignedPlan,
	}

	comeType := createBookingType(model.BookingDirectionIn, "COME")
	goType := createBookingType(model.BookingDirectionOut, "GO")
	bookings := []model.Booking{
		createBooking(tenantID, employeeID, date, 480, comeType), // 08:00
		createBooking(tenantID, employeeID, date, 1020, goType),  // 17:00
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return(bookings, nil)
	bookingRepo.On("UpdateCalculatedTimes", ctx, mock.Anything).Return(nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return containsString(dv.ErrorCodes, calculation.ErrCodeNoMatchingShift)
	})).Return(nil)

	svc := newTestService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Contains(t, []string(result.ErrorCodes), calculation.ErrCodeNoMatchingShift)
}

// newTestServiceWithAbsenceRepo creates a test service with a custom absence day repo mock.
func newTestServiceWithAbsenceRepo(
	bookingRepo *mockBookingRepository,
	empDayPlanRepo *mockEmployeeDayPlanRepository,
	dailyValueRepo *mockDailyValueRepository,
	holidayRepo *mockHolidayLookup,
	absenceDayRepo *mockAbsenceDayLookup,
) *DailyCalcService {
	dayPlanRepo := new(mockDayPlanRepository)
	employeeRepo := new(mockEmployeeLookup)
	if dailyValueRepo != nil {
		dailyValueRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	}
	return NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
}

func TestCalculateDay_HolidayWithAbsence_PriorityZero(t *testing.T) {
	// Holiday + approved absence with Priority=0 -> holiday credit applies (default behavior)
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)
	absenceDayRepo := new(mockAbsenceDayLookup)

	holiday := &model.Holiday{
		ID: uuid.New(), TenantID: tenantID, HolidayDate: date,
		Name: "New Year", Category: 1,
	}

	dayPlan := createStandardDayPlan(tenantID)
	dayPlan.HolidayCreditCat1 = intPtr(480) // Full credit for cat1
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID: uuid.New(), TenantID: tenantID, EmployeeID: employeeID,
		PlanDate: date, DayPlanID: &dayPlanID, DayPlan: dayPlan,
	}

	absenceTypeID := uuid.New()
	absence := &model.AbsenceDay{
		ID: uuid.New(), TenantID: tenantID, EmployeeID: employeeID,
		AbsenceDate: date, AbsenceTypeID: absenceTypeID,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusApproved,
		AbsenceType: &model.AbsenceType{
			ID: absenceTypeID, Code: "U1", Name: "Vacation",
			Portion: model.AbsencePortionFull, Priority: 0, // Priority 0 = holiday wins
		},
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(holiday, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return([]model.Booking{}, nil)
	// GetByEmployeeDate is called twice: once in CalculateDay priority check, once in resolveTargetHours
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(absence, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return containsString(dv.Warnings, "HOLIDAY") && dv.NetTime == 480
	})).Return(nil)

	svc := newTestServiceWithAbsenceRepo(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo, absenceDayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.NetTime)
	assert.Contains(t, []string(result.Warnings), "HOLIDAY") // Holiday credit, not absence
}

func TestCalculateDay_HolidayWithAbsence_PriorityPositive(t *testing.T) {
	// Holiday + approved absence with Priority=1 -> absence credit applies
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)
	absenceDayRepo := new(mockAbsenceDayLookup)

	holiday := &model.Holiday{
		ID: uuid.New(), TenantID: tenantID, HolidayDate: date,
		Name: "New Year", Category: 1,
	}

	dayPlan := createStandardDayPlan(tenantID)
	dayPlan.HolidayCreditCat1 = intPtr(480) // Would give 480 if holiday wins
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID: uuid.New(), TenantID: tenantID, EmployeeID: employeeID,
		PlanDate: date, DayPlanID: &dayPlanID, DayPlan: dayPlan,
	}

	absenceTypeID := uuid.New()
	absence := &model.AbsenceDay{
		ID: uuid.New(), TenantID: tenantID, EmployeeID: employeeID,
		AbsenceDate: date, AbsenceTypeID: absenceTypeID,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusApproved,
		AbsenceType: &model.AbsenceType{
			ID: absenceTypeID, Code: "U1", Name: "Vacation",
			Portion: model.AbsencePortionFull, Priority: 1, // Priority > 0 = absence wins
		},
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(holiday, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return([]model.Booking{}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(absence, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return containsString(dv.Warnings, "ABSENCE_ON_HOLIDAY") && dv.NetTime == 480
	})).Return(nil)

	svc := newTestServiceWithAbsenceRepo(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo, absenceDayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 480, result.NetTime) // Full credit via absence (480 * 1.0 * 1.0)
	assert.Equal(t, 480, result.GrossTime)
	assert.Equal(t, 0, result.Undertime)
	assert.Contains(t, []string(result.Warnings), "ABSENCE_ON_HOLIDAY")
}

func TestCalculateDay_HolidayWithAbsence_PendingAbsence(t *testing.T) {
	// Holiday + pending (not approved) absence with Priority=1 -> holiday credit (only approved absences override)
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)
	absenceDayRepo := new(mockAbsenceDayLookup)

	holiday := &model.Holiday{
		ID: uuid.New(), TenantID: tenantID, HolidayDate: date,
		Name: "New Year", Category: 1,
	}

	dayPlan := createStandardDayPlan(tenantID)
	dayPlan.HolidayCreditCat1 = intPtr(480)
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID: uuid.New(), TenantID: tenantID, EmployeeID: employeeID,
		PlanDate: date, DayPlanID: &dayPlanID, DayPlan: dayPlan,
	}

	absenceTypeID := uuid.New()
	absence := &model.AbsenceDay{
		ID: uuid.New(), TenantID: tenantID, EmployeeID: employeeID,
		AbsenceDate: date, AbsenceTypeID: absenceTypeID,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending, // NOT approved
		AbsenceType: &model.AbsenceType{
			ID: absenceTypeID, Code: "U1", Name: "Vacation",
			Portion: model.AbsencePortionFull, Priority: 1,
		},
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(holiday, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return([]model.Booking{}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(absence, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return containsString(dv.Warnings, "HOLIDAY") && dv.NetTime == 480
	})).Return(nil)

	svc := newTestServiceWithAbsenceRepo(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo, absenceDayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.NetTime)
	assert.Contains(t, []string(result.Warnings), "HOLIDAY") // Holiday credit, not absence
	assert.NotContains(t, []string(result.Warnings), "ABSENCE_ON_HOLIDAY")
}

func TestCalculateDay_HolidayWithAbsence_HalfDay(t *testing.T) {
	// Holiday + approved half-day absence with Priority=1 -> absence credit = 480 * 1.0 * 0.5 = 240
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	bookingRepo := new(mockBookingRepository)
	empDayPlanRepo := new(mockEmployeeDayPlanRepository)
	dailyValueRepo := new(mockDailyValueRepository)
	holidayRepo := new(mockHolidayLookup)
	absenceDayRepo := new(mockAbsenceDayLookup)

	holiday := &model.Holiday{
		ID: uuid.New(), TenantID: tenantID, HolidayDate: date,
		Name: "New Year", Category: 1,
	}

	dayPlan := createStandardDayPlan(tenantID)
	dayPlan.HolidayCreditCat1 = intPtr(480)
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		ID: uuid.New(), TenantID: tenantID, EmployeeID: employeeID,
		PlanDate: date, DayPlanID: &dayPlanID, DayPlan: dayPlan,
	}

	absenceTypeID := uuid.New()
	morning := model.HalfDayPeriodMorning
	absence := &model.AbsenceDay{
		ID: uuid.New(), TenantID: tenantID, EmployeeID: employeeID,
		AbsenceDate: date, AbsenceTypeID: absenceTypeID,
		Duration: decimal.NewFromFloat(0.5), Status: model.AbsenceStatusApproved,
		HalfDayPeriod: &morning,
		AbsenceType: &model.AbsenceType{
			ID: absenceTypeID, Code: "U1", Name: "Vacation",
			Portion: model.AbsencePortionFull, Priority: 1,
		},
	}

	holidayRepo.On("GetByDate", ctx, tenantID, date).Return(holiday, nil)
	empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return([]model.Booking{}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(absence, nil)
	dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
		return containsString(dv.Warnings, "ABSENCE_ON_HOLIDAY") &&
			dv.NetTime == 240 && // 480 * 1.0 * 0.5 = 240
			dv.TargetTime == 480 &&
			dv.Undertime == 240 // 480 - 240 = 240
	})).Return(nil)

	svc := newTestServiceWithAbsenceRepo(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo, absenceDayRepo)
	result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 240, result.NetTime) // Half-day absence credit
	assert.Equal(t, 240, result.GrossTime)
	assert.Equal(t, 240, result.Undertime) // Half target not covered
	assert.Contains(t, []string(result.Warnings), "ABSENCE_ON_HOLIDAY")
}

// Helper function to check if a string slice contains a value
func containsString(arr pq.StringArray, val string) bool {
	for _, v := range arr {
		if v == val {
			return true
		}
	}
	return false
}
