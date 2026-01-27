# Research: NOK-142 - Monthly Aggregation Logic

> Ticket: NOK-142 (TICKET-089)
> Date: 2026-01-24
> Status: Research complete

## 1. DailyValue Model (TICKET-058) - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go`

The DailyValue model is fully implemented with these relevant fields:

```go
type DailyValue struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    ValueDate  time.Time

    // Core time values (all in minutes)
    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int

    // Status
    HasError   bool
    ErrorCodes pq.StringArray
    Warnings   pq.StringArray

    // Booking summary
    FirstCome    *int
    LastGo       *int
    BookingCount int
}
```

Helper method: `Balance() int` returns `Overtime - Undertime`.

## 2. DailyValueRepository (TICKET-058) - EXISTS

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go`

Relevant methods for monthly aggregation:

- `GetByEmployeeDateRange(ctx, employeeID, from, to)` - returns all daily values for a date range, ordered by value_date ASC
- `SumForMonth(ctx, employeeID, year, month)` - SQL aggregation returning `DailyValueSum`

The `DailyValueSum` struct already exists in the repository:

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

## 3. MonthlyValue Model (TICKET-086) - NOT IMPLEMENTED

**Status**: Only described in ticket plan at `thoughts/shared/plans/tickets/TICKET-086-create-monthly-value-model-repository.md`

The model file `apps/api/internal/model/monthlyvalue.go` does NOT exist.
The repository file `apps/api/internal/repository/monthlyvalue.go` does NOT exist.
The migration `db/migrations/000028_create_monthly_values.up.sql` does NOT exist.

Planned model structure from TICKET-086:

```go
type MonthlyValue struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    Year       int
    Month      int

    // Aggregated time values (minutes)
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

    // Month closing
    IsClosed   bool
    ClosedAt   *time.Time
    ClosedBy   *uuid.UUID
    ReopenedAt *time.Time
    ReopenedBy *uuid.UUID
}
```

Planned repository interface includes: `GetPreviousMonth()`, `Upsert()`, `Close()`, `Reopen()`.

## 4. Calculation Package Structure

**Directory**: `/home/tolga/projects/terp/apps/api/internal/calculation/`

Existing files:
- `doc.go` - package documentation (describes pure function approach)
- `types.go` - input/output structs (CalculationInput, CalculationResult, etc.)
- `calculator.go` - Calculator struct with `Calculate(CalculationInput) CalculationResult`
- `pairing.go` - PairBookings function
- `tolerance.go` - ApplyComeTolerance, ApplyGoTolerance
- `rounding.go` - RoundComeTime, RoundGoTime
- `breaks.go` - CalculateBreakDeduction
- `errors.go` - error/warning code constants
- `vacation.go` - CalculateVacation, CalculateCarryover, CalculateVacationDeduction

Key pattern: The package is **pure** (no database/HTTP dependencies). Functions take input structs and return output structs.

## 5. Patterns to Follow

### Pattern A: Standalone Pure Function (vacation.go)

```go
// Input struct with all needed data
type VacationCalcInput struct { ... }

// Output struct with all calculated results
type VacationCalcOutput struct { ... }

// Pure calculation function
func CalculateVacation(input VacationCalcInput) VacationCalcOutput { ... }
```

### Pattern B: Calculator Struct (calculator.go)

```go
type Calculator struct{}
func NewCalculator() *Calculator { return &Calculator{} }
func (c *Calculator) Calculate(input CalculationInput) CalculationResult { ... }
```

### Pattern C: Helper Functions (breaks.go, pairing.go)

```go
func CalculateBreakDeduction(pairs []BookingPair, ...) BreakDeductionResult { ... }
func PairBookings(bookings []BookingInput) PairingResult { ... }
```

The TICKET-089 plan uses **Pattern A** - a standalone pure function `CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput`.

### Test Pattern (calculator_test.go, vacation_test.go)

- Uses `_test` package suffix for external tests (e.g., `package calculation_test`)
- Table-driven tests with `t.Run()`
- Uses `testify/assert` and `testify/require`
- Helper functions like `intPtr(i int) *int` for pointer values

## 6. ZMI Reference: Monthly Evaluation (Monatsbewertung)

**Source**: Section 12, Pages 59-60 of ZMI manual

### 6.1 Configuration Fields

| German Term | English | Purpose |
|---|---|---|
| Maximale Gleitzeit im Monat | Max flextime per month | Monthly credit cap |
| Obergrenze Jahreszeitkonto | Upper limit annual account | Positive balance cap |
| Untergrenze Jahreszeitkonto | Lower limit annual account | Negative balance floor |
| Gleitzeitschwelle | Flextime threshold | Minimum overtime to qualify |
| Art der Gutschrift | Credit type | How overtime is credited |

### 6.2 Credit Types (Art der Gutschrift)

1. **Keine Bewertung** (No evaluation): Existing flextime value is transferred 1:1 to next month
2. **Gleitzeitubertrag komplett** (Complete carryover): Overtime credited with MaxFlextimePerMonth and UpperLimitAnnual caps
3. **Gleitzeitubertrag nach Schwelle** (After threshold): Only overtime above FlextimeThreshold is credited, same caps apply
4. **Kein Ubertrag** (No carryover): Annual account set to 0 at month end

### 6.3 Flextime Offset (Section 22)

Initial flextime balance is set in the previous month's record:
- Flextime start value for March must be entered in February's monthly value
- The `FlextimeCarryover` field on the previous month determines the next month's `FlextimeStart`

### 6.4 Derived Evaluation Logic (from ZMI reference)

```
evaluateMonth(overtime, annualBalance, config):
  NoEvaluation:     return annualBalance + overtime
  Complete:         credit = min(overtime, MaxFlextimePerMonth)
                    newBalance = min(annualBalance + credit, UpperLimitAnnual)
  AfterThreshold:   if overtime < FlextimeThreshold: return annualBalance (forfeited)
                    else: same as Complete
  NoCarryover:      return 0
```

## 7. Dependencies Status

| Dependency | Ticket | Status |
|---|---|---|
| DailyValue model | TICKET-058 | DONE - exists in codebase |
| DailyValue repository | TICKET-058 | DONE - exists with SumForMonth() |
| MonthlyValue migration | TICKET-085 | NOT DONE - no migration file |
| MonthlyValue model/repo | TICKET-086 | NOT DONE - no model/repo files |
| Calculation types | TICKET-060 | DONE - types.go exists |
| Calculation package | TICKET-059 | DONE - full structure exists |
| AbsenceDay model | NOK-135 | DONE - exists in codebase |
| AbsenceType model | NOK-133 | DONE - exists with categories (vacation, illness, special, unpaid) |

## 8. AbsenceType Categories (for counting vacation/sick days)

**File**: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`

```go
const (
    AbsenceCategoryVacation AbsenceCategory = "vacation"
    AbsenceCategoryIllness  AbsenceCategory = "illness"
    AbsenceCategorySpecial  AbsenceCategory = "special"
    AbsenceCategoryUnpaid   AbsenceCategory = "unpaid"
)
```

Helper methods: `IsVacationType()`, `IsIllnessType()`

## 9. TICKET-089 Plan Summary

The ticket plan describes creating:
- `apps/api/internal/calculation/monthly.go`
- `apps/api/internal/calculation/monthly_test.go`

Main function signature:
```go
func CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput
```

Input types:
- `MonthlyCalcInput` - contains DailyValues, PreviousCarryover, EvaluationRules, AbsenceSummary
- `DailyValueInput` - simplified daily value struct for calculation
- `MonthlyEvaluationInput` - ZMI evaluation rules (credit type, thresholds, caps)
- `AbsenceSummaryInput` - vacation days, sick days, other absence days
- `CreditType` enum with 4 types

Output type:
- `MonthlyCalcOutput` - aggregated totals, flextime calculation, work summary, absence copy, warnings

Helper functions:
- `applyCreditType()` - applies ZMI credit type rules
- `applyFlextimeCaps()` - applies positive/negative balance caps
- `CalculateAnnualCarryover()` - year-end carryover with annual floor

## 10. Key Design Decisions in the Plan

1. The monthly calculation is a **pure function** in the calculation package (no DB access)
2. Input uses its own `DailyValueInput` struct (not `model.DailyValue` directly) to decouple from GORM model
3. Absence summary is passed in as pre-computed input (not calculated inside)
4. FlextimeStart comes from `PreviousCarryover` (the caller retrieves from previous month's MonthlyValue)
5. WorkDays counts days where `GrossTime > 0 || NetTime > 0`
6. The function does NOT persist results - that's the service layer's responsibility (TICKET-090)
