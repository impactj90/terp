# Research: CRM_02 Korrespondenz (Correspondence Protocol)

Date: 2026-03-16

## 1. CRM_01 Implementation (Dependency) — Complete File Inventory

### 1.1 Prisma Schema

**File:** `/home/tolga/projects/terp/prisma/schema.prisma`

Current CRM models:
- `CrmAddressType` enum (`CUSTOMER`, `SUPPLIER`, `BOTH`) — `@@map("crm_address_type")`
- `CrmAddress` model — `@@map("crm_addresses")`
- `CrmContact` model — `@@map("crm_contacts")`
- `CrmBankAccount` model — `@@map("crm_bank_accounts")`
- `NumberSequence` model — `@@map("number_sequences")`

Relevant relation patterns on `CrmAddress`:
```prisma
contacts     CrmContact[]
bankAccounts CrmBankAccount[]
```

Relevant relation patterns on `CrmContact`:
```prisma
tenant  Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)
```

Index conventions:
```prisma
@@index([tenantId], map: "idx_crm_contacts_tenant_id")
@@index([addressId], map: "idx_crm_contacts_address_id")
@@map("crm_contacts")
```

The `Tenant` model already has reverse relation fields:
```prisma
crmAddresses  CrmAddress[]
crmContacts   CrmContact[]
crmBankAccounts CrmBankAccount[]
```

### 1.2 Migration

**File:** `/home/tolga/projects/terp/supabase/migrations/20260101000095_create_crm_tables.sql`

Latest migration number: `000095`. The next migration should be `000096`.

Migration naming convention: `20260101000096_create_crm_correspondences.sql`

SQL pattern for enum + table:
```sql
CREATE TYPE crm_address_type AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');

CREATE TABLE crm_contacts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    address_id  UUID        NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    ...
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_contacts_address_id ON crm_contacts(address_id);
CREATE INDEX idx_crm_contacts_tenant_id ON crm_contacts(tenant_id);
```

### 1.3 Service Layer

**File:** `/home/tolga/projects/terp/src/lib/services/crm-address-service.ts`

Pattern: Functional module (exported functions, not a class). Imports:
```ts
import type { PrismaClient, CrmAddressType } from "@/generated/prisma/client"
import * as repo from "./crm-address-repository"
```

Error class pattern:
```ts
export class CrmAddressNotFoundError extends Error {
  constructor(message = "CRM address not found") {
    super(message)
    this.name = "CrmAddressNotFoundError"
  }
}

export class CrmAddressValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmAddressValidationError"
  }
}
```

The `handleServiceError` in `src/trpc/errors.ts` uses `err.constructor.name.endsWith("NotFoundError")` pattern, so error classes must end with `NotFoundError`, `ValidationError`, `ConflictError`, or `ForbiddenError`.

Function signatures follow pattern:
```ts
export async function list(prisma: PrismaClient, tenantId: string, params: {...}) { ... }
export async function getById(prisma: PrismaClient, tenantId: string, id: string) { ... }
export async function create(prisma: PrismaClient, tenantId: string, input: {...}, createdById: string) { ... }
export async function update(prisma: PrismaClient, tenantId: string, input: {...}) { ... }
export async function remove(prisma: PrismaClient, tenantId: string, id: string) { ... }
```

Validation pattern in `create`:
- Verifies address exists (for sub-resources like contacts)
- Validates required fields
- Returns `repo.create(prisma, { ...data })`

### 1.4 Repository Layer

**File:** `/home/tolga/projects/terp/src/lib/services/crm-address-repository.ts`

Pattern: Functional module with exported functions. Import:
```ts
import type { PrismaClient, CrmAddressType } from "@/generated/prisma/client"
```

Key repository patterns:

**Paginated list with search:**
```ts
export async function findMany(prisma: PrismaClient, tenantId: string, params: {...}) {
  const where: Record<string, unknown> = { tenantId }
  // ... build where conditions
  if (params.search) {
    where.OR = [
      { company: { contains: term, mode: "insensitive" } },
      // ...
    ]
  }
  const [items, total] = await Promise.all([
    prisma.crmAddress.findMany({
      where,
      orderBy: { company: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.crmAddress.count({ where }),
  ])
  return { items, total }
}
```

**Find by ID with includes:**
```ts
export async function findById(prisma: PrismaClient, tenantId: string, id: string) {
  return prisma.crmAddress.findFirst({
    where: { id, tenantId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
    },
  })
}
```

**Hard delete (used for child records):**
```ts
export async function deleteContact(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.crmContact.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
```

### 1.5 tRPC Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/crm/addresses.ts`

Complete pattern:

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmAddressService from "@/lib/services/crm-address-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
const CRM_CREATE = permissionIdByKey("crm_addresses.create")!
const CRM_EDIT = permissionIdByKey("crm_addresses.edit")!
const CRM_DELETE = permissionIdByKey("crm_addresses.delete")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// --- Router ---
export const crmAddressesRouter = createTRPCRouter({
  list: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ ... }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
  // ...
})
```

Key pattern: All procedures use `crmProcedure` (which is `tenantProcedure.use(requireModule("crm"))`), then chain `.use(requirePermission(...))`.

The Prisma client cast `ctx.prisma as unknown as PrismaClient` is used consistently in all procedures.

### 1.6 CRM Router Index (Sub-Router Merging)

**File:** `/home/tolga/projects/terp/src/trpc/routers/crm/index.ts`

```ts
import { createTRPCRouter } from "@/trpc/init"
import { crmAddressesRouter } from "./addresses"
import { numberSequencesRouter } from "./numberSequences"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  numberSequences: numberSequencesRouter,
})
```

The correspondence router will be added here as a new sub-router, e.g.:
```ts
correspondence: crmCorrespondenceRouter,
```

### 1.7 Root Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/_app.ts`

The CRM router is already registered:
```ts
import { crmRouter } from "./crm"
// ...
crm: crmRouter,
```

No changes needed here since correspondence is added as a sub-router within the CRM router.

### 1.8 UI Components

All in `/home/tolga/projects/terp/src/components/crm/`:

| File | Purpose |
|------|---------|
| `address-data-table.tsx` | Table with selection, badges, dropdown actions |
| `address-form-sheet.tsx` | Sheet form for create/edit (uses Sheet component) |
| `contact-list.tsx` | Table list for contacts (sub-resource of address) |
| `contact-form-dialog.tsx` | Dialog form for create/edit contacts |
| `bank-account-list.tsx` | Table list for bank accounts |
| `bank-account-form-dialog.tsx` | Dialog form for create/edit bank accounts |

UI component patterns:
- All use `'use client'` directive
- All use `useTranslations('crmAddresses')` from `next-intl`
- Components from `@/components/ui/` (shadcn/ui)
- Icons from `lucide-react`
- Mutations from `@/hooks`

### 1.9 Address Detail Page (Tab Structure)

**File:** `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`

The page uses `Tabs` from `@/components/ui/tabs` with these tabs:
- `overview` (default) — address data in Card grid
- `contacts` — ContactList component
- `bankAccounts` — BankAccountList component
- `correspondence` — **PLACEHOLDER** with "In Vorbereitung -- CRM_02"
- `inquiries` — placeholder
- `documents` — placeholder

The correspondence tab currently renders:
```tsx
<TabsContent value="correspondence" className="mt-6">
  <Card>
    <CardContent className="flex items-center justify-center py-16">
      <p className="text-muted-foreground">{t('comingSoon')} — CRM_02</p>
    </CardContent>
  </Card>
</TabsContent>
```

This needs to be replaced with the actual CorrespondenceList component.

### 1.10 Hooks

**File:** `/home/tolga/projects/terp/src/hooks/use-crm-addresses.ts`

Pattern:
```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useCrmAddresses(options: UseCrmAddressesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.list.queryOptions(
      { search: input.search, ... },
      { enabled }
    )
  )
}

export function useCreateCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
    },
  })
}
```

**Hooks barrel export:** `/home/tolga/projects/terp/src/hooks/index.ts`

CRM hooks are exported at the bottom of the file:
```ts
// CRM Addresses
export {
  useCrmAddresses,
  useCrmAddress,
  useCreateCrmAddress,
  useUpdateCrmAddress,
  useDeleteCrmAddress,
  useRestoreCrmAddress,
  useCrmContacts,
  useCreateCrmContact,
  useUpdateCrmContact,
  useDeleteCrmContact,
  useCrmBankAccounts,
  useCreateCrmBankAccount,
  useUpdateCrmBankAccount,
  useDeleteCrmBankAccount,
} from './use-crm-addresses'
```

### 1.11 Permissions

**File:** `/home/tolga/projects/terp/src/lib/auth/permission-catalog.ts`

CRM permissions are at the end of `ALL_PERMISSIONS` array:
```ts
// CRM Module
p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
p("crm_addresses.create", "crm_addresses", "create", "Create CRM addresses"),
p("crm_addresses.edit", "crm_addresses", "edit", "Edit CRM addresses"),
p("crm_addresses.delete", "crm_addresses", "delete", "Delete CRM addresses"),
```

Permission ID generation:
```ts
const PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"
function permissionId(key: string): string {
  return uuidv5(key, PERMISSION_NAMESPACE)
}
```

New permissions to add for CRM_02:
```ts
p("crm_correspondence.view", "crm_correspondence", "view", "View CRM correspondence"),
p("crm_correspondence.create", "crm_correspondence", "create", "Create CRM correspondence"),
p("crm_correspondence.edit", "crm_correspondence", "edit", "Edit CRM correspondence"),
p("crm_correspondence.delete", "crm_correspondence", "delete", "Delete CRM correspondence"),
```

### 1.12 i18n Messages

**Files:**
- `/home/tolga/projects/terp/messages/de.json`
- `/home/tolga/projects/terp/messages/en.json`

CRM address translations are under the key `"crmAddresses"` (lines 5053+).

The tab translations already exist:
```json
"tabCorrespondence": "Korrespondenz"
```
```json
"tabCorrespondence": "Correspondence"
```

New translations needed for correspondence will be a new top-level key like `"crmCorrespondence"`.

---

## 2. Architecture Patterns

### 2.1 Service Class Structure

**Pattern:** Functional module (not class-based). All functions are `export async function`.

**Imports:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./crm-address-repository"
```

**Error classes defined at top:**
- `XxxNotFoundError` (ends with `NotFoundError`)
- `XxxValidationError` (ends with `ValidationError`)
- No need for `ConflictError` or `ForbiddenError` unless the service itself checks conflicts/permissions

**Function signature pattern:**
```ts
export async function list(prisma: PrismaClient, tenantId: string, params: {...})
export async function getById(prisma: PrismaClient, tenantId: string, id: string)
export async function create(prisma: PrismaClient, tenantId: string, input: {...}, createdById: string)
export async function update(prisma: PrismaClient, tenantId: string, input: { id: string, ...fields })
export async function remove(prisma: PrismaClient, tenantId: string, id: string)
```

**Validation in create:**
1. Check parent exists (e.g., address belongs to tenant)
2. Validate required fields
3. Call `repo.create(prisma, { ...data })`

**Validation in update:**
1. Check existing record exists: `const existing = await repo.findById(prisma, tenantId, input.id)`
2. Throw NotFoundError if null
3. Build update data object selectively
4. Call `repo.update(prisma, tenantId, input.id, data)`

### 2.2 Repository Class Structure

**Pattern:** Functional module. All functions are `export async function`.

**Paginated list:** Returns `{ items, total }` using `Promise.all([findMany, count])`.

**Search with ILIKE:** Uses Prisma `contains` with `mode: "insensitive"`:
```ts
where.OR = [
  { company: { contains: term, mode: "insensitive" } },
]
```

### 2.3 tRPC Router Structure

**Procedure chain:** `tenantProcedure.use(requireModule("crm")).use(requirePermission(PERM_ID))`

**Error handling:** All procedures use try/catch with `handleServiceError(err)`.

**Prisma cast:** `ctx.prisma as unknown as PrismaClient`

**Delete return:** `return { success: true }`

### 2.4 Module Guard (requireModule)

**File:** `/home/tolga/projects/terp/src/lib/modules/index.ts`

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    // Checks prisma.tenantModule.findUnique
    // Throws TRPCError FORBIDDEN if module not enabled
  })
}
```

Usage in router: `const crmProcedure = tenantProcedure.use(requireModule("crm"))`

### 2.5 handleServiceError

**File:** `/home/tolga/projects/terp/src/trpc/errors.ts`

Maps error class names to tRPC codes:
- `*NotFoundError` -> `NOT_FOUND`
- `*ValidationError` / `*InvalidError` -> `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` -> `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` -> `FORBIDDEN`
- Prisma P2025 -> `NOT_FOUND`
- Prisma P2002 -> `CONFLICT`
- Prisma P2003 -> `BAD_REQUEST`

---

## 3. Test Patterns

### 3.1 Router Test Pattern (Vitest)

**File:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/crmAddresses-router.test.ts`

**Test helpers:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/helpers.ts`

Key helper functions:
- `createMockContext(overrides)` — creates TRPCContext with auto-mocked Prisma
- `createMockSession()` — creates mock Supabase Session
- `createUserWithPermissions(permissionIds, overrides)` — creates ContextUser with specific permissions
- `createMockUserTenant(userId, tenantId)` — creates UserTenant join record
- `autoMockPrisma(partial)` — auto-stubs undefined Prisma methods

**Module mock pattern (required for requireModule):**
```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}
```

**Context creation for tests:**
```ts
function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [CRM_VIEW, CRM_CREATE, CRM_EDIT, CRM_DELETE]
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

**Caller creation:**
```ts
const createCaller = createCallerFactory(crmAddressesRouter)
const caller = createCaller(createTestContext(prisma))
const result = await caller.list({ page: 1, pageSize: 10 })
```

**Permission test pattern:**
```ts
it("rejects without crm_addresses.view permission", async () => {
  const prisma = { crmAddress: { findMany: vi.fn(), count: vi.fn() } }
  const caller = createCaller(createNoPermContext(prisma))
  await expect(caller.list({ page: 1, pageSize: 10 })).rejects.toThrow("Insufficient permissions")
})
```

### 3.2 No Service-Level Unit Tests for CRM_01

There are no files in `src/lib/services/__tests__/crm*`. CRM_01 only has router-level tests. The ticket for CRM_02 calls for service tests at `src/lib/services/__tests__/crm-correspondence-service.test.ts`.

### 3.3 E2E Browser Test Pattern (Playwright)

**File:** `/home/tolga/projects/terp/src/e2e-browser/20-crm-addresses.spec.ts`

**Config:** `/home/tolga/projects/terp/playwright.config.ts`
- `testDir: "src/e2e-browser"`
- `workers: 1` (serial)
- `viewport: { width: 1280, height: 1080 }`
- `locale: "de-DE"`
- `storageState: ".auth/admin.json"` (pre-authenticated)

**Setup:** `/home/tolga/projects/terp/src/e2e-browser/auth.setup.ts` — saves admin/user sessions

**Global cleanup:** `/home/tolga/projects/terp/src/e2e-browser/global-setup.ts` — runs SQL to delete E2E data

Current CRM cleanup SQL:
```sql
DELETE FROM crm_contacts WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
DELETE FROM crm_bank_accounts WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
DELETE FROM crm_addresses WHERE company LIKE 'E2E%';
DELETE FROM number_sequences WHERE key IN ('customer', 'supplier');
```

CRM_02 will need to add:
```sql
DELETE FROM crm_correspondences WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
```

**Helpers:**
- `/home/tolga/projects/terp/src/e2e-browser/helpers/nav.ts` — `navigateTo`, `waitForTableLoad`, `expectPageTitle`
- `/home/tolga/projects/terp/src/e2e-browser/helpers/auth.ts` — `loginAsAdmin`, constants
- `/home/tolga/projects/terp/src/e2e-browser/helpers/forms.ts` — `fillInput`, `selectOption`, `waitForSheet`, `submitAndWaitForClose`, `expectTableContains`, `clickTab`, `openRowActions`, `clickMenuItem`

**Test structure:**
```ts
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import { fillInput, selectOption, submitAndWaitForClose, ... } from "./helpers/forms";

test.describe.serial("UC-CRM-01: Address Management", () => {
  test("enable CRM module", async ({ page }) => { ... });
  test("create a customer address", async ({ page }) => { ... });
  // ...
});
```

CRM address E2E tests verify:
1. Module enabling via admin settings
2. Create address via sheet form
3. Search and filter
4. Navigate to detail page
5. Tabs: overview, contacts (add), bank accounts (add)
6. Placeholder tabs show "In Vorbereitung"
7. Soft-delete and restore

---

## 4. UI Patterns (Detail)

### 4.1 Sheet Form Pattern

Used for address create/edit. Structure:
```tsx
<Sheet open={open} onOpenChange={handleClose}>
  <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden">
    <SheetHeader>
      <SheetTitle>{isEdit ? t('editTitle') : t('createTitle')}</SheetTitle>
      <SheetDescription>...</SheetDescription>
    </SheetHeader>
    <div className="flex-1 overflow-y-auto min-h-0 -mx-4 px-4">
      <div className="space-y-6 py-4">
        {/* Form sections */}
      </div>
    </div>
    <SheetFooter className="flex-row gap-2 border-t pt-4">
      <Button variant="outline" onClick={handleClose}>Cancel</Button>
      <Button onClick={handleSubmit}>Submit</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

### 4.2 Dialog Form Pattern

Used for contacts and bank accounts. Structure:
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>...</DialogTitle>
      <DialogDescription>{''}</DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-4">
      {/* Form fields */}
      {error && <Alert variant="destructive">...</Alert>}
    </div>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button onClick={handleSubmit}>Submit</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 4.3 Table/List Component Pattern

Sub-resource lists (contacts, bank accounts) follow:
```tsx
<div className="space-y-4">
  <div className="flex items-center justify-between">
    <h3 className="text-lg font-medium">{title}</h3>
    <Button size="sm" onClick={onAdd}>
      <Plus className="mr-2 h-4 w-4" />
      {addLabel}
    </Button>
  </div>
  {items.length === 0 ? (
    <p className="text-sm text-muted-foreground py-4">empty message</p>
  ) : (
    <Table>...</Table>
  )}
</div>
```

### 4.4 Data Table with Pagination (Address List Page)

The address list page (`/crm/addresses/page.tsx`) manages:
- Search, type filter, active/inactive filter
- Pagination state (`page`, `totalPages`)
- Sheet form state (create/edit)
- Delete confirmation dialog

```tsx
const { data, isLoading } = useCrmAddresses({
  page, pageSize: 25, search, type: typeFilter, isActive: activeFilter, enabled: canAccess !== false,
})
```

### 4.5 Confirm Dialog Pattern

```tsx
<ConfirmDialog
  open={!!deleteAddress}
  onOpenChange={(open) => !open && setDeleteAddress(null)}
  title={t('deactivateAddress')}
  description={t('deactivateDescription', { company: deleteAddress?.company ?? '' })}
  confirmLabel={t('confirm')}
  onConfirm={handleConfirmDelete}
  variant="destructive"
/>
```

---

## 5. Prisma Schema — Convention Summary for CRM_02

### 5.1 Enum Convention

```prisma
enum CrmCorrespondenceDirection {
  INCOMING
  OUTGOING
  INTERNAL

  @@map("crm_correspondence_direction")
}
```

### 5.2 Model Convention

```prisma
model CrmCorrespondence {
  id            String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                      @map("tenant_id") @db.Uuid
  // ... fields using @map("snake_case")
  createdAt     DateTime                    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime                    @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)
  contact CrmContact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@index([tenantId, addressId])
  @@index([tenantId, date])
  @@map("crm_correspondences")
}
```

### 5.3 Required Relations Updates

The `CrmAddress` model needs a new reverse relation:
```prisma
correspondences CrmCorrespondence[]
```

The `CrmContact` model needs a new reverse relation:
```prisma
correspondences CrmCorrespondence[]
```

The `Tenant` model needs a new reverse relation:
```prisma
crmCorrespondences CrmCorrespondence[]
```

---

## 6. Files to Create/Modify (Summary)

### New files:
1. `supabase/migrations/20260101000096_create_crm_correspondences.sql`
2. `src/lib/services/crm-correspondence-service.ts`
3. `src/lib/services/crm-correspondence-repository.ts`
4. `src/trpc/routers/crm/correspondence.ts`
5. `src/hooks/use-crm-correspondence.ts`
6. `src/components/crm/correspondence-list.tsx`
7. `src/components/crm/correspondence-form-sheet.tsx`
8. `src/components/crm/correspondence-detail-dialog.tsx`
9. `src/components/crm/correspondence-type-badge.tsx`
10. `src/lib/services/__tests__/crm-correspondence-service.test.ts`
11. `src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`
12. `src/e2e-browser/21-crm-correspondence.spec.ts`

### Files to modify:
1. `prisma/schema.prisma` — add enum + model + reverse relations
2. `src/lib/auth/permission-catalog.ts` — add 4 permission entries
3. `src/trpc/routers/crm/index.ts` — add correspondence sub-router
4. `src/hooks/index.ts` — add CRM correspondence exports
5. `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` — replace correspondence placeholder tab
6. `messages/de.json` — add `crmCorrespondence` translations
7. `messages/en.json` — add `crmCorrespondence` translations
8. `src/e2e-browser/global-setup.ts` — add correspondence cleanup SQL

### Optional new files (global page):
- `src/app/[locale]/(dashboard)/crm/correspondence/page.tsx`
