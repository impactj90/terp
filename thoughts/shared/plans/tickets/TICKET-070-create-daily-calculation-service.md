# TICKET-070: Create Daily Calculation Service

**Type**: Service
**Effort**: L
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-068, TICKET-054, TICKET-056, TICKET-058

## Description

Create the service that orchestrates daily calculation with database access.

## Files to Create

- `apps/api/internal/service/daily_calc.go`

## Implementation

```go
package service

import (
    "context"
    "time"

    "github.com/google/uuid"

    "terp/apps/api/internal/calculation"
    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

type DailyCalcService interface {
    CalculateDay(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
    RecalculateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error
}

type dailyCalcService struct {
    bookingRepo     repository.BookingRepository
    empDayPlanRepo  repository.EmployeeDayPlanRepository
    dailyValueRepo  repository.DailyValueRepository
    absenceRepo     repository.AbsenceRepository
    holidayRepo     repository.HolidayRepository
    dayPlanRepo     repository.DayPlanRepository
}

func NewDailyCalcService(
    bookingRepo repository.BookingRepository,
    empDayPlanRepo repository.EmployeeDayPlanRepository,
    dailyValueRepo repository.DailyValueRepository,
    absenceRepo repository.AbsenceRepository,
    holidayRepo repository.HolidayRepository,
    dayPlanRepo repository.DayPlanRepository,
) DailyCalcService {
    return &dailyCalcService{
        bookingRepo:    bookingRepo,
        empDayPlanRepo: empDayPlanRepo,
        dailyValueRepo: dailyValueRepo,
        absenceRepo:    absenceRepo,
        holidayRepo:    holidayRepo,
        dayPlanRepo:    dayPlanRepo,
    }
}

func (s *dailyCalcService) CalculateDay(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
    // 1. Build calculation input
    input, err := s.buildCalcInput(ctx, employeeID, date)
    if err != nil {
        return nil, err
    }

    // 2. Run calculation
    output := calculation.CalculateDay(*input)

    // 3. Add additional error/warning detection
    calculation.AddErrorsAndWarnings(*input, &output)

    // 4. Convert to model
    dailyValue := s.outputToDailyValue(employeeID, date, output)

    // 5. Persist
    if err := s.dailyValueRepo.Upsert(ctx, dailyValue); err != nil {
        return nil, err
    }

    // 6. Update booking calculated_times
    if err := s.updateBookingCalculatedTimes(ctx, output.PairedBookings); err != nil {
        return nil, err
    }

    return dailyValue, nil
}

func (s *dailyCalcService) buildCalcInput(ctx context.Context, employeeID uuid.UUID, date time.Time) (*calculation.DailyCalcInput, error) {
    input := &calculation.DailyCalcInput{
        Date: date,
    }

    // Get employee day plan
    empDayPlan, err := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
    if err != nil && err != gorm.ErrRecordNotFound {
        return nil, err
    }
    if empDayPlan != nil && empDayPlan.DayPlan != nil {
        input.DayPlan = s.dayPlanToInput(empDayPlan.DayPlan)
    }

    // Get bookings
    bookings, err := s.bookingRepo.GetByEmployeeDate(ctx, employeeID, date)
    if err != nil {
        return nil, err
    }
    input.Bookings = s.bookingsToInput(bookings)

    // Get absence
    absence, err := s.absenceRepo.GetByEmployeeDate(ctx, employeeID, date)
    if err != nil && err != gorm.ErrRecordNotFound {
        return nil, err
    }
    if absence != nil {
        input.Absence = s.absenceToInput(absence)
    }

    // Check holiday
    // Get tenant from employee
    holiday, _ := s.holidayRepo.GetByDate(ctx, tenantID, date)
    input.IsHoliday = holiday != nil

    return input, nil
}

func (s *dailyCalcService) dayPlanToInput(dp *model.DayPlan) *calculation.DayPlanInput {
    input := &calculation.DayPlanInput{
        ID:           dp.ID,
        PlanType:     string(dp.PlanType),
        RegularHours: dp.RegularHours,
        ComeFrom:     dp.ComeFrom,
        ComeTo:       dp.ComeTo,
        GoFrom:       dp.GoFrom,
        GoTo:         dp.GoTo,
        CoreStart:    dp.CoreStart,
        CoreEnd:      dp.CoreEnd,
        MinWorkTime:  dp.MinWorkTime,
        MaxNetWorkTime: dp.MaxNetWorkTime,
        Tolerances: calculation.ToleranceConfig{
            ComePlus:  dp.ToleranceComePlus,
            ComeMinus: dp.ToleranceComeMinus,
            GoPlus:    dp.ToleranceGoPlus,
            GoMinus:   dp.ToleranceGoMinus,
        },
    }

    if dp.RoundingComeType != nil {
        input.Rounding.ComeType = string(*dp.RoundingComeType)
        if dp.RoundingComeInterval != nil {
            input.Rounding.ComeInterval = *dp.RoundingComeInterval
        }
    }
    if dp.RoundingGoType != nil {
        input.Rounding.GoType = string(*dp.RoundingGoType)
        if dp.RoundingGoInterval != nil {
            input.Rounding.GoInterval = *dp.RoundingGoInterval
        }
    }

    for _, b := range dp.Breaks {
        input.Breaks = append(input.Breaks, calculation.BreakConfig{
            BreakType:        string(b.BreakType),
            StartTime:        b.StartTime,
            EndTime:          b.EndTime,
            Duration:         b.Duration,
            AfterWorkMinutes: b.AfterWorkMinutes,
            AutoDeduct:       b.AutoDeduct,
            IsPaid:           b.IsPaid,
        })
    }

    return input
}

func (s *dailyCalcService) bookingsToInput(bookings []model.Booking) []calculation.BookingInput {
    var result []calculation.BookingInput
    for _, b := range bookings {
        result = append(result, calculation.BookingInput{
            ID:           b.ID,
            Category:     string(b.BookingType.Category),
            OriginalTime: b.OriginalTime,
            EditedTime:   b.EditedTime,
        })
    }
    return result
}

func (s *dailyCalcService) absenceToInput(absence *model.AbsenceDay) *calculation.AbsenceInput {
    return &calculation.AbsenceInput{
        TypeCode:     absence.AbsenceType.Code,
        CreditsHours: absence.AbsenceType.CreditsHours,
        Duration:     float64(absence.Duration),
    }
}

func (s *dailyCalcService) outputToDailyValue(employeeID uuid.UUID, date time.Time, output calculation.DailyCalcOutput) *model.DailyValue {
    now := time.Now()
    return &model.DailyValue{
        EmployeeID:   employeeID,
        ValueDate:    date,
        GrossTime:    output.GrossTime,
        NetTime:      output.NetTime,
        TargetTime:   output.TargetTime,
        Overtime:     output.Overtime,
        Undertime:    output.Undertime,
        BreakTime:    output.BreakTime,
        HasError:     output.HasError,
        ErrorCodes:   output.ErrorCodes,
        Warnings:     output.Warnings,
        FirstCome:    output.FirstCome,
        LastGo:       output.LastGo,
        BookingCount: len(output.PairedBookings),
        CalculatedAt: &now,
    }
}

func (s *dailyCalcService) RecalculateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
    for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
        if _, err := s.CalculateDay(ctx, employeeID, date); err != nil {
            return err
        }
    }
    return nil
}
```

## Unit Tests

**File**: `apps/api/internal/service/daily_calc_test.go`

```go
package service

import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/calculation"
    "terp/apps/api/internal/model"
)

// MockBookingRepository for testing
type MockBookingRepository struct {
    mock.Mock
}

func (m *MockBookingRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.Booking, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).([]model.Booking), args.Error(1)
}

// MockEmployeeDayPlanRepository for testing
type MockEmployeeDayPlanRepository struct {
    mock.Mock
}

func (m *MockEmployeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.EmployeeDayPlan), args.Error(1)
}

// MockDailyValueRepository for testing
type MockDailyValueRepository struct {
    mock.Mock
}

func (m *MockDailyValueRepository) Upsert(ctx context.Context, dv *model.DailyValue) error {
    args := m.Called(ctx, dv)
    return args.Error(0)
}

func (m *MockDailyValueRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DailyValue), args.Error(1)
}

func (m *MockDailyValueRepository) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
    args := m.Called(ctx, employeeID, from, to)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).([]model.DailyValue), args.Error(1)
}

func TestDailyCalcService_CalculateDay_Success(t *testing.T) {
    mockBookingRepo := new(MockBookingRepository)
    mockEmpDayPlanRepo := new(MockEmployeeDayPlanRepository)
    mockDailyValueRepo := new(MockDailyValueRepository)

    svc := &dailyCalcService{
        bookingRepo:    mockBookingRepo,
        empDayPlanRepo: mockEmpDayPlanRepo,
        dailyValueRepo: mockDailyValueRepo,
    }
    ctx := context.Background()
    employeeID := uuid.New()
    date := time.Now()

    // Setup mocks
    empDayPlan := &model.EmployeeDayPlan{
        EmployeeID: employeeID,
        PlanDate:   date,
        DayPlan: &model.DayPlan{
            ID:           uuid.New(),
            PlanType:     model.PlanTypeFlextime,
            RegularHours: 480,
        },
    }
    mockEmpDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)

    bookings := []model.Booking{
        {ID: uuid.New(), OriginalTime: 480, BookingType: model.BookingType{Category: model.CategoryCome}},
        {ID: uuid.New(), OriginalTime: 960, BookingType: model.BookingType{Category: model.CategoryGo}},
    }
    mockBookingRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(bookings, nil)

    mockDailyValueRepo.On("Upsert", ctx, mock.AnythingOfType("*model.DailyValue")).Return(nil)

    dailyValue, err := svc.CalculateDay(ctx, employeeID, date)
    require.NoError(t, err)
    assert.NotNil(t, dailyValue)
    assert.Equal(t, employeeID, dailyValue.EmployeeID)
    assert.Equal(t, date, dailyValue.ValueDate)
}

func TestDailyCalcService_RecalculateRange_ProcessesMultipleDays(t *testing.T) {
    mockBookingRepo := new(MockBookingRepository)
    mockEmpDayPlanRepo := new(MockEmployeeDayPlanRepository)
    mockDailyValueRepo := new(MockDailyValueRepository)

    svc := &dailyCalcService{
        bookingRepo:    mockBookingRepo,
        empDayPlanRepo: mockEmpDayPlanRepo,
        dailyValueRepo: mockDailyValueRepo,
    }
    ctx := context.Background()
    employeeID := uuid.New()
    from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
    to := time.Date(2024, 1, 3, 0, 0, 0, 0, time.UTC)

    // Setup mocks for each day
    mockEmpDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)
    mockBookingRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return([]model.Booking{}, nil)
    mockDailyValueRepo.On("Upsert", ctx, mock.AnythingOfType("*model.DailyValue")).Return(nil)

    err := svc.RecalculateRange(ctx, employeeID, from, to)
    require.NoError(t, err)

    // Should have called Upsert 3 times (Jan 1, 2, 3)
    mockDailyValueRepo.AssertNumberOfCalls(t, "Upsert", 3)
}

func TestDailyCalcService_buildCalcInput_LoadsAllData(t *testing.T) {
    mockBookingRepo := new(MockBookingRepository)
    mockEmpDayPlanRepo := new(MockEmployeeDayPlanRepository)
    mockDailyValueRepo := new(MockDailyValueRepository)

    svc := &dailyCalcService{
        bookingRepo:    mockBookingRepo,
        empDayPlanRepo: mockEmpDayPlanRepo,
        dailyValueRepo: mockDailyValueRepo,
    }
    ctx := context.Background()
    employeeID := uuid.New()
    date := time.Now()

    empDayPlan := &model.EmployeeDayPlan{
        DayPlan: &model.DayPlan{ID: uuid.New()},
    }
    mockEmpDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
    mockBookingRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return([]model.Booking{}, nil)

    input, err := svc.buildCalcInput(ctx, employeeID, date)
    require.NoError(t, err)
    assert.NotNil(t, input)
    assert.NotNil(t, input.DayPlan)
    assert.Equal(t, date, input.Date)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Loads all required data (day plan, bookings, absence, holiday)
- [ ] Calls calculation.CalculateDay with proper input
- [ ] Persists result to daily_values
- [ ] Updates booking calculated_times
- [ ] RecalculateRange processes multiple days
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
