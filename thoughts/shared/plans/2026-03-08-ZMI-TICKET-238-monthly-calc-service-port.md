# ZMI-TICKET-238: MonthlyCalcService Port (Go to TypeScript) -- Implementation Plan

## Overview

Port the MonthlyCalcService from Go to TypeScript. This includes:
1. Pure monthly calculation engine (`calculation/monthly.go` -> `calculation/monthly.ts`)
2. MonthlyCalcService + MonthlyEvalService merged into a single TypeScript service class
3. Monthly warning codes added to the existing errors.ts
4. Comprehensive test suites for both the pure calculation engine and the service

**Go source files being ported (total ~947 lines + 250 lines calc):**
- `apps/api/internal/calculation/monthly.go` (250 lines) -- pure math
- `apps/api/internal/service/monthlycalc.go` (203 lines) -- orchestration
- `apps/api/internal/service/monthlyeval.go` (502 lines) -- evaluation logic
- `apps/api/internal/repository/monthlyvalue.go` (242 lines) -- replaced by inline Prisma queries

**Go test files being ported (total ~2,813 lines):**
- `apps/api/internal/calculation/monthly_test.go` (851 lines)
- `apps/api/internal/service/monthlycalc_test.go` (429 lines)
- `apps/api/internal/service/monthlyeval_test.go` (858 lines)
- `apps/api/internal/repository/monthlyvalue_test.go` (675 lines) -- not ported (Prisma handles this)

## Prerequisites

- **ZMI-TICKET-237** (Prisma Schema: AbsenceDay model) -- MUST be completed first. The `AbsenceDay` Prisma model is needed for querying absence days via Prisma. Check that `AbsenceDay` model exists in `apps/web/prisma/schema.prisma` and that `npx prisma generate` has been run.
- **ZMI-TICKET-233** (Calculation Engine) -- COMPLETED. Pure math functions at `apps/web/src/lib/calculation/`.
- **ZMI-TICKET-234** (DailyCalcService) -- COMPLETED. Service at `apps/web/src/server/services/daily-calc.ts`.
- **ZMI-TICKET-236** (DailyValues Router) -- COMPLETED.

## Files to Create

| # | File | Purpose | Lines (est.) |
|---|------|---------|-------------|
| 1 | `apps/web/src/lib/calculation/monthly.ts` | Pure monthly calculation engine | ~220 |
| 2 | `apps/web/src/lib/calculation/__tests__/monthly.test.ts` | Tests for pure calculation | ~700 |
| 3 | `apps/web/src/server/services/monthly-calc.types.ts` | TypeScript types for monthly calc | ~80 |
| 4 | `apps/web/src/server/services/monthly-calc.ts` | MonthlyCalcService (merged calc + eval) | ~450 |
| 5 | `apps/web/src/server/services/__tests__/monthly-calc.test.ts` | Tests for service | ~900 |

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `apps/web/src/lib/calculation/errors.ts` | Add 4 monthly warning codes |
| 2 | `apps/web/src/lib/calculation/index.ts` | Re-export monthly functions and types |

## What We're NOT Doing

- NOT creating the monthlyValues tRPC router (that is ZMI-TICKET-239)
- NOT modifying the Prisma schema (MonthlyValue already exists, AbsenceDay added in ZMI-TICKET-237)
- NOT modifying the Go backend
- NOT creating database migrations
- NOT porting `monthlyvalue_test.go` repository tests (Prisma handles data access)

---

## Phase 1: Monthly Warning Codes

### Overview
Add the 4 monthly-specific warning codes to the existing calculation errors.ts file and re-export them.

### File: `apps/web/src/lib/calculation/errors.ts`

Add after the existing daily warning codes (after the `WARN_AUTO_BREAK_APPLIED` line, before the `ERROR_CODES` set):

```typescript
// --- Monthly calculation warning codes ---

/** FlextimeCredited capped at monthly max */
export const WARN_MONTHLY_CAP_REACHED = "MONTHLY_CAP_REACHED"
/** FlextimeEnd hit positive/negative balance cap */
export const WARN_FLEXTIME_CAPPED = "FLEXTIME_CAPPED"
/** Overtime below threshold, forfeited */
export const WARN_BELOW_THRESHOLD = "BELOW_THRESHOLD"
/** Credit type resets balance to zero */
export const WARN_NO_CARRYOVER = "NO_CARRYOVER"
```

These map 1:1 to the Go constants in `apps/api/internal/calculation/errors.go` lines 42-45:
- `WarnCodeMonthlyCap` -> `WARN_MONTHLY_CAP_REACHED`
- `WarnCodeFlextimeCapped` -> `WARN_FLEXTIME_CAPPED`
- `WarnCodeBelowThreshold` -> `WARN_BELOW_THRESHOLD`
- `WarnCodeNoCarryover` -> `WARN_NO_CARRYOVER`

### Verification
```bash
cd apps/web && npx tsc --noEmit
```
No new errors should appear. The `index.ts` already re-exports everything via `export * from "./errors"`.

---

## Phase 2: Pure Monthly Calculation Engine

### Overview
Port `apps/api/internal/calculation/monthly.go` (250 lines) to TypeScript. This is a pure-function module with no DB access.

### File: `apps/web/src/lib/calculation/monthly.ts`

Port from Go: `apps/api/internal/calculation/monthly.go`

#### Types to define

```typescript
import { Decimal } from "@prisma/client/runtime/library"
import {
  WARN_MONTHLY_CAP_REACHED,
  WARN_FLEXTIME_CAPPED,
  WARN_BELOW_THRESHOLD,
  WARN_NO_CARRYOVER,
} from "./errors"

// CreditType defines how overtime is credited to the flextime account.
export type CreditType =
  | "no_evaluation"
  | "complete_carryover"
  | "after_threshold"
  | "no_carryover"

export const CREDIT_TYPE_NO_EVALUATION: CreditType = "no_evaluation"
export const CREDIT_TYPE_COMPLETE_CARRYOVER: CreditType = "complete_carryover"
export const CREDIT_TYPE_AFTER_THRESHOLD: CreditType = "after_threshold"
export const CREDIT_TYPE_NO_CARRYOVER: CreditType = "no_carryover"

export interface DailyValueInput {
  date: string           // YYYY-MM-DD
  grossTime: number      // Minutes
  netTime: number        // Minutes
  targetTime: number     // Minutes
  overtime: number       // Minutes (positive)
  undertime: number      // Minutes (positive, to subtract)
  breakTime: number      // Minutes
  hasError: boolean
}

export interface MonthlyEvaluationInput {
  creditType: CreditType
  flextimeThreshold: number | null     // Threshold for after_threshold mode
  maxFlextimePerMonth: number | null   // Monthly credit cap
  flextimeCapPositive: number | null   // Upper balance limit
  flextimeCapNegative: number | null   // Lower balance limit (stored as positive value)
  annualFloorBalance: number | null    // Year-end annual floor
}

export interface AbsenceSummaryInput {
  vacationDays: Decimal
  sickDays: number
  otherAbsenceDays: number
}

export interface MonthlyCalcInput {
  dailyValues: DailyValueInput[]
  previousCarryover: number           // Flextime balance from previous month (minutes)
  evaluationRules: MonthlyEvaluationInput | null  // null = no evaluation
  absenceSummary: AbsenceSummaryInput
}

export interface MonthlyCalcOutput {
  // Aggregated totals (all in minutes)
  totalGrossTime: number
  totalNetTime: number
  totalTargetTime: number
  totalOvertime: number
  totalUndertime: number
  totalBreakTime: number

  // Flextime tracking (all in minutes)
  flextimeStart: number      // PreviousCarryover
  flextimeChange: number     // TotalOvertime - TotalUndertime
  flextimeRaw: number        // FlextimeStart + FlextimeChange
  flextimeCredited: number   // Amount actually credited after rules
  flextimeForfeited: number  // Amount forfeited due to rules
  flextimeEnd: number        // Final balance after all rules

  // Work summary
  workDays: number
  daysWithErrors: number

  // Absence copy
  vacationTaken: Decimal
  sickDays: number
  otherAbsenceDays: number

  // Warnings
  warnings: string[]
}
```

#### Functions to implement

**1. `calculateMonth(input: MonthlyCalcInput): MonthlyCalcOutput`**

Port of Go `CalculateMonth()`. Steps:
1. Initialize output: `flextimeStart = input.previousCarryover`, copy absence summary, `warnings = []`
2. Aggregate daily values: sum all time fields, count `workDays` (grossTime > 0 || netTime > 0), count `daysWithErrors` (hasError === true)
3. `flextimeChange = totalOvertime - totalUndertime`
4. `flextimeRaw = flextimeStart + flextimeChange`
5. If `evaluationRules !== null`: call `applyCreditType(output, rules)`. Else: direct transfer (`flextimeCredited = flextimeChange`, `flextimeEnd = flextimeRaw`, `flextimeForfeited = 0`)

**2. `applyCreditType(output: MonthlyCalcOutput, rules: MonthlyEvaluationInput): MonthlyCalcOutput`**

Port of Go `applyCreditType()`. Switch on `rules.creditType`:

- **no_evaluation**: Direct 1:1 transfer (same as null rules)
- **complete_carryover**: Apply monthly cap -> compute end balance -> apply positive/negative caps
- **after_threshold**: Credit only excess above threshold -> forfeit below threshold -> apply monthly cap -> apply positive/negative caps
- **no_carryover**: Reset to 0, forfeit all change

For the detailed logic, follow the Go implementation exactly -- see `apps/api/internal/calculation/monthly.go` lines 136-218.

**3. `applyFlextimeCaps(flextime: number, capPositive: number | null, capNegative: number | null): { value: number; forfeited: number }`**

Port of Go `applyFlextimeCaps()`. Returns capped value and forfeited amount.

Note: Go returns `(int, int)` as positional tuple. TypeScript returns a named object `{ value, forfeited }`.

**4. `calculateAnnualCarryover(currentBalance: number | null, annualFloor: number | null): number`**

Port of Go `CalculateAnnualCarryover()`. If `currentBalance` is null, return 0. If `annualFloor` is set and balance is below `-annualFloor`, return `-annualFloor`. Otherwise return balance.

### File: `apps/web/src/lib/calculation/index.ts`

Add re-exports for monthly functions and types:

```typescript
// Monthly calculation
export type {
  CreditType,
  DailyValueInput as MonthlyDailyValueInput,
  MonthlyEvaluationInput,
  AbsenceSummaryInput,
  MonthlyCalcInput,
  MonthlyCalcOutput,
} from "./monthly"
export {
  calculateMonth,
  calculateAnnualCarryover,
  CREDIT_TYPE_NO_EVALUATION,
  CREDIT_TYPE_COMPLETE_CARRYOVER,
  CREDIT_TYPE_AFTER_THRESHOLD,
  CREDIT_TYPE_NO_CARRYOVER,
} from "./monthly"
```

Note: The `DailyValueInput` name conflicts with the one in `daily-calc.types.ts`, so alias it as `MonthlyDailyValueInput` in the re-export. Within the `monthly.ts` file itself, it's just `DailyValueInput`. The service file will import from `./monthly` directly.

### Verification
```bash
cd apps/web && npx tsc --noEmit
```

---

## Phase 3: Monthly Calculation Engine Tests

### Overview
Port `apps/api/internal/calculation/monthly_test.go` (851 lines) to TypeScript using vitest.

### File: `apps/web/src/lib/calculation/__tests__/monthly.test.ts`

Create the `__tests__` directory if it doesn't exist.

#### Test structure

Use `describe`/`it` blocks matching the Go test groups. Import from `../monthly` directly.

```typescript
import { describe, it, expect } from "vitest"
import { Decimal } from "@prisma/client/runtime/library"
import {
  calculateMonth,
  calculateAnnualCarryover,
  type MonthlyCalcInput,
  type MonthlyEvaluationInput,
  type AbsenceSummaryInput,
} from "../monthly"
import {
  WARN_MONTHLY_CAP_REACHED,
  WARN_FLEXTIME_CAPPED,
  WARN_BELOW_THRESHOLD,
  WARN_NO_CARRYOVER,
} from "../errors"
```

#### Helper: Default absence summary

```typescript
function emptyAbsences(): AbsenceSummaryInput {
  return { vacationDays: new Decimal(0), sickDays: 0, otherAbsenceDays: 0 }
}
```

#### Test groups to port (from `monthly_test.go`)

**Group 1: Daily Value Aggregation**
- `TestCalculateMonth_Aggregation_BasicSums` -- 3 days, verify all 6 time totals + workDays + daysWithErrors
- `TestCalculateMonth_Aggregation_EmptyDays` -- empty array, verify all zeros except carryover
- `TestCalculateMonth_Aggregation_SingleDay` -- 1 day
- `TestCalculateMonth_WorkDays_OnlyGrossTime` -- grossTime > 0, netTime = 0 -> workDay counted
- `TestCalculateMonth_WorkDays_OnlyNetTime` -- grossTime = 0, netTime > 0 -> workDay counted
- `TestCalculateMonth_WorkDays_ZeroTimeNotCounted` -- grossTime = 0 and netTime = 0 -> not counted
- `TestCalculateMonth_DaysWithErrors` -- hasError = true on some days

**Group 2: CreditType NoEvaluation**
- Overtime, Undertime, Mixed scenarios

**Group 3: CreditType CompleteCarryover**
- NoCaps, MonthlyCap, PositiveCap, NegativeCap, BothCaps, Undertime

**Group 4: CreditType AfterThreshold**
- AboveThreshold, AtThreshold, BelowThreshold, Undertime, NilThreshold, WithCaps

**Group 5: CreditType NoCarryover**
- Overtime, Undertime, WithPreviousBalance

**Group 6: Edge Cases**
- NilEvaluationRules (null), UnknownCreditType (defaults to no_evaluation), ZeroPreviousCarryover, NegativePreviousCarryover, LargePreviousCarryover

**Group 7: Absence Summary**
- PassThrough (vacation + sick + other values preserved), HalfDayVacation (Decimal(0.5))

**Group 8: Warnings**
- MonthlyCap warning, FlextimeCapped warning, BelowThreshold warning, NoCarryover warning, EmptyByDefault

**Group 9: CalculateAnnualCarryover**
- NullBalance (returns 0), PositiveNoFloor, NegativeAboveFloor, NegativeBelowFloor, NullFloor

**Group 10: Caps via CalculateMonth (integration)**
- NoCapsApplied, PositiveCapExceeded, NegativeCapExceeded, BothCapsNull

**Group 11: Ticket Test Cases (real-world examples)**
- CompleteCarryover (600min overtime, 480 cap -> credited 480)
- AfterThreshold (300min overtime, 120 threshold -> credited 180)

Each test should use the same input values as the Go test and assert the same expected output values. The Go test file (`apps/api/internal/calculation/monthly_test.go`) is the authoritative source for test values.

### Verification
```bash
cd apps/web && npx vitest run --reporter=verbose src/lib/calculation/__tests__/monthly.test.ts
```

All tests must pass. Expected: ~50 test cases.

---

## Phase 4: MonthlyCalcService Types

### Overview
Define TypeScript types used by the MonthlyCalcService.

### File: `apps/web/src/server/services/monthly-calc.types.ts`

Port from Go: `monthlyeval.go` (MonthSummary type) and `monthlycalc.go` (result types).

```typescript
/**
 * MonthlyCalcService Types
 *
 * TypeScript interfaces and constants for the MonthlyCalcService.
 * Ported from Go: apps/api/internal/service/monthlyeval.go, monthlycalc.go
 */
import type { Decimal } from "@prisma/client/runtime/library"
import type { Prisma } from "@/generated/prisma/client"

// --- Absence category constants ---
// Values stored in absence_types.category column

export const ABSENCE_CATEGORY_VACATION = "vacation"
export const ABSENCE_CATEGORY_ILLNESS = "illness"
export const ABSENCE_CATEGORY_SPECIAL = "special"

// --- Absence status constants ---

export const ABSENCE_STATUS_APPROVED = "approved"

// --- Error messages ---

export const ERR_FUTURE_MONTH = "cannot calculate future month"
export const ERR_MONTH_CLOSED = "cannot modify closed month"
export const ERR_MONTH_NOT_CLOSED = "month is not closed"
export const ERR_INVALID_MONTH = "invalid month"
export const ERR_INVALID_YEAR_MONTH = "invalid year or month"
export const ERR_MONTHLY_VALUE_NOT_FOUND = "monthly value not found"
export const ERR_EMPLOYEE_NOT_FOUND = "employee not found"

// --- Result types ---

/** A single monthly calculation failure. */
export interface MonthlyCalcError {
  employeeId: string
  year: number
  month: number
  error: string
}

/** Outcome of a monthly calculation operation. */
export interface MonthlyCalcResult {
  processedMonths: number
  skippedMonths: number   // Months skipped due to being closed
  failedMonths: number
  errors: MonthlyCalcError[]
}

/** Monthly aggregation summary for an employee. */
export interface MonthSummary {
  employeeId: string
  year: number
  month: number

  // Time totals (minutes)
  totalGrossTime: number
  totalNetTime: number
  totalTargetTime: number
  totalOvertime: number
  totalUndertime: number
  totalBreakTime: number

  // Flextime tracking (minutes)
  flextimeStart: number
  flextimeChange: number
  flextimeEnd: number
  flextimeCarryover: number

  // Absence summary
  vacationTaken: Decimal
  sickDays: number
  otherAbsenceDays: number

  // Work summary
  workDays: number
  daysWithErrors: number

  // Status
  isClosed: boolean
  closedAt: Date | null
  closedBy: string | null
  reopenedAt: Date | null
  reopenedBy: string | null

  // Warnings from calculation
  warnings: string[]
}

// --- Prisma include types ---

/** AbsenceDay with absenceType relation loaded */
export type AbsenceDayWithType = Prisma.AbsenceDayGetPayload<{
  include: { absenceType: true }
}>
```

### Verification
```bash
cd apps/web && npx tsc --noEmit
```

---

## Phase 5: MonthlyCalcService Implementation

### Overview
Port both `monthlycalc.go` (orchestration) and `monthlyeval.go` (evaluation logic) into a single TypeScript service class. Repository methods are replaced by inline Prisma queries.

### File: `apps/web/src/server/services/monthly-calc.ts`

Port from Go:
- `apps/api/internal/service/monthlycalc.go` (203 lines)
- `apps/api/internal/service/monthlyeval.go` (502 lines)
- Repository methods from `apps/api/internal/repository/monthlyvalue.go` (inlined as Prisma queries)

#### Class structure

```typescript
/**
 * MonthlyCalcService
 *
 * Orchestrates monthly time calculations for employees.
 * Aggregates DailyValues into MonthlyValues, applies flextime credit rules,
 * and manages month closing/reopening.
 *
 * Ported from Go:
 * - apps/api/internal/service/monthlycalc.go (203 lines) -- batch orchestration
 * - apps/api/internal/service/monthlyeval.go (502 lines) -- evaluation logic
 * - apps/api/internal/repository/monthlyvalue.go (242 lines) -- data access (inlined)
 *
 * Dependencies:
 * - ZMI-TICKET-237: Prisma models (AbsenceDay)
 * - ZMI-TICKET-233: Calculation Engine (monthly.ts)
 */

import type { PrismaClient, MonthlyValue } from "@/generated/prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { calculateMonth } from "@/lib/calculation/monthly"
import type {
  MonthlyCalcInput,
  MonthlyEvaluationInput,
  AbsenceSummaryInput,
  DailyValueInput,
  MonthlyCalcOutput,
} from "@/lib/calculation/monthly"
import type {
  MonthlyCalcResult,
  MonthlyCalcError,
  MonthSummary,
  AbsenceDayWithType,
} from "./monthly-calc.types"
import {
  ABSENCE_CATEGORY_VACATION,
  ABSENCE_CATEGORY_ILLNESS,
  ABSENCE_STATUS_APPROVED,
  ERR_FUTURE_MONTH,
  ERR_MONTH_CLOSED,
  ERR_MONTH_NOT_CLOSED,
  ERR_INVALID_MONTH,
  ERR_INVALID_YEAR_MONTH,
  ERR_MONTHLY_VALUE_NOT_FOUND,
  ERR_EMPLOYEE_NOT_FOUND,
} from "./monthly-calc.types"

export class MonthlyCalcService {
  constructor(private prisma: PrismaClient) {}

  // ... methods below
}
```

#### Public methods (10 total, matching Go interfaces)

**From monthlycalc.go (orchestration):**

1. **`async calculateMonth(employeeId: string, year: number, month: number): Promise<MonthlyValue>`**
   - Validates not future month (compare against `new Date()`)
   - Calls `this.recalculateMonth(employeeId, year, month)`
   - Retrieves and returns the persisted MonthlyValue via `this.getByEmployeeMonth()`
   - Throws: `ERR_FUTURE_MONTH`, `ERR_MONTH_CLOSED`, or propagated errors

2. **`calculateMonthBatch(employeeIds: string[], year: number, month: number): Promise<MonthlyCalcResult>`**
   - Validates not future month (all employees fail if future)
   - Iterates employees, calling `this.recalculateMonth()` for each
   - `ERR_MONTH_CLOSED` -> skippedMonths (not counted as error)
   - Other errors -> failedMonths + appended to errors
   - Success -> processedMonths
   - Note: uses `await` sequentially (matches Go serial behavior)

3. **`recalculateFromMonth(employeeId: string, startYear: number, startMonth: number): Promise<MonthlyCalcResult>`**
   - Cascading recalculation from start month through current month
   - Loop: increment month, handle year boundary (Dec -> Jan)
   - Stop when year/month exceeds current date
   - Skip closed months (continue cascade)
   - Continue on errors (process remaining months)

4. **`recalculateFromMonthBatch(employeeIds: string[], startYear: number, startMonth: number): Promise<MonthlyCalcResult>`**
   - Calls `this.recalculateFromMonth()` for each employee
   - Aggregates results (sum processedMonths, skippedMonths, failedMonths; concatenate errors)

**From monthlyeval.go (evaluation):**

5. **`async getMonthSummary(employeeId: string, year: number, month: number): Promise<MonthSummary>`**
   - Validates year/month
   - Tries to load persisted MonthlyValue
   - If found, convert with `monthlyValueToSummary()`
   - If not found, calculate on-the-fly via `calculateMonthSummary()` (does NOT persist)

6. **`async recalculateMonth(employeeId: string, year: number, month: number): Promise<void>`**
   - Validates year/month
   - Loads employee (for tenantId, tariffId)
   - Checks if month is closed (throws `ERR_MONTH_CLOSED`)
   - Gets date range, previous month carryover, daily values, absences
   - Loads tariff (ignores error if not found)
   - Builds calc input, runs `calculateMonth()` from calculation library
   - Builds MonthlyValue from output
   - Preserves existing record's id, createdAt, reopenedAt, reopenedBy if updating
   - Upserts the monthly value

7. **`async closeMonth(employeeId: string, year: number, month: number, closedBy: string): Promise<void>`**
   - Validates year/month
   - Checks monthly value exists (throws `ERR_MONTHLY_VALUE_NOT_FOUND`)
   - Checks not already closed (throws `ERR_MONTH_CLOSED`)
   - Updates: `isClosed = true, closedAt = new Date(), closedBy`

8. **`async reopenMonth(employeeId: string, year: number, month: number, reopenedBy: string): Promise<void>`**
   - Validates year/month
   - Checks monthly value exists (throws `ERR_MONTHLY_VALUE_NOT_FOUND`)
   - Checks actually closed (throws `ERR_MONTH_NOT_CLOSED`)
   - Updates: `isClosed = false, reopenedAt = new Date(), reopenedBy`

9. **`async getYearOverview(employeeId: string, year: number): Promise<MonthSummary[]>`**
   - Validates year (1900-2200)
   - Lists by employee year, converts each to MonthSummary

10. **`async getDailyBreakdown(employeeId: string, year: number, month: number): Promise<DailyValue[]>`**
    - Validates year/month
    - Returns daily values for the month's date range via Prisma query
    - Import `DailyValue` type from Prisma

#### Private helper methods

11. **`private validateYearMonth(year: number, month: number): void`**
    - Throws `ERR_INVALID_YEAR_MONTH` if year < 1900 or > 2200
    - Throws `ERR_INVALID_MONTH` if month < 1 or > 12

12. **`private monthDateRange(year: number, month: number): { from: Date; to: Date }`**
    - `from` = first day of month at midnight UTC
    - `to` = last day of month at midnight UTC
    - Use `new Date(Date.UTC(year, month - 1, 1))` for `from`
    - Use `new Date(Date.UTC(year, month, 0))` for `to` (day 0 of next month = last day of current month)

13. **`private async getByEmployeeMonth(employeeId: string, year: number, month: number): Promise<MonthlyValue | null>`**
    - Prisma: `findUnique({ where: { employeeId_year_month: { employeeId, year, month } } })`
    - Returns null if not found (NOT an error)

14. **`private async getPreviousMonth(employeeId: string, year: number, month: number): Promise<MonthlyValue | null>`**
    - Compute previous year/month (handle Jan -> Dec boundary)
    - Calls `this.getByEmployeeMonth(employeeId, prevYear, prevMonth)`

15. **`private async calculateMonthSummary(employeeId: string, year: number, month: number): Promise<MonthSummary>`**
    - Loads employee
    - Gets previous month carryover
    - Gets daily values and absences for date range
    - Loads tariff (optional)
    - Builds calc input, runs `calculateMonth()`, converts to MonthSummary

16. **`private buildMonthlyCalcInput(dailyValues: DailyValue[], absences: AbsenceDayWithType[], previousCarryover: number, tariff: Tariff | null): MonthlyCalcInput`**
    - Converts Prisma DailyValue[] to DailyValueInput[] (extract date, time fields, hasError)
    - Date formatting: `dv.valueDate` is a Date in Prisma; format as `YYYY-MM-DD` string
    - Calls `buildAbsenceSummary(absences)`
    - Calls `buildEvaluationRules(tariff)`

17. **`private buildAbsenceSummary(absences: AbsenceDayWithType[]): AbsenceSummaryInput`**
    - Filter: only `status === "approved"`
    - Filter: skip if `absenceType` relation is null/undefined
    - Switch on `absenceType.category`:
      - `"vacation"` -> `vacationDays = vacationDays.add(duration)` (Decimal addition)
      - `"illness"` -> `sickDays += new Decimal(duration).ceil().toNumber()` (rounds up 0.5 to 1)
      - default -> `otherAbsenceDays++` (counts as 1 regardless of duration)
    - Initialize: `vacationDays = new Decimal(0), sickDays = 0, otherAbsenceDays = 0`

18. **`private buildEvaluationRules(tariff: Tariff | null): MonthlyEvaluationInput | null`**
    - Returns null if tariff is null
    - Get creditType: `tariff.creditType || "no_evaluation"`
    - If creditType is `"no_evaluation"`, return null (direct 1:1 transfer)
    - Otherwise, return `MonthlyEvaluationInput` with:
      - `creditType` (cast to CreditType)
      - `flextimeThreshold: tariff.flextimeThreshold ?? null`
      - `maxFlextimePerMonth: tariff.maxFlextimePerMonth ?? null`
      - `flextimeCapPositive: tariff.upperLimitAnnual ?? null`
      - `flextimeCapNegative: tariff.lowerLimitAnnual ?? null`
      - `annualFloorBalance: null` (not used in monthly calc, only in annual carryover)

19. **`private buildMonthlyValue(tenantId: string, employeeId: string, year: number, month: number, output: MonthlyCalcOutput): MonthlyValueUpsertData`**
    - Maps calculation output to Prisma create/update data object
    - `flextimeCarryover = output.flextimeEnd` (carryover for next month)

20. **`private monthlyValueToSummary(mv: MonthlyValue): MonthSummary`**
    - Static conversion from Prisma MonthlyValue to MonthSummary
    - Sets `warnings` to empty array `[]`

#### Prisma queries used (replacing Go repository methods)

| Operation | Prisma Call |
|-----------|------------|
| GetByEmployeeMonth | `prisma.monthlyValue.findUnique({ where: { employeeId_year_month: { employeeId, year, month } } })` |
| GetPreviousMonth | Compute prev year/month, then `findUnique` |
| Upsert | `prisma.monthlyValue.upsert({ where: { employeeId_year_month }, create: {...}, update: {...} })` |
| ListByEmployeeYear | `prisma.monthlyValue.findMany({ where: { employeeId, year }, orderBy: { month: 'asc' } })` |
| CloseMonth | `prisma.monthlyValue.update({ where: { employeeId_year_month }, data: { isClosed: true, closedAt: new Date(), closedBy } })` |
| ReopenMonth | `prisma.monthlyValue.update({ where: { employeeId_year_month }, data: { isClosed: false, reopenedAt: new Date(), reopenedBy } })` |
| GetDailyValues | `prisma.dailyValue.findMany({ where: { employeeId, valueDate: { gte: from, lte: to } } })` |
| GetAbsenceDays | `prisma.absenceDay.findMany({ where: { employeeId, absenceDate: { gte: from, lte: to } }, include: { absenceType: true } })` |
| GetEmployee | `prisma.employee.findUnique({ where: { id: employeeId } })` |
| GetTariff | `prisma.tariff.findUnique({ where: { id: tariffId } })` |

#### Upsert detail

The upsert for `recalculateMonth` must NOT overwrite close/reopen status fields. The Prisma `upsert` maps to:

```typescript
await this.prisma.monthlyValue.upsert({
  where: {
    employeeId_year_month: { employeeId, year, month },
  },
  create: {
    tenantId,
    employeeId,
    year,
    month,
    ...monthlyData,  // all time/flextime/absence/work fields
  },
  update: {
    ...monthlyData,  // only time/flextime/absence/work fields
    // Does NOT update: isClosed, closedAt, closedBy, reopenedAt, reopenedBy
  },
})
```

The `monthlyData` object contains the 15 updatable columns:
- `totalGrossTime`, `totalNetTime`, `totalTargetTime`, `totalOvertime`, `totalUndertime`, `totalBreakTime`
- `flextimeStart`, `flextimeChange`, `flextimeEnd`, `flextimeCarryover`
- `vacationTaken`, `sickDays`, `otherAbsenceDays`
- `workDays`, `daysWithErrors`

#### Error handling approach

Use JavaScript `Error` class with descriptive messages matching Go error strings. The calling layer (tRPC router in ZMI-TICKET-239) will catch these and convert to TRPCError. Pattern:

```typescript
throw new Error(ERR_FUTURE_MONTH)  // "cannot calculate future month"
throw new Error(ERR_MONTH_CLOSED)   // "cannot modify closed month"
```

For `calculateMonthBatch` and `recalculateFromMonth`, errors are caught and recorded in the result object rather than thrown, matching the Go behavior.

For `recalculateMonth`, when checking `ERR_MONTH_CLOSED` errors from within batch methods, use `err.message === ERR_MONTH_CLOSED` comparison (since we don't have Go-style error wrapping).

### Verification
```bash
cd apps/web && npx tsc --noEmit
```

---

## Phase 6: MonthlyCalcService Tests

### Overview
Port tests from `monthlycalc_test.go` (429 lines) and `monthlyeval_test.go` (858 lines).

### File: `apps/web/src/server/services/__tests__/monthly-calc.test.ts`

#### Mock setup

Follow the established pattern from `daily-calc.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { MonthlyCalcService } from "../monthly-calc"
import { Decimal } from "@prisma/client/runtime/library"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  ERR_FUTURE_MONTH,
  ERR_MONTH_CLOSED,
  ERR_MONTH_NOT_CLOSED,
  ERR_INVALID_MONTH,
  ERR_INVALID_YEAR_MONTH,
  ERR_MONTHLY_VALUE_NOT_FOUND,
  ERR_EMPLOYEE_NOT_FOUND,
} from "../monthly-calc.types"

function createMockPrisma() {
  const mocks = {
    monthlyValue: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    dailyValue: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    absenceDay: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    employee: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    tariff: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  }
  return { prisma: mocks as unknown as PrismaClient, mocks }
}
```

#### Test data factories

```typescript
const TENANT_ID = "t-1"
const EMPLOYEE_ID = "e-1"
const TARIFF_ID = "tariff-1"
const CLOSER_ID = "closer-1"

function makeEmployee(overrides = {}) {
  return {
    id: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    tariffId: TARIFF_ID,
    ...overrides,
  }
}

function makeMonthlyValue(year: number, month: number, overrides = {}) {
  return {
    id: "mv-1",
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    year,
    month,
    totalGrossTime: 0,
    totalNetTime: 0,
    totalTargetTime: 0,
    totalOvertime: 0,
    totalUndertime: 0,
    totalBreakTime: 0,
    flextimeStart: 0,
    flextimeChange: 0,
    flextimeEnd: 0,
    flextimeCarryover: 0,
    vacationTaken: new Decimal(0),
    sickDays: 0,
    otherAbsenceDays: 0,
    workDays: 0,
    daysWithErrors: 0,
    isClosed: false,
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeDailyValue(dateStr: string, overrides = {}) {
  return {
    id: `dv-${dateStr}`,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    valueDate: new Date(`${dateStr}T00:00:00Z`),
    grossTime: 510,
    netTime: 480,
    targetTime: 480,
    overtime: 0,
    undertime: 0,
    breakTime: 30,
    hasError: false,
    ...overrides,
  }
}

function makeTariff(overrides = {}) {
  return {
    id: TARIFF_ID,
    tenantId: TENANT_ID,
    creditType: "no_evaluation",
    flextimeThreshold: null,
    maxFlextimePerMonth: null,
    upperLimitAnnual: null,
    lowerLimitAnnual: null,
    ...overrides,
  }
}
```

#### Test groups (from monthlycalc_test.go)

**CalculateMonth tests:**
- `Success` -- evalService calculates, returns persisted value
- `FutureMonth` -- throws ERR_FUTURE_MONTH
- `MonthClosed` -- throws ERR_MONTH_CLOSED
- `CurrentMonth` -- current month works (boundary test)

**CalculateMonthBatch tests:**
- `Success` -- 3 employees, all succeed
- `WithFailures` -- 1 of 3 fails
- `WithClosedMonths` -- 1 skipped (closed)
- `FutureMonth` -- all fail

**RecalculateFromMonth tests:**
- `Success` -- cascading from past to current month
- `SkipsClosedMonths` -- continues cascade past closed months
- `ContinuesOnError` -- processes remaining months after error
- `YearBoundary` -- December to January transition
- `CurrentMonth` -- single month (start = current)
- `FutureMonth` -- processes nothing

**RecalculateFromMonthBatch tests:**
- `Success` -- 2 employees
- `MixedResults` -- 1 processed, 1 closed

#### Test groups (from monthlyeval_test.go)

**GetMonthSummary tests:**
- `Success` -- persisted monthly value found, converted to summary
- `NotFound_CalculatesOnTheFly` -- no persisted value, calculates from daily values
- `InvalidYear` -- throws ERR_INVALID_YEAR_MONTH
- `InvalidMonth` -- throws ERR_INVALID_MONTH

**RecalculateMonth tests:**
- `Success` -- 5 work days with overtime/undertime
- `MonthClosed` -- throws ERR_MONTH_CLOSED
- `WithPreviousCarryover` -- flextime chain from previous month
- `EmployeeNotFound` -- throws ERR_EMPLOYEE_NOT_FOUND
- `InvalidMonth` -- throws ERR_INVALID_MONTH

**CloseMonth tests:**
- `Success` -- close an open month
- `AlreadyClosed` -- throws ERR_MONTH_CLOSED
- `NotFound` -- throws ERR_MONTHLY_VALUE_NOT_FOUND
- `InvalidMonth` -- throws ERR_INVALID_MONTH

**ReopenMonth tests:**
- `Success` -- reopen a closed month
- `NotClosed` -- throws ERR_MONTH_NOT_CLOSED
- `NotFound` -- throws ERR_MONTHLY_VALUE_NOT_FOUND

**GetYearOverview tests:**
- `Success` -- 2 months returned
- `Empty` -- no months -> empty array
- `InvalidYear` -- throws ERR_INVALID_YEAR_MONTH

**Helper function tests:**
- `validateYearMonth` -- 7 test cases (valid, year too low/high, month 0/13, boundaries 1/12)
- `monthDateRange` -- 4 test cases (Jan 31 days, Feb 28 days, Feb 29 leap year, Dec 31 days)

**buildAbsenceSummary tests:**
- Vacation full + half day (Decimal addition)
- Illness rounds up (0.5 -> 1 sick day)
- Special/other category
- Pending status excluded
- Null absenceType excluded

**Tariff evaluation rules tests:**
- CompleteCarryoverCapped (all tariff fields set)
- AfterThreshold
- NoCarryover
- TariffNotFound (graceful fallback -- tariff is null)

**buildEvaluationRules tests:**
- NoEvaluation (returns null)
- CompleteCarryover (all fields mapped)
- EmptyCreditType (defaults to null)

**Integration scenario tests:**
- CloseReopenRecalculate -- close -> recalc blocked -> reopen -> recalc allowed

#### Mock behavior notes

Since TypeScript has a single class with Prisma, tests will mock `prisma.monthlyValue.findUnique()` etc. The key difference from Go tests (which mock at the interface level) is that we mock at the Prisma query level.

For the `recalculateMonth` flow, the mock needs to handle multiple calls to `monthlyValue.findUnique`:
1. First call: check if month is closed (return existing or null)
2. The upsert call: `monthlyValue.upsert`

Use `vi.fn().mockResolvedValueOnce()` for ordered mock returns.

For batch tests that call `recalculateMonth` multiple times, use `vi.fn()` with implementation that switches on the `employeeId` argument.

### Verification
```bash
cd apps/web && npx vitest run --reporter=verbose src/server/services/__tests__/monthly-calc.test.ts
```

All tests must pass.

---

## Phase 7: Final Verification

### Comprehensive checks

1. **TypeScript compilation:**
   ```bash
   cd apps/web && npx tsc --noEmit
   ```
   No new errors.

2. **All calculation tests pass:**
   ```bash
   cd apps/web && npx vitest run --reporter=verbose src/lib/calculation/__tests__/monthly.test.ts
   ```

3. **All service tests pass:**
   ```bash
   cd apps/web && npx vitest run --reporter=verbose src/server/services/__tests__/monthly-calc.test.ts
   ```

4. **Existing tests still pass:**
   ```bash
   cd apps/web && npx vitest run --reporter=verbose
   ```

5. **Lint check:**
   ```bash
   cd apps/web && npm run lint
   ```

6. **File inventory verification:**

   New files created:
   - [ ] `apps/web/src/lib/calculation/monthly.ts`
   - [ ] `apps/web/src/lib/calculation/__tests__/monthly.test.ts`
   - [ ] `apps/web/src/server/services/monthly-calc.types.ts`
   - [ ] `apps/web/src/server/services/monthly-calc.ts`
   - [ ] `apps/web/src/server/services/__tests__/monthly-calc.test.ts`

   Modified files:
   - [ ] `apps/web/src/lib/calculation/errors.ts` -- 4 warning codes added
   - [ ] `apps/web/src/lib/calculation/index.ts` -- monthly re-exports added

---

## Key Design Decisions

### 1. Merged service classes
Go has two separate services (`MonthlyCalcService` + `MonthlyEvalService`) connected by interface. TypeScript merges them into one `MonthlyCalcService` class since:
- No interface-based DI in TypeScript (using Prisma directly)
- Simpler to understand and test
- Methods naturally belong together

### 2. Error handling
Go uses `errors.New()` + `errors.Is()`. TypeScript uses `throw new Error(message)` + `err.message === constant`. This matches the existing DailyCalcService pattern.

### 3. Repository layer eliminated
Go has a separate `MonthlyValueRepository`. TypeScript uses Prisma queries directly in the service, following the established DailyCalcService pattern.

### 4. Decimal handling
Go uses `shopspring/decimal`. TypeScript uses Prisma's `Decimal` type (based on `decimal.js`). Operations:
- `new Decimal(0)` for initialization
- `.add()` for addition
- `.ceil()` for ceiling
- `.toNumber()` for conversion to integer

### 5. Date handling
Go uses `time.Time` with UTC. TypeScript uses `Date` with UTC methods:
- `new Date(Date.UTC(year, month - 1, 1))` for first day of month
- `new Date(Date.UTC(year, month, 0))` for last day of month
- `date.toISOString().split('T')[0]` for YYYY-MM-DD string formatting

### 6. Future month check
Go uses `time.Now()`. TypeScript uses `new Date()`. The check is the same logic:
```typescript
const now = new Date()
if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
  throw new Error(ERR_FUTURE_MONTH)
}
```
Note: JavaScript months are 0-indexed, so `now.getMonth() + 1` converts to 1-indexed.

### 7. Null vs undefined
Prisma returns `null` for nullable fields (not `undefined`). The Go code uses `nil` pointers. TypeScript maps these as `| null` in all type definitions.

---

## References

- Research document: `thoughts/shared/research/2026-03-08-ZMI-TICKET-238-monthly-calc-service-port.md`
- Ticket: `thoughts/shared/tickets/ZMI-TICKET-238-monthly-calc-service-port.md`
- Go source: `apps/api/internal/calculation/monthly.go`
- Go source: `apps/api/internal/service/monthlycalc.go`
- Go source: `apps/api/internal/service/monthlyeval.go`
- Go source: `apps/api/internal/repository/monthlyvalue.go`
- Go tests: `apps/api/internal/calculation/monthly_test.go`
- Go tests: `apps/api/internal/service/monthlycalc_test.go`
- Go tests: `apps/api/internal/service/monthlyeval_test.go`
- TypeScript pattern: `apps/web/src/server/services/daily-calc.ts`
- TypeScript pattern: `apps/web/src/server/services/daily-calc.types.ts`
- TypeScript pattern: `apps/web/src/server/services/__tests__/daily-calc.test.ts`
- Prisma schema: `apps/web/prisma/schema.prisma` (MonthlyValue at line 2377, AbsenceDay at line 2930)
- Calculation engine: `apps/web/src/lib/calculation/`
