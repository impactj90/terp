# Research: ORD_04 Preislisten (Price Lists)

Date: 2026-03-18
Ticket: `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_04_PREISLISTEN.md`

---

## 1. Existing Billing Module Architecture

### Billing Router Structure

**File:** `src/trpc/routers/billing/index.ts`

The billing router merges sub-routers under `billing.*`:

```ts
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"
import { billingServiceCasesRouter } from "./serviceCases"
import { billingPaymentsRouter } from "./payments"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
})
```

The new `priceLists` router will be added as a fourth entry:
```ts
priceLists: billingPriceListsRouter,
```

### Root Router Registration

**File:** `src/trpc/routers/_app.ts` (line 82, 159)

The billing router is already registered:
```ts
import { billingRouter } from "./billing"
// ...
billing: billingRouter,
```

No changes needed in `_app.ts` since the priceLists sub-router is nested inside `billingRouter`.

### Existing Billing Sub-Routers

| File | Exported As | Key |
|------|-------------|-----|
| `src/trpc/routers/billing/documents.ts` | `billingDocumentsRouter` | `billing.documents.*` |
| `src/trpc/routers/billing/serviceCases.ts` | `billingServiceCasesRouter` | `billing.serviceCases.*` |
| `src/trpc/routers/billing/payments.ts` | `billingPaymentsRouter` | `billing.payments.*` |

### Billing Services/Repositories

| Service | Repository |
|---------|-----------|
| `src/lib/services/billing-document-service.ts` | `src/lib/services/billing-document-repository.ts` |
| `src/lib/services/billing-document-pdf-service.ts` | (uses billing-document-repository) |
| `src/lib/services/billing-service-case-service.ts` | `src/lib/services/billing-service-case-repository.ts` |
| `src/lib/services/billing-payment-service.ts` | `src/lib/services/billing-payment-repository.ts` |

### Billing Hooks

| File | Exported Hooks |
|------|---------------|
| `src/hooks/use-billing-documents.ts` | `useBillingDocuments`, `useBillingDocumentById`, `useCreateBillingDocument`, etc. |
| `src/hooks/use-billing-service-cases.ts` | `useBillingServiceCases`, `useBillingServiceCase`, etc. |
| `src/hooks/use-billing-payments.ts` | `useBillingOpenItems`, `useBillingPayments`, `useCreateBillingPayment`, etc. |

### Billing UI Components

All in `src/components/billing/`:

| Component | Purpose |
|-----------|---------|
| `document-list.tsx` | Data table for billing documents |
| `document-detail.tsx` | Document detail page |
| `document-form.tsx` | Create/edit document form |
| `document-position-table.tsx` | Inline position management |
| `document-type-badge.tsx` | Colored type badges |
| `document-status-badge.tsx` | Status badges |
| `document-totals-summary.tsx` | Totals display |
| `document-forward-dialog.tsx` | Forward workflow dialog |
| `document-print-dialog.tsx` | Print/PDF dialog |
| `service-case-list.tsx` | Service case list |
| `service-case-detail.tsx` | Service case detail |
| `service-case-form-sheet.tsx` | Create/edit sheet |
| `service-case-status-badge.tsx` | Status badge |
| `service-case-close-dialog.tsx` | Close dialog |
| `service-case-invoice-dialog.tsx` | Invoice creation dialog |
| `open-item-list.tsx` | Open items list |
| `open-item-detail.tsx` | Open item detail |
| `open-items-summary-card.tsx` | KPI cards |
| `payment-form-dialog.tsx` | Payment recording dialog |
| `payment-status-badge.tsx` | Payment status badge |
| `payment-cancel-dialog.tsx` | Cancel payment dialog |

### Billing Page Routes

All under `src/app/[locale]/(dashboard)/orders/`:

| Route | File | Component |
|-------|------|-----------|
| `/orders/documents` | `documents/page.tsx` | `<BillingDocumentList />` |
| `/orders/documents/[id]` | `documents/[id]/page.tsx` | `<BillingDocumentDetail />` |
| `/orders/documents/new` | `documents/new/page.tsx` | `<BillingDocumentForm />` |
| `/orders/service-cases` | `service-cases/page.tsx` | `<ServiceCaseList />` |
| `/orders/service-cases/[id]` | `service-cases/[id]/page.tsx` | `<ServiceCaseDetail />` |
| `/orders/open-items` | `open-items/page.tsx` | `<OpenItemList />` |
| `/orders/open-items/[documentId]` | `open-items/[documentId]/page.tsx` | `<OpenItemDetail />` |

Page pattern is minimal -- delegates to component:
```tsx
import { ServiceCaseList } from "@/components/billing/service-case-list"
export default function BillingServiceCasesPage() {
  return <ServiceCaseList />
}
```

Detail pages use `useParams`:
```tsx
'use client'
import { useParams } from 'next/navigation'
import { ServiceCaseDetail } from "@/components/billing/service-case-detail"
export default function BillingServiceCaseDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <ServiceCaseDetail id={params.id} />
    </div>
  )
}
```

---

## 2. Prisma Schema

### Existing Billing Models

Location in `prisma/schema.prisma`:
- Billing enums: lines 402-449 (BillingDocumentType, BillingDocumentStatus, BillingPositionType, BillingPriceType, BillingServiceCaseStatus)
- BillingPayment enums: lines 767-779 (BillingPaymentType, BillingPaymentStatus)
- BillingDocument model: lines 605-679
- BillingDocumentPosition model: lines 688-712
- BillingServiceCase model: lines 721-747+
- BillingPayment model: lines 781-803

### CrmAddress Model (lines 268-313)

The `priceListId` field already exists at line 290:
```prisma
priceListId     String?        @map("price_list_id") @db.Uuid
```

However, there is **no Prisma relation** defined yet -- no `priceList BillingPriceList?` line and no FK constraint in the DB. The `price_list_id` column was created in migration `000095` as a bare UUID column without a REFERENCES constraint.

This means:
1. The DB column exists already -- migration needs to ADD the FK constraint
2. The Prisma model needs a relation line added
3. The CrmAddress model's relations section (lines 296-305) needs updating

### BillingPriceList / BillingPriceListEntry -- DO NOT EXIST YET

No models, no enums, no tables. These must be created from scratch.

### Tenant Model Relations (lines 85-192)

The Tenant model has relation arrays for all billing entities:
```prisma
billingDocuments            BillingDocument[]
billingServiceCases         BillingServiceCase[]
billingPayments             BillingPayment[]
```

Must add: `billingPriceLists BillingPriceList[]`

### Model Definition Pattern

All models follow this pattern:
```prisma
// Comment block with migration reference
model ModelName {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  // ... fields with @map("snake_case") and @db.Type
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // ... other relations

  @@index([tenantId, ...])
  @@map("snake_case_table_name")
}
```

### Where to Insert New Models

New BillingPriceList and BillingPriceListEntry models should be inserted after the BillingPayment model (after line 803), before the UserGroup model (line 816). This keeps all billing models together.

---

## 3. Permission System

### Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts`

Current billing permissions (lines 248-264):
```ts
// Billing Documents
p("billing_documents.view", ...),
p("billing_documents.create", ...),
p("billing_documents.edit", ...),
p("billing_documents.delete", ...),
p("billing_documents.finalize", ...),

// Billing Service Cases
p("billing_service_cases.view", ...),
p("billing_service_cases.create", ...),
p("billing_service_cases.edit", ...),
p("billing_service_cases.delete", ...),

// Billing Payments
p("billing_payments.view", ...),
p("billing_payments.create", ...),
p("billing_payments.cancel", ...),
```

New permissions to add (after billing_payments section):
```ts
// Billing Price Lists
p("billing_price_lists.view", "billing_price_lists", "view", "View price lists"),
p("billing_price_lists.manage", "billing_price_lists", "manage", "Manage price lists and entries"),
```

The `p()` function generates deterministic UUIDs via `uuidv5(key, PERMISSION_NAMESPACE)`.

Permission count comment at line 43 says "All 81 permissions" -- this must be updated to 83.

### Authorization Middleware

**File:** `src/lib/auth/middleware.ts`

Key functions:
- `requirePermission(...permissionIds: string[])` -- tRPC middleware checking if user has ANY of the specified permission UUIDs
- `requireSelfOrPermission(userIdGetter, permissionId)` -- self-access or permission
- `requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)` -- own vs all
- `applyDataScope()` -- adds DataScope to context

For price lists, only `requirePermission` is needed (same pattern as service cases).

### Module Guard

**File:** `src/lib/modules/index.ts`

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    // Checks tenantModule table for the specified module
  })
}
```

All billing routers use `tenantProcedure.use(requireModule("billing"))`.

---

## 4. Service + Repository Pattern

### Service Pattern (billing-service-case-service.ts)

**File:** `src/lib/services/billing-service-case-service.ts`

Key patterns:

1. **Error classes** at the top:
```ts
export class BillingServiceCaseNotFoundError extends Error {
  constructor(message = "Service case not found") {
    super(message); this.name = "BillingServiceCaseNotFoundError"
  }
}
export class BillingServiceCaseValidationError extends Error { ... }
export class BillingServiceCaseConflictError extends Error { ... }
```

Error class naming convention: `{Domain}NotFoundError`, `{Domain}ValidationError`, `{Domain}ConflictError`. These are mapped by `handleServiceError()` in `src/trpc/errors.ts` based on the class name suffix.

2. **Service functions** accept `(prisma: PrismaClient, tenantId: string, ...)` as first params
3. **Validation** is done in the service (e.g., checking address belongs to tenant)
4. **Repository** is imported as `import * as repo from "./billing-service-case-repository"`
5. Service delegates data access to repository functions

### Repository Pattern (billing-service-case-repository.ts)

**File:** `src/lib/services/billing-service-case-repository.ts`

Key patterns:

1. **Include constants** defined at the top:
```ts
const DETAIL_INCLUDE = {
  address: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
}
const LIST_INCLUDE = { ... }
```

2. **Standard CRUD functions**:
- `findMany(prisma, tenantId, params)` -- paginated list with where filters
- `findById(prisma, tenantId, id)` -- single record with includes
- `create(prisma, data)` -- create with includes
- `update(prisma, tenantId, id, data)` -- uses `updateMany` for tenant safety, then `findFirst` for return
- `remove(prisma, tenantId, id)` -- uses `deleteMany`, returns boolean

3. **Tenant isolation**: All queries include `tenantId` in the where clause. Uses `updateMany`/`deleteMany` for tenant-scoped safety (prevents cross-tenant access).

4. **Pagination**: Returns `{ items, total }` using `Promise.all([findMany, count])`.

### Error Handling Utility

**File:** `src/trpc/errors.ts`

`handleServiceError(err)` maps errors by class name suffix:
- `*NotFoundError` -> `TRPCError { code: "NOT_FOUND" }`
- `*ValidationError` / `*InvalidError` -> `TRPCError { code: "BAD_REQUEST" }`
- `*ConflictError` / `*DuplicateError` -> `TRPCError { code: "CONFLICT" }`
- `*ForbiddenError` / `*AccessDeniedError` -> `TRPCError { code: "FORBIDDEN" }`
- Prisma errors: P2025 -> NOT_FOUND, P2002 -> CONFLICT, P2003 -> BAD_REQUEST

---

## 5. tRPC Router Pattern

### Router Structure (billing/serviceCases.ts)

**File:** `src/trpc/routers/billing/serviceCases.ts`

Key patterns:

1. **Imports**:
```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as serviceCaseService from "@/lib/services/billing-service-case-service"
import type { PrismaClient } from "@/generated/prisma/client"
```

2. **Permission constants**:
```ts
const SC_VIEW = permissionIdByKey("billing_service_cases.view")!
const SC_CREATE = permissionIdByKey("billing_service_cases.create")!
```

3. **Base procedure with module guard**:
```ts
const billingProcedure = tenantProcedure.use(requireModule("billing"))
```

4. **Relaxed UUID pattern** (for Zod v4 compatibility with seed data):
```ts
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")
```

5. **Procedure definition**:
```ts
list: billingProcedure
  .use(requirePermission(SC_VIEW))
  .input(listInput)
  .query(async ({ ctx, input }) => {
    try {
      return await serviceCaseService.list(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

6. **Nested sub-routers** (from documents.ts, line 309):
```ts
positions: createTRPCRouter({
  list: billingProcedure.use(requirePermission(BILLING_VIEW)).input(...).query(...),
  add: billingProcedure.use(requirePermission(BILLING_EDIT)).input(...).mutation(...),
})
```

This pattern will be used for `entries` sub-router within `priceLists`.

---

## 6. Hooks Pattern

### Hook File Structure (use-billing-service-cases.ts)

**File:** `src/hooks/use-billing-service-cases.ts`

Key patterns:

1. **Imports**:
```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

2. **Query hook with options interface**:
```ts
interface UseBillingServiceCasesOptions {
  enabled?: boolean
  status?: "OPEN" | "IN_PROGRESS" | "CLOSED" | "INVOICED"
  // ...
}

export function useBillingServiceCases(options: UseBillingServiceCasesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.serviceCases.list.queryOptions(
      { /* input fields */ },
      { enabled }
    )
  )
}
```

3. **Single-item query hook**:
```ts
export function useBillingServiceCase(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.serviceCases.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}
```

4. **Mutation hooks with cache invalidation**:
```ts
export function useCreateBillingServiceCase() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.serviceCases.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.serviceCases.list.queryKey(),
      })
    },
  })
}
```

### Hooks Index Barrel Export

**File:** `src/hooks/index.ts` (lines 744-765)

All billing hooks are re-exported. New price list hooks must be added:
```ts
// Billing Price Lists
export {
  useBillingPriceLists,
  useBillingPriceList,
  useBillingPriceLookup,
  useCreateBillingPriceList,
  useUpdateBillingPriceList,
  useDeleteBillingPriceList,
  useSetDefaultBillingPriceList,
  useBillingPriceListEntries,
  useCreateBillingPriceListEntry,
  useUpdateBillingPriceListEntry,
  useDeleteBillingPriceListEntry,
  useBulkImportBillingPriceListEntries,
} from './use-billing-price-lists'
```

---

## 7. UI Component Pattern

### List Component Pattern (service-case-list.tsx)

**File:** `src/components/billing/service-case-list.tsx`

Structure:
- `'use client'` directive
- Uses `useRouter` for navigation
- State: `search`, `statusFilter`, `page`, `sheetOpen`
- Uses the custom hook: `useBillingServiceCases({ ... })`
- Layout: Header with title + "New" button, filters row, table, pagination
- Clicking a row navigates to detail: `router.push(\`/orders/service-cases/\${id}\`)`
- Sheet component for create/edit

### Data Table Pattern

Tables use `@/components/ui/table` (shadcn):
```tsx
<Table>
  <TableHeader>
    <TableRow><TableHead>...</TableHead></TableRow>
  </TableHeader>
  <TableBody>
    {items.map(item => <TableRow key={item.id} onClick={...}>...</TableRow>)}
  </TableBody>
</Table>
```

### Navigation/Sidebar

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

Billing section (lines 310-336):
```ts
{
  titleKey: 'billingSection',
  module: 'billing',
  items: [
    {
      titleKey: 'billingDocuments',
      href: '/orders/documents',
      icon: FileText,
      module: 'billing',
      permissions: ['billing_documents.view'],
    },
    {
      titleKey: 'billingServiceCases',
      href: '/orders/service-cases',
      icon: Wrench,
      module: 'billing',
      permissions: ['billing_service_cases.view'],
    },
    {
      titleKey: 'billingOpenItems',
      href: '/orders/open-items',
      icon: Wallet,
      module: 'billing',
      permissions: ['billing_payments.view'],
    },
  ],
},
```

New entry to add:
```ts
{
  titleKey: 'billingPriceLists',
  href: '/orders/price-lists',
  icon: /* ListOrdered, Tag, or similar from lucide-react */,
  module: 'billing',
  permissions: ['billing_price_lists.view'],
},
```

Must also add the icon import to the import block at the top of the file and add a translation key.

---

## 8. Page Route Pattern

### Route Structure

Base path: `src/app/[locale]/(dashboard)/orders/`

For price lists:
- `src/app/[locale]/(dashboard)/orders/price-lists/page.tsx` -- list page
- `src/app/[locale]/(dashboard)/orders/price-lists/[id]/page.tsx` -- detail page

### Page Component Pattern

Minimal -- delegates to component:
```tsx
// page.tsx (list)
import { PriceListList } from "@/components/billing/price-list-list"
export default function BillingPriceListsPage() {
  return <PriceListList />
}

// [id]/page.tsx (detail)
'use client'
import { useParams } from 'next/navigation'
import { PriceListDetail } from "@/components/billing/price-list-detail"
export default function BillingPriceListDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <PriceListDetail id={params.id} />
    </div>
  )
}
```

---

## 9. Test Patterns

### Router Test Pattern (billingServiceCases-router.test.ts)

**File:** `src/trpc/routers/__tests__/billingServiceCases-router.test.ts`

Key patterns:

1. **Imports**:
```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingServiceCasesRouter } from "../billing/serviceCases"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"
```

2. **Module mock** (required for all billing tests):
```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))
```

3. **Caller factory**:
```ts
const createCaller = createCallerFactory(billingServiceCasesRouter)
```

4. **Test context helpers**:
```ts
const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma, permissions = ALL_PERMS) {
  return createMockContext({
    prisma: withModuleMock(prisma),
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

5. **Test structure**:
```ts
describe("billing.serviceCases.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      billingServiceCase: {
        findMany: vi.fn().mockResolvedValue([mockData]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
  })

  it("requires permission", async () => {
    const caller = createCaller(createNoPermContext({}))
    await expect(caller.list({ page: 1, pageSize: 10 }))
      .rejects.toThrow("Insufficient permissions")
  })
})
```

### Test Helpers

**File:** `src/trpc/routers/__tests__/helpers.ts`

Available helpers:
- `createMockUser(overrides)` -- creates a ContextUser
- `createMockSession()` -- creates a Supabase Session
- `createMockContext(overrides)` -- creates a TRPCContext (auto-wraps prisma with `autoMockPrisma`)
- `createMockUserGroup(overrides)` -- creates a UserGroup
- `createAdminUser(overrides)` -- user with isAdmin UserGroup
- `createUserWithPermissions(permissionIds, overrides)` -- user with specific permissions
- `createMockTenant(overrides)` -- creates a Tenant
- `createMockUserTenant(userId, tenantId, tenant?)` -- creates a UserTenant join record
- `autoMockPrisma(partial)` -- Proxy that auto-stubs missing Prisma model methods

### E2E Browser Test Pattern (31-billing-service-cases.spec.ts)

**File:** `src/e2e-browser/31-billing-service-cases.spec.ts`

Key patterns:

1. **Imports**:
```ts
import { test, expect, type Page } from "@playwright/test"
import { navigateTo, waitForTableLoad } from "./helpers/nav"
import { fillInput, submitAndWaitForClose, waitForSheet, expectTableContains } from "./helpers/forms"
```

2. **Serial test describe** for multi-step scenarios:
```ts
test.describe.serial("UC-ORD-02: Praxisbeispiel ...", () => {
  test("Voraussetzung: ...", async ({ page }) => { ... })
  test("Schritt 1: ...", async ({ page }) => { ... })
  test("Schritt 2: ...", async ({ page }) => { ... })
})
```

3. **Navigation helpers**:
```ts
await navigateTo(page, "/orders/service-cases")
await waitForTableLoad(page)
```

4. **Form interaction**:
```ts
await page.getByRole("button", { name: "Neuer Serviceauftrag" }).click()
await waitForSheet(page)
await page.locator("#sc-title").fill("Heizungsreparatur")
await submitAndWaitForClose(page)
```

5. **Assertions**:
```ts
await expect(row.getByText("Offen")).toBeVisible()
await expect(page.getByText("In Bearbeitung")).toBeVisible({ timeout: 10_000 })
```

### Existing Test Files

| Type | Files |
|------|-------|
| Router tests | `src/trpc/routers/__tests__/billingDocuments-router.test.ts` |
| | `src/trpc/routers/__tests__/billingServiceCases-router.test.ts` |
| | `src/trpc/routers/__tests__/billingPayments-router.test.ts` |
| E2E browser | `src/e2e-browser/30-billing-documents.spec.ts` |
| | `src/e2e-browser/31-billing-service-cases.spec.ts` |
| | `src/e2e-browser/32-billing-open-items.spec.ts` |

---

## 10. Handbook Structure

### Handbook Location

**File:** `docs/TERP_HANDBUCH.md`

### Billing Section Structure (Section 13)

```
## 13. Belege & Fakturierung
  ### 13.1 Belegtypen
  ### 13.2 Belegliste
  ### 13.3 Beleg anlegen
  ### 13.4 Positionen verwalten
  ### 13.5 Beleg abschließen (Festschreiben)
  ### 13.6 Beleg fortführen (Belegkette)
  ### 13.7 Beleg stornieren
  ### 13.8 Beleg duplizieren
  ### Status-Workflow
  ### 13.9 Praxisbeispiel: Angebot bis Rechnung
  ### 13.10 Kundendienst (Serviceaufträge)
    #### 13.10.1 Praxisbeispiel: Heizungsreparatur bis Rechnung
  ### 13.11 Offene Posten / Zahlungen
    #### 13.11.1 Praxisbeispiel: Rechnung mit Teilzahlung und Skonto
## 14. Glossar
```

New section to add as **13.12 Preislisten** (before Section 14):

Pattern from existing sections:
```markdown
### 13.12 Preislisten

**Was ist es?** Description of what it is.

**Wozu dient es?** Purpose.

> Modul: **Billing** muss aktiviert sein
> Berechtigung: `billing_price_lists.view`, `billing_price_lists.manage`

📍 Aufträge > Preislisten

#### Preislisten-Liste
Tabelle mit Spalten: | Spalte | Beschreibung | ...

#### Preisliste anlegen
Step-by-step instructions

#### Preiseinträge verwalten
...

#### Standardpreisliste festlegen
...

#### Massenimport
...

#### Preisliste einem Kunden zuweisen
...

#### 13.12.1 Praxisbeispiel: Preisliste erstellen und Kunden zuweisen
Step-by-step Praxisbeispiel (must be clickable/testable)
```

---

## 11. ORD_01 Integration (Document Positions & Price Lookup)

### addPosition Function

**File:** `src/lib/services/billing-document-service.ts` (line 570)

Current `addPosition` does NOT perform any price lookup:
```ts
export async function addPosition(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    documentId: string
    type: string
    articleId?: string
    // ...
    unitPrice?: number
    // ...
  }
) {
  // Verify document exists and is DRAFT
  // Get next sort order
  // Calculate total price
  // Create position
  // Recalculate totals
}
```

The `unitPrice` is passed directly from the input. The integration point for price lookup is in the **frontend** when creating/adding a position -- NOT in the backend service. The flow:
1. User selects an article in the position form
2. Frontend calls `billing.priceLists.lookupPrice({ addressId, articleId, quantity })`
3. Frontend pre-fills `unitPrice` from the result
4. User can override the price
5. `addPosition` is called with the final `unitPrice`

### BillingDocumentPosition Model (lines 688-712)

Relevant price-related fields:
- `articleId` -- links to WhArticle (future WH_01)
- `articleNumber` -- display number
- `unitPrice` -- price per unit (Float?)
- `flatCosts` -- lump sum costs (Float?)
- `totalPrice` -- computed (Float?)
- `priceType` -- STANDARD, ESTIMATE, BY_EFFORT (BillingPriceType?)

---

## 12. Navigation/Sidebar

### Sidebar Config

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

Billing section starts at line 310. New item should be added after `billingOpenItems` (line 335):

```ts
{
  titleKey: 'billingPriceLists',
  href: '/orders/price-lists',
  icon: Tag, // or ListOrdered from lucide-react
  module: 'billing',
  permissions: ['billing_price_lists.view'],
},
```

Icon must be imported at the top of the file from `lucide-react`.

### Translation Keys

Will need to add `billingPriceLists` translation key to the navigation translation files (check `src/messages/` or similar i18n directory).

---

## 13. Migration Pattern

### Naming Convention

Format: `YYYYMMDD000NNN_description.sql`

All migrations use: `20260101000NNN_*.sql`

Latest migration: `20260101000101_create_billing_payments.sql`

New migration: `20260101000102_create_billing_price_lists.sql`

### SQL Pattern

From `20260101000101_create_billing_payments.sql`:

```sql
-- Comment describing the migration

-- Create ENUM types if needed
CREATE TYPE enum_name AS ENUM ('VALUE1', 'VALUE2');

-- Create table
CREATE TABLE table_name (
    id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID                    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- ... columns
    created_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    created_by_id     UUID
);

-- Indexes
CREATE INDEX idx_table_tenant_field ON table_name(tenant_id, field);

-- Trigger for updated_at
CREATE TRIGGER set_table_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

Key points:
- Uses `gen_random_uuid()` for primary key
- `tenant_id` references `tenants(id) ON DELETE CASCADE`
- No `NOT NULL` on optional fields
- Foreign keys use `REFERENCES table(id)` (optionally with `ON DELETE CASCADE` or `ON DELETE SET NULL`)
- `update_updated_at_column()` trigger function already exists in the DB
- No `UNIQUE` constraints defined inline -- done with `ALTER TABLE ... ADD CONSTRAINT`

### Price Lists Migration Content

```sql
-- ORD_04: Billing Price Lists (Preislisten)

CREATE TABLE billing_price_lists (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT            NOT NULL,
    description     TEXT,
    is_default      BOOLEAN         NOT NULL DEFAULT FALSE,
    valid_from      TIMESTAMPTZ,
    valid_to        TIMESTAMPTZ,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id   UUID
);

CREATE INDEX idx_billing_price_lists_tenant_default ON billing_price_lists(tenant_id, is_default);
CREATE INDEX idx_billing_price_lists_tenant_active ON billing_price_lists(tenant_id, is_active);

CREATE TRIGGER set_billing_price_lists_updated_at
  BEFORE UPDATE ON billing_price_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE billing_price_list_entries (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id   UUID            NOT NULL REFERENCES billing_price_lists(id) ON DELETE CASCADE,
    article_id      UUID,
    item_key        TEXT,
    description     TEXT,
    unit_price      DOUBLE PRECISION NOT NULL,
    min_quantity    DOUBLE PRECISION,
    unit            TEXT,
    valid_from      TIMESTAMPTZ,
    valid_to        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_price_list_entries_list_article ON billing_price_list_entries(price_list_id, article_id);
CREATE INDEX idx_billing_price_list_entries_list_key ON billing_price_list_entries(price_list_id, item_key);

CREATE TRIGGER set_billing_price_list_entries_updated_at
  BEFORE UPDATE ON billing_price_list_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add FK constraint from crm_addresses.price_list_id to billing_price_lists
ALTER TABLE crm_addresses
  ADD CONSTRAINT fk_crm_addresses_price_list
  FOREIGN KEY (price_list_id) REFERENCES billing_price_lists(id) ON DELETE SET NULL;
```

---

## 14. Summary: Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260101000102_create_billing_price_lists.sql` | Database migration |
| `src/trpc/routers/billing/priceLists.ts` | tRPC router |
| `src/lib/services/billing-price-list-service.ts` | Business logic |
| `src/lib/services/billing-price-list-repository.ts` | Data access |
| `src/hooks/use-billing-price-lists.ts` | React hooks |
| `src/components/billing/price-list-list.tsx` | List component |
| `src/components/billing/price-list-form-sheet.tsx` | Create/edit sheet |
| `src/components/billing/price-list-entries-table.tsx` | Entries management |
| `src/components/billing/price-list-entry-form-dialog.tsx` | Entry add/edit dialog |
| `src/components/billing/price-list-bulk-import-dialog.tsx` | Bulk import dialog |
| `src/app/[locale]/(dashboard)/orders/price-lists/page.tsx` | List page route |
| `src/app/[locale]/(dashboard)/orders/price-lists/[id]/page.tsx` | Detail page route |
| `src/trpc/routers/__tests__/billingPriceLists-router.test.ts` | Router tests |
| `src/lib/services/__tests__/billing-price-list-service.test.ts` | Service tests |
| `src/e2e-browser/33-billing-price-lists.spec.ts` | E2E browser tests |

### Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add BillingPriceList + BillingPriceListEntry models, add relation to CrmAddress, add to Tenant |
| `src/lib/auth/permission-catalog.ts` | Add `billing_price_lists.view` and `billing_price_lists.manage` permissions |
| `src/trpc/routers/billing/index.ts` | Import and add `priceLists` to billingRouter |
| `src/hooks/index.ts` | Re-export price list hooks |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | Add price lists nav item |
| `docs/TERP_HANDBUCH.md` | Add section 13.12 Preislisten |

### Integration Points (future/optional)

| File | Change |
|------|--------|
| `src/components/billing/document-form.tsx` or position form | Call `lookupPrice` when adding ARTICLE position |
| CRM address edit form | Add price list dropdown selector |
