# Implementation Plan: ZMI-TICKET-248 -- Evaluation Queries Router

Date: 2026-03-08
Status: Ready for implementation
Research: `thoughts/shared/research/2026-03-08-ZMI-TICKET-248-evaluation-queries-router.md`

## Overview

Port the 5 read-only evaluation query endpoints from Go to a tRPC `evaluations` router. These endpoints query daily values, bookings, terminal bookings, audit logs, and workflow history with filtering, pagination, and data scope enforcement.

**Go files being replaced:**
- `apps/api/internal/service/evaluation.go` (564 lines)
- `apps/api/internal/handler/evaluation.go` (331 lines)

**Key characteristics:**
- All 5 procedures are read-only queries (no mutations)
- All require `reports.view` permission
- Daily values, bookings, and terminal bookings apply data scope filtering
- Logs and workflow history do NOT apply data scope (admin-level tenant-only view)
- All queries require `fromDate` and `toDate` (mandatory date range)
- Standard pagination: `page` + `pageSize` with `{ items, total }` response pattern

---

## Phase 1: tRPC Router Implementation

**File to create:** `apps/web/src/server/routers/evaluations.ts`

### 1.1 Module Structure

Follow the exact pattern from `dailyValues.ts` and `bookings.ts`:

```
1. Imports (z, TRPCError, createTRPCRouter, tenantProcedure, auth middleware, permission catalog)
2. Permission constants
3. Output schemas (shared summaries + procedure-specific schemas)
4. Input schemas (one per procedure)
5. Prisma include objects
6. Data scope helper
7. Helper functions (minutesToTimeString, mappers)
8. Router export with 5 query procedures
```

### 1.2 Permission Constant

```typescript
import { permissionIdByKey } from "../lib/permission-catalog"

const REPORTS_VIEW = permissionIdByKey("reports.view")!
```

Reference: `apps/web/src/server/lib/permission-catalog.ts` line 126 confirms `reports.view` exists.

### 1.3 Shared Output Schemas

Define at module level (reused across multiple procedures):

```typescript
const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  personnelNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isActive: z.boolean(),
}).nullable()

const bookingTypeSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  direction: z.string(),
}).nullable()

const userSummarySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
}).nullable()
```

### 1.4 Procedure: `dailyValues`

**Middleware chain:** `tenantProcedure.use(requirePermission(REPORTS_VIEW)).use(applyDataScope())`

**Input schema:**
```typescript
z.object({
  fromDate: z.string().date(),              // Required, YYYY-MM-DD
  toDate: z.string().date(),                // Required, YYYY-MM-DD
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  hasErrors: z.boolean().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item schema:**
```typescript
z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  valueDate: z.date(),
  status: z.string(),
  targetMinutes: z.number().int(),
  grossMinutes: z.number().int(),
  netMinutes: z.number().int(),
  breakMinutes: z.number().int(),
  overtimeMinutes: z.number().int(),
  undertimeMinutes: z.number().int(),
  balanceMinutes: z.number().int(),          // computed: overtime - undertime
  bookingCount: z.number().int(),
  hasErrors: z.boolean(),
  firstCome: z.number().int().nullable(),    // minutes from midnight, null if not set
  lastGo: z.number().int().nullable(),       // minutes from midnight, null if not set
  employee: employeeSummarySchema.optional(),
})
```

**Output wrapper:** `z.object({ items: z.array(dailyValueEvalOutputSchema), total: z.number() })`

**Query logic:**
- Build `where` with `tenantId`, date range on `valueDate` (gte/lte), optional `employeeId`, optional `hasError`
- Department filter via employee relation: `where.employee = { departmentId: input.departmentId }`
- Apply data scope via `buildDataScopeWhere()` helper (same pattern as `dailyValues.ts` listAll)
- Include: `employee: { select: { id, personnelNumber, firstName, lastName, isActive } }`
- OrderBy: `{ valueDate: "asc" }`
- Mapper: Compute `balanceMinutes = overtime - undertime`, map field names (Prisma uses `grossTime` / `targetTime` etc., output uses `grossMinutes` / `targetMinutes` etc.)

**Field mapping (Prisma -> output):**
| Prisma field | Output field |
|---|---|
| `grossTime` | `grossMinutes` |
| `netTime` | `netMinutes` |
| `targetTime` | `targetMinutes` |
| `overtime` | `overtimeMinutes` |
| `undertime` | `undertimeMinutes` |
| `breakTime` | `breakMinutes` |
| `hasError` | `hasErrors` |
| computed | `balanceMinutes = overtime - undertime` |

### 1.5 Procedure: `bookings`

**Middleware chain:** `tenantProcedure.use(requirePermission(REPORTS_VIEW)).use(applyDataScope())`

**Input schema:**
```typescript
z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  bookingTypeId: z.string().uuid().optional(),
  source: z.string().optional(),
  direction: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item schema:**
```typescript
z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  bookingDate: z.date(),
  bookingTypeId: z.string().uuid(),
  originalTime: z.number().int(),
  editedTime: z.number().int(),
  calculatedTime: z.number().int().nullable(),
  timeString: z.string(),                    // HH:MM format of editedTime
  pairId: z.string().uuid().nullable(),
  terminalId: z.string().uuid().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  employee: employeeSummarySchema.optional(),
  bookingType: bookingTypeSummarySchema.optional(),
})
```

**Query logic:**
- Build `where` with `tenantId`, date range on `bookingDate`, optional filters
- **Direction filter:** Via bookingType relation: `where.bookingType = { direction: input.direction }` (matches Go logic which joins booking type to filter by direction)
- **Department filter:** Via employee relation: `where.employee = { departmentId: input.departmentId }`
- Apply data scope
- Include: employee (select fields) + bookingType (select fields)
- OrderBy: `[{ bookingDate: "desc" }, { editedTime: "desc" }]`
- Mapper: Compute `timeString` from `editedTime` using `minutesToTimeString()` helper

### 1.6 Procedure: `terminalBookings`

**Middleware chain:** `tenantProcedure.use(requirePermission(REPORTS_VIEW)).use(applyDataScope())`

**Input schema:**
```typescript
z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item schema:**
```typescript
z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  bookingDate: z.date(),
  bookingTypeId: z.string().uuid(),
  originalTime: z.number().int(),
  editedTime: z.number().int(),
  calculatedTime: z.number().int().nullable(),
  wasEdited: z.boolean(),                    // computed: originalTime !== editedTime
  originalTimeString: z.string(),            // HH:MM format of originalTime
  editedTimeString: z.string(),              // HH:MM format of editedTime
  source: z.string().nullable(),
  terminalId: z.string().uuid().nullable(),
  createdAt: z.date(),
  employee: employeeSummarySchema.optional(),
  bookingType: bookingTypeSummarySchema.optional(),
})
```

**Query logic:**
- Same as bookings but with **hardcoded** `where.source = "terminal"` (Go: `model.BookingSourceTerminal`)
- Department filter and data scope same as bookings
- Include: employee + bookingType
- OrderBy: `[{ bookingDate: "desc" }, { editedTime: "desc" }]`
- Mapper: Compute `wasEdited = originalTime !== editedTime`, format both time strings

### 1.7 Procedure: `logs`

**Middleware chain:** `tenantProcedure.use(requirePermission(REPORTS_VIEW))` -- NO data scope

**Input schema:**
```typescript
z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

Note: `employeeId` and `departmentId` are accepted for API compatibility in the frontend hook but NOT used in filtering (see research gaps 9.2, 9.3 -- the Go repo never implemented these filters for audit logs).

**Output item schema:**
```typescript
z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  entityName: z.string().nullable(),
  changes: z.unknown().nullable(),
  performedAt: z.date(),
  userId: z.string().uuid().nullable(),
  user: userSummarySchema.optional(),
})
```

**Query logic:**
- Build `where` with `tenantId`, date range on `performedAt`
- **Critical:** End-of-day adjustment for `toDate`:
  ```typescript
  const toEnd = new Date(input.toDate)
  toEnd.setHours(23, 59, 59, 999)
  where.performedAt = { gte: new Date(input.fromDate), lte: toEnd }
  ```
  This matches Go: `f.To.Add(23*time.Hour + 59*time.Minute + 59*time.Second)`
- Optional: `entityType`, `action`, `userId` filters
- Include: `user: { select: { id, displayName } }`
- OrderBy: `{ performedAt: "desc" }`

### 1.8 Procedure: `workflowHistory`

**Middleware chain:** `tenantProcedure.use(requirePermission(REPORTS_VIEW))` -- NO data scope

**Input schema:**
```typescript
z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item schema:**
```typescript
z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  entityName: z.string().nullable(),
  metadata: z.unknown().nullable(),
  performedAt: z.date(),
  userId: z.string().uuid().nullable(),
  user: userSummarySchema.optional(),
})
```

**Query logic:**
- Same base as logs (auditLog Prisma model) but with **default filters** when not specified:
  ```typescript
  // Default entity types for workflow (when not specified)
  const entityTypes = input.entityType
    ? [input.entityType]
    : ["absence", "monthly_value"]

  // Default actions for workflow (when not specified)
  const actions = input.action
    ? [input.action]
    : ["create", "approve", "reject", "close", "reopen"]

  where.entityType = { in: entityTypes }
  where.action = { in: actions }
  ```
  This matches Go logic at `evaluation.go:454-467`.
- End-of-day adjustment for `toDate` (same as logs)
- Include: `user: { select: { id, displayName } }`
- OrderBy: `{ performedAt: "desc" }`
- Mapper uses `metadata` field instead of `changes`

### 1.9 Helper Functions

```typescript
/**
 * Converts minutes from midnight to HH:MM string.
 * Port of Go timeutil.MinutesToString().
 */
function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}
```

**Data scope helper** -- reuse the same pattern from `dailyValues.ts`:
```typescript
function buildDataScopeWhere(dataScope: DataScope): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}
```

### 1.10 Prisma Include Objects

```typescript
const evalDailyValueInclude = {
  employee: {
    select: { id: true, personnelNumber: true, firstName: true, lastName: true, isActive: true },
  },
} as const

const evalBookingInclude = {
  employee: {
    select: { id: true, personnelNumber: true, firstName: true, lastName: true, isActive: true },
  },
  bookingType: {
    select: { id: true, code: true, name: true, direction: true },
  },
} as const

const evalLogInclude = {
  user: {
    select: { id: true, displayName: true },
  },
} as const
```

### Phase 1 Verification

- [ ] File compiles: `cd apps/web && npx tsc --noEmit src/server/routers/evaluations.ts` (or just run next build)
- [ ] All 5 procedures exported in the router
- [ ] No imports reference non-existent modules

---

## Phase 2: Router Registration

**File to modify:** `apps/web/src/server/root.ts`

### Changes:

1. Add import (after the last router import, alphabetical position near `e*` routers):
   ```typescript
   import { evaluationsRouter } from "./routers/evaluations"
   ```

2. Add to `createTRPCRouter({...})` (alphabetically, after `employees`):
   ```typescript
   evaluations: evaluationsRouter,
   ```

### Phase 2 Verification

- [ ] `root.ts` compiles without errors
- [ ] The `AppRouter` type includes `evaluations` key
- [ ] No duplicate router keys

---

## Phase 3: Frontend Hooks Migration

**File to modify:** `apps/web/src/hooks/api/use-evaluations.ts`

### Changes:

Rewrite all 5 hooks to use tRPC instead of `useApiQuery`. The hooks need to:
1. Import `api` from `@/trpc/react` (the tRPC client)
2. Call `api.evaluations.<procedure>.useQuery(...)` instead of `useApiQuery`
3. Map parameter names from snake_case (Go REST API) to camelCase (tRPC)
4. Maintain the `enabled` pattern (both `from` and `to` must be set)

**Pattern for each hook:**

```typescript
import { api } from "@/trpc/react"

export function useEvaluationDailyValues(options: UseEvaluationDailyValuesOptions = {}) {
  const { from, to, employee_id, department_id, has_errors, limit, page, enabled = true } = options

  return api.evaluations.dailyValues.useQuery(
    {
      fromDate: from!,
      toDate: to!,
      employeeId: employee_id,
      departmentId: department_id,
      hasErrors: has_errors,
      pageSize: limit,
      page,
    },
    {
      enabled: enabled && !!from && !!to,
    }
  )
}
```

**Parameter mapping (old -> new) for each hook:**

| Hook | Old param | New param |
|---|---|---|
| dailyValues | `from` | `fromDate` |
| dailyValues | `to` | `toDate` |
| dailyValues | `employee_id` | `employeeId` |
| dailyValues | `department_id` | `departmentId` |
| dailyValues | `has_errors` | `hasErrors` |
| dailyValues | `include_no_bookings` | dropped (never implemented, see research 9.1) |
| dailyValues | `limit` | `pageSize` |
| bookings | `booking_type_id` | `bookingTypeId` |
| bookings | `source` | `source` |
| bookings | `direction` | `direction` |
| logs | `entity_type` | `entityType` |
| logs | `action` | `action` |
| logs | `user_id` | `userId` |
| workflowHistory | `entity_type` | `entityType` |
| workflowHistory | `action` | `action` |

**Important:** The return type changes from `{ data: T[], meta: { total, limit } }` (Go REST) to `{ items: T[], total: number }` (tRPC). Components consuming these hooks reference `data?.data` and `data?.meta?.total` -- these will need updating in the components.

### Component Updates Required

The following components need their data access patterns updated to match the new tRPC response shape:

| Component | Old access | New access |
|---|---|---|
| `components/evaluations/daily-values-tab.tsx` | `data?.data` | `data?.items` |
| `components/evaluations/daily-values-tab.tsx` | `data?.meta?.total` | `data?.total` |
| `components/evaluations/bookings-tab.tsx` | `data?.data` | `data?.items` |
| `components/evaluations/bookings-tab.tsx` | `data?.meta?.total` | `data?.total` |
| `components/evaluations/terminal-bookings-tab.tsx` | `data?.data` | `data?.items` |
| `components/evaluations/terminal-bookings-tab.tsx` | `data?.meta?.total` | `data?.total` |
| `components/evaluations/logs-tab.tsx` | `data?.data` | `data?.items` |
| `components/evaluations/logs-tab.tsx` | `data?.meta?.total` | `data?.total` |
| `components/evaluations/workflow-history-tab.tsx` | `data?.data` | `data?.items` |
| `components/evaluations/workflow-history-tab.tsx` | `data?.meta?.total` | `data?.total` |

Additionally, field names in the response may differ between Go API and tRPC (e.g., `first_come` -> `firstCome`). Review each component to ensure field name alignment.

### Phase 3 Verification

- [ ] All 5 hooks compile without type errors
- [ ] Components reference correct response shape (`items` instead of `data`)
- [ ] Hook interfaces remain backward-compatible (same public API for callers)
- [ ] `enabled` flag still gates query execution

---

## Phase 4: Tests

**File to create:** `apps/web/src/server/__tests__/evaluations-router.test.ts`

### Test Structure

Follow the pattern from `reports-router.test.ts`:
1. Import `createCallerFactory` from `../trpc`, router from `../routers/evaluations`
2. Import test helpers: `createMockContext`, `createMockSession`, `createUserWithPermissions`, `createMockUserTenant`
3. Import `permissionIdByKey` for `reports.view`
4. Create mock data factories
5. Use `vi.fn()` to mock Prisma methods

### Test Constants

```typescript
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000005001"
const REPORTS_VIEW = permissionIdByKey("reports.view")!
```

### Test Cases

#### 4.1 `evaluations.dailyValues`

1. **Returns paginated daily values with correct field mapping**
   - Mock `dailyValue.findMany` + `dailyValue.count`
   - Assert `balanceMinutes` is computed (overtime - undertime)
   - Assert `targetMinutes`, `grossMinutes`, etc. mapped from `targetTime`, `grossTime`, etc.
   - Assert `employee` summary is included

2. **Filters by date range**
   - Assert Prisma `where` includes `valueDate: { gte, lte }`

3. **Filters by employeeId**
   - Assert `where.employeeId` is set

4. **Filters by departmentId via employee relation**
   - Assert `where.employee.departmentId` is set

5. **Filters by hasErrors**
   - Assert `where.hasError` is set

6. **Applies data scope (department)**
   - Create user with `dataScopeType: "department"`, `dataScopeDepartmentIds: [...]`
   - Assert Prisma `where` includes employee department filter

#### 4.2 `evaluations.bookings`

1. **Returns paginated bookings with timeString computed**
   - Assert `timeString` is formatted as HH:MM

2. **Filters by direction via bookingType relation**
   - Assert `where.bookingType.direction` is set

3. **Filters by source**
   - Assert `where.source` is set

4. **Applies data scope**

#### 4.3 `evaluations.terminalBookings`

1. **Hardcodes source='terminal'**
   - Assert `where.source = "terminal"` always present

2. **Computes wasEdited and time strings**
   - For booking with `originalTime !== editedTime`: `wasEdited = true`
   - For booking with `originalTime === editedTime`: `wasEdited = false`
   - Assert `originalTimeString` and `editedTimeString` are HH:MM format

#### 4.4 `evaluations.logs`

1. **Returns audit log entries with user summary**
   - Assert `user` is mapped from included relation

2. **Applies end-of-day adjustment to toDate**
   - Assert `performedAt.lte` has time 23:59:59

3. **Does NOT apply data scope**
   - Verify no employee/department filtering in where clause

4. **Filters by entityType, action, userId**

#### 4.5 `evaluations.workflowHistory`

1. **Applies default entity type and action filters when not specified**
   - Assert `where.entityType = { in: ["absence", "monthly_value"] }`
   - Assert `where.action = { in: ["create", "approve", "reject", "close", "reopen"] }`

2. **Uses specific entity type when provided**
   - Assert `where.entityType = { in: ["absence"] }` (not the defaults)

3. **Uses specific action when provided**
   - Assert `where.action = { in: ["approve"] }` (not the defaults)

4. **Uses metadata field instead of changes**
   - Assert output has `metadata` field, not `changes`

#### 4.6 Authentication

1. **Throws UNAUTHORIZED for unauthenticated request**
   - Create context with `user: null`, `authToken: null`
   - Assert `dailyValues` query rejects with "Authentication required"

### Phase 4 Verification

- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/evaluations-router.test.ts`
- [ ] Coverage for all 5 procedures
- [ ] Edge cases covered (empty results, null fields, computed fields)

---

## Phase 5: Final Verification

- [ ] Full type check: `cd apps/web && npx tsc --noEmit`
- [ ] All tests pass: `cd apps/web && npx vitest run`
- [ ] Lint passes (if applicable)
- [ ] Frontend components render correctly with tRPC data (manual check)

---

## Files Summary

### New files:
| File | Description |
|---|---|
| `apps/web/src/server/routers/evaluations.ts` | Main evaluations tRPC router with 5 query procedures |
| `apps/web/src/server/__tests__/evaluations-router.test.ts` | Unit tests for all 5 procedures |

### Modified files:
| File | Change |
|---|---|
| `apps/web/src/server/root.ts` | Import + register `evaluationsRouter` |
| `apps/web/src/hooks/api/use-evaluations.ts` | Rewrite hooks to use tRPC |
| `apps/web/src/components/evaluations/daily-values-tab.tsx` | Update data access patterns |
| `apps/web/src/components/evaluations/bookings-tab.tsx` | Update data access patterns |
| `apps/web/src/components/evaluations/terminal-bookings-tab.tsx` | Update data access patterns |
| `apps/web/src/components/evaluations/logs-tab.tsx` | Update data access patterns |
| `apps/web/src/components/evaluations/workflow-history-tab.tsx` | Update data access patterns |

---

## Implementation Notes

### Gaps from Research (carry forward)

1. **`includeNoBookings` filter** -- Dropped. Never implemented at the Go repo level (research 9.1).
2. **`departmentId` filter on logs/workflow** -- Dropped. Never implemented at the Go repo level (research 9.2). Accept param in hook for API compat but do not filter.
3. **`employeeId` filter on logs/workflow** -- Dropped. Audit logs are entity-based, not employee-based (research 9.3). Accept param in hook for API compat but do not filter.
4. **No data scope on logs/workflow** -- Matches Go behavior (research 9.4).
5. **`balanceMinutes` computation** -- `overtime - undertime`, computed in mapper, not stored (research 9.5).
6. **No separate WorkflowEvent model** -- Queries `auditLog` with filtered entity types/actions (research 9.6).
7. **Pagination pattern** -- Use `{ items, total }` to match existing tRPC routers (research 9.7).

### Key Patterns to Follow

- **Data scope merge pattern** from `dailyValues.ts:330-342` -- when both department filter and data scope affect the employee relation, merge them correctly.
- **Mock Prisma pattern** from `reports-router.test.ts` -- `vi.fn().mockResolvedValue()` for `findMany` and `count`.
- **Caller factory** from test helpers -- `createCallerFactory(evaluationsRouter)` for isolated router testing.
- **Permission context** from test helpers -- `createUserWithPermissions([REPORTS_VIEW], { ... })`.
