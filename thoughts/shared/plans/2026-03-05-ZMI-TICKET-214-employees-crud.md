# ZMI-TICKET-214: Employees CRUD tRPC Implementation Plan

## Overview

Implement tRPC routers for Employee Master Data (CRUD + Search + Bulk-Tariff), Employee Contacts, Employee Cards, and Employee Tariff Assignments, then migrate the frontend hooks from `useApiQuery`/`useApiMutation` to tRPC. This is the largest single-domain migration in the project, replacing ~3,500 lines of Go backend code (service + handler + repository) with tRPC routers following the established patterns from ZMI-TICKET-212.

## Current State Analysis

### What Exists Now:
- **Go backend**: Fully functional employee CRUD across 6 files (~3,500 lines total)
- **Prisma models**: `Employee`, `EmployeeContact`, `EmployeeCard`, `EmployeeTariffAssignment` all defined in schema
- **Permission catalog**: `employees.view`, `employees.create`, `employees.edit`, `employees.delete` already in `apps/web/src/server/lib/permission-catalog.ts`
- **Authorization middleware**: `requirePermission`, `requireEmployeePermission`, `applyDataScope` all implemented in `apps/web/src/server/middleware/authorization.ts`
- **Frontend hooks**: 4 hook files using legacy `useApiQuery`/`useApiMutation` pattern
- **tRPC infrastructure**: `tenantProcedure`, root router, test helpers all in place

### What's Missing:
- tRPC routers for employees, employeeContacts, employeeCards, employeeTariffAssignments
- tRPC-based frontend hooks for all four domains
- Tests for the new routers

### Key Discoveries:
- The permission catalog uses `employees.view`/`employees.create`/`employees.edit`/`employees.delete` -- NOT the `employees.read`/`employees.write` names mentioned in the ticket. We must use the actual catalog keys.
- `Tariff` model is NOT in Prisma -- `tariffId` on Employee/EmployeeTariffAssignment are plain string FKs that cannot be traversed via `include`. The effective tariff resolution and day plan sync logic must be deferred.
- The Go `DELETE /employees/{id}` handler calls `service.Deactivate()` (sets `isActive=false`, `exitDate=now`) rather than soft-deleting via `deletedAt`. The tRPC delete should follow this same deactivation pattern.
- `NextPIN` auto-assignment requires `prisma.$queryRaw` for `SELECT MAX(pin::integer)`.
- Data scope filtering (`applyDataScope`) adds a `DataScope` object to context; the actual WHERE clause building must be done per-procedure (no automatic Prisma extension).
- The `clearXxxId` pattern (e.g., `clearDepartmentId`, `clearTariffId`) from the `employmentTypes` router is the established way to handle nullable FK clearing on update.
- Decimal fields (`weeklyHours`, `vacationDaysPerYear`, etc.) need `Number()` conversion on output and `new Prisma.Decimal()` on input, following the `employmentTypes` router pattern.

## Desired End State

After this plan is complete:
1. Four new tRPC routers registered in root.ts: `employees`, `employeeContacts`, `employeeCards`, `employeeTariffAssignments`
2. All frontend hooks migrated from `useApiQuery`/`useApiMutation` to `useTRPC()` pattern
3. Comprehensive test coverage for all routers
4. All business logic from the Go backend ported (except day plan sync and vacation recalculation which depend on unmodeled Tariff relations)

Verification: `cd apps/web && npx vitest run` passes all new tests; `npx tsc --noEmit` has no type errors.

## What We're NOT Doing

- **Day plan sync** on tariff change (depends on Tariff model with WeekPlan/DayPlan -- deferred to TICKET-229)
- **Vacation recalculation** on tariff assignment changes (depends on VacationService -- separate ticket)
- **Effective tariff override on list** (batch resolution requires Tariff model preloading -- deferred)
- **Audit logging** (no tRPC audit logging pattern exists yet -- separate concern)
- **Employee search autocomplete endpoint** (simple enough to add but not critical path -- can be added in Phase 2 if time permits)
- **Removing the Go backend handlers** (coexistence until full migration validated)

## Implementation Approach

Follow the established router pattern from ZMI-TICKET-212 (costCenters, holidays, employmentTypes, locations, teams):
1. Define Zod input/output schemas
2. Create `mapXToOutput()` helper functions
3. Implement procedures using `tenantProcedure.use(requirePermission(...))` chain
4. Register in root router
5. Write tests using `createCallerFactory` + mock Prisma pattern
6. Migrate frontend hooks to `useTRPC()` pattern

Split into 4 phases: employees (core), sub-entities (contacts + cards), tariff assignments, and frontend hooks.

---

## Phase 1: Employees Router (Core CRUD + Search + Bulk-Tariff)

### Overview
Create the main `employees` tRPC router with list, getById, create, update, delete (deactivate), search, and bulkAssignTariff procedures. This is the largest single router.

### Changes Required:

#### 1. Employees Router
**File**: `apps/web/src/server/routers/employees.ts` (NEW, ~600 lines estimated)

**Permission constants** (using actual catalog keys):
```typescript
const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_CREATE = permissionIdByKey("employees.create")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!
const EMPLOYEES_DELETE = permissionIdByKey("employees.delete")!
```

**Output schema** (`employeeOutputSchema`):
- Core: `id`, `tenantId`, `personnelNumber`, `pin`, `firstName`, `lastName`, `email`, `phone`
- Dates: `entryDate`, `exitDate` (as `z.date()` / `z.date().nullable()`)
- FK IDs: `departmentId`, `costCenterId`, `employmentTypeId`, `tariffId` (all nullable UUID strings)
- Numeric: `weeklyHours`, `vacationDaysPerYear` (as `z.number()`, converted from Decimal)
- Booleans: `isActive`, `disabilityFlag`
- Extended fields: `exitReason`, `notes`, `addressStreet`, `addressZip`, `addressCity`, `addressCountry`, `birthDate`, `gender`, `nationality`, `religion`, `maritalStatus`, `birthPlace`, `birthCountry`, `roomNumber`, `photoUrl`
- Group FKs: `employeeGroupId`, `workflowGroupId`, `activityGroupId`
- Order FKs: `defaultOrderId`, `defaultActivityId`
- Tariff overrides: `partTimePercent`, `dailyTargetHours`, `weeklyTargetHours`, `monthlyTargetHours`, `annualTargetHours`, `workDaysPerWeek` (all nullable numbers)
- System: `calculationStartDate`, `createdAt`, `updatedAt`

**Detail output schema** (`employeeDetailOutputSchema`) extends base with optional relations:
- `department: { id, name, code } | null`
- `costCenter: { id, code, name } | null`
- `employmentType: { id, code, name } | null`
- `contacts: EmployeeContactOutput[]`
- `cards: EmployeeCardOutput[]`

**List output schema**: `{ items: employeeOutputSchema[], total: number }` (following teams pattern)

**Procedures**:

1. **`employees.list`** (query)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_VIEW)).use(applyDataScope())`
   - Input: `{ page?, pageSize?, search?, departmentId?, costCenterId?, employmentTypeId?, isActive?, hasExitDate? }`
   - Build WHERE: `tenantId`, `deletedAt: null`, plus optional filters
   - Search: `OR: [{ firstName: contains }, { lastName: contains }, { personnelNumber: contains }, { email: contains }]` with `mode: 'insensitive'`
   - Data scope: if `ctx.dataScope.type === 'department'`, add `departmentId: { in: ctx.dataScope.departmentIds }`; if `'employee'`, add `id: { in: ctx.dataScope.employeeIds }`
   - Pagination: `skip: (page-1)*pageSize, take: pageSize`
   - OrderBy: `[{ lastName: 'asc' }, { firstName: 'asc' }]`
   - Count + findMany in `Promise.all`
   - Map with `mapEmployeeToOutput()`

2. **`employees.getById`** (query)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_VIEW)).use(applyDataScope())`
   - Input: `{ id: z.string().uuid() }`
   - Fetch with `include: { department: select, costCenter: select, employmentType: select, contacts: true, cards: { where: { isActive: true } } }`
   - Check `deletedAt === null`
   - Check data scope: if scope is 'department', verify `departmentId in scope.departmentIds`; if 'employee', verify `id in scope.employeeIds`
   - Return `employeeDetailOutputSchema`

3. **`employees.create`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_CREATE))`
   - Input: all required fields (`personnelNumber`, `firstName`, `lastName`, `entryDate`) plus optional fields
   - Validation:
     - Trim and validate `personnelNumber`, `firstName`, `lastName` non-empty
     - Parse `entryDate`, validate not more than 6 months in future
     - If `exitDate` provided, validate `exitDate >= entryDate`
   - Auto-assign PIN if not provided: `prisma.$queryRaw<[{max_pin: string}]>(Prisma.sql\`SELECT COALESCE(MAX(pin::integer), 0) + 1 as max_pin FROM employees WHERE tenant_id = ${tenantId}::uuid AND pin ~ '^[0-9]+$'\`)`
   - Check personnel number uniqueness: `findFirst({ where: { tenantId, personnelNumber } })`
   - Check PIN uniqueness: `findFirst({ where: { tenantId, pin } })`
   - Create with Decimal conversions for numeric fields
   - Return `employeeOutputSchema`

4. **`employees.update`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT)).use(applyDataScope())`
   - Input: `{ id, ...partialFields }` with clear flags (`clearDepartmentId`, `clearCostCenterId`, `clearEmploymentTypeId`, `clearTariffId`, `clearEmployeeGroupId`, `clearWorkflowGroupId`, `clearActivityGroupId`, `clearDefaultOrderId`, `clearDefaultActivityId`)
   - Fetch existing, verify tenant + not deleted
   - Check data scope
   - Build `data: Record<string, unknown>` conditionally
   - If `personnelNumber` changed, check uniqueness
   - If `pin` changed, check uniqueness
   - Validate entry/exit date constraints
   - Handle nullable FK clearing pattern (clear flag takes priority over value)
   - Decimal field conversions for numeric inputs
   - Return `employeeOutputSchema`

5. **`employees.delete`** (mutation) -- actually deactivates
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_DELETE)).use(applyDataScope())`
   - Input: `{ id: z.string().uuid() }`
   - Fetch existing, verify tenant + not deleted
   - Check data scope
   - Update: `{ isActive: false, exitDate: existingExitDate ?? new Date() }`
   - Return `{ success: true }`

6. **`employees.search`** (query) -- quick search for autocomplete
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_VIEW))`
   - Input: `{ query: z.string().min(1) }`
   - WHERE: `tenantId, isActive: true, deletedAt: null, OR: [firstName/lastName/personnelNumber contains query]`
   - Limit 20, order by lastName/firstName
   - Return `{ items: employeeSearchOutputSchema[] }` (lightweight: id, personnelNumber, firstName, lastName)

7. **`employees.bulkAssignTariff`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT)).use(applyDataScope())`
   - Input: `{ employeeIds: z.array(z.string().uuid()), tariffId: z.string().uuid().nullable(), clearTariff: z.boolean().optional() }`
   - For each employeeId: verify tenant, check data scope, update tariffId (or clear)
   - Return `{ updated: number, skipped: number }`

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Add import and register `employees: employeesRouter`

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Router file has no lint errors: `cd apps/web && npx eslint src/server/routers/employees.ts`
- [ ] Unit tests pass (Phase 3)

#### Manual Verification:
- [ ] Calling `employees.list` via tRPC panel returns paginated employees
- [ ] Calling `employees.create` creates an employee with auto-PIN
- [ ] Calling `employees.delete` deactivates rather than hard-deletes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Employee Contacts + Cards Sub-Routers

### Overview
Create the `employeeContacts` and `employeeCards` tRPC routers for managing sub-entities of employees.

### Changes Required:

#### 1. Employee Contacts Router
**File**: `apps/web/src/server/routers/employeeContacts.ts` (NEW, ~200 lines estimated)

**Permission constants**: Reuse `EMPLOYEES_VIEW` and `EMPLOYEES_EDIT` (contacts use employee permissions per Go handler pattern).

**Output schema** (`employeeContactOutputSchema`):
- `id`, `employeeId`, `contactType`, `value`, `label` (nullable), `isPrimary`, `contactKindId` (nullable), `createdAt`, `updatedAt`

**Procedures**:

1. **`employeeContacts.list`** (query)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_VIEW))`
   - Input: `{ employeeId: z.string().uuid() }`
   - Verify employee exists and belongs to tenant (join through employee.tenantId)
   - `findMany({ where: { employeeId }, orderBy: { createdAt: 'asc' } })`
   - Return `{ data: EmployeeContactOutput[] }`

2. **`employeeContacts.create`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT))`
   - Input: `{ employeeId, contactType, value, label?, isPrimary?, contactKindId? }`
   - Verify employee exists, belongs to tenant
   - Trim and validate `contactType` and `value` non-empty
   - Create contact
   - Return `employeeContactOutputSchema`

3. **`employeeContacts.delete`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT))`
   - Input: `{ id: z.string().uuid() }`
   - Fetch contact with employee relation, verify employee belongs to tenant
   - Delete contact
   - Return `{ success: true }`

#### 2. Employee Cards Router
**File**: `apps/web/src/server/routers/employeeCards.ts` (NEW, ~250 lines estimated)

**Output schema** (`employeeCardOutputSchema`):
- `id`, `tenantId`, `employeeId`, `cardNumber`, `cardType`, `validFrom`, `validTo` (nullable), `isActive`, `deactivatedAt` (nullable), `deactivationReason` (nullable), `createdAt`, `updatedAt`

**Procedures**:

1. **`employeeCards.list`** (query)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_VIEW))`
   - Input: `{ employeeId: z.string().uuid() }`
   - Verify employee exists, belongs to tenant
   - `findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } })`
   - Return `{ data: EmployeeCardOutput[] }`

2. **`employeeCards.create`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT))`
   - Input: `{ employeeId, cardNumber, cardType?, validFrom?, validTo? }`
   - Verify employee exists, belongs to tenant
   - Trim and validate `cardNumber` non-empty
   - Check card number uniqueness per tenant: `findFirst({ where: { tenantId, cardNumber } })`
   - Default `cardType` to `"rfid"` if not provided
   - Create card
   - Return `employeeCardOutputSchema`

3. **`employeeCards.deactivate`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT))`
   - Input: `{ id: z.string().uuid(), reason?: z.string() }`
   - Fetch card, verify tenant matches
   - Update: `{ isActive: false, deactivatedAt: new Date(), deactivationReason: reason ?? null }`
   - Return `employeeCardOutputSchema`

#### 3. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Add imports and register `employeeContacts: employeeContactsRouter`, `employeeCards: employeeCardsRouter`

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Router files have no lint errors
- [ ] Unit tests pass (Phase 3)

#### Manual Verification:
- [ ] Adding/removing contacts for an employee works
- [ ] Creating a card with duplicate cardNumber returns CONFLICT error
- [ ] Deactivating a card sets `isActive=false` and `deactivatedAt`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Employee Tariff Assignments Router

### Overview
Create the `employeeTariffAssignments` tRPC router for managing tariff assignment CRUD and effective tariff resolution.

### Changes Required:

#### 1. Employee Tariff Assignments Router
**File**: `apps/web/src/server/routers/employeeTariffAssignments.ts` (NEW, ~400 lines estimated)

**Output schema** (`employeeTariffAssignmentOutputSchema`):
- `id`, `tenantId`, `employeeId`, `tariffId`, `effectiveFrom`, `effectiveTo` (nullable), `overwriteBehavior`, `notes` (nullable), `isActive`, `createdAt`, `updatedAt`

**Effective tariff output schema** (`effectiveTariffOutputSchema`):
- `tariffId: z.string().uuid().nullable()`
- `source: z.enum(["assignment", "default", "none"])`
- `assignmentId: z.string().uuid().nullable()`

**Procedures**:

1. **`employeeTariffAssignments.list`** (query)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_VIEW))`
   - Input: `{ employeeId: z.string().uuid(), isActive?: boolean }`
   - Verify employee exists, belongs to tenant
   - `findMany({ where: { employeeId, ...(isActive !== undefined ? { isActive } : {}) }, orderBy: { effectiveFrom: 'desc' } })`
   - Return `{ data: EmployeeTariffAssignmentOutput[] }`

2. **`employeeTariffAssignments.getById`** (query)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_VIEW))`
   - Input: `{ employeeId: z.string().uuid(), id: z.string().uuid() }`
   - Fetch assignment, verify `employeeId` matches and `tenantId` matches
   - Return `employeeTariffAssignmentOutputSchema`

3. **`employeeTariffAssignments.create`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT))`
   - Input: `{ employeeId, tariffId, effectiveFrom, effectiveTo?, overwriteBehavior?, notes? }`
   - Verify employee exists, belongs to tenant
   - Validate `tariffId` non-empty
   - Validate `effectiveFrom` is valid date
   - If `effectiveTo` provided, validate `effectiveTo >= effectiveFrom`
   - Check for overlapping assignments: raw query or Prisma query with date range overlap logic
   - Default `overwriteBehavior` to `"preserve_manual"`
   - Create assignment with `tenantId`
   - Return `employeeTariffAssignmentOutputSchema`
   - NOTE: Day plan sync and vacation recalculation deferred (depend on Tariff model)

4. **`employeeTariffAssignments.update`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT))`
   - Input: `{ employeeId, id, effectiveFrom?, effectiveTo?, overwriteBehavior?, notes?, isActive? }`
   - Fetch existing, verify tenant/employee match
   - Build partial update data
   - If dates changed, validate and re-check overlap (excluding self)
   - Return `employeeTariffAssignmentOutputSchema`
   - NOTE: Day plan resync deferred

5. **`employeeTariffAssignments.delete`** (mutation)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_EDIT))`
   - Input: `{ employeeId: z.string().uuid(), id: z.string().uuid() }`
   - Fetch assignment, verify tenant/employee match
   - Hard delete
   - Return `{ success: true }`
   - NOTE: Day plan resync deferred

6. **`employeeTariffAssignments.effective`** (query)
   - Middleware: `tenantProcedure.use(requirePermission(EMPLOYEES_VIEW))`
   - Input: `{ employeeId: z.string().uuid(), date: z.string() }`
   - Parse date
   - Find active assignment covering the date: `findFirst({ where: { employeeId, isActive: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }, orderBy: { effectiveFrom: 'desc' } })`
   - If found: return `{ tariffId, source: "assignment", assignmentId: id }`
   - Else: fetch employee's default `tariffId`
     - If set: return `{ tariffId, source: "default", assignmentId: null }`
     - Else: return `{ tariffId: null, source: "none", assignmentId: null }`

**Overlap detection helper** (ported from Go `repository/employeetariffassignment.go:149-172`):
```typescript
async function hasOverlap(
  prisma: PrismaClient,
  employeeId: string,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  excludeId?: string
): Promise<boolean> {
  const where: Record<string, unknown> = {
    employeeId,
    isActive: true,
    // Overlap: A.start <= B.end AND A.end >= B.start (NULL end = infinity)
    effectiveFrom: effectiveTo ? { lte: effectiveTo } : {},
    OR: [
      { effectiveTo: null },
      { effectiveTo: { gte: effectiveFrom } },
    ],
  }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  const count = await prisma.employeeTariffAssignment.count({ where })
  return count > 0
}
```

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Add import and register `employeeTariffAssignments: employeeTariffAssignmentsRouter`

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Router file has no lint errors
- [ ] Unit tests pass (Phase 4)

#### Manual Verification:
- [ ] Creating overlapping assignments returns CONFLICT error
- [ ] Effective tariff query returns the correct assignment for a given date
- [ ] Effective tariff falls back to employee's default tariffId when no assignment exists

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Tests for All Routers

### Overview
Write comprehensive unit tests for all four routers using the established test pattern from ZMI-TICKET-212.

### Changes Required:

#### 1. Employee Router Tests
**File**: `apps/web/src/server/__tests__/employees-router.test.ts` (NEW, ~500 lines estimated)

**Test pattern** (following `cost-centers-router.test.ts`):
```typescript
import { createCallerFactory } from "../trpc"
import { employeesRouter } from "../routers/employees"
import { permissionIdByKey } from "../lib/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

const createCaller = createCallerFactory(employeesRouter)
```

**Test cases**:
- `employees.list`: returns paginated employees; filters by isActive; filters by departmentId; search by name; applies data scope (department); applies data scope (employee); empty result; excludes soft-deleted
- `employees.getById`: returns employee with relations; throws NOT_FOUND; checks data scope; excludes soft-deleted
- `employees.create`: creates with all fields; auto-assigns PIN; trims whitespace; rejects duplicate personnelNumber; rejects duplicate PIN; validates entry date not too far in future; validates exitDate >= entryDate; Decimal conversion
- `employees.update`: partial update; nullable FK clear pattern; rejects duplicate personnelNumber on change; checks data scope; validates dates
- `employees.delete`: deactivates (sets isActive=false, exitDate); throws NOT_FOUND; checks data scope
- `employees.search`: returns matching employees; limits to 20
- `employees.bulkAssignTariff`: updates multiple employees; skips scope-restricted employees

#### 2. Employee Contacts Router Tests
**File**: `apps/web/src/server/__tests__/employee-contacts-router.test.ts` (NEW, ~200 lines estimated)

**Test cases**:
- `employeeContacts.list`: returns contacts for employee; verifies employee belongs to tenant
- `employeeContacts.create`: creates contact; trims values; rejects empty contactType; rejects empty value; verifies employee belongs to tenant
- `employeeContacts.delete`: deletes contact; throws NOT_FOUND; verifies employee belongs to tenant

#### 3. Employee Cards Router Tests
**File**: `apps/web/src/server/__tests__/employee-cards-router.test.ts` (NEW, ~200 lines estimated)

**Test cases**:
- `employeeCards.list`: returns cards for employee; verifies employee belongs to tenant
- `employeeCards.create`: creates card; defaults cardType to "rfid"; rejects duplicate cardNumber per tenant; verifies employee belongs to tenant
- `employeeCards.deactivate`: deactivates card (sets isActive/deactivatedAt/reason); throws NOT_FOUND; verifies tenant

#### 4. Employee Tariff Assignments Router Tests
**File**: `apps/web/src/server/__tests__/employee-tariff-assignments-router.test.ts` (NEW, ~400 lines estimated)

**Test cases**:
- `list`: returns assignments; filters by isActive; verifies employee belongs to tenant
- `getById`: returns assignment; throws NOT_FOUND; verifies tenant/employee match
- `create`: creates assignment; rejects overlap; validates dates (effectiveTo >= effectiveFrom); defaults overwriteBehavior; verifies employee belongs to tenant
- `update`: partial update; rejects overlap when dates change (excluding self); validates dates
- `delete`: hard deletes; throws NOT_FOUND; verifies tenant/employee match
- `effective`: returns assignment-based tariff; falls back to default tariff; returns "none" when no tariff

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/web && npx vitest run src/server/__tests__/employees-router.test.ts src/server/__tests__/employee-contacts-router.test.ts src/server/__tests__/employee-cards-router.test.ts src/server/__tests__/employee-tariff-assignments-router.test.ts`
- [ ] All existing tests still pass: `cd apps/web && npx vitest run`

#### Manual Verification:
- [ ] Test coverage is reasonable (key business logic paths covered)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Frontend Hooks Migration

### Overview
Migrate all four frontend hook files from `useApiQuery`/`useApiMutation` to tRPC using `useTRPC()` + `useQuery`/`useMutation` pattern.

### Changes Required:

#### 1. Employee Hooks
**File**: `apps/web/src/hooks/api/use-employees.ts` (REWRITE)

Replace with tRPC pattern (following `use-cost-centers.ts`):

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useEmployees(options = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(trpc.employees.list.queryOptions(input, { enabled }))
}

export function useEmployee(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.employees.getById.queryOptions({ id }, { enabled: enabled && !!id }))
}

export function useCreateEmployee() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.employees.list.queryKey() })
    },
  })
}

export function useUpdateEmployee() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.employees.list.queryKey() })
    },
  })
}

export function useDeleteEmployee() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.employees.list.queryKey() })
    },
  })
}

export function useBulkAssignTariff() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.bulkAssignTariff.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.employees.list.queryKey() })
    },
  })
}

export function useEmployeeSearch(query: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employees.search.queryOptions({ query }, { enabled: enabled && query.length > 0 })
  )
}
```

#### 2. Employee Contacts Hooks
**File**: `apps/web/src/hooks/api/use-employee-contacts.ts` (REWRITE)

```typescript
export function useEmployeeContacts(employeeId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employeeContacts.list.queryOptions({ employeeId }, { enabled: enabled && !!employeeId })
  )
}

export function useCreateEmployeeContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeContacts.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.employeeContacts.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.employees.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.employees.list.queryKey() })
    },
  })
}

export function useDeleteEmployeeContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employeeContacts.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.employeeContacts.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.employees.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.employees.list.queryKey() })
    },
  })
}
```

#### 3. Employee Cards Hooks
**File**: `apps/web/src/hooks/api/use-employee-cards.ts` (REWRITE)

Same pattern -- `useEmployeeCards`, `useCreateEmployeeCard`, `useDeactivateEmployeeCard` with appropriate invalidation of `employeeCards.list`, `employees.getById`, `employees.list`.

#### 4. Employee Tariff Assignments Hooks
**File**: `apps/web/src/hooks/api/use-employee-tariff-assignments.ts` (REWRITE)

```typescript
export function useEmployeeTariffAssignments(employeeId, options?) { ... }
export function useEmployeeTariffAssignment(employeeId, assignmentId, enabled?) { ... }
export function useCreateEmployeeTariffAssignment() { ... }
export function useUpdateEmployeeTariffAssignment() { ... }
export function useDeleteEmployeeTariffAssignment() { ... }
export function useEffectiveTariff(employeeId, date, enabled?) { ... }
```

Invalidation pattern for mutations: invalidate `employeeTariffAssignments.list`, `employeeTariffAssignments.effective`, `employees.list`, and `employees.getById`.

#### 5. Update Index Exports
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Add new exports: `useEmployeeSearch` from employees hooks. Keep all existing exports as-is (the function names match).

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] No lint errors in modified hook files
- [ ] All tests pass: `cd apps/web && npx vitest run`

#### Manual Verification:
- [ ] Employee list page loads and displays employees via tRPC
- [ ] Employee detail page loads with contacts and cards
- [ ] Creating/editing/deleting employees works in the UI
- [ ] Tariff assignment management works
- [ ] All cache invalidation fires correctly (lists refresh after mutations)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:
- Each router gets its own test file using `createCallerFactory` + mock Prisma
- Test both success paths and error paths (NOT_FOUND, BAD_REQUEST, CONFLICT, FORBIDDEN)
- Test data scope filtering for employee-scoped procedures
- Test Decimal field conversions
- Test nullable FK clearing pattern
- Test PIN auto-assignment with raw SQL mock
- Test overlap detection for tariff assignments

### Key Edge Cases:
- Personnel number uniqueness per tenant (not global)
- PIN uniqueness per tenant (not global)
- Card number uniqueness per tenant
- Soft-deleted employees excluded from all queries
- Data scope filtering for department and employee scope types
- Entry date validation (max 6 months in future)
- Exit date must be >= entry date
- Tariff assignment overlap detection with NULL end dates (treat as infinity)
- Bulk tariff assignment with data scope enforcement per employee

### Manual Testing Steps:
1. Create employee with auto-PIN, verify PIN is max+1
2. Create employee with duplicate personnel number, verify CONFLICT
3. Delete employee, verify it's deactivated (not hard-deleted)
4. Add contacts and cards, verify they appear in getById
5. Create overlapping tariff assignment, verify CONFLICT
6. Query effective tariff at date with and without assignments
7. Verify data scope filtering: user with department scope only sees their department's employees

## Performance Considerations

- Employee list query uses `Promise.all([findMany, count])` for parallel execution
- List uses pagination (skip/take), not loading entire dataset
- Search limited to 20 results
- Bulk tariff assignment processes employees sequentially (acceptable for typical batch sizes; could be parallelized if needed)
- Consider adding `select` instead of full model loads for list queries if performance is a concern

## Migration Notes

- The Go backend continues to run in parallel -- no data migration needed
- Frontend hooks maintain the same export names, so component code should not need changes (only import path/behavior changes)
- The new `useEmployeeSearch` hook is additive (new export in index.ts)

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-214-employees-crud.md`
- Research document: `thoughts/shared/research/2026-03-05-ZMI-TICKET-214-employees-crud.md`
- Pattern reference (cost centers): `apps/web/src/server/routers/costCenters.ts`
- Pattern reference (teams with pagination): `apps/web/src/server/routers/teams.ts`
- Pattern reference (employment types with Decimal + clear flags): `apps/web/src/server/routers/employmentTypes.ts`
- Authorization middleware: `apps/web/src/server/middleware/authorization.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
- Test helpers: `apps/web/src/server/__tests__/helpers.ts`
- Test pattern: `apps/web/src/server/__tests__/cost-centers-router.test.ts`
- Frontend hook pattern: `apps/web/src/hooks/api/use-cost-centers.ts`
- Prisma schema (Employee models): `apps/web/prisma/schema.prisma` (lines 467-671)
- Go service (employee): `apps/api/internal/service/employee.go`
- Go service (tariff assignments): `apps/api/internal/service/employeetariffassignment.go`
- Go handler (employee): `apps/api/internal/handler/employee.go`
- Go repository (employee): `apps/api/internal/repository/employee.go`
