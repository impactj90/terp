# Go API to tRPC Migration -- Implementation Plan

**Date**: 2026-03-09
**Branch**: staging
**Source research**: `thoughts/shared/research/2026-03-09-golang-endpoint-migration.md`

---

## Overview

9 endpoint gaps remain from the Go-to-tRPC migration. After investigation:

- **Gap 9 (Employee Teams)** is already implemented -- `teams.getByEmployee` exists in `src/trpc/routers/teams.ts` with service method in `teams-service.ts` and repository method `findTeamsByEmployee` in `teams-repository.ts`. No work needed.

That leaves **8 actual gaps** across 4 phases.

---

## Phase 1: Accounts + Account Groups (HIGH PRIORITY)

No schema changes needed. Prisma models `Account` and `AccountGroup` already exist.
Both have frontend hooks using legacy API (`useApiQuery`/`useApiMutation`) that need migration to tRPC.

### 1A. Accounts CRUD + Usage

**Ticket**: TICKET-327

#### Files to Create

**`src/lib/services/account-repository.ts`**

Repository functions (following `cost-center-repository.ts` pattern):

```
findMany(prisma, tenantId, params?)      -- filters: includeSystem, active, accountType, payrollRelevant
findById(prisma, tenantId, id)           -- findFirst where {id, tenantId}
findByCode(prisma, tenantId, code, excludeId?)  -- uniqueness check
create(prisma, data)                     -- prisma.account.create
update(prisma, id, data)                 -- prisma.account.update
deleteById(prisma, id)                   -- prisma.account.delete
findDayPlanUsage(prisma, tenantId, accountId)   -- raw SQL query (see below)
```

The `findDayPlanUsage` method uses a raw query matching Go's `ListDayPlansUsingAccount`:
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

**`src/lib/services/account-service.ts`**

Service functions:

```typescript
// Error classes
AccountNotFoundError
AccountValidationError
AccountConflictError

// Functions
list(prisma, tenantId, params?)  -- delegates to repo.findMany
getById(prisma, tenantId, id)    -- 404 if not found
create(prisma, tenantId, input)  -- validate code/name/accountType, check uniqueness
update(prisma, tenantId, input)  -- verify exists, validate changes, check uniqueness
remove(prisma, tenantId, id)     -- verify exists, prevent deleting system accounts
getUsage(prisma, tenantId, id)   -- verify exists, then repo.findDayPlanUsage
```

Key business rules from Go:
- Cannot delete system accounts (`isSystem === true`)
- Cannot modify system account code
- Code uniqueness within tenant (excluding self on update)
- `accountType` must be one of: `bonus`, `day`, `month`
- `unit` defaults to `minutes`, `displayFormat` defaults to `decimal`

**`src/trpc/routers/accounts.ts`**

Procedures:

| Procedure | Type | Input | Output | Permission |
|---|---|---|---|---|
| `list` | query | `{ includeSystem?, active?, accountType?, payrollRelevant? }` | `{ data: Account[] }` | `accounts.manage` |
| `getById` | query | `{ id: uuid }` | `Account` | `accounts.manage` |
| `getUsage` | query | `{ id: uuid }` | `{ accountId, usageCount, dayPlans: {id, code, name}[] }` | `accounts.manage` |
| `create` | mutation | `CreateAccountInput` | `Account` | `accounts.manage` |
| `update` | mutation | `UpdateAccountInput` | `Account` | `accounts.manage` |
| `delete` | mutation | `{ id: uuid }` | `{ success: boolean }` | `accounts.manage` |

**Zod schemas:**

```typescript
// Output
const accountOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  accountType: z.string(),         // "bonus" | "day" | "month"
  unit: z.string(),                // "minutes" | "hours" | "days"
  isSystem: z.boolean(),
  isActive: z.boolean(),
  description: z.string().nullable(),
  isPayrollRelevant: z.boolean(),
  payrollCode: z.string().nullable(),
  sortOrder: z.number().int(),
  yearCarryover: z.boolean(),
  accountGroupId: z.string().uuid().nullable(),
  displayFormat: z.string(),       // "decimal" | "hh_mm"
  bonusFactor: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Create input
const createAccountInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
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

// Update input
const updateAccountInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  accountType: z.enum(["bonus", "day", "month"]).optional(),
  unit: z.enum(["minutes", "hours", "days"]).optional(),
  displayFormat: z.enum(["decimal", "hh_mm"]).optional(),
  bonusFactor: z.number().nullable().optional(),
  accountGroupId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  isPayrollRelevant: z.boolean().optional(),
  payrollCode: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  yearCarryover: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// Usage output
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

#### Files to Modify

**`src/trpc/routers/_app.ts`** -- Add import and register `accounts: accountsRouter`

**`src/hooks/use-accounts.ts`** -- Rewrite from legacy `useApiQuery`/`useApiMutation` to tRPC:

```typescript
// FROM:
import { useApiQuery } from './use-api-query'
import { useApiMutation } from './use-api-mutation'

// TO:
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

Hook mappings:
| Old | New |
|---|---|
| `useAccounts(opts)` | `trpc.accounts.list.queryOptions(input)` |
| `useAccount(id)` | `trpc.accounts.getById.queryOptions({ id })` |
| `useAccountUsage(id)` | `trpc.accounts.getUsage.queryOptions({ id })` |
| `useCreateAccount()` | `trpc.accounts.create.mutationOptions()` + invalidate `accounts.list` |
| `useUpdateAccount()` | `trpc.accounts.update.mutationOptions()` + invalidate `accounts.list` |
| `useDeleteAccount()` | `trpc.accounts.delete.mutationOptions()` + invalidate `accounts.list` |

#### Permission

Uses existing `accounts.manage` from `permission-catalog.ts` (line 113).

#### Verification

- `make typecheck` -- no new type errors
- `make lint` -- passes
- Manual test: navigate to account management page, verify CRUD works
- Verify account usage shows day plans referencing the account

---

### 1B. Account Groups CRUD

**Ticket**: TICKET-328

#### Files to Create

**`src/lib/services/account-group-repository.ts`**

Repository functions:

```
findMany(prisma, tenantId, params?)      -- optional isActive filter, orderBy code ASC
findById(prisma, tenantId, id)           -- findFirst where {id, tenantId}
findByCode(prisma, tenantId, code, excludeId?)  -- uniqueness check
create(prisma, data)
update(prisma, id, data)
deleteById(prisma, id)
countAccounts(prisma, accountGroupId)    -- check if any accounts reference this group
```

**`src/lib/services/account-group-service.ts`**

Service functions:

```typescript
// Error classes
AccountGroupNotFoundError
AccountGroupValidationError
AccountGroupConflictError

// Functions
list(prisma, tenantId, params?)
getById(prisma, tenantId, id)
create(prisma, tenantId, input)    -- validate code/name, check uniqueness
update(prisma, tenantId, input)    -- verify exists, validate changes
remove(prisma, tenantId, id)       -- verify exists, check no accounts reference it
```

**`src/trpc/routers/accountGroups.ts`**

Procedures:

| Procedure | Type | Input | Output | Permission |
|---|---|---|---|---|
| `list` | query | `{ isActive? }` (optional) | `{ data: AccountGroup[] }` | `accounts.manage` |
| `getById` | query | `{ id: uuid }` | `AccountGroup` | `accounts.manage` |
| `create` | mutation | `CreateAccountGroupInput` | `AccountGroup` | `accounts.manage` |
| `update` | mutation | `UpdateAccountGroupInput` | `AccountGroup` | `accounts.manage` |
| `delete` | mutation | `{ id: uuid }` | `{ success: boolean }` | `accounts.manage` |

**Zod schemas:**

```typescript
const accountGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const createAccountGroupInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const updateAccountGroupInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
```

#### Files to Modify

**`src/trpc/routers/_app.ts`** -- Add import and register `accountGroups: accountGroupsRouter`

**`src/hooks/use-account-groups.ts`** -- Rewrite from legacy API to tRPC (same pattern as accounts)

Hook mappings:
| Old | New |
|---|---|
| `useAccountGroups(opts)` | `trpc.accountGroups.list.queryOptions()` |
| `useAccountGroup(id)` | `trpc.accountGroups.getById.queryOptions({ id })` |
| `useCreateAccountGroup()` | `trpc.accountGroups.create.mutationOptions()` |
| `useUpdateAccountGroup()` | `trpc.accountGroups.update.mutationOptions()` |
| `useDeleteAccountGroup()` | `trpc.accountGroups.delete.mutationOptions()` |

#### Permission

Same `accounts.manage` permission.

#### Verification

- `make typecheck` -- no new type errors
- `make lint` -- passes
- Manual test: account group management UI

---

## Phase 2: Extend Existing Routers/Services (MEDIUM PRIORITY)

These add missing procedures to routers and services that already exist.

### 2A. Daily Values -- getById + recalculate

**Ticket**: TICKET-329

#### Files to Modify

**`src/lib/services/daily-value-repository.ts`** -- Add:

```typescript
export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.dailyValue.findFirst({
    where: { id, tenantId },
    include: dailyValueListAllInclude,
  })
}
```

**`src/lib/services/daily-value-service.ts`** -- Add:

```typescript
export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  id: string
) {
  const dv = await repo.findById(prisma, tenantId, id)
  if (!dv) {
    throw new DailyValueNotFoundError()
  }
  // Check data scope
  checkDataScope(dataScope, dv as { employeeId: string; employee?: { departmentId: string | null } | null })
  return dv
}

export async function recalculate(
  prisma: PrismaClient,
  tenantId: string,
  input: { from: string; to: string; employeeId?: string }
) {
  const fromDate = new Date(input.from)
  const toDate = new Date(input.to)

  if (fromDate > toDate) {
    throw new DailyValueValidationError("from must be before or equal to to")
  }

  const { RecalcService } = await import("./recalc")
  const recalcService = new RecalcService(prisma as PrismaClient)

  let result
  if (input.employeeId) {
    result = await recalcService.triggerRecalcRange(
      tenantId,
      input.employeeId,
      fromDate,
      toDate
    )
  } else {
    result = await recalcService.triggerRecalcAll(tenantId, fromDate, toDate)
  }

  return {
    message: "Recalculation started",
    affectedDays: result.processedDays,
  }
}
```

**`src/trpc/routers/dailyValues.ts`** -- Add two procedures:

```typescript
// After the existing `approve` procedure:

getById: tenantProcedure
  .use(requirePermission(TIME_TRACKING_VIEW_OWN, TIME_TRACKING_VIEW_ALL))
  .use(applyDataScope())
  .input(z.object({ id: z.string().uuid() }))
  .output(dailyValueOutputSchema)
  .query(async ({ ctx, input }) => {
    try {
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
      const dv = await dailyValueService.getById(
        ctx.prisma,
        ctx.tenantId!,
        dataScope,
        input.id
      )
      return mapDailyValueToOutput(dv as unknown as Record<string, unknown>)
    } catch (err) {
      handleServiceError(err)
    }
  }),

recalculate: tenantProcedure
  .use(requirePermission(permissionIdByKey("booking_overview.calculate_day")!))
  .input(z.object({
    from: z.string().date(),       // YYYY-MM-DD
    to: z.string().date(),         // YYYY-MM-DD
    employeeId: z.string().uuid().optional(),
  }))
  .output(z.object({
    message: z.string(),
    affectedDays: z.number().int(),
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      return await dailyValueService.recalculate(
        ctx.prisma,
        ctx.tenantId!,
        input
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

**Permissions**:
- `getById`: `time_tracking.view_own` or `time_tracking.view_all` (with data scope)
- `recalculate`: `booking_overview.calculate_day`

#### Verification

- `make typecheck`
- Existing daily values tests still pass: `pnpm vitest run src/trpc/routers/__tests__/dailyValues.test.ts` (if exists)
- Manual: call `dailyValues.getById` and `dailyValues.recalculate` via tRPC client

---

### 2B. Vacation Balance -- initialize

**Ticket**: TICKET-330

#### Files to Modify

**`src/lib/services/vacation-balances-service.ts`** -- Add:

```typescript
/**
 * Initializes vacation balances for all active employees for a given year.
 * Optionally carries over balances from the previous year.
 *
 * Port of Go VacationBalanceHandler.Initialize + VacationService.InitializeYear
 */
export async function initializeBalances(
  prisma: PrismaClient,
  tenantId: string,
  input: { year: number; carryover?: boolean }
) {
  const year = input.year
  const doCarryover = input.carryover ?? true

  // Get all active employees for tenant
  const employees = await prisma.employee.findMany({
    where: { tenantId, isActive: true, deletedAt: null },
    select: { id: true },
  })

  let createdCount = 0
  for (const emp of employees) {
    try {
      // Optionally carryover from previous year
      if (doCarryover) {
        await carryoverFromPreviousYear(prisma, tenantId, emp.id, year)
      }

      // Create balance if it doesn't exist
      const existing = await repo.findBalanceByEmployeeAndYear(
        prisma,
        tenantId,
        emp.id,
        year
      )
      if (!existing) {
        await repo.createBalance(prisma, {
          tenantId,
          employeeId: emp.id,
          year,
          entitlement: 0,
          carryover: 0,
          adjustments: 0,
          taken: 0,
          carryoverExpiresAt: null,
        })
        createdCount++
      }
    } catch {
      // Continue on individual errors (matches Go behavior)
    }
  }

  return {
    message: "Vacation balances initialized",
    createdCount,
  }
}

/**
 * Carries over available balance from previous year to current year.
 * Simplified version -- creates/updates current year carryover field.
 */
async function carryoverFromPreviousYear(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number
) {
  const prevBalance = await repo.findBalanceByEmployeeAndYear(
    prisma,
    tenantId,
    employeeId,
    year - 1
  )
  if (!prevBalance) return

  // Calculate available = entitlement + carryover + adjustments - taken
  const entitlement = Number(prevBalance.entitlement)
  const carryover = Number(prevBalance.carryover)
  const adjustments = Number(prevBalance.adjustments)
  const taken = Number(prevBalance.taken)
  const available = entitlement + carryover + adjustments - taken

  if (available <= 0) return

  // Get or create current year balance
  let currentBalance = await repo.findBalanceByEmployeeAndYear(
    prisma,
    tenantId,
    employeeId,
    year
  )

  if (currentBalance) {
    await repo.updateBalance(prisma, currentBalance.id, {
      carryover: available,
    })
  } else {
    await repo.createBalance(prisma, {
      tenantId,
      employeeId,
      year,
      entitlement: 0,
      carryover: available,
      adjustments: 0,
      taken: 0,
      carryoverExpiresAt: null,
    })
  }
}
```

**`src/trpc/routers/vacationBalances.ts`** -- Add procedure after `update`:

```typescript
/**
 * vacationBalances.initialize -- Initializes vacation balances for all active employees.
 *
 * For each active employee:
 * 1. Optionally carries over remaining balance from previous year
 * 2. Creates a new balance record for the target year (if not exists)
 *
 * Port of Go VacationBalanceHandler.Initialize
 * Requires: absences.manage permission
 */
initialize: tenantProcedure
  .use(requirePermission(ABSENCES_MANAGE))
  .input(z.object({
    year: z.number().int().min(1900).max(2200),
    carryover: z.boolean().optional().default(true),
  }))
  .output(z.object({
    message: z.string(),
    createdCount: z.number().int(),
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      return await service.initializeBalances(ctx.prisma, ctx.tenantId!, input)
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

**Permission**: `absences.manage` (existing in permission catalog)

#### Verification

- `make typecheck`
- Manual: call `vacationBalances.initialize({ year: 2026 })` and verify balances created

---

### 2C. Monthly Eval Daily Breakdown

**Ticket**: TICKET-331

This is essentially a duplicate of `dailyValues.list` but accessed through a different endpoint path in Go. The existing `dailyValues.list` procedure already returns daily values for an employee/month. However, the Go `GetDailyBreakdown` endpoint lives under the monthly eval handler and returns a `DailyBreakdownResponse` wrapper.

#### Analysis: Already Covered

Looking at the existing router:
- `dailyValues.list` takes `{ employeeId, year, month }` and returns daily values for that month
- This is functionally identical to Go's `GET /employees/{id}/months/{year}/{month}/days`

The frontend can use `dailyValues.list` for the breakdown view. If a distinct procedure name is preferred for clarity:

#### Files to Modify

**`src/trpc/routers/monthlyValues.ts`** -- Add query:

```typescript
/**
 * monthlyValues.dailyBreakdown -- Returns daily values for an employee in a specific month.
 *
 * Convenience alias that delegates to dailyValues.list logic.
 * Used by monthly evaluation detail view.
 *
 * Replaces: GET /employees/{id}/months/{year}/{month}/days
 *
 * Requires: reports.view permission
 */
dailyBreakdown: tenantProcedure
  .use(requirePermission(REPORTS_VIEW))
  .input(z.object({
    employeeId: z.string().uuid(),
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
  }))
  .output(z.array(/* daily value schema */))
  .query(async ({ ctx, input }) => {
    // Reuse daily value service list
    const dailyValueService = await import("@/lib/services/daily-value-service")
    try {
      const values = await dailyValueService.list(
        ctx.prisma,
        ctx.tenantId!,
        input
      )
      return values.map(v => mapDailyValueForBreakdown(v))
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

Note: This imports `daily-value-service.list` directly. A shared daily value output schema should be extracted or the `dailyValues` router's schema should be reused.

**Alternative approach (recommended)**: Since `dailyValues.list` already does exactly this, simply document that the frontend should use `dailyValues.list({ employeeId, year, month })` for the monthly eval breakdown view. Add a note to the router JSDoc. Only add a new procedure if the UI specifically needs a `monthlyValues.dailyBreakdown` call.

**Permission**: `reports.view`

#### Verification

- `make typecheck`
- Frontend monthly eval detail page loads daily breakdown

---

## Phase 3: Contact Types + Contact Kinds (MEDIUM PRIORITY)

Requires Prisma schema additions and a Supabase migration. The `contact_types` and `contact_kinds` tables were created by Go GORM automigration, so they exist in the database but are not in the Prisma schema or any Supabase migration.

### 3A. Database Migration + Prisma Schema

**Ticket**: TICKET-332

#### Step 1: Create Supabase Migration

```bash
make db-migrate-new name=add_contact_types_contact_kinds
```

Migration SQL (use `CREATE TABLE IF NOT EXISTS` to handle both fresh and existing databases):

```sql
-- Contact Types (may already exist from Go GORM automigration)
CREATE TABLE IF NOT EXISTS contact_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  data_type VARCHAR(50) NOT NULL DEFAULT 'text',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_contact_types_tenant ON contact_types(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS contact_types_tenant_code_key ON contact_types(tenant_id, code);

-- Contact Kinds (may already exist from Go GORM automigration)
CREATE TABLE IF NOT EXISTS contact_kinds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_type_id UUID NOT NULL REFERENCES contact_types(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  label VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_contact_kinds_tenant ON contact_kinds(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_kinds_type ON contact_kinds(contact_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS contact_kinds_tenant_code_key ON contact_kinds(tenant_id, code);

-- Updated_at trigger
CREATE OR REPLACE TRIGGER update_contact_types_updated_at
  BEFORE UPDATE ON contact_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_contact_kinds_updated_at
  BEFORE UPDATE ON contact_kinds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### Step 2: Add Prisma Models

Add to `prisma/schema.prisma`:

```prisma
// -----------------------------------------------------------------------------
// ContactType
// -----------------------------------------------------------------------------

model ContactType {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  dataType    String   @default("text") @map("data_type") @db.VarChar(50)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  sortOrder   Int      @default(0) @map("sort_order") @db.Integer
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contactKinds ContactKind[]

  // Indexes
  @@unique([tenantId, code], map: "contact_types_tenant_code_key")
  @@index([tenantId], map: "idx_contact_types_tenant")
  @@map("contact_types")
}

// -----------------------------------------------------------------------------
// ContactKind
// -----------------------------------------------------------------------------

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
  tenant           Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contactType      ContactType      @relation(fields: [contactTypeId], references: [id], onDelete: Cascade)
  employeeContacts EmployeeContact[]

  // Indexes
  @@unique([tenantId, code], map: "contact_kinds_tenant_code_key")
  @@index([tenantId], map: "idx_contact_kinds_tenant")
  @@index([contactTypeId], map: "idx_contact_kinds_type")
  @@map("contact_kinds")
}
```

Also update `EmployeeContact` model to add the relation:

```prisma
// In model EmployeeContact, replace the comment:
//   // Note: contactKindId FK references contact_kinds(id) ON DELETE SET NULL.
//   // ContactKind model not yet in Prisma. Relation will be added when it is.
// With:
  contactKind ContactKind? @relation(fields: [contactKindId], references: [id], onDelete: SetNull)
```

#### Step 3: Regenerate Prisma Client

```bash
make db-generate
```

#### Verification

- `make db-reset` -- migration applies cleanly
- `make db-generate` -- Prisma client regenerated
- `make typecheck` -- no new errors from schema change

---

### 3B. Contact Types CRUD

**Ticket**: TICKET-333

#### Files to Create

**`src/lib/services/contact-type-repository.ts`**

```
findMany(prisma, tenantId, params?)      -- optional active filter, orderBy sortOrder ASC
findById(prisma, tenantId, id)
findByCode(prisma, tenantId, code, excludeId?)
create(prisma, data)
update(prisma, id, data)
deleteById(prisma, id)
countContactKinds(prisma, contactTypeId) -- prevent delete if kinds exist
```

**`src/lib/services/contact-type-service.ts`**

```typescript
// Error classes
ContactTypeNotFoundError
ContactTypeValidationError
ContactTypeConflictError

// Functions
list(prisma, tenantId, params?)
getById(prisma, tenantId, id)
create(prisma, tenantId, input)    -- validate code/name, check uniqueness
update(prisma, tenantId, input)    -- verify exists, validate changes
remove(prisma, tenantId, id)       -- verify exists, check no contact kinds reference it
```

**`src/trpc/routers/contactTypes.ts`**

Procedures:

| Procedure | Type | Input | Output | Permission |
|---|---|---|---|---|
| `list` | query | `{ active? }` (optional) | `{ data: ContactType[] }` | `contact_management.manage` |
| `getById` | query | `{ id: uuid }` | `ContactType` | `contact_management.manage` |
| `create` | mutation | `CreateInput` | `ContactType` | `contact_management.manage` |
| `update` | mutation | `UpdateInput` | `ContactType` | `contact_management.manage` |
| `delete` | mutation | `{ id: uuid }` | `{ success: boolean }` | `contact_management.manage` |

**Zod schemas:**

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

const createContactTypeInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  dataType: z.string().optional().default("text"),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const updateContactTypeInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  dataType: z.string().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
```

#### Files to Modify

**`src/trpc/routers/_app.ts`** -- Add import and register `contactTypes: contactTypesRouter`

**`src/hooks/use-contact-types.ts`** -- Rewrite from legacy API to tRPC

#### Permission

Uses existing `contact_management.manage` from permission catalog (line 171).

---

### 3C. Contact Kinds CRUD

**Ticket**: TICKET-334

#### Files to Create

**`src/lib/services/contact-kind-repository.ts`**

```
findMany(prisma, tenantId, params?)      -- optional contactTypeId, active filters
findById(prisma, tenantId, id)
findByCode(prisma, tenantId, code, excludeId?)
create(prisma, data)
update(prisma, id, data)
deleteById(prisma, id)
countEmployeeContacts(prisma, contactKindId) -- prevent delete if employee contacts use it
```

**`src/lib/services/contact-kind-service.ts`**

```typescript
// Error classes
ContactKindNotFoundError
ContactKindValidationError
ContactKindConflictError

// Functions
list(prisma, tenantId, params?)
getById(prisma, tenantId, id)
create(prisma, tenantId, input)    -- validate code/label, check uniqueness, verify contactTypeId exists
update(prisma, tenantId, input)
remove(prisma, tenantId, id)       -- verify exists, check no employee contacts reference it
```

**`src/trpc/routers/contactKinds.ts`**

Procedures:

| Procedure | Type | Input | Output | Permission |
|---|---|---|---|---|
| `list` | query | `{ contactTypeId?, active? }` | `{ data: ContactKind[] }` | `contact_management.manage` |
| `getById` | query | `{ id: uuid }` | `ContactKind` | `contact_management.manage` |
| `create` | mutation | `CreateInput` | `ContactKind` | `contact_management.manage` |
| `update` | mutation | `UpdateInput` | `ContactKind` | `contact_management.manage` |
| `delete` | mutation | `{ id: uuid }` | `{ success: boolean }` | `contact_management.manage` |

**Zod schemas:**

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

const createContactKindInputSchema = z.object({
  contactTypeId: z.string().uuid(),
  code: z.string().min(1),
  label: z.string().min(1),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const updateContactKindInputSchema = z.object({
  id: z.string().uuid(),
  contactTypeId: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
```

#### Files to Modify

**`src/trpc/routers/_app.ts`** -- Add import and register `contactKinds: contactKindsRouter`

**`src/hooks/use-contact-kinds.ts`** -- Rewrite from legacy API to tRPC

#### Permission

Same `contact_management.manage` permission.

#### Verification (Phase 3 overall)

- `make db-reset` -- migration applies
- `make db-generate` -- Prisma types regenerated
- `make typecheck` -- passes
- `make lint` -- passes
- Manual: contact types/kinds config page works

---

## Phase 4: Low-Priority Gaps

### 4A. Booking Audit Logs

**Ticket**: TICKET-335

#### Files to Modify

**`src/trpc/routers/bookings.ts`** -- Add procedure:

```typescript
/**
 * bookings.getLogs -- Returns audit log entries for a specific booking.
 *
 * Queries AuditLog where entityType='booking' and entityId=bookingId.
 *
 * Replaces: GET /bookings/{id}/logs
 *
 * Requires: time_tracking.view_own or time_tracking.view_all
 */
getLogs: tenantProcedure
  .use(requirePermission(VIEW_OWN, VIEW_ALL))
  .input(z.object({ id: z.string().uuid() }))
  .output(z.object({
    items: z.array(z.object({
      id: z.string().uuid(),
      userId: z.string().uuid().nullable(),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string().uuid(),
      entityName: z.string().nullable(),
      changes: z.any().nullable(),
      metadata: z.any().nullable(),
      performedAt: z.date(),
    })),
  }))
  .query(async ({ ctx, input }) => {
    const logs = await ctx.prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId!,
        entityType: "booking",
        entityId: input.id,
      },
      orderBy: { performedAt: "desc" },
    })
    return { items: logs }
  }),
```

This is simple enough to inline in the router without a dedicated service method. The query is a direct Prisma call on the existing `AuditLog` model.

**Permission**: `time_tracking.view_own` or `time_tracking.view_all`

#### Verification

- `make typecheck`
- Manual: booking detail view shows audit log entries

---

### 4B. Employee Teams Lookup -- ALREADY DONE

As confirmed during research, `teams.getByEmployee` already exists:
- Router: `src/trpc/routers/teams.ts` line 468
- Service: `src/lib/services/teams-service.ts` (function `getByEmployee`)
- Repository: `src/lib/services/teams-repository.ts` (function `findTeamsByEmployee`)

**No work needed.**

---

## Summary of All Files

### Files to Create (10 new files)

| File | Phase |
|---|---|
| `src/lib/services/account-repository.ts` | 1A |
| `src/lib/services/account-service.ts` | 1A |
| `src/trpc/routers/accounts.ts` | 1A |
| `src/lib/services/account-group-repository.ts` | 1B |
| `src/lib/services/account-group-service.ts` | 1B |
| `src/trpc/routers/accountGroups.ts` | 1B |
| `src/lib/services/contact-type-repository.ts` | 3B |
| `src/lib/services/contact-type-service.ts` | 3B |
| `src/lib/services/contact-kind-repository.ts` | 3C |
| `src/lib/services/contact-kind-service.ts` | 3C |

Note: `contactTypes.ts` and `contactKinds.ts` routers need to be created in `src/trpc/routers/`.
That's actually 12 new files total (adding the two router files).

### Files to Modify (11 files)

| File | Changes | Phase |
|---|---|---|
| `src/trpc/routers/_app.ts` | Add 4 router imports + registrations | 1A, 1B, 3B, 3C |
| `src/hooks/use-accounts.ts` | Rewrite from legacy API to tRPC | 1A |
| `src/hooks/use-account-groups.ts` | Rewrite from legacy API to tRPC | 1B |
| `src/hooks/use-contact-types.ts` | Rewrite from legacy API to tRPC | 3B |
| `src/hooks/use-contact-kinds.ts` | Rewrite from legacy API to tRPC | 3C |
| `src/lib/services/daily-value-repository.ts` | Add `findById` | 2A |
| `src/lib/services/daily-value-service.ts` | Add `getById`, `recalculate` | 2A |
| `src/trpc/routers/dailyValues.ts` | Add `getById`, `recalculate` procedures | 2A |
| `src/lib/services/vacation-balances-service.ts` | Add `initializeBalances` | 2B |
| `src/trpc/routers/vacationBalances.ts` | Add `initialize` procedure | 2B |
| `src/trpc/routers/bookings.ts` | Add `getLogs` procedure | 4A |
| `prisma/schema.prisma` | Add ContactType, ContactKind models + EmployeeContact relation | 3A |

### Migration Files (1)

| File | Phase |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_add_contact_types_contact_kinds.sql` | 3A |

---

## Execution Order

1. **Phase 1A**: Accounts CRUD (new router + service + repo + hook rewrite)
2. **Phase 1B**: Account Groups CRUD (new router + service + repo + hook rewrite)
3. **Phase 2A**: Daily Values getById + recalculate (extend existing)
4. **Phase 2B**: Vacation Balance initialize (extend existing)
5. **Phase 2C**: Monthly eval daily breakdown (evaluate if needed, may skip)
6. **Phase 3A**: Contact Types/Kinds migration + Prisma schema
7. **Phase 3B**: Contact Types CRUD (new router + service + repo + hook rewrite)
8. **Phase 3C**: Contact Kinds CRUD (new router + service + repo + hook rewrite)
9. **Phase 4A**: Booking audit logs (single procedure addition)

After all phases complete, the Go API migration will be 100% finished. The Go backend (`apps/api/`) can then be safely decommissioned.

---

## Estimated Effort

| Phase | Effort | Ticket Count |
|---|---|---|
| Phase 1 (Accounts + Groups) | ~3 hours | 2 tickets |
| Phase 2 (Extensions) | ~2 hours | 3 tickets |
| Phase 3 (Contact Types/Kinds) | ~3 hours | 3 tickets |
| Phase 4 (Audit logs) | ~30 min | 1 ticket |
| **Total** | **~8.5 hours** | **9 tickets** |
