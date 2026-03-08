# Implementation Plan: ZMI-TICKET-234 -- DailyCalcService Port (Go -> TS)

Date: 2026-03-08
Ticket: ZMI-TICKET-234
Go Source: `apps/api/internal/service/daily_calc.go` (1,251 lines)
Dependencies: ZMI-TICKET-231 (Prisma models), ZMI-TICKET-232 (Bookings CRUD), ZMI-TICKET-233 (Calculation Engine)

---

## Pre-Implementation Notes

### Architecture Decision: Service Class Pattern

The TS codebase currently uses flat router functions with inline business logic. This ticket introduces a **service class pattern** (`DailyCalcService`) as specified in the ticket. The class receives a `PrismaClient` via constructor and encapsulates all daily calculation orchestration. This is a deliberate new pattern that separates business logic from tRPC routing.

### Missing Prisma Models

- **AbsenceDay** -- Not in Prisma schema. The `absence_days` table exists in the DB (from Go migrations). We will use `prisma.$queryRaw` for absence day queries to avoid blocking on a schema change ticket.
- **OrderBooking** -- Not in Prisma schema. The `target_with_order` no-booking behavior needs it. We will use `prisma.$queryRaw` for the create/delete operations, with a TODO to add to Prisma schema later.

### Missing TS Calculation Engine Pieces

- **Shift detection** (`shift.go`) -- Not yet ported to TS. Must be ported as part of this ticket (Phase 4a).
- **`ConvertBonusesToSurchargeConfigs()`** -- Not in the TS calculation engine. Must be implemented in the service layer as a helper.

---

## File Layout Overview

```
apps/web/src/server/services/
  daily-calc.ts              -- Main DailyCalcService class
  daily-calc.types.ts        -- TypeScript interfaces/types for the service
  daily-calc.helpers.ts      -- Pure helper functions (day change, pairing, sorting)
  __tests__/
    daily-calc.test.ts           -- Unit tests for DailyCalcService
    daily-calc.helpers.test.ts   -- Unit tests for pure helper functions

apps/web/src/lib/calculation/
  shift-detection.ts         -- ShiftDetector port from Go shift.go
  __tests__/
    shift-detection.test.ts  -- Tests for shift detection
```

---

## Phase 1: Service Skeleton + Types + Pure Helper Functions

### Goal
Create the service class skeleton, all TypeScript types, and port all pure (non-DB) helper functions from the Go code.

### Files to Create

#### 1a. `apps/web/src/server/services/daily-calc.types.ts`

```typescript
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

// --- Raw SQL types for AbsenceDay (not in Prisma schema) ---

export interface AbsenceDayRow {
  id: string
  tenant_id: string
  employee_id: string
  absence_date: Date
  absence_type_id: string
  duration: string        // Decimal as string from raw SQL
  half_day_period: string | null
  status: string
  approved_by: string | null
  approved_at: Date | null
  rejection_reason: string | null
  notes: string | null
  created_by: string | null
  created_at: Date
  updated_at: Date
  // Joined fields from absence_types
  at_portion: number | null
  at_priority: number | null
  at_code: string | null
}

// --- Day Change Behavior constants ---

export const DAY_CHANGE_NONE = "none"
export const DAY_CHANGE_AT_ARRIVAL = "at_arrival"
export const DAY_CHANGE_AT_DEPARTURE = "at_departure"
export const DAY_CHANGE_AUTO_COMPLETE = "auto_complete"

// --- No Booking Behavior constants ---

export const NO_BOOKING_ERROR = "error"
export const NO_BOOKING_ADOPT_TARGET = "adopt_target"
export const NO_BOOKING_DEDUCT_TARGET = "deduct_target"
export const NO_BOOKING_VOCATIONAL_SCHOOL = "vocational_school"
export const NO_BOOKING_TARGET_WITH_ORDER = "target_with_order"

// --- DailyValue status constants ---

export const DV_STATUS_CALCULATED = "calculated"
export const DV_STATUS_ERROR = "error"
export const DV_STATUS_PENDING = "pending"
export const DV_STATUS_APPROVED = "approved"

// --- DailyAccountValue source constants ---

export const DAV_SOURCE_NET_TIME = "net_time"
export const DAV_SOURCE_CAPPED_TIME = "capped_time"
export const DAV_SOURCE_SURCHARGE = "surcharge"

// --- Auto-complete constants ---

export const AUTO_COMPLETE_NOTES = "Auto-complete day change"

// --- Break booking type codes ---

export const BREAK_CODES = new Set(["P1", "P2", "BREAK_START", "BREAK_END"])

// --- Prisma include types ---

/** Booking with bookingType relation loaded */
export type BookingWithType = Prisma.BookingGetPayload<{
  include: { bookingType: true }
}>

/** EmployeeDayPlan with DayPlan + Breaks + Bonuses loaded */
export type EmployeeDayPlanWithDetails = Prisma.EmployeeDayPlanGetPayload<{
  include: {
    dayPlan: {
      include: {
        breaks: true
        bonuses: { include: { account: true } }
      }
    }
  }
}>

/** DayPlan with breaks and bonuses loaded */
export type DayPlanWithDetails = Prisma.DayPlanGetPayload<{
  include: {
    breaks: true
    bonuses: { include: { account: true } }
  }
}>

// --- Cross-day booking types ---

export interface CrossDayBooking {
  booking: BookingWithType
  offset: number    // -1 = previous day, 0 = current day, +1 = next day
  absTime: number   // offset * 1440 + editedTime
}

export interface CrossDayPair {
  arrival: CrossDayBooking
  departure: CrossDayBooking
}

// --- DailyValue creation input (before Prisma upsert) ---

export interface DailyValueInput {
  tenantId: string
  employeeId: string
  valueDate: Date
  status: string
  grossTime: number
  netTime: number
  targetTime: number
  overtime: number
  undertime: number
  breakTime: number
  hasError: boolean
  errorCodes: string[]
  warnings: string[]
  firstCome: number | null
  lastGo: number | null
  bookingCount: number
  calculatedAt: Date
  calculationVersion: number
}
```

#### 1b. `apps/web/src/server/services/daily-calc.helpers.ts`

Port all pure helper functions from Go:

```typescript
import type { BookingWithType, CrossDayBooking, CrossDayPair } from "./daily-calc.types"
import { BREAK_CODES } from "./daily-calc.types"

// --- Date helpers ---

export function sameDate(a: Date, b: Date): boolean
export function addDays(date: Date, days: number): Date
export function dateOnly(date: Date): Date

// --- Booking classification helpers ---

export function isBreakBooking(b: BookingWithType): boolean
export function isBreakBookingType(code: string): boolean
export function bookingDirection(b: BookingWithType): "in" | "out"
export function effectiveTime(b: BookingWithType): number

// --- Sorting and filtering ---

export function sortedBookings(bookings: BookingWithType[]): BookingWithType[]
export function filterBookingsByDate(bookings: BookingWithType[], date: Date): BookingWithType[]
export function partitionBookingsByDate(
  bookings: BookingWithType[],
  date: Date
): { prev: BookingWithType[]; current: BookingWithType[]; next: BookingWithType[] }

// --- Cross-day pairing ---

export function pairWorkBookingsAcrossDays(
  prev: BookingWithType[],
  current: BookingWithType[],
  next: BookingWithType[]
): CrossDayPair[]

// --- Day change behavior ---

export function applyDayChangeBehavior(
  date: Date,
  behavior: string,
  bookings: BookingWithType[]
): BookingWithType[]

// --- First/Last work booking times ---

export function findFirstLastWorkBookings(
  bookings: BookingWithType[]
): { firstCome: number | null; lastGo: number | null }

// --- DayPlan helpers ---

export function getHolidayCredit(dayPlan: DayPlanWithDetails, category: number): number
export function hasShiftDetection(dayPlan: DayPlanWithDetails): boolean
export function getAlternativePlanIDs(dayPlan: DayPlanWithDetails): string[]
export function getEffectiveRegularHours(
  dayPlan: DayPlanWithDetails,
  isAbsenceDay: boolean,
  employeeTargetMinutes: number | null
): number

// --- Bonus to surcharge config conversion ---

export function convertBonusesToSurchargeConfigs(
  bonuses: DayPlanWithDetails["bonuses"]
): SurchargeConfig[]

// --- AbsenceDay credit calculation ---

export function calculateAbsenceCredit(
  regelarbeitszeit: number,
  portion: number,
  duration: number
): number

export function getCreditMultiplier(portion: number): number
```

**Logic for each function** (ported 1:1 from Go):

- `sameDate(a, b)`: Compare UTC year/month/day
- `addDays(date, days)`: Return new Date with UTC date shifted
- `dateOnly(date)`: Return midnight UTC for the date
- `isBreakBooking(b)`: `b.bookingType != null && BREAK_CODES.has(b.bookingType.code.toUpperCase())`
- `bookingDirection(b)`: `b.bookingType?.direction === "out" ? "out" : "in"`
- `effectiveTime(b)`: `b.calculatedTime ?? b.editedTime`
- `sortedBookings(bookings)`: Sort by bookingDate, then editedTime, then id (stable)
- `filterBookingsByDate(bookings, date)`: Deduplicate by ID, keep only `sameDate`, return sorted
- `partitionBookingsByDate(bookings, date)`: Split into prev/current/next based on date-1/date/date+1
- `pairWorkBookingsAcrossDays(prev, current, next)`: Build CrossDayBooking[] with offsets, sort by absTime, FIFO pair IN/OUT
- `applyDayChangeBehavior(date, behavior, bookings)`: at_arrival/at_departure logic with cross-day pairs
- `findFirstLastWorkBookings(bookings)`: Earliest IN, latest OUT (non-break)
- `getHolidayCredit(dayPlan, category)`: Switch on 1/2/3 -> holidayCreditCat1/2/3
- `hasShiftDetection(dayPlan)`: Any of 4 shift detect fields non-null
- `getAlternativePlanIDs(dayPlan)`: Collect non-null shiftAltPlan1..6
- `getEffectiveRegularHours(dp, isAbsence, empMinutes)`: Priority chain: empMaster > regularHours2 > regularHours
- `convertBonusesToSurchargeConfigs(bonuses)`: Map DayPlanBonus[] to SurchargeConfig[]
- `calculateAbsenceCredit(regel, portion, duration)`: `Math.floor(regel * getCreditMultiplier(portion) * duration)`
- `getCreditMultiplier(portion)`: 0->0.0, 1->1.0, 2->0.5, default->1.0

#### 1c. `apps/web/src/server/services/daily-calc.ts` (skeleton)

```typescript
import type { PrismaClient } from "@/generated/prisma/client"
import type { DailyValue, Booking } from "@/generated/prisma/client"

export class DailyCalcService {
  constructor(private prisma: PrismaClient) {}

  async calculateDay(
    tenantId: string,
    employeeId: string,
    date: Date
  ): Promise<DailyValue | null> {
    // TODO: Phase 2-6
    throw new Error("Not implemented")
  }

  async calculateDateRange(
    tenantId: string,
    employeeId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{ count: number; values: DailyValue[] }> {
    // TODO: Phase 7
    throw new Error("Not implemented")
  }
}
```

### Verification

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.helpers.test.ts
```

---

## Phase 2: Booking Loading + Day Change Behavior

### Goal
Implement `loadBookingsForCalculation()` including all day change behaviors and auto-complete booking creation.

### Files to Modify

#### 2a. `apps/web/src/server/services/daily-calc.ts`

Add private methods:

```typescript
// Load bookings for the calculation date, handling day change behavior
private async loadBookingsForCalculation(
  tenantId: string,
  employeeId: string,
  date: Date,
  empDayPlan: EmployeeDayPlanWithDetails | null
): Promise<BookingWithType[]>

// Create synthetic midnight bookings for auto_complete day change
private async applyAutoCompleteDayChange(
  tenantId: string,
  employeeId: string,
  date: Date,
  bookings: BookingWithType[]
): Promise<BookingWithType[]>

// Idempotent creation of an auto-complete booking at midnight
private async ensureAutoCompleteBooking(
  tenantId: string,
  employeeId: string,
  date: Date,
  bookingType: { id: string; direction: string; code: string; name: string },
  direction: "in" | "out",
  existingBookings: BookingWithType[]
): Promise<{ booking: BookingWithType; created: boolean }>
```

**Logic for `loadBookingsForCalculation`:**

1. If no empDayPlan or no dayPlan, load bookings for exact date only:
   ```typescript
   this.prisma.booking.findMany({
     where: { tenantId, employeeId, bookingDate: date },
     include: { bookingType: true },
     orderBy: [{ bookingDate: "asc" }, { editedTime: "asc" }],
   })
   ```

2. Check `empDayPlan.dayPlan.dayChangeBehavior`:
   - `"none"` or `""` -> exact date load
   - `"at_arrival"` / `"at_departure"` -> load 3-day range (date-1 to date+1), then call `applyDayChangeBehavior()`
   - `"auto_complete"` -> load 3-day range, then call `applyAutoCompleteDayChange()`
   - default -> load 3-day range, `filterBookingsByDate()`

3. Three-day range load:
   ```typescript
   this.prisma.booking.findMany({
     where: {
       tenantId,
       employeeId,
       bookingDate: { gte: addDays(date, -1), lte: addDays(date, 1) },
     },
     include: { bookingType: true },
     orderBy: [{ bookingDate: "asc" }, { editedTime: "asc" }],
   })
   ```

**Logic for `applyAutoCompleteDayChange`:**

Port from Go lines 692-753. For each cross-day pair (arrival day 0, departure day +1):
- Create GO booking at midnight on next day
- Create COME booking at midnight on next day
- Use `ensureAutoCompleteBooking()` for idempotency

**Logic for `ensureAutoCompleteBooking`:**

Port from Go lines 755-792:
1. Check existing bookings for matching auto-complete bookmark (same date, source="correction", notes=AUTO_COMPLETE_NOTES, editedTime=0, matching type+direction)
2. If found, return it (not created)
3. If not found, `prisma.booking.create()` with source="correction", editedTime=0, originalTime=0, notes=AUTO_COMPLETE_NOTES

### Verification

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.test.ts -t "loadBookings"
```

---

## Phase 3: EmployeeDayPlan + Holiday Check + Target Hours Resolution

### Goal
Implement day plan loading, holiday checking, and the target hours resolution priority chain.

### Files to Modify

#### 3a. `apps/web/src/server/services/daily-calc.ts`

Add private methods:

```typescript
// Load employee day plan with full DayPlan + breaks + bonuses
private async loadEmployeeDayPlan(
  employeeId: string,
  date: Date
): Promise<EmployeeDayPlanWithDetails | null>

// Check if the date is a holiday for this tenant
private async checkHoliday(
  tenantId: string,
  date: Date
): Promise<{ isHoliday: boolean; holidayCategory: number }>

// Resolve target hours using ZMI priority chain
private async resolveTargetHours(
  employeeId: string,
  date: Date,
  dayPlan: DayPlanWithDetails
): Promise<number>

// Load absence day with type (raw SQL since not in Prisma)
private async loadAbsenceDay(
  employeeId: string,
  date: Date
): Promise<AbsenceDayRow | null>

// Check if rounding is relative to plan from system settings
private async isRoundingRelativeToPlan(tenantId: string): Promise<boolean>
```

**Logic for `loadEmployeeDayPlan`:**

```typescript
this.prisma.employeeDayPlan.findFirst({
  where: {
    employeeId,
    planDate: date,
  },
  include: {
    dayPlan: {
      include: {
        breaks: { orderBy: { sortOrder: "asc" } },
        bonuses: {
          include: { account: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    },
  },
})
```

**Logic for `checkHoliday`:**

```typescript
const holiday = await this.prisma.holiday.findFirst({
  where: { tenantId, holidayDate: date },
})
return {
  isHoliday: holiday !== null,
  holidayCategory: holiday?.holidayCategory ?? 0,
}
```

**Logic for `resolveTargetHours`:**

Port from Go lines 151-172:
1. If `dayPlan.fromEmployeeMaster === true`:
   - Load employee: `this.prisma.employee.findFirst({ where: { id: employeeId } })`
   - If `emp.dailyTargetHours` is set: `employeeTargetMinutes = Math.round(Number(emp.dailyTargetHours) * 60)`
2. Load absence day via raw SQL
3. `isAbsenceDay = absenceDay !== null && absenceDay.status === "approved"`
4. Return `getEffectiveRegularHours(dayPlan, isAbsenceDay, employeeTargetMinutes)`

**Logic for `loadAbsenceDay`:**

```typescript
const rows = await this.prisma.$queryRaw<AbsenceDayRow[]>`
  SELECT ad.*,
         at.portion as at_portion,
         at.priority as at_priority,
         at.code as at_code
  FROM absence_days ad
  LEFT JOIN absence_types at ON at.id = ad.absence_type_id
  WHERE ad.employee_id = ${employeeId}::uuid
    AND ad.absence_date = ${date}::date
  LIMIT 1
`
return rows[0] ?? null
```

**Logic for `isRoundingRelativeToPlan`:**

```typescript
const settings = await this.prisma.systemSetting.findFirst({
  where: { tenantId },
  select: { roundingRelativeToPlan: true },
})
return settings?.roundingRelativeToPlan ?? false
```

### Verification

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.test.ts -t "holiday|dayPlan|targetHours"
```

---

## Phase 4: Shift Detection Port + Calculation Input Building

### Goal
Port the Go shift detection logic to TS, and implement `buildCalcInput()` which converts Prisma models to the pure calculation engine's input format.

### Files to Create

#### 4a. `apps/web/src/lib/calculation/shift-detection.ts`

Port from `apps/api/internal/calculation/shift.go` (270 lines):

```typescript
// --- Types ---

export type ShiftMatchType = "none" | "arrival" | "departure" | "both"

export interface ShiftDetectionInput {
  planId: string
  planCode: string
  arriveFrom: number | null
  arriveTo: number | null
  departFrom: number | null
  departTo: number | null
  alternativePlanIds: string[]
}

export interface ShiftDetectionResult {
  matchedPlanId: string
  matchedPlanCode: string
  isOriginalPlan: boolean
  matchedBy: ShiftMatchType
  hasError: boolean
  errorCode: string
}

export interface DayPlanLoader {
  loadShiftDetectionInput(id: string): ShiftDetectionInput | null
}

// --- Functions ---

export function isInTimeWindow(time: number, from: number | null, to: number | null): boolean
export function hasArrivalWindow(input: ShiftDetectionInput): boolean
export function hasDepartureWindow(input: ShiftDetectionInput): boolean
export function matchesPlan(
  input: ShiftDetectionInput,
  firstArrival: number | null,
  lastDeparture: number | null
): ShiftMatchType

export class ShiftDetector {
  constructor(private loader: DayPlanLoader) {}

  detectShift(
    assignedPlan: ShiftDetectionInput | null,
    firstArrival: number | null,
    lastDeparture: number | null
  ): ShiftDetectionResult
}
```

**Logic** -- Direct 1:1 port of Go `shift.go` lines 72-227.

#### 4b. Update `apps/web/src/lib/calculation/index.ts`

Add re-exports:

```typescript
export type { ShiftMatchType, ShiftDetectionInput, ShiftDetectionResult, DayPlanLoader } from "./shift-detection"
export { ShiftDetector, isInTimeWindow, matchesPlan } from "./shift-detection"
```

#### 4c. `apps/web/src/server/services/daily-calc.ts`

Add private methods:

```typescript
// Build CalculationInput from Prisma models
private async buildCalcInput(
  tenantId: string,
  employeeId: string,
  date: Date,
  empDayPlan: EmployeeDayPlanWithDetails,
  bookings: BookingWithType[]
): Promise<CalculationInput>

// Calculate with bookings (main branch)
private async calculateWithBookings(
  tenantId: string,
  employeeId: string,
  date: Date,
  empDayPlan: EmployeeDayPlanWithDetails,
  bookings: BookingWithType[],
  isHoliday: boolean
): Promise<{ dailyValue: DailyValueInput; calcPairs: BookingPair[] }>
```

**Logic for `buildCalcInput`** (port of Go lines 1070-1207):

1. Build `DayPlanInput` from `empDayPlan.dayPlan`:
   - Apply plan-type-specific tolerance adjustments:
     - Flextime: `comePlus = 0`, `goMinus = 0`, `variableWorkTime = false`
     - Fixed without variableWorkTime: `comeMinus = 0`
   - Resolve target hours via `resolveTargetHours()`
   - Check `isRoundingRelativeToPlan()` for rounding
   - Map rounding configs (come/go): type, interval, addValue
   - Map breaks from `dayPlan.breaks` to `BreakConfig[]`

2. Build `BookingInput[]` from bookings:
   - Category: `isBreakBookingType(b.bookingType.code) ? "break" : "work"`
   - Direction: `b.bookingType.direction === "out" ? "out" : "in"`
   - Time: `effectiveTime(b)` (calculatedTime ?? editedTime)
   - PairId: `b.pairId`

**Logic for `calculateWithBookings`** (port of Go lines 998-1068):

1. Shift detection (if `hasShiftDetection(dayPlan)`):
   - Find first/last work bookings
   - Create `ShiftDetectionLoader` class implementing `DayPlanLoader`
   - Run `detector.detectShift()`
   - If shifted to different plan, reload via `prisma.dayPlan.findFirst({ include: breaks, bonuses })`
   - Replace empDayPlan for calculation

2. Build calc input via `buildCalcInput()`

3. Run `calculate(input)` from the calculation engine

4. Merge shift detection errors into result

5. Add "WORKED_ON_HOLIDAY" warning if applicable

6. Convert result to DailyValueInput via `resultToDailyValue()`

7. Update booking calculated times via `prisma.$transaction()`:
   ```typescript
   await this.prisma.$transaction(
     Array.from(result.calculatedTimes.entries()).map(([id, time]) =>
       this.prisma.booking.update({ where: { id }, data: { calculatedTime: time } })
     )
   )
   ```

8. Return `{ dailyValue, calcPairs: result.pairs }`

#### 4d. `apps/web/src/lib/calculation/__tests__/shift-detection.test.ts`

Test cases (ported from Go `shift_test.go`):
- No shift detection configured -> original plan
- No bookings -> original plan
- Arrival matches original plan -> original plan + "arrival"
- Departure matches original plan -> original plan + "departure"
- Both match original plan -> original plan + "both"
- No match on original, match on alternative -> alternative plan
- No match anywhere -> error "NO_MATCHING_SHIFT"
- Partial window config (only arrival) -> only check arrival

### Verification

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/lib/calculation/__tests__/shift-detection.test.ts
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.test.ts -t "buildCalcInput|calculateWithBookings"
```

---

## Phase 5: Special Case Handlers (Off Day, Holiday, No Bookings)

### Goal
Implement all the branching logic in `calculateDay()` for special cases: off days, holidays without bookings, absence priority override, and the 5 no-booking behaviors.

### Files to Modify

#### 5a. `apps/web/src/server/services/daily-calc.ts`

Add private methods:

```typescript
// Off day: no assigned day plan
private handleOffDay(
  employeeId: string,
  date: Date,
  bookings: BookingWithType[]
): DailyValueInput

// Holiday with no bookings: credit from day plan category
private async handleHolidayCredit(
  employeeId: string,
  date: Date,
  empDayPlan: EmployeeDayPlanWithDetails,
  holidayCategory: number
): Promise<DailyValueInput>

// Absence overrides holiday (priority > 0)
private async handleAbsenceCredit(
  employeeId: string,
  date: Date,
  empDayPlan: EmployeeDayPlanWithDetails,
  absenceDay: AbsenceDayRow
): Promise<DailyValueInput>

// No bookings: apply noBookingBehavior from day plan
private async handleNoBookings(
  tenantId: string,
  employeeId: string,
  date: Date,
  empDayPlan: EmployeeDayPlanWithDetails
): Promise<DailyValueInput | null>

// Convert CalculationResult to DailyValueInput
private resultToDailyValue(
  employeeId: string,
  date: Date,
  result: CalculationResult
): DailyValueInput
```

**Logic for `handleOffDay`** (port of Go lines 428-446):

```typescript
const dv: DailyValueInput = {
  tenantId: "", // set by caller
  employeeId,
  valueDate: date,
  status: DV_STATUS_CALCULATED,
  grossTime: 0, netTime: 0, targetTime: 0,
  overtime: 0, undertime: 0, breakTime: 0,
  hasError: false, errorCodes: [],
  warnings: ["OFF_DAY"],
  firstCome: null, lastGo: null,
  bookingCount: 0,
  calculatedAt: new Date(),
  calculationVersion: 1,
}
if (bookings.length > 0) {
  dv.warnings.push("BOOKINGS_ON_OFF_DAY")
  dv.bookingCount = bookings.length
}
return dv
```

**Logic for `handleHolidayCredit`** (port of Go lines 448-484):

1. Resolve target hours
2. Get holiday credit: `getHolidayCredit(dayPlan, holidayCategory)`
3. Set netTime = grossTime = credit
4. If credit < target: undertime = target - credit
5. Warnings: `["HOLIDAY"]`

**Logic for `handleAbsenceCredit`** (port of Go lines 488-519):

1. Resolve target hours
2. Calculate credit: `calculateAbsenceCredit(targetTime, absenceDay.at_portion, Number(absenceDay.duration))`
3. Set netTime = grossTime = credit
4. If credit < target: undertime = target - credit
5. Warnings: `["ABSENCE_ON_HOLIDAY"]`

**Logic for `handleNoBookings`** (port of Go lines 521-653):

Switch on `empDayPlan.dayPlan.noBookingBehavior`:

| Behavior | netTime | grossTime | undertime | warnings | Special |
|---|---|---|---|---|---|
| `adopt_target` | target | target | 0 | `["NO_BOOKINGS_CREDITED"]` | -- |
| `deduct_target` | 0 | 0 | target | `["NO_BOOKINGS_DEDUCTED"]` | -- |
| `vocational_school` | target | target | 0 | `["VOCATIONAL_SCHOOL", ...]` | Auto-create absence "SB" for past dates |
| `target_with_order` | target | target | 0 | `["NO_BOOKINGS_CREDITED", ...]` | Create auto order booking |
| `error` (default) | 0 | 0 | target | -- | hasError=true, errorCodes=`["NO_BOOKINGS"]` |

For `vocational_school`:
- Only create absence for dates before today
- Use raw SQL to check existing absence day
- Use raw SQL to create absence day with type code "SB"
- Add warning "ABSENCE_CREATED" or "ABSENCE_CREATION_FAILED"

For `target_with_order`:
- Load employee to get `defaultOrderId`
- Use raw SQL for order_bookings table operations (delete auto + create)
- Add warning "ORDER_BOOKING_CREATED" or "NO_DEFAULT_ORDER"

**Logic for `resultToDailyValue`** (port of Go lines 1209-1237):

Direct field mapping from `CalculationResult` -> `DailyValueInput`.
Status: `result.hasError ? DV_STATUS_ERROR : DV_STATUS_CALCULATED`

### Verification

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.test.ts -t "handleOffDay|handleHoliday|handleAbsence|handleNoBookings"
```

---

## Phase 6: DailyValue + DailyAccountValue Upsert + Notification

### Goal
Implement the persistence layer: DailyValue upsert, DailyAccountValue postings (net, cap, surcharge), and error notification.

### Files to Modify

#### 6a. `apps/web/src/server/services/daily-calc.ts`

Add private methods:

```typescript
// Upsert DailyValue using Prisma's composite unique
private async upsertDailyValue(input: DailyValueInput): Promise<DailyValue>

// Get previous DailyValue for error notification comparison
private async getPreviousDailyValue(
  employeeId: string,
  date: Date
): Promise<{ hasError: boolean } | null>

// Post net time and capped time to configured accounts
private async postDailyAccountValues(
  tenantId: string,
  employeeId: string,
  date: Date,
  empDayPlan: EmployeeDayPlanWithDetails | null,
  dailyValue: DailyValueInput
): Promise<void>

// Calculate and post surcharge bonuses
private async postSurchargeValues(
  tenantId: string,
  employeeId: string,
  date: Date,
  empDayPlan: EmployeeDayPlanWithDetails | null,
  dailyValue: DailyValueInput,
  calcPairs: BookingPair[],
  isHoliday: boolean,
  holidayCategory: number
): Promise<void>

// Notify on newly detected calculation errors
private async notifyDailyCalcError(
  tenantId: string,
  employeeId: string,
  date: Date,
  previousHadError: boolean,
  currentHasError: boolean
): Promise<void>
```

**Logic for `upsertDailyValue`** (port of Go `dailyvalue.go` upsert):

```typescript
return this.prisma.dailyValue.upsert({
  where: {
    employeeId_valueDate: { employeeId: input.employeeId, valueDate: input.valueDate },
  },
  create: {
    tenantId: input.tenantId,
    employeeId: input.employeeId,
    valueDate: input.valueDate,
    status: input.status,
    grossTime: input.grossTime,
    netTime: input.netTime,
    targetTime: input.targetTime,
    overtime: input.overtime,
    undertime: input.undertime,
    breakTime: input.breakTime,
    hasError: input.hasError,
    errorCodes: input.errorCodes,
    warnings: input.warnings,
    firstCome: input.firstCome,
    lastGo: input.lastGo,
    bookingCount: input.bookingCount,
    calculatedAt: input.calculatedAt,
    calculationVersion: input.calculationVersion,
  },
  update: {
    grossTime: input.grossTime,
    netTime: input.netTime,
    targetTime: input.targetTime,
    overtime: input.overtime,
    undertime: input.undertime,
    breakTime: input.breakTime,
    hasError: input.hasError,
    errorCodes: input.errorCodes,
    warnings: input.warnings,
    firstCome: input.firstCome,
    lastGo: input.lastGo,
    bookingCount: input.bookingCount,
    calculatedAt: input.calculatedAt,
    calculationVersion: input.calculationVersion,
    status: input.status,
    updatedAt: new Date(),
  },
})
```

**Logic for `postDailyAccountValues`** (port of Go lines 282-337):

1. If no day plan: delete all postings for date
   ```typescript
   await this.prisma.dailyAccountValue.deleteMany({
     where: { employeeId, valueDate: date },
   })
   ```

2. If `dayPlan.netAccountId`: upsert with source="net_time", value=dailyValue.netTime

3. If `dayPlan.capAccountId && dayPlan.maxNetWorkTime`:
   - `cappedMinutes = Math.max(0, dailyValue.grossTime - dayPlan.maxNetWorkTime)`
   - Upsert with source="capped_time", value=cappedMinutes

**DailyAccountValue upsert:**
```typescript
await this.prisma.dailyAccountValue.upsert({
  where: {
    employeeId_valueDate_accountId_source: {
      employeeId, valueDate: date, accountId, source,
    },
  },
  create: { tenantId, employeeId, accountId, valueDate: date, valueMinutes, source, dayPlanId },
  update: { valueMinutes, dayPlanId, updatedAt: new Date() },
})
```

**Logic for `postSurchargeValues`** (port of Go lines 339-394):

1. Delete old surcharge postings:
   ```typescript
   await this.prisma.dailyAccountValue.deleteMany({
     where: { employeeId, valueDate: date, source: DAV_SOURCE_SURCHARGE },
   })
   ```

2. If no dayPlan or no bonuses, return early

3. Convert bonuses: `convertBonusesToSurchargeConfigs(dayPlan.bonuses)`

4. Split overnight surcharges: `configs.flatMap(c => splitOvernightSurcharge(c))`

5. Extract work periods: `extractWorkPeriods(calcPairs)`

6. Calculate surcharges: `calculateSurcharges(workPeriods, configs, isHoliday, holidayCategory, dailyValue.netTime)`

7. Upsert each surcharge result as DailyAccountValue with source="surcharge"

**Logic for `notifyDailyCalcError`** (port of Go lines 251-277):

1. Skip if current has no error
2. Skip if previous already had error (prevent duplicate notifications)
3. Lookup user for the employee:
   ```typescript
   const emp = await this.prisma.employee.findFirst({
     where: { id: employeeId },
     select: { id: true, tenantId: true },
   })
   ```
4. Find user linked to employee (via user_tenants or similar)
5. Create notification:
   ```typescript
   const dateLabel = date.toISOString().split("T")[0]
   await this.prisma.notification.create({
     data: {
       tenantId,
       userId: userId, // resolved above
       type: "errors",
       title: "Timesheet error",
       message: `Calculation error detected on ${dateLabel}.`,
       link: `/timesheet?view=day&date=${dateLabel}`,
     },
   })
   ```
   Note: If user lookup fails, silently skip (best effort, same as Go).

### Verification

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.test.ts -t "upsert|postDailyAccount|postSurcharge|notify"
```

---

## Phase 7: Wire Up `calculateDay()` + `calculateDateRange()`

### Goal
Complete the main `calculateDay()` orchestrator and add the bulk `calculateDateRange()` method.

### Files to Modify

#### 7a. `apps/web/src/server/services/daily-calc.ts`

**Implement `calculateDay()`** (port of Go lines 176-249):

```typescript
async calculateDay(
  tenantId: string,
  employeeId: string,
  date: Date
): Promise<DailyValue | null> {
  // 1. Check for holiday
  const { isHoliday, holidayCategory } = await this.checkHoliday(tenantId, date)

  // 2. Get day plan (null = no plan assigned = off day)
  const empDayPlan = await this.loadEmployeeDayPlan(employeeId, date)

  // 3. Load bookings (includes adjacent days for day change behavior)
  const bookings = await this.loadBookingsForCalculation(
    tenantId, employeeId, date, empDayPlan
  )

  // 4. Branch: determine daily value
  let dvInput: DailyValueInput | null = null
  let calcPairs: BookingPair[] = []

  if (!empDayPlan || !empDayPlan.dayPlanId) {
    // Off day
    dvInput = this.handleOffDay(employeeId, date, bookings)
  } else if (isHoliday && bookings.length === 0) {
    // Holiday without bookings -- check absence priority
    const absence = await this.loadAbsenceDay(employeeId, date)
    if (
      absence &&
      absence.status === "approved" &&
      absence.at_priority !== null &&
      absence.at_priority > 0
    ) {
      dvInput = await this.handleAbsenceCredit(employeeId, date, empDayPlan, absence)
    } else {
      dvInput = await this.handleHolidayCredit(employeeId, date, empDayPlan, holidayCategory)
    }
  } else if (bookings.length === 0) {
    // No bookings -- apply no-booking behavior
    dvInput = await this.handleNoBookings(tenantId, employeeId, date, empDayPlan)
    if (dvInput === null) {
      return null // Skip behavior
    }
  } else {
    // Normal calculation with bookings
    const result = await this.calculateWithBookings(
      tenantId, employeeId, date, empDayPlan, bookings, isHoliday
    )
    dvInput = result.dailyValue
    calcPairs = result.calcPairs
  }

  // 5. Get previous value (for error notification)
  const previousValue = await this.getPreviousDailyValue(employeeId, date)

  // 6. Set tenant and upsert
  dvInput.tenantId = tenantId
  const savedDv = await this.upsertDailyValue(dvInput)

  // 7. Post daily account values (net/cap)
  await this.postDailyAccountValues(tenantId, employeeId, date, empDayPlan, dvInput)

  // 8. Post surcharge values
  await this.postSurchargeValues(
    tenantId, employeeId, date, empDayPlan, dvInput,
    calcPairs, isHoliday, holidayCategory
  )

  // 9. Notify on new errors
  await this.notifyDailyCalcError(
    tenantId, employeeId, date,
    previousValue?.hasError ?? false,
    dvInput.hasError
  )

  return savedDv
}
```

**Implement `calculateDateRange()`** (port of Go lines 1240-1250):

```typescript
async calculateDateRange(
  tenantId: string,
  employeeId: string,
  fromDate: Date,
  toDate: Date
): Promise<{ count: number; values: DailyValue[] }> {
  const values: DailyValue[] = []
  let count = 0
  const current = new Date(fromDate)

  while (current <= toDate) {
    const dv = await this.calculateDay(tenantId, employeeId, new Date(current))
    count++
    if (dv) {
      values.push(dv)
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return { count, values }
}
```

### Verification

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.test.ts -t "calculateDay|calculateDateRange"
```

---

## Phase 8: Calculation Log

### Goal
Add optional calculation log support -- a JSON trace of the calculation steps for debugging.

### Design Decision

The Go code does not have an explicit calculation log implementation in `daily_calc.go`. The ticket mentions it as a requirement. We implement it as an optional JSON field on DailyValue or as a separate lightweight structure returned alongside the result.

Since DailyValue does not have a `calculationLog` column in the Prisma schema, we have two options:
1. Add a `calculationLog` JSONB column via migration (requires separate schema ticket)
2. Store logs in a separate table or return them without persisting

**Recommended approach**: Add a `buildCalculationLog()` method that returns a structured JSON object summarizing the calculation steps. This can be stored later when the schema column is added. For now, include it in the method return type as optional metadata.

### Files to Modify

#### 8a. `apps/web/src/server/services/daily-calc.types.ts`

Add:

```typescript
export interface CalculationLog {
  timestamp: string
  employeeId: string
  date: string
  steps: CalculationLogStep[]
}

export interface CalculationLogStep {
  phase: string
  description: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
}
```

#### 8b. `apps/web/src/server/services/daily-calc.ts`

Add a log accumulator pattern within `calculateDay()` that collects steps:

```typescript
private buildCalculationLog(
  employeeId: string,
  date: Date,
  steps: CalculationLogStep[]
): CalculationLog
```

Steps to log:
1. Holiday check result
2. Day plan loaded (or null)
3. Bookings loaded (count, day change behavior used)
4. Branch taken (off_day / holiday / no_bookings / calculate)
5. Target hours resolved
6. Shift detection result (if applicable)
7. Calculation input summary
8. Calculation result summary
9. DailyValue upserted
10. Account postings made

This is informational and does not affect calculation correctness.

### Verification

```bash
cd apps/web && npx tsc --noEmit
```

---

## Phase 9: Tests

### Goal
Comprehensive test coverage for the DailyCalcService.

### Files to Create

#### 9a. `apps/web/src/server/services/__tests__/daily-calc.helpers.test.ts`

Pure function tests (no DB):

```typescript
describe("daily-calc helpers", () => {
  describe("sameDate", () => { /* UTC date comparisons */ })
  describe("addDays", () => { /* date arithmetic */ })
  describe("isBreakBooking", () => { /* P1, P2, BREAK_START, BREAK_END */ })
  describe("bookingDirection", () => { /* in/out from bookingType */ })
  describe("effectiveTime", () => { /* calculatedTime ?? editedTime */ })
  describe("sortedBookings", () => { /* sort by date, time, id */ })
  describe("filterBookingsByDate", () => { /* only matching date */ })
  describe("partitionBookingsByDate", () => { /* prev/current/next */ })
  describe("pairWorkBookingsAcrossDays", () => {
    it("pairs same-day IN/OUT")
    it("pairs cross-midnight IN(day0)/OUT(day1)")
    it("handles unpaired arrivals")
    it("pairs FIFO with multiple pairs")
    it("ignores break bookings")
  })
  describe("applyDayChangeBehavior", () => {
    describe("at_arrival", () => {
      it("includes next-day departure for arrival on current day")
      it("excludes current-day departure for arrival on previous day")
    })
    describe("at_departure", () => {
      it("includes previous-day arrival for departure on current day")
      it("excludes current-day arrival for departure on next day")
    })
  })
  describe("findFirstLastWorkBookings", () => {
    it("finds earliest IN and latest OUT")
    it("returns null for empty bookings")
    it("ignores break bookings")
  })
  describe("getHolidayCredit", () => {
    it("returns cat1 for category 1")
    it("returns cat2 for category 2")
    it("returns 0 for unconfigured category")
  })
  describe("getEffectiveRegularHours", () => {
    it("uses employee master when configured")
    it("uses regularHours2 for absence day")
    it("defaults to regularHours")
  })
  describe("convertBonusesToSurchargeConfigs", () => {
    it("maps bonus fields to surcharge config")
    it("sets appliesOnWorkday as inverse of appliesOnHoliday")
  })
  describe("calculateAbsenceCredit", () => {
    it("full portion = regelarbeitszeit * duration")
    it("half portion = 0.5 * regelarbeitszeit * duration")
    it("none portion = 0")
  })
})
```

#### 9b. `apps/web/src/server/services/__tests__/daily-calc.test.ts`

Service tests using mocked Prisma:

```typescript
import { mockDeep, DeepMockProxy } from "jest-mock-extended"
// Or vitest mocking approach

describe("DailyCalcService", () => {
  let service: DailyCalcService
  let prisma: DeepMockProxy<PrismaClient>

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>()
    service = new DailyCalcService(prisma)
  })

  describe("calculateDay", () => {
    it("handles off day (no day plan)")
    it("handles off day with bookings (warning)")
    it("handles holiday without bookings (category 1)")
    it("handles holiday with absence priority override")
    it("handles no bookings - error behavior")
    it("handles no bookings - adopt_target behavior")
    it("handles no bookings - deduct_target behavior")
    it("handles no bookings - vocational_school (past date)")
    it("handles no bookings - vocational_school (future date, no absence created)")
    it("handles no bookings - target_with_order")
    it("calculates standard 8h work day")
    it("calculates with overtime")
    it("calculates with undertime")
    it("calculates with breaks (auto-deduct)")
    it("adds WORKED_ON_HOLIDAY warning when bookings exist on holiday")
    it("uses shift detection to switch day plan")
    it("uses flextime tolerance adjustments")
    it("uses rounding relative to plan")
    it("upserts DailyValue correctly")
    it("posts net_time account value")
    it("posts capped_time account value")
    it("posts surcharge account values")
    it("notifies on new error detection")
    it("does not notify when previous had error")
    it("handles day change behavior at_arrival")
    it("handles day change behavior at_departure")
    it("handles auto_complete day change")
    it("resolves target hours from employee master")
    it("resolves target hours from regularHours2 on absence day")
  })

  describe("calculateDateRange", () => {
    it("calculates 7 days sequentially")
    it("returns count and values")
    it("handles errors mid-range")
  })
})
```

#### 9c. `apps/web/src/lib/calculation/__tests__/shift-detection.test.ts`

```typescript
describe("shift detection", () => {
  describe("isInTimeWindow", () => { /* boundary tests */ })
  describe("matchesPlan", () => {
    it("returns none when no windows configured")
    it("matches arrival only")
    it("matches departure only")
    it("matches both when both configured")
    it("requires both to match when both configured")
  })
  describe("ShiftDetector.detectShift", () => {
    it("returns original plan when no detection configured")
    it("returns original plan when no bookings")
    it("matches original plan arrival window")
    it("falls through to alternative on mismatch")
    it("returns error when no plan matches")
    it("iterates up to 6 alternatives")
  })
})
```

### Verification

```bash
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.helpers.test.ts
cd apps/web && npx vitest run src/server/services/__tests__/daily-calc.test.ts
cd apps/web && npx vitest run src/lib/calculation/__tests__/shift-detection.test.ts
cd apps/web && npx vitest run --coverage src/server/services/ src/lib/calculation/shift-detection.ts
```

---

## Summary: All Files

### New Files (8)

| File | Purpose | Est. Lines |
|---|---|---|
| `apps/web/src/server/services/daily-calc.ts` | Main DailyCalcService class | ~700 |
| `apps/web/src/server/services/daily-calc.types.ts` | TypeScript types/interfaces/constants | ~120 |
| `apps/web/src/server/services/daily-calc.helpers.ts` | Pure helper functions | ~350 |
| `apps/web/src/lib/calculation/shift-detection.ts` | Shift detection port from Go | ~180 |
| `apps/web/src/server/services/__tests__/daily-calc.test.ts` | Service unit tests | ~500 |
| `apps/web/src/server/services/__tests__/daily-calc.helpers.test.ts` | Helper unit tests | ~400 |
| `apps/web/src/lib/calculation/__tests__/shift-detection.test.ts` | Shift detection tests | ~200 |

### Modified Files (1)

| File | Change |
|---|---|
| `apps/web/src/lib/calculation/index.ts` | Add shift detection re-exports |

### Total Estimated Lines: ~2,450

---

## Implementation Order (Dependency Graph)

```
Phase 1: Types + Helpers + Skeleton
    |
    +-- Phase 2: Booking Loading + Day Change
    |       |
    +-- Phase 3: Day Plan + Holiday + Target Hours
    |       |
    +-- Phase 4: Shift Detection + buildCalcInput
    |       |
    +-- Phase 5: Special Case Handlers
            |
            Phase 6: Upsert + Account Postings + Notification
                |
                Phase 7: Wire Up calculateDay + calculateDateRange
                    |
                    Phase 8: Calculation Log
                        |
                        Phase 9: Tests (can be written alongside each phase)
```

Phases 2, 3, and 4 can be developed in parallel as they are independent private methods. They all converge in Phase 7 when `calculateDay()` is wired up.

---

## Edge Cases Checklist

- [ ] Midnight-crossing bookings with all 4 day change behaviors
- [ ] Auto-complete booking creation is idempotent
- [ ] Off day with and without bookings
- [ ] Holiday with no bookings (3 categories)
- [ ] Holiday with absence priority override (priority > 0 vs = 0)
- [ ] Holiday with bookings (WORKED_ON_HOLIDAY warning)
- [ ] All 5 no-booking behaviors
- [ ] Vocational school auto-absence only for past dates
- [ ] Target hours from employee master (Decimal -> minutes conversion)
- [ ] Target hours from regularHours2 on absence day
- [ ] Flextime tolerance adjustments (comePlus=0, goMinus=0)
- [ ] Fixed plan without variableWorkTime (comeMinus=0)
- [ ] Rounding relative to plan (from system settings)
- [ ] Shift detection with up to 6 alternatives
- [ ] Shift detection error (NO_MATCHING_SHIFT)
- [ ] Booking calculated times written back after calculation
- [ ] Surcharge overnight split
- [ ] Surcharge minWorkMinutes gate
- [ ] DailyValue upsert on composite unique (employeeId, valueDate)
- [ ] DailyAccountValue upsert on 4-column composite unique
- [ ] Error notification only on NEW errors (not re-notification)
- [ ] Date comparison uses UTC to avoid timezone bugs
- [ ] Prisma Decimal handling (employee.dailyTargetHours, absenceDay.duration)
- [ ] Empty bookings array handling in every path
