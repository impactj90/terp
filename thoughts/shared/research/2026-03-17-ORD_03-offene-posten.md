# Research: ORD_03 Offene Posten / Zahlungen

## 1. Existing Billing Infrastructure

### BillingDocument Model (prisma/schema.prisma, line 604)

The `BillingDocument` model has all fields needed for open item tracking:

```prisma
model BillingDocument {
  id                  String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String                 @map("tenant_id") @db.Uuid
  number              String                 @db.VarChar(50)
  type                BillingDocumentType    // OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, INVOICE, CREDIT_NOTE
  status              BillingDocumentStatus  @default(DRAFT) // DRAFT, PRINTED, PARTIALLY_FORWARDED, FORWARDED, CANCELLED

  // Customer / Address
  addressId           String                 @map("address_id") @db.Uuid

  // Dates
  documentDate        DateTime               @default(now()) @map("document_date") @db.Timestamptz(6)

  // Terms & Conditions — KEY fields for Skonto calculation
  paymentTermDays     Int?                   @map("payment_term_days")
  discountPercent     Float?                 @map("discount_percent")
  discountDays        Int?                   @map("discount_days")
  discountPercent2    Float?                 @map("discount_percent_2")
  discountDays2       Int?                   @map("discount_days_2")

  // Totals (computed, stored)
  subtotalNet         Float                  @default(0) @map("subtotal_net")
  totalVat            Float                  @default(0) @map("total_vat")
  totalGross          Float                  @default(0) @map("total_gross")

  // Print state — marks when invoice becomes an "open item"
  printedAt           DateTime?              @map("printed_at") @db.Timestamptz(6)

  // Relations
  parentDocument      BillingDocument?       @relation("DocumentChain", fields: [parentDocumentId], references: [id])
  childDocuments      BillingDocument[]      @relation("DocumentChain")
  positions           BillingDocumentPosition[]
  billingServiceCases BillingServiceCase[]
  // NOTE: Will need to add: payments BillingPayment[]

  @@unique([tenantId, number])
  @@map("billing_documents")
}
```

Key takeaways:
- `totalGross` is the invoice amount to track against payments
- `paymentTermDays` determines due date: `documentDate + paymentTermDays`
- `discountPercent/discountDays` and `discountPercent2/discountDays2` provide two Skonto tiers
- `status = "PRINTED"` means the invoice is finalized and can receive payments
- `type = "INVOICE"` identifies documents that become open items
- `type = "CREDIT_NOTE"` with `parentDocumentId` can reduce effective balance

### Service Files

- **Service:** `/home/tolga/projects/terp/src/lib/services/billing-document-service.ts`
  - Full CRUD + finalize, forward, cancel, duplicate
  - `recalculateTotals()` computes subtotalNet, totalVat, totalGross from positions
  - Error classes: `BillingDocumentNotFoundError`, `BillingDocumentValidationError`, `BillingDocumentConflictError`

- **Repository:** `/home/tolga/projects/terp/src/lib/services/billing-document-repository.ts`
  - `findMany()` with pagination, filters (type, status, addressId, search, date range)
  - `findById()` with full includes (address, contact, positions, parent/child docs)
  - `create()`, `update()`, `remove()`

### Router

- **Router:** `/home/tolga/projects/terp/src/trpc/routers/billing/documents.ts`
  - Uses `billingProcedure = tenantProcedure.use(requireModule("billing"))`
  - All procedures wrapped in `try { ... } catch (err) { handleServiceError(err) }`
  - Permission constants: `permissionIdByKey("billing_documents.view")!`
  - Sub-router for positions: `positions: createTRPCRouter({ list, add, update, delete, reorder })`

- **Billing Router Index:** `/home/tolga/projects/terp/src/trpc/routers/billing/index.ts`
  ```ts
  export const billingRouter = createTRPCRouter({
    documents: billingDocumentsRouter,
    serviceCases: billingServiceCasesRouter,
    // Will add: payments: billingPaymentsRouter,
  })
  ```

- **Root Router:** `/home/tolga/projects/terp/src/trpc/routers/_app.ts`
  - `billing: billingRouter` is already registered (line 159)
  - No changes needed in _app.ts — payments will be nested under billing

### Hooks

- **File:** `/home/tolga/projects/terp/src/hooks/use-billing-documents.ts`
  - Pattern: `useTRPC()` from `"@/trpc"`, `useQuery`/`useMutation` from `@tanstack/react-query`
  - Each hook wraps a single tRPC procedure
  - Mutations invalidate related queries on success via `queryClient.invalidateQueries()`
  - Export via `/home/tolga/projects/terp/src/hooks/index.ts` barrel file

### UI Components

All in `/home/tolga/projects/terp/src/components/billing/`:

| File | Description |
|------|-------------|
| `document-list.tsx` | Data table with filters (type, status, search), pagination, click-to-navigate |
| `document-detail.tsx` | Header with badges, action buttons (finalize/forward/cancel/duplicate), Tabs (overview/positions/chain) |
| `document-status-badge.tsx` | Badge with STATUS_CONFIG map: `{ label, variant }` using Tailwind classes |
| `document-type-badge.tsx` | Similar badge pattern for document types |
| `document-form.tsx` | Create/edit form |
| `document-position-table.tsx` | Editable position table |
| `document-totals-summary.tsx` | Summary card showing net/vat/gross |
| `document-forward-dialog.tsx` | Forward workflow dialog |
| `document-print-dialog.tsx` | Finalize (print) confirmation dialog |

### Page Routes

```
src/app/[locale]/(dashboard)/orders/documents/page.tsx          -> <BillingDocumentList />
src/app/[locale]/(dashboard)/orders/documents/[id]/page.tsx     -> <BillingDocumentDetail id={params.id} />
src/app/[locale]/(dashboard)/orders/documents/new/page.tsx      -> Create form
src/app/[locale]/(dashboard)/orders/service-cases/page.tsx      -> <ServiceCaseList />
src/app/[locale]/(dashboard)/orders/service-cases/[id]/page.tsx -> <ServiceCaseDetail id={params.id} />
```

New pages needed:
```
src/app/[locale]/(dashboard)/orders/open-items/page.tsx
src/app/[locale]/(dashboard)/orders/open-items/[documentId]/page.tsx
```

---

## 2. Architecture Patterns

### Service + Repository Pattern (from ORD_02 service case)

**Service file** (`billing-service-case-service.ts`):
```ts
import type { PrismaClient, BillingServiceCaseStatus } from "@/generated/prisma/client"
import * as repo from "./billing-service-case-repository"

// --- Error Classes ---
export class BillingServiceCaseNotFoundError extends Error {
  constructor(message = "Service case not found") {
    super(message)
    this.name = "BillingServiceCaseNotFoundError"
  }
}

export class BillingServiceCaseValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingServiceCaseValidationError"
  }
}

export class BillingServiceCaseConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingServiceCaseConflictError"
  }
}

// --- Service Functions ---
export async function list(prisma: PrismaClient, tenantId: string, params: {...}) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(prisma: PrismaClient, tenantId: string, id: string) {
  const sc = await repo.findById(prisma, tenantId, id)
  if (!sc) throw new BillingServiceCaseNotFoundError()
  return sc
}
```

**Repository file** (`billing-service-case-repository.ts`):
```ts
import type { PrismaClient } from "@/generated/prisma/client"

const DETAIL_INCLUDE = { address: true, contact: true, ... }
const LIST_INCLUDE = { address: true, ... }

export async function findMany(prisma, tenantId, params) {
  const where: Record<string, unknown> = { tenantId }
  // Apply filters...
  const [items, total] = await Promise.all([
    prisma.billingServiceCase.findMany({ where, orderBy, skip, take, include: LIST_INCLUDE }),
    prisma.billingServiceCase.count({ where }),
  ])
  return { items, total }
}

export async function findById(prisma, tenantId, id) {
  return prisma.billingServiceCase.findFirst({ where: { id, tenantId }, include: DETAIL_INCLUDE })
}
```

### handleServiceError (`src/trpc/errors.ts`)

Maps error class names to tRPC error codes by suffix:
- `*NotFoundError` -> `NOT_FOUND`
- `*ValidationError` / `*InvalidError` -> `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` -> `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` -> `FORBIDDEN`
- Prisma errors: P2025 -> NOT_FOUND, P2002 -> CONFLICT, P2003 -> BAD_REQUEST

### requireModule (`src/lib/modules/index.ts`)

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    // Checks tenantModule table for enabled modules
    // "core" is always enabled
    // Throws FORBIDDEN if module not enabled
  })
}
```

Usage: `const billingProcedure = tenantProcedure.use(requireModule("billing"))`

### requirePermission (`src/lib/auth/middleware.ts`)

```ts
export function requirePermission(...permissionIds: string[]) {
  return createMiddleware(async ({ ctx, next }) => {
    // Checks if user has ANY of the specified permissions (OR logic)
    // Throws FORBIDDEN if not
  })
}
```

### Permission Catalog (`src/lib/auth/permission-catalog.ts`)

Pattern for adding new permissions:
```ts
// Billing Payments (to be added)
p("billing_payments.view", "billing_payments", "view", "View payments and open items"),
p("billing_payments.create", "billing_payments", "create", "Record payments"),
p("billing_payments.cancel", "billing_payments", "cancel", "Cancel payments"),
```

Current count comment says "78 permissions" — must update to reflect new additions.

### Router Pattern (from ORD_02 `serviceCases.ts`)

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as service from "@/lib/services/billing-service-case-service"
import type { PrismaClient } from "@/generated/prisma/client"

const SC_VIEW = permissionIdByKey("billing_service_cases.view")!
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// Relaxed UUID pattern for seed data compatibility
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")

export const billingServiceCasesRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(SC_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma as unknown as PrismaClient, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

Key patterns:
- `ctx.prisma as unknown as PrismaClient` cast is used consistently
- `ctx.tenantId!` non-null assertion (guaranteed by tenantProcedure)
- `ctx.user!.id` for createdById
- Every handler wrapped in `try { ... } catch (err) { handleServiceError(err) }`

---

## 3. Test Patterns

### Router Test Pattern (`src/trpc/routers/__tests__/billingServiceCases-router.test.ts`)

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingServiceCasesRouter } from "../billing/serviceCases"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))

const SC_VIEW = permissionIdByKey("billing_service_cases.view")!
const ALL_PERMS = [SC_VIEW, SC_CREATE, SC_EDIT, SC_DELETE]
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(billingServiceCasesRouter)

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
    prisma: withModuleMock(prisma) as unknown as ...,
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("billing.serviceCases.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      billingServiceCase: {
        findMany: vi.fn().mockResolvedValue([mockServiceCase]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
  })

  it("requires permission", async () => {
    const caller = createCaller(createNoPermContext(prisma))
    await expect(caller.list({ page: 1, pageSize: 10 })).rejects.toThrow("Insufficient permissions")
  })
})
```

### Test Helpers (`src/trpc/routers/__tests__/helpers.ts`)

Key functions:
- `createMockUser(overrides)` — creates ContextUser
- `createMockSession()` — creates Supabase Session
- `createMockContext(overrides)` — creates full TRPCContext with `autoMockPrisma`
- `createUserWithPermissions(permissionIds, overrides)` — user with specific perms
- `createMockUserTenant(userId, tenantId)` — tenant membership
- `autoMockPrisma(partial)` — Proxy that auto-stubs undefined Prisma methods

### Browser E2E Test Pattern (`src/e2e-browser/31-billing-service-cases.spec.ts`)

```ts
import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import { fillInput, submitAndWaitForClose, waitForSheet, expectTableContains } from "./helpers/forms";

test.describe.serial("UC-ORD-02: Praxisbeispiel Heizungsreparatur bis Rechnung", () => {
  // Precondition: create address
  test("Voraussetzung: Kundenadresse anlegen", async ({ page }) => { ... });

  // Steps follow the Handbuch Praxisbeispiel exactly
  test("Schritt 1: Serviceauftrag anlegen", async ({ page }) => { ... });
  test("Schritt 2: Mitarbeiter zuweisen und Auftrag erstellen", async ({ page }) => { ... });
  // etc.
});
```

Key patterns:
- `test.describe.serial()` for ordered test sequences
- Each test maps to a Handbuch step
- Uses `navigateTo(page, "/orders/service-cases")`, `waitForTableLoad(page)`
- Sheet pattern: `waitForSheet(page)`, `submitAndWaitForClose(page)`
- Assertions: `await expect(page.getByText("...")).toBeVisible({ timeout: 10_000 })`

### E2E Helpers

- **`helpers/nav.ts`**: `navigateTo()`, `waitForTableLoad()`, `expectPageTitle()`
- **`helpers/forms.ts`**: `waitForSheet()`, `fillInput()`, `submitAndWaitForClose()`, `expectTableContains()`, `openRowActions()`, `confirmDelete()`
- **`helpers/auth.ts`**: `loginAsAdmin()`, seed constants (TENANT_ID, ADMIN_EMAIL, etc.)

### Global Setup (`src/e2e-browser/global-setup.ts`)

SQL cleanup script that runs before tests. For ORD_03, add:
```sql
-- Payment records (spec 32) — must come before billing docs cleanup
DELETE FROM billing_payments WHERE document_id IN (
  SELECT bd.id FROM billing_documents bd
  JOIN crm_addresses ca ON bd.address_id = ca.id
  WHERE ca.company LIKE 'E2E%'
);
```

### Auth Setup (`src/e2e-browser/auth.setup.ts`)

Saves admin/user storage states to `.auth/admin.json` and `.auth/user.json`.

---

## 4. UI Patterns

### Badge Pattern (`document-status-badge.tsx`)

```tsx
'use client'
import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: 'Entwurf', variant: 'bg-gray-100 text-gray-800' },
  PRINTED: { label: 'Abgeschlossen', variant: 'bg-blue-100 text-blue-800' },
  // ...
}

export function DocumentStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'bg-gray-100 text-gray-800' }
  return <Badge variant="outline" className={config.variant}>{config.label}</Badge>
}
```

For `PaymentStatusBadge`, the config would be:
```ts
const STATUS_CONFIG = {
  UNPAID:   { label: 'Offen',        variant: 'bg-gray-100 text-gray-800' },
  PARTIAL:  { label: 'Teilzahlung',  variant: 'bg-yellow-100 text-yellow-800' },
  PAID:     { label: 'Bezahlt',      variant: 'bg-green-100 text-green-800' },
  OVERPAID: { label: 'Überzahlt',    variant: 'bg-blue-100 text-blue-800' },
  OVERDUE:  { label: 'Überfällig',   variant: 'bg-red-100 text-red-800' },
}
```

### Data Table Pattern (`document-list.tsx`)

```tsx
'use client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function BillingDocumentList() {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useBillingDocuments({ search, type, page, pageSize: 25 })

  return (
    <div className="space-y-4">
      {/* Header with title + "New" button */}
      {/* Filter row with search input + select dropdowns */}
      {/* Table with click-to-navigate rows */}
      {/* Pagination */}
    </div>
  )
}
```

### Detail Page Pattern (`document-detail.tsx`)

```tsx
export function BillingDocumentDetail({ id }: { id: string }) {
  const { data: doc, isLoading } = useBillingDocumentById(id)
  // State for dialogs
  // Loading/not-found guards
  return (
    <div className="space-y-6">
      {/* Header: back button + title + badges + action buttons */}
      {/* Alert for immutable state */}
      <Tabs defaultValue="overview">
        <TabsList>...</TabsList>
        <TabsContent value="overview">
          <Card> ... DetailRow components ... </Card>
        </TabsContent>
        <TabsContent value="positions">...</TabsContent>
      </Tabs>
      {/* Dialogs */}
    </div>
  )
}
```

### Helper Functions Used in UI

```ts
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}
```

### Hook Pattern (`src/hooks/use-billing-service-cases.ts`)

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useBillingServiceCases(options = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(trpc.billing.serviceCases.list.queryOptions({ ...input }, { enabled }))
}

export function useCreateBillingServiceCase() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.serviceCases.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.serviceCases.list.queryKey() })
    },
  })
}
```

All hooks are exported via barrel file at `src/hooks/index.ts`.

---

## 5. Navigation / Sidebar

### Sidebar Config (`src/components/layout/sidebar/sidebar-nav-config.ts`)

The billing section already exists (line 310-329):
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
    // ADD HERE:
    // {
    //   titleKey: 'billingOpenItems',
    //   href: '/orders/open-items',
    //   icon: Wallet,  // or Banknote from lucide-react
    //   module: 'billing',
    //   permissions: ['billing_payments.view'],
    // },
  ],
},
```

`NavItem` interface:
```ts
interface NavItem {
  titleKey: string      // Translation key in 'nav' namespace
  href: string          // Navigation href
  icon: LucideIcon      // Lucide icon component
  permissions?: string[]
  module?: string
}
```

---

## 6. Database Migrations

### Migration Numbering

Latest migration: `20260101000100_create_billing_service_cases.sql`

New migration: `20260101000101_create_billing_payments.sql`

### Migration Pattern (from `20260101000100_create_billing_service_cases.sql`)

```sql
-- ORD_02: Billing Service Cases (Kundendienst)

CREATE TYPE billing_service_case_status AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'CLOSED',
  'INVOICED'
);

CREATE TABLE billing_service_cases (
    id                    UUID                           PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID                           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- ... columns ...
    created_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW()
);

-- Unique constraint
ALTER TABLE billing_service_cases
  ADD CONSTRAINT uq_billing_service_cases_tenant_number UNIQUE (tenant_id, number);

-- Indexes
CREATE INDEX idx_billing_service_cases_tenant_status ON billing_service_cases(tenant_id, status);

-- Trigger for updated_at
CREATE TRIGGER set_billing_service_cases_updated_at
  BEFORE UPDATE ON billing_service_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## 7. Handbook Structure

### Location

V2 handbook: `/home/tolga/projects/terp/docs/TERP_HANDBUCH.md` (5617 lines)
V1 handbook: `/home/tolga/projects/terp/TERP_HANDBUCH.md` (1026 lines, only goes to section 11)

All billing content is in V2, section 13.

### Section 13 Structure

```
## 13. Belege & Fakturierung

"Was ist es?" description
"Wozu dient es?" purpose

> Modul: **Billing** muss aktiviert sein
> Berechtigung: `billing_documents.view`, ...

📍 Navigation path

### 13.1 Belegtypen          — Type reference table
### 13.2 Belegliste          — List view documentation
### 13.3 Beleg anlegen       — Create workflow steps
### 13.4 Positionen verwalten — Position management
### 13.5 Beleg abschließen   — Finalize workflow
### 13.6 Beleg fortführen    — Forward workflow
### 13.7 Beleg stornieren    — Cancel workflow
### 13.8 Beleg duplizieren   — Duplicate workflow
### 13.9 Praxisbeispiel: Angebot bis Rechnung  — Step-by-step walkthrough
### 13.10 Kundendienst       — Service cases documentation
#### 13.10.1 Praxisbeispiel: Heizungsreparatur bis Rechnung

## 14. Glossar               — Term definitions with "Wo in Terp" column
## Anhang: Seitenübersicht    — URL / menu path / permission table
```

### New Section to Add: 13.11 Offene Posten / Zahlungen

Follow the exact pattern of section 13.10:
1. "Was ist es?" + "Wozu dient es?"
2. Module/permission requirements
3. Navigation path
4. List view documentation (columns, filters)
5. Feature subsections (recording payment, discount, cancellation)
6. Status workflow table
7. Praxisbeispiel: Step-by-step with numbered instructions, checkmarks

### Praxisbeispiel Pattern

Each step:
```
##### Schritt N -- Title

1. 📍 Navigation path
2. Action description
3. Fill field: **"Value"**
4. Klick auf **"Button Name"**
5. ✅ Expected result
```

### Glossar Entry Pattern

```
| **Offener Posten** | Unbezahlte oder teilbezahlte Rechnung mit Fälligkeitsdatum und Zahlungsstatus | 📍 Aufträge → Offene Posten |
```

### Anhang: Seitenübersicht Entry Pattern

```
| `/orders/open-items` | Aufträge → Offene Posten | billing_payments.view |
| `/orders/open-items/[documentId]` | Offene Posten → Beleg anklicken | billing_payments.view |
```

---

## 8. Summary: Files to Create/Modify

### New Files

| File | Description |
|------|-------------|
| `supabase/migrations/20260101000101_create_billing_payments.sql` | DB migration for billing_payments table |
| `src/lib/services/billing-payment-service.ts` | Service layer (business logic) |
| `src/lib/services/billing-payment-repository.ts` | Repository layer (Prisma queries) |
| `src/trpc/routers/billing/payments.ts` | tRPC router |
| `src/hooks/use-billing-payments.ts` | React hooks |
| `src/components/billing/open-item-list.tsx` | Open items list page component |
| `src/components/billing/open-item-detail.tsx` | Open item detail with payments |
| `src/components/billing/payment-form-dialog.tsx` | Record payment dialog |
| `src/components/billing/payment-cancel-dialog.tsx` | Cancel payment dialog |
| `src/components/billing/payment-status-badge.tsx` | Payment status badge |
| `src/components/billing/open-items-summary-card.tsx` | Summary KPI card |
| `src/app/[locale]/(dashboard)/orders/open-items/page.tsx` | Open items list page |
| `src/app/[locale]/(dashboard)/orders/open-items/[documentId]/page.tsx` | Open item detail page |
| `src/lib/services/__tests__/billing-payment-service.test.ts` | Service unit tests |
| `src/trpc/routers/__tests__/billingPayments-router.test.ts` | Router tests |
| `src/e2e-browser/32-billing-open-items.spec.ts` | Browser E2E tests |

### Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `BillingPayment` model, `BillingPaymentType`/`BillingPaymentStatus` enums, `payments` relation on `BillingDocument` |
| `src/lib/auth/permission-catalog.ts` | Add 3 billing_payments permissions, update count comment |
| `src/trpc/routers/billing/index.ts` | Add `payments: billingPaymentsRouter` |
| `src/hooks/index.ts` | Export new hooks from `use-billing-payments.ts` |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | Add open items nav item to billing section |
| `src/e2e-browser/global-setup.ts` | Add billing_payments cleanup SQL |
| `docs/TERP_HANDBUCH.md` | Add section 13.11, glossar entries, Anhang entries |
