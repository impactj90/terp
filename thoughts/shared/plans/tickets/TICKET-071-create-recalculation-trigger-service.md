# TICKET-071: Create Recalculation Trigger Service

**Type**: Service
**Effort**: M
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-070

## Description

Create service to trigger recalculation when bookings or absences change.

## Files to Create

- `apps/api/internal/service/recalc.go`

## Implementation

```go
package service

import (
    "context"
    "time"

    "github.com/google/uuid"
)

type RecalcService interface {
    // Trigger recalculation for a specific date
    TriggerRecalc(ctx context.Context, employeeID uuid.UUID, date time.Time) error

    // Trigger recalculation for a date range
    TriggerRecalcRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error

    // Trigger recalculation for multiple employees on a date
    TriggerRecalcBatch(ctx context.Context, employeeIDs []uuid.UUID, date time.Time) error

    // Trigger recalculation for all employees on a date (e.g., after holiday change)
    TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, date time.Time) error
}

type recalcService struct {
    dailyCalcService DailyCalcService
    employeeRepo     repository.EmployeeRepository
}

func NewRecalcService(dailyCalcService DailyCalcService, employeeRepo repository.EmployeeRepository) RecalcService {
    return &recalcService{
        dailyCalcService: dailyCalcService,
        employeeRepo:     employeeRepo,
    }
}

func (s *recalcService) TriggerRecalc(ctx context.Context, employeeID uuid.UUID, date time.Time) error {
    _, err := s.dailyCalcService.CalculateDay(ctx, employeeID, date)
    return err
}

func (s *recalcService) TriggerRecalcRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
    return s.dailyCalcService.RecalculateRange(ctx, employeeID, from, to)
}

func (s *recalcService) TriggerRecalcBatch(ctx context.Context, employeeIDs []uuid.UUID, date time.Time) error {
    for _, empID := range employeeIDs {
        if err := s.TriggerRecalc(ctx, empID, date); err != nil {
            // Log error but continue with others
            // Consider using error aggregation
            continue
        }
    }
    return nil
}

func (s *recalcService) TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, date time.Time) error {
    // Get all active employees
    filter := repository.EmployeeFilter{
        TenantID: tenantID,
        IsActive: boolPtr(true),
    }
    employees, _, err := s.employeeRepo.List(ctx, filter)
    if err != nil {
        return err
    }

    var employeeIDs []uuid.UUID
    for _, emp := range employees {
        employeeIDs = append(employeeIDs, emp.ID)
    }

    return s.TriggerRecalcBatch(ctx, employeeIDs, date)
}

func boolPtr(b bool) *bool {
    return &b
}
```

## Usage in Other Services

When booking/absence changes, trigger recalc:

```go
// In booking service
func (s *bookingService) Create(ctx context.Context, booking *model.Booking) error {
    if err := s.repo.Create(ctx, booking); err != nil {
        return err
    }
    // Trigger recalculation
    return s.recalcService.TriggerRecalc(ctx, booking.EmployeeID, booking.BookingDate)
}

func (s *bookingService) Update(ctx context.Context, booking *model.Booking) error {
    if err := s.repo.Update(ctx, booking); err != nil {
        return err
    }
    return s.recalcService.TriggerRecalc(ctx, booking.EmployeeID, booking.BookingDate)
}

func (s *bookingService) Delete(ctx context.Context, bookingID uuid.UUID) error {
    booking, err := s.repo.GetByID(ctx, bookingID)
    if err != nil {
        return err
    }
    if err := s.repo.Delete(ctx, bookingID); err != nil {
        return err
    }
    return s.recalcService.TriggerRecalc(ctx, booking.EmployeeID, booking.BookingDate)
}

// In absence service
func (s *absenceService) CreateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time, typeID uuid.UUID) error {
    // Create absence days...
    // Trigger recalculation for affected range
    return s.recalcService.TriggerRecalcRange(ctx, employeeID, from, to)
}
```

## Unit Tests

**File**: `apps/api/internal/service/recalc_test.go`

```go
package service

import (
    "context"
    "errors"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

// MockDailyCalcService for testing
type MockDailyCalcService struct {
    mock.Mock
}

func (m *MockDailyCalcService) CalculateDay(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DailyValue), args.Error(1)
}

func (m *MockDailyCalcService) RecalculateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
    args := m.Called(ctx, employeeID, from, to)
    return args.Error(0)
}

func TestRecalcService_TriggerRecalc_Success(t *testing.T) {
    mockCalcSvc := new(MockDailyCalcService)
    mockEmpRepo := new(MockEmployeeRepository)
    svc := NewRecalcService(mockCalcSvc, mockEmpRepo)
    ctx := context.Background()

    employeeID := uuid.New()
    date := time.Now()
    mockCalcSvc.On("CalculateDay", ctx, employeeID, date).Return(&model.DailyValue{}, nil)

    err := svc.TriggerRecalc(ctx, employeeID, date)
    require.NoError(t, err)
    mockCalcSvc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcRange_Success(t *testing.T) {
    mockCalcSvc := new(MockDailyCalcService)
    mockEmpRepo := new(MockEmployeeRepository)
    svc := NewRecalcService(mockCalcSvc, mockEmpRepo)
    ctx := context.Background()

    employeeID := uuid.New()
    from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
    to := time.Date(2024, 1, 5, 0, 0, 0, 0, time.UTC)

    mockCalcSvc.On("RecalculateRange", ctx, employeeID, from, to).Return(nil)

    err := svc.TriggerRecalcRange(ctx, employeeID, from, to)
    require.NoError(t, err)
    mockCalcSvc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcBatch_HandlesErrors(t *testing.T) {
    mockCalcSvc := new(MockDailyCalcService)
    mockEmpRepo := new(MockEmployeeRepository)
    svc := NewRecalcService(mockCalcSvc, mockEmpRepo)
    ctx := context.Background()

    emp1 := uuid.New()
    emp2 := uuid.New()
    emp3 := uuid.New()
    date := time.Now()

    // First employee succeeds, second fails, third succeeds
    mockCalcSvc.On("CalculateDay", ctx, emp1, date).Return(&model.DailyValue{}, nil)
    mockCalcSvc.On("CalculateDay", ctx, emp2, date).Return(nil, errors.New("calculation error"))
    mockCalcSvc.On("CalculateDay", ctx, emp3, date).Return(&model.DailyValue{}, nil)

    err := svc.TriggerRecalcBatch(ctx, []uuid.UUID{emp1, emp2, emp3}, date)

    // Should not error - continues despite individual failures
    require.NoError(t, err)
    mockCalcSvc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcAll_ProcessesAllEmployees(t *testing.T) {
    mockCalcSvc := new(MockDailyCalcService)
    mockEmpRepo := new(MockEmployeeRepository)
    svc := NewRecalcService(mockCalcSvc, mockEmpRepo)
    ctx := context.Background()

    tenantID := uuid.New()
    date := time.Now()
    employees := []model.Employee{
        {ID: uuid.New()},
        {ID: uuid.New()},
        {ID: uuid.New()},
    }

    filter := repository.EmployeeFilter{
        TenantID: tenantID,
        IsActive: boolPtr(true),
    }
    mockEmpRepo.On("List", ctx, filter).Return(employees, int64(3), nil)

    for _, emp := range employees {
        mockCalcSvc.On("CalculateDay", ctx, emp.ID, date).Return(&model.DailyValue{}, nil)
    }

    err := svc.TriggerRecalcAll(ctx, tenantID, date)
    require.NoError(t, err)
    mockEmpRepo.AssertExpectations(t)
    mockCalcSvc.AssertExpectations(t)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] TriggerRecalc recalculates single day
- [ ] TriggerRecalcRange recalculates date range
- [ ] TriggerRecalcBatch handles multiple employees
- [ ] TriggerRecalcAll processes all active employees
- [ ] Errors are handled gracefully (don't stop batch)
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
