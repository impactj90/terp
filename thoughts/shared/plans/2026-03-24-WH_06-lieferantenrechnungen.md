# WH_06 Implementation Plan: Lieferantenrechnungen (Supplier Invoices)

Date: 2026-03-24
Ticket: `thoughts/shared/tickets/orgAuftrag/TICKET_WH_06_LIEFERANTENRECHNUNGEN.md`
Research: `thoughts/shared/research/2026-03-24-WH_06-lieferantenrechnungen.md`

---

## Phase 1: Database & Schema

### 1a. Prisma Schema Changes

**File:** `prisma/schema.prisma`

**New enum** (append after line 4289, before `model WhPurchaseOrder`):

```prisma
enum WhSupplierInvoiceStatus {
  OPEN
  PARTIAL
  PAID
  CANCELLED

  @@map("wh_supplier_invoice_status")
}
```

**New models** (append at end of file, after line 4393):

```prisma
// -----------------------------------------------------------------------------
// WhSupplierInvoice
// -----------------------------------------------------------------------------
// Migration: wh_supplier_invoices
//
// Supplier invoice linked to a purchase order. Tracks payment status,
// payment terms with two-tier discount (Skonto), and partial payments.
model WhSupplierInvoice {
  id                String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String                    @map("tenant_id") @db.Uuid
  number            String                    // Supplier's invoice number (entered manually)
  supplierId        String                    @map("supplier_id") @db.Uuid
  purchaseOrderId   String?                   @map("purchase_order_id") @db.Uuid
  status            WhSupplierInvoiceStatus   @default(OPEN)
  invoiceDate       DateTime                  @map("invoice_date") @db.Timestamptz(6)
  receivedDate      DateTime                  @default(now()) @map("received_date") @db.Timestamptz(6)
  totalNet          Float                     @map("total_net")
  totalVat          Float                     @map("total_vat")
  totalGross        Float                     @map("total_gross")

  // Payment terms
  paymentTermDays   Int?                      @map("payment_term_days")
  dueDate           DateTime?                 @map("due_date") @db.Timestamptz(6)
  discountPercent   Float?                    @map("discount_percent")
  discountDays      Int?                      @map("discount_days")
  discountPercent2  Float?                    @map("discount_percent_2")
  discountDays2     Int?                      @map("discount_days_2")

  notes             String?
  createdAt         DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime                  @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById       String?                   @map("created_by_id") @db.Uuid

  tenant        Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  supplier      CrmAddress       @relation(fields: [supplierId], references: [id])
  purchaseOrder WhPurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)
  payments      WhSupplierPayment[]

  @@index([tenantId, supplierId])
  @@index([tenantId, status])
  @@index([tenantId, dueDate])
  @@map("wh_supplier_invoices")
}

// -----------------------------------------------------------------------------
// WhSupplierPayment
// -----------------------------------------------------------------------------
// Migration: wh_supplier_invoices
//
// Payment record against a supplier invoice. Reuses BillingPaymentType
// (CASH/BANK) and BillingPaymentStatus (ACTIVE/CANCELLED) enums.
model WhSupplierPayment {
  id            String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String               @map("tenant_id") @db.Uuid
  invoiceId     String               @map("invoice_id") @db.Uuid
  date          DateTime             @db.Timestamptz(6)
  amount        Float
  type          BillingPaymentType
  isDiscount    Boolean              @default(false) @map("is_discount")
  notes         String?
  status        BillingPaymentStatus @default(ACTIVE)
  cancelledAt   DateTime?            @map("cancelled_at") @db.Timestamptz(6)
  cancelledById String?              @map("cancelled_by_id") @db.Uuid
  createdAt     DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById   String?              @map("created_by_id") @db.Uuid

  tenant  Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  invoice WhSupplierInvoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
  @@index([tenantId])
  @@map("wh_supplier_payments")
}
```

**Add relations to existing models:**

1. **`Tenant` model** (around line 197, after `whStockMovements`):
   ```prisma
   whSupplierInvoices          WhSupplierInvoice[]
   whSupplierPayments          WhSupplierPayment[]
   ```

2. **`CrmAddress` model** (around line 321, after `purchaseOrders`):
   ```prisma
   supplierInvoices            WhSupplierInvoice[]
   ```

3. **`WhPurchaseOrder` model** (around line 4318, after `stockMovements`):
   ```prisma
   supplierInvoices            WhSupplierInvoice[]
   ```

**Pattern reference:** Follow `WhPurchaseOrder` + `WhStockMovement` model structure.

### 1b. Supabase Migration

**File:** `supabase/migrations/20260327100000_wh_supplier_invoices.sql`

```sql
-- WH_06: Supplier invoices and payments
-- Creates wh_supplier_invoices and wh_supplier_payments tables.

-- Create enum
CREATE TYPE wh_supplier_invoice_status AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- Create wh_supplier_invoices table
CREATE TABLE wh_supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES crm_addresses(id),
  purchase_order_id UUID REFERENCES wh_purchase_orders(id) ON DELETE SET NULL,
  status wh_supplier_invoice_status NOT NULL DEFAULT 'OPEN',
  invoice_date TIMESTAMPTZ(6) NOT NULL,
  received_date TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  total_net DOUBLE PRECISION NOT NULL,
  total_vat DOUBLE PRECISION NOT NULL,
  total_gross DOUBLE PRECISION NOT NULL,

  -- Payment terms
  payment_term_days INTEGER,
  due_date TIMESTAMPTZ(6),
  discount_percent DOUBLE PRECISION,
  discount_days INTEGER,
  discount_percent_2 DOUBLE PRECISION,
  discount_days_2 INTEGER,

  notes TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by_id UUID
);

-- Create indexes
CREATE INDEX idx_wh_supplier_invoices_tenant_supplier ON wh_supplier_invoices(tenant_id, supplier_id);
CREATE INDEX idx_wh_supplier_invoices_tenant_status ON wh_supplier_invoices(tenant_id, status);
CREATE INDEX idx_wh_supplier_invoices_tenant_due_date ON wh_supplier_invoices(tenant_id, due_date);

-- Create wh_supplier_payments table
CREATE TABLE wh_supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES wh_supplier_invoices(id) ON DELETE CASCADE,
  date TIMESTAMPTZ(6) NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  type billing_payment_type NOT NULL,
  is_discount BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status billing_payment_status NOT NULL DEFAULT 'ACTIVE',
  cancelled_at TIMESTAMPTZ(6),
  cancelled_by_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by_id UUID
);

-- Create indexes
CREATE INDEX idx_wh_supplier_payments_invoice ON wh_supplier_payments(invoice_id);
CREATE INDEX idx_wh_supplier_payments_tenant ON wh_supplier_payments(tenant_id);
```

### 1c. Prisma Client Regeneration

```bash
pnpm db:generate
```

**Verification:**
- Run `pnpm db:generate` successfully
- Run `pnpm typecheck` to verify no schema errors
- Confirm `WhSupplierInvoice` and `WhSupplierPayment` types are available in `@/generated/prisma/client`

---

## Phase 2: Permission Catalog

### 2a. Add Permissions

**File:** `src/lib/auth/permission-catalog.ts`

**Location:** After `wh_stock.manage` (line 291), before the closing `]` of `ALL_PERMISSIONS`:

```ts
  // Warehouse Supplier Invoices
  p("wh_supplier_invoices.view", "wh_supplier_invoices", "view", "View supplier invoices"),
  p("wh_supplier_invoices.create", "wh_supplier_invoices", "create", "Create supplier invoices"),
  p("wh_supplier_invoices.edit", "wh_supplier_invoices", "edit", "Edit supplier invoices"),
  p("wh_supplier_invoices.pay", "wh_supplier_invoices", "pay", "Record payments on supplier invoices"),
```

**Deterministic UUIDs** (computed with UUIDv5 namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`):
- `wh_supplier_invoices.view` = `0ef2dc28-9072-50bd-9d7c-3397d0879d93`
- `wh_supplier_invoices.create` = `fcfa5b3a-af25-55b1-a290-18f46ebc931c`
- `wh_supplier_invoices.edit` = `16f421cf-3e43-5cd6-93ba-cc1434b9f1ea`
- `wh_supplier_invoices.pay` = `ed5c45c0-9258-56e6-a1ad-c9289d29b761`

Update the comment `All 86 permissions` to reflect the new count (90).

### 2b. User Group Migration

**File:** `supabase/migrations/20260327120000_add_supplier_invoice_permissions_to_groups.sql`

Add the 4 new permissions to relevant user groups:

- **PERSONAL** -- all 4 (full access)
- **LAGER** -- all 4 (warehouse managers need full access)
- **VORGESETZTER** -- `wh_supplier_invoices.view` only
- **BUCHHALTUNG** -- all 4 (accounting handles payments)

Use `UPDATE ... SET permissions = permissions || '["uuid"]'::jsonb` pattern, or re-emit the full group permissions as in the existing `20260325120000_add_module_permissions_to_groups.sql` migration.

Recommended approach: Use targeted UPDATE statements to append the new permission UUIDs to each group's JSONB array:

```sql
-- Add supplier invoice permissions to user groups
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   wh_supplier_invoices.view   = 0ef2dc28-9072-50bd-9d7c-3397d0879d93
--   wh_supplier_invoices.create = fcfa5b3a-af25-55b1-a290-18f46ebc931c
--   wh_supplier_invoices.edit   = 16f421cf-3e43-5cd6-93ba-cc1434b9f1ea
--   wh_supplier_invoices.pay    = ed5c45c0-9258-56e6-a1ad-c9289d29b761

-- PERSONAL: add all 4
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL
    SELECT '"0ef2dc28-9072-50bd-9d7c-3397d0879d93"'::jsonb
    UNION ALL SELECT '"fcfa5b3a-af25-55b1-a290-18f46ebc931c"'::jsonb
    UNION ALL SELECT '"16f421cf-3e43-5cd6-93ba-cc1434b9f1ea"'::jsonb
    UNION ALL SELECT '"ed5c45c0-9258-56e6-a1ad-c9289d29b761"'::jsonb
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- LAGER: add all 4
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL
    SELECT '"0ef2dc28-9072-50bd-9d7c-3397d0879d93"'::jsonb
    UNION ALL SELECT '"fcfa5b3a-af25-55b1-a290-18f46ebc931c"'::jsonb
    UNION ALL SELECT '"16f421cf-3e43-5cd6-93ba-cc1434b9f1ea"'::jsonb
    UNION ALL SELECT '"ed5c45c0-9258-56e6-a1ad-c9289d29b761"'::jsonb
  ) sub
) WHERE code = 'LAGER' AND tenant_id IS NULL;

-- VORGESETZTER: view only
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL
    SELECT '"0ef2dc28-9072-50bd-9d7c-3397d0879d93"'::jsonb
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;

-- BUCHHALTUNG: add all 4
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL
    SELECT '"0ef2dc28-9072-50bd-9d7c-3397d0879d93"'::jsonb
    UNION ALL SELECT '"fcfa5b3a-af25-55b1-a290-18f46ebc931c"'::jsonb
    UNION ALL SELECT '"16f421cf-3e43-5cd6-93ba-cc1434b9f1ea"'::jsonb
    UNION ALL SELECT '"ed5c45c0-9258-56e6-a1ad-c9289d29b761"'::jsonb
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;
```

**Verification:**
- `pnpm typecheck` passes
- `permissionIdByKey("wh_supplier_invoices.view")` returns `0ef2dc28-9072-50bd-9d7c-3397d0879d93`

---

## Phase 3: Repository Layer

**File:** `src/lib/services/wh-supplier-invoice-repository.ts`

**Pattern reference:** `src/lib/services/wh-purchase-order-repository.ts`

### Functions to implement:

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

1. **`findMany(prisma, tenantId, params)`** -- Paginated list with filters
   - `params: { supplierId?, status?, search?, dateFrom?, dateTo?, page, pageSize }`
   - `where` clause ALWAYS includes `tenantId`
   - Search: `OR: [{ number: contains term }, { supplier: { company: contains term } }]`
   - `include: { supplier: { select: { id, number, company } }, payments: { where: { status: "ACTIVE" }, select: { amount: true } }, _count: { select: { payments: true } } }`
   - Returns `{ items, total }`

2. **`findById(prisma, tenantId, id)`** -- Single invoice with payments
   - `prisma.whSupplierInvoice.findFirst({ where: { id, tenantId }, include: { supplier: true, purchaseOrder: { select: { id, number, status } }, payments: { orderBy: { createdAt: "desc" } } } })`

3. **`create(prisma, data)`** -- Create invoice
   - `prisma.whSupplierInvoice.create({ data: { tenantId, ...fields } })`

4. **`update(prisma, tenantId, id, data)`** -- Update invoice
   - `tenantScopedUpdate(prisma.whSupplierInvoice, { id, tenantId }, data, { entity: "WhSupplierInvoice" })`

5. **`updateStatus(prisma, tenantId, id, status)`** -- Update status only
   - `prisma.whSupplierInvoice.updateMany({ where: { id, tenantId }, data: { status } })`

6. **`findPaymentById(prisma, tenantId, paymentId)`** -- Single payment verified via parent
   - `prisma.whSupplierPayment.findFirst({ where: { id: paymentId, invoice: { tenantId } } })`
   - CRITICAL: Sub-entity queries verify tenant via parent relation

7. **`createPayment(prisma, data)`** -- Create payment
   - `prisma.whSupplierPayment.create({ data: { tenantId, invoiceId, ...fields } })`

8. **`cancelPayment(prisma, tenantId, paymentId, cancelledById)`** -- Cancel payment
   - First verify tenant via parent: `findFirst({ where: { id: paymentId, invoice: { tenantId } } })`
   - Then: `prisma.whSupplierPayment.updateMany({ where: { id: paymentId, status: "ACTIVE" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById } })`

9. **`findPaymentsByInvoiceId(prisma, tenantId, invoiceId)`** -- List payments for an invoice
   - First verify invoice belongs to tenant
   - Then: `prisma.whSupplierPayment.findMany({ where: { invoiceId }, orderBy: { createdAt: "desc" } })`

10. **`summary(prisma, tenantId, supplierId?)`** -- Summary aggregation
    - Fetch all non-cancelled invoices for tenant (with optional supplier filter)
    - Include active payments for calculating paid amounts
    - Return computed totals

### Tenant Isolation Rules:
- Every `findMany`, `findFirst`, `count` includes `tenantId` in `where`
- Sub-entity (payment) queries use `{ invoice: { tenantId } }` pattern
- `updateMany` always includes `tenantId` (or verifies parent)
- Never use `.update({ where: { id } })` alone for payments

**Verification:**
- `pnpm typecheck` passes
- All functions accept `tenantId` as parameter
- No query lacks tenant scoping

---

## Phase 4: Service Layer

**File:** `src/lib/services/wh-supplier-invoice-service.ts`

**Pattern reference:** `src/lib/services/wh-purchase-order-service.ts` + `src/lib/services/billing-payment-service.ts`

### Error Classes:

```ts
export class WhSupplierInvoiceNotFoundError extends Error {
  constructor(message = "Supplier invoice not found") {
    super(message); this.name = "WhSupplierInvoiceNotFoundError"
  }
}
export class WhSupplierInvoiceValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "WhSupplierInvoiceValidationError"
  }
}
export class WhSupplierInvoiceConflictError extends Error {
  constructor(message: string) {
    super(message); this.name = "WhSupplierInvoiceConflictError"
  }
}
```

### Helper Functions (import/reuse from billing-payment-service):

Import these from `billing-payment-service.ts` (they are already exported):
- `computePaymentStatus(totalGross, paidAmount)` -- returns "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID"
- `computeDueDate(documentDate, paymentTermDays)` -- returns Date | null
- `isOverdue(dueDate, paymentStatus)` -- returns boolean
- `getApplicableDiscount(document, paymentDate)` -- returns { percent, tier } | null

### Service Functions:

1. **`list(prisma, tenantId, params)`**
   - Delegates to `repo.findMany(prisma, tenantId, params)`
   - Enriches each item with `paidAmount`, `openAmount`, `isOverdue` (compute from payments)

2. **`getById(prisma, tenantId, id)`**
   - `repo.findById(prisma, tenantId, id)` -- throws `WhSupplierInvoiceNotFoundError` if null
   - Enriches with `paidAmount`, `openAmount`, `paymentStatus`, `isOverdue`

3. **`create(prisma, tenantId, input, createdById?, audit?)`**
   - **Tax validation:** Fetch supplier via `prisma.crmAddress.findFirst({ where: { id: input.supplierId, tenantId } })`. Throw `WhSupplierInvoiceValidationError("Lieferant hat weder Steuernummer noch USt-IdNr.")` if neither `taxNumber` nor `vatId` is set.
   - **Due date calculation:** If `paymentTermDays` provided but `dueDate` is not, compute `dueDate = invoiceDate + paymentTermDays` using `computeDueDate()`. If supplier has `paymentTermDays` and input doesn't specify, default from supplier.
   - **Payment terms defaults:** Copy `discountPercent`, `discountDays`, etc. from supplier when not provided.
   - Creates invoice via `repo.create(prisma, { tenantId, ...input, dueDate, createdById })`
   - Audit log: `entityType: "wh_supplier_invoice"`, action: `"create"`

4. **`update(prisma, tenantId, input, audit?)`**
   - Fetch existing invoice; throw `NotFoundError` if not found
   - Throw `ConflictError` if status !== "OPEN"
   - `repo.update(prisma, tenantId, input.id, data)`
   - Recalculate `dueDate` if `paymentTermDays` changed
   - Audit log: action `"update"`

5. **`cancel(prisma, tenantId, id, audit?)`**
   - Fetch existing; throw if not found
   - Throw `ConflictError` if already CANCELLED
   - Set status to CANCELLED
   - Audit log: action `"cancel"`

6. **`createPayment(prisma, tenantId, input, createdById?, audit?)`**
   - `input: { invoiceId, date, amount, type, isDiscount?, notes? }`
   - Fetch invoice (verifying tenant); throw `NotFoundError` if not found
   - Throw `ConflictError` if invoice is CANCELLED or already PAID
   - Use `$transaction` for atomicity:
     - Re-read invoice + existing active payments inside transaction
     - Calculate current paid amount
     - Validate: new total (paid + amount) must not exceed `totalGross + 0.01` (tolerance)
     - Check applicable discount via `getApplicableDiscount()` -- if discount applies and `isDiscount` not explicitly set, create separate discount entry
     - Create payment record
     - Compute new status: use `computePaymentStatus(totalGross, newPaidAmount)`
     - Map to invoice status: UNPAID -> OPEN, PARTIAL -> PARTIAL, PAID/OVERPAID -> PAID
     - Update invoice status
   - Audit log: action `"payment_create"`

7. **`cancelPayment(prisma, tenantId, paymentId, cancelledById, audit?)`**
   - Fetch payment (verifying tenant via parent); throw `NotFoundError` if not found
   - Throw `ConflictError` if already CANCELLED
   - Use `$transaction`:
     - Cancel the payment (set CANCELLED, cancelledAt, cancelledById)
     - If it was a non-discount payment, also cancel associated discount entries (same invoiceId, same date, `isDiscount: true`)
     - Recalculate invoice status from remaining active payments
   - Audit log: action `"payment_cancel"`

8. **`listPayments(prisma, tenantId, invoiceId)`**
   - Verify invoice belongs to tenant; throw `NotFoundError` if not
   - Return `repo.findPaymentsByInvoiceId(prisma, tenantId, invoiceId)`

9. **`summary(prisma, tenantId, supplierId?)`**
   - Fetch all non-cancelled invoices (with active payments)
   - Compute per-invoice: paidAmount, openAmount, isOverdue
   - Return: `{ totalOpen, totalOverdue, totalPaidThisMonth, invoiceCount, overdueCount }`

### Enrichment helper (private):

```ts
function enrichInvoice(invoice: InvoiceWithPayments) {
  const paidAmount = invoice.payments
    .filter(p => p.status === "ACTIVE")
    .reduce((sum, p) => sum + p.amount, 0)
  const openAmount = Math.max(0, invoice.totalGross - paidAmount)
  const paymentStatus = computePaymentStatus(invoice.totalGross, paidAmount)
  const overdue = isOverdue(invoice.dueDate, paymentStatus)
  return {
    paidAmount: Math.round(paidAmount * 100) / 100,
    openAmount: Math.round(openAmount * 100) / 100,
    paymentStatus,
    isOverdue: overdue,
  }
}
```

**Verification:**
- `pnpm typecheck` passes
- Every function accepts `tenantId`
- Tax validation logic correct
- Due date calculation correct

---

## Phase 5: tRPC Router

**File:** `src/trpc/routers/warehouse/supplierInvoices.ts`

**Pattern reference:** `src/trpc/routers/warehouse/purchaseOrders.ts`

### Structure:

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as siService from "@/lib/services/wh-supplier-invoice-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const SI_VIEW = permissionIdByKey("wh_supplier_invoices.view")!
const SI_CREATE = permissionIdByKey("wh_supplier_invoices.create")!
const SI_EDIT = permissionIdByKey("wh_supplier_invoices.edit")!
const SI_PAY = permissionIdByKey("wh_supplier_invoices.pay")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))
```

### Procedures:

1. **`list`** -- query, `SI_VIEW`
   - Input: `{ supplierId?, status? (OPEN|PARTIAL|PAID|CANCELLED), search?, dateFrom?, dateTo?, page, pageSize }`
   - Calls `siService.list(ctx.prisma, ctx.tenantId!, input)`

2. **`getById`** -- query, `SI_VIEW`
   - Input: `{ id: z.string().uuid() }`
   - Calls `siService.getById(ctx.prisma, ctx.tenantId!, input.id)`

3. **`create`** -- mutation, `SI_CREATE`
   - Input: `{ number, supplierId, purchaseOrderId?, invoiceDate, receivedDate?, totalNet, totalVat, totalGross, paymentTermDays?, dueDate?, discountPercent?, discountDays?, discountPercent2?, discountDays2?, notes? }`
   - Calls `siService.create(ctx.prisma, ctx.tenantId!, input, ctx.user!.id, audit)`

4. **`update`** -- mutation, `SI_EDIT`
   - Input: `{ id, number?, invoiceDate?, totalNet?, totalVat?, totalGross?, paymentTermDays?, dueDate?, discountPercent?, discountDays?, discountPercent2?, discountDays2?, notes? }`
   - Calls `siService.update(ctx.prisma, ctx.tenantId!, input, audit)`

5. **`cancel`** -- mutation, `SI_EDIT`
   - Input: `{ id: z.string().uuid() }`
   - Calls `siService.cancel(ctx.prisma, ctx.tenantId!, input.id, audit)`

6. **`summary`** -- query, `SI_VIEW`
   - Input: `{ supplierId?: z.string().uuid().optional() }`
   - Calls `siService.summary(ctx.prisma, ctx.tenantId!, input.supplierId)`

### Payments Sub-Router:

```ts
const paymentsRouter = createTRPCRouter({
  list: whProcedure.use(requirePermission(SI_VIEW))
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(/* siService.listPayments */),

  create: whProcedure.use(requirePermission(SI_PAY))
    .input(z.object({
      invoiceId: z.string().uuid(),
      date: z.string(),
      amount: z.number().positive(),
      type: z.enum(["CASH", "BANK"]),
      isDiscount: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(/* siService.createPayment */),

  cancel: whProcedure.use(requirePermission(SI_PAY))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(/* siService.cancelPayment */),
})
```

### Main Router:

```ts
export const whSupplierInvoicesRouter = createTRPCRouter({
  list: ...,
  getById: ...,
  create: ...,
  update: ...,
  cancel: ...,
  summary: ...,
  payments: paymentsRouter,
})
```

### Register in Warehouse Router

**File:** `src/trpc/routers/warehouse/index.ts`

Add import and merge:

```ts
import { whSupplierInvoicesRouter } from "./supplierInvoices"

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
  stockMovements: whStockMovementsRouter,
  withdrawals: whWithdrawalsRouter,
  supplierInvoices: whSupplierInvoicesRouter,  // NEW
})
```

No changes needed to `_app.ts` -- the warehouse router is already registered there.

**Verification:**
- `pnpm typecheck` passes
- All procedures use `whProcedure` (module guard)
- All procedures have `requirePermission()` middleware
- All service calls pass `ctx.tenantId!`

---

## Phase 6: Translation Keys

### 6a. German Translations

**File:** `messages/de.json`

**Add nav key** (in `"nav"` section, after `"warehouseWithdrawals"`):
```json
"warehouseSupplierInvoices": "Lieferantenrechnungen"
```

**Add new namespace** (after `"warehouseWithdrawals"` section or after existing warehouse sections):
```json
"warehouseSupplierInvoices": {
  "pageTitle": "Lieferantenrechnungen",
  "actionCreate": "Neue Rechnung erfassen",
  "searchPlaceholder": "Suche nach Nummer, Lieferant...",
  "noPermission": "Keine Berechtigung",
  "noInvoicesFound": "Keine Lieferantenrechnungen gefunden",
  "loading": "Laden...",

  "colNumber": "Rechnungsnr.",
  "colSupplier": "Lieferant",
  "colInvoiceDate": "Rechnungsdatum",
  "colReceivedDate": "Eingangsdatum",
  "colDueDate": "Fälligkeitsdatum",
  "colTotalGross": "Bruttobetrag",
  "colOpenAmount": "Offener Betrag",
  "colStatus": "Status",

  "statusOpen": "Offen",
  "statusPartial": "Teilweise bezahlt",
  "statusPaid": "Bezahlt",
  "statusCancelled": "Storniert",

  "filterAllStatuses": "Alle Status",
  "filterAllSuppliers": "Alle Lieferanten",
  "filterDateFrom": "Von",
  "filterDateTo": "Bis",
  "filterOverdue": "Überfällig",

  "actionView": "Anzeigen",
  "actionEdit": "Bearbeiten",
  "actionCancel": "Stornieren",
  "actionRecordPayment": "Zahlung erfassen",

  "save": "Speichern",
  "cancel": "Abbrechen",
  "create": "Erstellen",
  "back": "Zurück",

  "formTitle": "Lieferantenrechnung erfassen",
  "formEditTitle": "Lieferantenrechnung bearbeiten",
  "fieldNumber": "Rechnungsnummer",
  "fieldSupplier": "Lieferant",
  "fieldPurchaseOrder": "Bestellung",
  "fieldInvoiceDate": "Rechnungsdatum",
  "fieldReceivedDate": "Eingangsdatum",
  "fieldTotalNet": "Nettobetrag",
  "fieldTotalVat": "MwSt",
  "fieldTotalGross": "Bruttobetrag",
  "fieldPaymentTermDays": "Zahlungsziel (Tage)",
  "fieldDueDate": "Fälligkeitsdatum",
  "fieldDiscountPercent": "Skonto 1 (%)",
  "fieldDiscountDays": "Skontofrist 1 (Tage)",
  "fieldDiscountPercent2": "Skonto 2 (%)",
  "fieldDiscountDays2": "Skontofrist 2 (Tage)",
  "fieldNotes": "Bemerkungen",
  "fieldNoPurchaseOrder": "Keine Bestellung",

  "validationSupplierRequired": "Lieferant ist erforderlich",
  "validationNumberRequired": "Rechnungsnummer ist erforderlich",
  "validationAmountsRequired": "Beträge sind erforderlich",
  "validationSupplierNoTax": "Lieferant hat weder Steuernummer noch USt-IdNr. hinterlegt",

  "detailTitle": "Lieferantenrechnung",
  "detailInvoiceInfo": "Rechnungsinformationen",
  "detailPaymentTerms": "Zahlungsbedingungen",
  "detailPayments": "Zahlungen",
  "detailSummary": "Zusammenfassung",
  "detailPaidAmount": "Bezahlter Betrag",
  "detailOpenAmount": "Offener Betrag",
  "detailOverdue": "Überfällig",

  "paymentFormTitle": "Zahlung erfassen",
  "paymentFieldDate": "Zahlungsdatum",
  "paymentFieldAmount": "Betrag",
  "paymentFieldType": "Zahlungsart",
  "paymentTypeCash": "Bar",
  "paymentTypeBank": "Überweisung",
  "paymentFieldDiscount": "Skonto",
  "paymentFieldNotes": "Bemerkungen",
  "paymentDiscountApplied": "Skonto {tier} ({percent}%)",

  "paymentStatusActive": "Aktiv",
  "paymentStatusCancelled": "Storniert",
  "paymentActionCancel": "Zahlung stornieren",

  "cancelConfirmTitle": "Rechnung stornieren",
  "cancelConfirmMessage": "Möchten Sie diese Lieferantenrechnung wirklich stornieren?",
  "cancelPaymentConfirmTitle": "Zahlung stornieren",
  "cancelPaymentConfirmMessage": "Möchten Sie diese Zahlung wirklich stornieren?",

  "summaryTotalOpen": "Offene Rechnungen",
  "summaryTotalOverdue": "Überfällig",
  "summaryPaidThisMonth": "Bezahlt (dieser Monat)",
  "summaryInvoiceCount": "Anzahl Rechnungen",

  "toastCreated": "Lieferantenrechnung erfasst",
  "toastUpdated": "Lieferantenrechnung aktualisiert",
  "toastCancelled": "Lieferantenrechnung storniert",
  "toastPaymentCreated": "Zahlung erfasst",
  "toastPaymentCancelled": "Zahlung storniert"
}
```

### 6b. English Translations

**File:** `messages/en.json`

Add corresponding nav key and `warehouseSupplierInvoices` namespace with English translations (follow same structure as German).

**Verification:**
- `pnpm typecheck` passes (no missing translation key errors)
- JSON syntax valid

---

## Phase 7: React Hooks

**File:** `src/hooks/use-wh-supplier-invoices.ts`

**Pattern reference:** `src/hooks/use-wh-purchase-orders.ts`

### Query Hooks:

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhSupplierInvoices(options?, enabled = true) {
  // trpc.warehouse.supplierInvoices.list.queryOptions(...)
}

export function useWhSupplierInvoice(id: string, enabled = true) {
  // trpc.warehouse.supplierInvoices.getById.queryOptions(...)
}

export function useWhSupplierInvoiceSummary(supplierId?: string, enabled = true) {
  // trpc.warehouse.supplierInvoices.summary.queryOptions(...)
}

export function useWhSupplierPayments(invoiceId: string, enabled = true) {
  // trpc.warehouse.supplierInvoices.payments.list.queryOptions(...)
}
```

### Mutation Hooks:

```ts
export function useCreateWhSupplierInvoice() {
  // Invalidates: list, summary
}

export function useUpdateWhSupplierInvoice() {
  // Invalidates: list, getById, summary
}

export function useCancelWhSupplierInvoice() {
  // Invalidates: list, getById, summary
}

export function useCreateWhSupplierPayment() {
  // Invalidates: list, getById, payments.list, summary
}

export function useCancelWhSupplierPayment() {
  // Invalidates: list, getById, payments.list, summary
}
```

**Key patterns:**
- Query hooks accept optional filters + `enabled` param
- Mutation hooks invalidate related queries on success using `queryClient.invalidateQueries()`
- Path: `trpc.warehouse.supplierInvoices.{procedure}`
- Import `useTRPC` from `@/trpc`

**Verification:**
- `pnpm typecheck` passes
- Hook names follow convention: `useWh{Entity}` for queries, `use{Action}Wh{Entity}` for mutations

---

## Phase 8: UI Components

All files in `src/components/warehouse/`.

### 8a. Status Badge

**File:** `src/components/warehouse/supplier-invoice-status-badge.tsx`

**Pattern reference:** `src/components/warehouse/purchase-order-status-badge.tsx`

```tsx
const statusStyles: Record<WhSupplierInvoiceStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  PARTIAL: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  PAID: "bg-green-100 text-green-800 hover:bg-green-100",
  CANCELLED: "bg-gray-100 text-gray-800 hover:bg-gray-100",
}

const statusKeys: Record<WhSupplierInvoiceStatus, string> = {
  OPEN: "statusOpen",
  PARTIAL: "statusPartial",
  PAID: "statusPaid",
  CANCELLED: "statusCancelled",
}
```

Uses `useTranslations("warehouseSupplierInvoices")`.

### 8b. List Component

**File:** `src/components/warehouse/supplier-invoice-list.tsx`

**Pattern reference:** `src/components/warehouse/purchase-order-list.tsx`

Features:
- `'use client'`
- `useTranslations('warehouseSupplierInvoices')`
- Uses `useWhSupplierInvoices()` hook
- Toolbar: search input, status filter dropdown, supplier filter dropdown, "New" button
- Table columns: Rechnungsnr., Lieferant, Rechnungsdatum, Fälligkeitsdatum, Bruttobetrag, Offener Betrag, Status
- Overdue highlighting: red text if `isOverdue` is true
- Row click -> navigate to `/warehouse/supplier-invoices/${invoice.id}`
- Dropdown row actions: Anzeigen, Bearbeiten (OPEN only), Stornieren (OPEN/PARTIAL), Zahlung erfassen
- Pagination (prev/next)
- `formatPrice()` with `'de-DE'` locale, `formatDate()` with `'de-DE'`
- Summary cards at top (optional): total open, overdue, paid this month (from `useWhSupplierInvoiceSummary`)

### 8c. Form Sheet

**File:** `src/components/warehouse/supplier-invoice-form-sheet.tsx`

**Pattern reference:** Existing sheet form patterns in other warehouse components.

Features:
- Sheet component for create/edit
- Fields:
  - Supplier select (combobox, filters to SUPPLIER type). Shows warning if selected supplier has no taxNumber/vatId.
  - Purchase Order link (optional combobox, filters to supplier's POs)
  - Rechnungsnummer (text input)
  - Rechnungsdatum (date picker)
  - Nettobetrag, MwSt, Bruttobetrag (number inputs, auto-calculate gross = net + vat)
  - Payment terms section: Zahlungsziel, Fälligkeitsdatum, Skonto 1, Skontofrist 1, Skonto 2, Skontofrist 2
  - Bemerkungen (textarea)
- On supplier select: auto-populate payment terms from supplier's defaults (`paymentTermDays`, `discountPercent`, `discountDays`)
- Submit calls `useCreateWhSupplierInvoice()` or `useUpdateWhSupplierInvoice()`
- Success toast from translations
- Close sheet on success

### 8d. Detail Component

**File:** `src/components/warehouse/supplier-invoice-detail.tsx`

**Pattern reference:** `src/components/warehouse/purchase-order-detail.tsx`

Features:
- Header: Back button, title (Rechnungsnr.), status badge, action buttons (Edit, Cancel, Record Payment)
- Two-column cards:
  - **Invoice Info Card:** Rechnungsnr., Lieferant (link), Bestellung (link), Rechnungsdatum, Eingangsdatum
  - **Summary Card:** Nettobetrag, MwSt, Bruttobetrag, Bezahlter Betrag, Offener Betrag, Fälligkeitsdatum (red if overdue)
- Payment terms card: Zahlungsziel, Skonto 1, Skonto 2
- **Payments table card:**
  - Columns: Datum, Betrag, Zahlungsart, Skonto, Status, Aktionen
  - Cancel button per active payment
  - `useWhSupplierPayments(invoiceId)` hook
- Edit mode toggle (shows inline form or sheet)
- Cancel invoice dialog (ConfirmDialog)
- Cancel payment dialog (ConfirmDialog)

### 8e. Payment Form Dialog

**File:** `src/components/warehouse/supplier-payment-form-dialog.tsx`

Features:
- Dialog (not sheet) for recording a payment
- Fields:
  - Zahlungsdatum (date picker, defaults to today)
  - Betrag (number input, pre-filled with open amount)
  - Zahlungsart (select: Bar / Ueberweisung)
  - Skonto checkbox (if applicable discount shown)
  - Bemerkungen (textarea)
- Shows applicable discount info based on selected date vs. invoice date
- Submit calls `useCreateWhSupplierPayment()`
- Success toast

**Verification:**
- `pnpm typecheck` passes
- All components use `useTranslations('warehouseSupplierInvoices')`
- No hardcoded German strings outside translation keys
- All `formatPrice`/`formatDate` use `'de-DE'` locale

---

## Phase 9: Pages & Navigation

### 9a. List Page

**File:** `src/app/[locale]/(dashboard)/warehouse/supplier-invoices/page.tsx`

**Pattern reference:** `src/app/[locale]/(dashboard)/warehouse/purchase-orders/page.tsx`

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { SupplierInvoiceList } from '@/components/warehouse/supplier-invoice-list'

export default function WhSupplierInvoicesPage() {
  const t = useTranslations('warehouseSupplierInvoices')
  const { allowed: canAccess } = useHasPermission(['wh_supplier_invoices.view'])

  if (canAccess === false) {
    return <div className="p-6 text-center text-muted-foreground">{t('noPermission')}</div>
  }

  return (
    <div className="space-y-4 p-6">
      <SupplierInvoiceList />
    </div>
  )
}
```

### 9b. Detail Page

**File:** `src/app/[locale]/(dashboard)/warehouse/supplier-invoices/[id]/page.tsx`

```tsx
'use client'

import { use } from 'react'
import { SupplierInvoiceDetail } from '@/components/warehouse/supplier-invoice-detail'

export default function WhSupplierInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <SupplierInvoiceDetail id={id} />
}
```

### 9c. Sidebar Navigation

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

**Location:** In the `warehouseSection` items array (after `warehouseStockMovements`, around line 416):

Add import at top:
```ts
import { FileText } from 'lucide-react'  // or Receipt icon
```

Note: `FileText` is already imported. Use a distinct icon. Consider `Receipt` from lucide-react. Check available imports -- `Stamp` is already imported and unused for warehouse. Better: use `FileText` (already imported) or add `Receipt`.

Add nav item:
```ts
{
  titleKey: 'warehouseSupplierInvoices',
  href: '/warehouse/supplier-invoices',
  icon: Stamp,  // or Receipt -- pick an appropriate icon
  module: 'warehouse',
  permissions: ['wh_supplier_invoices.view'],
},
```

Place it after `warehousePurchaseOrders` (or after `warehouseStockMovements`) since supplier invoices logically follow purchase orders.

**Verification:**
- Navigate to `/warehouse/supplier-invoices` in browser
- Sidebar shows "Lieferantenrechnungen" link
- Click navigates to list page

---

## Phase 10: Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-supplier-invoice-service.test.ts`

**Pattern reference:** `src/lib/services/__tests__/wh-article-service.test.ts`

### Test Structure:

```ts
import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-supplier-invoice-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const INVOICE_ID = "b1000000-0000-4000-a000-000000000001"
const SUPPLIER_ID = "c1000000-0000-4000-a000-000000000001"
const PO_ID = "d1000000-0000-4000-a000-000000000001"
const PAYMENT_ID = "e1000000-0000-4000-a000-000000000001"

const mockSupplier = {
  id: SUPPLIER_ID,
  tenantId: TENANT_ID,
  company: "Test Lieferant GmbH",
  type: "SUPPLIER",
  taxNumber: "123/456/789",
  vatId: "DE123456789",
  paymentTermDays: 30,
  discountPercent: 3,
  discountDays: 10,
}

const mockInvoice = { /* ... full mock */ }
const mockPayment = { /* ... full mock */ }

function createMockPrisma(overrides = {}) { /* ... */ }

const audit = { userId: USER_ID, ipAddress: null, userAgent: null }
```

### Test Cases:

**describe("create")**
- `it("validates supplier has taxNumber or vatId")` -- supplier with both fields set, succeeds
- `it("rejects if supplier has neither taxNumber nor vatId")` -- throws `WhSupplierInvoiceValidationError`
- `it("rejects if supplier has taxNumber=null and vatId=null")` -- throws validation error
- `it("accepts supplier with only taxNumber")` -- succeeds
- `it("accepts supplier with only vatId")` -- succeeds
- `it("calculates dueDate from paymentTermDays when dueDate not provided")`
- `it("uses explicit dueDate when provided, ignoring paymentTermDays")`
- `it("defaults payment terms from supplier when not in input")`

**describe("update")**
- `it("updates OPEN invoice fields")`
- `it("rejects update on non-OPEN invoice")` -- throws `WhSupplierInvoiceConflictError`
- `it("throws NotFoundError for non-existent invoice")`

**describe("cancel")**
- `it("sets status to CANCELLED")`
- `it("rejects if already CANCELLED")`

**describe("createPayment")**
- `it("records payment and updates status to PARTIAL")`
- `it("records payment and updates status to PAID when fully paid")`
- `it("rejects payment on CANCELLED invoice")`
- `it("rejects payment exceeding total gross")`
- `it("handles discount (Skonto) correctly")`

**describe("cancelPayment")**
- `it("cancels active payment and reverts invoice status")`
- `it("rejects cancel on already cancelled payment")`
- `it("also cancels associated discount entry")`

**describe("summary")**
- `it("calculates correct totals for open, overdue, paid")`

### MANDATORY: describe("tenant isolation")

```ts
describe("tenant isolation", () => {
  const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"

  it("getById rejects invoice from another tenant", async () => {
    const prisma = createMockPrisma({
      whSupplierInvoice: {
        findFirst: vi.fn().mockResolvedValue(null), // not found for other tenant
      },
    })
    await expect(
      service.getById(prisma, OTHER_TENANT_ID, INVOICE_ID)
    ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
  })

  it("update rejects invoice from another tenant", async () => {
    // findFirst returns null for wrong tenant
    await expect(
      service.update(prisma, OTHER_TENANT_ID, { id: INVOICE_ID, notes: "hacked" })
    ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
  })

  it("cancel rejects invoice from another tenant", async () => {
    await expect(
      service.cancel(prisma, OTHER_TENANT_ID, INVOICE_ID)
    ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
  })

  it("createPayment rejects invoice from another tenant", async () => {
    await expect(
      service.createPayment(prisma, OTHER_TENANT_ID, { invoiceId: INVOICE_ID, date: "2026-03-24", amount: 100, type: "BANK" })
    ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
  })

  it("cancelPayment rejects payment from another tenant", async () => {
    // payment.findFirst with { invoice: { tenantId: OTHER } } returns null
    await expect(
      service.cancelPayment(prisma, OTHER_TENANT_ID, PAYMENT_ID, USER_ID)
    ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
  })

  it("listPayments rejects invoice from another tenant", async () => {
    await expect(
      service.listPayments(prisma, OTHER_TENANT_ID, INVOICE_ID)
    ).rejects.toThrow(service.WhSupplierInvoiceNotFoundError)
  })

  it("summary with wrong tenant returns empty/zero results", async () => {
    // findMany returns [] for wrong tenant
    const result = await service.summary(prisma, OTHER_TENANT_ID)
    expect(result.totalOpen).toBe(0)
    expect(result.invoiceCount).toBe(0)
  })
})
```

**Minimum: one isolation test per service function that takes a record `id` parameter.**

**Verification:**
- `pnpm vitest run src/lib/services/__tests__/wh-supplier-invoice-service.test.ts`
- All tests pass
- Tenant isolation block has 7+ tests

---

## Phase 11: Router Tests

**File:** `src/trpc/routers/__tests__/whSupplierInvoices-router.test.ts`

**Pattern reference:** `src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts`

### Setup:

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whSupplierInvoicesRouter } from "../warehouse/supplierInvoices"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

const SI_VIEW = permissionIdByKey("wh_supplier_invoices.view")!
const SI_CREATE = permissionIdByKey("wh_supplier_invoices.create")!
const SI_EDIT = permissionIdByKey("wh_supplier_invoices.edit")!
const SI_PAY = permissionIdByKey("wh_supplier_invoices.pay")!
const ALL_PERMS = [SI_VIEW, SI_CREATE, SI_EDIT, SI_PAY]

const createCaller = createCallerFactory(whSupplierInvoicesRouter)
```

### Test Cases:

**describe("list")**
- `it("returns paginated invoices")`
- `it("rejects without wh_supplier_invoices.view permission")` -- throws "Insufficient permissions"
- `it("requires warehouse module enabled")` -- `findUnique` returns null -> throws

**describe("create")**
- `it("creates invoice with valid supplier tax info")`
- `it("rejects without wh_supplier_invoices.create permission")`
- `it("validates supplier has tax number or VAT ID")`

**describe("update")**
- `it("updates OPEN invoice fields")`
- `it("rejects without wh_supplier_invoices.edit permission")`

**describe("cancel")**
- `it("cancels invoice")`
- `it("rejects without wh_supplier_invoices.edit permission")`

**describe("payments.create")**
- `it("records payment")`
- `it("rejects without wh_supplier_invoices.pay permission")`

**describe("payments.cancel")**
- `it("cancels payment")`
- `it("rejects without wh_supplier_invoices.pay permission")`

**describe("tenant isolation")**
- `it("list returns empty for different tenant's invoices")` -- mock returns [] for different tenant
- `it("getById throws NotFound for different tenant's invoice")`

**Verification:**
- `pnpm vitest run src/trpc/routers/__tests__/whSupplierInvoices-router.test.ts`
- All tests pass
- Permission checks verified
- Module gating verified

---

## Phase 12: E2E Browser Tests

**File:** `src/e2e-browser/45-wh-supplier-invoices.spec.ts`

**Pattern reference:** `src/e2e-browser/42-wh-purchase-orders.spec.ts`

### Prerequisites

The E2E test depends on data created by earlier specs:
- `40-wh-articles.spec.ts` creates `E2E Lieferant AG` as a supplier
- The supplier must have `taxNumber` or `vatId` set. If not set by spec 40, the spec must update it or use a supplier known to have tax info.

### Global Setup Cleanup

**File:** `src/e2e-browser/global-setup.ts`

Add cleanup SQL (BEFORE the warehouse purchase order cleanup, since supplier invoices reference purchase orders):

```sql
-- Supplier invoice cleanup (spec 45) — must come before PO cleanup
DELETE FROM wh_supplier_payments WHERE invoice_id IN (
  SELECT id FROM wh_supplier_invoices WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%')
);
DELETE FROM wh_supplier_invoices WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
```

### Test Structure:

```ts
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  openRowActions,
  clickMenuItem,
} from "./helpers/forms";

const SUPPLIER_COMPANY = "E2E Lieferant AG";

test.describe.serial("UC-WH-06: Supplier Invoices", () => {
```

### Test Cases:

1. **`navigate to supplier invoices page`**
   ```ts
   test("navigate to supplier invoices page", async ({ page }) => {
     await navigateTo(page, "/warehouse/supplier-invoices");
     const main = page.locator("main#main-content");
     await expect(
       main.getByRole("button", { name: /Neue Rechnung|New Invoice/i })
     ).toBeVisible({ timeout: 10_000 });
   });
   ```

2. **`create a supplier invoice linked to PO`**
   - Navigate to `/warehouse/supplier-invoices`
   - Click "Neue Rechnung erfassen"
   - Wait for sheet
   - Select supplier (`E2E Lieferant AG`)
   - Optionally link PO (if exists from spec 42)
   - Fill: Rechnungsnummer (e.g. "E2E-LR-001"), Rechnungsdatum, Nettobetrag (100), MwSt (19), Bruttobetrag (119)
   - Submit
   - Verify invoice appears in list with status "Offen"

3. **`view supplier invoice detail`**
   - Navigate to list, click on the created invoice row
   - Verify detail page shows correct info: number, supplier, amounts, status badge

4. **`record a partial payment on supplier invoice`**
   - From detail page, click "Zahlung erfassen"
   - Wait for dialog
   - Fill: Betrag (50), Zahlungsart (Ueberweisung)
   - Submit
   - Verify: status changes to "Teilweise bezahlt", payment appears in payments table

5. **`record remaining payment to complete invoice`**
   - From detail page, click "Zahlung erfassen"
   - Fill: Betrag (69), Zahlungsart (Ueberweisung)
   - Submit
   - Verify: status changes to "Bezahlt"

6. **`cancel a payment and revert status`**
   - From detail page, find the last payment row
   - Click cancel action
   - Confirm in dialog
   - Verify: payment status shows "Storniert", invoice status reverts

7. **`create invoice for supplier without tax number — validation`**
   - This test validates the supplier tax validation:
   - Navigate to supplier invoices, click "Neue Rechnung"
   - If possible, select a supplier without tax info (may need to be created in setup or use API directly)
   - Alternative: attempt to create via the form, verify validation error message appears
   - This may be better tested at the API level (unit test) if the UI does client-side validation

8. **`cancel a supplier invoice`**
   - Create a new invoice (or use existing one)
   - From detail page or via row action, click "Stornieren"
   - Confirm in dialog
   - Verify status becomes "Storniert"

9. **`filter invoices by status`**
   - Navigate to list
   - Use status filter dropdown to filter by specific status
   - Verify table shows only matching invoices

10. **`search invoices by number`**
    - Navigate to list
    - Type invoice number in search field
    - Verify matching invoice appears

### E2E Test Execution Order

Since tests are `describe.serial`, they run in order. The test creates data in step 2, reads it in steps 3-6, and verifies filters/search in steps 9-10.

**Verification:**
- `pnpm playwright test src/e2e-browser/45-wh-supplier-invoices.spec.ts`
- All tests pass
- No orphaned test data (cleaned by global-setup)

---

## Implementation Order Summary

| Step | Phase | Files | Depends On |
|------|-------|-------|-----------|
| 1 | Schema | `prisma/schema.prisma`, migration SQL | - |
| 2 | Permissions | `permission-catalog.ts`, migration SQL | Step 1 |
| 3 | Repository | `wh-supplier-invoice-repository.ts` | Step 1 |
| 4 | Service | `wh-supplier-invoice-service.ts` | Step 3 |
| 5 | Router | `warehouse/supplierInvoices.ts`, `warehouse/index.ts` | Step 2, 4 |
| 6 | Translations | `messages/de.json`, `messages/en.json` | - |
| 7 | Hooks | `use-wh-supplier-invoices.ts` | Step 5 |
| 8 | Components | 5 component files | Step 6, 7 |
| 9 | Pages | 2 page files, sidebar config | Step 8 |
| 10 | Service Tests | `wh-supplier-invoice-service.test.ts` | Step 4 |
| 11 | Router Tests | `whSupplierInvoices-router.test.ts` | Step 5 |
| 12 | E2E Tests | `45-wh-supplier-invoices.spec.ts`, `global-setup.ts` | Steps 1-9 |

---

## File Checklist

### New Files (14)
- [ ] `supabase/migrations/20260327100000_wh_supplier_invoices.sql`
- [ ] `supabase/migrations/20260327120000_add_supplier_invoice_permissions_to_groups.sql`
- [ ] `src/lib/services/wh-supplier-invoice-repository.ts`
- [ ] `src/lib/services/wh-supplier-invoice-service.ts`
- [ ] `src/trpc/routers/warehouse/supplierInvoices.ts`
- [ ] `src/hooks/use-wh-supplier-invoices.ts`
- [ ] `src/components/warehouse/supplier-invoice-list.tsx`
- [ ] `src/components/warehouse/supplier-invoice-form-sheet.tsx`
- [ ] `src/components/warehouse/supplier-invoice-detail.tsx`
- [ ] `src/components/warehouse/supplier-payment-form-dialog.tsx`
- [ ] `src/components/warehouse/supplier-invoice-status-badge.tsx`
- [ ] `src/app/[locale]/(dashboard)/warehouse/supplier-invoices/page.tsx`
- [ ] `src/app/[locale]/(dashboard)/warehouse/supplier-invoices/[id]/page.tsx`
- [ ] `src/lib/services/__tests__/wh-supplier-invoice-service.test.ts`
- [ ] `src/trpc/routers/__tests__/whSupplierInvoices-router.test.ts`
- [ ] `src/e2e-browser/45-wh-supplier-invoices.spec.ts`

### Modified Files (7)
- [ ] `prisma/schema.prisma` — add enum, 2 models, 3 relations
- [ ] `src/lib/auth/permission-catalog.ts` — add 4 permissions
- [ ] `src/trpc/routers/warehouse/index.ts` — register supplierInvoices router
- [ ] `src/components/layout/sidebar/sidebar-nav-config.ts` — add nav item
- [ ] `messages/de.json` — add nav key + warehouseSupplierInvoices namespace
- [ ] `messages/en.json` — add nav key + warehouseSupplierInvoices namespace
- [ ] `src/e2e-browser/global-setup.ts` — add cleanup SQL

---

## Verification Checklist (Final)

- [ ] `pnpm db:generate` -- no errors
- [ ] `pnpm typecheck` -- no new errors
- [ ] `pnpm lint` -- no new warnings
- [ ] `pnpm vitest run src/lib/services/__tests__/wh-supplier-invoice-service.test.ts` -- all pass
- [ ] `pnpm vitest run src/trpc/routers/__tests__/whSupplierInvoices-router.test.ts` -- all pass
- [ ] Service tests include `describe("tenant isolation")` with 7+ tests
- [ ] Router tests include permission and module gating tests
- [ ] `pnpm playwright test src/e2e-browser/45-wh-supplier-invoices.spec.ts` -- all pass
- [ ] All UI strings use i18n translation keys (no hardcoded German)
- [ ] All repository queries include `tenantId` in where clause
- [ ] All sub-entity queries verify tenant via parent relation
