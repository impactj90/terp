---
date: 2026-01-29T12:00:00+01:00
researcher: tolga
git_commit: 9c7aa9ee3150516ac169876f1cd60d1ea50cb782
branch: master
repository: terp
topic: "ZMI-TICKET-006: Day Plan Advanced Rules and Daily Calculation Integration"
tags: [research, codebase, day-plan, daily-calculation, breaks, rounding, tolerance, holiday-credit, no-booking, day-change]
status: complete
last_updated: 2026-01-29
last_updated_by: tolga
---

# Research: ZMI-TICKET-006 Day Plan Advanced Rules

**Date**: 2026-01-29
**Researcher**: tolga
**Git Commit**: 9c7aa9ee3150516ac169876f1cd60d1ea50cb782
**Branch**: master
**Repository**: terp

## Research Question

What is the current implementation status of each requirement in ZMI-TICKET-006 (Day Plan Advanced Rules and Daily Calculation Integration)? Map each business rule from the ticket to existing code and identify what exists, what is partially implemented, and what is missing.

## Summary

The codebase has extensive infrastructure for day plan configuration and daily calculation. Most of the data model, API, and calculation engine modules are implemented. However, several ticket requirements are not fully wired into the daily calculation service — the day plan model fields exist but the `DailyCalcService` does not use them all. The main gaps are:

1. **Target hours resolution order**: `GetEffectiveRegularHours()` exists on the model but is NOT called by the daily calculation service.
2. **No-booking behavior**: The model has the correct ZMI enum values, but the service uses different internal constants and hardcoded defaults instead of reading from the day plan.
3. **Round all bookings**: The `RoundAllBookings` flag exists on the model but is NOT implemented in the calculator — only first come/last go are rounded.
4. **Rounding relative to plan start**: NOT implemented. Depends on system settings (ZMI-TICKET-023).
5. **Vacation deduction from day plan**: Field exists but integration with absence/vacation service needs verification.
6. **Holiday credit config integration**: Partially wired — reads from day plan but falls back to defaults when `DailyCalcConfig` uses hardcoded values.

## Detailed Findings

### 1. Target Hours Resolution Order

**Ticket requirement**: Priority: (1) from employee master if flag set, (2) RegularHours2 on absence day, (3) RegularHours.

**Current implementation**:

The model has the correct resolution logic:

- `apps/api/internal/model/dayplan.go:141-151` — `GetEffectiveRegularHours(isAbsenceDay bool, employeeTargetMinutes *int) int` implements the exact priority chain.
- Fields: `FromEmployeeMaster` (bool), `RegularHours2` (*int), `RegularHours` (int) all exist on `DayPlan` struct.

**Gap**: The daily calculation service does NOT call `GetEffectiveRegularHours()`. Instead, `buildCalcInput()` at `service/daily_calc.go:859` sets `input.DayPlan.RegularHours = dp.RegularHours` directly, bypassing the resolution logic entirely. The calculator then uses this value at `calculation/calculator.go:20`: `result.TargetTime = input.DayPlan.RegularHours`.

**What needs to change**: `buildCalcInput()` needs to:
- Accept employee master data (daily target hours)
- Accept absence day status
- Call `dp.GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes)` instead of `dp.RegularHours`

---

### 2. Holiday Credit

**Ticket requirement**: Use holiday category (1/2/3) to apply day plan credit values. If credit for category is missing, credit 0.

**Current implementation**:

- `model/dayplan.go:156-172` — `GetHolidayCredit(category int) int` returns category-specific credit or 0.
- `service/daily_calc.go:277-328` — `handleHolidayCredit()` calls `GetHolidayCredit()` with the holiday category.
- Falls back to: cat1=target, cat2=target/2, cat3=0 when day plan credit is 0 (lines 308-318).

**Status**: Mostly implemented. The fallback behavior (cat1=target, cat2=target/2) is a pragmatic default but deviates from the ticket which says "if day plan credit for category is missing, credit 0 for that category." The current code uses 0 from `GetHolidayCredit()` but then applies fallback defaults.

**Gap**: The `DailyCalcConfig` at `service/daily_calc.go:135` uses `DefaultDailyCalcConfig()` (hardcoded) instead of reading from the day plan. The comment at line 48 says "these settings should come from DayPlan once NOK-145 adds the fields" — but the fields were added by migration 000030.

---

### 3. Break Types

**Ticket requirement**: Fixed breaks always deducted if work overlaps; variable breaks only when no manual break; minimum breaks after threshold with optional minutes-difference.

**Current implementation**:

- `model/dayplan.go:204-227` — `DayPlanBreak` struct with `BreakType` (fixed/variable/minimum), `MinutesDifference` flag.
- `calculation/breaks.go` — Full implementation:
  - `CalculateBreakDeduction()` dispatches by break type
  - `DeductFixedBreak()` calculates overlap with work periods (always deducted)
  - Variable breaks skipped entirely when manual break exists
  - `CalculateMinimumBreak()` with `MinutesDifference` proportional deduction
- `service/daily_calc.go:907-918` — Converts `DayPlan.Breaks` to `calculation.BreakConfig` with all fields.
- `calculation/calculator.go:72-80` — Calls break deduction in the calculation pipeline.

**Status**: IMPLEMENTED. All three break types with minutes-difference are fully wired.

---

### 4. Vacation Deduction

**Ticket requirement**: Use day plan "vacation deduction" value for vacation balance reduction on absence days.

**Current implementation**:

- `model/dayplan.go:104` — `VacationDeduction decimal.Decimal` field exists (default 1.00).
- `calculation/vacation.go` — `CalculateVacationDeduction()` exists.
- `api/schemas/day-plans.yaml` — `vacation_deduction` field exposed in API.

**Gap**: The daily calculation service does not directly handle vacation balance deduction. Vacation deduction happens through the absence/vacation service, which would need to read the day plan's `VacationDeduction` field. This integration path needs verification.

---

### 5. No-Booking Behavior

**Ticket requirement**: Five behaviors: no evaluation (error), deduct target, vocational school, adopt target, target with order.

**Current implementation**:

The model has the correct ZMI enum values:
- `model/dayplan.go:32-38` — `NoBookingBehavior` with `error`, `deduct_target`, `vocational_school`, `adopt_target`, `target_with_order`.

The service has DIFFERENT internal constants:
- `service/daily_calc.go:37-45` — `NoBookingBehavior` (separate type) with `error`, `credit_target`, `credit_zero`, `skip`, `use_absence`. These do NOT match the ZMI spec.

The service uses hardcoded defaults:
- `service/daily_calc.go:57-62` — `DefaultDailyCalcConfig()` always returns `NoBookingError`.
- `service/daily_calc.go:135` — `config := DefaultDailyCalcConfig()` — never reads from day plan.

**handleNoBookings()** (lines 330-404) handles only the internal constants, NOT the ZMI enum values:
- `NoBookingSkip` → return nil (no daily value)
- `NoBookingCreditTarget` → credit target hours as worked
- `NoBookingCreditZero` → zero net with undertime
- `NoBookingUseAbsence` → TODO placeholder
- `NoBookingError` → mark as error

**Gaps**:
1. Service does not read `empDayPlan.DayPlan.NoBookingBehavior` from the day plan.
2. Service enum values don't match model enum values.
3. Missing ZMI behaviors: `deduct_target` (subtract from balance, no bookings), `vocational_school` (auto-insert absence), `target_with_order` (credit to default order).

---

### 6. Rounding Behavior

**Ticket requirement**: "Round all bookings" applies rounding to every in/out booking; otherwise round only first in and last out. Support add/subtract rounding.

**Current implementation**:

- `model/dayplan.go:94` — `RoundAllBookings bool` field exists.
- `calculation/rounding.go` — All 6 rounding types implemented (none, up, down, nearest, add, subtract).
- `calculation/calculator.go:121-204` — `processBookings()` applies rounding to ALL work bookings categorized as `CategoryWork`, regardless of position.

**Gap**: The `RoundAllBookings` flag is NOT checked. The current implementation rounds ALL work bookings by default (the opposite of the ticket's default). Per the ZMI manual, the default should be to round only the first arrival and last departure, and `RoundAllBookings=true` should enable rounding for all bookings.

The `DayPlanInput` struct in `calculation/types.go` does not include a `RoundAllBookings` field to pass this setting to the calculator.

---

### 7. Tolerance Behavior

**Ticket requirement**: Fixed plans: Come- tolerance only if variable work time enabled. Flextime: Come+ and Go- not used.

**Current implementation**:

- `service/daily_calc.go:844-855` — `buildCalcInput()` correctly applies plan-type rules:
  - **Flextime**: `ComePlus=0`, `GoMinus=0`, `variableWorkTime=false` (line 847-849)
  - **Fixed**: `ComeMinus=0` if `!dp.VariableWorkTime` (line 852-854)
- `calculation/tolerance.go` — `ApplyComeTolerance()` and `ApplyGoTolerance()` functions.

**Status**: IMPLEMENTED correctly per ZMI manual specification.

---

### 8. Evaluation Window Capping

**Ticket requirement**: Time only credited within Kommen von → Gehen bis window, except when tolerance extends it.

**Current implementation**:

- `calculation/capping.go` — `ApplyWindowCapping()` caps times to evaluation window boundaries.
- `calculation/calculator.go:158-196` — `processBookings()` applies window capping to all work bookings:
  - Arrivals capped to `ComeFrom` (with `ComeMinus` tolerance extension if `allowEarlyTolerance`)
  - Departures capped to `GoTo` (with `GoPlus` tolerance extension)
- `allowEarlyTolerance` at line 130: enabled for flextime plans OR when `VariableWorkTime` is set.
- Capping results aggregated into `CappingResult` with source tracking.

**Status**: IMPLEMENTED. Window capping with tolerance-aware boundaries is fully wired.

---

### 9. Core Time

**Ticket requirement**: If core time window is configured, missing coverage triggers core time violation errors.

**Current implementation**:

- `model/dayplan.go:64-65` — `CoreStart`, `CoreEnd` fields on `DayPlan`.
- `calculation/tolerance.go` — `ValidateCoreHours()` checks if first come is before core start and last go is after core end.
- `calculation/calculator.go:60-66` — Calls `ValidateCoreHours()` in the pipeline, appends error codes.
- `calculation/errors.go` — `ErrCodeMissedCoreStart`, `ErrCodeMissedCoreEnd` error codes.

**Status**: IMPLEMENTED.

---

### 10. Day Change Behavior

**Ticket requirement**: Four modes — none, at arrival, at departure, auto-complete (00:00 bookings on next day).

**Current implementation**:

- `model/dayplan.go:42-49` — `DayChangeBehavior` enum with all four values.
- `service/daily_calc.go:225-255` — `loadBookingsForCalculation()` dispatches based on behavior:
  - `DayChangeNone` → single-day bookings only
  - `DayChangeAtArrival` / `DayChangeAtDeparture` → `applyDayChangeBehavior()` (lines 407-442) re-assigns cross-midnight booking pairs
  - `DayChangeAutoComplete` → `applyAutoCompleteDayChange()` (lines 444-505) creates 00:00 go/come bookings
- `pairWorkBookingsAcrossDays()` (lines 557-607) pairs bookings across day boundaries.
- `ensureAutoCompleteBooking()` (lines 507-544) creates bookings with `BookingSourceCorrection` and `autoCompleteNotes`.

**Status**: IMPLEMENTED. All four day change behaviors are handled.

---

### 11. Rounding Relative to Plan Start

**Ticket requirement**: If enabled in system settings, rounding must be relative to planned start time, not absolute clock intervals.

**Current implementation**:

- NOT IMPLEMENTED. The current rounding in `calculation/rounding.go` uses absolute clock-based intervals (e.g., `time % interval`).
- There is no system settings table or service yet.
- Depends on ZMI-TICKET-023 (system settings).

**Gap**: `RoundingConfig` does not include a "relative anchor" field. The rounding functions would need a `PlanStart` parameter to offset the rounding grid.

---

## Implementation Status Matrix

| # | Requirement | Model | API | Calc Engine | Daily Calc Service | Status |
|---|-------------|-------|-----|-------------|-------------------|--------|
| 1 | Target hours resolution | `GetEffectiveRegularHours()` | Fields exposed | Uses `RegularHours` directly | NOT wired | **PARTIAL** |
| 2 | Holiday credit categories | `GetHolidayCredit()` | Fields exposed | N/A (service-level) | Partially wired, fallback differs from spec | **PARTIAL** |
| 3 | Break types (fixed/variable/minimum) | All types modeled | All fields | Fully implemented | Fully wired | **DONE** |
| 4 | Vacation deduction | Field exists | Exposed | `CalculateVacationDeduction()` | Not verified in absence flow | **PARTIAL** |
| 5 | No-booking behaviors | ZMI enum defined | Exposed | N/A (service-level) | Uses different constants, hardcoded defaults | **PARTIAL** |
| 6 | Round all bookings | `RoundAllBookings` field | Exposed | NOT implemented | NOT wired | **NOT DONE** |
| 7 | Tolerance rules | All fields | Exposed | Implemented | Correctly wired with plan-type rules | **DONE** |
| 8 | Evaluation window capping | Time window fields | Exposed | `ApplyWindowCapping()` | Fully wired | **DONE** |
| 9 | Core time validation | `CoreStart/CoreEnd` | Exposed | `ValidateCoreHours()` | Fully wired | **DONE** |
| 10 | Day change behavior | All 4 modes | Exposed | N/A (service-level) | Fully implemented | **DONE** |
| 11 | Rounding relative to plan start | NO field | NO | NOT implemented | NOT wired | **NOT DONE** |

## Code References

### Model Layer
- `apps/api/internal/model/dayplan.go:51-133` — DayPlan struct with all ZMI fields
- `apps/api/internal/model/dayplan.go:141-151` — GetEffectiveRegularHours() target resolution
- `apps/api/internal/model/dayplan.go:156-172` — GetHolidayCredit() category lookup
- `apps/api/internal/model/dayplan.go:174-202` — Shift detection helpers
- `apps/api/internal/model/dayplan.go:204-227` — DayPlanBreak struct
- `apps/api/internal/model/employeedayplan.go:19-32` — EmployeeDayPlan (personal calendar)
- `apps/api/internal/model/employee.go` — Employee with DailyTargetHours field

### Calculation Engine
- `apps/api/internal/calculation/calculator.go:18-119` — Main Calculate() pipeline
- `apps/api/internal/calculation/calculator.go:121-204` — processBookings() with rounding/tolerance/capping
- `apps/api/internal/calculation/breaks.go` — All break type deductions
- `apps/api/internal/calculation/rounding.go` — 6 rounding types
- `apps/api/internal/calculation/tolerance.go` — Come/go tolerance + core hours
- `apps/api/internal/calculation/capping.go` — Window capping + max net time
- `apps/api/internal/calculation/shift.go` — Shift detection logic
- `apps/api/internal/calculation/surcharge.go` — Surcharge/bonus calculation
- `apps/api/internal/calculation/types.go` — DayPlanInput, CalculationResult structs

### Daily Calculation Service
- `apps/api/internal/service/daily_calc.go:131-195` — CalculateDay() main orchestration
- `apps/api/internal/service/daily_calc.go:225-255` — loadBookingsForCalculation() with day change
- `apps/api/internal/service/daily_calc.go:277-328` — handleHolidayCredit()
- `apps/api/internal/service/daily_calc.go:330-405` — handleNoBookings()
- `apps/api/internal/service/daily_calc.go:407-442` — applyDayChangeBehavior()
- `apps/api/internal/service/daily_calc.go:444-505` — applyAutoCompleteDayChange()
- `apps/api/internal/service/daily_calc.go:750-819` — calculateWithBookings()
- `apps/api/internal/service/daily_calc.go:821-943` — buildCalcInput() (wiring)

### Database Schema
- `db/migrations/000015_create_day_plans.up.sql` — Base day plan table
- `db/migrations/000016_create_day_plan_breaks.up.sql` — Break configs
- `db/migrations/000030_add_day_plan_zmi_fields.up.sql` — ZMI fields (holiday credits, no-booking, day change, shift detection)
- `db/migrations/000023_create_employee_day_plans.up.sql` — Personal calendar
- `db/migrations/000041_extend_employee_master_data.up.sql` — Employee target hours

### OpenAPI
- `api/schemas/day-plans.yaml` — Full day plan schema with all ZMI fields
- `api/schemas/employee-day-plans.yaml` — Personal calendar schema
- `api/paths/day-plans.yaml` — 9 day plan endpoints
- `api/paths/employee-day-plans.yaml` — 10 employee day plan endpoints

### Tests
- `apps/api/internal/calculation/calculator_test.go` — 22 calculator tests
- `apps/api/internal/calculation/breaks_test.go` — 11 break deduction tests
- `apps/api/internal/calculation/rounding_test.go` — 16 rounding tests
- `apps/api/internal/calculation/tolerance_test.go` — 10 tolerance tests
- `apps/api/internal/calculation/capping_test.go` — 8 capping tests
- `apps/api/internal/service/daily_calc_test.go` — 21 daily calculation tests
- `apps/api/internal/model/dayplan_test.go` — Model method tests

## Architecture Documentation

### Calculation Pipeline

The daily calculation follows this flow:

```
CalculateDay() [service/daily_calc.go]
  ├─ 1. Check holiday status
  ├─ 2. Get employee day plan (personal calendar lookup)
  ├─ 3. Load bookings (with day change behavior)
  ├─ 4. Branch:
  │     ├─ Off day (no plan) → handleOffDay()
  │     ├─ Holiday (no bookings) → handleHolidayCredit()
  │     ├─ No bookings → handleNoBookings()
  │     └─ Normal → calculateWithBookings()
  │           ├─ Shift detection (if configured)
  │           ├─ buildCalcInput() → CalculationInput
  │           └─ Calculator.Calculate() [calculation/calculator.go]
  │                 ├─ Step 1: processBookings() → tolerance → rounding → capping
  │                 ├─ Step 2: PairBookings()
  │                 ├─ Step 3: FindFirstCome/FindLastGo (from uncapped times)
  │                 ├─ Step 4: ValidateTimeWindows()
  │                 ├─ Step 5: ValidateCoreHours()
  │                 ├─ Step 6: CalculateGrossTime()
  │                 ├─ Step 7: CalculateBreakDeduction()
  │                 ├─ Step 8: CalculateNetTime() + MaxNetTimeCapping
  │                 ├─ Step 9: ValidateMinWorkTime()
  │                 └─ Step 10: CalculateOvertimeUndertime()
  └─ 5. Persist DailyValue (upsert)
```

### Data Flow: Day Plan → Calculator

```
DayPlan (model)                    DayPlanInput (calculation)
  ├─ PlanType               →       PlanType
  ├─ ComeFrom/ComeTo        →       ComeFrom/ComeTo
  ├─ GoFrom/GoTo             →       GoFrom/GoTo
  ├─ CoreStart/CoreEnd       →       CoreStart/CoreEnd
  ├─ RegularHours            →       RegularHours [GAP: should use GetEffectiveRegularHours]
  ├─ Tolerance*              →       ToleranceConfig [with plan-type filtering]
  ├─ Rounding*               →       RoundingConfig [come + go]
  ├─ Breaks[]                →       BreakConfig[]
  ├─ MinWorkTime             →       MinWorkTime
  ├─ MaxNetWorkTime          →       MaxNetWorkTime
  ├─ VariableWorkTime        →       VariableWorkTime
  ├─ RoundAllBookings        ✗       NOT passed to calculator
  ├─ HolidayCreditCat1/2/3   →       Used in handleHolidayCredit() [service-level]
  ├─ NoBookingBehavior        ✗       NOT read from day plan (uses defaults)
  ├─ VacationDeduction        →       Used in vacation service (separate flow)
  ├─ DayChangeBehavior        →       Used in loadBookingsForCalculation() [service-level]
  └─ ShiftDetect*             →       Used in calculateWithBookings() [service-level]
```

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/ZMI-TICKET-006-day-plan-advanced-rules.md` — The ticket under analysis
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` — Comprehensive ZMI manual reference with German originals and derived formulas
- `thoughts/shared/research/2026-01-27-zmi-calculation-implementation-check.md` — Previous calculation implementation verification
- `thoughts/shared/plans/2026-01-24-NOK-145-add-missing-day-plan-zmi-fields.md` — Plan that added ZMI fields to day plan
- `thoughts/shared/research/2026-01-22-NOK-128-create-daily-calculation-service.md` — Daily calculation service initial research
- `thoughts/shared/tickets/ZMI-TICKET-005-time-plan-framework.md` — Time plan framework (dependency)
- `thoughts/shared/tickets/ZMI-TICKET-023-system-settings-options.md` — System settings (dependency for relative rounding)

## Related Research

- `thoughts/shared/research/2026-01-29-ZMI-TICKET-005-time-plan-framework.md` — Time plan framework research
- `thoughts/shared/research/2026-01-29-ZMI-TICKET-004-personnel-master-data.md` — Employee master data research
- `thoughts/shared/research/2026-01-29-ZMI-TICKET-002-holiday-management.md` — Holiday management research

## Open Questions

1. **Vacation deduction integration**: Is the `VacationDeduction` field from the day plan actually used when the absence service deducts vacation balance? Or is it hardcoded to 1.0?

2. **Holiday credit fallback**: The ticket says "if day plan credit for category is missing, credit 0." The current code falls back to target/target÷2/0 for categories 1/2/3. Should the fallback be removed to strictly follow the spec?

3. **No-booking enum alignment**: The service layer uses different constants (`credit_target`, `credit_zero`, `skip`, `use_absence`) than the model (`deduct_target`, `vocational_school`, `adopt_target`, `target_with_order`). Which should be authoritative?

4. **System settings dependency**: Rounding relative to plan start requires a system settings table (ZMI-TICKET-023). Should this be deferred or stubbed?

5. **RegularHours2 + absence detection**: The target hours resolution uses `isAbsenceDay` — how does the daily calc service know if a day is an absence day? Does it need to query the absence day repository?
