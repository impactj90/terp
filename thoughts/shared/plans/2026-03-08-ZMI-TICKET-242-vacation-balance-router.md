# ZMI-TICKET-242: Vacation Balance Router + Previews -- Implementation Plan

## Overview

Complete and polish the Vacation Balance tRPC router implementation. The core implementation from ZMI-TICKET-241 already exists across two routers (`vacationBalances` for CRUD, `vacation` for business logic) plus frontend hooks, helpers, and tests. This ticket closes the remaining gaps identified during research: pagination on the list endpoint, data scope filtering, output schema alignment between the two routers, and additional test coverage.

## Current State

### Already Implemented (from ZMI-TICKET-241)
| Component | File | Status |
|---|---|---|
| `vacationBalancesRouter` (list, getById, create, update) | `apps/web/src/server/routers/vacationBalances.ts` (321 lines) | Untracked, complete |
| `vacationRouter` (entitlementPreview, carryoverPreview, getBalance, initializeYear, adjustBalance, carryoverFromPreviousYear, initializeBatch) | `apps/web/src/server/routers/vacation.ts` (966 lines) | Modified, complete |
| Shared helpers (resolveTariff, resolveCalcGroup, resolveVacationBasis, buildCalcInput, calculateAvailable) | `apps/web/src/server/lib/vacation-helpers.ts` (293 lines) | Untracked, complete |
| Frontend hooks (useVacationBalances, useVacationBalance, useEmployeeVacationBalance, useCreateVacationBalance, useUpdateVacationBalance, useInitializeVacationBalances) | `apps/web/src/hooks/api/use-vacation-balance.ts` (328 lines) | Modified, complete |
| CRUD tests | `apps/web/src/server/__tests__/vacation-balances.test.ts` (247 lines) | Untracked, complete |
| Business logic tests | `apps/web/src/server/__tests__/vacation-service.test.ts` (493 lines) | Untracked, complete |
| Helper tests | `apps/web/src/server/__tests__/vacation-helpers.test.ts` (213 lines) | Untracked, complete |
| Root router registration | `apps/web/src/server/root.ts` (lines 73, 139) | Done |

### Gaps to Close
1. **No pagination** on `vacationBalances.list` -- returns all results. Ticket requires paginated output (`{ items, total }`).
2. **No data scope filtering** on `vacationBalances.list` -- the absences router provides the pattern with `applyDataScope()` middleware.
3. **Output schema inconsistency** -- `vacationBalancesRouter` includes `isActive` and `departmentId` on employee; `vacationRouter` does not. Should align to the richer schema.
4. **Duplicate helpers** -- both routers define their own `decimalToNumber()`, `mapBalanceToOutput()`, and `vacationBalanceOutputSchema`. Should extract to shared location.
5. **Missing `forEmployee` named procedure** -- ticket asks for `vacationBalances.forEmployee` but it exists as `vacation.getBalance`. Frontend hooks already call `vacation.getBalance`. Decision: keep as-is (no change needed), since the frontend is already wired correctly.
6. **Missing `initialize` named procedure** -- ticket asks for `vacationBalances.initialize` but it exists as `vacation.initializeBatch`. Frontend hooks already call `vacation.initializeBatch`. Decision: keep as-is.
7. **Missing data scope tests** -- need to add tests verifying data scope filtering on the list endpoint.
8. **Missing pagination tests** -- need to add tests verifying pagination behavior.

## What We Are NOT Doing

- **Renaming procedures** -- `vacation.getBalance` and `vacation.initializeBatch` stay where they are. The frontend hooks already reference them correctly. Creating aliases or moving them would be unnecessary churn.
- **Creating new permissions** -- the ticket mentions `vacation.read` and `vacation.write` but these do not exist in the permission catalog. The Go handler uses `absences.manage` for all routes, and so does our implementation. No new permissions needed.
- **Changing the vacation router** -- the vacation router's business logic procedures are complete and tested. We only need to update its output schema to include `isActive` and `departmentId` on the employee object, and reuse the shared output schema.

## Desired End State

After implementation:
1. `vacationBalances.list` returns paginated results with `{ items: VacationBalance[], total: number }` and supports `page` and `pageSize` input parameters.
2. `vacationBalances.list` applies data scope filtering via `applyDataScope()` middleware.
3. Both routers share a single `vacationBalanceOutputSchema`, `decimalToNumber()`, and `mapBalanceToOutput()` from a shared module.
4. The vacation router's employee output includes `isActive` and `departmentId` (aligning with the richer schema).
5. Tests verify pagination, data scope filtering, and schema alignment.
6. Frontend hooks work correctly with the paginated list response.
7. TypeScript compilation passes.

### Verification Commands:
```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/server/__tests__/vacation-balances.test.ts
cd apps/web && npx vitest run src/server/__tests__/vacation-service.test.ts
cd apps/web && npx vitest run src/server/__tests__/vacation-helpers.test.ts
```

---

## Phase 1: Extract Shared Vacation Balance Utilities

### Goal
Eliminate duplication between the two routers by extracting shared output schema, decimal helper, and mapping function into a single file.

### Changes

#### 1.1 Create shared vacation balance output module

**File**: `apps/web/src/server/lib/vacation-balance-output.ts` (new)

Extract from `vacationBalances.ts` (the richer version with `isActive` + `departmentId`):

```ts
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"

// --- Output Schema ---

export const vacationBalanceOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  year: z.number(),
  entitlement: z.number(),
  carryover: z.number(),
  adjustments: z.number(),
  taken: z.number(),
  total: z.number(),
  available: z.number(),
  carryoverExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string(),
      isActive: z.boolean(),
      departmentId: z.string().uuid().nullable(),
    })
    .nullable()
    .optional(),
})

export type VacationBalanceOutput = z.infer<typeof vacationBalanceOutputSchema>

// --- Helpers ---

export function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number {
  if (val === null || val === undefined) return 0
  return Number(val)
}

export const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  personnelNumber: true,
  isActive: true,
  departmentId: true,
} as const

export function mapBalanceToOutput(
  record: {
    id: string
    tenantId: string
    employeeId: string
    year: number
    entitlement: Prisma.Decimal
    carryover: Prisma.Decimal
    adjustments: Prisma.Decimal
    taken: Prisma.Decimal
    carryoverExpiresAt: Date | null
    createdAt: Date
    updatedAt: Date
    employee?: {
      id: string
      firstName: string
      lastName: string
      personnelNumber: string
      isActive: boolean
      departmentId: string | null
    } | null
  }
): VacationBalanceOutput {
  const entitlement = decimalToNumber(record.entitlement)
  const carryover = decimalToNumber(record.carryover)
  const adjustments = decimalToNumber(record.adjustments)
  const taken = decimalToNumber(record.taken)
  const total = entitlement + carryover + adjustments
  const available = total - taken

  return {
    id: record.id,
    tenantId: record.tenantId,
    employeeId: record.employeeId,
    year: record.year,
    entitlement,
    carryover,
    adjustments,
    taken,
    total,
    available,
    carryoverExpiresAt: record.carryoverExpiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    employee: record.employee
      ? {
          id: record.employee.id,
          firstName: record.employee.firstName,
          lastName: record.employee.lastName,
          personnelNumber: record.employee.personnelNumber,
          isActive: record.employee.isActive,
          departmentId: record.employee.departmentId,
        }
      : null,
  }
}
```

### Verification
- File created successfully.
- No compilation errors: `npx tsc --noEmit`

---

## Phase 2: Update vacationBalances Router (Pagination + Data Scope)

### Goal
Add pagination and data scope filtering to the `vacationBalances.list` procedure. Refactor the router to use shared utilities.

### Changes

#### 2.1 Update `vacationBalances.ts` to use shared utilities

**File**: `apps/web/src/server/routers/vacationBalances.ts`

**Changes**:
1. Remove local `vacationBalanceOutputSchema`, `decimalToNumber()`, `mapBalanceToOutput()`, `employeeSelect`.
2. Import these from `../lib/vacation-balance-output`.
3. Add `applyDataScope` import from middleware.
4. Add `DataScope` type import.

Replace import section:
```ts
import {
  vacationBalanceOutputSchema,
  mapBalanceToOutput,
  employeeSelect,
} from "../lib/vacation-balance-output"
import {
  requirePermission,
  applyDataScope,
  type DataScope,
} from "../middleware/authorization"
```

#### 2.2 Add pagination to `list` procedure

**Changes to `list` input schema**:
```ts
.input(
  z.object({
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
    employeeId: z.string().uuid().optional(),
    year: z.number().int().optional(),
    departmentId: z.string().uuid().optional(),
  })
)
```

**Changes to `list` output schema**:
```ts
.output(
  z.object({
    items: z.array(vacationBalanceOutputSchema),
    total: z.number(),
  })
)
```

#### 2.3 Add `applyDataScope()` middleware to `list`

**Change**:
```ts
list: tenantProcedure
  .use(requirePermission(ABSENCES_MANAGE))
  .use(applyDataScope())
  .input(...)
```

#### 2.4 Add data scope WHERE clause builder

Add a helper function inside the router file (following the absences pattern):

```ts
function buildVacationBalanceDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}
```

#### 2.5 Implement paginated list query

Replace the `list` query body to use pagination and data scope (following the absences.list pattern exactly):

```ts
.query(async ({ ctx, input }) => {
  const tenantId = ctx.tenantId!
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? 50
  const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

  // Build where clause
  const where: Record<string, unknown> = { tenantId }
  if (input.employeeId) {
    where.employeeId = input.employeeId
  }
  if (input.year) {
    where.year = input.year
  }
  if (input.departmentId) {
    where.employee = { departmentId: input.departmentId }
  }

  // Apply data scope filtering
  const scopeWhere = buildVacationBalanceDataScopeWhere(dataScope)
  if (scopeWhere) {
    if (scopeWhere.employee && where.employee) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        ...((scopeWhere.employee as Record<string, unknown>) || {}),
      }
    } else {
      Object.assign(where, scopeWhere)
    }
  }

  const [items, total] = await Promise.all([
    ctx.prisma.vacationBalance.findMany({
      where,
      include: { employee: { select: employeeSelect } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { year: "desc" },
    }),
    ctx.prisma.vacationBalance.count({ where }),
  ])

  return {
    items: items.map(mapBalanceToOutput),
    total,
  }
})
```

#### 2.6 Update remaining procedures to use shared imports

The `getById`, `create`, and `update` procedures should use the shared `employeeSelect` and `mapBalanceToOutput` (they already do functionally; just update the imports to come from the shared module instead of local definitions).

### Verification
- `npx tsc --noEmit` passes
- Existing tests still pass after refactor (though the `list` tests will need updating for the new paginated output shape)

---

## Phase 3: Update Vacation Router to Use Shared Output Schema

### Goal
Align the vacation router's employee output to include `isActive` and `departmentId`, and use the shared output schema.

### Changes

#### 3.1 Update `vacation.ts` imports

**File**: `apps/web/src/server/routers/vacation.ts`

Replace the local `vacationBalanceOutputSchema`, `decimalToNumber()`, `mapBalanceToOutput()` with imports from the shared module:

```ts
import {
  vacationBalanceOutputSchema,
  decimalToNumber,
  mapBalanceToOutput,
  employeeSelect,
} from "../lib/vacation-balance-output"
```

Remove:
- The local `vacationBalanceOutputSchema` definition (lines 91-114)
- The local `decimalToNumber()` function (lines 118-123)
- The local `mapBalanceToOutput()` function (lines 129-180)

**Keep** the preview-specific output schemas (`entitlementPreviewOutputSchema`, `carryoverPreviewOutputSchema`) as they are unique to this router.

#### 3.2 Update employee `select` clauses in vacation router

The vacation router's procedures currently use inline employee selects with only 4 fields:
```ts
select: { id: true, firstName: true, lastName: true, personnelNumber: true }
```

Change all of these to use the shared `employeeSelect` constant (which includes `isActive` and `departmentId`). This affects:
- `getBalance` procedure
- `initializeYear` procedure
- `adjustBalance` procedure
- `carryoverFromPreviousYear` procedure
- `initializeBatch` procedure (note: this one doesn't include employee in its upsert calls since it only returns a count, not balance objects)

Specifically, replace all inline employee select objects in `vacation.ts` with:
```ts
include: { employee: { select: employeeSelect } },
```

#### 3.3 Retain `decimalToNumber` for non-balance usage

The `vacation.ts` file uses `decimalToNumber()` in the `carryoverPreview` procedure (for `cappingRule.capValue`) and in `calculateCappedCarryover()`. Import it from the shared module.

### Verification
- `npx tsc --noEmit` passes
- `npx vitest run src/server/__tests__/vacation-service.test.ts` passes
- `npx vitest run src/server/__tests__/vacation-router.test.ts` passes

---

## Phase 4: Update Frontend Hooks for Paginated Response

### Goal
Update the `useVacationBalances` hook to handle the new paginated response shape `{ items, total }`.

### Changes

#### 4.1 Update `useVacationBalances` hook

**File**: `apps/web/src/hooks/api/use-vacation-balance.ts`

The `useVacationBalances` hook currently expects `vacationBalances.list` to return an array directly. After Phase 2, it returns `{ items: [...], total: number }`.

Update the `select` transform:

```ts
// Before:
select: (data) => ({
  data: data.map((item) =>
    transformToLegacy(item as unknown as Record<string, unknown>)
  ),
})

// After:
select: (data) => ({
  data: data.items.map((item) =>
    transformToLegacy(item as unknown as Record<string, unknown>)
  ),
  total: data.total,
})
```

Update the query options input to include `page` and `pageSize` if the consuming components need them. Check if any component currently uses pagination -- if not, default values suffice.

#### 4.2 Update `UseVacationBalancesOptions` interface

Add optional `page` and `pageSize` fields:

```ts
interface UseVacationBalancesOptions {
  employeeId?: string
  year?: number
  departmentId?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}
```

Update the query options call:
```ts
trpc.vacationBalances.list.queryOptions(
  { employeeId, year, departmentId, page, pageSize },
  { enabled }
)
```

### Verification
- `npx tsc --noEmit` passes
- Frontend loads vacation balances list correctly

---

## Phase 5: Update Tests

### Goal
Update existing tests for the new paginated list response shape, add data scope filtering tests, and add pagination tests.

### Changes

#### 5.1 Update `vacation-balances.test.ts` list tests

**File**: `apps/web/src/server/__tests__/vacation-balances.test.ts`

The list tests currently expect an array result. Update to expect `{ items, total }` shape.

**Test: "returns all balances for tenant"**
- Mock `findMany` and add mock for `count` (returns the count)
- Assert `result.items` instead of `result`
- Assert `result.total` equals expected count

```ts
it("returns all balances for tenant", async () => {
  const balances = [
    makeBalance({ year: 2025 }),
    makeBalance({ id: "...", year: 2024 }),
  ]
  const mockPrisma = {
    vacationBalance: {
      findMany: vi.fn().mockResolvedValue(balances),
      count: vi.fn().mockResolvedValue(2),
    },
  }
  const caller = createCaller(createTestContext(mockPrisma))
  const result = await caller.list({})
  expect(result.items).toHaveLength(2)
  expect(result.total).toBe(2)
  expect(result.items[0]!.year).toBe(2025)
})
```

Similarly update "filters by employeeId and year" and "filters by departmentId" tests.

#### 5.2 Add pagination tests

**New test: "respects page and pageSize"**

```ts
it("respects page and pageSize", async () => {
  const mockPrisma = {
    vacationBalance: {
      findMany: vi.fn().mockResolvedValue([makeBalance()]),
      count: vi.fn().mockResolvedValue(10),
    },
  }
  const caller = createCaller(createTestContext(mockPrisma))
  const result = await caller.list({ page: 2, pageSize: 5 })
  expect(mockPrisma.vacationBalance.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 5,  // (2-1) * 5
      take: 5,
    })
  )
  expect(result.total).toBe(10)
})
```

#### 5.3 Add data scope tests

**New test: "applies department data scope filter"**

Create a test context with a user that has department-scoped data access:

```ts
it("applies department data scope filter", async () => {
  const deptId = "a0000000-0000-4000-a000-000000000e00"
  const mockPrisma = {
    vacationBalance: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  }
  // Create context with department data scope
  const ctx = createMockContext({
    prisma: mockPrisma as any,
    authToken: "test-token",
    user: createUserWithPermissions([ABSENCES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
      dataScopeType: "department",
      dataScopeDepartmentIds: [deptId],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
  const caller = createCaller(ctx)
  await caller.list({})
  expect(mockPrisma.vacationBalance.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        employee: expect.objectContaining({
          departmentId: { in: [deptId] },
        }),
      }),
    })
  )
})
```

**New test: "applies employee data scope filter"**

Similar pattern with `dataScopeType: "employee"` and `dataScopeEmployeeIds`.

#### 5.4 Update vacation-service.test.ts for aligned employee schema

The business logic tests use a simpler employee mock (no `isActive`, no `departmentId`). After Phase 3 aligns the schema, update the `makeBalance` helper's employee object in `vacation-service.test.ts` to include these fields:

```ts
employee: {
  id: EMPLOYEE_ID,
  firstName: "John",
  lastName: "Doe",
  personnelNumber: "EMP001",
  isActive: true,
  departmentId: null,
},
```

### Verification
```bash
cd apps/web && npx vitest run src/server/__tests__/vacation-balances.test.ts
cd apps/web && npx vitest run src/server/__tests__/vacation-service.test.ts
cd apps/web && npx vitest run src/server/__tests__/vacation-helpers.test.ts
```

All tests pass.

---

## Phase 6: Final Verification

### Goal
Ensure everything compiles and all tests pass.

### Steps

1. **TypeScript compilation**:
   ```bash
   cd apps/web && npx tsc --noEmit
   ```

2. **All vacation-related tests**:
   ```bash
   cd apps/web && npx vitest run src/server/__tests__/vacation-balances.test.ts
   cd apps/web && npx vitest run src/server/__tests__/vacation-service.test.ts
   cd apps/web && npx vitest run src/server/__tests__/vacation-helpers.test.ts
   cd apps/web && npx vitest run src/server/__tests__/vacation-router.test.ts
   cd apps/web && npx vitest run src/server/__tests__/vacation-calculation.test.ts
   ```

3. **Verify no regressions in absences (shared recalculateVacationTaken)**:
   ```bash
   cd apps/web && npx vitest run src/server/__tests__/absence
   ```

4. **Check root router registration** -- both routers should still be registered at their existing keys (`vacation` and `vacationBalances`).

---

## Summary of Files Changed

| File | Action | Description |
|---|---|---|
| `apps/web/src/server/lib/vacation-balance-output.ts` | **Create** | Shared output schema, decimalToNumber, mapBalanceToOutput, employeeSelect |
| `apps/web/src/server/routers/vacationBalances.ts` | **Edit** | Add pagination, data scope, use shared imports |
| `apps/web/src/server/routers/vacation.ts` | **Edit** | Use shared output schema/helpers, align employee select |
| `apps/web/src/hooks/api/use-vacation-balance.ts` | **Edit** | Handle paginated response shape |
| `apps/web/src/server/__tests__/vacation-balances.test.ts` | **Edit** | Update for pagination, add data scope + pagination tests |
| `apps/web/src/server/__tests__/vacation-service.test.ts` | **Edit** | Update employee mock to include isActive/departmentId |

## Acceptance Criteria Mapping

| Acceptance Criterion | How It's Met |
|---|---|
| Vacation Balance per employee/year retrievable | `vacationBalances.getById` + `vacation.getBalance` (already done) |
| Initialize creates balances for all active employees | `vacation.initializeBatch` (already done) |
| Data-scope filtering on the list | Phase 2: `applyDataScope()` + `buildVacationBalanceDataScopeWhere()` |
| Manual balance creation and update | `vacationBalances.create` + `vacationBalances.update` (already done) |
| Frontend hooks use tRPC instead of fetch | Already done, Phase 4 adjusts for pagination |
| Existing tests ported | Already done, Phase 5 adds pagination + data scope tests |

## Risk Notes

- **Breaking change in list response shape**: The `vacationBalances.list` output changes from array to `{ items, total }`. The only consumer is the `useVacationBalances` hook (updated in Phase 4). If any component directly calls the tRPC procedure without going through the hook, it will break. Search for `vacationBalances.list` across frontend code to verify.
- **Employee select alignment**: Changing the vacation router's employee select to include `isActive` and `departmentId` means the mock data in `vacation-service.test.ts` must also include these fields, or the output schema validation will fail since the schema now expects them.
