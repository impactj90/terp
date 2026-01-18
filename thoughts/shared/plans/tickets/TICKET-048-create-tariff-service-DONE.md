# TICKET-048: Create Tariff Service

**Type**: Service
**Effort**: M
**Sprint**: 8 - Tariffs
**Dependencies**: TICKET-047

## Description

Create the Tariff service with schedule application logic.

## Files to Create

- `apps/api/internal/service/tariff.go`

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
    ErrTariffNotFound       = errors.New("tariff not found")
    ErrOverlappingTariff    = errors.New("tariff overlaps with existing tariff")
    ErrInvalidTariffConfig  = errors.New("invalid tariff configuration")
    ErrMissingWeekPlan      = errors.New("week plan required for week tariff type")
    ErrMissingRhythmConfig  = errors.New("rhythm_days and day_plans required for rhythm tariff type")
)

type CreateTariffInput struct {
    TenantID    uuid.UUID
    EmployeeID  uuid.UUID
    ValidFrom   time.Time
    ValidTo     *time.Time
    TariffType  model.TariffType
    WeekPlanID  *uuid.UUID
    RhythmDays  *int
    DayPlans    []TariffDayPlanInput // For rhythm type
}

type TariffDayPlanInput struct {
    DayIndex  int
    DayPlanID *uuid.UUID
}

type TariffService interface {
    Create(ctx context.Context, input CreateTariffInput) (*model.Tariff, error)
    GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
    GetCurrentForEmployee(ctx context.Context, employeeID uuid.UUID) (*model.Tariff, error)
    Update(ctx context.Context, tariff *model.Tariff) error
    Delete(ctx context.Context, id uuid.UUID) error
    ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.Tariff, error)

    // Schedule resolution
    GetDayPlanForDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DayPlan, error)
    ApplyTariffToRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error
}

type tariffService struct {
    repo        repository.TariffRepository
    empDayRepo  repository.EmployeeDayPlanRepository
    weekPlanRepo repository.WeekPlanRepository
    dayPlanRepo repository.DayPlanRepository
}

func (s *tariffService) Create(ctx context.Context, input CreateTariffInput) (*model.Tariff, error) {
    // Validate based on tariff type
    switch input.TariffType {
    case model.TariffTypeWeek:
        if input.WeekPlanID == nil {
            return nil, ErrMissingWeekPlan
        }
    case model.TariffTypeRhythm:
        if input.RhythmDays == nil || len(input.DayPlans) == 0 {
            return nil, ErrMissingRhythmConfig
        }
        if len(input.DayPlans) != *input.RhythmDays {
            return nil, ErrInvalidTariffConfig
        }
    }

    // TODO: Check for overlapping tariffs

    tariff := &model.Tariff{
        TenantID:   input.TenantID,
        EmployeeID: input.EmployeeID,
        ValidFrom:  input.ValidFrom,
        ValidTo:    input.ValidTo,
        TariffType: input.TariffType,
        WeekPlanID: input.WeekPlanID,
        RhythmDays: input.RhythmDays,
        IsCurrent:  true, // Will be set properly below
    }

    // Create tariff
    if err := s.repo.Create(ctx, tariff); err != nil {
        return nil, err
    }

    // Add day plans for rhythm type
    if input.TariffType == model.TariffTypeRhythm {
        dayPlans := make([]model.TariffDayPlan, len(input.DayPlans))
        for i, dp := range input.DayPlans {
            dayPlans[i] = model.TariffDayPlan{
                TariffID:  tariff.ID,
                DayIndex:  dp.DayIndex,
                DayPlanID: dp.DayPlanID,
            }
        }
        if err := s.repo.SetDayPlans(ctx, tariff.ID, dayPlans); err != nil {
            return nil, err
        }
    }

    // Update current flag on other tariffs
    // ...

    return tariff, nil
}

// GetDayPlanForDate resolves which day plan applies for an employee on a date
func (s *tariffService) GetDayPlanForDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DayPlan, error) {
    tariff, err := s.repo.GetForEmployeeOnDate(ctx, employeeID, date)
    if err != nil {
        return nil, err
    }

    var dayPlanID *uuid.UUID

    switch tariff.TariffType {
    case model.TariffTypeWeek:
        // Get day plan from week plan based on weekday
        weekPlan, err := s.weekPlanRepo.GetByID(ctx, *tariff.WeekPlanID)
        if err != nil {
            return nil, err
        }
        dayPlanID = weekPlan.GetPlanForWeekday(date.Weekday())

    case model.TariffTypeRhythm:
        // Calculate day index based on days since valid_from
        daysSince := int(date.Sub(tariff.ValidFrom).Hours() / 24)
        dayIndex := daysSince % *tariff.RhythmDays
        for _, dp := range tariff.DayPlans {
            if dp.DayIndex == dayIndex {
                dayPlanID = dp.DayPlanID
                break
            }
        }
    }

    if dayPlanID == nil {
        return nil, nil // Off day
    }

    return s.dayPlanRepo.GetWithDetails(ctx, *dayPlanID)
}

// ApplyTariffToRange generates employee_day_plans for a date range
func (s *tariffService) ApplyTariffToRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
    // For each day in range:
    // 1. Resolve day plan from tariff
    // 2. Create/update employee_day_plan record
    for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
        dayPlan, err := s.GetDayPlanForDate(ctx, employeeID, date)
        if err != nil && err != ErrTariffNotFound {
            return err
        }

        var dayPlanID *uuid.UUID
        if dayPlan != nil {
            dayPlanID = &dayPlan.ID
        }

        empDayPlan := &model.EmployeeDayPlan{
            EmployeeID: employeeID,
            PlanDate:   date,
            DayPlanID:  dayPlanID,
            Source:     "tariff",
        }
        // Upsert
        if err := s.empDayRepo.Upsert(ctx, empDayPlan); err != nil {
            return err
        }
    }
    return nil
}
```

## Unit Tests

**File**: `apps/api/internal/service/tariff_test.go`

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

// MockTariffRepository is a mock implementation
type MockTariffRepository struct {
    mock.Mock
}

func (m *MockTariffRepository) Create(ctx context.Context, tariff *model.Tariff) error {
    args := m.Called(ctx, tariff)
    tariff.ID = uuid.New()
    return args.Error(0)
}

func (m *MockTariffRepository) SetDayPlans(ctx context.Context, tariffID uuid.UUID, dayPlans []model.TariffDayPlan) error {
    args := m.Called(ctx, tariffID, dayPlans)
    return args.Error(0)
}

func (m *MockTariffRepository) GetForEmployeeOnDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.Tariff, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Tariff), args.Error(1)
}

func TestTariffService_Create_WeekTariff_Success(t *testing.T) {
    mockRepo := new(MockTariffRepository)
    svc := &tariffService{repo: mockRepo}
    ctx := context.Background()

    weekPlanID := uuid.New()
    input := CreateTariffInput{
        TenantID:   uuid.New(),
        EmployeeID: uuid.New(),
        ValidFrom:  time.Now(),
        TariffType: model.TariffTypeWeek,
        WeekPlanID: &weekPlanID,
    }

    mockRepo.On("Create", ctx, mock.AnythingOfType("*model.Tariff")).Return(nil)

    tariff, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, model.TariffTypeWeek, tariff.TariffType)
    assert.Equal(t, weekPlanID, *tariff.WeekPlanID)
}

func TestTariffService_Create_WeekTariff_MissingWeekPlan(t *testing.T) {
    mockRepo := new(MockTariffRepository)
    svc := &tariffService{repo: mockRepo}
    ctx := context.Background()

    input := CreateTariffInput{
        TenantID:   uuid.New(),
        EmployeeID: uuid.New(),
        ValidFrom:  time.Now(),
        TariffType: model.TariffTypeWeek,
        WeekPlanID: nil, // Missing
    }

    _, err := svc.Create(ctx, input)
    assert.Equal(t, ErrMissingWeekPlan, err)
}

func TestTariffService_Create_RhythmTariff_Success(t *testing.T) {
    mockRepo := new(MockTariffRepository)
    svc := &tariffService{repo: mockRepo}
    ctx := context.Background()

    rhythmDays := 5
    dayPlanID := uuid.New()
    input := CreateTariffInput{
        TenantID:   uuid.New(),
        EmployeeID: uuid.New(),
        ValidFrom:  time.Now(),
        TariffType: model.TariffTypeRhythm,
        RhythmDays: &rhythmDays,
        DayPlans: []TariffDayPlanInput{
            {DayIndex: 0, DayPlanID: &dayPlanID},
            {DayIndex: 1, DayPlanID: &dayPlanID},
            {DayIndex: 2, DayPlanID: &dayPlanID},
            {DayIndex: 3, DayPlanID: &dayPlanID},
            {DayIndex: 4, DayPlanID: &dayPlanID},
        },
    }

    mockRepo.On("Create", ctx, mock.AnythingOfType("*model.Tariff")).Return(nil)
    mockRepo.On("SetDayPlans", ctx, mock.AnythingOfType("uuid.UUID"), mock.AnythingOfType("[]model.TariffDayPlan")).Return(nil)

    tariff, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, model.TariffTypeRhythm, tariff.TariffType)
    assert.Equal(t, 5, *tariff.RhythmDays)
}

func TestTariffService_Create_RhythmTariff_MissingConfig(t *testing.T) {
    mockRepo := new(MockTariffRepository)
    svc := &tariffService{repo: mockRepo}
    ctx := context.Background()

    input := CreateTariffInput{
        TenantID:   uuid.New(),
        EmployeeID: uuid.New(),
        ValidFrom:  time.Now(),
        TariffType: model.TariffTypeRhythm,
        RhythmDays: nil, // Missing
        DayPlans:   []TariffDayPlanInput{},
    }

    _, err := svc.Create(ctx, input)
    assert.Equal(t, ErrMissingRhythmConfig, err)
}

func TestTariffService_Create_RhythmTariff_InvalidCount(t *testing.T) {
    mockRepo := new(MockTariffRepository)
    svc := &tariffService{repo: mockRepo}
    ctx := context.Background()

    rhythmDays := 5
    dayPlanID := uuid.New()
    input := CreateTariffInput{
        TenantID:   uuid.New(),
        EmployeeID: uuid.New(),
        ValidFrom:  time.Now(),
        TariffType: model.TariffTypeRhythm,
        RhythmDays: &rhythmDays,
        DayPlans: []TariffDayPlanInput{
            {DayIndex: 0, DayPlanID: &dayPlanID},
            {DayIndex: 1, DayPlanID: &dayPlanID},
            // Only 2 day plans, but rhythm_days is 5
        },
    }

    _, err := svc.Create(ctx, input)
    assert.Equal(t, ErrInvalidTariffConfig, err)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Validates tariff type has required config
- [ ] GetDayPlanForDate resolves week plan by weekday
- [ ] GetDayPlanForDate resolves rhythm plan by day index
- [ ] ApplyTariffToRange generates employee_day_plans
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
