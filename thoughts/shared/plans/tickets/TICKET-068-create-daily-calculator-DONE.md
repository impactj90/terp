# TICKET-068: Create Daily Calculator

**Type**: Calculation
**Effort**: L
**Sprint**: 15 - Calculation Engine - Daily Calculation
**Dependencies**: TICKET-061, TICKET-062, TICKET-063, TICKET-064, TICKET-065, TICKET-066, TICKET-067

## Description

Implement the main daily calculation orchestrator.

## Files to Create

- `apps/api/internal/calculation/daily.go`
- `apps/api/internal/calculation/daily_test.go`

## Implementation

```go
package calculation

// CalculateDay performs the full daily calculation
func CalculateDay(input DailyCalcInput) DailyCalcOutput {
    var output DailyCalcOutput

    // Handle absence - credit hours and return early
    if input.Absence != nil {
        return handleAbsence(input)
    }

    // Handle holiday - credit hours if applicable
    if input.IsHoliday && input.DayPlan != nil {
        return handleHoliday(input)
    }

    // Off day - no calculation needed
    if input.DayPlan == nil {
        return output // Zero values
    }

    // No bookings - return target time as undertime
    if len(input.Bookings) == 0 {
        output.TargetTime = input.DayPlan.RegularHours
        output.Undertime = output.TargetTime
        return output
    }

    // 1. Pair bookings
    pairs, pairingErrors := PairBookings(input.Bookings)
    output.ErrorCodes = append(output.ErrorCodes, pairingErrors...)

    // 2. Separate work and break pairs
    var workPairs, breakPairs []BookingPair
    for _, p := range pairs {
        if p.PairType == "work" {
            workPairs = append(workPairs, p)
        } else {
            breakPairs = append(breakPairs, p)
        }
    }

    // 3. Apply tolerance to work pairs
    workPairs = ApplyTolerancesToPairs(workPairs, input.DayPlan)

    // 4. Apply rounding to work pairs
    workPairs = ApplyRoundingToPairs(workPairs, input.DayPlan)

    // 5. Calculate gross time
    output.GrossTime = CalculateGrossTime(workPairs)

    // 6. Deduct breaks
    breakResult := DeductAllBreaks(workPairs, breakPairs, input.DayPlan.Breaks)
    output.NetTime = breakResult.NetTime
    output.BreakTime = breakResult.TotalBreakTime

    // 7. Apply max cap
    if input.DayPlan.MaxNetWorkTime != nil && output.NetTime > *input.DayPlan.MaxNetWorkTime {
        output.NetTime = *input.DayPlan.MaxNetWorkTime
        output.Warnings = append(output.Warnings, "NET_TIME_CAPPED")
    }

    // 8. Calculate target time
    output.TargetTime = input.DayPlan.RegularHours

    // 9. Calculate overtime/undertime
    diff := output.NetTime - output.TargetTime
    if diff > 0 {
        output.Overtime = diff
    } else if diff < 0 {
        output.Undertime = -diff
    }

    // 10. Set booking summary
    output.FirstCome = GetFirstCome(workPairs)
    output.LastGo = GetLastGo(workPairs)

    // 11. Store paired bookings
    output.PairedBookings = append(workPairs, breakPairs...)

    // 12. Set error flag
    output.HasError = len(output.ErrorCodes) > 0

    return output
}

func handleAbsence(input DailyCalcInput) DailyCalcOutput {
    var output DailyCalcOutput

    if input.DayPlan != nil {
        output.TargetTime = input.DayPlan.RegularHours
    }

    if input.Absence.CreditsHours && input.DayPlan != nil {
        // Credit proportional hours
        creditedMinutes := int(float64(input.DayPlan.RegularHours) * input.Absence.Duration)
        output.NetTime = creditedMinutes
        // No overtime/undertime for absence
    }

    return output
}

func handleHoliday(input DailyCalcInput) DailyCalcOutput {
    var output DailyCalcOutput

    output.TargetTime = input.DayPlan.RegularHours
    output.NetTime = input.DayPlan.RegularHours
    // No overtime/undertime for holiday

    return output
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/daily_test.go`

Table-driven tests for daily calculation orchestrator using testify/assert:

```go
func TestCalculateDay(t *testing.T) {
    tests := []struct {
        name             string
        input            DailyCalcInput
        expectedGross    int
        expectedNet      int
        expectedTarget   int
        expectedOvertime int
        expectedUnder    int
        expectedBreak    int
        expectError      bool
    }{
        {
            name: "normal fixed day with break",
            input: DailyCalcInput{
                Date: time.Now(),
                DayPlan: &DayPlanInput{
                    PlanType:     "fixed",
                    RegularHours: 480,
                    ComeFrom:     intPtr(480),
                    GoTo:         intPtr(1020),
                    Breaks: []BreakConfig{
                        {BreakType: "fixed", StartTime: intPtr(720), EndTime: intPtr(750), Duration: 30},
                    },
                },
                Bookings: []BookingInput{
                    {ID: uuid.New(), Category: "come", EditedTime: 480},
                    {ID: uuid.New(), Category: "go", EditedTime: 1020},
                },
            },
            expectedGross:    540,
            expectedNet:      510,
            expectedTarget:   480,
            expectedOvertime: 30,
            expectedBreak:    30,
            expectError:      false,
        },
        {
            name: "off day - nil day plan",
            input: DailyCalcInput{
                Date:    time.Now(),
                DayPlan: nil,
            },
            expectedGross:  0,
            expectedNet:    0,
            expectedTarget: 0,
            expectError:    false,
        },
        {
            name: "holiday - credits hours",
            input: DailyCalcInput{
                Date:      time.Now(),
                DayPlan:   &DayPlanInput{RegularHours: 480},
                IsHoliday: true,
            },
            expectedNet:    480,
            expectedTarget: 480,
            expectError:    false,
        },
        {
            name: "absence - full day credit",
            input: DailyCalcInput{
                Date:    time.Now(),
                DayPlan: &DayPlanInput{RegularHours: 480},
                Absence: &AbsenceInput{
                    TypeCode:     "U",
                    CreditsHours: true,
                    Duration:     1.0,
                },
            },
            expectedNet:    480,
            expectedTarget: 480,
            expectError:    false,
        },
        {
            name: "absence - half day credit",
            input: DailyCalcInput{
                Date:    time.Now(),
                DayPlan: &DayPlanInput{RegularHours: 480},
                Absence: &AbsenceInput{
                    TypeCode:     "U",
                    CreditsHours: true,
                    Duration:     0.5,
                },
            },
            expectedNet:    240,
            expectedTarget: 480,
            expectError:    false,
        },
        {
            name: "no bookings - all undertime",
            input: DailyCalcInput{
                Date:     time.Now(),
                DayPlan:  &DayPlanInput{RegularHours: 480},
                Bookings: []BookingInput{},
            },
            expectedTarget: 480,
            expectedUnder:  480,
            expectError:    false,
        },
        {
            name: "missing go - pairing error",
            input: DailyCalcInput{
                Date:    time.Now(),
                DayPlan: &DayPlanInput{RegularHours: 480},
                Bookings: []BookingInput{
                    {ID: uuid.New(), Category: "come", EditedTime: 480},
                },
            },
            expectedTarget: 480,
            expectError:    true,
        },
        {
            name: "undertime - worked less than target",
            input: DailyCalcInput{
                Date:    time.Now(),
                DayPlan: &DayPlanInput{RegularHours: 480},
                Bookings: []BookingInput{
                    {ID: uuid.New(), Category: "come", EditedTime: 480},
                    {ID: uuid.New(), Category: "go", EditedTime: 900},
                },
            },
            expectedGross:  420,
            expectedNet:    420,
            expectedTarget: 480,
            expectedUnder:  60,
            expectError:    false,
        },
        {
            name: "max net time cap applied",
            input: DailyCalcInput{
                Date: time.Now(),
                DayPlan: &DayPlanInput{
                    RegularHours:   480,
                    MaxNetWorkTime: intPtr(540),
                },
                Bookings: []BookingInput{
                    {ID: uuid.New(), Category: "come", EditedTime: 480},
                    {ID: uuid.New(), Category: "go", EditedTime: 1140},
                },
            },
            expectedGross:    660,
            expectedNet:      540,
            expectedTarget:   480,
            expectedOvertime: 60,
            expectError:      false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            output := CalculateDay(tt.input)

            if tt.expectedGross > 0 {
                assert.Equal(t, tt.expectedGross, output.GrossTime)
            }
            if tt.expectedNet > 0 || tt.name == "off day - nil day plan" {
                assert.Equal(t, tt.expectedNet, output.NetTime)
            }
            assert.Equal(t, tt.expectedTarget, output.TargetTime)
            if tt.expectedOvertime > 0 {
                assert.Equal(t, tt.expectedOvertime, output.Overtime)
            }
            if tt.expectedUnder > 0 {
                assert.Equal(t, tt.expectedUnder, output.Undertime)
            }
            if tt.expectedBreak > 0 {
                assert.Equal(t, tt.expectedBreak, output.BreakTime)
            }
            assert.Equal(t, tt.expectError, output.HasError)
        })
    }
}

func TestCalculateDay_ComplexScenarios(t *testing.T) {
    t.Run("tolerance and rounding applied", func(t *testing.T) {
        input := DailyCalcInput{
            Date: time.Now(),
            DayPlan: &DayPlanInput{
                RegularHours: 480,
                ComeFrom:     intPtr(480),
                GoTo:         intPtr(1020),
                Tolerances:   ToleranceConfig{ComePlus: 5, ComeMinus: 5},
                Rounding:     RoundingConfig{ComeType: "up", ComeInterval: 15},
            },
            Bookings: []BookingInput{
                {ID: uuid.New(), Category: "come", EditedTime: 477}, // Within tolerance
                {ID: uuid.New(), Category: "go", EditedTime: 1020},
            },
        }

        output := CalculateDay(input)
        assert.NotNil(t, output.FirstCome)
        // Should apply tolerance first, then rounding
    })

    t.Run("multiple work pairs", func(t *testing.T) {
        input := DailyCalcInput{
            Date:    time.Now(),
            DayPlan: &DayPlanInput{RegularHours: 480},
            Bookings: []BookingInput{
                {ID: uuid.New(), Category: "come", EditedTime: 480},
                {ID: uuid.New(), Category: "go", EditedTime: 720},
                {ID: uuid.New(), Category: "come", EditedTime: 780},
                {ID: uuid.New(), Category: "go", EditedTime: 1020},
            },
        }

        output := CalculateDay(input)
        assert.Equal(t, 480, output.GrossTime)
        assert.Equal(t, 2, len(output.PairedBookings))
    })
}
```

Edge cases covered:
- Empty bookings
- Nil day plan (off day)
- Absence with partial credit (0.5)
- Holiday
- Max net time cap
- Multiple work pairs in one day
- Tolerance and rounding combinations
- Undertime and overtime scenarios

## Acceptance Criteria

- [ ] `make test` passes all test cases
- [ ] Unit tests for all calculation scenarios
- [ ] Tests cover edge cases and boundary values
- [ ] Handles normal workday calculation
- [ ] Handles absence with hour credit
- [ ] Handles holiday
- [ ] Handles off day (nil day plan)
- [ ] Handles missing bookings with errors
- [ ] Applies tolerance, rounding, breaks in correct order
- [ ] Calculates overtime/undertime correctly
