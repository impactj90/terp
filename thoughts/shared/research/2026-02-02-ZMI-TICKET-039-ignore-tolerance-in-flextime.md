# Research: ZMI-TICKET-039 - Ignore Tolerance/Variable Work Time in Flextime Plans

**Date**: 2026-02-02
**Ticket**: ZMI-TICKET-039
**Status**: Research complete
**Dependencies**: ZMI-TICKET-005 (time plan framework), ZMI-TICKET-006 (day plan advanced rules)

---

## 1. Research Question

Where and how are the tolerance fields (`ToleranceComePlus`, `ToleranceGoMinus`) and `VariableWorkTime` handled when the day plan has `plan_type = flextime`? What code currently exists, what validation is present, and what gaps remain?

---

## 2. Reference Manual Specification

### Section 6.2 - Gleitzeit Tolerance Limitation

From `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md` (lines 472-490):

> "Hinweis: Die Felder Toleranz Kommen +, Toleranz Gehen - und variable Arbeitszeit haben beim Gleitzeitplan keine Bedeutung."
>
> "Note: The fields 'Toleranz Kommen +', 'Toleranz Gehen -', and 'variable Arbeitszeit' have no meaning for flextime plans."

The reference manual provides this field usage table:

| Field                | Festarbeitszeit (Fixed)       | Gleitzeit (Flextime) |
| -------------------- | ----------------------------- | -------------------- |
| Toleranz Kommen -    | Yes (if variable Arbeitszeit) | Yes                  |
| Toleranz Kommen +    | Yes                           | **No**               |
| Toleranz Gehen -     | Yes                           | **No**               |
| Toleranz Gehen +     | Yes                           | Yes                  |
| variable Arbeitszeit | Enables Toleranz Kommen -     | **No**               |

### Section 6.3 - Fixed Time Tolerance Rules

From the same reference (line 552):

> "Die Toleranz Kommen (-) wird nur dann berucksichtigt, wenn der Haken variable Arbeitszeit gesetzt wurde."
>
> "The 'Toleranz Kommen (-)' is only considered when the checkbox 'variable Arbeitszeit' is set."

---

## 3. Codebase Analysis

### 3.1 Day Plan Model Definition

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

The `DayPlan` struct contains these relevant fields:

```go
type DayPlan struct {
    // ...
    PlanType           PlanType `json:"plan_type" gorm:"type:varchar(20);not null;default:'fixed'"`
    ToleranceComePlus  int      `json:"tolerance_come_plus" gorm:"default:0"`
    ToleranceComeMinus int      `json:"tolerance_come_minus" gorm:"default:0"`
    ToleranceGoPlus    int      `json:"tolerance_go_plus" gorm:"default:0"`
    ToleranceGoMinus   int      `json:"tolerance_go_minus" gorm:"default:0"`
    VariableWorkTime   bool     `json:"variable_work_time" gorm:"default:false"`
    // ...
}
```

Plan type constants:

```go
const (
    PlanTypeFixed    PlanType = "fixed"
    PlanTypeFlextime PlanType = "flextime"
)
```

All tolerance fields are plain `int` (not pointers), defaulting to 0. `VariableWorkTime` is a plain `bool`, defaulting to false.

### 3.2 Calculation Engine - Tolerance Application

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/tolerance.go`

The tolerance module provides two functions:

```go
func ApplyComeTolerance(comeTime int, config ToleranceConfig, comeFrom *int) int
func ApplyGoTolerance(goTime int, config ToleranceConfig, goTo *int) int
```

`ApplyComeTolerance` logic:
- If `config.ComePlus > 0` and `comeFrom != nil`: if arrival is late but within tolerance, snap to `comeFrom` value.
- If `config.ComeMinus > 0` and `comeFrom != nil`: if arrival is early but within tolerance, snap to `comeFrom` value.

`ApplyGoTolerance` logic:
- If `config.GoMinus > 0` and `goTo != nil`: if departure is early but within tolerance, snap to `goTo` value.
- If `config.GoPlus > 0` and `goTo != nil`: if departure is late but within tolerance, snap to `goTo` value.

The tolerance module itself has no awareness of plan type. It operates purely on the `ToleranceConfig` values it receives.

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/types.go`

```go
type ToleranceConfig struct {
    ComePlus  int // Grace for late arrival
    ComeMinus int // Grace for early arrival
    GoPlus    int // Grace for late departure
    GoMinus   int // Grace for early departure
}
```

The `DayPlanInput` struct carries tolerance and plan type:

```go
type DayPlanInput struct {
    PlanType            model.PlanType
    // ...
    VariableWorkTime    bool
    Tolerance           ToleranceConfig
    // ...
}
```

### 3.3 Calculation Engine - Capping / Evaluation Window

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/capping.go`

The `ApplyEvaluationWindowCapping` function uses `VariableWorkTime` and `PlanType` for determining whether to cap early arrivals:

```go
func ApplyEvaluationWindowCapping(comeTime, goTime int, dayPlan DayPlanInput) CappingResult {
    // ...
    allowEarly := dayPlan.VariableWorkTime || dayPlan.PlanType == model.PlanTypeFlextime
    // ...
    if !allowEarly && dayPlan.ComeFrom != nil && comeTime < *dayPlan.ComeFrom {
        result.ComeTime = *dayPlan.ComeFrom
        // ...
    }
}
```

This means: for flextime plans, early arrivals (before ComeFrom) are always allowed regardless of `VariableWorkTime`. For fixed plans, early arrivals are only allowed if `VariableWorkTime` is true.

### 3.4 Daily Calculation Service - buildCalcInput (THE KEY INTEGRATION POINT)

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (lines 1023-1044)

This is where the day plan model values are converted to the calculation engine's `ToleranceConfig`. **The flextime override logic already exists here:**

```go
tolerance := calculation.ToleranceConfig{
    ComePlus:  dp.ToleranceComePlus,
    ComeMinus: dp.ToleranceComeMinus,
    GoPlus:    dp.ToleranceGoPlus,
    GoMinus:   dp.ToleranceGoMinus,
}
variableWorkTime := dp.VariableWorkTime

switch dp.PlanType {
case model.PlanTypeFlextime:
    // ZMI: flextime ignores Come+ and Go-; variable work time not applicable
    tolerance.ComePlus = 0
    tolerance.GoMinus = 0
    variableWorkTime = false
case model.PlanTypeFixed:
    // ZMI: Come- only applies to fixed plans if variable work time is enabled
    if !dp.VariableWorkTime {
        tolerance.ComeMinus = 0
    }
}
```

This code:
1. Reads the raw tolerance values from the database model.
2. For flextime plans: zeroes out `ComePlus` and `GoMinus`, and forces `variableWorkTime = false`.
3. For fixed plans: zeroes out `ComeMinus` if `VariableWorkTime` is not set.
4. Passes the adjusted values into the `DayPlanInput` used by the calculator.

### 3.5 Calculator Pipeline

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/calculator.go`

The `Calculate` method calls `processBookings`, which applies tolerance and capping in this order:

1. Pair bookings (come/go pairs)
2. Apply rounding to come/go times
3. Apply tolerance to come/go times
4. Apply evaluation window capping

The capping function (section 3.3) independently checks `VariableWorkTime` and `PlanType` for early arrival handling.

### 3.6 Day Plan Service - Validation

**File**: `/home/tolga/projects/terp/apps/api/internal/service/dayplan.go`

The `Create` and `Update` methods validate day plan inputs. Existing validations include:
- Required fields (code, name, plan_type, regular_hours)
- Code uniqueness
- Valid plan_type enum values
- Time window ordering (come_from < come_to, go_from < go_to, core_start < core_end)
- Break validations

**There is NO existing validation that normalizes or rejects tolerance/VariableWorkTime values based on plan_type.** The service stores whatever values the client sends, and the correction happens at calculation time in `buildCalcInput`.

The `CreateDayPlanInput` and `UpdateDayPlanInput` structs in the service include:

```go
type CreateDayPlanInput struct {
    // ...
    ToleranceComePlus  int
    ToleranceComeMinus int
    ToleranceGoPlus    int
    ToleranceGoMinus   int
    VariableWorkTime   bool
    // ...
}
```

### 3.7 Day Plan Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/dayplan.go`

The handler maps API request fields directly to service input:

```go
input := service.CreateDayPlanInput{
    // ...
    ToleranceComePlus:  int(req.ToleranceComePlus),
    ToleranceComeMinus: int(req.ToleranceComeMinus),
    ToleranceGoPlus:    int(req.ToleranceGoPlus),
    ToleranceGoMinus:   int(req.ToleranceGoMinus),
    // ...
}
```

No plan-type-aware filtering happens at the handler level.

### 3.8 OpenAPI Schema

**File**: `/home/tolga/projects/terp/api/schemas/day-plans.yaml`

The schema defines `tolerance_come_plus`, `tolerance_come_minus`, `tolerance_go_plus`, `tolerance_go_minus` (all `type: integer`) and `variable_work_time` (`type: boolean`) on `CreateDayPlanRequest`, `UpdateDayPlanRequest`, and the `DayPlan` response object.

The `variable_work_time` field description reads:
```yaml
variable_work_time:
  type: boolean
  description: Enable tolerance_come_minus for fixed working time plans
```

No description mentions that these fields are ignored for flextime plans. The fields are accepted for any plan_type.

### 3.9 Database Migration

The tolerance fields are created in the day_plans migration as integer columns with default 0, and `variable_work_time` as boolean with default false. No CHECK constraints enforce plan_type-dependent rules.

---

## 4. Existing Tests

### 4.1 Tolerance Unit Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/tolerance_test.go`

Tests cover:
- `TestApplyComeTolerance_WithinComePlus` - late arrival within tolerance snaps to comeFrom
- `TestApplyComeTolerance_ExceedsComePlus` - late arrival beyond tolerance stays original
- `TestApplyComeTolerance_WithinComeMinus` - early arrival within tolerance snaps to comeFrom
- `TestApplyComeTolerance_ExceedsComeMinus` - early arrival beyond tolerance stays original
- `TestApplyGoTolerance_WithinGoMinus` - early departure within tolerance snaps to goTo
- `TestApplyGoTolerance_WithinGoPlus` - late departure within tolerance snaps to goTo
- `TestApplyGoTolerance_ExceedsGoPlus` - late departure beyond tolerance stays original

These tests operate at the tolerance function level with raw `ToleranceConfig` values. They do not test plan-type-dependent behavior.

### 4.2 Calculator Integration Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/calculator_test.go`

- `TestCalculator_WithTolerance` - Tests ComePlus and GoMinus tolerance with generic DayPlanInput (no PlanType set, defaults to zero value)
- `TestCalculator_Tolerance_UsesComeFromAndGoTo` - Tests that tolerance uses ComeFrom/GoTo reference points
- `TestCalculator_WindowCappingAdjustsGrossTime` - Tests evaluation window capping

**No tests exist that specifically test flextime plan behavior** where ComePlus/GoMinus are set but should be ignored, or where VariableWorkTime is set but should have no effect.

### 4.3 Capping Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/capping_test.go`

Tests cover:
- `TestApplyEvaluationWindowCapping_FlextimeAllowsEarlyArrivals` - Verifies that flextime plans allow booking before ComeFrom
- `TestApplyEvaluationWindowCapping_VariableWorkTimeAllowsEarlyArrivals` - Verifies that VariableWorkTime=true allows early arrivals in fixed plans
- `TestApplyEvaluationWindowCapping_FixedTimeCapsEarlyArrivals` - Verifies that fixed plans without VariableWorkTime cap early arrivals

These tests confirm the capping behavior is plan-type-aware, but they do not test the tolerance zeroing in `buildCalcInput`.

### 4.4 Day Plan Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/dayplan_test.go`

Tests cover creation, time windows, and validation. No tests verify that flextime plans have tolerance/VariableWorkTime values normalized or rejected.

### 4.5 Day Plan Model Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan_test.go`

Tests cover `GetEffectiveRegularHours`, `GetHolidayCredit`, `HasShiftDetection`, and `GetAlternativePlanIDs`. No tests cover plan-type-dependent behavior of tolerance fields.

---

## 5. Summary of Current State

### What Already Exists

1. **Calculation-time override in `buildCalcInput`** (daily_calc.go lines 1033-1044): The `DailyCalcService` already zeroes out `ComePlus`, `GoMinus`, and `VariableWorkTime` for flextime plans before passing data to the calculator. This means the **calculation engine already correctly ignores these fields for flextime plans**.

2. **Capping awareness**: The `ApplyEvaluationWindowCapping` function independently checks `PlanType == PlanTypeFlextime` to allow early arrivals, which is consistent with the flextime spec.

3. **Fixed plan Come- gating**: For fixed plans, `ComeMinus` is zeroed out unless `VariableWorkTime` is true, matching the ZMI specification.

### What Does Not Exist

1. **Server-side validation/normalization on Create/Update**: The day plan service does not validate or normalize tolerance/VariableWorkTime fields when plan_type is flextime. Non-zero values for `ToleranceComePlus`, `ToleranceGoMinus`, and `VariableWorkTime=true` can be stored in the database for flextime plans.

2. **API documentation**: The OpenAPI schema descriptions do not mention that `tolerance_come_plus`, `tolerance_go_minus`, and `variable_work_time` are ignored for flextime plans.

3. **Dedicated flextime tolerance tests**: No unit or integration tests verify that flextime plans ignore ComePlus, GoMinus, and VariableWorkTime. The existing override code in `buildCalcInput` is untested.

4. **Database-level enforcement**: No CHECK constraints enforce that these fields are 0/false for flextime plans.

---

## 6. File Index

| File | Relevance |
|------|-----------|
| `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` | DayPlan struct with tolerance fields and PlanType |
| `/home/tolga/projects/terp/apps/api/internal/calculation/types.go` | ToleranceConfig and DayPlanInput types |
| `/home/tolga/projects/terp/apps/api/internal/calculation/tolerance.go` | ApplyComeTolerance/ApplyGoTolerance functions |
| `/home/tolga/projects/terp/apps/api/internal/calculation/tolerance_test.go` | Tolerance unit tests |
| `/home/tolga/projects/terp/apps/api/internal/calculation/capping.go` | Evaluation window capping with flextime/VariableWorkTime checks |
| `/home/tolga/projects/terp/apps/api/internal/calculation/capping_test.go` | Capping tests including flextime early arrival |
| `/home/tolga/projects/terp/apps/api/internal/calculation/calculator.go` | Main calculation pipeline |
| `/home/tolga/projects/terp/apps/api/internal/calculation/calculator_test.go` | Calculator integration tests (no flextime-specific tolerance tests) |
| `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` | buildCalcInput with flextime tolerance override (lines 1023-1044) |
| `/home/tolga/projects/terp/apps/api/internal/service/dayplan.go` | Day plan service Create/Update (no plan-type validation for tolerance) |
| `/home/tolga/projects/terp/apps/api/internal/service/dayplan_test.go` | Day plan service tests |
| `/home/tolga/projects/terp/apps/api/internal/handler/dayplan.go` | Day plan HTTP handler |
| `/home/tolga/projects/terp/api/schemas/day-plans.yaml` | OpenAPI schema for day plans |
| `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md` | ZMI reference manual (Sections 6.1, 6.2, 6.3) |
