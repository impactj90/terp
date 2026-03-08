# Research: ZMI-TICKET-243 -- RecalcService Port (Forward Cascade)

**Date**: 2026-03-08
**Branch**: staging
**Repository**: terp

## Research Question

Document the Go RecalcService source code, existing TypeScript infrastructure, callers, dependencies, and patterns needed to port the RecalcService (forward cascade) from Go to TypeScript.

## Summary

The Go `RecalcService` (`apps/api/internal/service/recalc.go`, 146 lines) is a thin orchestration layer that coordinates daily recalculation (via `DailyCalcService`) and monthly recalculation (via `MonthlyCalcService`). It provides single-day, date-range, batch, and tenant-wide recalc entry points. Both the `DailyCalcService` and `MonthlyCalcService` have already been ported to TypeScript. Multiple TS routers already contain inline `triggerRecalc()` helper functions that partially replicate this service's functionality -- the port should consolidate these into a single `RecalcService` class.

---

## 1. Go Source Code Analysis

### 1.1 `apps/api/internal/service/recalc.go` (146 lines)

#### Dependency Interfaces

```go
type dailyCalcServiceForRecalc interface {
    CalculateDay(ctx, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
    RecalculateRange(ctx, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error)
}

type employeeRepositoryForRecalc interface {
    List(ctx, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

type monthlyCalcForRecalc interface {
    CalculateMonth(ctx, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
}
```

#### Struct & Constructor

```go
type RecalcService struct {
    dailyCalc    dailyCalcServiceForRecalc
    employeeRepo employeeRepositoryForRecalc
    monthlyCalc  monthlyCalcForRecalc   // set via SetMonthlyCalcService()
}
```

Constructor takes `dailyCalc` + `employeeRepo`. `monthlyCalc` is set later via `SetMonthlyCalcService()` to break a circular dependency.

#### Result Types

```go
type RecalcError struct {
    EmployeeID uuid.UUID
    Date       time.Time
    Error      string
}

type RecalcResult struct {
    ProcessedDays int
    FailedDays    int
    Errors        []RecalcError
}
```

#### Public Methods (4 total)

1. **`TriggerRecalc(ctx, tenantID, employeeID, date)`** -> `(*RecalcResult, error)`
   - Calls `dailyCalc.CalculateDay()`
   - If `monthlyCalc` is set, also calls `monthlyCalc.CalculateMonth(date.Year(), date.Month())`
   - Returns `RecalcResult{ProcessedDays: 1}` on success
   - Returns error + result with `FailedDays: 1` on failure

2. **`TriggerRecalcRange(ctx, tenantID, employeeID, from, to)`** -> `(*RecalcResult, error)`
   - Calls `dailyCalc.RecalculateRange(from, to)`
   - On error, calculates failed date as `from + count days`
   - Total days = `(to - from) / 24h + 1`
   - Does NOT trigger monthly recalc (unlike TriggerRecalc)

3. **`TriggerRecalcBatch(ctx, tenantID, employeeIDs[], from, to)`** -> `*RecalcResult`
   - Iterates employees, calling `TriggerRecalcRange()` for each
   - Aggregates results (sums ProcessedDays, FailedDays, appends Errors)
   - Continues on errors (does not abort batch)

4. **`TriggerRecalcAll(ctx, tenantID, from, to)`** -> `(*RecalcResult, error)`
   - Lists all active employees via `employeeRepo.List()` with `IsActive: true`
   - Extracts IDs, delegates to `TriggerRecalcBatch()`

---

## 2. Go Test Coverage

### 2.1 `apps/api/internal/service/recalc_test.go` (292 lines)

Uses testify/mock with `mockDailyCalcServiceForRecalc` and `mockEmployeeRepositoryForRecalc`.

**Tests** (7 total):

| Test | Description |
|---|---|
| `TriggerRecalc_Success` | Single day calc succeeds, result = ProcessedDays:1, FailedDays:0 |
| `TriggerRecalc_Error` | CalculateDay fails, result = ProcessedDays:0, FailedDays:1 |
| `TriggerRecalcRange_Success` | 5-day range succeeds, ProcessedDays:5 |
| `TriggerRecalcRange_PartialFailure` | Fails after 3 days, ProcessedDays:3, FailedDays:2 |
| `TriggerRecalcBatch_AllSuccess` | 3 employees x 2 days = 6 processed |
| `TriggerRecalcBatch_ContinuesOnError` | 1st succeeds, 2nd fails, 3rd succeeds; continues processing |
| `TriggerRecalcBatch_EmptyList` | Empty employee list = zero counts |
| `TriggerRecalcAll_Success` | Lists 2 active employees, recalcs both |
| `TriggerRecalcAll_EmployeeListError` | List fails, returns error |
| `TriggerRecalcAll_NoActiveEmployees` | Empty list = zero counts |

---

## 3. Go Callers of RecalcService

The RecalcService is used by multiple Go services as a dependency. This documents all callers to understand what the TS port needs to serve.

### 3.1 BookingService (`apps/api/internal/service/booking.go`)

Interface: `recalcServiceForBooking { TriggerRecalc() }`

Called after:
- **Create** (line 166): `_, _ = s.recalcSvc.TriggerRecalc(ctx, tenantID, employeeID, bookingDate)`
- **Update** (line 215): same pattern
- **Delete** (line 248): same pattern, stores date before delete

Error handling: best-effort (`_, _ =` discards errors).

### 3.2 AbsenceService (`apps/api/internal/service/absence.go`)

Interface: `recalcServiceForAbsence { TriggerRecalc(), TriggerRecalcRange() }`

Called after:
- Approve (line 201): `TriggerRecalc(tenantID, employeeID, absenceDate)`
- Cancel (line 232): `TriggerRecalc()`
- Reject (line 263): `TriggerRecalc()`
- Delete (line 292): `TriggerRecalc()`
- Update (line 338): `TriggerRecalc()`
- BulkDelete (line 355): `TriggerRecalcRange(tenantID, employeeID, from, to)`
- Create (line 447): `TriggerRecalcRange(tenantID, employeeID, fromDate, toDate)`

Error handling: best-effort (`_, _ =` discards errors).

### 3.3 HolidayService (`apps/api/internal/service/holiday.go`)

Interface: `recalcServiceForHolidayRecalc { TriggerRecalcAll() }`

Called after holiday create/update/delete. Recalculates all employees for affected date range. Separate `monthlyCalc.RecalculateFromMonthBatch()` call follows.

### 3.4 SystemSettingsService (`apps/api/internal/service/systemsettings.go`)

Interface: `systemSettingsRecalcService { TriggerRecalcAll(), TriggerRecalcBatch() }`

Used for "re-read bookings" cleanup operation. Calls `TriggerRecalcBatch()` if employee IDs provided, otherwise `TriggerRecalcAll()`.

### 3.5 EmployeeTariffAssignmentService (`apps/api/internal/service/employeetariffassignment.go`)

Interface: `recalcServiceForAssignment { TriggerRecalcRange() }`

Called after tariff assignment changes. Limits recalc to past/current dates (skips future to avoid spurious no-booking errors).

### 3.6 DailyValueHandler (`apps/api/internal/handler/dailyvalue.go`)

Uses `RecalcService` directly (not via interface). Calls `TriggerRecalcRange()` or `TriggerRecalcAll()` for admin recalculation endpoint.

---

## 4. Existing TypeScript Implementation (Partial)

### 4.1 Inline `triggerRecalc()` in Bookings Router

**File**: `apps/web/src/server/routers/bookings.ts` (lines 460-484)

```typescript
async function triggerRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  bookingDate: Date
): Promise<void> {
  try {
    const service = new DailyCalcService(prisma)
    await service.calculateDay(tenantId, employeeId, bookingDate)
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${bookingDate.toISOString().split("T")[0]}:`,
      error
    )
  }
}
```

Called after booking create (line 704), update (line 764), delete (line 816).

**Note**: This only calls `DailyCalcService.calculateDay()` -- it does NOT trigger monthly recalculation afterward. The Go version calls both daily + monthly.

### 4.2 Inline `triggerRecalc()` + `triggerRecalcRange()` in Absences Router

**File**: `apps/web/src/server/routers/absences.ts` (lines 330-371)

Nearly identical pattern to bookings. Two functions:
- `triggerRecalc()` -- single day via `DailyCalcService.calculateDay()`
- `triggerRecalcRange()` -- date range via `DailyCalcService.calculateDateRange()`

Called after absence create, update, delete, approve, reject, cancel operations.

**Note**: Same gap as bookings -- no monthly recalculation.

### 4.3 MonthlyValues Router Recalculate

**File**: `apps/web/src/server/routers/monthlyValues.ts` (lines 747-779)

Uses `MonthlyCalcService.calculateMonthBatch()` directly for admin monthly recalculation:
```typescript
const monthlyCalcService = new MonthlyCalcService(ctx.prisma)
const result = await monthlyCalcService.calculateMonthBatch(employeeIds, year, month)
```

### 4.4 SystemSettings Re-Read Bookings

**File**: `apps/web/src/server/routers/systemSettings.ts` (lines 532-568)

Currently NOT IMPLEMENTED -- throws `PRECONDITION_FAILED` with message "Recalculation service not yet available". This is waiting for the RecalcService port.

### 4.5 Employees Router calculateDay

**File**: `apps/web/src/server/routers/employees.ts` (lines 1545-1595)

Uses `DailyCalcService.calculateDay()` directly for manual recalculation. No monthly recalc trigger.

---

## 5. TypeScript Dependencies (Already Ported)

### 5.1 DailyCalcService

**File**: `apps/web/src/server/services/daily-calc.ts`

```typescript
export class DailyCalcService {
  constructor(private prisma: PrismaClient) {}

  async calculateDay(
    tenantId: string,
    employeeId: string,
    date: Date
  ): Promise<DailyValue | null>

  async calculateDateRange(
    tenantId: string,
    employeeId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{ count: number; values: DailyValue[] }>
}
```

`calculateDateRange()` iterates day-by-day calling `calculateDay()` and returns count + values.

### 5.2 MonthlyCalcService

**File**: `apps/web/src/server/services/monthly-calc.ts`

```typescript
export class MonthlyCalcService {
  constructor(private prisma: PrismaClient) {}

  async calculateMonth(
    employeeId: string,
    year: number,
    month: number
  ): Promise<MonthlyValue>

  async calculateMonthBatch(
    employeeIds: string[],
    year: number,
    month: number
  ): Promise<MonthlyCalcResult>

  async recalculateFromMonth(
    employeeId: string,
    startYear: number,
    startMonth: number
  ): Promise<MonthlyCalcResult>

  async recalculateFromMonthBatch(
    employeeIds: string[],
    startYear: number,
    startMonth: number
  ): Promise<MonthlyCalcResult>

  async recalculateMonth(
    employeeId: string,
    year: number,
    month: number
  ): Promise<void>
}
```

**Key difference from Go**: The TS `MonthlyCalcService` takes only a `PrismaClient` -- no separate repository dependencies. The `calculateMonth()` method takes `employeeId: string` (not uuid.UUID) and does NOT take `tenantId` (it looks up the employee to get the tenantId).

### 5.3 Supporting Files

| File | Contents |
|---|---|
| `daily-calc.types.ts` | TypeScript interfaces, constants (DV_STATUS_*, DAV_SOURCE_*, etc.) |
| `daily-calc.helpers.ts` | Pure functions (sameDate, addDays, bookingDirection, etc.) |
| `monthly-calc.types.ts` | MonthlyCalcResult, MonthlyCalcError, MonthSummary, error constants |

---

## 6. Service Organization Patterns

### 6.1 Service File Structure

Services live in `apps/web/src/server/services/`:
```
daily-calc.ts          -- DailyCalcService class
daily-calc.types.ts    -- Types and constants
daily-calc.helpers.ts  -- Pure helper functions
monthly-calc.ts        -- MonthlyCalcService class
monthly-calc.types.ts  -- Types and constants
```

Pattern:
- Service class in `{name}.ts`, exported as named export
- Types/constants in `{name}.types.ts`
- Pure helpers in `{name}.helpers.ts` (optional)

### 6.2 Service Constructor Pattern

Both existing services take only `PrismaClient`:
```typescript
class DailyCalcService {
  constructor(private prisma: PrismaClient) {}
}

class MonthlyCalcService {
  constructor(private prisma: PrismaClient) {}
}
```

### 6.3 How Services Are Instantiated in Routers

Services are instantiated per-request inside router procedures:
```typescript
const service = new DailyCalcService(ctx.prisma)
await service.calculateDay(tenantId, employeeId, date)
```

No dependency injection container or singleton pattern. Each procedure creates a new instance.

### 6.4 ID Types

TypeScript uses `string` for all IDs (UUIDs). Go uses `uuid.UUID`. No conversion needed in TS.

---

## 7. Test Patterns

### 7.1 Service Test Structure

**File**: `apps/web/src/server/services/__tests__/daily-calc.test.ts`

Pattern:
- Framework: `vitest` with `describe`, `it`, `expect`, `vi`, `beforeEach`
- Mock: `createMockPrisma()` function returns typed mocks for each Prisma model
- Test data: Factory functions (`makeEmployee()`, `makeEmpDayPlan()`, etc.)
- Grouping: `describe` blocks by method/scenario
- Each test: setup mocks -> call method -> assert results

```typescript
function createMockPrisma() {
  const mocks = {
    dailyValue: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    employee: { findFirst: vi.fn().mockResolvedValue(null) },
    // ... etc
  }
  return { prisma: mocks as unknown as PrismaClient, mocks }
}
```

### 7.2 Monthly Calc Test Structure

**File**: `apps/web/src/server/services/__tests__/monthly-calc.test.ts`

Same pattern as daily calc. Uses:
```typescript
function createMockPrisma() {
  const mocks = {
    monthlyValue: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    dailyValue: { findMany: vi.fn() },
    absenceDay: { findMany: vi.fn() },
    employee: { findUnique: vi.fn() },
    tariff: { findUnique: vi.fn() },
  }
  return { prisma: mocks as unknown as PrismaClient, mocks }
}
```

For the RecalcService tests, mocking should focus on `DailyCalcService` and `MonthlyCalcService` rather than Prisma directly, since RecalcService delegates to these services.

---

## 8. Key Differences Between Go and TypeScript

### 8.1 MonthlyCalc Signature

Go: `CalculateMonth(ctx, employeeID uuid.UUID, year, month int)`
TS: `calculateMonth(employeeId: string, year: number, month: number)`

The Go version does NOT take tenantId. The TS version also does NOT take tenantId (looks up employee internally).

### 8.2 Monthly Recalc After Single Day

The Go `TriggerRecalc()` calls `monthlyCalc.CalculateMonth()` after `dailyCalc.CalculateDay()`. The current inline TS `triggerRecalc()` functions do NOT call monthly recalculation. This is a gap the RecalcService port should fill.

### 8.3 TriggerRecalcRange Does NOT Trigger Monthly

In Go, `TriggerRecalcRange()` only calls `dailyCalc.RecalculateRange()` -- it does NOT trigger monthly recalc. Only `TriggerRecalc()` (single day) triggers monthly recalc.

### 8.4 Employee Listing

Go uses `employeeRepo.List()` with `EmployeeFilter{TenantID, IsActive}`.
TS equivalent: `prisma.employee.findMany({ where: { tenantId, isActive: true }, select: { id: true } })`

### 8.5 Error Handling Pattern

Go callers use `_, _ =` to discard recalc errors (best-effort). TS callers wrap in try/catch with `console.error`.

---

## 9. Prisma Models Involved

### 9.1 Employee

**Location**: `apps/web/prisma/schema.prisma:533`

Key fields: `id` (UUID), `tenantId` (UUID), `isActive` (Boolean, default true), `deletedAt` (nullable).

### 9.2 DailyValue

**Location**: `apps/web/prisma/schema.prisma:2822`

Unique constraint: `@@unique([employeeId, valueDate])` -- used for upsert conflict key.

### 9.3 MonthlyValue

**Location**: `apps/web/prisma/schema.prisma:2377`

Unique constraint: `@@unique([employeeId, year, month])`.

---

## 10. Consolidation Opportunities

The inline `triggerRecalc()` functions in bookings.ts and absences.ts are duplicated. After creating the `RecalcService`, these callers should import and use the service instead. This list documents all TS callers to update:

| File | Function | Current Implementation |
|---|---|---|
| `bookings.ts` (line 469) | `triggerRecalc()` | Inline, DailyCalcService only |
| `absences.ts` (line 334) | `triggerRecalc()` | Inline, DailyCalcService only |
| `absences.ts` (line 355) | `triggerRecalcRange()` | Inline, DailyCalcService only |
| `employees.ts` (line 1569) | Direct call | DailyCalcService only |
| `monthlyValues.ts` (line 772) | Direct call | MonthlyCalcService only |
| `systemSettings.ts` (line 565) | NOT IMPLEMENTED | Throws PRECONDITION_FAILED |

---

## 11. Files That Will Be Created

### New Files:
1. `apps/web/src/server/services/recalc.ts` -- RecalcService class
2. `apps/web/src/server/services/recalc.types.ts` -- RecalcResult, RecalcError types
3. `apps/web/src/server/services/__tests__/recalc.test.ts` -- Service tests

### Modified Files (callers to update):
1. `apps/web/src/server/routers/bookings.ts` -- Replace inline `triggerRecalc()` with service
2. `apps/web/src/server/routers/absences.ts` -- Replace inline `triggerRecalc()` and `triggerRecalcRange()`
3. `apps/web/src/server/routers/employees.ts` -- Use RecalcService in `calculateDay`
4. `apps/web/src/server/routers/systemSettings.ts` -- Implement `cleanupReReadBookings` execute mode

---

## 12. Method-by-Method Port Mapping

| Go Method | Signature | TS Equivalent |
|---|---|---|
| `NewRecalcService` | constructor(dailyCalc, employeeRepo) | `constructor(prisma, dailyCalcService, monthlyCalcService)` |
| `SetMonthlyCalcService` | setter | Constructor param (TS has no circular dep issue) |
| `TriggerRecalc` | (ctx, tenantID, employeeID, date) -> (*RecalcResult, error) | `async triggerRecalc(tenantId, employeeId, date): Promise<RecalcResult>` |
| `TriggerRecalcRange` | (ctx, tenantID, employeeID, from, to) -> (*RecalcResult, error) | `async triggerRecalcRange(tenantId, employeeId, from, to): Promise<RecalcResult>` |
| `TriggerRecalcBatch` | (ctx, tenantID, employeeIDs[], from, to) -> *RecalcResult | `async triggerRecalcBatch(tenantId, employeeIds, from, to): Promise<RecalcResult>` |
| `TriggerRecalcAll` | (ctx, tenantID, from, to) -> (*RecalcResult, error) | `async triggerRecalcAll(tenantId, from, to): Promise<RecalcResult>` |

### Constructor Design Decision

The Go service takes interfaces (for DI/testing). In the existing TS codebase pattern, services take `PrismaClient` and create sub-services internally. Two options:

**Option A**: Accept `PrismaClient` only, create DailyCalcService and MonthlyCalcService internally:
```typescript
class RecalcService {
  private dailyCalcService: DailyCalcService
  private monthlyCalcService: MonthlyCalcService

  constructor(private prisma: PrismaClient) {
    this.dailyCalcService = new DailyCalcService(prisma)
    this.monthlyCalcService = new MonthlyCalcService(prisma)
  }
}
```
Pro: Consistent with existing patterns. Con: Harder to mock in tests.

**Option B**: Accept services as constructor params:
```typescript
class RecalcService {
  constructor(
    private prisma: PrismaClient,
    private dailyCalcService: DailyCalcService,
    private monthlyCalcService: MonthlyCalcService
  ) {}
}
```
Pro: Easy to mock in tests, matches Go DI pattern. Con: More setup in callers.

Both patterns are viable. The ticket spec suggests Option B. The choice should be based on testability preference.

---

## 13. Data Flow Summary

### TriggerRecalc (Single Day)

```
RecalcService.triggerRecalc(tenantId, employeeId, date)
  |
  +--> dailyCalcService.calculateDay(tenantId, employeeId, date)
  |     (loads bookings, day plan, holidays, runs calculation, upserts DailyValue)
  |
  +--> monthlyCalcService.calculateMonth(employeeId, date.year, date.month)
  |     (aggregates DailyValues, applies flextime rules, upserts MonthlyValue)
  |
  +--> Return RecalcResult { processedDays: 1 }
```

### TriggerRecalcRange

```
RecalcService.triggerRecalcRange(tenantId, employeeId, from, to)
  |
  +--> dailyCalcService.calculateDateRange(tenantId, employeeId, from, to)
  |     (iterates day-by-day)
  |
  +--> Return RecalcResult { processedDays: count }
```

Note: TriggerRecalcRange does NOT trigger monthly recalc in Go.

### TriggerRecalcAll

```
RecalcService.triggerRecalcAll(tenantId, from, to)
  |
  +--> prisma.employee.findMany({ where: { tenantId, isActive: true } })
  |
  +--> For each employee:
  |      +--> triggerRecalcRange(tenantId, employeeId, from, to)
  |
  +--> Return aggregated RecalcResult
```
