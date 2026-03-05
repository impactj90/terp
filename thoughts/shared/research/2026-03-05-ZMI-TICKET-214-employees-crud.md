---
date: 2026-03-05T10:00:00+01:00
researcher: Claude
branch: staging
repository: terp
topic: "tRPC routers for Employees CRUD, Contacts, Cards, Tariff Assignments"
tags: [research, codebase, trpc, employees, contacts, cards, tariff-assignments, prisma]
status: complete
last_updated: 2026-03-05
last_updated_by: Claude
---

# Research: tRPC Routers for Employees CRUD (ZMI-TICKET-214)

**Date**: 2026-03-05T10:00:00+01:00
**Researcher**: Claude
**Branch**: staging
**Repository**: terp

## Research Question

What existing patterns, models, permissions, Go business logic, Prisma schema, frontend hooks, and infrastructure exist for implementing tRPC routers for Employees (CRUD + Search + Bulk-Tariff), EmployeeContacts, EmployeeCards, and EmployeeTariffAssignments?

## Summary

The employee domain is the largest and most complex in the codebase. The Go backend has 888 lines of employee service logic (CRUD + contacts + cards + bulk tariff + day plan sync), 1170 lines of handler code, 378 lines of repository code, plus 648 lines for tariff assignment service logic and 263 lines for its handler. Four distinct Prisma models exist (`Employee`, `EmployeeContact`, `EmployeeCard`, `EmployeeTariffAssignment`). The permission catalog already contains `employees.view`, `employees.create`, `employees.edit`, and `employees.delete`. The authorization system includes data scope filtering (all/tenant/department/employee) that must be ported. Four frontend hooks files need migration from `useApiQuery`/`useApiMutation` to tRPC. The tRPC infrastructure (tenantProcedure, requirePermission, requireEmployeePermission, applyDataScope) is already in place from ZMI-TICKET-203/210.

## Detailed Findings

### 1. Existing tRPC Router Patterns

All implemented routers follow an identical structure. Relevant pattern examples:

**Files**:
- `apps/web/src/server/routers/costCenters.ts` (340 lines) -- simple CRUD
- `apps/web/src/server/routers/departments.ts` (542 lines) -- CRUD + tree + circular ref
- `apps/web/src/server/routers/teams.ts` (763 lines) -- CRUD + sub-entities (members) + pagination
- `apps/web/src/server/routers/users.ts` -- CRUD + requireSelfOrPermission

**Established pattern in every router**:
1. Import `createTRPCRouter`, `tenantProcedure` from `../trpc`
2. Import `requirePermission` from `../middleware/authorization`
3. Import `permissionIdByKey` from `../lib/permission-catalog`
4. Define permission constants: `const X_MANAGE = permissionIdByKey("x.manage")!`
5. Define Zod output/input schemas
6. Define a `mapXToOutput()` helper function
7. Export router via `createTRPCRouter({...})`

**Procedure chain pattern**:
```
tenantProcedure
  .use(requirePermission(PERM_CONSTANT))
  .input(zodSchema)
  .output(zodSchema)
  .query|mutation(async ({ ctx, input }) => { ... })
```

**Common patterns**:
- All mutations verify entity exists with `prisma.x.findFirst({ where: { id, tenantId } })`
- All throw `TRPCError` with codes: `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `FORBIDDEN`
- All use `tenantProcedure` as the base (auth + tenant validation)
- Partial update: build `data: Record<string, unknown>` object conditionally
- List with pagination: `{ items: T[], total: number }` pattern (teams) or `{ data: T[] }` pattern (costCenters)
- Delete returns `{ success: boolean }`

**Root router registration** (`apps/web/src/server/root.ts`):
```typescript
export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  permissions: permissionsRouter,
  tenants: tenantsRouter,
  users: usersRouter,
  userGroups: userGroupsRouter,
  departments: departmentsRouter,
  teams: teamsRouter,
  costCenters: costCentersRouter,
  employmentTypes: employmentTypesRouter,
  locations: locationsRouter,
  holidays: holidaysRouter,
})
```
New routers for `employees`, `employeeContacts`, `employeeCards`, `employeeTariffAssignments` need to be added here.

### 2. Permission Catalog

**File**: `apps/web/src/server/lib/permission-catalog.ts`

Employee-related permissions already exist:
- `employees.view` -- "View employee records"
- `employees.create` -- "Create employee records"
- `employees.edit` -- "Edit employee records"
- `employees.delete` -- "Delete employee records"

Usage via `permissionIdByKey("employees.view")` returns a deterministic UUID.

**Go backend permission mapping** (from `handler/routes.go` lines 262-301):
- `GET /employees` -- `employees.view`
- `POST /employees` -- `employees.create`
- `GET /employees/search` -- `employees.view`
- `PATCH /employees/bulk-tariff` -- `employees.edit`
- `GET /employees/{id}` -- `employees.view`
- `PUT /employees/{id}` -- `employees.edit`
- `DELETE /employees/{id}` -- `employees.delete`
- `GET /employees/{id}/contacts` -- `employees.view`
- `POST /employees/{id}/contacts` -- `employees.edit`
- `DELETE /employees/{id}/contacts/{contactId}` -- `employees.edit`
- `GET /employees/{id}/cards` -- `employees.view`
- `POST /employees/{id}/cards` -- `employees.edit`
- `DELETE /employees/{id}/cards/{cardId}` -- `employees.edit`

**Tariff assignment permission mapping** (from `handler/routes.go` lines 943-969):
- `GET /employees/{id}/tariff-assignments` -- `employees.view`
- `POST /employees/{id}/tariff-assignments` -- `employees.edit`
- `GET /employees/{id}/tariff-assignments/{assignmentId}` -- `employees.view`
- `PUT /employees/{id}/tariff-assignments/{assignmentId}` -- `employees.edit`
- `DELETE /employees/{id}/tariff-assignments/{assignmentId}` -- `employees.edit`
- `GET /employees/{id}/effective-tariff` -- `employees.view`

### 3. Authorization & Data Scope System

**Files**:
- `apps/web/src/server/trpc.ts` -- `tenantProcedure`, `protectedProcedure`
- `apps/web/src/server/middleware/authorization.ts` -- `requirePermission`, `requireSelfOrPermission`, `requireEmployeePermission`, `applyDataScope`
- `apps/api/internal/access/scope.go` -- Go data scope logic

**tRPC procedure hierarchy**:
- `publicProcedure` -- no auth
- `protectedProcedure` -- requires valid Supabase session + resolved user
- `tenantProcedure` -- extends protectedProcedure + requires X-Tenant-ID + validates user has tenant access

**Data scope middleware** (`applyDataScope()`):
Reads `user.dataScopeType` (all/tenant/department/employee) and `user.dataScopeTenantIds`, `user.dataScopeDepartmentIds`, `user.dataScopeEmployeeIds` from the User model, then adds a `DataScope` object to context. This is already implemented and available.

**Data scope types** (from User model in Prisma schema, line 45-48):
```prisma
dataScopeType          String    @default("all") @map("data_scope_type") @db.VarChar(20)
dataScopeTenantIds     String[]  @default([]) @map("data_scope_tenant_ids") @db.Uuid
dataScopeDepartmentIds String[]  @default([]) @map("data_scope_department_ids") @db.Uuid
dataScopeEmployeeIds   String[]  @default([]) @map("data_scope_employee_ids") @db.Uuid
```

**Go scope logic** (`access/scope.go`):
- `AllowsTenant(tenantID)` -- for scope type "tenant", checks if tenantID is in allowed list
- `AllowsEmployee(employee)` -- for "department" scope, checks employee's departmentID is in allowed list; for "employee" scope, checks employee ID is in allowed list
- `AllowsEmployeeID(employeeID)` -- shorthand for employee scope check
- `ApplyEmployeeScope(query, empCol, deptCol)` -- applies WHERE clauses to GORM query

**How Go handler uses scope**:
1. `List` handler: adds scope filters to `EmployeeFilter` struct (`ScopeType`, `ScopeDepartmentIDs`, `ScopeEmployeeIDs`)
2. `Get` handler: fetches employee first, then calls `scope.AllowsEmployee(emp)`
3. `Search` handler: post-filters results through `scope.AllowsEmployee`
4. `Update`/`Delete`: calls `ensureEmployeeScope()` which fetches employee and checks `AllowsEmployee`
5. `BulkAssignTariff`: checks scope per employee for explicit IDs, or passes scope through filter

**`requireEmployeePermission` middleware** (already implemented):
Used for employee-specific "own vs all" access. Checks `user.employeeId === targetEmployeeId` for own-data permission, otherwise requires all-data permission. This is available but the ticket mentions `requireEmployeePermission("employees.read_own", "employees.read")` for `getById` -- note that `employees.read_own` and `employees.read` are NOT in the current permission catalog. The catalog has `employees.view`, `employees.create`, `employees.edit`, `employees.delete`. The ticket's permission names may need adjustment to match existing catalog keys.

### 4. Prisma Schema -- Employee Models

**File**: `apps/web/prisma/schema.prisma`

#### Employee (lines 467-571)
```prisma
model Employee {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String    @map("tenant_id") @db.Uuid
  personnelNumber      String    @map("personnel_number") @db.VarChar(50)
  pin                  String    @db.VarChar(20)
  firstName            String    @map("first_name") @db.VarChar(100)
  lastName             String    @map("last_name") @db.VarChar(100)
  email                String?   @db.VarChar(255)
  phone                String?   @db.VarChar(50)
  entryDate            DateTime  @map("entry_date") @db.Date
  exitDate             DateTime? @map("exit_date") @db.Date
  departmentId         String?   @map("department_id") @db.Uuid
  costCenterId         String?   @map("cost_center_id") @db.Uuid
  employmentTypeId     String?   @map("employment_type_id") @db.Uuid
  weeklyHours          Decimal   @default(40.00) @map("weekly_hours") @db.Decimal(5, 2)
  vacationDaysPerYear  Decimal   @default(30.00) @map("vacation_days_per_year") @db.Decimal(5, 2)
  isActive             Boolean   @default(true) @map("is_active")
  tariffId             String?   @map("tariff_id") @db.Uuid
  // Extended fields: exitReason, notes, addressStreet/Zip/City/Country, birthDate, gender,
  //   nationality, religion, maritalStatus, birthPlace, birthCountry, roomNumber, photoUrl
  // Group FKs: employeeGroupId, workflowGroupId, activityGroupId
  // Order FKs: defaultOrderId, defaultActivityId
  // Tariff overrides: partTimePercent, disabilityFlag, dailyTargetHours, weeklyTargetHours,
  //   monthlyTargetHours, annualTargetHours, workDaysPerWeek
  // System: calculationStartDate, deletedAt

  // Relations available in Prisma:
  tenant, department, costCenter, employmentType, user, managedDepartments,
  ledTeams, teamMemberships, contacts, cards, tariffAssignments

  // Relations NOT yet in Prisma (FK columns exist, models not modeled):
  tariffId -> Tariff, employeeGroupId -> EmployeeGroup, workflowGroupId -> WorkflowGroup,
  activityGroupId -> ActivityGroup, defaultOrderId -> Order, defaultActivityId -> Activity
}
```

Key Prisma-level constraints:
- `@@unique([tenantId, personnelNumber])` -- personnel number unique per tenant
- `@@unique([tenantId, pin])` -- PIN unique per tenant
- Soft-delete via `deletedAt` column (but Prisma does NOT have automatic soft-delete like GORM's `DeletedAt`)
- Multiple indexes: `idx_employees_tenant`, `idx_employees_department`, `idx_employees_active`, `idx_employees_name`, etc.

#### EmployeeContact (lines 579-601)
```prisma
model EmployeeContact {
  id, employeeId, contactType, value, label, isPrimary, createdAt, updatedAt, contactKindId
  employee Employee @relation(...)
  // contactKindId FK -> ContactKind (not yet in Prisma)
}
```

#### EmployeeCard (lines 610-633)
```prisma
model EmployeeCard {
  id, tenantId, employeeId, cardNumber, cardType, validFrom, validTo, isActive,
  deactivatedAt, deactivationReason, createdAt, updatedAt
  tenant, employee relations
  @@unique([tenantId, cardNumber])
}
```

#### EmployeeTariffAssignment (lines 645-671)
```prisma
model EmployeeTariffAssignment {
  id, tenantId, employeeId, tariffId, effectiveFrom, effectiveTo,
  overwriteBehavior, notes, isActive, createdAt, updatedAt
  tenant, employee relations
  // tariffId FK -> Tariff (not yet in Prisma)
}
```

### 5. Go Business Logic -- Employee Service

**File**: `apps/api/internal/service/employee.go` (888 lines)

**Sentinel errors** (lines 17-35):
- `ErrEmployeeNotFound`
- `ErrPersonnelNumberRequired`, `ErrPINRequired`, `ErrFirstNameRequired`, `ErrLastNameRequired`
- `ErrPersonnelNumberExists`, `ErrPINExists`, `ErrCardNumberExists`
- `ErrInvalidEntryDate` -- "entry date cannot be more than 6 months in the future"
- `ErrExitBeforeEntry` -- "exit date cannot be before entry date"
- `ErrContactNotFound`, `ErrCardNotFound`
- `ErrContactTypeRequired`, `ErrContactValueRequired`, `ErrCardNumberRequired`
- `ErrEmployeeHasActiveBookings`, `ErrTariffSyncUnavailable`
- `ErrEmployeeExited`

**Create logic** (lines 141-261):
1. Trim and validate required fields (personnelNumber, firstName, lastName)
2. Auto-assign PIN if empty (calls `repo.NextPIN()` which finds `MAX(pin::integer) + 1`)
3. Validate entry date not more than 6 months in future
4. Check personnel number uniqueness per tenant
5. Check PIN uniqueness per tenant
6. Build Employee model with all fields (extended fields, group FKs, decimal conversions)
7. Call `repo.Create()`
8. If tariffID provided, sync day plans (`syncEmployeeDayPlansForTariff`)

**Update logic** (lines 342-517):
1. Fetch existing employee
2. Apply partial updates field-by-field (pointer-nil check pattern)
3. Handle nullable FK fields with "clear" flags (ClearDepartmentID, ClearTariffID, etc.)
4. Decimal fields: convert `*float64` to `*decimal.Decimal`
5. Call `repo.Update()`
6. If tariff changed: clear old tariff day plans, sync new tariff day plans

**BulkAssignTariff logic** (lines 520-565):
1. If `EmployeeIDs` provided: fetch each, validate tenant, collect
2. If `Filter` provided: list all matching employees (no pagination limit)
3. For each employee: call `Update()` with just `TariffID` or `ClearTariffID`
4. Return (updated count, skipped count)

**Deactivate logic** (lines 682-695):
- Sets `IsActive = false`
- Sets `ExitDate = now` if not already set
- Calls `repo.Update()`

**Delete logic** (lines 698-705):
- Verifies exists, then calls `repo.Delete()` (GORM soft-delete)

**Search logic** (line 713-715):
- Delegates to `repo.Search()` with limit=20

**Contact operations** (lines 728-797):
- `AddContact`: verify employee exists, trim/validate type+value, optional contactKindID validation, create
- `GetContactByID`, `RemoveContact`, `ListContacts`: standard CRUD

**Card operations** (lines 810-883):
- `AddCard`: verify employee exists, validate card number, check uniqueness per tenant, default card type to "rfid"
- `DeactivateCard`: set `IsActive=false`, `DeactivatedAt=now`, `DeactivationReason`
- `ListCards`: list all cards for employee

**Day plan sync logic** (lines 567-672):
- `syncEmployeeDayPlansForTariff`: calculates sync window, preserves manual edits, generates day plans from tariff's week plan
- `clearTariffDayPlans`: removes tariff-source day plans in range
- `getTariffSyncWindow`: intersection of [today, +1yr] with [employee entry/exit] and [tariff valid dates]

**Important**: The day plan sync logic depends on Tariff model with `GetDayPlanIDForDate()` method and the `EmployeeDayPlan` repository. Since Tariff is NOT yet in Prisma, this logic cannot be fully ported. The ticket scope says "Employee Day Plans" is TICKET-229, so day plan sync may be deferred.

### 6. Go Business Logic -- Employee Tariff Assignment Service

**File**: `apps/api/internal/service/employeetariffassignment.go` (648 lines)

**Sentinel errors**:
- `ErrAssignmentNotFound`, `ErrAssignmentOverlap`, `ErrAssignmentInvalidDates`
- `ErrAssignmentEmployeeNotFound`, `ErrAssignmentTariffNotFound`
- `ErrAssignmentTariffRequired`, `ErrAssignmentDateRequired`

**Create logic** (lines 130-203):
1. Validate tariffID non-nil, effectiveFrom non-zero
2. Validate date range (effectiveTo >= effectiveFrom if set)
3. Verify employee exists, verify tariff exists
4. Check for overlapping assignments (`HasOverlap`)
5. Default overwriteBehavior to `preserve_manual`
6. Create, re-fetch with preloaded Tariff relation
7. Sync day plans for the new assignment
8. Recalculate vacation entitlement for affected years

**Update logic** (lines 215-304):
1. Fetch existing, verify tenant matches
2. Apply partial updates (effectiveFrom, effectiveTo, overwriteBehavior, notes, isActive)
3. Validate dates, check overlap if dates changed
4. Save, re-fetch with preloaded relations
5. If dates changed: resync old range from default tariff, then sync new range
6. Recalculate vacation

**Delete logic** (lines 307-334):
1. Fetch assignment (need date range for resync)
2. Hard delete
3. Resync cleared range from default tariff
4. Recalculate vacation

**GetEffectiveTariff** (lines 362-399):
Resolution order:
1. Find active assignment covering the date (`assignmentRepo.GetEffectiveForDate`)
2. Fall back to employee's default `tariffId`
3. Return source="none" if no tariff

**GetEffectiveTariffBatch** (lines 356-358):
Batch version for multiple employees at once (used by employee list handler).

**Day plan sync** (lines 450-517):
- Uses `calcSyncWindow` which differs from employee service's `getTariffSyncWindow`:
  - Assignment sync starts from assignment's `effectiveFrom` (not today)
  - Window = intersection of [assignment dates] and [emp entry/exit] and [tariff valid] and [_, today+1yr]

**Important dependencies**:
- `tariffRepo.GetByID()` and `tariffRepo.GetWithDetails()` -- Tariff model not in Prisma yet
- `dayPlanRepo` -- for day plan sync (deferred to TICKET-229)
- `recalcSvc.TriggerRecalcRange()` -- for recalculation (complex, likely deferred)
- `vacationSvc.InitializeYear()` -- for vacation entitlement (deferred)

### 7. Go Repository Layer

**File**: `apps/api/internal/repository/employee.go` (378 lines)

**EmployeeFilter struct** (lines 22-36):
```go
type EmployeeFilter struct {
  TenantID           uuid.UUID
  DepartmentID       *uuid.UUID
  EmployeeGroupID    *uuid.UUID
  WorkflowGroupID    *uuid.UUID
  ActivityGroupID    *uuid.UUID
  IsActive           *bool
  HasExitDate        *bool
  SearchQuery        string
  Offset, Limit      int
  ScopeType          model.DataScopeType
  ScopeDepartmentIDs []uuid.UUID
  ScopeEmployeeIDs   []uuid.UUID
}
```

**List query** (lines 135-209):
- Base: `WHERE tenant_id = ?`
- DepartmentID filter includes team membership subquery: `department_id = ? OR id IN (SELECT tm.employee_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.department_id = ?)`
- Search: LIKE on first_name, last_name, personnel_number, email (case-insensitive)
- Scope filtering: `DataScopeDepartment` adds department IN clause (with team membership subquery), `DataScopeEmployee` adds `id IN` clause
- Count + paginate (limit/offset)
- Preloads: `Tariff` on list
- Order: `last_name ASC, first_name ASC`

**GetWithDetails** (lines 212-235):
Preloads: Tariff, Department, CostCenter, EmploymentType, EmployeeGroup, WorkflowGroup, ActivityGroup, Contacts, Contacts.ContactKind, Cards (active only)

**NextPIN** (lines 239-253):
`SELECT MAX(pin::integer) FROM employees WHERE tenant_id = ? AND pin ~ '^[0-9]+$'`
Returns max+1 as string. Needs raw SQL in Prisma (`$queryRaw`).

**Search** (lines 256-273):
LIKE on first_name, last_name, personnel_number where `is_active = true`, limit 20.

**File**: `apps/api/internal/repository/employeetariffassignment.go` (172 lines)

**GetEffectiveForDate** (lines 87-115):
```sql
WHERE employee_id = ? AND is_active = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
ORDER BY effective_from DESC LIMIT 1
```
With deep preloading of Tariff + Breaks + WeekPlan + TariffWeekPlans + TariffDayPlans (for day plan resolution).

**HasOverlap** (lines 149-172):
Overlap detection: `A.start <= B.end AND A.end >= B.start`, with NULL end dates as infinity.
Supports `excludeID` for update operations.

### 8. Go Model Layer

**File**: `apps/api/internal/model/employee.go`

**Employee struct** (86 lines):
- Core fields: ID, TenantID, PersonnelNumber, PIN, FirstName, LastName, Email, Phone, EntryDate, ExitDate
- FK fields: DepartmentID, CostCenterID, EmploymentTypeID, TariffID
- Numeric: WeeklyHours (Decimal), VacationDaysPerYear (Decimal)
- Extended: ExitReason, Notes, Address*, BirthDate, Gender, Nationality, Religion, MaritalStatus, BirthPlace, BirthCountry, RoomNumber, PhotoURL
- Group FKs: EmployeeGroupID, WorkflowGroupID, ActivityGroupID
- Order FKs: DefaultOrderID, DefaultActivityID
- Tariff overrides: PartTimePercent, DisabilityFlag, DailyTargetHours, WeeklyTargetHours, MonthlyTargetHours, AnnualTargetHours, WorkDaysPerWeek
- System: CalculationStartDate, CreatedAt, UpdatedAt, DeletedAt (soft-delete)
- Relations: Tenant, Department, CostCenter, EmploymentType, Tariff, EmployeeGroup, WorkflowGroup, ActivityGroup, DefaultOrder, DefaultActivity, Contacts, Cards, User
- Helper methods: `FullName()`, `IsEmployed()`

**EmployeeContact struct**: ID, EmployeeID, ContactType, ContactKindID, Value, Label, IsPrimary, CreatedAt, UpdatedAt + ContactKind relation

**EmployeeCard struct**: ID, TenantID, EmployeeID, CardNumber, CardType, ValidFrom, ValidTo, IsActive, DeactivatedAt, DeactivationReason, CreatedAt, UpdatedAt
- Helper method: `IsValid()` (checks active + date range)

**File**: `apps/api/internal/model/employeetariffassignment.go`

**EmployeeTariffAssignment struct**: ID, TenantID, EmployeeID, TariffID, EffectiveFrom, EffectiveTo, OverwriteBehavior, Notes, IsActive, CreatedAt, UpdatedAt + Employee/Tariff relations
- `OverwriteBehavior` enum: `"overwrite"`, `"preserve_manual"`
- Helper method: `ContainsDate(date)`

### 9. Go Handler Layer

**File**: `apps/api/internal/handler/employee.go` (1170 lines)

**Key handler patterns**:

**List** (lines 55-133):
- Parse query params: limit, offset, q, is_active, department_id
- Apply data scope from context
- Call service.List() with EmployeeFilter
- Override tariff with effective assignment tariff (batch call to assignmentService)
- Return `{ data: [], total: N }`

**Get** (lines 178-212):
- Parse UUID from URL
- Call service.GetDetails() (preloads all relations)
- Check data scope
- Override tariff with effective assignment tariff
- Return employee

**Create** (lines 214-385):
- Decode `models.CreateEmployeeRequest` (generated from OpenAPI)
- Validate via generated `Validate(nil)` method
- Build `service.CreateEmployeeInput` with extensive field mapping (UUIDs, dates, decimals)
- Call service.Create()
- Map errors to HTTP status codes
- Audit log

**Update** (lines 387-641):
- Parse UUID, call `ensureEmployeeScope()`
- Read raw body to detect explicit null values (for nullable FK fields)
- Build `service.UpdateEmployeeInput` with field-by-field conditional mapping
- Handle explicit null for tariff_id, employee_group_id, workflow_group_id, activity_group_id (clear flags)
- Call service.Update()
- Audit log

**BulkAssignTariff** (lines 643-784):
- Decode `models.BulkTariffAssignmentRequest`
- Handle two modes: explicit employee_ids or filter-based
- For explicit IDs: check scope per employee
- For filter-based: pass scope through filter
- Call service.BulkAssignTariff()
- Return `{ updated, skipped }`

**Delete** (lines 786-829):
- Call `ensureEmployeeScope()`
- Call service.Deactivate() (soft delete via deactivation)
- Audit log

**Contact handlers** (lines 831-982):
- ListContacts, AddContact, RemoveContact
- All check employee scope
- RemoveContact: looks up contact first to get employeeID, then checks scope

**Card handlers** (lines 984-1148):
- ListCards, AddCard, DeactivateCard
- All check employee scope
- DeactivateCard: looks up card first to get employeeID, then checks scope

**`ensureEmployeeScope`** (lines 1150-1170):
1. Get employee by ID
2. Get scope from context
3. Check AllowsTenant and AllowsEmployee
4. Return employee or error

**File**: `apps/api/internal/handler/employeetariffassignment.go` (263 lines)

Handlers: List, Create, Get, Update, Delete, GetEffectiveTariff
- All use generated models for request/response (`models.CreateEmployeeTariffAssignmentRequest`, `models.UpdateEmployeeTariffAssignmentRequest`)
- Create/Update map errors to specific HTTP status codes (400 for validation, 404 for not found, 409 for overlap)

### 10. OpenAPI Specification

**File**: `api/paths/employees.yaml` -- 506 lines defining all employee endpoints
**File**: `api/paths/employee-tariff-assignments.yaml` -- 186 lines

**Employee endpoints**:
- `GET /employees` -- list with pagination (limit, page, q, department_id, active)
- `POST /employees` -- create
- `GET /employees/search` -- quick search (q required)
- `PATCH /employees/bulk-tariff` -- bulk assign tariff
- `GET /employees/{id}` -- get by ID with full details
- `PUT /employees/{id}` -- update
- `DELETE /employees/{id}` -- deactivate (soft delete)
- `GET /employees/{id}/contacts` -- list contacts
- `POST /employees/{id}/contacts` -- add contact
- `DELETE /employees/{id}/contacts/{contactId}` -- remove contact
- `GET /employees/{id}/cards` -- list cards
- `POST /employees/{id}/cards` -- add card
- `DELETE /employees/{id}/cards/{cardId}` -- deactivate card

**Tariff assignment endpoints**:
- `GET /employees/{id}/tariff-assignments` -- list (optional active filter)
- `POST /employees/{id}/tariff-assignments` -- create
- `GET /employees/{id}/tariff-assignments/{assignmentId}` -- get by ID
- `PUT /employees/{id}/tariff-assignments/{assignmentId}` -- update
- `DELETE /employees/{id}/tariff-assignments/{assignmentId}` -- delete
- `GET /employees/{id}/effective-tariff` -- resolve effective tariff for date

**Schema files**: `api/schemas/employees.yaml` (722 lines), `api/schemas/employee-tariff-assignments.yaml` (135 lines)

### 11. Frontend Hooks to Migrate

**File**: `apps/web/src/hooks/api/use-employees.ts` (118 lines)
Current hooks (using `useApiQuery`/`useApiMutation`):
- `useEmployees(options)` -- paginated list with search, departmentId, active filter
- `useEmployee(id)` -- single employee by ID
- `useCreateEmployee()` -- create mutation, invalidates `/employees`
- `useUpdateEmployee()` -- update mutation, invalidates `/employees`
- `useDeleteEmployee()` -- delete mutation, invalidates `/employees`
- `useBulkAssignTariff()` -- bulk tariff mutation, invalidates `/employees`

**File**: `apps/web/src/hooks/api/use-employee-contacts.ts` (49 lines)
- `useEmployeeContacts(employeeId)` -- list contacts
- `useCreateEmployeeContact()` -- create, invalidates contacts + employee + employees
- `useDeleteEmployeeContact()` -- delete, invalidates contacts + employee + employees

**File**: `apps/web/src/hooks/api/use-employee-cards.ts` (49 lines)
- `useEmployeeCards(employeeId)` -- list cards
- `useCreateEmployeeCard()` -- create, invalidates cards + employee + employees
- `useDeactivateEmployeeCard()` -- deactivate, invalidates cards + employee + employees

**File**: `apps/web/src/hooks/api/use-employee-tariff-assignments.ts` (123 lines)
- `useEmployeeTariffAssignments(employeeId, options?)` -- list with optional active filter
- `useEmployeeTariffAssignment(employeeId, assignmentId)` -- single by ID
- `useCreateEmployeeTariffAssignment()` -- create, invalidates assignments + effective-tariff + employees
- `useUpdateEmployeeTariffAssignment()` -- update, invalidates same
- `useDeleteEmployeeTariffAssignment()` -- delete, invalidates same
- `useEffectiveTariff(employeeId, date)` -- effective tariff query

All hooks are re-exported from `apps/web/src/hooks/api/index.ts`.

### 12. Existing Tests

**Go tests**:
- `apps/api/internal/service/employee_test.go` -- Unit tests for employee service (create, update, contacts, cards, etc.)
- `apps/api/internal/handler/employee_test.go` -- Handler-level tests
- `apps/api/internal/repository/employee_test.go` -- Repository tests
- `apps/api/internal/service/employeetariffassignment_test.go` -- Assignment service tests
- `apps/api/internal/handler/employeetariffassignment_test.go` -- Assignment handler tests
- `apps/api/internal/service/employee_tariff_test.go` -- Tariff sync tests

**tRPC test patterns** (from `apps/web/src/server/__tests__/cost-centers-router.test.ts`):
- Uses `vitest` with `vi.fn()` for mocking Prisma
- Creates router-specific caller via `createCallerFactory(router)`
- Creates mock context with `createMockContext()`, `createUserWithPermissions()`, `createMockUserTenant()`, `createMockSession()` helpers (from `./helpers`)
- Tests both success cases and error cases (NOT_FOUND, BAD_REQUEST, CONFLICT, FORBIDDEN)
- Mock Prisma methods: `findMany`, `findFirst`, `findUnique`, `create`, `update`, `delete`, `count`

### 13. Soft Delete Considerations

**GORM behavior** (Go): Uses `DeletedAt gorm.DeletedAt` field which automatically adds `WHERE deleted_at IS NULL` to all queries.

**Prisma behavior**: Prisma does NOT support automatic soft-delete. The `deletedAt` column exists in the schema but queries do not automatically exclude soft-deleted records. Options:
1. Add `deletedAt: null` (or `deletedAt: { equals: null }`) to all WHERE clauses manually
2. Use Prisma client extensions for automatic filtering
3. The Go `Delete` handler actually calls `service.Deactivate()` (sets `isActive=false`, `exitDate=now`) rather than soft-deleting via `deletedAt`. This may mean the tRPC delete procedure should also just deactivate rather than use the deletedAt column.

### 14. Relations Not Yet in Prisma

Several FK columns exist on the Employee table but their target models are not yet in Prisma:
- `tariffId` -> Tariff model (no Prisma relation yet)
- `employeeGroupId` -> EmployeeGroup model (not in Prisma)
- `workflowGroupId` -> WorkflowGroup model (not in Prisma)
- `activityGroupId` -> ActivityGroup model (not in Prisma)
- `defaultOrderId` -> Order model (not in Prisma)
- `defaultActivityId` -> Activity model (not in Prisma)

On EmployeeContact:
- `contactKindId` -> ContactKind model (not in Prisma)

On EmployeeTariffAssignment:
- `tariffId` -> Tariff model (not in Prisma)

This means:
- Cannot preload Tariff, EmployeeGroup, WorkflowGroup, ActivityGroup, etc. via Prisma `include`
- The effective tariff resolution logic (`GetEffectiveTariff`) depends on the Tariff model being in Prisma
- The day plan sync logic depends on Tariff with WeekPlan/DayPlan sub-models
- For now, these FK columns can be read/written as plain strings but relationships cannot be traversed

### 15. Key Complexity Areas

1. **Data Scope Filtering**: Must be ported from Go to tRPC. The `applyDataScope()` middleware exists, but the actual Prisma WHERE clause building needs implementation in each procedure.

2. **PIN Auto-Assignment**: Requires raw SQL (`MAX(pin::integer)` with regex filter) -- needs `prisma.$queryRaw`.

3. **Effective Tariff Override on List**: The Go list handler fetches effective tariffs in batch and overrides the employee's tariff field. Since Tariff is not in Prisma, this may need to be deferred or use raw queries.

4. **Nullable FK Clear Pattern**: Update logic needs to distinguish between "not provided" (don't change), "null" (clear the FK), and "value" (set the FK). In the Go handler, this is done by parsing raw JSON to detect explicit null values.

5. **Day Plan Sync**: Triggered on tariff changes. Depends on Tariff model with full hierarchy. Likely needs to be deferred to TICKET-229.

6. **Vacation Recalculation**: Triggered on tariff assignment changes. Depends on VacationService. Should be deferred.

7. **Bulk Operations**: BulkAssignTariff supports two modes (explicit IDs vs filter) and must respect data scope for both.

8. **Audit Logging**: The Go handlers log create/update/delete actions. tRPC routers don't have an audit logging pattern yet -- may need to be deferred or implemented as middleware.
