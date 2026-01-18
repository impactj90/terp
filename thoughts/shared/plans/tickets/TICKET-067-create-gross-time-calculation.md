# TICKET-067: Create Gross Time Calculation

**Type**: Calculation
**Effort**: S
**Sprint**: 15 - Calculation Engine - Daily Calculation
**Dependencies**: TICKET-061

## Description

Implement gross time calculation from work pairs.

## Files to Create

- `apps/api/internal/calculation/gross.go`
- `apps/api/internal/calculation/gross_test.go`

## Implementation

```go
package calculation

// CalculateGrossTime sums all work pair durations
func CalculateGrossTime(pairs []BookingPair) int {
    total := 0
    for _, pair := range pairs {
        if pair.PairType == "work" {
            total += pair.Duration
        }
    }
    return total
}

// CalculateBreakTime sums all break pair durations
func CalculateBreakTime(pairs []BookingPair) int {
    total := 0
    for _, pair := range pairs {
        if pair.PairType == "break" {
            total += pair.Duration
        }
    }
    return total
}

// GetFirstCome returns the earliest come time from work pairs
func GetFirstCome(pairs []BookingPair) *int {
    var first *int
    for _, pair := range pairs {
        if pair.PairType == "work" {
            if first == nil || pair.StartTime < *first {
                val := pair.StartTime
                first = &val
            }
        }
    }
    return first
}

// GetLastGo returns the latest go time from work pairs
func GetLastGo(pairs []BookingPair) *int {
    var last *int
    for _, pair := range pairs {
        if pair.PairType == "work" {
            if last == nil || pair.EndTime > *last {
                val := pair.EndTime
                last = &val
            }
        }
    }
    return last
}

// CalculatePresenceTime calculates time from first come to last go
// This includes breaks and gaps
func CalculatePresenceTime(pairs []BookingPair) int {
    first := GetFirstCome(pairs)
    last := GetLastGo(pairs)
    if first == nil || last == nil {
        return 0
    }
    return *last - *first
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/gross_test.go`

Table-driven tests for all gross time calculation functions using testify/assert:

```go
func TestCalculateGrossTime(t *testing.T) {
    tests := []struct {
        name string
        pairs []BookingPair
        want int
    }{
        {
            name:  "single work pair",
            pairs: []BookingPair{{PairType: "work", Duration: 540}},
            want:  540,
        },
        {
            name: "multiple work pairs",
            pairs: []BookingPair{
                {PairType: "work", Duration: 240},
                {PairType: "work", Duration: 240},
            },
            want: 480,
        },
        {
            name: "mixed work and break pairs",
            pairs: []BookingPair{
                {PairType: "work", Duration: 240},
                {PairType: "break", Duration: 30},
                {PairType: "work", Duration: 240},
            },
            want: 480,
        },
        {
            name:  "empty pairs",
            pairs: []BookingPair{},
            want:  0,
        },
        {
            name: "only break pairs",
            pairs: []BookingPair{
                {PairType: "break", Duration: 30},
                {PairType: "break", Duration: 15},
            },
            want: 0,
        },
        {
            name: "zero duration work pair",
            pairs: []BookingPair{
                {PairType: "work", Duration: 0},
            },
            want: 0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculateGrossTime(tt.pairs)
            assert.Equal(t, tt.want, result)
        })
    }
}

func TestCalculateBreakTime(t *testing.T) {
    tests := []struct {
        name string
        pairs []BookingPair
        want int
    }{
        {
            name: "single break",
            pairs: []BookingPair{
                {PairType: "break", Duration: 30},
            },
            want: 30,
        },
        {
            name: "multiple breaks",
            pairs: []BookingPair{
                {PairType: "break", Duration: 30},
                {PairType: "break", Duration: 15},
            },
            want: 45,
        },
        {
            name: "mixed pairs - only sum breaks",
            pairs: []BookingPair{
                {PairType: "work", Duration: 240},
                {PairType: "break", Duration: 30},
            },
            want: 30,
        },
        {
            name:  "empty pairs",
            pairs: []BookingPair{},
            want:  0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculateBreakTime(tt.pairs)
            assert.Equal(t, tt.want, result)
        })
    }
}

func TestGetFirstCome(t *testing.T) {
    tests := []struct {
        name string
        pairs []BookingPair
        want *int
    }{
        {
            name: "single pair",
            pairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 720},
            },
            want: intPtr(480),
        },
        {
            name: "multiple pairs - earliest first",
            pairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 720},
                {PairType: "work", StartTime: 780, EndTime: 1020},
            },
            want: intPtr(480),
        },
        {
            name: "multiple pairs - out of order",
            pairs: []BookingPair{
                {PairType: "work", StartTime: 780, EndTime: 1020},
                {PairType: "work", StartTime: 480, EndTime: 720},
            },
            want: intPtr(480),
        },
        {
            name:  "empty pairs",
            pairs: []BookingPair{},
            want:  nil,
        },
        {
            name: "only break pairs",
            pairs: []BookingPair{
                {PairType: "break", StartTime: 720, EndTime: 750},
            },
            want: nil,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := GetFirstCome(tt.pairs)
            if tt.want == nil {
                assert.Nil(t, result)
            } else {
                assert.NotNil(t, result)
                assert.Equal(t, *tt.want, *result)
            }
        })
    }
}

func TestGetLastGo(t *testing.T) {
    tests := []struct {
        name string
        pairs []BookingPair
        want *int
    }{
        {
            name: "single pair",
            pairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 720},
            },
            want: intPtr(720),
        },
        {
            name: "multiple pairs - latest last",
            pairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 720},
                {PairType: "work", StartTime: 780, EndTime: 1020},
            },
            want: intPtr(1020),
        },
        {
            name:  "empty pairs",
            pairs: []BookingPair{},
            want:  nil,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := GetLastGo(tt.pairs)
            if tt.want == nil {
                assert.Nil(t, result)
            } else {
                assert.NotNil(t, result)
                assert.Equal(t, *tt.want, *result)
            }
        })
    }
}

func TestCalculatePresenceTime(t *testing.T) {
    tests := []struct {
        name string
        pairs []BookingPair
        want int
    }{
        {
            name: "single continuous pair",
            pairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 1020},
            },
            want: 540,
        },
        {
            name: "multiple pairs with gap",
            pairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 720},
                {PairType: "work", StartTime: 780, EndTime: 1020},
            },
            want: 540,
        },
        {
            name:  "empty pairs",
            pairs: []BookingPair{},
            want:  0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculatePresenceTime(tt.pairs)
            assert.Equal(t, tt.want, result)
        })
    }
}
```

Edge cases covered:
- Empty pair lists
- Only break pairs (no work pairs)
- Only work pairs (no break pairs)
- Zero duration pairs
- Out of order pairs
- Single pair
- Boundary times (0, 1439)

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all calculation functions
- [ ] Tests cover edge cases and boundary values
- [ ] CalculateGrossTime sums only work pairs
- [ ] CalculateBreakTime sums only break pairs
- [ ] GetFirstCome returns earliest start time
- [ ] GetLastGo returns latest end time
- [ ] Handles empty pair list
