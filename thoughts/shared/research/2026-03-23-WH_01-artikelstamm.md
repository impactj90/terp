# WH_01 Artikelstamm - Codebase Research

## 1. Existing Warehouse Module

**Current state**: A placeholder warehouse router exists but is empty and NOT wired into the root router.

**File**: `src/trpc/routers/warehouse/index.ts`
```ts
import { createTRPCRouter } from "@/trpc/init"
export const warehouseRouter = createTRPCRouter({})
```

**Root router** (`src/trpc/routers/_app.ts`): Does NOT import or mount the `warehouseRouter`. It must be added as:
```ts
import { warehouseRouter } from "./warehouse"
// ...
warehouse: warehouseRouter,
```

**Module constants** (`src/lib/modules/constants.ts`): `"warehouse"` is already listed in `AVAILABLE_MODULES`.

**Module guard** (`src/lib/modules/index.ts`): `requireModule("warehouse")` is ready to use. The warehouse router comment says "Guarded by requireModule("warehouse")."

**App routing**: No `src/app/[locale]/(dashboard)/warehouse/` directory exists yet. Must be created.

**No existing Prisma models**: `prisma/schema.prisma` (4140 lines) contains no `Wh*` models. No warehouse services exist in `src/lib/services/`.

---

## 2. Service + Repository Pattern

### Pattern Overview
- **Service** (`*-service.ts`): Business logic, validation, error throwing, audit logging
- **Repository** (`*-repository.ts`): Pure Prisma data-access, no business logic
- **Error classes**: Named `*NotFoundError`, `*ValidationError`, `*ConflictError` (auto-mapped by `handleServiceError`)

### Example: CRM Address

**Service** (`src/lib/services/crm-address-service.ts`):
```ts
import type { PrismaClient, CrmAddressType } from "@/generated/prisma/client"
import * as repo from "./crm-address-repository"
import * as numberSeqService from "./number-sequence-service"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

const ADDRESS_TRACKED_FIELDS = [
  "type", "company", "street", "zip", "city", ...
]

// Error classes with naming convention
export class CrmAddressNotFoundError extends Error {
  constructor(message = "CRM address not found") {
    super(message); this.name = "CrmAddressNotFoundError"
  }
}
export class CrmAddressValidationError extends Error { ... }
export class CrmAddressConflictError extends Error { ... }

// Service functions
export async function list(prisma: PrismaClient, tenantId: string, params: {...}) {
  return repo.findMany(prisma, tenantId, params)
}

export async function create(prisma, tenantId, input, createdById, audit?) {
  // 1. Validate
  // 2. Get next number from NumberSequence
  const number = await numberSeqService.getNextNumber(prisma, tenantId, numberKey)
  // 3. Call repository
  const created = await repo.create(prisma, { tenantId, number, ... })
  // 4. Audit log (fire-and-forget)
  if (audit) {
    await auditLog.log(prisma, { ... }).catch(err => console.error('[AuditLog] Failed:', err))
  }
  return created
}

export async function update(prisma, tenantId, input, audit?) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new CrmAddressNotFoundError()
  // Build data object from changed fields
  const data: Record<string, unknown> = {}
  // ... update fields
  const updated = await repo.update(prisma, tenantId, input.id, data)
  // Audit with computeChanges
  if (audit) {
    const changes = auditLog.computeChanges(existing, updated, ADDRESS_TRACKED_FIELDS)
    await auditLog.log(prisma, { ... }).catch(...)
  }
  return updated
}
```

**Repository** (`src/lib/services/crm-address-repository.ts`):
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function findMany(prisma, tenantId, params) {
  const where: Record<string, unknown> = { tenantId }
  // Build where clause from params
  const [items, total] = await Promise.all([
    prisma.crmAddress.findMany({ where, orderBy, skip, take }),
    prisma.crmAddress.count({ where }),
  ])
  return { items, total }
}

export async function findById(prisma, tenantId, id) {
  return prisma.crmAddress.findFirst({
    where: { id, tenantId },
    include: { contacts: {...}, bankAccounts: {...} },
  })
}

export async function create(prisma, data) {
  return prisma.crmAddress.create({ data })
}

export async function update(prisma, tenantId, id, data) {
  return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, data, { entity: "CrmAddress" })
}

export async function softDelete(prisma, tenantId, id) {
  return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, { isActive: false }, { entity: "CrmAddress" })
}

export async function restore(prisma, tenantId, id) {
  return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, { isActive: true }, { entity: "CrmAddress" })
}
```

### Example: Department Service (simpler, with tree)

**File**: `src/lib/services/department-service.ts`
- Same pattern: error classes, `list`, `getTree`, `getById`, `create`, `update`
- Includes `checkCircularReference()` for self-referential parent validation

**File**: `src/lib/services/department-repository.ts`
- `findAllForTree()` - fetches all departments flat, tree built in router
- `findByCode()` - uniqueness check helper

---

## 3. tRPC Router Pattern

### Module-scoped sub-router pattern (Billing)

**Index file** (`src/trpc/routers/billing/index.ts`):
```ts
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"
import { billingServiceCasesRouter } from "./serviceCases"
// ...

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
  priceLists: billingPriceListsRouter,
  // ...
})
```

### Sub-router with nested procedures (Billing Documents)

**File**: `src/trpc/routers/billing/documents.ts`
```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as billingDocService from "@/lib/services/billing-document-service"
import type { PrismaClient } from "@/generated/prisma/client"

// Permission constants
const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const BILLING_CREATE = permissionIdByKey("billing_documents.create")!
// ...

// Base procedure with module guard
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// Router with nested sub-router for positions
export const billingDocumentsRouter = createTRPCRouter({
  list: billingProcedure.use(requirePermission(BILLING_VIEW)).input(...).query(...),
  getById: billingProcedure.use(requirePermission(BILLING_VIEW)).input(...).query(...),
  create: billingProcedure.use(requirePermission(BILLING_CREATE)).input(...).mutation(...),
  // Nested sub-router
  positions: createTRPCRouter({
    list: billingProcedure.use(requirePermission(BILLING_VIEW)).input(...).query(...),
    add: billingProcedure.use(requirePermission(BILLING_EDIT)).input(...).mutation(...),
    // ...
  }),
})
```

### CRM Address router pattern (contacts/bankAccounts as flat procedures)

**File**: `src/trpc/routers/crm/addresses.ts`

Uses flat naming convention for sub-resources:
- `contactsList`, `contactsCreate`, `contactsUpdate`, `contactsDelete`
- `bankAccountsList`, `bankAccountsCreate`, etc.

Each procedure follows the pattern:
```ts
procedureName: crmProcedure
  .use(requirePermission(PERM_ID))
  .input(z.object({ ... }))
  .query/mutation(async ({ ctx, input }) => {
    try {
      return await service.method(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input,
        { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

**Key pattern**: `ctx.prisma as unknown as PrismaClient` cast is used everywhere.

---

## 4. Permission Catalog

**File**: `src/lib/auth/permission-catalog.ts`

Permissions are structured as:
```ts
function p(key, resource, action, description): Permission {
  return { id: permissionId(key), key, resource, action, description }
}

// Usage pattern for modules:
p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
p("crm_addresses.create", "crm_addresses", "create", "Create CRM addresses"),
p("crm_addresses.edit", "crm_addresses", "edit", "Edit CRM addresses"),
p("crm_addresses.delete", "crm_addresses", "delete", "Delete CRM addresses"),
```

Permissions use UUID v5 from a fixed namespace. IDs are deterministic from key strings.

For WH_01, add to `ALL_PERMISSIONS` array:
```ts
// Warehouse Articles
p("wh_articles.view", "wh_articles", "view", "View warehouse articles"),
p("wh_articles.create", "wh_articles", "create", "Create warehouse articles"),
p("wh_articles.edit", "wh_articles", "edit", "Edit warehouse articles"),
p("wh_articles.delete", "wh_articles", "delete", "Delete warehouse articles"),
p("wh_article_groups.manage", "wh_article_groups", "manage", "Manage warehouse article groups"),
```

Usage in routers:
```ts
const WH_VIEW = permissionIdByKey("wh_articles.view")!
```

---

## 5. NumberSequence System

**Model** (`prisma/schema.prisma`):
```prisma
model NumberSequence {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  key       String   @db.VarChar(50)
  prefix    String   @default("") @db.VarChar(20)
  nextValue Int      @default(1) @map("next_value")
  // ...
  @@unique([tenantId, key])
  @@map("number_sequences")
}
```

**Service** (`src/lib/services/number-sequence-service.ts`):
```ts
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  supplier: "L-",
  inquiry: "V-",
  invoice: "RE-",
  service_case: "KD-",
  // Add: article: "ART-",
}

export async function getNextNumber(prisma, tenantId, key): Promise<string> {
  const defaultPrefix = DEFAULT_PREFIXES[key] ?? ""
  const seq = await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, key, prefix: defaultPrefix, nextValue: 2 },
  })
  const value = seq.nextValue - 1
  return `${seq.prefix}${value}`
}
```

**Usage in CRM Address service**:
```ts
const numberKey = type === "SUPPLIER" ? "supplier" : "customer"
const number = await numberSeqService.getNextNumber(prisma, tenantId, numberKey)
```

For WH_01: Add `article: "ART-"` to DEFAULT_PREFIXES and call `getNextNumber(prisma, tenantId, "article")` during article creation.

---

## 6. requireModule Middleware

**File**: `src/lib/modules/index.ts`

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    // Checks tenantId exists
    // "core" always passes
    // Otherwise checks TenantModule table
    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) throw new TRPCError({ code: "FORBIDDEN", message: `Module "${module}" is not enabled...` })
    return next({ ctx })
  })
}
```

**Usage**: `const whProcedure = tenantProcedure.use(requireModule("warehouse"))`

---

## 7. Prisma Schema Patterns

### CrmAddress model (reference for article model)
```prisma
model CrmAddress {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String         @map("tenant_id") @db.Uuid
  number          String         @db.VarChar(50)
  type            CrmAddressType @default(CUSTOMER)
  company         String         @db.VarChar(255)
  isActive        Boolean        @default(true) @map("is_active")
  createdAt       DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById     String?        @map("created_by_id") @db.Uuid

  tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, number], map: "uq_crm_addresses_tenant_number")
  @@index([tenantId], map: "idx_crm_addresses_tenant_id")
  @@map("crm_addresses")
}
```

### Department model (self-referential tree pattern)
```prisma
model Department {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  parentId          String?  @map("parent_id") @db.Uuid
  code              String   @db.VarChar(50)
  name              String   @db.VarChar(255)
  isActive          Boolean  @default(true) @map("is_active")

  parent    Department?  @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children  Department[] @relation("DepartmentTree")

  @@unique([tenantId, code])
  @@index([parentId])
  @@map("departments")
}
```

### Tenant model relations
New models need relation entries added to the Tenant model. Current last relations:
```prisma
billingRecurringInvoices BillingRecurringInvoice[]
```
Add after these for warehouse models.

---

## 8. Supabase Migrations

**Location**: `supabase/migrations/`
**Count**: 111 migration files
**Latest**: `20260322212629_cleanup_anti_pattern_indexes_tenant_first.sql`
**Naming**: `YYYYMMDDHHMMSS_description.sql`

To create a new migration:
```bash
pnpm db:migrate:new wh_articles_artikelstamm
```

This creates a file like `20260323XXXXXX_wh_articles_artikelstamm.sql`.

Migration SQL pattern (from existing CRM migration):
```sql
CREATE TABLE wh_article_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES wh_article_groups(id) ON DELETE SET NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  -- ...
  CONSTRAINT uq_wh_article_groups_tenant_code UNIQUE(tenant_id, code)
);
CREATE INDEX idx_wh_article_groups_tenant ON wh_article_groups(tenant_id);
```

After creating the migration SQL, update `prisma/schema.prisma` to match and run `pnpm db:generate`.

---

## 9. Root Router (_app.ts)

**File**: `src/trpc/routers/_app.ts`

Pattern for module routers (CRM, Billing):
```ts
import { crmRouter } from "./crm"
import { billingRouter } from "./billing"

export const appRouter = createTRPCRouter({
  // ...
  crm: crmRouter,
  billing: billingRouter,
})
```

The warehouse router needs to be imported and added similarly. The `warehouseRouter` import exists in warehouse/index.ts but is NOT imported in _app.ts yet.

---

## 10. Hooks Pattern

**File**: `src/hooks/use-crm-addresses.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// List hook with options
export function useCrmAddresses(options: UseCrmAddressesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.list.queryOptions(
      { search: input.search, page: input.page ?? 1, pageSize: input.pageSize ?? 25 },
      { enabled }
    )
  )
}

// Single item hook
export function useCrmAddress(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// Mutation hook with cache invalidation
export function useCreateCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.crm.addresses.list.queryKey() })
    },
  })
}
```

**Export barrel**: `src/hooks/index.ts` re-exports all hooks. New hooks must be added there.

---

## 11. UI Patterns

### List Page (`src/app/[locale]/(dashboard)/crm/addresses/page.tsx`)

Pattern:
- `'use client'` directive
- Uses `useTranslations('crmAddresses')` for i18n
- State: `page`, `search`, `typeFilter`, `activeFilter`, `createOpen`, `editAddress`, `deleteAddress`
- Permission check: `useHasPermission(['crm_addresses.view'])`
- Data fetching: `useCrmAddresses({ page, search, type, isActive, enabled })`
- Layout: Header with title + "New" button, filter bar, Card with DataTable, Pagination
- Dialogs: AddressFormSheet (create/edit), ConfirmDialog (delete)

### Detail Page (`src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`)

Pattern:
- Uses `useParams<{ id: string }>()` for URL params
- Uses `useCrmAddress(params.id)` to fetch
- Header: Back button, title, badges (type, status), action buttons
- Tabs: Overview, Contacts, BankAccounts, Correspondence, etc.
- Overview tab: Grid of Cards with `<DetailRow label={} value={} />`
- Sub-resource tabs: embedded list components with add/edit/delete

### Form Sheet (`src/components/crm/address-form-sheet.tsx`)

Pattern:
- Uses `Sheet` from `@/components/ui/sheet`
- Internal `FormState` interface with all string fields
- `INITIAL_STATE` constant
- `useCreateCrmAddress()` and `useUpdateCrmAddress()` hooks
- Form with `Input`, `Label`, `Select`, `Textarea` components
- Submit handler builds payload and calls mutation

---

## 12. App Routing

**Pattern**: `src/app/[locale]/(dashboard)/crm/addresses/page.tsx`

For warehouse:
```
src/app/[locale]/(dashboard)/warehouse/articles/page.tsx       -- Article list
src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx  -- Article detail
src/app/[locale]/(dashboard)/warehouse/groups/page.tsx         -- Article groups
```

No `warehouse/` app route exists yet.

---

## 13. Soft-Delete Pattern

**Repository** (`crm-address-repository.ts`):
```ts
export async function softDelete(prisma, tenantId, id) {
  return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, { isActive: false }, { entity: "CrmAddress" })
}

export async function restore(prisma, tenantId, id) {
  return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, { isActive: true }, { entity: "CrmAddress" })
}
```

**Service** (`crm-address-service.ts`):
```ts
export async function remove(prisma, tenantId, id, audit?) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new CrmAddressNotFoundError()
  await repo.softDelete(prisma, tenantId, id)
  // audit log...
}
```

**Router**: `delete` mutation calls `service.remove()` which does soft-delete. Separate `restore` mutation.

**List queries**: Default filter `isActive: true`, with option to show inactive.

---

## 14. CrmAddress Model (for Supplier Relation)

The `WhArticleSupplier` model needs to reference `CrmAddress` for the supplier.

**CrmAddress key fields**:
```prisma
model CrmAddress {
  id       String         @id @db.Uuid
  tenantId String         @map("tenant_id") @db.Uuid
  number   String         @db.VarChar(50)
  type     CrmAddressType @default(CUSTOMER)  // CUSTOMER, SUPPLIER, BOTH
  company  String         @db.VarChar(255)
  isActive Boolean        @default(true) @map("is_active")
  // ...
}

enum CrmAddressType {
  CUSTOMER
  SUPPLIER
  BOTH
  @@map("crm_address_type")
}
```

The article-supplier junction table should reference `crm_addresses(id)` and include supplier-specific fields (supplier article number, lead time, etc.).

---

## 15. Tree/Hierarchy Pattern

**Department model** is the primary tree example:
- Self-referential `parentId` FK
- `parent` and `children` Prisma relations with `@relation("DepartmentTree")`
- `onDelete: SetNull` for parent reference

**Tree building in router** (`src/trpc/routers/departments.ts`):
```ts
function buildDepartmentTree(departments: DepartmentOutput[]): DepartmentTreeNode[] {
  const nodeMap = new Map<string, DepartmentTreeNode>()
  for (const dept of departments) {
    nodeMap.set(dept.id, { department: dept, children: [] })
  }
  const roots: DepartmentTreeNode[] = []
  for (const dept of departments) {
    const node = nodeMap.get(dept.id)!
    if (dept.parentId === null) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(dept.parentId)
      if (parent) parent.children.push(node)
    }
  }
  return roots
}
```

**Circular reference check** (department-service.ts):
```ts
async function checkCircularReference(prisma, tenantId, deptId, proposedParentId): Promise<boolean> {
  const visited = new Set<string>([deptId])
  let current: string | null = proposedParentId
  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)
    const record = await repo.findParentId(prisma, tenantId, current)
    if (!record) break
    current = record.parentId
  }
  return false
}
```

---

## Key Utility References

### `tenantScopedUpdate` (`src/lib/services/prisma-helpers.ts`)
```ts
export async function tenantScopedUpdate(delegate, where, data, opts?) {
  const { count } = await delegate.updateMany({ where, data })
  if (count === 0) throw new TenantScopedNotFoundError(opts?.entity)
  return await delegate.findFirst({ where, ...opts })
}
```

### `handleServiceError` (`src/trpc/errors.ts`)
Maps error class names to tRPC codes:
- `*NotFoundError` -> `NOT_FOUND`
- `*ValidationError` / `*InvalidError` -> `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` -> `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` -> `FORBIDDEN`
- Prisma P2025 -> NOT_FOUND, P2002 -> CONFLICT, P2003 -> BAD_REQUEST

### AuditContext (`src/lib/services/audit-logs-service.ts`)
```ts
export interface AuditContext {
  userId: string
  ipAddress?: string | null
  userAgent?: string | null
}
```

### Test Helpers (`src/trpc/routers/__tests__/helpers.ts`)
- `createMockContext()` - creates TRPCContext with auto-mocked Prisma
- `createUserWithPermissions()` - creates user with specific permission IDs
- `createMockUserTenant()` - creates UserTenant for tenant access
- `autoMockPrisma()` - Proxy-based auto-stubbing of undefined Prisma methods
- Module mock pattern: `vi.mock("@/lib/db", ...)` with `tenantModule.findUnique` returning the module

### tRPC Procedure Chain
```
publicProcedure -> protectedProcedure (requires auth) -> tenantProcedure (requires tenant) -> use(requireModule("warehouse")) -> use(requirePermission(PERM_ID))
```
