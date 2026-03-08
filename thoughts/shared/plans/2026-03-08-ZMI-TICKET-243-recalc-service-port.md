# ZMI-TICKET-243: RecalcService Port (Forward Cascade) -- Implementation Plan

## Overview

Port the Go `RecalcService` (`apps/api/internal/service/recalc.go`, 146 lines) to TypeScript. The service is an orchestration layer that coordinates daily recalculation (via `DailyCalcService`) and monthly recalculation (via `MonthlyCalcService`). It provides four public methods: single-day recalc, date-range recalc, batch recalc (multiple employees), and tenant-wide recalc (all active employees).

The existing TypeScript codebase has inline `triggerRecalc()` helper functions duplicated across `bookings.ts`, `absences.ts`, and `employees.ts`. These only call `DailyCalcService` and do NOT trigger monthly recalculation afterward -- a gap the Go version fills. The port will create a centralized `RecalcService` class and update all callers to use it.

## Current State

### Already Implemented
| Component | File | Status |
|---|---|---|
| `DailyCalcService` | `apps/web/src/server/services/daily-calc.ts` | Complete |
| `MonthlyCalcService` | `apps/web/src/server/services/monthly-calc.ts` | Complete |
| Inline `triggerRecalc()` in bookings | `apps/web/src/server/routers/bookings.ts` (line 469) | Daily only, no monthly |
| Inline `triggerRecalc()` + `triggerRecalcRange()` in absences | `apps/web/src/server/routers/absences.ts` (lines 334, 355) | Daily only, no monthly |
| Direct `DailyCalcService` call in employees | `apps/web/src/server/routers/employees.ts` (line 1569) | Daily only, no monthly |
| `systemSettings.cleanupReReadBookings` execute mode | `apps/web/src/server/routers/systemSettings.ts` (line 565) | NOT IMPLEMENTED -- throws PRECONDITION_FAILED |

### Gaps This Ticket Closes
1. **No centralized RecalcService** -- recalc logic is duplicated inline across 3 routers.
2. **No monthly recalc after daily changes** -- inline helpers only call `DailyCalcService.calculateDay()`. The Go version also calls `MonthlyCalcService.calculateMonth()` after single-day recalc, keeping flextime balances in sync.
3. **No batch/tenant-wide recalc** -- `systemSettings.cleanupReReadBookings` execute mode is blocked.
4. **No structured error tracking** -- inline helpers use `console.error` and return void; the Go version returns `RecalcResult` with counts and error details.

## Desired End State

After implementation:
1. `RecalcService` class exists in `apps/web/src/server/services/recalc.ts` with all 4 public methods.
2. `triggerRecalc()` calls both `DailyCalcService.calculateDay()` AND `MonthlyCalcService.calculateMonth()` (matching Go behavior).
3. `triggerRecalcRange()` calls `DailyCalcService.calculateDateRange()` without monthly recalc (matching Go behavior).
4. `triggerRecalcBatch()` iterates employees calling `triggerRecalcRange()`, aggregating results.
5. `triggerRecalcAll()` lists active employees via Prisma and delegates to `triggerRecalcBatch()`.
6. All inline `triggerRecalc()` functions in routers are replaced with `RecalcService` calls.
7. `systemSettings.cleanupReReadBookings` execute mode is implemented.
8. Comprehensive tests cover all methods, error cases, and result aggregation.
9. TypeScript compilation passes.

### Verification Commands
```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/server/services/__tests__/recalc.test.ts
```

---

## Phase 1: Create RecalcService Types

### Goal
Define the TypeScript types for `RecalcResult` and `RecalcError`, following the `{name}.types.ts` pattern used by existing services.

### Changes

#### 1.1 Create `recalc.types.ts`

**File**: `apps/web/src/server/services/recalc.types.ts` (new)

```ts
/**
 * RecalcService Types
 *
 * TypeScript interfaces and types for the RecalcService.
 * Ported from Go: apps/api/internal/service/recalc.go
 */

/** A single recalculation failure. */
export interface RecalcError {
  employeeId: string
  date: Date
  error: string
}

/** Outcome of a recalculation operation. */
export interface RecalcResult {
  processedDays: number
  failedDays: number
  errors: RecalcError[]
}
```

**Notes**:
- Go uses `uuid.UUID` for `EmployeeID`; TS uses `string` (consistent with all other TS services).
- Go uses `time.Time` for `Date`; TS uses `Date`.
- Result field names use camelCase (matching TS conventions and existing `MonthlyCalcResult` pattern).

### Verification
- File created, no compilation errors.

---

## Phase 2: Implement RecalcService Class

### Goal
Create the core `RecalcService` class with all 4 public methods, matching the Go implementation behavior exactly.

### Changes

#### 2.1 Create `recalc.ts`

**File**: `apps/web/src/server/services/recalc.ts` (new)

```ts
/**
 * RecalcService
 *
 * Orchestrates recalculation of daily and monthly values for employees.
 * Acts as a coordination layer between DailyCalcService and MonthlyCalcService.
 *
 * Ported from Go: apps/api/internal/service/recalc.go (146 lines)
 *
 * Dependencies:
 * - ZMI-TICKET-234: DailyCalcService (daily time calculations)
 * - ZMI-TICKET-238: MonthlyCalcService (monthly aggregations)
 */

import type { PrismaClient } from "@/generated/prisma/client"
import { DailyCalcService } from "./daily-calc"
import { MonthlyCalcService } from "./monthly-calc"
import type { RecalcResult, RecalcError } from "./recalc.types"

export class RecalcService {
  constructor(
    private prisma: PrismaClient,
    private dailyCalcService: DailyCalcService,
    private monthlyCalcService: MonthlyCalcService,
  ) {}

  // ...methods below
}
```

#### 2.2 Constructor Design Decision

Use **Option A from the research** (accept `PrismaClient` only, create sub-services internally) for the **convenience constructor**, BUT also allow **Option B** (inject services) for testability. Implementation:

```ts
export class RecalcService {
  private dailyCalcService: DailyCalcService
  private monthlyCalcService: MonthlyCalcService

  constructor(
    private prisma: PrismaClient,
    dailyCalcService?: DailyCalcService,
    monthlyCalcService?: MonthlyCalcService,
  ) {
    this.dailyCalcService = dailyCalcService ?? new DailyCalcService(prisma)
    this.monthlyCalcService = monthlyCalcService ?? new MonthlyCalcService(prisma)
  }
}
```

This means:
- **Routers** can call `new RecalcService(ctx.prisma)` (simple, consistent with existing patterns).
- **Tests** can call `new RecalcService(prisma, mockDailyCalc, mockMonthlyCalc)` (easy mocking).

#### 2.3 Method: `triggerRecalc()`

Port of Go `TriggerRecalc()`. Single-day recalc with monthly recalc follow-up.

```ts
/**
 * Recalculates a single day for one employee.
 * After daily calculation, also recalculates the affected month so that
 * monthly evaluation values (flextime balance, totals) stay in sync.
 */
async triggerRecalc(
  tenantId: string,
  employeeId: string,
  date: Date,
): Promise<RecalcResult> {
  try {
    await this.dailyCalcService.calculateDay(tenantId, employeeId, date)
  } catch (err) {
    return {
      processedDays: 0,
      failedDays: 1,
      errors: [
        {
          employeeId,
          date,
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }

  // Recalculate the affected month so monthly values reflect the daily change
  try {
    await this.monthlyCalcService.calculateMonth(
      employeeId,
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
    )
  } catch {
    // Monthly recalc is best-effort (matches Go: `_, _ = s.monthlyCalc.CalculateMonth(...)`)
  }

  return { processedDays: 1, failedDays: 0, errors: [] }
}
```

**Key behaviors matching Go**:
- If `calculateDay()` fails, return result with `failedDays: 1` and the error. In Go, `TriggerRecalc` also returns the error as a second return value. In TS, we embed it in the result (no dual-return). The caller always uses the result, not the error (Go callers discard with `_, _ =`).
- Monthly recalc is best-effort: catch and ignore errors (Go uses `_, _ =`).
- Uses `date.getUTCFullYear()` and `date.getUTCMonth() + 1` to extract year/month (Go uses `date.Year()` and `int(date.Month())`).

**Important difference from Go**: The Go method returns `(*RecalcResult, error)` -- both a result AND an error. Callers universally discard both (`_, _ =`). Since the TS callers also use best-effort patterns (try/catch with console.error), we simplify to returning only `RecalcResult`. If the caller needs to distinguish success/failure, they can check `result.failedDays > 0`.

#### 2.4 Method: `triggerRecalcRange()`

Port of Go `TriggerRecalcRange()`. Date-range recalc WITHOUT monthly follow-up.

```ts
/**
 * Recalculates a date range for one employee.
 * Does NOT trigger monthly recalculation (matches Go behavior).
 */
async triggerRecalcRange(
  tenantId: string,
  employeeId: string,
  from: Date,
  to: Date,
): Promise<RecalcResult> {
  try {
    const { count } = await this.dailyCalcService.calculateDateRange(
      tenantId,
      employeeId,
      from,
      to,
    )
    return { processedDays: count, failedDays: 0, errors: [] }
  } catch (err) {
    // Calculate total expected days for failure reporting
    const totalDays =
      Math.floor(
        (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1

    // The TS calculateDateRange iterates day-by-day and throws on the first error.
    // We don't know how many succeeded before the error.
    // Unlike Go's RecalculateRange which returns (count, error), the TS version
    // throws without a count. We report all days as failed.
    return {
      processedDays: 0,
      failedDays: totalDays,
      errors: [
        {
          employeeId,
          date: from,
          error: err instanceof Error ? err.message : String(err),
        },
      ],
    }
  }
}
```

**Key difference from Go**: The Go `RecalculateRange` returns `(count, error)` where `count` is the number of days successfully processed before the error. The TS `calculateDateRange` does not return partial counts on error -- it throws. Since `calculateDateRange` iterates day-by-day internally and any exception aborts, we cannot know how many succeeded. For the initial port, we report `processedDays: 0` on error. This is acceptable because:
1. All callers use best-effort error handling.
2. The `RecalcResult` is logged/returned but not used for retry logic.
3. A future enhancement could modify `calculateDateRange` to return partial results on error.

#### 2.5 Method: `triggerRecalcBatch()`

Port of Go `TriggerRecalcBatch()`. Multiple employees, continues on errors.

```ts
/**
 * Recalculates a date range for multiple employees.
 * Continues processing on individual errors.
 */
async triggerRecalcBatch(
  tenantId: string,
  employeeIds: string[],
  from: Date,
  to: Date,
): Promise<RecalcResult> {
  const result: RecalcResult = {
    processedDays: 0,
    failedDays: 0,
    errors: [],
  }

  for (const empId of employeeIds) {
    const empResult = await this.triggerRecalcRange(tenantId, empId, from, to)
    result.processedDays += empResult.processedDays
    result.failedDays += empResult.failedDays
    result.errors.push(...empResult.errors)
  }

  return result
}
```

**Matches Go exactly**: iterates, aggregates, continues on error.

#### 2.6 Method: `triggerRecalcAll()`

Port of Go `TriggerRecalcAll()`. All active employees in a tenant.

```ts
/**
 * Recalculates a date range for all active employees in a tenant.
 */
async triggerRecalcAll(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<RecalcResult> {
  // Get all active employees
  const employees = await this.prisma.employee.findMany({
    where: {
      tenantId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  })

  // Extract employee IDs
  const employeeIds = employees.map((emp) => emp.id)

  return this.triggerRecalcBatch(tenantId, employeeIds, from, to)
}
```

**Key difference from Go**: The Go version uses `employeeRepo.List()` with an `EmployeeFilter`. In TS, we use Prisma directly (consistent with existing TS services that don't have separate repositories). We add `deletedAt: null` because the Go `EmployeeFilter.IsActive` effectively filters out soft-deleted employees.

Note: Unlike Go where `triggerRecalcAll` returns `(*RecalcResult, error)`, in TS we let the Prisma query error propagate naturally as an exception. If the employee listing fails, the caller gets an uncaught exception (same behavior as if the Go version returned the error).

### Verification
- `npx tsc --noEmit` passes
- Service class created with all 4 methods

---

## Phase 3: Write RecalcService Tests

### Goal
Port all 10 Go test cases to vitest, plus add a test for monthly recalc behavior.

### Changes

#### 3.1 Create test file

**File**: `apps/web/src/server/services/__tests__/recalc.test.ts` (new)

#### 3.2 Mock setup

Since `RecalcService` delegates to `DailyCalcService` and `MonthlyCalcService`, we mock those services (NOT Prisma). This matches the Go tests which mock `dailyCalcServiceForRecalc` and `employeeRepositoryForRecalc`.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { RecalcService } from "../recalc"
import type { PrismaClient, DailyValue } from "@/generated/prisma/client"
import type { DailyCalcService } from "../daily-calc"
import type { MonthlyCalcService } from "../monthly-calc"

// --- Mock Services ---

function createMockDailyCalcService() {
  return {
    calculateDay: vi.fn().mockResolvedValue(makeDailyValue()),
    calculateDateRange: vi.fn().mockResolvedValue({ count: 0, values: [] }),
  } as unknown as DailyCalcService
}

function createMockMonthlyCalcService() {
  return {
    calculateMonth: vi.fn().mockResolvedValue({}),
  } as unknown as MonthlyCalcService
}

function createMockPrisma(employees: Array<{ id: string }> = []) {
  return {
    employee: {
      findMany: vi.fn().mockResolvedValue(employees),
    },
  } as unknown as PrismaClient
}

// --- Test Data ---

const TENANT_ID = "t-1"
const EMPLOYEE_ID = "e-1"
const DATE = new Date("2026-01-20T00:00:00Z")

function makeDailyValue(): Partial<DailyValue> {
  return { id: "dv-1", employeeId: EMPLOYEE_ID, valueDate: DATE }
}
```

#### 3.3 Test cases (11 total)

Map Go tests + add monthly recalc verification:

| # | Test | Go Equivalent | Key Assertion |
|---|---|---|---|
| 1 | `triggerRecalc -- success` | `TriggerRecalc_Success` | processedDays: 1, failedDays: 0, no errors |
| 2 | `triggerRecalc -- calls monthly recalc` | (new, not in Go tests) | `monthlyCalcService.calculateMonth` called with correct year/month |
| 3 | `triggerRecalc -- error on daily calc` | `TriggerRecalc_Error` | processedDays: 0, failedDays: 1, error message captured |
| 4 | `triggerRecalc -- monthly recalc error is swallowed` | (new) | Daily succeeds, monthly throws, still returns processedDays: 1 |
| 5 | `triggerRecalcRange -- success` | `TriggerRecalcRange_Success` | processedDays matches range count |
| 6 | `triggerRecalcRange -- error` | `TriggerRecalcRange_PartialFailure` | failedDays calculated from date range |
| 7 | `triggerRecalcBatch -- all success` | `TriggerRecalcBatch_AllSuccess` | Aggregated processedDays across employees |
| 8 | `triggerRecalcBatch -- continues on error` | `TriggerRecalcBatch_ContinuesOnError` | 1st OK, 2nd fails, 3rd OK; all processed |
| 9 | `triggerRecalcBatch -- empty list` | `TriggerRecalcBatch_EmptyList` | Zero counts |
| 10 | `triggerRecalcAll -- success` | `TriggerRecalcAll_Success` | Lists employees, recalcs each |
| 11 | `triggerRecalcAll -- employee list error` | `TriggerRecalcAll_EmployeeListError` | Throws when Prisma findMany fails |

#### 3.4 Detailed test implementations

**Test 1: `triggerRecalc -- success`**
```ts
describe("triggerRecalc", () => {
  it("returns processedDays: 1 on success", async () => {
    const mockDaily = createMockDailyCalcService()
    const mockMonthly = createMockMonthlyCalcService()
    const mockPrisma = createMockPrisma()
    const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

    const result = await service.triggerRecalc(TENANT_ID, EMPLOYEE_ID, DATE)

    expect(result.processedDays).toBe(1)
    expect(result.failedDays).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(mockDaily.calculateDay).toHaveBeenCalledWith(TENANT_ID, EMPLOYEE_ID, DATE)
  })
})
```

**Test 2: `triggerRecalc -- calls monthly recalc`**
```ts
it("calls monthly recalc after daily calc", async () => {
  const mockDaily = createMockDailyCalcService()
  const mockMonthly = createMockMonthlyCalcService()
  const mockPrisma = createMockPrisma()
  const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

  await service.triggerRecalc(TENANT_ID, EMPLOYEE_ID, DATE)

  expect(mockMonthly.calculateMonth).toHaveBeenCalledWith(
    EMPLOYEE_ID,
    2026, // DATE.getUTCFullYear()
    1,    // DATE.getUTCMonth() + 1
  )
})
```

**Test 3: `triggerRecalc -- error on daily calc`**
```ts
it("returns failedDays: 1 when calculateDay fails", async () => {
  const mockDaily = createMockDailyCalcService()
  ;(mockDaily.calculateDay as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error("calculation failed")
  )
  const mockMonthly = createMockMonthlyCalcService()
  const mockPrisma = createMockPrisma()
  const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

  const result = await service.triggerRecalc(TENANT_ID, EMPLOYEE_ID, DATE)

  expect(result.processedDays).toBe(0)
  expect(result.failedDays).toBe(1)
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0]!.employeeId).toBe(EMPLOYEE_ID)
  expect(result.errors[0]!.error).toBe("calculation failed")
  // Monthly recalc should NOT be called when daily fails
  expect(mockMonthly.calculateMonth).not.toHaveBeenCalled()
})
```

**Test 4: `triggerRecalc -- monthly recalc error swallowed`**
```ts
it("swallows monthly recalc errors (best-effort)", async () => {
  const mockDaily = createMockDailyCalcService()
  const mockMonthly = createMockMonthlyCalcService()
  ;(mockMonthly.calculateMonth as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error("month closed")
  )
  const mockPrisma = createMockPrisma()
  const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

  const result = await service.triggerRecalc(TENANT_ID, EMPLOYEE_ID, DATE)

  expect(result.processedDays).toBe(1)
  expect(result.failedDays).toBe(0)
  expect(result.errors).toHaveLength(0)
})
```

**Test 5: `triggerRecalcRange -- success`**
```ts
describe("triggerRecalcRange", () => {
  it("returns processedDays from calculateDateRange count", async () => {
    const from = new Date("2026-01-20T00:00:00Z")
    const to = new Date("2026-01-24T00:00:00Z") // 5 days
    const mockDaily = createMockDailyCalcService()
    ;(mockDaily.calculateDateRange as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 5,
      values: [],
    })
    const mockMonthly = createMockMonthlyCalcService()
    const mockPrisma = createMockPrisma()
    const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

    const result = await service.triggerRecalcRange(TENANT_ID, EMPLOYEE_ID, from, to)

    expect(result.processedDays).toBe(5)
    expect(result.failedDays).toBe(0)
    expect(result.errors).toHaveLength(0)
  })
})
```

**Test 6: `triggerRecalcRange -- error`**
```ts
it("reports all days as failed when calculateDateRange throws", async () => {
  const from = new Date("2026-01-20T00:00:00Z")
  const to = new Date("2026-01-24T00:00:00Z") // 5 days
  const mockDaily = createMockDailyCalcService()
  ;(mockDaily.calculateDateRange as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error("db error")
  )
  const mockMonthly = createMockMonthlyCalcService()
  const mockPrisma = createMockPrisma()
  const service = new RecalcService(mockPrisma, mockDaily, mockMonthly)

  const result = await service.triggerRecalcRange(TENANT_ID, EMPLOYEE_ID, from, to)

  expect(result.processedDays).toBe(0)
  expect(result.failedDays).toBe(5) // all 5 days failed
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0]!.error).toBe("db error")
})
```

**Tests 7-9: `triggerRecalcBatch` tests**
Follow the same structure as Go tests. Use 3 employees with 2-day range. Mock `calculateDateRange` per employee to return different results or throw errors. Verify aggregation and continuation.

**Tests 10-11: `triggerRecalcAll` tests**
Mock `prisma.employee.findMany` to return a list of employees (or throw an error). Verify that `calculateDateRange` is called for each employee.

### Verification
```bash
cd apps/web && npx vitest run src/server/services/__tests__/recalc.test.ts
```
All 11 tests pass.

---

## Phase 4: Update Router Callers

### Goal
Replace all inline `triggerRecalc()` functions in routers with `RecalcService` calls. This eliminates duplication and adds the missing monthly recalc trigger.

### Changes

#### 4.1 Update `bookings.ts`

**File**: `apps/web/src/server/routers/bookings.ts`

**Remove** (lines 460-484):
- The inline `triggerRecalc()` function.
- The `DailyCalcService` import (if only used by triggerRecalc).

**Add** import:
```ts
import { RecalcService } from "../services/recalc"
```

**Replace** all calls from:
```ts
await triggerRecalc(ctx.prisma, tenantId, employeeId, bookingDate)
```
to:
```ts
try {
  const recalcService = new RecalcService(ctx.prisma)
  await recalcService.triggerRecalc(tenantId, employeeId, bookingDate)
} catch (error) {
  console.error(
    `Recalc failed for employee ${employeeId} on ${bookingDate.toISOString().split("T")[0]}:`,
    error,
  )
}
```

Alternatively, create a thin best-effort wrapper at the top of the file to keep the call sites clean:
```ts
async function bestEffortRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date,
): Promise<void> {
  try {
    const service = new RecalcService(prisma)
    await service.triggerRecalc(tenantId, employeeId, date)
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${date.toISOString().split("T")[0]}:`,
      error,
    )
  }
}
```

Then call sites remain: `await bestEffortRecalc(ctx.prisma, tenantId, employeeId, bookingDate)`

This wrapper preserves the existing best-effort error handling pattern while using RecalcService internally.

#### 4.2 Update `absences.ts`

**File**: `apps/web/src/server/routers/absences.ts`

**Remove** (lines 328-371):
- The inline `triggerRecalc()` function.
- The inline `triggerRecalcRange()` function.
- The `DailyCalcService` import (if only used by these functions).

**Add** import:
```ts
import { RecalcService } from "../services/recalc"
```

**Replace** single-day calls:
```ts
// Before
await triggerRecalc(ctx.prisma, tenantId, employeeId, date)

// After
try {
  const recalcService = new RecalcService(ctx.prisma)
  await recalcService.triggerRecalc(tenantId, employeeId, date)
} catch (error) {
  console.error(`Recalc failed for employee ${employeeId}:`, error)
}
```

**Replace** range calls:
```ts
// Before
await triggerRecalcRange(ctx.prisma, tenantId, employeeId, fromDate, toDate)

// After
try {
  const recalcService = new RecalcService(ctx.prisma)
  await recalcService.triggerRecalcRange(tenantId, employeeId, fromDate, toDate)
} catch (error) {
  console.error(`Recalc range failed for employee ${employeeId}:`, error)
}
```

Or use the same `bestEffortRecalc` / `bestEffortRecalcRange` wrapper pattern from 4.1.

#### 4.3 Update `employees.ts`

**File**: `apps/web/src/server/routers/employees.ts`

The `calculateDay` procedure (line 1569) creates a `DailyCalcService` directly and calls `calculateDay()`. This is a user-triggered manual recalculation, so it should NOT be best-effort -- the result is returned to the user.

**Change**: Replace with `RecalcService.triggerRecalc()` to also trigger monthly recalc:
```ts
// Before
const service = new DailyCalcService(ctx.prisma)
const result = await service.calculateDay(tenantId, employeeId, date)

// After
const dailyService = new DailyCalcService(ctx.prisma)
const result = await dailyService.calculateDay(tenantId, employeeId, date)

// Also trigger monthly recalc (best-effort)
try {
  const monthlyService = new MonthlyCalcService(ctx.prisma)
  await monthlyService.calculateMonth(
    employeeId,
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
  )
} catch {
  // Monthly recalc is best-effort
}
```

**Decision note**: We keep the direct `DailyCalcService.calculateDay()` call here (not `RecalcService.triggerRecalc()`) because the procedure returns the `DailyValue` result to the user. The `RecalcService.triggerRecalc()` returns a `RecalcResult` (counts), not the `DailyValue`. We add the monthly recalc call separately.

#### 4.4 Implement `systemSettings.cleanupReReadBookings` execute mode

**File**: `apps/web/src/server/routers/systemSettings.ts`

Replace the `throw new TRPCError({ code: "PRECONDITION_FAILED" })` block (lines 565-569) with an actual implementation:

```ts
// Execute mode: recalculate bookings
const recalcService = new RecalcService(ctx.prisma)

let result
if (input.employeeIds && input.employeeIds.length > 0) {
  result = await recalcService.triggerRecalcBatch(
    tenantId,
    input.employeeIds,
    input.dateFrom,
    input.dateTo,
  )
} else {
  result = await recalcService.triggerRecalcAll(
    tenantId,
    input.dateFrom,
    input.dateTo,
  )
}

return {
  operation: "re_read_bookings",
  affectedCount: result.processedDays,
  preview: false,
}
```

Add import:
```ts
import { RecalcService } from "../services/recalc"
```

**Note**: Check the `cleanupResultSchema` to ensure `affectedCount` and `preview` are the correct output fields. If the schema includes additional fields (e.g., `failedCount`, `errors`), extend the return accordingly.

### Verification
```bash
cd apps/web && npx tsc --noEmit
```
No compilation errors. All routers updated.

---

## Phase 5: Final Verification

### Goal
Ensure everything compiles and all tests pass end-to-end.

### Steps

1. **TypeScript compilation**:
   ```bash
   cd apps/web && npx tsc --noEmit
   ```

2. **RecalcService tests**:
   ```bash
   cd apps/web && npx vitest run src/server/services/__tests__/recalc.test.ts
   ```

3. **Verify existing tests not broken** (the routers we modified have tests):
   ```bash
   cd apps/web && npx vitest run src/server/__tests__/
   ```

4. **Smoke check**: Verify the inline `triggerRecalc` functions have been removed from:
   - `bookings.ts` -- should no longer contain `function triggerRecalc`
   - `absences.ts` -- should no longer contain `function triggerRecalc` or `function triggerRecalcRange`

5. **Verify systemSettings execute mode**: The `cleanupReReadBookings` mutation with `confirm: true` should no longer throw `PRECONDITION_FAILED`.

---

## Summary of Files

### New Files
| File | Description |
|---|---|
| `apps/web/src/server/services/recalc.ts` | RecalcService class (4 public methods) |
| `apps/web/src/server/services/recalc.types.ts` | RecalcResult, RecalcError interfaces |
| `apps/web/src/server/services/__tests__/recalc.test.ts` | 11 unit tests |

### Modified Files
| File | Change |
|---|---|
| `apps/web/src/server/routers/bookings.ts` | Remove inline triggerRecalc, use RecalcService |
| `apps/web/src/server/routers/absences.ts` | Remove inline triggerRecalc + triggerRecalcRange, use RecalcService |
| `apps/web/src/server/routers/employees.ts` | Add monthly recalc after calculateDay |
| `apps/web/src/server/routers/systemSettings.ts` | Implement cleanupReReadBookings execute mode |

## Go File Being Replaced

| Go File | Lines | TS Replacement |
|---|---|---|
| `apps/api/internal/service/recalc.go` | 146 | `apps/web/src/server/services/recalc.ts` |

## Acceptance Criteria Mapping

| Criterion | How It's Met |
|---|---|
| Forward Cascade berechnet alle betroffenen Folgetage | `triggerRecalc()` calls `DailyCalcService.calculateDay()` then `MonthlyCalcService.calculateMonth()` |
| Monats-Aggregation wird nach Day-Recalc ausgelost | `triggerRecalc()` calls `monthlyCalcService.calculateMonth()` after daily calc |
| Keine Endlos-Loops bei zirkularen Abhangigkeiten | Not applicable to the Go implementation being ported (no loop risk in linear daily->monthly flow). The Go source has no queue-based processing; the ticket description's "queue" is aspirational for future work |
| Performance: Cascade fur einen Monat < 5 Sekunden | Maintained by using existing optimized DailyCalcService and MonthlyCalcService |
| Identische Ergebnisse wie Go-Implementation | All 4 methods match Go logic; tests ported from Go test file |

## Note on "Forward Cascade" and "Queue-Based Processing"

The ticket description mentions "Forward Cascade" with cascade detection and queue-based loop prevention. However, the actual Go source code (`recalc.go`, 146 lines) does NOT implement any of these features. The Go code is a simple orchestration layer:
- `TriggerRecalc()` = daily calc + monthly calc (no cascade detection, no queue)
- `TriggerRecalcRange()` = daily calc for range (no monthly, no cascade)
- `TriggerRecalcBatch()` = loop over employees
- `TriggerRecalcAll()` = list employees + batch

The "forward cascade" described in the ticket (dirty marking, cascade detection, loop prevention) appears to be aspirational/future work rather than existing Go behavior. This plan ports the **actual Go implementation** faithfully. If forward cascade logic is needed later, it can be added as a separate enhancement on top of this RecalcService.
