# Implementation Plan: ZMI-TICKET-213 -- Accounts, Account Groups, Contact Types, Contact Kinds tRPC Routers

## Overview

Migrate four Go backend CRUD routers to tRPC:
1. **Account Groups** -- Simple CRUD with code uniqueness (uses `accounts.manage` permission)
2. **Contact Types** -- CRUD with data type validation and "in use" delete guard (uses `contact_management.manage` permission)
3. **Contact Kinds** -- CRUD with FK to contact type, code uniqueness (uses `contact_management.manage` permission)
4. **Accounts** -- Complex CRUD with system accounts, nullable tenantId, usage query via raw SQL (uses `accounts.manage` permission)

Additionally: add missing Prisma models (ContactType, ContactKind), migrate frontend hooks from openapi-fetch to tRPC, and write tests.

---

## Phase 1: Prisma Schema -- Add ContactType and ContactKind Models

The `contact_types` and `contact_kinds` tables already exist in the database (migration 000068) but are not yet modeled in Prisma. These must be added before the tRPC routers can query them.

### Files to Modify

**`/home/user/terp/apps/web/prisma/schema.prisma`**

Add two new models after the Account model block (around line 362), before the Department model. Follow the existing conventions (see AccountGroup at line 300 for reference).

#### ContactType Model

```prisma
// -----------------------------------------------------------------------------
// ContactType
// -----------------------------------------------------------------------------
// Migration: 000068
//
// Trigger: update_contact_types_updated_at BEFORE UPDATE
//
// Valid data_type values (enforced at application level):
//   text, email, phone, url
model ContactType {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  dataType    String   @default("text") @map("data_type") @db.VarChar(20)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  sortOrder   Int      @default(0) @map("sort_order") @db.Integer
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contactKinds ContactKind[]

  // Indexes
  @@unique([tenantId, code], map: "contact_types_tenant_id_code_key")
  @@index([tenantId], map: "idx_contact_types_tenant")
  @@index([tenantId, isActive], map: "idx_contact_types_tenant_active")
  @@map("contact_types")
}
```

#### ContactKind Model

```prisma
// -----------------------------------------------------------------------------
// ContactKind
// -----------------------------------------------------------------------------
// Migration: 000068
//
// Trigger: update_contact_kinds_updated_at BEFORE UPDATE
model ContactKind {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  contactTypeId String   @map("contact_type_id") @db.Uuid
  code          String   @db.VarChar(50)
  label         String   @db.VarChar(255)
  isActive      Boolean  @default(true) @map("is_active")
  sortOrder     Int      @default(0) @map("sort_order") @db.Integer
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contactType ContactType @relation(fields: [contactTypeId], references: [id], onDelete: Cascade)
  employeeContacts EmployeeContact[]

  // Indexes
  @@unique([tenantId, code], map: "contact_kinds_tenant_id_code_key")
  @@index([tenantId], map: "idx_contact_kinds_tenant")
  @@index([contactTypeId], map: "idx_contact_kinds_type")
  @@index([tenantId, isActive], map: "idx_contact_kinds_tenant_active")
  @@map("contact_kinds")
}
```

#### Additional Changes to Existing Models

1. **Tenant model** -- Add relation arrays:
   - `contactTypes ContactType[]`
   - `contactKinds ContactKind[]`

2. **EmployeeContact model** (line 579-601) -- Add the relation that the comment says is pending:
   - Add: `contactKind ContactKind? @relation(fields: [contactKindId], references: [id], onDelete: SetNull)`
   - Remove the comment on lines 594-595

### Verification

```bash
cd /home/user/terp/apps/web && npx prisma validate
cd /home/user/terp/apps/web && npx prisma generate
```

---

## Phase 2: Account Groups tRPC Router

Simplest router. Direct analog to cost centers pattern.

### Files to Create

**`/home/user/terp/apps/web/src/server/routers/accountGroups.ts`**

Follow the exact pattern of `/home/user/terp/apps/web/src/server/routers/costCenters.ts`.

#### Permission Constant

```typescript
const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!
```

#### Output Schema

```typescript
const accountGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

#### Input Schemas

```typescript
const createAccountGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

const updateAccountGroupInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})
```

#### Procedures

1. **`list`**: `tenantProcedure.use(requirePermission(ACCOUNTS_MANAGE))`
   - Input: optional `{ isActive?: boolean }`
   - Output: `{ data: AccountGroupOutput[] }`
   - Prisma: `accountGroup.findMany({ where: { tenantId, ...isActive filter }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })`
   - Note: Go orders by `sort_order ASC, code ASC`

2. **`getById`**: Same pattern as costCenters
   - Prisma: `accountGroup.findFirst({ where: { id, tenantId } })`
   - Throw NOT_FOUND if null

3. **`create`**: Port from Go service (lines 57-90 of `accountgroup.go`)
   - Trim code and name; validate non-empty after trim
   - Check code uniqueness: `accountGroup.findFirst({ where: { tenantId, code } })`
   - Description: trim, convert empty string to null
   - Defaults: `isActive: true`, `sortOrder: input.sortOrder ?? 0`
   - Prisma: `accountGroup.create({ data: { tenantId, code, name, description, sortOrder, isActive } })`

4. **`update`**: Port from Go service (lines 100-143)
   - Verify exists with tenant scope
   - If code updated: trim, validate non-empty, check uniqueness (exclude self via `NOT: { id }`)
   - If name updated: trim, validate non-empty
   - If description updated: trim, empty -> null
   - Apply sortOrder, isActive if provided
   - Prisma: `accountGroup.update({ where: { id }, data })`

5. **`delete`**: Simple pattern
   - Verify exists with tenant scope
   - Check if accounts reference this group: `account.count({ where: { accountGroupId: id } })`
   - If count > 0, throw BAD_REQUEST "Cannot delete account group with assigned accounts"
   - Prisma: `accountGroup.delete({ where: { id } })`

### Files to Modify

**`/home/user/terp/apps/web/src/server/root.ts`**
- Add import: `import { accountGroupsRouter } from "./routers/accountGroups"`
- Add to router: `accountGroups: accountGroupsRouter,`

### Verification

- Run `npx vitest run` after adding tests in Phase 6
- Manually verify the router compiles: `cd apps/web && npx tsc --noEmit`

---

## Phase 3: Contact Types tRPC Router

### Files to Create

**`/home/user/terp/apps/web/src/server/routers/contactTypes.ts`**

#### Permission Constant

```typescript
const CONTACT_MANAGEMENT_MANAGE = permissionIdByKey("contact_management.manage")!
```

#### Constants

```typescript
const VALID_DATA_TYPES = ["text", "email", "phone", "url"] as const
```

#### Output Schema

```typescript
const contactTypeOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  dataType: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

#### Input Schemas

```typescript
const createContactTypeInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  dataType: z.enum(VALID_DATA_TYPES),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

const updateContactTypeInputSchema = z.object({
  id: z.string().uuid(),
  // Note: code and dataType CANNOT be changed (per Go service)
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
```

#### Procedures

1. **`list`**:
   - Input: optional `{ isActive?: boolean }`
   - Prisma: `contactType.findMany({ where: { tenantId, ...isActive filter }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })`

2. **`getById`**: Standard pattern

3. **`create`**: Port from Go service (lines 62-101 of `contacttype.go`)
   - Trim code, name; validate non-empty
   - Validate dataType is in VALID_DATA_TYPES (Zod enum handles this)
   - Check code uniqueness within tenant
   - Description: trim, empty -> null
   - Defaults: `isActive: true`, `sortOrder: input.sortOrder ?? 0`

4. **`update`**: Port from Go service (lines 120-149)
   - Verify exists
   - If name updated: trim, validate non-empty
   - If description updated: trim, empty -> null
   - Apply isActive, sortOrder if provided
   - **Important:** Code and dataType are immutable -- not in update input schema

5. **`delete`**: Port from Go service (lines 151-166)
   - Verify exists
   - Check if contact kinds reference this type: `contactKind.count({ where: { contactTypeId: id } })`
   - If count > 0, throw BAD_REQUEST "Cannot delete contact type that has contact kinds"
   - Delete

### Files to Modify

**`/home/user/terp/apps/web/src/server/root.ts`**
- Add import: `import { contactTypesRouter } from "./routers/contactTypes"`
- Add to router: `contactTypes: contactTypesRouter,`

---

## Phase 4: Contact Kinds tRPC Router

### Files to Create

**`/home/user/terp/apps/web/src/server/routers/contactKinds.ts`**

#### Permission Constant

```typescript
const CONTACT_MANAGEMENT_MANAGE = permissionIdByKey("contact_management.manage")!
```

#### Output Schema

```typescript
const contactKindOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  contactTypeId: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

#### Input Schemas

```typescript
const createContactKindInputSchema = z.object({
  contactTypeId: z.string().uuid(),
  code: z.string().min(1, "Code is required"),
  label: z.string().min(1, "Label is required"),
  sortOrder: z.number().int().optional(),
})

const updateContactKindInputSchema = z.object({
  id: z.string().uuid(),
  // Note: code and contactTypeId CANNOT be changed (per Go service)
  label: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
```

#### Procedures

1. **`list`**:
   - Input: optional `{ contactTypeId?: string, isActive?: boolean }`
   - Build where clause: `{ tenantId, ...contactTypeId filter, ...isActive filter }`
   - Prisma: `contactKind.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })`

2. **`getById`**: Standard pattern

3. **`create`**: Port from Go service (lines 53-93 of `contactkind.go`)
   - Trim code, label; validate non-empty
   - Verify contactTypeId exists: `contactType.findFirst({ where: { id: contactTypeId, tenantId } })`
   - If not found, throw BAD_REQUEST "Contact type not found"
   - Check code uniqueness within tenant
   - Defaults: `isActive: true`, `sortOrder: input.sortOrder ?? 0`

4. **`update`**: Port from Go service (lines 111-137)
   - Verify exists
   - If label updated: trim, validate non-empty
   - Apply isActive, sortOrder if provided
   - **Important:** Code and contactTypeId are immutable

5. **`delete`**: Simple pattern
   - Verify exists
   - No additional referential check in Go service (DB FK handles cascading to employee_contacts via SET NULL)
   - Delete

### Files to Modify

**`/home/user/terp/apps/web/src/server/root.ts`**
- Add import: `import { contactKindsRouter } from "./routers/contactKinds"`
- Add to router: `contactKinds: contactKindsRouter,`

---

## Phase 5: Accounts tRPC Router

Most complex router due to system accounts (nullable tenantId), usage count, and the usage query.

### Files to Create

**`/home/user/terp/apps/web/src/server/routers/accounts.ts`**

#### Permission Constant

```typescript
const ACCOUNTS_MANAGE = permissionIdByKey("accounts.manage")!
```

#### Output Schemas

```typescript
const accountOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  accountType: z.string(),
  unit: z.string(),
  displayFormat: z.string(),
  bonusFactor: z.number().nullable(),  // Decimal -> number conversion
  description: z.string().nullable(),
  accountGroupId: z.string().uuid().nullable(),
  isPayrollRelevant: z.boolean(),
  payrollCode: z.string().nullable(),
  sortOrder: z.number().int(),
  yearCarryover: z.boolean(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Extended output for list that includes usage count
const accountWithUsageOutputSchema = accountOutputSchema.extend({
  usageCount: z.number().int(),
})

const accountUsageOutputSchema = z.object({
  accountId: z.string().uuid(),
  usageCount: z.number().int(),
  dayPlans: z.array(z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  })),
})
```

#### Input Schemas

```typescript
const createAccountInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  accountType: z.enum(["bonus", "day", "month"]),
  unit: z.enum(["minutes", "hours", "days"]).optional(),
  displayFormat: z.enum(["decimal", "hh_mm"]).optional(),
  bonusFactor: z.number().optional(),
  accountGroupId: z.string().uuid().optional(),
  description: z.string().optional(),
  isPayrollRelevant: z.boolean().optional(),
  payrollCode: z.string().optional(),
  sortOrder: z.number().int().optional(),
  yearCarryover: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const updateAccountInputSchema = z.object({
  id: z.string().uuid(),
  // Note: code and accountType CANNOT be changed on system accounts
  // But regular accounts can have all fields updated
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  unit: z.enum(["minutes", "hours", "days"]).optional(),
  displayFormat: z.enum(["decimal", "hh_mm"]).optional(),
  bonusFactor: z.number().nullable().optional(),
  accountGroupId: z.string().uuid().nullable().optional(),
  yearCarryover: z.boolean().optional(),
  isPayrollRelevant: z.boolean().optional(),
  payrollCode: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})
```

#### Helper: Map Prisma Account to Output

The Prisma `Decimal` type for `bonusFactor` needs conversion to `number | null`:
```typescript
function mapAccountToOutput(account: PrismaAccount): AccountOutput {
  return {
    ...account,
    bonusFactor: account.bonusFactor ? Number(account.bonusFactor) : null,
  }
}
```

#### Procedures

1. **`list`**:
   - Input: optional `{ includeSystem?: boolean, isActive?: boolean, accountType?: "bonus" | "day" | "month", payrollRelevant?: boolean }`
   - Build where clause:
     - If `includeSystem` is true: `{ OR: [{ tenantId }, { tenantId: null }] }`
     - Otherwise: `{ tenantId }`
     - Add `isActive`, `accountType`, `isPayrollRelevant` filters if provided
   - Prisma: `account.findMany({ where, orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { code: 'asc' }] })`
   - **Usage count**: For the initial implementation, return accounts without usage count in the list response. The usage count requires complex raw SQL joins against `day_plan_bonuses` and `day_plans` tables which are not in Prisma. The separate `getUsage` procedure handles this. If usage count in list is needed, use `prisma.$queryRaw` with the same SQL as the Go `ListFiltered` repository method.
   - Output: `{ data: AccountOutput[] }`

2. **`getById`**:
   - Special: must allow fetching system accounts (tenantId IS NULL) as well as tenant accounts
   - Where: `{ id, OR: [{ tenantId }, { tenantId: null }] }`

3. **`create`**: Port from Go service (lines 66-123 of `account.go`)
   - Trim code and name; validate non-empty
   - Validate accountType (Zod enum handles this)
   - Check code uniqueness within tenant: `account.findFirst({ where: { tenantId, code } })`
   - Defaults: `unit: "minutes"`, `displayFormat: "decimal"`, `yearCarryover: true`, `isActive: true`, `isSystem: false`
   - Set all optional fields with defaults
   - Prisma: `account.create({ data: { ... } })`

4. **`update`**: Port from Go service (lines 159-211)
   - Fetch existing: `account.findFirst({ where: { id } })`
   - If `existing.isSystem === true`, throw BAD_REQUEST "Cannot modify system account"
   - Verify tenant ownership: `existing.tenantId === tenantId`
   - Partial update: apply each non-undefined field
   - If name updated: trim, validate non-empty
   - If description updated: trim, empty -> null
   - Prisma: `account.update({ where: { id }, data })`

5. **`delete`**: Port from Go service (lines 214-226)
   - Fetch existing
   - If `existing.isSystem === true`, throw BAD_REQUEST "Cannot delete system account"
   - Verify tenant ownership
   - Delete

6. **`getUsage`**: Port from Go handler (line 292)
   - Input: `{ id: z.string().uuid() }`
   - Verify account exists (tenant-scoped OR system)
   - Use `prisma.$queryRaw` to execute the day plans usage SQL (same as Go `ListDayPlansUsingAccount`):
     ```sql
     SELECT DISTINCT dp.id, dp.code, dp.name
     FROM day_plans dp
     WHERE dp.tenant_id = $1
     AND (
       dp.id IN (SELECT day_plan_id FROM day_plan_bonuses WHERE account_id = $2)
       OR dp.net_account_id = $2
       OR dp.cap_account_id = $2
     )
     ORDER BY dp.code ASC
     ```
   - Return `{ accountId, usageCount: plans.length, dayPlans: plans }`

### Files to Modify

**`/home/user/terp/apps/web/src/server/root.ts`**
- Add import: `import { accountsRouter } from "./routers/accounts"`
- Add to router: `accounts: accountsRouter,`

---

## Phase 6: Frontend Hook Migration

Migrate the four existing openapi-fetch hook files to use tRPC, following the exact pattern of `/home/user/terp/apps/web/src/hooks/api/use-cost-centers.ts`.

### Files to Modify

#### 1. `/home/user/terp/apps/web/src/hooks/api/use-account-groups.ts`

Replace entire content. Follow `use-cost-centers.ts` pattern:
- `useAccountGroups(options?)` -> `trpc.accountGroups.list.queryOptions({ isActive }, { enabled })`
- `useAccountGroup(id, enabled?)` -> `trpc.accountGroups.getById.queryOptions({ id }, { enabled: enabled && !!id })`
- `useCreateAccountGroup()` -> `trpc.accountGroups.create.mutationOptions()`, invalidate `trpc.accountGroups.list.queryKey()`
- `useUpdateAccountGroup()` -> `trpc.accountGroups.update.mutationOptions()`, invalidate list
- `useDeleteAccountGroup()` -> `trpc.accountGroups.delete.mutationOptions()`, invalidate list

#### 2. `/home/user/terp/apps/web/src/hooks/api/use-contact-types.ts`

Replace entire content:
- `useContactTypes(options?)` -> `trpc.contactTypes.list.queryOptions({ isActive: active }, { enabled })`
- `useContactType(id, enabled?)` -> `trpc.contactTypes.getById.queryOptions({ id }, ...)`
- `useCreateContactType()` -> invalidate list
- `useUpdateContactType()` -> invalidate list
- `useDeleteContactType()` -> invalidate list

#### 3. `/home/user/terp/apps/web/src/hooks/api/use-contact-kinds.ts`

Replace entire content:
- `useContactKinds(options?)` -> `trpc.contactKinds.list.queryOptions({ contactTypeId, isActive: active }, { enabled })`
- `useCreateContactKind()` -> invalidate list
- `useUpdateContactKind()` -> invalidate list
- `useDeleteContactKind()` -> invalidate list

#### 4. `/home/user/terp/apps/web/src/hooks/api/use-accounts.ts`

Replace entire content:
- `useAccounts(options?)` -> `trpc.accounts.list.queryOptions({ accountType, isActive: active, includeSystem }, { enabled })`
  - Note: the old hook used `active` param; new hook passes `isActive` to tRPC
- `useAccount(id, enabled?)` -> `trpc.accounts.getById.queryOptions({ id }, ...)`
- `useAccountUsage(id, enabled?)` -> `trpc.accounts.getUsage.queryOptions({ id }, ...)`
- `useCreateAccount()` -> invalidate `trpc.accounts.list.queryKey()`
- `useUpdateAccount()` -> invalidate list + getUsage queryKey
- `useDeleteAccount()` -> invalidate list + getUsage queryKey

**Important**: Keep the same exported function names and option interfaces so callers do not break. Only the internal implementation changes from openapi-fetch to tRPC.

---

## Phase 7: Tests

Create four test files following the pattern of `/home/user/terp/apps/web/src/server/__tests__/cost-centers-router.test.ts`.

### Files to Create

#### 1. `/home/user/terp/apps/web/src/server/__tests__/account-groups-router.test.ts`

Test structure:
- Import `createCallerFactory` from `../trpc`, the router, permission helpers
- Constants: TENANT_ID, USER_ID, AG_ID, AG_B_ID
- Helper: `makeAccountGroup(overrides)` factory
- Helper: `createTestContext(prisma)` using `createUserWithPermissions([ACCOUNTS_MANAGE])`
- Test suites:
  - `accountGroups.list` -- returns groups, filters by isActive, returns empty
  - `accountGroups.getById` -- found, not found
  - `accountGroups.create` -- success, trims whitespace, rejects duplicate code, defaults isActive true, handles description trim/nulling
  - `accountGroups.update` -- updates fields, rejects empty name/code, rejects duplicate code, allows same code, not found
  - `accountGroups.delete` -- success, not found, rejects deletion with assigned accounts

#### 2. `/home/user/terp/apps/web/src/server/__tests__/contact-types-router.test.ts`

Test structure:
- Permission: `CONTACT_MANAGEMENT_MANAGE`
- Helper: `makeContactType(overrides)` with defaults for dataType, etc.
- Test suites:
  - `contactTypes.list` -- returns types, filters by isActive
  - `contactTypes.getById` -- found, not found
  - `contactTypes.create` -- success, validates dataType (rejects invalid), rejects duplicate code, trims fields
  - `contactTypes.update` -- updates name/description/isActive/sortOrder (NOT code/dataType), rejects empty name
  - `contactTypes.delete` -- success, not found, rejects deletion when contact kinds exist

#### 3. `/home/user/terp/apps/web/src/server/__tests__/contact-kinds-router.test.ts`

Test structure:
- Permission: `CONTACT_MANAGEMENT_MANAGE`
- Helper: `makeContactKind(overrides)`
- Test suites:
  - `contactKinds.list` -- returns kinds, filters by contactTypeId, filters by isActive
  - `contactKinds.getById` -- found, not found
  - `contactKinds.create` -- success, verifies contact type exists (rejects missing), rejects duplicate code, trims label
  - `contactKinds.update` -- updates label/isActive/sortOrder, rejects empty label
  - `contactKinds.delete` -- success, not found

#### 4. `/home/user/terp/apps/web/src/server/__tests__/accounts-router.test.ts`

Test structure:
- Permission: `ACCOUNTS_MANAGE`
- Helper: `makeAccount(overrides)` with defaults for all fields including system-specific ones
- Test suites:
  - `accounts.list` -- returns accounts, filters by isActive/accountType/payrollRelevant, includeSystem flag
  - `accounts.getById` -- found (tenant), found (system), not found
  - `accounts.create` -- success with defaults (unit=minutes, displayFormat=decimal, yearCarryover=true), rejects duplicate code, validates required fields, sets isSystem=false
  - `accounts.update` -- updates fields, rejects system account modification, rejects empty name, not found
  - `accounts.delete` -- success, rejects system account deletion, not found
  - `accounts.getUsage` -- returns usage data (mock $queryRaw), returns empty for no usage

### Running Tests

```bash
cd /home/user/terp/apps/web && npx vitest run src/server/__tests__/account-groups-router.test.ts
cd /home/user/terp/apps/web && npx vitest run src/server/__tests__/contact-types-router.test.ts
cd /home/user/terp/apps/web && npx vitest run src/server/__tests__/contact-kinds-router.test.ts
cd /home/user/terp/apps/web && npx vitest run src/server/__tests__/accounts-router.test.ts
```

---

## Implementation Order

Execute phases in this order:

1. **Phase 1**: Prisma schema (ContactType, ContactKind models) -- prerequisite for Phases 3, 4
2. **Phase 2**: Account Groups router -- simplest, validates patterns
3. **Phase 3**: Contact Types router
4. **Phase 4**: Contact Kinds router -- depends on Phase 1 (ContactType model in Prisma)
5. **Phase 5**: Accounts router -- most complex, do last
6. **Phase 6**: Frontend hooks migration -- after all routers exist
7. **Phase 7**: Tests -- can partially run after each router phase, full suite at end

Within each router phase, the order is:
1. Create the router file
2. Register in `root.ts`
3. Verify compilation (`npx tsc --noEmit`)

---

## Success Criteria

1. All four tRPC routers are implemented and registered in `root.ts`
2. ContactType and ContactKind Prisma models are added with correct relations
3. All business logic from Go services is ported:
   - Input validation (trim, required fields, code uniqueness)
   - System account protection (accounts only)
   - Delete guards (contact types in use, account groups with accounts)
   - Immutable fields (contactType.code/dataType, contactKind.code/contactTypeId)
4. Frontend hooks use tRPC instead of openapi-fetch, maintaining same exported API
5. All tests pass
6. Type checking passes: `npx tsc --noEmit`

---

## Dependencies / Pre-checks

- [ ] Prisma CLI available: `npx prisma --version`
- [ ] Vitest available: `npx vitest --version`
- [ ] Existing tests still pass before changes: `cd apps/web && npx vitest run`
- [ ] Permissions `accounts.manage` and `contact_management.manage` exist in `/home/user/terp/apps/web/src/server/lib/permission-catalog.ts` (confirmed at lines 113 and 171)
- [ ] The `day_plans` and `day_plan_bonuses` tables exist in DB (for accounts.getUsage raw SQL) -- these tables are from earlier migrations but NOT yet in Prisma schema. The `$queryRaw` approach works without Prisma models.
