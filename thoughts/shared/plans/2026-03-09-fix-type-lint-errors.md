# Implementation Plan: Fix All Type and Lint Errors

**Date**: 2026-03-09
**Branch**: staging
**Baseline**: ~1,260 typecheck errors (89 files), ~53 lint errors (29 files), 1,720 stale build artifact lint errors

---

## Phase 0: Remove Stale Build Artifacts (1,720 lint errors)

**Goal**: Eliminate the 1,720 false-positive lint errors from `apps/web/.next/`.

### Step 0.1: Delete the stale build artifact directory

```bash
rm -rf apps/web/
```

The `apps/web/` directory contains only `.next/` (stale build artifacts) and `.pnpm-store/` from before the monorepo flattening. Neither is source code. The ESLint ignores pattern covers `.next/` but not `apps/web/.next/`.

### Verification

```bash
make lint 2>&1 | tail -5
# Confirm lint error count drops from ~1,773 to ~53
```

**Expected reduction**: 1,720 lint errors eliminated.

---

## Phase 1: Add Vitest Imports to Calculation Test Files (612 typecheck errors)

**Goal**: Fix all TS2304 (`expect` not found) and TS2582 (`describe`/`it` not found) errors in `src/lib/calculation/__tests__/`.

### Step 1.1: Add vitest import to each of the 8 affected test files

Add the following import as the first line of each file (before any existing imports):

```ts
import { describe, it, expect } from "vitest"
```

**Files** (8 total):
1. `src/lib/calculation/__tests__/breaks.test.ts`
2. `src/lib/calculation/__tests__/calculator.test.ts`
3. `src/lib/calculation/__tests__/capping.test.ts`
4. `src/lib/calculation/__tests__/pairing.test.ts`
5. `src/lib/calculation/__tests__/rounding.test.ts`
6. `src/lib/calculation/__tests__/surcharges.test.ts`
7. `src/lib/calculation/__tests__/time.test.ts`
8. `src/lib/calculation/__tests__/tolerance.test.ts`

**Important**: The 2 other test files in this directory (`monthly.test.ts` and `shift-detection.test.ts`) already have this import. Do NOT modify those.

**How to confirm which import to use**: Check if any test uses `vi.fn()` or `vi.mock()`. If so, include `vi` in the import:
```ts
import { describe, it, expect, vi } from "vitest"
```
For the 8 files listed above, search each file for `vi.` usage. If found, include `vi`; otherwise import only `describe, it, expect`.

### Verification

```bash
make typecheck 2>&1 | grep -c "TS2304\|TS2582"
# Should be 0 (was 612)
```

**Expected reduction**: 612 typecheck errors eliminated.

---

## Phase 2: Fix Implicit `any` Parameters in Test Files (68 typecheck errors)

**Goal**: Fix all TS7006 errors by adding type annotations to callback parameters.

### Step 2.1: Add type annotations to callback parameters in calculation test files

In each of the 8 calculation test files from Phase 1, find all `.map()`, `.filter()`, `.find()`, `.forEach()`, `.reduce()`, `.some()`, `.every()`, `.sort()` callback parameters and add explicit types.

**Pattern to search for**:
```
\.(map|filter|find|forEach|reduce|some|every|sort)\(([\w]+)\s*=>
\.(map|filter|find|forEach|reduce|some|every|sort)\(\(([\w]+),?\s*[\w]*\)\s*=>
```

**Common fixes needed**:
- Array of booking results: `(b) => ...` -> `(b: BookingInput) => ...` or `(b: { id: string; ... }) => ...`
- Array of error codes: `(e) => ...` -> `(e: string) => ...`
- Array of pairs: `(p) => ...` -> use the appropriate pair type from `../types`
- Index parameters: `(_, i) => ...` -> `(_: unknown, i: number) => ...`

**Approach**: For each file, read the entire file. Look at the imports already present at the top (types like `BookingInput`, `CalculationInput`, `DayPlanInput`, `ToleranceConfig`, `RoundingConfig`, `BreakConfig` from `../types`). These types indicate what's available. Determine each callback parameter type from context (what array is being mapped, what the elements are).

### Step 2.2: Fix implicit `any` in component files

The remaining TS7006 errors are in component files. Each needs manual review:

1. **`src/components/tariffs/tariff-detail-sheet.tsx`** - Array `.map()` callbacks for `tariff_week_plans`, `tariff_day_plans`, breaks. Type from the tRPC response (infer type from the hook or use inline types).
2. **`src/components/tariffs/tariff-form-sheet.tsx`** - Similar to detail sheet.
3. **`src/components/departments/department-detail-sheet.tsx`** - `children.map()` callbacks.
4. **`src/components/users/user-form-sheet.tsx`** - Callback params.

**For component files**: Use `unknown` or the specific type from the tRPC router output schema. Avoid using `any`.

### Verification

```bash
make typecheck 2>&1 | grep -c "TS7006"
# Should be 0 (was 68)
```

**Expected reduction**: 68 typecheck errors eliminated.

---

## Phase 3: Fix Lint Errors (53 errors)

**Goal**: Eliminate all 53 lint errors in source code.

### Step 3.1: Fix unused variables/imports (29 errors)

For each file, remove or prefix with `_` any unused variables/imports.

**Files and fixes** (search for `@typescript-eslint/no-unused-vars` in lint output):

1. **`src/app/(dashboard)/absence-types/page.tsx`** - Remove unused `AbsenceTypeGroup` import.
2. **`src/app/(dashboard)/orders/page.tsx`** - Remove unused `OrderBooking` import.
3. **`src/components/payroll-exports/payroll-export-preview.tsx`** - Remove unused `PayrollExportLine` import and unused `summary` variable.
4. **`src/lib/calculation/__tests__/breaks.test.ts`** - Remove unused `BookingInput` import (check if Phase 2 still needs it).
5. **`src/lib/calculation/__tests__/calculator.test.ts`** - Remove unused `ToleranceConfig`, `RoundingConfig`, `BreakConfig` imports (check if Phase 2 still needs them).
6. **`src/trpc/routers/bookingTypes.ts`** - Remove unused `VALID_DIRECTIONS`, `VALID_CATEGORIES` constants.
7. **`src/trpc/routers/__tests__/vacation-helpers.test.ts`** - Remove unused `createMockUser` import.
8. **`src/lib/services/daily-calc.ts`** - Remove unused `DayPlanInput`, `isBreakBooking`, `bookingDirection`, `prisma` imports/variables. Verify each one is truly unused before removing.
9. **`src/app/api/cron/calculate-days/__tests__/route.test.ts`** - Multiple unused vars.
10. **All other files** (22 files with 1 error each) - Remove each unused import/variable.

**Approach**: Run `make lint 2>&1 | grep "no-unused-vars"` to get the exact list with line numbers. For each, read the file, confirm the variable is unused, and remove the import or prefix with `_`.

**Critical note**: After Phase 2 adds type annotations, some imports that were flagged as unused may now be used. Run `make lint` fresh after Phase 2 before applying these fixes.

### Step 3.2: Fix `no-explicit-any` errors (12 errors)

1. **`src/lib/services/group-repository.ts`** (6 errors) - The `(delegate as any)` casts. Replace with a proper generic approach or use `(delegate as { findMany: (...args: unknown[]) => Promise<unknown[]> })` or similar typed cast. The 3 group models (`employeeGroup`, `workflowGroup`, `activityGroup`) share the same schema shape, so a union type or generic delegate type works.

2. **`src/app/api/cron/calculate-days/__tests__/route.test.ts`** (5 errors) - Mock function types using `any`. Replace with `unknown` or proper mock types.

3. **`src/lib/services/employment-type-repository.ts`** (1 error) - Single `any` usage; replace with proper type.

### Step 3.3: Fix `consistent-type-imports` errors (10 errors)

1. **`src/app/api/cron/calculate-days/__tests__/route.test.ts`** (5 errors) - Change `import()` type annotations to proper `import type` at the top of the file. Example: `param: import("../route").SomeType` should become a top-level `import type { SomeType } from "../route"`.

2. **`src/trpc/routers/__tests__/vacation-helpers.test.ts`** (3 errors) - Same pattern as above.

3. **`src/app/api/internal/notifications/publish/route.ts`** (1 error) - Change `import { NextRequest }` to `import type { NextRequest }`.

4. **`src/lib/calculation/monthly.ts`** (1 error) - Add `type` keyword to imports only used as types.

### Step 3.4: Fix `prefer-const` error (1 error)

**`src/components/team-overview/team-stats-cards.tsx`** - Change `let absenceCount` to `const absenceCount`.

### Step 3.5: Fix `no-require-imports` error (1 error)

**`src/lib/pubsub/singleton.ts`** - Replace `require()` with dynamic `import()` or static `import`. If the `require()` is used for conditional/lazy loading, use `await import()` instead.

### Verification

```bash
make lint 2>&1 | grep -E "^src/" | wc -l
# Should be 0
```

**Expected reduction**: 53 lint errors eliminated.

---

## Phase 4: Fix snake_case to camelCase Property Access in Components (536 typecheck errors)

This is the largest category. It requires updating component files to:
1. Stop using legacy types from `@/types/legacy-api-types`
2. Use camelCase property names from tRPC/Prisma
3. Flatten `{ path, body }` mutation inputs to flat objects

### Strategy: File-by-file Migration

Process files in order of error count (highest first) to get maximum impact per file. For each file:

1. Read the file fully
2. Identify which legacy type(s) it imports from `@/types/legacy-api-types`
3. Identify which tRPC hook(s) it uses (from `@/hooks`)
4. Read the corresponding tRPC router to understand the output schema shape
5. Replace the legacy type with the inferred tRPC type or an inline interface
6. Replace all snake_case property accesses with camelCase equivalents
7. Flatten any `{ path: { id }, body: { ... } }` mutation calls to `{ id, ... }`

### Step 4.1: Create a snake_case-to-camelCase mapping reference

Build a mapping of the most common property name conversions used across all affected component files. This is the authoritative reference for all subsequent file edits:

```
snake_case              -> camelCase
---                     ---
tenant_id               -> tenantId
is_active               -> isActive
created_at              -> createdAt
updated_at              -> updatedAt
first_name              -> firstName
last_name               -> lastName
personnel_number        -> personnelNumber
employee_id             -> employeeId
department_id           -> departmentId
cost_center_id          -> costCenterId
employment_type_id      -> employmentTypeId
tariff_id               -> tariffId
entry_date              -> entryDate
exit_date               -> exitDate
plan_type               -> planType
come_from               -> comeFrom
come_to                 -> comeTo
go_from                 -> goFrom
go_to                   -> goTo
core_start              -> coreStart
core_end                -> coreEnd
regular_hours           -> regularHours
regular_hours_2         -> regularHours2
from_employee_master    -> fromEmployeeMaster
tolerance_come_plus     -> toleranceComePlus
tolerance_come_minus    -> toleranceComeMinus
tolerance_go_plus       -> toleranceGoPlus
tolerance_go_minus      -> toleranceGoMinus
variable_work_time      -> variableWorkTime
rounding_come_type      -> roundingComeType
rounding_come_interval  -> roundingComeInterval
rounding_go_type        -> roundingGoType
rounding_go_interval    -> roundingGoInterval
round_all_bookings      -> roundAllBookings
min_work_time           -> minWorkTime
max_net_work_time       -> maxNetWorkTime
no_booking_behavior     -> noBookingBehavior
day_change_behavior     -> dayChangeBehavior
vacation_deduction      -> vacationDeduction
rhythm_type             -> rhythmType
rhythm_start_date       -> rhythmStartDate
cycle_days              -> cycleDays
valid_from              -> validFrom
valid_to                -> validTo
week_plan               -> weekPlan
week_plan_id            -> weekPlanId
tariff_week_plans       -> tariffWeekPlans
tariff_day_plans        -> tariffDayPlans
day_plan                -> dayPlan
day_position            -> dayPosition
break_type              -> breakType
after_work_minutes      -> afterWorkMinutes
is_paid                 -> isPaid
start_time              -> startTime
end_time                -> endTime
auto_deduct             -> autoDeduct
minutes_difference      -> minutesDifference
sort_order              -> sortOrder
account_id              -> accountId
time_from               -> timeFrom
time_to                 -> timeTo
calculation_type        -> calculationType
value_minutes           -> valueMinutes
min_work_minutes        -> minWorkMinutes
applies_on_holiday      -> appliesOnHoliday
holiday_credit_cat1     -> holidayCreditCat1
holiday_credit_cat2     -> holidayCreditCat2
holiday_credit_cat3     -> holidayCreditCat3
net_account_id          -> netAccountId
cap_account_id          -> capAccountId
rounding_come_add_value -> roundingComeAddValue
rounding_go_add_value   -> roundingGoAddValue
round_relative_to_plan  -> roundRelativeToPlan
shift_detect_arrive_from -> shiftDetectArriveFrom
shift_detect_arrive_to  -> shiftDetectArriveTo
shift_detect_depart_from -> shiftDetectDepartFrom
shift_detect_depart_to  -> shiftDetectDepartTo
shift_alt_plan_1..6     -> shiftAltPlan1..6
booking_type            -> bookingType
booking_type_id         -> bookingTypeId
absence_type            -> absenceType
absence_type_id         -> absenceTypeId
date_from               -> dateFrom
date_to                 -> dateTo
half_day                -> halfDay
remaining_days          -> remainingDays (note: VacationBalance uses `available`)
used_days               -> usedDays (note: VacationBalance uses `taken`)
planned_days            -> plannedDays (note: may not exist in tRPC output)
base_entitlement        -> entitlement
additional_entitlement  -> (removed - not in tRPC schema)
account_code            -> accountCode
account_name            -> accountName
payroll_code            -> payrollCode
weekly_hours            -> weeklyHours
default_weekly_hours    -> weeklyHoursDefault
holiday_category        -> holidayCategory
parent_id               -> parentId
```

### Step 4.2: Fix the top-14 component files by error count

Process these files one at a time. For each file:

**Sub-step A**: Remove the `import type { components } from '@/types/legacy-api-types'` line and the `type Foo = components['schemas']['Foo']` alias.

**Sub-step B**: Replace the type with the tRPC-inferred type. Use this pattern to get the type from the hook:
```ts
// Option 1: Infer from tRPC router output
type DayPlan = ReturnType<typeof useDayPlan>['data']

// Option 2: Use NonNullable wrapper
type DayPlan = NonNullable<ReturnType<typeof useDayPlan>['data']>
```
Or, if the type is only used for the `onEdit`/`onDelete` callback props, use the Prisma model or an inline subset type.

**Sub-step C**: Find-and-replace all snake_case property accesses with camelCase using the mapping from Step 4.1.

**Sub-step D**: Flatten any `{ path: { id }, body: { ... } }` mutation calls to `{ id, ... }`.

**Files in priority order** (with error count and key patterns):

1. **`src/components/day-plans/day-plan-detail-sheet.tsx`** (76 errors)
   - Uses: `DayPlan` from legacy types
   - Hook: `useDayPlan` from `@/hooks`
   - Snake_case accesses: `is_active`, `plan_type`, `come_from`, `come_to`, `go_from`, `go_to`, `core_start`, `core_end`, `regular_hours`, `regular_hours_2`, `from_employee_master`, `tolerance_come_plus/minus`, `tolerance_go_plus/minus`, `variable_work_time`, `rounding_come_type/interval`, `rounding_go_type/interval`, `round_all_bookings`, `min_work_time`, `max_net_work_time`, `no_booking_behavior`, `day_change_behavior`, `vacation_deduction`, etc.
   - Mutation shape: `createBonusMutation.mutateAsync({ path: { id }, body: { account_id, time_from, ... } })` -> `createBonusMutation.mutateAsync({ dayPlanId: dayPlan.id, accountId: ..., timeFrom: ... })`
   - Also fix: `deleteBonusMutation.mutateAsync({ path: { id, bonusId } })` -> `deleteBonusMutation.mutateAsync({ dayPlanId: dayPlan.id, bonusId })`

2. **`src/components/tariffs/tariff-detail-sheet.tsx`** (58 errors)
   - Uses: `Tariff`, `TariffBreak` from legacy types
   - Hook: `useTariff` from `@/hooks`
   - Snake_case accesses: `is_active`, `rhythm_type`, `week_plan`, `tariff_week_plans`, `tariff_day_plans`, `day_position`, `day_plan`, `rhythm_start_date`, `valid_from`, `valid_to`, `cycle_days`, etc.
   - Mutation: `createBreakMutation.mutateAsync({ path: { id }, body: { break_type, ... } })` -> `createBreakMutation.mutateAsync({ tariffId: tariff.id, breakType: ..., ... })`
   - Also has implicit `any` in `.map()` callbacks for `tariff_week_plans`, `tariff_day_plans`, breaks

3. **`src/components/day-plans/day-plan-form-sheet.tsx`** (33 errors)
   - Uses: `DayPlan` from legacy types
   - Mutation inputs use `path`/`body` pattern
   - Form state uses camelCase already (good), but mutation call wraps in `path`/`body`

4. **`src/components/tariffs/tariff-form-sheet.tsx`** (32 errors)
   - Similar to tariff-detail-sheet
   - Has `overwrite_tariff_source` -> `overwriteTariffSource` mutation input fix

5. **`src/components/employees/employee-detail-sheet.tsx`** (28 errors)
   - Uses: `Employee` from legacy types
   - Snake_case: `first_name`, `last_name`, `is_active`, `exit_date`, `personnel_number`, `email`, `phone`, `entry_date`, `department_id`, etc.

6. **`src/components/payroll-exports/payroll-export-preview.tsx`** (24 errors)
   - Various snake_case accesses
   - Has `unknown` type issue (TS18046)
   - Also has lint errors (unused vars)

7. **`src/components/shift-planning/shift-planning-board.tsx`** (13 errors)
   - Type casts tRPC data to legacy types
   - Snake_case accesses

8. **`src/components/export-interfaces/export-interface-detail-sheet.tsx`** (11 errors)
   - `account_code`, `account_name`, `payroll_code` -> nested relation access

9. **`src/components/vacation-config/employee-exceptions-tab.tsx`** (10+ errors)
   - Uses `EmployeeCappingException` from legacy types
   - Mutation `path`/`body` patterns

10. **`src/components/vacation-config/special-calculations-tab.tsx`** - Similar to above
11. **`src/components/vacation-config/capping-rules-tab.tsx`** - Similar
12. **`src/components/vacation-config/capping-rule-groups-tab.tsx`** - Similar
13. **`src/components/vacation-config/calculation-groups-tab.tsx`** - Similar
14. **`src/components/week-plans/week-plan-form-sheet.tsx`** - `path`/`body` pattern

### Step 4.3: Fix remaining component files with snake_case errors

After the top 14 files, process the remaining ~19 component files with typecheck errors. These files generally have fewer errors each (1-10 per file).

**Approach**: For each file:
1. Read the file
2. Search for `snake_case` property accesses (pattern: `\.\w+_\w+`)
3. Replace with camelCase equivalents using the mapping
4. Remove legacy type imports and aliases
5. Flatten any `path`/`body` mutation calls

**Remaining files** (estimated, confirm with `make typecheck` after Step 4.2):
- `src/components/employees/employee-form-sheet.tsx`
- `src/components/employee-messages/send-confirmation-dialog.tsx`
- `src/components/employee-messages/message-compose-sheet.tsx`
- `src/components/employee-messages/message-detail-sheet.tsx`
- `src/components/teams/team-detail-sheet.tsx`
- `src/components/teams/team-form-sheet.tsx`
- `src/components/teams/member-management-sheet.tsx`
- `src/components/departments/department-detail-sheet.tsx`
- `src/components/departments/department-form-sheet.tsx`
- `src/components/holidays/holiday-form-sheet.tsx`
- `src/components/employment-types/employment-type-form-sheet.tsx`
- `src/components/macros/macro-form-sheet.tsx`
- `src/components/macros/macro-assignment-form-dialog.tsx`
- `src/components/macros/macro-assignment-list.tsx`
- `src/components/calculation-rules/calculation-rule-form-sheet.tsx`
- `src/components/access-control/zones-tab.tsx`
- `src/components/booking-type-groups/booking-type-group-form-sheet.tsx`
- `src/components/terminal-bookings/bookings-tab.tsx`
- `src/components/terminal-bookings/import-batches-tab.tsx`
- `src/components/absences/absence-request-form.tsx`
- `src/components/absences/absence-edit-form-sheet.tsx`
- `src/components/absences/absence-cancel-dialog.tsx`
- `src/components/employees/tariff-assignments/tariff-assignment-form-sheet.tsx`
- `src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx`
- `src/components/profile/personal-info-card.tsx`
- `src/components/profile/contact-form-dialog.tsx`
- `src/components/profile/emergency-contacts-card.tsx`
- `src/components/accounts/account-form-sheet.tsx`
- `src/components/account-groups/account-group-form-sheet.tsx`
- `src/components/cost-centers/cost-center-form-sheet.tsx`
- `src/components/locations/location-form-sheet.tsx`
- `src/components/contact-types/contact-type-form-sheet.tsx`
- `src/components/contact-types/contact-kind-form-sheet.tsx`
- `src/components/orders/order-booking-form-sheet.tsx`
- `src/components/booking-types/booking-type-form-sheet.tsx`
- `src/components/export-interfaces/export-interface-form-sheet.tsx`
- `src/components/export-interfaces/account-mapping-dialog.tsx`
- `src/components/shift-planning/shift-form-sheet.tsx`
- `src/components/shift-planning/shift-assignment-form-dialog.tsx`
- `src/components/vacation-balances/vacation-balance-form-sheet.tsx`
- `src/components/employment-types/employment-type-form-sheet.tsx`

### Step 4.4: Fix vacation balance components (special case)

The vacation balance components use `remaining_days`, `used_days`, `planned_days` which do NOT directly map to tRPC output fields. The tRPC `vacationBalanceOutputSchema` uses:
- `available` (not `remaining_days`)
- `taken` (not `used_days`)
- No `planned_days` field exists in the tRPC output

**Files**:
- `src/components/vacation-balances/vacation-balance-detail-sheet.tsx`
- `src/components/vacation-balances/vacation-balance-data-table.tsx`
- `src/components/vacation/balance-breakdown.tsx`
- `src/components/dashboard/vacation-balance-card.tsx`

**Fix**: Replace property accesses:
- `remaining_days` -> `available`
- `used_days` -> `taken`
- `planned_days` -> Determine if this can be computed from existing fields or if it needs to be added to the output schema. If it represents absences in "planned" status, it may need a new field added to the output schema. If not critical, set to `0` with a TODO comment.

### Step 4.5: Fix legacy type cast failures (TS2352, 21 errors)

In files that cast tRPC responses `as LegacyType[]`, remove the cast entirely since the data is now properly typed by the tRPC hook.

**Pattern**:
```ts
// Before:
const items = data?.data as LegacyType[]
// After:
const items = data?.items ?? []  // or data?.data ?? [] depending on wrapper shape
```

### Step 4.6: Fix type assignment failures (TS2345, 39 errors)

Components passing tRPC response objects to functions/components expecting legacy types. Fix by updating the receiving function/component to accept the camelCase type.

**Common pattern**: `onEdit(employee)` where `onEdit` expects `Employee` (legacy snake_case type). Fix by updating the prop type to match what the tRPC hook returns.

### Verification

```bash
make typecheck 2>&1 | grep -cE "TS2551|TS2353|TS2352|TS2345|TS2339|TS2561|TS2322|TS2741|TS2740|TS2739"
# Should be 0
```

**Expected reduction**: ~536 typecheck errors eliminated.

---

## Phase 5: Fix Object Possibly Undefined in Tests (21 typecheck errors)

**Goal**: Fix TS2532 errors in `src/trpc/routers/__tests__/` test files.

### Step 5.1: Add non-null assertions or optional chaining to test assertions

**Files** (5):
1. `src/trpc/routers/__tests__/accessProfiles-router.test.ts`
2. `src/trpc/routers/__tests__/accessZones-router.test.ts`
3. `src/trpc/routers/__tests__/evaluations-router.test.ts`
4. `src/trpc/routers/__tests__/payrollExports-router.test.ts`
5. `src/trpc/routers/__tests__/tripRecords-router.test.ts`

**Pattern**: Test assertions access array elements without null-checking:
```ts
// Before:
expect(result.items[0].name).toBe("foo")
// After (use non-null assertion in tests, it's acceptable):
expect(result.items[0]!.name).toBe("foo")
```

**Approach**: For each file, search for `\[\d+\]\.` patterns where the array access could be undefined. Add `!` after the bracket access.

### Verification

```bash
make typecheck 2>&1 | grep -c "TS2532"
# Should be 0 (was 21)
```

**Expected reduction**: 21 typecheck errors eliminated.

---

## Phase 6: Fix Remaining Miscellaneous Type Errors (~23 errors)

### Step 6.1: Fix TS2339 - Property does not exist (26 errors)

Individual fixes grouped by sub-pattern:

1. **`children` on Department** (5 errors, `department-detail-sheet.tsx`): The tRPC departments router does not include `children` in its output. Either:
   - Add `children` relation to the departments router output schema, OR
   - Remove the children display from the component and add a separate query for child departments

2. **`data` wrapper missing** (4 errors): Components expect `response.data` but tRPC returns `{ items, total }` or bare array. Fix by updating data access:
   ```ts
   // Before:
   const items = data?.data ?? []
   // After:
   const items = data?.items ?? []
   ```

3. **`description` on EmploymentType** (2 errors): Check if `description` exists in Prisma schema. If not, remove the display from the component.

4. **`default_weekly_hours` on EmploymentType** (2 errors): Should be `weeklyHoursDefault` or whatever the Prisma field name is. Check the employment types router output schema.

5. **`category` on Holiday** (2 errors): Should be `holidayCategory`. Check the holidays router output schema.

6. **`apiUrl` on clientEnv** (1 error, `src/lib/api/client.ts`): This field was removed from config. The entire legacy API client file may be dead code. If so, delete it. If still referenced, update to use the tRPC client instead.

7. **`department` on employee** (1 error): Check if the employee router includes the `department` relation. If not, either add it to the include or use a separate query.

8. **`account_code`, `account_name`, `payroll_code`** (3 errors, `export-interface-detail-sheet.tsx`): These are nested relation field accesses. Check the export interfaces router for the correct shape and use the camelCase names.

### Step 6.2: Fix TS2769 - No overload matches (5 errors)

Mostly in employee-messages components. Read each file, identify the function call with wrong argument types, and fix to match the expected signature.

### Step 6.3: Fix TS2322/TS2741/TS2740/TS2739 - Type assignment failures (10 errors)

These are camelCase arrays assigned to snake_case typed variables. Fix by removing the legacy type annotation or using the correct camelCase type.

### Step 6.4: Fix TS18046 - Unknown type access (1 error)

In `payroll-export-preview.tsx`. Add a type guard or assertion to narrow the `unknown` type before accessing its properties.

### Verification

```bash
make typecheck 2>&1 | tail -3
# Should show 0 errors
```

**Expected reduction**: ~23 typecheck errors eliminated.

---

## Phase 7: Final Cleanup and Verification

### Step 7.1: Remove dead legacy API client (if applicable)

If `src/lib/api/client.ts` is no longer imported anywhere after Phase 6, delete it.

```bash
# Check if anything imports from this file
grep -r "from.*@/lib/api/client" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

### Step 7.2: Audit remaining legacy type imports

After all fixes, check how many files still import from `@/types/legacy-api-types`:

```bash
grep -r "from.*@/types/legacy-api-types" src/ --include="*.ts" --include="*.tsx" | wc -l
```

Files that still use legacy types but have no typecheck errors may be data tables, badges, or display-only components where the snake_case types happen to match what they display. These are lower priority but should eventually be migrated.

### Step 7.3: Run full verification suite

```bash
make typecheck  # Should be 0 errors
make lint       # Should be 0 errors (in src/)
make test       # Should pass (verify no regressions from property name changes)
```

### Step 7.4: Commit strategy

Create one commit per phase:
1. `fix: remove stale build artifacts (apps/web/)`
2. `fix: add vitest imports to calculation test files`
3. `fix: add type annotations to implicit any parameters`
4. `fix: resolve lint errors (unused vars, any types, type imports)`
5. `fix: migrate components from snake_case to camelCase properties` (this is the big one, can be split into multiple commits if needed)
6. `fix: add null checks to test assertions`
7. `fix: resolve remaining miscellaneous type errors`

---

## Summary

| Phase | Target | Errors Fixed | Cumulative |
|-------|--------|-------------|------------|
| 0 | Stale build artifacts | 1,720 lint | 1,720 |
| 1 | Vitest imports | 612 type | 2,332 |
| 2 | Implicit any | 68 type | 2,400 |
| 3 | Lint errors | 53 lint | 2,453 |
| 4 | snake_case -> camelCase | ~536 type | 2,989 |
| 5 | Possibly undefined | 21 type | 3,010 |
| 6 | Miscellaneous | ~23 type | 3,033 |
| **Total** | | **~3,033** | **0 remaining** |

## Key Risks and Mitigations

1. **Risk**: Changing property names in components may break runtime behavior if the tRPC hook actually returns different field names than expected.
   **Mitigation**: For each component, verify the actual tRPC router output schema before making changes. The router file is the source of truth.

2. **Risk**: Some legacy type imports may be used in non-error contexts (e.g., display components, utility functions) and removing them could cause new errors.
   **Mitigation**: Only remove legacy type imports when replacing them with proper tRPC-inferred types. Run typecheck after each file change.

3. **Risk**: The `planned_days` field on vacation balances does not exist in the tRPC output schema. Components displaying this data will need a strategy.
   **Mitigation**: Check if `planned_days` can be computed from existing data, added to the output schema, or removed from the UI.

4. **Risk**: Mutation input shapes may differ between what the component sends and what the tRPC router expects beyond just `path`/`body` flattening.
   **Mitigation**: Always read the router's input schema (the `z.object()` definition) to confirm exact field names and types before modifying mutation calls.
