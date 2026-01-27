# TICKET-122: Add Rounding Add/Subtract Modes

**Type**: Calculation Update
**Effort**: S
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-063, TICKET-118 (RoundingComeAddValue, RoundingGoAddValue fields)

## Integration Notes

> - **Field source**: `RoundingComeAddValue` and `RoundingGoAddValue` come from day_plans table (TICKET-118)
> - **Application order**: Add/subtract is applied AFTER tolerance adjustment, same as other rounding modes
> - **Use cases per ZMI**: Walk time from terminal (add), shower time after shift (subtract)

## Description

Update the rounding logic to support "add value" and "subtract value" modes in addition to round up/down/nearest. These modes add or subtract a fixed number of minutes from booking times.

## ZMI Reference

> "Wert addieren und Wert subtrahieren: Bei dieser Einstellung wird der eingestellte Wert auf die Buchung addiert oder subtrahiert. Zum Beispiel bei 10 Minuten addieren: 05:55 wird 06:05, 07:32 wird 07:42"

> "Diese Einstellung wird benötigt, wenn die Mitarbeitenden einen langen Weg vom Zeiterfassungsterminal zu ihrem Arbeitsplatz haben oder nach der Schicht noch duschen müssen und diese Zeit soll nicht berücksichtigt werden."

## Files to Modify

- `apps/api/internal/model/dayplan.go` - Add rounding type constants
- `apps/api/internal/calculation/rounding.go` - Add add/subtract functions

## Implementation

### Model Update

```go
// Add to model/dayplan.go RoundingType constants

const (
    RoundingNone     RoundingType = "none"
    RoundingUp       RoundingType = "up"
    RoundingDown     RoundingType = "down"
    RoundingNearest  RoundingType = "nearest"
    RoundingAdd      RoundingType = "add"      // NEW: Add fixed value
    RoundingSubtract RoundingType = "subtract" // NEW: Subtract fixed value
)
```

### Calculation Update

```go
// Add to calculation/rounding.go

// RoundWithAddSubtract applies add/subtract rounding modes
// ZMI: Wert addieren / Wert subtrahieren
func RoundWithAddSubtract(time int, roundingType model.RoundingType, value int) int {
    switch roundingType {
    case model.RoundingAdd:
        // Add fixed value to booking time
        // Use case: Long walk from terminal to workplace
        return time + value
    case model.RoundingSubtract:
        // Subtract fixed value from booking time
        // Use case: Shower time after shift
        result := time - value
        if result < 0 {
            return 0 // Don't go negative
        }
        return result
    default:
        return time
    }
}

// ApplyRounding applies the appropriate rounding based on type
// This is the main entry point that handles all rounding types
func ApplyRounding(time int, config RoundingConfig) int {
    switch config.Type {
    case model.RoundingNone:
        return time
    case model.RoundingUp:
        return RoundUp(time, config.Interval)
    case model.RoundingDown:
        return RoundDown(time, config.Interval)
    case model.RoundingNearest:
        return RoundNearest(time, config.Interval)
    case model.RoundingAdd:
        return time + config.AddValue
    case model.RoundingSubtract:
        result := time - config.AddValue
        if result < 0 {
            return 0
        }
        return result
    default:
        return time
    }
}

// RoundingConfig contains all parameters for rounding
type RoundingConfig struct {
    Type     model.RoundingType
    Interval int // For up/down/nearest
    AddValue int // For add/subtract
}

// GetArrivalRoundingConfig creates config for arrival rounding from day plan
func GetArrivalRoundingConfig(dp *model.DayPlan) RoundingConfig {
    config := RoundingConfig{
        Type: model.RoundingNone,
    }

    if dp.RoundingComeType != nil {
        config.Type = *dp.RoundingComeType
    }
    if dp.RoundingComeInterval != nil {
        config.Interval = *dp.RoundingComeInterval
    }
    if dp.RoundingComeAddValue != nil {
        config.AddValue = *dp.RoundingComeAddValue
    }

    return config
}

// GetDepartureRoundingConfig creates config for departure rounding from day plan
func GetDepartureRoundingConfig(dp *model.DayPlan) RoundingConfig {
    config := RoundingConfig{
        Type: model.RoundingNone,
    }

    if dp.RoundingGoType != nil {
        config.Type = *dp.RoundingGoType
    }
    if dp.RoundingGoInterval != nil {
        config.Interval = *dp.RoundingGoInterval
    }
    if dp.RoundingGoAddValue != nil {
        config.AddValue = *dp.RoundingGoAddValue
    }

    return config
}
```

## Unit Tests

```go
package calculation

import (
    "testing"

    "github.com/stretchr/testify/assert"

    "terp/apps/api/internal/model"
)

func TestRoundWithAddSubtract(t *testing.T) {
    tests := []struct {
        name     string
        time     int
        rounding model.RoundingType
        value    int
        expected int
    }{
        // ZMI examples: 10 min add
        {"add 10 to 05:55", 355, model.RoundingAdd, 10, 365},         // 05:55 -> 06:05
        {"add 10 to 07:32", 452, model.RoundingAdd, 10, 462},         // 07:32 -> 07:42

        // Subtract examples
        {"subtract 10 from 16:10", 970, model.RoundingSubtract, 10, 960}, // 16:10 -> 16:00
        {"subtract 15 from 17:30", 1050, model.RoundingSubtract, 15, 1035}, // 17:30 -> 17:15

        // Edge cases
        {"add 0", 480, model.RoundingAdd, 0, 480},
        {"subtract 0", 480, model.RoundingSubtract, 0, 480},
        {"subtract more than time", 5, model.RoundingSubtract, 10, 0}, // Don't go negative
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := RoundWithAddSubtract(tt.time, tt.rounding, tt.value)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestApplyRounding_AllTypes(t *testing.T) {
    tests := []struct {
        name     string
        time     int
        config   RoundingConfig
        expected int
    }{
        {
            name: "none",
            time: 483,
            config: RoundingConfig{Type: model.RoundingNone},
            expected: 483,
        },
        {
            name: "round up 15 min",
            time: 483, // 08:03
            config: RoundingConfig{Type: model.RoundingUp, Interval: 15},
            expected: 495, // 08:15
        },
        {
            name: "round down 15 min",
            time: 483, // 08:03
            config: RoundingConfig{Type: model.RoundingDown, Interval: 15},
            expected: 480, // 08:00
        },
        {
            name: "round nearest 5 min - down",
            time: 482, // 08:02
            config: RoundingConfig{Type: model.RoundingNearest, Interval: 5},
            expected: 480, // 08:00
        },
        {
            name: "round nearest 5 min - up",
            time: 483, // 08:03
            config: RoundingConfig{Type: model.RoundingNearest, Interval: 5},
            expected: 485, // 08:05
        },
        {
            name: "add value",
            time: 355, // 05:55
            config: RoundingConfig{Type: model.RoundingAdd, AddValue: 10},
            expected: 365, // 06:05
        },
        {
            name: "subtract value",
            time: 970, // 16:10
            config: RoundingConfig{Type: model.RoundingSubtract, AddValue: 10},
            expected: 960, // 16:00
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := ApplyRounding(tt.time, tt.config)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestGetRoundingConfig_FromDayPlan(t *testing.T) {
    roundingType := model.RoundingAdd
    interval := 15
    addValue := 10

    dp := &model.DayPlan{
        RoundingComeType:     &roundingType,
        RoundingComeInterval: &interval,
        RoundingComeAddValue: &addValue,
    }

    config := GetArrivalRoundingConfig(dp)

    assert.Equal(t, model.RoundingAdd, config.Type)
    assert.Equal(t, 15, config.Interval)
    assert.Equal(t, 10, config.AddValue)
}

func TestGetRoundingConfig_EmptyDayPlan(t *testing.T) {
    dp := &model.DayPlan{}

    config := GetArrivalRoundingConfig(dp)

    assert.Equal(t, model.RoundingNone, config.Type)
    assert.Equal(t, 0, config.Interval)
    assert.Equal(t, 0, config.AddValue)
}

// Integration with RoundAllBookings flag
func TestRoundingWithRoundAllBookings(t *testing.T) {
    config := RoundingConfig{
        Type:     model.RoundingUp,
        Interval: 15,
    }

    // Bookings for a day
    bookings := []int{423, 480, 540, 605, 970} // Multiple arrivals/departures

    // Without RoundAllBookings - only first and last
    results := make([]int, len(bookings))
    for i, b := range bookings {
        if i == 0 || i == len(bookings)-1 {
            results[i] = ApplyRounding(b, config)
        } else {
            results[i] = b // No rounding for middle bookings
        }
    }

    assert.Equal(t, 435, results[0])  // First: 07:03 -> 07:15
    assert.Equal(t, 480, results[1])  // Middle: unchanged
    assert.Equal(t, 540, results[2])  // Middle: unchanged
    assert.Equal(t, 605, results[3])  // Middle: unchanged
    assert.Equal(t, 975, results[4])  // Last: 16:10 -> 16:15

    // With RoundAllBookings - round all
    for i, b := range bookings {
        results[i] = ApplyRounding(b, config)
    }

    assert.Equal(t, 435, results[0])  // 07:03 -> 07:15
    assert.Equal(t, 480, results[1])  // 08:00 -> 08:00 (already on boundary)
    assert.Equal(t, 540, results[2])  // 09:00 -> 09:00 (already on boundary)
    assert.Equal(t, 615, results[3])  // 10:05 -> 10:15
    assert.Equal(t, 975, results[4])  // 16:10 -> 16:15
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Wert addieren | `RoundingAdd` type |
| Wert subtrahieren | `RoundingSubtract` type |
| Walk time compensation | Add value to arrival |
| Shower time deduction | Subtract value from departure |
| Alle Buchungen runden | Handled by caller with `RoundAllBookings` flag |

## Acceptance Criteria

- [ ] `RoundingAdd` type adds fixed value to time
- [ ] `RoundingSubtract` type subtracts fixed value from time
- [ ] Subtract doesn't go below 0
- [ ] `ApplyRounding` handles all rounding types
- [ ] Config helpers extract values from DayPlan
- [ ] All existing rounding tests still pass
- [ ] New unit tests for add/subtract pass
- [ ] `make test` passes
