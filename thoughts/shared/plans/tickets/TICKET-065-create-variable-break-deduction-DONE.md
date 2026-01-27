# TICKET-065: Create Variable Break Deduction

**Type**: Calculation
**Effort**: M
**Sprint**: 14 - Calculation Engine - Break Logic
**Dependencies**: TICKET-064

## Description

Implement variable break deduction logic using actual break bookings.

## Files to Modify

- `apps/api/internal/calculation/breaks.go`
- `apps/api/internal/calculation/breaks_test.go`

## Implementation

Add to breaks.go:

```go
// DeductVariableBreaks deducts breaks based on actual break bookings
// If no break bookings exist and auto_deduct is true, deducts configured duration
func DeductVariableBreaks(grossTime int, breaks []BreakConfig, actualBreaks []BookingPair) BreakDeductionResult {
    var result BreakDeductionResult
    result.NetTime = grossTime

    // Calculate actual break time from bookings
    actualBreakTime := 0
    for _, pair := range actualBreaks {
        if pair.PairType == "break" {
            actualBreakTime += pair.Duration
        }
    }

    for _, brk := range breaks {
        if brk.BreakType != "variable" {
            continue
        }

        if actualBreakTime > 0 {
            // Use actual break time
            deduction := actualBreakTime
            result.NetTime -= deduction
            result.TotalBreakTime += deduction
            result.BreakDetails = append(result.BreakDetails, BreakDetail{
                Type:     "variable",
                Duration: deduction,
                Reason:   "actual_break_bookings",
            })
        } else if brk.AutoDeduct {
            // Auto-deduct configured duration
            result.NetTime -= brk.Duration
            result.TotalBreakTime += brk.Duration
            result.BreakDetails = append(result.BreakDetails, BreakDetail{
                Type:     "variable",
                Duration: brk.Duration,
                Reason:   "auto_deduct_no_booking",
            })
        }
        break // Only process first variable break config
    }

    return result
}

// DeductAllBreaks combines fixed, variable, and minimum break deductions
func DeductAllBreaks(workPairs []BookingPair, breakPairs []BookingPair, breaks []BreakConfig) BreakDeductionResult {
    var result BreakDeductionResult

    // Calculate gross time
    grossTime := 0
    for _, pair := range workPairs {
        if pair.PairType == "work" {
            grossTime += pair.Duration
        }
    }
    result.NetTime = grossTime

    // 1. Apply fixed breaks
    fixedResult := DeductFixedBreaks(workPairs, breaks)
    result.NetTime = fixedResult.NetTime
    result.TotalBreakTime += fixedResult.TotalBreakTime
    result.BreakDetails = append(result.BreakDetails, fixedResult.BreakDetails...)

    // 2. Apply variable breaks
    variableResult := DeductVariableBreaks(result.NetTime, breaks, breakPairs)
    result.NetTime = variableResult.NetTime
    result.TotalBreakTime += variableResult.TotalBreakTime
    result.BreakDetails = append(result.BreakDetails, variableResult.BreakDetails...)

    // 3. Apply minimum breaks (see TICKET-066)
    // minimumResult := EnforceMinimumBreak(...)

    return result
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/breaks_test.go`

Table-driven tests for variable break deduction using testify/assert:

```go
func TestDeductVariableBreaks(t *testing.T) {
    tests := []struct {
        name              string
        grossTime         int
        breaks            []BreakConfig
        actualBreaks      []BookingPair
        expectedNetTime   int
        expectedBreakTime int
        expectedReason    string
    }{
        {
            name:      "with actual breaks - use actual duration",
            grossTime: 540,
            breaks: []BreakConfig{
                {BreakType: "variable", Duration: 30, AutoDeduct: true},
            },
            actualBreaks: []BookingPair{
                {PairType: "break", Duration: 45},
            },
            expectedNetTime:   495,
            expectedBreakTime: 45,
            expectedReason:    "actual_break_bookings",
        },
        {
            name:      "auto deduct - no actual breaks",
            grossTime: 540,
            breaks: []BreakConfig{
                {BreakType: "variable", Duration: 30, AutoDeduct: true},
            },
            actualBreaks:      []BookingPair{},
            expectedNetTime:   510,
            expectedBreakTime: 30,
            expectedReason:    "auto_deduct_no_booking",
        },
        {
            name:      "no auto deduct - no actual breaks",
            grossTime: 540,
            breaks: []BreakConfig{
                {BreakType: "variable", Duration: 30, AutoDeduct: false},
            },
            actualBreaks:      []BookingPair{},
            expectedNetTime:   540,
            expectedBreakTime: 0,
            expectedReason:    "",
        },
        {
            name:              "empty breaks config",
            grossTime:         540,
            breaks:            []BreakConfig{},
            actualBreaks:      []BookingPair{},
            expectedNetTime:   540,
            expectedBreakTime: 0,
        },
        {
            name:      "multiple actual breaks - sum all",
            grossTime: 540,
            breaks: []BreakConfig{
                {BreakType: "variable", Duration: 30, AutoDeduct: true},
            },
            actualBreaks: []BookingPair{
                {PairType: "break", Duration: 20},
                {PairType: "break", Duration: 15},
            },
            expectedNetTime:   505,
            expectedBreakTime: 35,
            expectedReason:    "actual_break_bookings",
        },
        {
            name:      "zero gross time",
            grossTime: 0,
            breaks: []BreakConfig{
                {BreakType: "variable", Duration: 30, AutoDeduct: true},
            },
            actualBreaks:      []BookingPair{},
            expectedNetTime:   -30,
            expectedBreakTime: 30,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := DeductVariableBreaks(tt.grossTime, tt.breaks, tt.actualBreaks)
            assert.Equal(t, tt.expectedNetTime, result.NetTime)
            assert.Equal(t, tt.expectedBreakTime, result.TotalBreakTime)
            if tt.expectedReason != "" {
                assert.NotEmpty(t, result.BreakDetails)
                assert.Equal(t, tt.expectedReason, result.BreakDetails[0].Reason)
            }
        })
    }
}

func TestDeductAllBreaks(t *testing.T) {
    tests := []struct {
        name              string
        workPairs         []BookingPair
        breakPairs        []BookingPair
        breaks            []BreakConfig
        expectedNetTime   int
        expectedBreakTime int
    }{
        {
            name: "combines fixed and variable breaks",
            workPairs: []BookingPair{
                {PairType: "work", StartTime: 480, EndTime: 1020, Duration: 540},
            },
            breakPairs: []BookingPair{
                {PairType: "break", Duration: 15},
            },
            breaks: []BreakConfig{
                {BreakType: "fixed", StartTime: intPtr(720), EndTime: intPtr(750), Duration: 30},
                {BreakType: "variable", Duration: 30, AutoDeduct: true},
            },
            expectedNetTime:   495,
            expectedBreakTime: 45,
        },
        {
            name:              "empty inputs",
            workPairs:         []BookingPair{},
            breakPairs:        []BookingPair{},
            breaks:            []BreakConfig{},
            expectedNetTime:   0,
            expectedBreakTime: 0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := DeductAllBreaks(tt.workPairs, tt.breakPairs, tt.breaks)
            assert.Equal(t, tt.expectedNetTime, result.NetTime)
            assert.Equal(t, tt.expectedBreakTime, result.TotalBreakTime)
        })
    }
}
```

Edge cases covered:
- Empty break configurations
- Empty actual breaks
- Multiple actual break bookings
- Zero gross time
- Work pairs that should be ignored in break calculation
- Combination of fixed and variable breaks

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all break deduction functions
- [ ] Tests cover edge cases and boundary values
- [ ] Uses actual break bookings when available
- [ ] Auto-deducts configured duration when no bookings and auto_deduct=true
- [ ] No deduction when no bookings and auto_deduct=false
- [ ] DeductAllBreaks combines all break types
