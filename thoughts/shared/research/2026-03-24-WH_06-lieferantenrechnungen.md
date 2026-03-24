# WH_06 Research: Lieferantenrechnungen (Supplier Invoices)

Date: 2026-03-24

---

## 1. Existing WH Module Patterns

### Router Structure

All warehouse routers live in `src/trpc/routers/warehouse/`.

**Index file** (`src/trpc/routers/warehouse/index.ts`):
```ts
import { createTRPCRouter } from "@/trpc/init"
import { whArticlesRouter } from "./articles"
import { whArticlePricesRouter } from "./articlePrices"
import { whPurchaseOrdersRouter } from "./purchaseOrders"
import { whStockMovementsRouter } from "./stockMovements"
import { whWithdrawalsRouter } from "./withdrawals"

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
  stockMovements: whStockMovementsRouter,
  withdrawals: whWithdrawalsRouter,
})
```

The new `supplierInvoices` router must be added here.

**Root router** (`src/trpc/routers/_app.ts`):
```ts
import { warehouseRouter } from "./warehouse"
// ...
export const appRouter = createTRPCRouter({
  // ...
  warehouse: warehouseRouter,
})
```

No change needed to `_app.ts` — the warehouse router is already registered.

### Router Pattern (purchaseOrders.ts as reference)

File: `src/trpc/routers/warehouse/purchaseOrders.ts`

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as poService from "@/lib/services/wh-purchase-order-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const PO_VIEW = permissionIdByKey("wh_purchase_orders.view")!
const PO_CREATE = permissionIdByKey("wh_purchase_orders.create")!
// ...

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// --- Sub-routers (positions) ---
const positionsRouter = createTRPCRouter({ /* ... */ })

// --- Main Router ---
export const whPurchaseOrdersRouter = createTRPCRouter({
  list: whProcedure.use(requirePermission(PO_VIEW)).input(z.object({...})).query(async ({ ctx, input }) => {
    try {
      return await poService.list(ctx.prisma as unknown as PrismaClient, ctx.tenantId!, input)
    } catch (err) { handleServiceError(err) }
  }),
  // getById, create, update, delete, sendOrder, cancel, reorderSuggestions, createFromSuggestions
  positions: positionsRouter,
})
```

**Key patterns:**
- `whProcedure = tenantProcedure.use(requireModule("warehouse"))` — module guard
- Permission constants resolved via `permissionIdByKey()`
- Each procedure: `.use(requirePermission(PERM_CONST))`
- Service calls: `ctx.prisma as unknown as PrismaClient`, `ctx.tenantId!`
- Audit context: `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }`
- Error handling: `try { ... } catch (err) { handleServiceError(err) }`
- Sub-routers use the same `whProcedure` base

### Service Pattern (wh-purchase-order-service.ts)

File: `src/lib/services/wh-purchase-order-service.ts`

**Error classes:**
```ts
export class WhPurchaseOrderNotFoundError extends Error {
  constructor(message = "Purchase order not found") {
    super(message); this.name = "WhPurchaseOrderNotFoundError"
  }
}
export class WhPurchaseOrderValidationError extends Error { ... }
export class WhPurchaseOrderConflictError extends Error { ... }
```

Error class naming convention: `Wh{Entity}NotFoundError`, `Wh{Entity}ValidationError`, `Wh{Entity}ConflictError`. The `handleServiceError` in `src/trpc/errors.ts` matches by class name suffix:
- `*NotFoundError` → `NOT_FOUND`
- `*ValidationError` / `*InvalidError` → `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` → `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` → `FORBIDDEN`

**Service function signatures:**
```ts
export async function list(prisma: PrismaClient, tenantId: string, params: {...}) { ... }
export async function getById(prisma: PrismaClient, tenantId: string, id: string) { ... }
export async function create(prisma: PrismaClient, tenantId: string, input: {...}, createdById?: string, audit?: AuditContext) { ... }
```

**Audit logging:**
```ts
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// After operation:
if (audit) {
  await auditLog.log(prisma, {
    tenantId, userId: audit.userId, action: "create", entityType: "wh_purchase_order",
    entityId: order.id, entityName: number, changes: null,
    ipAddress: audit.ipAddress, userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}
```

**Number sequence usage:**
```ts
import * as numberSeqService from "./number-sequence-service"
const number = await numberSeqService.getNextNumber(prisma, tenantId, "purchase_order")
```

Default prefixes in `src/lib/services/number-sequence-service.ts`:
```ts
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  supplier: "L-",
  purchase_order: "BE-",
  article: "ART-",
  // ...
}
```
For supplier invoices, a new key like `"supplier_invoice"` with prefix `"LR-"` (Lieferantenrechnung) would be needed IF we use auto-generated numbers. The ticket says numbers are entered manually (supplier's invoice number), so this may not be needed.

### Repository Pattern (wh-purchase-order-repository.ts)

File: `src/lib/services/wh-purchase-order-repository.ts`

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function findMany(prisma: PrismaClient, tenantId: string, params: {...}) {
  const where: Record<string, unknown> = { tenantId }
  // Build filters...
  const [items, total] = await Promise.all([
    prisma.whPurchaseOrder.findMany({ where, include: {...}, orderBy: {...}, skip, take }),
    prisma.whPurchaseOrder.count({ where }),
  ])
  return { items, total }
}

export async function findById(prisma: PrismaClient, tenantId: string, id: string) {
  return prisma.whPurchaseOrder.findFirst({ where: { id, tenantId }, include: {...} })
}

export async function update(prisma: PrismaClient, tenantId: string, id: string, data: Record<string, unknown>) {
  return tenantScopedUpdate(prisma.whPurchaseOrder, { id, tenantId }, data, { entity: "WhPurchaseOrder", include: {...} })
}

export async function softDeleteById(prisma: PrismaClient, tenantId: string, id: string) {
  return prisma.whPurchaseOrder.deleteMany({ where: { id, tenantId, status: "DRAFT" } })
}
```

**Key patterns:**
- Every query includes `tenantId` in where clause
- `findFirst` with `{ id, tenantId }` for single lookups
- `tenantScopedUpdate` helper for updates (updateMany + refetch)
- Paginated list returns `{ items, total }`
- Sub-entity queries verify tenant via parent relation: `{ id, purchaseOrder: { tenantId } }`

### Hook Pattern (use-wh-purchase-orders.ts)

File: `src/hooks/use-wh-purchase-orders.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhPurchaseOrders(options?, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.warehouse.purchaseOrders.list.queryOptions({...}, { enabled }))
}

export function useWhPurchaseOrder(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.warehouse.purchaseOrders.getById.queryOptions({ id }, { enabled: enabled && !!id }))
}

export function useCreateWhPurchaseOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.purchaseOrders.list.queryKey() })
    },
  })
}
```

**Key patterns:**
- Query hooks accept optional filters + `enabled` param
- Mutation hooks invalidate related queries on success
- Path: `trpc.warehouse.{subRouter}.{procedure}`
- Single import from `@/trpc` for `useTRPC`

---

## 2. Payment Patterns (ORD_03)

### Enums

In `prisma/schema.prisma` (line ~865):

```prisma
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
```

The ticket specifies reusing these enums for `WhSupplierPayment`.

### BillingPayment Model (line ~879)

```prisma
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
  // ...
}
```

### Payment Service (billing-payment-service.ts)

File: `src/lib/services/billing-payment-service.ts`

**Status computation:**
```ts
export function computePaymentStatus(totalGross: number, paidAmount: number): "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID" {
  if (paidAmount <= 0) return "UNPAID"
  if (paidAmount < totalGross - 0.01) return "PARTIAL"
  if (paidAmount > totalGross + 0.01) return "OVERPAID"
  return "PAID"
}
```

**Due date calculation:**
```ts
export function computeDueDate(documentDate: Date, paymentTermDays: number | null): Date | null {
  if (paymentTermDays === null || paymentTermDays === undefined) return null
  const due = new Date(documentDate)
  due.setDate(due.getDate() + paymentTermDays)
  return due
}
```

**Overdue check:**
```ts
export function isOverdue(dueDate: Date | null, paymentStatus: string): boolean {
  if (!dueDate) return false
  if (paymentStatus === "PAID" || paymentStatus === "OVERPAID") return false
  return dueDate < new Date()
}
```

**Discount calculation (two-tier Skonto):**
```ts
export function getApplicableDiscount(document, paymentDate: Date): { percent: number; tier: 1 | 2 } | null {
  const daysDiff = Math.floor((paymentDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24))
  // Check tier 1 first (shorter period, higher discount)
  if (document.discountDays != null && daysDiff <= document.discountDays) { return { percent, tier: 1 } }
  // Check tier 2 (longer period, lower discount)
  if (document.discountDays2 != null && daysDiff <= document.discountDays2) { return { percent, tier: 2 } }
  return null
}
```

**Payment creation with Skonto:**
- Creates actual payment + separate discount entry in a `$transaction`
- Re-reads document inside transaction to prevent concurrent overpayment
- Discount entry: `isDiscount: true`, notes: `Skonto 1 (3%)`

**Payment cancellation:**
- Sets `status: "CANCELLED"`, `cancelledAt`, `cancelledById`
- If non-discount payment, also cancels associated Skonto entries (matched by same document/date)
- Uses `$transaction` for atomicity

**Open items enrichment:**
```ts
function enrichOpenItem(doc) {
  const creditNoteReduction = ...
  const effectiveTotalGross = doc.totalGross - creditNoteReduction
  const paidAmount = doc.payments.filter(p => p.status === "ACTIVE").reduce(...)
  const openAmount = Math.max(0, effectiveTotalGross - paidAmount)
  const paymentStatus = computePaymentStatus(effectiveTotalGross, paidAmount)
  const dueDate = computeDueDate(doc.documentDate, doc.paymentTermDays)
  const overdue = isOverdue(dueDate, paymentStatus)
  return { paidAmount, openAmount, effectiveTotalGross, creditNoteReduction, paymentStatus, dueDate, isOverdue: overdue }
}
```

For WhSupplierInvoice, the payment logic should mirror this but simplified (no credit notes, no child documents). The key functions to reuse/mirror:
- `computePaymentStatus`
- `computeDueDate`
- `isOverdue`
- `getApplicableDiscount`

### Payment Repository (billing-payment-repository.ts)

File: `src/lib/services/billing-payment-repository.ts`

```ts
export async function createPayment(prisma, data: {
  tenantId, documentId, date, amount, type: BillingPaymentType, isDiscount?, notes?, createdById?
}) { ... }

export async function cancelPayment(prisma, tenantId, id, cancelledById, notes?) {
  await prisma.billingPayment.updateMany({ where: { id, tenantId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById, ...(notes ? { notes } : {}) } })
  return prisma.billingPayment.findFirst({ where: { id, tenantId }, include: PAYMENT_INCLUDE })
}
```

### Payment Router (billing/payments.ts)

File: `src/trpc/routers/billing/payments.ts`

Uses sub-routers:
```ts
export const billingPaymentsRouter = createTRPCRouter({
  openItems: createTRPCRouter({
    list: ..., getById: ..., summary: ...,
  }),
  list: ..., create: ..., cancel: ...,
})
```

---

## 3. Permission Catalog

File: `src/lib/auth/permission-catalog.ts`

### Structure

```ts
const PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"
function permissionId(key: string): string { return uuidv5(key, PERMISSION_NAMESPACE) }
function p(key, resource, action, description): Permission { ... }

export const ALL_PERMISSIONS: Permission[] = [
  // ... 92 permissions total
  // Warehouse section:
  p("wh_articles.view", "wh_articles", "view", "View warehouse articles"),
  p("wh_articles.create", ...),
  p("wh_articles.edit", ...),
  p("wh_articles.delete", ...),
  p("wh_article_groups.manage", ...),
  p("wh_purchase_orders.view", ...),
  p("wh_purchase_orders.create", ...),
  p("wh_purchase_orders.edit", ...),
  p("wh_purchase_orders.delete", ...),
  p("wh_purchase_orders.order", ...),
  p("wh_stock.view", ...),
  p("wh_stock.manage", ...),
]
```

### Permissions to add (from ticket)

```ts
p("wh_supplier_invoices.view", "wh_supplier_invoices", "view", "View supplier invoices"),
p("wh_supplier_invoices.create", "wh_supplier_invoices", "create", "Create supplier invoices"),
p("wh_supplier_invoices.edit", "wh_supplier_invoices", "edit", "Edit supplier invoices"),
p("wh_supplier_invoices.pay", "wh_supplier_invoices", "pay", "Record payments on supplier invoices"),
```

These must be added after the existing warehouse permissions (after `wh_stock.manage`).

### Lookup helpers

```ts
export function permissionIdByKey(key: string): string | undefined { return byKey.get(key)?.id }
```

### User Group Migration

File: `supabase/migrations/20260325120000_add_module_permissions_to_groups.sql`

Groups that need the new permissions:
- **PERSONAL** — should get all 4 wh_supplier_invoices.* permissions
- **LAGER** — should get all 4 wh_supplier_invoices.* permissions
- **VORGESETZTER** — should get `wh_supplier_invoices.view`
- **BUCHHALTUNG** — should get all 4 (they handle payments)

A new migration will need to update these groups' `permissions` JSONB arrays with the new permission UUIDs.

---

## 4. Prisma Schema

File: `prisma/schema.prisma`

### WhPurchaseOrder model (line 4291) — for relation

```prisma
model WhPurchaseOrder {
  id                  String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String                   @map("tenant_id") @db.Uuid
  number              String                   @db.VarChar(50)
  supplierId          String                   @map("supplier_id") @db.Uuid
  status              WhPurchaseOrderStatus    @default(DRAFT)
  // ... fields
  positions       WhPurchaseOrderPosition[]
  stockMovements  WhStockMovement[]
  @@map("wh_purchase_orders")
}
```

The new `WhSupplierInvoice` model needs a relation `purchaseOrders WhPurchaseOrder[]` on `WhPurchaseOrder`, and the inverse relation. Since the ticket uses `purchaseOrderId` as optional FK, we need to add `supplierInvoices WhSupplierInvoice[]` to `WhPurchaseOrder`.

### CrmAddress model (line 279) — for supplier relation

Key fields for validation:
```prisma
  taxNumber       String?        @map("tax_number") @db.VarChar(50)   // line 293
  vatId           String?        @map("vat_id") @db.VarChar(50)       // line 294
  paymentTermDays Int?           @map("payment_term_days")            // line 298
  discountPercent Float?         @map("discount_percent")             // line 299
  discountDays    Int?           @map("discount_days")                // line 300
```

The `CrmAddress` model already has `taxNumber` and `vatId` fields for the tax validation requirement. It also has `paymentTermDays`, `discountPercent`, and `discountDays` which can be used as defaults.

Relations to add to CrmAddress: `supplierInvoices WhSupplierInvoice[]`

### Tenant model (line ~180) — relations to add

```prisma
  whArticleGroups             WhArticleGroup[]
  whArticles                  WhArticle[]
  whPurchaseOrders            WhPurchaseOrder[]
  whStockMovements            WhStockMovement[]
  // ADD:
  whSupplierInvoices          WhSupplierInvoice[]
  whSupplierPayments          WhSupplierPayment[]
```

### WhSupplierInvoice and WhSupplierPayment — DO NOT EXIST YET

No matches found in schema for `WhSupplierInvoice` or `WhSupplierPayment`. These must be created.

### BillingPaymentType and BillingPaymentStatus — ALREADY EXIST

The ticket says to reuse these enums. They are at line 865-877.

---

## 5. Migration Pattern

### Naming Convention

```
supabase/migrations/YYYYMMDDHHMMSS_description.sql
```

Recent examples:
```
20260323100000_wh_articles_artikelstamm.sql
20260323120000_wh_purchase_orders.sql
20260324120000_wh_stock_movements.sql
20260325100000_wh_purchase_order_vat.sql
20260325120000_add_module_permissions_to_groups.sql
20260326100000_wh_stock_movement_machine_id.sql
```

### Latest Migration Number

`20260326100000_wh_stock_movement_machine_id.sql`

New migration should use timestamp like `20260327100000_wh_supplier_invoices.sql` and a second one for permissions: `20260327120000_add_supplier_invoice_permissions_to_groups.sql`.

### Migration Content Pattern (from wh_purchase_orders)

```sql
-- Create enum
CREATE TYPE wh_supplier_invoice_status AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- Create table
CREATE TABLE wh_supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- ... columns
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_wh_supplier_invoices_tenant_supplier ON wh_supplier_invoices(tenant_id, supplier_id);
-- ...
```

---

## 6. Translation/i18n Keys

### File Structure

- `messages/de.json` — German translations (primary)
- `messages/en.json` — English translations

### Pattern

Translation keys are organized by namespace. Warehouse keys:

```json
{
  "nav": {
    "warehouseSection": "Lager",
    "warehouseOverview": "Lagerübersicht",
    "warehouseArticles": "Artikel",
    "warehousePurchaseOrders": "Bestellungen",
    "warehouseGoodsReceipt": "Wareneingang",
    "warehouseStockMovements": "Lagerbewegungen",
    "warehouseWithdrawals": "Lagerentnahmen"
  },
  "warehousePurchaseOrders": {
    "pageTitle": "Bestellungen",
    "actionCreate": "Neue Bestellung",
    "searchPlaceholder": "Suche nach Nummer, Lieferant...",
    "statusDraft": "Entwurf",
    "statusOrdered": "Bestellt",
    // ...
  }
}
```

**For WH_06, add:**
- `nav.warehouseSupplierInvoices` — e.g., "Lieferantenrechnungen"
- New namespace `warehouseSupplierInvoices` with all UI strings

Components use `useTranslations('warehousePurchaseOrders')` from `next-intl`.

---

## 7. Tenant Isolation Pattern

### Service Layer

Every service function takes `prisma: PrismaClient` and `tenantId: string` as first two params.

**Repository queries always include `tenantId`:**
```ts
return prisma.whPurchaseOrder.findFirst({ where: { id, tenantId }, include: {...} })
```

**Sub-entity queries verify tenant via parent:**
```ts
const position = await prisma.whPurchaseOrderPosition.findFirst({
  where: { id: positionId, purchaseOrder: { tenantId } },
  include: { purchaseOrder: { select: { id: true, tenantId: true, status: true } } },
})
```

**Updates use `tenantScopedUpdate` helper** (from `src/lib/services/prisma-helpers.ts`):
```ts
return tenantScopedUpdate(prisma.whPurchaseOrder, { id, tenantId }, data, { entity: "WhPurchaseOrder", include: {...} })
```

The helper does `updateMany({ where: { id, tenantId }, data })` then refetches. Throws `TenantScopedNotFoundError` if count === 0.

### Test Pattern

Reference: `src/lib/services/__tests__/wh-article-service.test.ts` (mentioned as canonical in ticket).

Each test file has a `describe("tenant isolation")` block testing:
- Operations with wrong tenantId return NotFoundError
- One test per service function that takes a record ID

---

## 8. E2E Browser Test Patterns

### Test Files

Located in `src/e2e-browser/`. Warehouse tests:
- `40-wh-articles.spec.ts`
- `41-wh-prices.spec.ts`
- `42-wh-purchase-orders.spec.ts`
- `43-wh-goods-receipt.spec.ts`
- `44-wh-withdrawals.spec.ts`

New file: `45-wh-supplier-invoices.spec.ts`

### Structure (42-wh-purchase-orders.spec.ts)

```ts
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import { fillInput, selectOption, submitAndWaitForClose, waitForSheet, expectTableContains, openRowActions, clickMenuItem } from "./helpers/forms";

const SUPPLIER_COMPANY = "E2E Lieferant AG"; // Created by 40-wh-articles.spec.ts

test.describe.serial("UC-WH-03: Purchase Orders", () => {
  test("navigate to purchase orders page", async ({ page }) => {
    await navigateTo(page, "/warehouse/purchase-orders");
    const main = page.locator("main#main-content");
    await expect(main.getByRole("button", { name: /Neue Bestellung/i })).toBeVisible({ timeout: 10_000 });
  });
  // More tests...
});
```

### Helper Functions

**nav.ts:**
- `navigateTo(page, path)` — goto + wait for `main#main-content`
- `waitForTableLoad(page)` — wait for first table row visible
- `expectPageTitle(page, title)` — check h1 heading

**forms.ts:**
- `openCreateDialog(page)` — click + button, wait for sheet
- `waitForSheet(page)` — wait for `[data-slot="sheet-content"][data-state="open"]`
- `fillInput(page, id, value)` — fill by ID
- `selectOption(page, triggerLabel, optionText)` — find combobox near label, click, select option
- `submitSheet(page)` / `submitAndWaitForClose(page)`
- `openRowActions(page, rowText)` — click last button in row, wait for menu
- `clickMenuItem(page, text)` — click menu item
- `expectTableContains(page, text)` — verify table row exists
- `clickTab(page, name)` — click a tab

**auth.ts:**
- `SEED.TENANT_ID = "10000000-0000-0000-0000-000000000001"`
- `loginAsAdmin(page)` — quick login
- Auth sessions stored in `.auth/admin.json` and `.auth/user.json`

### Global Setup

File: `src/e2e-browser/global-setup.ts`

Runs SQL cleanup before tests. Deletes E2E test data (rows with `LIKE 'E2E%'`). For WH_06, add cleanup:
```sql
-- Supplier invoice cleanup
DELETE FROM wh_supplier_payments WHERE invoice_id IN (
  SELECT id FROM wh_supplier_invoices WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%')
);
DELETE FROM wh_supplier_invoices WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
```

---

## 9. Module Gating

File: `src/lib/modules/index.ts`

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    const { tenantId, prisma } = ctx
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant ID required" })
    if (module === "core") return next({ ctx })
    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) throw new TRPCError({ code: "FORBIDDEN", message: `Module "${module}" is not enabled for this tenant` })
    return next({ ctx })
  })
}
```

All warehouse routers use: `const whProcedure = tenantProcedure.use(requireModule("warehouse"))`

Available modules: `"core"`, `"crm"`, `"billing"`, `"warehouse"`.

---

## 10. UI Patterns

### List Component (purchase-order-list.tsx)

File: `src/components/warehouse/purchase-order-list.tsx`

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PurchaseOrderStatusBadge } from './purchase-order-status-badge'
import { useWhPurchaseOrders, useDeleteWhPurchaseOrder, useCancelWhPurchaseOrder } from '@/hooks/use-wh-purchase-orders'

export function PurchaseOrderList() {
  const t = useTranslations('warehousePurchaseOrders')
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL')
  const [page, setPage] = React.useState(1)
  const { data, isLoading } = useWhPurchaseOrders({...})
  // Toolbar: search input, status filter, action buttons
  // Table with columns: Number, Supplier, OrderDate, DeliveryDate, Status, Total
  // Row click navigates to detail
  // DropdownMenu for row actions (view, edit, send, delete, cancel)
  // Pagination
  // ConfirmDialog for delete and cancel
}
```

**Key patterns:**
- `useTranslations('namespace')` for all strings
- `formatPrice()` / `formatDate()` helper functions using `Intl.NumberFormat`/`Intl.DateTimeFormat` with `'de-DE'`
- Row click → `router.push('/warehouse/purchase-orders/${order.id}')`
- Dropdown menu with `e.stopPropagation()` to prevent row click
- Pagination with prev/next buttons

### Status Badge Component

File: `src/components/warehouse/purchase-order-status-badge.tsx`

```tsx
const statusStyles: Record<Status, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  ORDERED: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  // ...
}
const statusKeys: Record<Status, string> = {
  DRAFT: 'statusDraft',
  // ...
}
export function PurchaseOrderStatusBadge({ status }) {
  const t = useTranslations('warehousePurchaseOrders')
  return <Badge className={statusStyles[status]} variant="secondary">{t(statusKeys[status])}</Badge>
}
```

### Detail Component

File: `src/components/warehouse/purchase-order-detail.tsx`

- Header with back button, title, status badge, action buttons
- Two-column card layout: Details card + Summary card
- Positions table card
- Edit mode toggle (shows form when editing)
- Send/Cancel dialogs
- Uses `DetailRow` helper for label-value pairs

### Page Routes

```
src/app/[locale]/(dashboard)/warehouse/purchase-orders/page.tsx
src/app/[locale]/(dashboard)/warehouse/purchase-orders/[id]/page.tsx
src/app/[locale]/(dashboard)/warehouse/purchase-orders/new/page.tsx
```

For WH_06:
```
src/app/[locale]/(dashboard)/warehouse/supplier-invoices/page.tsx
src/app/[locale]/(dashboard)/warehouse/supplier-invoices/[id]/page.tsx
```

---

## 11. Router Test Patterns

### Test File Structure

File: `src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whPurchaseOrdersRouter } from "../warehouse/purchaseOrders"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: { tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
  }},
}))

const PO_VIEW = permissionIdByKey("wh_purchase_orders.view")!
const ALL_PERMS = [PO_VIEW, PO_CREATE, PO_EDIT, PO_DELETE, PO_ORDER]
const createCaller = createCallerFactory(whPurchaseOrdersRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
  },
}

function withModuleMock(prisma) { return { ...MODULE_MOCK, ...prisma } }

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

// Tests:
describe("warehouse.purchaseOrders", () => {
  describe("list", () => {
    it("returns paginated purchase orders", async () => { ... })
    it("rejects without permission", async () => { ... })
    it("requires warehouse module enabled", async () => { ... })
  })
  // create, update, delete, sendOrder, cancel, positions.list, positions.add, etc.
})
```

### Test Helpers

File: `src/trpc/routers/__tests__/helpers.ts`

- `autoMockPrisma(partial)` — Proxy that auto-stubs undefined methods
- `createMockUser(overrides)` — Returns a `ContextUser`
- `createMockSession()` — Returns a Supabase `Session`
- `createMockContext(overrides)` — Returns a `TRPCContext`, auto-wraps prisma
- `createMockUserGroup(overrides)` — Returns a `UserGroup`
- `createAdminUser(overrides)` — User with isAdmin group
- `createUserWithPermissions(permissionIds, overrides)` — User with specific permissions
- `createMockTenant(overrides)` — Returns a `Tenant`
- `createMockUserTenant(userId, tenantId, tenant?)` — Returns `UserTenant` with included `Tenant`

### Key Testing Patterns

1. **Module guard test**: Override `tenantModule.findUnique` to return `null` → expects throw
2. **Permission test**: Use `createTestContext(prisma, [PO_VIEW])` (subset of perms) → expects "Insufficient permissions"
3. **Happy path**: Mock Prisma methods to return expected data, call procedure, assert result
4. **The `$transaction` pattern**: `autoMockPrisma` handles `$transaction` by passing the same proxy

---

## 12. Navigation/Sidebar

File: `src/components/layout/sidebar/sidebar-nav-config.ts`

### Warehouse Section (line ~365)

```ts
{
  titleKey: 'warehouseSection',
  module: 'warehouse',
  items: [
    { titleKey: 'warehouseOverview', href: '/warehouse', icon: Warehouse, module: 'warehouse' },
    { titleKey: 'warehouseArticles', href: '/warehouse/articles', icon: Package, module: 'warehouse', permissions: ['wh_articles.view'] },
    { titleKey: 'warehousePriceLists', href: '/warehouse/prices', icon: Tag, module: 'warehouse', permissions: ['billing_price_lists.view'] },
    { titleKey: 'warehousePurchaseOrders', href: '/warehouse/purchase-orders', icon: ShoppingCart, module: 'warehouse', permissions: ['wh_purchase_orders.view'] },
    { titleKey: 'warehouseGoodsReceipt', href: '/warehouse/goods-receipt', icon: PackageCheck, module: 'warehouse', permissions: ['wh_stock.manage'] },
    { titleKey: 'warehouseWithdrawals', href: '/warehouse/withdrawals', icon: PackageMinus, module: 'warehouse', permissions: ['wh_stock.manage'] },
    { titleKey: 'warehouseStockMovements', href: '/warehouse/stock-movements', icon: ArrowRightLeft, module: 'warehouse', permissions: ['wh_stock.view'] },
  ],
},
```

### New Entry to Add

```ts
{
  titleKey: 'warehouseSupplierInvoices',
  href: '/warehouse/supplier-invoices',
  icon: FileText,  // or Receipt
  module: 'warehouse',
  permissions: ['wh_supplier_invoices.view'],
},
```

Add after `warehouseStockMovements` (or after purchase orders for logical grouping).

Translation key to add in nav: `"warehouseSupplierInvoices": "Lieferantenrechnungen"`

---

## Summary of Files to Create/Modify

### New Files
1. `supabase/migrations/20260327100000_wh_supplier_invoices.sql` — DB migration
2. `supabase/migrations/20260327120000_add_supplier_invoice_permissions_to_groups.sql` — Permission migration
3. `src/lib/services/wh-supplier-invoice-service.ts` — Service
4. `src/lib/services/wh-supplier-invoice-repository.ts` — Repository
5. `src/trpc/routers/warehouse/supplierInvoices.ts` — tRPC router
6. `src/hooks/use-wh-supplier-invoices.ts` — React hooks
7. `src/components/warehouse/supplier-invoice-list.tsx` — List component
8. `src/components/warehouse/supplier-invoice-form-sheet.tsx` — Create/edit form
9. `src/components/warehouse/supplier-invoice-detail.tsx` — Detail view
10. `src/components/warehouse/supplier-payment-form-dialog.tsx` — Payment dialog
11. `src/components/warehouse/supplier-invoice-status-badge.tsx` — Status badge
12. `src/app/[locale]/(dashboard)/warehouse/supplier-invoices/page.tsx` — List page
13. `src/app/[locale]/(dashboard)/warehouse/supplier-invoices/[id]/page.tsx` — Detail page
14. `src/lib/services/__tests__/wh-supplier-invoice-service.test.ts` — Service tests
15. `src/trpc/routers/__tests__/whSupplierInvoices-router.test.ts` — Router tests
16. `src/e2e-browser/45-wh-supplier-invoices.spec.ts` — E2E tests

### Files to Modify
1. `prisma/schema.prisma` — Add `WhSupplierInvoice`, `WhSupplierPayment` models, `WhSupplierInvoiceStatus` enum, relations on Tenant/CrmAddress/WhPurchaseOrder
2. `src/lib/auth/permission-catalog.ts` — Add 4 new permissions
3. `src/trpc/routers/warehouse/index.ts` — Register `supplierInvoices` sub-router
4. `src/components/layout/sidebar/sidebar-nav-config.ts` — Add nav item
5. `messages/de.json` — Add translation keys
6. `messages/en.json` — Add translation keys
7. `src/e2e-browser/global-setup.ts` — Add cleanup SQL for supplier invoices
