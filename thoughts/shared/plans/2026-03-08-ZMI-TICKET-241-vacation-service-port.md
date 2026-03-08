# ZMI-TICKET-241: VacationService Port (Go to TypeScript) Implementation Plan

## Overview

Port the Go VacationService (vacation.go 627 lines, vacationbalance.go 127 lines, vacationcarryover.go 193 lines) and VacationBalance repository (150 lines) to TypeScript. This adds the remaining vacation balance business logic (InitializeYear, GetBalance, AdjustBalance, CarryoverFromPreviousYear, CRUD) to the existing `vacation` tRPC router and creates a new `vacationBalances` tRPC router. Also migrates frontend hooks from legacy REST to tRPC.

The existing TypeScript codebase already has:
- Vacation calculation engine: `apps/web/src/server/lib/vacation-calculation.ts`
- Carryover calculation engine: `apps/web/src/server/lib/carryover-calculation.ts`
- Preview-only vacation router: `apps/web/src/server/routers/vacation.ts` (entitlementPreview, carryoverPreview)
- `recalculateVacationTaken()` helper inlined in `apps/web/src/server/routers/absences.ts`

## Current State Analysis

- **Existing vacation router** at `apps/web/src/server/routers/vacation.ts` (405 lines) -- has `entitlementPreview` and `carryoverPreview` mutations. Already registered as `vacation` in `root.ts`.
- **Calculation libs** already ported: `vacation-calculation.ts` (208 lines), `carryover-calculation.ts` (149 lines).
- **`recalculateVacationTaken()`** already ported in `apps/web/src/server/routers/absences.ts` (lines 380-473).
- **Frontend hooks** at `apps/web/src/hooks/api/use-vacation-balance.ts` -- 6 hooks using legacy REST via `useApiQuery`/`useApiMutation`. Used by 9 frontend components.
- **Permission catalog** has `vacation_config.manage` but NO `vacation_balances.view` or `vacation_balances.manage`. Go handler uses `absences.manage` permission for all vacation balance routes.
- **No `vacationBalances` router** exists in TypeScript yet.
- **Prisma schema** has all required models: `VacationBalance`, `Employee`, `Tariff`, `EmployeeTariffAssignment`, `VacationCalculationGroup`, `Tenant`, etc.

### Key Gaps to Address:
1. **Tariff assignment resolution**: The existing TypeScript `entitlementPreview` does NOT resolve tariffs via `EmployeeTariffAssignment`. It only falls back to `employee.tariffId`. The Go service checks tariff assignments first. This must be fixed.
2. **Vacation basis resolution**: The existing preview ignores tenant-level and tariff-level vacation basis fallback. Only uses calc group basis or defaults to `calendar_year`.
3. **Simple `calculateCarryover()` function**: The Go `CalculateCarryover(available, maxCarryover)` simple function is NOT ported to TypeScript. Only `calculateCarryoverWithCapping()` exists. Must add this for the fallback path in `CarryoverFromPreviousYear`.

## Desired End State

After this plan is complete:
1. The `vacation` router gains 4 new mutations: `initializeYear`, `getBalance`, `adjustBalance`, `carryoverFromPreviousYear`.
2. A new `vacationBalances` router provides CRUD: `list`, `getById`, `create`, `update`.
3. The existing `entitlementPreview` and `carryoverPreview` are enhanced with tariff assignment resolution and proper vacation basis fallback.
4. A `calculateCarryover()` simple function is added to `carryover-calculation.ts`.
5. Shared helpers (`resolveTariff`, `resolveCalcGroup`, `buildCalcInput`, `resolveVacationBasis`) are extracted into `apps/web/src/server/lib/vacation-helpers.ts` for reuse between preview and initialize procedures.
6. Frontend hooks in `use-vacation-balance.ts` use tRPC instead of legacy REST, with backward-compatible exported function signatures.
7. The hooks barrel export in `apps/web/src/hooks/api/index.ts` is updated.
8. Unit tests cover the new helper functions and router procedures.

### Verification:
- `cd apps/web && npx tsc --noEmit` passes
- `cd apps/web && npx vitest run src/server/__tests__/vacation-service.test.ts` passes
- Frontend compiles without errors
- Manual: initialize year for an employee via UI, verify balance created; adjust balance; carryover from previous year

## What We're NOT Doing

- **Preview endpoints** -- already done (only enhancing tariff resolution)
- **Vacation calculation engine** -- already ported
- **Carryover calculation engine** -- already ported (only adding simple `calculateCarryover`)
- **`recalculateVacationTaken()`** -- already ported in absences router (we may extract to shared location but keep the existing implementation)
- **Batch initialize endpoint** -- the Go handler's `POST /vacation-balances/initialize` iterates all active employees and calls `InitializeYear` + `CarryoverFromPreviousYear`. We will add an `initializeBatch` procedure but keep it simple.
- **Frontend component changes** -- only hooks file changes, components stay as-is

## Implementation Approach

1. Extract shared vacation resolution logic into a helpers file for reuse
2. Add the simple `calculateCarryover` to the existing carryover-calculation lib
3. Add business logic mutations to the existing `vacation` router
4. Create a new `vacationBalances` CRUD router
5. Migrate frontend hooks to tRPC
6. Write tests

---

## Phase 1: Shared Helpers and Calculation Additions

### Overview
Extract the tariff resolution, calc group resolution, calc input building, and vacation basis resolution logic into a shared helpers file. Add the simple `calculateCarryover()` function. These helpers will be used by both the existing preview procedures and the new business logic procedures.

### Changes Required:

#### 1. Create Vacation Helpers File
**File**: `apps/web/src/server/lib/vacation-helpers.ts`

Extract and enhance the resolution logic that is currently duplicated/incomplete in `vacation.ts`:

```ts
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import type { VacationBasis, VacationSpecialCalc, VacationCalcInput } from "./vacation-calculation"

function decimalToNumber(val: Prisma.Decimal | null | undefined): number {
  if (val === null || val === undefined) return 0
  return Number(val)
}
```

**Exported functions (5)**:

1. **`resolveTariff(prisma, employee, year, tenantId)`**
   - Port of Go `VacationService.resolveTariff()` (lines 327-347)
   - Priority 1: Active `EmployeeTariffAssignment` via `findFirst` with:
     - `employeeId, isActive: true, effectiveFrom <= refDate, (effectiveTo null OR effectiveTo >= refDate)`
     - Reference date: end-of-year for past years, today for current/future
     - Include: `{ tariff: true }`
     - OrderBy: `{ effectiveFrom: "desc" }`
   - Priority 2: Fallback to `employee.tariffId` -> `prisma.tariff.findFirst()`
   - Returns: tariff object or null

2. **`resolveCalcGroup(prisma, employee, tenantId)`**
   - Port of Go `VacationService.resolveCalcGroup()` (lines 297-323)
   - Employee -> employmentType -> vacationCalcGroupId -> VacationCalculationGroup
   - Includes: `specialCalcLinks` with `specialCalculation`
   - Returns: calc group with links or null

3. **`resolveVacationBasis(prisma, employee, tariff, calcGroup, tenantId)`**
   - Port of Go `resolveVacationBasisFromTariff()` (lines 412-423) + calc group override
   - Resolution chain: default `calendar_year` -> tenant.vacationBasis -> tariff.vacationBasis -> calcGroup.basis
   - Returns: `VacationBasis`

4. **`buildCalcInput(employee, year, tariff, calcGroup, basis)`**
   - Port of Go `buildCalcInput()` (lines 350-410), pure function (no Prisma calls)
   - Builds `VacationCalcInput` from resolved data
   - Sets reference date based on basis
   - Builds special calcs list from calc group links
   - Returns: `VacationCalcInput` and metadata `{ weeklyHours, standardWeeklyHours, baseVacationDays }`

5. **`calculateAvailable(balance)`**
   - Port of Go `VacationBalance.Available()` computed property
   - `available = entitlement + carryover + adjustments - taken`
   - Handles Prisma Decimals
   - Returns: number

**Type exports**:
```ts
export interface ResolvedCalcGroup {
  id: string
  name: string
  basis: string
  specialCalcLinks: Array<{
    specialCalculation: {
      type: string
      threshold: number
      bonusDays: Prisma.Decimal
    }
  }>
}

export interface BuildCalcInputResult {
  calcInput: VacationCalcInput
  weeklyHours: number
  standardWeeklyHours: number
  baseVacationDays: number
}
```

#### 2. Add Simple calculateCarryover to Carryover Calculation Lib
**File**: `apps/web/src/server/lib/carryover-calculation.ts`

Add at the end of the file:

```ts
/**
 * Simple carryover cap without capping rules.
 * Port of Go calculation.CalculateCarryover().
 *
 * @param available - Available vacation days from previous year
 * @param maxCarryover - Maximum carryover allowed (0 or negative = unlimited)
 * @returns Capped carryover amount
 */
export function calculateCarryover(available: number, maxCarryover: number): number {
  if (available <= 0) return 0
  if (maxCarryover > 0 && available > maxCarryover) return maxCarryover
  return available
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Helpers are importable and function signatures match Go counterparts

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Enhance Existing Vacation Router with Business Logic Mutations

### Overview
Add 4 new mutations to the existing `vacation` router: `initializeYear`, `getBalance`, `adjustBalance`, `carryoverFromPreviousYear`. Also refactor the existing `entitlementPreview` and `carryoverPreview` to use the new shared helpers for proper tariff assignment resolution.

### Changes Required:

#### 1. Refactor Existing Procedures to Use Shared Helpers
**File**: `apps/web/src/server/routers/vacation.ts`

Update imports to use shared helpers:
```ts
import {
  resolveTariff,
  resolveCalcGroup,
  resolveVacationBasis,
  buildCalcInput,
  calculateAvailable,
  type ResolvedCalcGroup,
} from "../lib/vacation-helpers"
import { calculateCarryover } from "../lib/carryover-calculation"
```

Refactor `entitlementPreview` to:
- Use `resolveTariff()` (with tariff assignment resolution) instead of direct `employee.tariffId` lookup
- Use `resolveCalcGroup()` for calc group resolution
- Use `resolveVacationBasis()` for basis resolution
- Use `buildCalcInput()` for input construction

Refactor `carryoverPreview` to:
- Use `resolveTariff()` for tariff resolution (tariff assignment support)

#### 2. Add Permission Constants
**File**: `apps/web/src/server/routers/vacation.ts`

```ts
const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!
```

Note: The Go handler uses `absences.manage` for all vacation balance operations. We follow this convention.

#### 3. Add getBalance Query
```ts
getBalance: tenantProcedure
  .use(requirePermission(ABSENCES_MANAGE))
  .input(z.object({
    employeeId: z.string().uuid(),
    year: z.number().int().min(1900).max(2200),
  }))
  .output(vacationBalanceOutputSchema)
  .query(async ({ ctx, input }) => {
    // Port of Go VacationService.GetBalance()
    // 1. Find balance by employeeId + year
    // 2. Throw NOT_FOUND if missing
    // 3. Return with computed total and available
  })
```

**Output schema** `vacationBalanceOutputSchema`:
```ts
const vacationBalanceOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  year: z.number(),
  entitlement: z.number(),
  carryover: z.number(),
  adjustments: z.number(),
  taken: z.number(),
  total: z.number(),        // computed: entitlement + carryover + adjustments
  available: z.number(),    // computed: total - taken
  carryoverExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
  }).nullable().optional(),
})
```

#### 4. Add initializeYear Mutation
```ts
initializeYear: tenantProcedure
  .use(requirePermission(ABSENCES_MANAGE))
  .input(z.object({
    employeeId: z.string().uuid(),
    year: z.number().int().min(1900).max(2200),
  }))
  .output(vacationBalanceOutputSchema)
  .mutation(async ({ ctx, input }) => {
    // Port of Go VacationService.InitializeYear() (lines 189-234)
    const tenantId = ctx.tenantId!

    // 1. Get employee with employment type
    // 2. resolveCalcGroup(prisma, employee, tenantId)
    // 3. resolveTariff(prisma, employee, year, tenantId)
    // 4. resolveVacationBasis(prisma, employee, tariff, calcGroup, tenantId)
    // 5. buildCalcInput(employee, year, tariff, calcGroup, basis)
    // 6. calculateVacation(calcInput)
    // 7. Get existing balance (to preserve carryover/adjustments/taken)
    // 8. Upsert balance with new entitlement = output.totalEntitlement
    // 9. Return balance with computed fields
  })
```

**Key: Upsert pattern** (preserves existing carryover/adjustments/taken):
```ts
await ctx.prisma.vacationBalance.upsert({
  where: { employeeId_year: { employeeId: input.employeeId, year: input.year } },
  update: { entitlement: result.totalEntitlement },
  create: {
    tenantId,
    employeeId: input.employeeId,
    year: input.year,
    entitlement: result.totalEntitlement,
    carryover: 0,
    adjustments: 0,
    taken: 0,
  },
})
```

#### 5. Add adjustBalance Mutation
```ts
adjustBalance: tenantProcedure
  .use(requirePermission(ABSENCES_MANAGE))
  .input(z.object({
    employeeId: z.string().uuid(),
    year: z.number().int().min(1900).max(2200),
    adjustment: z.number(),  // positive adds days, negative deducts
    notes: z.string().optional(),
  }))
  .output(vacationBalanceOutputSchema)
  .mutation(async ({ ctx, input }) => {
    // Port of Go VacationService.AdjustBalance() (lines 498-517)
    // 1. Get existing balance (must exist -> NOT_FOUND if missing)
    // 2. Accumulate: newAdjustments = existing.adjustments + input.adjustment
    // 3. Update balance
    // 4. Return updated balance with computed fields
  })
```

**Key: Accumulates adjustments** (does NOT replace):
```ts
await ctx.prisma.vacationBalance.update({
  where: { employeeId_year: { employeeId: input.employeeId, year: input.year } },
  data: {
    adjustments: {
      increment: input.adjustment,
    },
  },
})
```

#### 6. Add carryoverFromPreviousYear Mutation
```ts
carryoverFromPreviousYear: tenantProcedure
  .use(requirePermission(ABSENCES_MANAGE))
  .input(z.object({
    employeeId: z.string().uuid(),
    year: z.number().int().min(1901).max(2200),  // 1901 minimum (needs prev year)
  }))
  .output(vacationBalanceOutputSchema.nullable())
  .mutation(async ({ ctx, input }) => {
    // Port of Go VacationService.CarryoverFromPreviousYear() (lines 581-627)
    const tenantId = ctx.tenantId!
    const prevYear = input.year - 1

    // 1. Get employee
    // 2. Get previous year's balance -> return null if none exists
    // 3. Calculate available = calculateAvailable(prevBalance)
    // 4. Calculate capped carryover via calculateCappedCarryover()
    // 5. If carryover is 0 -> return null
    // 6. Upsert current year balance with carryover (replaces, not accumulates)
    // 7. Return current year balance
  })
```

**Private helper** `calculateCappedCarryover()`:
```ts
// Port of Go VacationService.calculateCappedCarryover() (lines 521-576)
async function calculateCappedCarryover(
  prisma: PrismaClient,
  tenantId: string,
  employee: { id: string; tariffId: string | null },
  prevYear: number,
  available: number,
  defaultMaxCarryover: number = 0,  // 0 = unlimited
): Promise<number> {
  // 1. Resolve tariff for prevYear
  const tariff = await resolveTariff(prisma, employee, prevYear, tenantId)

  // 2. If tariff has vacationCappingRuleGroupId, use advanced capping
  if (tariff?.vacationCappingRuleGroupId) {
    // Load capping group with rules
    // Load employee exceptions
    // Build CarryoverInput
    // Call calculateCarryoverWithCapping()
    // Return result.cappedCarryover
  }

  // 3. Fallback: simple carryover with defaultMaxCarryover
  return calculateCarryover(available, defaultMaxCarryover)
}
```

#### 7. Add initializeBatch Mutation
```ts
initializeBatch: tenantProcedure
  .use(requirePermission(ABSENCES_MANAGE))
  .input(z.object({
    year: z.number().int().min(1900).max(2200),
    carryover: z.boolean().default(true),
  }))
  .output(z.object({
    message: z.string(),
    createdCount: z.number(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Port of Go VacationBalanceHandler.Initialize() (handler lines 217-268)
    const tenantId = ctx.tenantId!

    // 1. Get all active employees for tenant
    // 2. For each employee:
    //    a. If input.carryover: call carryoverFromPreviousYear (best effort)
    //    b. Call initializeYear (count successes)
    // 3. Return { message, createdCount }
  })
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] `vacation.getBalance` returns a balance for an existing employee/year
- [ ] `vacation.getBalance` returns NOT_FOUND for missing balance
- [ ] `vacation.initializeYear` calculates and persists entitlement
- [ ] `vacation.initializeYear` is idempotent (calling twice only updates entitlement)
- [ ] `vacation.adjustBalance` accumulates adjustments
- [ ] `vacation.carryoverFromPreviousYear` carries over capped balance
- [ ] `vacation.initializeBatch` processes all active employees

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 3.

---

## Phase 3: VacationBalances CRUD Router

### Overview
Create a separate `vacationBalances` tRPC router for CRUD operations on vacation balance records. This follows the codebase pattern of separating concerns (e.g., `vacationCalcGroups`, `vacationCappingRules` are separate routers).

### Changes Required:

#### 1. Create vacationBalances Router
**File**: `apps/web/src/server/routers/vacationBalances.ts`

```ts
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { calculateAvailable } from "../lib/vacation-helpers"

const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!
```

**Output schema** (shared with vacation router -- consider extracting to helpers, or redefine):
```ts
const vacationBalanceOutputSchema = z.object({
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
  employee: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    isActive: z.boolean(),
    departmentId: z.string().uuid().nullable(),
  }).nullable().optional(),
})
```

**Mapper function**:
```ts
function mapBalanceToOutput(record: PrismaVacationBalance): VacationBalanceOutput {
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
    employee: record.employee ? {
      id: record.employee.id,
      firstName: record.employee.firstName,
      lastName: record.employee.lastName,
      personnelNumber: record.employee.personnelNumber,
      isActive: record.employee.isActive,
      departmentId: record.employee.departmentId,
    } : null,
  }
}
```

**Procedures (4)**:

1. **`vacationBalances.list`** (query):
   - Middleware: `tenantProcedure.use(requirePermission(ABSENCES_MANAGE))`
   - Input: `{ employeeId?, year?, departmentId? }`
   - Output: `VacationBalanceOutput[]`
   - Implementation:
     - Build Prisma where clause with optional filters
     - Department filter uses employee relation join: `employee: { departmentId }`
     - Include: `{ employee: { select: { id, firstName, lastName, personnelNumber, isActive, departmentId } } }`
     - OrderBy: `{ year: "desc" }`
   - Port of Go `VacationBalanceService.List()` + `VacationBalanceRepository.ListAll()`

2. **`vacationBalances.getById`** (query):
   - Middleware: `tenantProcedure.use(requirePermission(ABSENCES_MANAGE))`
   - Input: `{ id: z.string().uuid() }`
   - Output: `VacationBalanceOutput`
   - Implementation: findFirst with tenant scope + include employee
   - Port of Go `VacationBalanceService.GetByID()`

3. **`vacationBalances.create`** (mutation):
   - Middleware: `tenantProcedure.use(requirePermission(ABSENCES_MANAGE))`
   - Input:
     ```ts
     z.object({
       employeeId: z.string().uuid(),
       year: z.number().int().min(1900).max(2200),
       entitlement: z.number().default(0),
       carryover: z.number().default(0),
       adjustments: z.number().default(0),
       carryoverExpiresAt: z.date().nullable().optional(),
     })
     ```
   - Output: `VacationBalanceOutput`
   - Implementation:
     - Check for existing balance (employee+year): throw CONFLICT if exists
     - Create via `prisma.vacationBalance.create()`
     - Port of Go `VacationBalanceService.Create()`

4. **`vacationBalances.update`** (mutation):
   - Middleware: `tenantProcedure.use(requirePermission(ABSENCES_MANAGE))`
   - Input:
     ```ts
     z.object({
       id: z.string().uuid(),
       entitlement: z.number().optional(),
       carryover: z.number().optional(),
       adjustments: z.number().optional(),
       carryoverExpiresAt: z.date().nullable().optional(),
     })
     ```
   - Output: `VacationBalanceOutput`
   - Implementation:
     - Find balance by ID + tenant scope (NOT_FOUND if missing)
     - Partial update of provided fields
     - Port of Go `VacationBalanceService.Update()`

#### 2. Register in root.ts
**File**: `apps/web/src/server/root.ts`

```ts
import { vacationBalancesRouter } from "./routers/vacationBalances"
// ...
export const appRouter = createTRPCRouter({
  // ... existing
  vacationBalances: vacationBalancesRouter,
})
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] `vacationBalances.list` returns balances with filters working
- [ ] `vacationBalances.getById` returns a single balance with employee
- [ ] `vacationBalances.create` creates a new balance (rejects duplicates)
- [ ] `vacationBalances.update` partially updates fields

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 4.

---

## Phase 4: Frontend Hooks Migration

### Overview
Migrate `use-vacation-balance.ts` from legacy REST (`useApiQuery`/`useApiMutation`) to tRPC. Keep the same exported function names and compatible return shapes so the 9 consuming components don't need changes. Also update the barrel export in `index.ts`.

### Changes Required:

#### 1. Rewrite use-vacation-balance.ts
**File**: `apps/web/src/hooks/api/use-vacation-balance.ts`

Replace all legacy REST hooks with tRPC equivalents:

```ts
import { useTRPC, useTRPCClient } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

**Legacy shape interface** (for backward compatibility):
```ts
interface LegacyVacationBalance {
  id: string
  tenant_id: string
  employee_id: string
  year: number
  base_entitlement: number
  additional_entitlement: number
  total_entitlement: number
  carryover_from_previous: number
  manual_adjustment: number
  taken: number
  available: number
  total: number
  carryover_expires_at: string | null
  created_at: string
  updated_at: string
  employee?: {
    id: string
    first_name: string
    last_name: string
    personnel_number: string
    is_active: boolean
    department_id?: string | null
  } | null
}
```

**Transform function**:
```ts
function transformToLegacy(balance: Record<string, unknown>): LegacyVacationBalance {
  // Maps camelCase tRPC output to snake_case for component backward compatibility
  // Note: Go splits entitlement into base+additional; TypeScript uses single entitlement
  // Map: base_entitlement = entitlement, additional_entitlement = 0
}
```

**Hook mapping** (preserve exact function signatures from current file):

| Current Hook | tRPC Call | Notes |
|---|---|---|
| `useVacationBalances(options)` | `trpc.vacationBalances.list` | Apply `select` with `transformToLegacy` |
| `useVacationBalance(id)` | `trpc.vacationBalances.getById` | Apply `select` with `transformToLegacy` |
| `useEmployeeVacationBalance(employeeId, year)` | `trpc.vacation.getBalance` | Apply `select` with `transformToLegacy` |
| `useCreateVacationBalance()` | `client.vacationBalances.create.mutate()` | Legacy shape adapter for input |
| `useUpdateVacationBalance()` | `client.vacationBalances.update.mutate()` | Legacy shape adapter for input |
| `useInitializeVacationBalances()` | `client.vacation.initializeBatch.mutate()` | Legacy shape adapter for input |

**Invalidation** (on mutations):
```ts
function useVacationBalanceInvalidation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({
      queryKey: trpc.vacationBalances.list.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.vacationBalances.getById.queryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.vacation.getBalance.queryKey(),
    })
    // Keep legacy invalidation during transition
    queryClient.invalidateQueries({
      queryKey: ["/vacation-balances"],
    })
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey as unknown[]
        return typeof key[0] === "string" && key[0].includes("vacation-balance")
      },
    })
  }
}
```

**Important compatibility notes**:
- `useCreateVacationBalance()` currently receives `{ body: { employee_id, year, base_entitlement, ... } }`. The new hook must adapt this to `{ employeeId, year, entitlement, ... }`.
- `useUpdateVacationBalance()` currently receives `{ path: { id }, body: { base_entitlement, ... } }`. Must adapt to `{ id, entitlement, ... }`.
- `useInitializeVacationBalances()` currently receives `{ body: { year, carryover } }`. Must adapt to `{ year, carryover }`.

#### 2. Update Hooks Barrel Export
**File**: `apps/web/src/hooks/api/index.ts`

No changes needed -- the existing export block already exports all 6 hooks:
```ts
export {
  useVacationBalances,
  useVacationBalance,
  useEmployeeVacationBalance,
  useCreateVacationBalance,
  useUpdateVacationBalance,
  useInitializeVacationBalances,
} from './use-vacation-balance'
```

#### 3. Update Absence Hook Invalidation
**File**: `apps/web/src/hooks/api/use-absences.ts`

Update the `useAbsenceInvalidation()` function to also invalidate tRPC vacation balance queries:
```ts
// Add to the existing invalidation function:
queryClient.invalidateQueries({
  queryKey: trpc.vacationBalances.list.queryKey(),
})
queryClient.invalidateQueries({
  queryKey: trpc.vacation.getBalance.queryKey(),
})
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] No import errors from the 9 consuming components

#### Manual Verification:
- [ ] Vacation balance admin page loads balances via tRPC (no REST calls in network tab)
- [ ] Create balance form works via tRPC
- [ ] Update balance form works via tRPC
- [ ] Initialize year dialog works via tRPC
- [ ] Employee vacation balance card shows correct data
- [ ] Absence approval triggers vacation balance invalidation

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 5.

---

## Phase 5: Tests

### Overview
Write unit tests covering the new shared helpers, simple carryover calculation, and key router business logic. Follow the existing patterns in `vacation-calculation.test.ts` and `vacation-router.test.ts`.

### Changes Required:

#### 1. Add Tests for calculateCarryover Simple Function
**File**: `apps/web/src/server/__tests__/vacation-calculation.test.ts` (append to existing file)

```ts
describe("calculateCarryover (simple)", () => {
  // Port from Go calculation/vacation_test.go:412-434
  it("caps at maxCarryover when available exceeds limit", () => { ... })
  it("returns available when under limit", () => { ... })
  it("returns 0 for zero available", () => { ... })
  it("returns 0 for negative available", () => { ... })
  it("returns full available when maxCarryover is 0 (unlimited)", () => { ... })
  it("returns full available when maxCarryover is negative (unlimited)", () => { ... })
})
```

#### 2. Create Tests for Vacation Helpers
**File**: `apps/web/src/server/__tests__/vacation-helpers.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import {
  resolveCalcGroup,
  resolveTariff,
  resolveVacationBasis,
  buildCalcInput,
  calculateAvailable,
} from "../lib/vacation-helpers"
```

**Test categories**:

1. **`calculateAvailable` tests** (~4 tests):
   - Correct computation: `entitlement + carryover + adjustments - taken`
   - Handles Prisma Decimal values
   - Handles zero values
   - Handles negative available (when taken > total)

2. **`buildCalcInput` tests** (~5 tests):
   - Sets reference date to Jan 1 for calendar_year basis
   - Sets reference date to entry anniversary for entry_date basis
   - Applies tariff StandardWeeklyHours (default 40)
   - Applies tariff AnnualVacationDays
   - Builds special calcs from calc group links

3. **`resolveVacationBasis` tests** (~4 tests):
   - Default returns calendar_year
   - Tenant basis overrides default
   - Tariff basis overrides tenant
   - Calc group basis overrides all

#### 3. Create Tests for Vacation Router New Procedures
**File**: `apps/web/src/server/__tests__/vacation-service.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { vacationRouter } from "../routers/vacation"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
```

**Test categories**:

1. **`vacation.getBalance` tests** (~3 tests):
   - Returns balance for existing employee/year
   - Throws NOT_FOUND for missing balance
   - Computes total and available correctly

2. **`vacation.initializeYear` tests** (~4 tests):
   - Creates new balance with calculated entitlement
   - Updates existing balance (preserves carryover/adjustments/taken)
   - Handles employee without tariff (uses defaults)
   - Handles employee without calc group (uses defaults)

3. **`vacation.adjustBalance` tests** (~3 tests):
   - Accumulates positive adjustment
   - Accumulates negative adjustment
   - Throws NOT_FOUND for missing balance

4. **`vacation.carryoverFromPreviousYear` tests** (~4 tests):
   - Carries over available balance
   - Caps carryover with capping rules
   - Returns null when no previous balance
   - Returns null when carryover is zero

#### 4. Create Tests for VacationBalances CRUD Router
**File**: `apps/web/src/server/__tests__/vacation-balances.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { vacationBalancesRouter } from "../routers/vacationBalances"
```

**Test categories**:

1. **`vacationBalances.list` tests** (~3 tests):
   - Returns all balances for tenant
   - Filters by employeeId and year
   - Filters by departmentId (via employee relation)

2. **`vacationBalances.create` tests** (~3 tests):
   - Creates new balance
   - Throws CONFLICT for duplicate employee+year
   - Returns balance with computed total/available

3. **`vacationBalances.update` tests** (~3 tests):
   - Partial update of entitlement
   - Partial update of carryover
   - Throws NOT_FOUND for missing balance

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/vacation-calculation.test.ts`
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/vacation-helpers.test.ts`
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/vacation-service.test.ts`
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/vacation-balances.test.ts`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Test coverage looks reasonable
- [ ] No flaky tests

**Implementation Note**: After completing this phase, the implementation is complete.

---

## File Summary

### Files to Create:
| File | Purpose |
|---|---|
| `apps/web/src/server/lib/vacation-helpers.ts` | Shared resolution helpers (resolveTariff, resolveCalcGroup, resolveVacationBasis, buildCalcInput, calculateAvailable) |
| `apps/web/src/server/routers/vacationBalances.ts` | VacationBalances CRUD router (list, getById, create, update) |
| `apps/web/src/server/__tests__/vacation-helpers.test.ts` | Tests for shared helpers |
| `apps/web/src/server/__tests__/vacation-service.test.ts` | Tests for vacation router new procedures |
| `apps/web/src/server/__tests__/vacation-balances.test.ts` | Tests for vacationBalances router |

### Files to Modify:
| File | Changes |
|---|---|
| `apps/web/src/server/lib/carryover-calculation.ts` | Add `calculateCarryover()` simple function |
| `apps/web/src/server/routers/vacation.ts` | Add 4 new mutations (getBalance, initializeYear, adjustBalance, carryoverFromPreviousYear, initializeBatch), refactor previews to use shared helpers |
| `apps/web/src/server/root.ts` | Register `vacationBalances` router |
| `apps/web/src/hooks/api/use-vacation-balance.ts` | Rewrite from legacy REST to tRPC hooks |
| `apps/web/src/hooks/api/use-absences.ts` | Update invalidation to include tRPC vacation balance queries |
| `apps/web/src/server/__tests__/vacation-calculation.test.ts` | Add tests for simple `calculateCarryover` |

### Files NOT Modified:
| File | Reason |
|---|---|
| `apps/web/src/hooks/api/index.ts` | Already exports all 6 hooks from `use-vacation-balance` |
| `apps/web/src/server/lib/vacation-calculation.ts` | Already complete |
| `apps/web/src/server/routers/absences.ts` | `recalculateVacationTaken` stays where it is |

---

## Testing Strategy

### Unit Tests:
- `calculateCarryover()` simple function -- cap behavior, unlimited, edge cases
- `calculateAvailable()` -- Decimal handling, computation correctness
- `buildCalcInput()` -- reference date, tariff defaults, special calcs
- `resolveVacationBasis()` -- resolution chain
- Router procedures via mock Prisma (same pattern as `vacation-router.test.ts`)

### Integration Tests (manual):
- Initialize year -> verify entitlement calculated and persisted
- Initialize year again -> verify only entitlement changes (carryover/adjustments preserved)
- Adjust balance -> verify adjustment accumulated
- Carryover from previous year -> verify capping applied
- Batch initialize -> verify all employees processed
- CRUD operations -> verify create, read, update all work

### Manual Testing Steps:
1. Open vacation balance admin page, verify balances load
2. Click "Initialize Year" for a specific year, verify balances created
3. Edit a balance, verify changes saved
4. Create a new balance manually, verify it appears in list
5. Check employee vacation balance card on dashboard
6. Approve an absence that deducts vacation, verify balance updates

## Performance Considerations

- **Batch initialization**: Processes employees sequentially (not parallel) to avoid DB contention
- **Tariff assignment resolution**: Single `findFirst` query with index-backed filter
- **Carryover capping**: Reuses existing pure-function calculation (no DB queries in the calc itself)
- **Frontend invalidation**: Targeted query invalidation (not blanket invalidation)

## References

- Research document: `thoughts/shared/research/2026-03-08-ZMI-TICKET-241-vacation-service-port.md`
- Go vacation service: `apps/api/internal/service/vacation.go` (627 lines)
- Go vacation balance service: `apps/api/internal/service/vacationbalance.go` (127 lines)
- Go vacation carryover service: `apps/api/internal/service/vacationcarryover.go` (193 lines)
- Go vacation balance repository: `apps/api/internal/repository/vacationbalance.go` (150 lines)
- Go vacation balance handler: `apps/api/internal/handler/vacation_balance.go`
- Existing TS vacation router: `apps/web/src/server/routers/vacation.ts`
- Existing TS calculation lib: `apps/web/src/server/lib/vacation-calculation.ts`
- Existing TS carryover lib: `apps/web/src/server/lib/carryover-calculation.ts`
- Existing TS recalculate taken: `apps/web/src/server/routers/absences.ts:380-473`
- Pattern reference (absences plan): `thoughts/shared/plans/2026-03-08-ZMI-TICKET-240-absence-service-router.md`
- Pattern reference (vacation router tests): `apps/web/src/server/__tests__/vacation-router.test.ts`
- Pattern reference (tRPC hooks): `apps/web/src/hooks/api/use-absences.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
- Prisma schema: VacationBalance, Employee, Tariff, EmployeeTariffAssignment, VacationCalculationGroup, Tenant
