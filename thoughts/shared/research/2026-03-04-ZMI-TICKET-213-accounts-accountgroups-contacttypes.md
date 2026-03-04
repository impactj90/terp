# Research: ZMI-TICKET-213 -- Accounts, Account Groups, Contact Types, Contact Kinds tRPC Routers

## 1. Existing Go Implementation

### 1.1 Account Service

**File:** `/home/user/terp/apps/api/internal/service/account.go`

**Error constants (lines 13-22):**
- `ErrAccountNotFound`
- `ErrAccountCodeRequired`
- `ErrAccountNameRequired`
- `ErrAccountTypeRequired`
- `ErrAccountCodeExists`
- `ErrCannotDeleteSystem`
- `ErrCannotModifySystemCode`
- `ErrCannotModifySystemAccount`

**Repository interface (lines 26-37):**
- `Create(ctx, *model.Account) error`
- `GetByID(ctx, uuid.UUID) (*model.Account, error)`
- `GetByCode(ctx, *uuid.UUID, string) (*model.Account, error)` -- tenantID is pointer (nil = system accounts)
- `Update(ctx, *model.Account) error`
- `Delete(ctx, uuid.UUID) error`
- `List(ctx, uuid.UUID) ([]model.Account, error)` -- excludes system
- `ListWithSystem(ctx, uuid.UUID) ([]model.Account, error)`
- `GetSystemAccounts(ctx) ([]model.Account, error)`
- `ListActive(ctx, uuid.UUID) ([]model.Account, error)`
- `ListFiltered(ctx, uuid.UUID, includeSystem bool, active *bool, accountType *model.AccountType, payrollRelevant *bool) ([]model.Account, error)`
- `ListDayPlansUsingAccount(ctx, uuid.UUID, uuid.UUID) ([]model.AccountUsageDayPlan, error)`

**CreateAccountInput (lines 48-63):** TenantID, Code, Name, AccountType, Unit, DisplayFormat, BonusFactor (*float64), AccountGroupID (*uuid.UUID), Description (*string), IsPayrollRelevant (bool), PayrollCode (*string), SortOrder (int), YearCarryover (*bool), IsActive (bool).

**Create logic (lines 66-123):**
- Trims and validates Code (required), Name (required), AccountType (required)
- Defaults Unit to `minutes`, DisplayFormat to `decimal`, YearCarryover to `true`
- Checks code uniqueness within tenant via `GetByCode`
- Sets `IsSystem: false` always
- Calls `accountRepo.Create`

**UpdateAccountInput (lines 144-156):** All fields are pointers (optional partial update): Name, Description, Unit, DisplayFormat, BonusFactor, AccountGroupID, YearCarryover, IsPayrollRelevant, PayrollCode, SortOrder, IsActive.

**Update logic (lines 159-211):**
- Fetches existing by ID; returns `ErrAccountNotFound` if missing
- Returns `ErrCannotModifySystemAccount` if `account.IsSystem` is true
- Applies each non-nil field; validates Name is non-empty after trim
- Calls `accountRepo.Update`

**Delete logic (lines 214-226):**
- Fetches by ID; returns `ErrAccountNotFound` if missing
- Returns `ErrCannotDeleteSystem` if `account.IsSystem` is true
- Calls `accountRepo.Delete`

**List operations:**
- `List` (line 229): excludes system, by tenant
- `ListWithSystem` (line 234): includes system, by tenant
- `GetSystemAccounts` (line 239): system accounts only
- `ListActive` (line 244): active only, by tenant
- `ListFiltered` (line 249): with optional filters (includeSystem, active, accountType, payrollRelevant)
- `GetUsage` (line 254): returns day plans referencing the account

### 1.2 Account Handler

**File:** `/home/user/terp/apps/api/internal/handler/account.go`

**Endpoints:**
- `List` (line 31): reads query params `include_system`, `active_only`, `active`, `account_type`, `payroll_relevant`. Calls `ListFiltered`.
- `Get` (line 83): by URL param `id`
- `Create` (line 100): decodes `models.CreateAccountRequest`, validates, maps to `CreateAccountInput`
- `Update` (line 198): decodes `models.UpdateAccountRequest`, validates, maps to `UpdateAccountInput`
- `Delete` (line 268): by URL param `id`, returns 204
- `Usage` (line 292): by URL param `id`, returns `AccountUsageResponse{AccountID, UsageCount, DayPlans}`

**AccountUsageResponse (lines 22-26):** `AccountID uuid.UUID`, `UsageCount int`, `DayPlans []model.AccountUsageDayPlan`.

**parseAccountType helper (lines 320-331):** maps "bonus" -> AccountTypeBonus, "day" -> AccountTypeDay, "month" -> AccountTypeMonth.

### 1.3 Account Repository

**File:** `/home/user/terp/apps/api/internal/repository/account.go`

Key operations:
- `Create` (line 30): explicit column select for insert
- `GetByID` (line 37): `First(&account, "id = ?", id)`
- `GetByCode` (line 53): filters by code + tenantID (nil = system)
- `Upsert` (line 73): ON CONFLICT (tenant_id, code)
- `List` (line 114): `WHERE tenant_id = ?` ORDER BY `code ASC`
- `ListWithSystem` (line 128): `WHERE tenant_id = ? OR tenant_id IS NULL` ORDER BY `is_system DESC, code ASC`
- `ListFiltered` (line 171): Complex query joining `day_plan_bonuses` and `day_plans` to compute `usage_count`. Orders by `is_system DESC, sort_order ASC, code ASC`.
- `ListDayPlansUsingAccount` (line 214): Raw SQL querying day_plans where account is referenced via bonuses, net_account_id, or cap_account_id.

### 1.4 Account Group Service

**File:** `/home/user/terp/apps/api/internal/service/accountgroup.go`

**Error constants (lines 13-18):**
- `ErrAccountGroupNotFound`
- `ErrAccountGroupCodeRequired`
- `ErrAccountGroupNameRequired`
- `ErrAccountGroupCodeExists`

**Repository interface (lines 20-27):** Create, GetByID, GetByCode, List, Update, Delete.

**CreateAccountGroupInput (lines 49-55):** TenantID, Code, Name, Description (string -- empty = nil), SortOrder (int).

**Create logic (lines 57-90):**
- Trims and validates Code (required), Name (required)
- Checks code uniqueness within tenant
- Sets `IsActive: true` by default
- Description: trims, converts empty to nil pointer

**UpdateAccountGroupInput (lines 92-98):** All pointers: Code, Name, Description, SortOrder, IsActive.

**Update logic (lines 100-143):**
- Fetches by ID
- If Code updated: validates non-empty, checks uniqueness (excluding self)
- If Name updated: validates non-empty
- If Description updated: trims, empty -> nil
- Applies SortOrder, IsActive if provided

**Delete logic (lines 145-151):** Fetches by ID, then deletes. No referential integrity check in service (DB FK handles it).

### 1.5 Account Group Handler

**File:** `/home/user/terp/apps/api/internal/handler/accountgroup.go`

Endpoints: List, Get, Create, Update, Delete. Uses `models.CreateAccountGroupRequest` and `models.UpdateAccountGroupRequest` from generated models. Maps to/from `models.AccountGroup` response type using `accountGroupToResponse` helper.

### 1.6 Account Group Repository

**File:** `/home/user/terp/apps/api/internal/repository/accountgroup.go`

- List: `WHERE tenant_id = ?` ORDER BY `sort_order ASC, code ASC`
- GetByCode: `WHERE tenant_id = ? AND code = ?`

### 1.7 Contact Type Service

**File:** `/home/user/terp/apps/api/internal/service/contacttype.go`

**Valid data types (line 14-19):** `text`, `email`, `phone`, `url`.

**Error constants (lines 21-29):**
- `ErrContactTypeNotFound`
- `ErrContactTypeCodeRequired`
- `ErrContactTypeNameRequired`
- `ErrContactTypeCodeExists`
- `ErrContactTypeInvalidData`
- `ErrContactTypeInUse` -- cannot delete when contact kinds reference it
- `ErrContactTypeDataTypeReq`

**Repository interface (lines 32-41):** Create, GetByID, GetByCode, List, ListActive, Update, Delete, HasKinds.

**CreateContactTypeInput (lines 52-59):** TenantID, Code, Name, DataType, Description (string), SortOrder (*int).

**Create logic (lines 62-101):**
- Trims and validates Code, Name, DataType (required; must be in valid set)
- Checks code uniqueness within tenant
- Sets `IsActive: true` by default
- Applies SortOrder if provided

**UpdateContactTypeInput (lines 113-118):** Name (*string), Description (*string), IsActive (*bool), SortOrder (*int). **Note:** Code and DataType cannot be changed.

**Delete logic (lines 151-166):**
- Fetches by ID
- Calls `repo.HasKinds` -- if true, returns `ErrContactTypeInUse`
- Then deletes

**List operations:** `List` (all for tenant), `ListActive` (active only).

### 1.8 Contact Type Handler

**File:** `/home/user/terp/apps/api/internal/handler/contacttype.go`

Endpoints: List (with `active` query param filter), Get, Create, Update, Delete. Uses generated models. Maps using `contactTypeToResponse` and `contactTypeListToResponse` helpers.

### 1.9 Contact Type Repository

**File:** `/home/user/terp/apps/api/internal/repository/contacttype.go`

- List: `WHERE tenant_id = ?` ORDER BY `sort_order ASC, code ASC`
- ListActive: `WHERE tenant_id = ? AND is_active = true` ORDER BY `sort_order ASC, code ASC`
- HasKinds: `COUNT(*)` on contact_kinds where `contact_type_id = ?`

### 1.10 Contact Kind Service

**File:** `/home/user/terp/apps/api/internal/service/contactkind.go`

**Error constants (lines 13-20):**
- `ErrContactKindNotFound`
- `ErrContactKindCodeRequired`
- `ErrContactKindLabelReq`
- `ErrContactKindCodeExists`
- `ErrContactKindTypeIDReq`
- `ErrContactKindTypeNotFound`

**Dependencies:** Takes both `contactKindRepository` and `contactTypeRepository` (to verify type existence).

**CreateContactKindInput (lines 44-50):** TenantID, ContactTypeID, Code, Label, SortOrder (*int).

**Create logic (lines 53-93):**
- Trims and validates Code, Label (required), ContactTypeID (non-nil)
- Verifies contact type exists via `typeRepo.GetByID`
- Checks code uniqueness within tenant
- Sets `IsActive: true` by default

**UpdateContactKindInput (lines 105-109):** Label (*string), IsActive (*bool), SortOrder (*int). **Note:** Code and ContactTypeID cannot be changed.

**Delete logic (lines 139-145):** Fetches by ID, then deletes. No additional checks.

**List operations:** `List` (all for tenant), `ListByContactType` (filtered by contact_type_id), `ListActive` (active only).

### 1.11 Contact Kind Handler

**File:** `/home/user/terp/apps/api/internal/handler/contactkind.go`

Endpoints: List (with `contact_type_id` and `active` query param filters), Get, Create, Update, Delete. Uses generated models.

### 1.12 Contact Kind Repository

**File:** `/home/user/terp/apps/api/internal/repository/contactkind.go`

- List: `WHERE tenant_id = ?` ORDER BY `sort_order ASC, code ASC`
- ListByContactType: `WHERE tenant_id = ? AND contact_type_id = ?` ORDER BY `sort_order ASC, code ASC`
- ListActive: `WHERE tenant_id = ? AND is_active = true` ORDER BY `sort_order ASC, code ASC`

---

## 2. Go Domain Models

### 2.1 Account Model

**File:** `/home/user/terp/apps/api/internal/model/account.go`

```go
type AccountType string  // "bonus", "day", "month"
type DisplayFormat string  // "decimal", "hh_mm"
type AccountUnit string  // "minutes", "hours", "days"

type Account struct {
    ID, TenantID (*uuid), Code, Name, Description (*string),
    AccountType, Unit, DisplayFormat, BonusFactor (*float64),
    AccountGroupID (*uuid), YearCarryover (bool), IsPayrollRelevant (bool),
    PayrollCode (*string), SortOrder (int), UsageCount (int, gorm:"-"),
    IsSystem (bool), IsActive (bool), CreatedAt, UpdatedAt
}

type AccountUsageDayPlan struct {
    ID uuid.UUID, Code string, Name string
}
```

Table: `accounts`

### 2.2 AccountGroup Model

**File:** `/home/user/terp/apps/api/internal/model/accountgroup.go`

```go
type AccountGroup struct {
    ID, TenantID (uuid), Code, Name, Description (*string),
    SortOrder (int), IsActive (bool), CreatedAt, UpdatedAt
}
```

Table: `account_groups`

### 2.3 ContactType and ContactKind Models

**File:** `/home/user/terp/apps/api/internal/model/contacttype.go`

```go
type ContactType struct {
    ID, TenantID (uuid), Code, Name, DataType (string),
    Description (string -- not pointer), IsActive (bool),
    SortOrder (int), CreatedAt, UpdatedAt
}

type ContactKind struct {
    ID, TenantID (uuid), ContactTypeID (uuid), Code, Label (string),
    IsActive (bool), SortOrder (int), CreatedAt, UpdatedAt,
    ContactType *ContactType (gorm relation)
}
```

Tables: `contact_types`, `contact_kinds`

---

## 3. Database Schema

### 3.1 Prisma Schema

**File:** `/home/user/terp/apps/web/prisma/schema.prisma`

**AccountGroup model (lines 300-319):**
```prisma
model AccountGroup {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  sortOrder   Int      @default(0) @map("sort_order") @db.Integer
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  // Relations: tenant, accounts
  @@unique([tenantId, code])
  @@map("account_groups")
}
```

**Account model (lines 333-362):**
```prisma
model Account {
  id                String    @id @db.Uuid
  tenantId          String?   @map("tenant_id") @db.Uuid  // nullable for system accounts
  code              String    @db.VarChar(50)
  name              String    @db.VarChar(255)
  accountType       String    @map("account_type") @db.VarChar(20)
  unit              String    @default("minutes") @db.VarChar(20)
  isSystem          Boolean   @default(false) @map("is_system")
  isActive          Boolean   @default(true) @map("is_active")
  description       String?   @db.Text
  isPayrollRelevant Boolean   @default(false) @map("is_payroll_relevant")
  payrollCode       String?   @map("payroll_code") @db.VarChar(50)
  sortOrder         Int       @default(0) @map("sort_order") @db.Integer
  yearCarryover     Boolean   @default(true) @map("year_carryover")
  accountGroupId    String?   @map("account_group_id") @db.Uuid
  displayFormat     String    @default("decimal") @map("display_format") @db.VarChar(20)
  bonusFactor       Decimal?  @map("bonus_factor") @db.Decimal(5, 2)
  createdAt         DateTime  @db.Timestamptz(6)
  updatedAt         DateTime  @updatedAt @db.Timestamptz(6)
  // Relations: tenant (nullable), accountGroup (nullable)
  @@unique([tenantId, code])
  @@map("accounts")
}
```

**ContactType and ContactKind models:** NOT YET IN PRISMA SCHEMA. The schema file has a comment on EmployeeContact (line 594-595): "ContactKind model not yet in Prisma. Relation will be added when it is."

### 3.2 SQL Migrations

**Migration 000043 (`account_groups_and_fields`):**
- File: `/home/user/terp/db/migrations/000043_account_groups_and_fields.up.sql`
- Creates `account_groups` table with unique(tenant_id, code)
- Adds `account_group_id`, `display_format`, `bonus_factor` to `accounts`
- Migrates account_type values: "tracking" -> "day", "balance" -> "month"

**Migration 000068 (`create_contact_types`):**
- File: `/home/user/terp/db/migrations/000068_create_contact_types.up.sql`
- Creates `contact_types` table: id, tenant_id, code, name, data_type (default 'text'), description, is_active, sort_order, created_at, updated_at. Unique(tenant_id, code).
- Creates `contact_kinds` table: id, tenant_id, contact_type_id (FK -> contact_types ON DELETE CASCADE), code, label, is_active, sort_order, created_at, updated_at. Unique(tenant_id, code).
- Indexes on tenant, contact_type_id, tenant+is_active for both tables.

**Migration 000069 (`alter_employee_contacts_add_kind`):**
- File: `/home/user/terp/db/migrations/000069_alter_employee_contacts_add_kind.up.sql`
- Adds `contact_kind_id` column to `employee_contacts`.

### 3.3 Prisma Models Needed

ContactType and ContactKind models must be added to the Prisma schema before tRPC routers can use them. These tables already exist in the database (migration 000068). The models should follow the existing patterns.

---

## 4. Existing tRPC Patterns

### 4.1 tRPC Server Initialization

**File:** `/home/user/terp/apps/web/src/server/trpc.ts`

Exports:
- `createTRPCRouter` -- router factory
- `createCallerFactory` -- for test callers
- `createMiddleware` -- for custom middleware
- `publicProcedure` -- no auth
- `protectedProcedure` -- requires Supabase session + user
- `tenantProcedure` -- extends protectedProcedure, requires `X-Tenant-ID` header, validates user has access to tenant via `userTenants`

**Context type (`TRPCContext`):** `{ prisma, authToken, user, session, tenantId }`

### 4.2 Authorization Middleware

**File:** `/home/user/terp/apps/web/src/server/middleware/authorization.ts`

- `requirePermission(...permissionIds: string[])` -- checks user has ANY of the specified permissions (OR logic)
- `requireSelfOrPermission(userIdGetter, permissionId)` -- self-access or permission
- `requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)` -- own vs all pattern
- `applyDataScope()` -- adds DataScope to context

### 4.3 Permission Catalog

**File:** `/home/user/terp/apps/web/src/server/lib/permission-catalog.ts`

Relevant permissions:
- `accounts.manage` (line 113): "Manage accounts" -- UUID generated from key via uuidv5
- `contact_management.manage` (line 171): "Manage contact types and contact kinds" -- single permission for both contact types and contact kinds

There is NO separate permission for account_groups. Based on the Go backend, account groups are managed under the `accounts.manage` permission.

### 4.4 Router Registration

**File:** `/home/user/terp/apps/web/src/server/root.ts`

Routers are imported and merged into `appRouter` via `createTRPCRouter({...})`. Current routers: health, auth, permissions, tenants, users, userGroups, departments, teams, costCenters, employmentTypes, locations, holidays.

New routers will need to be added here as: `accounts`, `accountGroups`, `contactTypes`, `contactKinds`.

### 4.5 Reference Router: Cost Centers

**File:** `/home/user/terp/apps/web/src/server/routers/costCenters.ts`

This is the best reference for the pattern. Key structure:

1. **Permission constant:** `const COST_CENTERS_MANAGE = permissionIdByKey("cost_centers.manage")!`
2. **Output schema:** Zod object with all fields
3. **Input schemas:** Separate create/update schemas
4. **Helper function:** `mapCostCenterToOutput` maps Prisma record to output shape
5. **Router procedures:**
   - `list`: `tenantProcedure.use(requirePermission(...)).input(z.object({...}).optional()).output(z.object({ data: z.array(...) })).query(async ...)`
   - `getById`: `.input(z.object({ id: z.string().uuid() })).output(outputSchema).query(...)`
   - `create`: `.input(createSchema).output(outputSchema).mutation(...)` -- trims, validates, checks uniqueness, creates
   - `update`: `.input(updateSchema).output(outputSchema).mutation(...)` -- partial update, validates, checks uniqueness
   - `delete`: `.input(z.object({ id: z.string().uuid() })).output(z.object({ success: z.boolean() })).mutation(...)` -- checks existence, checks references, deletes

All procedures use `tenantProcedure` and `requirePermission`.

### 4.6 tRPC Client Setup

**File:** `/home/user/terp/apps/web/src/trpc/index.ts`

Exports `useTRPC`, `useTRPCClient`, `TRPCProvider`, `TRPCReactProvider`.

### 4.7 Server Index Exports

**File:** `/home/user/terp/apps/web/src/server/index.ts`

Barrel exports from `root.ts`, `trpc.ts`, and `middleware/authorization.ts`.

---

## 5. Frontend Hooks

### 5.1 Current (fetch-based) Hooks

These hooks use `useApiQuery` and `useApiMutation` from `@/hooks` which use openapi-fetch under the hood with `@tanstack/react-query`.

**Accounts (`/home/user/terp/apps/web/src/hooks/api/use-accounts.ts`):**
- `useAccounts(options?)` -- query `/accounts` with params: accountType, active, includeSystem
- `useAccount(id, enabled?)` -- query `/accounts/{id}`
- `useAccountUsage(id, enabled?)` -- query `/accounts/{id}/usage`
- `useCreateAccount()` -- POST `/accounts`, invalidates `['/accounts']`
- `useUpdateAccount()` -- PATCH `/accounts/{id}`, invalidates accounts + usage
- `useDeleteAccount()` -- DELETE `/accounts/{id}`, invalidates accounts + usage

**Account Groups (`/home/user/terp/apps/web/src/hooks/api/use-account-groups.ts`):**
- `useAccountGroups(options?)` -- query `/account-groups`
- `useAccountGroup(id, enabled?)` -- query `/account-groups/{id}`
- `useCreateAccountGroup()` -- POST
- `useUpdateAccountGroup()` -- PATCH
- `useDeleteAccountGroup()` -- DELETE

**Contact Types (`/home/user/terp/apps/web/src/hooks/api/use-contact-types.ts`):**
- `useContactTypes(options?)` -- query `/contact-types` with params: active
- `useContactType(id, enabled?)` -- query `/contact-types/{id}`
- `useCreateContactType()` -- POST
- `useUpdateContactType()` -- PATCH
- `useDeleteContactType()` -- DELETE

**Contact Kinds (`/home/user/terp/apps/web/src/hooks/api/use-contact-kinds.ts`):**
- `useContactKinds(options?)` -- query `/contact-kinds` with params: contactTypeId, active
- `useCreateContactKind()` -- POST
- `useUpdateContactKind()` -- PATCH
- `useDeleteContactKind()` -- DELETE

### 5.2 tRPC-Migrated Hook Pattern (Reference)

**Cost Centers (`/home/user/terp/apps/web/src/hooks/api/use-cost-centers.ts`):**

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useCostCenters(options = {}) {
  const { enabled = true, isActive } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.costCenters.list.queryOptions({ isActive }, { enabled })
  )
}

export function useCostCenter(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.costCenters.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateCostCenter() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.costCenters.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.costCenters.list.queryKey(),
      })
    },
  })
}
```

Pattern: uses `useTRPC()` hook, `trpc.<router>.<procedure>.queryOptions(input, options)` for queries, `trpc.<router>.<procedure>.mutationOptions()` for mutations. Cache invalidation via `queryClient.invalidateQueries` with `trpc.<router>.<procedure>.queryKey()`.

---

## 6. Test Patterns

### 6.1 Test Helpers

**File:** `/home/user/terp/apps/web/src/server/__tests__/helpers.ts`

Provides factory functions:
- `createMockUser(overrides)` -- returns `ContextUser` with defaults
- `createMockSession()` -- returns minimal Supabase `Session`
- `createMockContext(overrides)` -- returns `TRPCContext`
- `createMockUserGroup(overrides)` -- returns `UserGroup`
- `createAdminUser(overrides)` -- user with `isAdmin: true` group
- `createUserWithPermissions(permissionIds, overrides)` -- user with specific permissions
- `createMockTenant(overrides)` -- returns `Tenant`
- `createMockUserTenant(userId, tenantId, tenant?)` -- returns `UserTenant & { tenant }`

### 6.2 Test Structure (Cost Centers Reference)

**File:** `/home/user/terp/apps/web/src/server/__tests__/cost-centers-router.test.ts`

Uses vitest (`describe`, `it`, `expect`, `vi`).

**Pattern:**
1. Import `createCallerFactory` from `../trpc` and the router
2. Create a caller: `const createCaller = createCallerFactory(costCentersRouter)`
3. Create mock data factories (e.g., `makeCostCenter(overrides)`)
4. Create test context factory that builds a mock context with permission + tenant
5. Mock Prisma methods using `vi.fn().mockResolvedValue(...)` or `mockResolvedValueOnce`
6. Call procedures via `caller.list()`, `caller.create({...})`, etc.
7. Assert results and verify mock calls

**Test context setup:**
```typescript
function createTestContext(prisma) {
  return createMockContext({
    prisma,
    authToken: "test-token",
    user: createUserWithPermissions([COST_CENTERS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

### 6.3 Existing Test Files

All test files in `/home/user/terp/apps/web/src/server/__tests__/`:
- `authorization.test.ts`
- `cost-centers-router.test.ts`
- `departments-router.test.ts`
- `employee-types.test.ts`
- `employment-types-router.test.ts`
- `holiday-calendar.test.ts`
- `holidays-router.test.ts`
- `locations-router.test.ts`
- `permission-catalog.test.ts`
- `permission-helpers.test.ts`
- `permissions-router.test.ts`
- `procedures.test.ts`
- `teams-router.test.ts`
- `trpc.test.ts`

---

## 7. Key Implementation Details

### 7.1 Prisma Schema Gaps

**ContactType and ContactKind models are NOT in the Prisma schema.** They must be added before implementing tRPC routers. The SQL tables already exist (migration 000068). Models should be added following the existing patterns in the schema, with appropriate relations to Tenant and between ContactKind -> ContactType.

The EmployeeContact model (line 579-601 in schema.prisma) has a `contactKindId` field but no Prisma relation to ContactKind yet (noted in comment at line 594-595).

### 7.2 Account tenantId is Nullable

The Account model has `tenantId: String?` (nullable) because system accounts (FLEX, OT, VAC) have no tenant. This is important for list queries -- `ListFiltered` and `ListWithSystem` use `OR tenant_id IS NULL` logic.

### 7.3 Account UsageCount

The Go `Account` model has a `UsageCount int` field with `gorm:"-"` (computed, not stored). The `ListFiltered` repository method computes this via a complex JOIN query against `day_plan_bonuses` and `day_plans`. The `day_plan_bonuses` and `day_plans` tables are NOT yet in the Prisma schema.

For the tRPC implementation, the usage count computation may need to use Prisma raw SQL (`prisma.$queryRaw`) or the `GetUsage` endpoint can return a simpler response if `day_plans`/`day_plan_bonuses` tables are not yet modeled in Prisma.

### 7.4 Permissions

- **Accounts + Account Groups:** Use `accounts.manage` permission (permission key from catalog)
- **Contact Types + Contact Kinds:** Use `contact_management.manage` permission (permission key from catalog)

### 7.5 Account Type Values

DB CHECK constraint: `account_type IN ('bonus', 'day', 'month')`. The Go handler maps these same string values. Unit values: `'minutes', 'hours', 'days'`. Display format: `'decimal', 'hh_mm'`.

### 7.6 ContactType DataType Values

Valid values: `text`, `email`, `phone`, `url`. Enforced at service level in Go (not DB CHECK).
