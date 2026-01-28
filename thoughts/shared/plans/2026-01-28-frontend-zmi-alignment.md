# Frontend ZMI Manual Alignment Implementation Plan

## Overview

Align the frontend configuration UI with the ZMI Time calculation manual reference so that the fields, validations, and allowed values match the documented rules for day plans, tolerances, absence codes, and tariff rhythms.

## Current State Analysis

- Day plan form currently shows `go_to` for fixed plans and hides `go_from`, but the manual says fixed plans use only **Kommen von** and **Gehen von**. `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`
- Day plan code validation does not reserve `U/K/S` as required. `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`, `apps/web/src/components/day-plans/copy-day-plan-dialog.tsx`
- Absence type codes are not enforced to start with `U/K/S`. `apps/web/src/components/absence-types/absence-type-form-sheet.tsx`
- Tariff rhythm validation allows empty weekly/rolling/x_days configurations. `apps/web/src/components/tariffs/tariff-form-sheet.tsx`, `apps/web/src/components/tariffs/x-days-rhythm-config.tsx`
- Tolerance fields are shown for all plan types, but the manual says `Toleranz Kommen +`, `Toleranz Gehen -`, and `variable Arbeitszeit` have no meaning for flextime; and `Toleranz Kommen -` only applies for fixed plans when `variable Arbeitszeit` is set. `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`

## Desired End State

- Fixed day plans allow only `come_from` + `go_from`; `come_to` and `go_to` are disabled/cleared and not shown for fixed plans.
- Flextime day plans show `come_from`/`come_to` and `go_from`/`go_to`, plus core time window.
- Day plan codes cannot be `U`, `K`, or `S` (case-insensitive) in create or copy flows.
- Absence type codes must start with `U`, `K`, or `S`.
- Tolerance inputs are shown/usable only when they are meaningful per manual:
  - Flextime: only `Toleranz Kommen -` and `Toleranz Gehen +` are shown/enabled; `Toleranz Kommen +`, `Toleranz Gehen -`, and `variable Arbeitszeit` are hidden/disabled and reset to 0/false on submit.
  - Fixed: all four tolerance fields visible; `Toleranz Kommen -` disabled unless `variable Arbeitszeit` is enabled.
- Rounding validations require interval for up/down/nearest and value for add/subtract (both arrival and departure settings).
- Tariff rhythm validation is strict:
  - Weekly: a week plan must be selected.
  - Rolling weekly: at least one week plan must be selected.
  - X-days: cycle length required and each day position must have a day plan assigned (no nulls; use a “Free Day” plan for off days).
- Day plan detail sheet mirrors fixed vs flextime display for time windows.
- UI messaging reflects these rules in English/German.

### Key Discoveries
- Manual explicitly states fixed plans use only **Kommen von** and **Gehen von** (FAZ). `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Manual reserves `U/K/S` for absence codes and day plan IDs cannot use them. `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Manual notes tolerance fields with no meaning for flextime, and `Toleranz Kommen -` only considered with `variable Arbeitszeit` for fixed plans. `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Manual requires unique day plan per day in week plans (use “free day” plan for off days). `thoughts/shared/reference/zmi-calculation-manual-reference.md`

## What We’re NOT Doing

- Backend calculation changes or API schema updates.
- New data models for breaks/bonuses/surcharges.
- Server-side validation changes (frontend-only alignment).

## Implementation Approach

Update day plan and tariff forms to mirror manual constraints, add explicit frontend validation with clear messages, and adjust copy dialogs and detail views. Ensure translations exist in EN/DE for new validation/help strings. Keep changes localized to existing components and message files.

## Phase 1: Day Plan Form + Detail Alignment

### Overview
Correct fixed/flextime time window fields and tolerance visibility, enforce reserved code rule, and add rounding validation.

### Changes Required

#### 1) Day plan fixed vs flextime time window fields
**File**: `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`
**Changes**:
- Swap fixed-plan end time to `go_from` (show it for fixed; hide `go_to`).
- Clear `come_to`/`go_to` when switching to fixed, and clear `go_from`/`come_to` when switching to flextime as needed.
- Update initial defaults to use `go_from` for fixed plans.

#### 2) Tolerance gating per manual
**File**: `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`
**Changes**:
- For flextime, hide/disable `toleranceComePlus`, `toleranceGoMinus`, and `variableWorkTime`.
- For fixed, show all tolerances but disable `toleranceComeMinus` unless `variableWorkTime` is checked.
- Reset unused tolerance fields to 0 (and variableWorkTime to false) before submit when planType is flextime.

#### 3) Rounding validation
**File**: `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`
**Changes**:
- Validate that interval is provided and > 0 for rounding types `up/down/nearest` (arrival and departure).
- Validate that add/subtract values are provided for `add/subtract`.

#### 4) Day plan code restriction (U/K/S)
**Files**:
- `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`
- `apps/web/src/components/day-plans/copy-day-plan-dialog.tsx`
**Changes**:
- Add validation to prevent code equal to `U`, `K`, or `S` (case-insensitive).
- Add localized error messages.

#### 5) Day plan detail display for fixed plans
**File**: `apps/web/src/components/day-plans/day-plan-detail-sheet.tsx`
**Changes**:
- For fixed plans, display `come_from` and `go_from` only; hide `go_to`.

### Success Criteria

#### Automated Verification:
- [x] Type check passes: `pnpm -C apps/web run typecheck`
- [x] Lint passes: `pnpm -C apps/web run lint`

#### Manual Verification:
- [x] Fixed day plan shows only Arrive From + Leave From; Arrive Until/Leave Until not shown.
- [x] Flextime day plan shows full time windows and core time.
- [x] Day plan code `U`, `K`, or `S` is rejected (create + copy).
- [x] Tolerance fields enable/disable as per manual and reset unused values.
- [x] Rounding types without required interval/value trigger inline error on submit.

**Implementation Note**: After completing this phase and all automated checks pass, pause for manual confirmation before continuing.

---

## Phase 2: Absence + Tariff Validation Alignment

### Overview
Enforce absence code prefixes and strict tariff rhythm requirements per manual.

### Changes Required

#### 1) Absence type code prefix validation
**File**: `apps/web/src/components/absence-types/absence-type-form-sheet.tsx`
**Changes**:
- Validate code starts with `U`, `K`, or `S` (case-insensitive).
- Add localized error messages.

#### 2) Tariff rhythm validation
**File**: `apps/web/src/components/tariffs/tariff-form-sheet.tsx`
**Changes**:
- Weekly rhythm: require `weekPlanId`.
- Rolling weekly: require at least one `weekPlanId`.
- X-days: require `cycleDays > 0` and require a day plan for each day position (no nulls). Use “Free Day” plans for off days.
- Add localized error messages.

#### 3) X-days UI options
**File**: `apps/web/src/components/tariffs/x-days-rhythm-config.tsx`
**Changes**:
- Remove “Off Day (No Plan)” option from selector or keep but block on validation; update help text to instruct using a dedicated off-day plan.

### Success Criteria

#### Automated Verification:
- [x] Type check passes: `pnpm -C apps/web run typecheck`
- [x] Lint passes: `pnpm -C apps/web run lint`

#### Manual Verification:
- [x] Absence type code not starting with U/K/S is rejected.
- [x] Tariff weekly rhythm requires a week plan.
- [x] Tariff rolling weekly requires at least one week plan.
- [x] Tariff x-days requires cycle length and complete day plan assignments (no nulls).

**Implementation Note**: After completing this phase and all automated checks pass, pause for manual confirmation before continuing.

---

## Phase 3: Messages + UX Copy Alignment

### Overview
Add EN/DE messages for new validations and helper text.

### Changes Required

#### 1) Translation strings
**Files**:
- `apps/web/messages/en.json`
- `apps/web/messages/de.json`
**Changes**:
- Add validation messages:
  - Reserved day plan code (`U/K/S`)
  - Absence code prefix requirement
  - Rounding interval/value required
  - Tariff rhythm missing selections
- Add helper text for x-days “use off-day plan instead of empty”.
- Add tolerance helper text for variable work time gating.

### Success Criteria

#### Automated Verification:
- [x] Type check passes: `pnpm -C apps/web run typecheck`
- [x] Lint passes: `pnpm -C apps/web run lint`

#### Manual Verification:
- [x] All new validation errors show localized EN/DE strings.
- [x] Helper text clarifies off-day plan usage for week/x-days.

**Implementation Note**: After completing this phase and all automated checks pass, pause for manual confirmation before continuing.

---

## Testing Strategy

### Unit Tests
- Not adding new unit tests (frontend form validations are inline). Rely on manual verification and existing lint/typecheck.

### Integration Tests
- Not adding new end-to-end tests in this change set.

### Manual Testing Steps
1. Create fixed day plan; confirm `come_from` + `go_from` only.
2. Switch to flextime; confirm full windows and core time display.
3. Try day plan code `U`, `K`, `S` on create + copy; ensure rejected.
4. Validate tolerance fields appear/disable correctly per plan type.
5. Try rounding type without interval/value; confirm blocking validation.
6. Create absence type with code not starting `U/K/S`; ensure rejected.
7. Create tariff with missing required rhythm fields; ensure rejected.
8. Create x-days tariff with missing day plan assignment; ensure rejected.

## Performance Considerations

- No expected performance impact; only client-side validation and UI conditional rendering.

## Migration Notes

- None. Frontend-only validation and presentation changes.

## References

- Manual reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Day plan form: `apps/web/src/components/day-plans/day-plan-form-sheet.tsx`
- Day plan detail: `apps/web/src/components/day-plans/day-plan-detail-sheet.tsx`
- Copy day plan: `apps/web/src/components/day-plans/copy-day-plan-dialog.tsx`
- Absence type form: `apps/web/src/components/absence-types/absence-type-form-sheet.tsx`
- Tariff form: `apps/web/src/components/tariffs/tariff-form-sheet.tsx`
- X-days config: `apps/web/src/components/tariffs/x-days-rhythm-config.tsx`
- Messages: `apps/web/messages/en.json`, `apps/web/messages/de.json`
