# Implementation Plan: NOK-139 - Vacation Calculation Logic

> **Ticket**: NOK-139 / TICKET-082
> **Date**: 2026-01-24
> **Files to Create**:
> - `apps/api/internal/calculation/vacation.go`
> - `apps/api/internal/calculation/vacation_test.go`

---

## Overview

Implement pure vacation entitlement calculation functions in the existing `calculation` package. This adds vacation-specific types, a main `CalculateVacation` function with pro-rating/part-time/bonus logic, a `CalculateCarryover` function for year-end capping, and a `CalculateVacationDeduction` function for absence tracking. All functions follow the existing package patterns: stateless, pure computation, structured input/output, no database dependencies.

---

## Phase 1: Type Definitions in `vacation.go`

### 1.1 VacationBasis Type

```go
type VacationBasis string

const (
    VacationBasisCalendarYear VacationBasis = "calendar_year"
    VacationBasisEntryDate    VacationBasis = "entry_date"
)
```

- `calendar_year`: Vacation year is Jan 1 - Dec 31
- `entry_date`: Vacation year is anniversary-based (hire date to hire date + 1 year)

### 1.2 SpecialCalcType Type

```go
type SpecialCalcType string

const (
    SpecialCalcAge        SpecialCalcType = "age"
    SpecialCalcTenure     SpecialCalcType = "tenure"
    SpecialCalcDisability SpecialCalcType = "disability"
)
```

Maps to ZMI: Sonderberechnung Alter, Betriebszugehorigkeit, Behinderung.

### 1.3 VacationSpecialCalc Struct

```go
type VacationSpecialCalc struct {
    Type      SpecialCalcType
    Threshold int             // Age in years (age), tenure in years (tenure), ignored for disability
    BonusDays decimal.Decimal // Additional vacation days to add
}
```

### 1.4 VacationCalcInput Struct

```go
type VacationCalcInput struct {
    // Employee data
    BirthDate           time.Time
    EntryDate           time.Time
    ExitDate            *time.Time
    WeeklyHours         decimal.Decimal
    HasDisability       bool

    // Configuration (from tariff)
    BaseVacationDays    decimal.Decimal   // Jahresurlaub
    StandardWeeklyHours decimal.Decimal   // Full-time weekly hours (e.g., 40)
    Basis               VacationBasis     // calendar_year or entry_date
    SpecialCalcs        []VacationSpecialCalc

    // Calculation context
    Year                int
    ReferenceDate       time.Time         // Date to evaluate age/tenure at
}
```

### 1.5 VacationCalcOutput Struct

```go
type VacationCalcOutput struct {
    BaseEntitlement     decimal.Decimal
    ProRatedEntitlement decimal.Decimal
    PartTimeAdjustment  decimal.Decimal

    AgeBonus            decimal.Decimal
    TenureBonus         decimal.Decimal
    DisabilityBonus     decimal.Decimal

    TotalEntitlement    decimal.Decimal

    MonthsEmployed      int
    AgeAtReference      int
    TenureYears         int
}
```

### Import Requirements

This will be the first file in the `calculation` package to import `github.com/shopspring/decimal`. The package is already in `go.mod` (v1.4.0).

```go
import (
    "time"

    "github.com/shopspring/decimal"
)
```

### Verification

- All types compile without errors
- No conflicts with existing types in `types.go`
- `decimal.Decimal` fields use zero-value initialization (already zero by default)

---

## Phase 2: Helper Functions (unexported)

### 2.1 `calculateAge`

```go
func calculateAge(birthDate, referenceDate time.Time) int
```

**Logic**:
- Compute years difference: `referenceDate.Year() - birthDate.Year()`
- If referenceDate has not yet reached the birthday month/day in the current year, subtract 1
- Use month/day comparison (NOT YearDay which breaks across leap year boundaries)

**Edge cases**:
- Leap year birthdays (Feb 29): Compare month and day properly
- Same-year birth and reference: return 0

**Implementation detail** - use proper month/day comparison instead of YearDay():
```go
func calculateAge(birthDate, referenceDate time.Time) int {
    years := referenceDate.Year() - birthDate.Year()
    refMonth, refDay := referenceDate.Month(), referenceDate.Day()
    birthMonth, birthDay := birthDate.Month(), birthDate.Day()
    if refMonth < birthMonth || (refMonth == birthMonth && refDay < birthDay) {
        years--
    }
    if years < 0 {
        return 0
    }
    return years
}
```

### 2.2 `calculateTenure`

```go
func calculateTenure(entryDate, referenceDate time.Time) int
```

**Logic**:
- Same approach as calculateAge but with entryDate
- Return 0 if referenceDate is before entryDate

```go
func calculateTenure(entryDate, referenceDate time.Time) int {
    if referenceDate.Before(entryDate) {
        return 0
    }
    years := referenceDate.Year() - entryDate.Year()
    refMonth, refDay := referenceDate.Month(), referenceDate.Day()
    entryMonth, entryDay := entryDate.Month(), entryDate.Day()
    if refMonth < entryMonth || (refMonth == entryMonth && refDay < entryDay) {
        years--
    }
    if years < 0 {
        return 0
    }
    return years
}
```

### 2.3 `calculateMonthsEmployedInYear`

```go
func calculateMonthsEmployedInYear(entryDate time.Time, exitDate *time.Time, year int, basis VacationBasis) int
```

**Logic**:
1. Determine period start/end based on basis:
   - Calendar year: Jan 1 to Dec 31 of `year`
   - Entry date: Anniversary start to anniversary end (entryDate month/day in `year` to same + 1 year - 1 day)
2. Compute effective start: max(periodStart, entryDate)
3. Compute effective end: min(periodEnd, exitDate) -- if exitDate is nil, use periodEnd
4. If effectiveStart > effectiveEnd, return 0
5. Count full months from effectiveStart to effectiveEnd (partial months rounded up per ZMI convention)
6. Cap at 12

**Month counting approach**:
- Iterate month by month from effectiveStart
- Each month where the employee was present at least partially counts as 1
- Example: Entry July 15, calendar year basis -> months = 6 (Jul through Dec, partial July counts)

```go
func calculateMonthsEmployedInYear(entryDate time.Time, exitDate *time.Time, year int, basis VacationBasis) int {
    var periodStart, periodEnd time.Time

    if basis == VacationBasisCalendarYear {
        periodStart = time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
        periodEnd = time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
    } else {
        periodStart = time.Date(year, entryDate.Month(), entryDate.Day(), 0, 0, 0, 0, time.UTC)
        periodEnd = periodStart.AddDate(1, 0, -1)
    }

    effectiveStart := periodStart
    if entryDate.After(periodStart) {
        effectiveStart = entryDate
    }

    effectiveEnd := periodEnd
    if exitDate != nil && exitDate.Before(periodEnd) {
        effectiveEnd = *exitDate
    }

    if effectiveStart.After(effectiveEnd) {
        return 0
    }

    months := 0
    current := effectiveStart
    for !current.After(effectiveEnd) {
        months++
        current = current.AddDate(0, 1, 0)
    }

    if months > 12 {
        months = 12
    }

    return months
}
```

### 2.4 `roundToHalfDay`

```go
func roundToHalfDay(d decimal.Decimal) decimal.Decimal
```

**Logic**: Round to nearest 0.5:
1. Multiply by 2
2. Round to 0 decimal places (banker's rounding via decimal library)
3. Divide by 2

```go
func roundToHalfDay(d decimal.Decimal) decimal.Decimal {
    two := decimal.NewFromInt(2)
    doubled := d.Mul(two)
    rounded := doubled.Round(0)
    return rounded.Div(two)
}
```

### Verification

- All helper functions are unexported (lowercase)
- Each has clear input/output without side effects
- Edge cases handled (negative ages, pre-employment reference dates, nil exitDate)

---

## Phase 3: Core Calculation Functions (exported)

### 3.1 `CalculateVacation`

```go
func CalculateVacation(input VacationCalcInput) VacationCalcOutput
```

**Calculation Pipeline** (5 steps):

**Step 1 - Reference Metrics**:
- `output.AgeAtReference = calculateAge(input.BirthDate, input.ReferenceDate)`
- `output.TenureYears = calculateTenure(input.EntryDate, input.ReferenceDate)`

**Step 2 - Months Employed**:
- `output.MonthsEmployed = calculateMonthsEmployedInYear(input.EntryDate, input.ExitDate, input.Year, input.Basis)`

**Step 3 - Pro-Rate by Months**:
- Set `output.BaseEntitlement = input.BaseVacationDays`
- If `MonthsEmployed < 12`:
  - `monthFactor = MonthsEmployed / 12`
  - `output.ProRatedEntitlement = BaseVacationDays * monthFactor`
- Else:
  - `output.ProRatedEntitlement = BaseVacationDays`

**Step 4 - Part-Time Adjustment**:
- If `StandardWeeklyHours > 0`:
  - `partTimeFactor = WeeklyHours / StandardWeeklyHours`
  - `output.PartTimeAdjustment = ProRatedEntitlement * partTimeFactor`
- Else:
  - `output.PartTimeAdjustment = ProRatedEntitlement`

**Step 5 - Special Calculations (Bonuses)**:
- Iterate over `input.SpecialCalcs`:
  - `SpecialCalcAge`: If `AgeAtReference >= Threshold`, add `BonusDays` to `output.AgeBonus`
  - `SpecialCalcTenure`: If `TenureYears >= Threshold`, add `BonusDays` to `output.TenureBonus`
  - `SpecialCalcDisability`: If `input.HasDisability`, add `BonusDays` to `output.DisabilityBonus`
- Note: Multiple special calcs of the same type stack (e.g., +1 day at 5 years AND +2 days at 10 years)

**Step 6 - Total**:
- `output.TotalEntitlement = PartTimeAdjustment + AgeBonus + TenureBonus + DisabilityBonus`

**Step 7 - Rounding**:
- `output.TotalEntitlement = roundToHalfDay(output.TotalEntitlement)`

### 3.2 `CalculateCarryover`

```go
func CalculateCarryover(available, maxCarryover decimal.Decimal) decimal.Decimal
```

**Logic** (ZMI Kappungsregeln):
- If `available <= 0`: return `decimal.Zero` (no vacation to carry over)
- If `maxCarryover > 0 && available > maxCarryover`: return `maxCarryover` (cap)
- Else: return `available` (carry all)

Note: `maxCarryover <= 0` means "no limit" (unlimited carryover). A zero value for maxCarryover means no cap is applied.

### 3.3 `CalculateVacationDeduction`

```go
func CalculateVacationDeduction(deductionValue, durationDays decimal.Decimal) decimal.Decimal
```

**Logic** (ZMI Urlaubsbewertung):
- Return `deductionValue * durationDays`
- `deductionValue` is normally 1.0 (deduct 1 day per vacation day)
- Can be fractional for hour-based tracking

### Verification

- All exported functions have doc comments matching ZMI terminology
- Function signatures match the pattern: accept struct/values, return struct/value
- No error returns (consistent with existing package pattern)
- No side effects or external dependencies

---

## Phase 4: Test File `vacation_test.go`

### Package and Imports

```go
package calculation_test

import (
    "testing"
    "time"

    "github.com/shopspring/decimal"
    "github.com/stretchr/testify/assert"

    "github.com/tolga/terp/internal/calculation"
)
```

### Helper Functions

```go
func decimalFromFloat(f float64) decimal.Decimal {
    return decimal.NewFromFloat(f)
}

func dateOf(year int, month time.Month, day int) time.Time {
    return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func timePtr(t time.Time) *time.Time {
    return &t
}
```

### Test Cases for CalculateVacation

Table-driven tests using `[]struct{ name string; input VacationCalcInput; expected checks }`:

#### 4.1 `TestCalculateVacation_BasicFullYear`
- Full year employment (entry Jan 1 2020, no exit)
- 30 base days, 40h weekly, calendar year basis
- No special calcs
- Expected: BaseEntitlement=30, ProRated=30, PartTime=30, Total=30, MonthsEmployed=12

#### 4.2 `TestCalculateVacation_PartTime50Percent`
- Full year, 20h weekly / 40h standard
- Expected: PartTimeAdjustment=15, Total=15

#### 4.3 `TestCalculateVacation_PartTime75Percent`
- Full year, 30h weekly / 40h standard
- Expected: PartTimeAdjustment=22.5, Total=22.5

#### 4.4 `TestCalculateVacation_ProRatedMidYearEntry`
- Entry July 1, calendar year basis, year 2025
- 30 base days, full time
- Expected: MonthsEmployed=6, ProRated=15, Total=15

#### 4.5 `TestCalculateVacation_ProRatedMidYearExit`
- Entry Jan 1 2020, Exit March 31 2025, year 2025
- Expected: MonthsEmployed=3, ProRated=7.5, Total=7.5

#### 4.6 `TestCalculateVacation_AgeBonusApplied`
- Employee born 1975, reference 2025 (age 50)
- Special calc: age threshold 50, +2 days
- Expected: AgeBonus=2, Total=32

#### 4.7 `TestCalculateVacation_AgeBonusBelowThreshold`
- Employee born 1980, reference 2025 (age 45)
- Special calc: age threshold 50, +2 days
- Expected: AgeBonus=0, Total=30

#### 4.8 `TestCalculateVacation_TenureBonusApplied`
- Entry 2015, reference 2025 (10 years tenure)
- Special calc: tenure threshold 5, +1 day
- Expected: TenureBonus=1, Total=31

#### 4.9 `TestCalculateVacation_DisabilityBonusApplied`
- HasDisability=true
- Special calc: disability, +5 days
- Expected: DisabilityBonus=5, Total=35

#### 4.10 `TestCalculateVacation_DisabilityBonusNotApplied`
- HasDisability=false
- Special calc: disability, +5 days
- Expected: DisabilityBonus=0, Total=30

#### 4.11 `TestCalculateVacation_AllBonusesCombined`
- Age 55 (threshold 50: +2), Tenure 10 years (threshold 5: +1), HasDisability (+5)
- 30 base, full time, full year
- Expected: AgeBonus=2, TenureBonus=1, DisabilityBonus=5, Total=38

#### 4.12 `TestCalculateVacation_StackedTenureBonuses`
- Multiple tenure specials: threshold 5 (+1 day), threshold 10 (+2 days)
- Employee tenure: 12 years
- Expected: TenureBonus=3 (both apply), Total=33

#### 4.13 `TestCalculateVacation_EntryDateBasis`
- Entry March 15 2024, basis entry_date, year 2025
- Full year employment, full time
- Expected: MonthsEmployed=12, Total=30

#### 4.14 `TestCalculateVacation_EntryDateBasisPartialYear`
- Entry March 15 2025, basis entry_date, year 2025
- Full time
- Expected: MonthsEmployed based on March 15 to next March 14

#### 4.15 `TestCalculateVacation_RoundingToHalfDay`
- Part-time scenario producing fractional result (e.g., 30 * (25/40) = 18.75 -> rounds to 19.0)
- Verify rounding to nearest 0.5

#### 4.16 `TestCalculateVacation_RoundingDown`
- Scenario that rounds down (e.g., 30 * (22/40) = 16.5 -> stays 16.5)
- 16.5 is already a half-day value

#### 4.17 `TestCalculateVacation_ZeroStandardHours`
- StandardWeeklyHours = 0 (edge case)
- Expected: PartTimeAdjustment = ProRatedEntitlement (no division by zero)

#### 4.18 `TestCalculateVacation_NotYetEmployed`
- Entry date in future (2026), year 2025
- Expected: MonthsEmployed=0, ProRated=0, Total=0

#### 4.19 `TestCalculateVacation_ProRatedWithPartTime`
- Mid-year entry (6 months) + part-time (50%)
- 30 base days: pro-rated to 15, then part-time to 7.5
- Expected: Total=7.5

### Test Cases for CalculateCarryover

#### 4.20 `TestCalculateCarryover`
Table-driven with cases:
- `available=10, maxCarryover=5` -> returns 5 (capped)
- `available=3, maxCarryover=5` -> returns 3 (below cap)
- `available=10, maxCarryover=0` -> returns 10 (no limit when max is 0)
- `available=-5, maxCarryover=10` -> returns 0 (negative available)
- `available=0, maxCarryover=5` -> returns 0 (zero available)
- `available=10, maxCarryover=-1` -> returns 10 (negative max means no limit)

### Test Cases for CalculateVacationDeduction

#### 4.21 `TestCalculateVacationDeduction`
Table-driven with cases:
- `deductionValue=1.0, durationDays=5` -> returns 5 (standard day-based)
- `deductionValue=1.0, durationDays=0.5` -> returns 0.5 (half-day vacation)
- `deductionValue=8.0, durationDays=2` -> returns 16 (hour-based tracking, 8h per day)
- `deductionValue=0, durationDays=5` -> returns 0 (zero deduction value)

### Test Cases for Helper Functions (via exported functions)

Since helpers are unexported, test them indirectly through CalculateVacation:

#### 4.22 `TestCalculateVacation_LeapYearBirthday`
- BirthDate Feb 29 1976, reference March 1 2026
- Verify age = 49 (not yet had birthday in a non-leap year context)

#### 4.23 `TestCalculateVacation_ExactBirthdayMatch`
- BirthDate Jan 15 1975, reference Jan 15 2025
- Verify age = 50 (birthday has occurred)

---

## Phase 5: Verification Steps

### 5.1 Compilation Check
```bash
cd apps/api && go build ./internal/calculation/...
```

### 5.2 Run Tests
```bash
cd apps/api && go test -v -run TestCalculateVacation ./internal/calculation/...
cd apps/api && go test -v -run TestCalculateCarryover ./internal/calculation/...
cd apps/api && go test -v -run TestCalculateVacationDeduction ./internal/calculation/...
```

### 5.3 Full Test Suite
```bash
make test
```

### 5.4 Lint Check
```bash
make lint
```

### 5.5 Format Check
```bash
make fmt
```

---

## Implementation Notes

1. **Import precedent**: This is the first file in `calculation/` to use `github.com/shopspring/decimal`. The package is available in `go.mod` but no other calculation file imports it currently.

2. **Independence from daily calculator**: The vacation calculation does NOT integrate with `Calculator.Calculate()`. It is a standalone set of functions for vacation entitlement computation.

3. **Input struct design**: The `VacationCalcInput` struct decouples from the Employee/Tariff models. The service layer (outside this ticket) populates the input from those models.

4. **Bonus stacking**: Multiple special calcs of the same type are allowed and additive. For example, two tenure bonuses (5 years: +1 day, 10 years: +2 days) stack to +3 days for a 10-year employee.

5. **Month counting**: Partial months count as full months (ZMI convention). An employee who starts July 15 gets 6 months counted for the calendar year (Jul-Dec).

6. **Age/tenure calculation**: Use month/day comparison rather than YearDay() to avoid leap year edge cases.

7. **Zero-value safety**: `decimal.Decimal` zero-value is already `0`, so output struct fields initialize correctly without explicit assignment.

---

## File Structure Summary

### `apps/api/internal/calculation/vacation.go`

```
package calculation

import (time, decimal)

// Types
VacationBasis, constants
SpecialCalcType, constants
VacationSpecialCalc struct
VacationCalcInput struct
VacationCalcOutput struct

// Exported functions
CalculateVacation(input) VacationCalcOutput
CalculateCarryover(available, maxCarryover) decimal.Decimal
CalculateVacationDeduction(deductionValue, durationDays) decimal.Decimal

// Unexported helpers
calculateAge(birthDate, referenceDate) int
calculateTenure(entryDate, referenceDate) int
calculateMonthsEmployedInYear(entryDate, exitDate, year, basis) int
roundToHalfDay(d) decimal.Decimal
```

### `apps/api/internal/calculation/vacation_test.go`

```
package calculation_test

import (testing, time, decimal, testify/assert, calculation)

// Helpers
decimalFromFloat(f) decimal.Decimal
dateOf(year, month, day) time.Time
timePtr(t) *time.Time

// Test functions (~23 test functions covering all scenarios)
TestCalculateVacation_BasicFullYear
TestCalculateVacation_PartTime50Percent
TestCalculateVacation_PartTime75Percent
TestCalculateVacation_ProRatedMidYearEntry
TestCalculateVacation_ProRatedMidYearExit
TestCalculateVacation_AgeBonusApplied
TestCalculateVacation_AgeBonusBelowThreshold
TestCalculateVacation_TenureBonusApplied
TestCalculateVacation_DisabilityBonusApplied
TestCalculateVacation_DisabilityBonusNotApplied
TestCalculateVacation_AllBonusesCombined
TestCalculateVacation_StackedTenureBonuses
TestCalculateVacation_EntryDateBasis
TestCalculateVacation_EntryDateBasisPartialYear
TestCalculateVacation_RoundingToHalfDay
TestCalculateVacation_RoundingDown
TestCalculateVacation_ZeroStandardHours
TestCalculateVacation_NotYetEmployed
TestCalculateVacation_ProRatedWithPartTime
TestCalculateCarryover
TestCalculateVacationDeduction
TestCalculateVacation_LeapYearBirthday
TestCalculateVacation_ExactBirthdayMatch
```

---

## Acceptance Criteria Mapping

| Criteria | Phase | Test |
|----------|-------|------|
| Supports calendar year and entry date basis | Phase 3.1 (Step 2) | 4.1, 4.13, 4.14 |
| Age bonus applied at configurable threshold | Phase 3.1 (Step 5) | 4.6, 4.7 |
| Tenure bonus applied at configurable threshold | Phase 3.1 (Step 5) | 4.8, 4.12 |
| Disability bonus applied when flag set | Phase 3.1 (Step 5) | 4.9, 4.10 |
| Multiple bonuses can stack | Phase 3.1 (Step 5) | 4.11, 4.12 |
| Pro-rates by months employed | Phase 3.1 (Step 3) | 4.4, 4.5, 4.18 |
| Adjusts for part-time hours | Phase 3.1 (Step 4) | 4.2, 4.3, 4.19 |
| Rounds to 0.5 days | Phase 3.1 (Step 7) | 4.15, 4.16 |
| Carryover respects maximum limit | Phase 3.2 | 4.20 |
| `make test` passes | Phase 5.3 | All |
