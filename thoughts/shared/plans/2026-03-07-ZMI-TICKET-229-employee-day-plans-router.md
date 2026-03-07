# Plan: ZMI-TICKET-229 -- Employee Day Plans Router

Date: 2026-03-07
Ticket: ZMI-TICKET-229 -- Employee Day Plans Router (Bulk, Generate from Tariff)
Research: `thoughts/shared/research/2026-03-07-ZMI-TICKET-229-employee-day-plans-router.md`

---

## Summary

Implement the `employeeDayPlans` tRPC router with full CRUD, bulk create (upsert), delete range, per-employee listing, and `generateFromTariff` business logic. Port the Go service layer (568 lines) and handler (398 lines) into a single tRPC router file. Migrate frontend hooks from REST/fetch to tRPC.

## Dependencies

- **ZMI-TICKET-228** (Prisma schema) -- VERIFIED: `EmployeeDayPlan` model exists at schema line 1942-1967 with correct fields, unique constraint `[employeeId, planDate]`, and relations to Tenant, Employee, DayPlan, Shift.
- **ZMI-TICKET-219** (Tariff Configuration) -- VERIFIED: `tariffsRouter` exists with full CRUD and `tariffDetailInclude` that loads weekPlan, tariffWeekPlans (with weekPlan), tariffDayPlans (with dayPlan).
- **ZMI-TICKET-214** (Employees) -- VERIFIED: Employee model has `tariffId`, `entryDate`, `exitDate`, `isActive` fields needed for generateFromTariff.
- **ZMI-TICKET-203** (Authorization) -- VERIFIED: `requirePermission` middleware and `permissionIdByKey("time_plans.manage")` available (line 131-136 in permission-catalog.ts).

## Permission

The ticket mentions `employee_day_plans.read` and `employee_day_plans.write`, but the existing permission catalog uses **`time_plans.manage`** as the single permission covering employee day plan management. We will use `time_plans.manage` for consistency with the existing system.

---

## Phase 1: tRPC Router Implementation

### File: `apps/web/src/server/routers/employeeDayPlans.ts` (NEW)

**Pattern:** Follow `shifts.ts` and `tariffs.ts` router structure.

#### 1.1 Permission Constants

```typescript
const TIME_PLANS_MANAGE = permissionIdByKey("time_plans.manage")!
```

#### 1.2 Source Enum & Constants

```typescript
const EDP_SOURCES = ["tariff", "manual", "holiday"] as const
```

#### 1.3 Output Schemas

- `dayPlanSummarySchema` -- `{ id, code, name, planType }` (nullable, reused from weekPlans pattern)
- `shiftSummarySchema` -- `{ id, code, name }` (nullable)
- `employeeDayPlanOutputSchema`:
  - `id: z.string().uuid()`
  - `tenantId: z.string().uuid()`
  - `employeeId: z.string().uuid()`
  - `planDate: z.date()`
  - `dayPlanId: z.string().uuid().nullable()`
  - `shiftId: z.string().uuid().nullable()`
  - `source: z.string().nullable()`
  - `notes: z.string().nullable()`
  - `createdAt: z.date()`
  - `updatedAt: z.date()`
  - `dayPlan: dayPlanSummarySchema.optional()` (for detail views)
  - `shift: shiftSummarySchema.optional()` (for detail views)

#### 1.4 Input Schemas

- `listInputSchema`: `{ employeeId?: uuid, from: z.string().date(), to: z.string().date() }`
- `forEmployeeInputSchema`: `{ employeeId: uuid, from: z.string().date(), to: z.string().date() }`
- `createInputSchema`: `{ employeeId: uuid, planDate: z.string().date(), dayPlanId?: uuid, shiftId?: uuid, source: z.enum(EDP_SOURCES), notes?: string }`
- `updateInputSchema`: `{ id: uuid, dayPlanId?: uuid | null, shiftId?: uuid | null, source?: z.enum(EDP_SOURCES), notes?: string | null }`
- `bulkCreateInputSchema`: `{ entries: z.array(createEntrySchema) }` where `createEntrySchema` = `{ employeeId: uuid, planDate: z.string().date(), dayPlanId?: uuid, shiftId?: uuid, source: z.enum(EDP_SOURCES), notes?: string }`
- `deleteRangeInputSchema`: `{ employeeId: uuid, from: z.string().date(), to: z.string().date() }`
- `generateFromTariffInputSchema`: `{ employeeIds?: z.array(uuid), from?: z.string().date(), to?: z.string().date(), overwriteTariffSource?: z.boolean() }`

#### 1.5 Prisma Include Objects

```typescript
const edpListInclude = {
  dayPlan: { select: { id: true, code: true, name: true, planType: true } },
  shift: { select: { id: true, code: true, name: true } },
} as const
```

#### 1.6 Procedures (9 total)

| # | Procedure | Type | Permission | Description |
|---|-----------|------|------------|-------------|
| 1 | `list` | query | `TIME_PLANS_MANAGE` | List EDP with required `from`/`to`, optional `employeeId` filter. Includes dayPlan & shift summaries. Orders by `employeeId` ASC, `planDate` ASC. |
| 2 | `forEmployee` | query | `TIME_PLANS_MANAGE` | List EDPs for a specific employee within date range. Includes dayPlan (with breaks and bonuses) and shift. Orders by `planDate` ASC. |
| 3 | `getById` | query | `TIME_PLANS_MANAGE` | Get single EDP by ID, tenant-scoped. Includes dayPlan & shift. |
| 4 | `create` | mutation | `TIME_PLANS_MANAGE` | Create single EDP. Validates employee exists in tenant, shift FK, dayPlan FK. Auto-populates dayPlanId from shift if not provided. Source required. |
| 5 | `update` | mutation | `TIME_PLANS_MANAGE` | Partial update. Supports nullable fields (null = clear). Same shift->dayPlan auto-populate logic. Source validation. |
| 6 | `delete` | mutation | `TIME_PLANS_MANAGE` | Delete single EDP by ID, tenant-scoped. |
| 7 | `bulkCreate` | mutation | `TIME_PLANS_MANAGE` | Bulk upsert using `$transaction` with individual `upsert()` calls (ON CONFLICT employee_id + plan_date). Validates each entry. Returns `{ created: number }`. |
| 8 | `deleteRange` | mutation | `TIME_PLANS_MANAGE` | Delete EDPs by employee + date range. Validates employee exists. Returns `{ deleted: number }`. |
| 9 | `generateFromTariff` | mutation | `TIME_PLANS_MANAGE` | Port Go `GenerateFromTariff` logic. Returns `{ employeesProcessed, plansCreated, plansUpdated, employeesSkipped }`. |

#### 1.7 Detailed Implementation Notes per Procedure

**`list`:**
- Input: `from` and `to` required (z.string().date()), `employeeId` optional
- Validates `from <= to`
- Query: `prisma.employeeDayPlan.findMany({ where: { tenantId, planDate: { gte: new Date(from), lte: new Date(to) }, ...(employeeId && { employeeId }) }, include: edpListInclude, orderBy: [{ employeeId: 'asc' }, { planDate: 'asc' }] })`
- Output: `{ data: z.array(outputSchema) }`
- Pattern: matches shifts.ts list pattern

**`forEmployee`:**
- Input: `employeeId`, `from`, `to` all required
- Validates employee exists in tenant
- Includes richer dayPlan data (breaks, bonuses) -- matches Go `GetForEmployeeDateRange` preloads
- Query includes: `dayPlan: { include: { breaks: true, bonuses: { include: { account: true } } } }, shift: true`
- Output: `{ data: z.array(detailOutputSchema) }`

**`create`:**
- Validates `employeeId` references employee in same tenant
- If `shiftId` provided: validates shift exists in tenant, auto-populates `dayPlanId` from `shift.dayPlanId` if not explicitly provided
- If `dayPlanId` provided (or auto-populated): validates dayPlan exists in tenant
- Source is required, must be one of `EDP_SOURCES`
- Handles Prisma P2002 unique constraint error for `[employeeId, planDate]` conflict -> throw CONFLICT
- Pattern: matches shifts.ts create with FK validation

**`update`:**
- Input: `id` required, all other fields optional with nullable support
- Verify EDP exists (tenant-scoped)
- Build partial `data: Record<string, unknown>` incrementally (pattern from shifts.ts update)
- If `shiftId` set to non-null: validate shift, auto-populate dayPlanId if dayPlanId not explicitly in input
- If `shiftId` set to null: clear shiftId
- If `dayPlanId` set to non-null: validate dayPlan exists in tenant
- If `dayPlanId` set to null: clear dayPlanId
- Source validation if provided
- Pattern: matches shifts.ts update

**`delete`:**
- Verify EDP exists (tenant-scoped), then hard delete
- Pattern: matches shifts.ts delete

**`bulkCreate`:**
- Validate all entries first (employee, shift, dayPlan, source) before creating any
- Use `prisma.$transaction` with individual `prisma.employeeDayPlan.upsert()` calls:
  ```typescript
  await tx.employeeDayPlan.upsert({
    where: { employeeId_planDate: { employeeId, planDate } },
    create: { tenantId, employeeId, planDate, dayPlanId, shiftId, source, notes },
    update: { dayPlanId, shiftId, source, notes },
  })
  ```
- This matches the Go BulkCreate upsert semantics (ON CONFLICT employee_id, plan_date DO UPDATE)
- Returns `{ created: entries.length }`
- Pattern: transaction pattern from tariffs.ts create

**`deleteRange`:**
- Validate `employeeId` exists in tenant
- Validate from <= to
- Use `prisma.employeeDayPlan.deleteMany({ where: { tenantId, employeeId, planDate: { gte, lte } } })`
- Returns `{ deleted: result.count }`
- Pattern: matches systemSettings.ts `deleteEmployeeDayPlans` helper

**`generateFromTariff`:**
- This is the most complex procedure -- see Phase 2 for detailed algorithm

#### 1.8 Helper Functions

- `mapToOutput(record)` -- maps Prisma record to output schema shape (explicit field mapping)
- `getDayPlanIdForDate(tariff, date)` -- TypeScript port of Go `tariff.GetDayPlanIDForDate(date)` (see Phase 2)
- `getTariffSyncWindow(employee, tariff, from, to)` -- TypeScript port of Go sync window calculation

---

## Phase 2: generateFromTariff Business Logic

### Location: Within `apps/web/src/server/routers/employeeDayPlans.ts`

### 2.1 Helper: `getDayPlanIdForDate(tariff, date): string | null`

Port of `model.Tariff.GetDayPlanIDForDate(date)`. Takes a tariff (with full includes: weekPlan, tariffWeekPlans with weekPlans, tariffDayPlans) and a Date object.

**Algorithm by rhythmType:**

1. **`weekly`:**
   - If no `weekPlan`, return null
   - Get weekday from date (0=Sunday, 6=Saturday in JS)
   - Map weekday to corresponding day plan ID column:
     - 0 (Sunday) -> `weekPlan.sundayDayPlanId`
     - 1 (Monday) -> `weekPlan.mondayDayPlanId`
     - 2 (Tuesday) -> `weekPlan.tuesdayDayPlanId`
     - etc.
   - Return the day plan ID or null

2. **`rolling_weekly`:**
   - If no `rhythmStartDate` or empty `tariffWeekPlans`, return null
   - Calculate `weeksSinceStart = Math.floor((date - rhythmStartDate) / (7 * 24 * 60 * 60 * 1000))`
   - If negative, use 0
   - `cyclePosition = (weeksSinceStart % tariffWeekPlans.length) + 1` (1-based)
   - Find `tariffWeekPlan` where `sequenceOrder === cyclePosition`
   - Get weekday day plan ID from that week plan (same weekday mapping as weekly)

3. **`x_days`:**
   - If no `rhythmStartDate` or no `cycleDays` or cycleDays === 0, return null
   - Calculate `daysSinceStart = Math.floor((date - rhythmStartDate) / (24 * 60 * 60 * 1000))`
   - If negative, use 0
   - `cyclePosition = (daysSinceStart % cycleDays) + 1` (1-based)
   - Find `tariffDayPlan` where `dayPosition === cyclePosition`
   - Return that day plan's `dayPlanId` or null

### 2.2 Helper: `getWeekdayDayPlanId(weekPlan, weekday): string | null`

Maps JS `Date.getDay()` (0=Sunday) to the correct weekPlan column:
```typescript
function getWeekdayDayPlanId(weekPlan: WeekPlanData, weekday: number): string | null {
  switch (weekday) {
    case 0: return weekPlan.sundayDayPlanId
    case 1: return weekPlan.mondayDayPlanId
    case 2: return weekPlan.tuesdayDayPlanId
    case 3: return weekPlan.wednesdayDayPlanId
    case 4: return weekPlan.thursdayDayPlanId
    case 5: return weekPlan.fridayDayPlanId
    case 6: return weekPlan.saturdayDayPlanId
    default: return null
  }
}
```

### 2.3 Helper: `getTariffSyncWindow(employee, tariff, from, to): { start: Date, end: Date } | null`

Port of Go `getTariffSyncWindow`:
1. Start with `from` and `to` from input
2. Constrain start by `employee.entryDate` (start = max(start, entryDate))
3. Constrain end by `employee.exitDate` if set (end = min(end, exitDate))
4. Constrain start by `tariff.validFrom` if set (start = max(start, validFrom))
5. Constrain end by `tariff.validTo` if set (end = min(end, validTo))
6. If start > end, return null (no valid window)

### 2.4 generateFromTariff Procedure Algorithm

Port of Go `GenerateFromTariff` (service lines 402-530):

```
Input: { employeeIds?: string[], from?: string, to?: string, overwriteTariffSource?: boolean }
Defaults: from = today, to = today + 3 months, overwriteTariffSource = true

1. Resolve date range (apply defaults)
2. Get employees:
   a. If employeeIds provided: fetch each by ID, verify tenant, skip invalid
   b. If empty: fetch all active employees for tenant (`isActive: true, deletedAt: null`)
3. Initialize result counters

4. For each employee:
   a. Skip if no tariffId -> employeesSkipped++
   b. Fetch tariff with full details (tariffDetailInclude from tariffs.ts pattern):
      - weekPlan (with all 7 day plan ID columns)
      - tariffWeekPlans (with weekPlan, ordered by sequenceOrder)
      - tariffDayPlans (with dayPlan, ordered by dayPosition)
   c. Calculate sync window -> skip if null
   d. Get existing EDPs in date range for this employee
   e. Build skip map: dates with source != 'tariff' are skipped (preserve manual/holiday)
      - If overwriteTariffSource is false, also skip dates with source == 'tariff'
   f. For each day in window:
      - If date in skip map, continue
      - Call getDayPlanIdForDate(tariff, date) -> dayPlanId
      - If dayPlanId is null, continue (off day)
      - Add to plans array: { tenantId, employeeId, planDate, dayPlanId, source: 'tariff' }
   g. Bulk upsert plans using prisma.$transaction with individual upserts
   h. employeesProcessed++, plansCreated += plans.length

5. Return result
```

**Tariff Include for generateFromTariff:**
```typescript
const tariffGenerateInclude = {
  weekPlan: true,  // Need all 7 day plan ID columns
  tariffWeekPlans: {
    orderBy: { sequenceOrder: "asc" as const },
    include: { weekPlan: true },  // Full weekPlan with day plan ID columns
  },
  tariffDayPlans: {
    orderBy: { dayPosition: "asc" as const },
  },
} as const
```

**Date handling:** Use UTC date-only logic. When creating `new Date(dateString)` from `z.string().date()` (YYYY-MM-DD format), be careful about timezone. For day-by-day iteration, increment using:
```typescript
const current = new Date(from)
while (current <= end) {
  // process
  current.setUTCDate(current.getUTCDate() + 1)
}
```

---

## Phase 3: Root Router Registration

### File: `apps/web/src/server/root.ts` (MODIFY)

Add import and registration:
```typescript
import { employeeDayPlansRouter } from "./routers/employeeDayPlans"

// In appRouter:
employeeDayPlans: employeeDayPlansRouter,
```

**Insert position:** After `correctionAssistant` (alphabetical order is not strictly followed, but group with related routers).

### Verification

- TypeScript compiles without errors
- Router is accessible via `trpc.employeeDayPlans.*`

---

## Phase 4: Frontend Hooks Migration

### File: `apps/web/src/hooks/api/use-employee-day-plans.ts` (MODIFY)

Migrate all 8 hooks from REST/fetch to tRPC:

| # | Hook | Current | New Implementation |
|---|------|---------|-------------------|
| 1 | `useEmployeeDayPlans(options)` | `useApiQuery('/employee-day-plans', ...)` | `trpc.employeeDayPlans.list.useQuery({ from, to, employeeId })` |
| 2 | `useEmployeeDayPlansForEmployee(empId, from, to)` | `useApiQuery('/employees/{employee_id}/day-plans', ...)` | `trpc.employeeDayPlans.forEmployee.useQuery({ employeeId, from, to })` |
| 3 | `useCreateEmployeeDayPlan()` | `useApiMutation('/employee-day-plans', 'post')` | `trpc.employeeDayPlans.create.useMutation({ onSuccess: invalidate })` |
| 4 | `useUpdateEmployeeDayPlan()` | `useApiMutation('/employee-day-plans/{id}', 'put')` | `trpc.employeeDayPlans.update.useMutation({ onSuccess: invalidate })` |
| 5 | `useBulkCreateEmployeeDayPlans()` | `useApiMutation('/employee-day-plans/bulk', 'post')` | `trpc.employeeDayPlans.bulkCreate.useMutation({ onSuccess: invalidate })` |
| 6 | `useDeleteEmployeeDayPlanRange()` | `useApiMutation('/employee-day-plans/delete-range', 'post')` | `trpc.employeeDayPlans.deleteRange.useMutation({ onSuccess: invalidate })` |
| 7 | `useDeleteEmployeeDayPlan()` | `useApiMutation('/employee-day-plans/{id}', 'delete')` | `trpc.employeeDayPlans.delete.useMutation({ onSuccess: invalidate })` |
| 8 | `useGenerateFromTariff()` | Custom `useMutation` with raw `fetch` | `trpc.employeeDayPlans.generateFromTariff.useMutation({ onSuccess: invalidate })` |

**Key migration details:**

- Import `trpc` from `@/lib/trpc` (or wherever the tRPC client is configured)
- Use `trpc.useUtils()` for query invalidation in mutation `onSuccess`
- `useGenerateFromTariff` currently has custom `predicate`-based invalidation. In tRPC, use `utils.employeeDayPlans.invalidate()` to invalidate all employee day plan queries
- Maintain the same exported function signatures where possible for backward compatibility
- Keep `enabled` parameter support for conditional queries

### Verification

- Hooks compile without TypeScript errors
- Existing consumers of the hooks continue to work (same function signatures)

---

## Phase 5: Verification & Testing

### 5.1 Compilation Check

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors related to employeeDayPlans router or hooks.

### 5.2 Manual Verification Checklist

- [ ] Router file exists at `apps/web/src/server/routers/employeeDayPlans.ts`
- [ ] Router is registered in `apps/web/src/server/root.ts`
- [ ] All 9 procedures defined: list, forEmployee, getById, create, update, delete, bulkCreate, deleteRange, generateFromTariff
- [ ] Permission check uses `time_plans.manage`
- [ ] All procedures use `tenantProcedure` (tenant-scoped)
- [ ] Frontend hooks migrated to tRPC in `use-employee-day-plans.ts`

### 5.3 Logic Verification for generateFromTariff

- [ ] `getDayPlanIdForDate` handles all 3 rhythm types (weekly, rolling_weekly, x_days)
- [ ] `getTariffSyncWindow` correctly constrains by employee entry/exit dates and tariff validity
- [ ] Skip map preserves manual/holiday plans (source != 'tariff')
- [ ] Upsert uses the correct unique key `[employeeId, planDate]`
- [ ] Default values applied: from=today, to=today+3months, overwriteTariffSource=true

---

## Success Criteria (mapped to Acceptance Criteria)

| Acceptance Criterion | Implementation |
|---------------------|----------------|
| Single CRUD works | `create`, `getById`, `update`, `delete` procedures |
| Bulk-Create with transaction | `bulkCreate` using `$transaction` with individual `upsert()` calls |
| Delete Range works | `deleteRange` with `deleteMany` |
| Generate from Tariff correct | `generateFromTariff` with ported `getDayPlanIdForDate` logic |
| Unique constraint handled | Prisma upsert on `[employeeId, planDate]`; P2002 catch on create |
| Frontend hooks use tRPC | All 8 hooks in `use-employee-day-plans.ts` migrated |
| Tests ported | Manual verification + TypeScript compilation |

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/server/routers/employeeDayPlans.ts` | CREATE | tRPC router with 9 procedures + helper functions |
| `apps/web/src/server/root.ts` | MODIFY | Add import + register employeeDayPlans router |
| `apps/web/src/hooks/api/use-employee-day-plans.ts` | MODIFY | Migrate 8 hooks from REST to tRPC |

---

## Estimated Complexity

- Router file: ~600-700 lines (comparable to tariffs.ts at 1154 lines, but simpler schema)
- `generateFromTariff` logic: ~150 lines (most complex part)
- Helper functions: ~80 lines (getDayPlanIdForDate, getTariffSyncWindow, getWeekdayDayPlanId)
- Frontend hooks: ~120 lines (simplified from current 217 lines)
- Root router changes: 3 lines (import + registration)

## Implementation Order

1. Phase 1 + 2 together (router + generateFromTariff in same file)
2. Phase 3 (root registration)
3. Phase 4 (frontend hooks)
4. Phase 5 (verification)
