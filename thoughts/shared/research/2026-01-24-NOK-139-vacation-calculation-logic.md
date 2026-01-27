# Research: NOK-139 - Vacation Calculation Logic

> **Ticket**: NOK-139 / TICKET-082
> **Date**: 2026-01-24
> **Purpose**: Document existing codebase state for implementing vacation calculation logic

---

## 1. Calculation Package Structure

**Location**: `apps/api/internal/calculation/`

The calculation package is a pure computation package with no database or HTTP dependencies. It operates on input structs and produces output structs.

### Existing Files

| File | Purpose |
|------|---------|
| `doc.go` | Package documentation and usage examples |
| `types.go` | Core types: BookingInput, BreakConfig, DayPlanInput, CalculationInput, BookingPair, CalculationResult |
| `errors.go` | Error codes (ErrCode*) and warning codes (WarnCode*) as string constants |
| `pairing.go` | Booking pairing logic: PairBookings(), CalculateGrossTime(), CalculateBreakTime(), FindFirstCome(), FindLastGo() |
| `tolerance.go` | Tolerance application: ApplyComeTolerance(), ApplyGoTolerance(), ValidateTimeWindow(), ValidateCoreHours() |
| `rounding.go` | Time rounding: RoundTime(), RoundComeTime(), RoundGoTime(), with roundUp/roundDown/roundNearest helpers |
| `breaks.go` | Break deduction: CalculateBreakDeduction(), DeductFixedBreak(), CalculateMinimumBreak(), CalculateNetTime(), CalculateOvertimeUndertime() |
| `calculator.go` | Main Calculator struct with Calculate() method orchestrating the full day calculation pipeline |
| `*_test.go` | Corresponding test files |

### Package Design Principles

1. All time values are in **minutes from midnight** (0-1439)
2. Functions are **stateless and pure** - no side effects
3. The Calculator struct wraps the full pipeline but individual functions are also exported for unit testing
4. Imports used: `github.com/google/uuid`, `github.com/tolga/terp/internal/timeutil`
5. The `github.com/shopspring/decimal` package is available in `go.mod` (v1.4.0) but NOT currently imported by the calculation package (only model uses it)

### Function Patterns

All calculation functions follow this pattern:
- Accept structured input (struct or individual parameters)
- Return structured output (struct with results + warnings/errors)
- No error returns (use result fields for error state)
- Example: `CalculateBreakDeduction(pairs, recordedBreakTime, grossWorkTime, breakConfigs) BreakDeductionResult`

### Test Patterns

Tests use:
- `testing` + `github.com/stretchr/testify/assert` + `require`
- Package: `calculation_test` (external test package)
- Import: `github.com/tolga/terp/internal/calculation`
- Table-driven tests with named subtests
- Helper functions like `intPtr(i int) *int` defined locally in test files

---

## 2. Existing Types in Calculation Package (TICKET-060)

From `apps/api/internal/calculation/types.go`:

```go
// Direction types
type BookingDirection string  // "in", "out"
type BookingCategory string  // "work", "break"

// Break types
type BreakType string  // "fixed", "variable", "minimum"

// Rounding types
type RoundingType string  // "none", "up", "down", "nearest"

// Config structs
type BreakConfig struct { ... }
type RoundingConfig struct { ... }
type ToleranceConfig struct { ... }

// Input structs
type BookingInput struct { ... }
type DayPlanInput struct { ... }
type CalculationInput struct { ... }

// Output structs
type BookingPair struct { ... }
type CalculationResult struct { ... }
```

Key observation: The types defined here are focused on daily time calculations. Vacation calculation will add new types (VacationBasis, SpecialCalcType, VacationSpecialCalc, VacationCalcInput, VacationCalcOutput) to the same package.

---

## 3. Employee Model

**File**: `apps/api/internal/model/employee.go`

### Current Fields Relevant to Vacation

```go
type Employee struct {
    EntryDate           time.Time       `gorm:"type:date;not null"`
    ExitDate            *time.Time      `gorm:"type:date"`
    WeeklyHours         decimal.Decimal `gorm:"type:decimal(5,2);default:40.00"`
    VacationDaysPerYear decimal.Decimal `gorm:"type:decimal(5,2);default:30.00"`
}
```

### Helper Methods

```go
func (e *Employee) IsEmployed() bool  // Checks ExitDate
```

### Missing Fields (Dependencies NOT Yet Implemented)

Per TICKET-123 migration and TICKET-129 model update (planned, not yet in codebase):

| Field | Type | Purpose |
|-------|------|---------|
| `BirthDate` | `*time.Time` | Age-based vacation bonus (Sonderberechnung Alter) |
| `HasDisability` | `bool` | Disability vacation bonus (Sonderberechnung Behinderung) |
| `TargetHoursDaily` | `*int` | FromEmployeeMaster day plan setting |
| `TargetHoursWeekly` | `*decimal.Decimal` | Weekly target hours |
| `TargetHoursMonthly` | `*decimal.Decimal` | Monthly target hours |
| `TargetHoursAnnual` | `*decimal.Decimal` | Annual target hours |

Planned helper methods (from TICKET-129):
- `Age(atDate time.Time) int`
- `TenureYears(atDate time.Time) int`
- `IsEligibleForAgeBonus(threshold int, atDate time.Time) bool`
- `IsEligibleForTenureBonus(threshold int, atDate time.Time) bool`
- `IsEligibleForDisabilityBonus() bool`

**Status**: These fields and methods do NOT exist yet. The current Employee model only has `EntryDate` (not `HireDate`). The vacation calculation function will need to accept these values as input parameters rather than depending on the model directly.

---

## 4. Tariff Model

**File**: `apps/api/internal/model/tariff.go`

### Current Fields

```go
type Tariff struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description *string
    WeekPlanID  *uuid.UUID
    ValidFrom   *time.Time
    ValidTo     *time.Time
    IsActive    bool
    // Relations
    WeekPlan *WeekPlan
    Breaks   []TariffBreak
}
```

### Missing Fields (Dependencies NOT Yet Implemented)

Per TICKET-125 migration and TICKET-131 model update (planned, not yet in codebase):

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `AnnualVacationDays` | `*decimal.Decimal` | NULL | Base vacation days per year (Jahresurlaub) |
| `WorkDaysPerWeek` | `*int` | 5 | Work days per week (AT pro Woche) |
| `VacationBasis` | `VacationBasis (string)` | `"calendar_year"` | Calendar year vs entry date (Urlaubsberechnung Basis) |

Planned types and helpers (from TICKET-131):
- `VacationBasis` type (string) with `VacationBasisCalendarYear` and `VacationBasisEntryDate` constants
- `GetAnnualVacationDays() decimal.Decimal`
- `GetWorkDaysPerWeek() int`
- `GetVacationBasis() VacationBasis`
- `CalculateProRatedVacation(workDaysActual int) decimal.Decimal`
- `GetVacationYearStart(referenceDate time.Time, hireDate *time.Time) time.Time`
- `GetVacationYearEnd(referenceDate time.Time, hireDate *time.Time) time.Time`

**Status**: These fields and methods do NOT exist yet. The vacation calculation function must define its own VacationBasis type (as planned in TICKET-082 spec) within the calculation package.

---

## 5. VacationBalance Model

**File**: `apps/api/internal/model/vacationbalance.go`

This model already exists and tracks vacation balances per employee per year:

```go
type VacationBalance struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    Year       int

    Entitlement decimal.Decimal  // Annual vacation entitlement in days
    Carryover   decimal.Decimal  // From previous year
    Adjustments decimal.Decimal  // Manual adjustments
    Taken       decimal.Decimal  // Days used

    Employee *Employee
}

func (vb *VacationBalance) Total() decimal.Decimal    // Entitlement + Carryover + Adjustments
func (vb *VacationBalance) Available() decimal.Decimal // Total() - Taken
```

**Migration**: `db/migrations/000027_create_vacation_balances.up.sql` creates the table with a unique constraint on `(employee_id, year)`.

This model is the **consumer** of the vacation calculation logic - the calculated entitlement gets stored as `Entitlement`, carryover gets stored as `Carryover`.

---

## 6. AbsenceType Model (Vacation Context)

**File**: `apps/api/internal/model/absencetype.go`

Relevant fields for vacation:
```go
type AbsenceType struct {
    Category        AbsenceCategory  // "vacation", "illness", "special", "unpaid"
    DeductsVacation bool             // Whether this absence deducts from vacation balance
}

func (at *AbsenceType) IsVacationType() bool  // category == "vacation"
```

---

## 7. ZMI Reference - Vacation Calculation (Section 19)

**File**: `thoughts/shared/reference/zmi-calculataion-manual-reference.md` (note: typo in filename "calculataion")

### Section 19.1 - Calculation Basis (Page 211)

> "Im Reiter Urlaubsberechnung konnen Sie einstellen, ob sich die Urlaubsberechnung auf das Kalenderjahr oder das Eintrittsdatum bezieht."

Two bases:
- **Calendar year** (Kalenderjahr): Jan 1 - Dec 31
- **Entry date** (Eintrittsdatum): Anniversary-based

### Section 19.2 - Special Calculation: Age (Page 212)

> "Sonderberechnung Alter: In der Beispielberechnung soll sich der Urlaubsanspruch um zwei Tag erhohen, wenn der/die Mitarbeiter/-in alter als 50 Jahre ist."

- Configurable age threshold (e.g., 50 years)
- Configurable bonus days (e.g., +2 days)

### Section 19.3 - Special Calculation: Tenure (Page 212)

> "Sonderberechnung Betriebszugehorigkeit: Im Beispiel unten wurde eine Berechnung angelegt, bei der ein/-e Mitarbeiter/-in einen zusatzlichen Urlaubstag erhalt, wenn er 5 Jahre im Unternehmen tatig ist."

- Configurable tenure threshold (e.g., 5 years)
- Configurable bonus days (e.g., +1 day)

### Section 19.4 - Special Calculation: Disability (Page 213)

> "Sonderberechnung Behinderung: Diese Sonderberechnung wird berucksichtigt, sofern im Personalstamm der Haken Schwerbehinderung gesetzt ist. Im Beispiel erhalt ein/-e Mitarbeiter/-in mit Behinderung 5 zusatzliche Urlaubstage im Jahr."

- No threshold - based on HasDisability flag
- Configurable bonus days (e.g., +5 days)

### Section 14.1 - Tariff Vacation Values (Page 85)

> "Im Feld Jahresurlaub tragen Sie den Jahres-Urlaubsanspruch ein (z.B. 30 Tage). Im Feld AT pro Woche hinterlegen Sie die Anzahl der Wochenarbeitstage (z.B. 5)."

### Section 8.2 - Vacation Valuation (Page 46-47)

> "In Urlaubsbewertung tragen Sie den Wert ein, den das Programm bei einem hinterlegten Urlaubstag vom Resturlaubskonto abziehen soll. Hier steht normalerweise eine 1, damit ein Tag abgezogen wird."

### Section 20 - Capping Rules (Page 215-217)

Vacation carryover capping:
- Year-end: Forfeit remaining vacation
- Mid-year: Cap carryover from previous year (e.g., by March 31)
- Individual exceptions possible

---

## 8. Existing TICKET-082 Plan

**File**: `thoughts/shared/plans/tickets/TICKET-082-create-vacation-calculation-logic.md`

The plan defines the complete implementation for:

### Types to Create

```go
type VacationBasis string  // "calendar_year", "entry_date"
type SpecialCalcType string  // "age", "tenure", "disability"

type VacationSpecialCalc struct {
    Type      SpecialCalcType
    Threshold int
    BonusDays decimal.Decimal
}

type VacationCalcInput struct {
    BirthDate, EntryDate, ExitDate, WeeklyHours, HasDisability,
    BaseVacationDays, StandardWeeklyHours, Basis, SpecialCalcs,
    Year, ReferenceDate
}

type VacationCalcOutput struct {
    BaseEntitlement, ProRatedEntitlement, PartTimeAdjustment,
    AgeBonus, TenureBonus, DisabilityBonus, TotalEntitlement,
    MonthsEmployed, AgeAtReference, TenureYears
}
```

### Functions to Create

1. `CalculateVacation(input VacationCalcInput) VacationCalcOutput`
2. `CalculateCarryover(available, maxCarryover decimal.Decimal) decimal.Decimal`
3. `CalculateVacationDeduction(deductionValue, durationDays decimal.Decimal) decimal.Decimal`

### Helper Functions (unexported)

1. `calculateAge(birthDate, referenceDate time.Time) int`
2. `calculateTenure(entryDate, referenceDate time.Time) int`
3. `calculateMonthsEmployedInYear(entryDate, exitDate, year, basis) int`
4. `roundToHalfDay(d decimal.Decimal) decimal.Decimal`

### Calculation Steps (from plan)

1. Calculate reference metrics (age, tenure)
2. Calculate months employed in the year
3. Pro-rate by months employed (if < 12 months)
4. Adjust for part-time (weeklyHours / standardWeeklyHours)
5. Apply special calculations (age, tenure, disability bonuses)
6. Calculate total
7. Round to half days (multiply by 2, round, divide by 2)

---

## 9. Key Observations for Implementation

### Import Requirements

The vacation calculation will need `github.com/shopspring/decimal` which is available in go.mod but NOT currently imported by any file in the calculation package. Other calculation files only use `int` for minutes. This will be the first calculation file using decimal.

### Relationship to Existing Calculator

The vacation calculation is independent of the daily time Calculator. It does not integrate into the Calculate() pipeline. It is a standalone set of functions for vacation entitlement computation.

### Dependency Status

| Dependency | Status | Impact |
|-----------|--------|--------|
| TICKET-060 (Calculation Types) | DONE | types.go exists with core types |
| TICKET-123 (Employee birth_date migration) | NOT DONE | Vacation calc uses input struct, not model directly |
| TICKET-129 (Employee HasDisability helper) | NOT DONE | Vacation calc uses input struct, not model directly |
| TICKET-125 (Tariff vacation fields migration) | NOT DONE | Vacation calc uses input struct, not model directly |

The vacation calculation function is designed to be dependency-free by accepting a `VacationCalcInput` struct. The service layer (not part of this ticket) will be responsible for populating the input from Employee and Tariff models.

### File Placement

New files to create:
- `apps/api/internal/calculation/vacation.go`
- `apps/api/internal/calculation/vacation_test.go`

---

## 10. Module and Import Context

- Go module: `github.com/tolga/terp`
- Calculation package import: `github.com/tolga/terp/internal/calculation`
- Test package name: `calculation_test`
- Decimal import: `github.com/shopspring/decimal`
- Test imports: `github.com/stretchr/testify/assert`, `github.com/stretchr/testify/require`

---

## 11. Test Structure Reference

From `calculator_test.go`, the test style is:
- Individual test functions (not table-driven in calculator_test.go)
- But `breaks_test.go` uses individual functions per scenario
- TICKET-082 plan specifies table-driven tests covering 10 scenarios

Helper in test file:
```go
func intPtr(i int) *int {
    return &i
}
```

---

## 12. Related Existing Code

### VacationBalance Repository

**File**: `apps/api/internal/repository/vacationbalance.go`

Provides CRUD for vacation_balances table. The calculated entitlement from `CalculateVacation()` would be stored via this repository's Create/Update methods (handled by a service layer, not this ticket).

### AbsenceDay Repository

**File**: `apps/api/internal/repository/absenceday_test.go`

Shows `CountByTypeInRange()` method that counts vacation days taken in a date range - used for tracking vacation usage.
