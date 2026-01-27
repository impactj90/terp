# TICKET-063: Create Rounding Logic

**Type**: Calculation
**Effort**: M
**Sprint**: 13 - Calculation Engine - Booking Logic
**Dependencies**: TICKET-060

## Description

Implement time rounding logic for come/go times.

## Files to Create

- `apps/api/internal/calculation/rounding.go`
- `apps/api/internal/calculation/rounding_test.go`

## Implementation

```go
package calculation

// ApplyRounding rounds a time value based on type and interval.
// Types: "none", "up", "down", "nearest"
// Interval: rounding interval in minutes (e.g., 5, 10, 15)
func ApplyRounding(time int, roundingType string, interval int) int {
    if roundingType == "" || roundingType == "none" || interval <= 0 {
        return time
    }

    switch roundingType {
    case "up":
        return roundUp(time, interval)
    case "down":
        return roundDown(time, interval)
    case "nearest":
        return roundNearest(time, interval)
    default:
        return time
    }
}

// roundUp rounds up to the next interval
// Example: 08:07 with 15min interval -> 08:15
func roundUp(time int, interval int) int {
    remainder := time % interval
    if remainder == 0 {
        return time
    }
    return time + (interval - remainder)
}

// roundDown rounds down to the previous interval
// Example: 08:07 with 15min interval -> 08:00
func roundDown(time int, interval int) int {
    return time - (time % interval)
}

// roundNearest rounds to the nearest interval
// Example: 08:07 with 15min interval -> 08:00
// Example: 08:08 with 15min interval -> 08:15
func roundNearest(time int, interval int) int {
    remainder := time % interval
    if remainder < interval/2 {
        return roundDown(time, interval)
    }
    return roundUp(time, interval)
}

// ApplyComeRounding applies rounding to arrival time
// For come times, we typically round up (favor employer - employee loses early minutes)
func ApplyComeRounding(comeTime int, dayPlan *DayPlanInput) int {
    if dayPlan == nil || dayPlan.Rounding.ComeType == "" {
        return comeTime
    }
    return ApplyRounding(comeTime, dayPlan.Rounding.ComeType, dayPlan.Rounding.ComeInterval)
}

// ApplyGoRounding applies rounding to departure time
// For go times, we typically round down (favor employer - employee loses late minutes)
func ApplyGoRounding(goTime int, dayPlan *DayPlanInput) int {
    if dayPlan == nil || dayPlan.Rounding.GoType == "" {
        return goTime
    }
    return ApplyRounding(goTime, dayPlan.Rounding.GoType, dayPlan.Rounding.GoInterval)
}

// ApplyRoundingToPairs applies rounding rules to all work pairs
func ApplyRoundingToPairs(pairs []BookingPair, dayPlan *DayPlanInput) []BookingPair {
    if dayPlan == nil {
        return pairs
    }

    result := make([]BookingPair, len(pairs))
    for i, pair := range pairs {
        result[i] = pair
        if pair.PairType == "work" {
            result[i].StartTime = ApplyComeRounding(pair.StartTime, dayPlan)
            result[i].EndTime = ApplyGoRounding(pair.EndTime, dayPlan)
            result[i].Duration = result[i].EndTime - result[i].StartTime
        }
    }
    return result
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/rounding_test.go`

Table-driven tests for all rounding functions using testify/assert:

```go
func TestApplyRounding(t *testing.T) {
    tests := []struct {
        name         string
        time         int
        roundingType string
        interval     int
        want         int
    }{
        {"up - 08:07 to 15min", 487, "up", 15, 495},
        {"up - exact interval", 480, "up", 15, 480},
        {"up - 5min interval", 483, "up", 5, 485},
        {"down - 17:07 to 15min", 1027, "down", 15, 1020},
        {"down - exact interval", 1020, "down", 15, 1020},
        {"down - 5min interval", 483, "down", 5, 480},
        {"nearest - round down (7<7.5)", 487, "nearest", 15, 480},
        {"nearest - round up (8>=7.5)", 488, "nearest", 15, 495},
        {"nearest - exact midpoint", 487, "nearest", 14, 490},
        {"nearest - exact interval", 480, "nearest", 15, 480},
        {"none - no rounding", 487, "none", 15, 487},
        {"empty string - no rounding", 487, "", 15, 487},
        {"zero interval", 487, "up", 0, 487},
        {"negative interval", 487, "up", -5, 487},
        {"invalid type", 487, "invalid", 15, 487},
        {"1 minute interval", 487, "up", 1, 487},
        {"boundary - midnight", 0, "up", 15, 0},
        {"boundary - end of day", 1439, "down", 15, 1425},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := ApplyRounding(tt.time, tt.roundingType, tt.interval)
            assert.Equal(t, tt.want, result)
        })
    }
}

func TestApplyComeRounding(t *testing.T) {
    tests := []struct {
        name     string
        comeTime int
        dayPlan  *DayPlanInput
        want     int
    }{
        {
            name:     "round up",
            comeTime: 487,
            dayPlan: &DayPlanInput{
                Rounding: RoundingConfig{ComeType: "up", ComeInterval: 15},
            },
            want: 495,
        },
        {
            name:     "nil day plan",
            comeTime: 487,
            dayPlan:  nil,
            want:     487,
        },
        {
            name:     "empty rounding type",
            comeTime: 487,
            dayPlan:  &DayPlanInput{Rounding: RoundingConfig{ComeType: ""}},
            want:     487,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := ApplyComeRounding(tt.comeTime, tt.dayPlan)
            assert.Equal(t, tt.want, result)
        })
    }
}
```

Edge cases covered:
- Empty/nil inputs (nil day plan, empty rounding type)
- Zero and negative intervals
- Invalid rounding types
- Exact interval values
- 1-minute intervals
- Boundary values (midnight, end of day)
- Different interval sizes (1, 5, 10, 15, 30 minutes)

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all rounding functions
- [ ] Tests cover edge cases and boundary values
- [ ] Round up works correctly
- [ ] Round down works correctly
- [ ] Round nearest works correctly
- [ ] Handles "none" type
- [ ] Handles zero/invalid intervals
- [ ] Exact interval values unchanged
