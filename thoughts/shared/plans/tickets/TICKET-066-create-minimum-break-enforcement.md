# TICKET-066: Create Minimum Break Enforcement

**Type**: Calculation
**Effort**: S
**Sprint**: 14 - Calculation Engine - Break Logic
**Dependencies**: TICKET-064

## Description

Implement minimum break enforcement based on work time thresholds.

## Files to Modify

- `apps/api/internal/calculation/breaks.go`
- `apps/api/internal/calculation/breaks_test.go`

## Implementation

Add to breaks.go:

```go
// EnforceMinimumBreak ensures legal minimum break requirements are met
// If worked > threshold and actual break < minimum, deducts the difference
func EnforceMinimumBreak(grossTime int, currentBreakTime int, breaks []BreakConfig) BreakDeductionResult {
    var result BreakDeductionResult
    result.NetTime = grossTime - currentBreakTime
    result.TotalBreakTime = currentBreakTime

    for _, brk := range breaks {
        if brk.BreakType != "minimum" {
            continue
        }
        if brk.AfterWorkMinutes == nil {
            continue
        }

        // Check if work time exceeds threshold
        if grossTime > *brk.AfterWorkMinutes {
            // Check if current break meets minimum
            if currentBreakTime < brk.Duration {
                additionalDeduction := brk.Duration - currentBreakTime
                result.NetTime -= additionalDeduction
                result.TotalBreakTime += additionalDeduction
                result.BreakDetails = append(result.BreakDetails, BreakDetail{
                    Type:     "minimum",
                    Duration: additionalDeduction,
                    Reason:   "minimum_break_enforcement",
                })
            }
        }
    }

    return result
}

// Updated DeductAllBreaks to include minimum break enforcement
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
    result.TotalBreakTime = fixedResult.TotalBreakTime
    result.BreakDetails = append(result.BreakDetails, fixedResult.BreakDetails...)

    // 2. Apply variable breaks
    variableResult := DeductVariableBreaks(result.NetTime+result.TotalBreakTime, breaks, breakPairs)
    additionalBreak := variableResult.TotalBreakTime
    result.NetTime -= additionalBreak
    result.TotalBreakTime += additionalBreak
    result.BreakDetails = append(result.BreakDetails, variableResult.BreakDetails...)

    // 3. Apply minimum breaks
    minResult := EnforceMinimumBreak(grossTime, result.TotalBreakTime, breaks)
    if len(minResult.BreakDetails) > 0 {
        additionalMin := minResult.TotalBreakTime - result.TotalBreakTime
        result.NetTime -= additionalMin
        result.TotalBreakTime = minResult.TotalBreakTime
        result.BreakDetails = append(result.BreakDetails, minResult.BreakDetails...)
    }

    return result
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/breaks_test.go`

Table-driven tests for minimum break enforcement using testify/assert:

```go
func TestEnforceMinimumBreak(t *testing.T) {
    tests := []struct {
        name              string
        grossTime         int
        currentBreakTime  int
        breaks            []BreakConfig
        expectedNetTime   int
        expectedBreakTime int
        hasAdditional     bool
    }{
        {
            name:             "below threshold - no enforcement",
            grossTime:        300,
            currentBreakTime: 0,
            breaks: []BreakConfig{
                {BreakType: "minimum", Duration: 30, AfterWorkMinutes: intPtr(360)},
            },
            expectedNetTime:   300,
            expectedBreakTime: 0,
            hasAdditional:     false,
        },
        {
            name:             "above threshold - no break taken",
            grossTime:        420,
            currentBreakTime: 0,
            breaks: []BreakConfig{
                {BreakType: "minimum", Duration: 30, AfterWorkMinutes: intPtr(360)},
            },
            expectedNetTime:   390,
            expectedBreakTime: 30,
            hasAdditional:     true,
        },
        {
            name:             "above threshold - partial break",
            grossTime:        420,
            currentBreakTime: 20,
            breaks: []BreakConfig{
                {BreakType: "minimum", Duration: 30, AfterWorkMinutes: intPtr(360)},
            },
            expectedNetTime:   390,
            expectedBreakTime: 30,
            hasAdditional:     true,
        },
        {
            name:             "above threshold - sufficient break",
            grossTime:        420,
            currentBreakTime: 45,
            breaks: []BreakConfig{
                {BreakType: "minimum", Duration: 30, AfterWorkMinutes: intPtr(360)},
            },
            expectedNetTime:   375,
            expectedBreakTime: 45,
            hasAdditional:     false,
        },
        {
            name:             "exact threshold boundary",
            grossTime:        360,
            currentBreakTime: 0,
            breaks: []BreakConfig{
                {BreakType: "minimum", Duration: 30, AfterWorkMinutes: intPtr(360)},
            },
            expectedNetTime:   360,
            expectedBreakTime: 0,
            hasAdditional:     false,
        },
        {
            name:             "empty breaks",
            grossTime:        420,
            currentBreakTime: 0,
            breaks:           []BreakConfig{},
            expectedNetTime:   420,
            expectedBreakTime: 0,
        },
        {
            name:             "nil AfterWorkMinutes",
            grossTime:        420,
            currentBreakTime: 0,
            breaks: []BreakConfig{
                {BreakType: "minimum", Duration: 30, AfterWorkMinutes: nil},
            },
            expectedNetTime:   420,
            expectedBreakTime: 0,
        },
        {
            name:             "zero gross time",
            grossTime:        0,
            currentBreakTime: 0,
            breaks: []BreakConfig{
                {BreakType: "minimum", Duration: 30, AfterWorkMinutes: intPtr(360)},
            },
            expectedNetTime:   0,
            expectedBreakTime: 0,
        },
        {
            name:             "current break equals minimum",
            grossTime:        420,
            currentBreakTime: 30,
            breaks: []BreakConfig{
                {BreakType: "minimum", Duration: 30, AfterWorkMinutes: intPtr(360)},
            },
            expectedNetTime:   390,
            expectedBreakTime: 30,
            hasAdditional:     false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := EnforceMinimumBreak(tt.grossTime, tt.currentBreakTime, tt.breaks)
            assert.Equal(t, tt.expectedNetTime, result.NetTime)
            assert.Equal(t, tt.expectedBreakTime, result.TotalBreakTime)
        })
    }
}
```

Edge cases covered:
- Empty break configurations
- Nil AfterWorkMinutes pointer
- Zero gross time
- Exact threshold boundary
- Current break equals minimum requirement
- Current break exceeds minimum requirement
- Multiple minimum break rules

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all break enforcement functions
- [ ] Tests cover edge cases and boundary values
- [ ] No deduction if work time below threshold
- [ ] Full minimum deducted if no break taken above threshold
- [ ] Difference deducted if break taken but below minimum
- [ ] No additional deduction if break already meets minimum
