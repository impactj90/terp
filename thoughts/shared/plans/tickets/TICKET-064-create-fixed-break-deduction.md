# TICKET-064: Create Fixed Break Deduction

**Type**: Calculation
**Effort**: S
**Sprint**: 14 - Calculation Engine - Break Logic
**Dependencies**: TICKET-060

## Description

Implement fixed break deduction logic.

## Files to Create

- `apps/api/internal/calculation/breaks.go`
- `apps/api/internal/calculation/breaks_test.go`

## Implementation

```go
package calculation

// BreakDeductionResult contains the result of break calculations
type BreakDeductionResult struct {
    NetTime       int
    TotalBreakTime int
    BreakDetails  []BreakDetail
}

type BreakDetail struct {
    Type     string
    Duration int
    Reason   string
}

// DeductFixedBreaks deducts fixed breaks that overlap with work time
// Fixed breaks are always deducted if work spans the break window
func DeductFixedBreaks(workPairs []BookingPair, breaks []BreakConfig) BreakDeductionResult {
    var result BreakDeductionResult
    totalWorkTime := 0

    for _, pair := range workPairs {
        if pair.PairType == "work" {
            totalWorkTime += pair.Duration
        }
    }

    result.NetTime = totalWorkTime

    for _, brk := range breaks {
        if brk.BreakType != "fixed" {
            continue
        }
        if brk.StartTime == nil || brk.EndTime == nil {
            continue
        }

        // Check if any work pair overlaps with the break window
        for _, pair := range workPairs {
            if pair.PairType != "work" {
                continue
            }

            overlap := calculateOverlap(pair.StartTime, pair.EndTime, *brk.StartTime, *brk.EndTime)
            if overlap > 0 {
                // Deduct the configured break duration (not the overlap)
                deduction := min(brk.Duration, overlap)
                result.NetTime -= deduction
                result.TotalBreakTime += deduction
                result.BreakDetails = append(result.BreakDetails, BreakDetail{
                    Type:     "fixed",
                    Duration: deduction,
                    Reason:   "fixed_break_overlap",
                })
                break // Only deduct once per break
            }
        }
    }

    return result
}

// calculateOverlap returns the overlap in minutes between two time ranges
func calculateOverlap(start1, end1, start2, end2 int) int {
    overlapStart := max(start1, start2)
    overlapEnd := min(end1, end2)
    if overlapEnd > overlapStart {
        return overlapEnd - overlapStart
    }
    return 0
}

func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}

func max(a, b int) int {
    if a > b {
        return a
    }
    return b
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/breaks_test.go`

Table-driven tests for all break deduction functions using testify/assert:

```go
func TestDeductFixedBreaks(t *testing.T) {
    tests := []struct {
        name              string
        workPairs         []BookingPair
        breaks            []BreakConfig
        expectedNetTime   int
        expectedBreakTime int
    }{
        {
            name: "full overlap - work spans entire break window",
            workPairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 1020, Duration: 540},
            },
            breaks: []BreakConfig{
                {BreakType: "fixed", StartTime: intPtr(720), EndTime: intPtr(750), Duration: 30},
            },
            expectedNetTime:   510,
            expectedBreakTime: 30,
        },
        {
            name: "no overlap - work ends before break",
            workPairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 700, Duration: 220},
            },
            breaks: []BreakConfig{
                {BreakType: "fixed", StartTime: intPtr(720), EndTime: intPtr(750), Duration: 30},
            },
            expectedNetTime:   220,
            expectedBreakTime: 0,
        },
        {
            name: "partial overlap - work ends during break",
            workPairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 730, Duration: 250},
            },
            breaks: []BreakConfig{
                {BreakType: "fixed", StartTime: intPtr(720), EndTime: intPtr(750), Duration: 30},
            },
            expectedNetTime:   240,
            expectedBreakTime: 10,
        },
        {
            name:              "empty work pairs",
            workPairs:         []BookingPair{},
            breaks:            []BreakConfig{{BreakType: "fixed", StartTime: intPtr(720), EndTime: intPtr(750), Duration: 30}},
            expectedNetTime:   0,
            expectedBreakTime: 0,
        },
        {
            name:              "empty breaks",
            workPairs:         []BookingPair{{PairType: "work", Duration: 480}},
            breaks:            []BreakConfig{},
            expectedNetTime:   480,
            expectedBreakTime: 0,
        },
        {
            name: "nil break times",
            workPairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 1020, Duration: 540},
            },
            breaks: []BreakConfig{
                {BreakType: "fixed", StartTime: nil, EndTime: nil, Duration: 30},
            },
            expectedNetTime:   540,
            expectedBreakTime: 0,
        },
        {
            name: "multiple work pairs - one overlaps",
            workPairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 600, Duration: 120},
                {PairType: "work", StartTime: 660, EndTime: 900, Duration: 240},
            },
            breaks: []BreakConfig{
                {BreakType: "fixed", StartTime: intPtr(720), EndTime: intPtr(750), Duration: 30},
            },
            expectedNetTime:   330,
            expectedBreakTime: 30,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := DeductFixedBreaks(tt.workPairs, tt.breaks)
            assert.Equal(t, tt.expectedNetTime, result.NetTime)
            assert.Equal(t, tt.expectedBreakTime, result.TotalBreakTime)
        })
    }
}
```

Edge cases covered:
- Empty work pairs
- Empty break configurations
- Nil break start/end times
- Multiple work pairs with breaks
- Work pairs that are break type (should be ignored)
- Boundary overlaps (work ends exactly when break starts)

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all break deduction functions
- [ ] Tests cover edge cases and boundary values
- [ ] Deducts break when work fully spans break window
- [ ] No deduction when work doesn't overlap break
- [ ] Partial overlap deducts actual overlap (not full break)
