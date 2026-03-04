---
date: 2026-03-04T12:00:00+01:00
researcher: Claude
git_commit: 3154ac29719f71fac3d85bb013baa3ca873cf74b
branch: claude/zmi-ticket-212-2l3AU
repository: terp
topic: "tRPC routers for Holidays, Cost Centers, Employment Types, Locations"
tags: [research, codebase, trpc, holidays, cost-centers, employment-types, locations, master-data, prisma]
status: complete
last_updated: 2026-03-04
last_updated_by: Claude
---

# Research: tRPC Routers for Holidays, Cost Centers, Employment Types, Locations

**Date**: 2026-03-04T12:00:00+01:00
**Researcher**: Claude
**Git Commit**: 3154ac29719f71fac3d85bb013baa3ca873cf74b
**Branch**: claude/zmi-ticket-212-2l3AU
**Repository**: terp

## Research Question

What existing patterns, models, permissions, Go business logic, and infrastructure exist for implementing tRPC routers for four master data entities: Holidays (with Generate/Copy), Cost Centers, Employment Types, and Locations?

## Summary

The codebase has well-established tRPC router patterns (departments, teams, users) that serve as direct templates. All four Prisma models exist. The Go backend has complete business logic for all four entities. The permission catalog contains `holidays.manage` and `locations.manage` but does **not** contain `cost_centers.manage` or `employment_types.manage` -- these two permissions need to be added. Frontend hooks currently use the old `useApiQuery`/`useApiMutation` pattern and need migration to the tRPC pattern (`useTRPC()` + `useQuery`/`useMutation`). The holiday entity is the most complex, requiring a port of the Easter-based German state holiday generation algorithm and year-to-year copy logic from Go.

## Detailed Findings

### 1. Existing tRPC Router Patterns

Three routers serve as templates, all following the same structure:

**Pattern observed in all routers:**
1. Import `createTRPCRouter`, `tenantProcedure` from `../trpc`
2. Import `requirePermission` from `../middleware/authorization`
3. Import `permissionIdByKey` from `../lib/permission-catalog`
4. Define permission constant: `const X_MANAGE = permissionIdByKey("x.manage")!`
5. Define Zod output/input schemas
6. Define a `mapXToOutput()` helper function
7. Export router via `createTRPCRouter({...})`

**Departments Router** (`apps/web/src/server/routers/departments.ts`, 542 lines):
- Procedures: `list`, `getTree`, `getById`, `create`, `update`, `delete`
- Uses single permission `departments.manage` for all procedures
- `list` returns `{ data: Department[] }`
- `getById` returns single object
- `create`/`update` return single object
- `delete` returns `{ success: boolean }`
- Validates code uniqueness within tenant
- Trim + validate on code and name
- Has tree-building and circular-reference detection logic

**Teams Router** (`apps/web/src/server/routers/teams.ts`, 763 lines):
- Procedures: `list`, `getById`, `create`, `update`, `delete`, `getMembers`, `addMember`, `updateMemberRole`, `removeMember`, `getByEmployee`
- Uses single permission `teams.manage`
- `list` returns `{ items: Team[], total: number }` with pagination (page, pageSize)
- Name uniqueness check within tenant

**Users Router** (`apps/web/src/server/routers/users.ts`, 625 lines):
- Procedures: `list`, `getById`, `create`, `update`, `delete`, `changePassword`
- Uses `users.manage` permission
- `list` returns `{ data: User[], meta: { total, limit } }`
- Uses `requireSelfOrPermission` for update/changePassword

**Common patterns across all routers:**
- All mutations verify entity exists with `findFirst({ where: { id, tenantId } })`
- All throw `TRPCError` with `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `FORBIDDEN` codes
- All use `tenantProcedure` as the base (auth + tenant validation)
- All chain `.use(requirePermission(PERM_CONSTANT))` for authorization
- Partial update pattern: build `data: Record<string, unknown>` object conditionally

### 2. Permission Catalog

**File**: `apps/web/src/server/lib/permission-catalog.ts` (239 lines)

The catalog defines 46 permissions using deterministic UUID v5 generation with a fixed namespace. Permissions are looked up by key via `permissionIdByKey(key)`.

**Permissions that exist:**
- `holidays.manage` (line 112): "Manage holidays"
- `locations.manage` (line 207): "Manage work locations"

**Permissions that do NOT exist:**
- `cost_centers.manage` -- not in the catalog
- `employment_types.manage` -- not in the catalog

The ticket references `requirePermission("cost_centers.*")` and `requirePermission("employment_types.*")`, but these permissions must first be added to the catalog before they can be used.

### 3. tRPC Infrastructure

**File**: `apps/web/src/server/trpc.ts` (215 lines)

Key exports:
- `createTRPCRouter` -- creates a tRPC router
- `createCallerFactory` -- creates server-side callers (used in tests)
- `createMiddleware` -- creates middleware functions
- `publicProcedure` -- no auth required
- `protectedProcedure` -- requires valid Supabase session + resolved user
- `tenantProcedure` -- extends protectedProcedure, requires `X-Tenant-ID` header, validates user has tenant access via `userTenants`

**Context type (`TRPCContext`):**
```typescript
{
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null
  session: Session | null
  tenantId: string | null
}
```

**Authorization middleware** (`apps/web/src/server/middleware/authorization.ts`, 202 lines):
- `requirePermission(...permissionIds: string[])` -- checks if user has ANY of the specified permissions (OR logic). Admin users bypass checks.
- `requireSelfOrPermission(userIdGetter, permissionId)` -- self-access or permission
- `requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)` -- own vs all
- `applyDataScope()` -- adds data scope filter to context

### 4. Root Router Registration

**File**: `apps/web/src/server/root.ts` (38 lines)

Currently registered routers:
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
})
```

New routers (`holidays`, `costCenters`, `employmentTypes`, `locations`) will be added here.

### 5. Prisma Schema Models

**File**: `apps/web/prisma/schema.prisma`

**Holiday** (line 271):
```prisma
model Holiday {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  holidayDate     DateTime  @map("holiday_date") @db.Date
  name            String    @db.VarChar(255)
  holidayCategory Int       @default(1) @map("holiday_category") @db.Integer
  appliesToAll    Boolean   @default(true) @map("applies_to_all")
  departmentId    String?   @map("department_id") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at")
  tenant          Tenant    @relation(...)
  @@unique([tenantId, holidayDate])
  @@map("holidays")
}
```

Key notes: No `state` or `year` columns -- state is used only during generation, and year is derived from `holidayDate`. The `holidayCategory` is an integer (1-3). The `departmentId` is a bare UUID without FK constraint. Unique constraint on `[tenantId, holidayDate]`.

**CostCenter** (line 177):
```prisma
model CostCenter {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at")
  tenant      Tenant    @relation(...)
  employees   Employee[]
  @@unique([tenantId, code])
  @@map("cost_centers")
}
```

**Location** (line 204):
```prisma
model Location {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(20)
  name        String    @db.VarChar(255)
  description String    @default("") @db.Text
  address     String    @default("") @db.Text
  city        String    @default("") @db.VarChar(255)
  country     String    @default("") @db.VarChar(100)
  timezone    String    @default("") @db.VarChar(100)
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at")
  tenant      Tenant    @relation(...)
  @@unique([tenantId, code])
  @@map("locations")
}
```

Key notes: Location has additional fields (address, city, country, timezone) compared to CostCenter.

**EmploymentType** (line 238):
```prisma
model EmploymentType {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String?   @map("tenant_id") @db.Uuid
  code                String    @db.VarChar(50)
  name                String    @db.VarChar(255)
  weeklyHoursDefault  Decimal   @default(40.00) @map("weekly_hours_default") @db.Decimal(5, 2)
  isActive            Boolean   @default(true) @map("is_active")
  vacationCalcGroupId String?   @map("vacation_calc_group_id") @db.Uuid
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @default(now()) @updatedAt @map("updated_at")
  tenant              Tenant?   @relation(...)
  employees           Employee[]
  @@map("employment_types")
}
```

Key notes: `tenantId` is **nullable** (unlike the other models). Has `weeklyHoursDefault` (Decimal) and `vacationCalcGroupId` fields. No unique constraint on `[tenantId, code]` in the Prisma schema (though the Go service checks code uniqueness via queries).

### 6. Go Business Logic

#### 6a. Holiday Service (`apps/api/internal/service/holiday.go`, 454 lines)

**CRUD operations:**
- `Create(ctx, CreateHolidayInput)` -- validates date non-zero, name non-empty, category 1-3, checks date uniqueness per tenant, triggers recalc
- `GetByID(ctx, id)`
- `Update(ctx, id, UpdateHolidayInput)` -- partial update (HolidayDate, Name, Category, AppliesToAll, DepartmentID), triggers recalc on date/category change
- `Delete(ctx, id)` -- triggers recalc
- `ListByYear(ctx, tenantID, year, departmentID)` -- delegates to repo
- `ListByDateRange(ctx, tenantID, from, to, departmentID)` -- delegates to repo

**Generate operation** (`GenerateForYearState`):
- Input: `{ TenantID, Year, State, SkipExisting }`
- Validates year (1900-2200), parses state code
- Calls `holiday.Generate(year, state)` to get holiday definitions
- Loads existing holidays for the year, builds `existingByDate` map
- Creates new holidays, skipping existing dates if `SkipExisting` is true
- Sets `Category: 1`, `AppliesToAll: true` for all generated holidays
- Triggers recalc for created dates

**Copy operation** (`CopyFromYear`):
- Input: `{ TenantID, SourceYear, TargetYear, CategoryOverrides, SkipExisting }`
- Validates years (1900-2200), rejects same year
- Builds category override map keyed by `"MM-DD"`
- Loads source year holidays, loads target year existing holidays
- For each source holiday: adjusts year via `dateWithYear()` (handles Feb 29), applies category overrides, skips existing if flag set
- Preserves: name, appliesToAll, departmentId from source
- Triggers recalc for created dates

**Recalc trigger** (`triggerRecalcIfNeeded`):
- Only triggers for past dates (before today)
- Finds min/max of affected dates
- Calls `recalcSvc.TriggerRecalcAll()` and `monthlyCalc.RecalculateFromMonthBatch()`
- Recalc services are optional (nil-safe)

**Helper functions:**
- `normalizeDate(d)` -- strips time, keeps date at midnight UTC (defined in `absence.go` line 628)
- `sameDate(a, b)` -- compares year/month/day (defined in `daily_calc.go` line 902)
- `dateKey(date)` -- returns `"2006-01-02"` string
- `dateWithYear(year, date)` -- creates new date with different year, returns false for invalid dates (e.g., Feb 29 in non-leap year)

#### 6b. Holiday Calendar Generation (`apps/api/internal/holiday/calendar.go`, 167 lines)

**German Federal States (Bundeslaender):**
16 states defined as constants: BW, BY, BE, BB, HB, HH, HE, MV, NI, NW, RP, SL, SN, ST, SH, TH

**`Generate(year, state)` function:**
Returns `[]Definition{Date, Name}` for a given year and state.

**Nationwide holidays (9):**
1. Neujahr (Jan 1)
2. Karfreitag (Easter - 2)
3. Ostermontag (Easter + 1)
4. Tag der Arbeit (May 1)
5. Christi Himmelfahrt (Easter + 39)
6. Pfingstmontag (Easter + 50)
7. Tag der Deutschen Einheit (Oct 3)
8. 1. Weihnachtstag (Dec 25)
9. 2. Weihnachtstag (Dec 26)

**State-specific holidays:**
- Heilige Drei Koenige (Jan 6): BW, BY, ST
- Internationaler Frauentag (Mar 8): BE, MV
- Ostersonntag + Pfingstsonntag: BB only
- Fronleichnam (Easter + 60): BW, BY, HE, NW, RP, SL
- Mariae Himmelfahrt (Aug 15): BY, SL
- Allerheiligen (Nov 1): BW, BY, NW, RP, SL
- Reformationstag (Oct 31): BB, MV, SN, ST, TH, HB, HH, NI, SH
- Buss- und Bettag: SN only (Wednesday before Nov 23)
- Weltkindertag (Sep 20): TH only

**Easter Sunday algorithm** (`easterSunday(year)`):
Uses the anonymous Gregorian algorithm (Gauss/Meeus), computing Easter via modular arithmetic with variables a through m, returning a `time.Time`.

**Repentance Day** (`repentanceDay(year)`):
Steps back from Nov 22 to find the previous Wednesday.

Results are sorted by date before returning.

#### 6c. Cost Center Service (`apps/api/internal/service/costcenter.go`, 167 lines)

Simple CRUD with validation:
- `Create`: validates code (trim, non-empty), name (trim, non-empty), checks code uniqueness per tenant
- `GetByID`, `GetByCode`
- `Update`: partial update for code, name, description, isActive; checks code uniqueness if changed
- `Delete`: verifies existence first
- `List(tenantID)`, `ListActive(tenantID)`

#### 6d. Employment Type Service (`apps/api/internal/service/employmenttype.go`, 177 lines)

CRUD with validation, structurally similar to CostCenter:
- `Create`: validates code/name, checks code uniqueness, includes `DefaultWeeklyHours` (Decimal) and `VacationCalcGroupID`
- `Update`: partial update; `ClearVacationCalcGroupID` boolean flag to explicitly null out the field
- Additional fields: `DefaultWeeklyHours`, `VacationCalcGroupID`, `ClearVacationCalcGroupID`
- Note: `TenantID` is a pointer (`*uuid.UUID`) in Go, matching the nullable Prisma field

#### 6e. Location Service (`apps/api/internal/service/location.go`, 157 lines)

CRUD with additional address fields:
- `Create`: Input includes code, name, description, address, city, country, timezone; sets `IsActive: true`
- `Update`: partial update for all fields including address fields
- `List(tenantID, isActive)`: optional active filter
- Error handling wraps repository errors (`repository.ErrLocationNotFound`, `repository.ErrLocationCodeConflict`)

### 7. Frontend Hooks (Current State -- Old Pattern)

All four hooks currently use `useApiQuery`/`useApiMutation` from `@/hooks`, which call the Go REST API directly.

**File**: `apps/web/src/hooks/api/use-holidays.ts` (143 lines)
- `useHolidays({ year, from, to, departmentId, enabled })` -- GET `/holidays`
- `useHoliday(id, enabled)` -- GET `/holidays/{id}`
- `useCreateHoliday()` -- POST `/holidays`
- `useUpdateHoliday()` -- PATCH `/holidays/{id}`
- `useDeleteHoliday()` -- DELETE `/holidays/{id}`
- `useGenerateHolidays()` -- POST `/holidays/generate`
- `useCopyHolidays()` -- POST `/holidays/copy`

**File**: `apps/web/src/hooks/api/use-cost-centers.ts` (55 lines)
- `useCostCenters({ enabled })`, `useCostCenter(id, enabled)`, `useCreateCostCenter()`, `useUpdateCostCenter()`, `useDeleteCostCenter()`

**File**: `apps/web/src/hooks/api/use-employment-types.ts` (55 lines)
- Same pattern as cost centers

**File**: `apps/web/src/hooks/api/use-locations.ts` (55 lines)
- Same pattern as cost centers

### 8. Frontend Hooks (New Pattern -- tRPC Migrated)

The migrated pattern is visible in `use-departments.ts` and `use-users.ts`:

**File**: `apps/web/src/hooks/api/use-departments.ts` (141 lines)

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Query hook
export function useDepartments(options = {}) {
  const trpc = useTRPC()
  return useQuery(
    trpc.departments.list.queryOptions(
      { isActive: active, parentId },
      { enabled }
    )
  )
}

// Mutation hook with invalidation
export function useCreateDepartment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.departments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.departments.list.queryKey(),
      })
    },
  })
}
```

**File**: `apps/web/src/hooks/api/use-users.ts` (58 lines)

Same pattern. The key imports are `useTRPC` from `@/trpc` and `useQuery`/`useMutation`/`useQueryClient` from `@tanstack/react-query`.

**Key differences from old pattern:**
- Old: `useApiQuery('/holidays', { params: {...} })` and `useApiMutation('/holidays', 'post', { invalidateKeys: [['/holidays']] })`
- New: `useQuery(trpc.holidays.list.queryOptions({...}))` and `useMutation({ ...trpc.holidays.create.mutationOptions(), onSuccess: () => queryClient.invalidateQueries(...) })`

### 9. Test Patterns

**Test helper file**: `apps/web/src/server/__tests__/helpers.ts` (171 lines)

Provides shared mock factories:
- `createMockUser(overrides)` -- creates a `ContextUser` with all fields
- `createMockSession()` -- creates a Supabase `Session`
- `createMockContext(overrides)` -- creates a `TRPCContext` with prisma, authToken, user, session, tenantId
- `createMockUserGroup(overrides)` -- creates a `UserGroup`
- `createAdminUser(overrides)` -- user with admin group
- `createUserWithPermissions(permissionIds, overrides)` -- user with specific permissions
- `createMockTenant(overrides)`, `createMockUserTenant(userId, tenantId)`

**Test file pattern** (`apps/web/src/server/__tests__/departments-router.test.ts`, 595 lines):

```typescript
import { createCallerFactory } from "../trpc"
import { departmentsRouter } from "../routers/departments"
import { permissionIdByKey } from "../lib/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!
const createCaller = createCallerFactory(departmentsRouter)

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ...,
    authToken: "test-token",
    user: createUserWithPermissions([DEPARTMENTS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// Test pattern for queries
describe("departments.list", () => {
  it("returns departments for tenant", async () => {
    const mockPrisma = {
      department: {
        findMany: vi.fn().mockResolvedValue(depts),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
  })
})

// Test pattern for mutations
describe("departments.create", () => {
  it("creates department successfully", async () => {
    const mockPrisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(null), // no existing
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "ENG", name: "Engineering" })
    expect(result.code).toBe("ENG")
  })
})
```

**Test categories observed:**
- List: returns data, filters correctly, returns empty array
- GetById: found, NOT_FOUND
- Create: success, trim validation, duplicate rejection (CONFLICT), parent validation
- Update: success, empty field rejection (BAD_REQUEST), duplicate rejection, NOT_FOUND
- Delete: success, NOT_FOUND, constraint violations (children/employees)

**Teams router test** (`apps/web/src/server/__tests__/teams-router.test.ts`, 722 lines):
Follows the same pattern with `makeTeam()` and `makeMember()` factories.

## Code References

- `apps/web/src/server/trpc.ts` -- tRPC initialization, context, procedure types
- `apps/web/src/server/middleware/authorization.ts` -- requirePermission, requireSelfOrPermission, requireEmployeePermission
- `apps/web/src/server/lib/permission-catalog.ts` -- 46 permissions, holidays.manage (line 112), locations.manage (line 207)
- `apps/web/src/server/root.ts` -- root router registration (8 routers currently)
- `apps/web/src/server/routers/departments.ts` -- reference CRUD router pattern (542 lines)
- `apps/web/src/server/routers/teams.ts` -- reference CRUD+members router pattern (763 lines)
- `apps/web/src/server/routers/users.ts` -- reference CRUD router with self-access (625 lines)
- `apps/web/prisma/schema.prisma:177` -- CostCenter model
- `apps/web/prisma/schema.prisma:204` -- Location model
- `apps/web/prisma/schema.prisma:238` -- EmploymentType model
- `apps/web/prisma/schema.prisma:271` -- Holiday model
- `apps/api/internal/service/holiday.go` -- Holiday CRUD + Generate + Copy (454 lines)
- `apps/api/internal/holiday/calendar.go` -- Easter algorithm + German state holidays (167 lines)
- `apps/api/internal/service/costcenter.go` -- CostCenter CRUD (167 lines)
- `apps/api/internal/service/employmenttype.go` -- EmploymentType CRUD (177 lines)
- `apps/api/internal/service/location.go` -- Location CRUD (157 lines)
- `apps/web/src/hooks/api/use-holidays.ts` -- Current holiday hooks (old pattern, 143 lines)
- `apps/web/src/hooks/api/use-cost-centers.ts` -- Current cost center hooks (old pattern, 55 lines)
- `apps/web/src/hooks/api/use-employment-types.ts` -- Current employment type hooks (old pattern, 55 lines)
- `apps/web/src/hooks/api/use-locations.ts` -- Current location hooks (old pattern, 55 lines)
- `apps/web/src/hooks/api/use-departments.ts` -- Reference migrated hooks (tRPC pattern, 141 lines)
- `apps/web/src/hooks/api/use-users.ts` -- Reference migrated hooks (tRPC pattern, 58 lines)
- `apps/web/src/server/__tests__/helpers.ts` -- Shared test utilities (171 lines)
- `apps/web/src/server/__tests__/departments-router.test.ts` -- Reference test pattern (595 lines)
- `apps/web/src/server/__tests__/teams-router.test.ts` -- Reference test pattern (722 lines)

## Architecture Documentation

### tRPC Router Pattern

Every tRPC router in the codebase follows this structure:

1. **File header**: JSDoc comment listing replaced Go endpoints
2. **Imports**: `z` from zod, `TRPCError` from `@trpc/server`, `createTRPCRouter`/`tenantProcedure` from `../trpc`, `requirePermission` from `../middleware/authorization`, `permissionIdByKey` from `../lib/permission-catalog`
3. **Permission constant**: `const X_MANAGE = permissionIdByKey("x.manage")!`
4. **Output schemas**: Zod objects matching Prisma model fields
5. **Input schemas**: Separate create and update Zod objects
6. **Mapper function**: `mapXToOutput(prismaRecord)` that converts Prisma result to output shape
7. **Router**: `export const xRouter = createTRPCRouter({...})`

### Procedure Chain Pattern

Every procedure follows: `tenantProcedure.use(requirePermission(PERM)).input(schema).output(schema).query/mutation(handler)`

### Frontend Hook Pattern (tRPC)

Query hooks: `useTRPC()` -> `useQuery(trpc.x.y.queryOptions(input, { enabled }))`
Mutation hooks: `useTRPC()` + `useQueryClient()` -> `useMutation({ ...trpc.x.y.mutationOptions(), onSuccess: () => queryClient.invalidateQueries({queryKey: trpc.x.list.queryKey()}) })`

### Test Pattern

1. Create caller factory from router: `createCallerFactory(xRouter)`
2. Create mock Prisma with `vi.fn()` methods
3. Create test context via `createMockContext()` with permissions
4. Call procedures via `caller.procedureName(input)`
5. Assert results and verify Prisma calls

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-01-29-ZMI-TICKET-002-holiday-management.md` -- Earlier research on holiday management
- `thoughts/shared/research/2026-02-04-ZMI-TICKET-050-cost-center-employment-type-crud-ui.md` -- Frontend CRUD UI for cost centers and employment types
- `thoughts/shared/research/2026-02-04-ZMI-TICKET-054-location-management-ui.md` -- Frontend location management UI
- `thoughts/shared/research/2026-01-26-NOK-231-holiday-management.md` -- Holiday management research
- `thoughts/shared/research/2026-03-03-ZMI-TICKET-211-departments-teams.md` -- Related departments/teams tRPC migration (predecessor ticket)
- `thoughts/shared/research/2026-03-02-ZMI-TICKET-201-trpc-server-setup.md` -- tRPC server setup research
- `thoughts/shared/research/2026-03-03-ZMI-TICKET-204-prisma-schema-org-tabellen.md` -- Prisma schema for org tables (includes these models)
- `thoughts/shared/tickets/ZMI-TICKET-212-holidays-costcenters-employmenttypes-locations.md` -- The ticket itself

## Related Research

- `thoughts/shared/research/2026-03-03-ZMI-TICKET-211-departments-teams.md` -- Direct predecessor, departments + teams tRPC routers
- `thoughts/shared/research/2026-03-02-ZMI-TICKET-201-trpc-server-setup.md` -- tRPC infrastructure setup

## Open Questions

1. **Missing permissions**: `cost_centers.manage` and `employment_types.manage` are not in the permission catalog. Should they be added, or should existing permissions (e.g., `settings.manage`) be reused?
2. **Holiday recalc in tRPC**: The Go holiday service triggers recalculation services after create/update/delete. The tRPC version may need to decide whether to port this behavior or defer it (the ticket says "Holiday-Referenzierung in Tagesberechnung" is out of scope per TICKET-234).
3. **EmploymentType tenantId nullable**: The Prisma model has `tenantId` as nullable (`String?`), unlike CostCenter and Holiday. The router needs to handle this -- should `tenantProcedure` still scope by tenant, or should null-tenant employment types be globally visible?
4. **EmploymentType unique constraint**: Unlike CostCenter and Location, EmploymentType has no `@@unique([tenantId, code])` in Prisma. The Go service enforces uniqueness via queries, and the tRPC router should do the same.
