# TICKET-121: Create Surcharge Calculation Logic

**Type**: Calculation
**Effort**: M
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-068, TICKET-037, TICKET-096 (account values)

## Integration Notes

> - **Account posting**: Surcharge minutes are posted to their designated accounts via TICKET-096 (Account Values)
> - **Daily flow**: After surcharges are calculated, use account value service to credit the surcharge accounts
> - **Example**: Night work minutes go to "NIGHT_BONUS" account, holiday work to "HOLIDAY_BONUS" account

## Description

Implement surcharge (Zuschlag) calculation for time periods like night shifts and holidays. Surcharges fill designated accounts for time worked within specific time windows.

## ZMI Reference

> "Im Bereich Zuschläge können Konten hinterlegt werden, die zu bestimmten Uhrzeiten gefüllt werden."

> "Der Feiertagszuschlag gilt für den ganzen Tag, wenn es sich um einen Feiertag der Kategorie 1 oder 2 handelt. Von 22:00 Uhr bis 06:00 Uhr wird ein Nachtzuschlag bezahlt. Dieser Zuschlag ist aber nur an einem normalen Arbeitstag und nicht am Feiertag gültig."

> "Hinweis: Die Zuschläge müssen bis 00:00 Uhr bzw. ab 00:00 Uhr eingetragen werden. Ein Eintrag von 22:00 Uhr bis 06:00 Uhr ist ungültig."

## Files to Create

- `apps/api/internal/calculation/surcharge.go`
- `apps/api/internal/calculation/surcharge_test.go`

## Implementation

```go
package calculation

import (
    "github.com/google/uuid"

    "terp/apps/api/internal/model"
)

// SurchargeConfig defines when and how surcharges are applied
// Note: Must be split at midnight - no overnight spans allowed
type SurchargeConfig struct {
    AccountID        uuid.UUID
    AccountCode      string
    TimeFrom         int  // Minutes from midnight (0-1439)
    TimeTo           int  // Minutes from midnight (0-1440, must be > TimeFrom)
    AppliesOnHoliday bool // If false, skipped on holidays
    AppliesOnWorkday bool // If false, only applies on holidays
    HolidayCategories []int // Which holiday categories (1, 2, 3) - empty = all
}

// SurchargeResult contains calculated surcharge for one config
type SurchargeResult struct {
    AccountID   uuid.UUID `json:"account_id"`
    AccountCode string    `json:"account_code"`
    Minutes     int       `json:"minutes"`
}

// SurchargeCalculationResult contains all surcharges for a day
type SurchargeCalculationResult struct {
    Surcharges   []SurchargeResult `json:"surcharges"`
    TotalMinutes int               `json:"total_minutes"`
}

// CalculateSurcharges calculates all surcharges for a day's work periods
// ZMI: Zuschläge calculation
func CalculateSurcharges(
    workPeriods []TimePeriod,      // Work periods in minutes from midnight
    configs []SurchargeConfig,      // Surcharge configurations
    isHoliday bool,                 // Is this day a holiday
    holidayCategory int,            // Holiday category (1, 2, 3) if applicable
) SurchargeCalculationResult {
    result := SurchargeCalculationResult{
        Surcharges: make([]SurchargeResult, 0),
    }

    for _, config := range configs {
        // Check if this surcharge applies today
        if !surchargeApplies(config, isHoliday, holidayCategory) {
            continue
        }

        // Calculate overlap between work periods and surcharge window
        totalMinutes := 0
        for _, period := range workPeriods {
            overlap := calculateOverlap(
                period.Start, period.End,
                config.TimeFrom, config.TimeTo,
            )
            totalMinutes += overlap
        }

        if totalMinutes > 0 {
            result.Surcharges = append(result.Surcharges, SurchargeResult{
                AccountID:   config.AccountID,
                AccountCode: config.AccountCode,
                Minutes:     totalMinutes,
            })
            result.TotalMinutes += totalMinutes
        }
    }

    return result
}

// TimePeriod represents a work period
type TimePeriod struct {
    Start int // Minutes from midnight
    End   int // Minutes from midnight
}

// surchargeApplies checks if a surcharge config applies to this day
func surchargeApplies(config SurchargeConfig, isHoliday bool, holidayCategory int) bool {
    if isHoliday {
        // Check if surcharge applies on holidays
        if !config.AppliesOnHoliday {
            return false
        }
        // Check holiday category filter
        if len(config.HolidayCategories) > 0 {
            found := false
            for _, cat := range config.HolidayCategories {
                if cat == holidayCategory {
                    found = true
                    break
                }
            }
            if !found {
                return false
            }
        }
        return true
    } else {
        // Regular workday
        return config.AppliesOnWorkday
    }
}

// calculateOverlap calculates minutes of overlap between two time periods
func calculateOverlap(start1, end1, start2, end2 int) int {
    overlapStart := max(start1, start2)
    overlapEnd := min(end1, end2)
    if overlapEnd > overlapStart {
        return overlapEnd - overlapStart
    }
    return 0
}

// ValidateSurchargeConfig validates a surcharge configuration
// ZMI: "Die Zuschläge müssen bis 00:00 Uhr bzw. ab 00:00 Uhr eingetragen werden"
func ValidateSurchargeConfig(config SurchargeConfig) []string {
    var errors []string

    // Time bounds check
    if config.TimeFrom < 0 || config.TimeFrom >= 1440 {
        errors = append(errors, "time_from must be between 0 and 1439")
    }
    if config.TimeTo <= 0 || config.TimeTo > 1440 {
        errors = append(errors, "time_to must be between 1 and 1440")
    }

    // Order check
    if config.TimeFrom >= config.TimeTo {
        errors = append(errors, "time_from must be less than time_to (no overnight spans - split at midnight)")
    }

    return errors
}

// SplitOvernightSurcharge splits an overnight surcharge config into two valid configs
// For example: 22:00-06:00 becomes [22:00-00:00, 00:00-06:00]
func SplitOvernightSurcharge(config SurchargeConfig) []SurchargeConfig {
    // If already valid (no overnight), return as-is
    if config.TimeFrom < config.TimeTo {
        return []SurchargeConfig{config}
    }

    // Split at midnight
    eveningConfig := SurchargeConfig{
        AccountID:        config.AccountID,
        AccountCode:      config.AccountCode,
        TimeFrom:         config.TimeFrom,
        TimeTo:           1440, // Midnight
        AppliesOnHoliday: config.AppliesOnHoliday,
        AppliesOnWorkday: config.AppliesOnWorkday,
        HolidayCategories: config.HolidayCategories,
    }

    morningConfig := SurchargeConfig{
        AccountID:        config.AccountID,
        AccountCode:      config.AccountCode,
        TimeFrom:         0, // Midnight
        TimeTo:           config.TimeTo,
        AppliesOnHoliday: config.AppliesOnHoliday,
        AppliesOnWorkday: config.AppliesOnWorkday,
        HolidayCategories: config.HolidayCategories,
    }

    return []SurchargeConfig{eveningConfig, morningConfig}
}

// ConvertBonusesToSurchargeConfigs converts DayPlanBonus records to SurchargeConfig
func ConvertBonusesToSurchargeConfigs(bonuses []model.DayPlanBonus) []SurchargeConfig {
    configs := make([]SurchargeConfig, 0, len(bonuses))

    for _, bonus := range bonuses {
        config := SurchargeConfig{
            AccountID:        bonus.AccountID,
            TimeFrom:         bonus.TimeFrom,
            TimeTo:           bonus.TimeTo,
            AppliesOnHoliday: bonus.AppliesOnHoliday,
            AppliesOnWorkday: !bonus.AppliesOnHoliday, // If not holiday-specific, apply on workdays
        }

        if bonus.Account != nil {
            config.AccountCode = bonus.Account.Code
        }

        configs = append(configs, config)
    }

    return configs
}

// Helper functions
func max(a, b int) int {
    if a > b {
        return a
    }
    return b
}

func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}
```

## Unit Tests

```go
package calculation

import (
    "testing"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
)

func TestCalculateSurcharges_NightShift(t *testing.T) {
    nightAccountID := uuid.New()

    // ZMI example: Night surcharge 22:00-00:00 (split at midnight)
    configs := []SurchargeConfig{
        {
            AccountID:        nightAccountID,
            AccountCode:      "NIGHT",
            TimeFrom:         1320, // 22:00
            TimeTo:           1440, // 00:00 (midnight)
            AppliesOnWorkday: true,
            AppliesOnHoliday: false,
        },
    }

    // Work period: 20:00 - 23:00 (3 hours)
    workPeriods := []TimePeriod{
        {Start: 1200, End: 1380}, // 20:00 - 23:00
    }

    result := CalculateSurcharges(workPeriods, configs, false, 0)

    assert.Len(t, result.Surcharges, 1)
    assert.Equal(t, nightAccountID, result.Surcharges[0].AccountID)
    assert.Equal(t, 60, result.Surcharges[0].Minutes) // 22:00-23:00 = 60 min
}

func TestCalculateSurcharges_HolidaySurcharge(t *testing.T) {
    holidayAccountID := uuid.New()

    // Holiday surcharge for all day
    configs := []SurchargeConfig{
        {
            AccountID:         holidayAccountID,
            AccountCode:       "HOLIDAY",
            TimeFrom:          0,
            TimeTo:            1440,
            AppliesOnWorkday:  false,
            AppliesOnHoliday:  true,
            HolidayCategories: []int{1, 2}, // Cat 1 and 2 only
        },
    }

    // Work period: 08:00 - 16:00 (8 hours)
    workPeriods := []TimePeriod{
        {Start: 480, End: 960},
    }

    // Category 1 holiday - should apply
    result := CalculateSurcharges(workPeriods, configs, true, 1)
    assert.Len(t, result.Surcharges, 1)
    assert.Equal(t, 480, result.Surcharges[0].Minutes)

    // Category 3 holiday - should NOT apply (not in categories)
    result = CalculateSurcharges(workPeriods, configs, true, 3)
    assert.Len(t, result.Surcharges, 0)

    // Normal workday - should NOT apply
    result = CalculateSurcharges(workPeriods, configs, false, 0)
    assert.Len(t, result.Surcharges, 0)
}

func TestCalculateSurcharges_NightNotOnHoliday(t *testing.T) {
    // ZMI: "Dieser Zuschlag ist aber nur an einem normalen Arbeitstag und nicht am Feiertag gültig"
    nightAccountID := uuid.New()

    configs := []SurchargeConfig{
        {
            AccountID:        nightAccountID,
            AccountCode:      "NIGHT",
            TimeFrom:         1320, // 22:00
            TimeTo:           1440, // 00:00
            AppliesOnWorkday: true,
            AppliesOnHoliday: false, // NOT on holidays
        },
    }

    workPeriods := []TimePeriod{
        {Start: 1200, End: 1380}, // 20:00 - 23:00
    }

    // Normal workday - should apply
    result := CalculateSurcharges(workPeriods, configs, false, 0)
    assert.Len(t, result.Surcharges, 1)
    assert.Equal(t, 60, result.Surcharges[0].Minutes)

    // Holiday - should NOT apply
    result = CalculateSurcharges(workPeriods, configs, true, 1)
    assert.Len(t, result.Surcharges, 0)
}

func TestCalculateSurcharges_MultiplePeriods(t *testing.T) {
    accountID := uuid.New()

    configs := []SurchargeConfig{
        {
            AccountID:        accountID,
            AccountCode:      "BONUS",
            TimeFrom:         360,  // 06:00
            TimeTo:           480,  // 08:00
            AppliesOnWorkday: true,
        },
    }

    // Multiple work periods - split shift
    workPeriods := []TimePeriod{
        {Start: 300, End: 420},  // 05:00 - 07:00 (overlap: 06:00-07:00 = 60 min)
        {Start: 450, End: 540},  // 07:30 - 09:00 (overlap: 07:30-08:00 = 30 min)
    }

    result := CalculateSurcharges(workPeriods, configs, false, 0)
    assert.Len(t, result.Surcharges, 1)
    assert.Equal(t, 90, result.Surcharges[0].Minutes) // 60 + 30 = 90
}

func TestValidateSurchargeConfig(t *testing.T) {
    tests := []struct {
        name       string
        config     SurchargeConfig
        errorCount int
    }{
        {
            name: "valid config",
            config: SurchargeConfig{
                TimeFrom: 360,
                TimeTo:   480,
            },
            errorCount: 0,
        },
        {
            name: "overnight span - invalid",
            config: SurchargeConfig{
                TimeFrom: 1320, // 22:00
                TimeTo:   360,  // 06:00 - crosses midnight!
            },
            errorCount: 1,
        },
        {
            name: "time_from out of range",
            config: SurchargeConfig{
                TimeFrom: -10,
                TimeTo:   360,
            },
            errorCount: 1,
        },
        {
            name: "time_to out of range",
            config: SurchargeConfig{
                TimeFrom: 360,
                TimeTo:   1500,
            },
            errorCount: 1,
        },
        {
            name: "from >= to",
            config: SurchargeConfig{
                TimeFrom: 480,
                TimeTo:   360,
            },
            errorCount: 1,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            errors := ValidateSurchargeConfig(tt.config)
            assert.Len(t, errors, tt.errorCount)
        })
    }
}

func TestSplitOvernightSurcharge(t *testing.T) {
    config := SurchargeConfig{
        AccountID:   uuid.New(),
        AccountCode: "NIGHT",
        TimeFrom:    1320, // 22:00
        TimeTo:      360,  // 06:00 (overnight)
        AppliesOnWorkday: true,
    }

    result := SplitOvernightSurcharge(config)

    assert.Len(t, result, 2)

    // Evening portion: 22:00 - 00:00
    assert.Equal(t, 1320, result[0].TimeFrom)
    assert.Equal(t, 1440, result[0].TimeTo)

    // Morning portion: 00:00 - 06:00
    assert.Equal(t, 0, result[1].TimeFrom)
    assert.Equal(t, 360, result[1].TimeTo)
}

func TestSplitOvernightSurcharge_AlreadyValid(t *testing.T) {
    config := SurchargeConfig{
        AccountID:   uuid.New(),
        TimeFrom:    480,
        TimeTo:      600,
    }

    result := SplitOvernightSurcharge(config)

    assert.Len(t, result, 1)
    assert.Equal(t, config, result[0])
}

func TestCalculateOverlap(t *testing.T) {
    tests := []struct {
        name     string
        start1   int
        end1     int
        start2   int
        end2     int
        expected int
    }{
        {"full overlap", 480, 600, 480, 600, 120},
        {"partial left", 420, 540, 480, 600, 60},
        {"partial right", 480, 660, 480, 600, 120},
        {"no overlap", 300, 420, 480, 600, 0},
        {"contained", 500, 550, 480, 600, 50},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := calculateOverlap(tt.start1, tt.end1, tt.start2, tt.end2)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Zuschläge time windows | `SurchargeConfig` with TimeFrom/TimeTo |
| Holiday surcharges | `AppliesOnHoliday` flag |
| Workday-only surcharges | `AppliesOnWorkday` flag |
| Holiday categories | `HolidayCategories` filter |
| Split at midnight | `SplitOvernightSurcharge()` helper |
| Multiple periods | Iterates over all work periods |

## Acceptance Criteria

- [ ] Calculates surcharges based on time windows
- [ ] Respects holiday vs workday flags
- [ ] Filters by holiday category when specified
- [ ] Validates configs (no overnight spans)
- [ ] Helper to split overnight surcharges
- [ ] Handles multiple work periods
- [ ] All unit tests pass
- [ ] `make test` passes
