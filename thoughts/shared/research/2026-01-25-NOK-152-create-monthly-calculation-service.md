# Research: NOK-152 - Create Monthly Calculation Service

> Ticket: NOK-152 (TICKET-088)
> Date: 2026-01-25
> Git Commit: 2e810d79bd89f0dba038abe2d7bc4d412e0df8b1
> Status: Research complete

## 1. Ticket Requirements Summary

Create a Monthly Calculation service that:
- Performs full month calculation from daily values
- Supports batch processing for multiple employees
- Implements cascading recalculation from a starting month
- Handles flextime carryover between months

### Service Interface (from ticket)

```go
type MonthlyCalcService interface {
    CalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    CalculateMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, year, month int) error
    RecalculateFromMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error
}
```

### Files to Create

- `apps/api/internal/service/monthlycalc.go`
- `apps/api/internal/service/monthlycalc_test.go`

## 2. Existing MonthlyEvalService Analysis

**File**: `/home/tolga/projects/terp/apps/api/internal/service/monthlyeval.go`

The MonthlyEvalService already exists and provides significant functionality that overlaps with the ticket requirements.

### Current MonthlyEvalService Methods

```go
type MonthlyEvalService struct {
    monthlyValueRepo monthlyValueRepoForMonthlyEval
    dailyValueRepo   dailyValueRepoForMonthlyEval
    absenceDayRepo   absenceDayRepoForMonthlyEval
    employeeRepo     employeeRepoForMonthlyEval
}
```

**Implemented Methods**:
1. `GetMonthSummary(ctx, employeeID, year, month)` - retrieves monthly summary
2. `RecalculateMonth(ctx, employeeID, year, month)` - recalculates from daily values
3. `CloseMonth(ctx, employeeID, year, month, closedBy)` - marks month as closed
4. `ReopenMonth(ctx, employeeID, year, month, reopenedBy)` - reopens closed month
5. `GetYearOverview(ctx, employeeID, year)` - retrieves all months for a year

### RecalculateMonth Implementation Details

The current `RecalculateMonth` method (lines 181-245):
1. Validates year/month parameters
2. Gets employee for tenant ID
3. Checks if month is closed (returns ErrMonthClosed if closed)
4. Gets date range for the month
5. Gets previous month's `FlextimeEnd` for carryover
6. Gets daily values via `dailyValueRepo.GetByEmployeeDateRange()`
7. Gets absences via `absenceDayRepo.GetByEmployeeDateRange()`
8. Builds `MonthlyCalcInput` with daily values, absences, and carryover
9. Calls `calculation.CalculateMonth(input)`
10. Maps output to `model.MonthlyValue`
11. Upserts the monthly value

### What's MISSING from MonthlyEvalService

1. **Batch Processing** (`CalculateMonthBatch`)
   - Process multiple employees in a single call
   - Continue on individual failures
   - Return aggregated results

2. **Cascading Recalculation** (`RecalculateFromMonth`)
   - Recalculate a month AND all subsequent months
   - Update flextime carryover chain
   - Handle year boundary (December -> January)

## 3. Dependencies Status

### 3.1 MonthlyValue Model - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/model/monthlyvalue.go`

```go
type MonthlyValue struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    Year       int
    Month      int

    // Aggregated time totals (minutes)
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    // Flextime balance (minutes)
    FlextimeStart     int
    FlextimeChange    int
    FlextimeEnd       int
    FlextimeCarryover int

    // Absence summary
    VacationTaken    decimal.Decimal
    SickDays         int
    OtherAbsenceDays int

    // Work summary
    WorkDays       int
    DaysWithErrors int

    // Month closing
    IsClosed   bool
    ClosedAt   *time.Time
    ClosedBy   *uuid.UUID
    ReopenedAt *time.Time
    ReopenedBy *uuid.UUID
}
```

Helper methods:
- `Balance() int` - returns `TotalOvertime - TotalUndertime`
- `FormatFlextimeEnd() string` - returns formatted flextime balance

### 3.2 MonthlyValue Repository - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/monthlyvalue.go`

Available methods:
- `Create(ctx, mv)` - creates new monthly value
- `GetByID(ctx, id)` - retrieves by ID
- `Update(ctx, mv)` - updates monthly value
- `Delete(ctx, id)` - deletes by ID
- `GetByEmployeeMonth(ctx, employeeID, year, month)` - returns nil, nil if not found
- `GetPreviousMonth(ctx, employeeID, year, month)` - handles year boundary
- `Upsert(ctx, mv)` - upserts based on employee_id + year + month
- `ListByEmployee(ctx, employeeID)` - all months ordered by year, month
- `ListByEmployeeYear(ctx, employeeID, year)` - months for a year
- `IsMonthClosed(ctx, tenantID, employeeID, date)` - checks if month is closed
- `CloseMonth(ctx, employeeID, year, month, closedBy)` - marks month closed
- `ReopenMonth(ctx, employeeID, year, month, reopenedBy)` - marks month reopened

Error: `ErrMonthlyValueNotFound`

### 3.3 Monthly Aggregation Logic (TICKET-089) - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/monthly.go`

Types defined:
- `CreditType` - enum (no_evaluation, complete_carryover, after_threshold, no_carryover)
- `MonthlyCalcInput` - input with DailyValues, PreviousCarryover, EvaluationRules, AbsenceSummary
- `DailyValueInput` - simplified daily value for calculation
- `MonthlyEvaluationInput` - ZMI rules (CreditType, thresholds, caps)
- `AbsenceSummaryInput` - vacation, sick, other days
- `MonthlyCalcOutput` - aggregated results with flextime tracking

Main function:
```go
func CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput
```

Helper functions:
- `applyCreditType()` - implements 4 ZMI credit types
- `applyFlextimeCaps()` - applies positive/negative balance caps
- `CalculateAnnualCarryover()` - year-end carryover with annual floor

Warning codes defined in `/home/tolga/projects/terp/apps/api/internal/calculation/errors.go`:
- `WarnCodeMonthlyCap` - flextime credited capped at monthly max
- `WarnCodeFlextimeCapped` - flextime end hit positive/negative cap
- `WarnCodeBelowThreshold` - overtime below threshold, forfeited
- `WarnCodeNoCarryover` - credit type resets to zero

### 3.4 DailyValue Repository - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go`

Key methods for monthly aggregation:
- `GetByEmployeeDateRange(ctx, employeeID, from, to)` - returns all daily values for range
- `SumForMonth(ctx, employeeID, year, month)` - SQL aggregation returning `DailyValueSum`

`DailyValueSum` struct:
```go
type DailyValueSum struct {
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int
    TotalDays       int
    DaysWithErrors  int
}
```

### 3.5 AbsenceDay Repository - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go`

Key methods for absence counting:
- `GetByEmployeeDateRange(ctx, employeeID, from, to)` - all absences in range
- `CountByTypeInRange(ctx, employeeID, typeID, from, to)` - sums duration for specific type

## 4. Existing Service Patterns

### 4.1 RecalcService Pattern for Batch Processing

**File**: `/home/tolga/projects/terp/apps/api/internal/service/recalc.go`

```go
// RecalcResult contains the outcome of a recalculation operation.
type RecalcResult struct {
    ProcessedDays int
    FailedDays    int
    Errors        []RecalcError
}

// TriggerRecalcBatch recalculates a date range for multiple employees.
// Continues processing on individual errors.
func (s *RecalcService) TriggerRecalcBatch(ctx context.Context, tenantID uuid.UUID, employeeIDs []uuid.UUID, from, to time.Time) *RecalcResult {
    result := &RecalcResult{}

    for _, empID := range employeeIDs {
        empResult, err := s.TriggerRecalcRange(ctx, tenantID, empID, from, to)
        result.ProcessedDays += empResult.ProcessedDays
        result.FailedDays += empResult.FailedDays
        if err != nil {
            result.Errors = append(result.Errors, empResult.Errors...)
        }
    }

    return result
}
```

Key patterns:
- Returns `*RecalcResult` with processed/failed counts and errors
- Continues on individual failures
- Aggregates results from each employee

### 4.2 DailyCalcService Range Processing Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

```go
// RecalculateRange recalculates daily values for a date range.
func (s *DailyCalcService) RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error) {
    count := 0
    for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
        _, err := s.CalculateDay(ctx, tenantID, employeeID, date)
        if err != nil {
            return count, err
        }
        count++
    }
    return count, nil
}
```

Key pattern: Returns count of processed items and stops on first error.

## 5. Test Patterns

### 5.1 MonthlyEvalService Test Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/monthlyeval_test.go`

Mock Definitions:
```go
type mockMonthlyValueRepoForMonthlyEval struct {
    mock.Mock
}

func (m *mockMonthlyValueRepoForMonthlyEval) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
    args := m.Called(ctx, employeeID, year, month)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.MonthlyValue), args.Error(1)
}
```

Helper Function:
```go
func newTestMonthlyEvalService() (
    *MonthlyEvalService,
    *mockMonthlyValueRepoForMonthlyEval,
    *mockDailyValueRepoForMonthlyEval,
    *mockAbsenceDayRepoForMonthlyEval,
    *mockEmployeeRepoForMonthlyEval,
) {
    monthlyValueRepo := new(mockMonthlyValueRepoForMonthlyEval)
    dailyValueRepo := new(mockDailyValueRepoForMonthlyEval)
    absenceDayRepo := new(mockAbsenceDayRepoForMonthlyEval)
    employeeRepo := new(mockEmployeeRepoForMonthlyEval)

    svc := NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo)
    return svc, monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo
}
```

Test Structure:
```go
func TestMonthlyEvalService_RecalculateMonth_Success(t *testing.T) {
    ctx := context.Background()
    svc, monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo := newTestMonthlyEvalService()

    // Setup test data and expectations...

    err := svc.RecalculateMonth(ctx, employeeID, year, month)

    require.NoError(t, err)
    monthlyValueRepo.AssertExpectations(t)
    // ...
}
```

Test Imports:
```go
import (
    "context"
    "errors"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "github.com/tolga/terp/internal/model"
)
```

## 6. Design Considerations

### 6.1 CalculateMonth vs RecalculateMonth

The MonthlyEvalService has `RecalculateMonth` which checks if month is closed before calculating. The ticket asks for `CalculateMonth` which may have different semantics:

Options:
1. **Same as RecalculateMonth** - Check closed status, return error if closed
2. **Force calculation** - Calculate even if closed (for admin use)
3. **Calculate or Return Existing** - Calculate if not exists, return cached if exists

Current `RecalculateMonth` behavior:
- Returns `ErrMonthClosed` if month is closed
- Always recalculates from daily values when called
- Upserts result (creates or updates)

### 6.2 CalculateMonthBatch Implementation

Based on RecalcService pattern:

```go
type MonthlyCalcResult struct {
    ProcessedMonths int
    FailedMonths    int
    Errors          []MonthlyCalcError
}

type MonthlyCalcError struct {
    EmployeeID uuid.UUID
    Year       int
    Month      int
    Error      string
}
```

### 6.3 RecalculateFromMonth - Cascading Logic

For cascading recalculation starting from a month:

```go
func RecalculateFromMonth(ctx context.Context, employeeID uuid.UUID, startYear, startMonth int) error {
    currentYear, currentMonth := startYear, startMonth
    now := time.Now()

    for {
        // Stop if we've reached the current month
        if currentYear > now.Year() || (currentYear == now.Year() && currentMonth > int(now.Month())) {
            break
        }

        // Check if month is closed (skip or error?)
        mv, _ := repo.GetByEmployeeMonth(ctx, employeeID, currentYear, currentMonth)
        if mv != nil && mv.IsClosed {
            // Option 1: Skip closed months
            // Option 2: Return error
        }

        // Recalculate this month
        err := RecalculateMonth(ctx, employeeID, currentYear, currentMonth)
        if err != nil {
            return err
        }

        // Move to next month
        currentMonth++
        if currentMonth > 12 {
            currentMonth = 1
            currentYear++
        }
    }

    return nil
}
```

### 6.4 Flextime Carryover Chain

Critical for cascading recalculation:
- Month N's `FlextimeEnd` becomes Month N+1's `FlextimeStart`
- `GetPreviousMonth()` in repository handles year boundary
- Recalculating a month affects all subsequent months' balances

## 7. Interface Definitions Needed

Based on existing patterns, the service will need these repository interfaces:

```go
// monthlyValueRepoForMonthlyCalc defines the interface for monthly value data access.
type monthlyValueRepoForMonthlyCalc interface {
    GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    GetPreviousMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    Upsert(ctx context.Context, mv *model.MonthlyValue) error
    ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.MonthlyValue, error)
}

// dailyValueRepoForMonthlyCalc defines the interface for daily value aggregation.
type dailyValueRepoForMonthlyCalc interface {
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error)
}

// absenceDayRepoForMonthlyCalc defines the interface for absence counting.
type absenceDayRepoForMonthlyCalc interface {
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
}

// employeeRepoForMonthlyCalc defines the interface for employee data.
type employeeRepoForMonthlyCalc interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}
```

## 8. Error Definitions

Existing errors in monthlyeval.go:
```go
var (
    ErrMonthNotClosed          = errors.New("month is not closed")
    ErrInvalidMonth            = errors.New("invalid month")
    ErrInvalidYearMonth        = errors.New("invalid year or month")
    ErrMonthlyValueNotFound    = errors.New("monthly value not found")
    ErrEmployeeNotFoundForEval = errors.New("employee not found")
)
```

From booking.go (shared):
```go
var ErrMonthClosed = errors.New("month is closed")
```

New errors potentially needed:
```go
var (
    ErrFutureMonth = errors.New("cannot calculate future month")
)
```

## 9. Date Range Calculation

For a given year/month, the date range is:
```go
func monthDateRange(year, month int) (time.Time, time.Time) {
    from := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
    to := from.AddDate(0, 1, -1) // Last day of month
    return from, to
}
```

This helper function already exists in monthlyeval.go (line 125-129).

## 10. Code References

### Existing Files (Complete)

- MonthlyEvalService: `/home/tolga/projects/terp/apps/api/internal/service/monthlyeval.go`
- MonthlyEvalService Tests: `/home/tolga/projects/terp/apps/api/internal/service/monthlyeval_test.go`
- MonthlyValue model: `/home/tolga/projects/terp/apps/api/internal/model/monthlyvalue.go`
- MonthlyValue repository: `/home/tolga/projects/terp/apps/api/internal/repository/monthlyvalue.go`
- Monthly calculation: `/home/tolga/projects/terp/apps/api/internal/calculation/monthly.go`
- DailyCalcService pattern: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`
- RecalcService pattern: `/home/tolga/projects/terp/apps/api/internal/service/recalc.go`
- DailyValue repository: `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go`
- AbsenceDay repository: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go`
- Calculation errors: `/home/tolga/projects/terp/apps/api/internal/calculation/errors.go`

### Related Plan Files

- TICKET-090 plan: `/home/tolga/projects/terp/thoughts/shared/plans/tickets/TICKET-090-create-monthly-calculation-service.md`
- TICKET-089 aggregation: `/home/tolga/projects/terp/thoughts/shared/plans/tickets/TICKET-089-create-monthly-aggregation-logic.md`

## 11. Implementation Options

### Option A: Extend MonthlyEvalService

Add the missing methods to the existing MonthlyEvalService:
- `CalculateMonthBatch()` - new method
- `RecalculateFromMonth()` - new method

Pros:
- Reuses existing code and tests
- Single service for all monthly operations
- Less code duplication

Cons:
- MonthlyEvalService becomes larger
- May violate single responsibility principle

### Option B: Create Separate MonthlyCalcService

Create new service as specified in ticket:
- `monthlycalc.go` - new file
- Delegates to MonthlyEvalService for single-month calculations

Pros:
- Clean separation of concerns
- Batch/cascade logic separate from evaluation logic
- Matches ticket specification

Cons:
- Two services for related functionality
- Need to coordinate between services

### Option C: Create MonthlyCalcService that Wraps MonthlyEvalService

```go
type MonthlyCalcService struct {
    evalService *MonthlyEvalService
}

func (s *MonthlyCalcService) CalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
    // Use eval service's RecalculateMonth internally
    if err := s.evalService.RecalculateMonth(ctx, employeeID, year, month); err != nil {
        return nil, err
    }
    return s.evalService.GetMonthSummary(ctx, employeeID, year, month)
}
```

Pros:
- Reuses existing MonthlyEvalService
- Clear separation between orchestration and evaluation
- Matches ticket specification

Cons:
- Two services that depend on each other
- GetMonthSummary returns MonthSummary, not MonthlyValue (need conversion)

## 12. Open Questions

1. **Service Architecture**: Should this be a new service or extend MonthlyEvalService?
   - Ticket specifies new files `monthlycalc.go` and `monthlycalc_test.go`
   - MonthlyEvalService already has most functionality

2. **Return Type for CalculateMonth**: The ticket signature returns `*model.MonthlyValue`, but MonthlyEvalService's `GetMonthSummary` returns `*MonthSummary`.
   - Consider consistency with existing patterns
   - MonthSummary is a view type, MonthlyValue is the model

3. **Closed Month Handling in Cascade**: How should `RecalculateFromMonth` handle closed months?
   - Skip closed months silently?
   - Return error on first closed month?
   - Stop cascade at closed month?

4. **Batch Error Handling**: Should batch processing continue on errors or stop?
   - RecalcService pattern continues on errors and collects them
   - Consider same pattern for consistency
