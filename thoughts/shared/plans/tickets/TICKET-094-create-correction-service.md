# TICKET-094: Create Correction Service

**Type**: Service
**Effort**: S
**Sprint**: 23 - Corrections
**Dependencies**: TICKET-093, TICKET-070

## Description

Create the correction service with validation and recalculation triggers.

## Files to Create

- `apps/api/internal/service/correction.go`

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
    ErrCorrectionNotFound      = errors.New("correction not found")
    ErrCorrectionAlreadyApproved = errors.New("correction already approved")
    ErrCannotApproveOwn        = errors.New("cannot approve own correction")
)

type CorrectionService interface {
    Create(ctx context.Context, correction *model.Correction) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error)
    Update(ctx context.Context, correction *model.Correction) error
    Delete(ctx context.Context, id uuid.UUID) error
    ListByEmployee(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.Correction, error)
    Approve(ctx context.Context, id uuid.UUID, approvedBy uuid.UUID) error
}

type correctionService struct {
    correctionRepo repository.CorrectionRepository
    dailyCalcSvc   DailyCalcService
}

func NewCorrectionService(
    correctionRepo repository.CorrectionRepository,
    dailyCalcSvc DailyCalcService,
) CorrectionService {
    return &correctionService{
        correctionRepo: correctionRepo,
        dailyCalcSvc:   dailyCalcSvc,
    }
}

func (s *correctionService) Create(ctx context.Context, correction *model.Correction) error {
    if err := s.validateCorrection(correction); err != nil {
        return err
    }

    if err := s.correctionRepo.Create(ctx, correction); err != nil {
        return err
    }

    // If auto-approved (admin creating), trigger recalc
    if correction.IsApproved() {
        go s.triggerRecalc(correction.EmployeeID, correction.ValueDate)
    }

    return nil
}

func (s *correctionService) GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error) {
    correction, err := s.correctionRepo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    if correction == nil {
        return nil, ErrCorrectionNotFound
    }
    return correction, nil
}

func (s *correctionService) Update(ctx context.Context, correction *model.Correction) error {
    existing, err := s.correctionRepo.GetByID(ctx, correction.ID)
    if err != nil {
        return err
    }
    if existing == nil {
        return ErrCorrectionNotFound
    }
    if existing.IsApproved() {
        return ErrCorrectionAlreadyApproved
    }

    if err := s.validateCorrection(correction); err != nil {
        return err
    }

    return s.correctionRepo.Update(ctx, correction)
}

func (s *correctionService) Delete(ctx context.Context, id uuid.UUID) error {
    existing, err := s.correctionRepo.GetByID(ctx, id)
    if err != nil {
        return err
    }
    if existing == nil {
        return ErrCorrectionNotFound
    }

    if err := s.correctionRepo.Delete(ctx, id); err != nil {
        return err
    }

    // If was approved, trigger recalc
    if existing.IsApproved() {
        go s.triggerRecalc(existing.EmployeeID, existing.ValueDate)
    }

    return nil
}

func (s *correctionService) ListByEmployee(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.Correction, error) {
    return s.correctionRepo.ListByEmployee(ctx, employeeID, from, to)
}

func (s *correctionService) Approve(ctx context.Context, id uuid.UUID, approvedBy uuid.UUID) error {
    correction, err := s.correctionRepo.GetByID(ctx, id)
    if err != nil {
        return err
    }
    if correction == nil {
        return ErrCorrectionNotFound
    }
    if correction.IsApproved() {
        return ErrCorrectionAlreadyApproved
    }
    if correction.CreatedBy == approvedBy {
        return ErrCannotApproveOwn
    }

    if err := s.correctionRepo.Approve(ctx, id, approvedBy); err != nil {
        return err
    }

    // Trigger recalc
    go s.triggerRecalc(correction.EmployeeID, correction.ValueDate)

    return nil
}

func (s *correctionService) validateCorrection(correction *model.Correction) error {
    if correction.Reason == "" {
        return errors.New("reason is required")
    }

    // Validate correction type
    validTypes := map[model.CorrectionType]bool{
        model.CorrectionTypeOvertime:  true,
        model.CorrectionTypeUndertime: true,
        model.CorrectionTypeFlextime:  true,
        model.CorrectionTypeVacation:  true,
        model.CorrectionTypeSick:      true,
    }
    if !validTypes[correction.CorrectionType] {
        return errors.New("invalid correction type")
    }

    return nil
}

func (s *correctionService) triggerRecalc(employeeID uuid.UUID, date time.Time) {
    ctx := context.Background()
    _ = s.dailyCalcSvc.RecalculateDay(ctx, employeeID, date)
}
```

## Unit Tests

**File**: `apps/api/internal/service/correction_test.go`

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

// MockCorrectionRepository for testing
type MockCorrectionRepository struct {
    mock.Mock
}

func (m *MockCorrectionRepository) Create(ctx context.Context, correction *model.Correction) error {
    args := m.Called(ctx, correction)
    correction.ID = uuid.New()
    return args.Error(0)
}

func (m *MockCorrectionRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Correction), args.Error(1)
}

func (m *MockCorrectionRepository) Approve(ctx context.Context, id uuid.UUID, approvedBy uuid.UUID) error {
    args := m.Called(ctx, id, approvedBy)
    return args.Error(0)
}

func TestCorrectionService_Create_ValidatesReason(t *testing.T) {
    mockRepo := new(MockCorrectionRepository)
    mockCalcSvc := new(MockDailyCalcService)

    svc := NewCorrectionService(mockRepo, mockCalcSvc)
    ctx := context.Background()

    correction := &model.Correction{
        EmployeeID:     uuid.New(),
        ValueDate:      time.Now(),
        CorrectionType: model.CorrectionTypeOvertime,
        Reason:         "", // Empty reason - should fail
    }

    err := svc.Create(ctx, correction)
    assert.Error(t, err)
}

func TestCorrectionService_Approve_CannotApproveOwn(t *testing.T) {
    mockRepo := new(MockCorrectionRepository)
    mockCalcSvc := new(MockDailyCalcService)

    svc := NewCorrectionService(mockRepo, mockCalcSvc)
    ctx := context.Background()

    userID := uuid.New()
    correctionID := uuid.New()
    correction := &model.Correction{
        ID:        correctionID,
        CreatedBy: userID,
    }

    mockRepo.On("GetByID", ctx, correctionID).Return(correction, nil)

    err := svc.Approve(ctx, correctionID, userID) // Same user
    assert.Equal(t, ErrCannotApproveOwn, err)
}

func TestCorrectionService_Approve_TriggersRecalc(t *testing.T) {
    mockRepo := new(MockCorrectionRepository)
    mockCalcSvc := new(MockDailyCalcService)

    svc := NewCorrectionService(mockRepo, mockCalcSvc)
    ctx := context.Background()

    userID := uuid.New()
    approverID := uuid.New()
    correctionID := uuid.New()
    correction := &model.Correction{
        ID:         correctionID,
        EmployeeID: uuid.New(),
        ValueDate:  time.Now(),
        CreatedBy:  userID,
    }

    mockRepo.On("GetByID", ctx, correctionID).Return(correction, nil)
    mockRepo.On("Approve", ctx, correctionID, approverID).Return(nil)

    err := svc.Approve(ctx, correctionID, approverID)
    require.NoError(t, err)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Create stores correction
- [ ] Cannot update approved correction
- [ ] Cannot approve own correction
- [ ] Approval triggers recalculation
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
