# ZMI-TICKET-233: Calculation Engine Pure Math Library -- Implementation Plan

## Date: 2026-03-07

## Overview

Port the Go calculation engine (`apps/api/internal/calculation/`) to TypeScript as a pure-function library at `apps/web/src/lib/calculation/`. The library has ZERO database dependencies -- only pure input/output functions for time tracking calculations.

## Conventions (from existing codebase)

- **Style**: Pure exported functions (no classes), `export interface` for types, `export function` for public functions
- **Naming**: camelCase for functions/properties, PascalCase for types/interfaces
- **Nullability**: Use `| null` (not `undefined`) for optional nullable values, matching existing `travel-allowance.ts`
- **IDs**: Use `string` for UUIDs (calculation layer just passes them through)
- **Numbers**: Use `number` for all numeric values (minutes, days, decimals)
- **Time representation**: All times are integers in minutes from midnight (0-1439), durations are integer minutes
- **Tests**: Vitest with globals (`describe`/`it`/`expect`), files at `src/lib/calculation/__tests__/*.test.ts`
- **Comments**: JSDoc with `@param` and `@example` annotations, file header comment explaining module purpose
- **Reuse**: Import from existing `@/lib/time-utils.ts` where functions already exist (`timeStringToMinutes`, `isSameDay`)
- **Constants**: `MINUTES_PER_DAY = 1440`, `MAX_MINUTES_FROM_MIDNIGHT = 1439`

## File Structure

```
apps/web/src/lib/calculation/
  types.ts              -- All input/output types, enums, and constants
  errors.ts             -- Error and warning code constants
  time.ts               -- Time utilities (NormalizeCrossMidnight, overlap, etc.)
  pairing.ts            -- Booking pairing logic (IN/OUT matching)
  tolerance.ts          -- Tolerance/grace period application
  rounding.ts           -- Rounding logic (up/down/nearest/add/subtract, anchored)
  breaks.ts             -- Break deduction logic (fixed/variable/minimum)
  capping.ts            -- Window capping + max net time capping + aggregation
  surcharges.ts         -- Surcharge/bonus calculations (night/weekend/holiday)
  calculator.ts         -- Main Calculator orchestrator (processBookings + Calculate)
  index.ts              -- Public API barrel export
  travel-allowance.ts   -- (already exists, do not modify)
  __tests__/
    time.test.ts
    pairing.test.ts
    tolerance.test.ts
    rounding.test.ts
    breaks.test.ts
    capping.test.ts
    surcharges.test.ts
    calculator.test.ts
```

**Note on test file location**: The ticket shows `__tests__/` inside the `calculation/` folder. The existing `travel-allowance` test is at `src/lib/__tests__/`. For this ticket, place tests at `src/lib/calculation/__tests__/` since the vitest config glob `src/**/__tests__/**/*.test.ts` matches both locations. This keeps calculation tests co-located with the source.

---

## Phase 1: Types and Constants

### Files to create
- `apps/web/src/lib/calculation/types.ts`
- `apps/web/src/lib/calculation/errors.ts`
- `apps/web/src/lib/calculation/time.ts`

### 1A: `types.ts` -- All input/output types and enums

**Source**: `apps/api/internal/calculation/types.go` (178 lines) + `apps/api/internal/calculation/capping.go` (lines 1-27) + `apps/api/internal/calculation/surcharge.go` (lines 10-42)

#### Enums (as string literal union types)

```typescript
export type BookingDirection = "in" | "out"
export type BookingCategory = "work" | "break"
export type BreakType = "fixed" | "variable" | "minimum"
export type RoundingType = "none" | "up" | "down" | "nearest" | "add" | "subtract"
export type PlanType = "fixed" | "flextime"
export type CappingSource = "early_arrival" | "late_leave" | "max_net_time"
export type SurchargeCalculationType = "per_minute" | "fixed" | "percentage"
```

#### Input Types

```typescript
export interface BookingInput {
  id: string
  time: number          // Minutes from midnight (0-1439)
  direction: BookingDirection
  category: BookingCategory
  pairId: string | null
}

export interface BreakConfig {
  type: BreakType
  startTime: number | null    // For fixed breaks: window start
  endTime: number | null      // For fixed breaks: window end
  duration: number            // Break duration in minutes
  afterWorkMinutes: number | null  // For minimum: trigger threshold
  autoDeduct: boolean
  isPaid: boolean
  minutesDifference: boolean  // For minimum: proportional deduction
}

export interface RoundingConfig {
  type: RoundingType
  interval: number
  addValue: number
  anchorTime: number | null
}

export interface ToleranceConfig {
  comePlus: number
  comeMinus: number
  goPlus: number
  goMinus: number
}

export interface DayPlanInput {
  planType: PlanType
  comeFrom: number | null
  comeTo: number | null
  goFrom: number | null
  goTo: number | null
  coreStart: number | null
  coreEnd: number | null
  regularHours: number
  tolerance: ToleranceConfig
  roundingCome: RoundingConfig | null
  roundingGo: RoundingConfig | null
  breaks: BreakConfig[]
  minWorkTime: number | null
  maxNetWorkTime: number | null
  variableWorkTime: boolean
  roundAllBookings: boolean
  roundRelativeToPlan: boolean
}

export interface CalculationInput {
  employeeId: string
  date: Date
  bookings: BookingInput[]
  dayPlan: DayPlanInput
}
```

#### Output Types

```typescript
export interface BookingPair {
  inBooking: BookingInput | null
  outBooking: BookingInput | null
  category: BookingCategory
  duration: number
}

export interface CappedTime {
  minutes: number
  source: CappingSource
  reason: string
}

export interface CappingResult {
  totalCapped: number
  items: CappedTime[]
}

export interface PairingResult {
  pairs: BookingPair[]
  unpairedInIds: string[]
  unpairedOutIds: string[]
  warnings: string[]
}

export interface BreakDeductionResult {
  deductedMinutes: number
  warnings: string[]
}

export interface CalculationResult {
  grossTime: number
  netTime: number
  targetTime: number
  overtime: number
  undertime: number
  breakTime: number
  firstCome: number | null
  lastGo: number | null
  bookingCount: number
  calculatedTimes: Map<string, number>
  pairs: BookingPair[]
  unpairedInIds: string[]
  unpairedOutIds: string[]
  cappedTime: number
  capping: CappingResult
  hasError: boolean
  errorCodes: string[]
  warnings: string[]
}

// Surcharge types
export interface TimePeriod {
  start: number
  end: number
}

export interface SurchargeConfig {
  accountId: string
  accountCode: string
  timeFrom: number
  timeTo: number
  appliesOnHoliday: boolean
  appliesOnWorkday: boolean
  holidayCategories: number[]
  calculationType: string
  valueMinutes: number
  minWorkMinutes: number | null
}

export interface SurchargeResult {
  accountId: string
  accountCode: string
  minutes: number
}

export interface SurchargeCalculationResult {
  surcharges: SurchargeResult[]
  totalMinutes: number
}
```

### 1B: `errors.ts` -- Error and warning code constants

**Source**: `apps/api/internal/calculation/errors.go` (62 lines)

```typescript
// Error codes
export const ERR_MISSING_COME = "MISSING_COME"
export const ERR_MISSING_GO = "MISSING_GO"
export const ERR_UNPAIRED_BOOKING = "UNPAIRED_BOOKING"
export const ERR_EARLY_COME = "EARLY_COME"
export const ERR_LATE_COME = "LATE_COME"
export const ERR_EARLY_GO = "EARLY_GO"
export const ERR_LATE_GO = "LATE_GO"
export const ERR_MISSED_CORE_START = "MISSED_CORE_START"
export const ERR_MISSED_CORE_END = "MISSED_CORE_END"
export const ERR_BELOW_MIN_WORK_TIME = "BELOW_MIN_WORK_TIME"
export const ERR_NO_BOOKINGS = "NO_BOOKINGS"
export const ERR_INVALID_TIME = "INVALID_TIME"
export const ERR_DUPLICATE_IN_TIME = "DUPLICATE_IN_TIME"
export const ERR_NO_MATCHING_SHIFT = "NO_MATCHING_SHIFT"

// Warning codes
export const WARN_CROSS_MIDNIGHT = "CROSS_MIDNIGHT"
export const WARN_MAX_TIME_REACHED = "MAX_TIME_REACHED"
export const WARN_MANUAL_BREAK = "MANUAL_BREAK"
export const WARN_NO_BREAK_RECORDED = "NO_BREAK_RECORDED"
export const WARN_SHORT_BREAK = "SHORT_BREAK"
export const WARN_AUTO_BREAK_APPLIED = "AUTO_BREAK_APPLIED"

export function isError(code: string): boolean { ... }
```

### 1C: `time.ts` -- Time utilities

**Source**: `apps/api/internal/timeutil/timeutil.go` (88 lines)

Only port functions not already in `time-utils.ts`. Existing `time-utils.ts` already has:
- `timeStringToMinutes` (equivalent of `ParseTimeString`)
- `formatTime` (equivalent of `MinutesToString`)
- `isSameDay` (equivalent of `sameDate`)

Functions to implement in `time.ts`:

```typescript
export const MINUTES_PER_DAY = 1440
export const MAX_MINUTES_FROM_MIDNIGHT = 1439

/** If endMinutes < startMinutes, adds 1440 to handle cross-midnight. */
export function normalizeCrossMidnight(startMinutes: number, endMinutes: number): number

/** Check if minutes is a valid time of day (0-1439). */
export function isValidTimeOfDay(minutes: number): boolean
```

### Verification
- No tests needed for Phase 1 (types are compile-time checked, `time.ts` constants/utility are trivial and tested via Phase 2)
- Run `cd apps/web && npx tsc --noEmit` to verify types compile

---

## Phase 2: Time Calculations (Tolerance + Rounding)

### Files to create
- `apps/web/src/lib/calculation/tolerance.ts`
- `apps/web/src/lib/calculation/rounding.ts`
- `apps/web/src/lib/calculation/__tests__/time.test.ts`
- `apps/web/src/lib/calculation/__tests__/tolerance.test.ts`
- `apps/web/src/lib/calculation/__tests__/rounding.test.ts`

### 2A: `tolerance.ts`

**Source**: `apps/api/internal/calculation/tolerance.go` (89 lines)

```typescript
export function applyComeTolerance(
  actualTime: number,
  expectedTime: number | null,
  tolerance: ToleranceConfig
): number

export function applyGoTolerance(
  actualTime: number,
  expectedTime: number | null,
  tolerance: ToleranceConfig
): number

export function validateTimeWindow(
  actualTime: number,
  from: number | null,
  to: number | null,
  earlyCode: string,
  lateCode: string
): string[]

export function validateCoreHours(
  firstCome: number | null,
  lastGo: number | null,
  coreStart: number | null,
  coreEnd: number | null
): string[]
```

**Business logic** (from Go):
- `applyComeTolerance`: If expectedTime is null, return actualTime. Late arrival within ComePlus tolerance snaps to expected. Early arrival within ComeMinus tolerance snaps to expected.
- `applyGoTolerance`: If expectedTime is null, return actualTime. Early departure within GoMinus tolerance snaps to expected. Late departure within GoPlus tolerance snaps to expected.
- `validateTimeWindow`: Returns error codes if actualTime is outside [from, to].
- `validateCoreHours`: If core hours not defined, skip. Check firstCome <= coreStart and lastGo >= coreEnd.

### 2B: `rounding.ts`

**Source**: `apps/api/internal/calculation/rounding.go` (186 lines)

```typescript
export function roundTime(minutes: number, config: RoundingConfig | null): number
export function roundComeTime(minutes: number, config: RoundingConfig | null): number
export function roundGoTime(minutes: number, config: RoundingConfig | null): number
```

Internal helpers (not exported):
```typescript
function roundUp(minutes: number, interval: number): number
function roundDown(minutes: number, interval: number): number
function roundNearest(minutes: number, interval: number): number
function roundUpAnchored(minutes: number, interval: number, anchor: number | null): number
function roundDownAnchored(minutes: number, interval: number, anchor: number | null): number
function roundNearestAnchored(minutes: number, interval: number, anchor: number | null): number
function roundUpOffset(offset: number, interval: number): number
function roundDownOffset(offset: number, interval: number): number
function roundNearestOffset(offset: number, interval: number): number
function roundAdd(minutes: number, value: number): number
function roundSubtract(minutes: number, value: number): number
```

**Critical detail for JS**: JavaScript's `%` operator returns negative remainders for negative dividends (same as Go), so the offset rounding logic ports directly. Example: `-3 % 5 === -3` in both Go and JS.

### Test cases for `tolerance.test.ts`
Port from `apps/api/internal/calculation/tolerance_test.go` (175 lines):
1. `applyComeTolerance` -- nil expected returns unchanged, late within tolerance snaps, late beyond tolerance unchanged, early within tolerance snaps, early beyond tolerance unchanged
2. `applyGoTolerance` -- nil expected returns unchanged, early within tolerance snaps, early beyond tolerance unchanged, late within tolerance snaps, late beyond tolerance unchanged
3. `validateTimeWindow` -- within window, at boundaries, too early, too late, nil boundaries
4. `validateCoreHours` -- covers core hours, exact core hours, missed start, missed end, missed both, nil firstCome, nil lastGo, no core hours defined

### Test cases for `rounding.test.ts`
Port from `apps/api/internal/calculation/rounding_test.go` (431 lines):
1. Nil/none config returns unchanged
2. Zero interval returns unchanged
3. Round up: already rounded, needs rounding, boundary cases (interval 5, 15, 30)
4. Round down: already rounded, needs rounding, boundary cases
5. Round nearest: round down for small remainders, round up for large remainders, boundary
6. Different intervals (5, 10, 15, 30)
7. Round add: various values, zero value, negative value, overflow past midnight
8. Round subtract: various values, clamp to zero, zero value, negative value
9. Add/subtract ignores interval, interval ignores addValue
10. **Anchored rounding** (critical ZMI feature): anchor at 07:03 (423), interval=5, grid 418,423,428,433
    - Anchored round up: on anchor, offset +1, offset -2, on grid point, between grid points
    - Anchored round down: on anchor, offset +1, offset +4, offset -1, on grid point above
    - Anchored round nearest: on anchor, offset +1 round down, offset +3 round up, below anchor
    - Nil anchor falls back to standard
    - Larger interval (15) with anchor at 480
    - Add/subtract ignores anchor

### Test cases for `time.test.ts`
1. `normalizeCrossMidnight`: end < start adds 1440, end >= start unchanged
2. `isValidTimeOfDay`: 0 valid, 1439 valid, -1 invalid, 1440 invalid

### Verification
```bash
cd apps/web && npx vitest run src/lib/calculation/__tests__/time.test.ts
cd apps/web && npx vitest run src/lib/calculation/__tests__/tolerance.test.ts
cd apps/web && npx vitest run src/lib/calculation/__tests__/rounding.test.ts
```

---

## Phase 3: Break Calculations

### Files to create
- `apps/web/src/lib/calculation/breaks.ts`
- `apps/web/src/lib/calculation/__tests__/breaks.test.ts`

### 3A: `breaks.ts`

**Source**: `apps/api/internal/calculation/breaks.go` (187 lines)

```typescript
export function calculateBreakDeduction(
  pairs: BookingPair[],
  recordedBreakTime: number,
  grossWorkTime: number,
  breakConfigs: BreakConfig[]
): BreakDeductionResult

export function calculateOverlap(
  start1: number, end1: number,
  start2: number, end2: number
): number

export function deductFixedBreak(
  pairs: BookingPair[],
  cfg: BreakConfig
): number

export function calculateMinimumBreak(
  grossWorkTime: number,
  cfg: BreakConfig
): number

export function calculateNetTime(
  grossTime: number,
  breakTime: number,
  maxNetWorkTime: number | null
): { netTime: number; warnings: string[] }

export function calculateOvertimeUndertime(
  netTime: number,
  targetTime: number
): { overtime: number; undertime: number }
```

**Business logic** (from Go `breaks.go`):

- `calculateBreakDeduction`:
  1. If no breakConfigs: return recordedBreakTime directly
  2. For each config:
     - `fixed`: ALWAYS deducted via `deductFixedBreak` (overlap with work pairs). Ignores manual bookings.
     - `variable`: Only deducted if `recordedBreakTime === 0 && autoDeduct && (no threshold OR grossWorkTime >= threshold)`
     - `minimum`: If `autoDeduct`, calls `calculateMinimumBreak`
  3. If recordedBreakTime > 0: add to total, warn MANUAL_BREAK
  4. If recordedBreakTime === 0 and totalDeduction > 0: warn NO_BREAK_RECORDED

- `calculateOverlap`: Standard interval overlap `max(0, min(end1, end2) - max(start1, start2))`

- `deductFixedBreak`: Sum overlap of each work pair with break window [startTime, endTime], cap at cfg.duration

- `calculateMinimumBreak`:
  1. If no threshold (afterWorkMinutes is null): return 0
  2. If grossWorkTime < threshold: return 0
  3. If minutesDifference: deduct `min(grossWorkTime - threshold, duration)` (proportional)
  4. Otherwise: full duration

- `calculateNetTime`: net = max(0, gross - breaks). If maxNetWorkTime set and net > max, cap and warn.

- `calculateOvertimeUndertime`: if net > target -> overtime = diff, else undertime = -diff

### Test cases for `breaks.test.ts`
Port from `apps/api/internal/calculation/breaks_test.go` (389 lines):

1. **calculateBreakDeduction**: no configs uses recorded breaks; manual break recorded adds to total + minimum auto-deduct; auto deduct when no manual break; multiple break types combined; work threshold not met (no deduction)
2. **calculateOverlap**: full overlap, partial overlap (early end, late start), no overlap (before/after), exact match, work inside break, break inside work, adjacent (no overlap) -- 9 test cases
3. **deductFixedBreak**: full overlap, partial overlap, no overlap, break pairs ignored, nil start time, overlap exceeds duration (capped)
4. **calculateMinimumBreak**: below threshold, above threshold (full), at threshold, MinutesDifference proportional (10 min over = 10 min deducted), MinutesDifference capped at duration, nil threshold
5. **calculateNetTime**: basic, no break, negative result floors at 0, at max, capped by max (warning)
6. **calculateOvertimeUndertime**: exact match (0/0), overtime, undertime, zero net

### Verification
```bash
cd apps/web && npx vitest run src/lib/calculation/__tests__/breaks.test.ts
```

---

## Phase 4: Capping (Overtime-adjacent)

### Files to create
- `apps/web/src/lib/calculation/capping.ts`
- `apps/web/src/lib/calculation/__tests__/capping.test.ts`

### 4A: `capping.ts`

**Source**: `apps/api/internal/calculation/capping.go` (212 lines)

```typescript
export function applyWindowCapping(
  bookingTime: number,
  windowStart: number | null,
  windowEnd: number | null,
  toleranceMinus: number,
  tolerancePlus: number,
  isArrival: boolean,
  variableWorkTime: boolean
): { adjustedTime: number; capped: number }

export function applyCapping(
  netWorkTime: number,
  maxNetWorkTime: number | null
): { adjustedNet: number; capped: number }

export function calculateEarlyArrivalCapping(
  arrivalTime: number,
  windowStart: number | null,
  toleranceMinus: number,
  variableWorkTime: boolean
): CappedTime | null

export function calculateLateDepartureCapping(
  departureTime: number,
  windowEnd: number | null,
  tolerancePlus: number
): CappedTime | null

export function calculateMaxNetTimeCapping(
  netWorkTime: number,
  maxNetWorkTime: number | null
): CappedTime | null

export function aggregateCapping(
  ...items: (CappedTime | null)[]
): CappingResult
```

**Business logic** (from Go `capping.go`):

- `applyWindowCapping`:
  - For arrivals: if bookingTime < effectiveStart (windowStart - toleranceMinus when variableWorkTime), cap to effectiveStart
  - For departures: if bookingTime > effectiveEnd (windowEnd + tolerancePlus), cap to effectiveEnd
  - Returns { adjustedTime, capped (amount capped in minutes) }

- `calculateEarlyArrivalCapping`: Returns CappedTime if arrival is before effective window start, else null. effectiveStart = windowStart (or windowStart - toleranceMinus if variableWorkTime)

- `calculateLateDepartureCapping`: Returns CappedTime if departure is after effective window end (windowEnd + tolerancePlus), else null.

- `calculateMaxNetTimeCapping`: Returns CappedTime if netWorkTime > maxNetWorkTime, else null.

- `aggregateCapping`: Combines non-null items with minutes > 0 into CappingResult with total.

- `applyCapping`: Simple convenience wrapper -- caps netWorkTime at maxNetWorkTime.

### Test cases for `capping.test.ts`
Port from `apps/api/internal/calculation/capping_test.go` (461 lines):

1. **calculateEarlyArrivalCapping**: nil window (no capping), within window, after window start, before window without tolerance (capped), before window with tolerance and variableWorkTime (no capping), before tolerance window and variableWorkTime (capped), without variableWorkTime tolerance ignored (capped), exactly at effective start
2. **calculateLateDepartureCapping**: nil window end, within window, before window end, after window without tolerance (capped), within tolerance (no capping), after tolerance (capped), exactly at effective end
3. **calculateMaxNetTimeCapping**: nil max, under max, at max, over max, significantly over
4. **aggregateCapping**: no items, all null, single item, multiple items, mixed null/valid, zero-minutes item ignored
5. **applyCapping**: nil max, under max, at max, over max
6. **applyWindowCapping**: arrival within window, arrival before window (no tolerance), arrival before window (variable tolerance, within), arrival before tolerance window (variable, capped), departure within window, departure after window (no tolerance), departure within tolerance, departure after tolerance

### Verification
```bash
cd apps/web && npx vitest run src/lib/calculation/__tests__/capping.test.ts
```

---

## Phase 5: Pairing

### Files to create
- `apps/web/src/lib/calculation/pairing.ts`
- `apps/web/src/lib/calculation/__tests__/pairing.test.ts`

### 5A: `pairing.ts`

**Source**: `apps/api/internal/calculation/pairing.go` (270 lines)

```typescript
export function pairBookings(bookings: BookingInput[]): PairingResult

export function calculateGrossTime(pairs: BookingPair[]): number

export function calculateBreakTime(pairs: BookingPair[]): number

export function findFirstCome(bookings: BookingInput[]): number | null

export function findLastGo(bookings: BookingInput[]): number | null
```

Internal helpers:
```typescript
function filterByCategory(bookings: BookingInput[], category: BookingCategory): BookingInput[]
function pairByCategory(bookings: BookingInput[], category: BookingCategory): {
  pairs: BookingPair[]
  unpairedIn: string[]
  unpairedOut: string[]
  warnings: string[]
}
function createPairForCategory(inBooking: BookingInput, outBooking: BookingInput, category: BookingCategory): BookingPair
function isCrossMidnight(pair: BookingPair): boolean
```

**Business logic** (from Go `pairing.go`):

- `pairBookings`: Separates bookings by category (work/break), pairs each via `pairByCategory`
- `pairByCategory`:
  1. Split into in/out lists, sort by time
  2. First pass: pair by existing PairID
  3. Second pass (work): match unpaired IN with next chronological OUT (OUT.time >= IN.time)
  4. Third pass (work): handle cross-midnight (IN.time > OUT.time)
  5. Break pairing: OUT (break start) with next IN (break end) -- reversed direction
- Duration:
  - Work: `normalizeCrossMidnight(in.time, out.time) - in.time`
  - Break: `normalizeCrossMidnight(out.time, in.time) - out.time`
- `isCrossMidnight`: work: in.time > out.time, break: out.time > in.time

### Test cases for `pairing.test.ts`
Port from `apps/api/internal/calculation/pairing_test.go` (181 lines):

1. **pairBookings**: empty input, single pair (540 min duration), pair by existing PairID, multiple pairs (split shift), with breaks (work + break pairs), unpaired (single in), cross-midnight (22:00 to 02:00 = 240 min)
2. **calculateGrossTime**: work pairs summed, break pairs excluded
3. **calculateBreakTime**: break pairs summed, work pairs excluded
4. **findFirstCome**: earliest work IN, ignores break IN
5. **findLastGo**: latest work OUT, ignores break OUT

### Verification
```bash
cd apps/web && npx vitest run src/lib/calculation/__tests__/pairing.test.ts
```

---

## Phase 6: Surcharge Calculations

### Files to create
- `apps/web/src/lib/calculation/surcharges.ts`
- `apps/web/src/lib/calculation/__tests__/surcharges.test.ts`

### 6A: `surcharges.ts`

**Source**: `apps/api/internal/calculation/surcharge.go` (269 lines)

```typescript
export function calculateSurcharges(
  workPeriods: TimePeriod[],
  configs: SurchargeConfig[],
  isHoliday: boolean,
  holidayCategory: number,
  netWorkTime: number
): SurchargeCalculationResult

export function splitOvernightSurcharge(config: SurchargeConfig): SurchargeConfig[]

export function validateSurchargeConfig(config: SurchargeConfig): string[]

export function extractWorkPeriods(pairs: BookingPair[]): TimePeriod[]

export function getHolidayCategoryFromFlag(isHalfDay: boolean): number
```

Internal helpers:
```typescript
function surchargeApplies(config: SurchargeConfig, isHoliday: boolean, holidayCategory: number): boolean
```

**Business logic** (from Go `surcharge.go`):

- `calculateSurcharges`:
  1. For each config: check if applies today via `surchargeApplies`
  2. Check minimum work time gate (minWorkMinutes)
  3. Calculate overlap between work periods and surcharge window
  4. Apply calculation type: `per_minute` (default) = overlap, `fixed` = valueMinutes, `percentage` = overlap * valueMinutes / 100
  5. Skip if bonus is 0

- `surchargeApplies`: If holiday: must have appliesOnHoliday + matching category. If workday: must have appliesOnWorkday.

- `splitOvernightSurcharge`: If timeFrom < timeTo, return as-is. Otherwise split into [timeFrom, 1440] and [0, timeTo].

- `validateSurchargeConfig`: Check timeFrom 0-1439, timeTo 1-1440, timeFrom < timeTo.

- `extractWorkPeriods`: Extract start/end from complete work pairs.

- `getHolidayCategoryFromFlag`: halfDay -> 2, fullDay -> 1.

**Note**: `ConvertBonusesToSurchargeConfigs` from the Go code references the `model.DayPlanBonus` type which is a DB model. This function is part of the service/integration layer, NOT the pure math library. It should NOT be ported here. The caller (TICKET-234) will handle the conversion.

### Test cases for `surcharges.test.ts`
Port from `apps/api/internal/calculation/surcharge_test.go` (597 lines):

1. **calculateSurcharges**: night shift (22:00-00:00 on workday = 60 min), holiday surcharge (all day, category filter), night NOT on holiday, multiple work periods (split shift, 60+30=90), no work periods, no overlap, per_minute (default), fixed (flat 30 regardless of overlap), fixed no overlap (skipped), percentage (60*50/100=30), minWorkMinutes below threshold (skipped), minWorkMinutes above threshold
2. **validateSurchargeConfig**: valid config, valid full day (0-1440), overnight span invalid, negative timeFrom, timeFrom at 1440, timeTo out of range, timeTo zero, from equals to, from greater than to
3. **splitOvernightSurcharge**: overnight split (22:00-06:00 -> [22:00-00:00, 00:00-06:00]), already valid returns as-is, preserves new fields (calculationType, valueMinutes, minWorkMinutes)
4. **extractWorkPeriods**: filters work pairs, excludes break pairs, skips incomplete pairs
5. **getHolidayCategoryFromFlag**: full day = 1, half day = 2

### Verification
```bash
cd apps/web && npx vitest run src/lib/calculation/__tests__/surcharges.test.ts
```

---

## Phase 7: Main Calculator + Public API

### Files to create
- `apps/web/src/lib/calculation/calculator.ts`
- `apps/web/src/lib/calculation/index.ts`
- `apps/web/src/lib/calculation/__tests__/calculator.test.ts`

### 7A: `calculator.ts`

**Source**: `apps/api/internal/calculation/calculator.go` (274 lines)

```typescript
export function calculate(input: CalculationInput): CalculationResult
```

Internal helper:
```typescript
function processBookings(
  bookings: BookingInput[],
  dayPlan: DayPlanInput,
  calculatedTimes: Map<string, number>
): {
  processed: BookingInput[]
  validation: BookingInput[]
  cappingItems: CappedTime[]
}
```

**Business logic** (from Go `calculator.go` Calculate method):

The `calculate` function orchestrates all phases:

1. Initialize result: targetTime = dayPlan.regularHours, bookingCount = bookings.length
2. If no bookings: set error NO_BOOKINGS, return
3. **processBookings**: For each booking:
   - Determine `allowEarlyTolerance = dayPlan.variableWorkTime || dayPlan.planType === "flextime"`
   - Find firstInIdx / lastOutIdx for rounding scope (skip if roundAllBookings)
   - Handle `roundRelativeToPlan`: set anchorTime on rounding configs to comeFrom/goFrom
   - For work IN: applyComeTolerance(time, comeFrom, tolerance) -> roundComeTime (first-in only unless roundAllBookings) -> applyWindowCapping
   - For work OUT: applyGoTolerance(time, goTo fallback goFrom, tolerance) -> roundGoTime (last-out only unless roundAllBookings) -> applyWindowCapping
   - Store pre-capped time in validation array, post-capped time in processed array
   - Track capping items (early arrival, late departure)
4. **pairBookings**(processedBookings) -> pairs, unpaired
5. Add MISSING_GO / MISSING_COME errors for unpaired
6. **findFirstCome / findLastGo** from validation bookings (pre-capped times)
7. **validateTimeWindows**: check firstCome against [comeFrom, comeTo], lastGo against [goFrom, goTo]
8. **validateCoreHours**: check core hours coverage
9. **calculateGrossTime**(pairs)
10. **calculateBreakDeduction**(pairs, recordedBreakTime, grossTime, breakConfigs)
11. uncappedNet = max(0, gross - breaks)
12. **applyCapping**(uncappedNet, maxNetWorkTime)
13. **calculateMaxNetTimeCapping** + **aggregateCapping** with window capping items
14. Validate minWorkTime
15. **calculateOvertimeUndertime**(netTime, targetTime)
16. hasError = errorCodes.length > 0

### 7B: `index.ts` -- Public API barrel export

```typescript
// Re-export all public types
export type { ... } from "./types"

// Re-export all public functions
export { calculate } from "./calculator"
export { pairBookings, calculateGrossTime, calculateBreakTime, findFirstCome, findLastGo } from "./pairing"
export { applyComeTolerance, applyGoTolerance, validateTimeWindow, validateCoreHours } from "./tolerance"
export { roundTime, roundComeTime, roundGoTime } from "./rounding"
export { calculateBreakDeduction, calculateOverlap, deductFixedBreak, calculateMinimumBreak, calculateNetTime, calculateOvertimeUndertime } from "./breaks"
export { applyWindowCapping, applyCapping, calculateEarlyArrivalCapping, calculateLateDepartureCapping, calculateMaxNetTimeCapping, aggregateCapping } from "./capping"
export { calculateSurcharges, splitOvernightSurcharge, validateSurchargeConfig, extractWorkPeriods, getHolidayCategoryFromFlag } from "./surcharges"
export { normalizeCrossMidnight, isValidTimeOfDay, MINUTES_PER_DAY, MAX_MINUTES_FROM_MIDNIGHT } from "./time"
export * from "./errors"
```

### Test cases for `calculator.test.ts`
Port from `apps/api/internal/calculation/calculator_test.go` (894 lines):

**Core integration tests:**
1. Empty bookings -> error NO_BOOKINGS
2. Simple work day: 08:00-17:00, 480 regular -> gross=540, net=540, overtime=60
3. With manual breaks: 08:00-17:00, break 12:00-12:30 -> gross=540, break=30, net=510, overtime=30
4. With auto-deduct break (minimum, threshold 300, duration 30) -> gross=540, break=30, net=510, warn AUTO_BREAK_APPLIED
5. With rounding: come 08:03 round up 15 -> 08:15, go 16:57 round down 15 -> 16:45, gross=510
6. With tolerance: come 08:03 within 5min tolerance of 08:00 -> snaps to 480, go 16:57 within 5min of 17:00 -> snaps to 1020, gross=540
7. Tolerance uses ComeFrom and GoTo (not GoFrom)
8. Window capping adjusts gross time: come 06:45 capped to 07:00, go 17:30 capped to 17:00 -> gross=600
9. Unpaired booking -> MISSING_GO error
10. Time window violation (late come) -> LATE_COME error
11. Core hours violation -> MISSED_CORE_START error
12. Max net work time: 11h gross capped to 8h -> warn MAX_TIME_REACHED
13. Min work time: 2h work -> BELOW_MIN_WORK_TIME error
14. Cross midnight: 22:00-02:00 -> gross=240, warn CROSS_MIDNIGHT

**Fixed break integration tests:**
15. Fixed break deduction: 08:00-17:00, fixed break 12:00-12:30 -> break=30
16. Fixed break WITH manual break: fixed=30 + manual=45 = 75 total
17. Variable break, no manual break -> auto-deduct applies
18. Variable break with manual break -> auto-deduct skipped
19. Minimum break proportional: 5:10 work, threshold 5h, minutesDifference -> break=10
20. Minimum break full: 9h work, threshold 5h, minutesDifference -> break=30 (capped)

**Rounding scope tests:**
21. RoundAllBookings=false: only first-in and last-out rounded, intermediate bookings unchanged
22. RoundAllBookings=true: all work bookings rounded
23. Default (RoundAllBookings not set) = false behavior

**Flextime/tolerance defense-in-depth:**
24. Flextime with zeroed tolerance -> no snapping occurs
25. Flextime variableWorkTime has no additional effect (both true/false identical)
26. Fixed plan ComeMinus=0 -> early arrival capped to ComeFrom + EARLY_COME error

**Capping integration tests:**
27. No capping normal day
28. Early arrival capping (15 min)
29. Late departure capping (30 min)
30. Max net time capping (120 min)
31. Variable work time within tolerance -> no capping
32. Variable work time beyond tolerance -> capping
33. Multiple capping sources simultaneously: early (15) + late (60) + max net (120) = 195

### Verification
```bash
cd apps/web && npx vitest run src/lib/calculation/__tests__/calculator.test.ts
```

**Full suite verification:**
```bash
cd apps/web && npx vitest run src/lib/calculation/__tests__/
```

**Type check:**
```bash
cd apps/web && npx tsc --noEmit
```

---

## Summary of files to create

| File | Lines (est.) | Go Source |
|------|-------------|-----------|
| `types.ts` | ~200 | `types.go`, `capping.go`, `surcharge.go` |
| `errors.ts` | ~50 | `errors.go` |
| `time.ts` | ~25 | `timeutil.go` |
| `tolerance.ts` | ~70 | `tolerance.go` |
| `rounding.ts` | ~160 | `rounding.go` |
| `breaks.ts` | ~150 | `breaks.go` |
| `capping.ts` | ~170 | `capping.go` |
| `pairing.ts` | ~200 | `pairing.go` |
| `surcharges.ts` | ~180 | `surcharge.go` |
| `calculator.ts` | ~220 | `calculator.go` |
| `index.ts` | ~30 | N/A |
| **Total source** | **~1,455** | |
| `__tests__/time.test.ts` | ~30 | |
| `__tests__/tolerance.test.ts` | ~150 | `tolerance_test.go` |
| `__tests__/rounding.test.ts` | ~350 | `rounding_test.go` |
| `__tests__/breaks.test.ts` | ~300 | `breaks_test.go` |
| `__tests__/capping.test.ts` | ~400 | `capping_test.go` |
| `__tests__/pairing.test.ts` | ~150 | `pairing_test.go` |
| `__tests__/surcharges.test.ts` | ~400 | `surcharge_test.go` |
| `__tests__/calculator.test.ts` | ~700 | `calculator_test.go` |
| **Total tests** | **~2,480** | |

## Out of scope (confirmed)

These Go modules are explicitly excluded per the ticket:
- `monthly.go` / `monthly_test.go` -- TICKET-238 (Monthly Aggregation)
- `vacation.go` / `vacation_test.go` -- separate ticket
- `carryover.go` / `carryover_test.go` -- separate ticket
- `shift.go` / `shift_test.go` -- depends on multiple day plans from DB, service-layer concern
- `travel_allowance.go` -- already ported

## Dependencies

- No new npm dependencies required
- No database dependencies
- No tRPC/Prisma dependencies
- Reuses existing `time-utils.ts` functions where applicable

## Execution order

The phases build on each other:

```
Phase 1: types.ts, errors.ts, time.ts (no deps)
    |
    v
Phase 2: tolerance.ts, rounding.ts (deps: types, errors)
    |
    v
Phase 3: breaks.ts (deps: types, errors, time)
    |
    v
Phase 4: capping.ts (deps: types)
    |
    v
Phase 5: pairing.ts (deps: types, time, errors)
    |
    v
Phase 6: surcharges.ts (deps: types, breaks.calculateOverlap)
    |
    v
Phase 7: calculator.ts, index.ts (deps: all above)
```

Each phase has its own test file and can be verified independently before proceeding.
