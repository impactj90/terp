# TICKET-072: Create Booking Service

**Type**: Service
**Effort**: M
**Sprint**: 17 - Booking Service & Handler
**Dependencies**: TICKET-054, TICKET-071

## Description

Create the Booking service with validation and recalc triggering.

## Files to Create

- `apps/api/internal/service/booking.go`

## Implementation

```go
package service

import (
    "context"
    "errors"
    "time"

    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

var (
    ErrBookingNotFound       = errors.New("booking not found")
    ErrInvalidBookingTime    = errors.New("invalid booking time")
    ErrDuplicateBooking      = errors.New("duplicate booking exists")
    ErrMonthClosed           = errors.New("month is closed for editing")
)

type CreateBookingInput struct {
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    BookingDate   time.Time
    BookingTypeID uuid.UUID
    Time          int // Minutes from midnight
    Source        model.BookingSource
    Notes         string
}

type UpdateBookingInput struct {
    Time  *int
    Notes *string
}

type BookingService interface {
    Create(ctx context.Context, input CreateBookingInput) (*model.Booking, error)
    GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error)
    Update(ctx context.Context, id uuid.UUID, input UpdateBookingInput) (*model.Booking, error)
    Delete(ctx context.Context, id uuid.UUID) error
    GetDayView(ctx context.Context, employeeID uuid.UUID, date time.Time) (*DayView, error)
}

type DayView struct {
    Date       time.Time        `json:"date"`
    DayPlan    *model.DayPlan   `json:"day_plan,omitempty"`
    Bookings   []model.Booking  `json:"bookings"`
    DailyValue *model.DailyValue `json:"daily_value,omitempty"`
    Absence    *model.AbsenceDay `json:"absence,omitempty"`
    IsHoliday  bool             `json:"is_holiday"`
}

type bookingService struct {
    repo           repository.BookingRepository
    recalcService  RecalcService
    monthlyRepo    repository.MonthlyValueRepository
    empDayPlanRepo repository.EmployeeDayPlanRepository
    dailyValueRepo repository.DailyValueRepository
    absenceRepo    repository.AbsenceRepository
    holidayRepo    repository.HolidayRepository
}

func (s *bookingService) Create(ctx context.Context, input CreateBookingInput) (*model.Booking, error) {
    // Validate time
    if input.Time < 0 || input.Time >= 1440 {
        return nil, ErrInvalidBookingTime
    }

    // Check if month is closed
    if err := s.checkMonthOpen(ctx, input.EmployeeID, input.BookingDate); err != nil {
        return nil, err
    }

    booking := &model.Booking{
        TenantID:      input.TenantID,
        EmployeeID:    input.EmployeeID,
        BookingDate:   input.BookingDate,
        BookingTypeID: input.BookingTypeID,
        OriginalTime:  input.Time,
        EditedTime:    input.Time,
        Source:        input.Source,
        Notes:         input.Notes,
    }

    if err := s.repo.Create(ctx, booking); err != nil {
        return nil, err
    }

    // Trigger recalculation
    if err := s.recalcService.TriggerRecalc(ctx, input.EmployeeID, input.BookingDate); err != nil {
        // Log but don't fail - booking is created
        // Consider async recalc
    }

    return booking, nil
}

func (s *bookingService) Update(ctx context.Context, id uuid.UUID, input UpdateBookingInput) (*model.Booking, error) {
    booking, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return nil, ErrBookingNotFound
    }

    // Check if month is closed
    if err := s.checkMonthOpen(ctx, booking.EmployeeID, booking.BookingDate); err != nil {
        return nil, err
    }

    if input.Time != nil {
        if *input.Time < 0 || *input.Time >= 1440 {
            return nil, ErrInvalidBookingTime
        }
        booking.EditedTime = *input.Time
    }
    if input.Notes != nil {
        booking.Notes = *input.Notes
    }

    if err := s.repo.Update(ctx, booking); err != nil {
        return nil, err
    }

    // Trigger recalculation
    s.recalcService.TriggerRecalc(ctx, booking.EmployeeID, booking.BookingDate)

    return booking, nil
}

func (s *bookingService) Delete(ctx context.Context, id uuid.UUID) error {
    booking, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return ErrBookingNotFound
    }

    // Check if month is closed
    if err := s.checkMonthOpen(ctx, booking.EmployeeID, booking.BookingDate); err != nil {
        return err
    }

    if err := s.repo.Delete(ctx, id); err != nil {
        return err
    }

    // Trigger recalculation
    s.recalcService.TriggerRecalc(ctx, booking.EmployeeID, booking.BookingDate)

    return nil
}

func (s *bookingService) GetDayView(ctx context.Context, employeeID uuid.UUID, date time.Time) (*DayView, error) {
    view := &DayView{
        Date: date,
    }

    // Get day plan
    empDayPlan, _ := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
    if empDayPlan != nil {
        view.DayPlan = empDayPlan.DayPlan
    }

    // Get bookings
    bookings, err := s.repo.GetByEmployeeDate(ctx, employeeID, date)
    if err != nil {
        return nil, err
    }
    view.Bookings = bookings

    // Get daily value
    dailyValue, _ := s.dailyValueRepo.GetByEmployeeDate(ctx, employeeID, date)
    view.DailyValue = dailyValue

    // Get absence
    absence, _ := s.absenceRepo.GetByEmployeeDate(ctx, employeeID, date)
    view.Absence = absence

    // Check holiday
    holiday, _ := s.holidayRepo.GetByDate(ctx, tenantID, date)
    view.IsHoliday = holiday != nil

    return view, nil
}

func (s *bookingService) checkMonthOpen(ctx context.Context, employeeID uuid.UUID, date time.Time) error {
    monthly, _ := s.monthlyRepo.GetByEmployeeYearMonth(ctx, employeeID, date.Year(), int(date.Month()))
    if monthly != nil && monthly.IsClosed {
        return ErrMonthClosed
    }
    return nil
}
```

## Unit Tests

**File**: `apps/api/internal/service/booking_test.go`

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

    "terp/apps/api/internal/model"
)

// MockBookingRepository for testing
type MockBookingRepository struct {
    mock.Mock
}

func (m *MockBookingRepository) Create(ctx context.Context, booking *model.Booking) error {
    args := m.Called(ctx, booking)
    booking.ID = uuid.New()
    return args.Error(0)
}

func (m *MockBookingRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Booking), args.Error(1)
}

func (m *MockBookingRepository) Update(ctx context.Context, booking *model.Booking) error {
    args := m.Called(ctx, booking)
    return args.Error(0)
}

func (m *MockBookingRepository) Delete(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

// MockRecalcService for testing
type MockRecalcService struct {
    mock.Mock
}

func (m *MockRecalcService) TriggerRecalc(ctx context.Context, employeeID uuid.UUID, date time.Time) error {
    args := m.Called(ctx, employeeID, date)
    return args.Error(0)
}

// MockMonthlyValueRepository for testing
type MockMonthlyValueRepository struct {
    mock.Mock
}

func (m *MockMonthlyValueRepository) GetByEmployeeYearMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
    args := m.Called(ctx, employeeID, year, month)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

func TestBookingService_Create_Success(t *testing.T) {
    mockBookingRepo := new(MockBookingRepository)
    mockRecalcSvc := new(MockRecalcService)
    mockMonthlyRepo := new(MockMonthlyValueRepository)

    svc := &bookingService{
        repo:          mockBookingRepo,
        recalcService: mockRecalcSvc,
        monthlyRepo:   mockMonthlyRepo,
    }
    ctx := context.Background()

    input := CreateBookingInput{
        TenantID:      uuid.New(),
        EmployeeID:    uuid.New(),
        BookingDate:   time.Now(),
        BookingTypeID: uuid.New(),
        Time:          480, // 08:00
        Source:        model.BookingSourceManual,
    }

    mockMonthlyRepo.On("GetByEmployeeYearMonth", ctx, input.EmployeeID, input.BookingDate.Year(), int(input.BookingDate.Month())).Return(nil, nil)
    mockBookingRepo.On("Create", ctx, mock.AnythingOfType("*model.Booking")).Return(nil)
    mockRecalcSvc.On("TriggerRecalc", ctx, input.EmployeeID, input.BookingDate).Return(nil)

    booking, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, 480, booking.OriginalTime)
    assert.Equal(t, 480, booking.EditedTime)
}

func TestBookingService_Create_InvalidTime(t *testing.T) {
    svc := &bookingService{}
    ctx := context.Background()

    // Test time too large
    input := CreateBookingInput{
        Time: 1440, // >= 1440 is invalid
    }
    _, err := svc.Create(ctx, input)
    assert.Equal(t, ErrInvalidBookingTime, err)

    // Test negative time
    input.Time = -1
    _, err = svc.Create(ctx, input)
    assert.Equal(t, ErrInvalidBookingTime, err)
}

func TestBookingService_Create_MonthClosed(t *testing.T) {
    mockBookingRepo := new(MockBookingRepository)
    mockMonthlyRepo := new(MockMonthlyValueRepository)

    svc := &bookingService{
        repo:        mockBookingRepo,
        monthlyRepo: mockMonthlyRepo,
    }
    ctx := context.Background()

    input := CreateBookingInput{
        TenantID:    uuid.New(),
        EmployeeID:  uuid.New(),
        BookingDate: time.Now(),
        Time:        480,
    }

    closedMonth := &model.MonthlyValue{IsClosed: true}
    mockMonthlyRepo.On("GetByEmployeeYearMonth", ctx, input.EmployeeID, input.BookingDate.Year(), int(input.BookingDate.Month())).Return(closedMonth, nil)

    _, err := svc.Create(ctx, input)
    assert.Equal(t, ErrMonthClosed, err)
}

func TestBookingService_Update_ModifiesEditedTime(t *testing.T) {
    mockBookingRepo := new(MockBookingRepository)
    mockRecalcSvc := new(MockRecalcService)
    mockMonthlyRepo := new(MockMonthlyValueRepository)

    svc := &bookingService{
        repo:          mockBookingRepo,
        recalcService: mockRecalcSvc,
        monthlyRepo:   mockMonthlyRepo,
    }
    ctx := context.Background()

    id := uuid.New()
    existing := &model.Booking{
        ID:           id,
        EmployeeID:   uuid.New(),
        BookingDate:  time.Now(),
        OriginalTime: 480,
        EditedTime:   480,
    }

    newTime := 485
    input := UpdateBookingInput{
        Time: &newTime,
    }

    mockBookingRepo.On("GetByID", ctx, id).Return(existing, nil)
    mockMonthlyRepo.On("GetByEmployeeYearMonth", ctx, existing.EmployeeID, existing.BookingDate.Year(), int(existing.BookingDate.Month())).Return(nil, nil)
    mockBookingRepo.On("Update", ctx, mock.AnythingOfType("*model.Booking")).Return(nil)
    mockRecalcSvc.On("TriggerRecalc", ctx, existing.EmployeeID, existing.BookingDate).Return(nil)

    booking, err := svc.Update(ctx, id, input)
    require.NoError(t, err)
    assert.Equal(t, 480, booking.OriginalTime) // Original unchanged
    assert.Equal(t, 485, booking.EditedTime)   // Edited changed
}

func TestBookingService_Delete_TriggersRecalc(t *testing.T) {
    mockBookingRepo := new(MockBookingRepository)
    mockRecalcSvc := new(MockRecalcService)
    mockMonthlyRepo := new(MockMonthlyValueRepository)

    svc := &bookingService{
        repo:          mockBookingRepo,
        recalcService: mockRecalcSvc,
        monthlyRepo:   mockMonthlyRepo,
    }
    ctx := context.Background()

    id := uuid.New()
    existing := &model.Booking{
        ID:          id,
        EmployeeID:  uuid.New(),
        BookingDate: time.Now(),
    }

    mockBookingRepo.On("GetByID", ctx, id).Return(existing, nil)
    mockMonthlyRepo.On("GetByEmployeeYearMonth", ctx, existing.EmployeeID, existing.BookingDate.Year(), int(existing.BookingDate.Month())).Return(nil, nil)
    mockBookingRepo.On("Delete", ctx, id).Return(nil)
    mockRecalcSvc.On("TriggerRecalc", ctx, existing.EmployeeID, existing.BookingDate).Return(nil)

    err := svc.Delete(ctx, id)
    require.NoError(t, err)
    mockRecalcSvc.AssertExpectations(t)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Create validates time (0-1439)
- [ ] Create triggers recalculation
- [ ] Update modifies edited_time, not original_time
- [ ] Delete triggers recalculation
- [ ] All operations check if month is closed
- [ ] GetDayView returns complete day information
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
