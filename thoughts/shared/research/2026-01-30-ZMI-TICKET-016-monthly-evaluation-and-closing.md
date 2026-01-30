# Research: ZMI-TICKET-016 - Monthly Evaluation, Closing, and Flextime Carryover

**Date**: 2026-01-30
**Ticket**: ZMI-TICKET-016

## Summary

This document researches the existing codebase to understand the full implementation of monthly evaluation, closing/reopening, and flextime carryover. The feature is already substantially implemented across the calculation, service, handler, repository, model, migration, and OpenAPI layers. This research documents what exists as-is.

---

## 1. ZMI Reference Manual Analysis

### 1.1 Section 12 - Monatsbewertung (Monthly Evaluation) (Pages 59-60)

**Location**: `thoughts/shared/reference/zmi-calculation-manual-reference.md` lines 1285-1413

#### 12.1 Overview

Original: "Moglicherweise mochten Sie am Monatsende die jeweiligen Uberstunden (Gleitzeitstunden) der Mitarbeitenden bewerten. Zum Beispiel konnen Sie definieren, dass auf dem Gleitzeitkonto nur bis zu 30 Stunden angesammelt werden durfen. Was daruber hinaus geht, soll verfallen (gekappt werden)."

Translation: "You may want to evaluate the respective overtime (flextime hours) of employees at the end of the month. For example, you can define that only up to 30 hours may be accumulated in the flextime account. Anything beyond that should be forfeited (capped)."

#### 12.2 Configuration Fields

The ZMI manual defines four configuration fields for monthly evaluation:

| ZMI Field (German) | ZMI Field (English) | Purpose |
|---|---|---|
| Maximale Gleitzeit im Monat | Maximum flextime in month | Max monthly credit to flextime account |
| Obergrenze Jahreszeitkonto | Upper limit annual time account | Cap for positive balance |
| Untergrenze Jahreszeitkonto | Lower limit annual time account | Floor for negative balance |
| Gleitzeitschwelle | Flextime threshold | Minimum overtime to qualify for credit |

#### 12.3 Credit Types (Art der Gutschrift)

The ZMI manual defines four credit types:

| ZMI Name (German) | ZMI Name (English) | Code | Behavior |
|---|---|---|---|
| Keine Bewertung | No evaluation | `no_evaluation` | 1:1 transfer to next month, no limits applied |
| Gleitzeitubertrag komplett | Complete flextime carryover | `complete_carryover` | Full transfer with monthly cap and annual balance limits |
| Gleitzeitubertrag nach Schwelle | After threshold | `after_threshold` | Credit only overtime exceeding threshold, then apply caps |
| Kein Ubertrag | No carryover | `no_carryover` | Reset annual account to 0 at month end |

### 1.2 Ticket Definition

**Location**: `thoughts/shared/tickets/ZMI-TICKET-016-monthly-evaluation-and-closing.md`

Scope:
- Monthly aggregation of daily values (gross, net, target, overtime, undertime, break)
- Four credit types: no_evaluation, complete_carryover, after_threshold, no_carryover
- Caps: monthly cap, positive/negative balance caps, annual floor
- Month closing freezes results and blocks recalculation
- Reopening allows recalculation with audit
- Endpoints: recalculate, close, reopen, get month summary with warnings
- OpenAPI coverage for credit type semantics and cap fields

Test Cases from ticket:
1. Complete carryover: overtime=600, monthly cap=480 -> credited=480, forfeited=120
2. After threshold: overtime=300, threshold=120 -> credited=180, forfeited=120
3. Close/reopen: close blocks recalculate; reopen allows it

Dependencies: ZMI-TICKET-006 (daily calculation), ZMI-TICKET-018 (tariff definitions), ZMI-TICKET-009 (accounts)

---

## 2. Existing Monthly Value Model

### 2.1 MonthlyValue Model

**File**: `apps/api/internal/model/monthlyvalue.go`

```go
type MonthlyValue struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`

    // Period identification
    Year  int `gorm:"type:int;not null" json:"year"`
    Month int `gorm:"type:int;not null" json:"month"`

    // Aggregated time totals (all in minutes)
    TotalGrossTime  int `gorm:"default:0" json:"total_gross_time"`
    TotalNetTime    int `gorm:"default:0" json:"total_net_time"`
    TotalTargetTime int `gorm:"default:0" json:"total_target_time"`
    TotalOvertime   int `gorm:"default:0" json:"total_overtime"`
    TotalUndertime  int `gorm:"default:0" json:"total_undertime"`
    TotalBreakTime  int `gorm:"default:0" json:"total_break_time"`

    // Flextime balance (all in minutes)
    FlextimeStart     int `gorm:"default:0" json:"flextime_start"`
    FlextimeChange    int `gorm:"default:0" json:"flextime_change"`
    FlextimeEnd       int `gorm:"default:0" json:"flextime_end"`
    FlextimeCarryover int `gorm:"default:0" json:"flextime_carryover"`

    // Absence summary
    VacationTaken    decimal.Decimal `gorm:"type:decimal(5,2);default:0" json:"vacation_taken"`
    SickDays         int             `gorm:"default:0" json:"sick_days"`
    OtherAbsenceDays int             `gorm:"default:0" json:"other_absence_days"`

    // Work summary
    WorkDays       int `gorm:"default:0" json:"work_days"`
    DaysWithErrors int `gorm:"default:0" json:"days_with_errors"`

    // Month closing
    IsClosed   bool       `gorm:"default:false" json:"is_closed"`
    ClosedAt   *time.Time `gorm:"type:timestamptz" json:"closed_at,omitempty"`
    ClosedBy   *uuid.UUID `gorm:"type:uuid" json:"closed_by,omitempty"`
    ReopenedAt *time.Time `gorm:"type:timestamptz" json:"reopened_at,omitempty"`
    ReopenedBy *uuid.UUID `gorm:"type:uuid" json:"reopened_by,omitempty"`

    // Timestamps
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}
```

Helper methods:
- `Balance()` returns `TotalOvertime - TotalUndertime`
- `FormatFlextimeEnd()` returns HH:MM string with sign
- Table name: `monthly_values`

### 2.2 DailyValue Model (Source Data)

**File**: `apps/api/internal/model/dailyvalue.go`

```go
type DailyValue struct {
    ID         uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID        `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID        `gorm:"type:uuid;not null;index" json:"employee_id"`
    ValueDate  time.Time        `gorm:"type:date;not null" json:"value_date"`
    Status     DailyValueStatus `gorm:"type:varchar(20);not null;default:'calculated'" json:"status"`

    // Core time values (all in minutes)
    GrossTime  int `gorm:"default:0" json:"gross_time"`
    NetTime    int `gorm:"default:0" json:"net_time"`
    TargetTime int `gorm:"default:0" json:"target_time"`
    Overtime   int `gorm:"default:0" json:"overtime"`
    Undertime  int `gorm:"default:0" json:"undertime"`
    BreakTime  int `gorm:"default:0" json:"break_time"`

    // Status
    HasError   bool           `gorm:"default:false" json:"has_error"`
    ErrorCodes pq.StringArray `gorm:"type:text[]" json:"error_codes,omitempty"`
    Warnings   pq.StringArray `gorm:"type:text[]" json:"warnings,omitempty"`
    // ...
}
```

The DailyValue model provides the source data that is aggregated by the monthly calculation. Each daily value contains time breakdowns (gross, net, target, overtime, undertime, break) and error tracking (has_error, error_codes) that roll up into the monthly totals.

### 2.3 Tariff Model (Evaluation Configuration)

**File**: `apps/api/internal/model/tariff.go`

The Tariff model stores the ZMI monthly evaluation configuration fields:

```go
type Tariff struct {
    // ... other fields ...

    // ZMI FLEXTIME/MONTHLY EVALUATION FIELDS (Section 5)
    MaxFlextimePerMonth *int       `gorm:"type:int" json:"max_flextime_per_month,omitempty"`
    UpperLimitAnnual    *int       `gorm:"type:int" json:"upper_limit_annual,omitempty"`
    LowerLimitAnnual    *int       `gorm:"type:int" json:"lower_limit_annual,omitempty"`
    FlextimeThreshold   *int       `gorm:"type:int" json:"flextime_threshold,omitempty"`
    CreditType          CreditType `gorm:"type:varchar(20);default:'no_evaluation'" json:"credit_type"`
    // ...
}
```

Credit type constants (defined in `model/tariff.go`):
```go
const (
    CreditTypeNoEvaluation   CreditType = "no_evaluation"
    CreditTypeComplete       CreditType = "complete_carryover"
    CreditTypeAfterThreshold CreditType = "after_threshold"
    CreditTypeNoCarryover    CreditType = "no_carryover"
)
```

Helper method `GetCreditType()` returns the credit type with default `no_evaluation`.

---

## 3. Existing Calculation Layer

### 3.1 Monthly Calculation Types

**File**: `apps/api/internal/calculation/monthly.go`

Input types:

```go
type MonthlyCalcInput struct {
    DailyValues       []DailyValueInput
    PreviousCarryover int                     // Flextime balance from previous month (minutes)
    EvaluationRules   *MonthlyEvaluationInput // ZMI rules (nil = no evaluation)
    AbsenceSummary    AbsenceSummaryInput
}

type DailyValueInput struct {
    Date       string // YYYY-MM-DD reference
    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int
    HasError   bool
}

type MonthlyEvaluationInput struct {
    CreditType          CreditType
    FlextimeThreshold   *int
    MaxFlextimePerMonth *int
    FlextimeCapPositive *int // UpperLimitAnnual
    FlextimeCapNegative *int // LowerLimitAnnual (stored as positive value)
    AnnualFloorBalance  *int
}

type AbsenceSummaryInput struct {
    VacationDays     decimal.Decimal
    SickDays         int
    OtherAbsenceDays int
}
```

Output type:

```go
type MonthlyCalcOutput struct {
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    FlextimeStart     int // PreviousCarryover
    FlextimeChange    int // TotalOvertime - TotalUndertime
    FlextimeRaw       int // FlextimeStart + FlextimeChange
    FlextimeCredited  int // Amount actually credited after rules
    FlextimeForfeited int // Amount forfeited due to rules
    FlextimeEnd       int // Final balance after all rules

    WorkDays       int
    DaysWithErrors int

    VacationTaken    decimal.Decimal
    SickDays         int
    OtherAbsenceDays int

    Warnings []string
}
```

### 3.2 CalculateMonth Function

**File**: `apps/api/internal/calculation/monthly.go`

The `CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput` function performs 5 steps:

1. **Initialize**: Set FlextimeStart from PreviousCarryover, copy absence summary
2. **Aggregate daily values**: Sum all time fields, count work days (GrossTime > 0 || NetTime > 0), count error days
3. **Calculate flextime change**: `FlextimeChange = TotalOvertime - TotalUndertime`
4. **Calculate raw flextime**: `FlextimeRaw = FlextimeStart + FlextimeChange`
5. **Apply credit type rules**: If EvaluationRules is not nil, call `applyCreditType()`; otherwise direct transfer

### 3.3 applyCreditType Implementation

**File**: `apps/api/internal/calculation/monthly.go`

Implements four credit types:

**CreditTypeNoEvaluation**:
- `FlextimeCredited = FlextimeChange`
- `FlextimeEnd = FlextimeRaw`
- `FlextimeForfeited = 0`

**CreditTypeCompleteCarryover**:
1. Start with `credited = FlextimeChange`
2. Apply monthly cap: if `MaxFlextimePerMonth` set and `credited > cap`, forfeit excess, add `WarnCodeMonthlyCap`
3. `FlextimeEnd = FlextimeStart + credited`
4. Apply positive/negative caps via `applyFlextimeCaps()`, add `WarnCodeFlextimeCapped` if capped

**CreditTypeAfterThreshold**:
1. If `FlextimeChange > threshold`: credit excess (`FlextimeChange - threshold`), forfeit threshold amount
2. If `FlextimeChange > 0 but <= threshold`: forfeit all, add `WarnCodeBelowThreshold`
3. If undertime: fully deduct (no threshold applies to undertime)
4. Apply monthly cap (same as CompleteCarryover)
5. Apply positive/negative caps

**CreditTypeNoCarryover**:
- `FlextimeCredited = 0`
- `FlextimeEnd = 0`
- `FlextimeForfeited = FlextimeChange`
- Add `WarnCodeNoCarryover`

### 3.4 applyFlextimeCaps

**File**: `apps/api/internal/calculation/monthly.go`

```go
func applyFlextimeCaps(flextime int, capPositive, capNegative *int) (int, int) {
    forfeited := 0
    if capPositive != nil && flextime > *capPositive {
        forfeited = flextime - *capPositive
        flextime = *capPositive
    }
    if capNegative != nil && flextime < -*capNegative {
        flextime = -*capNegative
    }
    return flextime, forfeited
}
```

Note: Negative cap does not add to forfeited, only positive cap does.

### 3.5 CalculateAnnualCarryover

**File**: `apps/api/internal/calculation/monthly.go`

```go
func CalculateAnnualCarryover(currentBalance, annualFloor *int) int {
    if currentBalance == nil { return 0 }
    balance := *currentBalance
    if annualFloor != nil && balance < -*annualFloor {
        return -*annualFloor
    }
    return balance
}
```

Applies annual floor to year-end carryover. If balance is below the negative floor, the floor is applied.

### 3.6 Warning Codes

**File**: `apps/api/internal/calculation/errors.go`

Monthly-specific warning codes:
```go
WarnCodeMonthlyCap     = "MONTHLY_CAP_REACHED"  // FlextimeCredited capped at monthly max
WarnCodeFlextimeCapped = "FLEXTIME_CAPPED"       // FlextimeEnd hit positive/negative cap
WarnCodeBelowThreshold = "BELOW_THRESHOLD"       // Overtime below threshold, forfeited
WarnCodeNoCarryover    = "NO_CARRYOVER"           // Credit type resets to zero
```

### 3.7 Calculation Tests

**File**: `apps/api/internal/calculation/monthly_test.go`

806 lines of tests organized in 10 groups:
1. **Daily Value Aggregation** (7 tests): Basic sums, empty days, single day, work day counting, error counting
2. **CreditType NoEvaluation** (3 tests): Overtime, undertime, mixed
3. **CreditType CompleteCarryover** (6 tests): No caps, monthly cap, positive cap, negative cap, both caps, undertime
4. **CreditType AfterThreshold** (7 tests): Above/at/below threshold, undertime, nil threshold, with caps
5. **CreditType NoCarryover** (3 tests): Overtime, undertime, with previous balance
6. **Edge Cases** (5 tests): Nil rules, unknown credit type, zero/negative/large previous carryover
7. **Absence Summary** (2 tests): Pass-through, half-day vacation
8. **Warnings** (5 tests): Each warning code, empty by default
9. **CalculateAnnualCarryover** (5 tests): Nil balance, positive no floor, negative above/below floor, nil floor
10. **applyFlextimeCaps** (4 tests): No caps, positive exceeded, negative exceeded, both nil

Helper function: `intPtr(v int) *int` for pointer creation in tests.

---

## 4. Existing Service Layer

### 4.1 MonthlyEvalService

**File**: `apps/api/internal/service/monthlyeval.go` (459 lines)

#### Interface Dependencies

Defines five local interfaces for dependency injection:

```go
type monthlyValueRepoForMonthlyEval interface {
    GetByEmployeeMonth(ctx, employeeID, year, month) (*model.MonthlyValue, error)
    GetPreviousMonth(ctx, employeeID, year, month) (*model.MonthlyValue, error)
    Upsert(ctx, mv *model.MonthlyValue) error
    ListByEmployeeYear(ctx, employeeID, year) ([]model.MonthlyValue, error)
    CloseMonth(ctx, employeeID, year, month, closedBy) error
    ReopenMonth(ctx, employeeID, year, month, reopenedBy) error
}

type dailyValueRepoForMonthlyEval interface {
    GetByEmployeeDateRange(ctx, employeeID, from, to) ([]model.DailyValue, error)
}

type absenceDayRepoForMonthlyEval interface {
    GetByEmployeeDateRange(ctx, employeeID, from, to) ([]model.AbsenceDay, error)
}

type employeeRepoForMonthlyEval interface {
    GetByID(ctx, id) (*model.Employee, error)
}

type tariffRepoForMonthlyEval interface {
    GetByID(ctx, id) (*model.Tariff, error)
}
```

#### Service-Level Types

```go
type MonthSummary struct {
    EmployeeID uuid.UUID
    Year, Month int
    TotalGrossTime, TotalNetTime, TotalTargetTime int
    TotalOvertime, TotalUndertime, TotalBreakTime int
    FlextimeStart, FlextimeChange, FlextimeEnd, FlextimeCarryover int
    VacationTaken decimal.Decimal
    SickDays, OtherAbsenceDays int
    WorkDays, DaysWithErrors int
    IsClosed bool
    ClosedAt *time.Time
    ClosedBy *uuid.UUID
    ReopenedAt *time.Time
    ReopenedBy *uuid.UUID
    Warnings []string
}
```

#### Error Constants

```go
var (
    ErrMonthNotClosed          = errors.New("month is not closed")
    ErrInvalidMonth            = errors.New("invalid month")
    ErrInvalidYearMonth        = errors.New("invalid year or month")
    ErrMonthlyValueNotFound    = errors.New("monthly value not found")
    ErrEmployeeNotFoundForEval = errors.New("employee not found")
)
```

Note: `ErrMonthClosed` is defined in `booking.go` and shared across services.

#### Key Methods

**RecalculateMonth(ctx, employeeID, year, month) error**:
1. Validate year/month
2. Get employee (for tenant ID)
3. Check if month is closed -> return `ErrMonthClosed` if so
4. Get previous month for flextime carryover (`prevMonth.FlextimeEnd`)
5. Get daily values for date range
6. Get absences for date range
7. Fetch tariff from employee's TariffID (non-fatal if not found)
8. Build calculation input via `buildMonthlyCalcInput()`
9. Run `calculation.CalculateMonth()`
10. Build MonthlyValue from output
11. Preserve existing record's ID, CreatedAt, reopen timestamps
12. Upsert via repository

**buildEvaluationRules(tariff) *MonthlyEvaluationInput**:
- Returns nil for `no_evaluation` (direct 1:1 transfer)
- Maps tariff fields: CreditType, FlextimeThreshold, MaxFlextimePerMonth, UpperLimitAnnual->FlextimeCapPositive, LowerLimitAnnual->FlextimeCapNegative

**buildAbsenceSummary(absences) AbsenceSummaryInput**:
- Only counts approved absences (`AbsenceStatusApproved`)
- Categorizes: vacation (adds Duration), illness (ceils Duration), other (increments count)
- Requires preloaded AbsenceType on AbsenceDay

**CloseMonth(ctx, employeeID, year, month, closedBy) error**:
- Validates year/month
- Checks monthly value exists (returns `ErrMonthlyValueNotFound` if not)
- Checks if already closed (returns `ErrMonthClosed` if so)
- Delegates to repository

**ReopenMonth(ctx, employeeID, year, month, reopenedBy) error**:
- Validates year/month
- Checks monthly value exists
- Checks if actually closed (returns `ErrMonthNotClosed` if not)
- Delegates to repository

**GetMonthSummary(ctx, employeeID, year, month) (*MonthSummary, error)**:
- Validates year/month
- Retrieves from repo, converts to MonthSummary
- Returns `ErrMonthlyValueNotFound` if not found

**GetYearOverview(ctx, employeeID, year) ([]MonthSummary, error)**:
- Returns all monthly summaries for a year, ordered by month

**GetDailyBreakdown(ctx, employeeID, year, month) ([]model.DailyValue, error)**:
- Returns daily values for the month's date range

**buildMonthlyValue(tenantID, employeeID, year, month, output, previousCarryover) *model.MonthlyValue**:
- Sets `FlextimeCarryover = FlextimeEnd` (carryover for next month equals this month's end balance)
- Does not set IsClosed, ClosedAt, etc. (those are managed by close/reopen)

### 4.2 MonthlyCalcService

**File**: `apps/api/internal/service/monthlycalc.go` (204 lines)

#### Interface Dependencies

```go
type monthlyEvalServiceForCalc interface {
    RecalculateMonth(ctx, employeeID, year, month) error
    GetMonthSummary(ctx, employeeID, year, month) (*MonthSummary, error)
}

type monthlyValueRepoForCalc interface {
    GetByEmployeeMonth(ctx, employeeID, year, month) (*model.MonthlyValue, error)
}
```

#### Result Types

```go
type MonthlyCalcError struct {
    EmployeeID uuid.UUID
    Year, Month int
    Error string
}

type MonthlyCalcResult struct {
    ProcessedMonths int
    SkippedMonths   int // Months skipped due to being closed
    FailedMonths    int
    Errors          []MonthlyCalcError
}
```

#### Key Methods

**CalculateMonth(ctx, employeeID, year, month) (*model.MonthlyValue, error)**:
- Validates not future month (returns `ErrFutureMonth`)
- Delegates to `evalService.RecalculateMonth()`
- Returns the calculated MonthlyValue from repo

**CalculateMonthBatch(ctx, employeeIDs, year, month) *MonthlyCalcResult**:
- Validates not future month (all fail if future)
- Processes each employee: success increments ProcessedMonths, closed increments SkippedMonths, other errors increment FailedMonths
- Continues on individual errors

**RecalculateFromMonth(ctx, employeeID, startYear, startMonth) *MonthlyCalcResult**:
- Cascading recalculation from start month through current month
- Skips closed months (increments SkippedMonths)
- Continues on errors (increments FailedMonths)
- Handles year boundary (month > 12 rolls to next year)
- Stops when reaching future months

**RecalculateFromMonthBatch(ctx, employeeIDs, startYear, startMonth) *MonthlyCalcResult**:
- Runs `RecalculateFromMonth` for each employee
- Aggregates all results

### 4.3 Service Tests

**File**: `apps/api/internal/service/monthlyeval_test.go` (781 lines)

Mock implementations for all 5 repo interfaces using testify/mock. Comprehensive test coverage:

- `TestMonthlyEvalService_GetMonthSummary_*`: Success, not found, invalid month
- `TestMonthlyEvalService_RecalculateMonth_*`: Success, already closed, with carryover from previous month, employee not found, with tariff evaluation rules
- `TestMonthlyEvalService_CloseMonth_*`: Success, already closed, not found
- `TestMonthlyEvalService_ReopenMonth_*`: Success, not closed, not found
- `TestMonthlyEvalService_GetYearOverview_*`: Success, empty
- `TestMonthlyEvalService_RecalculateWithTariff_*`: CompleteCarryoverCapped, AfterThreshold, NoCarryover, TariffNotFound
- `TestBuildEvaluationRules_*`: NoEvaluation returns nil, CompleteCarryover maps all fields, AfterThreshold maps threshold, NoCarryover maps type
- `TestBuildAbsenceSummary_*`: Mixed absences, only approved counted, nil absence type skipped

Helper `setupRecalculateWithTariff()` creates mock setup for tariff-related tests.

**File**: `apps/api/internal/service/monthlycalc_test.go` (429 lines)

Mock implementations for calc-specific interfaces. Test coverage:

- `TestMonthlyCalcService_CalculateMonth_*`: Success, future month, month closed, current month
- `TestMonthlyCalcService_CalculateMonthBatch_*`: Success, with failures, with closed months, future month
- `TestMonthlyCalcService_RecalculateFromMonth_*`: Success, skips closed months, continues on error, year boundary, current month, future month
- `TestMonthlyCalcService_RecalculateFromMonthBatch_*`: Success, mixed results

---

## 5. Existing Repository Layer

### 5.1 MonthlyValueRepository

**File**: `apps/api/internal/repository/monthlyvalue.go` (200 lines)

GORM-based repository with the following methods:

- **Create(ctx, mv)**: Standard GORM create
- **GetByID(ctx, id)**: Standard GORM first, returns `ErrMonthlyValueNotFound` for not found
- **Update(ctx, mv)**: Standard GORM save
- **Delete(ctx, id)**: Delete with rows affected check
- **GetByEmployeeMonth(ctx, employeeID, year, month)**: Returns nil, nil if not found (not an error)
- **GetPreviousMonth(ctx, employeeID, year, month)**: Handles year boundary (Jan -> Dec previous year), delegates to GetByEmployeeMonth
- **Upsert(ctx, mv)**: Uses `clause.OnConflict` on `(employee_id, year, month)` unique constraint; updates all time and summary fields but NOT close/reopen fields
- **ListByEmployee(ctx, employeeID)**: Ordered by year, month ASC
- **ListByEmployeeYear(ctx, employeeID, year)**: Filtered by year, ordered by month ASC
- **IsMonthClosed(ctx, tenantID, employeeID, date)**: Checks closed status for a date's month; satisfies `monthlyValueLookupForBooking` interface in BookingService
- **CloseMonth(ctx, employeeID, year, month, closedBy)**: Updates `is_closed=true, closed_at=now, closed_by=closedBy`
- **ReopenMonth(ctx, employeeID, year, month, reopenedBy)**: Updates `is_closed=false, reopened_at=now, reopened_by=reopenedBy`

Key pattern: The Upsert deliberately excludes close/reopen fields from the DoUpdates list, so recalculation cannot accidentally overwrite close status.

---

## 6. Existing Handler Layer

### 6.1 MonthlyEvalHandler

**File**: `apps/api/internal/handler/monthlyeval.go` (509 lines)

Handler struct holds:
```go
type MonthlyEvalHandler struct {
    monthlyEvalService *service.MonthlyEvalService
    employeeService    *service.EmployeeService
}
```

#### HTTP Endpoints

| Method | Path | Handler | Description |
|---|---|---|---|
| GET | `/employees/{id}/months/{year}` | GetYearOverview | Year overview with all monthly summaries |
| GET | `/employees/{id}/months/{year}/{month}` | GetMonthSummary | Single month summary |
| GET | `/employees/{id}/months/{year}/{month}/days` | GetDailyBreakdown | Daily values for month |
| POST | `/employees/{id}/months/{year}/{month}/close` | CloseMonth | Close month (requires user) |
| POST | `/employees/{id}/months/{year}/{month}/reopen` | ReopenMonth | Reopen month (requires user) |
| POST | `/employees/{id}/months/{year}/{month}/recalculate` | Recalculate | Recalculate month |

#### Handler Patterns

- URL params parsed via `chi.URLParam(r, "id")`, `chi.URLParam(r, "year")`, `chi.URLParam(r, "month")`
- Tenant context extracted via `middleware.TenantFromContext(r.Context())`
- User context extracted via `auth.UserFromContext(r.Context())` for close/reopen operations
- Employee scope check via `ensureEmployeeScope()` using EmployeeService + DataScope
- Service errors mapped to HTTP status via `handleServiceError()`:
  - `ErrMonthClosed` -> 403 Forbidden
  - `ErrMonthNotClosed` -> 400 Bad Request
  - `ErrInvalidMonth` -> 400 Bad Request
  - `ErrInvalidYearMonth` -> 400 Bad Request
  - `ErrMonthlyValueNotFound` -> 404 Not Found
  - `ErrEmployeeNotFoundForEval` -> 404 Not Found

**Response format**: Uses `map[string]interface{}` for JSON responses via `summaryToResponse()` and `dailyValueToResponse()` helper methods.

**Note**: In `GetMonthSummary`, the `ensureEmployeeScope()` call is duplicated 6 times (lines 51-122). This is a visible bug in the current code.

### 6.2 Route Registration

**File**: `apps/api/internal/handler/routes.go` (lines 552-581)

```go
func RegisterMonthlyEvalRoutes(r chi.Router, h *MonthlyEvalHandler, authz *middleware.AuthorizationMiddleware) {
    permViewReports := permissions.ID("reports.view").String()
    permCalculateMonth := permissions.ID("booking_overview.calculate_month").String()
    r.Route("/employees/{id}/months", func(r chi.Router) {
        // dev mode bypass
        r.Get("/{year}", h.GetYearOverview)
        r.Route("/{year}/{month}", func(r chi.Router) {
            r.Get("/", h.GetMonthSummary)
            r.Get("/days", h.GetDailyBreakdown)
            r.Post("/close", h.CloseMonth)
            r.Post("/reopen", h.ReopenMonth)
            r.Post("/recalculate", h.Recalculate)
        })
        // production with authz
        r.With(authz.RequirePermission(permViewReports)).Get("/{year}", h.GetYearOverview)
        r.Route("/{year}/{month}", func(r chi.Router) {
            r.With(authz.RequirePermission(permViewReports)).Get("/", h.GetMonthSummary)
            r.With(authz.RequirePermission(permViewReports)).Get("/days", h.GetDailyBreakdown)
            r.With(authz.RequirePermission(permViewReports)).Post("/close", h.CloseMonth)
            r.With(authz.RequirePermission(permViewReports)).Post("/reopen", h.ReopenMonth)
            r.With(authz.RequirePermission(permViewReports), authz.RequirePermission(permCalculateMonth)).Post("/recalculate", h.Recalculate)
        })
    })
}
```

Permissions used:
- `reports.view` - Required for all monthly evaluation endpoints
- `booking_overview.calculate_month` - Additionally required for recalculate

---

## 7. Existing Database Migration

### 7.1 Monthly Values Migration

**File**: `db/migrations/000028_create_monthly_values.up.sql`

```sql
CREATE TABLE monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL,
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    total_overtime INT DEFAULT 0,
    total_undertime INT DEFAULT 0,
    total_break_time INT DEFAULT 0,
    flextime_start INT DEFAULT 0,
    flextime_change INT DEFAULT 0,
    flextime_end INT DEFAULT 0,
    flextime_carryover INT DEFAULT 0,
    vacation_taken DECIMAL(5,2) DEFAULT 0,
    sick_days INT DEFAULT 0,
    other_absence_days INT DEFAULT 0,
    work_days INT DEFAULT 0,
    days_with_errors INT DEFAULT 0,
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, year, month)
);
```

Indexes:
- `idx_monthly_values_tenant` on `tenant_id`
- `idx_monthly_values_employee` on `employee_id`
- `idx_monthly_values_lookup` on `(employee_id, year, month)` - primary lookup pattern
- `idx_monthly_values_period` on `(year, month)` - period-based queries

Trigger: `update_monthly_values_updated_at` for automatic `updated_at` maintenance.

Column comments document all fields with their meaning and units.

---

## 8. Existing OpenAPI Specifications

### 8.1 Monthly Evaluations Paths

**File**: `api/paths/monthly-evaluations.yaml`

This file defines CRUD endpoints for monthly evaluation **templates** (configuration), NOT the per-employee monthly evaluation results. Endpoints:

- `GET /monthly-evaluations` - List evaluation templates
- `POST /monthly-evaluations` - Create evaluation template
- `GET /monthly-evaluations/default` - Get default template
- `GET /monthly-evaluations/{id}` - Get template by ID
- `PUT /monthly-evaluations/{id}` - Update template
- `DELETE /monthly-evaluations/{id}` - Delete template
- `POST /monthly-evaluations/{id}/set-default` - Set as default

### 8.2 Monthly Evaluations Schema

**File**: `api/schemas/monthly-evaluations.yaml`

Template schema with fields: name, description, flextime_cap_positive, flextime_cap_negative, overtime_threshold, max_carryover_vacation, is_default, is_active.

### 8.3 Monthly Values Paths

**File**: `api/paths/monthly-values.yaml`

Defines the per-employee monthly value endpoints:

- `GET /monthly-values` - List monthly values (filters: employee_id, year, month, status, department_id)
- `GET /monthly-values/{id}` - Get monthly value by ID
- `POST /monthly-values/{id}/close` - Close month
- `POST /monthly-values/{id}/reopen` - Reopen month
- `POST /monthly-values/close-batch` - Batch close for multiple employees
- `POST /monthly-values/recalculate` - Trigger recalculation

### 8.4 Monthly Values Schema

**File**: `api/schemas/monthly-values.yaml`

MonthlyValue schema includes: id, tenant_id, employee_id, year, month, status (open/calculated/closed/exported), target_minutes, gross_minutes, break_minutes, net_minutes, overtime_minutes, undertime_minutes, balance_minutes, working_days, worked_days, absence_days, holiday_days, account_balances, calculated_at, closed_at, closed_by, employee.

MonthlyEvaluation (running totals) schema includes: cumulative_balance_minutes, cumulative_overtime_minutes, cumulative_undertime_minutes, vacation_used_ytd, vacation_remaining, sick_days_ytd.

CloseMonthRequest: recalculate (boolean, default true), notes.
ReopenMonthRequest: reason (string, required, min 10 chars).

Note: The OpenAPI spec defines additional fields not yet in the Go model (status enum, working_days vs worked_days, account_balances, calculated_at) and different field naming conventions (e.g., `target_minutes` in spec vs `total_target_time` in model).

---

## 9. DI Wiring in main.go

**File**: `apps/api/cmd/server/main.go`

```go
// Initialize MonthlyEvalService
monthlyValueRepo := repository.NewMonthlyValueRepository(db)
monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo, tariffRepo)
monthlyEvalHandler := handler.NewMonthlyEvalHandler(monthlyEvalService, employeeService)

// Initialize MonthlyCalcService
monthlyCalcService := service.NewMonthlyCalcService(monthlyEvalService, monthlyValueRepo)
holidayService.SetRecalcServices(recalcService, monthlyCalcService, employeeRepo)
```

The MonthlyCalcService depends on MonthlyEvalService (for RecalculateMonth) and MonthlyValueRepository (for GetByEmployeeMonth).

The HolidayService receives both recalcService (for daily) and monthlyCalcService (for monthly) to trigger cascading recalculations when holidays change.

Route registration:
```go
handler.RegisterMonthlyEvalRoutes(r, monthlyEvalHandler, authzMiddleware)
```

Registered inside the tenant-scoped route group (requires authentication + tenant header).

---

## 10. Key Patterns and Observations

### 10.1 Flextime Carryover Chain

The flextime carryover chain works as follows:
1. `RecalculateMonth` fetches `prevMonth.FlextimeEnd` as `PreviousCarryover`
2. Calculation sets `FlextimeStart = PreviousCarryover`
3. Calculation computes `FlextimeChange = TotalOvertime - TotalUndertime`
4. Credit type rules determine `FlextimeEnd` from `FlextimeStart + credited amount`
5. `buildMonthlyValue` sets `FlextimeCarryover = FlextimeEnd`
6. Next month's recalculation will read this month's `FlextimeEnd` as its carryover

This creates a dependency chain: a change in month N can affect months N+1, N+2, etc. The `RecalculateFromMonth` method handles this cascade.

### 10.2 Close/Reopen State Machine

States:
- **Open**: Default. Recalculation allowed.
- **Closed**: `is_closed=true, closed_at, closed_by` set. Recalculation blocked (`ErrMonthClosed`). Bookings blocked (via `IsMonthClosed` check in BookingService).
- **Reopened**: `is_closed=false, reopened_at, reopened_by` set. Recalculation allowed again.

The Upsert operation preserves close/reopen fields (not in DoUpdates list), so recalculation does not accidentally reset close status.

### 10.3 Interface-Based Dependency Pattern

Both services define narrow local interfaces for each dependency:
- `MonthlyEvalService` defines 5 interfaces (one per repo)
- `MonthlyCalcService` defines 2 interfaces (one for eval service, one for repo)

This enables isolated unit testing with testify mocks.

### 10.4 Dual Route Implementation

The OpenAPI spec defines two separate route families:
1. `/employees/{id}/months/...` - Implemented in handler, uses employee-centric URL pattern
2. `/monthly-values/...` - Defined in OpenAPI spec but handler uses employee-nested routes

The actual Go handler routes follow the employee-nested pattern from `routes.go`, not the flat `/monthly-values/` pattern from the OpenAPI spec.

### 10.5 OpenAPI vs Implementation Gaps

The OpenAPI spec (monthly-values.yaml) includes fields not yet in the Go model:
- `status` enum (open/calculated/closed/exported) vs boolean `is_closed`
- `working_days` (calendar working days) vs `work_days` (days with recorded time)
- `account_balances` (per-account balances)
- `calculated_at` timestamp
- `holiday_days` count

The Go handler uses `map[string]interface{}` for responses rather than generated OpenAPI models, which means the response format is handler-defined rather than spec-driven.

### 10.6 Existing Generated Models

No generated models exist specifically for monthly values/evaluations in the `gen/models/` directory. The handler constructs responses manually using `summaryToResponse()` and `dailyValueToResponse()` methods.

### 10.7 Handler Bug

The `GetMonthSummary` handler in `apps/api/internal/handler/monthlyeval.go` calls `ensureEmployeeScope()` 6 times redundantly (lines 51-122). Only one call is necessary.
