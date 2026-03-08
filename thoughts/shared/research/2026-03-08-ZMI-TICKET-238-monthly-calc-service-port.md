# Research: ZMI-TICKET-238 -- MonthlyCalcService Port (Go to TypeScript)

**Date**: 2026-03-08
**Branch**: staging
**Repository**: terp

## Research Question

Document the complete Go source code, tests, models, dependencies, and existing TypeScript patterns needed to port the MonthlyCalcService (monthlycalc.go, monthlyeval.go, monthlyvalue.go repository) from Go to TypeScript.

## Summary

The MonthlyCalcService consists of three Go files totaling ~947 lines (203 + 502 + 242) plus a pure calculation engine in `calculation/monthly.go` (250 lines). The service aggregates DailyValues into MonthlyValues, applies ZMI flextime credit type rules, and manages month closing/reopening. The Prisma `MonthlyValue` model already exists and matches the DB exactly. The TypeScript `calculation/` library does NOT yet have monthly calculation functions -- they need to be ported from `calculation/monthly.go`. An `AbsenceDay` Prisma model is being added in ZMI-TICKET-237 (prerequisite).

---

## 1. Go Source Code Analysis

### 1.1 monthlycalc.go (203 lines) -- Orchestration Layer

**File**: `apps/api/internal/service/monthlycalc.go`

**Purpose**: Batch and cascading monthly calculation orchestration. Delegates actual calculation to `MonthlyEvalService`.

**Dependencies (interfaces)**:
- `monthlyEvalServiceForCalc` -- provides `RecalculateMonth(ctx, employeeID, year, month)` and `GetMonthSummary(ctx, employeeID, year, month)`
- `monthlyValueRepoForCalc` -- provides `GetByEmployeeMonth(ctx, employeeID, year, month)`

**Error types**:
- `ErrFutureMonth` = "cannot calculate future month" (defined in this file)
- `ErrMonthClosed` = "cannot modify closed month" (defined in `booking.go`, shared across services)

**Result types**:
- `MonthlyCalcError` -- struct with EmployeeID (uuid), Year (int), Month (int), Error (string)
- `MonthlyCalcResult` -- struct with ProcessedMonths, SkippedMonths, FailedMonths (ints), Errors ([]MonthlyCalcError)

**Methods** (4 total):

1. **`CalculateMonth(ctx, employeeID, year, month)`** -> `(*model.MonthlyValue, error)`
   - Validates not future month (compares against `time.Now()`)
   - Calls `evalService.RecalculateMonth()` to perform calculation
   - Calls `monthlyValueRepo.GetByEmployeeMonth()` to retrieve the persisted result
   - Returns the MonthlyValue or error (ErrFutureMonth, ErrMonthClosed, or other)

2. **`CalculateMonthBatch(ctx, employeeIDs[], year, month)`** -> `*MonthlyCalcResult`
   - Validates not future month (all employees fail with same error if future)
   - Iterates employees, calling `evalService.RecalculateMonth()` for each
   - ErrMonthClosed -> SkippedMonths (not counted as error)
   - Other errors -> FailedMonths + appended to Errors
   - Success -> ProcessedMonths

3. **`RecalculateFromMonth(ctx, employeeID, startYear, startMonth)`** -> `*MonthlyCalcResult`
   - Cascading recalculation from start month through current month
   - Loop: increments month (handles year boundary: Dec->Jan)
   - Stops when year/month exceeds `time.Now()`
   - Skips closed months (continues cascade)
   - Continues on errors (processes remaining months)

4. **`RecalculateFromMonthBatch(ctx, employeeIDs[], startYear, startMonth)`** -> `*MonthlyCalcResult`
   - Calls `RecalculateFromMonth()` for each employee
   - Aggregates results (sums ProcessedMonths, SkippedMonths, FailedMonths, concatenates Errors)

### 1.2 monthlyeval.go (502 lines) -- Evaluation Logic

**File**: `apps/api/internal/service/monthlyeval.go`

**Purpose**: Business logic for monthly evaluation -- aggregation from daily values, flextime tracking, absence counting, month closing/reopening, year overview.

**Dependencies (interfaces)**:
- `monthlyValueRepoForMonthlyEval` -- GetByEmployeeMonth, GetPreviousMonth, Upsert, ListByEmployeeYear, CloseMonth, ReopenMonth
- `dailyValueRepoForMonthlyEval` -- GetByEmployeeDateRange(ctx, employeeID, from, to)
- `absenceDayRepoForMonthlyEval` -- GetByEmployeeDateRange(ctx, employeeID, from, to)
- `employeeRepoForMonthlyEval` -- GetByID(ctx, id)
- `tariffRepoForMonthlyEval` -- GetByID(ctx, id)

**Error types** (defined in this file):
- `ErrMonthNotClosed` = "month is not closed"
- `ErrInvalidMonth` = "invalid month"
- `ErrInvalidYearMonth` = "invalid year or month"
- `ErrMonthlyValueNotFound` = "monthly value not found"
- `ErrEmployeeNotFoundForEval` = "employee not found"

**Data types**:
- `MonthSummary` -- struct with EmployeeID, Year, Month, time totals (6 fields), flextime tracking (4 fields), absence summary (3 fields), work summary (2 fields), status (5 fields), Warnings []string

**Utility functions** (package-level):
- `validateYearMonth(year, month)` -- year must be 1900-2200, month 1-12
- `monthDateRange(year, month)` -- returns first and last day of month as time.Time (UTC)

**Methods** (8 total):

1. **`GetMonthSummary(ctx, employeeID, year, month)`** -> `(*MonthSummary, error)`
   - Validates year/month
   - Tries to load persisted MonthlyValue
   - If found, converts with `monthlyValueToSummary()`
   - If not found, calculates on-the-fly via `calculateMonthSummary()` (does NOT persist)

2. **`calculateMonthSummary(ctx, employeeID, year, month)`** -> `(*MonthSummary, error)` (private)
   - Loads employee (for tenantID, tariffID)
   - Gets previous month's FlextimeEnd as carryover
   - Gets daily values and absences for the month's date range
   - Optionally loads tariff for evaluation rules
   - Builds calc input, runs `calculation.CalculateMonth()`, converts to MonthSummary

3. **`RecalculateMonth(ctx, employeeID, year, month)`** -> `error`
   - Validates year/month
   - Loads employee
   - Checks if month is closed (returns ErrMonthClosed)
   - Gets date range, previous month carryover, daily values, absences
   - Loads tariff (ignores error -- tariff may be deleted)
   - Builds calc input, runs calculation
   - Builds MonthlyValue from output
   - Preserves existing record's ID, CreatedAt, ReopenedAt, ReopenedBy if updating
   - Upserts the monthly value

4. **`buildMonthlyCalcInput(dailyValues, absences, previousCarryover, tariff)`** -> `calculation.MonthlyCalcInput` (private)
   - Converts []model.DailyValue to []calculation.DailyValueInput (extracting Date, GrossTime, NetTime, TargetTime, Overtime, Undertime, BreakTime, HasError)
   - Builds absence summary via `buildAbsenceSummary()`
   - Builds evaluation rules from tariff via `buildEvaluationRules()`

5. **`buildEvaluationRules(tariff)`** -> `*calculation.MonthlyEvaluationInput` (package-level, exported)
   - Returns nil if creditType is "no_evaluation" (default)
   - Maps tariff fields to calculation input: CreditType, FlextimeThreshold, MaxFlextimePerMonth, FlextimeCapPositive (from UpperLimitAnnual), FlextimeCapNegative (from LowerLimitAnnual)

6. **`buildAbsenceSummary(absences)`** -> `calculation.AbsenceSummaryInput` (private)
   - Only counts approved absences (`ad.Status == AbsenceStatusApproved`)
   - Requires preloaded AbsenceType relation (skips if nil)
   - Switch on AbsenceType.Category:
     - `vacation` -> VacationDays += duration (Decimal addition)
     - `illness` -> SickDays += Ceil(duration).IntPart() (rounds up 0.5 to 1)
     - default -> OtherAbsenceDays++ (counts as 1 regardless of duration)

7. **`buildMonthlyValue(tenantID, employeeID, year, month, output, _)`** -> `*model.MonthlyValue` (private)
   - Maps calculation output to model fields
   - Sets `FlextimeCarryover = output.FlextimeEnd` (carryover for next month)

8. **`CloseMonth(ctx, employeeID, year, month, closedBy)`** -> `error`
   - Validates year/month
   - Checks monthly value exists (ErrMonthlyValueNotFound if nil)
   - Checks not already closed (ErrMonthClosed)
   - Delegates to `monthlyValueRepo.CloseMonth()`

9. **`ReopenMonth(ctx, employeeID, year, month, reopenedBy)`** -> `error`
   - Validates year/month
   - Checks monthly value exists (ErrMonthlyValueNotFound if nil)
   - Checks actually closed (ErrMonthNotClosed if not)
   - Delegates to `monthlyValueRepo.ReopenMonth()`

10. **`GetYearOverview(ctx, employeeID, year)`** -> `([]MonthSummary, error)`
    - Validates year (1900-2200)
    - Lists by employee year, converts each to MonthSummary

11. **`GetDailyBreakdown(ctx, employeeID, year, month)`** -> `([]model.DailyValue, error)`
    - Validates year/month
    - Returns daily values for the month's date range

**Static conversion function**:
- `monthlyValueToSummary(mv)` -> maps all MonthlyValue fields to MonthSummary, sets Warnings to empty []string

### 1.3 monthlyvalue.go Repository (242 lines)

**File**: `apps/api/internal/repository/monthlyvalue.go`

**Purpose**: GORM data access layer for monthly_values table.

**Methods** (12 total):

1. **`Create(ctx, mv)`** -- basic insert
2. **`GetByID(ctx, id)`** -- returns ErrMonthlyValueNotFound if not found
3. **`Update(ctx, mv)`** -- full update via GORM Save
4. **`Delete(ctx, id)`** -- soft check RowsAffected == 0
5. **`GetByEmployeeMonth(ctx, employeeID, year, month)`** -- returns nil, nil if not found (NOT an error)
6. **`GetPreviousMonth(ctx, employeeID, year, month)`** -- computes previous month (handles Jan->Dec year boundary), delegates to GetByEmployeeMonth
7. **`Upsert(ctx, mv)`** -- ON CONFLICT (employee_id, year, month) DO UPDATE on 15 columns (time totals, flextime, absence counts, work days, updated_at). Does NOT update is_closed, closed_at, closed_by, reopened_at, reopened_by
8. **`ListAll(ctx, filter)`** -- with MonthlyValueFilter (TenantID, EmployeeID, Year, Month, IsClosed, DepartmentID). DepartmentID joins employees table. Orders by year DESC, month DESC
9. **`ListByEmployee(ctx, employeeID)`** -- ordered by year ASC, month ASC
10. **`ListByEmployeeYear(ctx, employeeID, year)`** -- filtered by year, ordered by month ASC
11. **`IsMonthClosed(ctx, tenantID, employeeID, date)`** -- checks if the month containing the given date is closed. Returns false if no record exists
12. **`CloseMonth(ctx, employeeID, year, month, closedBy)`** -- UPDATE SET is_closed=true, closed_at=now, closed_by=closedBy
13. **`ReopenMonth(ctx, employeeID, year, month, reopenedBy)`** -- UPDATE SET is_closed=false, reopened_at=now, reopened_by=reopenedBy

### 1.4 calculation/monthly.go (250 lines) -- Pure Calculation Engine

**File**: `apps/api/internal/calculation/monthly.go`

**Purpose**: Pure math functions for monthly aggregation. No DB access, no side effects.

**Types**:
- `CreditType` string enum: `no_evaluation`, `complete_carryover`, `after_threshold`, `no_carryover`
- `MonthlyCalcInput` -- DailyValues []DailyValueInput, PreviousCarryover int, EvaluationRules *MonthlyEvaluationInput, AbsenceSummary AbsenceSummaryInput
- `DailyValueInput` -- Date string, GrossTime/NetTime/TargetTime/Overtime/Undertime/BreakTime int, HasError bool
- `MonthlyEvaluationInput` -- CreditType, FlextimeThreshold *int, MaxFlextimePerMonth *int, FlextimeCapPositive *int, FlextimeCapNegative *int, AnnualFloorBalance *int
- `AbsenceSummaryInput` -- VacationDays decimal.Decimal, SickDays int, OtherAbsenceDays int
- `MonthlyCalcOutput` -- all time totals, flextime tracking (Start/Change/Raw/Credited/Forfeited/End), work summary, absence copy, Warnings []string

**Warning codes** (from `calculation/errors.go`):
- `MONTHLY_CAP_REACHED` -- FlextimeCredited capped at monthly max
- `FLEXTIME_CAPPED` -- FlextimeEnd hit positive/negative cap
- `BELOW_THRESHOLD` -- Overtime below threshold, forfeited
- `NO_CARRYOVER` -- Credit type resets to zero

**Functions**:

1. **`CalculateMonth(input)`** -> `MonthlyCalcOutput`
   - Step 1: Initialize -- FlextimeStart = PreviousCarryover, copy absence summary
   - Step 2: Aggregate daily values -- sum GrossTime/NetTime/TargetTime/Overtime/Undertime/BreakTime; count WorkDays (GrossTime > 0 || NetTime > 0), DaysWithErrors
   - Step 3: FlextimeChange = TotalOvertime - TotalUndertime
   - Step 4: FlextimeRaw = FlextimeStart + FlextimeChange
   - Step 5: Apply credit type rules via `applyCreditType()` if rules not nil; otherwise direct transfer (FlextimeCredited = FlextimeChange, FlextimeEnd = FlextimeRaw)

2. **`applyCreditType(output, rules)`** -> `MonthlyCalcOutput` -- implements 4 credit types:
   - **no_evaluation**: direct 1:1 transfer
   - **complete_carryover**: apply monthly cap -> positive/negative balance caps
   - **after_threshold**: credit only above threshold, forfeit below; then apply monthly cap -> balance caps
   - **no_carryover**: reset to 0, forfeit all

3. **`applyFlextimeCaps(flextime, capPositive, capNegative)`** -> `(int, int)` -- returns capped value and forfeited amount

4. **`CalculateAnnualCarryover(currentBalance, annualFloor)`** -> `int` -- year-end carryover with optional negative floor

---

## 2. Go Test Coverage

### 2.1 monthlycalc_test.go (429 lines)

Tests for MonthlyCalcService using mock interfaces (testify/mock):

- **CalculateMonth**: Success, FutureMonth, MonthClosed, CurrentMonth
- **CalculateMonthBatch**: Success (3 employees), WithFailures (1 fails), WithClosedMonths (1 skipped), FutureMonth (all fail)
- **RecalculateFromMonth**: Success (cascading), SkipsClosedMonths (continues cascade), ContinuesOnError (processes remaining), YearBoundary (Dec->Jan), CurrentMonth (single), FutureMonth (processes nothing)
- **RecalculateFromMonthBatch**: Success, MixedResults

### 2.2 monthlyeval_test.go (858 lines)

Tests for MonthlyEvalService using mock interfaces:

- **GetMonthSummary**: Success (persisted), NotFound_CalculatesOnTheFly, InvalidYear, InvalidMonth
- **RecalculateMonth**: Success (5 work days), MonthClosed, WithPreviousCarryover (flextime chain), EmployeeNotFound, InvalidMonth
- **CloseMonth**: Success, AlreadyClosed, NotFound, InvalidMonth
- **ReopenMonth**: Success, NotClosed, NotFound
- **GetYearOverview**: Success (2 months), Empty, InvalidYear
- **Helper functions**: validateYearMonth (7 cases), monthDateRange (4 cases incl leap year)
- **buildAbsenceSummary**: vacation (full+half), illness (rounds up), special, pending (excluded), nil type (excluded)
- **Tariff evaluation rules**: CompleteCarryoverCapped, AfterThreshold, NoCarryover, TariffNotFound (graceful fallback)
- **buildEvaluationRules**: NoEvaluation (returns nil), CompleteCarryover (all fields), EmptyCreditType (defaults to nil)
- **Integration scenario**: CloseReopenRecalculate (close->recalc blocked->reopen->recalc allowed)

### 2.3 monthlyvalue_test.go (675 lines)

Repository integration tests using real DB with transaction rollback:

- **CRUD**: Create, GetByID, GetByID_NotFound, Update, Delete, Delete_NotFound
- **Lookup**: GetByEmployeeMonth, GetByEmployeeMonth_NotFound, GetPreviousMonth, GetPreviousMonth_YearBoundary, GetPreviousMonth_NotFound
- **Upsert**: Upsert_Insert, Upsert_Update (verifies same record updated)
- **Listing**: ListByEmployee (ordering), ListByEmployee_Empty, ListByEmployeeYear, ListByEmployeeYear_Empty
- **Month status**: IsMonthClosed_NotClosed, IsMonthClosed_Closed, IsMonthClosed_NoRecord
- **Close/Reopen**: CloseMonth, CloseMonth_NotFound, ReopenMonth, ReopenMonth_NotFound
- **Constraints**: UniqueConstraint (duplicate employee+year+month fails)
- **Model methods**: Balance(), FormatFlextimeEnd()

### 2.4 monthly_test.go (851 lines)

Pure calculation engine tests (no DB, no mocks):

- **Aggregation**: BasicSums, EmptyDays, SingleDay, WorkDays variants, DaysWithErrors
- **CreditType NoEvaluation**: Overtime, Undertime, Mixed
- **CreditType CompleteCarryover**: NoCaps, MonthlyCap, PositiveCap, NegativeCap, BothCaps, Undertime
- **CreditType AfterThreshold**: AboveThreshold, AtThreshold, BelowThreshold, Undertime, NilThreshold, WithCaps
- **CreditType NoCarryover**: Overtime, Undertime, WithPreviousBalance
- **Edge cases**: NilEvaluationRules, UnknownCreditType, ZeroPreviousCarryover, NegativePreviousCarryover, LargePreviousCarryover
- **Absence summary**: PassThrough, HalfDayVacation
- **Warnings**: MonthlyCap, FlextimeCapped, BelowThreshold, NoCarryover, EmptyByDefault
- **CalculateAnnualCarryover**: NilBalance, PositiveNoFloor, NegativeAboveFloor, NegativeBelowFloor, NilFloor
- **Caps via CalculateMonth**: NoCapsApplied, PositiveCapExceeded, NegativeCapExceeded, BothCapsNil
- **Ticket test cases**: CompleteCarryover (600min overtime, 480 cap), AfterThreshold (300min, 120 threshold)

---

## 3. Go Model Details

### 3.1 MonthlyValue (`apps/api/internal/model/monthlyvalue.go`, 75 lines)

All fields documented in Section 1.3. Key points:
- All time values in minutes (int)
- VacationTaken uses decimal.Decimal (maps to Decimal(5,2))
- IsClosed boolean with ClosedAt/ClosedBy, ReopenedAt/ReopenedBy nullable fields
- Helper: `Balance()` = TotalOvertime - TotalUndertime
- Helper: `FormatFlextimeEnd()` = "HH:MM" with sign
- Table: `monthly_values`, UNIQUE(employee_id, year, month)

### 3.2 DailyValue (`apps/api/internal/model/dailyvalue.go`, 113 lines)

Key fields used by monthly eval:
- ValueDate (time.Time, DB: date)
- GrossTime, NetTime, TargetTime, Overtime, Undertime, BreakTime (all int, minutes)
- HasError (bool)

### 3.3 AbsenceDay (`apps/api/internal/model/absenceday.go`, 111 lines)

Key fields used by monthly eval:
- Status (AbsenceStatus: "pending"/"approved"/"rejected"/"cancelled")
- Duration (decimal.Decimal: 1.00 or 0.50)
- AbsenceType relation (must be preloaded for Category access)

AbsenceType categories used: `vacation`, `illness`, `special` (default/other)

### 3.4 Tariff (`apps/api/internal/model/tariff.go`)

Fields used by monthly eval:
- CreditType (string): "no_evaluation" (default), "complete_carryover", "after_threshold", "no_carryover"
- FlextimeThreshold (*int)
- MaxFlextimePerMonth (*int)
- UpperLimitAnnual (*int) -- maps to FlextimeCapPositive in calculation
- LowerLimitAnnual (*int) -- maps to FlextimeCapNegative in calculation
- `GetCreditType()` method: returns CreditTypeNoEvaluation if CreditType is empty string

### 3.5 Employee

Key fields used by monthly eval:
- ID, TenantID (both uuid.UUID)
- TariffID (*uuid.UUID, nullable)

---

## 4. Existing TypeScript Patterns

### 4.1 Service Structure (DailyCalcService)

**File**: `apps/web/src/server/services/daily-calc.ts` (~1,200 lines)

Pattern:
- Service class that accepts `PrismaClient` in constructor
- Public methods for business operations (`calculateDay`, `calculateRange`)
- Private helper methods for data loading, transformation
- Uses Prisma for DB access (not raw SQL except for absence_days which lacks a Prisma model)
- Separate type definitions file (`daily-calc.types.ts`)
- Separate pure helper functions file (`daily-calc.helpers.ts`)
- Uses `@/lib/calculation` for pure math functions
- Uses `@/generated/prisma/client` for Prisma types

**Constructor pattern**:
```typescript
class DailyCalcService {
  constructor(private prisma: PrismaClient) {}
  async calculateDay(tenantId: string, employeeId: string, date: Date): Promise<DailyValue | null> { ... }
}
```

### 4.2 tRPC Router Structure

**File**: `apps/web/src/server/routers/dailyValues.ts` (468 lines)

Pattern:
- Import `z` (zod), `TRPCError`, `createTRPCRouter`, `tenantProcedure`
- Permission constants from `permissionIdByKey()`
- Output schemas (z.object) and input schemas
- Helper functions for mapping DB records to output shape
- Router with `tenantProcedure` procedures using `.use(requirePermission(...))` or `.use(requireEmployeePermission(...))`
- Data scope filtering via `applyDataScope()` middleware
- Prisma queries directly in procedure handlers

**Registration**: Routers are registered in `apps/web/src/server/root.ts` by adding import + key to `createTRPCRouter({...})`

### 4.3 Test Structure

**File**: `apps/web/src/server/services/__tests__/daily-calc.test.ts`

Pattern:
- `vitest` with `describe`, `it`, `expect`, `vi`, `beforeEach`
- Mock PrismaClient via `createMockPrisma()` function returning typed mocks
- Test data factories for common objects
- Tests grouped by method in `describe` blocks
- Each test: setup mocks -> call method -> assert results

### 4.4 Calculation Engine Location

**Path**: `apps/web/src/lib/calculation/`

Contains daily calculation engine ported from Go:
- `calculator.ts` -- main calculate function
- `types.ts` -- TypeScript types
- `errors.ts` -- error/warning codes
- `pairing.ts`, `breaks.ts`, `rounding.ts`, `tolerance.ts`, `capping.ts`, `surcharges.ts`, `shift-detection.ts`, `time.ts`
- `index.ts` -- re-exports

**NO monthly calculation functions exist here yet.** The Go `calculation/monthly.go` has NOT been ported to TypeScript.

---

## 5. Prisma Schema State

### 5.1 MonthlyValue -- Already Exists

**Location**: `apps/web/prisma/schema.prisma`, lines 2377-2415

All 22 columns match the DB exactly. Unique constraint on `[employeeId, year, month]`. Relations to Tenant and Employee. Reverse relations on both parent models exist.

Key Prisma fields (camelCase mapped from snake_case):
- `id`, `tenantId`, `employeeId`, `year`, `month`
- `totalGrossTime`, `totalNetTime`, `totalTargetTime`, `totalOvertime`, `totalUndertime`, `totalBreakTime`
- `flextimeStart`, `flextimeChange`, `flextimeEnd`, `flextimeCarryover`
- `vacationTaken` (Decimal), `sickDays`, `otherAbsenceDays`
- `workDays`, `daysWithErrors`
- `isClosed`, `closedAt`, `closedBy`, `reopenedAt`, `reopenedBy`
- `createdAt`, `updatedAt`

### 5.2 DailyValue -- Already Exists

**Location**: `apps/web/prisma/schema.prisma`, lines 2822-2869

All fields needed for monthly aggregation are present: `valueDate`, `grossTime`, `netTime`, `targetTime`, `overtime`, `undertime`, `breakTime`, `hasError`.

### 5.3 AbsenceDay -- Being Added in ZMI-TICKET-237

The `AbsenceDay` Prisma model is being added in ZMI-TICKET-237 (this ticket's prerequisite). Based on the staging branch, the model has already been added to the Prisma schema at lines 2930-2975 with all 14 columns matching the database.

Key fields for monthly eval: `status`, `duration` (Decimal), `absenceTypeId` with `absenceType` relation.

### 5.4 AbsenceType -- Already Exists

**Location**: `apps/web/prisma/schema.prisma`, lines 1112-1145

Key field for monthly eval: `category` (String, VARCHAR(20)) -- values: "vacation", "illness", "special" (and potentially others). The `absenceDays` reverse relation is being added in ZMI-TICKET-237.

### 5.5 Employee -- Already Exists

**Location**: `apps/web/prisma/schema.prisma`, lines 533-642

Key fields: `id`, `tenantId`, `tariffId` (nullable).

### 5.6 Tariff -- Already Exists

**Location**: `apps/web/prisma/schema.prisma`, lines 1387-1444

Key fields for monthly eval:
- `creditType` (String?, default "no_evaluation")
- `flextimeThreshold` (Int?)
- `maxFlextimePerMonth` (Int?)
- `upperLimitAnnual` (Int?) -- maps to FlextimeCapPositive
- `lowerLimitAnnual` (Int?) -- maps to FlextimeCapNegative

---

## 6. Dependencies Status

### 6.1 ZMI-TICKET-237 (Prisma Schema: Monthly + Absences) -- PREREQUISITE

**Status**: Plan and research documents exist. The AbsenceDay model has been added to the staged Prisma schema (visible in `git status` -- `schema.prisma` is modified). This ticket adds the AbsenceDay Prisma model, which is needed for the monthlyeval service to query absence days via Prisma instead of raw SQL.

### 6.2 ZMI-TICKET-236 (DailyValues Router) -- COMPLETED

**Status**: Implemented. The `dailyValuesRouter` exists at `apps/web/src/server/routers/dailyValues.ts` with `list`, `listAll`, and `approve` procedures. The `dailyAccountValuesRouter` exists at `apps/web/src/server/routers/dailyAccountValues.ts`. Both are registered in `root.ts`.

### 6.3 ZMI-TICKET-235 (Calculate-Day Endpoint) -- COMPLETED

**Status**: Implemented. The `employees.calculateDay` procedure exists in `apps/web/src/server/routers/employees.ts` (line 1545). It calls `DailyCalcService.calculateDay()`.

### 6.4 ZMI-TICKET-234 (DailyCalcService Port) -- COMPLETED

**Status**: Implemented. The `DailyCalcService` exists at `apps/web/src/server/services/daily-calc.ts` with `calculateDay()` and `calculateRange()` methods. Tests at `apps/web/src/server/services/__tests__/daily-calc.test.ts`.

### 6.5 ZMI-TICKET-233 (Calculation Engine) -- COMPLETED

**Status**: Implemented. Pure math functions at `apps/web/src/lib/calculation/`. Contains daily calculation only. Monthly calculation functions (`CalculateMonth`, `applyCreditType`, `applyFlextimeCaps`, `CalculateAnnualCarryover`) do NOT exist yet and need to be ported.

---

## 7. Data Flow Summary

### Monthly Calculation Data Flow (Go)

```
MonthlyCalcService.CalculateMonth(employeeID, year, month)
  |
  +--> MonthlyEvalService.RecalculateMonth(employeeID, year, month)
  |      |
  |      +--> employeeRepo.GetByID(employeeID) -> Employee (for tenantID, tariffID)
  |      +--> monthlyValueRepo.GetByEmployeeMonth() -> check if closed
  |      +--> monthlyValueRepo.GetPreviousMonth() -> FlextimeEnd as carryover
  |      +--> dailyValueRepo.GetByEmployeeDateRange(from, to) -> []DailyValue
  |      +--> absenceDayRepo.GetByEmployeeDateRange(from, to) -> []AbsenceDay
  |      +--> tariffRepo.GetByID(tariffID) -> Tariff (optional)
  |      |
  |      +--> buildMonthlyCalcInput(dailyValues, absences, carryover, tariff)
  |      |      +--> Convert daily values to DailyValueInput[]
  |      |      +--> buildAbsenceSummary(absences) -> count by category
  |      |      +--> buildEvaluationRules(tariff) -> credit type + caps
  |      |
  |      +--> calculation.CalculateMonth(input) -> MonthlyCalcOutput
  |      |      +--> Aggregate daily totals
  |      |      +--> Calculate flextime change
  |      |      +--> Apply credit type rules
  |      |
  |      +--> buildMonthlyValue(output) -> model.MonthlyValue
  |      +--> monthlyValueRepo.Upsert(mv)
  |
  +--> monthlyValueRepo.GetByEmployeeMonth() -> return persisted result
```

### TypeScript Port Mapping

| Go Component | TypeScript Target |
|---|---|
| `calculation/monthly.go` | `apps/web/src/lib/calculation/monthly.ts` (new) |
| `service/monthlyeval.go` | `apps/web/src/server/services/monthly-calc.ts` (new) |
| `service/monthlycalc.go` | `apps/web/src/server/services/monthly-calc.ts` (new, merged with eval) |
| `repository/monthlyvalue.go` | Prisma queries inline (no separate repository layer) |

---

## 8. Key Mapping Details

### 8.1 Prisma Query Equivalents for Repository Methods

| Go Repository Method | Prisma Equivalent |
|---|---|
| `GetByEmployeeMonth(employeeID, year, month)` | `prisma.monthlyValue.findUnique({ where: { employeeId_year_month: { employeeId, year, month } } })` |
| `GetPreviousMonth(employeeID, year, month)` | Compute prev year/month, then `findUnique` |
| `Upsert(mv)` | `prisma.monthlyValue.upsert({ where: { employeeId_year_month }, create: {...}, update: {...} })` |
| `ListByEmployeeYear(employeeID, year)` | `prisma.monthlyValue.findMany({ where: { employeeId, year }, orderBy: { month: 'asc' } })` |
| `CloseMonth(...)` | `prisma.monthlyValue.update({ where: { employeeId_year_month }, data: { isClosed: true, closedAt: new Date(), closedBy } })` |
| `ReopenMonth(...)` | `prisma.monthlyValue.update({ where: { employeeId_year_month }, data: { isClosed: false, reopenedAt: new Date(), reopenedBy } })` |
| `IsMonthClosed(tenantID, employeeID, date)` | `prisma.monthlyValue.findFirst({ where: { tenantId, employeeId, year, month }, select: { isClosed: true } })` |
| `ListAll(filter)` | `prisma.monthlyValue.findMany({ where: {...}, orderBy: [{year: 'desc'}, {month: 'desc'}] })` |

### 8.2 Absence Day Query

Go uses `absenceDayRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)` which returns `[]model.AbsenceDay` with `AbsenceType` preloaded.

Prisma equivalent:
```typescript
prisma.absenceDay.findMany({
  where: {
    employeeId,
    absenceDate: { gte: from, lte: to },
  },
  include: { absenceType: true },
})
```

### 8.3 Daily Value Query

Go uses `dailyValueRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)`.

Prisma equivalent:
```typescript
prisma.dailyValue.findMany({
  where: {
    employeeId,
    valueDate: { gte: from, lte: to },
  },
})
```

### 8.4 AbsenceType Category Values

Go constants:
- `AbsenceCategoryVacation = "vacation"`
- `AbsenceCategoryIllness = "illness"`
- `AbsenceCategorySpecial = "special"`

These are string values stored in the `category` column of `absence_types`. The Prisma AbsenceType model has `category String @db.VarChar(20)`.

### 8.5 Tariff CreditType Values

Go constants:
- `CreditTypeNoEvaluation = "no_evaluation"` (default when empty)
- `CreditTypeComplete = "complete_carryover"`
- `CreditTypeAfterThreshold = "after_threshold"`
- `CreditTypeNoCarryover = "no_carryover"`

Prisma Tariff model: `creditType String? @default("no_evaluation")`. Nullable, defaults to "no_evaluation".

### 8.6 Decimal Handling

Go uses `shopspring/decimal` for VacationTaken and AbsenceDay.Duration.

TypeScript/Prisma uses `Prisma.Decimal` (from `@prisma/client/runtime/library`). The `Decimal` type from Prisma is based on `decimal.js`. For arithmetic operations:
- Addition: `new Decimal(a).add(b)`
- Ceiling: `new Decimal(a).ceil()`
- Conversion to number: `.toNumber()`
- Comparison: `.equals()`, `.greaterThan()`, etc.

---

## 9. Files That Will Be Created/Modified

### New Files (estimated):
1. `apps/web/src/lib/calculation/monthly.ts` -- Pure monthly calculation engine (port of `calculation/monthly.go`)
2. `apps/web/src/server/services/monthly-calc.ts` -- MonthlyCalcService + MonthlyEvalService (merged)
3. `apps/web/src/server/services/monthly-calc.types.ts` -- TypeScript types for monthly calc
4. `apps/web/src/server/routers/monthlyValues.ts` -- tRPC router for monthly values
5. `apps/web/src/server/services/__tests__/monthly-calc.test.ts` -- Service tests
6. `apps/web/src/lib/calculation/__tests__/monthly.test.ts` -- Pure calculation tests

### Modified Files (estimated):
1. `apps/web/src/lib/calculation/index.ts` -- re-export monthly functions
2. `apps/web/src/lib/calculation/errors.ts` -- add monthly warning codes (if not already present)
3. `apps/web/src/server/root.ts` -- register monthlyValues router

---

## 10. Warning Code Inventory

Warning codes already defined in `apps/web/src/lib/calculation/errors.ts` (from daily calc port):

Checking if monthly-specific warning codes exist:

| Warning Code | Defined in Go errors.go | Needed for Monthly |
|---|---|---|
| `MONTHLY_CAP_REACHED` | Yes (line 42) | Yes |
| `FLEXTIME_CAPPED` | Yes (line 43) | Yes |
| `BELOW_THRESHOLD` | Yes (line 44) | Yes |
| `NO_CARRYOVER` | Yes (line 45) | Yes |
| `CROSS_MIDNIGHT` | Yes (line 34) | No (daily only) |
| `MAX_TIME_REACHED` | Yes (line 35) | No (daily only) |
| `MANUAL_BREAK` | Yes (line 36) | No (daily only) |
| `NO_BREAK_RECORDED` | Yes (line 37) | No (daily only) |
| `SHORT_BREAK` | Yes (line 38) | No (daily only) |
| `AUTO_BREAK_APPLIED` | Yes (line 39) | No (daily only) |

The TypeScript errors file (`apps/web/src/lib/calculation/errors.ts`, 89 lines) currently defines 14 error codes and 6 daily warning codes (`CROSS_MIDNIGHT`, `MAX_TIME_REACHED`, `MANUAL_BREAK`, `NO_BREAK_RECORDED`, `SHORT_BREAK`, `AUTO_BREAK_APPLIED`). The 4 monthly warning codes (`MONTHLY_CAP_REACHED`, `FLEXTIME_CAPPED`, `BELOW_THRESHOLD`, `NO_CARRYOVER`) are NOT present and need to be added.
