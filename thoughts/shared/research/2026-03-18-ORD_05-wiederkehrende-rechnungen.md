# Research: ORD_05 Wiederkehrende Rechnungen (Recurring Invoices)

Date: 2026-03-18

---

## 1. Billing Architecture

### 1.1 Prisma Models

**BillingDocument** (`prisma/schema.prisma` line 607):
```prisma
model BillingDocument {
  id                  String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String                 @map("tenant_id") @db.Uuid
  number              String                 @db.VarChar(50)
  type                BillingDocumentType
  status              BillingDocumentStatus  @default(DRAFT)

  // Customer / Address
  addressId           String                 @map("address_id") @db.Uuid
  contactId           String?                @map("contact_id") @db.Uuid
  deliveryAddressId   String?                @map("delivery_address_id") @db.Uuid
  invoiceAddressId    String?                @map("invoice_address_id") @db.Uuid

  // Links
  inquiryId           String?                @map("inquiry_id") @db.Uuid
  orderId             String?                @map("order_id") @db.Uuid
  parentDocumentId    String?                @map("parent_document_id") @db.Uuid

  // Dates
  orderDate           DateTime?              @map("order_date") @db.Timestamptz(6)
  documentDate        DateTime               @default(now()) @map("document_date") @db.Timestamptz(6)
  deliveryDate        DateTime?              @map("delivery_date") @db.Timestamptz(6)

  // Terms & Conditions
  deliveryType        String?                @map("delivery_type")
  deliveryTerms       String?                @map("delivery_terms")
  paymentTermDays     Int?                   @map("payment_term_days")
  discountPercent     Float?                 @map("discount_percent")
  discountDays        Int?                   @map("discount_days")
  discountPercent2    Float?                 @map("discount_percent_2")
  discountDays2       Int?                   @map("discount_days_2")
  shippingCostNet     Float?                 @map("shipping_cost_net")
  shippingCostVatRate Float?                 @map("shipping_cost_vat_rate")

  // Totals (computed, stored for performance)
  subtotalNet         Float                  @default(0) @map("subtotal_net")
  totalVat            Float                  @default(0) @map("total_vat")
  totalGross          Float                  @default(0) @map("total_gross")

  // Notes
  notes               String?
  internalNotes       String?                @map("internal_notes")

  // Print state
  printedAt           DateTime?              @map("printed_at") @db.Timestamptz(6)
  printedById         String?                @map("printed_by_id") @db.Uuid

  // Audit
  createdAt           DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById         String?                @map("created_by_id") @db.Uuid

  // Relations
  tenant           Tenant                    @relation(...)
  address          CrmAddress                @relation(...)
  contact          CrmContact?               @relation(...)
  positions        BillingDocumentPosition[]
  // ... other relations

  @@unique([tenantId, number])
  @@map("billing_documents")
}
```

**BillingDocumentPosition** (`prisma/schema.prisma` line 690):
```prisma
model BillingDocumentPosition {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId      String              @map("document_id") @db.Uuid
  sortOrder       Int                 @map("sort_order")
  type            BillingPositionType @default(FREE)
  articleId       String?             @map("article_id") @db.Uuid
  articleNumber   String?             @map("article_number") @db.VarChar(50)
  description     String?
  quantity        Float?
  unit            String?             @db.VarChar(20)
  unitPrice       Float?              @map("unit_price")
  flatCosts       Float?              @map("flat_costs")
  totalPrice      Float?              @map("total_price")
  priceType       BillingPriceType?   @map("price_type")
  vatRate         Float?              @map("vat_rate")
  deliveryDate    DateTime?           @map("delivery_date") @db.Timestamptz(6)
  confirmedDate   DateTime?           @map("confirmed_date") @db.Timestamptz(6)
  createdAt       DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  document BillingDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId, sortOrder])
  @@map("billing_document_positions")
}
```

### 1.2 Enums

All billing enums are defined in `prisma/schema.prisma`:

```prisma
enum BillingDocumentType {
  OFFER
  ORDER_CONFIRMATION
  DELIVERY_NOTE
  SERVICE_NOTE
  RETURN_DELIVERY
  INVOICE
  CREDIT_NOTE
  @@map("billing_document_type")
}

enum BillingDocumentStatus {
  DRAFT
  PRINTED
  PARTIALLY_FORWARDED
  FORWARDED
  CANCELLED
  @@map("billing_document_status")
}

enum BillingPositionType {
  ARTICLE
  FREE
  TEXT
  PAGE_BREAK
  SUBTOTAL
  @@map("billing_position_type")
}

enum BillingPriceType {
  STANDARD
  ESTIMATE
  BY_EFFORT
  @@map("billing_price_type")
}
```

Enum mapping pattern: Each enum uses `@@map("snake_case_name")` at the database level. Values are UPPER_SNAKE_CASE.

### 1.3 Tenant Relation

The `Tenant` model (`prisma/schema.prisma` line 85) already has:
```prisma
billingDocuments      BillingDocument[]
billingServiceCases   BillingServiceCase[]
billingPayments       BillingPayment[]
billingPriceLists     BillingPriceList[]
```
A new `billingRecurringInvoices  BillingRecurringInvoice[]` relation must be added.

---

## 2. Existing Billing Document Flow

### 2.1 Service Layer

**File:** `src/lib/services/billing-document-service.ts`

Error classes pattern:
```ts
export class BillingDocumentNotFoundError extends Error {
  constructor(message = "Billing document not found") {
    super(message); this.name = "BillingDocumentNotFoundError"
  }
}
export class BillingDocumentValidationError extends Error { ... }
export class BillingDocumentConflictError extends Error { ... }
```

Document creation flow:
1. Validate address belongs to tenant
2. Validate contact belongs to address (if provided)
3. Generate number via `numberSeqService.getNextNumber(prisma, tenantId, seqKey)`
4. Pre-fill payment terms from address defaults
5. Call `repo.create(prisma, data)`

Key constant for number sequences:
```ts
const NUMBER_SEQUENCE_KEYS: Record<BillingDocumentType, string> = {
  OFFER: "offer",
  ORDER_CONFIRMATION: "order_confirmation",
  DELIVERY_NOTE: "delivery_note",
  SERVICE_NOTE: "service_note",
  RETURN_DELIVERY: "return_delivery",
  INVOICE: "invoice",
  CREDIT_NOTE: "credit_note",
}
```

### 2.2 Total Calculation

`recalculateTotals` in billing-document-service.ts:
```ts
export async function recalculateTotals(prisma, tenantId, documentId) {
  const positions = await repo.findPositions(prisma, documentId)
  let subtotalNet = 0
  const vatMap = new Map<number, number>()
  for (const pos of positions) {
    if (pos.totalPrice != null) {
      subtotalNet += pos.totalPrice
      if (pos.vatRate != null && pos.vatRate > 0) {
        const vatAmount = pos.totalPrice * (pos.vatRate / 100)
        vatMap.set(pos.vatRate, (vatMap.get(pos.vatRate) ?? 0) + vatAmount)
      }
    }
  }
  let totalVat = 0
  for (const amount of vatMap.values()) totalVat += amount
  const totalGross = subtotalNet + totalVat
  // Round to 2 decimal places
  const data = {
    subtotalNet: Math.round(subtotalNet * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
  }
  await prisma.billingDocument.updateMany({ where: { id: documentId, tenantId }, data })
  return data
}
```

Position total:
```ts
function calculatePositionTotal(quantity, unitPrice, flatCosts): number | null {
  const qty = quantity ?? 0, price = unitPrice ?? 0, flat = flatCosts ?? 0
  if (qty === 0 && price === 0 && flat === 0) return null
  return Math.round((qty * price + flat) * 100) / 100
}
```

### 2.3 Repository Pattern

**File:** `src/lib/services/billing-document-repository.ts`

- `findMany(prisma, tenantId, params)` - Paginated list with includes
- `findById(prisma, tenantId, id)` - Single doc with full includes
- `create(prisma, data)` - Create with includes
- `update(prisma, tenantId, id, data)` - Uses `updateMany` + `findFirst` for return
- `remove(prisma, tenantId, id)` - `deleteMany`
- `findPositions(prisma, documentId)` - Positions ordered by sortOrder
- `createPosition(prisma, data)` - Create single position
- `updatePosition(prisma, id, data)` - `updateMany` + `findFirst`
- `deletePosition(prisma, id)` - `deleteMany`
- `getMaxSortOrder(prisma, documentId)` - For auto-incrementing sortOrder
- `countChildDocuments(prisma, tenantId, parentDocumentId)`

### 2.4 Number Sequence Service

**File:** `src/lib/services/number-sequence-service.ts`

```ts
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-", supplier: "L-", inquiry: "V-",
  offer: "A-", order_confirmation: "AB-", delivery_note: "LS-",
  service_note: "LN-", return_delivery: "R-", invoice: "RE-",
  credit_note: "G-", service_case: "KD-",
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

For recurring invoices generating actual invoices, use the existing `invoice` key so generated invoices get "RE-" numbers.

---

## 3. Permission System

### 3.1 Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts`

Pattern for adding permissions:
```ts
function p(key, resource, action, description): Permission {
  return { id: permissionId(key), key, resource, action, description }
}

export const ALL_PERMISSIONS: Permission[] = [
  // ...existing permissions...
  // Billing Documents
  p("billing_documents.view", "billing_documents", "view", "View billing documents"),
  // ...
  // Billing Price Lists
  p("billing_price_lists.view", "billing_price_lists", "view", "View price lists"),
  p("billing_price_lists.manage", "billing_price_lists", "manage", "Manage price lists and entries"),
]
```

Comment at top says `All 83 permissions` -- update this count when adding new ones.

Permission IDs are deterministic UUIDs generated from key using UUID v5 with a fixed namespace.

### 3.2 Permission Usage in Routers

```ts
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const billingProcedure = tenantProcedure.use(requireModule("billing"))

list: billingProcedure
  .use(requirePermission(BILLING_VIEW))
  .input(listInput)
  .query(async ({ ctx, input }) => { ... })
```

### 3.3 Module Guard

**File:** `src/lib/modules/index.ts`

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    // Checks tenantModule table for module = "billing"
    // Throws FORBIDDEN if not enabled
  })
}
```

Usage: `const billingProcedure = tenantProcedure.use(requireModule("billing"))`

---

## 4. Cron Jobs

### 4.1 Existing Cron Routes

**Files in** `src/app/api/cron/`:
- `calculate-days/route.ts` - Daily at 02:00 UTC
- `calculate-months/route.ts` - Monthly on 2nd at 03:00 UTC
- `generate-day-plans/route.ts` - Weekly Sunday at 01:00 UTC
- `execute-macros/route.ts` - Every 15 minutes

### 4.2 Cron Route Pattern

**File:** `src/app/api/cron/calculate-days/route.ts`

Key patterns:
```ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes

export async function GET(request: Request) {
  // 1. CRON_SECRET validation
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Parse query parameters (optional)
  // 3. Execute business logic
  // 4. Return JSON response
}
```

### 4.3 Cron Configuration

**File:** `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/calculate-days", "schedule": "0 2 * * *" },
    { "path": "/api/cron/calculate-months", "schedule": "0 3 2 * *" },
    { "path": "/api/cron/generate-day-plans", "schedule": "0 1 * * 0" },
    { "path": "/api/cron/execute-macros", "schedule": "*/15 * * * *" }
  ]
}
```

New recurring invoices cron would be added here as a 5th entry.

### 4.4 Cron Test Pattern

**File:** `src/app/api/cron/calculate-days/__tests__/route.test.ts`

Tests exported pure functions (like `computeDateRange`) directly, and uses `vi.hoisted()` + `vi.mock()` for integration tests of the route handler. The route handler itself is tested by mocking `prisma`, `RecalcService`, and `CronExecutionLogger`.

---

## 5. tRPC Router Architecture

### 5.1 Billing Router Structure

**File:** `src/trpc/routers/billing/index.ts`

```ts
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"
import { billingServiceCasesRouter } from "./serviceCases"
import { billingPaymentsRouter } from "./payments"
import { billingPriceListsRouter } from "./priceLists"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
  priceLists: billingPriceListsRouter,
})
```

A new `recurringInvoices` sub-router would be added here as the 5th entry.

### 5.2 Router File Pattern

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

const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const billingProcedure = tenantProcedure.use(requireModule("billing"))

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
- `ctx.prisma as unknown as PrismaClient` cast is used throughout
- `ctx.tenantId!` (non-null assertion, guaranteed by tenantProcedure)
- `ctx.user!.id` for createdById
- All mutations/queries wrapped in try/catch with `handleServiceError(err)`

### 5.3 Error Handling

**File:** `src/trpc/errors.ts`

Maps service errors by class name suffix:
- `*NotFoundError` -> `NOT_FOUND`
- `*ValidationError` / `*InvalidError` -> `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` -> `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` -> `FORBIDDEN`
- Prisma errors: P2025 -> NOT_FOUND, P2002 -> CONFLICT, P2003 -> BAD_REQUEST

### 5.4 Root Router

**File:** `src/trpc/routers/_app.ts`

```ts
import { billingRouter } from "./billing"
export const appRouter = createTRPCRouter({
  // ...
  billing: billingRouter,
})
```

No changes needed here -- the billing router index handles sub-routers.

---

## 6. UI Patterns

### 6.1 Page Routes

**Pattern:** `src/app/[locale]/(dashboard)/orders/<feature>/page.tsx`

Existing:
- `/orders/documents/page.tsx` - `<BillingDocumentList />`
- `/orders/documents/[id]/page.tsx` - `<BillingDocumentDetail id={params.id} />`
- `/orders/documents/new/page.tsx` - `<BillingDocumentForm />`
- `/orders/service-cases/page.tsx`
- `/orders/service-cases/[id]/page.tsx`
- `/orders/open-items/page.tsx`
- `/orders/open-items/[documentId]/page.tsx`
- `/orders/price-lists/page.tsx`
- `/orders/price-lists/[id]/page.tsx`

New pages needed:
- `/orders/recurring/page.tsx`
- `/orders/recurring/[id]/page.tsx`
- `/orders/recurring/new/page.tsx`

Page component pattern (extremely simple):
```tsx
import { PriceListList } from "@/components/billing/price-list-list"
export default function BillingPriceListsPage() {
  return <PriceListList />
}
```

Detail page pattern:
```tsx
'use client'
import { useParams } from 'next/navigation'
import { BillingDocumentDetail } from "@/components/billing/document-detail"
export default function BillingDocumentDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <BillingDocumentDetail id={params.id} />
    </div>
  )
}
```

### 6.2 List Component Pattern

**File:** `src/components/billing/document-list.tsx`

Structure:
```tsx
'use client'
import { useBillingDocuments } from '@/hooks'
// ... UI imports (Table, Button, Input, Select, Search)

export function BillingDocumentList() {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useBillingDocuments({ search, page, pageSize: 25 })

  return (
    <div className="space-y-4">
      {/* Header with title + new button */}
      {/* Filters row */}
      {/* Table */}
      {/* Pagination */}
    </div>
  )
}
```

**File:** `src/components/billing/price-list-list.tsx` - Similar but with sheet-based creation dialog.

### 6.3 Sheet Form Pattern

**File:** `src/components/billing/price-list-form-sheet.tsx`

```tsx
'use client'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface PriceListFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editItem?: Record<string, unknown> | null
}

export function PriceListFormSheet({ open, onOpenChange, editItem }) {
  const isEdit = !!editItem
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const createMutation = useCreateBillingPriceList()
  const updateMutation = useUpdateBillingPriceList()

  React.useEffect(() => {
    if (open) {
      if (editItem) { setForm({...populated...}) }
      else { setForm(INITIAL_STATE) }
    }
  }, [open, editItem])

  const handleSubmit = async () => { /* create or update */ }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader><SheetTitle>...</SheetTitle></SheetHeader>
        {/* Form fields */}
        <SheetFooter>
          <Button onClick={handleClose}>Abbrechen</Button>
          <Button onClick={handleSubmit}>Speichern</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### 6.4 Full-Page Form Pattern

**File:** `src/components/billing/document-form.tsx`

For more complex forms (like creating a billing document), a full-page form at `/orders/documents/new` is used instead of a sheet. Uses Card components, handles form state with `React.useState`, and redirects to the detail page on success.

### 6.5 Detail Page Pattern

**File:** `src/components/billing/document-detail.tsx`

- Uses tabs (Tabs, TabsContent, TabsList, TabsTrigger)
- Shows document header info with DetailRow components
- Has action buttons (Cancel, Forward, Duplicate, Finalize)
- Positions tab shows `<DocumentPositionTable />`
- Chain tab shows linked documents

### 6.6 Position Table Pattern

**File:** `src/components/billing/document-position-table.tsx`

- Inline-editable table with Input fields in cells
- Debounced updates (type description, blur to save)
- Price list autocomplete using Popover
- Add/delete position buttons
- Position types: ARTICLE, FREE, TEXT, PAGE_BREAK, SUBTOTAL

---

## 7. Hooks Pattern

### 7.1 Hook File Pattern

**File:** `src/hooks/use-billing-documents.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useBillingDocuments(options) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.list.queryOptions(
      { ...input, page: input.page ?? 1, pageSize: input.pageSize ?? 25 },
      { enabled }
    )
  )
}

export function useBillingDocumentById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}
```

### 7.2 Barrel Export

**File:** `src/hooks/index.ts` (at the end, around line 767-782)

All hooks must be re-exported from the barrel file:
```ts
// Billing Recurring Invoices
export {
  useBillingRecurringInvoices,
  useBillingRecurringInvoice,
  // ...
} from './use-billing-recurring'
```

---

## 8. Test Patterns

### 8.1 Service Unit Tests

**File:** `src/lib/services/__tests__/billing-document-service.test.ts`

Pattern:
```ts
import { describe, it, expect, vi } from "vitest"
import * as service from "../billing-document-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
// ... more constants

const mockDocument = { /* full mock object */ }
```

Uses `vi.fn()` for Prisma method mocking. No transaction mocking needed for simple service tests.

**File:** `src/lib/services/__tests__/billing-price-list-service.test.ts`

Pattern with `createMockPrisma`:
```ts
function createMockPrisma(overrides = {}) {
  return {
    billingPriceList: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(mockPriceList),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.billingPriceList,
    },
    $transaction: vi.fn().mockImplementation(async (fn) => fn(createMockPrisma(overrides))),
  }
}
```

### 8.2 Router Tests

**File:** `src/trpc/routers/__tests__/billingPriceLists-router.test.ts`

```ts
import { createCallerFactory } from "@/trpc/init"
import { billingPriceListsRouter } from "../billing/priceLists"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// CRITICAL: Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))

const createCaller = createCallerFactory(billingPriceListsRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
  },
}

function withModuleMock(prisma) {
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

describe("billing.priceLists.list", () => {
  it("returns paginated list", async () => {
    const prisma = { billingPriceList: { findMany: vi.fn().mockResolvedValue([...]), count: vi.fn().mockResolvedValue(1) } }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
  })

  it("requires permission", async () => {
    const caller = createCaller(createNoPermContext({}))
    await expect(caller.list({ page: 1, pageSize: 10 })).rejects.toThrow("Insufficient permissions")
  })
})
```

### 8.3 Test Helpers

**File:** `src/trpc/routers/__tests__/helpers.ts`

Key exports:
- `autoMockPrisma(partial)` - Proxy that auto-stubs missing Prisma methods
- `createMockUser(overrides)` - Creates ContextUser
- `createMockSession()` - Creates Supabase Session
- `createMockContext(overrides)` - Creates TRPCContext (auto-wraps prisma)
- `createMockUserGroup(overrides)` - Creates UserGroup
- `createAdminUser(overrides)` - User with isAdmin: true
- `createUserWithPermissions(permissionIds, overrides)` - User with specific perms
- `createMockTenant(overrides)` - Creates Tenant
- `createMockUserTenant(userId, tenantId, tenant?)` - Creates UserTenant join

### 8.4 E2E Browser Tests

**Directory:** `src/e2e-browser/`

Naming convention: `NN-feature-name.spec.ts` where NN is a 2-digit number.

Existing billing tests:
- `30-billing-documents.spec.ts`
- `31-billing-service-cases.spec.ts`
- `32-billing-open-items.spec.ts`
- `33-billing-price-lists.spec.ts`

New test would be `34-billing-recurring.spec.ts`.

Test structure:
```ts
import { test, expect } from "@playwright/test"
import { navigateTo, waitForTableLoad } from "./helpers/nav"
import { fillInput, submitAndWaitForClose, waitForSheet, expectTableContains } from "./helpers/forms"

test.describe.serial("UC-ORD-05: Recurring Invoices", () => {
  test("Voraussetzung: ...", async ({ page }) => { ... })
  test("Schritt 1: ...", async ({ page }) => { ... })
  // ...
})
```

### 8.5 E2E Helpers

**File:** `src/e2e-browser/helpers/nav.ts`:
- `navigateTo(page, path)` - Navigate and wait for main content
- `waitForTableLoad(page)` - Wait for table tbody tr
- `expectPageTitle(page, title)` - Assert heading

**File:** `src/e2e-browser/helpers/forms.ts`:
- `waitForSheet(page)` - Wait for `[data-slot="sheet-content"][data-state="open"]`
- `fillInput(page, id, value)` - Fill by #id
- `selectOption(page, triggerLabel, optionText)` - Combobox select
- `submitSheet(page)` - Click last button in sheet-footer
- `submitAndWaitForClose(page)` - Submit + wait for sheet close
- `expectTableContains(page, text)` - Row exists
- `openRowActions(page, rowText)` - Open action dropdown
- `clickMenuItem(page, text)` - Click dropdown item
- `confirmDelete(page)` - Confirm in sheet dialog

---

## 9. Navigation / Sidebar

### 9.1 Sidebar Nav Config

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

The billing section (lines 311-344):
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
    {
      titleKey: 'billingPriceLists',
      href: '/orders/price-lists',
      icon: Tag,
      module: 'billing',
      permissions: ['billing_price_lists.view'],
    },
  ],
},
```

A new item needs to be added for recurring invoices:
```ts
{
  titleKey: 'billingRecurringInvoices',
  href: '/orders/recurring',
  icon: Repeat,  // already imported at top of file
  module: 'billing',
  permissions: ['billing_recurring.view'],
},
```

Note: `Repeat` icon is already imported at line 38.

### 9.2 Translation Keys

**File:** `messages/de.json` (nav section, around line 109-114):
```json
"billingSection": "Fakturierung",
"billingDocuments": "Belege",
"billingServiceCases": "Kundendienst",
"billingOpenItems": "Offene Posten",
"billingPriceLists": "Preislisten"
```

Need to add: `"billingRecurringInvoices": "Wiederkehrende Rechnungen"`

**File:** `messages/en.json` (same section):
```json
"billingSection": "Billing",
"billingDocuments": "Documents",
"billingServiceCases": "Service Cases",
"billingOpenItems": "Open Items",
"billingPriceLists": "Price Lists"
```

Need to add: `"billingRecurringInvoices": "Recurring Invoices"`

### 9.3 Sidebar Filtering

**File:** `src/components/layout/sidebar/sidebar-nav.tsx`

Uses `useTranslations('nav')` for labels. Items are filtered by:
1. Module check: `item.module && !enabledModules.has(item.module)` -> hide
2. Permission check: `item.permissions` array uses `check(item.permissions)` which uses `usePermissionChecker` hook

---

## 10. Database Migration

### 10.1 Migration Naming

Pattern: `YYYYMMDDNNNNNN_description.sql`

Last migration: `20260101000102_create_billing_price_lists.sql`

Next: `20260101000103_create_billing_recurring_invoices.sql`

### 10.2 Migration Content Pattern

Example from `20260101000102_create_billing_price_lists.sql`:
```sql
-- ORD_04: Billing Price Lists (Preislisten)

CREATE TABLE billing_price_lists (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT            NOT NULL,
    -- ...
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id   UUID
);

CREATE INDEX idx_... ON ...;

CREATE TRIGGER set_..._updated_at
  BEFORE UPDATE ON ...
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 10.3 Enum Creation

For the new `BillingRecurringInterval` enum, must create a PostgreSQL enum type:
```sql
CREATE TYPE billing_recurring_interval AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY');
```

---

## 11. Handbook Documentation

### 11.1 Handbook Location

**File:** `docs/TERP_HANDBUCH.md` (the full handbook, used for e2e tests)
**File:** `TERP_HANDBUCH.md` (root file, older/shorter version -- sections 1-11 only, no billing)

The full handbook (`docs/TERP_HANDBUCH.md`) has section 13 "Belege & Fakturierung" with subsections 13.1-13.12.

### 11.2 Where to Add

The new section would be **13.13 Wiederkehrende Rechnungen** after 13.12 Preislisten (line 5875) and before 14. Glossar (line 5876).

### 11.3 Handbook Structure

Each section follows this pattern:
```markdown
### 13.12 Preislisten

**Was ist es?** Description of the feature.

**Wozu dient es?** Purpose/value proposition.

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `permission.key1` (Action1), `permission.key2` (Action2)

📍 Aufträge > Preislisten

Sie sehen die Liste aller ... des aktiven Mandanten.

#### Feature-Unterpunkt

Tabelle/Beschreibung...

#### 13.12.1 Praxisbeispiel: Title

**Voraussetzung:** ...

**Schritt 1: ...**

1. 📍 Navigation path
2. Klick auf "Button"
3. ...
4. ✅ Erwartetes Ergebnis
```

### 11.4 Table of Contents Update

The handbook TOC (lines 12-59) lists all sections. A new entry would be added after line 58:
```markdown
    - [13.13 Wiederkehrende Rechnungen](#1313-wiederkehrende-rechnungen)
```

### 11.5 Glossary Update

Section 14 Glossar (line 5876) has entries as a table. Would need entries for:
- **Wiederkehrende Rechnung** - Description | 📍 Aufträge > Wiederkehrende Rechnungen

### 11.6 Appendix Update

The Seitenübersicht (line 5956) table would need new rows:
```
| `/orders/recurring` | Aufträge → Wiederkehrende Rechnungen | billing_recurring.view |
| `/orders/recurring/new` | Aufträge → Wiederkehrende Rechnungen → Neu | billing_recurring.manage |
| `/orders/recurring/[id]` | Wiederkehrende Rechnungen → Zeile anklicken | billing_recurring.view |
```

---

## 12. Service File Patterns (for reference)

### 12.1 All Billing Service Files

- `src/lib/services/billing-document-service.ts` (728 lines)
- `src/lib/services/billing-document-repository.ts` (254 lines)
- `src/lib/services/billing-document-pdf-service.ts`
- `src/lib/services/billing-service-case-service.ts`
- `src/lib/services/billing-service-case-repository.ts`
- `src/lib/services/billing-payment-service.ts`
- `src/lib/services/billing-payment-repository.ts`
- `src/lib/services/billing-price-list-service.ts`
- `src/lib/services/billing-price-list-repository.ts`

### 12.2 Service Error Class Pattern

Every service defines its own error classes at the top:
```ts
export class BillingRecurringInvoiceNotFoundError extends Error {
  constructor(message = "Recurring invoice not found") {
    super(message); this.name = "BillingRecurringInvoiceNotFoundError"
  }
}
export class BillingRecurringInvoiceValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingRecurringInvoiceValidationError"
  }
}
```

These are automatically mapped by `handleServiceError` via class name suffix matching.

---

## 13. Key Architecture Decisions

1. **positionTemplate as JSONB**: The ticket specifies storing position templates as JSONB array rather than a separate junction table. This avoids complexity since recurring invoice positions are only used as templates.

2. **Invoice generation uses existing billing-document-service**: The `generate` function should call `billingDocService.create()` and `billingDocService.addPosition()` to create the actual invoice, then call `recalculateTotals`. This reuses all existing validation and number generation.

3. **Cron job processes all tenants**: Following the `calculate-days` pattern, the cron iterates all active tenants and finds due recurring invoices where `autoGenerate=true` and `nextDueDate <= today`.

4. **No BillingRecurringInvoice relation on BillingDocument**: The ticket does not specify a foreign key from BillingDocument back to BillingRecurringInvoice. Generation history would be tracked via `lastGeneratedAt` on the template and/or by looking at invoices created for the same address.

5. **Module guard**: All procedures use `tenantProcedure.use(requireModule("billing"))` as the base.

---

## 14. Files to Create/Modify Summary

### New Files
- `supabase/migrations/20260101000103_create_billing_recurring_invoices.sql`
- `src/lib/services/billing-recurring-invoice-service.ts`
- `src/lib/services/billing-recurring-invoice-repository.ts`
- `src/trpc/routers/billing/recurringInvoices.ts`
- `src/hooks/use-billing-recurring.ts`
- `src/components/billing/recurring-list.tsx`
- `src/components/billing/recurring-form.tsx`
- `src/components/billing/recurring-detail.tsx`
- `src/components/billing/recurring-position-editor.tsx`
- `src/components/billing/recurring-generate-dialog.tsx`
- `src/app/[locale]/(dashboard)/orders/recurring/page.tsx`
- `src/app/[locale]/(dashboard)/orders/recurring/[id]/page.tsx`
- `src/app/[locale]/(dashboard)/orders/recurring/new/page.tsx`
- `src/app/api/cron/recurring-invoices/route.ts`
- `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts`
- `src/trpc/routers/__tests__/billingRecurring-router.test.ts`
- `src/app/api/cron/recurring-invoices/__tests__/route.test.ts`
- `src/e2e-browser/34-billing-recurring.spec.ts`

### Modified Files
- `prisma/schema.prisma` - Add BillingRecurringInvoice model + enum + Tenant relation
- `src/lib/auth/permission-catalog.ts` - Add 3 new permissions
- `src/trpc/routers/billing/index.ts` - Add recurringInvoices sub-router
- `src/hooks/index.ts` - Add barrel exports for recurring hooks
- `src/components/layout/sidebar/sidebar-nav-config.ts` - Add nav item
- `messages/de.json` - Add nav translation
- `messages/en.json` - Add nav translation
- `vercel.json` - Add cron entry
- `docs/TERP_HANDBUCH.md` - Add section 13.13 + TOC + glossary + appendix
