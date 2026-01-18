# TICKET-089: Create Monthly Aggregation Logic

**Type**: Calculation
**Effort**: M
**Sprint**: 22 - Monthly Calculation
**Dependencies**: TICKET-060

## Description

Implement monthly calculation aggregation logic.

## Files to Create

- `apps/api/internal/calculation/monthly.go`
- `apps/api/internal/calculation/monthly_test.go`

## Implementation

```go
package calculation

import (
    "github.com/shopspring/decimal"
)

// MonthlyCalcInput contains all data needed to calculate a month
type MonthlyCalcInput struct {
    DailyValues       []DailyValueInput
    PreviousCarryover int // Flextime carryover from previous month
    EvaluationRules   *MonthlyEvaluationInput
    AbsenceSummary    AbsenceSummaryInput
}

type DailyValueInput struct {
    Date       string // For reference
    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int
    HasError   bool
}

type MonthlyEvaluationInput struct {
    FlextimeCapPositive *int
    FlextimeCapNegative *int
    OvertimeThreshold   *int
}

type AbsenceSummaryInput struct {
    VacationDays     decimal.Decimal
    SickDays         int
    OtherAbsenceDays int
}

// MonthlyCalcOutput contains calculated monthly results
type MonthlyCalcOutput struct {
    // Aggregated totals
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    // Flextime
    FlextimeStart    int
    FlextimeChange   int
    FlextimeEnd      int
    FlextimeCarryover int

    // Summary
    WorkDays       int
    DaysWithErrors int

    // Absence copy
    VacationTaken    decimal.Decimal
    SickDays         int
    OtherAbsenceDays int
}

// CalculateMonth aggregates daily values into monthly totals
func CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput {
    output := MonthlyCalcOutput{
        FlextimeStart:    input.PreviousCarryover,
        VacationTaken:    input.AbsenceSummary.VacationDays,
        SickDays:         input.AbsenceSummary.SickDays,
        OtherAbsenceDays: input.AbsenceSummary.OtherAbsenceDays,
    }

    // Aggregate daily values
    for _, dv := range input.DailyValues {
        output.TotalGrossTime += dv.GrossTime
        output.TotalNetTime += dv.NetTime
        output.TotalTargetTime += dv.TargetTime
        output.TotalOvertime += dv.Overtime
        output.TotalUndertime += dv.Undertime
        output.TotalBreakTime += dv.BreakTime

        if dv.GrossTime > 0 || dv.NetTime > 0 {
            output.WorkDays++
        }
        if dv.HasError {
            output.DaysWithErrors++
        }
    }

    // Calculate flextime change
    output.FlextimeChange = output.TotalOvertime - output.TotalUndertime

    // Calculate end balance
    output.FlextimeEnd = output.FlextimeStart + output.FlextimeChange

    // Apply caps if evaluation rules exist
    if input.EvaluationRules != nil {
        output.FlextimeCarryover = applyFlextimeCaps(
            output.FlextimeEnd,
            input.EvaluationRules.FlextimeCapPositive,
            input.EvaluationRules.FlextimeCapNegative,
        )
    } else {
        output.FlextimeCarryover = output.FlextimeEnd
    }

    return output
}

func applyFlextimeCaps(flextime int, capPositive, capNegative *int) int {
    result := flextime
    if capPositive != nil && result > *capPositive {
        result = *capPositive
    }
    if capNegative != nil && result < -*capNegative {
        result = -*capNegative
    }
    return result
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/monthly_test.go`

Table-driven tests for monthly aggregation using testify/assert:

```go
func TestCalculateMonth(t *testing.T) {
    tests := []struct {
        name                  string
        input                 MonthlyCalcInput
        expectedTotalNet      int
        expectedTotalTarget   int
        expectedFlextimeStart int
        expectedFlextimeEnd   int
        expectedCarryover     int
        expectedWorkDays      int
    }{
        {
            name: "basic month - balanced",
            input: MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {NetTime: 480, TargetTime: 480, Overtime: 0, Undertime: 0},
                    {NetTime: 510, TargetTime: 480, Overtime: 30, Undertime: 0},
                    {NetTime: 450, TargetTime: 480, Overtime: 0, Undertime: 30},
                },
                PreviousCarryover: 60,
            },
            expectedTotalNet:      1440,
            expectedTotalTarget:   1440,
            expectedFlextimeStart: 60,
            expectedFlextimeEnd:   60,
            expectedCarryover:     60,
            expectedWorkDays:      3,
        },
        {
            name: "with positive cap",
            input: MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {Overtime: 60, GrossTime: 540},
                    {Overtime: 60, GrossTime: 540},
                    {Overtime: 60, GrossTime: 540},
                },
                PreviousCarryover: 0,
                EvaluationRules: &MonthlyEvaluationInput{
                    FlextimeCapPositive: intPtr(120),
                },
            },
            expectedFlextimeEnd: 180,
            expectedCarryover:   120,
            expectedWorkDays:    3,
        },
        {
            name: "with negative cap",
            input: MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {Undertime: 60, TargetTime: 480, NetTime: 420},
                    {Undertime: 60, TargetTime: 480, NetTime: 420},
                    {Undertime: 60, TargetTime: 480, NetTime: 420},
                },
                PreviousCarryover: 0,
                EvaluationRules: &MonthlyEvaluationInput{
                    FlextimeCapNegative: intPtr(120),
                },
            },
            expectedFlextimeEnd: -180,
            expectedCarryover:   -120,
            expectedWorkDays:    3,
        },
        {
            name: "empty month - no work days",
            input: MonthlyCalcInput{
                DailyValues:       []DailyValueInput{},
                PreviousCarryover: 30,
            },
            expectedFlextimeStart: 30,
            expectedFlextimeEnd:   30,
            expectedCarryover:     30,
            expectedWorkDays:      0,
        },
        {
            name: "month with errors",
            input: MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {NetTime: 480, HasError: false},
                    {NetTime: 0, HasError: true},
                    {NetTime: 480, HasError: true},
                },
                PreviousCarryover: 0,
            },
            expectedTotalNet: 960,
            expectedWorkDays: 2,
        },
        {
            name: "carryover from previous month",
            input: MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {NetTime: 480, TargetTime: 480},
                },
                PreviousCarryover: 120,
            },
            expectedFlextimeStart: 120,
            expectedFlextimeEnd:   120,
            expectedCarryover:     120,
        },
        {
            name: "overtime accumulated",
            input: MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {NetTime: 540, TargetTime: 480, Overtime: 60},
                    {NetTime: 540, TargetTime: 480, Overtime: 60},
                },
                PreviousCarryover: 0,
            },
            expectedTotalNet:    1080,
            expectedTotalTarget: 960,
            expectedFlextimeEnd: 120,
            expectedCarryover:   120,
        },
        {
            name: "undertime accumulated",
            input: MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {NetTime: 420, TargetTime: 480, Undertime: 60},
                    {NetTime: 420, TargetTime: 480, Undertime: 60},
                },
                PreviousCarryover: 0,
            },
            expectedTotalNet:    840,
            expectedTotalTarget: 960,
            expectedFlextimeEnd: -120,
            expectedCarryover:   -120,
        },
        {
            name: "both caps applied",
            input: MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {Overtime: 100},
                },
                PreviousCarryover: 50,
                EvaluationRules: &MonthlyEvaluationInput{
                    FlextimeCapPositive: intPtr(120),
                    FlextimeCapNegative: intPtr(60),
                },
            },
            expectedFlextimeEnd: 150,
            expectedCarryover:   120,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            output := CalculateMonth(tt.input)

            if tt.expectedTotalNet > 0 {
                assert.Equal(t, tt.expectedTotalNet, output.TotalNetTime)
            }
            if tt.expectedTotalTarget > 0 {
                assert.Equal(t, tt.expectedTotalTarget, output.TotalTargetTime)
            }
            assert.Equal(t, tt.expectedFlextimeStart, output.FlextimeStart)
            assert.Equal(t, tt.expectedFlextimeEnd, output.FlextimeEnd)
            assert.Equal(t, tt.expectedCarryover, output.FlextimeCarryover)
            assert.Equal(t, tt.expectedWorkDays, output.WorkDays)
        })
    }
}

func TestApplyFlextimeCaps(t *testing.T) {
    tests := []struct {
        name        string
        flextime    int
        capPositive *int
        capNegative *int
        want        int
    }{
        {"no caps", 100, nil, nil, 100},
        {"under positive cap", 100, intPtr(150), nil, 100},
        {"over positive cap", 200, intPtr(150), nil, 150},
        {"above negative cap", -100, nil, intPtr(150), -100},
        {"below negative cap", -200, nil, intPtr(150), -150},
        {"both caps - positive limited", 200, intPtr(150), intPtr(100), 150},
        {"both caps - negative limited", -200, intPtr(150), intPtr(100), -100},
        {"zero flextime", 0, intPtr(150), intPtr(100), 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := applyFlextimeCaps(tt.flextime, tt.capPositive, tt.capNegative)
            assert.Equal(t, tt.want, result)
        })
    }
}

func TestCalculateMonth_AbsenceSummary(t *testing.T) {
    input := MonthlyCalcInput{
        DailyValues: []DailyValueInput{},
        AbsenceSummary: AbsenceSummaryInput{
            VacationDays:     decimal.NewFromFloat(5.5),
            SickDays:         2,
            OtherAbsenceDays: 1,
        },
    }

    output := CalculateMonth(input)

    assert.True(t, decimal.NewFromFloat(5.5).Equal(output.VacationTaken))
    assert.Equal(t, 2, output.SickDays)
    assert.Equal(t, 1, output.OtherAbsenceDays)
}
```

Edge cases covered:
- Empty daily values (no work days)
- Negative carryover from previous month
- Zero flextime caps
- Mix of overtime and undertime in same month
- Days with errors (counting)
- Absence summary passthrough
- Both positive and negative caps applied
- Boundary conditions for caps

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all aggregation functions
- [ ] Tests cover edge cases and boundary values
- [ ] Aggregates all daily values correctly
- [ ] Calculates flextime change
- [ ] Applies positive and negative caps
- [ ] Counts work days and error days
