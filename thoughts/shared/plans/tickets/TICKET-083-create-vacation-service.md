# TICKET-083: Create Vacation Service

**Type**: Service
**Effort**: M
**Sprint**: 20 - Vacation Balance
**Dependencies**: TICKET-081, TICKET-082, TICKET-077

## Description

Create the Vacation service with balance management.

## Files to Create

- `apps/api/internal/service/vacation.go`

## Implementation

```go
package service

import (
    "context"
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"

    "terp/apps/api/internal/calculation"
    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

type VacationBalance struct {
    Year        int             `json:"year"`
    Entitlement decimal.Decimal `json:"entitlement"`
    Carryover   decimal.Decimal `json:"carryover"`
    Adjustments decimal.Decimal `json:"adjustments"`
    Taken       decimal.Decimal `json:"taken"`
    Available   decimal.Decimal `json:"available"`
    Planned     decimal.Decimal `json:"planned"` // Future approved vacation
}

type VacationService interface {
    GetBalance(ctx context.Context, employeeID uuid.UUID, year int) (*VacationBalance, error)
    InitializeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
    RecalculateTaken(ctx context.Context, employeeID uuid.UUID, year int) error
    AdjustBalance(ctx context.Context, employeeID uuid.UUID, year int, adjustment decimal.Decimal, notes string) error
    CarryoverFromPreviousYear(ctx context.Context, employeeID uuid.UUID, year int) error
}

type vacationService struct {
    balanceRepo    repository.VacationBalanceRepository
    absenceRepo    repository.AbsenceRepository
    absenceTypeRepo repository.AbsenceTypeRepository
    employeeRepo   repository.EmployeeRepository
}

func (s *vacationService) GetBalance(ctx context.Context, employeeID uuid.UUID, year int) (*VacationBalance, error) {
    balance, err := s.balanceRepo.GetByEmployeeYear(ctx, employeeID, year)
    if err != nil {
        return nil, err
    }

    if balance == nil {
        // Initialize if not exists
        balance, err = s.initializeBalanceInternal(ctx, employeeID, year)
        if err != nil {
            return nil, err
        }
    }

    // Calculate planned (approved future vacation)
    planned := s.calculatePlannedVacation(ctx, employeeID, year)

    return &VacationBalance{
        Year:        year,
        Entitlement: balance.Entitlement,
        Carryover:   balance.Carryover,
        Adjustments: balance.Adjustments,
        Taken:       balance.Taken,
        Available:   balance.Available(),
        Planned:     planned,
    }, nil
}

func (s *vacationService) InitializeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
    return s.initializeBalanceInternal(ctx, employeeID, year)
}

func (s *vacationService) initializeBalanceInternal(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
    employee, err := s.employeeRepo.GetByID(ctx, employeeID)
    if err != nil {
        return nil, err
    }

    // Calculate entitlement
    weeklyHours, _ := employee.WeeklyHours.Float64()
    var exitDate time.Time
    if employee.ExitDate != nil {
        exitDate = *employee.ExitDate
    }

    entitlement := calculation.CalculateEntitlement(
        weeklyHours,
        employee.EntryDate,
        exitDate,
        year,
    )

    balance := &model.VacationBalance{
        TenantID:    employee.TenantID,
        EmployeeID:  employeeID,
        Year:        year,
        Entitlement: entitlement,
    }

    if err := s.balanceRepo.Upsert(ctx, balance); err != nil {
        return nil, err
    }

    return balance, nil
}

func (s *vacationService) RecalculateTaken(ctx context.Context, employeeID uuid.UUID, year int) error {
    // Get vacation absence type
    vacationType, err := s.absenceTypeRepo.GetByCode(ctx, nil, "U")
    if err != nil {
        return err
    }

    // Sum all approved vacation absences for the year
    yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
    yearEnd := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

    taken, err := s.absenceRepo.CountByTypeInRange(ctx, employeeID, vacationType.ID, yearStart, yearEnd)
    if err != nil {
        return err
    }

    return s.balanceRepo.UpdateTaken(ctx, employeeID, year, taken)
}

func (s *vacationService) AdjustBalance(ctx context.Context, employeeID uuid.UUID, year int, adjustment decimal.Decimal, notes string) error {
    balance, err := s.balanceRepo.GetByEmployeeYear(ctx, employeeID, year)
    if err != nil {
        return err
    }
    if balance == nil {
        balance, err = s.initializeBalanceInternal(ctx, employeeID, year)
        if err != nil {
            return err
        }
    }

    balance.Adjustments = balance.Adjustments.Add(adjustment)
    if notes != "" {
        if balance.Notes != "" {
            balance.Notes += "\n"
        }
        balance.Notes += notes
    }

    return s.balanceRepo.Update(ctx, balance)
}

func (s *vacationService) CarryoverFromPreviousYear(ctx context.Context, employeeID uuid.UUID, year int) error {
    previousYear := year - 1
    prevBalance, err := s.balanceRepo.GetByEmployeeYear(ctx, employeeID, previousYear)
    if err != nil || prevBalance == nil {
        return nil // No previous year data
    }

    available := prevBalance.Available()
    maxCarryover := decimal.NewFromInt(5) // TODO: Get from tenant settings
    carryover := calculation.CalculateCarryover(available, maxCarryover)

    if carryover.IsZero() {
        return nil
    }

    currentBalance, err := s.balanceRepo.GetByEmployeeYear(ctx, employeeID, year)
    if err != nil {
        return err
    }
    if currentBalance == nil {
        currentBalance, err = s.initializeBalanceInternal(ctx, employeeID, year)
        if err != nil {
            return err
        }
    }

    currentBalance.Carryover = carryover
    return s.balanceRepo.Update(ctx, currentBalance)
}

func (s *vacationService) calculatePlannedVacation(ctx context.Context, employeeID uuid.UUID, year int) decimal.Decimal {
    // Get future approved vacation absences
    today := time.Now()
    yearEnd := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

    if today.Year() != year {
        return decimal.Zero
    }

    vacationType, _ := s.absenceTypeRepo.GetByCode(ctx, nil, "U")
    if vacationType == nil {
        return decimal.Zero
    }

    planned, _ := s.absenceRepo.CountByTypeInRange(ctx, employeeID, vacationType.ID, today.AddDate(0, 0, 1), yearEnd)
    return planned
}
```

## Unit Tests

**File**: `apps/api/internal/service/vacation_test.go`

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

// MockVacationBalanceRepository for testing
type MockVacationBalanceRepository struct {
    mock.Mock
}

func (m *MockVacationBalanceRepository) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
    args := m.Called(ctx, employeeID, year)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.VacationBalance), args.Error(1)
}

func (m *MockVacationBalanceRepository) Upsert(ctx context.Context, balance *model.VacationBalance) error {
    args := m.Called(ctx, balance)
    return args.Error(0)
}

func (m *MockVacationBalanceRepository) Update(ctx context.Context, balance *model.VacationBalance) error {
    args := m.Called(ctx, balance)
    return args.Error(0)
}

func (m *MockVacationBalanceRepository) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error {
    args := m.Called(ctx, employeeID, year, taken)
    return args.Error(0)
}

func TestVacationService_GetBalance_CalculatesCorrectly(t *testing.T) {
    mockBalanceRepo := new(MockVacationBalanceRepository)
    mockEmpRepo := new(MockEmployeeRepository)

    svc := &vacationService{
        balanceRepo:  mockBalanceRepo,
        employeeRepo: mockEmpRepo,
    }
    ctx := context.Background()

    employeeID := uuid.New()
    year := 2024
    balance := &model.VacationBalance{
        EmployeeID:  employeeID,
        Year:        year,
        Entitlement: decimal.NewFromInt(25),
        Carryover:   decimal.NewFromInt(5),
        Adjustments: decimal.NewFromInt(2),
        Taken:       decimal.NewFromInt(10),
    }

    mockBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, year).Return(balance, nil)

    result, err := svc.GetBalance(ctx, employeeID, year)
    require.NoError(t, err)
    assert.Equal(t, decimal.NewFromInt(25), result.Entitlement)
    assert.Equal(t, decimal.NewFromInt(5), result.Carryover)
    // Available = 25 + 5 + 2 - 10 = 22
    assert.Equal(t, decimal.NewFromInt(22), result.Available)
}

func TestVacationService_InitializeYear_CalculatesProRated(t *testing.T) {
    mockBalanceRepo := new(MockVacationBalanceRepository)
    mockEmpRepo := new(MockEmployeeRepository)

    svc := &vacationService{
        balanceRepo:  mockBalanceRepo,
        employeeRepo: mockEmpRepo,
    }
    ctx := context.Background()

    employeeID := uuid.New()
    year := 2024
    employee := &model.Employee{
        ID:          employeeID,
        TenantID:    uuid.New(),
        EntryDate:   time.Date(2023, 1, 1, 0, 0, 0, 0, time.UTC),
        WeeklyHours: decimal.NewFromInt(40),
    }

    mockEmpRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
    mockBalanceRepo.On("Upsert", ctx, mock.AnythingOfType("*model.VacationBalance")).Return(nil)

    balance, err := svc.InitializeYear(ctx, employeeID, year)
    require.NoError(t, err)
    assert.Equal(t, employeeID, balance.EmployeeID)
    assert.Equal(t, year, balance.Year)
}

func TestVacationService_CarryoverFromPreviousYear_RespectsMaximum(t *testing.T) {
    mockBalanceRepo := new(MockVacationBalanceRepository)

    svc := &vacationService{
        balanceRepo: mockBalanceRepo,
    }
    ctx := context.Background()

    employeeID := uuid.New()
    year := 2024
    prevYear := 2023

    // Previous year has 10 days available
    prevBalance := &model.VacationBalance{
        Entitlement: decimal.NewFromInt(25),
        Taken:       decimal.NewFromInt(15),
        // Available = 10
    }

    currentBalance := &model.VacationBalance{
        EmployeeID: employeeID,
        Year:       year,
    }

    mockBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, prevYear).Return(prevBalance, nil)
    mockBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, year).Return(currentBalance, nil)
    mockBalanceRepo.On("Update", ctx, mock.AnythingOfType("*model.VacationBalance")).Return(nil)

    err := svc.CarryoverFromPreviousYear(ctx, employeeID, year)
    require.NoError(t, err)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] GetBalance calculates available correctly
- [ ] InitializeYear calculates pro-rated entitlement
- [ ] RecalculateTaken sums vacation absences
- [ ] CarryoverFromPreviousYear respects maximum
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
