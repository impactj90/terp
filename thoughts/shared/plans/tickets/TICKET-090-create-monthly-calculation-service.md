# TICKET-090: Create Monthly Calculation Service

**Type**: Service
**Effort**: L
**Sprint**: 22 - Monthly Calculation
**Dependencies**: TICKET-089, TICKET-086, TICKET-058

## Description

Create the monthly calculation service that orchestrates monthly aggregation.

## Files to Create

- `apps/api/internal/service/monthly_calc.go`

## Implementation

```go
package service

import (
    "context"
    "errors"
    "time"

    "github.com/google/uuid"

    "terp/apps/api/internal/calculation"
    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

var (
    ErrMonthAlreadyClosed = errors.New("month is already closed")
    ErrMonthNotClosed     = errors.New("month is not closed")
    ErrFutureMonth        = errors.New("cannot calculate future month")
)

type MonthlyCalcService interface {
    CalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error
    ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error
    BatchCloseMonth(ctx context.Context, tenantID uuid.UUID, year, month int, closedBy uuid.UUID) (int, error)
}

type monthlyCalcService struct {
    monthlyRepo    repository.MonthlyValueRepository
    dailyValueRepo repository.DailyValueRepository
    absenceRepo    repository.AbsenceRepository
    absenceTypeRepo repository.AbsenceTypeRepository
    evalRepo       repository.MonthlyEvaluationRepository
    employeeRepo   repository.EmployeeRepository
}

func (s *monthlyCalcService) CalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
    // Validate not future month
    now := time.Now()
    if year > now.Year() || (year == now.Year() && month > int(now.Month())) {
        return nil, ErrFutureMonth
    }

    // Check if already closed
    existing, _ := s.monthlyRepo.GetByEmployeeYearMonth(ctx, employeeID, year, month)
    if existing != nil && existing.IsClosed {
        return nil, ErrMonthAlreadyClosed
    }

    // Build calculation input
    input, err := s.buildCalcInput(ctx, employeeID, year, month)
    if err != nil {
        return nil, err
    }

    // Run calculation
    output := calculation.CalculateMonth(*input)

    // Get employee for tenant_id
    employee, err := s.employeeRepo.GetByID(ctx, employeeID)
    if err != nil {
        return nil, err
    }

    // Convert to model
    monthlyValue := s.outputToMonthlyValue(employee.TenantID, employeeID, year, month, output)

    // Persist
    if err := s.monthlyRepo.Upsert(ctx, monthlyValue); err != nil {
        return nil, err
    }

    return monthlyValue, nil
}

func (s *monthlyCalcService) buildCalcInput(ctx context.Context, employeeID uuid.UUID, year, month int) (*calculation.MonthlyCalcInput, error) {
    input := &calculation.MonthlyCalcInput{}

    // Get daily values for the month
    monthStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
    monthEnd := monthStart.AddDate(0, 1, -1)

    dailyValues, err := s.dailyValueRepo.GetByEmployeeDateRange(ctx, employeeID, monthStart, monthEnd)
    if err != nil {
        return nil, err
    }

    for _, dv := range dailyValues {
        input.DailyValues = append(input.DailyValues, calculation.DailyValueInput{
            Date:       dv.ValueDate.Format("2006-01-02"),
            GrossTime:  dv.GrossTime,
            NetTime:    dv.NetTime,
            TargetTime: dv.TargetTime,
            Overtime:   dv.Overtime,
            Undertime:  dv.Undertime,
            BreakTime:  dv.BreakTime,
            HasError:   dv.HasError,
        })
    }

    // Get previous month carryover
    prevMonth, _ := s.monthlyRepo.GetPreviousMonth(ctx, employeeID, year, month)
    if prevMonth != nil {
        input.PreviousCarryover = prevMonth.FlextimeCarryover
    }

    // Get evaluation rules
    eval, _ := s.evalRepo.GetDefault(ctx, employee.TenantID)
    if eval != nil {
        input.EvaluationRules = &calculation.MonthlyEvaluationInput{
            FlextimeCapPositive: eval.FlextimeCapPositive,
            FlextimeCapNegative: eval.FlextimeCapNegative,
            OvertimeThreshold:   eval.OvertimeThreshold,
        }
    }

    // Get absence summary
    input.AbsenceSummary = s.getAbsenceSummary(ctx, employeeID, monthStart, monthEnd)

    return input, nil
}

func (s *monthlyCalcService) getAbsenceSummary(ctx context.Context, employeeID uuid.UUID, from, to time.Time) calculation.AbsenceSummaryInput {
    summary := calculation.AbsenceSummaryInput{}

    // Get vacation type
    vacationType, _ := s.absenceTypeRepo.GetByCode(ctx, nil, "U")
    if vacationType != nil {
        vac, _ := s.absenceRepo.CountByTypeInRange(ctx, employeeID, vacationType.ID, from, to)
        summary.VacationDays = vac
    }

    // Get illness type
    illnessType, _ := s.absenceTypeRepo.GetByCode(ctx, nil, "K")
    if illnessType != nil {
        sick, _ := s.absenceRepo.CountByTypeInRange(ctx, employeeID, illnessType.ID, from, to)
        summary.SickDays = int(sick.IntPart())
    }

    return summary
}

func (s *monthlyCalcService) outputToMonthlyValue(tenantID, employeeID uuid.UUID, year, month int, output calculation.MonthlyCalcOutput) *model.MonthlyValue {
    return &model.MonthlyValue{
        TenantID:         tenantID,
        EmployeeID:       employeeID,
        Year:             year,
        Month:            month,
        TotalGrossTime:   output.TotalGrossTime,
        TotalNetTime:     output.TotalNetTime,
        TotalTargetTime:  output.TotalTargetTime,
        TotalOvertime:    output.TotalOvertime,
        TotalUndertime:   output.TotalUndertime,
        TotalBreakTime:   output.TotalBreakTime,
        FlextimeStart:    output.FlextimeStart,
        FlextimeChange:   output.FlextimeChange,
        FlextimeEnd:      output.FlextimeEnd,
        FlextimeCarryover: output.FlextimeCarryover,
        VacationTaken:    output.VacationTaken,
        SickDays:         output.SickDays,
        OtherAbsenceDays: output.OtherAbsenceDays,
        WorkDays:         output.WorkDays,
        DaysWithErrors:   output.DaysWithErrors,
    }
}

func (s *monthlyCalcService) CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error {
    // Calculate first to ensure data is current
    if _, err := s.CalculateMonth(ctx, employeeID, year, month); err != nil {
        if err != ErrMonthAlreadyClosed {
            return err
        }
    }

    return s.monthlyRepo.Close(ctx, employeeID, year, month, closedBy)
}

func (s *monthlyCalcService) ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error {
    existing, err := s.monthlyRepo.GetByEmployeeYearMonth(ctx, employeeID, year, month)
    if err != nil || existing == nil {
        return ErrMonthNotClosed
    }
    if !existing.IsClosed {
        return ErrMonthNotClosed
    }

    return s.monthlyRepo.Reopen(ctx, employeeID, year, month, reopenedBy)
}

func (s *monthlyCalcService) BatchCloseMonth(ctx context.Context, tenantID uuid.UUID, year, month int, closedBy uuid.UUID) (int, error) {
    // Get all active employees
    filter := repository.EmployeeFilter{TenantID: tenantID}
    employees, _, err := s.employeeRepo.List(ctx, filter)
    if err != nil {
        return 0, err
    }

    count := 0
    for _, emp := range employees {
        if err := s.CloseMonth(ctx, emp.ID, year, month, closedBy); err != nil {
            // Log but continue
            continue
        }
        count++
    }

    return count, nil
}
```

## Unit Tests

**File**: `apps/api/internal/service/monthly_calc_test.go`

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
    "terp/apps/api/internal/repository"
)

func TestMonthlyCalcService_CalculateMonth_Success(t *testing.T) {
    mockMonthlyRepo := new(MockMonthlyValueRepository)
    mockDailyRepo := new(MockDailyValueRepository)
    mockEmpRepo := new(MockEmployeeRepository)

    svc := &monthlyCalcService{
        monthlyRepo:    mockMonthlyRepo,
        dailyValueRepo: mockDailyRepo,
        employeeRepo:   mockEmpRepo,
    }
    ctx := context.Background()

    employeeID := uuid.New()
    year, month := 2024, 1

    employee := &model.Employee{ID: employeeID, TenantID: uuid.New()}
    mockEmpRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

    monthStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
    monthEnd := monthStart.AddDate(0, 1, -1)

    dailyValues := []model.DailyValue{
        {ValueDate: monthStart, GrossTime: 480, NetTime: 450, TargetTime: 480},
    }
    mockDailyRepo.On("GetByEmployeeDateRange", ctx, employeeID, monthStart, monthEnd).Return(dailyValues, nil)
    mockMonthlyRepo.On("GetByEmployeeYearMonth", ctx, employeeID, year, month).Return(nil, nil)
    mockMonthlyRepo.On("Upsert", ctx, mock.AnythingOfType("*model.MonthlyValue")).Return(nil)

    monthlyValue, err := svc.CalculateMonth(ctx, employeeID, year, month)
    require.NoError(t, err)
    assert.Equal(t, employeeID, monthlyValue.EmployeeID)
    assert.Equal(t, year, monthlyValue.Year)
    assert.Equal(t, month, monthlyValue.Month)
}

func TestMonthlyCalcService_CalculateMonth_FutureMonth(t *testing.T) {
    svc := &monthlyCalcService{}
    ctx := context.Background()

    now := time.Now()
    futureYear := now.Year() + 1

    _, err := svc.CalculateMonth(ctx, uuid.New(), futureYear, 1)
    assert.Equal(t, ErrFutureMonth, err)
}

func TestMonthlyCalcService_CalculateMonth_MonthAlreadyClosed(t *testing.T) {
    mockMonthlyRepo := new(MockMonthlyValueRepository)

    svc := &monthlyCalcService{
        monthlyRepo: mockMonthlyRepo,
    }
    ctx := context.Background()

    employeeID := uuid.New()
    year, month := 2024, 1

    closedMonth := &model.MonthlyValue{IsClosed: true}
    mockMonthlyRepo.On("GetByEmployeeYearMonth", ctx, employeeID, year, month).Return(closedMonth, nil)

    _, err := svc.CalculateMonth(ctx, employeeID, year, month)
    assert.Equal(t, ErrMonthAlreadyClosed, err)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] CalculateMonth aggregates daily values
- [ ] Gets previous month carryover
- [ ] Applies evaluation rules
- [ ] CloseMonth prevents further modifications
- [ ] ReopenMonth allows admin to edit
- [ ] BatchCloseMonth processes all employees
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
