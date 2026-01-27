# TICKET-062: Create Tolerance Logic

**Type**: Calculation
**Effort**: M
**Sprint**: 13 - Calculation Engine - Booking Logic
**Dependencies**: TICKET-060

## Description

Implement tolerance application logic for come/go times.

## Files to Create

- `apps/api/internal/calculation/tolerance.go`
- `apps/api/internal/calculation/tolerance_test.go`

## Implementation

```go
package calculation

// ApplyTolerance adjusts a booking time based on tolerance settings.
// If the time is within tolerance of the expected time, it snaps to expected.
//
// For come (arrival):
// - If early within tolerance_minus: snap to expected
// - If late within tolerance_plus: snap to expected
//
// For go (departure):
// - If early within tolerance_minus: snap to expected
// - If late within tolerance_plus: snap to expected
func ApplyTolerance(actualTime int, expectedTime int, tolerancePlus int, toleranceMinus int) int {
    if expectedTime == 0 {
        // No expected time set, return as-is
        return actualTime
    }

    diff := actualTime - expectedTime

    if diff >= 0 && diff <= tolerancePlus {
        // Late but within tolerance
        return expectedTime
    }

    if diff < 0 && -diff <= toleranceMinus {
        // Early but within tolerance
        return expectedTime
    }

    // Outside tolerance, return actual
    return actualTime
}

// ApplyComeTolerance applies tolerance for arrival time
func ApplyComeTolerance(comeTime int, dayPlan *DayPlanInput) int {
    if dayPlan == nil || dayPlan.ComeFrom == nil {
        return comeTime
    }

    expected := *dayPlan.ComeFrom
    return ApplyTolerance(comeTime, expected, dayPlan.Tolerances.ComePlus, dayPlan.Tolerances.ComeMinus)
}

// ApplyGoTolerance applies tolerance for departure time
func ApplyGoTolerance(goTime int, dayPlan *DayPlanInput) int {
    if dayPlan == nil || dayPlan.GoTo == nil {
        return goTime
    }

    expected := *dayPlan.GoTo
    return ApplyTolerance(goTime, expected, dayPlan.Tolerances.GoPlus, dayPlan.Tolerances.GoMinus)
}

// ApplyTolerancesToPairs applies tolerance rules to all work pairs
func ApplyTolerancesToPairs(pairs []BookingPair, dayPlan *DayPlanInput) []BookingPair {
    if dayPlan == nil {
        return pairs
    }

    result := make([]BookingPair, len(pairs))
    for i, pair := range pairs {
        result[i] = pair
        if pair.PairType == "work" {
            result[i].StartTime = ApplyComeTolerance(pair.StartTime, dayPlan)
            result[i].EndTime = ApplyGoTolerance(pair.EndTime, dayPlan)
            result[i].Duration = result[i].EndTime - result[i].StartTime
        }
    }
    return result
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/tolerance_test.go`

Table-driven tests for all tolerance functions using testify/assert:

```go
func TestApplyTolerance(t *testing.T) {
    tests := []struct {
        name           string
        actualTime     int
        expectedTime   int
        tolerancePlus  int
        toleranceMinus int
        want           int
    }{
        {"early within tolerance", 475, 480, 5, 5, 480},
        {"late within tolerance", 483, 480, 5, 5, 480},
        {"early outside tolerance", 470, 480, 5, 5, 470},
        {"late outside tolerance", 490, 480, 5, 5, 490},
        {"exact match", 480, 480, 5, 5, 480},
        {"no expected time", 480, 0, 5, 5, 480},
        {"zero tolerance", 475, 480, 0, 0, 475},
        {"asymmetric tolerance - early", 475, 480, 3, 10, 480},
        {"asymmetric tolerance - late", 485, 480, 10, 3, 480},
        {"at tolerance boundary - early", 475, 480, 5, 5, 480},
        {"at tolerance boundary - late", 485, 480, 5, 5, 480},
        {"just outside tolerance - early", 474, 480, 5, 5, 474},
        {"just outside tolerance - late", 486, 480, 5, 5, 486},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := ApplyTolerance(tt.actualTime, tt.expectedTime, tt.tolerancePlus, tt.toleranceMinus)
            assert.Equal(t, tt.want, result)
        })
    }
}

func TestApplyComeTolerance(t *testing.T) {
    tests := []struct {
        name     string
        comeTime int
        dayPlan  *DayPlanInput
        want     int
    }{
        {
            name:     "within tolerance",
            comeTime: 477,
            dayPlan: &DayPlanInput{
                ComeFrom:   intPtr(480),
                Tolerances: ToleranceConfig{ComePlus: 5, ComeMinus: 5},
            },
            want: 480,
        },
        {
            name:     "nil day plan",
            comeTime: 477,
            dayPlan:  nil,
            want:     477,
        },
        {
            name:     "nil ComeFrom",
            comeTime: 477,
            dayPlan:  &DayPlanInput{ComeFrom: nil},
            want:     477,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := ApplyComeTolerance(tt.comeTime, tt.dayPlan)
            assert.Equal(t, tt.want, result)
        })
    }
}
```

Edge cases covered:
- Empty/nil inputs (nil day plan, nil expected time)
- Zero tolerance values
- Asymmetric tolerance (different plus/minus values)
- Exact tolerance boundaries
- Times at midnight (0) and end of day (1439)

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all tolerance functions
- [ ] Tests cover edge cases and boundary values
- [ ] Early arrival within tolerance snaps to expected
- [ ] Late arrival within tolerance snaps to expected
- [ ] Times outside tolerance remain unchanged
- [ ] Works with nil day plan (returns original)
