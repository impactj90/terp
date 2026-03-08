# Research: ZMI-TICKET-234 - DailyCalcService Port (Go -> TS)

Date: 2026-03-08

## 1. Go Source Files Analysis

### 1.1 `apps/api/internal/service/daily_calc.go` (1,251 lines)

#### Service Struct & Dependencies

The `DailyCalcService` struct has 13 dependencies, injected via constructor and setter methods:

```go
type DailyCalcService struct {
    bookingRepo         bookingRepository
    empDayPlanRepo      employeeDayPlanRepository
    dayPlanRepo         dayPlanLookup
    dailyValueRepo      dailyValueRepository
    holidayRepo         holidayLookup
    employeeRepo        employeeLookup
    absenceDayRepo      absenceDayLookup
    absenceDayCreator   absenceDayAutoCreator
    calc                *calculation.Calculator
    notificationSvc     *NotificationService
    orderBookingSvc     orderBookingCreator
    settingsLookup      settingsLookup
    dailyAccountValRepo dailyAccountValueWriter
}
```

**Constructor** (`NewDailyCalcService`) takes 7 required repos. 6 more are set via setter methods:
- `SetNotificationService()`
- `SetOrderBookingService()`
- `SetSettingsLookup()`
- `SetDailyAccountValueRepo()`
- `SetAbsenceDayCreator()`

#### Repository Interfaces (defined locally in daily_calc.go)

| Interface | Methods |
|---|---|
| `bookingRepository` | `GetByEmployeeAndDate`, `GetByEmployeeAndDateRange`, `UpdateCalculatedTimes`, `Create` |
| `employeeDayPlanRepository` | `GetForEmployeeDate` |
| `dayPlanLookup` | `GetByID`, `GetWithDetails` |
| `dailyValueRepository` | `Upsert`, `GetByEmployeeDate` |
| `holidayLookup` | `GetByDate` |
| `employeeLookup` | `GetByID` |
| `absenceDayLookup` | `GetByEmployeeDate` |
| `absenceDayAutoCreator` | `CreateAutoAbsenceByCode` |
| `orderBookingCreator` | `CreateAutoBooking`, `DeleteAutoBookingsByDate` |
| `settingsLookup` | `IsRoundingRelativeToPlan` |
| `dailyAccountValueWriter` | `Upsert`, `DeleteByEmployeeDate`, `DeleteByEmployeeDateAndSource` |

#### Public Methods

1. **`CalculateDay(ctx, tenantID, employeeID, date) (*DailyValue, error)`** -- Main entry point
2. **`RecalculateRange(ctx, tenantID, employeeID, from, to) (int, error)`** -- Iterates day-by-day calling CalculateDay

#### `CalculateDay` Flow (lines 176-249)

1. **Holiday check**: `holidayRepo.GetByDate(tenantID, date)` -> `isHoliday` bool, `holidayCategory` int
2. **Day plan loading**: `empDayPlanRepo.GetForEmployeeDate(employeeID, date)` -> may return nil (off day)
3. **Booking loading**: `loadBookingsForCalculation()` -- handles day change behavior
4. **Branching logic** (4 paths):
   - `empDayPlan == nil || empDayPlan.DayPlanID == nil` -> `handleOffDay()`
   - `isHoliday && len(bookings) == 0` -> check absence priority, then either `handleAbsenceCredit()` or `handleHolidayCredit()`
   - `len(bookings) == 0` -> `handleNoBookings()`
   - else -> `calculateWithBookings()`
5. **Get previous value** for error notification comparison
6. **Upsert DailyValue** via `dailyValueRepo.Upsert()`
7. **Post daily account values** (net/cap) via `postDailyAccountValues()`
8. **Post surcharge values** via `postSurchargeValues()`
9. **Notify on new errors** via `notifyDailyCalcError()`

### 1.2 Private Methods -- Detailed Analysis

#### `resolveTargetHours(ctx, employeeID, date, dp *DayPlan) int` (lines 151-172)

ZMI priority chain for target hours:
1. If `dp.FromEmployeeMaster` is true, look up `employee.DailyTargetHours` (converts Decimal to minutes)
2. If date is an approved absence day, use `dp.RegularHours2`
3. Default: `dp.RegularHours`

Calls: `employeeRepo.GetByID()`, `absenceDayRepo.GetByEmployeeDate()`

#### `loadBookingsForCalculation(ctx, tenantID, employeeID, date, empDayPlan)` (lines 396-426)

- If no day plan or no day change behavior -> simple `GetByEmployeeAndDate`
- If day change behavior is set:
  - Loads bookings for date-1 to date+1 (3-day range)
  - Switches on behavior:
    - `at_arrival` / `at_departure` -> `applyDayChangeBehavior()` (pure function)
    - `auto_complete` -> `applyAutoCompleteDayChange()` (creates bookings)
    - default -> `filterBookingsByDate()`

#### `handleOffDay(employeeID, date, bookings) *DailyValue` (lines 428-446)

- Creates DailyValue with status=calculated, targetTime=0
- Warnings: ["OFF_DAY"]
- If bookings exist on off day: adds "BOOKINGS_ON_OFF_DAY" warning, sets bookingCount

#### `handleHolidayCredit(ctx, employeeID, date, empDayPlan, holidayCategory) *DailyValue` (lines 448-484)

- Resolves target hours via `resolveTargetHours()`
- Gets holiday credit from `dayPlan.GetHolidayCredit(category)` (switch on category 1/2/3 -> holidayCreditCat1/2/3)
- Sets NetTime=GrossTime=credit; calculates Undertime if credit < target
- Warnings: ["HOLIDAY"]

#### `handleAbsenceCredit(ctx, employeeID, date, empDayPlan, absence) *DailyValue` (lines 488-519)

- Used when holiday + approved absence with priority > 0
- Resolves target hours
- `absence.CalculateCredit(targetTime)` = `regelarbeitszeit * absenceType.CreditMultiplier() * duration`
- NetTime=GrossTime=credit; Undertime if credit < target
- Warnings: ["ABSENCE_ON_HOLIDAY"]

#### `handleNoBookings(ctx, employeeID, date, empDayPlan) (*DailyValue, error)` (lines 521-653)

Switches on `dayPlan.NoBookingBehavior`:

| Behavior | Action | Warnings |
|---|---|---|
| `adopt_target` | Credit target time as worked | ["NO_BOOKINGS_CREDITED"] |
| `deduct_target` | NetTime=0, Undertime=target | ["NO_BOOKINGS_DEDUCTED"] |
| `vocational_school` | Credit target + auto-create absence (code "SB") for past dates | ["VOCATIONAL_SCHOOL", ...] |
| `target_with_order` | Credit target + create auto order booking via employee.DefaultOrderID | ["NO_BOOKINGS_CREDITED", ...] |
| `error` (default) | Status=error, HasError=true | ErrorCodes: ["NO_BOOKINGS"] |

Note: Returns `(nil, nil)` is NOT in the code -- only "error" returns nil DailyValue indirectly via skip behavior (not actually present in current code; the `handleNoBookings` always returns a DailyValue or error).

Wait -- actually re-reading: "skip" behavior would make `handleNoBookings` return `(nil, nil)`, but looking at the code, no current behavior does this. The "skip" path is checked in `CalculateDay` at line 220-222: `if dailyValue == nil { return nil, nil }`. So `handleNoBookings` can return nil DailyValue to signal "skip".

Actually reviewing again: the current code does not have a "skip" NoBookingBehavior. All 5 behaviors return a DailyValue. The nil check at line 220 is defensive.

#### `calculateWithBookings(ctx, tenantID, employeeID, date, empDayPlan, bookings, isHoliday)` (lines 998-1068)

1. **Shift detection**: If `dayPlan.HasShiftDetection()`:
   - Find first come/last go from bookings
   - Create `shiftDetectionLoader` with caching
   - Run `detector.DetectShift()`
   - If shifted to different plan, reload the day plan and replace `empDayPlan`
2. **Build calculation input**: `buildCalcInput()` -- converts Go models to `calculation.CalculationInput`
3. **Run calculation**: `s.calc.Calculate(input)` -> `CalculationResult`
4. **Merge shift detection errors** into result
5. **Add holiday warning** if applicable
6. **Convert result** to DailyValue via `resultToDailyValue()`
7. **Update booking calculated times** via `bookingRepo.UpdateCalculatedTimes()`

#### `buildCalcInput(ctx, tenantID, employeeID, date, empDayPlan, bookings) CalculationInput` (lines 1070-1207)

The biggest mapping function. Converts:
- DayPlan -> `calculation.DayPlanInput`:
  - Plan type-specific tolerance adjustments (flextime ignores ComePlus/GoMinus, fixed without variableWorkTime ignores ComeMinus)
  - Resolves target hours via priority chain
  - Checks `settingsLookup.IsRoundingRelativeToPlan()`
  - Maps rounding configs (come/go) with type, interval, addValue
  - Maps breaks from `dp.Breaks` to `calculation.BreakConfig`
- Bookings -> `[]calculation.BookingInput`:
  - Determines category (work/break) from BookingType.Code (P1/P2/BREAK_START/BREAK_END = break)
  - Determines direction (in/out) from BookingType.Direction
  - Uses `b.EffectiveTime()` (calculated_time if set, else edited_time)

#### `resultToDailyValue(employeeID, date, result) *DailyValue` (lines 1209-1230)

Direct field mapping from `CalculationResult` to `DailyValue`. Sets `CalculationVersion = 1`.

#### `postDailyAccountValues(ctx, tenantID, employeeID, date, empDayPlan, dailyValue)` (lines 282-337)

- If no day plan, deletes all previous postings for the date
- If `dayPlan.NetAccountID` is set: upserts DailyAccountValue with source="net_time", value=dailyValue.NetTime
- If `dayPlan.CapAccountID` and `dayPlan.MaxNetWorkTime` are set: calculates capped minutes (grossTime - maxNetWorkTime if positive), upserts with source="capped_time"

#### `postSurchargeValues(ctx, tenantID, employeeID, date, empDayPlan, dailyValue, pairs, isHoliday, holidayCategory)` (lines 339-394)

1. Deletes old surcharge postings (`source="surcharge"`)
2. If no day plan or no bonuses, return
3. Converts `dayPlan.Bonuses` to `SurchargeConfig` via `ConvertBonusesToSurchargeConfigs()`
4. Splits overnight surcharges via `SplitOvernightSurcharge()`
5. Extracts work periods from pairs via `ExtractWorkPeriods()`
6. Calls `CalculateSurcharges(workPeriods, configs, isHoliday, holidayCategory, dailyValue.NetTime)`
7. Upserts each surcharge result as DailyAccountValue with source="surcharge"

#### `notifyDailyCalcError(ctx, tenantID, employeeID, date, previousValue, currentValue)` (lines 251-277)

- Skips if notificationSvc is nil, or currentValue has no error, or previousValue already had error (prevent duplicates)
- Creates notification of type "errors" with a link to the timesheet view

### 1.3 Day Change Behavior -- Cross-Midnight Functions

#### `partitionBookingsByDate(bookings, date)` (lines 857-872)
Splits bookings into prev/current/next arrays by date comparison.

#### `pairWorkBookingsAcrossDays(prev, current, next)` (lines 805-855)
- Builds `crossDayBooking` structs with offset (-1/0/+1) and absolute time (offset*1440 + editedTime)
- Sorts by absolute time
- Pairs IN/OUT bookings FIFO-style (first open arrival matches next departure)
- Returns `[]crossDayPair`

#### `applyDayChangeBehavior(date, behavior, bookings)` (lines 655-690)
For `at_arrival`: If arrival on current day and departure next day, include next day's departure. If arrival on previous day and departure on current day, exclude current day's departure.
For `at_departure`: Inverse logic.

#### `applyAutoCompleteDayChange(ctx, tenantID, employeeID, date, bookings)` (lines 692-753)
For cross-midnight pairs (arrival day 0, departure day +1):
- Creates synthetic GO booking at midnight on next day (00:00)
- Creates synthetic COME booking at midnight on next day (00:00)
- Uses `ensureAutoCompleteBooking()` which is idempotent (checks for existing auto-complete bookings)
- Source = "correction", Notes = "Auto-complete day change"

#### Helper Functions
- `isBreakBooking(b)`: Checks BookingType.Code for P1/P2/BREAK_START/BREAK_END
- `bookingDirection(b)`: Returns direction from BookingType (defaults to "in")
- `findFirstLastWorkBookings(bookings)`: Finds earliest IN and latest OUT times (non-break)
- `sameDate(a, b)`: Compares year/month/day
- `filterBookingsByDate()`, `sortedBookings()`: Utility functions

### 1.4 Shift Detection (shiftDetectionLoader)

Lines 931-975: A caching loader that implements `calculation.DayPlanLoader`:
- Cache maps `uuid.UUID -> *model.DayPlan`
- `LoadShiftDetectionInput(id)` loads plan from repo, builds `ShiftDetectionInput` from plan fields
- `buildShiftDetectionInput(plan)` maps DayPlan fields to `ShiftDetectionInput` struct

---

## 2. Repository Files

### 2.1 `apps/api/internal/repository/dailyvalue.go` (300 lines)

**Key upsert logic** (lines 171-184):
```go
Upsert(ctx, dv) error
    Clauses(OnConflict{
        Columns: [employee_id, value_date],
        DoUpdates: AssignmentColumns([
            gross_time, net_time, target_time, overtime, undertime, break_time,
            has_error, error_codes, warnings, status,
            first_come, last_go, booking_count,
            calculated_at, calculation_version, updated_at,
        ]),
    }).Create(dv)
```

Conflict key: `(employee_id, value_date)` -- matches the `@@unique` in Prisma.

Other methods used by the service:
- `GetByEmployeeDate(employeeID, date)` -- returns nil, nil if not found
- `BulkUpsert(values)` -- batched version

Helper `normalizeDailyValueStatus(dv)`: Sets status to "error"/"calculated" if empty.

### 2.2 `apps/api/internal/repository/daily_account_value.go` (150 lines)

**Key upsert logic** (lines 32-46):
```go
Upsert(ctx, dav) error
    Clauses(OnConflict{
        Columns: [employee_id, value_date, account_id, source],
        DoUpdates: AssignmentColumns([value_minutes, day_plan_id, updated_at]),
    }).Create(dav)
```

Conflict key: `(employee_id, value_date, account_id, source)` -- matches `@@unique` in Prisma.

Other methods used:
- `DeleteByEmployeeDate(employeeID, date)` -- deletes all for date
- `DeleteByEmployeeDateAndSource(employeeID, date, source)` -- deletes by source filter

---

## 3. Go Model Definitions

### 3.1 DailyValue (`model/dailyvalue.go`)

| Field | Type | Description |
|---|---|---|
| ID | uuid | PK, auto-generated |
| TenantID | uuid | Required |
| EmployeeID | uuid | Required |
| ValueDate | date | Required |
| Status | string (varchar 20) | "pending"/"calculated"/"error"/"approved" |
| GrossTime | int | Minutes, default 0 |
| NetTime | int | Minutes, default 0 |
| TargetTime | int | Minutes, default 0 |
| Overtime | int | Minutes, default 0 |
| Undertime | int | Minutes, default 0 |
| BreakTime | int | Minutes, default 0 |
| HasError | bool | Default false |
| ErrorCodes | text[] | PostgreSQL array |
| Warnings | text[] | PostgreSQL array |
| FirstCome | *int | Nullable, minutes from midnight |
| LastGo | *int | Nullable, minutes from midnight |
| BookingCount | int | Default 0 |
| CalculatedAt | *time | Nullable timestamp |
| CalculationVersion | int | Default 1 |
| CreatedAt | time | |
| UpdatedAt | time | |

### 3.2 DailyAccountValue (`model/daily_account_value.go`)

| Field | Type | Description |
|---|---|---|
| ID | uuid | PK |
| TenantID | uuid | Required |
| EmployeeID | uuid | Required |
| AccountID | uuid | Required |
| ValueDate | date | Required |
| ValueMinutes | int | Default 0 |
| Source | string | "net_time"/"capped_time"/"surcharge" |
| DayPlanID | *uuid | Nullable |
| CreatedAt | time | |
| UpdatedAt | time | |

### 3.3 DayPlan (`model/dayplan.go`)

Key methods:
- `GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes)` -- priority chain
- `GetHolidayCredit(category)` -- switch on 1/2/3
- `HasShiftDetection()` -- checks if any shift detect windows set
- `GetAlternativePlanIDs()` -- collects up to 6 alt plan UUIDs

### 3.4 Booking (`model/booking.go`)

Key method:
- `EffectiveTime()` -- returns `calculated_time` if set, else `edited_time`

### 3.5 AbsenceDay (`model/absenceday.go`)

Key methods:
- `IsApproved()` -- status == "approved"
- `CalculateCredit(regelarbeitszeit)` -- `regelarbeitszeit * absenceType.CreditMultiplier() * duration`
- Requires `AbsenceType` relation to be preloaded

---

## 4. Existing TS Infrastructure

### 4.1 Prisma Schema Models (already exist)

| Model | Location | Notes |
|---|---|---|
| Booking | schema.prisma:2757 | Full model with all fields, bookingType relation |
| DailyValue | schema.prisma:2819 | Full model, unique on [employeeId, valueDate] |
| DailyAccountValue | schema.prisma:2880 | Full model, unique on [employeeId, valueDate, accountId, source] |
| EmployeeDayPlan | schema.prisma:1952 | Full model, unique on [employeeId, planDate], dayPlan relation |
| DayPlan | schema.prisma:1158 | Full model with all fields, breaks/bonuses relations |
| DayPlanBreak | schema.prisma:1273 | Full model |
| DayPlanBonus | schema.prisma:1303 | Full model with account relation |
| Holiday | schema.prisma:329 | Full model, unique on [tenantId, holidayDate] |
| Employee | schema.prisma:532 | Full model with dailyTargetHours, defaultOrderId, etc. |
| AbsenceType | schema.prisma:1110 | Full model with portion, priority, calculationRule |
| SystemSetting | schema.prisma:1753 | Singleton per tenant, has roundingRelativeToPlan |
| Notification | schema.prisma:1824 | Full model |
| BookingType | Referenced by Booking | Has direction, code fields |

**NOT in Prisma schema:**
- `AbsenceDay` -- Does not exist as a Prisma model. The table exists in the DB (via Go migrations) but is not yet modeled in Prisma.
- `OrderBooking` -- Does not exist as a Prisma model.

### 4.2 TypeScript Calculation Engine (`apps/web/src/lib/calculation/`)

Fully ported from Go `apps/api/internal/calculation/`. Files:

| File | Exports |
|---|---|
| `types.ts` | All input/output types: `CalculationInput`, `CalculationResult`, `BookingInput`, `DayPlanInput`, `BookingPair`, `SurchargeConfig`, etc. |
| `calculator.ts` | `calculate(input: CalculationInput): CalculationResult` |
| `pairing.ts` | `pairBookings()`, `calculateGrossTime()`, `calculateBreakTime()`, `findFirstCome()`, `findLastGo()` |
| `tolerance.ts` | `applyComeTolerance()`, `applyGoTolerance()`, `validateTimeWindow()`, `validateCoreHours()` |
| `rounding.ts` | `roundTime()`, `roundComeTime()`, `roundGoTime()` |
| `breaks.ts` | `calculateBreakDeduction()`, `calculateOverlap()`, `calculateOvertimeUndertime()` |
| `capping.ts` | `applyWindowCapping()`, `applyCapping()`, `calculateMaxNetTimeCapping()`, `aggregateCapping()` |
| `surcharges.ts` | `calculateSurcharges()`, `splitOvernightSurcharge()`, `extractWorkPeriods()` |
| `errors.ts` | All error/warning code constants, `isError()` |
| `time.ts` | `normalizeCrossMidnight()`, `MINUTES_PER_DAY`, etc. |
| `index.ts` | Re-exports all public API |

Key difference from Go: The TS calc engine does **not** include `ConvertBonusesToSurchargeConfigs()` (this was a Go-specific model conversion). The TS service will need to implement this conversion when building surcharge configs from `DayPlanBonus` Prisma records.

The TS `calculate()` function signature exactly matches Go:
```typescript
calculate(input: CalculationInput): CalculationResult
```

### 4.3 Bookings tRPC Router (`apps/web/src/server/routers/bookings.ts`)

- Full CRUD: list, getById, create, update, delete
- Uses `tenantProcedure` with permission checks
- `parseTimeString()` for HH:MM -> minutes conversion
- `createDerivedBookingIfNeeded()` for booking reasons
- **No recalculation triggers** (noted as TODO for TICKET-235)
- Uses Prisma directly (no service layer abstraction)

### 4.4 tRPC Architecture Patterns

**Context**: `TRPCContext` provides `prisma`, `user`, `session`, `tenantId`

**Procedure types**:
- `publicProcedure` -- no auth
- `protectedProcedure` -- requires auth
- `tenantProcedure` -- requires auth + tenant ID

**Router pattern**: All routers are flat functions using `createTRPCRouter()`. No service class pattern exists -- business logic is inline in router procedures or in helper functions within the same file.

**However**, the ticket specifies a service class pattern:
```typescript
class DailyCalcService {
    constructor(private prisma: PrismaClient) {}
    async calculateDay(tenantId, employeeId, date): Promise<DailyValue>
}
```

This would be a **new pattern** for this codebase. Existing routers put logic directly in procedures. The service class will need to be instantiated in the router/caller.

### 4.5 Prisma Upsert Patterns

Prisma natively supports `upsert()` with `create`/`update`/`where` syntax. For the DailyValue upsert:

```typescript
prisma.dailyValue.upsert({
    where: { employeeId_valueDate: { employeeId, valueDate: date } },
    create: { ...allFields },
    update: { ...updateFields },
})
```

For DailyAccountValue (4-column composite unique):
```typescript
prisma.dailyAccountValue.upsert({
    where: {
        employeeId_valueDate_accountId_source: {
            employeeId, valueDate: date, accountId, source
        }
    },
    create: { ...allFields },
    update: { valueMinutes, dayPlanId, updatedAt: new Date() },
})
```

---

## 5. Edge Cases and Business Rules

### 5.1 Midnight-Crossing Bookings (Night Work)

Controlled by `DayPlan.dayChangeBehavior`:
- `"none"` -- Only considers bookings on the exact date
- `"at_arrival"` -- Day belongs to the arrival date. If arrival=today, departure=tomorrow -> tomorrow's departure is pulled into today. If arrival=yesterday, departure=today -> today's departure is excluded.
- `"at_departure"` -- Day belongs to the departure date. Inverse logic.
- `"auto_complete"` -- Inserts synthetic midnight bookings (GO at 00:00 next day, COME at 00:00 next day). Uses `source="correction"`, `notes="Auto-complete day change"`. Idempotent (checks existing).

Implementation requires loading 3 days of bookings (date-1, date, date+1) and the `pairWorkBookingsAcrossDays()` function.

### 5.2 Days Without Bookings

Five behaviors from `DayPlan.noBookingBehavior`:
1. `"error"` (default) -- Status=error, ErrorCodes=["NO_BOOKINGS"], Undertime=target
2. `"adopt_target"` -- Credits target time as if worked, no errors
3. `"deduct_target"` -- NetTime=0, Undertime=target (penalty)
4. `"vocational_school"` -- Credits target + auto-creates absence day (code "SB") for past dates only
5. `"target_with_order"` -- Credits target + creates auto order booking via employee's default order

### 5.3 Multiple Booking Pairs Per Day

Handled natively by the calculation engine's pairing logic. Work bookings are paired FIFO: first IN matches first OUT, etc. Break bookings are paired separately by category. The `calculateGrossTime()` sums all work pair durations.

### 5.4 Paid vs Unpaid Breaks

Break configs have `isPaid: boolean`:
- Unpaid breaks: Deducted from gross time to get net time
- Paid breaks: NOT deducted (counted as work time)

Break types:
- `"fixed"` -- At specific time window (startTime/endTime)
- `"variable"` -- Flexible based on work duration
- `"minimum"` -- Mandatory after work threshold (afterWorkMinutes)

### 5.5 Holidays on Weekdays vs Weekends

Holiday handling depends on whether bookings exist:
- **Holiday with no bookings**: Credits holiday time based on category (1/2/3 -> holidayCreditCat1/2/3 from DayPlan). BUT if an approved absence exists with priority > 0, uses absence credit instead.
- **Holiday with bookings**: Normal calculation with "WORKED_ON_HOLIDAY" warning added.
- **Surcharges**: Holiday surcharges only apply when `config.appliesOnHoliday=true`, with optional category filtering.

### 5.6 Employees Without Active Tariffs

If `empDayPlan` is nil (no EmployeeDayPlan for that date), the employee is treated as having an **off day**:
- TargetTime = 0
- Warnings = ["OFF_DAY"]
- If bookings exist: "BOOKINGS_ON_OFF_DAY" warning

### 5.7 Shift Detection

When `DayPlan.HasShiftDetection()` is true:
1. Find first arrival and last departure times from bookings (non-break)
2. Check if times fall within the assigned plan's detection windows
3. If no match, iterate through up to 6 alternative plan IDs
4. If alternative matches, reload that plan and use it for calculation
5. If no match at all, add error "NO_MATCHING_SHIFT"

Uses a caching loader to avoid repeated DB calls for the same plan.

### 5.8 Absence Priority Override on Holidays

When holiday + no bookings + approved absence exists:
- If `absenceType.Priority > 0`: Use absence credit calculation instead of holiday credit
- If `absenceType.Priority == 0`: Use standard holiday credit

### 5.9 Target Hours Resolution Priority Chain

1. If `dayPlan.fromEmployeeMaster=true` AND employee has `dailyTargetHours` set -> use employee's value (converted from Decimal to minutes)
2. If the day is an approved absence day AND `dayPlan.regularHours2` is set -> use regularHours2
3. Default: `dayPlan.regularHours`

### 5.10 Rounding Relative to Plan

When `systemSetting.roundingRelativeToPlan=true`:
- Come rounding uses `dayPlan.comeFrom` as anchor
- Go rounding uses `dayPlan.goFrom` (fallback `goTo`) as anchor
- This changes the rounding grid from midnight-based to plan-based

### 5.11 Plan Type-Specific Tolerance Adjustments

| Plan Type | Tolerance Changes |
|---|---|
| Flextime | ComePlus=0, GoMinus=0, variableWorkTime=false |
| Fixed (no variable work time) | ComeMinus=0 |
| Fixed (with variable work time) | All tolerances as configured |

### 5.12 Booking Calculated Times

After calculation, the engine produces `calculatedTimes: Map<bookingId, minutes>`. These are written back to the bookings table via `UpdateCalculatedTimes()`. In the TS port, this would be:
```typescript
prisma.booking.update({ where: { id }, data: { calculatedTime: minutes } })
```
(batch update across multiple bookings)

---

## 6. Gaps and Concerns for the Port

### 6.1 Missing Prisma Models

**AbsenceDay** is not in the Prisma schema. The service needs to:
- Look up absence days by employee+date
- Check if approved
- Read AbsenceType priority and credit calculation

Options:
1. Add AbsenceDay to the Prisma schema (separate migration/schema ticket)
2. Use raw SQL queries (`prisma.$queryRaw`)

**OrderBooking** is not in the Prisma schema. The `target_with_order` no-booking behavior needs it. Options:
1. Add to Prisma schema
2. Use raw SQL
3. Skip this behavior initially (mark as TODO)

### 6.2 ConvertBonusesToSurchargeConfigs

The Go function `ConvertBonusesToSurchargeConfigs()` lives in the calculation package and converts `model.DayPlanBonus` -> `SurchargeConfig`. The TS calculation engine does not include this. The TS DailyCalcService will need to implement this conversion from Prisma `DayPlanBonus` records to `SurchargeConfig` objects.

Key mapping logic:
```
appliesOnHoliday = bonus.appliesOnHoliday
appliesOnWorkday = !bonus.appliesOnHoliday  (inverse)
accountCode = bonus.account?.code ?? ""
holidayCategories = []  (not yet supported)
```

### 6.3 Shift Detection Porting

The Go `ShiftDetector` and `ShiftDetectionInput`/`ShiftDetectionResult` types are in the calculation package but NOT yet ported to TS. The TS calculation engine (`apps/web/src/lib/calculation/`) does not include shift detection files. This needs to be ported as part of TICKET-234 or as a prerequisite.

Functions to port:
- `ShiftDetector.DetectShift()`
- `matchesPlan()`
- `isInTimeWindow()`
- `hasArrivalWindow()`, `hasDepartureWindow()`
- Types: `ShiftDetectionInput`, `ShiftDetectionResult`, `ShiftMatchType`

### 6.4 Notification Service

The Go service calls `notificationSvc.CreateForEmployee()` to notify on newly detected errors. In TS, this would use Prisma to create Notification records. The Notification model exists in Prisma.

However, the Go `NotificationService.CreateForEmployee` likely does employee->user lookup to find the notification target. This logic would need to be replicated.

### 6.5 Auto-Complete Day Change Booking Creation

The `auto_complete` day change behavior creates actual `Booking` records in the database via `bookingRepo.Create()`. In TS, this would be `prisma.booking.create()`. This is a side effect during the loading phase (before calculation), which is unusual.

### 6.6 Service Class vs Router Pattern

The TS codebase uses flat router functions, not service classes. The ticket specifies a service class. This is a new pattern. The class will be instantiated with a PrismaClient and called from a tRPC router (TICKET-235).

### 6.7 Booking UpdateCalculatedTimes

The Go code does a batch update of calculated times: `bookingRepo.UpdateCalculatedTimes(ctx, map[uuid]int)`. In Prisma, there is no native batch update by different values. Options:
1. Use `prisma.$transaction()` with individual updates
2. Use `prisma.$executeRaw()` with a SQL VALUES clause
3. Loop with individual `prisma.booking.update()`

### 6.8 PostgreSQL Array Fields

DailyValue has `errorCodes: String[]` and `warnings: String[]` in Prisma (mapped to PostgreSQL text[]). Prisma handles these natively as JavaScript string arrays -- no special handling needed.

### 6.9 Decimal Handling

- `employee.dailyTargetHours` is `Decimal(5,2)` in Prisma -- Prisma returns this as a Prisma.Decimal object. Need to convert: `Number(emp.dailyTargetHours) * 60` to get minutes.
- `absenceDay.duration` is `Decimal(3,2)` -- needs similar conversion.
- `absenceType.portion` is `Int` -- used as integer directly.

### 6.10 Date Handling

Go uses `time.Time` with date-only semantics (zero time component). In TS/Prisma, `@db.Date` fields are returned as `Date` objects at midnight UTC. The `sameDate()` comparison needs careful implementation to avoid timezone issues:
```typescript
function sameDate(a: Date, b: Date): boolean {
    return a.getUTCFullYear() === b.getUTCFullYear()
        && a.getUTCMonth() === b.getUTCMonth()
        && a.getUTCDate() === b.getUTCDate()
}
```

---

## 7. Calculation Flow Summary (Step by Step)

```
CalculateDay(tenantId, employeeId, date)
  |
  +-- 1. holidayRepo.GetByDate(tenantId, date) -> isHoliday, holidayCategory
  |
  +-- 2. empDayPlanRepo.GetForEmployeeDate(employeeId, date) -> empDayPlan (with DayPlan relation)
  |
  +-- 3. loadBookingsForCalculation(tenantId, employeeId, date, empDayPlan)
  |       |
  |       +-- If no day change behavior: bookings for exact date
  |       +-- If at_arrival/at_departure: 3-day load + applyDayChangeBehavior()
  |       +-- If auto_complete: 3-day load + create synthetic midnight bookings
  |
  +-- 4. BRANCH:
  |       |
  |       +-- (A) No day plan -> handleOffDay() -> DailyValue{target:0, OFF_DAY}
  |       |
  |       +-- (B) Holiday + no bookings
  |       |       +-- If absence with priority > 0 -> handleAbsenceCredit()
  |       |       +-- Else -> handleHolidayCredit()
  |       |
  |       +-- (C) No bookings -> handleNoBookings() -> based on noBookingBehavior
  |       |
  |       +-- (D) Normal -> calculateWithBookings()
  |               |
  |               +-- 4a. Shift detection (if configured)
  |               +-- 4b. buildCalcInput() -> CalculationInput
  |               +-- 4c. calculate(input) -> CalculationResult
  |               +-- 4d. Merge shift errors, holiday warnings
  |               +-- 4e. resultToDailyValue() -> DailyValue
  |               +-- 4f. UpdateCalculatedTimes on bookings
  |
  +-- 5. Get previous DailyValue (for error notification)
  |
  +-- 6. dailyValueRepo.Upsert(dailyValue)
  |
  +-- 7. postDailyAccountValues() -> net_time and capped_time postings
  |
  +-- 8. postSurchargeValues() -> surcharge postings
  |
  +-- 9. notifyDailyCalcError() -> notification if new error detected
  |
  +-- Return dailyValue
```

---

## 8. Function-by-Function Port Mapping

| Go Function | Signature | Lines | TS Equivalent |
|---|---|---|---|
| `NewDailyCalcService` | constructor(7 repos) | 101-120 | `constructor(prisma: PrismaClient)` |
| `SetNotificationService` | setter | 123-125 | Constructor param or method |
| `SetOrderBookingService` | setter | 128-130 | Constructor param or method |
| `SetSettingsLookup` | setter | 133-135 | Via prisma.systemSetting |
| `SetDailyAccountValueRepo` | setter | 138-140 | Via prisma directly |
| `SetAbsenceDayCreator` | setter | 143-145 | Via prisma directly |
| `resolveTargetHours` | (ctx, empID, date, dp) -> int | 151-172 | Private async method |
| `CalculateDay` | (ctx, tenantID, empID, date) -> (*DV, err) | 176-249 | `async calculateDay(tenantId, employeeId, date)` |
| `RecalculateRange` | (ctx, tenantID, empID, from, to) -> (int, err) | 1240-1250 | `async calculateDateRange(tenantId, employeeId, from, to)` |
| `notifyDailyCalcError` | private | 251-277 | Private async method |
| `postDailyAccountValues` | private | 282-337 | Private async method |
| `postSurchargeValues` | private | 339-394 | Private async method |
| `loadBookingsForCalculation` | private | 396-426 | Private async method |
| `handleOffDay` | private | 428-446 | Private method |
| `handleHolidayCredit` | private | 448-484 | Private async method |
| `handleAbsenceCredit` | private | 488-519 | Private method |
| `handleNoBookings` | private | 521-653 | Private async method |
| `applyDayChangeBehavior` | standalone func | 655-690 | Standalone function |
| `applyAutoCompleteDayChange` | method | 692-753 | Private async method |
| `ensureAutoCompleteBooking` | method | 755-792 | Private async method |
| `pairWorkBookingsAcrossDays` | standalone func | 805-855 | Standalone function |
| `partitionBookingsByDate` | standalone func | 857-872 | Standalone function |
| `filterBookingsByDate` | standalone func | 874-882 | Standalone function |
| `sortedBookings` | standalone func | 884-900 | Standalone function |
| `sameDate` | standalone func | 902-906 | Standalone function |
| `isBreakBooking` | standalone func | 908-913 | Standalone function |
| `isBreakBookingType` | standalone func | 915-922 | Standalone function |
| `bookingDirection` | standalone func | 924-929 | Standalone function |
| `shiftDetectionLoader` | struct+methods | 931-975 | Class or closure |
| `findFirstLastWorkBookings` | standalone func | 977-996 | Standalone function |
| `calculateWithBookings` | method | 998-1068 | Private async method |
| `buildCalcInput` | method | 1070-1207 | Private async method |
| `resultToDailyValue` | method | 1209-1230 | Private method |
| `statusFromError` | standalone func | 1232-1237 | Inline or standalone |

Total: ~35 functions/methods to port.
