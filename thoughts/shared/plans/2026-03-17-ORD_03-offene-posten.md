# Implementation Plan: ORD_03 Offene Posten / Zahlungen

Date: 2026-03-17
Ticket: ORD_03

## Overview

Implement the open items (Offene Posten) and payment tracking system for the billing module. When an invoice is printed (finalized), it automatically becomes an open item. Payments (cash/bank) are recorded against invoices, with support for partial payments, two-tier discount (Skonto), and overdue detection. Credit notes linked to invoices reduce the effective balance.

**Core concept:** No separate "open item" model is needed. An invoice (BillingDocument with type=INVOICE and status=PRINTED) with payments summing to less than totalGross is an "open item." Payment status is computed from the relationship between totalGross and sum of active BillingPayment records.

**New model:** `BillingPayment` -- tracks individual payment records against invoices.

**Key business rules:**
- Only PRINTED INVOICE documents can receive payments
- Two Skonto tiers: discountDays/discountPercent and discountDays2/discountPercent2
- Payment cancellation restores the open balance
- Overdue = dueDate (documentDate + paymentTermDays) < now() AND status != PAID
- Credit notes with parentDocumentId pointing to an invoice reduce effective totalGross

---

## Phase 1: Database Schema & Permissions

### Files
- `prisma/schema.prisma` (modify) -- add BillingPayment model, enums, relations
- `supabase/migrations/20260101000101_create_billing_payments.sql` (new) -- SQL migration
- `src/lib/auth/permission-catalog.ts` (modify) -- add 3 billing_payments permissions

### Steps

#### 1.1 Add Prisma enums and model

In `prisma/schema.prisma`, after the `BillingServiceCase` model block (line ~754), add:

```prisma
// -----------------------------------------------------------------------------
// BillingPayment
// -----------------------------------------------------------------------------
// Migration: 000101
//
// Payment record against a billing document (INVOICE).
// Types: CASH (bar), BANK (Überweisung).
// Supports partial payments, discount (Skonto), and cancellation.

enum BillingPaymentType {
  CASH
  BANK

  @@map("billing_payment_type")
}

enum BillingPaymentStatus {
  ACTIVE
  CANCELLED

  @@map("billing_payment_status")
}

model BillingPayment {
  id            String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                @map("tenant_id") @db.Uuid
  documentId    String                @map("document_id") @db.Uuid
  date          DateTime              @db.Timestamptz(6)
  amount        Float
  type          BillingPaymentType
  status        BillingPaymentStatus  @default(ACTIVE)
  isDiscount    Boolean               @default(false) @map("is_discount")
  notes         String?
  cancelledAt   DateTime?             @map("cancelled_at") @db.Timestamptz(6)
  cancelledById String?               @map("cancelled_by_id") @db.Uuid
  createdAt     DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime              @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?               @map("created_by_id") @db.Uuid

  tenant   Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  document BillingDocument @relation(fields: [documentId], references: [id])

  @@index([tenantId, documentId])
  @@index([tenantId, date])
  @@map("billing_payments")
}
```

#### 1.2 Add relation on BillingDocument

In the `BillingDocument` model, after the `billingServiceCases` relation line (line ~667), add:

```prisma
  payments            BillingPayment[]
```

#### 1.3 Add relation on Tenant

In the `Tenant` model, after `billingServiceCases` (line ~185), add:

```prisma
  billingPayments             BillingPayment[]
```

#### 1.4 Create SQL migration

Create `supabase/migrations/20260101000101_create_billing_payments.sql`:

```sql
-- ORD_03: Billing Payments (Offene Posten / Zahlungen)

CREATE TYPE billing_payment_type AS ENUM ('CASH', 'BANK');
CREATE TYPE billing_payment_status AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE billing_payments (
    id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID                    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id       UUID                    NOT NULL REFERENCES billing_documents(id),
    date              TIMESTAMPTZ             NOT NULL,
    amount            DOUBLE PRECISION        NOT NULL,
    type              billing_payment_type    NOT NULL,
    status            billing_payment_status  NOT NULL DEFAULT 'ACTIVE',
    is_discount       BOOLEAN                 NOT NULL DEFAULT FALSE,
    notes             TEXT,
    cancelled_at      TIMESTAMPTZ,
    cancelled_by_id   UUID,
    created_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    created_by_id     UUID
);

-- Indexes
CREATE INDEX idx_billing_payments_tenant_document ON billing_payments(tenant_id, document_id);
CREATE INDEX idx_billing_payments_tenant_date ON billing_payments(tenant_id, date);

-- Trigger for updated_at
CREATE TRIGGER set_billing_payments_updated_at
  BEFORE UPDATE ON billing_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

#### 1.5 Add permissions

In `src/lib/auth/permission-catalog.ts`, after the billing_service_cases permissions (line 259), add:

```ts
  // Billing Payments
  p("billing_payments.view", "billing_payments", "view", "View payments and open items"),
  p("billing_payments.create", "billing_payments", "create", "Record payments"),
  p("billing_payments.cancel", "billing_payments", "cancel", "Cancel payments"),
```

Update the count comment from "78 permissions" to "81 permissions" (line 43).

#### 1.6 Generate Prisma client

Run `pnpm db:generate` to regenerate the Prisma client with the new model.

### Verification
```bash
pnpm db:generate          # Must succeed without errors
pnpm typecheck 2>&1 | tail -5  # Check no new type errors introduced
```

---

## Phase 2: Repository & Service Layer

### Files
- `src/lib/services/billing-payment-repository.ts` (new)
- `src/lib/services/billing-payment-service.ts` (new)

### Steps

#### 2.1 Create Repository (`billing-payment-repository.ts`)

Follow the exact pattern from `billing-service-case-repository.ts`.

**Includes:**
```ts
const LIST_INCLUDE = {
  document: {
    select: {
      id: true, number: true, type: true, status: true,
      documentDate: true, totalGross: true,
      paymentTermDays: true, discountPercent: true, discountDays: true,
      discountPercent2: true, discountDays2: true,
      address: { select: { id: true, company: true } },
    },
  },
}

const DETAIL_INCLUDE = {
  document: {
    include: {
      address: true,
      contact: true,
      payments: { orderBy: { date: "desc" as const } },
    },
  },
}
```

**Functions:**

| Function | Purpose |
|----------|---------|
| `findPaymentsByDocumentId(prisma, tenantId, documentId)` | All payments for a document, ordered by date desc |
| `findPaymentById(prisma, tenantId, id)` | Single payment with document include |
| `createPayment(prisma, data)` | Insert a new payment record |
| `cancelPayment(prisma, id, cancelledById)` | Set status=CANCELLED, cancelledAt, cancelledById |
| `findOpenItems(prisma, tenantId, params)` | Query invoices with payment aggregation for open items list |
| `findOpenItemByDocumentId(prisma, tenantId, documentId)` | Single invoice with all payments for detail view |
| `getOpenItemsSummary(prisma, tenantId, addressId?)` | Aggregate: total open, total overdue, count by status |

**`findOpenItems` implementation notes:**
- Query `BillingDocument` where `type = "INVOICE"` AND `status IN ("PRINTED", "PARTIALLY_FORWARDED", "FORWARDED")`
- Include `payments` relation (only ACTIVE status)
- Filter by addressId, search (number, address.company), dateFrom/dateTo
- Post-process: compute paidAmount, openAmount, paymentStatus, dueDate, isOverdue
- Filter by status param (open/partial/paid/overdue) after computation
- Return paginated results with `{ items, total }`

**`getOpenItemsSummary` implementation notes:**
- Aggregate across all open invoices for the tenant (optionally filtered by addressId)
- Return: `{ totalOpen, totalOverdue, countOpen, countPartial, countPaid, countOverdue }`

#### 2.2 Create Service (`billing-payment-service.ts`)

Follow the exact pattern from `billing-service-case-service.ts`.

**Error classes:**
```ts
export class BillingPaymentNotFoundError extends Error {
  constructor(message = "Payment not found") {
    super(message); this.name = "BillingPaymentNotFoundError"
  }
}

export class BillingPaymentValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingPaymentValidationError"
  }
}

export class BillingPaymentConflictError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingPaymentConflictError"
  }
}
```

**Service functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `listOpenItems` | `(prisma, tenantId, params)` | Delegates to repo.findOpenItems, applies payment status computation |
| `getOpenItemById` | `(prisma, tenantId, documentId)` | Returns document with payments + computed fields; throws NotFoundError |
| `getOpenItemsSummary` | `(prisma, tenantId, addressId?)` | Delegates to repo.getOpenItemsSummary |
| `listPayments` | `(prisma, tenantId, documentId)` | All payments for a document |
| `createPayment` | `(prisma, tenantId, input, createdById)` | Record payment with validation |
| `cancelPayment` | `(prisma, tenantId, id, cancelledById, reason?)` | Cancel payment, restore balance |

**`createPayment` business logic:**
1. Validate document exists, belongs to tenant
2. Validate document.type === "INVOICE" (throw ValidationError otherwise)
3. Validate document.status !== "DRAFT" and status !== "CANCELLED" (must be PRINTED or forwarded)
4. Fetch all active payments for this document
5. Calculate `paidAmount = sum of active payments`
6. Calculate `effectiveTotalGross = totalGross - creditNoteReductions` (query child CREDIT_NOTE documents)
7. Calculate `openAmount = effectiveTotalGross - paidAmount`
8. If `input.isDiscount`:
   - Determine applicable discount tier based on `input.date` vs `document.documentDate`
   - Tier 1: within discountDays -> discountPercent
   - Tier 2: within discountDays2 -> discountPercent2
   - If no tier applies, throw ValidationError("Discount period expired")
   - Validate that payment amount + discount amount would close the balance
   - Create a discount payment record with isDiscount=true
9. Validate `input.amount <= openAmount + 0.01` (small tolerance for rounding)
10. Create payment record via repo.createPayment
11. Return the created payment with updated status info

**`cancelPayment` business logic:**
1. Find payment by ID, validate belongs to tenant
2. Validate payment.status === "ACTIVE" (throw ValidationError if already cancelled)
3. Set status=CANCELLED, cancelledAt=now, cancelledById
4. If reason provided, append to notes
5. Return updated payment

**Helper functions (exported for testing):**
```ts
export function computePaymentStatus(totalGross: number, paidAmount: number): "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID"
export function computeDueDate(documentDate: Date, paymentTermDays: number | null): Date | null
export function isOverdue(dueDate: Date | null, paymentStatus: string): boolean
export function getApplicableDiscount(document, paymentDate: Date): { percent: number; tier: 1 | 2 } | null
```

### Dependencies
- Phase 1 must be complete (Prisma model generated)

### Verification
```bash
pnpm typecheck 2>&1 | tail -5  # No new type errors from service/repo files
```

---

## Phase 3: tRPC Router

### Files
- `src/trpc/routers/billing/payments.ts` (new)
- `src/trpc/routers/billing/index.ts` (modify)

### Steps

#### 3.1 Create payments router (`src/trpc/routers/billing/payments.ts`)

Follow the exact pattern from `serviceCases.ts`:
- Import `z`, `createTRPCRouter`, `tenantProcedure`, `handleServiceError`, `requirePermission`, `requireModule`, `permissionIdByKey`
- Import service as `* as paymentService`
- Define permission constants: `PAY_VIEW`, `PAY_CREATE`, `PAY_CANCEL`
- Define `billingProcedure = tenantProcedure.use(requireModule("billing"))`
- Use relaxed UUID regex pattern (same as serviceCases.ts)
- Every handler wrapped in `try { ... } catch (err) { handleServiceError(err) }`
- Cast prisma: `ctx.prisma as unknown as PrismaClient`

**Router structure:**
```ts
export const billingPaymentsRouter = createTRPCRouter({
  openItems: createTRPCRouter({
    list: billingProcedure
      .use(requirePermission(PAY_VIEW))
      .input(openItemsListInput)
      .query(async ({ ctx, input }) => { ... }),

    getById: billingProcedure
      .use(requirePermission(PAY_VIEW))
      .input(z.object({ documentId: uuid }))
      .query(async ({ ctx, input }) => { ... }),

    summary: billingProcedure
      .use(requirePermission(PAY_VIEW))
      .input(z.object({ addressId: uuid.optional() }))
      .query(async ({ ctx, input }) => { ... }),
  }),

  list: billingProcedure
    .use(requirePermission(PAY_VIEW))
    .input(z.object({ documentId: uuid }))
    .query(async ({ ctx, input }) => { ... }),

  create: billingProcedure
    .use(requirePermission(PAY_CREATE))
    .input(createPaymentInput)
    .mutation(async ({ ctx, input }) => { ... }),

  cancel: billingProcedure
    .use(requirePermission(PAY_CANCEL))
    .input(z.object({ id: uuid, reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => { ... }),
})
```

**Input schemas:**
```ts
const openItemsListInput = z.object({
  addressId: optionalUuid,
  status: z.enum(["open", "partial", "paid", "overdue"]).optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createPaymentInput = z.object({
  documentId: uuid,
  date: z.coerce.date(),
  amount: z.number().positive(),
  type: z.enum(["CASH", "BANK"]),
  isDiscount: z.boolean().optional().default(false),
  notes: z.string().optional(),
})
```

#### 3.2 Wire into billing router

In `src/trpc/routers/billing/index.ts`:
- Add import: `import { billingPaymentsRouter } from "./payments"`
- Add to router: `payments: billingPaymentsRouter`
- Update JSDoc comment to mention payments

### Dependencies
- Phase 2 must be complete (service layer)

### Verification
```bash
pnpm typecheck 2>&1 | tail -5  # No new type errors
```

---

## Phase 4: React Hooks

### Files
- `src/hooks/use-billing-payments.ts` (new)
- `src/hooks/index.ts` (modify)

### Steps

#### 4.1 Create hooks file (`src/hooks/use-billing-payments.ts`)

Follow the exact pattern from `use-billing-service-cases.ts`:

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Open Items ---
export function useBillingOpenItems(options: { ... } = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(trpc.billing.payments.openItems.list.queryOptions({ ...input }, { enabled }))
}

export function useBillingOpenItem(documentId: string, options = {}) {
  const trpc = useTRPC()
  return useQuery(trpc.billing.payments.openItems.getById.queryOptions(
    { documentId },
    { enabled: !!documentId, ...options }
  ))
}

export function useBillingOpenItemsSummary(addressId?: string) {
  const trpc = useTRPC()
  return useQuery(trpc.billing.payments.openItems.summary.queryOptions({ addressId }))
}

// --- Payments ---
export function useBillingPayments(documentId: string) {
  const trpc = useTRPC()
  return useQuery(trpc.billing.payments.list.queryOptions({ documentId }, { enabled: !!documentId }))
}

export function useCreateBillingPayment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.payments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.payments.openItems.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.payments.openItems.summary.queryKey() })
    },
  })
}

export function useCancelBillingPayment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.payments.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.payments.openItems.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.payments.openItems.summary.queryKey() })
    },
  })
}
```

#### 4.2 Export from barrel file

In `src/hooks/index.ts`, after the "Billing Service Cases" export block (line ~755), add:

```ts
// Billing Payments (Open Items)
export {
  useBillingOpenItems,
  useBillingOpenItem,
  useBillingOpenItemsSummary,
  useBillingPayments,
  useCreateBillingPayment,
  useCancelBillingPayment,
} from './use-billing-payments'
```

### Dependencies
- Phase 3 must be complete (tRPC router)

### Verification
```bash
pnpm typecheck 2>&1 | tail -5  # No new type errors
```

---

## Phase 5: UI Components

### Files (all new unless noted)
- `src/components/billing/payment-status-badge.tsx`
- `src/components/billing/open-items-summary-card.tsx`
- `src/components/billing/open-item-list.tsx`
- `src/components/billing/open-item-detail.tsx`
- `src/components/billing/payment-form-dialog.tsx`
- `src/components/billing/payment-cancel-dialog.tsx`
- `src/app/[locale]/(dashboard)/orders/open-items/page.tsx` (new)
- `src/app/[locale]/(dashboard)/orders/open-items/[documentId]/page.tsx` (new)
- `src/components/layout/sidebar/sidebar-nav-config.ts` (modify)

### Steps

#### 5.1 PaymentStatusBadge (`payment-status-badge.tsx`)

Follow pattern from `document-status-badge.tsx`:

```tsx
'use client'
import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  UNPAID:   { label: 'Offen',        variant: 'bg-gray-100 text-gray-800' },
  PARTIAL:  { label: 'Teilzahlung',  variant: 'bg-yellow-100 text-yellow-800' },
  PAID:     { label: 'Bezahlt',      variant: 'bg-green-100 text-green-800' },
  OVERPAID: { label: 'Überzahlt',    variant: 'bg-blue-100 text-blue-800' },
  OVERDUE:  { label: 'Überfällig',   variant: 'bg-red-100 text-red-800' },
}

export function PaymentStatusBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  const effectiveStatus = isOverdue && status !== 'PAID' ? 'OVERDUE' : status
  const config = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.UNPAID
  return <Badge variant="outline" className={config.variant}>{config.label}</Badge>
}
```

#### 5.2 OpenItemsSummaryCard (`open-items-summary-card.tsx`)

KPI card showing: Total Open Amount, Total Overdue, Count by status.
Use `useBillingOpenItemsSummary` hook.
Follow the CRM reports KPI card pattern.

#### 5.3 OpenItemList (`open-item-list.tsx`)

Follow pattern from `document-list.tsx`:

**Table columns:**
| Column | Field | Format |
|--------|-------|--------|
| Rechnungsnr. | document.number | String |
| Kunde | document.address.company | String |
| Rechnungsdatum | document.documentDate | formatDate |
| Fällig am | computed dueDate | formatDate |
| Brutto | document.totalGross | formatCurrency |
| Bezahlt | computed paidAmount | formatCurrency |
| Offen | computed openAmount | formatCurrency |
| Status | computed paymentStatus | PaymentStatusBadge |

**Toolbar filters:**
- Status dropdown: Alle / Offen / Teilzahlung / Bezahlt / Überfällig
- Customer search (text input)
- Date range (from/to)

**Row behavior:**
- Click navigates to `/orders/open-items/[documentId]`
- Overdue rows highlighted with red-50 background

**Summary card** at the top (OpenItemsSummaryCard).

**Pagination** at the bottom.

#### 5.4 OpenItemDetail (`open-item-detail.tsx`)

Follow pattern from `document-detail.tsx`:

**Header section:**
- Back button -> /orders/open-items
- Title: "Rechnung {number}"
- PaymentStatusBadge
- Action button: "Zahlung erfassen" (opens PaymentFormDialog)

**Invoice summary card:**
- Customer, Date, Due Date, Total Gross, Paid Amount, Open Amount
- Discount tiers info (if configured): "Skonto 1: X% innerhalb von Y Tagen", "Skonto 2: X% innerhalb von Y Tagen"

**Payment history table:**
| Column | Description |
|--------|-------------|
| Datum | payment.date |
| Betrag | payment.amount (formatCurrency) |
| Art | CASH="Bar", BANK="Überweisung" |
| Skonto | payment.isDiscount ? "Ja" : "—" |
| Status | ACTIVE="Aktiv", CANCELLED="Storniert" |
| Notizen | payment.notes |
| Aktionen | Cancel button (for ACTIVE payments) |

#### 5.5 PaymentFormDialog (`payment-form-dialog.tsx`)

Dialog for recording a payment:

**Fields:**
- Datum (date picker, default: today)
- Betrag (number input, pre-filled with openAmount)
- Zahlungsart (select: Bar / Überweisung)
- Skonto (checkbox, only shown if discount tiers are configured and within period)
  - When checked, show applicable discount info and auto-calculate discount amount
- Notizen (textarea, optional)

**Submit button:** "Zahlung erfassen"
**Cancel button:** "Abbrechen"

Uses `useCreateBillingPayment` mutation.

#### 5.6 PaymentCancelDialog (`payment-cancel-dialog.tsx`)

Confirmation dialog:
- Text: "Möchten Sie diese Zahlung wirklich stornieren?"
- Optional reason textarea
- Confirm / Cancel buttons

Uses `useCancelBillingPayment` mutation.

#### 5.7 Page routes

**List page** (`src/app/[locale]/(dashboard)/orders/open-items/page.tsx`):
```tsx
import { OpenItemList } from '@/components/billing/open-item-list'
export default function OpenItemsPage() {
  return <OpenItemList />
}
```

**Detail page** (`src/app/[locale]/(dashboard)/orders/open-items/[documentId]/page.tsx`):
```tsx
import { OpenItemDetail } from '@/components/billing/open-item-detail'
export default function OpenItemDetailPage({ params }: { params: { documentId: string } }) {
  return <OpenItemDetail documentId={params.documentId} />
}
```

#### 5.8 Sidebar navigation

In `src/components/layout/sidebar/sidebar-nav-config.ts`:

- Add import: `Wallet` from `lucide-react` (at the top with other icon imports)
- After the `billingServiceCases` item (line ~327), add:
```ts
      {
        titleKey: 'billingOpenItems',
        href: '/orders/open-items',
        icon: Wallet,
        module: 'billing',
        permissions: ['billing_payments.view'],
      },
```

### Dependencies
- Phase 4 must be complete (hooks)

### Verification
```bash
pnpm typecheck 2>&1 | tail -5  # No new type errors
pnpm lint 2>&1 | tail -10      # No lint errors in new files
pnpm dev &                      # Start dev server
# Manual: navigate to /orders/open-items and verify page loads
```

---

## Phase 6: Tests

### Files (all new)
- `src/lib/services/__tests__/billing-payment-service.test.ts`
- `src/trpc/routers/__tests__/billingPayments-router.test.ts`
- `src/e2e-browser/32-billing-open-items.spec.ts`
- `src/e2e-browser/global-setup.ts` (modify)

### Steps

#### 6.1 Service unit tests (`billing-payment-service.test.ts`)

Follow the exact pattern from `billing-service-case-service.test.ts`:
- Mock Prisma client with `vi.fn()`
- Test each service function with mock data
- Use the same constant UUID pattern

**Test cases:**

```
describe("computePaymentStatus")
  it("returns UNPAID when paidAmount is 0")
  it("returns PARTIAL when paidAmount < totalGross")
  it("returns PAID when paidAmount equals totalGross")
  it("returns OVERPAID when paidAmount > totalGross")

describe("computeDueDate")
  it("returns null when paymentTermDays is null")
  it("returns documentDate + paymentTermDays")

describe("isOverdue")
  it("returns false when dueDate is null")
  it("returns false when dueDate is in the future")
  it("returns true when dueDate is in the past and status is not PAID")
  it("returns false when status is PAID even if past due")

describe("getApplicableDiscount")
  it("returns tier 1 when within discountDays")
  it("returns tier 2 when past discountDays but within discountDays2")
  it("returns null when past both discount periods")
  it("returns null when no discount configured")

describe("createPayment")
  it("records payment and returns created record")
  it("rejects if document is not INVOICE type")
  it("rejects if document status is DRAFT")
  it("rejects if document status is CANCELLED")
  it("rejects if amount exceeds open amount")
  it("allows partial payment — leaves balance open")
  it("full payment — closes balance")
  it("with discount — applies correct tier based on date")
  it("with discount — rejects if discount period expired")
  it("accounts for credit notes when computing open amount")

describe("cancelPayment")
  it("sets status to CANCELLED with timestamp and userId")
  it("rejects if payment already cancelled")
  it("appends reason to notes")
  it("throws NotFoundError for non-existent payment")

describe("listOpenItems")
  it("returns only INVOICE documents")
  it("computes payment status for each item")
  it("filters by status correctly")
  it("filters by addressId")
  it("filters by search term")
  it("filters by date range")
  it("paginates correctly")

describe("getOpenItemsSummary")
  it("calculates total open and overdue amounts")
  it("returns count by status")
  it("filters by addressId when provided")
```

#### 6.2 Router tests (`billingPayments-router.test.ts`)

Follow the exact pattern from `billingServiceCases-router.test.ts`:
- Mock `@/lib/db` for requireModule
- Use `createCallerFactory`, `createMockContext`, `createUserWithPermissions`, `createMockUserTenant`
- Define permission constants: PAY_VIEW, PAY_CREATE, PAY_CANCEL
- `MODULE_MOCK` with `tenantModule.findUnique` returning billing module
- `withModuleMock` helper
- `createTestContext` and `createNoPermContext` helpers

**Test cases:**

```
describe("billing.payments.openItems.list")
  it("returns paginated open items")
  it("requires billing_payments.view permission")
  it("rejects without billing module")

describe("billing.payments.openItems.getById")
  it("returns single open item with payments")
  it("requires billing_payments.view permission")

describe("billing.payments.openItems.summary")
  it("returns summary statistics")

describe("billing.payments.create")
  it("records payment and returns result")
  it("requires billing_payments.create permission")
  it("validates documentId is UUID")
  it("validates amount is positive")

describe("billing.payments.cancel")
  it("cancels payment and returns result")
  it("requires billing_payments.cancel permission")

describe("billing.payments.list")
  it("returns payments for document")
  it("requires billing_payments.view permission")
```

#### 6.3 Browser E2E tests (`32-billing-open-items.spec.ts`)

Follow the exact pattern from `31-billing-service-cases.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import { fillInput, submitAndWaitForClose, waitForSheet, expectTableContains } from "./helpers/forms";
```

**Test suite structure:**

```
test.describe.serial("UC-ORD-03: Praxisbeispiel Offene Posten / Zahlungen", () => {

  // Precondition: create customer address
  test("Voraussetzung: Kundenadresse anlegen", async ({ page }) => {
    // Navigate to /crm/addresses, create "E2E Zahlungs GmbH"
  })

  // Precondition: create and finalize an invoice
  test("Voraussetzung: Rechnung erstellen und abschließen", async ({ page }) => {
    // 1. Navigate to /orders/documents
    // 2. Create new invoice with address "E2E Zahlungs GmbH"
    // 3. Add position (Article, qty=1, price=1000, VAT=19%)
    // 4. Finalize (print) the invoice
    // 5. Verify invoice is in PRINTED status
  })

  // Schritt 1: View open items list
  test("Schritt 1: Offene Posten anzeigen", async ({ page }) => {
    // 1. Navigate to /orders/open-items
    // 2. Verify table shows the invoice with status "Offen"
    // 3. Verify amount columns show correct values
  })

  // Schritt 2: Record partial payment
  test("Schritt 2: Teilzahlung erfassen", async ({ page }) => {
    // 1. Click on the open item row
    // 2. Click "Zahlung erfassen"
    // 3. Enter amount: 500
    // 4. Select type: Überweisung
    // 5. Submit
    // 6. Verify status changes to "Teilzahlung"
    // 7. Verify remaining open amount
  })

  // Schritt 3: Record remaining payment
  test("Schritt 3: Restzahlung erfassen", async ({ page }) => {
    // 1. Click "Zahlung erfassen" again
    // 2. Verify amount pre-filled with remaining balance
    // 3. Select type: Bar
    // 4. Submit
    // 5. Verify status changes to "Bezahlt"
  })

  // Schritt 4: Cancel last payment
  test("Schritt 4: Zahlung stornieren", async ({ page }) => {
    // 1. Click cancel on the last payment row
    // 2. Confirm dialog
    // 3. Verify status reverts to "Teilzahlung"
  })

  // Schritt 5: Verify open items summary
  test("Schritt 5: Zusammenfassung prüfen", async ({ page }) => {
    // 1. Navigate back to /orders/open-items
    // 2. Verify summary card shows correct totals
    // 3. Verify the invoice appears with correct status
  })
})
```

#### 6.4 Update global-setup.ts

In `src/e2e-browser/global-setup.ts`, add cleanup SQL **before** the billing_document_positions cleanup (before line 41):

```sql
-- Payment records (spec 32) — must come before billing docs cleanup
DELETE FROM billing_payments WHERE document_id IN (
  SELECT bd.id FROM billing_documents bd
  JOIN crm_addresses ca ON bd.address_id = ca.id
  WHERE ca.company LIKE 'E2E%'
);
```

### Dependencies
- Phase 5 must be complete (UI components, for E2E tests)
- Phases 2-3 must be complete (for unit/router tests)

### Verification
```bash
# Unit + integration tests
pnpm vitest run src/lib/services/__tests__/billing-payment-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingPayments-router.test.ts

# Browser E2E (requires dev server running)
pnpm exec playwright test src/e2e-browser/32-billing-open-items.spec.ts
```

---

## Phase 7: Handbook

### Files
- `docs/TERP_HANDBUCH.md` (modify)

### Steps

#### 7.1 Add section 13.11 before section 14

Insert new section after the `---` at line 5470 (after section 13.10.1 Praxisbeispiel ends) and before `## 14. Glossar`:

```markdown
### 13.11 Offene Posten / Zahlungen

**Was ist es?** Die Offene-Posten-Verwaltung zeigt alle unbezahlten oder teilbezahlten Rechnungen an. Sobald eine Rechnung abgeschlossen (festgeschrieben) wird, erscheint sie automatisch als offener Posten. Zahlungen werden gegen Rechnungen erfasst — bar oder per Überweisung. Skonto-Abzüge (zwei Stufen) und Teilzahlungen werden unterstützt.

**Wozu dient es?** Offene Forderungen im Blick behalten, Zahlungseingänge dokumentieren, überfällige Rechnungen erkennen und Skonto-Fristen nutzen.

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `billing_payments.view` (Anzeige), `billing_payments.create` (Zahlung erfassen), `billing_payments.cancel` (Zahlung stornieren)

📍 Aufträge > Offene Posten

Sie sehen die Liste aller offenen Posten des aktiven Mandanten mit Zusammenfassung (Gesamtbetrag offen, überfällig, Anzahl pro Status).

#### Offene-Posten-Liste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Rechnungsnr.** | Belegnummer der Rechnung (z.B. RE-1) |
| **Kunde** | Firmenname der verknüpften Adresse |
| **Rechnungsdatum** | Datum des Belegs |
| **Fällig am** | Rechnungsdatum + Zahlungsziel (Tage) |
| **Brutto** | Gesamtbetrag der Rechnung (brutto) |
| **Bezahlt** | Summe aller aktiven Zahlungen |
| **Offen** | Restbetrag (Brutto − Bezahlt) |
| **Status** | Offen, Teilzahlung, Bezahlt, Überfällig |

**Filter:**
- **Status-Filter**: Dropdown (Alle, Offen, Teilzahlung, Bezahlt, Überfällig)
- **Suchfeld**: Suche nach Rechnungsnummer oder Kundenname
- **Datumsbereich**: Von / Bis (Rechnungsdatum)

**Zusammenfassung:** Im oberen Bereich werden KPI-Karten angezeigt:
- **Gesamt offen**: Summe aller offenen Beträge
- **Überfällig**: Summe der offenen Beträge mit überschrittenem Fälligkeitsdatum
- **Anzahl**: Offen / Teilzahlung / Bezahlt

💡 **Hinweis:** Überfällige Rechnungen werden farblich hervorgehoben (rote Hinterlegung).

#### Offene-Posten-Detail

📍 Zeile in der Offene-Posten-Liste anklicken → Detailseite

✅ Seite zeigt die Rechnungszusammenfassung und die Zahlungshistorie.

**Rechnungszusammenfassung:**

| Feld | Beschreibung |
|------|-------------|
| **Rechnungsnr.** | Belegnummer |
| **Kunde** | Firma und Adresse |
| **Rechnungsdatum** | Datum des Belegs |
| **Fällig am** | Berechnetes Fälligkeitsdatum |
| **Brutto** | Gesamtbetrag |
| **Bezahlt** | Summe aktiver Zahlungen |
| **Offen** | Restbetrag |
| **Status** | Zahlungsstatus-Badge |
| **Skonto 1** | X% innerhalb von Y Tagen (falls konfiguriert) |
| **Skonto 2** | X% innerhalb von Y Tagen (falls konfiguriert) |

**Zahlungshistorie (Tabelle):**

| Spalte | Beschreibung |
|--------|-------------|
| **Datum** | Zahlungsdatum |
| **Betrag** | Zahlungsbetrag |
| **Art** | Bar / Überweisung |
| **Skonto** | Ja / — |
| **Status** | Aktiv / Storniert |
| **Notizen** | Optionale Anmerkungen |
| **Aktionen** | Stornieren-Button (nur bei aktiven Zahlungen) |

#### Zahlung erfassen

1. 📍 Offene-Posten-Detail → **"Zahlung erfassen"** (oben rechts)
2. ✅ Dialog öffnet sich: "Zahlung erfassen"
3. **Datum** auswählen (Standard: heute)
4. **Betrag** eingeben (vorausgefüllt mit dem offenen Restbetrag)
5. **Zahlungsart** wählen: Bar oder Überweisung
6. Optional: **Skonto** aktivieren (Checkbox, nur sichtbar wenn Skonto-Fristen konfiguriert sind und die Frist noch nicht abgelaufen ist)
   - Bei aktiviertem Skonto wird der Abzug automatisch berechnet und als separate Zahlung verbucht
7. Optional: **Notizen** eintragen
8. 📍 **"Zahlung erfassen"**
9. ✅ Zahlung erscheint in der Zahlungshistorie
10. ✅ Status der Rechnung aktualisiert sich (Offen → Teilzahlung → Bezahlt)

⚠️ **Teilzahlungen:** Der Betrag kann geringer als der offene Restbetrag sein. Die Rechnung wechselt dann in den Status „Teilzahlung".

#### Skonto (Rabatt bei schneller Zahlung)

Rechnungen können zwei Skonto-Stufen haben (konfiguriert über die Zahlungsbedingungen des Belegs):

| Stufe | Regel | Beispiel |
|-------|-------|---------|
| **Skonto 1** | X% Abzug bei Zahlung innerhalb von Y Tagen | 3% bei Zahlung innerhalb von 10 Tagen |
| **Skonto 2** | X% Abzug bei Zahlung innerhalb von Y Tagen | 2% bei Zahlung innerhalb von 20 Tagen |
| **Netto** | Voller Betrag nach Ablauf beider Fristen | Zahlung nach 20 Tagen = voller Betrag |

Beim Erfassen einer Zahlung mit aktiviertem Skonto:
1. Das System prüft, welche Skonto-Stufe zum Zahlungsdatum gilt
2. Der Skonto-Betrag wird automatisch berechnet
3. Zwei Einträge werden in der Zahlungshistorie erstellt: die eigentliche Zahlung und der Skonto-Abzug (markiert als „Skonto")

#### Zahlung stornieren

1. 📍 Offene-Posten-Detail → Zahlungshistorie → **"Stornieren"** (bei der gewünschten Zahlung)
2. ✅ Bestätigungsdialog: "Möchten Sie diese Zahlung wirklich stornieren?"
3. Optional: **Grund** eintragen
4. 📍 **"Bestätigen"**
5. ✅ Zahlung wird als „Storniert" markiert
6. ✅ Der stornierte Betrag wird dem offenen Posten wieder zugerechnet
7. ✅ Status der Rechnung aktualisiert sich entsprechend

#### Zahlungsstatus

| Status | Badge | Bedeutung |
|--------|-------|-----------|
| **Offen** | Grau | Keine Zahlung erfasst |
| **Teilzahlung** | Gelb | Teilbetrag bezahlt, Rest offen |
| **Bezahlt** | Grün | Vollständig bezahlt |
| **Überzahlt** | Blau | Mehr als der Rechnungsbetrag bezahlt |
| **Überfällig** | Rot | Fälligkeitsdatum überschritten und nicht vollständig bezahlt |

#### Gutschriften

Wird eine Gutschrift (Typ: Gutschrift) mit Bezug auf eine Rechnung erstellt (über „Fortführen" → Gutschrift), reduziert sich der effektive Rechnungsbetrag automatisch. Der offene Posten zeigt den reduzierten Betrag an.

#### 13.11.1 Praxisbeispiel: Rechnung mit Teilzahlung und Skonto

**Szenario:** Sie haben eine Rechnung über 1.190,00 EUR (brutto) erstellt. Der Kunde zahlt zunächst einen Teilbetrag per Überweisung, dann den Rest bar mit Skonto-Abzug.

##### Voraussetzung

Eine abgeschlossene (festgeschriebene) Rechnung RE-1 über 1.190,00 EUR mit folgenden Zahlungsbedingungen:
- Zahlungsziel: 30 Tage
- Skonto 1: 3% bei Zahlung innerhalb von 10 Tagen
- Skonto 2: 2% bei Zahlung innerhalb von 20 Tagen

##### Schritt 1 -- Offene Posten aufrufen

1. 📍 Aufträge > Offene Posten
2. ✅ RE-1 erscheint in der Liste mit Status **Offen**
3. ✅ Spalte „Offen" zeigt **1.190,00 EUR**
4. ✅ Spalte „Fällig am" zeigt das berechnete Fälligkeitsdatum (Rechnungsdatum + 30 Tage)

##### Schritt 2 -- Teilzahlung per Überweisung

1. Klick auf die Zeile **RE-1**
2. Detailseite öffnet sich
3. Klick auf **"Zahlung erfassen"**
4. **Datum**: heutiges Datum
5. **Betrag**: "500" eintragen (statt des vorausgefüllten Gesamtbetrags)
6. **Zahlungsart**: "Überweisung" auswählen
7. **Notizen**: "Anzahlung"
8. Klick auf **"Zahlung erfassen"**
9. ✅ Zahlung erscheint in der Zahlungshistorie
10. ✅ Status wechselt zu **Teilzahlung**
11. ✅ Bezahlt: 500,00 EUR | Offen: 690,00 EUR

##### Schritt 3 -- Restzahlung bar mit Skonto

1. Klick auf **"Zahlung erfassen"**
2. ✅ Betrag ist vorausgefüllt mit **690,00 EUR** (Restbetrag)
3. **Zahlungsart**: "Bar" auswählen
4. **Skonto** aktivieren (Checkbox)
5. ✅ System zeigt: „Skonto 1 (3%): Abzug 20,70 EUR" (oder Stufe 2, je nach Datum)
6. ✅ Zahlungsbetrag wird automatisch angepasst: 669,30 EUR
7. Klick auf **"Zahlung erfassen"**
8. ✅ Zwei Einträge in der Zahlungshistorie: Zahlung (669,30 EUR) und Skonto (20,70 EUR)
9. ✅ Status wechselt zu **Bezahlt**

##### Schritt 4 -- Zahlung stornieren

1. In der Zahlungshistorie: Klick auf **"Stornieren"** bei der letzten Barzahlung
2. Bestätigungsdialog → **"Bestätigen"**
3. ✅ Zahlung wird als „Storniert" markiert
4. ✅ Auch der zugehörige Skonto-Eintrag wird storniert
5. ✅ Status wechselt zurück zu **Teilzahlung**
6. ✅ Offen: 690,00 EUR

##### Ergebnis

Die Zahlungshistorie dokumentiert alle Vorgänge lückenlos:
- Teilzahlung per Überweisung (500,00 EUR — aktiv)
- Barzahlung mit Skonto (669,30 EUR — storniert)
- Skonto-Abzug (20,70 EUR — storniert)

📍 Aufträge > Offene Posten zeigt RE-1 weiterhin als „Teilzahlung" an, bis der Restbetrag beglichen ist.
```

#### 7.2 Add Glossar entries

In the Glossar table (section 14), add alphabetically:

```markdown
| **Offener Posten** | Unbezahlte oder teilbezahlte Rechnung mit Fälligkeitsdatum und Zahlungsstatus | 📍 Aufträge → Offene Posten |
| **Skonto** | Rabatt bei Zahlung innerhalb einer vereinbarten Frist (bis zu zwei Stufen) | 📍 Aufträge → Offene Posten → Detail → Zahlung erfassen |
| **Zahlung** | Erfasster Zahlungseingang (bar oder Überweisung) gegen eine Rechnung | 📍 Aufträge → Offene Posten → Detail → Zahlungshistorie |
```

#### 7.3 Add Anhang entries

In the Seitenübersicht table (Anhang), add after the `/orders/service-cases/[id]` row:

```markdown
| `/orders/open-items` | Aufträge → Offene Posten | billing_payments.view |
| `/orders/open-items/[documentId]` | Offene Posten → Rechnung anklicken | billing_payments.view |
```

### Dependencies
- Phase 5 must be complete (UI routes finalized)

### Verification
```bash
# Verify handbook is valid markdown (no broken formatting)
# Verify section 13.11 appears between 13.10 and 14
grep -n "### 13.11" docs/TERP_HANDBUCH.md
grep -n "## 14. Glossar" docs/TERP_HANDBUCH.md
grep -n "Offener Posten" docs/TERP_HANDBUCH.md
grep -n "/orders/open-items" docs/TERP_HANDBUCH.md
```

---

## Phase 8: Verification

### Steps

#### 8.1 TypeScript check
```bash
pnpm typecheck 2>&1 | tail -20
```
Ensure no new type errors beyond the baseline (~1463 pre-existing).

#### 8.2 Lint check
```bash
pnpm lint 2>&1 | tail -20
```
Ensure no lint errors in new files.

#### 8.3 Unit + integration tests
```bash
pnpm vitest run src/lib/services/__tests__/billing-payment-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingPayments-router.test.ts
```

#### 8.4 Full test suite
```bash
pnpm test
```
Ensure no regressions.

#### 8.5 Browser E2E tests
```bash
# Requires dev server + database running
pnpm dev &
pnpm exec playwright test src/e2e-browser/32-billing-open-items.spec.ts --headed
```

#### 8.6 Manual smoke test
1. Navigate to Aufträge > Offene Posten
2. Verify the list loads (may be empty if no finalized invoices)
3. Create a test invoice, finalize it, verify it appears in open items
4. Record a partial payment, verify status changes
5. Record remaining payment, verify status is "Bezahlt"
6. Cancel a payment, verify status reverts

---

## Success Criteria

- [ ] `BillingPayment` Prisma model created with migration `20260101000101`
- [ ] `BillingPaymentType` (CASH, BANK) and `BillingPaymentStatus` (ACTIVE, CANCELLED) enums created
- [ ] Relations added: BillingDocument.payments, Tenant.billingPayments
- [ ] 3 permissions added to catalog: billing_payments.view, .create, .cancel (total: 81)
- [ ] Repository layer: `billing-payment-repository.ts` with all query functions
- [ ] Service layer: `billing-payment-service.ts` with business logic (payment recording, cancellation, discount calc, overdue detection)
- [ ] Error classes: BillingPaymentNotFoundError, BillingPaymentValidationError, BillingPaymentConflictError
- [ ] tRPC router: `billing/payments.ts` with openItems.list, openItems.getById, openItems.summary, list, create, cancel
- [ ] Router wired into billing router index as `payments: billingPaymentsRouter`
- [ ] All procedures gated by `requireModule("billing")` and `billing_payments.*` permissions
- [ ] React hooks: useBillingOpenItems, useBillingOpenItem, useBillingOpenItemsSummary, useBillingPayments, useCreateBillingPayment, useCancelBillingPayment
- [ ] Hooks exported via barrel file `src/hooks/index.ts`
- [ ] UI components: PaymentStatusBadge, OpenItemsSummaryCard, OpenItemList, OpenItemDetail, PaymentFormDialog, PaymentCancelDialog
- [ ] Page routes: `/orders/open-items` and `/orders/open-items/[documentId]`
- [ ] Sidebar navigation entry added (Wallet icon, billingOpenItems)
- [ ] Service unit tests pass (billing-payment-service.test.ts)
- [ ] Router tests pass (billingPayments-router.test.ts)
- [ ] Browser E2E tests pass (32-billing-open-items.spec.ts)
- [ ] Global setup updated with billing_payments cleanup SQL
- [ ] Handbook section 13.11 added with complete documentation
- [ ] Handbook Praxisbeispiel (13.11.1) with step-by-step instructions
- [ ] Glossar entries added: Offener Posten, Skonto, Zahlung
- [ ] Anhang Seitenübersicht entries added for both new pages
- [ ] `pnpm typecheck` passes (no new errors beyond baseline)
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (no regressions)
- [ ] Cross-tenant isolation: payments scoped to tenantId
- [ ] Pre-filled amount on payment form equals remaining open amount
- [ ] Discount (Skonto) calculation with two tiers based on payment date
- [ ] Credit notes reduce effective invoice balance when linked
