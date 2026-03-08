# Research: ZMI-TICKET-242 -- Vacation Balance Router + Previews

**Date**: 2026-03-08
**Branch**: staging
**Repository**: terp

## Research Question

Document the Go VacationBalance handler/service/repository, the existing TypeScript vacationBalances router, the vacation router (previews + business logic), frontend hooks, Prisma schema, existing tests, and authorization patterns to support completing the Vacation Balance Router implementation.

## Summary

The vacation balance system is **already largely ported** to TypeScript. Two separate tRPC routers exist:

1. **`vacationBalancesRouter`** (`apps/web/src/server/routers/vacationBalances.ts`, 321 lines, untracked) -- CRUD operations: `list`, `getById`, `create`, `update`
2. **`vacationRouter`** (`apps/web/src/server/routers/vacation.ts`, 966 lines, modified) -- Business logic + previews: `entitlementPreview`, `carryoverPreview`, `getBalance`, `initializeYear`, `adjustBalance`, `carryoverFromPreviousYear`, `initializeBatch`

Both routers are already registered in `root.ts` (lines 73, 139).

The frontend hooks file (`use-vacation-balance.ts`) has already been migrated from legacy REST to tRPC calls.

Existing test coverage:
- `vacation-balances.test.ts` (247 lines, untracked) -- tests for `vacationBalancesRouter` (list, create, update)
- `vacation-service.test.ts` (493 lines, untracked) -- tests for `vacationRouter` (getBalance, initializeYear, adjustBalance, carryoverFromPreviousYear)
- `vacation-helpers.test.ts` (213 lines, untracked) -- tests for shared helpers (calculateAvailable, buildCalcInput, resolveVacationBasis)

---

## 1. Go Source Files -- Complete Analysis

### 1.1 service/vacationbalance.go (127 lines)

**File**: `apps/api/internal/service/vacationbalance.go`

**Repository interface**:
```go
vacationBalanceRepoForBalanceService interface {
    GetByID(ctx, id uuid.UUID) (*model.VacationBalance, error)
    GetByEmployeeYear(ctx, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
    Create(ctx, balance *model.VacationBalance) error
    Update(ctx, balance *model.VacationBalance) error
    ListAll(ctx, filter VacationBalanceFilter) ([]model.VacationBalance, error)
}
```

**Methods (4)**:

1. **`List(ctx, filter)`** -- Delegates to `repo.ListAll(ctx, filter)`. Filter supports: TenantID, EmployeeID?, Year?, DepartmentID?
2. **`GetByID(ctx, id)`** -- Returns single balance. Maps `repository.ErrVacationBalanceNotFound` to `service.ErrVacationBalanceNotFound`.
3. **`Create(ctx, input)`** -- Checks uniqueness via `GetByEmployeeYear`. Returns `ErrVacationBalanceAlreadyExists` on duplicate. Creates with `CreateVacationBalanceInput` fields: TenantID, EmployeeID, Year, Entitlement, Carryover, Adjustments, CarryoverExpiresAt.
4. **`Update(ctx, id, input)`** -- Partial update. `UpdateVacationBalanceInput` has optional fields: Entitlement?, Carryover?, Adjustments?, CarryoverExpiresAt?. Gets existing record first, patches non-nil fields, saves.

### 1.2 handler/vacation_balance.go (314 lines)

**File**: `apps/api/internal/handler/vacation_balance.go`

**Dependencies**: VacationBalanceService, VacationService, EmployeeService

**Endpoints (5)**:

1. **`List` (GET /vacation-balances)** -- Parses query params: employee_id, year, department_id. Builds `VacationBalanceFilter`, calls `balanceService.List()`. Maps results via `balanceToResponse()`.

2. **`Get` (GET /vacation-balances/{id})** -- Parses URL param `id`. Calls `balanceService.GetByID()`. 404 if not found.

3. **`Create` (POST /vacation-balances)** -- Decodes `CreateVacationBalanceRequest` (from OpenAPI gen). Combines `BaseEntitlement + AdditionalEntitlement` into single `Entitlement`. 409 on duplicate.

4. **`Update` (PATCH /vacation-balances/{id})** -- Decodes `UpdateVacationBalanceRequest`. Same entitlement combination logic. Partial update.

5. **`Initialize` (POST /vacation-balances/initialize)** -- Accepts `{ year, carryover }`. Gets all active employees for tenant. For each: optionally runs `CarryoverFromPreviousYear`, then `InitializeYear`. Returns `{ message, created_count }`.

**Response mapping** (`balanceToResponse`):
- Maps Go model fields to OpenAPI response with computed `TotalEntitlement = Total()` and `RemainingDays = Available()`
- Includes employee summary (id, firstName, lastName, personnelNumber, isActive, departmentId)
- Handles optional `CarryoverExpiresAt`

**Key difference between Go and TypeScript**: Go splits entitlement into `BaseEntitlement + AdditionalEntitlement` in the API layer. TypeScript uses a single `entitlement` field. The frontend hooks handle this mapping (base_entitlement = entitlement, additional_entitlement = 0).

### 1.3 repository/vacationbalance.go (150 lines)

**File**: `apps/api/internal/repository/vacationbalance.go`

**Methods (9)**:

1. `Create(ctx, balance)` -- Insert new record
2. `GetByID(ctx, id)` -- Find by ID with `Preload("Employee")`. Returns `ErrVacationBalanceNotFound`
3. `GetByEmployeeYear(ctx, employeeID, year)` -- Composite key lookup. Returns `nil, nil` on not found
4. `Update(ctx, balance)` -- Full save via `db.Save()`
5. `Upsert(ctx, balance)` -- ON CONFLICT (employee_id, year) updates: entitlement, carryover, adjustments, taken, updated_at
6. `UpdateTaken(ctx, employeeID, year, taken)` -- Targeted update of `taken` field
7. `IncrementTaken(ctx, employeeID, year, amount)` -- Atomic: `taken = taken + amount`
8. `ListAll(ctx, filter)` -- Filtered list, joins employees for departmentId filter, preloads Employee, orders by year DESC
9. `ListByEmployee(ctx, employeeID)` -- All balances for one employee, ordered year ASC

**Filter**:
```go
VacationBalanceFilter {
    TenantID     uuid.UUID
    EmployeeID   *uuid.UUID
    Year         *int
    DepartmentID *uuid.UUID  // Joins employees table
}
```

### 1.4 model/vacationbalance.go (40 lines)

**File**: `apps/api/internal/model/vacationbalance.go`

```go
type VacationBalance struct {
    ID, TenantID, EmployeeID uuid.UUID
    Year                     int
    Entitlement, Carryover, Adjustments, Taken decimal.Decimal
    CarryoverExpiresAt *time.Time
    CreatedAt, UpdatedAt time.Time
    Employee *Employee
}

func (vb) Total() = Entitlement + Carryover + Adjustments
func (vb) Available() = Total() - Taken
```

### 1.5 Go Route Registration (routes.go lines 1576-1593)

All VacationBalance routes use `absences.manage` permission:
```go
permManage := permissions.ID("absences.manage").String()
r.With(authz.RequirePermission(permManage)).Get("/vacation-balances", h.List)
r.With(authz.RequirePermission(permManage)).Post("/vacation-balances", h.Create)
r.With(authz.RequirePermission(permManage)).Post("/vacation-balances/initialize", h.Initialize)
r.With(authz.RequirePermission(permManage)).Get("/vacation-balances/{id}", h.Get)
r.With(authz.RequirePermission(permManage)).Patch("/vacation-balances/{id}", h.Update)
```

---

## 2. Existing TypeScript -- Current State

### 2.1 vacationBalancesRouter (apps/web/src/server/routers/vacationBalances.ts -- 321 lines, UNTRACKED)

**Status**: Already implemented and registered in root.ts.

**Procedures (4)**:

| Procedure | Type | Auth | Input | Output |
|---|---|---|---|---|
| `list` | query | `absences.manage` | `{ employeeId?, year?, departmentId? }` | `VacationBalanceOutput[]` |
| `getById` | query | `absences.manage` | `{ id }` | `VacationBalanceOutput` |
| `create` | mutation | `absences.manage` | `{ employeeId, year, entitlement?, carryover?, adjustments?, carryoverExpiresAt? }` | `VacationBalanceOutput` |
| `update` | mutation | `absences.manage` | `{ id, entitlement?, carryover?, adjustments?, carryoverExpiresAt? }` | `VacationBalanceOutput` |

**Output schema includes**:
- Core fields: id, tenantId, employeeId, year, entitlement, carryover, adjustments, taken
- Computed fields: total (entitlement + carryover + adjustments), available (total - taken)
- Optional: carryoverExpiresAt, createdAt, updatedAt
- Employee relation: id, firstName, lastName, personnelNumber, isActive, departmentId

**Helper functions**:
- `decimalToNumber(val)` -- Prisma.Decimal to number conversion
- `mapBalanceToOutput(record)` -- Maps Prisma record + computes total/available
- `employeeSelect` -- Constant for employee include fields

**Key implementation details**:
- Uses `tenantProcedure.use(requirePermission(ABSENCES_MANAGE))`
- `list`: Builds `Prisma.VacationBalanceWhereInput` with optional filters, includes employee, orders by year DESC
- `create`: Checks for existing via `findFirst` before `create`, throws CONFLICT on duplicate
- `update`: Finds by id + tenantId scope, builds partial `Prisma.VacationBalanceUpdateInput`

### 2.2 vacationRouter (apps/web/src/server/routers/vacation.ts -- 966 lines, MODIFIED)

**Status**: Already implemented with all 7 procedures and registered in root.ts.

**Procedures (7)**:

| Procedure | Type | Auth | Description |
|---|---|---|---|
| `entitlementPreview` | mutation | `vacation_config.manage` | Computes vacation entitlement without persistence |
| `carryoverPreview` | mutation | `vacation_config.manage` | Computes carryover preview with capping rules |
| `getBalance` | query | `absences.manage` | Gets balance for employee/year |
| `initializeYear` | mutation | `absences.manage` | Calculates and upserts entitlement |
| `adjustBalance` | mutation | `absences.manage` | Accumulates manual adjustment |
| `carryoverFromPreviousYear` | mutation | `absences.manage` | Carries over with capping |
| `initializeBatch` | mutation | `absences.manage` | Batch initialize for all active employees |

**Uses shared helpers from**: `apps/web/src/server/lib/vacation-helpers.ts`
- `resolveTariff()` -- Resolves via EmployeeTariffAssignment then fallback to employee.tariffId
- `resolveCalcGroup()` -- Via employmentType.vacationCalcGroupId
- `resolveVacationBasis()` -- Resolution chain: default -> tenant -> tariff -> calcGroup
- `buildCalcInput()` -- Constructs VacationCalcInput from resolved data
- `calculateAvailable()` -- Computes entitlement + carryover + adjustments - taken

**Uses calculation libraries**:
- `apps/web/src/server/lib/vacation-calculation.ts` -- `calculateVacation()`
- `apps/web/src/server/lib/carryover-calculation.ts` -- `calculateCarryoverWithCapping()`, `calculateCarryover()`

**Key**: The `initializeBatch` procedure replicates the Go `VacationBalanceHandler.Initialize()` logic -- loops over all active employees, optionally carries over from previous year, then initializes year with calculated entitlement.

### 2.3 Duplicate Code Between Two Routers

Both routers define their own:
- `vacationBalanceOutputSchema` -- slightly different (vacationBalances has isActive + departmentId on employee; vacation does not)
- `decimalToNumber()` helper
- `mapBalanceToOutput()` function

The `vacationBalancesRouter` has a more complete employee output (includes `isActive`, `departmentId`), while `vacationRouter` has a simpler employee output.

---

## 3. Prisma Schema -- VacationBalance Model

**File**: `apps/web/prisma/schema.prisma` (lines 1725-1747)

```prisma
model VacationBalance {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  employeeId         String    @map("employee_id") @db.Uuid
  year               Int
  entitlement        Decimal   @default(0) @db.Decimal(5, 2)
  carryover          Decimal   @default(0) @db.Decimal(5, 2)
  adjustments        Decimal   @default(0) @db.Decimal(5, 2)
  taken              Decimal   @default(0) @db.Decimal(5, 2)
  carryoverExpiresAt DateTime? @map("carryover_expires_at") @db.Date
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([employeeId, year], map: "vacation_balances_employee_id_year_key")
  @@index([tenantId], map: "idx_vacation_balances_tenant")
  @@index([employeeId], map: "idx_vacation_balances_employee")
  @@map("vacation_balances")
}
```

**Key features**:
- Composite unique constraint on `(employeeId, year)` -- enables Prisma upsert via `employeeId_year`
- All decimal fields use `Decimal(5, 2)` -- entitlement, carryover, adjustments, taken
- Relations to Tenant (cascade delete) and Employee (cascade delete)

---

## 4. Frontend Hooks -- Current State

**File**: `apps/web/src/hooks/api/use-vacation-balance.ts` (328 lines, MODIFIED)

**Status**: Already migrated from legacy REST to tRPC.

**Hooks (6)**:

| Hook | tRPC Procedure Called | Type |
|---|---|---|
| `useVacationBalances(options)` | `vacationBalances.list` | query |
| `useVacationBalance(id)` | `vacationBalances.getById` | query |
| `useEmployeeVacationBalance(employeeId, year)` | `vacation.getBalance` | query |
| `useCreateVacationBalance()` | `vacationBalances.create` | mutation |
| `useUpdateVacationBalance()` | `vacationBalances.update` | mutation |
| `useInitializeVacationBalances()` | `vacation.initializeBatch` | mutation |

**Key patterns**:
- Uses `useTRPC()` for query options and `useTRPCClient()` for mutations
- `transformToLegacy()` function converts tRPC camelCase output to legacy snake_case shape for backward compatibility with 9 consuming components
- `useVacationBalanceInvalidation()` invalidates: `vacationBalances.list`, `vacationBalances.getById`, `vacation.getBalance`, plus legacy keys
- Mutations accept legacy-shaped input and translate to tRPC input internally

**Legacy interface preserved**:
```typescript
interface LegacyVacationBalance {
  id, tenant_id, employee_id: string
  year: number
  base_entitlement, additional_entitlement, total_entitlement: number
  carryover_from_previous, manual_adjustment: number
  taken, available, total: number
  carryover_expires_at: string | null
  created_at, updated_at: string
  employee?: { id, first_name, last_name, personnel_number, is_active, department_id? }
}
```

---

## 5. Root Router Registration

**File**: `apps/web/src/server/root.ts`

Both routers are already imported and registered:
```typescript
import { vacationRouter } from "./routers/vacation"           // line 45
import { vacationBalancesRouter } from "./routers/vacationBalances"  // line 73

export const appRouter = createTRPCRouter({
  vacation: vacationRouter,           // line 111
  vacationBalances: vacationBalancesRouter,  // line 139
})
```

---

## 6. Authorization Pattern

### 6.1 Permission Used

All VacationBalance CRUD and business logic procedures use `absences.manage` permission:
```typescript
const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!
```

Preview endpoints use `vacation_config.manage`:
```typescript
const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!
```

### 6.2 Middleware Chain

```typescript
tenantProcedure
  .use(requirePermission(ABSENCES_MANAGE))
  // ... procedure definition
```

`tenantProcedure` = `protectedProcedure` (requires auth) + tenant ID validation + tenant access check via `userTenants`.

### 6.3 Data Scope

The `vacationBalancesRouter` does NOT currently use `applyDataScope()` middleware. The `absencesRouter` DOES use it. The Go handler also did not use data scope for vacation balance routes -- the Go `VacationBalanceHandler` only uses `absences.manage` without data scope filtering.

---

## 7. Existing Tests

### 7.1 vacation-balances.test.ts (247 lines, UNTRACKED)

**File**: `apps/web/src/server/__tests__/vacation-balances.test.ts`

Tests for `vacationBalancesRouter`:

**`vacationBalances.list`** (3 tests):
- Returns all balances for tenant
- Filters by employeeId and year (verifies where clause)
- Filters by departmentId via employee relation

**`vacationBalances.create`** (3 tests):
- Creates new balance
- Throws CONFLICT for duplicate employee+year
- Returns balance with computed total/available

**`vacationBalances.update`** (3 tests):
- Partial update of entitlement
- Partial update of carryover
- Throws NOT_FOUND for missing balance

Test pattern:
- Uses `createCallerFactory(vacationBalancesRouter)` directly (not through root)
- Creates mock Prisma with `vi.fn().mockResolvedValue()`
- Uses `createTestContext()` helper with `createUserWithPermissions([ABSENCES_MANAGE])`
- `makeBalance()` factory for test data

### 7.2 vacation-service.test.ts (493 lines, UNTRACKED)

**File**: `apps/web/src/server/__tests__/vacation-service.test.ts`

Tests for `vacationRouter` business logic procedures:

**`vacation.getBalance`** (3 tests):
- Returns balance for existing employee/year
- Throws NOT_FOUND for missing balance
- Computes total and available correctly

**`vacation.initializeYear`** (4 tests):
- Creates new balance with calculated entitlement
- Throws NOT_FOUND for missing employee
- Handles employee without tariff (uses defaults)
- Handles employee without calc group (uses defaults)

**`vacation.adjustBalance`** (3 tests):
- Accumulates positive adjustment (verifies increment in data)
- Accumulates negative adjustment
- Throws NOT_FOUND for missing balance

**`vacation.carryoverFromPreviousYear`** (4 tests):
- Carries over available balance (no capping rules)
- Returns null when no previous balance
- Returns null when carryover is zero (all taken)
- Caps carryover with capping rules

### 7.3 vacation-helpers.test.ts (213 lines, UNTRACKED)

**File**: `apps/web/src/server/__tests__/vacation-helpers.test.ts`

Tests for shared helpers:

**`calculateAvailable`** (4 tests):
- Correct computation: entitlement + carryover + adjustments - taken
- Handles Prisma Decimal values
- Handles zero values
- Handles negative available

**`buildCalcInput`** (4 tests):
- Sets reference date to Jan 1 for calendar_year basis
- Sets reference date to entry anniversary for entry_date basis
- Applies tariff StandardWeeklyHours
- Builds special calcs from calc group links

**`resolveVacationBasis`** (4 tests):
- Default calendar_year
- Uses tenant basis
- Tariff overrides tenant
- Calc group overrides all

### 7.4 Test Helpers

**File**: `apps/web/src/server/__tests__/helpers.ts`

Shared utilities:
- `createMockUser(overrides)` -- ContextUser with defaults
- `createMockSession()` -- Supabase Session
- `createMockContext(overrides)` -- TRPCContext
- `createMockUserGroup(overrides)` -- UserGroup
- `createAdminUser(overrides)` -- Admin user
- `createUserWithPermissions(permIds, overrides)` -- User with specific permissions
- `createMockTenant(overrides)` -- Tenant
- `createMockUserTenant(userId, tenantId)` -- UserTenant with tenant

---

## 8. Vacation Helpers Library

**File**: `apps/web/src/server/lib/vacation-helpers.ts` (293 lines, UNTRACKED)

Shared helpers used by both routers:

| Function | Purpose | Used By |
|---|---|---|
| `resolveTariff(prisma, employee, year, tenantId)` | Resolves effective tariff via TariffAssignment (priority) or employee.tariffId (fallback) | vacation router |
| `resolveCalcGroup(prisma, employee, tenantId)` | Resolves VacationCalculationGroup via employmentType | vacation router |
| `resolveVacationBasis(prisma, employee, tariff, calcGroup, tenantId)` | Resolution chain: default -> tenant -> tariff -> calcGroup | vacation router |
| `buildCalcInput(employee, year, tariff, calcGroup, basis)` | Pure function, builds VacationCalcInput | vacation router |
| `calculateAvailable(balance)` | Computes entitlement + carryover + adjustments - taken | vacation router |

**Types exported**:
- `ResolvedCalcGroup` -- Calc group with specialCalcLinks
- `BuildCalcInputResult` -- calcInput + weeklyHours + standardWeeklyHours + baseVacationDays

---

## 9. Carryover Calculation Library

**File**: `apps/web/src/server/lib/carryover-calculation.ts` (MODIFIED)

Exports:
- `calculateCarryoverWithCapping(input: CarryoverInput): CarryoverOutput`
- `calculateCarryover(available, maxCarryover): number` -- Simple cap (0 = unlimited)

Types:
- `CappingRuleInput` -- ruleId, ruleName, ruleType, cutoffMonth, cutoffDay, capValue
- `CappingExceptionInput` -- cappingRuleId, exemptionType, retainDays
- `CarryoverInput` -- availableDays, year, referenceDate, cappingRules, exceptions
- `CarryoverOutput` -- availableDays, cappedCarryover, forfeitedDays, rulesApplied, hasException

---

## 10. What the Ticket Asks For vs What Already Exists

### Already Implemented

| Requirement | Status | Location |
|---|---|---|
| `vacationBalances.list` | Done | `vacationBalancesRouter` |
| `vacationBalances.getById` | Done | `vacationBalancesRouter` |
| `vacationBalances.create` | Done | `vacationBalancesRouter` |
| `vacationBalances.update` | Done | `vacationBalancesRouter` |
| `vacationBalances.forEmployee` | Done (as `vacation.getBalance`) | `vacationRouter` |
| `vacationBalances.initialize` | Done (as `vacation.initializeBatch`) | `vacationRouter` |
| Preview: entitlement | Done | `vacation.entitlementPreview` |
| Preview: carryover | Done | `vacation.carryoverPreview` |
| Frontend hooks migration | Done | `use-vacation-balance.ts` |
| Tests for CRUD | Done | `vacation-balances.test.ts` |
| Tests for business logic | Done | `vacation-service.test.ts` |
| Tests for helpers | Done | `vacation-helpers.test.ts` |
| Root router registration | Done | `root.ts` lines 73, 139 |

### Potential Gaps to Verify

1. **Data scope filtering**: The `vacationBalancesRouter.list` does not use `applyDataScope()` -- but the Go handler also did not. The ticket mentions "data scope filtering" as a requirement. The absences router provides a pattern for this.

2. **Pagination**: The `vacationBalancesRouter.list` does NOT support pagination (returns all results). The ticket asks for "paginated" list. The Go handler also did not paginate. The absences router provides a pagination pattern (page + pageSize input, skip/take in Prisma, total count).

3. **`forEmployee` as named procedure**: The ticket asks for `vacationBalances.forEmployee` but it exists as `vacation.getBalance` in the vacation router. The frontend hooks already call `vacation.getBalance` for this.

4. **Output schema inconsistency**: The `vacationBalancesRouter` output schema includes `isActive` and `departmentId` on the employee object. The `vacationRouter` output schema does not include these. These should be aligned.

---

## 11. Key File Paths

### Go Source (being replaced)
- `apps/api/internal/service/vacationbalance.go` (127 lines)
- `apps/api/internal/handler/vacation_balance.go` (314 lines)
- `apps/api/internal/repository/vacationbalance.go` (150 lines)
- `apps/api/internal/model/vacationbalance.go` (40 lines)
- `apps/api/internal/handler/routes.go` (lines 1576-1593 for route registration)

### TypeScript Routers (already implemented)
- `apps/web/src/server/routers/vacationBalances.ts` (321 lines, untracked)
- `apps/web/src/server/routers/vacation.ts` (966 lines, modified)
- `apps/web/src/server/root.ts` (lines 73, 139 for registration)

### TypeScript Libraries
- `apps/web/src/server/lib/vacation-helpers.ts` (293 lines, untracked)
- `apps/web/src/server/lib/vacation-calculation.ts`
- `apps/web/src/server/lib/carryover-calculation.ts` (modified)

### Frontend Hooks
- `apps/web/src/hooks/api/use-vacation-balance.ts` (328 lines, modified)

### Tests
- `apps/web/src/server/__tests__/vacation-balances.test.ts` (247 lines, untracked)
- `apps/web/src/server/__tests__/vacation-service.test.ts` (493 lines, untracked)
- `apps/web/src/server/__tests__/vacation-helpers.test.ts` (213 lines, untracked)
- `apps/web/src/server/__tests__/helpers.ts` (shared test utilities)

### Prisma Schema
- `apps/web/prisma/schema.prisma` (VacationBalance model at lines 1725-1747)

### Authorization Middleware
- `apps/web/src/server/middleware/authorization.ts` (requirePermission, requireEmployeePermission, applyDataScope)
- `apps/web/src/server/lib/permission-catalog.ts` (permissionIdByKey)

### Research
- `thoughts/shared/research/2026-03-08-ZMI-TICKET-241-vacation-service-port.md` (comprehensive predecessor research)
