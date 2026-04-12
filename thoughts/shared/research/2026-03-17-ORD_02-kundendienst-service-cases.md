# Research: ORD_02 — Kundendienst / Serviceaufträge (BillingServiceCase)

## 1. Architecture Patterns Found

### 1.1 Service + Repository Pattern

The codebase uses a consistent pattern: **Router (thin) → Service (business logic) → Repository (Prisma queries)**.

**File structure:**
- `src/trpc/routers/billing/serviceCases.ts` — tRPC router (thin wrapper)
- `src/lib/services/billing-service-case-service.ts` — business logic
- `src/lib/services/billing-service-case-repository.ts` — Prisma queries

**Service pattern** (from `src/lib/services/billing-document-service.ts`):
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./billing-document-repository"
import * as numberSeqService from "./number-sequence-service"

// --- Error Classes ---
export class BillingDocumentNotFoundError extends Error {
  constructor(message = "Billing document not found") {
    super(message); this.name = "BillingDocumentNotFoundError"
  }
}
export class BillingDocumentValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingDocumentValidationError"
  }
}
export class BillingDocumentConflictError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingDocumentConflictError"
  }
}

// --- Service Functions (all exported, all take prisma + tenantId as first args) ---
export async function list(prisma: PrismaClient, tenantId: string, params: {...}) { ... }
export async function getById(prisma: PrismaClient, tenantId: string, id: string) { ... }
export async function create(prisma: PrismaClient, tenantId: string, input: {...}, createdById: string) { ... }
```

Error classes follow naming convention: `*NotFoundError`, `*ValidationError`, `*ConflictError` — these are mapped by `handleServiceError` in `src/trpc/errors.ts` to tRPC error codes.

**Repository pattern** (from `src/lib/services/billing-document-repository.ts`):
```ts
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(prisma: PrismaClient, tenantId: string, params: {...}) {
  const where: Record<string, unknown> = { tenantId }
  // ... build where clause
  const [items, total] = await Promise.all([
    prisma.billingDocument.findMany({ where, orderBy, skip, take, include }),
    prisma.billingDocument.count({ where }),
  ])
  return { items, total }
}

export async function findById(prisma: PrismaClient, tenantId: string, id: string) {
  return prisma.billingDocument.findFirst({
    where: { id, tenantId },
    include: { address: true, contact: true, /* ... */ },
  })
}

export async function create(prisma: PrismaClient, data: {...}) {
  return prisma.billingDocument.create({ data, include: { ... } })
}

export async function update(prisma: PrismaClient, tenantId: string, id: string, data: Record<string, unknown>) {
  await prisma.billingDocument.updateMany({ where: { id, tenantId }, data })
  return prisma.billingDocument.findFirst({ where: { id, tenantId }, include: { ... } })
}

export async function remove(prisma: PrismaClient, tenantId: string, id: string): Promise<boolean> {
  const { count } = await prisma.billingDocument.deleteMany({ where: { id, tenantId } })
  return count > 0
}
```

### 1.2 Router Pattern

**File:** `src/trpc/routers/billing/documents.ts`

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as billingDocService from "@/lib/services/billing-document-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
// ...

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Router ---
export const billingDocumentsRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await billingDocService.list(
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

Key patterns:
- `tenantProcedure.use(requireModule("billing"))` as base procedure
- `requirePermission(PERMISSION_ID)` for each procedure
- `ctx.prisma as unknown as PrismaClient` cast (needed due to Prisma generation)
- `try/catch` with `handleServiceError(err)` in every procedure
- Input schemas defined as `z.object(...)` at top of file

### 1.3 Billing Router Registration

**File:** `src/trpc/routers/billing/index.ts`
```ts
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
})
```

This gets merged in `src/trpc/routers/_app.ts`:
```ts
import { billingRouter } from "./billing"
// ...
export const appRouter = createTRPCRouter({
  billing: billingRouter,
  // ...
})
```

For ORD_02, add `serviceCases` to the billing router:
```ts
export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,  // NEW
})
```

### 1.4 NumberSequence Usage

**File:** `src/lib/services/number-sequence-service.ts`

```ts
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  supplier: "L-",
  inquiry: "V-",
  offer: "A-",
  order_confirmation: "AB-",
  // etc.
}

export async function getNextNumber(
  prisma: PrismaClient,
  tenantId: string,
  key: string
): Promise<string> {
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

For service cases, add to DEFAULT_PREFIXES:
```ts
service_case: "KD-",
```

Usage in service: `const number = await numberSeqService.getNextNumber(prisma, tenantId, "service_case")`

### 1.5 Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts`

Permissions are defined as:
```ts
p("billing_documents.view", "billing_documents", "view", "View billing documents"),
```

For ORD_02, add after the billing_documents permissions:
```ts
// Billing Service Cases
p("billing_service_cases.view", "billing_service_cases", "view", "View service cases"),
p("billing_service_cases.create", "billing_service_cases", "create", "Create service cases"),
p("billing_service_cases.edit", "billing_service_cases", "edit", "Edit service cases"),
p("billing_service_cases.delete", "billing_service_cases", "delete", "Delete service cases"),
```

### 1.6 requireModule Middleware

**File:** `src/lib/modules/index.ts` (line 70)

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    // Checks tenantModule table for enabled module
    // Throws FORBIDDEN if not enabled
  })
}
```

Service cases use `requireModule("billing")` — same as billing documents.

---

## 2. Billing Module Current State

### 2.1 Existing Files

| Type | File | Description |
|------|------|-------------|
| Router index | `src/trpc/routers/billing/index.ts` | Merges billing sub-routers |
| Router | `src/trpc/routers/billing/documents.ts` | BillingDocument CRUD + workflow |
| Service | `src/lib/services/billing-document-service.ts` | Business logic |
| Repository | `src/lib/services/billing-document-repository.ts` | Prisma queries |
| PDF Service | `src/lib/services/billing-document-pdf-service.ts` | PDF generation |
| Hooks | `src/hooks/use-billing-documents.ts` | React hooks |
| UI Components | `src/components/billing/` | 9 component files |
| Page Routes | `src/app/[locale]/(dashboard)/orders/documents/` | 3 pages |
| Unit Tests | `src/lib/services/__tests__/billing-document-service.test.ts` | Service tests |
| Router Tests | `src/trpc/routers/__tests__/billingDocuments-router.test.ts` | Integration tests |
| E2E Tests | `src/e2e-browser/30-billing-documents.spec.ts` | Browser tests |
| Migration | `supabase/migrations/20260101000099_create_billing_documents.sql` | DB migration |

### 2.2 Prisma Schema — BillingDocument

**File:** `prisma/schema.prisma` (line 591)

Key fields and relations:
- `tenantId`, `number`, `type`, `status`, `addressId`, `contactId`
- `inquiryId` → CrmInquiry, `orderId` → Order, `parentDocumentId` → self-reference
- `positions` → BillingDocumentPosition[]
- Unique: `@@unique([tenantId, number])`

### 2.3 Order Model

**File:** `prisma/schema.prisma` (line 1437)

```prisma
model Order {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  code               String    @db.VarChar(50)
  name               String    @db.VarChar(255)
  description        String?
  status             String    @default("active") @db.VarChar(20)
  customer           String?
  billingRatePerHour Decimal?
  // ... relations
}
```

The `createOrder` procedure on service cases will create a Terp Order using `orderService.create()`.

### 2.4 CrmInquiry Model

**File:** `prisma/schema.prisma` (line 481)

Key fields: `id, tenantId, number, title, addressId, contactId, status, orderId`

The `BillingServiceCase.inquiryId` relation links to this model.

### 2.5 Navigation/Sidebar Config

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

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
    // ADD: service cases nav item here
  ],
},
```

Translation keys in `messages/de.json` and `messages/en.json`:
```json
"billingSection": "Fakturierung",
"billingDocuments": "Belege",
// ADD:
"billingServiceCases": "Kundendienst",
```

### 2.6 Page Routes

Existing pattern from `src/app/[locale]/(dashboard)/orders/documents/`:
- `page.tsx` — list page
- `[id]/page.tsx` — detail page
- `new/page.tsx` — create page (if needed)

For service cases, use `src/app/[locale]/(dashboard)/orders/service-cases/` with:
- `page.tsx` — list page
- `[id]/page.tsx` — detail page

No `new/` page needed — create via sheet form from list page.

---

## 3. Test Patterns

### 3.1 Unit Tests (Service Layer)

**File:** `src/lib/services/__tests__/billing-document-service.test.ts`

Pattern:
```ts
import { describe, it, expect, vi } from "vitest"
import * as service from "../billing-document-service"
import type { PrismaClient } from "@/generated/prisma/client"

// Constants
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

// Mock objects matching Prisma shapes
const mockDocument = { id: DOC_ID, tenantId: TENANT_ID, /* ... */ }

// Mock Prisma factory
function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    crmAddress: { findFirst: vi.fn() },
    billingDocument: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    numberSequence: { upsert: vi.fn() },
    ...overrides,
  } as unknown as PrismaClient
}

describe("billing-document-service", () => {
  describe("create", () => {
    it("creates with auto-generated number", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ prefix: "A-", nextValue: 2 })
      ;(prisma.billingDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockDocument, number: "A-1" })

      const result = await service.create(prisma, TENANT_ID, { type: "OFFER", addressId: ADDRESS_ID }, USER_ID)
      expect(result.number).toBe("A-1")
    })
  })
})
```

Key patterns:
- `vi.fn()` for all Prisma method mocks
- `.mockResolvedValue()` / `.mockResolvedValueOnce()` for chained calls
- Cast mock as `ReturnType<typeof vi.fn>` for type-safe mock setup
- Test each method separately in nested `describe` blocks
- Test both happy path and error cases

### 3.2 Router/Integration Tests

**File:** `src/trpc/routers/__tests__/billingDocuments-router.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingDocumentsRouter } from "../billing/documents"
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

const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
// ... other permission constants

const createCaller = createCallerFactory(billingDocumentsRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma: Record<string, unknown>, permissions: string[] = ALL_PERMS) {
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

Key patterns:
- `vi.mock("@/lib/db", ...)` to mock the module check
- `createCallerFactory` to create a caller from the router directly
- `createMockContext` / `createUserWithPermissions` / `createMockUserTenant` from `./helpers`
- `withModuleMock` to add `tenantModule` mock to Prisma
- Permission testing: create context with/without specific permissions

**Test helpers file:** `src/trpc/routers/__tests__/helpers.ts`

Provides:
- `autoMockPrisma(partial)` — Proxy that auto-stubs missing Prisma methods
- `createMockUser(overrides)` — ContextUser mock
- `createMockSession()` — Supabase Session mock
- `createMockContext(overrides)` — Full TRPCContext mock
- `createMockUserGroup(overrides)` — UserGroup mock
- `createAdminUser(overrides)` — User with admin group
- `createUserWithPermissions(permissionIds, overrides)` — User with specific permissions
- `createMockTenant(overrides)` — Tenant mock
- `createMockUserTenant(userId, tenantId)` — UserTenant join mock

### 3.3 E2E Browser Tests

**File:** `src/e2e-browser/30-billing-documents.spec.ts`

```ts
import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import { fillInput, submitAndWaitForClose, waitForSheet, expectTableContains } from "./helpers/forms";

const COMPANY = "E2E Belegkette GmbH";

test.describe.serial("UC-ORD-01: Document Chain", () => {
  test("create address for billing tests", async ({ page }) => {
    // Pre-condition setup
  });
  test("navigate to billing documents page", async ({ page }) => {
    await navigateTo(page, "/orders/documents");
    await expect(page.getByRole("heading", { name: "Belege" })).toBeVisible({ timeout: 10000 });
  });
  // ... more serial tests
});
```

**Test helpers:**

`src/e2e-browser/helpers/nav.ts`:
- `navigateTo(page, path)` — goto + wait for main content
- `waitForTableLoad(page)` — wait for first table row
- `expectPageTitle(page, title)` — assert heading

`src/e2e-browser/helpers/forms.ts`:
- `openCreateDialog(page)` — click "+" button, wait for sheet
- `waitForSheet(page)` — wait for sheet to be visible
- `fillInput(page, id, value)` — fill input by ID
- `selectOption(page, triggerLabel, optionText)` — select from combobox
- `submitSheet(page)` — click submit in sheet footer
- `submitAndWaitForClose(page)` — submit + wait for sheet close
- `expectTableContains(page, text)` — verify table row exists
- `clickTab(page, name)` — click a tab by name

`src/e2e-browser/helpers/auth.ts`:
- `loginAsAdmin(page)` — uses dev quick-login
- Auth state stored in `.auth/admin.json` and `.auth/user.json`

**Naming pattern:** `31-billing-service-cases.spec.ts` (next number after 30)

---

## 4. UI Component Patterns

### 4.1 Status Badge

**File:** `src/components/billing/document-status-badge.tsx`

Simple status badge using config map:
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

For service cases, create `service-case-status-badge.tsx`:
```
OPEN → "Offen" (gray)
IN_PROGRESS → "In Bearbeitung" (blue)
CLOSED → "Abgeschlossen" (green)
INVOICED → "Abgerechnet" (purple)
```

### 4.2 List Component

**File:** `src/components/billing/document-list.tsx`

Pattern:
- `'use client'` directive
- State for filters (search, type, status, page)
- Hook for data fetching (`useBillingDocuments`)
- Header with title + "New" button
- Filter bar with Search input + Select dropdowns
- Table with columns, click row to navigate to detail
- Pagination footer

### 4.3 Detail Component

**File:** `src/components/billing/document-detail.tsx`

Pattern:
- Header: Back button + title + type badge + status badge
- Action buttons: conditional based on status (Abschließen, Fortführen, Stornieren, etc.)
- Immutable notice (Alert) when status is not DRAFT
- Tabs: Übersicht, Positionen, Kette
- Dialogs: Finalize, Forward, Cancel (rendered at bottom, controlled by state)

### 4.4 Form Sheet

**File:** `src/components/crm/inquiry-form-sheet.tsx`

Sheet form pattern:
```tsx
<Sheet open={open} onOpenChange={handleClose}>
  <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden">
    <SheetHeader>...</SheetHeader>
    <div className="flex-1 overflow-y-auto min-h-0 -mx-4 px-4">
      <div className="space-y-6 py-4">
        {/* Form fields */}
      </div>
    </div>
    <SheetFooter className="flex-row gap-2 border-t pt-4">
      <Button variant="outline" onClick={handleClose}>Cancel</Button>
      <Button onClick={handleSubmit}>Save</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

Key patterns:
- `overflow-y-auto` on content div (scrollable)
- Footer fixed at bottom with border-t
- `isEdit` flag to toggle between create/edit
- `useEffect` to reset form state when `open` changes
- Error state with `Alert variant="destructive"`

### 4.5 Close Dialog

**File:** `src/components/crm/inquiry-close-dialog.tsx`

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Close Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-4">
      {/* Closing reason select, remarks textarea */}
    </div>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button onClick={handleSubmit}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 4.6 Hooks Pattern

**File:** `src/hooks/use-billing-documents.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useBillingDocuments(options = {}) {
  const trpc = useTRPC()
  return useQuery(trpc.billing.documents.list.queryOptions({ ... }, { enabled }))
}

export function useCreateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.documents.list.queryKey() })
    },
  })
}
```

Hooks are re-exported from `src/hooks/index.ts`:
```ts
export {
  useBillingDocuments,
  useBillingDocumentById,
  // ...
} from './use-billing-documents'
```

---

## 5. Handbook Structure

**File:** `docs/TERP_HANDBUCH.md`

The billing section is section 13 (line 4996):

```
## 13. Belege & Fakturierung

**Was ist es?** ...
**Wozu dient es?** ...
> Modul: ...
> Berechtigung: ...
📍 Navigation path

### 13.1 Belegtypen
### 13.2 Belegliste
### 13.3 Beleg anlegen
### 13.4 Positionen verwalten
### 13.5 Beleg abschließen
### 13.6 Beleg fortführen
### 13.7 Beleg stornieren
### 13.8 Beleg duplizieren
### Status-Workflow
### 13.9 Praxisbeispiel: Angebot bis Rechnung
```

For service cases, add **section 14** (renumbering Glossar to 15) or add as **13.10**:

Pattern for each section:
1. **Was ist es?** — Description
2. **Wozu dient es?** — Purpose
3. Module/permission requirements
4. Navigation path
5. Feature subsections with step-by-step instructions
6. **Praxisbeispiel** — Detailed walkthrough with numbered steps and checkmarks

The Praxisbeispiel pattern uses:
- Numbered steps with `📍` for navigation
- `✅` for expected results
- `💡` for tips
- Tables for data
- Clear click-by-click instructions that are verifiable

Glossar entries follow this pattern:
```
| **Term** | Description | 📍 Where in Terp |
```

Route table at the end of handbook:
```
| `/orders/documents` | Aufträge → Belege | billing_documents.view |
```

---

## 6. Key Implementation Notes

### 6.1 Migration

Next migration number: `20260101000100`
File: `supabase/migrations/20260101000100_create_billing_service_cases.sql`

Need to create:
1. `billing_service_case_status` ENUM type
2. `billing_service_cases` table
3. Indexes
4. Updated_at trigger

### 6.2 Prisma Schema Changes

Add to `prisma/schema.prisma`:
1. `BillingServiceCaseStatus` enum
2. `BillingServiceCase` model
3. Update `CrmAddress` with `billingServiceCases BillingServiceCase[]` relation
4. Update `CrmContact` with `billingServiceCases BillingServiceCase[]` relation
5. Update `CrmInquiry` with `billingServiceCases BillingServiceCase[]` relation
6. Update `Employee` with `assignedServiceCases BillingServiceCase[]` relation
7. Update `Order` with `billingServiceCases BillingServiceCase[]` relation
8. Update `BillingDocument` with `billingServiceCases BillingServiceCase[]` relation
9. Update `Tenant` with `billingServiceCases BillingServiceCase[]` relation

### 6.3 NumberSequence Default Prefix

Add to `src/lib/services/number-sequence-service.ts`:
```ts
service_case: "KD-",
```

### 6.4 createInvoice Logic

The `createInvoice` on a closed service case should:
1. Validate status is CLOSED
2. Create BillingDocument of type INVOICE
3. Copy positions to the BillingDocument
4. Link via `serviceCase.invoiceDocumentId = invoice.id`
5. Set status to INVOICED

This uses `billingDocService.create()` or directly creates via Prisma in a transaction.

### 6.5 createOrder Logic

Similar to how `billingDocService.finalize()` creates an Order:
```ts
const newOrder = await orderService.create(prisma, tenantId, {
  code: serviceCase.number,
  name: orderName || serviceCase.title,
  description: orderDescription,
  customer: address.company || undefined,
  status: "active",
})
```

### 6.6 Status Transitions

```
OPEN → IN_PROGRESS → CLOSED → INVOICED
```

- OPEN: Initial state after creation
- IN_PROGRESS: Auto-set when `assignedToId` is first set or on first update
- CLOSED: Set by `close()` with closingReason. After closing, no further edits.
- INVOICED: After `createInvoice()` generates the BillingDocument

### 6.7 Translations

Add to `messages/de.json`:
```json
"billingServiceCases": "Kundendienst"
```

Add to `messages/en.json`:
```json
"billingServiceCases": "Service Cases"
```

### 6.8 File List (to create)

| File | Type |
|------|------|
| `supabase/migrations/20260101000100_create_billing_service_cases.sql` | Migration |
| `src/lib/services/billing-service-case-repository.ts` | Repository |
| `src/lib/services/billing-service-case-service.ts` | Service |
| `src/trpc/routers/billing/serviceCases.ts` | Router |
| `src/hooks/use-billing-service-cases.ts` | Hooks |
| `src/components/billing/service-case-list.tsx` | UI |
| `src/components/billing/service-case-form-sheet.tsx` | UI |
| `src/components/billing/service-case-detail.tsx` | UI |
| `src/components/billing/service-case-close-dialog.tsx` | UI |
| `src/components/billing/service-case-invoice-dialog.tsx` | UI |
| `src/components/billing/service-case-status-badge.tsx` | UI |
| `src/app/[locale]/(dashboard)/orders/service-cases/page.tsx` | Page |
| `src/app/[locale]/(dashboard)/orders/service-cases/[id]/page.tsx` | Page |
| `src/lib/services/__tests__/billing-service-case-service.test.ts` | Unit Test |
| `src/trpc/routers/__tests__/billingServiceCases-router.test.ts` | Router Test |
| `src/e2e-browser/31-billing-service-cases.spec.ts` | E2E Test |

### 6.9 Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add enum + model + update relations |
| `src/lib/services/number-sequence-service.ts` | Add `service_case: "KD-"` prefix |
| `src/lib/auth/permission-catalog.ts` | Add 4 service case permissions |
| `src/trpc/routers/billing/index.ts` | Add serviceCases router |
| `src/hooks/index.ts` | Re-export service case hooks |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | Add nav item |
| `messages/de.json` | Add translations |
| `messages/en.json` | Add translations |
| `docs/TERP_HANDBUCH.md` | Add Kundendienst section |
