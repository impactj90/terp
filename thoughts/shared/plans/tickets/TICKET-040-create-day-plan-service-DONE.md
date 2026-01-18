# TICKET-040: Create Day Plan Service

**Type**: Service
**Effort**: M
**Sprint**: 6 - Day Plans
**Dependencies**: TICKET-039

## Description

Create the DayPlan service with validation and copy functionality.

## Files to Create

- `apps/api/internal/service/dayplan.go`

## Implementation

```go
package service

import (
    "context"
    "errors"

    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

var (
    ErrDayPlanNotFound    = errors.New("day plan not found")
    ErrDayPlanCodeExists  = errors.New("day plan code already exists")
    ErrInvalidTimeRange   = errors.New("invalid time range")
    ErrBreaksOverlap      = errors.New("breaks cannot overlap")
    ErrInvalidBreakConfig = errors.New("invalid break configuration")
)

type CreateDayPlanInput struct {
    TenantID     uuid.UUID
    Code         string
    Name         string
    Description  string
    PlanType     model.PlanType
    ComeFrom     *int
    ComeTo       *int
    GoFrom       *int
    GoTo         *int
    CoreStart    *int
    CoreEnd      *int
    RegularHours int
    // ... other fields
}

type DayPlanService interface {
    Create(ctx context.Context, input CreateDayPlanInput) (*model.DayPlan, error)
    GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
    GetDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
    Update(ctx context.Context, plan *model.DayPlan) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error)
    Copy(ctx context.Context, id uuid.UUID, newCode, newName string) (*model.DayPlan, error)

    // Break management
    AddBreak(ctx context.Context, planID uuid.UUID, b *model.DayPlanBreak) error
    UpdateBreak(ctx context.Context, b *model.DayPlanBreak) error
    DeleteBreak(ctx context.Context, breakID uuid.UUID) error

    // Bonus management
    AddBonus(ctx context.Context, planID uuid.UUID, b *model.DayPlanBonus) error
    UpdateBonus(ctx context.Context, b *model.DayPlanBonus) error
    DeleteBonus(ctx context.Context, bonusID uuid.UUID) error
}

type dayPlanService struct {
    repo repository.DayPlanRepository
}

func NewDayPlanService(repo repository.DayPlanRepository) DayPlanService {
    return &dayPlanService{repo: repo}
}

func (s *dayPlanService) Create(ctx context.Context, input CreateDayPlanInput) (*model.DayPlan, error) {
    // Check code uniqueness
    existing, _ := s.repo.GetByCode(ctx, input.TenantID, input.Code)
    if existing != nil {
        return nil, ErrDayPlanCodeExists
    }

    // Validate time ranges
    if err := s.validateTimeRanges(input); err != nil {
        return nil, err
    }

    plan := &model.DayPlan{
        TenantID:     input.TenantID,
        Code:         input.Code,
        Name:         input.Name,
        Description:  input.Description,
        PlanType:     input.PlanType,
        ComeFrom:     input.ComeFrom,
        ComeTo:       input.ComeTo,
        GoFrom:       input.GoFrom,
        GoTo:         input.GoTo,
        CoreStart:    input.CoreStart,
        CoreEnd:      input.CoreEnd,
        RegularHours: input.RegularHours,
        IsActive:     true,
    }

    if err := s.repo.Create(ctx, plan); err != nil {
        return nil, err
    }

    return plan, nil
}

func (s *dayPlanService) validateTimeRanges(input CreateDayPlanInput) error {
    // Validate come_from < come_to if both set
    if input.ComeFrom != nil && input.ComeTo != nil {
        if *input.ComeFrom >= *input.ComeTo {
            return ErrInvalidTimeRange
        }
    }
    // Validate go_from < go_to if both set
    if input.GoFrom != nil && input.GoTo != nil {
        if *input.GoFrom >= *input.GoTo {
            return ErrInvalidTimeRange
        }
    }
    // Validate core times within come/go range
    // ... additional validation
    return nil
}

func (s *dayPlanService) Copy(ctx context.Context, id uuid.UUID, newCode, newName string) (*model.DayPlan, error) {
    // Get original with details
    original, err := s.repo.GetWithDetails(ctx, id)
    if err != nil {
        return nil, ErrDayPlanNotFound
    }

    // Check new code uniqueness
    existing, _ := s.repo.GetByCode(ctx, original.TenantID, newCode)
    if existing != nil {
        return nil, ErrDayPlanCodeExists
    }

    // Create copy
    newPlan := *original
    newPlan.ID = uuid.New()
    newPlan.Code = newCode
    newPlan.Name = newName
    newPlan.Breaks = nil
    newPlan.Bonuses = nil

    if err := s.repo.Create(ctx, &newPlan); err != nil {
        return nil, err
    }

    // Copy breaks
    for _, b := range original.Breaks {
        newBreak := b
        newBreak.ID = uuid.New()
        newBreak.DayPlanID = newPlan.ID
        if err := s.repo.AddBreak(ctx, &newBreak); err != nil {
            return nil, err
        }
    }

    // Copy bonuses
    for _, b := range original.Bonuses {
        newBonus := b
        newBonus.ID = uuid.New()
        newBonus.DayPlanID = newPlan.ID
        if err := s.repo.AddBonus(ctx, &newBonus); err != nil {
            return nil, err
        }
    }

    return s.repo.GetWithDetails(ctx, newPlan.ID)
}

func (s *dayPlanService) AddBreak(ctx context.Context, planID uuid.UUID, b *model.DayPlanBreak) error {
    // Validate break config
    if err := s.validateBreak(b); err != nil {
        return err
    }

    // TODO: Check for overlapping fixed breaks

    b.DayPlanID = planID
    return s.repo.AddBreak(ctx, b)
}

func (s *dayPlanService) validateBreak(b *model.DayPlanBreak) error {
    switch b.BreakType {
    case model.BreakTypeFixed:
        if b.StartTime == nil || b.EndTime == nil {
            return ErrInvalidBreakConfig
        }
        if *b.StartTime >= *b.EndTime {
            return ErrInvalidTimeRange
        }
    case model.BreakTypeMinimum:
        if b.AfterWorkMinutes == nil {
            return ErrInvalidBreakConfig
        }
    }
    return nil
}

// Implement remaining methods...
```

## Unit Tests

**File**: `apps/api/internal/service/dayplan_test.go`

```go
package service

import (
    "context"
    "testing"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
)

// MockDayPlanRepository is a mock implementation
type MockDayPlanRepository struct {
    mock.Mock
}

func (m *MockDayPlanRepository) Create(ctx context.Context, plan *model.DayPlan) error {
    args := m.Called(ctx, plan)
    plan.ID = uuid.New()
    return args.Error(0)
}

func (m *MockDayPlanRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.DayPlan, error) {
    args := m.Called(ctx, tenantID, code)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DayPlan), args.Error(1)
}

func (m *MockDayPlanRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DayPlan), args.Error(1)
}

func (m *MockDayPlanRepository) AddBreak(ctx context.Context, b *model.DayPlanBreak) error {
    args := m.Called(ctx, b)
    return args.Error(0)
}

func (m *MockDayPlanRepository) AddBonus(ctx context.Context, b *model.DayPlanBonus) error {
    args := m.Called(ctx, b)
    return args.Error(0)
}

func TestDayPlanService_Create_Success(t *testing.T) {
    mockRepo := new(MockDayPlanRepository)
    svc := NewDayPlanService(mockRepo)
    ctx := context.Background()

    tenantID := uuid.New()
    comeFrom := 480  // 08:00
    comeTo := 540    // 09:00
    goFrom := 1020   // 17:00
    goTo := 1080     // 18:00

    input := CreateDayPlanInput{
        TenantID:     tenantID,
        Code:         "FT01",
        Name:         "Flextime Standard",
        PlanType:     model.PlanTypeFlextime,
        ComeFrom:     &comeFrom,
        ComeTo:       &comeTo,
        GoFrom:       &goFrom,
        GoTo:         &goTo,
        RegularHours: 480, // 8 hours
    }

    mockRepo.On("GetByCode", ctx, tenantID, "FT01").Return(nil, ErrDayPlanNotFound)
    mockRepo.On("Create", ctx, mock.AnythingOfType("*model.DayPlan")).Return(nil)

    plan, err := svc.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, "FT01", plan.Code)
    assert.Equal(t, "Flextime Standard", plan.Name)
    assert.True(t, plan.IsActive)
}

func TestDayPlanService_Create_CodeExists(t *testing.T) {
    mockRepo := new(MockDayPlanRepository)
    svc := NewDayPlanService(mockRepo)
    ctx := context.Background()

    tenantID := uuid.New()
    existing := &model.DayPlan{ID: uuid.New(), Code: "FT01"}
    mockRepo.On("GetByCode", ctx, tenantID, "FT01").Return(existing, nil)

    input := CreateDayPlanInput{
        TenantID: tenantID,
        Code:     "FT01",
        Name:     "Flextime Standard",
        PlanType: model.PlanTypeFlextime,
    }

    _, err := svc.Create(ctx, input)
    assert.Equal(t, ErrDayPlanCodeExists, err)
}

func TestDayPlanService_Create_InvalidTimeRange(t *testing.T) {
    mockRepo := new(MockDayPlanRepository)
    svc := NewDayPlanService(mockRepo)
    ctx := context.Background()

    tenantID := uuid.New()
    comeFrom := 540  // 09:00
    comeTo := 480    // 08:00 (before comeFrom - invalid)

    input := CreateDayPlanInput{
        TenantID: tenantID,
        Code:     "FT01",
        Name:     "Flextime Standard",
        PlanType: model.PlanTypeFlextime,
        ComeFrom: &comeFrom,
        ComeTo:   &comeTo,
    }

    mockRepo.On("GetByCode", ctx, tenantID, "FT01").Return(nil, ErrDayPlanNotFound)

    _, err := svc.Create(ctx, input)
    assert.Equal(t, ErrInvalidTimeRange, err)
}

func TestDayPlanService_Copy_Success(t *testing.T) {
    mockRepo := new(MockDayPlanRepository)
    svc := NewDayPlanService(mockRepo)
    ctx := context.Background()

    originalID := uuid.New()
    tenantID := uuid.New()
    original := &model.DayPlan{
        ID:       originalID,
        TenantID: tenantID,
        Code:     "FT01",
        Name:     "Original",
        Breaks: []model.DayPlanBreak{
            {ID: uuid.New(), DayPlanID: originalID, BreakType: model.BreakTypeFixed},
        },
        Bonuses: []model.DayPlanBonus{
            {ID: uuid.New(), DayPlanID: originalID},
        },
    }

    mockRepo.On("GetWithDetails", ctx, originalID).Return(original, nil)
    mockRepo.On("GetByCode", ctx, tenantID, "FT02").Return(nil, ErrDayPlanNotFound)
    mockRepo.On("Create", ctx, mock.AnythingOfType("*model.DayPlan")).Return(nil)
    mockRepo.On("AddBreak", ctx, mock.AnythingOfType("*model.DayPlanBreak")).Return(nil)
    mockRepo.On("AddBonus", ctx, mock.AnythingOfType("*model.DayPlanBonus")).Return(nil)
    mockRepo.On("GetWithDetails", ctx, mock.AnythingOfType("uuid.UUID")).Return(&model.DayPlan{Code: "FT02", Name: "Copy"}, nil)

    newPlan, err := svc.Copy(ctx, originalID, "FT02", "Copy")
    require.NoError(t, err)
    assert.Equal(t, "FT02", newPlan.Code)
    assert.Equal(t, "Copy", newPlan.Name)
}

func TestDayPlanService_AddBreak_InvalidConfig(t *testing.T) {
    mockRepo := new(MockDayPlanRepository)
    svc := NewDayPlanService(mockRepo)
    ctx := context.Background()

    planID := uuid.New()
    // Fixed break without times
    b := &model.DayPlanBreak{
        BreakType: model.BreakTypeFixed,
        StartTime: nil,
        EndTime:   nil,
    }

    err := svc.AddBreak(ctx, planID, b)
    assert.Equal(t, ErrInvalidBreakConfig, err)
}

func TestDayPlanService_AddBreak_FixedBreakSuccess(t *testing.T) {
    mockRepo := new(MockDayPlanRepository)
    svc := NewDayPlanService(mockRepo)
    ctx := context.Background()

    planID := uuid.New()
    startTime := 720  // 12:00
    endTime := 750    // 12:30
    b := &model.DayPlanBreak{
        BreakType: model.BreakTypeFixed,
        StartTime: &startTime,
        EndTime:   &endTime,
    }

    mockRepo.On("AddBreak", ctx, mock.AnythingOfType("*model.DayPlanBreak")).Return(nil)

    err := svc.AddBreak(ctx, planID, b)
    require.NoError(t, err)
    assert.Equal(t, planID, b.DayPlanID)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Validates unique code per tenant
- [ ] Validates time ranges (from < to)
- [ ] Copy duplicates plan with breaks and bonuses
- [ ] Break validation based on type
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
