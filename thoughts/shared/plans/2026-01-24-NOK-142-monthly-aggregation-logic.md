# Implementation Plan: NOK-142 - Monthly Aggregation Logic

> Ticket: NOK-142 (TICKET-089)
> Date: 2026-01-24
> Research: thoughts/shared/research/2026-01-24-NOK-142-monthly-aggregation-logic.md

## Summary

Implement the monthly calculation aggregation logic as a pure function in the calculation package. This function aggregates daily values into monthly totals and applies ZMI-compliant credit type rules for flextime carryover (Art der Gutschrift). The implementation is fully self-contained with no database or HTTP dependencies.

## Dependencies (Verified)

| Dependency | Status | Notes |
|---|---|---|
| Calculation package structure | DONE | `apps/api/internal/calculation/` exists |
| Calculation types | DONE | `types.go` exists with input/output structs |
| DailyValue model | DONE | `model/dailyvalue.go` exists |
| `shopspring/decimal` | DONE | Already used in vacation.go |

## Files to Create

1. `apps/api/internal/calculation/monthly.go` - Monthly calculation types and functions
2. `apps/api/internal/calculation/monthly_test.go` - Comprehensive tests

## ZMI Reference

Section 12, Pages 59-60 of ZMI manual (Monatsbewertung / Monthly Evaluation):

- **Art der Gutschrift** (Credit type): 4 modes for how overtime is credited to flextime account
- **Maximale Gleitzeit im Monat**: Monthly credit cap (minutes)
- **Obergrenze Jahreszeitkonto**: Upper limit for annual time account (positive cap)
- **Untergrenze Jahreszeitkonto**: Lower limit for annual time account (negative floor)
- **Gleitzeitschwelle**: Flextime threshold - minimum overtime required for credit

---

## Phase 1: Define Monthly Calculation Types

**File**: `apps/api/internal/calculation/monthly.go`

### Types to define:

1. **CreditType** - String enum with 4 ZMI credit types:
   - `CreditTypeNoEvaluation` ("no_evaluation") - Direct 1:1 transfer, no limits
   - `CreditTypeCompleteCarryover` ("complete_carryover") - Transfer with caps
   - `CreditTypeAfterThreshold` ("after_threshold") - Only above threshold credited
   - `CreditTypeNoCarryover` ("no_carryover") - Reset to zero each month

2. **MonthlyCalcInput** - Input struct:
   - `DailyValues []DailyValueInput` - Daily values for the month
   - `PreviousCarryover int` - Flextime balance from previous month (minutes)
   - `EvaluationRules *MonthlyEvaluationInput` - ZMI rules (nil = no evaluation)
   - `AbsenceSummary AbsenceSummaryInput` - Pre-computed absence counts

3. **DailyValueInput** - Simplified daily value (decoupled from model.DailyValue):
   - `Date string` - YYYY-MM-DD reference
   - `GrossTime int` - Minutes
   - `NetTime int` - Minutes
   - `TargetTime int` - Minutes
   - `Overtime int` - Minutes (positive)
   - `Undertime int` - Minutes (positive, to subtract)
   - `BreakTime int` - Minutes
   - `HasError bool`

4. **MonthlyEvaluationInput** - ZMI evaluation rules:
   - `CreditType CreditType` - Which of the 4 credit types
   - `FlextimeThreshold *int` - Threshold for after_threshold mode
   - `MaxFlextimePerMonth *int` - Monthly credit cap
   - `FlextimeCapPositive *int` - Upper balance limit
   - `FlextimeCapNegative *int` - Lower balance limit (stored as positive value)
   - `AnnualFloorBalance *int` - Year-end annual floor

5. **AbsenceSummaryInput** - Pre-computed absence data:
   - `VacationDays decimal.Decimal`
   - `SickDays int`
   - `OtherAbsenceDays int`

6. **MonthlyCalcOutput** - Calculation results:
   - Aggregated totals: `TotalGrossTime`, `TotalNetTime`, `TotalTargetTime`, `TotalOvertime`, `TotalUndertime`, `TotalBreakTime`
   - Flextime tracking: `FlextimeStart`, `FlextimeChange`, `FlextimeRaw`, `FlextimeCredited`, `FlextimeForfeited`, `FlextimeEnd`
   - Work summary: `WorkDays`, `DaysWithErrors`
   - Absence copy: `VacationTaken`, `SickDays`, `OtherAbsenceDays`
   - `Warnings []string`

### Warning constants to add (to errors.go):

```go
// Monthly calculation warnings
WarnCodeMonthlyCap    = "MONTHLY_CAP_REACHED"  // FlextimeCredited capped at MaxFlextimePerMonth
WarnCodeFlextimeCapped = "FLEXTIME_CAPPED"     // FlextimeEnd capped at positive/negative limit
WarnCodeBelowThreshold = "BELOW_THRESHOLD"     // Overtime below threshold, forfeited
WarnCodeNoCarryover    = "NO_CARRYOVER"        // Credit type resets balance to zero
```

### Verification:
- [ ] All types compile without errors: `cd apps/api && go build ./internal/calculation/`
- [ ] Types follow same conventions as existing types in `types.go` (int for minutes, pointers for optional)
- [ ] CreditType uses same pattern as BookingDirection/BreakType (string type with constants)

---

## Phase 2: Implement CalculateMonth Function

**File**: `apps/api/internal/calculation/monthly.go`

### Main function: `CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput`

Algorithm steps:

1. **Initialize output** - Copy PreviousCarryover to FlextimeStart, absence summary fields, init Warnings slice
2. **Aggregate daily values** - Sum all time fields across DailyValues:
   - Sum: GrossTime, NetTime, TargetTime, Overtime, Undertime, BreakTime
   - Count WorkDays: days where `GrossTime > 0 || NetTime > 0`
   - Count DaysWithErrors: days where `HasError == true`
3. **Calculate flextime change** - `FlextimeChange = TotalOvertime - TotalUndertime`
4. **Calculate raw flextime** - `FlextimeRaw = FlextimeStart + FlextimeChange`
5. **Apply credit type rules** - If `EvaluationRules != nil`, call `applyCreditType()`; otherwise default to no evaluation (direct transfer)

### Helper: `applyCreditType(output MonthlyCalcOutput, rules MonthlyEvaluationInput) MonthlyCalcOutput`

Implements the 4 ZMI credit types:

| Credit Type | FlextimeCredited | FlextimeEnd | FlextimeForfeited |
|---|---|---|---|
| NoEvaluation | FlextimeChange | FlextimeRaw | 0 |
| CompleteCarryover | FlextimeChange (capped at MaxFlextimePerMonth) | Start + Credited (capped at positive/negative) | Excess over caps |
| AfterThreshold | FlextimeChange - Threshold (if above threshold) | Start + Credited (capped) | Threshold amount + cap excess |
| NoCarryover | 0 | 0 | FlextimeChange |

Key rules for `AfterThreshold`:
- If `FlextimeChange > threshold`: credit `FlextimeChange - threshold`, forfeit `threshold`
- If `0 < FlextimeChange <= threshold`: credit 0, forfeit `FlextimeChange`, warn BELOW_THRESHOLD
- If `FlextimeChange <= 0` (undertime): still deduct fully (`FlextimeCredited = FlextimeChange`), no forfeit

### Helper: `applyFlextimeCaps(flextime int, capPositive, capNegative *int, existingForfeited int) (int, int)`

- If `capPositive != nil && flextime > *capPositive`: cap at positive limit, add excess to forfeited
- If `capNegative != nil && flextime < -*capNegative`: cap at negative limit (no forfeit on negative)
- Returns (capped value, total forfeited)

### Exported helper: `CalculateAnnualCarryover(currentBalance, annualFloor *int) int`

Year-end carryover with annual floor:
- If `currentBalance == nil`: return 0
- If `annualFloor != nil && balance < -*annualFloor`: return `-*annualFloor`
- Otherwise: return balance

### Verification:
- [ ] Function compiles: `cd apps/api && go build ./internal/calculation/`
- [ ] `CalculateMonth` follows Pattern A (standalone pure function, like `CalculateVacation`)
- [ ] No database or HTTP imports (only `github.com/shopspring/decimal`)
- [ ] All credit type logic matches ZMI Section 12 specification

---

## Phase 3: Add Warning Constants to errors.go

**File**: `apps/api/internal/calculation/errors.go`

Add to the warning constants block:

```go
// Monthly calculation warnings
WarnCodeMonthlyCap     = "MONTHLY_CAP_REACHED"  // FlextimeCredited capped at monthly max
WarnCodeFlextimeCapped = "FLEXTIME_CAPPED"      // FlextimeEnd hit positive/negative cap
WarnCodeBelowThreshold = "BELOW_THRESHOLD"      // Overtime below threshold, forfeited
WarnCodeNoCarryover    = "NO_CARRYOVER"         // Credit type resets to zero
```

### Verification:
- [ ] Constants are accessible from test file using `calculation.WarnCodeMonthlyCap`
- [ ] Naming follows existing pattern (WarnCode prefix, UPPER_SNAKE value)

---

## Phase 4: Write Comprehensive Tests

**File**: `apps/api/internal/calculation/monthly_test.go`

Use `package calculation_test` (external test package) to match existing test patterns (vacation_test.go, calculator_test.go).

### Test helper functions:

```go
func intPtr(i int) *int { return &i }
```

Note: `decimalFromFloat` is already defined in vacation_test.go in the same package, so it can be reused.

### Test cases to implement:

#### Group 1: Daily Value Aggregation

| Test Name | Description |
|---|---|
| `TestCalculateMonth_Aggregation_BasicSums` | Multiple days, verify all sums correct |
| `TestCalculateMonth_Aggregation_EmptyDays` | Zero daily values, all outputs zero |
| `TestCalculateMonth_Aggregation_SingleDay` | Single day input |
| `TestCalculateMonth_WorkDays_OnlyGrossTime` | Day with GrossTime > 0 but NetTime = 0 counts as work |
| `TestCalculateMonth_WorkDays_OnlyNetTime` | Day with NetTime > 0 but GrossTime = 0 counts as work |
| `TestCalculateMonth_WorkDays_ZeroTimeNotCounted` | Day with all zeros not counted |
| `TestCalculateMonth_DaysWithErrors` | Count days with HasError=true |

#### Group 2: CreditType NoEvaluation

| Test Name | Description |
|---|---|
| `TestCalculateMonth_CreditTypeNoEvaluation_Overtime` | Direct transfer of overtime |
| `TestCalculateMonth_CreditTypeNoEvaluation_Undertime` | Direct transfer of undertime (negative change) |
| `TestCalculateMonth_CreditTypeNoEvaluation_Mixed` | Mixed overtime/undertime across days |

#### Group 3: CreditType CompleteCarryover

| Test Name | Description |
|---|---|
| `TestCalculateMonth_CompleteCarryover_NoCaps` | No caps configured, full transfer |
| `TestCalculateMonth_CompleteCarryover_MonthlyCap` | Monthly cap limits FlextimeCredited |
| `TestCalculateMonth_CompleteCarryover_PositiveCap` | Positive balance cap limits FlextimeEnd |
| `TestCalculateMonth_CompleteCarryover_NegativeCap` | Negative balance floor limits FlextimeEnd |
| `TestCalculateMonth_CompleteCarryover_BothCaps` | Both positive and negative caps |
| `TestCalculateMonth_CompleteCarryover_Undertime` | Undertime with caps (negative change) |

#### Group 4: CreditType AfterThreshold

| Test Name | Description |
|---|---|
| `TestCalculateMonth_AfterThreshold_AboveThreshold` | Overtime > threshold, partial credit |
| `TestCalculateMonth_AfterThreshold_AtThreshold` | Overtime == threshold, zero credit, BELOW_THRESHOLD warning |
| `TestCalculateMonth_AfterThreshold_BelowThreshold` | Overtime < threshold, forfeited |
| `TestCalculateMonth_AfterThreshold_Undertime` | Undertime still fully deducted (no threshold applies) |
| `TestCalculateMonth_AfterThreshold_NilThreshold` | Nil threshold defaults to 0 |
| `TestCalculateMonth_AfterThreshold_WithCaps` | Threshold + positive cap combined |

#### Group 5: CreditType NoCarryover

| Test Name | Description |
|---|---|
| `TestCalculateMonth_NoCarryover_Overtime` | All overtime forfeited, end = 0 |
| `TestCalculateMonth_NoCarryover_Undertime` | Undertime also reset (end = 0) |
| `TestCalculateMonth_NoCarryover_WithPreviousBalance` | Previous balance irrelevant |

#### Group 6: Edge Cases

| Test Name | Description |
|---|---|
| `TestCalculateMonth_NilEvaluationRules` | nil rules = no evaluation (direct transfer) |
| `TestCalculateMonth_UnknownCreditType` | Unknown credit type defaults to no evaluation |
| `TestCalculateMonth_ZeroPreviousCarryover` | Start from zero |
| `TestCalculateMonth_NegativePreviousCarryover` | Start from negative |
| `TestCalculateMonth_LargePreviousCarryover` | Large positive carryover with cap |

#### Group 7: Absence Summary

| Test Name | Description |
|---|---|
| `TestCalculateMonth_AbsenceSummary_PassThrough` | Absence values copied to output |
| `TestCalculateMonth_AbsenceSummary_HalfDayVacation` | Decimal vacation value preserved |

#### Group 8: Warnings

| Test Name | Description |
|---|---|
| `TestCalculateMonth_Warnings_MonthlyCap` | MONTHLY_CAP_REACHED warning emitted |
| `TestCalculateMonth_Warnings_FlextimeCapped` | FLEXTIME_CAPPED warning emitted |
| `TestCalculateMonth_Warnings_BelowThreshold` | BELOW_THRESHOLD warning emitted |
| `TestCalculateMonth_Warnings_NoCarryover` | NO_CARRYOVER warning emitted |
| `TestCalculateMonth_Warnings_EmptyByDefault` | No warnings when no caps hit |

#### Group 9: CalculateAnnualCarryover

| Test Name | Description |
|---|---|
| `TestCalculateAnnualCarryover_NilBalance` | Returns 0 |
| `TestCalculateAnnualCarryover_PositiveNoFloor` | Returns balance unchanged |
| `TestCalculateAnnualCarryover_NegativeAboveFloor` | Returns balance (above floor) |
| `TestCalculateAnnualCarryover_NegativeBelowFloor` | Returns -floor |
| `TestCalculateAnnualCarryover_NilFloor` | No floor applied |

#### Group 10: applyFlextimeCaps (tested through CalculateMonth)

| Test Name | Description |
|---|---|
| `TestCalculateMonth_Caps_NoCapsApplied` | Balance within limits |
| `TestCalculateMonth_Caps_PositiveCapExceeded` | Positive cap clips balance |
| `TestCalculateMonth_Caps_NegativeCapExceeded` | Negative cap clips balance |
| `TestCalculateMonth_Caps_BothCapsNil` | No caps, no clipping |

### Test pattern:
- Use table-driven tests with `t.Run()` for related scenarios
- Use `testify/assert` for assertions
- Reference types with `calculation.` prefix (external test package)
- Initialize Warnings slice in assertions to avoid nil vs empty comparison issues

### Verification:
- [ ] `cd apps/api && go test -v -run TestCalculateMonth ./internal/calculation/...` passes
- [ ] `cd apps/api && go test -v -run TestCalculateAnnualCarryover ./internal/calculation/...` passes
- [ ] All test names are descriptive and follow existing naming conventions
- [ ] No flaky tests (pure functions, deterministic)

---

## Phase 5: Final Verification

### Commands:

```bash
# Build check
cd apps/api && go build ./internal/calculation/

# Run all calculation tests
cd apps/api && go test -v -race ./internal/calculation/...

# Run full test suite
make test

# Lint check
make lint
```

### Acceptance Criteria:

- [ ] All 4 ZMI credit types implemented correctly per Section 12 specification
- [ ] Threshold logic: only overtime above threshold credited (AfterThreshold)
- [ ] Monthly cap: limits monthly credit (MaxFlextimePerMonth)
- [ ] Positive/negative caps: limits carryover balance
- [ ] Annual floor: `CalculateAnnualCarryover()` enforces floor on negative balances
- [ ] Forfeited time tracked and reported in `FlextimeForfeited`
- [ ] Warnings generated for: monthly cap hit, flextime capped, below threshold, no carryover
- [ ] WorkDays counts days with `GrossTime > 0 || NetTime > 0`
- [ ] DaysWithErrors counts days with `HasError == true`
- [ ] Absence summary passed through from input to output
- [ ] Pure function: no database, HTTP, or side-effect imports
- [ ] `make test` passes with comprehensive coverage
- [ ] `make lint` passes
- [ ] Edge cases covered: nil configs, zero values, negative amounts, unknown credit types

---

## Implementation Notes

1. **Package pattern**: Follow Pattern A (standalone pure function) matching `CalculateVacation` in `vacation.go`
2. **Test package**: Use `package calculation_test` (external) matching `vacation_test.go` and `calculator_test.go`
3. **Unexported helpers**: `applyCreditType` and `applyFlextimeCaps` are unexported; test them indirectly through `CalculateMonth`
4. **Warning constants**: Add to `errors.go` so they are accessible from the external test package via `calculation.WarnCodeMonthlyCap`
5. **Decimal import**: Only needed for `AbsenceSummaryInput.VacationDays` and `MonthlyCalcOutput.VacationTaken`
6. **No MonthlyValue model dependency**: This ticket creates only the calculation logic; persistence is handled by the service layer (separate ticket)
7. **FlextimeChange calculation**: `TotalOvertime - TotalUndertime` (net monthly delta, can be negative)
8. **capNegative convention**: Stored as positive value in input, applied as negative limit (e.g., capNegative=100 means floor is -100)
