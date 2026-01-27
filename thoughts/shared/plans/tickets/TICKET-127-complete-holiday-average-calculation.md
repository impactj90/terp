# TICKET-127: Complete Holiday Average Calculation

**Type**: Calculation
**Effort**: M
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-070, TICKET-058 (DailyValue repository)
**Priority**: HIGH (completes TICKET-070 TODO)

## Description

Implement the `HolidayCreditAverage` calculation for ZMI holiday credit category 2 (Durchschnittszeit). This calculates the average work time from the previous 13 weeks (excluding holidays and absence days) and uses it as the credit on holidays.

## ZMI Reference

> "Zeitgutschrift an Feiertagen: Kategorie 2 = Durchschnittszeit - Der Durchschnitt der letzten 13 Wochen wird als Gutschrift verwendet." (Section 8.1)

> "Bei der Berechnung werden Feiertage und Fehltage ausgeschlossen, um einen realistischen Arbeitszeitdurchschnitt zu erhalten."

The average is calculated from:
- Previous 13 weeks of work data
- Excluding holidays (category 1, 2, 3)
- Excluding absence days
- Only days with actual bookings count

## Files to Create

- `apps/api/internal/calculation/holiday_average.go`
- `apps/api/internal/calculation/holiday_average_test.go`

## Implementation

```go
package calculation

import (
    "context"
    "time"

    "github.com/google/uuid"
)

// HolidayAverageConfig contains configuration for average calculation
type HolidayAverageConfig struct {
    WeeksToLookback int  // Default: 13 weeks
    MinDaysRequired int  // Minimum days needed for valid average (default: 5)
    ExcludeHolidays bool // Default: true
    ExcludeAbsences bool // Default: true
}

// DefaultHolidayAverageConfig returns the standard ZMI configuration
func DefaultHolidayAverageConfig() HolidayAverageConfig {
    return HolidayAverageConfig{
        WeeksToLookback: 13,
        MinDaysRequired: 5,
        ExcludeHolidays: true,
        ExcludeAbsences: true,
    }
}

// DailyValueForAverage represents a day's data for average calculation
type DailyValueForAverage struct {
    Date       time.Time
    NetTime    int  // Minutes worked
    IsHoliday  bool
    HasAbsence bool
    HasBookings bool // True if actual bookings existed
}

// HolidayAverageResult contains the calculated average
type HolidayAverageResult struct {
    AverageMinutes int
    DaysIncluded   int
    TotalMinutes   int
    IsValid        bool // True if enough days for valid average
    Warning        string
}

// CalculateHolidayAverage calculates the average work time for holiday credit
// ZMI: Zeitgutschrift an Feiertagen - Kategorie 2 (Durchschnittszeit)
func CalculateHolidayAverage(
    dailyValues []DailyValueForAverage,
    config HolidayAverageConfig,
) HolidayAverageResult {
    result := HolidayAverageResult{}

    // Filter days to include in average
    var includedDays []DailyValueForAverage
    for _, dv := range dailyValues {
        // Skip holidays if configured
        if config.ExcludeHolidays && dv.IsHoliday {
            continue
        }

        // Skip absences if configured
        if config.ExcludeAbsences && dv.HasAbsence {
            continue
        }

        // Only include days with actual work
        if !dv.HasBookings || dv.NetTime <= 0 {
            continue
        }

        includedDays = append(includedDays, dv)
    }

    result.DaysIncluded = len(includedDays)

    // Check if we have enough days
    if result.DaysIncluded < config.MinDaysRequired {
        result.IsValid = false
        result.Warning = "INSUFFICIENT_DATA_FOR_AVERAGE"
        return result
    }

    // Calculate total and average
    for _, dv := range includedDays {
        result.TotalMinutes += dv.NetTime
    }

    result.AverageMinutes = result.TotalMinutes / result.DaysIncluded
    result.IsValid = true

    return result
}

// HolidayAverageCalculator provides database-backed average calculation
type HolidayAverageCalculator struct {
    dailyValueRepo DailyValueRepository
    holidayRepo    HolidayRepository
    absenceRepo    AbsenceDayRepository
}

// DailyValueRepository interface for fetching daily values
type DailyValueRepository interface {
    GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]DailyValueForAverage, error)
}

// HolidayRepository interface for checking holidays
type HolidayRepository interface {
    GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]time.Time, error)
}

// AbsenceDayRepository interface for checking absences
type AbsenceDayRepository interface {
    GetDatesByEmployeeRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]time.Time, error)
}

func NewHolidayAverageCalculator(
    dvRepo DailyValueRepository,
    hRepo HolidayRepository,
    aRepo AbsenceDayRepository,
) *HolidayAverageCalculator {
    return &HolidayAverageCalculator{
        dailyValueRepo: dvRepo,
        holidayRepo:    hRepo,
        absenceRepo:    aRepo,
    }
}

// CalculateForDate calculates the holiday average for a specific date
func (c *HolidayAverageCalculator) CalculateForDate(
    ctx context.Context,
    tenantID, employeeID uuid.UUID,
    date time.Time,
    config HolidayAverageConfig,
) (HolidayAverageResult, error) {
    // Calculate date range (13 weeks before the target date)
    to := date.AddDate(0, 0, -1) // Day before the holiday
    from := to.AddDate(0, 0, -config.WeeksToLookback*7)

    // Get daily values
    dailyValues, err := c.dailyValueRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
    if err != nil {
        return HolidayAverageResult{}, err
    }

    // Get holidays in range
    holidays, err := c.holidayRepo.GetByDateRange(ctx, tenantID, from, to)
    if err != nil {
        return HolidayAverageResult{}, err
    }
    holidaySet := make(map[string]bool)
    for _, h := range holidays {
        holidaySet[h.Format("2006-01-02")] = true
    }

    // Get absences in range
    absences, err := c.absenceRepo.GetDatesByEmployeeRange(ctx, employeeID, from, to)
    if err != nil {
        return HolidayAverageResult{}, err
    }
    absenceSet := make(map[string]bool)
    for _, a := range absences {
        absenceSet[a.Format("2006-01-02")] = true
    }

    // Enrich daily values with holiday/absence flags
    for i := range dailyValues {
        dateKey := dailyValues[i].Date.Format("2006-01-02")
        dailyValues[i].IsHoliday = holidaySet[dateKey]
        dailyValues[i].HasAbsence = absenceSet[dateKey]
    }

    return CalculateHolidayAverage(dailyValues, config), nil
}

// GetHolidayCreditByCategory returns the appropriate credit based on holiday category
// This integrates with the daily calculation service
func GetHolidayCreditByCategory(
    category int,
    targetTime int,
    averageResult *HolidayAverageResult,
    customCredits map[int]int, // From day plan HolidayCreditCat1/2/3
) int {
    switch category {
    case 1:
        // Category 1: Full target time (Sollzeit)
        if custom, ok := customCredits[1]; ok {
            return custom
        }
        return targetTime

    case 2:
        // Category 2: Average time (Durchschnittszeit)
        if averageResult != nil && averageResult.IsValid {
            return averageResult.AverageMinutes
        }
        // Fallback to custom or target if average not available
        if custom, ok := customCredits[2]; ok {
            return custom
        }
        return targetTime

    case 3:
        // Category 3: No credit or custom value
        if custom, ok := customCredits[3]; ok {
            return custom
        }
        return 0

    default:
        return 0
    }
}
```

## Unit Tests

```go
package calculation

import (
    "testing"
    "time"

    "github.com/stretchr/testify/assert"
)

func TestCalculateHolidayAverage_BasicCase(t *testing.T) {
    // 10 days of work, 480 minutes each = 4800 total, 480 average
    dailyValues := make([]DailyValueForAverage, 10)
    for i := range dailyValues {
        dailyValues[i] = DailyValueForAverage{
            Date:        time.Now().AddDate(0, 0, -i-1),
            NetTime:     480,
            HasBookings: true,
        }
    }

    result := CalculateHolidayAverage(dailyValues, DefaultHolidayAverageConfig())

    assert.True(t, result.IsValid)
    assert.Equal(t, 10, result.DaysIncluded)
    assert.Equal(t, 4800, result.TotalMinutes)
    assert.Equal(t, 480, result.AverageMinutes)
}

func TestCalculateHolidayAverage_VariedWorkTimes(t *testing.T) {
    dailyValues := []DailyValueForAverage{
        {NetTime: 480, HasBookings: true}, // 8h
        {NetTime: 540, HasBookings: true}, // 9h
        {NetTime: 420, HasBookings: true}, // 7h
        {NetTime: 510, HasBookings: true}, // 8.5h
        {NetTime: 450, HasBookings: true}, // 7.5h
    }

    result := CalculateHolidayAverage(dailyValues, DefaultHolidayAverageConfig())

    assert.True(t, result.IsValid)
    assert.Equal(t, 5, result.DaysIncluded)
    assert.Equal(t, 2400, result.TotalMinutes)
    assert.Equal(t, 480, result.AverageMinutes) // 2400/5 = 480
}

func TestCalculateHolidayAverage_ExcludesHolidays(t *testing.T) {
    dailyValues := []DailyValueForAverage{
        {NetTime: 480, HasBookings: true, IsHoliday: false},
        {NetTime: 480, HasBookings: true, IsHoliday: true}, // Should be excluded
        {NetTime: 480, HasBookings: true, IsHoliday: false},
        {NetTime: 480, HasBookings: true, IsHoliday: false},
        {NetTime: 480, HasBookings: true, IsHoliday: false},
        {NetTime: 480, HasBookings: true, IsHoliday: false},
    }

    result := CalculateHolidayAverage(dailyValues, DefaultHolidayAverageConfig())

    assert.True(t, result.IsValid)
    assert.Equal(t, 5, result.DaysIncluded) // Holiday excluded
}

func TestCalculateHolidayAverage_ExcludesAbsences(t *testing.T) {
    dailyValues := []DailyValueForAverage{
        {NetTime: 480, HasBookings: true, HasAbsence: false},
        {NetTime: 480, HasBookings: true, HasAbsence: true}, // Should be excluded
        {NetTime: 480, HasBookings: true, HasAbsence: false},
        {NetTime: 480, HasBookings: true, HasAbsence: false},
        {NetTime: 480, HasBookings: true, HasAbsence: false},
        {NetTime: 480, HasBookings: true, HasAbsence: false},
    }

    result := CalculateHolidayAverage(dailyValues, DefaultHolidayAverageConfig())

    assert.True(t, result.IsValid)
    assert.Equal(t, 5, result.DaysIncluded) // Absence excluded
}

func TestCalculateHolidayAverage_ExcludesZeroWorkDays(t *testing.T) {
    dailyValues := []DailyValueForAverage{
        {NetTime: 480, HasBookings: true},
        {NetTime: 0, HasBookings: false}, // Weekend - no bookings
        {NetTime: 480, HasBookings: true},
        {NetTime: 480, HasBookings: true},
        {NetTime: 480, HasBookings: true},
        {NetTime: 480, HasBookings: true},
    }

    result := CalculateHolidayAverage(dailyValues, DefaultHolidayAverageConfig())

    assert.True(t, result.IsValid)
    assert.Equal(t, 5, result.DaysIncluded) // Zero day excluded
}

func TestCalculateHolidayAverage_InsufficientData(t *testing.T) {
    dailyValues := []DailyValueForAverage{
        {NetTime: 480, HasBookings: true},
        {NetTime: 480, HasBookings: true},
        {NetTime: 480, HasBookings: true},
        // Only 3 days, need 5
    }

    result := CalculateHolidayAverage(dailyValues, DefaultHolidayAverageConfig())

    assert.False(t, result.IsValid)
    assert.Equal(t, "INSUFFICIENT_DATA_FOR_AVERAGE", result.Warning)
    assert.Equal(t, 3, result.DaysIncluded)
}

func TestCalculateHolidayAverage_CustomConfig(t *testing.T) {
    dailyValues := []DailyValueForAverage{
        {NetTime: 480, HasBookings: true},
        {NetTime: 480, HasBookings: true},
        {NetTime: 480, HasBookings: true},
    }

    config := HolidayAverageConfig{
        WeeksToLookback: 4,
        MinDaysRequired: 3, // Lower minimum
        ExcludeHolidays: true,
        ExcludeAbsences: true,
    }

    result := CalculateHolidayAverage(dailyValues, config)

    assert.True(t, result.IsValid) // Now valid with 3 days
    assert.Equal(t, 3, result.DaysIncluded)
}

func TestGetHolidayCreditByCategory(t *testing.T) {
    averageResult := &HolidayAverageResult{
        AverageMinutes: 450,
        IsValid:        true,
    }

    customCredits := map[int]int{
        3: 200, // Custom category 3 credit
    }

    tests := []struct {
        name       string
        category   int
        targetTime int
        expected   int
    }{
        {"category 1 - target", 1, 480, 480},
        {"category 2 - average", 2, 480, 450},
        {"category 3 - custom", 3, 480, 200},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := GetHolidayCreditByCategory(tt.category, tt.targetTime, averageResult, customCredits)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestGetHolidayCreditByCategory_InvalidAverage(t *testing.T) {
    // When average is invalid, category 2 should fall back to target
    invalidAverage := &HolidayAverageResult{
        IsValid: false,
    }

    result := GetHolidayCreditByCategory(2, 480, invalidAverage, nil)
    assert.Equal(t, 480, result) // Falls back to target
}
```

## Integration with TICKET-070

Update the `handleHolidayCredit` function in daily calculation service:

```go
// In service/daily_calc.go
case HolidayCreditAverage:
    // Calculate average from previous 13 weeks
    avgResult, err := s.holidayAvgCalc.CalculateForDate(ctx, tenantID, employeeID, date,
        calculation.DefaultHolidayAverageConfig())
    if err != nil {
        dv.Warnings = append(dv.Warnings, "AVERAGE_CALC_ERROR")
        // Fall back to target
        dv.NetTime = targetTime
    } else if avgResult.IsValid {
        dv.NetTime = avgResult.AverageMinutes
    } else {
        dv.Warnings = append(dv.Warnings, avgResult.Warning)
        // Fall back to target
        dv.NetTime = targetTime
    }
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Durchschnittszeit (Category 2) | `CalculateHolidayAverage()` |
| 13 Wochen Lookback | `WeeksToLookback: 13` config |
| Feiertage ausschließen | `ExcludeHolidays: true` |
| Fehltage ausschließen | `ExcludeAbsences: true` |
| Mindestanzahl Tage | `MinDaysRequired` config |

## Acceptance Criteria

- [ ] Calculates average from previous 13 weeks
- [ ] Excludes holidays from average
- [ ] Excludes absence days from average
- [ ] Only includes days with actual bookings
- [ ] Returns warning when insufficient data
- [ ] Falls back to target time when average invalid
- [ ] Integrates with daily calculation service
- [ ] `make test` passes with all edge cases covered
