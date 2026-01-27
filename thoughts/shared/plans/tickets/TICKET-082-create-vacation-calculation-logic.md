# TICKET-082: Create Vacation Calculation Logic

**Type**: Calculation
**Effort**: L
**Sprint**: 15 - Vacation
**Dependencies**: TICKET-060, TICKET-123 (employee birth_date), TICKET-129 (HasDisability helper), TICKET-125 (tariff vacation fields), TICKET-131 (tariff model)

## Important Notes

> - **Age calculation** requires `employee.BirthDate` field from TICKET-123/TICKET-129
> - **Disability bonus** requires `employee.HasDisability` field from TICKET-123/TICKET-129
> - **Base vacation days** come from `tariff.AnnualVacationDays` from TICKET-125/TICKET-131
> - **Vacation basis** (calendar/entry date) comes from `tariff.VacationBasis` from TICKET-125/TICKET-131

## Description

Implement vacation entitlement calculation logic including ZMI special calculations for age, tenure, and disability.

## ZMI Reference

> "Im Reiter Urlaubsberechnung können Sie einstellen, ob sich die Urlaubsberechnung auf das Kalenderjahr oder das Eintrittsdatum bezieht."

> "Sonderberechnung Alter: In der Beispielberechnung soll sich der Urlaubsanspruch um zwei Tag erhöhen, wenn der/die Mitarbeiter/-in älter als 50 Jahre ist."

> "Sonderberechnung Betriebszugehörigkeit: Im Beispiel unten wurde eine Berechnung angelegt, bei der ein/-e Mitarbeiter/-in einen zusätzlichen Urlaubstag erhält, wenn er 5 Jahre im Unternehmen tätig ist."

> "Sonderberechnung Behinderung: Diese Sonderberechnung wird berücksichtigt, sofern im Personalstamm der Haken Schwerbehinderung gesetzt ist."

## Files to Create

- `apps/api/internal/calculation/vacation.go`
- `apps/api/internal/calculation/vacation_test.go`

## Implementation

```go
package calculation

import (
    "time"

    "github.com/shopspring/decimal"
)

// VacationBasis determines how vacation year is calculated
// ZMI: Urlaubsberechnung Basis
type VacationBasis string

const (
    VacationBasisCalendarYear VacationBasis = "calendar_year" // Jan 1 - Dec 31
    VacationBasisEntryDate    VacationBasis = "entry_date"    // Anniversary-based
)

// SpecialCalcType represents types of vacation bonus calculations
// ZMI: Sonderberechnung
type SpecialCalcType string

const (
    SpecialCalcAge       SpecialCalcType = "age"       // Sonderberechnung Alter
    SpecialCalcTenure    SpecialCalcType = "tenure"    // Sonderberechnung Betriebszugehörigkeit
    SpecialCalcDisability SpecialCalcType = "disability" // Sonderberechnung Behinderung
)

// VacationSpecialCalc defines a special vacation bonus rule
// ZMI: Sonderberechnung configuration
type VacationSpecialCalc struct {
    Type      SpecialCalcType
    Threshold int             // Age in years OR tenure in years (ignored for disability)
    BonusDays decimal.Decimal // Additional days to add
}

// VacationCalcInput contains all data needed for vacation calculation
type VacationCalcInput struct {
    // Employee data
    BirthDate         time.Time
    EntryDate         time.Time
    ExitDate          *time.Time
    WeeklyHours       decimal.Decimal
    HasDisability     bool // ZMI: Schwerbehinderung flag

    // Configuration
    BaseVacationDays  decimal.Decimal   // Jahresurlaub from tariff
    StandardWeeklyHours decimal.Decimal // Usually 40
    Basis             VacationBasis
    SpecialCalcs      []VacationSpecialCalc

    // Calculation context
    Year              int
    ReferenceDate     time.Time // Date to calculate age/tenure at
}

// VacationCalcOutput contains calculated vacation results
type VacationCalcOutput struct {
    // Base calculation
    BaseEntitlement     decimal.Decimal
    ProRatedEntitlement decimal.Decimal
    PartTimeAdjustment  decimal.Decimal

    // Special bonuses
    AgeBonus       decimal.Decimal
    TenureBonus    decimal.Decimal
    DisabilityBonus decimal.Decimal

    // Final result
    TotalEntitlement decimal.Decimal

    // Calculation details
    MonthsEmployed int
    AgeAtReference int
    TenureYears    int
}

// CalculateVacation performs full vacation entitlement calculation
func CalculateVacation(input VacationCalcInput) VacationCalcOutput {
    output := VacationCalcOutput{
        BaseEntitlement: input.BaseVacationDays,
    }

    // Calculate reference metrics
    output.AgeAtReference = calculateAge(input.BirthDate, input.ReferenceDate)
    output.TenureYears = calculateTenure(input.EntryDate, input.ReferenceDate)

    // Calculate months employed in the year
    output.MonthsEmployed = calculateMonthsEmployedInYear(
        input.EntryDate,
        input.ExitDate,
        input.Year,
        input.Basis,
    )

    // Step 1: Pro-rate by months employed
    if output.MonthsEmployed < 12 {
        monthFactor := decimal.NewFromInt(int64(output.MonthsEmployed)).Div(decimal.NewFromInt(12))
        output.ProRatedEntitlement = input.BaseVacationDays.Mul(monthFactor)
    } else {
        output.ProRatedEntitlement = input.BaseVacationDays
    }

    // Step 2: Adjust for part-time
    if input.StandardWeeklyHours.GreaterThan(decimal.Zero) {
        partTimeFactor := input.WeeklyHours.Div(input.StandardWeeklyHours)
        output.PartTimeAdjustment = output.ProRatedEntitlement.Mul(partTimeFactor)
    } else {
        output.PartTimeAdjustment = output.ProRatedEntitlement
    }

    // Step 3: Apply special calculations
    for _, special := range input.SpecialCalcs {
        switch special.Type {
        case SpecialCalcAge:
            if output.AgeAtReference >= special.Threshold {
                output.AgeBonus = output.AgeBonus.Add(special.BonusDays)
            }
        case SpecialCalcTenure:
            if output.TenureYears >= special.Threshold {
                output.TenureBonus = output.TenureBonus.Add(special.BonusDays)
            }
        case SpecialCalcDisability:
            if input.HasDisability {
                output.DisabilityBonus = output.DisabilityBonus.Add(special.BonusDays)
            }
        }
    }

    // Step 4: Calculate total
    output.TotalEntitlement = output.PartTimeAdjustment.
        Add(output.AgeBonus).
        Add(output.TenureBonus).
        Add(output.DisabilityBonus)

    // Step 5: Round to half days
    output.TotalEntitlement = roundToHalfDay(output.TotalEntitlement)

    return output
}

// calculateAge returns age in years at reference date
func calculateAge(birthDate, referenceDate time.Time) int {
    years := referenceDate.Year() - birthDate.Year()
    if referenceDate.YearDay() < birthDate.YearDay() {
        years--
    }
    return years
}

// calculateTenure returns tenure in completed years at reference date
func calculateTenure(entryDate, referenceDate time.Time) int {
    if referenceDate.Before(entryDate) {
        return 0
    }
    years := referenceDate.Year() - entryDate.Year()
    if referenceDate.YearDay() < entryDate.YearDay() {
        years--
    }
    return years
}

// calculateMonthsEmployedInYear calculates months employed within a year
func calculateMonthsEmployedInYear(entryDate time.Time, exitDate *time.Time, year int, basis VacationBasis) int {
    var periodStart, periodEnd time.Time

    if basis == VacationBasisCalendarYear {
        periodStart = time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
        periodEnd = time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
    } else {
        // Entry date basis: anniversary year
        periodStart = time.Date(year, entryDate.Month(), entryDate.Day(), 0, 0, 0, 0, time.UTC)
        periodEnd = periodStart.AddDate(1, 0, -1)
    }

    // Adjust for actual employment period
    effectiveStart := periodStart
    if entryDate.After(periodStart) {
        effectiveStart = entryDate
    }

    effectiveEnd := periodEnd
    if exitDate != nil && exitDate.Before(periodEnd) {
        effectiveEnd = *exitDate
    }

    // Not employed in this period
    if effectiveStart.After(effectiveEnd) {
        return 0
    }

    // Count months (round up partial months)
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

// roundToHalfDay rounds to nearest 0.5
func roundToHalfDay(d decimal.Decimal) decimal.Decimal {
    doubled := d.Mul(decimal.NewFromInt(2))
    rounded := doubled.Round(0)
    return rounded.Div(decimal.NewFromInt(2))
}

// CalculateCarryover calculates vacation days to carry over to next year
// ZMI: Kappungsregeln for vacation
func CalculateCarryover(available, maxCarryover decimal.Decimal) decimal.Decimal {
    if available.LessThanOrEqual(decimal.Zero) {
        return decimal.Zero
    }
    if maxCarryover.GreaterThan(decimal.Zero) && available.GreaterThan(maxCarryover) {
        return maxCarryover
    }
    return available
}

// CalculateVacationDeduction calculates days to deduct for a vacation absence
// ZMI: Urlaubsbewertung
func CalculateVacationDeduction(deductionValue decimal.Decimal, durationDays decimal.Decimal) decimal.Decimal {
    // deductionValue comes from day plan (usually 1.0 for day-based tracking)
    return deductionValue.Mul(durationDays)
}
```

## Unit Tests

Table-driven tests covering:

1. **Basic entitlement** - full year, full time
2. **Part-time adjustment** - 50%, 75% weekly hours
3. **Pro-rating** - mid-year entry/exit
4. **Age bonus** - threshold at 50, 55, 60
5. **Tenure bonus** - threshold at 5, 10, 15 years
6. **Disability bonus** - with/without flag
7. **Combined bonuses** - all three apply
8. **Calendar year vs entry date basis**
9. **Rounding to half days**
10. **Carryover limits**

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Sonderberechnung Alter | `SpecialCalcAge` with configurable threshold |
| Sonderberechnung Betriebszugehörigkeit | `SpecialCalcTenure` with configurable threshold |
| Sonderberechnung Behinderung | `SpecialCalcDisability` checks `HasDisability` flag |
| Urlaubsberechnung Basis | `VacationBasis` enum (calendar/entry) |
| Urlaubsbewertung | `CalculateVacationDeduction()` function |
| Kappungsregeln | `CalculateCarryover()` function |

## Acceptance Criteria

- [ ] Supports calendar year and entry date basis
- [ ] Age bonus applied at configurable threshold
- [ ] Tenure bonus applied at configurable threshold
- [ ] Disability bonus applied when flag set
- [ ] Multiple bonuses can stack
- [ ] Pro-rates by months employed
- [ ] Adjusts for part-time hours
- [ ] Rounds to 0.5 days
- [ ] Carryover respects maximum limit
- [ ] `make test` passes
