# TICKET-129: Update Employee Model with ZMI Fields

**Type**: Model Update
**Effort**: S
**Sprint**: 13 - Absence Types
**Dependencies**: TICKET-123 (migration)
**Priority**: CRITICAL (after TICKET-123)

## Description

Update the Employee Go model with the new ZMI fields added in TICKET-123 migration, including helper methods for age and tenure calculations used in vacation special calculations.

## ZMI Reference

> "Sonderberechnung Alter: Der Urlaubsanspruch erhöht sich, wenn der/die Mitarbeiter/-in älter als X Jahre ist." (Section 19)

> "Sonderberechnung Betriebszugehörigkeit: Der Urlaubsanspruch erhöht sich nach X Jahren im Unternehmen." (Section 19)

## Files to Modify

- `apps/api/internal/model/employee.go`

## Files to Create

- `apps/api/internal/model/employee_zmi_test.go`

## Implementation

### Model Updates

```go
// Add to model/employee.go

import (
    "time"

    "github.com/shopspring/decimal"
)

// Add these fields to the Employee struct:

// Birth date for age-based vacation calculation
// ZMI: Sonderberechnung Alter (Geburtsdatum)
BirthDate *time.Time `gorm:"type:date" json:"birth_date,omitempty"`

// Disability flag for vacation bonus
// ZMI: Schwerbehinderung (Sonderberechnung Behinderung)
HasDisability bool `gorm:"default:false" json:"has_disability"`

// Target hours for FromEmployeeMaster day plan setting
// ZMI: Aus Personalstamm holen
TargetHoursDaily   *int             `gorm:"type:int" json:"target_hours_daily,omitempty"`           // Minutes
TargetHoursWeekly  *decimal.Decimal `gorm:"type:decimal(5,2)" json:"target_hours_weekly,omitempty"`  // Hours
TargetHoursMonthly *decimal.Decimal `gorm:"type:decimal(7,2)" json:"target_hours_monthly,omitempty"` // Hours
TargetHoursAnnual  *decimal.Decimal `gorm:"type:decimal(8,2)" json:"target_hours_annual,omitempty"`  // Hours

// Helper methods

// Age returns the employee's age at a given date
// Used for Sonderberechnung Alter
func (e *Employee) Age(atDate time.Time) int {
    if e.BirthDate == nil {
        return 0
    }
    return calculateAge(*e.BirthDate, atDate)
}

// AgeNow returns the employee's current age
func (e *Employee) AgeNow() int {
    return e.Age(time.Now())
}

// TenureYears returns years of employment at a given date
// Used for Sonderberechnung Betriebszugehörigkeit
func (e *Employee) TenureYears(atDate time.Time) int {
    if e.HireDate == nil {
        return 0
    }
    return calculateYears(*e.HireDate, atDate)
}

// TenureYearsNow returns current years of employment
func (e *Employee) TenureYearsNow() int {
    return e.TenureYears(time.Now())
}

// GetTargetHoursDailyMinutes returns daily target in minutes
// Falls back to 0 if not set
func (e *Employee) GetTargetHoursDailyMinutes() int {
    if e.TargetHoursDaily != nil {
        return *e.TargetHoursDaily
    }
    return 0
}

// GetTargetHoursWeekly returns weekly target in hours
func (e *Employee) GetTargetHoursWeekly() decimal.Decimal {
    if e.TargetHoursWeekly != nil {
        return *e.TargetHoursWeekly
    }
    return decimal.Zero
}

// IsEligibleForAgeBonus checks if employee qualifies for age-based vacation bonus
func (e *Employee) IsEligibleForAgeBonus(threshold int, atDate time.Time) bool {
    return e.Age(atDate) >= threshold
}

// IsEligibleForTenureBonus checks if employee qualifies for tenure-based vacation bonus
func (e *Employee) IsEligibleForTenureBonus(threshold int, atDate time.Time) bool {
    return e.TenureYears(atDate) >= threshold
}

// IsEligibleForDisabilityBonus checks if employee has disability flag set
func (e *Employee) IsEligibleForDisabilityBonus() bool {
    return e.HasDisability
}

// Helper function for age calculation (years between two dates)
func calculateAge(birthDate, referenceDate time.Time) int {
    years := referenceDate.Year() - birthDate.Year()

    // Adjust if birthday hasn't occurred yet this year
    birthMonth := birthDate.Month()
    birthDay := birthDate.Day()
    refMonth := referenceDate.Month()
    refDay := referenceDate.Day()

    if refMonth < birthMonth || (refMonth == birthMonth && refDay < birthDay) {
        years--
    }

    if years < 0 {
        return 0
    }
    return years
}

// Helper function for years calculation (tenure)
func calculateYears(startDate, referenceDate time.Time) int {
    if referenceDate.Before(startDate) {
        return 0
    }
    return calculateAge(startDate, referenceDate)
}
```

### Unit Tests

```go
// File: model/employee_zmi_test.go
package model

import (
    "testing"
    "time"

    "github.com/shopspring/decimal"
    "github.com/stretchr/testify/assert"
)

func TestEmployee_Age(t *testing.T) {
    tests := []struct {
        name       string
        birthDate  *time.Time
        atDate     time.Time
        expectedAge int
    }{
        {
            name:       "age 30",
            birthDate:  timePtr(time.Date(1994, 5, 15, 0, 0, 0, 0, time.UTC)),
            atDate:     time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedAge: 30,
        },
        {
            name:       "birthday not yet occurred this year",
            birthDate:  timePtr(time.Date(1994, 12, 15, 0, 0, 0, 0, time.UTC)),
            atDate:     time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedAge: 29,
        },
        {
            name:       "exactly on birthday",
            birthDate:  timePtr(time.Date(1994, 5, 15, 0, 0, 0, 0, time.UTC)),
            atDate:     time.Date(2024, 5, 15, 0, 0, 0, 0, time.UTC),
            expectedAge: 30,
        },
        {
            name:       "nil birth date",
            birthDate:  nil,
            atDate:     time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedAge: 0,
        },
        {
            name:       "age 50 threshold",
            birthDate:  timePtr(time.Date(1974, 3, 10, 0, 0, 0, 0, time.UTC)),
            atDate:     time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedAge: 50,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            e := &Employee{BirthDate: tt.birthDate}
            assert.Equal(t, tt.expectedAge, e.Age(tt.atDate))
        })
    }
}

func TestEmployee_TenureYears(t *testing.T) {
    tests := []struct {
        name           string
        hireDate       *time.Time
        atDate         time.Time
        expectedTenure int
    }{
        {
            name:           "5 years tenure",
            hireDate:       timePtr(time.Date(2019, 3, 1, 0, 0, 0, 0, time.UTC)),
            atDate:         time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedTenure: 5,
        },
        {
            name:           "anniversary not yet occurred",
            hireDate:       timePtr(time.Date(2019, 9, 15, 0, 0, 0, 0, time.UTC)),
            atDate:         time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedTenure: 4,
        },
        {
            name:           "less than 1 year",
            hireDate:       timePtr(time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)),
            atDate:         time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedTenure: 0,
        },
        {
            name:           "nil hire date",
            hireDate:       nil,
            atDate:         time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedTenure: 0,
        },
        {
            name:           "exactly 10 years",
            hireDate:       timePtr(time.Date(2014, 6, 1, 0, 0, 0, 0, time.UTC)),
            atDate:         time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC),
            expectedTenure: 10,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            e := &Employee{HireDate: tt.hireDate}
            assert.Equal(t, tt.expectedTenure, e.TenureYears(tt.atDate))
        })
    }
}

func TestEmployee_IsEligibleForAgeBonus(t *testing.T) {
    refDate := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)

    tests := []struct {
        name      string
        birthDate *time.Time
        threshold int
        expected  bool
    }{
        {
            name:      "age 50 meets 50 threshold",
            birthDate: timePtr(time.Date(1974, 1, 1, 0, 0, 0, 0, time.UTC)),
            threshold: 50,
            expected:  true,
        },
        {
            name:      "age 49 fails 50 threshold",
            birthDate: timePtr(time.Date(1975, 1, 1, 0, 0, 0, 0, time.UTC)),
            threshold: 50,
            expected:  false,
        },
        {
            name:      "age 55 meets 50 threshold",
            birthDate: timePtr(time.Date(1969, 1, 1, 0, 0, 0, 0, time.UTC)),
            threshold: 50,
            expected:  true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            e := &Employee{BirthDate: tt.birthDate}
            assert.Equal(t, tt.expected, e.IsEligibleForAgeBonus(tt.threshold, refDate))
        })
    }
}

func TestEmployee_IsEligibleForTenureBonus(t *testing.T) {
    refDate := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)

    tests := []struct {
        name      string
        hireDate  *time.Time
        threshold int
        expected  bool
    }{
        {
            name:      "5 years meets 5 threshold",
            hireDate:  timePtr(time.Date(2019, 1, 1, 0, 0, 0, 0, time.UTC)),
            threshold: 5,
            expected:  true,
        },
        {
            name:      "4 years fails 5 threshold",
            hireDate:  timePtr(time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)),
            threshold: 5,
            expected:  false,
        },
        {
            name:      "10 years meets 5 threshold",
            hireDate:  timePtr(time.Date(2014, 1, 1, 0, 0, 0, 0, time.UTC)),
            threshold: 5,
            expected:  true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            e := &Employee{HireDate: tt.hireDate}
            assert.Equal(t, tt.expected, e.IsEligibleForTenureBonus(tt.threshold, refDate))
        })
    }
}

func TestEmployee_IsEligibleForDisabilityBonus(t *testing.T) {
    tests := []struct {
        name          string
        hasDisability bool
        expected      bool
    }{
        {"with disability", true, true},
        {"without disability", false, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            e := &Employee{HasDisability: tt.hasDisability}
            assert.Equal(t, tt.expected, e.IsEligibleForDisabilityBonus())
        })
    }
}

func TestEmployee_GetTargetHoursDailyMinutes(t *testing.T) {
    tests := []struct {
        name     string
        target   *int
        expected int
    }{
        {"with target", intPtr(480), 480},
        {"nil target", nil, 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            e := &Employee{TargetHoursDaily: tt.target}
            assert.Equal(t, tt.expected, e.GetTargetHoursDailyMinutes())
        })
    }
}

func TestEmployee_GetTargetHoursWeekly(t *testing.T) {
    tests := []struct {
        name     string
        target   *decimal.Decimal
        expected decimal.Decimal
    }{
        {"with target", decimalPtr(decimal.NewFromFloat(40.0)), decimal.NewFromFloat(40.0)},
        {"nil target", nil, decimal.Zero},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            e := &Employee{TargetHoursWeekly: tt.target}
            assert.True(t, tt.expected.Equal(e.GetTargetHoursWeekly()))
        })
    }
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
// In calculation/vacation.go CalculateVacation function:
func (s *vacationService) CalculateForEmployee(employee *model.Employee, year int) VacationCalcOutput {
    refDate := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

    input := VacationCalcInput{
        BirthDate:     employee.BirthDate,
        EntryDate:     employee.HireDate,
        HasDisability: employee.HasDisability,
        // ...
    }

    // Check special calculations
    if employee.IsEligibleForAgeBonus(50, refDate) {
        // Add 2 days for age > 50
    }
    if employee.IsEligibleForTenureBonus(5, refDate) {
        // Add 1 day for 5+ years tenure
    }
    if employee.IsEligibleForDisabilityBonus() {
        // Add 5 days for disability
    }
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Geburtsdatum | `BirthDate` field |
| Schwerbehinderung | `HasDisability` field |
| Sonderberechnung Alter | `Age()`, `IsEligibleForAgeBonus()` |
| Sonderberechnung Betriebszugehörigkeit | `TenureYears()`, `IsEligibleForTenureBonus()` |
| Sonderberechnung Behinderung | `IsEligibleForDisabilityBonus()` |
| Aus Personalstamm holen | `TargetHoursDaily`, `GetTargetHoursDailyMinutes()` |

## Acceptance Criteria

- [ ] All new fields added to Employee model
- [ ] `Age()` correctly calculates age at any date
- [ ] `TenureYears()` correctly calculates tenure
- [ ] Bonus eligibility methods work correctly
- [ ] Target hours accessors return defaults for nil
- [ ] All unit tests pass
- [ ] `make test` passes
