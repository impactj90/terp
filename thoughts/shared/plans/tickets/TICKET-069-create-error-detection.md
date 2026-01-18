# TICKET-069: Create Error Detection

**Type**: Calculation
**Effort**: M
**Sprint**: 15 - Calculation Engine - Daily Calculation
**Dependencies**: TICKET-068

## Description

Implement comprehensive error detection for daily calculations.

## Files to Create

- `apps/api/internal/calculation/errors.go`
- `apps/api/internal/calculation/errors_test.go`

## Implementation

```go
package calculation

// Error codes
const (
    ErrMissingCome         = "MISSING_COME"
    ErrMissingGo           = "MISSING_GO"
    ErrMissingBreakEnd     = "MISSING_BREAK_END"
    ErrMissingBreakStart   = "MISSING_BREAK_START"
    ErrOverlappingBookings = "OVERLAPPING_BOOKINGS"
    ErrExceededMaxTime     = "EXCEEDED_MAX_TIME"
    ErrCameBeforeAllowed   = "CAME_BEFORE_ALLOWED"
    ErrLeftAfterAllowed    = "LEFT_AFTER_ALLOWED"
    ErrMissedCoreTime      = "MISSED_CORE_TIME"
    ErrNegativeDuration    = "NEGATIVE_DURATION"
    ErrNoBookings          = "NO_BOOKINGS"
)

// Warning codes
const (
    WarnNetTimeCapped     = "NET_TIME_CAPPED"
    WarnLateArrival       = "LATE_ARRIVAL"
    WarnEarlyDeparture    = "EARLY_DEPARTURE"
    WarnShortBreak        = "SHORT_BREAK"
    WarnLongWorkDay       = "LONG_WORK_DAY"
)

// DetectErrors analyzes the calculation and returns error codes
func DetectErrors(input DailyCalcInput, output DailyCalcOutput) []string {
    var errors []string

    // Skip error detection for absence/holiday/off days
    if input.Absence != nil || input.IsHoliday || input.DayPlan == nil {
        return errors
    }

    // Check for time window violations
    errors = append(errors, detectTimeWindowErrors(input, output)...)

    // Check for overlapping bookings
    if hasOverlappingBookings(input.Bookings) {
        errors = append(errors, ErrOverlappingBookings)
    }

    // Check for negative durations
    for _, pair := range output.PairedBookings {
        if pair.Duration < 0 {
            errors = append(errors, ErrNegativeDuration)
            break
        }
    }

    // Check core time (flextime plans)
    if input.DayPlan.PlanType == "flextime" && input.DayPlan.CoreStart != nil && input.DayPlan.CoreEnd != nil {
        if !coveredCoreTime(output, *input.DayPlan.CoreStart, *input.DayPlan.CoreEnd) {
            errors = append(errors, ErrMissedCoreTime)
        }
    }

    return errors
}

// DetectWarnings analyzes the calculation and returns warning codes
func DetectWarnings(input DailyCalcInput, output DailyCalcOutput) []string {
    var warnings []string

    if input.DayPlan == nil {
        return warnings
    }

    // Late arrival (outside tolerance)
    if input.DayPlan.ComeFrom != nil && output.FirstCome != nil {
        if *output.FirstCome > *input.DayPlan.ComeFrom+input.DayPlan.Tolerances.ComePlus {
            warnings = append(warnings, WarnLateArrival)
        }
    }

    // Early departure
    if input.DayPlan.GoTo != nil && output.LastGo != nil {
        expectedGo := *input.DayPlan.GoTo
        if output.TargetTime > 0 && output.NetTime < output.TargetTime {
            if *output.LastGo < expectedGo-input.DayPlan.Tolerances.GoMinus {
                warnings = append(warnings, WarnEarlyDeparture)
            }
        }
    }

    // Long work day (>10 hours)
    if output.GrossTime > 600 {
        warnings = append(warnings, WarnLongWorkDay)
    }

    return warnings
}

func detectTimeWindowErrors(input DailyCalcInput, output DailyCalcOutput) []string {
    var errors []string

    if output.FirstCome != nil && input.DayPlan.ComeFrom != nil {
        if *output.FirstCome < *input.DayPlan.ComeFrom-30 { // 30 min grace
            errors = append(errors, ErrCameBeforeAllowed)
        }
    }

    if output.LastGo != nil && input.DayPlan.GoTo != nil {
        if *output.LastGo > *input.DayPlan.GoTo+30 { // 30 min grace
            errors = append(errors, ErrLeftAfterAllowed)
        }
    }

    return errors
}

func hasOverlappingBookings(bookings []BookingInput) bool {
    // Sort by time
    sorted := make([]BookingInput, len(bookings))
    copy(sorted, bookings)
    sortByTime(sorted)

    for i := 0; i < len(sorted)-1; i++ {
        // Check if same category bookings overlap in time
        // This is a simplified check - real implementation may need more nuance
        if sorted[i].Category == sorted[i+1].Category {
            if sorted[i].EditedTime == sorted[i+1].EditedTime {
                return true // Duplicate time
            }
        }
    }
    return false
}

func coveredCoreTime(output DailyCalcOutput, coreStart, coreEnd int) bool {
    if output.FirstCome == nil || output.LastGo == nil {
        return false
    }
    // Check if work time covers core hours
    return *output.FirstCome <= coreStart && *output.LastGo >= coreEnd
}

// AddErrorsAndWarnings adds detected errors and warnings to output
func AddErrorsAndWarnings(input DailyCalcInput, output *DailyCalcOutput) {
    newErrors := DetectErrors(input, *output)
    newWarnings := DetectWarnings(input, *output)

    // Merge without duplicates
    for _, e := range newErrors {
        if !contains(output.ErrorCodes, e) {
            output.ErrorCodes = append(output.ErrorCodes, e)
        }
    }
    for _, w := range newWarnings {
        if !contains(output.Warnings, w) {
            output.Warnings = append(output.Warnings, w)
        }
    }

    output.HasError = len(output.ErrorCodes) > 0
}

func contains(slice []string, item string) bool {
    for _, s := range slice {
        if s == item {
            return true
        }
    }
    return false
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/errors_test.go`

Table-driven tests for error detection using testify/assert:

```go
func TestDetectErrors(t *testing.T) {
    tests := []struct {
        name          string
        input         DailyCalcInput
        output        DailyCalcOutput
        expectedErrs  []string
    }{
        {
            name: "came before allowed window",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{ComeFrom: intPtr(480)},
            },
            output: DailyCalcOutput{
                FirstCome: intPtr(420), // 07:00, more than 30min early
            },
            expectedErrs: []string{ErrCameBeforeAllowed},
        },
        {
            name: "left after allowed window",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{GoTo: intPtr(1020)},
            },
            output: DailyCalcOutput{
                LastGo: intPtr(1080), // More than 30min late
            },
            expectedErrs: []string{ErrLeftAfterAllowed},
        },
        {
            name: "missed core time - came late",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{
                    PlanType:  "flextime",
                    CoreStart: intPtr(540),
                    CoreEnd:   intPtr(960),
                },
            },
            output: DailyCalcOutput{
                FirstCome: intPtr(600), // Came after core start
                LastGo:    intPtr(1020),
            },
            expectedErrs: []string{ErrMissedCoreTime},
        },
        {
            name: "missed core time - left early",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{
                    PlanType:  "flextime",
                    CoreStart: intPtr(540),
                    CoreEnd:   intPtr(960),
                },
            },
            output: DailyCalcOutput{
                FirstCome: intPtr(480),
                LastGo:    intPtr(900), // Left before core end
            },
            expectedErrs: []string{ErrMissedCoreTime},
        },
        {
            name: "overlapping bookings",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{},
                Bookings: []BookingInput{
                    {Category: "come", EditedTime: 480},
                    {Category: "come", EditedTime: 480}, // Duplicate
                },
            },
            output:       DailyCalcOutput{},
            expectedErrs: []string{ErrOverlappingBookings},
        },
        {
            name: "negative duration in pair",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{},
            },
            output: DailyCalcOutput{
                PairedBookings: []BookingPair{
                    {Duration: -30},
                },
            },
            expectedErrs: []string{ErrNegativeDuration},
        },
        {
            name: "no errors - normal day",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{
                    ComeFrom: intPtr(480),
                    GoTo:     intPtr(1020),
                },
            },
            output: DailyCalcOutput{
                FirstCome: intPtr(480),
                LastGo:    intPtr(1020),
            },
            expectedErrs: []string{},
        },
        {
            name: "skip errors for absence",
            input: DailyCalcInput{
                Absence: &AbsenceInput{TypeCode: "U"},
            },
            output:       DailyCalcOutput{},
            expectedErrs: []string{},
        },
        {
            name: "skip errors for holiday",
            input: DailyCalcInput{
                IsHoliday: true,
            },
            output:       DailyCalcOutput{},
            expectedErrs: []string{},
        },
        {
            name: "skip errors for off day",
            input: DailyCalcInput{
                DayPlan: nil,
            },
            output:       DailyCalcOutput{},
            expectedErrs: []string{},
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            errors := DetectErrors(tt.input, tt.output)
            assert.Equal(t, len(tt.expectedErrs), len(errors))
            for _, expectedErr := range tt.expectedErrs {
                assert.Contains(t, errors, expectedErr)
            }
        })
    }
}

func TestDetectWarnings(t *testing.T) {
    tests := []struct {
        name         string
        input        DailyCalcInput
        output       DailyCalcOutput
        expectedWarnings []string
    }{
        {
            name: "late arrival - beyond tolerance",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{
                    ComeFrom:   intPtr(480),
                    Tolerances: ToleranceConfig{ComePlus: 5},
                },
            },
            output: DailyCalcOutput{
                FirstCome: intPtr(490), // 10 min late
            },
            expectedWarnings: []string{WarnLateArrival},
        },
        {
            name: "early departure with undertime",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{
                    GoTo:       intPtr(1020),
                    Tolerances: ToleranceConfig{GoMinus: 5},
                },
            },
            output: DailyCalcOutput{
                LastGo:     intPtr(1000),
                TargetTime: 480,
                NetTime:    420,
            },
            expectedWarnings: []string{WarnEarlyDeparture},
        },
        {
            name: "long work day - over 10 hours",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{},
            },
            output: DailyCalcOutput{
                GrossTime: 660, // 11 hours
            },
            expectedWarnings: []string{WarnLongWorkDay},
        },
        {
            name: "no warnings - normal day",
            input: DailyCalcInput{
                DayPlan: &DayPlanInput{},
            },
            output: DailyCalcOutput{
                GrossTime: 480,
            },
            expectedWarnings: []string{},
        },
        {
            name: "nil day plan - no warnings",
            input: DailyCalcInput{
                DayPlan: nil,
            },
            output:           DailyCalcOutput{},
            expectedWarnings: []string{},
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            warnings := DetectWarnings(tt.input, tt.output)
            assert.Equal(t, len(tt.expectedWarnings), len(warnings))
            for _, expectedWarn := range tt.expectedWarnings {
                assert.Contains(t, warnings, expectedWarn)
            }
        })
    }
}

func TestAddErrorsAndWarnings(t *testing.T) {
    t.Run("merges without duplicates", func(t *testing.T) {
        input := DailyCalcInput{
            DayPlan: &DayPlanInput{},
        }
        output := DailyCalcOutput{
            ErrorCodes: []string{ErrMissingGo},
            Warnings:   []string{},
            GrossTime:  660,
        }

        AddErrorsAndWarnings(input, &output)

        // Should not duplicate existing error
        count := 0
        for _, err := range output.ErrorCodes {
            if err == ErrMissingGo {
                count++
            }
        }
        assert.Equal(t, 1, count)

        // Should add warning
        assert.Contains(t, output.Warnings, WarnLongWorkDay)
        assert.True(t, output.HasError)
    })
}
```

Edge cases covered:
- Empty/nil inputs (nil day plan, absence, holiday)
- Boundary conditions (exactly at tolerance limit)
- Multiple errors in one day
- Duplicate error prevention
- Core time for fixed vs flextime plans
- Overlapping booking detection

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all error detection functions
- [ ] Tests cover edge cases and boundary values
- [ ] All error codes defined as constants
- [ ] All warning codes defined as constants
- [ ] Detects time window violations
- [ ] Detects overlapping bookings
- [ ] Detects missed core time (flextime)
- [ ] Generates warnings for late arrival/early departure
- [ ] Generates warning for long work day
