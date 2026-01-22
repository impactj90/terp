package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

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

func (m *mockBookingRepository) UpdateCalculatedTimes(ctx context.Context, updates map[uuid.UUID]int) error {
	args := m.Called(ctx, updates)
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
	dailyValueRepo *mockDailyValueRepository,
	holidayRepo *mockHolidayLookup,
) *DailyCalcService {
	return NewDailyCalcService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
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
	svc := newTestService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
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
	svc := newTestService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
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
	svc := newTestService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
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
	}

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
	svc := newTestService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
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
	svc := newTestService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
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
	svc := newTestService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
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
	svc := newTestService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
	count, err := svc.RecalculateRange(ctx, tenantID, employeeID, from, to)

	// Assert
	require.NoError(t, err)
	assert.Equal(t, 3, count)
}

func TestHandleNoBookings_Skip(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	svc := &DailyCalcService{}

	config := &DailyCalcConfig{
		NoBookingBehavior: NoBookingSkip,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan, config)

	require.NoError(t, err)
	assert.Nil(t, result) // Should return nil to indicate skip
}

func TestHandleNoBookings_CreditTarget(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	svc := &DailyCalcService{}

	config := &DailyCalcConfig{
		NoBookingBehavior: NoBookingCreditTarget,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan, config)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 480, result.NetTime)
	assert.Equal(t, 480, result.GrossTime)
	assert.Contains(t, []string(result.Warnings), "NO_BOOKINGS_CREDITED")
}

func TestHandleNoBookings_CreditZero(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	svc := &DailyCalcService{}

	config := &DailyCalcConfig{
		NoBookingBehavior: NoBookingCreditZero,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan, config)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 0, result.NetTime)
	assert.Equal(t, 0, result.GrossTime)
	assert.Equal(t, 480, result.Undertime)
	assert.Contains(t, []string(result.Warnings), "NO_BOOKINGS_ZERO")
}

func TestHandleNoBookings_UseAbsence(t *testing.T) {
	ctx := context.Background()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	svc := &DailyCalcService{}

	config := &DailyCalcConfig{
		NoBookingBehavior: NoBookingUseAbsence,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan, config)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.True(t, result.HasError)
	assert.Contains(t, []string(result.ErrorCodes), "NO_BOOKINGS")
	assert.Contains(t, []string(result.Warnings), "ABSENCE_NOT_IMPLEMENTED")
}

func TestHandleHolidayCredit_None(t *testing.T) {
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	svc := &DailyCalcService{}

	config := &DailyCalcConfig{
		HolidayCredit: HolidayCreditNone,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result := svc.handleHolidayCredit(employeeID, date, empDayPlan, config)

	require.NotNil(t, result)
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 0, result.NetTime)
	assert.Equal(t, 0, result.GrossTime)
	assert.Equal(t, 480, result.Undertime)
	assert.Contains(t, []string(result.Warnings), "HOLIDAY")
}

func TestHandleHolidayCredit_Average(t *testing.T) {
	employeeID := uuid.New()
	date := testDate(2026, 1, 1)

	svc := &DailyCalcService{}

	config := &DailyCalcConfig{
		HolidayCredit: HolidayCreditAverage,
	}

	dayPlan := createStandardDayPlan(uuid.New())
	dayPlanID := dayPlan.ID
	empDayPlan := &model.EmployeeDayPlan{
		DayPlanID: &dayPlanID,
		DayPlan:   dayPlan,
	}

	result := svc.handleHolidayCredit(employeeID, date, empDayPlan, config)

	require.NotNil(t, result)
	// Average falls back to target for now
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 480, result.NetTime)
	assert.Contains(t, []string(result.Warnings), "HOLIDAY")
	assert.Contains(t, []string(result.Warnings), "AVERAGE_NOT_IMPLEMENTED")
}

func TestDefaultDailyCalcConfig(t *testing.T) {
	config := DefaultDailyCalcConfig()

	assert.Equal(t, HolidayCreditTarget, config.HolidayCredit)
	assert.Equal(t, NoBookingError, config.NoBookingBehavior)
	assert.Equal(t, DayChangeToFirst, config.DayChangeBehavior)
}

func TestBuildCalcInput_WithBreaks(t *testing.T) {
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	svc := &DailyCalcService{}

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

	input := svc.buildCalcInput(employeeID, date, empDayPlan, bookings)

	assert.Equal(t, employeeID, input.EmployeeID)
	assert.Equal(t, date, input.Date)
	assert.Equal(t, 480, input.DayPlan.RegularHours)
	assert.Len(t, input.DayPlan.Breaks, 1)
	assert.Equal(t, breakDuration, input.DayPlan.Breaks[0].Duration)
	assert.Len(t, input.Bookings, 2)
}

func TestBuildCalcInput_BreakBookings(t *testing.T) {
	employeeID := uuid.New()
	date := testDate(2026, 1, 20)

	svc := &DailyCalcService{}

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

	input := svc.buildCalcInput(employeeID, date, nil, bookings)

	assert.Len(t, input.Bookings, 2)
	assert.Equal(t, "break", string(input.Bookings[0].Category))
	assert.Equal(t, "out", string(input.Bookings[0].Direction))
	assert.Equal(t, "break", string(input.Bookings[1].Category))
	assert.Equal(t, "in", string(input.Bookings[1].Direction))
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
