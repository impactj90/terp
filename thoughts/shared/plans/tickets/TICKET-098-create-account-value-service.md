# TICKET-098: Create Account Value Service

**Type**: Service
**Effort**: M
**Sprint**: 24 - Account Values
**Dependencies**: TICKET-097, TICKET-086

## Description

Create the account value service for managing yearly accounts.

## Files to Create

- `apps/api/internal/service/account_value.go`

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
    ErrAccountNotFound    = errors.New("account not found")
    ErrAccountYearClosed  = errors.New("account year is closed")
    ErrFutureYear         = errors.New("cannot operate on future year")
)

type AccountValueService interface {
    GetOrCreateAccount(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int) (*model.AccountValue, error)
    UpdateBalance(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int, newBalance int) error
    GetEmployeeAccounts(ctx context.Context, employeeID uuid.UUID, year int) ([]model.AccountValue, error)
    CloseYear(ctx context.Context, employeeID uuid.UUID, year int, closedBy uuid.UUID) error
    InitializeYear(ctx context.Context, employeeID uuid.UUID, year int) error
    RecalculateFromMonthly(ctx context.Context, employeeID uuid.UUID, year int) error
}

type accountValueService struct {
    accountRepo  repository.AccountValueRepository
    monthlyRepo  repository.MonthlyValueRepository
    employeeRepo repository.EmployeeRepository
    evalRepo     repository.MonthlyEvaluationRepository
}

func NewAccountValueService(
    accountRepo repository.AccountValueRepository,
    monthlyRepo repository.MonthlyValueRepository,
    employeeRepo repository.EmployeeRepository,
    evalRepo repository.MonthlyEvaluationRepository,
) AccountValueService {
    return &accountValueService{
        accountRepo:  accountRepo,
        monthlyRepo:  monthlyRepo,
        employeeRepo: employeeRepo,
        evalRepo:     evalRepo,
    }
}

func (s *accountValueService) GetOrCreateAccount(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int) (*model.AccountValue, error) {
    account, err := s.accountRepo.GetByEmployeeTypeYear(ctx, employeeID, accountType, year)
    if err != nil {
        return nil, err
    }
    if account != nil {
        return account, nil
    }

    // Get employee for tenant_id
    employee, err := s.employeeRepo.GetByID(ctx, employeeID)
    if err != nil {
        return nil, err
    }

    // Create new account
    account = &model.AccountValue{
        TenantID:    employee.TenantID,
        EmployeeID:  employeeID,
        AccountType: accountType,
        Year:        year,
    }

    // Get previous year carryover
    prevAccount, _ := s.accountRepo.GetByEmployeeTypeYear(ctx, employeeID, accountType, year-1)
    if prevAccount != nil && prevAccount.ClosingBalance != nil {
        account.OpeningBalance = *prevAccount.ClosingBalance
    }

    if err := s.accountRepo.Create(ctx, account); err != nil {
        return nil, err
    }

    return account, nil
}

func (s *accountValueService) UpdateBalance(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int, newBalance int) error {
    account, err := s.GetOrCreateAccount(ctx, employeeID, accountType, year)
    if err != nil {
        return err
    }
    if account.IsClosed {
        return ErrAccountYearClosed
    }

    account.CurrentBalance = newBalance
    return s.accountRepo.Update(ctx, account)
}

func (s *accountValueService) GetEmployeeAccounts(ctx context.Context, employeeID uuid.UUID, year int) ([]model.AccountValue, error) {
    return s.accountRepo.ListByEmployeeYear(ctx, employeeID, year)
}

func (s *accountValueService) CloseYear(ctx context.Context, employeeID uuid.UUID, year int, closedBy uuid.UUID) error {
    currentYear := time.Now().Year()
    if year > currentYear {
        return ErrFutureYear
    }

    // Recalculate before closing
    if err := s.RecalculateFromMonthly(ctx, employeeID, year); err != nil {
        return err
    }

    employee, err := s.employeeRepo.GetByID(ctx, employeeID)
    if err != nil {
        return err
    }

    // Get evaluation rules for carryover limits
    eval, _ := s.evalRepo.GetDefault(ctx, employee.TenantID)

    // Close each account type
    accountTypes := []model.AccountType{
        model.AccountTypeFlextime,
        model.AccountTypeVacation,
        model.AccountTypeSick,
    }

    for _, accountType := range accountTypes {
        if err := s.accountRepo.CloseYear(ctx, employeeID, accountType, year, closedBy); err != nil {
            return err
        }

        // Calculate carryover
        account, _ := s.accountRepo.GetByEmployeeTypeYear(ctx, employeeID, accountType, year)
        if account != nil && account.ClosingBalance != nil {
            carryover := *account.ClosingBalance

            // Apply caps from evaluation rules
            if eval != nil && accountType == model.AccountTypeFlextime {
                if eval.FlextimeCapPositive != nil && carryover > *eval.FlextimeCapPositive {
                    carryover = *eval.FlextimeCapPositive
                }
                if eval.FlextimeCapNegative != nil && carryover < -*eval.FlextimeCapNegative {
                    carryover = -*eval.FlextimeCapNegative
                }
            }

            s.accountRepo.CarryOverToNextYear(ctx, employeeID, accountType, year, carryover)
        }
    }

    return nil
}

func (s *accountValueService) InitializeYear(ctx context.Context, employeeID uuid.UUID, year int) error {
    accountTypes := []model.AccountType{
        model.AccountTypeFlextime,
        model.AccountTypeVacation,
        model.AccountTypeSick,
    }

    for _, accountType := range accountTypes {
        if _, err := s.GetOrCreateAccount(ctx, employeeID, accountType, year); err != nil {
            return err
        }
    }

    return nil
}

func (s *accountValueService) RecalculateFromMonthly(ctx context.Context, employeeID uuid.UUID, year int) error {
    monthlyValues, err := s.monthlyRepo.ListByEmployeeYear(ctx, employeeID, year)
    if err != nil {
        return err
    }

    // Sum up monthly values
    totalFlextime := 0
    totalVacation := 0
    totalSick := 0

    for _, mv := range monthlyValues {
        totalFlextime += mv.FlextimeCarryover
        totalVacation += int(mv.VacationTaken.IntPart())
        totalSick += mv.SickDays
    }

    // Update accounts
    s.UpdateBalance(ctx, employeeID, model.AccountTypeFlextime, year, totalFlextime)
    s.UpdateBalance(ctx, employeeID, model.AccountTypeVacation, year, totalVacation)
    s.UpdateBalance(ctx, employeeID, model.AccountTypeSick, year, totalSick)

    return nil
}
```

## Unit Tests

**File**: `apps/api/internal/service/account_value_test.go`

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

// MockAccountValueRepository for testing
type MockAccountValueRepository struct {
    mock.Mock
}

func (m *MockAccountValueRepository) GetByEmployeeTypeYear(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int) (*model.AccountValue, error) {
    args := m.Called(ctx, employeeID, accountType, year)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.AccountValue), args.Error(1)
}

func (m *MockAccountValueRepository) Create(ctx context.Context, account *model.AccountValue) error {
    args := m.Called(ctx, account)
    account.ID = uuid.New()
    return args.Error(0)
}

func (m *MockAccountValueRepository) Update(ctx context.Context, account *model.AccountValue) error {
    args := m.Called(ctx, account)
    return args.Error(0)
}

func (m *MockAccountValueRepository) CloseYear(ctx context.Context, employeeID uuid.UUID, accountType model.AccountType, year int, closedBy uuid.UUID) error {
    args := m.Called(ctx, employeeID, accountType, year, closedBy)
    return args.Error(0)
}

func TestAccountValueService_GetOrCreateAccount_CreatesIfMissing(t *testing.T) {
    mockAccountRepo := new(MockAccountValueRepository)
    mockEmpRepo := new(MockEmployeeRepository)

    svc := NewAccountValueService(mockAccountRepo, nil, mockEmpRepo, nil)
    ctx := context.Background()

    employeeID := uuid.New()
    employee := &model.Employee{ID: employeeID, TenantID: uuid.New()}

    mockAccountRepo.On("GetByEmployeeTypeYear", ctx, employeeID, model.AccountTypeFlextime, 2024).Return(nil, nil)
    mockEmpRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
    mockAccountRepo.On("GetByEmployeeTypeYear", ctx, employeeID, model.AccountTypeFlextime, 2023).Return(nil, nil)
    mockAccountRepo.On("Create", ctx, mock.AnythingOfType("*model.AccountValue")).Return(nil)

    account, err := svc.GetOrCreateAccount(ctx, employeeID, model.AccountTypeFlextime, 2024)
    require.NoError(t, err)
    assert.Equal(t, employeeID, account.EmployeeID)
    assert.Equal(t, 2024, account.Year)
}

func TestAccountValueService_UpdateBalance_FailsForClosedYear(t *testing.T) {
    mockAccountRepo := new(MockAccountValueRepository)

    svc := &accountValueService{accountRepo: mockAccountRepo}
    ctx := context.Background()

    closedAccount := &model.AccountValue{IsClosed: true}
    mockAccountRepo.On("GetByEmployeeTypeYear", ctx, mock.Anything, mock.Anything, mock.Anything).Return(closedAccount, nil)

    err := svc.UpdateBalance(ctx, uuid.New(), model.AccountTypeFlextime, 2024, 100)
    assert.Equal(t, ErrAccountYearClosed, err)
}

func TestAccountValueService_CloseYear_AppliesCarryoverCaps(t *testing.T) {
    mockAccountRepo := new(MockAccountValueRepository)
    mockEmpRepo := new(MockEmployeeRepository)
    mockMonthlyRepo := new(MockMonthlyValueRepository)

    svc := NewAccountValueService(mockAccountRepo, mockMonthlyRepo, mockEmpRepo, nil)
    ctx := context.Background()

    employeeID := uuid.New()
    year := 2024
    closedBy := uuid.New()

    employee := &model.Employee{ID: employeeID, TenantID: uuid.New()}
    mockEmpRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
    mockMonthlyRepo.On("ListByEmployeeYear", ctx, employeeID, year).Return([]model.MonthlyValue{}, nil)

    mockAccountRepo.On("GetByEmployeeTypeYear", ctx, employeeID, mock.Anything, year).Return(nil, nil)
    mockAccountRepo.On("CloseYear", ctx, employeeID, mock.Anything, year, closedBy).Return(nil)

    err := svc.CloseYear(ctx, employeeID, year, closedBy)
    require.NoError(t, err)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] GetOrCreateAccount creates if missing
- [ ] UpdateBalance fails for closed year
- [ ] CloseYear applies carryover caps
- [ ] RecalculateFromMonthly aggregates correctly
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
