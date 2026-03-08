# ZMI-TICKET-240: Absence Service + Router Implementation Plan

## Overview

Port the Go absence service (760 lines), handler (1079 lines), and repository (224 lines) to a tRPC `absences` router with 9 procedures: CRUD, range creation with weekend/off-day exclusion, and approval workflow (approve/reject/cancel). Includes vacation balance recalculation after approval status changes and frontend hooks migration from legacy REST to tRPC.

## Current State Analysis

- **Prisma schema exists**: `AbsenceDay`, `VacationBalance`, `EmployeeDayPlan`, `AbsenceType`, `Holiday` models all exist (ZMI-TICKET-237).
- **AbsenceType router exists**: `apps/web/src/server/routers/absenceTypes.ts` (487 lines, ZMI-TICKET-218) -- separate router, not touched.
- **Frontend hooks exist**: `apps/web/src/hooks/api/use-absences.ts` (150 lines, 7 hooks) -- all using legacy REST via `useApiQuery`/`useApiMutation`.
- **16 frontend components** import from `use-absences.ts`.
- **No `absences` router** exists yet in `apps/web/src/server/routers/`.
- **DailyCalcService** exists at `apps/web/src/server/services/daily-calc.ts` with `calculateDay()` and `calculateDateRange()`.
- **No vacation recalc service** exists in TypeScript -- must be written inline or as a helper.

### Key Discoveries:
- Permission keys: `absences.request`, `absences.approve`, `absences.manage` at `apps/web/src/server/lib/permission-catalog.ts:97-99`
- Recalc pattern from `apps/web/src/server/routers/bookings.ts:469-484`: instantiate `DailyCalcService`, call `calculateDay()`, wrap in try/catch for best-effort
- Data scope pattern from `apps/web/src/server/routers/dailyValues.ts:123-163`: `buildXxxDataScopeWhere()` + `checkXxxDataScope()` functions
- Notification pattern from `apps/web/src/server/routers/dailyValues.ts:432-462`: raw SQL to look up `user_id` from `user_tenants`, then `prisma.notification.create()`
- tRPC hook pattern from `apps/web/src/hooks/api/use-monthly-values.ts`: `useTRPC()` + `useQuery`/`useMutation` with `queryOptions`/`mutationOptions` + `queryClient.invalidateQueries()`
- Holidays are NOT skipped during absence creation per ZMI spec Section 18.2 (confirmed in research doc Section 1.1)
- Partial unique index on `(employeeId, absenceDate) WHERE status != 'cancelled'` -- no Prisma unique constraint, must check in application code
- `shouldSkipDate()` logic: skip weekends (Saturday=6, Sunday=0 via `getUTCDay()`), skip if no `EmployeeDayPlan` for date, skip if `dayPlanId` is null (off-day)

## Desired End State

After this plan is complete:
1. A new `absences` tRPC router with 9 procedures (list, forEmployee, getById, createRange, update, delete, approve, reject, cancel) is registered in `root.ts`.
2. Range creation correctly generates per-day `AbsenceDay` records, skipping weekends and off-days, with recalculation triggered after creation.
3. Approval workflow transitions (pending->approved, pending->rejected, approved->cancelled) work correctly with recalc and vacation balance updates.
4. Frontend hooks in `use-absences.ts` use tRPC instead of legacy REST, with the same exported function signatures.
5. All 16 consuming frontend components continue to work without changes (backward-compatible hook signatures).
6. Unit tests cover helper functions (mapper, data scope, skip date logic, vacation recalc) and key business logic.

### Verification:
- `npx tsc --noEmit` passes in `apps/web/`
- `npx vitest run apps/web/src/server/routers/__tests__/absences.test.ts` passes
- Frontend compiles without errors
- Manual: create absence range via UI, verify weekends skipped, approve and check vacation balance update

## What We're NOT Doing

- **AbsenceType CRUD** -- already done in ZMI-TICKET-218
- **Vacation Balance calculation** -- separate ticket ZMI-TICKET-241 (we only port `RecalculateTaken` as a helper needed by approve/cancel)
- **`GetBalance` endpoint** from `handler/vacation.go` -- the vacation router already handles this
- **Notifications to scoped admins** on pending creation -- defer to a follow-up (complex scoping query for users with `absences.approve` permission)
- **`deleteRange` bulk operation** -- low-priority, can be added later if needed
- **Frontend component changes** -- only hooks file changes, component code stays as-is

## Implementation Approach

Follow the established patterns from `dailyValues.ts` and `monthlyValues.ts` routers. Build the router in a single file with all 9 procedures. Extract the vacation recalc logic as a helper function within the router file. Migrate hooks to tRPC using the same pattern as `use-monthly-values.ts` and `use-bookings.ts`.

---

## Phase 1: tRPC Router -- Schema, Helpers, and Query Procedures

### Overview
Create the `absences.ts` router file with Zod schemas, permission constants, data scope helpers, mapper functions, and the 3 read-only procedures (list, forEmployee, getById). Register in `root.ts`.

### Changes Required:

#### 1. Create Router File
**File**: `apps/web/src/server/routers/absences.ts`

**Structure** (following `dailyValues.ts` pattern):
```ts
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Decimal } from "@prisma/client/runtime/client"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { DailyCalcService } from "../services/daily-calc"
```

**Permission constants**:
```ts
const ABSENCE_REQUEST = permissionIdByKey("absences.request")!
const ABSENCE_APPROVE = permissionIdByKey("absences.approve")!
const ABSENCE_MANAGE = permissionIdByKey("absences.manage")!
```

**Output schema** -- `absenceDayOutputSchema`:
```ts
const absenceDayOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  absenceDate: z.string(),  // YYYY-MM-DD string for dates
  absenceTypeId: z.string().uuid(),
  duration: z.number(),     // Decimal -> number
  halfDayPeriod: z.string().nullable(),
  status: z.string(),       // "pending" | "approved" | "rejected" | "cancelled"
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.date().nullable(),
  rejectionReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Nested relations (included in list/getById)
  employee: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    isActive: z.boolean(),
    departmentId: z.string().uuid().nullable(),
  }).nullable().optional(),
  absenceType: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    category: z.string(),
    color: z.string(),
    deductsVacation: z.boolean(),
  }).nullable().optional(),
})
```

**Input schemas**:
- `listInputSchema`: `{ page?, pageSize?, employeeId?, absenceTypeId?, status?, fromDate?, toDate? }`
- `forEmployeeInputSchema`: `{ employeeId, fromDate?, toDate?, status? }`
- `getByIdInputSchema`: `{ id }`

**Prisma include objects**:
```ts
const absenceDayListInclude = {
  employee: {
    select: {
      id: true, firstName: true, lastName: true,
      personnelNumber: true, isActive: true, departmentId: true,
    },
  },
  absenceType: {
    select: {
      id: true, code: true, name: true,
      category: true, color: true, deductsVacation: true,
    },
  },
} as const
```

**Data scope helpers** (following `dailyValues.ts:123-163`):
- `buildAbsenceDataScopeWhere(dataScope)` -- returns Prisma WHERE for department/employee scope
- `checkAbsenceDataScope(dataScope, item)` -- throws FORBIDDEN if item not in scope

**Mapper function**:
- `mapAbsenceDayToOutput(record)` -- converts Prisma record to output schema, handling Decimal duration

**Query procedures**:

1. **`absences.list`** (query):
   - Middleware: `tenantProcedure.use(requirePermission(ABSENCE_MANAGE)).use(applyDataScope())`
   - Input: `listInputSchema`
   - Output: `{ items: AbsenceDay[], total: number }`
   - Implementation: Paginated Prisma query with filters + data scope merge (same pattern as `dailyValues.listAll`)
   - OrderBy: `{ absenceDate: "desc" }`

2. **`absences.forEmployee`** (query):
   - Middleware: `tenantProcedure.use(requireEmployeePermission(getter, ABSENCE_REQUEST, ABSENCE_MANAGE))`
   - Input: `forEmployeeInputSchema`
   - Output: `AbsenceDay[]`
   - Implementation: Simple findMany with optional date range + status filter

3. **`absences.getById`** (query):
   - Middleware: `tenantProcedure.use(requirePermission(ABSENCE_MANAGE)).use(applyDataScope())`
   - Input: `{ id }`
   - Output: single `AbsenceDay`
   - Implementation: findFirst with tenant scope, check data scope, return mapped

#### 2. Register in root.ts
**File**: `apps/web/src/server/root.ts`

Add import and registration:
```ts
import { absencesRouter } from "./routers/absences"
// ...
absences: absencesRouter,
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Router is registered and app starts: `cd apps/web && npx next build` (or dev server starts)

#### Manual Verification:
- [ ] `absences.list` returns paginated results when called via tRPC client
- [ ] `absences.forEmployee` returns employee-scoped absences
- [ ] `absences.getById` returns a single absence with relations

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Mutation Procedures -- CreateRange, Update, Delete

### Overview
Add the 3 write procedures: `createRange` (core range creation with skip logic), `update` (partial update of pending absences), and `delete`. Includes the `shouldSkipDate()` helper and recalc triggers.

### Changes Required:

#### 1. Add shouldSkipDate Helper
**File**: `apps/web/src/server/routers/absences.ts`

Port from Go `service/absence.go` shouldSkipDate:
```ts
/**
 * Determines if a date should be skipped during range creation.
 * Port of Go shouldSkipDate() from service/absence.go.
 *
 * Skip rules:
 * 1. Weekends (Saturday=6, Sunday=0 via getUTCDay())
 * 2. No EmployeeDayPlan for the date (no_plan)
 * 3. EmployeeDayPlan exists but dayPlanId is null (off_day)
 *
 * Holidays are NOT skipped per ZMI spec Section 18.2.
 */
function shouldSkipDate(
  date: Date,
  dayPlanMap: Map<string, { dayPlanId: string | null }>
): boolean {
  const dayOfWeek = date.getUTCDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) return true // weekend

  const dateKey = date.toISOString().split("T")[0]!
  const dayPlan = dayPlanMap.get(dateKey)
  if (!dayPlan) return true           // no plan -> skip
  if (!dayPlan.dayPlanId) return true  // off-day -> skip

  return false
}
```

#### 2. Add triggerRecalcRange Helper
```ts
/**
 * Triggers recalculation for a date range.
 * Best effort -- errors logged but don't fail parent operation.
 */
async function triggerRecalcRange(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  fromDate: Date,
  toDate: Date
): Promise<void> {
  try {
    const service = new DailyCalcService(prisma)
    await service.calculateDateRange(tenantId, employeeId, fromDate, toDate)
  } catch (error) {
    console.error(`Recalc range failed for employee ${employeeId}:`, error)
  }
}
```

#### 3. Add createRange Mutation
**Input schema**:
```ts
const createRangeInputSchema = z.object({
  employeeId: z.string().uuid(),
  absenceTypeId: z.string().uuid(),
  fromDate: z.string().date(),  // YYYY-MM-DD
  toDate: z.string().date(),    // YYYY-MM-DD
  duration: z.number().min(0.5).max(1).default(1),
  halfDayPeriod: z.enum(["morning", "afternoon"]).optional(),
  notes: z.string().optional(),
})
```

**Procedure**:
- Middleware: `tenantProcedure.use(requireEmployeePermission(getter, ABSENCE_REQUEST, ABSENCE_MANAGE))`
- **Logic** (port of Go `CreateRange`):
  1. Validate `fromDate <= toDate`
  2. Validate absence type exists, is active, belongs to tenant (or system type)
  3. Batch-fetch `EmployeeDayPlan` records for the date range -> build `dayPlanMap`
  4. Batch-fetch existing absences for employee in range where `status != 'cancelled'` -> build `existingMap`
  5. Iterate day-by-day from `fromDate` to `toDate`:
     - Call `shouldSkipDate(date, dayPlanMap)` -> skip if true
     - Check `existingMap` for date -> skip if already has absence
     - Add to `toCreate` array
  6. Batch create via `prisma.absenceDay.createMany({ data: toCreate })`
  7. Re-fetch created records with relations
  8. Trigger `triggerRecalcRange()` (best effort)
  9. Return `{ createdDays: AbsenceDay[], skippedDates: string[] }`

**Output schema**:
```ts
const createRangeOutputSchema = z.object({
  createdDays: z.array(absenceDayOutputSchema),
  skippedDates: z.array(z.string()),  // YYYY-MM-DD strings of skipped dates
})
```

#### 4. Add update Mutation
**Input**: `{ id, duration?, halfDayPeriod?, notes? }`
- Middleware: `tenantProcedure.use(requirePermission(ABSENCE_MANAGE)).use(applyDataScope())`
- Validate absence exists + tenant scope + data scope check
- Validate status is `"pending"` (only pending can be updated)
- Partial update, trigger recalc for the absence date

#### 5. Add delete Mutation
**Input**: `{ id }`
- Middleware: `tenantProcedure.use(requirePermission(ABSENCE_MANAGE)).use(applyDataScope())`
- Validate absence exists + tenant scope + data scope check
- If was approved and type `deductsVacation`, trigger vacation recalc (Phase 3)
- Hard delete, trigger recalc

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Unit test for `shouldSkipDate()` passes (see Phase 4)

#### Manual Verification:
- [ ] Creating a range Mon-Fri creates 5 AbsenceDay records, skips Sat/Sun
- [ ] Creating a range that includes an off-day (no dayPlanId) skips that day
- [ ] Creating a range overlapping existing absences skips those dates (idempotent)
- [ ] Updating a pending absence works; updating an approved absence returns error
- [ ] Deleting an absence triggers recalc for that date

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Approval Workflow and Vacation Balance Recalc

### Overview
Add the 3 approval procedures (approve, reject, cancel) and the vacation balance recalculation helper. This is the most critical business logic phase.

### Changes Required:

#### 1. Add recalculateVacationTaken Helper
**File**: `apps/web/src/server/routers/absences.ts`

Port of Go `VacationService.RecalculateTaken()` from `service/vacation.go:425-493`:

```ts
/**
 * Recalculates vacation taken for an employee/year.
 * Sums up all approved absence days for vacation-deducting types,
 * weighted by dayPlan.vacationDeduction * absence.duration.
 *
 * Port of Go VacationService.RecalculateTaken().
 */
async function recalculateVacationTaken(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
): Promise<void> {
  // 1. Get all absence types where deductsVacation = true
  const vacationTypes = await prisma.absenceType.findMany({
    where: {
      OR: [{ tenantId }, { tenantId: null }],
      deductsVacation: true,
    },
    select: { id: true },
  })

  if (vacationTypes.length === 0) return

  const typeIds = vacationTypes.map((t) => t.id)

  // 2. Year range
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year, 11, 31))

  // 3. Fetch approved absence days for these types in the year
  const absenceDays = await prisma.absenceDay.findMany({
    where: {
      employeeId,
      absenceTypeId: { in: typeIds },
      status: "approved",
      absenceDate: { gte: yearStart, lte: yearEnd },
    },
    select: {
      absenceDate: true,
      duration: true,
    },
  })

  // 4. Fetch day plans for the year (for vacationDeduction)
  const dayPlans = await prisma.employeeDayPlan.findMany({
    where: {
      employeeId,
      planDate: { gte: yearStart, lte: yearEnd },
    },
    include: {
      dayPlan: {
        select: { vacationDeduction: true },
      },
    },
  })

  // Build dayPlan lookup by date
  const dayPlanMap = new Map<string, number>()
  for (const dp of dayPlans) {
    const dateKey = dp.planDate.toISOString().split("T")[0]!
    const deduction = dp.dayPlan?.vacationDeduction
    dayPlanMap.set(
      dateKey,
      deduction instanceof Decimal ? deduction.toNumber() : Number(deduction ?? 1)
    )
  }

  // 5. Calculate total taken
  let totalTaken = 0
  for (const absence of absenceDays) {
    const dateKey = absence.absenceDate.toISOString().split("T")[0]!
    const vacationDeduction = dayPlanMap.get(dateKey) ?? 1.0
    const duration =
      absence.duration instanceof Decimal
        ? absence.duration.toNumber()
        : Number(absence.duration)
    totalTaken += vacationDeduction * duration
  }

  // 6. Upsert vacation balance
  await prisma.vacationBalance.upsert({
    where: {
      employeeId_year: { employeeId, year },
    },
    update: {
      taken: totalTaken,
    },
    create: {
      tenantId,
      employeeId,
      year,
      taken: totalTaken,
      entitlement: 0,
      carryover: 0,
      adjustments: 0,
    },
  })
}
```

#### 2. Add approve Mutation

**Input**: `{ id }`
- Middleware: `tenantProcedure.use(requirePermission(ABSENCE_APPROVE)).use(applyDataScope())`
- **Logic**:
  1. Fetch absence with employee + absenceType relations
  2. Check data scope
  3. Validate status is `"pending"`
  4. Update: `status = "approved"`, `approvedBy = ctx.user.id`, `approvedAt = new Date()`
  5. Trigger recalc for the absence date (best effort)
  6. If `absenceType.deductsVacation`: call `recalculateVacationTaken()` (best effort)
  7. Send notification to employee (best effort, same pattern as `dailyValues.approve`)
  8. Return updated record

#### 3. Add reject Mutation

**Input**: `{ id, reason?: string }`
- Middleware: `tenantProcedure.use(requirePermission(ABSENCE_APPROVE)).use(applyDataScope())`
- **Logic**:
  1. Fetch absence with employee + absenceType relations
  2. Check data scope
  3. Validate status is `"pending"`
  4. Update: `status = "rejected"`, `rejectionReason = reason`
  5. Trigger recalc for the absence date (best effort)
  6. Send rejection notification to employee (best effort)
  7. Return updated record

#### 4. Add cancel Mutation

**Input**: `{ id }`
- Middleware: `tenantProcedure.use(requirePermission(ABSENCE_APPROVE)).use(applyDataScope())`
- **Logic**:
  1. Fetch absence with employee + absenceType relations
  2. Check data scope
  3. Validate status is `"approved"` (only approved can be cancelled)
  4. Update: `status = "cancelled"`
  5. Trigger recalc for the absence date (best effort)
  6. If `absenceType.deductsVacation`: call `recalculateVacationTaken()` (best effort)
  7. Return updated record

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Unit tests for `recalculateVacationTaken` pass (Phase 4)

#### Manual Verification:
- [ ] Approve a pending absence -> status becomes "approved", approvedBy/approvedAt set
- [ ] Approve triggers recalc and vacation balance update (if deductsVacation type)
- [ ] Reject a pending absence with reason -> status becomes "rejected", reason stored
- [ ] Cancel an approved absence -> status becomes "cancelled", vacation balance recalculated
- [ ] Cannot approve a rejected/cancelled absence (returns error)
- [ ] Cannot cancel a pending absence (returns error)
- [ ] Notifications sent to employee on approve/reject

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Frontend Hooks Migration

### Overview
Migrate `use-absences.ts` from legacy REST (`useApiQuery`/`useApiMutation`) to tRPC, following the pattern established in `use-monthly-values.ts` and `use-bookings.ts`. Keep the same exported function names and compatible return shapes so the 16 consuming components don't need changes.

### Changes Required:

#### 1. Rewrite use-absences.ts
**File**: `apps/web/src/hooks/api/use-absences.ts`

Replace all legacy REST hooks with tRPC equivalents:

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

**Hook mapping** (preserve exact function signatures):

| Hook | tRPC Call | Pattern |
|------|-----------|---------|
| `useAbsences(options)` | `trpc.absences.list.queryOptions(...)` | `useQuery` with `select` for backward compat |
| `useEmployeeAbsences(employeeId, opts)` | `trpc.absences.forEmployee.queryOptions(...)` | `useQuery` |
| `useAbsence(id, enabled)` | `trpc.absences.getById.queryOptions(...)` | `useQuery` |
| `useCreateAbsenceRange()` | `trpc.absences.createRange.mutationOptions()` | `useMutation` + invalidate |
| `useUpdateAbsence()` | `trpc.absences.update.mutationOptions()` | `useMutation` + invalidate |
| `useDeleteAbsence()` | `trpc.absences.delete.mutationOptions()` | `useMutation` + invalidate |
| `useApproveAbsence()` | `trpc.absences.approve.mutationOptions()` | `useMutation` + invalidate |
| `useRejectAbsence()` | `trpc.absences.reject.mutationOptions()` | `useMutation` + invalidate |

**Invalidation** (on mutations):
```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: trpc.absences.list.queryKey() })
  queryClient.invalidateQueries({ queryKey: trpc.absences.forEmployee.queryKey() })
  queryClient.invalidateQueries({ queryKey: trpc.absences.getById.queryKey() })
  // Also invalidate vacation balance queries
  queryClient.invalidateQueries({ queryKey: trpc.vacation.queryKey() })
}
```

**Important**: The `useCreateAbsenceRange` hook currently receives `{ path: { id: employeeId }, body: {...} }` from components. The new hook should accept `{ employeeId, absenceTypeId, fromDate, toDate, duration, notes }` directly. Check the calling components to determine if a thin adapter is needed, or if components already destructure the params.

#### 2. Add useCancelAbsence Hook
Add a new hook that the research document notes is missing:
```ts
export function useCancelAbsence() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absences.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.absences.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.absences.forEmployee.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.vacation.queryKey() })
    },
  })
}
```

#### 3. Update hooks index
**File**: `apps/web/src/hooks/api/index.ts`

Add `useCancelAbsence` to the re-exports from `use-absences`:
```ts
export {
  useAbsences,
  useEmployeeAbsences,
  useAbsence,
  useCreateAbsenceRange,
  useUpdateAbsence,
  useDeleteAbsence,
  useApproveAbsence,
  useRejectAbsence,
  useCancelAbsence,  // NEW
} from './use-absences'
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] No import errors from the 16 consuming components

#### Manual Verification:
- [ ] Absence request form creates absences via tRPC (no REST calls in network tab)
- [ ] Approval page loads absences via tRPC
- [ ] Approve/reject from UI works and invalidates queries
- [ ] Absence list refreshes after mutations

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Tests

### Overview
Write unit tests for the router helpers and key business logic. Follow the pattern established in `apps/web/src/server/routers/__tests__/monthlyValues.test.ts`.

### Changes Required:

#### 1. Create Test File
**File**: `apps/web/src/server/routers/__tests__/absences.test.ts`

**Test structure** (following `monthlyValues.test.ts` pattern):

```ts
import { describe, it, expect } from "vitest"
import { TRPCError } from "@trpc/server"
import { Decimal } from "@prisma/client/runtime/client"
import {
  mapAbsenceDayToOutput,
  buildAbsenceDataScopeWhere,
  checkAbsenceDataScope,
  shouldSkipDate,
} from "../absences"
import type { DataScope } from "../../middleware/authorization"
```

**Test categories**:

1. **`mapAbsenceDayToOutput` tests** (~8 tests):
   - Maps all core fields correctly
   - Serializes Decimal duration as number
   - Handles numeric (non-Decimal) duration
   - Includes employee when present
   - Includes absenceType when present
   - Handles null optional fields (approvedBy, approvedAt, rejectionReason, notes)
   - Formats absenceDate as YYYY-MM-DD string

2. **`buildAbsenceDataScopeWhere` tests** (~3 tests):
   - Returns null for "all" scope
   - Returns department filter for "department" scope
   - Returns employeeId filter for "employee" scope

3. **`checkAbsenceDataScope` tests** (~6 tests):
   - Passes for "all" scope
   - Passes when employee in department scope
   - Throws FORBIDDEN when employee not in department scope
   - Throws FORBIDDEN when employee has no department
   - Passes when employee in employee scope
   - Throws FORBIDDEN when employee not in employee scope

4. **`shouldSkipDate` tests** (~6 tests):
   - Skips Saturday (getUTCDay() === 6)
   - Skips Sunday (getUTCDay() === 0)
   - Does not skip Monday-Friday
   - Skips when no day plan exists for date
   - Skips when day plan exists but dayPlanId is null (off-day)
   - Does not skip when day plan exists with valid dayPlanId

5. **Status transition validation tests** (~4 tests, if exported as helpers):
   - Approve requires status = "pending"
   - Reject requires status = "pending"
   - Cancel requires status = "approved"
   - Update requires status = "pending"

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/routers/__tests__/absences.test.ts`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Test coverage looks reasonable for the helper functions
- [ ] No flaky tests

**Implementation Note**: After completing this phase, the implementation is complete.

---

## Testing Strategy

### Unit Tests:
- `shouldSkipDate()` -- weekend detection, day plan checks
- `mapAbsenceDayToOutput()` -- Decimal handling, relation mapping
- Data scope helpers -- WHERE clause building, scope checking
- Status transition guards -- which statuses allow which operations

### Integration Tests (manual):
- Create range Mon-Fri -> verify 5 records created
- Create range with mid-week off-day -> verify off-day skipped
- Create overlapping range -> verify existing dates skipped (idempotent)
- Approve -> verify recalc triggered + vacation balance updated
- Cancel -> verify vacation balance reduced

### Manual Testing Steps:
1. Open absence request form, select date range Mon-Sun
2. Verify only Mon-Fri days appear in created absences
3. Approve an absence, check vacation balance widget updates
4. Reject an absence with reason, verify reason shown in UI
5. Cancel an approved absence, verify vacation balance decreases

## Performance Considerations

- **Batch day plan fetch**: Single Prisma query for entire date range, not per-day queries
- **Batch existing absence check**: Single query for `(employeeId, dateRange, status != cancelled)`
- **createMany**: Use `prisma.absenceDay.createMany()` for batch insert, not individual creates
- **Vacation recalc**: Fetches all year data in 3 queries (types, absences, day plans), computes in-memory
- **Recalc is best-effort**: Wrapped in try/catch, never blocks the response

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-240-absence-service-router.md`
- Research document: `thoughts/shared/research/2026-03-08-ZMI-TICKET-240-absence-service-router.md`
- Go absence service: `apps/api/internal/service/absence.go`
- Go absence handler: `apps/api/internal/handler/absence.go`
- Go absence repository: `apps/api/internal/repository/absenceday.go`
- Go vacation recalc: `apps/api/internal/service/vacation.go:425-493`
- Pattern reference (dailyValues router): `apps/web/src/server/routers/dailyValues.ts`
- Pattern reference (monthlyValues router): `apps/web/src/server/routers/monthlyValues.ts`
- Pattern reference (bookings recalc): `apps/web/src/server/routers/bookings.ts:460-484`
- Pattern reference (tRPC hooks): `apps/web/src/hooks/api/use-monthly-values.ts`
- Pattern reference (router tests): `apps/web/src/server/routers/__tests__/monthlyValues.test.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts:97-99`
- Authorization middleware: `apps/web/src/server/middleware/authorization.ts`
