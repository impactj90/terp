# TICKET-082: Create Vacation Calculation Logic

**Type**: Calculation
**Effort**: M
**Sprint**: 20 - Vacation Balance
**Dependencies**: TICKET-060

## Description

Implement vacation entitlement calculation logic.

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

const (
    // Standard vacation days for full-time (40h/week)
    StandardVacationDays = 30
    // Standard weekly hours
    StandardWeeklyHours = 40
)

// CalculateEntitlement calculates pro-rated vacation entitlement
// Based on weekly hours and employment period within the year
func CalculateEntitlement(weeklyHours float64, entryDate, exitDate time.Time, year int) decimal.Decimal {
    yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
    yearEnd := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

    // Adjust for entry/exit within year
    effectiveStart := yearStart
    if entryDate.After(yearStart) {
        effectiveStart = entryDate
    }

    effectiveEnd := yearEnd
    if !exitDate.IsZero() && exitDate.Before(yearEnd) {
        effectiveEnd = exitDate
    }

    // If not employed in this year
    if effectiveStart.After(effectiveEnd) {
        return decimal.Zero
    }

    // Calculate months employed (round up partial months)
    monthsEmployed := calculateMonthsEmployed(effectiveStart, effectiveEnd)

    // Pro-rate by months (12 months = full entitlement)
    monthFactor := decimal.NewFromInt(int64(monthsEmployed)).Div(decimal.NewFromInt(12))

    // Pro-rate by weekly hours
    hoursFactor := decimal.NewFromFloat(weeklyHours).Div(decimal.NewFromFloat(StandardWeeklyHours))

    // Calculate base entitlement
    baseEntitlement := decimal.NewFromInt(StandardVacationDays)

    // Final calculation
    entitlement := baseEntitlement.Mul(monthFactor).Mul(hoursFactor)

    // Round to 0.5 days
    return roundToHalfDay(entitlement)
}

func calculateMonthsEmployed(start, end time.Time) int {
    months := 0
    current := start

    for current.Before(end) || current.Equal(end) {
        months++
        current = current.AddDate(0, 1, 0)
    }

    return months
}

func roundToHalfDay(d decimal.Decimal) decimal.Decimal {
    // Multiply by 2, round, divide by 2
    doubled := d.Mul(decimal.NewFromInt(2))
    rounded := doubled.Round(0)
    return rounded.Div(decimal.NewFromInt(2))
}

// CalculateCarryover calculates vacation days to carry over to next year
// Typically limited to a maximum (e.g., 5 days)
func CalculateCarryover(available decimal.Decimal, maxCarryover decimal.Decimal) decimal.Decimal {
    if available.LessThanOrEqual(decimal.Zero) {
        return decimal.Zero
    }
    if available.GreaterThan(maxCarryover) {
        return maxCarryover
    }
    return available
}

// CalculateRemainingAfterAbsence calculates remaining vacation after booking
func CalculateRemainingAfterAbsence(current, deduction decimal.Decimal) decimal.Decimal {
    return current.Sub(deduction)
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/vacation_test.go`

Table-driven tests for vacation calculation using testify/assert:

```go
func TestCalculateEntitlement(t *testing.T) {
    tests := []struct {
        name        string
        weeklyHours float64
        entryDate   time.Time
        exitDate    time.Time
        year        int
        want        decimal.Decimal
    }{
        {
            name:        "full year - full time",
            weeklyHours: 40,
            entryDate:   time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Time{},
            year:        2024,
            want:        decimal.NewFromInt(30),
        },
        {
            name:        "full year - part time 50%",
            weeklyHours: 20,
            entryDate:   time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Time{},
            year:        2024,
            want:        decimal.NewFromInt(15),
        },
        {
            name:        "full year - part time 75%",
            weeklyHours: 30,
            entryDate:   time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Time{},
            year:        2024,
            want:        decimal.NewFromFloat(22.5),
        },
        {
            name:        "mid year entry - July",
            weeklyHours: 40,
            entryDate:   time.Date(2024, 7, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Time{},
            year:        2024,
            want:        decimal.NewFromInt(15),
        },
        {
            name:        "mid year exit - June",
            weeklyHours: 40,
            entryDate:   time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC),
            year:        2024,
            want:        decimal.NewFromInt(15),
        },
        {
            name:        "single month employed",
            weeklyHours: 40,
            entryDate:   time.Date(2024, 12, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Time{},
            year:        2024,
            want:        decimal.NewFromFloat(2.5),
        },
        {
            name:        "not employed in year - entry after year",
            weeklyHours: 40,
            entryDate:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Time{},
            year:        2024,
            want:        decimal.Zero,
        },
        {
            name:        "not employed in year - exit before year",
            weeklyHours: 40,
            entryDate:   time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Date(2023, 12, 31, 0, 0, 0, 0, time.UTC),
            year:        2024,
            want:        decimal.Zero,
        },
        {
            name:        "zero weekly hours",
            weeklyHours: 0,
            entryDate:   time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Time{},
            year:        2024,
            want:        decimal.Zero,
        },
        {
            name:        "rounds to half day",
            weeklyHours: 38,
            entryDate:   time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
            exitDate:    time.Time{},
            year:        2024,
            want:        decimal.NewFromFloat(28.5),
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculateEntitlement(tt.weeklyHours, tt.entryDate, tt.exitDate, tt.year)
            assert.True(t, tt.want.Equal(result), "expected %s, got %s", tt.want, result)
        })
    }
}

func TestCalculateCarryover(t *testing.T) {
    tests := []struct {
        name         string
        available    decimal.Decimal
        maxCarryover decimal.Decimal
        want         decimal.Decimal
    }{
        {
            name:         "under limit",
            available:    decimal.NewFromInt(3),
            maxCarryover: decimal.NewFromInt(5),
            want:         decimal.NewFromInt(3),
        },
        {
            name:         "over limit",
            available:    decimal.NewFromInt(10),
            maxCarryover: decimal.NewFromInt(5),
            want:         decimal.NewFromInt(5),
        },
        {
            name:         "exact limit",
            available:    decimal.NewFromInt(5),
            maxCarryover: decimal.NewFromInt(5),
            want:         decimal.NewFromInt(5),
        },
        {
            name:         "zero available",
            available:    decimal.Zero,
            maxCarryover: decimal.NewFromInt(5),
            want:         decimal.Zero,
        },
        {
            name:         "negative available",
            available:    decimal.NewFromInt(-2),
            maxCarryover: decimal.NewFromInt(5),
            want:         decimal.Zero,
        },
        {
            name:         "zero max carryover",
            available:    decimal.NewFromInt(10),
            maxCarryover: decimal.Zero,
            want:         decimal.Zero,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculateCarryover(tt.available, tt.maxCarryover)
            assert.True(t, tt.want.Equal(result))
        })
    }
}

func TestCalculateRemainingAfterAbsence(t *testing.T) {
    tests := []struct {
        name      string
        current   decimal.Decimal
        deduction decimal.Decimal
        want      decimal.Decimal
    }{
        {
            name:      "normal deduction",
            current:   decimal.NewFromInt(15),
            deduction: decimal.NewFromInt(5),
            want:      decimal.NewFromInt(10),
        },
        {
            name:      "full deduction",
            current:   decimal.NewFromInt(5),
            deduction: decimal.NewFromInt(5),
            want:      decimal.Zero,
        },
        {
            name:      "overdraft - negative balance",
            current:   decimal.NewFromInt(3),
            deduction: decimal.NewFromInt(5),
            want:      decimal.NewFromInt(-2),
        },
        {
            name:      "zero deduction",
            current:   decimal.NewFromInt(15),
            deduction: decimal.Zero,
            want:      decimal.NewFromInt(15),
        },
        {
            name:      "half day deduction",
            current:   decimal.NewFromFloat(15.5),
            deduction: decimal.NewFromFloat(0.5),
            want:      decimal.NewFromInt(15),
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculateRemainingAfterAbsence(tt.current, tt.deduction)
            assert.True(t, tt.want.Equal(result))
        })
    }
}

func TestRoundToHalfDay(t *testing.T) {
    tests := []struct {
        name  string
        input decimal.Decimal
        want  decimal.Decimal
    }{
        {"14.2 rounds to 14", decimal.NewFromFloat(14.2), decimal.NewFromInt(14)},
        {"14.3 rounds to 14.5", decimal.NewFromFloat(14.3), decimal.NewFromFloat(14.5)},
        {"14.7 rounds to 15", decimal.NewFromFloat(14.7), decimal.NewFromFloat(15)},
        {"14.0 stays 14", decimal.NewFromFloat(14.0), decimal.NewFromInt(14)},
        {"14.5 stays 14.5", decimal.NewFromFloat(14.5), decimal.NewFromFloat(14.5)},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := roundToHalfDay(tt.input)
            assert.True(t, tt.want.Equal(result))
        })
    }
}
```

Edge cases covered:
- Zero weekly hours
- Not employed in the specified year
- Single month employment
- Part-time with various percentages
- Negative available balance
- Zero max carryover
- Rounding to half days
- Entry/exit date boundary conditions

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all vacation calculation functions
- [ ] Tests cover edge cases and boundary values
- [ ] Pro-rates by months employed
- [ ] Pro-rates by weekly hours
- [ ] Rounds to 0.5 days
- [ ] Carryover respects maximum limit
