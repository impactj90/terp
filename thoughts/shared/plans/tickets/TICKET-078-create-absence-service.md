# TICKET-078: Create Absence Service

**Type**: Service
**Effort**: M
**Sprint**: 19 - Absence Days
**Dependencies**: TICKET-077, TICKET-071

## Description

Create the Absence service with range creation and recalc triggering.

## Files to Create

- `apps/api/internal/service/absence.go`

## Implementation

```go
package service

import (
    "context"
    "errors"
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

var (
    ErrAbsenceNotFound     = errors.New("absence not found")
    ErrAbsenceExists       = errors.New("absence already exists for date")
    ErrInvalidDateRange    = errors.New("invalid date range")
    ErrAbsenceTypeNotFound = errors.New("absence type not found")
)

type CreateAbsenceRangeInput struct {
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    AbsenceTypeID uuid.UUID
    From          time.Time
    To            time.Time
    Duration      float64 // Per day: 1.0 or 0.5
    Notes         string
}

type AbsenceService interface {
    CreateRange(ctx context.Context, input CreateAbsenceRangeInput) ([]model.AbsenceDay, error)
    GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error)
    Delete(ctx context.Context, id uuid.UUID) error
    DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error
    ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error)
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
}

type absenceService struct {
    repo          repository.AbsenceRepository
    typeRepo      repository.AbsenceTypeRepository
    recalcService RecalcService
    holidayRepo   repository.HolidayRepository
    empDayPlanRepo repository.EmployeeDayPlanRepository
}

func (s *absenceService) CreateRange(ctx context.Context, input CreateAbsenceRangeInput) ([]model.AbsenceDay, error) {
    if input.To.Before(input.From) {
        return nil, ErrInvalidDateRange
    }

    // Validate absence type
    absenceType, err := s.typeRepo.GetByID(ctx, input.AbsenceTypeID)
    if err != nil {
        return nil, ErrAbsenceTypeNotFound
    }

    duration := decimal.NewFromFloat(input.Duration)
    if input.Duration <= 0 {
        duration = decimal.NewFromFloat(1.0)
    }

    var absences []model.AbsenceDay
    for date := input.From; !date.After(input.To); date = date.AddDate(0, 0, 1) {
        // Skip weekends and holidays (optional - depends on business rules)
        if s.shouldSkipDate(ctx, input.TenantID, input.EmployeeID, date) {
            continue
        }

        // Check if absence already exists
        existing, _ := s.repo.GetByEmployeeDate(ctx, input.EmployeeID, date)
        if existing != nil {
            continue // Skip or return error based on business rules
        }

        absence := model.AbsenceDay{
            TenantID:      input.TenantID,
            EmployeeID:    input.EmployeeID,
            AbsenceDate:   date,
            AbsenceTypeID: input.AbsenceTypeID,
            Duration:      duration,
            Status:        model.AbsenceStatusApproved,
            Notes:         input.Notes,
        }
        absences = append(absences, absence)
    }

    if len(absences) == 0 {
        return absences, nil
    }

    // Bulk create
    if err := s.repo.CreateRange(ctx, absences); err != nil {
        return nil, err
    }

    // Trigger recalculation for affected range
    go func() {
        ctx := context.Background() // New context for async operation
        s.recalcService.TriggerRecalcRange(ctx, input.EmployeeID, input.From, input.To)
    }()

    return absences, nil
}

func (s *absenceService) shouldSkipDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) bool {
    // Check if it's a non-work day
    empDayPlan, _ := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
    if empDayPlan == nil || empDayPlan.DayPlanID == nil {
        return true // Off day
    }

    // Check if it's a holiday
    holiday, _ := s.holidayRepo.GetByDate(ctx, tenantID, date)
    if holiday != nil {
        return true
    }

    return false
}

func (s *absenceService) Delete(ctx context.Context, id uuid.UUID) error {
    absence, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return ErrAbsenceNotFound
    }

    if err := s.repo.Delete(ctx, id); err != nil {
        return err
    }

    // Trigger recalculation
    go func() {
        ctx := context.Background()
        s.recalcService.TriggerRecalc(ctx, absence.EmployeeID, absence.AbsenceDate)
    }()

    return nil
}

func (s *absenceService) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
    if err := s.repo.DeleteRange(ctx, employeeID, from, to); err != nil {
        return err
    }

    // Trigger recalculation
    go func() {
        ctx := context.Background()
        s.recalcService.TriggerRecalcRange(ctx, employeeID, from, to)
    }()

    return nil
}
```

## Unit Tests

**File**: `apps/api/internal/service/absence_test.go`

```go
package service

import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
)

// MockAbsenceRepository for testing
type MockAbsenceRepository struct {
    mock.Mock
}

func (m *MockAbsenceRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.AbsenceDay), args.Error(1)
}

func (m *MockAbsenceRepository) CreateRange(ctx context.Context, absences []model.AbsenceDay) error {
    args := m.Called(ctx, absences)
    return args.Error(0)
}

func (m *MockAbsenceRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
    args := m.Called(ctx, employeeID, from, to)
    return args.Error(0)
}

// MockAbsenceTypeRepository for testing
type MockAbsenceTypeRepository struct {
    mock.Mock
}

func (m *MockAbsenceTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.AbsenceType), args.Error(1)
}

func TestAbsenceService_CreateRange_Success(t *testing.T) {
    mockAbsenceRepo := new(MockAbsenceRepository)
    mockTypeRepo := new(MockAbsenceTypeRepository)
    mockRecalcSvc := new(MockRecalcService)

    svc := &absenceService{
        repo:          mockAbsenceRepo,
        typeRepo:      mockTypeRepo,
        recalcService: mockRecalcSvc,
    }
    ctx := context.Background()

    absenceType := &model.AbsenceType{ID: uuid.New(), Code: "U"}
    input := CreateAbsenceRangeInput{
        TenantID:      uuid.New(),
        EmployeeID:    uuid.New(),
        AbsenceTypeID: absenceType.ID,
        From:          time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        To:            time.Date(2024, 1, 3, 0, 0, 0, 0, time.UTC),
        Duration:      1.0,
    }

    mockTypeRepo.On("GetByID", ctx, input.AbsenceTypeID).Return(absenceType, nil)
    mockAbsenceRepo.On("GetByEmployeeDate", ctx, input.EmployeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)
    mockAbsenceRepo.On("CreateRange", ctx, mock.AnythingOfType("[]model.AbsenceDay")).Return(nil)

    absences, err := svc.CreateRange(ctx, input)
    require.NoError(t, err)
    assert.Greater(t, len(absences), 0)
}

func TestAbsenceService_CreateRange_InvalidDateRange(t *testing.T) {
    svc := &absenceService{}
    ctx := context.Background()

    input := CreateAbsenceRangeInput{
        From: time.Date(2024, 1, 5, 0, 0, 0, 0, time.UTC),
        To:   time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC), // To before From
    }

    _, err := svc.CreateRange(ctx, input)
    assert.Equal(t, ErrInvalidDateRange, err)
}

func TestAbsenceService_CreateRange_TypeNotFound(t *testing.T) {
    mockAbsenceRepo := new(MockAbsenceRepository)
    mockTypeRepo := new(MockAbsenceTypeRepository)

    svc := &absenceService{
        repo:     mockAbsenceRepo,
        typeRepo: mockTypeRepo,
    }
    ctx := context.Background()

    input := CreateAbsenceRangeInput{
        AbsenceTypeID: uuid.New(),
        From:          time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        To:            time.Date(2024, 1, 3, 0, 0, 0, 0, time.UTC),
    }

    mockTypeRepo.On("GetByID", ctx, input.AbsenceTypeID).Return(nil, ErrAbsenceTypeNotFound)

    _, err := svc.CreateRange(ctx, input)
    assert.Equal(t, ErrAbsenceTypeNotFound, err)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] CreateRange creates absences for each day in range
- [ ] Skips weekends/holidays/off-days if configured
- [ ] Triggers recalculation after create/delete
- [ ] Validates absence type exists
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
