# TICKET-131: Update Tariff Model with ZMI Fields

**Type**: Model Update
**Effort**: XS
**Sprint**: 15 - Vacation
**Dependencies**: TICKET-125 (migration)
**Priority**: HIGH (after TICKET-125)

## Description

Update the Tariff Go model with the new ZMI fields added in TICKET-125 migration for vacation entitlement configuration.

## ZMI Reference

> "Im Reiter Urlaubsberechnung können Sie einstellen, ob sich die Urlaubsberechnung auf das Kalenderjahr oder das Eintrittsdatum bezieht." (Section 14)

> "Jahresurlaub: Die Anzahl der Urlaubstage pro Jahr" (Section 14)

> "AT pro Woche: Anzahl der Arbeitstage pro Woche" (Section 14)

## Files to Modify

- `apps/api/internal/model/tariff.go`

## Files to Create

- `apps/api/internal/model/tariff_zmi_test.go`

## Implementation

### Model Updates

```go
// Add to model/tariff.go

import (
    "github.com/shopspring/decimal"
)

// VacationBasis determines how vacation year is calculated
// ZMI: Urlaubsberechnung Basis
type VacationBasis string

const (
    // VacationBasisCalendarYear - Jan 1 to Dec 31
    VacationBasisCalendarYear VacationBasis = "calendar_year"

    // VacationBasisEntryDate - Anniversary-based (hire date)
    VacationBasisEntryDate VacationBasis = "entry_date"
)

// Add these fields to the Tariff struct:

// Base annual vacation days for this tariff
// ZMI: Jahresurlaub
AnnualVacationDays *decimal.Decimal `gorm:"type:decimal(5,2)" json:"annual_vacation_days,omitempty"`

// Work days per week (for vacation pro-rating)
// ZMI: AT pro Woche (Arbeitstage pro Woche)
WorkDaysPerWeek *int `gorm:"default:5" json:"work_days_per_week,omitempty"`

// Vacation calculation basis
// ZMI: Urlaubsberechnung Basis
VacationBasis VacationBasis `gorm:"size:20;default:'calendar_year'" json:"vacation_basis"`

// Helper methods

// GetAnnualVacationDays returns the base vacation days, with fallback
func (t *Tariff) GetAnnualVacationDays() decimal.Decimal {
    if t.AnnualVacationDays != nil {
        return *t.AnnualVacationDays
    }
    return decimal.NewFromInt(30) // Default 30 days
}

// GetWorkDaysPerWeek returns work days per week, with fallback
func (t *Tariff) GetWorkDaysPerWeek() int {
    if t.WorkDaysPerWeek != nil {
        return *t.WorkDaysPerWeek
    }
    return 5 // Default 5 days
}

// GetVacationBasis returns the vacation basis, with default
func (t *Tariff) GetVacationBasis() VacationBasis {
    if t.VacationBasis == "" {
        return VacationBasisCalendarYear
    }
    return t.VacationBasis
}

// IsCalendarYearBasis returns true if vacation uses calendar year
func (t *Tariff) IsCalendarYearBasis() bool {
    return t.GetVacationBasis() == VacationBasisCalendarYear
}

// IsEntryDateBasis returns true if vacation uses entry date (anniversary)
func (t *Tariff) IsEntryDateBasis() bool {
    return t.GetVacationBasis() == VacationBasisEntryDate
}

// CalculateProRatedVacation calculates vacation for part-time employee
// workDaysActual: actual work days per week for the employee
func (t *Tariff) CalculateProRatedVacation(workDaysActual int) decimal.Decimal {
    baseDays := t.GetAnnualVacationDays()
    standardDays := t.GetWorkDaysPerWeek()

    if standardDays == 0 || workDaysActual >= standardDays {
        return baseDays
    }

    // Pro-rate: baseDays * (actual / standard)
    ratio := decimal.NewFromInt(int64(workDaysActual)).Div(decimal.NewFromInt(int64(standardDays)))
    return baseDays.Mul(ratio)
}

// GetVacationYearStart returns the start of the vacation year for a given date
// Uses hire date for entry_date basis, Jan 1 for calendar_year basis
func (t *Tariff) GetVacationYearStart(referenceDate time.Time, hireDate *time.Time) time.Time {
    if t.IsEntryDateBasis() && hireDate != nil {
        // Find the most recent anniversary before or on reference date
        year := referenceDate.Year()
        anniversary := time.Date(year, hireDate.Month(), hireDate.Day(), 0, 0, 0, 0, time.UTC)
        if anniversary.After(referenceDate) {
            anniversary = anniversary.AddDate(-1, 0, 0)
        }
        return anniversary
    }

    // Calendar year basis
    return time.Date(referenceDate.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
}

// GetVacationYearEnd returns the end of the vacation year for a given date
func (t *Tariff) GetVacationYearEnd(referenceDate time.Time, hireDate *time.Time) time.Time {
    start := t.GetVacationYearStart(referenceDate, hireDate)
    return start.AddDate(1, 0, -1) // One year minus one day
}
```

### Unit Tests

```go
// File: model/tariff_zmi_test.go
package model

import (
    "testing"
    "time"

    "github.com/shopspring/decimal"
    "github.com/stretchr/testify/assert"
)

func TestTariff_GetAnnualVacationDays(t *testing.T) {
    tests := []struct {
        name     string
        days     *decimal.Decimal
        expected decimal.Decimal
    }{
        {
            name:     "with value",
            days:     decimalPtr(decimal.NewFromFloat(28)),
            expected: decimal.NewFromFloat(28),
        },
        {
            name:     "nil uses default 30",
            days:     nil,
            expected: decimal.NewFromInt(30),
        },
        {
            name:     "decimal value",
            days:     decimalPtr(decimal.NewFromFloat(30.5)),
            expected: decimal.NewFromFloat(30.5),
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            tariff := &Tariff{AnnualVacationDays: tt.days}
            assert.True(t, tt.expected.Equal(tariff.GetAnnualVacationDays()))
        })
    }
}

func TestTariff_GetWorkDaysPerWeek(t *testing.T) {
    tests := []struct {
        name     string
        days     *int
        expected int
    }{
        {"with value 4", intPtr(4), 4},
        {"with value 5", intPtr(5), 5},
        {"nil uses default 5", nil, 5},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            tariff := &Tariff{WorkDaysPerWeek: tt.days}
            assert.Equal(t, tt.expected, tariff.GetWorkDaysPerWeek())
        })
    }
}

func TestTariff_GetVacationBasis(t *testing.T) {
    tests := []struct {
        name     string
        basis    VacationBasis
        expected VacationBasis
    }{
        {"calendar_year", VacationBasisCalendarYear, VacationBasisCalendarYear},
        {"entry_date", VacationBasisEntryDate, VacationBasisEntryDate},
        {"empty uses default", "", VacationBasisCalendarYear},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            tariff := &Tariff{VacationBasis: tt.basis}
            assert.Equal(t, tt.expected, tariff.GetVacationBasis())
        })
    }
}

func TestTariff_IsCalendarYearBasis(t *testing.T) {
    assert.True(t, (&Tariff{VacationBasis: VacationBasisCalendarYear}).IsCalendarYearBasis())
    assert.True(t, (&Tariff{VacationBasis: ""}).IsCalendarYearBasis()) // Default
    assert.False(t, (&Tariff{VacationBasis: VacationBasisEntryDate}).IsCalendarYearBasis())
}

func TestTariff_IsEntryDateBasis(t *testing.T) {
    assert.True(t, (&Tariff{VacationBasis: VacationBasisEntryDate}).IsEntryDateBasis())
    assert.False(t, (&Tariff{VacationBasis: VacationBasisCalendarYear}).IsEntryDateBasis())
    assert.False(t, (&Tariff{VacationBasis: ""}).IsEntryDateBasis())
}

func TestTariff_CalculateProRatedVacation(t *testing.T) {
    tests := []struct {
        name           string
        annualDays     decimal.Decimal
        standardDays   int
        actualDays     int
        expected       decimal.Decimal
    }{
        {
            name:         "full time 5 day week",
            annualDays:   decimal.NewFromInt(30),
            standardDays: 5,
            actualDays:   5,
            expected:     decimal.NewFromInt(30),
        },
        {
            name:         "4 day week",
            annualDays:   decimal.NewFromInt(30),
            standardDays: 5,
            actualDays:   4,
            expected:     decimal.NewFromInt(24), // 30 * 4/5 = 24
        },
        {
            name:         "3 day week",
            annualDays:   decimal.NewFromInt(30),
            standardDays: 5,
            actualDays:   3,
            expected:     decimal.NewFromInt(18), // 30 * 3/5 = 18
        },
        {
            name:         "more than standard (no reduction)",
            annualDays:   decimal.NewFromInt(30),
            standardDays: 5,
            actualDays:   6,
            expected:     decimal.NewFromInt(30), // No increase
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            tariff := &Tariff{
                AnnualVacationDays: &tt.annualDays,
                WorkDaysPerWeek:    &tt.standardDays,
            }
            result := tariff.CalculateProRatedVacation(tt.actualDays)
            assert.True(t, tt.expected.Equal(result), "expected %s, got %s", tt.expected, result)
        })
    }
}

func TestTariff_GetVacationYearStart(t *testing.T) {
    tests := []struct {
        name          string
        basis         VacationBasis
        referenceDate time.Time
        hireDate      *time.Time
        expectedStart time.Time
    }{
        {
            name:          "calendar year basis",
            basis:         VacationBasisCalendarYear,
            referenceDate: time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
            hireDate:      timePtr(time.Date(2020, 3, 1, 0, 0, 0, 0, time.UTC)),
            expectedStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        },
        {
            name:          "entry date basis - after anniversary",
            basis:         VacationBasisEntryDate,
            referenceDate: time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
            hireDate:      timePtr(time.Date(2020, 3, 1, 0, 0, 0, 0, time.UTC)),
            expectedStart: time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC),
        },
        {
            name:          "entry date basis - before anniversary",
            basis:         VacationBasisEntryDate,
            referenceDate: time.Date(2024, 2, 15, 0, 0, 0, 0, time.UTC),
            hireDate:      timePtr(time.Date(2020, 3, 1, 0, 0, 0, 0, time.UTC)),
            expectedStart: time.Date(2023, 3, 1, 0, 0, 0, 0, time.UTC),
        },
        {
            name:          "entry date basis - on anniversary",
            basis:         VacationBasisEntryDate,
            referenceDate: time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC),
            hireDate:      timePtr(time.Date(2020, 3, 1, 0, 0, 0, 0, time.UTC)),
            expectedStart: time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC),
        },
        {
            name:          "entry date basis - nil hire date falls back to calendar",
            basis:         VacationBasisEntryDate,
            referenceDate: time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
            hireDate:      nil,
            expectedStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            tariff := &Tariff{VacationBasis: tt.basis}
            result := tariff.GetVacationYearStart(tt.referenceDate, tt.hireDate)
            assert.Equal(t, tt.expectedStart, result)
        })
    }
}

func TestTariff_GetVacationYearEnd(t *testing.T) {
    tariff := &Tariff{VacationBasis: VacationBasisCalendarYear}
    refDate := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

    end := tariff.GetVacationYearEnd(refDate, nil)
    expected := time.Date(2024, 12, 31, 0, 0, 0, 0, time.UTC)

    assert.Equal(t, expected, end)
}

// Helper functions
func timePtr(t time.Time) *time.Time {
    return &t
}

func intPtr(i int) *int {
    return &i
}

func decimalPtr(d decimal.Decimal) *decimal.Decimal {
    return &d
}
```

## Usage in Vacation Calculation

```go
// In calculation/vacation.go or service/vacation.go
func (s *vacationService) CalculateEntitlement(employee *Employee, tariff *Tariff, year int) VacationEntitlement {
    // Get base vacation days from tariff
    baseDays := tariff.GetAnnualVacationDays()

    // Pro-rate for part-time if needed
    actualWorkDays := employee.WorkDaysPerWeek // From employee record
    if actualWorkDays == 0 {
        actualWorkDays = tariff.GetWorkDaysPerWeek()
    }
    proRatedDays := tariff.CalculateProRatedVacation(actualWorkDays)

    // Determine vacation year
    refDate := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
    yearStart := tariff.GetVacationYearStart(refDate, employee.HireDate)
    yearEnd := tariff.GetVacationYearEnd(refDate, employee.HireDate)

    // Pro-rate for mid-year entry
    if employee.HireDate != nil && employee.HireDate.After(yearStart) {
        // Calculate months in year
        monthsEmployed := countMonthsEmployed(*employee.HireDate, yearEnd)
        proRatedDays = proRatedDays.Mul(decimal.NewFromInt(int64(monthsEmployed))).Div(decimal.NewFromInt(12))
    }

    return VacationEntitlement{
        BaseDays:     baseDays,
        ProRatedDays: proRatedDays,
        YearStart:    yearStart,
        YearEnd:      yearEnd,
    }
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Jahresurlaub | `AnnualVacationDays`, `GetAnnualVacationDays()` |
| AT pro Woche | `WorkDaysPerWeek`, `GetWorkDaysPerWeek()` |
| Urlaubsberechnung Basis | `VacationBasis`, `GetVacationBasis()` |
| Kalenderjahr | `VacationBasisCalendarYear` |
| Eintrittsdatum | `VacationBasisEntryDate` |
| Teilzeit Pro-Ratierung | `CalculateProRatedVacation()` |

## Acceptance Criteria

- [ ] All new fields added to Tariff model
- [ ] VacationBasis enum with calendar_year and entry_date
- [ ] Accessor methods return appropriate defaults
- [ ] `CalculateProRatedVacation()` correctly pro-rates
- [ ] `GetVacationYearStart/End()` respect basis setting
- [ ] All unit tests pass
- [ ] `make test` passes
