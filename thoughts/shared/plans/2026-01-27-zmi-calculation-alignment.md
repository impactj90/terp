# ZMI Calculation Alignment Implementation Plan

## Overview

Align daily calculation behavior with the ZMI manual reference by wiring existing day plan fields into the calculation pipeline, correcting tolerance/capping behavior, implementing day change handling, and enforcing reserved day plan codes. The goal is to make the runtime calculations and admin behavior match the manual without introducing new product features beyond what is already modeled in the schema.

## Current State Analysis

Daily calculations run via `DailyCalcService.CalculateDay` and rely on `calculation.Calculator.Calculate` with a `DayPlanInput` derived from `model.DayPlan`. Several ZMI-specific fields exist on the day plan model but are not used in calculations or validation. There is also a fully implemented shift detection calculator that is not wired into the daily calculation path.

### Key Discoveries:
- `MinutesDifference` exists on `DayPlanBreak` but is not mapped into `calculation.BreakConfig` inputs. `apps/api/internal/model/dayplan.go:212`, `apps/api/internal/service/daily_calc.go:411`.
- `VariableWorkTime` exists on `DayPlan`, but is not mapped into calculation inputs. `apps/api/internal/model/dayplan.go:90`, `apps/api/internal/service/daily_calc.go:356`.
- Tolerance normalization uses `ComeTo` and `GoFrom` as expected times, which does not match ZMI’s described use of `Kommen von` and `Gehen bis`. `apps/api/internal/calculation/tolerance.go:3`, `apps/api/internal/calculation/calculator.go:67`.
- Early/late evaluation window capping is tracked but not applied to the calculated time. `apps/api/internal/calculation/capping.go:1`, `apps/api/internal/calculation/calculator.go:101`.
- Shift detection logic exists but is not invoked in the daily calculation flow. `apps/api/internal/calculation/shift.go:1`, `apps/api/internal/service/daily_calc.go:312`.
- Reserved day plan codes U/K/S are not enforced. `apps/api/internal/service/dayplan.go:81`.
- No-booking behavior, holiday credit, and day-change behavior are hard-coded defaults rather than using day plan fields. `apps/api/internal/service/daily_calc.go:54`, `apps/api/internal/model/dayplan.go:98`.

## Desired End State

Daily calculations should follow the ZMI manual reference for tolerance, break deduction (including MinutesDifference), day change handling, holiday crediting, no-booking behavior, and shift detection. Day plan code validation must reject reserved codes. Tests should cover the revised rules and edge cases.

### Key Discoveries:
- ZMI manual defines reserved codes U/K/S for absence days and prohibits them for day plan IDs. `thoughts/shared/reference/zmi-calculation-manual-reference.md:109`.
- ZMI manual states tolerance windows for flextime use `Kommen von` and `Gehen bis`, and tolerance fields `Kommen +`, `Gehen -`, and `Variable Arbeitszeit` are not used for flextime. `thoughts/shared/reference/zmi-calculation-manual-reference.md:453`.
- ZMI manual defines “Minutes Difference” proportional deduction for minimum breaks. `thoughts/shared/reference/zmi-calculation-manual-reference.md:389`.
- ZMI manual defines day change behaviors: none, evaluate at arrival, evaluate at departure, auto-complete at midnight. `thoughts/shared/reference/zmi-calculation-manual-reference.md:871`.

## What We're NOT Doing

- Implementing new UI or API endpoints beyond what is necessary to support existing day plan fields.
- Redesigning booking pairing logic or changing booking categories beyond day change handling.
- Implementing unrelated features such as surcharge calculations or full absence-day workflows outside no-booking behavior.

## Implementation Approach

1. Wire missing day plan fields into calculation inputs and break configs.
2. Adjust tolerance normalization and evaluation window handling to reflect ZMI rules.
3. Implement day change handling by pulling adjacent bookings and optionally inserting midnight split bookings for auto-complete.
4. Enforce reserved day plan codes on create/copy.
5. Add comprehensive tests for new behaviors and regressions.

## Phase 1: Day Plan Input Parity

### Overview
Ensure calculation inputs and break configs faithfully represent all ZMI day plan settings required by the manual.

### Changes Required:

#### 1) Extend calculation input types
**File**: `apps/api/internal/calculation/types.go`
**Changes**:
- Add `PlanType` (fixed/flextime) and `VariableWorkTime` to `DayPlanInput`.
- Ensure `BreakConfig` already includes `MinutesDifference` (present).

```go
type DayPlanInput struct {
    // ...
    PlanType         model.PlanType
    VariableWorkTime bool
}
```

#### 2) Map day plan fields into calculation input
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- Populate `PlanType` and `VariableWorkTime` in `buildCalcInput`.
- Map `MinutesDifference` into `calculation.BreakConfig`.

```go
input.DayPlan = calculation.DayPlanInput{
    PlanType:         dp.PlanType,
    VariableWorkTime: dp.VariableWorkTime,
    // ...
}

input.DayPlan.Breaks = append(input.DayPlan.Breaks, calculation.BreakConfig{
    MinutesDifference: b.MinutesDifference,
    // ...
})
```

#### 3) Expose MinutesDifference in break CRUD
**File**: `apps/api/internal/service/dayplan.go`
**Changes**:
- Add `MinutesDifference` to `CreateBreakInput` and `validateBreak`/`AddBreak`/`UpdateBreak`.
- Copy `MinutesDifference` in `DayPlanService.Copy`.

### Success Criteria:

#### Automated Verification:
- [ ] Go tests pass: `make test`
- [ ] Lint passes: `make lint`

#### Manual Verification:
- [ ] Creating/updating a day plan break with MinutesDifference persists the value.
- [ ] Daily calculation input includes VariableWorkTime and MinutesDifference values.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Tolerance, Window Capping, and Rounding Alignment

### Overview
Make tolerance normalization and evaluation window capping match ZMI rules for both fixed and flextime plans.

### Changes Required:

#### 1) Use ZMI expected times for tolerance normalization
**File**: `apps/api/internal/calculation/calculator.go`
**Changes**:
- Use `ComeFrom` as the expected arrival time and `GoTo` as the expected departure time when applying tolerance.
- Fall back to `GoFrom` if `GoTo` is nil (fixed plan case).

```go
expectedCome := dayPlan.ComeFrom
expectedGo := dayPlan.GoTo
if expectedGo == nil {
    expectedGo = dayPlan.GoFrom
}

calculatedTime = ApplyComeTolerance(b.Time, expectedCome, dayPlan.Tolerance)
calculatedTime = ApplyGoTolerance(b.Time, expectedGo, dayPlan.Tolerance)
```

#### 2) Enforce flextime tolerance exclusions
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- When `PlanType == flextime`, zero out `ToleranceComePlus` and `ToleranceGoMinus`, and force `VariableWorkTime = false` per manual.
- When `PlanType == fixed`, honor `ToleranceComeMinus` only if `VariableWorkTime` is true.

#### 3) Apply evaluation window capping to booking times
**File**: `apps/api/internal/calculation/calculator.go`
**Changes**:
- Apply `ApplyWindowCapping` for work bookings before pairing.
- Track capped minutes in `CappingResult` and ensure `CalculatedTimes` reflect capped times.
- Ensure net time reflects capped booking times (not just recorded capping).

```go
adjusted, capped := ApplyWindowCapping(
    calculatedTime,
    dayPlan.ComeFrom,
    dayPlan.GoTo,
    dayPlan.Tolerance.ComeMinus,
    dayPlan.Tolerance.GoPlus,
    b.Direction == DirectionIn,
    dayPlan.VariableWorkTime,
)
```

### Success Criteria:

#### Automated Verification:
- [ ] Go tests pass: `make test`
- [ ] Added unit tests for tolerance normalization and window capping in `apps/api/internal/calculation/calculator_test.go`

#### Manual Verification:
- [ ] Flextime plan ignores Come+ and Go- tolerance settings.
- [ ] Early arrivals before `Kommen von` are capped from gross/net time.

---

## Phase 3: Day Change Behavior

### Overview
Implement ZMI “day change” evaluation rules for cross-midnight bookings.

### Changes Required:

#### 1) Use day plan day-change settings
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- Replace `DailyCalcConfig.DayChangeBehavior` with `model.DayChangeBehavior` from the day plan.
- Remove duplicated enum in `service/daily_calc.go` or map it directly from `model.DayPlan`.

#### 2) Load adjacent bookings for cross-midnight handling
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- Extend `bookingRepository` to support fetching bookings for `date-1`, `date`, and `date+1` when day change behavior is not `none`.
- Build a merged booking list for pairing when behavior is `at_arrival` or `at_departure`.

#### 3) Auto-complete behavior
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- When `DayChangeAutoComplete`, insert synthetic midnight bookings (00:00) to split overnight shifts.
- Persist these bookings with `Source = correction` and a clear `Notes` value (e.g., "Auto-complete day change").
- Ensure inserted bookings use correct BookingType (COME/GO) based on direction.

#### 4) Tests for day change logic
**File**: `apps/api/internal/service/daily_calc_test.go`
**Changes**:
- Add tests for each behavior: none, at_arrival, at_departure, auto_complete.
- Verify synthetic bookings are created and used for calculation in auto-complete.

### Success Criteria:

#### Automated Verification:
- [ ] Go tests pass: `make test`
- [ ] New tests cover each day change behavior.

#### Manual Verification:
- [ ] Overnight shift with auto-complete splits into two days at midnight.
- [ ] At-arrival and at-departure behaviors assign time to correct day.

---

## Phase 4: Shift Detection Integration

### Overview
Wire the existing shift detection logic into the daily calculation flow.

### Changes Required:

#### 1) Implement a DayPlanLoader for shift detection
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- Implement a loader that fetches `ShiftDetectionInput` for day plans, including alternative plan IDs.
- Use it to construct a `ShiftDetector`.

#### 2) Apply shift detection prior to calculation
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**:
- Determine `firstCome` and `lastGo` from bookings, run shift detection, and select the matched day plan.
- If `HasError` from shift detection, add error codes to the daily value.

#### 3) Tests for shift detection wiring
**File**: `apps/api/internal/service/daily_calc_test.go`
**Changes**:
- Add service-level tests verifying that shift detection swaps the day plan when a match is found.

### Success Criteria:

#### Automated Verification:
- [ ] Go tests pass: `make test`
- [ ] New tests validate shift detection integration.

#### Manual Verification:
- [ ] A day plan with shift detection windows switches to the correct alternative plan when bookings match.

---

## Phase 5: Day Plan Code Validation

### Overview
Enforce reserved codes U/K/S to align with ZMI manual.

### Changes Required:

#### 1) Validate reserved codes in create/copy
**File**: `apps/api/internal/service/dayplan.go`
**Changes**:
- Reject codes U/K/S in `Create` and `Copy` (case-insensitive).
- Provide a clear error message.

#### 2) Tests for reserved code validation
**File**: `apps/api/internal/service/dayplan_test.go`
**Changes**:
- Add tests verifying Create and Copy reject reserved codes.

### Success Criteria:

#### Automated Verification:
- [ ] Go tests pass: `make test`
- [ ] New tests cover reserved code enforcement.

#### Manual Verification:
- [ ] Attempting to create/copy a day plan with code "U", "K", or "S" fails.

---

## Testing Strategy

### Unit Tests:
- `apps/api/internal/calculation/calculator_test.go`: tolerance expected times, window capping, variable work time.
- `apps/api/internal/calculation/breaks_test.go`: MinutesDifference proportional deduction.
- `apps/api/internal/service/daily_calc_test.go`: day change behaviors, shift detection integration, no-booking behaviors.

### Integration Tests:
- Recalculate a date range with mixed day plan types and confirm daily values.

### Manual Testing Steps:
1. Create a fixed plan with `Kommen von` and `Gehen von`, set tolerance values, and verify calculated times align with manual examples.
2. Create a flextime plan and confirm `Kommen +` and `Gehen -` tolerances are ignored.
3. Create a minimum break with MinutesDifference enabled and verify partial break deduction.
4. Run an overnight shift with auto-complete day change and confirm split across two days.

## Performance Considerations

- Day change behavior may require fetching adjacent day bookings. Use a single repository method to load all needed bookings to avoid multiple queries.

## Migration Notes

- If a new booking source is needed for auto-complete, add a migration to extend the enum or allow new string values in `bookings.source`.

## References

- ZMI manual reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Daily calculation service: `apps/api/internal/service/daily_calc.go:312`
- Day plan model fields: `apps/api/internal/model/dayplan.go:70`
- Calculation pipeline: `apps/api/internal/calculation/calculator.go:15`
- Break deduction logic: `apps/api/internal/calculation/breaks.go:9`
- Shift detection: `apps/api/internal/calculation/shift.go:1`
