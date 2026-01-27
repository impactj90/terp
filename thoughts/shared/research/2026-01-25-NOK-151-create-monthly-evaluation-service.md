# Research: NOK-151 - Create Monthly Evaluation Service

> Ticket: NOK-151 (TICKET-087)
> Date: 2026-01-25
> Git Commit: 579483f07eb1a10300c52a91a9e2ab5104b02fd8
> Status: Research complete

## 1. Ticket Requirements Summary

Create a Monthly Evaluation service that:
- Aggregates daily values into monthly totals
- Manages flextime running balance across months
- Handles month closing/reopening
- Provides year overview

### Service Interface (from ticket)

```go
type MonthlyEvalService interface {
    GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error)
    RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error
    CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error
    ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error
    GetYearOverview(ctx context.Context, employeeID uuid.UUID, year int) ([]MonthSummary, error)
}
```

### Files to Create

- `apps/api/internal/service/monthlyeval.go`
- `apps/api/internal/service/monthlyeval_test.go`

## 2. Dependencies Status

### 2.1 MonthlyValue Model (TICKET-086) - EXISTS

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

### 2.2 MonthlyValue Repository (TICKET-086) - EXISTS

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

### 2.3 Monthly Aggregation Logic (TICKET-089) - EXISTS

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

### 2.4 DailyValue Repository (TICKET-058) - EXISTS

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

### 2.5 AbsenceDay Repository - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go`

Key methods for absence counting:
- `GetByEmployeeDateRange(ctx, employeeID, from, to)` - all absences in range
- `CountByTypeInRange(ctx, employeeID, typeID, from, to)` - sums duration for specific type

### 2.6 AbsenceType Model - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`

Categories:
- `AbsenceCategoryVacation` = "vacation"
- `AbsenceCategoryIllness` = "illness"
- `AbsenceCategorySpecial` = "special"
- `AbsenceCategoryUnpaid` = "unpaid"

Helper methods:
- `IsVacationType() bool`
- `IsIllnessType() bool`

## 3. Existing Service Patterns

### 3.1 DailyCalcService Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

Structure:
```go
// Interface definitions for dependencies (not exported)
type bookingRepository interface {
    GetByEmployeeAndDate(ctx, tenantID, employeeID, date) ([]model.Booking, error)
    UpdateCalculatedTimes(ctx, updates map[uuid.UUID]int) error
}

type employeeDayPlanRepository interface {
    GetForEmployeeDate(ctx, employeeID, date) (*model.EmployeeDayPlan, error)
}

type dailyValueRepository interface {
    Upsert(ctx, dv *model.DailyValue) error
    GetByEmployeeDate(ctx, employeeID, date) (*model.DailyValue, error)
}

type holidayLookup interface {
    GetByDate(ctx, tenantID, date) (*model.Holiday, error)
}

// Service struct
type DailyCalcService struct {
    bookingRepo    bookingRepository
    empDayPlanRepo employeeDayPlanRepository
    dailyValueRepo dailyValueRepository
    holidayRepo    holidayLookup
    calc           *calculation.Calculator
}

// Constructor
func NewDailyCalcService(
    bookingRepo bookingRepository,
    empDayPlanRepo employeeDayPlanRepository,
    dailyValueRepo dailyValueRepository,
    holidayRepo holidayLookup,
) *DailyCalcService {
    return &DailyCalcService{
        bookingRepo:    bookingRepo,
        empDayPlanRepo: empDayPlanRepo,
        dailyValueRepo: dailyValueRepo,
        holidayRepo:    holidayRepo,
        calc:           calculation.NewCalculator(),
    }
}
```

Key patterns:
- Interface definitions for dependencies (internal to service package)
- Constructor injects all dependencies
- Uses pure calculation functions from `calculation` package
- Persists results through repository

### 3.2 VacationService Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation.go`

```go
// Service-specific errors
var (
    ErrVacationBalanceNotFound = errors.New("vacation balance not found")
    ErrInvalidYear             = errors.New("invalid year")
)

// Interface definitions
type vacationBalanceRepoForVacation interface {
    GetByEmployeeYear(ctx, employeeID, year) (*model.VacationBalance, error)
    Upsert(ctx, balance *model.VacationBalance) error
    UpdateTaken(ctx, employeeID, year, taken decimal.Decimal) error
}

type absenceDayRepoForVacation interface {
    CountByTypeInRange(ctx, employeeID, typeID, from, to) (decimal.Decimal, error)
}

type absenceTypeRepoForVacation interface {
    List(ctx, tenantID, includeSystem bool) ([]model.AbsenceType, error)
}

type employeeRepoForVacation interface {
    GetByID(ctx, id) (*model.Employee, error)
}

type VacationService struct {
    vacationBalanceRepo vacationBalanceRepoForVacation
    absenceDayRepo      absenceDayRepoForVacation
    absenceTypeRepo     absenceTypeRepoForVacation
    employeeRepo        employeeRepoForVacation
    defaultMaxCarryover decimal.Decimal
}
```

Key patterns:
- Package-level error variables for domain errors
- Interface names include "ForServiceName" suffix to avoid conflicts
- Configuration values as struct fields (e.g., `defaultMaxCarryover`)
- Year validation (1900-2200 range)
- Uses `calculation.CalculateVacation()` for pure calculation logic

## 4. Service Test Patterns

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc_test.go`

### 4.1 Mock Definitions

```go
// mockBookingRepository implements bookingRepository for testing.
type mockBookingRepository struct {
    mock.Mock
}

func (m *mockBookingRepository) GetByEmployeeAndDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error) {
    args := m.Called(ctx, tenantID, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).([]model.Booking), args.Error(1)
}
```

### 4.2 Helper Functions

```go
func testDate(year, month, day int) time.Time {
    return time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
}

func intPtr(i int) *int {
    return &i
}

func newTestService(
    bookingRepo *mockBookingRepository,
    empDayPlanRepo *mockEmployeeDayPlanRepository,
    dailyValueRepo *mockDailyValueRepository,
    holidayRepo *mockHolidayLookup,
) *DailyCalcService {
    return NewDailyCalcService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
}
```

### 4.3 Test Structure

```go
func TestCalculateDay_NormalWithBookings(t *testing.T) {
    ctx := context.Background()
    tenantID := uuid.New()
    employeeID := uuid.New()
    date := testDate(2026, 1, 20)

    // Setup mocks
    bookingRepo := new(mockBookingRepository)
    empDayPlanRepo := new(mockEmployeeDayPlanRepository)
    dailyValueRepo := new(mockDailyValueRepository)
    holidayRepo := new(mockHolidayLookup)

    // Set expectations
    holidayRepo.On("GetByDate", ctx, tenantID, date).Return(nil, nil)
    empDayPlanRepo.On("GetForEmployeeDate", ctx, employeeID, date).Return(empDayPlan, nil)
    bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return(bookings, nil)
    bookingRepo.On("UpdateCalculatedTimes", ctx, mock.Anything).Return(nil)
    dailyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(dv *model.DailyValue) bool {
        return dv.EmployeeID == employeeID
    })).Return(nil)

    // Execute
    svc := newTestService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
    result, err := svc.CalculateDay(ctx, tenantID, employeeID, date)

    // Assert
    require.NoError(t, err)
    require.NotNil(t, result)
    assert.Equal(t, employeeID, result.EmployeeID)

    bookingRepo.AssertExpectations(t)
    empDayPlanRepo.AssertExpectations(t)
    dailyValueRepo.AssertExpectations(t)
    holidayRepo.AssertExpectations(t)
}
```

### 4.4 Test Imports

```go
import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/lib/pq"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "github.com/tolga/terp/internal/model"
)
```

## 5. MonthSummary Type Definition

The ticket mentions returning `*MonthSummary` but this type does not exist in the codebase yet. Based on the `MonthlyValue` model and `MonthlyCalcOutput`, a `MonthSummary` should include:

**Suggested fields based on existing patterns:**

```go
type MonthSummary struct {
    EmployeeID     uuid.UUID
    Year           int
    Month          int

    // Time totals (minutes)
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    // Flextime tracking
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

    // Status
    IsClosed   bool
    ClosedAt   *time.Time
    ClosedBy   *uuid.UUID
    ReopenedAt *time.Time
    ReopenedBy *uuid.UUID

    // Warnings from calculation
    Warnings []string
}
```

## 6. Interface Definitions Needed

Based on existing patterns, the service will need these repository interfaces:

```go
// monthlyValueRepoForMonthlyEval
type monthlyValueRepoForMonthlyEval interface {
    GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    GetPreviousMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
    Upsert(ctx context.Context, mv *model.MonthlyValue) error
    ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.MonthlyValue, error)
    CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error
    ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error
}

// dailyValueRepoForMonthlyEval
type dailyValueRepoForMonthlyEval interface {
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error)
}

// absenceDayRepoForMonthlyEval
type absenceDayRepoForMonthlyEval interface {
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
}

// employeeRepoForMonthlyEval
type employeeRepoForMonthlyEval interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}
```

## 7. Error Definitions Needed

```go
var (
    ErrMonthClosed           = errors.New("month is closed")
    ErrMonthNotClosed        = errors.New("month is not closed")
    ErrInvalidMonth          = errors.New("invalid month")
    ErrMonthlyValueNotFound  = errors.New("monthly value not found")
)
```

## 8. Key Implementation Notes

### 8.1 RecalculateMonth Flow

1. Check if month is closed (return error if closed)
2. Get employee for tenant ID
3. Get previous month's MonthlyValue for `FlextimeStart` (carryover)
4. Get all DailyValues for the month
5. Get all AbsenceDays for the month and summarize by category
6. Build `MonthlyCalcInput` with:
   - Convert DailyValues to DailyValueInput
   - Set PreviousCarryover from previous month's FlextimeCarryover (or FlextimeEnd)
   - Set EvaluationRules (from where? - see section 9)
   - Set AbsenceSummary from absence counts
7. Call `calculation.CalculateMonth(input)`
8. Map `MonthlyCalcOutput` to `model.MonthlyValue`
9. Upsert the MonthlyValue

### 8.2 GetMonthSummary Flow

1. Get MonthlyValue by employee/year/month
2. If not found, return nil (or calculate on-demand?)
3. Convert to MonthSummary and return

### 8.3 CloseMonth Flow

1. Verify month exists (may need to calculate first)
2. Call repository CloseMonth
3. Note: Closing prevents further booking modifications (checked in BookingService)

### 8.4 ReopenMonth Flow

1. Verify month is closed
2. Call repository ReopenMonth

### 8.5 GetYearOverview Flow

1. ListByEmployeeYear
2. Convert to []MonthSummary

## 9. Evaluation Rules Source - PENDING

The `MonthlyEvaluationInput` requires:
- `CreditType` - which of 4 credit types
- `FlextimeThreshold` - threshold for after_threshold mode
- `MaxFlextimePerMonth` - monthly credit cap
- `FlextimeCapPositive` - upper balance limit
- `FlextimeCapNegative` - lower balance limit
- `AnnualFloorBalance` - year-end annual floor

**Current state**: These fields are NOT in the Tariff model yet. The generated API has a `MonthlyEvaluation` model that contains some of these fields.

**Options**:
1. Use sensible defaults (nil for no limits)
2. Add these fields to Tariff model via a future ticket
3. Create a separate MonthlyEvaluation entity

For initial implementation, using nil/defaults will allow the service to work without evaluation rules, performing simple 1:1 transfer.

## 10. Date Range Calculation

For a given year/month, the date range is:
```go
from := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
to := from.AddDate(0, 1, -1) // Last day of month
```

## 11. Absence Summary Calculation

Count absences by category:
```go
absences, _ := absenceRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)

var vacationDays decimal.Decimal
var sickDays, otherDays int

for _, ad := range absences {
    if ad.Status != model.AbsenceStatusApproved {
        continue
    }
    switch ad.AbsenceType.Category {
    case model.AbsenceCategoryVacation:
        vacationDays = vacationDays.Add(ad.Duration)
    case model.AbsenceCategoryIllness:
        sickDays++  // or use duration for half-days
    default:
        otherDays++
    }
}
```

## 12. Code References

- MonthlyValue model: `/home/tolga/projects/terp/apps/api/internal/model/monthlyvalue.go`
- MonthlyValue repository: `/home/tolga/projects/terp/apps/api/internal/repository/monthlyvalue.go`
- Monthly calculation: `/home/tolga/projects/terp/apps/api/internal/calculation/monthly.go`
- DailyCalcService pattern: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`
- DailyCalcService tests: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc_test.go`
- VacationService pattern: `/home/tolga/projects/terp/apps/api/internal/service/vacation.go`
- DailyValue repository: `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go`
- AbsenceDay repository: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go`
- AbsenceType model: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`
- Calculation errors: `/home/tolga/projects/terp/apps/api/internal/calculation/errors.go`

## 13. Open Questions

1. **Evaluation Rules Source**: Where should `MonthlyEvaluationInput` come from?
   - Default to nil for now (no evaluation = 1:1 transfer)
   - Future ticket can add evaluation rules to Tariff or create separate entity

2. **On-Demand Calculation**: Should GetMonthSummary calculate if no value exists?
   - Suggest: Return ErrMonthlyValueNotFound and require explicit RecalculateMonth call

3. **TenantID in Service**: Should service methods accept tenantID?
   - Current pattern in DailyCalcService uses tenantID
   - MonthlyValue has TenantID field
   - Suggest: Get tenantID from employee lookup
