# ZMI-TICKET-233: Calculation Engine Pure Math Library (TypeScript)

## Research Date: 2026-03-07

## Overview

This document catalogues every pure calculation function in the Go codebase that needs to be ported to TypeScript. The Go code is split into two locations:

1. **`apps/api/internal/calculation/`** -- Pure math/logic package (NO database, NO HTTP). This is the primary port target.
2. **`apps/api/internal/service/daily_calc.go`** -- Orchestration service that calls the pure functions. Contains some helper functions that are pure (no DB) and should also be ported.
3. **`apps/api/internal/timeutil/timeutil.go`** -- Time conversion utilities.

---

## 1. Source File Inventory

### 1.1 `internal/calculation/` Package Files

| File | Lines | Purpose |
|------|-------|---------|
| `doc.go` | 30 | Package documentation |
| `types.go` | 178 | All input/output types and enums |
| `calculator.go` | 274 | Main Calculator orchestrator + processBookings + validateTimeWindows |
| `pairing.go` | 270 | Booking pairing logic (IN/OUT matching) |
| `tolerance.go` | 89 | Tolerance/grace period application + time window/core hour validation |
| `rounding.go` | 186 | Rounding logic (up/down/nearest/add/subtract, anchored variants) |
| `breaks.go` | 187 | Break deduction logic (fixed/variable/minimum) |
| `capping.go` | 212 | Window capping + max net time capping + aggregation |
| `surcharge.go` | 269 | Surcharge/bonus calculations (night/weekend/holiday) |
| `shift.go` | 270 | Shift detection (auto day plan switching) |
| `errors.go` | 62 | Error and warning code constants |
| `monthly.go` | 251 | Monthly aggregation + flextime credit types |
| `vacation.go` | 234 | Vacation entitlement + pro-rating + special calcs |
| `carryover.go` | 165 | Vacation carryover with capping rules + exceptions |
| `travel_allowance.go` | 261 | Travel allowance (local + extended) -- already ported to TS |

### 1.2 `internal/timeutil/timeutil.go`

| Function | Purpose |
|----------|---------|
| `TimeToMinutes(t time.Time) int` | Convert time to minutes from midnight |
| `MinutesToString(minutes int) string` | Format minutes as "HH:MM" |
| `ParseTimeString(s string) (int, error)` | Parse "HH:MM" to minutes |
| `MinutesToTime(date time.Time, minutes int) time.Time` | Create time from minutes on a date |
| `NormalizeCrossMidnight(start, end int) int` | If end < start, add 1440 |
| `IsValidTimeOfDay(minutes int) bool` | Check if 0-1439 |

### 1.3 Pure helpers in `daily_calc.go` (service layer)

These are stateless functions that can be ported independently:

| Function | Purpose |
|----------|---------|
| `sameDate(a, b time.Time) bool` | Compare two dates ignoring time |
| `isBreakBooking(b model.Booking) bool` | Check if booking is a break type |
| `isBreakBookingType(code string) bool` | Check if code is "P1", "P2", "BREAK_START", "BREAK_END" |
| `bookingDirection(b model.Booking) BookingDirection` | Get direction from booking type |
| `filterBookingsByDate(bookings, date)` | Filter to a specific date |
| `sortedBookings(selected map)` | Sort bookings by date/time/ID |
| `partitionBookingsByDate(bookings, date)` | Split into prev/current/next day |
| `pairWorkBookingsAcrossDays(prev, current, next)` | Cross-day pairing for day change |
| `applyDayChangeBehavior(date, behavior, bookings)` | Apply at_arrival/at_departure rules |
| `findFirstLastWorkBookings(bookings)` | Find first come / last go from bookings |
| `statusFromError(hasError bool)` | Map bool to status enum |

---

## 2. Complete Function Signatures and Business Logic

### 2.1 Types (`types.go`)

#### Enums

```
BookingDirection: "in" | "out"
BookingCategory: "work" | "break"
BreakType: "fixed" | "variable" | "minimum"
RoundingType: "none" | "up" | "down" | "nearest" | "add" | "subtract"
CreditType: "no_evaluation" | "complete_carryover" | "after_threshold" | "no_carryover"
ShiftMatchType: "none" | "arrival" | "departure" | "both"
CappingSource: "early_arrival" | "late_leave" | "max_net_time"
VacationBasis: "calendar_year" | "entry_date"
SpecialCalcType: "age" | "tenure" | "disability"
```

#### Input Types

**BookingInput**: `{ ID: uuid, Time: int (0-1439), Direction, Category, PairID?: uuid }`

**BreakConfig**: `{ Type, StartTime?: int, EndTime?: int, Duration: int, AfterWorkMinutes?: int, AutoDeduct: bool, IsPaid: bool, MinutesDifference: bool }`

**RoundingConfig**: `{ Type, Interval: int, AddValue: int, AnchorTime?: int }`

**ToleranceConfig**: `{ ComePlus: int, ComeMinus: int, GoPlus: int, GoMinus: int }`

**DayPlanInput**: `{ PlanType, ComeFrom?: int, ComeTo?: int, GoFrom?: int, GoTo?: int, CoreStart?: int, CoreEnd?: int, RegularHours: int, Tolerance, RoundingCome?: RoundingConfig, RoundingGo?: RoundingConfig, Breaks: BreakConfig[], MinWorkTime?: int, MaxNetWorkTime?: int, VariableWorkTime: bool, RoundAllBookings: bool, RoundRelativeToPlan: bool }`

**CalculationInput**: `{ EmployeeID: uuid, Date: Date, Bookings: BookingInput[], DayPlan: DayPlanInput }`

#### Output Types

**BookingPair**: `{ InBooking?: BookingInput, OutBooking?: BookingInput, Category, Duration: int }`

**CalculationResult**: `{ GrossTime, NetTime, TargetTime, Overtime, Undertime, BreakTime: int, FirstCome?: int, LastGo?: int, BookingCount: int, CalculatedTimes: Map<uuid, int>, Pairs: BookingPair[], UnpairedInIDs: uuid[], UnpairedOutIDs: uuid[], CappedTime: int, Capping: CappingResult, HasError: bool, ErrorCodes: string[], Warnings: string[] }`

**CappedTime**: `{ Minutes: int, Source: CappingSource, Reason: string }`

**CappingResult**: `{ TotalCapped: int, Items: CappedTime[] }`

### 2.2 Calculator (`calculator.go`)

#### `Calculator.Calculate(input: CalculationInput): CalculationResult`

Main orchestrator. Steps:
1. Initialize result with TargetTime = DayPlan.RegularHours
2. If no bookings: error NO_BOOKINGS, return
3. **processBookings**: Apply rounding, tolerance, window capping to each booking
4. **PairBookings**: Pair IN/OUT bookings by category
5. Record unpaired IDs as errors (MISSING_GO, MISSING_COME)
6. **FindFirstCome / FindLastGo** from pre-capped times (validation bookings)
7. **validateTimeWindows**: Check firstCome/lastGo against come/go windows
8. **ValidateCoreHours**: Check core hours coverage
9. **CalculateGrossTime**: Sum work pair durations
10. **CalculateBreakDeduction**: Compute break deduction from configs + recorded
11. Calculate uncapped net = gross - breaks (min 0)
12. **ApplyCapping**: Apply MaxNetWorkTime cap
13. **AggregateCapping**: Combine window capping + max net capping items
14. Validate MinWorkTime
15. **CalculateOvertimeUndertime**: max(0, net-target) and max(0, target-net)
16. Set HasError if any error codes

#### `Calculator.processBookings(bookings, dayPlan, result) -> (processed, validation, cappingItems)`

Per-booking processing:
- **Work IN bookings**: Apply ComeTolerance (using ComeFrom), then RoundCome (first-in only unless RoundAllBookings), then WindowCapping
- **Work OUT bookings**: Apply GoTolerance (using GoTo fallback GoFrom), then RoundGo (last-out only unless RoundAllBookings), then WindowCapping
- **Relative rounding**: When `RoundRelativeToPlan`, set AnchorTime on rounding configs to ComeFrom/GoFrom
- `validation` array preserves pre-capped times for FirstCome/LastGo detection
- `processed` array has final capped times

### 2.3 Pairing (`pairing.go`)

#### `PairBookings(bookings: BookingInput[]): PairingResult`

Separates by category (work/break), pairs each independently.

#### `pairByCategory(bookings, category) -> (pairs, unpairedIn, unpairedOut, warnings)`

1. Split into in/out lists, sort by time
2. **First pass**: Pair by existing PairID
3. **Second pass (work)**: Match unpaired IN with next chronological OUT (OUT.Time >= IN.Time)
4. **Third pass (work)**: Handle cross-midnight (IN.Time > OUT.Time)
5. **Break pairing**: OUT (break start) paired with next IN (break end)

#### Duration calculation:
- **Work pairs**: `outTime - inTime` (with NormalizeCrossMidnight)
- **Break pairs**: `inTime - outTime` (with NormalizeCrossMidnight, reversed)

#### `CalculateGrossTime(pairs) -> int`
Sum of durations for work pairs only.

#### `CalculateBreakTime(pairs) -> int`
Sum of durations for break pairs only.

#### `FindFirstCome(bookings) -> int | null`
Earliest time among work IN bookings.

#### `FindLastGo(bookings) -> int | null`
Latest time among work OUT bookings.

### 2.4 Tolerance (`tolerance.go`)

#### `ApplyComeTolerance(actualTime, expectedTime?, tolerance) -> int`

- If expectedTime is null, return actualTime
- Late arrival: if `actualTime > exp && actualTime <= exp + ComePlus` -> snap to exp
- Early arrival: if `actualTime < exp && actualTime >= exp - ComeMinus` -> snap to exp
- Otherwise: return actualTime unchanged

**Business rule**: ComePlus forgives late arrivals (employee arrives 2 min late, tolerance is 5 min, they get credit as if on time). ComeMinus forgives early arrivals (similar snap behavior).

#### `ApplyGoTolerance(actualTime, expectedTime?, tolerance) -> int`

- Early departure: if `actualTime < exp && actualTime >= exp - GoMinus` -> snap to exp
- Late departure: if `actualTime > exp && actualTime <= exp + GoPlus` -> snap to exp

#### `ValidateTimeWindow(actualTime, from?, to?, earlyCode, lateCode) -> string[]`

Returns error codes if actualTime is outside the [from, to] window.

#### `ValidateCoreHours(firstCome?, lastGo?, coreStart?, coreEnd?) -> string[]`

- If core hours not defined, skip
- If firstCome missing or > coreStart: MISSED_CORE_START
- If lastGo missing or < coreEnd: MISSED_CORE_END

### 2.5 Rounding (`rounding.go`)

#### `RoundTime(minutes, config?) -> int`

Dispatches to the appropriate rounding function:

| Type | Behavior |
|------|----------|
| `none` | No change |
| `up` | Round up to next interval (e.g., 7 round up by 5 -> 10) |
| `down` | Round down to previous interval (e.g., 7 round down by 5 -> 5) |
| `nearest` | Round to nearest interval (e.g., 7 nearest 5 -> 5, 8 nearest 5 -> 10) |
| `add` | Add fixed value (walk time compensation) |
| `subtract` | Subtract fixed value (shower time), floor at 0 |

**Anchored rounding** (when `AnchorTime` is set):
- Shifts time relative to anchor, rounds, shifts back
- Creates a grid centered on anchor: e.g., anchor=423 (7:03), interval=5 -> grid: 418, 423, 428, 433...
- Handles negative offsets correctly (Go's % can be negative)

#### `roundUpOffset(offset, interval) -> int`
Handles negative offsets: e.g., offset=-3, interval=5, remainder=-3 -> result=0

#### `roundDownOffset(offset, interval) -> int`
Handles negative offsets: e.g., offset=-3, interval=5 -> result=-5

#### `roundNearestOffset(offset, interval) -> int`
For nearest: round toward zero for small remainders, away from zero for large remainders.

#### `RoundComeTime / RoundGoTime` -- both delegate to `RoundTime`

### 2.6 Breaks (`breaks.go`)

#### `CalculateBreakDeduction(pairs, recordedBreakTime, grossWorkTime, breakConfigs) -> BreakDeductionResult`

Three break types handled differently per ZMI specification:

| Type | Behavior |
|------|----------|
| `fixed` | ALWAYS deducted based on overlap with time window. Ignores manual bookings. |
| `variable` | Only deducted if no manual break was recorded AND AutoDeduct AND threshold met |
| `minimum` | After work threshold, with optional proportional deduction (MinutesDifference) |

Additional rules:
- If no break configs: use recorded break time directly
- If recorded breaks exist: add them to total (in addition to fixed breaks), warn MANUAL_BREAK
- If no recorded breaks but deductions applied: warn NO_BREAK_RECORDED

#### `CalculateOverlap(start1, end1, start2, end2) -> int`

Returns overlap in minutes between two ranges. Standard interval overlap formula.

#### `DeductFixedBreak(pairs, cfg) -> int`

Sums overlap of each work pair with the break window [StartTime, EndTime]. Returns min(totalOverlap, cfg.Duration).

#### `CalculateMinimumBreak(grossWorkTime, cfg) -> int`

- If no threshold or below threshold: return 0
- If `MinutesDifference` (proportional): deduct `min(grossWorkTime - threshold, duration)`
- Otherwise: full duration

**Business rule (German labor law)**: After 6 hours of work, 30 min break required. After 9 hours, 45 min. MinutesDifference handles the edge case where someone works 6:10 -- only 10 min is deducted proportionally instead of the full 30 min.

#### `CalculateNetTime(grossTime, breakTime, maxNetWorkTime?) -> (netTime, warnings)`

Net = gross - breaks (floor at 0). Cap at MaxNetWorkTime.

#### `CalculateOvertimeUndertime(netTime, targetTime) -> (overtime, undertime)`

- If net > target: overtime = net - target, undertime = 0
- If net < target: overtime = 0, undertime = target - net

### 2.7 Capping (`capping.go`)

#### `ApplyWindowCapping(bookingTime, windowStart?, windowEnd?, toleranceMinus, tolerancePlus, isArrival, variableWorkTime) -> (adjustedTime, capped)`

For arrivals: if bookingTime < effectiveStart (= windowStart - toleranceMinus when variableWorkTime), cap to effectiveStart.
For departures: if bookingTime > effectiveEnd (= windowEnd + tolerancePlus), cap to effectiveEnd.

**Business rule**: Evaluation window limits how early/late an employee can be credited. variableWorkTime extends the window by toleranceMinus for arrivals.

#### `ApplyCapping(netWorkTime, maxNetWorkTime?) -> (adjustedNet, capped)`

If net exceeds max, cap it.

#### `CalculateEarlyArrivalCapping / CalculateLateDepatureCapping / CalculateMaxNetTimeCapping`

Individual capping calculators that return `CappedTime | null`.

#### `AggregateCapping(items...) -> CappingResult`

Combines multiple CappedTime items, summing TotalCapped.

### 2.8 Surcharges (`surcharge.go`)

#### `CalculateSurcharges(workPeriods, configs, isHoliday, holidayCategory, netWorkTime) -> SurchargeCalculationResult`

For each config:
1. Check if applies today (holiday vs workday, category filter)
2. Check minimum work time gate
3. Calculate overlap between work periods and surcharge window
4. Apply calculation type:
   - `per_minute` (default): bonusMinutes = overlapMinutes
   - `fixed`: bonusMinutes = config.ValueMinutes (flat)
   - `percentage`: bonusMinutes = overlapMinutes * config.ValueMinutes / 100

**Business rule**: Night surcharges (e.g., 22:00-06:00) apply only on workdays. Holiday surcharges only on holidays of matching category.

#### `SplitOvernightSurcharge(config) -> SurchargeConfig[]`

Splits a config that spans midnight (TimeFrom >= TimeTo) into two:
- Evening: [TimeFrom, 1440]
- Morning: [0, TimeTo]

**Business rule (ZMI)**: Surcharges must not span midnight. They must be entered as two separate windows.

#### `ValidateSurchargeConfig(config) -> string[]`

Validates bounds and no overnight spans.

#### `surchargeApplies(config, isHoliday, holidayCategory) -> bool`

Checks holiday/workday applicability and category filter.

#### `ExtractWorkPeriods(pairs) -> TimePeriod[]`

Extracts start/end from complete work pairs.

#### `ConvertBonusesToSurchargeConfigs(bonuses: DayPlanBonus[]) -> SurchargeConfig[]`

Maps model bonuses to calculation configs. AppliesOnHoliday flag is inverted for workday applicability.

#### `GetHolidayCategoryFromFlag(isHalfDay) -> int`

Compatibility shim: half day = 2, full day = 1.

### 2.9 Shift Detection (`shift.go`)

#### `ShiftDetector.DetectShift(assignedPlan, firstArrival?, lastDeparture?) -> ShiftDetectionResult`

1. No plan or no detection configured: return original plan
2. Check if assigned plan's windows match booking times
3. If no match: search up to 6 alternative plans
4. If still no match: return error NO_MATCHING_SHIFT

#### `matchesPlan(input, firstArrival?, lastDeparture?) -> ShiftMatchType`

- If both arrival and departure windows configured: both must match
- If only arrival: just arrival must match
- If only departure: just departure must match

#### `isInTimeWindow(time, from?, to?) -> bool`

Standard range check: `time >= from && time <= to`

#### `ValidateShiftDetectionConfig(input) -> string[]`

Validates that windows are properly paired and within bounds.

### 2.10 Monthly Aggregation (`monthly.go`)

#### `CalculateMonth(input: MonthlyCalcInput) -> MonthlyCalcOutput`

1. Sum all daily values (GrossTime, NetTime, TargetTime, Overtime, Undertime, BreakTime)
2. Count work days and error days
3. FlextimeChange = TotalOvertime - TotalUndertime
4. FlextimeRaw = FlextimeStart + FlextimeChange
5. Apply credit type rules via `applyCreditType`

#### `applyCreditType(output, rules) -> MonthlyCalcOutput`

Four ZMI credit types:

| Type | Behavior |
|------|----------|
| `no_evaluation` | Direct transfer 1:1 |
| `complete_carryover` | Monthly cap, then positive/negative balance caps |
| `after_threshold` | Only credit overtime exceeding threshold; undertime always fully deducted |
| `no_carryover` | Reset to zero each month |

#### `applyFlextimeCaps(flextime, capPositive?, capNegative?) -> (capped, forfeited)`

Caps balance at positive cap and floors at -capNegative.

#### `CalculateAnnualCarryover(currentBalance?, annualFloor?) -> int`

Year-end carryover with annual floor.

### 2.11 Vacation (`vacation.go`)

#### `CalculateVacation(input: VacationCalcInput) -> VacationCalcOutput`

1. Calculate age and tenure at reference date
2. Count months employed in year (pro-rating)
3. Pro-rate base entitlement by months/12
4. Part-time adjustment: multiply by weeklyHours/standardWeeklyHours
5. Apply special calcs (age bonus, tenure bonus, disability bonus)
6. Sum total and round to nearest 0.5 day

#### `calculateAge(birthDate, referenceDate) -> int`

Full years of age at reference date.

#### `calculateTenure(entryDate, referenceDate) -> int`

Full years of service at reference date.

#### `calculateMonthsEmployedInYear(entryDate, exitDate?, year, basis) -> int`

Months employed within the vacation year (calendar or entry-date-based). Partial months count as full.

#### `roundToHalfDay(d: Decimal) -> Decimal`

Rounds to nearest 0.5 (multiply by 2, round, divide by 2).

#### `CalculateCarryover(available, maxCarryover: Decimal) -> Decimal`

Simple max carryover cap. Zero or negative max = no limit.

#### `CalculateVacationDeduction(deductionValue, durationDays: Decimal) -> Decimal`

Simple multiplication.

### 2.12 Carryover with Capping Rules (`carryover.go`)

#### `CalculateCarryoverWithCapping(input: CarryoverInput) -> CarryoverOutput`

Applies capping rules in order with exception handling:
- **year_end rules**: Cap total carryover at CapValue
- **mid_year rules**: Forfeit remaining if reference date > cutoff date in next year
- **Exceptions**: "full" = exempt from rule, "partial" = retain up to RetainDays

### 2.13 Error and Warning Codes (`errors.go`)

**Error Codes:**
- `MISSING_COME` / `MISSING_GO` - Unpaired bookings
- `EARLY_COME` / `LATE_COME` / `EARLY_GO` / `LATE_GO` - Time window violations
- `MISSED_CORE_START` / `MISSED_CORE_END` - Core hours violations
- `BELOW_MIN_WORK_TIME` - Below minimum
- `NO_BOOKINGS` - No bookings
- `INVALID_TIME` / `DUPLICATE_IN_TIME` - Data errors
- `NO_MATCHING_SHIFT` - Shift detection failure

**Warning Codes:**
- `CROSS_MIDNIGHT` - Shift spans midnight
- `MAX_TIME_REACHED` - NetTime capped
- `MANUAL_BREAK` / `NO_BREAK_RECORDED` / `SHORT_BREAK` / `AUTO_BREAK_APPLIED` - Break warnings
- `MONTHLY_CAP_REACHED` / `FLEXTIME_CAPPED` / `BELOW_THRESHOLD` / `NO_CARRYOVER` - Monthly warnings

---

## 3. Data Types Used from Model Layer

### 3.1 DayPlan (`model/dayplan.go`)

Key fields: PlanType (fixed/flextime), ComeFrom/ComeTo/GoFrom/GoTo (minutes), CoreStart/CoreEnd, RegularHours, RegularHours2, FromEmployeeMaster, tolerance fields, rounding fields, break configs, bonus configs, holiday credits (cat1/2/3), NoBookingBehavior, DayChangeBehavior, shift detection fields, NetAccountID, CapAccountID, MaxNetWorkTime, MinWorkTime, VariableWorkTime, RoundAllBookings.

Methods: `GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes?)`, `GetHolidayCredit(category)`, `HasShiftDetection()`, `GetAlternativePlanIDs()`.

### 3.2 DayPlanBreak (`model/dayplan.go`)

Fields: BreakType (fixed/variable/minimum), StartTime?, EndTime?, Duration, AfterWorkMinutes?, AutoDeduct, IsPaid, MinutesDifference, SortOrder.

### 3.3 DayPlanBonus (`model/dayplan.go`)

Fields: AccountID, TimeFrom, TimeTo, CalculationType (fixed/per_minute/percentage), ValueMinutes, MinWorkMinutes?, AppliesOnHoliday.

### 3.4 Booking (`model/booking.go`)

Fields: ID, EmployeeID, BookingDate, BookingTypeID, OriginalTime, EditedTime, CalculatedTime?, PairID?, Source, Notes.
Methods: `EffectiveTime()` (returns CalculatedTime if set, else EditedTime).

### 3.5 DailyValue (`model/dailyvalue.go`)

Fields: EmployeeID, ValueDate, Status, GrossTime, NetTime, TargetTime, Overtime, Undertime, BreakTime, HasError, ErrorCodes[], Warnings[], FirstCome?, LastGo?, BookingCount, CalculatedAt, CalculationVersion.
Status enum: "pending", "calculated", "error", "approved".

### 3.6 DailyAccountValue (`model/daily_account_value.go`)

Fields: EmployeeID, AccountID, ValueDate, ValueMinutes, Source, DayPlanID?.
Source enum: "net_time", "capped_time", "surcharge".

### 3.7 AbsenceDay / AbsenceType

AbsenceDay: Duration (decimal 0.5/1.0), HalfDayPeriod?, Status.
AbsenceType: Portion (0=none/1=full/2=half), Priority, CreditMultiplier() method.
AbsenceDay.CalculateCredit(regelarbeitszeit): `regelarbeitszeit * multiplier * duration`.

### 3.8 Enums from Model

- `PlanType`: "fixed", "flextime"
- `NoBookingBehavior`: "error", "deduct_target", "adopt_target", "vocational_school", "target_with_order"
- `DayChangeBehavior`: "none", "at_arrival", "at_departure", "auto_complete"
- `BookingDirection`: "in", "out"

---

## 4. TypeScript Project Setup and Conventions

### 4.1 Package Manager and Framework

- **Package manager**: pnpm
- **Frontend**: Next.js 16 with React 19
- **TypeScript**: 5.7+ with strict mode
- **Module**: ESNext with bundler resolution
- **Target**: ES2022
- **Strict options enabled**: `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- **Path alias**: `@/*` -> `./src/*`

### 4.2 Test Framework

- **Framework**: Vitest 4.x
- **Config file**: `apps/web/vitest.config.ts`
- **Test location pattern**: `src/**/__tests__/**/*.test.ts`
- **Globals**: enabled (describe, it, expect available without import)
- **Environment**: node
- **Path alias**: `@` -> `./src`

### 4.3 Existing Calculation Code Pattern

The project already has one ported calculation module:
- **Source**: `apps/web/src/lib/calculation/travel-allowance.ts`
- **Tests**: `apps/web/src/lib/__tests__/travel-allowance-calculation.test.ts`

Conventions observed:
- Pure functions exported individually (no classes)
- Interfaces defined in same file as functions
- `export interface` for all types
- `export function` for all public functions
- camelCase for functions and properties
- `null` (not undefined) for optional nullable values in interfaces
- `number` type for all numeric values (minutes, days)
- JSDoc comments with `@example` and `@param` annotations
- File header comment explaining the module's purpose
- Tests use `describe`/`it`/`expect` from vitest globals
- Test file imports types and functions explicitly
- Tests organized in `describe` blocks per function

### 4.4 Existing Time Utilities

`apps/web/src/lib/time-utils.ts` already has:
- `formatMinutes(minutes: number): string` - HH:MM
- `formatDuration(minutes: number): string` - "8h 30m"
- `formatBalance(minutes: number): string` - "+0:30"
- `formatTime(minutesSinceMidnight: number): string` - "08:30"
- `timeStringToMinutes(time: string): number` - "08:30" -> 510
- `isSameDay(date1, date2): boolean`
- `isWeekend(date): boolean`
- Various date formatting and range utilities

### 4.5 Key Dependencies Available

- **zod**: v4.3.6 - Available for runtime validation
- **date-fns**: v4.1.0 - Available for date arithmetic
- **uuid**: v13.0.0 - Available for UUID handling
- No decimal library currently installed (Go uses `shopspring/decimal`; for vacation/carryover calculations that use Decimal types, we'll need to decide on an approach)

---

## 5. Business Rules Summary (German Labor Law / ZMI)

### 5.1 Break Rules
- **German law**: 30-minute break after 6 hours, 45-minute break after 9 hours
- **Fixed breaks**: Always deducted when work overlaps the break window, regardless of manual booking
- **Variable breaks**: Only auto-deducted when no manual break was recorded
- **Minimum breaks**: Triggered after work threshold, with optional proportional deduction (MinutesDifference)

### 5.2 Tolerance (Grace Periods)
- **ComePlus**: Forgives late arrivals up to N minutes
- **ComeMinus**: Forgives early arrivals up to N minutes (only for fixed plans with VariableWorkTime or flextime)
- **GoPlus**: Forgives late departures up to N minutes (extends evaluation window)
- **GoMinus**: Forgives early departures up to N minutes

### 5.3 Plan Type Overrides
- **Flextime**: Ignores ComePlus and GoMinus tolerances; VariableWorkTime not applicable
- **Fixed (without VariableWorkTime)**: ComeMinus is zeroed out

### 5.4 Rounding Relative to Plan (ZMI Section 7.8)
- When enabled, rounding grid is anchored at ComeFrom/GoFrom instead of midnight 00:00
- Example: ComeFrom=7:03, interval=5 -> grid: 6:58, 7:03, 7:08, 7:13...

### 5.5 Evaluation Window Capping
- Arrivals before ComeFrom (minus ComeMinus if VariableWorkTime) are capped
- Departures after GoTo (plus GoPlus) are capped
- Capped minutes are tracked separately for account posting

### 5.6 Day Change Behavior
- **at_arrival**: Night shift bookings assigned to the arrival day
- **at_departure**: Night shift bookings assigned to the departure day
- **auto_complete**: System auto-creates go/come bookings at midnight for next day

### 5.7 No-Booking Behavior
- **error**: Mark as error (default)
- **adopt_target**: Credit target time as if worked
- **deduct_target**: Full undertime
- **vocational_school**: Auto-create absence for past dates
- **target_with_order**: Credit target + create order booking

### 5.8 Holiday Credits
- Three categories (1=full, 2=half, 3=custom)
- Each category has its own credit value per day plan
- Absence with priority > 0 overrides holiday credit

### 5.9 Monthly Flextime Credit Types
- **no_evaluation**: Direct 1:1 transfer
- **complete_carryover**: Monthly and balance caps
- **after_threshold**: Only credit overtime above threshold
- **no_carryover**: Reset to zero

### 5.10 Vacation Entitlement
- Pro-rating by months employed (partial months = full)
- Part-time adjustment by weekly hours ratio
- Special bonuses: age-based, tenure-based, disability-based
- Rounded to nearest 0.5 day

### 5.11 Surcharges
- Night surcharges (workday only)
- Holiday surcharges (holiday only, with category filter)
- Must be split at midnight (no overnight spans)
- Three calculation types: per_minute, fixed, percentage
- Minimum work time gate (optional)

---

## 6. What Has Already Been Ported

The **travel allowance** calculation is already fully ported:
- Go: `apps/api/internal/calculation/travel_allowance.go` (261 lines)
- TypeScript: `apps/web/src/lib/calculation/travel-allowance.ts` (280 lines)
- Tests: `apps/web/src/lib/__tests__/travel-allowance-calculation.test.ts` (363 lines)

This module does NOT need to be ported again.

---

## 7. Files to Create (Recommended Structure)

Based on the Go package structure and existing TS conventions:

```
apps/web/src/lib/calculation/
  types.ts                    -- All input/output types and enums
  errors.ts                   -- Error and warning code constants
  timeutil.ts                 -- Time conversion utilities (NormalizeCrossMidnight, etc.)
  pairing.ts                  -- Booking pairing logic
  tolerance.ts                -- Tolerance/grace period application
  rounding.ts                 -- Rounding logic
  breaks.ts                   -- Break deduction logic
  capping.ts                  -- Window/max net time capping
  calculator.ts               -- Main Calculator orchestrator
  surcharge.ts                -- Surcharge calculations
  shift.ts                    -- Shift detection
  monthly.ts                  -- Monthly aggregation
  vacation.ts                 -- Vacation entitlement
  carryover.ts                -- Vacation carryover with capping
  index.ts                    -- Public API barrel export
  travel-allowance.ts         -- (already exists)

apps/web/src/lib/__tests__/
  calculation-pairing.test.ts
  calculation-tolerance.test.ts
  calculation-rounding.test.ts
  calculation-breaks.test.ts
  calculation-capping.test.ts
  calculation-calculator.test.ts
  calculation-surcharge.test.ts
  calculation-shift.test.ts
  calculation-monthly.test.ts
  calculation-vacation.test.ts
  calculation-carryover.test.ts
  travel-allowance-calculation.test.ts  -- (already exists)
```

---

## 8. Notes for Implementation

1. **All times are integers in minutes from midnight (0-1439)**. No Date objects needed for time-of-day. Durations are also integer minutes.

2. **UUID handling**: The Go code uses `uuid.UUID` extensively. In TypeScript, use `string` type for UUIDs since the calculation layer doesn't generate or validate them -- it just passes them through.

3. **Decimal handling**: The vacation and carryover modules use `shopspring/decimal` for precise decimal arithmetic. Options:
   - Use plain `number` with careful rounding (simpler, adequate for 0.5-day precision)
   - Use a decimal library like `decimal.js` (more faithful to Go behavior)
   - The existing TS travel-allowance port uses plain `number` -- follow that convention.

4. **No database dependencies**: The entire calculation package is pure math. No Prisma, no tRPC, no fetch calls.

5. **Null vs undefined**: Go uses pointer types (`*int`) for optional values. The existing TS code uses `| null` consistently. Follow that convention.

6. **Test coverage**: The Go package has comprehensive tests (`*_test.go` files). Port the test cases along with the functions.

7. **Already-existing helpers**: `time-utils.ts` already has `timeStringToMinutes`, `formatMinutes`, `isSameDay`, `isWeekend` which overlap with some Go timeutil functions. Reuse where possible.
