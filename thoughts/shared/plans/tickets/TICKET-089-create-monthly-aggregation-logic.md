# TICKET-089: Create Monthly Aggregation Logic

**Type**: Calculation
**Effort**: L
**Sprint**: 17 - Monthly Calculation
**Dependencies**: TICKET-060, TICKET-098 (account value service)

## Integration Notes

> - **Account posting**: Aggregated values should be posted to accounts via TICKET-098 (Account Value Service)
> - Flextime balance updates the employee's flextime account
> - Capping rules from TICKET-126 may apply at month-end

## Description

Implement monthly calculation aggregation logic with ZMI-compliant credit types and capping rules.

## ZMI Reference

> "Art der Gutschrift: 1=Keine Bewertung, 2=Kompletter Übertrag, 3=Nach einer Schwelle, 4=Kein Übertrag"
> "Gleitzeitschwelle: Minuten, die erreicht sein müssen für Gutschrift"
> "Untergrenze Jahreszeitkonto: Negativer Stand des Zeitkontos"

Credit types explained:
1. **Keine Bewertung** (No evaluation): Direct 1:1 transfer
2. **Kompletter Übertrag** (Complete carryover): Transfer with positive/negative caps
3. **Nach einer Schwelle** (After threshold): Only overtime above threshold credited
4. **Kein Übertrag** (No carryover): Reset to zero each month

## Files to Create

- `apps/api/internal/calculation/monthly.go`
- `apps/api/internal/calculation/monthly_test.go`

## Implementation

```go
package calculation

import (
    "github.com/shopspring/decimal"
)

// CreditType represents how flextime/overtime is credited
// ZMI: Art der Gutschrift
type CreditType string

const (
    // CreditTypeNoEvaluation - Direct 1:1 transfer, no limits
    // ZMI: Keine Bewertung
    CreditTypeNoEvaluation CreditType = "no_evaluation"

    // CreditTypeCompleteCarryover - Transfer with positive/negative caps
    // ZMI: Kompletter Übertrag
    CreditTypeCompleteCarryover CreditType = "complete_carryover"

    // CreditTypeAfterThreshold - Only overtime above threshold credited
    // ZMI: Nach einer Schwelle
    CreditTypeAfterThreshold CreditType = "after_threshold"

    // CreditTypeNoCarryover - Reset to zero each month
    // ZMI: Kein Übertrag
    CreditTypeNoCarryover CreditType = "no_carryover"
)

// MonthlyCalcInput contains all data needed to calculate a month
type MonthlyCalcInput struct {
    DailyValues       []DailyValueInput
    PreviousCarryover int // Flextime carryover from previous month (minutes)
    EvaluationRules   *MonthlyEvaluationInput
    AbsenceSummary    AbsenceSummaryInput
}

type DailyValueInput struct {
    Date       string // YYYY-MM-DD for reference
    GrossTime  int    // Minutes
    NetTime    int    // Minutes
    TargetTime int    // Minutes
    Overtime   int    // Minutes (positive)
    Undertime  int    // Minutes (positive, to subtract)
    BreakTime  int    // Minutes
    HasError   bool
}

// MonthlyEvaluationInput contains ZMI evaluation rules
type MonthlyEvaluationInput struct {
    // ZMI: Art der Gutschrift
    CreditType CreditType

    // ZMI: Gleitzeitschwelle - minutes threshold for CreditTypeAfterThreshold
    FlextimeThreshold *int

    // ZMI: Maximale Gleitzeit im Monat - monthly credit cap (minutes)
    MaxFlextimePerMonth *int

    // ZMI: Obergrenze Gleitzeit - positive cap for carryover (minutes)
    FlextimeCapPositive *int

    // ZMI: Untergrenze Gleitzeit - negative cap for carryover (minutes, stored as positive)
    FlextimeCapNegative *int

    // ZMI: Untergrenze Jahreszeitkonto - annual floor (minutes)
    AnnualFloorBalance *int
}

type AbsenceSummaryInput struct {
    VacationDays     decimal.Decimal
    SickDays         int
    OtherAbsenceDays int
}

// MonthlyCalcOutput contains calculated monthly results
type MonthlyCalcOutput struct {
    // Aggregated totals (all in minutes)
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    // Flextime calculation
    FlextimeStart     int // Previous month carryover
    FlextimeChange    int // This month's change
    FlextimeRaw       int // Before caps: Start + Change
    FlextimeCredited  int // Amount actually credited (after threshold)
    FlextimeForfeited int // Amount forfeited (below threshold or caps)
    FlextimeEnd       int // Final balance after caps

    // Summary
    WorkDays       int
    DaysWithErrors int

    // Absence copy
    VacationTaken    decimal.Decimal
    SickDays         int
    OtherAbsenceDays int

    // Warnings/info
    Warnings []string
}

// CalculateMonth aggregates daily values into monthly totals
func CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput {
    output := MonthlyCalcOutput{
        FlextimeStart:    input.PreviousCarryover,
        VacationTaken:    input.AbsenceSummary.VacationDays,
        SickDays:         input.AbsenceSummary.SickDays,
        OtherAbsenceDays: input.AbsenceSummary.OtherAbsenceDays,
        Warnings:         []string{},
    }

    // Step 1: Aggregate daily values
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

    // Step 2: Calculate raw flextime change
    output.FlextimeChange = output.TotalOvertime - output.TotalUndertime
    output.FlextimeRaw = output.FlextimeStart + output.FlextimeChange

    // Step 3: Apply credit type rules
    if input.EvaluationRules != nil {
        output = applyCreditType(output, *input.EvaluationRules)
    } else {
        // Default: no evaluation (direct transfer)
        output.FlextimeCredited = output.FlextimeChange
        output.FlextimeEnd = output.FlextimeRaw
    }

    return output
}

// applyCreditType applies ZMI credit type rules
func applyCreditType(output MonthlyCalcOutput, rules MonthlyEvaluationInput) MonthlyCalcOutput {
    switch rules.CreditType {
    case CreditTypeNoEvaluation:
        // ZMI: Keine Bewertung - direct 1:1 transfer
        output.FlextimeCredited = output.FlextimeChange
        output.FlextimeEnd = output.FlextimeRaw

    case CreditTypeCompleteCarryover:
        // ZMI: Kompletter Übertrag - apply caps
        output.FlextimeCredited = output.FlextimeChange

        // Apply monthly cap if configured
        if rules.MaxFlextimePerMonth != nil && output.FlextimeCredited > *rules.MaxFlextimePerMonth {
            output.FlextimeForfeited = output.FlextimeCredited - *rules.MaxFlextimePerMonth
            output.FlextimeCredited = *rules.MaxFlextimePerMonth
            output.Warnings = append(output.Warnings, "MONTHLY_CAP_REACHED")
        }

        output.FlextimeEnd = output.FlextimeStart + output.FlextimeCredited

        // Apply positive/negative caps
        output.FlextimeEnd, output.FlextimeForfeited = applyFlextimeCaps(
            output.FlextimeEnd,
            rules.FlextimeCapPositive,
            rules.FlextimeCapNegative,
            output.FlextimeForfeited,
        )

        if output.FlextimeForfeited > 0 {
            output.Warnings = append(output.Warnings, "FLEXTIME_CAPPED")
        }

    case CreditTypeAfterThreshold:
        // ZMI: Nach einer Schwelle - only credit above threshold
        threshold := 0
        if rules.FlextimeThreshold != nil {
            threshold = *rules.FlextimeThreshold
        }

        if output.FlextimeChange > threshold {
            // Credit only the amount above threshold
            output.FlextimeCredited = output.FlextimeChange - threshold
            output.FlextimeForfeited = threshold
        } else if output.FlextimeChange > 0 {
            // Below threshold - entire positive amount forfeited
            output.FlextimeCredited = 0
            output.FlextimeForfeited = output.FlextimeChange
            output.Warnings = append(output.Warnings, "BELOW_THRESHOLD")
        } else {
            // Negative (undertime) - still deducted
            output.FlextimeCredited = output.FlextimeChange
            output.FlextimeForfeited = 0
        }

        output.FlextimeEnd = output.FlextimeStart + output.FlextimeCredited

        // Apply caps
        output.FlextimeEnd, _ = applyFlextimeCaps(
            output.FlextimeEnd,
            rules.FlextimeCapPositive,
            rules.FlextimeCapNegative,
            0,
        )

    case CreditTypeNoCarryover:
        // ZMI: Kein Übertrag - reset to zero
        output.FlextimeCredited = 0
        output.FlextimeForfeited = output.FlextimeChange
        if output.FlextimeChange > 0 {
            output.FlextimeForfeited = output.FlextimeChange
        }
        output.FlextimeEnd = 0
        output.Warnings = append(output.Warnings, "NO_CARRYOVER")

    default:
        // Default: no evaluation
        output.FlextimeCredited = output.FlextimeChange
        output.FlextimeEnd = output.FlextimeRaw
    }

    return output
}

// applyFlextimeCaps applies positive and negative caps
// Returns (capped value, additional forfeited amount)
func applyFlextimeCaps(flextime int, capPositive, capNegative *int, existingForfeited int) (int, int) {
    result := flextime
    forfeited := existingForfeited

    if capPositive != nil && result > *capPositive {
        forfeited += result - *capPositive
        result = *capPositive
    }
    if capNegative != nil && result < -*capNegative {
        // Note: capNegative is stored as positive value
        result = -*capNegative
    }

    return result, forfeited
}

// CalculateAnnualCarryover calculates year-end carryover with annual floor
// ZMI: Untergrenze Jahreszeitkonto
func CalculateAnnualCarryover(currentBalance, annualFloor *int) int {
    if currentBalance == nil {
        return 0
    }
    balance := *currentBalance

    if annualFloor != nil && balance < -*annualFloor {
        return -*annualFloor
    }

    return balance
}
```

## Unit Tests

**File**: `apps/api/internal/calculation/monthly_test.go`

```go
package calculation

import (
    "testing"

    "github.com/shopspring/decimal"
    "github.com/stretchr/testify/assert"
)

func intPtr(i int) *int {
    return &i
}

func TestCalculateMonth_CreditTypeNoEvaluation(t *testing.T) {
    input := MonthlyCalcInput{
        DailyValues: []DailyValueInput{
            {NetTime: 540, TargetTime: 480, Overtime: 60},
            {NetTime: 540, TargetTime: 480, Overtime: 60},
        },
        PreviousCarryover: 100,
        EvaluationRules: &MonthlyEvaluationInput{
            CreditType: CreditTypeNoEvaluation,
        },
    }

    output := CalculateMonth(input)

    assert.Equal(t, 100, output.FlextimeStart)
    assert.Equal(t, 120, output.FlextimeChange)
    assert.Equal(t, 120, output.FlextimeCredited)
    assert.Equal(t, 220, output.FlextimeEnd)
    assert.Equal(t, 0, output.FlextimeForfeited)
}

func TestCalculateMonth_CreditTypeCompleteCarryover_WithCaps(t *testing.T) {
    input := MonthlyCalcInput{
        DailyValues: []DailyValueInput{
            {Overtime: 100},
            {Overtime: 100},
        },
        PreviousCarryover: 50,
        EvaluationRules: &MonthlyEvaluationInput{
            CreditType:          CreditTypeCompleteCarryover,
            FlextimeCapPositive: intPtr(200),
        },
    }

    output := CalculateMonth(input)

    assert.Equal(t, 50, output.FlextimeStart)
    assert.Equal(t, 200, output.FlextimeChange)
    assert.Equal(t, 200, output.FlextimeCredited)
    assert.Equal(t, 200, output.FlextimeEnd) // Capped at 200
    assert.Equal(t, 50, output.FlextimeForfeited)
    assert.Contains(t, output.Warnings, "FLEXTIME_CAPPED")
}

func TestCalculateMonth_CreditTypeAfterThreshold(t *testing.T) {
    tests := []struct {
        name              string
        overtime          int
        threshold         int
        expectedCredited  int
        expectedForfeited int
        expectWarning     bool
    }{
        {
            name:              "above threshold",
            overtime:          120,
            threshold:         60,
            expectedCredited:  60,  // 120 - 60
            expectedForfeited: 60,
            expectWarning:     false,
        },
        {
            name:              "at threshold",
            overtime:          60,
            threshold:         60,
            expectedCredited:  0,
            expectedForfeited: 60,
            expectWarning:     true,
        },
        {
            name:              "below threshold",
            overtime:          30,
            threshold:         60,
            expectedCredited:  0,
            expectedForfeited: 30,
            expectWarning:     true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            input := MonthlyCalcInput{
                DailyValues: []DailyValueInput{
                    {Overtime: tt.overtime},
                },
                PreviousCarryover: 0,
                EvaluationRules: &MonthlyEvaluationInput{
                    CreditType:        CreditTypeAfterThreshold,
                    FlextimeThreshold: intPtr(tt.threshold),
                },
            }

            output := CalculateMonth(input)

            assert.Equal(t, tt.expectedCredited, output.FlextimeCredited)
            assert.Equal(t, tt.expectedForfeited, output.FlextimeForfeited)
            if tt.expectWarning {
                assert.Contains(t, output.Warnings, "BELOW_THRESHOLD")
            }
        })
    }
}

func TestCalculateMonth_CreditTypeAfterThreshold_Undertime(t *testing.T) {
    // Undertime should still be deducted even with threshold
    input := MonthlyCalcInput{
        DailyValues: []DailyValueInput{
            {Undertime: 60},
        },
        PreviousCarryover: 100,
        EvaluationRules: &MonthlyEvaluationInput{
            CreditType:        CreditTypeAfterThreshold,
            FlextimeThreshold: intPtr(30),
        },
    }

    output := CalculateMonth(input)

    assert.Equal(t, -60, output.FlextimeCredited) // Undertime still deducted
    assert.Equal(t, 40, output.FlextimeEnd)       // 100 - 60
}

func TestCalculateMonth_CreditTypeNoCarryover(t *testing.T) {
    input := MonthlyCalcInput{
        DailyValues: []DailyValueInput{
            {Overtime: 120},
        },
        PreviousCarryover: 100,
        EvaluationRules: &MonthlyEvaluationInput{
            CreditType: CreditTypeNoCarryover,
        },
    }

    output := CalculateMonth(input)

    assert.Equal(t, 100, output.FlextimeStart)
    assert.Equal(t, 120, output.FlextimeChange)
    assert.Equal(t, 0, output.FlextimeCredited)
    assert.Equal(t, 0, output.FlextimeEnd) // Reset to zero
    assert.Equal(t, 120, output.FlextimeForfeited)
    assert.Contains(t, output.Warnings, "NO_CARRYOVER")
}

func TestCalculateMonth_MonthlyCap(t *testing.T) {
    input := MonthlyCalcInput{
        DailyValues: []DailyValueInput{
            {Overtime: 200},
        },
        PreviousCarryover: 0,
        EvaluationRules: &MonthlyEvaluationInput{
            CreditType:          CreditTypeCompleteCarryover,
            MaxFlextimePerMonth: intPtr(120),
        },
    }

    output := CalculateMonth(input)

    assert.Equal(t, 120, output.FlextimeCredited) // Capped at monthly max
    assert.Equal(t, 80, output.FlextimeForfeited) // 200 - 120
    assert.Contains(t, output.Warnings, "MONTHLY_CAP_REACHED")
}

func TestCalculateMonth_NegativeCap(t *testing.T) {
    input := MonthlyCalcInput{
        DailyValues: []DailyValueInput{
            {Undertime: 200},
        },
        PreviousCarryover: 0,
        EvaluationRules: &MonthlyEvaluationInput{
            CreditType:          CreditTypeCompleteCarryover,
            FlextimeCapNegative: intPtr(100), // -100 floor
        },
    }

    output := CalculateMonth(input)

    assert.Equal(t, -100, output.FlextimeEnd) // Capped at -100
}

func TestCalculateMonth_WorkDaysAndErrors(t *testing.T) {
    input := MonthlyCalcInput{
        DailyValues: []DailyValueInput{
            {NetTime: 480, HasError: false},
            {NetTime: 480, HasError: true},
            {NetTime: 0, HasError: true}, // No work, has error
            {NetTime: 480, HasError: false},
        },
    }

    output := CalculateMonth(input)

    assert.Equal(t, 3, output.WorkDays)       // 3 days with NetTime > 0
    assert.Equal(t, 2, output.DaysWithErrors) // 2 days with errors
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

func TestCalculateAnnualCarryover(t *testing.T) {
    tests := []struct {
        name        string
        balance     *int
        floor       *int
        expected    int
    }{
        {"nil balance", nil, intPtr(100), 0},
        {"positive balance, no floor", intPtr(200), nil, 200},
        {"positive balance, with floor", intPtr(200), intPtr(100), 200},
        {"negative above floor", intPtr(-50), intPtr(100), -50},
        {"negative below floor", intPtr(-150), intPtr(100), -100},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculateAnnualCarryover(tt.balance, tt.floor)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestApplyFlextimeCaps(t *testing.T) {
    tests := []struct {
        name              string
        flextime          int
        capPositive       *int
        capNegative       *int
        existingForfeited int
        expectedResult    int
        expectedForfeited int
    }{
        {"no caps", 100, nil, nil, 0, 100, 0},
        {"under positive cap", 100, intPtr(150), nil, 0, 100, 0},
        {"over positive cap", 200, intPtr(150), nil, 0, 150, 50},
        {"above negative cap", -100, nil, intPtr(150), 0, -100, 0},
        {"below negative cap", -200, nil, intPtr(100), 0, -100, 0},
        {"both caps - positive", 200, intPtr(150), intPtr(100), 10, 150, 60},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, forfeited := applyFlextimeCaps(
                tt.flextime,
                tt.capPositive,
                tt.capNegative,
                tt.existingForfeited,
            )
            assert.Equal(t, tt.expectedResult, result)
            assert.Equal(t, tt.expectedForfeited, forfeited)
        })
    }
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Art der Gutschrift | `CreditType` enum with 4 types |
| Keine Bewertung | `CreditTypeNoEvaluation` |
| Kompletter Übertrag | `CreditTypeCompleteCarryover` |
| Nach einer Schwelle | `CreditTypeAfterThreshold` |
| Kein Übertrag | `CreditTypeNoCarryover` |
| Gleitzeitschwelle | `FlextimeThreshold` field |
| Maximale Gleitzeit im Monat | `MaxFlextimePerMonth` field |
| Obergrenze Gleitzeit | `FlextimeCapPositive` field |
| Untergrenze Gleitzeit | `FlextimeCapNegative` field |
| Untergrenze Jahreszeitkonto | `AnnualFloorBalance` + `CalculateAnnualCarryover()` |

## Acceptance Criteria

- [ ] All 4 ZMI credit types implemented correctly
- [ ] Threshold logic: only overtime above threshold credited
- [ ] Monthly cap: limits monthly credit
- [ ] Positive/negative caps: limits carryover balance
- [ ] Annual floor: `CalculateAnnualCarryover()` enforces floor
- [ ] Forfeited time tracked and reported
- [ ] Warnings generated for significant events
- [ ] `make test` passes with comprehensive test coverage
- [ ] Edge cases covered (zero values, nil configs, negative amounts)
