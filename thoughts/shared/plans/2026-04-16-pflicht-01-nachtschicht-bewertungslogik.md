# Nachtschicht-Bewertungslogik Implementation Plan

## Overview

Implement correct absence day assignment for night-shift employees by making the absence service consume the existing `dayChangeBehavior` configuration from DayPlans. Currently, `shouldSkipDate()` in `absences-service.ts` ignores `dayChangeBehavior` entirely, causing vacation and sick days to be assigned to the wrong calendar dates for night-shift workers. A new shared pure-function helper `resolveEffectiveWorkDay()` will serve as the single source of truth for both the daily calculation service and the absence service.

## Current State Analysis

**The Bug**: An employee working night shifts (So 22:00 → Mo 06:00) requests vacation Mo–Fr. The system creates AbsenceDay records for So–Do instead of Mo–Fr (for `at_departure` mode) because `shouldSkipDate()` (`absences-service.ts:120-133`) only checks: (1) weekend, (2) no EmployeeDayPlan, (3) off-day. It has zero awareness of `dayChangeBehavior`.

**DailyCalcService handles it correctly**: `loadBookingsForCalculation()` (`daily-calc.ts:484-526`) reads `dayChangeBehavior` and dispatches to `applyDayChangeBehavior()` (`daily-calc.helpers.ts:251-293`), which correctly assigns bookings to the right calendar day.

**Repository gap**: `findEmployeeDayPlans()` (`absences-repository.ts:200-218`) selects only `{ planDate, dayPlanId }` — it doesn't load the DayPlan relation at all, so `dayChangeBehavior`, `comeFrom`, and `goTo` are unavailable.

### Key Discoveries:
- `dayChangeBehavior` has exactly ONE behavioral consumer today: `DailyCalcService` (`daily-calc.ts:496`)
- `applyDayChangeBehavior()` is a pure function with no side effects (`daily-calc.helpers.ts:251-293`)
- Seed data: NS DayPlan has `comeFrom=1320` (22:00), `goTo=360` (06:00), `dayChangeBehavior='at_arrival'` (`seed.sql:2967-2972`)
- Night shift detection: `goTo < comeFrom` (e.g., 360 < 1320 = true)
- `recalculateVacationTaken()` (`absences-service.ts:176-237`) looks up `vacationDeduction` by `absenceDate` — no changes needed if AbsenceDay records are created on the correct effective dates
- Two parallel `vacationTaken` calculations exist: `vacation_balances.taken` (via `recalculateVacationTaken`) and `monthly_values.vacation_taken` (via `monthly-calc.ts:buildAbsenceSummary`). Both depend on which AbsenceDay rows exist.
- `DailyCalcContext` (`daily-calc.context.ts:122-138`) does NOT extend DayPlan range by ±1 (only bookings range is extended). The absence repository must handle its own ±1 extension.
- Client-side preview `calculateWorkingDays()` (`vacation-impact-preview.tsx:35-55`) is already approximate (doesn't check EmployeeDayPlans) — out of scope.

## Desired End State

After implementation:

1. `resolveEffectiveWorkDay()` in `src/lib/services/shift-day-resolver.ts` is the single source of truth for "is this calendar day an effective work day given the `dayChangeBehavior` configuration?"
2. `absences-service.ts:createRange()` consumes this helper to create AbsenceDay records on the correct calendar dates for all four modes
3. All downstream consumers (vacation balance, DATEV export, monthly values, reports) automatically see correct data because AbsenceDay rows land on the right dates
4. `applyDayChangeBehavior()` in `daily-calc.helpers.ts` is lightly refactored to share the night-shift detection heuristic
5. UI shows a non-blocking warning when `auto_complete` is selected for `dayChangeBehavior`
6. Handbook section 6.5 is expanded from an 11-line stub to a comprehensive guide with cross-references from section 7

### Verification:
- `pnpm vitest run src/lib/services/__tests__/shift-day-resolver.test.ts` — all unit tests pass
- `pnpm vitest run src/lib/services/__tests__/daily-calc.helpers.test.ts` — existing + new tests pass
- `pnpm vitest run src/lib/services/__tests__/absences-night-shift.integration.test.ts` — integration tests pass
- `pnpm typecheck` — no new errors
- `pnpm lint` — clean
- Manual: create absence for night-shift employee in UI, verify correct day assignment

## What We're NOT Doing

- **Retroactive migration of existing absence records** — Pro-Di cutover is Oct/Nov 2026 as a fresh start; no legacy data to migrate
- **DailyCalcService core calculation changes** — it already works correctly; only light refactoring
- **New tenant/DayPlan settings** — `dayChangeBehavior` already exists on DayPlan where it belongs
- **Recalc trigger on DayPlan change** — no `triggerRecalc` in `day-plans-service.ts` today; separate ticket if needed
- **Client-side preview enhancement** — `calculateWorkingDays()` is informational; separate follow-up
- **Shift planning UI changes** (except the `auto_complete` warning)
- **Surcharge calculation** (Ticket pflicht-02)

## Implementation Approach

Priority-based evaluation: `resolveEffectiveWorkDay()` checks cross-day night shift conditions in priority order before falling through to the standard check. This avoids nested conditionals and handles mixed rotations naturally. The iteration range in `createRange()` extends by ±1 day to capture arrival/departure day shifts.

**Critical design decision — weekend override for `at_arrival`**: In `at_arrival` mode, a weekend day IS an effective work day if it has a night shift (the employee genuinely starts work that day). In `at_departure` mode and `none`/`auto_complete`, weekends are always skipped. This asymmetry is intentional and matches real-world shift scheduling.

---

## Phase 1: Shared Helper + Unit Tests

### Overview
Create the pure function `resolveEffectiveWorkDay()` with comprehensive unit tests. This is the foundation — all subsequent phases depend on it.

### Changes Required:

#### 1. New file: `src/lib/services/shift-day-resolver.ts`

**File**: `src/lib/services/shift-day-resolver.ts` (new)

```typescript
import {
  DAY_CHANGE_NONE,
  DAY_CHANGE_AT_ARRIVAL,
  DAY_CHANGE_AT_DEPARTURE,
  DAY_CHANGE_AUTO_COMPLETE,
} from "./daily-calc.types"

/**
 * Minimal DayPlan information needed for shift-day resolution.
 * Intentionally decoupled from the full Prisma DayPlan type.
 */
export interface DayPlanInfo {
  dayPlanId: string | null
  dayChangeBehavior: string | null
  comeFrom: number | null
  goTo: number | null
}

export interface EffectiveWorkDayResult {
  /** Should an absence day be booked for this calendar date? */
  isWorkDay: boolean
  /** The calendar date this work day is attributed to (same as input calendarDate when isWorkDay=true) */
  effectiveDate: Date | null
}

/**
 * Detect if a DayPlan represents a night shift (crosses midnight).
 * Heuristic: goTo (departure window end) < comeFrom (arrival window start)
 * e.g. comeFrom=1320 (22:00), goTo=360 (06:00) → 360 < 1320 → night shift
 */
export function isNightShiftDayPlan(dayPlan: {
  comeFrom: number | null
  goTo: number | null
}): boolean {
  if (dayPlan.comeFrom === null || dayPlan.goTo === null) return false
  return dayPlan.goTo < dayPlan.comeFrom
}

function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay()
  return dow === 0 || dow === 6
}

/**
 * Determine if a calendar date is an effective work day for absence purposes,
 * given the dayChangeBehavior configuration on adjacent DayPlans.
 *
 * This is the single source of truth for day attribution in night shift contexts.
 * Both DailyCalcService (booking assignment) and AbsenceService (absence day creation)
 * should agree on which calendar day "owns" a shift.
 *
 * Priority-based evaluation:
 * 1. at_arrival arrival check (weekend override)
 * 2. at_departure departure check
 * 3. at_arrival departure exclusion
 * 4. at_departure arrival exclusion
 * 5. Standard fallback (none / auto_complete)
 *
 * No dayPlanForNextDate parameter: none of the four modes need it.
 * The at_arrival check only looks at the current day's own plan,
 * and the at_departure check only looks at the previous day's plan.
 * If a future mode needs the next day, adding the parameter is a
 * trivial commit — YAGNI until then.
 */
export function resolveEffectiveWorkDay(
  calendarDate: Date,
  dayPlanForDate: DayPlanInfo | null,
  dayPlanForPreviousDate: DayPlanInfo | null,
): EffectiveWorkDayResult {
  const NOT_A_WORK_DAY: EffectiveWorkDayResult = {
    isWorkDay: false,
    effectiveDate: null,
  }
  const IS_WORK_DAY: EffectiveWorkDayResult = {
    isWorkDay: true,
    effectiveDate: calendarDate,
  }

  const isWeekendDay = isWeekend(calendarDate)
  const hasOwnPlan = dayPlanForDate?.dayPlanId != null
  const ownBehavior = dayPlanForDate?.dayChangeBehavior ?? DAY_CHANGE_NONE
  const prevBehavior =
    dayPlanForPreviousDate?.dayChangeBehavior ?? DAY_CHANGE_NONE

  // --- Priority 1: at_arrival — calendarDate IS the arrival day ---
  // The shift starts on calendarDate and ends the next day.
  // Weekend override: arrival on any day is a work day.
  if (
    ownBehavior === DAY_CHANGE_AT_ARRIVAL &&
    hasOwnPlan &&
    isNightShiftDayPlan(dayPlanForDate!)
  ) {
    return IS_WORK_DAY
  }

  // --- Priority 2: at_departure — calendarDate IS the departure day ---
  // The previous day's shift ends on calendarDate.
  // Weekends are NOT overridden in at_departure mode.
  if (
    prevBehavior === DAY_CHANGE_AT_DEPARTURE &&
    dayPlanForPreviousDate?.dayPlanId != null &&
    isNightShiftDayPlan(dayPlanForPreviousDate)
  ) {
    if (isWeekendDay) return NOT_A_WORK_DAY
    return IS_WORK_DAY
  }

  // --- Priority 3: at_arrival exclusion — calendarDate is departure-only ---
  // Previous day's at_arrival night shift ends on calendarDate.
  // CalendarDate is only a work day if it has its own independent (non-night) shift.
  if (
    prevBehavior === DAY_CHANGE_AT_ARRIVAL &&
    dayPlanForPreviousDate?.dayPlanId != null &&
    isNightShiftDayPlan(dayPlanForPreviousDate)
  ) {
    // Own non-night-shift DayPlan → standard work day
    if (hasOwnPlan && !isNightShiftDayPlan(dayPlanForDate!)) {
      if (isWeekendDay) return NOT_A_WORK_DAY
      return IS_WORK_DAY
    }
    // Departure-only (no own shift, or own shift already handled by Priority 1)
    return NOT_A_WORK_DAY
  }

  // --- Priority 4: at_departure exclusion — calendarDate is arrival-only ---
  // CalendarDate's own at_departure night shift belongs to the next day.
  if (
    ownBehavior === DAY_CHANGE_AT_DEPARTURE &&
    hasOwnPlan &&
    isNightShiftDayPlan(dayPlanForDate!)
  ) {
    return NOT_A_WORK_DAY
  }

  // --- Standard fallback (none, auto_complete, or no night shift context) ---
  if (isWeekendDay) return NOT_A_WORK_DAY
  if (!hasOwnPlan) return NOT_A_WORK_DAY
  return IS_WORK_DAY
}
```

#### 2. New test file: `src/lib/services/__tests__/shift-day-resolver.test.ts`

**File**: `src/lib/services/__tests__/shift-day-resolver.test.ts` (new)

Full test suite covering:

**Helper factory:**
```typescript
function makeDayPlanInfo(overrides: Partial<DayPlanInfo> = {}): DayPlanInfo {
  return {
    dayPlanId: "plan-1",
    dayChangeBehavior: "none",
    comeFrom: 480,  // 08:00
    goTo: 960,      // 16:00
    ...overrides,
  }
}

function makeNightShiftPlan(behavior: string): DayPlanInfo {
  return makeDayPlanInfo({
    dayChangeBehavior: behavior,
    comeFrom: 1320,  // 22:00
    goTo: 360,       // 06:00
  })
}
```

**Test cases (matching ticket's test matrix):**

`describe("isNightShiftDayPlan")`:
- `comeFrom=1320, goTo=360` → true (NS 22:00→06:00)
- `comeFrom=480, goTo=960` → true? No, 960 > 480 → false (day shift)
- `comeFrom=null, goTo=null` → false
- `comeFrom=1320, goTo=null` → false
- `comeFrom=0, goTo=0` → false (edge: both midnight)

`describe("resolveEffectiveWorkDay")` — `describe("mode none")`:
- Day shift Mo 08:00→16:00, check Mo → `{ isWorkDay: true, effectiveDate: Mo }`
- No DayPlan for Mo → `{ isWorkDay: false, effectiveDate: null }`
- DayPlan with `dayPlanId=null` (Off-Day) → false
- Weekend Sa → false (regardless of DayPlan)

`describe("mode at_departure")`:
- **Happy path**: Previous day (So) has `at_departure` NS, current day (Mo) exists → `{ isWorkDay: true, effectiveDate: Mo }`
- **Sunday excluded**: Same scenario, check So → false (So is arrival-only)
- **Friday departure**: Previous day (Do) has `at_departure` NS, Fr has DayPlan → true
- **Fr→Sa standalone**: Fr has `at_departure` NS, no Do NS → Fr: false (arrival-only), Sa: false (weekend)
- **Holiday transition So→Mo**: effectiveDate = Mo (behavior unaffected by holidays)
- **Mixed rotation**: Mo = `none` day shift, Di = `at_departure` NS → Mo: true (standard), Di: false (arrival), Mi: true (departure)

`describe("mode at_arrival")`:
- **So night shift**: So has `at_arrival` NS → So: `{ isWorkDay: true, effectiveDate: So }` (weekend override!)
- **Mo departure-only**: Previous day (So) has `at_arrival` NS, Mo has no own shift → false
- **Mo departure + own day shift**: Mo has non-night DayPlan → true (own shift)
- **Mo in rotation**: So has `at_arrival` NS, Mo also has `at_arrival` NS → Mo: true (own arrival)
- **Vacation Mo–Fr**: Verify So=true, Mo=true, Di=true, Mi=true, Do=true, Fr=false (no own NS)

`describe("mode auto_complete")`:
- Night shift So 22:00→Mo 06:00: So=true (has DayPlan, standard check), Mo=true (has DayPlan)
- Identical behavior to `none` for absence purposes

`describe("edge cases")`:
- Month boundary: 31.01 22:00→01.02 06:00, `at_departure` → effectiveDate = 01.02
- Leap year: 28.02→29.02 (leap year) → correct
- No previous-day DayPlan: no night shift context → standard check
- Half-day duration: not tested here (duration is handled by `createRange`, not the resolver)

### Success Criteria:

#### Automated Verification:
- [x] `pnpm vitest run src/lib/services/__tests__/shift-day-resolver.test.ts` — all tests pass
- [x] `pnpm typecheck` — no new errors
- [x] `pnpm lint` — clean

#### Manual Verification:
- [ ] Code review: priority ordering in `resolveEffectiveWorkDay()` handles all combinations correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause for confirmation before proceeding.

---

## Phase 2: Repository Extension

### Overview
Extend the absences repository to load the DayPlan fields needed by `resolveEffectiveWorkDay()` and expand the date range by ±1 day.

### Changes Required:

#### 1. Extend `findEmployeeDayPlans()`
**File**: `src/lib/services/absences-repository.ts:200-218`
**Changes**: Add `include: { dayPlan: { select: { dayChangeBehavior, comeFrom, goTo } } }` and expand date range by ±1 day.

```typescript
export async function findEmployeeDayPlans(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  fromDate: Date,
  toDate: Date
) {
  // Extend range by ±1 day for night shift cross-day resolution
  const extFrom = new Date(fromDate)
  extFrom.setUTCDate(extFrom.getUTCDate() - 1)
  const extTo = new Date(toDate)
  extTo.setUTCDate(extTo.getUTCDate() + 1)

  return prisma.employeeDayPlan.findMany({
    where: {
      employeeId,
      planDate: { gte: extFrom, lte: extTo },
      employee: { tenantId },
    },
    select: {
      planDate: true,
      dayPlanId: true,
      dayPlan: {
        select: {
          dayChangeBehavior: true,
          comeFrom: true,
          goTo: true,
        },
      },
    },
  })
}
```

**Return type changes** from `{ planDate, dayPlanId }[]` to `{ planDate, dayPlanId, dayPlan: { dayChangeBehavior, comeFrom, goTo } | null }[]`.

#### 2. No changes to `findEmployeeDayPlansWithVacationDeduction()`
**File**: `src/lib/services/absences-repository.ts:365-384`
**Rationale**: This query loads the full year range and maps by `absenceDate`. Since Phase 3 will create AbsenceDay records on the correct effective dates, the existing lookup `dayPlanMap.get(dateKey)` will naturally resolve to the correct DayPlan's `vacationDeduction`. No range extension or additional fields needed.

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` — no new errors (downstream consumers will need updating in Phase 3)

---

## Phase 3: Service Core Logic

### Overview
Modify `shouldSkipDate()`, `createRange()`, and the `dayPlanMap` construction to use `resolveEffectiveWorkDay()`. This is the core behavioral change.

### Changes Required:

#### 1. Update `dayPlanMap` type and construction in `createRange()`
**File**: `src/lib/services/absences-service.ts:404-420`
**Changes**: The map value type changes to include DayPlan fields.

```typescript
// Inside the transaction, after repo.findEmployeeDayPlans():
import type { DayPlanInfo } from "./shift-day-resolver"

const dayPlanMap = new Map<string, DayPlanInfo>()
for (const dp of dayPlans) {
  const dateKey = dp.planDate.toISOString().split("T")[0]!
  dayPlanMap.set(dateKey, {
    dayPlanId: dp.dayPlanId,
    dayChangeBehavior: dp.dayPlan?.dayChangeBehavior ?? null,
    comeFrom: dp.dayPlan?.comeFrom ?? null,
    goTo: dp.dayPlan?.goTo ?? null,
  })
}
```

#### 2. Rewrite `shouldSkipDate()` to use `resolveEffectiveWorkDay()`
**File**: `src/lib/services/absences-service.ts:120-133`
**Changes**: New signature, delegates to shared helper.

```typescript
import { resolveEffectiveWorkDay, type DayPlanInfo } from "./shift-day-resolver"

/**
 * Determines if a date should be skipped during range creation.
 * Consumes dayChangeBehavior via resolveEffectiveWorkDay() for
 * correct night-shift day attribution.
 *
 * Holidays are NOT skipped per ZMI spec Section 18.2.
 */
export function shouldSkipDate(
  date: Date,
  dayPlanMap: Map<string, DayPlanInfo>,
): boolean {
  const dateKey = date.toISOString().split("T")[0]!
  const prevDate = new Date(date)
  prevDate.setUTCDate(prevDate.getUTCDate() - 1)
  const prevKey = prevDate.toISOString().split("T")[0]!

  const result = resolveEffectiveWorkDay(
    date,
    dayPlanMap.get(dateKey) ?? null,
    dayPlanMap.get(prevKey) ?? null,
  )

  return !result.isWorkDay
}
```

#### 3. Extend iteration range in `createRange()`
**File**: `src/lib/services/absences-service.ts:452-478`
**Changes**: Iterate from `fromDate - 1 day` to `toDate + 1 day`, but only report skipped dates within the original requested range.

```typescript
// Build extended iteration range
const iterStart = new Date(fromDate)
iterStart.setUTCDate(iterStart.getUTCDate() - 1)
const iterEnd = new Date(toDate)
iterEnd.setUTCDate(iterEnd.getUTCDate() + 1)

const currentDate = new Date(iterStart)
while (currentDate <= iterEnd) {
  const dateKey = currentDate.toISOString().split("T")[0]!
  const isInRequestedRange = currentDate >= fromDate && currentDate <= toDate

  if (shouldSkipDate(currentDate, dayPlanMap)) {
    if (isInRequestedRange) {
      txSkippedDates.push(dateKey)
    }
  } else if (existingMap.has(dateKey)) {
    if (isInRequestedRange) {
      txSkippedDates.push(dateKey)
    }
  } else {
    txToCreate.push({
      tenantId,
      employeeId,
      absenceDate: new Date(currentDate),
      absenceTypeId,
      duration,
      halfDayPeriod: halfDayPeriod ?? null,
      status,
      notes: notes ?? null,
      createdBy: audit?.userId ?? null,
      approvedBy: autoApprove ? (audit?.userId ?? null) : null,
      approvedAt: autoApprove ? new Date() : null,
    })
  }

  currentDate.setUTCDate(currentDate.getUTCDate() + 1)
}
```

#### 4. No changes to `recalculateVacationTaken()`
**File**: `src/lib/services/absences-service.ts:176-237`
**Rationale**: AbsenceDay records are now created on the correct effective dates. The existing `absenceDate → vacationDeduction` lookup in `recalculateVacationTaken()` already resolves to the correct DayPlan because the EmployeeDayPlan exists for the effective date (e.g., Sunday for `at_arrival`). The vacation deduction is naturally correct.

#### 5. Update `absences-auto-approve.test.ts` mock
**File**: `src/lib/services/__tests__/absences-auto-approve.test.ts:88-95`
**Changes**: Update `setupDayPlans()` mock return value to match new shape.

```typescript
function setupDayPlans(dates: string[]) {
  mockedRepo.findEmployeeDayPlans.mockResolvedValue(
    dates.map((d) => ({
      planDate: new Date(`${d}T00:00:00Z`),
      dayPlanId: "plan-1",
      dayPlan: {
        dayChangeBehavior: "none",
        comeFrom: 480,
        goTo: 960,
      },
    }))
  )
}
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm vitest run src/lib/services/__tests__/absences-auto-approve.test.ts` — existing tests still pass (backward-compatible for `none` mode)
- [x] `pnpm typecheck` — no new errors
- [x] `pnpm lint` — clean

#### Manual Verification:
- [ ] Code review: iteration ±1 extension only creates AbsenceDay records for effective work days
- [ ] Verify `shouldSkipDate()` re-export in `src/trpc/routers/absences.ts:613-617` still works with the updated signature

**Implementation Note**: After completing this phase and all automated verification passes, pause for confirmation before proceeding.

---

## Phase 4: DailyCalc Refactoring + Coverage Gap Tests

### Overview
Light refactoring of `applyDayChangeBehavior()` to share the night-shift detection heuristic from `shift-day-resolver.ts`. Fill test coverage gaps identified in the research.

### Changes Required:

#### 1. Import `isNightShiftDayPlan` in daily-calc helpers
**File**: `src/lib/services/daily-calc.helpers.ts`
**Changes**: Import `isNightShiftDayPlan` from `shift-day-resolver.ts`. No behavioral changes to `applyDayChangeBehavior()` — the function's logic stays identical. The import establishes the shared module as the canonical location for shift detection.

Add at the top of the file:
```typescript
export { isNightShiftDayPlan } from "./shift-day-resolver"
```

This re-export ensures any future code that needs night-shift detection can import from either module.

#### 2. Add coverage-gap tests
**File**: `src/lib/services/__tests__/daily-calc.helpers.test.ts`
**Changes**: Add tests to existing `describe("applyDayChangeBehavior")` block after line 482.

New test cases:

```typescript
describe("coverage gaps", () => {
  it("handles multiple cross-day pairs at same boundary", () => {
    // IN at prev@23:00, OUT at current@02:00, then IN at current@22:00, OUT at next@06:00
    // at_departure: include prev-day arrival for first pair, exclude current-day arrival for second
  })

  it("handles midnight edge case (editedTime=0)", () => {
    // Booking with editedTime=0 on current day (midnight sharp)
    // at_departure: booking at midnight is on current day, paired with prev-day arrival
  })

  it("returns current-day bookings unchanged for unknown behavior", () => {
    // behavior="unknown" → default case → filterBookingsByDate
    const result = applyDayChangeBehavior(date, "unknown_value", [bCurrent])
    expect(result.map(b => b.id)).toEqual(["current1"])
  })

  it("returns empty array when no bookings exist", () => {
    const result = applyDayChangeBehavior(date, "at_departure", [])
    expect(result).toEqual([])
  })
})
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm vitest run src/lib/services/__tests__/daily-calc.helpers.test.ts` — all existing + new tests pass
- [x] `pnpm typecheck` — no new errors

**Implementation Note**: After completing this phase and all automated verification passes, pause for confirmation before proceeding.

---

## Phase 5: Integration Tests

### Overview
End-to-end tests with real database covering all 4 modes, mixed rotation, vacation balance consistency, and DATEV export verification.

### Changes Required:

#### 1. New integration test file
**File**: `src/lib/services/__tests__/absences-night-shift.integration.test.ts` (new)

**Test setup pattern** (matching `inbound-invoice-service.integration.test.ts` and `05-taeglicher-betrieb.test.ts`):

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db"

const TEST_TENANT_ID = "10000000-0000-0000-0000-000000000001" // seed tenant
const NS_PLAN_ID = "00000000-0000-0000-0000-000000000508"     // seed NS plan (at_arrival)
const STD_PLAN_ID = "00000000-0000-0000-0000-000000000502"    // seed STD-8H plan (none)

// Create test-specific DayPlans for at_departure and auto_complete modes
const AT_DEPARTURE_PLAN_ID = "test-ns-at-dep-00000000-0001"
const AUTO_COMPLETE_PLAN_ID = "test-ns-autocmp-00000000-0001"

// Use a future date range to avoid conflicts with other tests
const TEST_YEAR = 2028
const TEST_MONTH_START = new Date(Date.UTC(TEST_YEAR, 5, 1))   // June 2028
const TEST_MONTH_END = new Date(Date.UTC(TEST_YEAR, 5, 30))
```

**`beforeAll`**:
1. Create `at_departure` DayPlan via `prisma.dayPlan.upsert` with `comeFrom=1320, goTo=360, dayChangeBehavior='at_departure'`
2. Create `auto_complete` DayPlan via `prisma.dayPlan.upsert` with `comeFrom=1320, goTo=360, dayChangeBehavior='auto_complete'`
3. Find test employee and vacation AbsenceType from seed data
4. Create EmployeeDayPlan records for the test date range

**`afterAll`**:
1. Delete test AbsenceDay, EmployeeDayPlan, VacationBalance, DayPlan records

**Test cases** (using `describe.sequential`):

`describe("at_departure end-to-end")`:
- Create EmployeeDayPlans for So-Fr with `at_departure` NS plan
- Call `createRange({ fromDate: "Mo", toDate: "Fr" })`
- Assert: AbsenceDay records exist for Mo, Di, Mi, Do, Fr (5 days)
- Assert: NO AbsenceDay for So (arrival-only)
- Approve all → verify `vacation_balances.taken` = 5 × vacationDeduction

`describe("at_arrival end-to-end")`:
- Create EmployeeDayPlans for So-Do with `at_arrival` NS plan (seed NS plan)
- Call `createRange({ fromDate: "Mo", toDate: "Fr" })`
- Assert: AbsenceDay records exist for So, Mo, Di, Mi, Do (5 days — So is ±1 extension)
- Assert: NO AbsenceDay for Fr
- Approve all → verify `vacation_balances.taken` = 5 × vacationDeduction

`describe("auto_complete end-to-end")`:
- Create EmployeeDayPlans for Mo-Fr with `auto_complete` NS plan
- Call `createRange({ fromDate: "Mo", toDate: "Fr" })`
- Assert: AbsenceDay records for Mo-Fr (5 days, standard)

`describe("none backward compatibility")`:
- Create EmployeeDayPlans for Mo-Fr with STD-8H plan (`none`)
- Call `createRange({ fromDate: "Mo", toDate: "Fr" })`
- Assert: AbsenceDay records for Mo-Fr (5 days, identical to old behavior)

`describe("mixed rotation")`:
- Mo: STD plan (`none`), Di: `at_departure` NS, Mi: no plan, Do: `at_departure` NS, Fr: no plan
- Call `createRange({ fromDate: "Mo", toDate: "Fr" })`
- Expected: Mo (standard), Mi (departure of Di), Fr (departure of Do) = 3 days
- Di: arrival-only → skip, Do: arrival-only → skip

`describe("sick day with at_departure")`:
- Use sick AbsenceType (code "K", `requiresApproval=false`)
- Same as `at_departure` E2E but verify auto-approve behavior

`describe("vacation balance consistency")`:
- After approving absences with `at_departure`:
- Verify `vacation_balances.taken` matches expected value
- Run monthly calc → verify `monthly_values.vacation_taken` is consistent

`describe("multi-tenant isolation")`:
- Tenant A with `none` DayPlans, Tenant B with `at_departure`
- Each tenant's absences are independent and correctly calculated

### Success Criteria:

#### Automated Verification:
- [x] `pnpm vitest run src/lib/services/__tests__/absences-night-shift.integration.test.ts` — all tests pass
- [x] Tests are idempotent (can run repeatedly without failure)

#### Manual Verification:
- [ ] Verify test data cleanup is complete (no leftover records)

**Implementation Note**: After completing this phase and all automated verification passes, pause for confirmation before proceeding.

---

## Phase 6: UI Warning

### Overview
Add a non-blocking informational alert below the `dayChangeBehavior` dropdown when `auto_complete` is selected.

### Changes Required:

#### 1. Add warning to day-plan-form-sheet
**File**: `src/components/day-plans/day-plan-form-sheet.tsx:870`
**Changes**: Insert conditional `<Alert>` between the `dayChangeBehavior` help text (line 870) and the closing `</div>` (line 871).

```tsx
<p className="text-xs text-muted-foreground">{t('dayChangeBehaviorHelp')}</p>
{form.dayChangeBehavior === 'auto_complete' && (
  <Alert className="mt-2">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>
      {t('dayChangeAutoCompleteWarning')}
    </AlertDescription>
  </Alert>
)}
```

Ensure `AlertCircle` is imported from `lucide-react` and `Alert`, `AlertDescription` from `@/components/ui/alert` (both are already imported — verify at top of file).

#### 2. Add i18n keys
**File**: `messages/de.json` — add after `"dayChangeBehaviorHelp"` key (line 1762):
```json
"dayChangeAutoCompleteWarning": "Hinweis: 'Auto-Abschluss um Mitternacht' führt dazu, dass Nachtschicht-Urlaube mehrere Urlaubstage verbrauchen (jeder Kalendertag zählt separat). Für klassische Nachtschichten empfehlen wir 'Bei Ankunft' oder 'Bei Gehen'.",
```

**File**: `messages/en.json` — add after `"dayChangeBehaviorHelp"` key (line 1762):
```json
"dayChangeAutoCompleteWarning": "Note: 'Auto-Complete at Midnight' causes night shift absences to consume multiple vacation days (each calendar day counts separately). For classic night shifts, we recommend 'Evaluate at Arrival' or 'Evaluate at Departure'.",
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` — no new errors
- [x] `pnpm lint` — clean

#### Manual Verification:
- [ ] Start dev server (`pnpm dev`), navigate to day plan form
- [ ] Select "Auto-Abschluss um Mitternacht" → warning appears below dropdown
- [ ] Select any other option → warning disappears
- [ ] Warning is informational (default variant), not destructive
- [ ] Warning text is readable, not truncated
- [ ] Save works normally with warning visible

**Implementation Note**: After completing this phase and all manual verification passes, pause for confirmation before proceeding.

---

## Phase 7: Handbook Update

### Overview
Expand section 6.5 from an 11-line stub to a comprehensive guide. Add cross-references from the vacation chapter (section 7).

### Changes Required:

#### 1. Expand section 6.5
**File**: `docs/TERP_HANDBUCH.md:2621-2631`
**Changes**: Replace the existing stub content (keep the heading) with:

- Existing table with expanded "Bedeutung" column explaining absence impact
- New 4-column table: `Einstellung | Nachtschicht So→Mo, Urlaub Mo–Fr | Verbrauchte Urlaubstage | Urlaubsstunden-Gutschrift`
  - `Keine`: So–Do, 5 Tage (Fehlzuordnung!), nach So-Plan
  - `Bei Ankunft`: So–Do, 5 Tage, nach dem DayPlan des Ankunftstags
  - `Bei Abgang`: Mo–Fr, 5 Tage, nach dem DayPlan des Abgangstags
  - `Auto-Abschluss`: Mo–Fr, bis zu 10 Tage (jeder Kalendertag separat), nach dem DayPlan jedes Kalendertags
- Empfehlung: blockquote recommending `Bei Ankunft` or `Bei Abgang` for classic night shifts, warning against `Auto-Abschluss`
- Klartext-Hinweis zu „Bei Ankunft" (blockquote, nach der Empfehlung):

```markdown
> **Hinweis zu „Bei Ankunft":** Wenn ein Mitarbeiter mit
> „Bei Ankunft"-Nachtschicht Urlaub vom Montag bis Freitag beantragt,
> werden die Urlaubstage intern auf Sonntag bis Donnerstag gebucht —
> weil jede Nachtschicht dem Ankunftstag zugeordnet ist, und der
> Sonntagabend ist der Ankunftstag der Montagnacht-Schicht.
>
> Das ist **logisch korrekt**: Urlaubskonto und Lohnabrechnung stimmen,
> der Mitarbeiter verbraucht 5 Urlaubstage, die Stunden werden korrekt
> gutgeschrieben. Im Kalender erscheinen die Urlaubstage aber auf anderen
> Kalendertagen als im Antrag angegeben. HR sollte das beim Erklären des
> Urlaubsantrags berücksichtigen.
>
> Für Betriebe, bei denen die Urlaubstag-Anzeige exakt dem Antragsdatum
> entsprechen soll, empfehlen wir den Modus „Bei Gehen" statt
> „Bei Ankunft".
```

- Praxisbeispiel (inline format, matching existing Praxisbeispiel patterns):
  1. Navigation: Administration → Tagespläne
  2. Nachtschicht-Tagesplan öffnen → Tab „Spezial"
  3. „Tageswechselverhalten" auf „Bei Gehen" setzen
  4. Speichern
  5. HR: Abwesenheiten → Urlaub für Nachtschicht-MA Mo–Fr beantragen
  6. Verifikation: Urlaubstage sind Mo, Di, Mi, Do, Fr (nicht So–Do)
  7. Verifikation: Urlaubskonto zeigt 5 Tage verbraucht
- Cross-reference note: "→ Abschnitt 7.3 für Details zur Urlaubsstunden-Gutschrift"

#### 2. Add cross-reference in section 7.3
**File**: `docs/TERP_HANDBUCH.md:2955-2963`
**Changes**: After the existing "1. Tagesberechnung (Stundenkredit)" section (after line 2963), add:

```markdown
> **Bei Nachtschichten:** Die Stundengutschrift folgt dem korrekt zugeordneten Kalendertag gemäß dem Tageswechselverhalten des Tagesplans. Bei „Bei Gehen" werden die Stunden dem Abgangstag gutgeschrieben, bei „Bei Ankunft" dem Ankunftstag. → Abschnitt 6.5 für Details.
```

#### 3. Add cross-reference at beginning of section 7
**File**: `docs/TERP_HANDBUCH.md:2862-2868`
**Changes**: After the section heading and before 7.1, add:

```markdown
> **Nachtschicht-Hinweis:** Bei Mitarbeitern mit Nachtschichten beeinflusst das Tageswechselverhalten des Tagesplans, auf welche Kalendertage Urlaubstage und Krankmeldungen gebucht werden. → Abschnitt 6.5 für Details.
```

### Success Criteria:

#### Automated Verification:
- [x] Markdown renders correctly (no broken tables or formatting)
- [x] `pnpm lint` — clean (if handbook is linted)

#### Manual Verification:
- [ ] Section 6.5 content is comprehensive and actionable
- [ ] Cross-references are clickable (within the markdown)
- [ ] Praxisbeispiel follows step-by-step format with navigation hints
- [ ] Table aligns and is readable
- [ ] German text is natural and professional

**Implementation Note**: After completing this phase, pause for confirmation before proceeding.

---

## Phase 8: Playwright E2E Tests

### Overview
Three browser-level tests verifying the full user journey for night-shift absences.

### Changes Required:

#### 1. New E2E spec file
**File**: `src/e2e-browser/nachtschicht-absenzen.spec.ts` (new)

**Test 1: HR books vacation for night-shift employee with `at_departure`**
1. Login as admin
2. Ensure test employee has night-shift DayPlan with `at_departure` (setup via Prisma)
3. Navigate to Absences → create absence for employee
4. Select vacation type, Mo–Fr date range
5. Submit
6. Verify calendar shows absence days on Mo–Fr (not So–Do)
7. Verify absence list shows 5 pending days

**Test 2: Employee sees correct vacation balance**
1. Login as employee (after vacation is approved)
2. Navigate to vacation overview
3. Verify balance shows correct number of days taken

**Test 3: UI warning on `auto_complete`**
1. Login as admin
2. Navigate to Administration → Tagespläne
3. Edit a DayPlan → go to "Spezial" tab
4. Select "Auto-Abschluss um Mitternacht"
5. Verify warning text is visible below dropdown
6. Select "Bei Ankunft" → verify warning disappears
7. Select "Auto-Abschluss um Mitternacht" again → save → verify save succeeds

### Success Criteria:

#### Automated Verification:
- [x] `pnpm exec playwright test src/e2e-browser/nachtschicht-absenzen.spec.ts` — all tests pass (8 E2E tests + 2 auth setup)

#### Manual Verification:
- [x] Tests are stable (no flaky failures — verified with 2 consecutive runs)
- [x] Cleanup is complete after test run (NS plan reset to `at_arrival` in describe.serial)

---

## Testing Strategy

### Unit Tests:
- `shift-day-resolver.test.ts`: ~25 cases covering all 4 modes + edge cases
- `daily-calc.helpers.test.ts`: 4 existing + ~4 new coverage-gap tests

### Integration Tests:
- `absences-night-shift.integration.test.ts`: ~10 cases with real DB
- Covers: all modes E2E, mixed rotation, multi-tenant, vacation balance consistency

### E2E Browser Tests:
- 3 Playwright specs: HR booking, balance verification, UI warning

### What We Test vs. What We Don't:
- **Test**: `resolveEffectiveWorkDay()` exhaustively (the core logic)
- **Test**: `createRange()` E2E for each mode (the integration)
- **Test**: vacation balance after approval (downstream correctness)
- **Don't test**: DATEV export format (unchanged, tested by existing tests)
- **Don't test**: `recalculateVacationTaken()` internals (unchanged, correctness follows from AbsenceDay placement)

## Performance Considerations

- `findEmployeeDayPlans()` now loads 3 additional fields per row and extends range by ±2 days total. Impact: negligible (typical absence range is 1-20 days, adding 2 rows is < 10% overhead).
- `resolveEffectiveWorkDay()` is O(1) per day — no loops, no DB calls. Called once per day in the iteration.
- The ±1 day iteration extension adds at most 2 extra calls to `shouldSkipDate()`. Negligible.

## Migration Notes

No database migration required. No new columns, tables, or seeds. The implementation purely consumes existing `dayChangeBehavior`, `comeFrom`, and `goTo` fields that are already populated.

## References

- Original ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-01-nachtschicht-bewertungslogik.md`
- Research: `thoughts/shared/research/2026-04-16-nachtschicht-bewertungslogik.md`
- Key code: `src/lib/services/absences-service.ts:120-133` (shouldSkipDate), `src/lib/services/daily-calc.helpers.ts:251-293` (applyDayChangeBehavior)
- Handbook: `docs/TERP_HANDBUCH.md:2621-2631` (section 6.5 stub)
- Seed data: `supabase/seed.sql:2967-2972` (NS DayPlan)
